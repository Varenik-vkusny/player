/**
 * Дев-стенд: грузит эталонную фикстуру и показывает плеер.
 *
 * Это единственное место, где живёт UI гейта. Сам плеер про кнопки не знает —
 * он сообщает, что гейт открыт, и принимает ответ.
 */
import { loadProject, resolveTimeRef, type Gate } from '@player/core';
import { Player, type GateAttempt, type UnboundOption } from '@player/player';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Нет элемента #${id} в разметке стенда`);
  return node as T;
};

const host = el('stage-host');
const overlay = el('overlay');
const panel = el('panel');
const playButton = el<HTMLButtonElement>('play');
const played = el('played');
const track = el('track');
const clockLabel = el('clock');
const stateLabel = el('state');

// Какую фикстуру открыть: ?fixture=e2e. По умолчанию — демо.
// Имя ограничено, чтобы адресная строка не превращалась в способ читать файлы.
const requested = new URLSearchParams(location.search).get('fixture') ?? 'demo';
if (!/^[\w-]+$/.test(requested)) throw new Error(`Недопустимое имя фикстуры: ${requested}`);
const FIXTURE = `/fixtures/${requested}.json`;

/**
 * Канал предпросмотра «редактор → плеер» — IndexedDB, а не localStorage.
 *
 * Смена задокументирована в `packages/editor/src/state/save.ts` и измерена
 * спайком `spikes/s8-quota`: у localStorage квота ровно 5 МБ символов на
 * origin, и с вшитыми картинками проект её превышает. Здесь имена базы,
 * хранилища и ключа обязаны буквально совпадать с тем, что пишет редактор, —
 * общего модуля между пакетами editor и playground нет (инвариант №6
 * ограничивает импорты редактора), поэтому контракт живёт как согласованная
 * константа по обе стороны, как и раньше жил `PREVIEW_KEY`.
 */
const PREVIEW_DB = 'player-preview';
const PREVIEW_DB_VERSION = 1;
const PREVIEW_STORE = 'projects';
const PREVIEW_KEY = 'current';

function openPreviewDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен в этой вкладке'));
      return;
    }
    const request = indexedDB.open(PREVIEW_DB, PREVIEW_DB_VERSION);
    // Плеер может открыться раньше редактора (например, по прямой ссылке
    // без записи) — база тогда ещё не существует, и создать хранилище
    // обязан тот, кто открыл её первым, а не только редактор.
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PREVIEW_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error('indexedDB.open не сообщил причину отказа'));
    };
  });
}

async function readPreview(): Promise<string | undefined> {
  const db = await openPreviewDb();
  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(PREVIEW_STORE, 'readonly');
      const request = tx.objectStore(PREVIEW_STORE).get(PREVIEW_KEY);
      request.onsuccess = () => resolve(request.result as string | undefined);
      request.onerror = () => reject(request.error ?? new Error('чтение IndexedDB не сообщило причину'));
    });
  } finally {
    db.close();
  }
}

/**
 * Откуда взять проект.
 *
 * По умолчанию — эталонная фикстура. С `?from=editor` — то, что редактор
 * положил в IndexedDB: бэкенда в этой сессии нет, а проект с настоящей
 * озвучкой (и тем более с вшитыми картинками) в адресную строку не помещается.
 */
async function readProject(): Promise<unknown> {
  if (new URLSearchParams(location.search).get('from') === 'editor') {
    const saved = await readPreview();
    // Пустое хранилище — это открытая напрямую ссылка, а не штатный случай.
    // Молча показать демо значило бы соврать про то, что играет.
    if (!saved) throw new Error('Редактор не передал проект: нечего показывать');
    return JSON.parse(saved);
  }
  const response = await fetch(FIXTURE);
  if (!response.ok) throw new Error(`Не удалось загрузить ${FIXTURE}: HTTP ${response.status}`);
  return response.json();
}

