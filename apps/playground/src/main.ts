/**
 * Дев-стенд: грузит эталонную фикстуру и показывает плеер.
 *
 * Это единственное место, где живёт UI гейта. Сам плеер про кнопки не знает —
 * он сообщает, что гейт открыт, и принимает ответ.
 */
import { loadProject, resolveTimeRef, type Gate } from '@player/core';
import { Player, type GateAttempt } from '@player/player';

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

/** Ключ, по которому редактор передаёт проект на предпросмотр. */
const PREVIEW_KEY = 'player:preview-project';

/**
 * Откуда взять проект.
 *
 * По умолчанию — эталонная фикстура. С `?from=editor` — то, что редактор
 * положил в sessionStorage: бэкенда в этой сессии нет, а проект с настоящей
 * озвучкой в адресную строку не помещается.
 */
async function readProject(): Promise<unknown> {
  if (new URLSearchParams(location.search).get('from') === 'editor') {
    // localStorage, а не sessionStorage: у открытой вкладки собственное
    // sessionStorage, и редактор в него дописаться не может.
    const saved = localStorage.getItem(PREVIEW_KEY);
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
    onGateOpen: (gate) => showGate(gate),
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

  function showGate(gate: Gate): void {
    overlay.dataset['open'] = '1';
    panel.textContent = '';

    const config = gate.config;
    const title = document.createElement('h2');
    title.textContent = config.kind === 'continue' ? config.label : config.prompt;
    panel.appendChild(title);

    const feedback = document.createElement('div');
    feedback.className = 'feedback';

    if (config.kind === 'choice') {
      const list = document.createElement('div');
      list.className = 'options';
      for (const option of config.options) {
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
