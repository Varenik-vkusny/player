/**
 * Дев-стенд: грузит эталонную фикстуру и показывает плеер.
 *
 * Это единственное место, где живёт UI гейта. Сам плеер про кнопки не знает —
 * он сообщает, что гейт открыт, и принимает ответ.
 */
import { loadProject, resolveTimeRef, type Answer, type Gate } from '@player/core';
import {
  entrySegmentOf,
  Player,
  segmentOf,
  type GateAttempt,
  type Reveal,
  type UnboundOption,
} from '@player/player';

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
const progressLabel = el('progress');

/**
 * Прогресс словами. Знаменатель называется ТОЛЬКО когда он известен.
 *
 * При ветвлении длина объяснения зависит от ответов, которых ещё нет, и «часть
 * 3 из 7» было бы выдумкой ровно там, где продукт обещает зрителю выбор.
 * Показать номер части без знаменателя — не хуже: зритель видит, что движется,
 * и не получает обещания, которое некому сдержать.
 */
function describeProgress(progress: { partIndex: number; partsLeft: number | null }): string {
  if (progress.partsLeft === null) return `часть ${progress.partIndex}`;
  return `часть ${progress.partIndex} из ${progress.partIndex + progress.partsLeft}`;
}

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

/**
 * Ответы, с которыми автор просит открыть предпросмотр.
 *
 * Через адресную строку, а не через IndexedDB: набор переменных короток,
 * а канал хранилища заведён под проект, который в URL не помещается. Смешивать
 * их значило бы поднимать версию базы ради десятка строк.
 *
 * Битый параметр — это опечатка в ссылке, а не штатный случай, и он падает
 * громко: тихо открыть предпросмотр «как обычный зритель» значило бы показать
 * автору не то, что он просил, ничего об этом не сказав.
 */
function readAssumption(): {
  readonly answers?: Readonly<Record<string, Answer>>;
  readonly startSegmentId?: string;
} {
  const search = new URLSearchParams(location.search);
  const raw = search.get('as');
  const from = search.get('at');

  const assumption: {
    answers?: Readonly<Record<string, Answer>>;
    startSegmentId?: string;
  } = {};

  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Параметр as должен быть объектом «переменная → ответ», получено: ${raw}`);
    }
    assumption.answers = parsed as Readonly<Record<string, Answer>>;
  }
  if (from !== null) assumption.startSegmentId = from;

  return assumption;
}

async function main(): Promise<void> {
  // Валидация обязательна и падает громко: битый проект не открывается.
  // Для проекта из редактора это ещё и проверка того, что редактор
  // не испортил его правками.
  const project = loadProject(await readProject());
  const assumption = readAssumption();
  // Метки и длина дорожки берутся у той части, с которой плеер СТАРТУЕТ,
  // а не у входной: иначе предпросмотр «с этой части» рисовал бы чужие метки.
  const segment = segmentOf(project, assumption.startSegmentId ?? entrySegmentOf(project));
  const duration = segment.duration;

  const player = new Player(host, project, {
    onStateChange: (state) => { stateLabel.textContent = state; syncButton(state); },
    onFrame: () => {
      // Через player.progress, а не через position и внешнюю `duration`:
      // та берётся у СТАРТОВОЙ части один раз, и после перехода полоса
      // считалась бы от чужой длины. Плеер знает длину той части, которая
      // играет сейчас.
      const progress = player.progress;
      clockLabel.textContent = progress.positionSeconds.toFixed(2);
      played.style.width = `${(progress.positionSeconds / progress.durationSeconds) * 100}%`;
      progressLabel.textContent = describeProgress(progress);
    },
    onGateOpen: (gate, unboundOptions) => showGate(gate, unboundOptions),
    onGateResolved: (attempt) => showResult(attempt),
    onRevealOpen: (reveal) => showReveal(reveal),
  }, undefined, assumption);

  // Метки гейтов на дорожке: видно, куда плеер приедет.
  for (const gate of segment.gates) {
    const at = resolveTimeRef(gate.at, segment.words);
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
    // Разбор на месте панель не дописывает, а заменяет целиком: его рисует
    // showReveal по событию плеера. Так слой один и тот же независимо от
    // того, была ли панель открыта вообще — у гейта, где все варианты
    // нарисованы элементами сцены, её нет (ADR-011).
    if (attempt.outcome === 'reveal') return;

    feedback.className = 'feedback wrong';
    const left = attempt.gate.maxAttempts === null
      ? ''
      : ` Осталось попыток: ${attempt.gate.maxAttempts - attempt.attemptsUsed}.`;
    feedback.textContent = `Неверно.${left}`;
  }

  /**
   * Разбор на месте: слой ПОВЕРХ сцены, сегмент не покидается.
   *
   * Оверлей полупрозрачный намеренно — сцена обязана остаться видимой
   * под разбором. В этом и смысл `inline-explain`: зритель разбирается
   * с тем, на что смотрел, а не уходит в отдельную страницу.
   *
   * Своего текста у разбора в схеме пока нет (см. Reveal в player.ts),
   * поэтому оснастка показывает то, что плеер знает точно. `inline-hint`
   * отличается длиной: подсказка не повторяет вопрос.
   */
  function showReveal(reveal: Reveal): void {
    overlay.dataset['open'] = '1';
    panel.textContent = '';
    panel.dataset['reveal'] = reveal.kind;

    const title = document.createElement('h2');
    title.textContent = reveal.kind === 'inline-hint' ? 'Подсказка' : 'Разбор';
    panel.appendChild(title);

    if (reveal.kind === 'inline-explain') {
      const question = document.createElement('div');
      question.className = 'feedback';
      question.textContent = reveal.gate.config.kind === 'continue'
        ? reveal.gate.config.label
        : reveal.gate.config.prompt;
      panel.appendChild(question);
    }

    if (reveal.correctOption) {
      const right = document.createElement('div');
      right.className = 'feedback right';
      right.dataset['correct'] = reveal.correctOption.id;
      right.textContent = `Правильный ответ: ${reveal.correctOption.label}`;
      panel.appendChild(right);
    }

    const next = document.createElement('button');
    next.className = 'primary';
    next.id = 'reveal-next';
    next.textContent = 'Дальше';
    next.addEventListener('click', () => {
      closeOverlay();
      delete panel.dataset['reveal'];
      void player.continueAfterReveal();
    });
    panel.appendChild(next);
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