async function main(): Promise<void> {
  // Валидация обязательна и падает громко: битый проект не открывается.
  // Для проекта из редактора это ещё и проверка того, что редактор
  // не испортил его правками.
  const project = loadProject(await readProject());
  const duration = project.audio.duration;

  const player = new Player(host, project, {
    onStateChange: (state) => { stateLabel.textContent = state; syncButton(state); },
    onFrame: (position) => {
      clockLabel.textContent = position.toFixed(2);
      played.style.width = `${(position / duration) * 100}%`;
    },
    onGateOpen: (gate, unboundOptions) => showGate(gate, unboundOptions),
    onGateResolved: (attempt) => showResult(attempt),
  });

  // Метки гейтов на дорожке: видно, куда плеер приедет.
  for (const gate of project.scene.gates) {
    const at = resolveTimeRef(gate.at, project.audio.words);
    const mark = document.createElement('div');
    mark.className = 'gate-mark';
    mark.style.left = `${(at / duration) * 100}%`;
    mark.title = `${gate.id} — ${at.toFixed(2)} с`;
    track.appendChild(mark);
  }

  await player.load();
  playButton.addEventListener('click', () => { void player.play(); });

  function syncButton(state: string): void {
    playButton.disabled = state !== 'ready' && state !== 'ended';
    playButton.textContent = state === 'ended' ? 'Сначала' : 'Играть';
  }

  function closeOverlay(): void {
    overlay.dataset['open'] = '0';
    panel.textContent = '';
  }

  function showGate(gate: Gate, unboundOptions: readonly UnboundOption[]): void {
    const config = gate.config;

    // Гибрид (ADR-011): у choice-гейта, где КАЖДЫЙ вариант нашёл себе
    // элемент на сцене, дублирующая кнопка не нужна вовсе — отвечают
    // прямым кликом по сцене, которую в этом случае незачем гасить.
    if (config.kind === 'choice' && unboundOptions.length === 0) {
      closeOverlay();
      return;
    }

    overlay.dataset['open'] = '1';
    panel.textContent = '';

    const title = document.createElement('h2');
    title.textContent = config.kind === 'continue' ? config.label : config.prompt;
    panel.appendChild(title);

    const feedback = document.createElement('div');
    feedback.className = 'feedback';

    if (config.kind === 'choice') {
      const list = document.createElement('div');
      list.className = 'options';
      // Кнопкой рисуются только варианты БЕЗ элемента на сцене — у остальных
      // роль кнопки уже играет сам элемент, нарисованный автором.
      for (const option of unboundOptions) {
        const button = document.createElement('button');
        button.textContent = option.label;
        button.dataset['optionId'] = option.id;
        button.addEventListener('click', () => { void answer(option.id); });
        list.appendChild(button);
      }
      panel.append(list, feedback);
    } else if (config.kind === 'input') {
      const field = document.createElement('input');
      field.id = 'gate-input';
      field.placeholder = 'Введи ответ';
      const send = document.createElement('button');
      send.className = 'primary';
      send.textContent = 'Ответить';
      send.addEventListener('click', () => { void answer(field.value); });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void answer(field.value);
      });
      panel.append(field, send, feedback);
      field.focus();
    } else {
      const send = document.createElement('button');
      send.className = 'primary';
      send.textContent = config.label;
      send.addEventListener('click', () => { void answer(undefined); });
      panel.append(send, feedback);
    }

    panel.dataset['gateId'] = gate.id;
  }

  function showResult(attempt: GateAttempt): void {
    const feedback = panel.querySelector<HTMLElement>('.feedback');
    if (!feedback) return;

    if (attempt.outcome === 'continue') {
      feedback.className = 'feedback right';
      feedback.textContent = attempt.correct ? 'Верно' : 'Идём дальше';
      closeOverlay();
      return;
    }
    if (attempt.outcome === 'reveal') {
      feedback.className = 'feedback wrong';
      feedback.textContent = 'Не угадал. Правильный ответ показан — нажми «дальше».';
      const next = document.createElement('button');
      next.className = 'primary';
      next.textContent = 'Дальше';
      next.addEventListener('click', () => {
        closeOverlay();
        void player.continueAfterReveal();
      });
      panel.appendChild(next);
      return;
    }
    feedback.className = 'feedback wrong';
    const left = attempt.gate.maxAttempts === null
      ? ''
      : ` Осталось попыток: ${attempt.gate.maxAttempts - attempt.attemptsUsed}.`;
    feedback.textContent = `Неверно.${left}`;
  }

  async function answer(value: string | undefined): Promise<void> {
    await player.answer(value);
  }

  // Для e2e-тестов: доступ к плееру без раскопок по DOM.
  (window as unknown as { __player: Player }).__player = player;
  document.documentElement.dataset['ready'] = '1';
}

void main().catch((error: unknown) => {
  // Громко и в том месте, где возникло. Никаких заглушек.
  //
  // textContent, а не разметка: сообщения валидации цитируют строки из
  // фикстуры (идентификаторы элементов, заголовки), а фикстура — внешние
  // данные. Вставлять их как HTML значит открыть дыру в дев-стенде.
  const box = document.createElement('pre');
  box.style.cssText = 'color:#ff8a6b;padding:16px;white-space:pre-wrap';
  box.textContent = String(error);
  document.body.prepend(box);
  throw error;
});
