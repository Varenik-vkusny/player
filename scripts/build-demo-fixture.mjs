// Собирает демо-фикстуру из русской озвучки, сгенерированной для спайка S5.
//
// Одноразовый скрипт: фикстура коммитится в репозиторий, а не пересобирается.
// Смысл в том, чтобы у стенда была НАСТОЯЩАЯ дорожка с пословными таймингами,
// иначе привязка меток к словам проверяется только в тестах, но не глазами.
//
// Запуск: node scripts/build-demo-fixture.mjs

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const WORDS = new URL('spikes/s5-words/audio/ru-RU-SvetlanaNeural.words.json', ROOT);
const MP3 = new URL('spikes/s5-words/audio/ru-RU-SvetlanaNeural.mp3', ROOT);
const AUDIO_OUT = new URL('apps/playground/public/audio/demo.mp3', ROOT);
const FIXTURE_OUT = new URL('fixtures/projects/demo.json', ROOT);

const normalize = (text) => text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');

const source = JSON.parse(await readFile(WORDS, 'utf8'));
const words = source.words.map((w) => ({
  text: w.text,
  start: +w.start.toFixed(3),
  end: +w.end.toFixed(3),
  source: 'tts',
}));

/** Строит якорь по окрестности слова — так метка переживёт правку текста. */
const anchor = (index) => ({
  text: normalize(words[index].text),
  before: index > 0 ? normalize(words[index - 1].text) : '',
  after: index + 1 < words.length ? normalize(words[index + 1].text) : '',
});

const at = (index, offset = 0) => ({ kind: 'word', wordIndex: index, offset, anchor: anchor(index) });

/** Ищет слово по тексту, чтобы метки стояли на смысле, а не на номере. */
const find = (needle, from = 0) => {
  const target = normalize(needle);
  const index = words.findIndex((w, i) => i >= from && normalize(w.text) === target);
  if (index === -1) throw new Error(`Слово «${needle}» не найдено в транскрипте`);
  return index;
};

const iOstanavlivaetsya = find('останавливается');
const iGlavnaya = find('главная');
const iEnergiya = find('Энергия');

const text = (id, x, y, width, height, content, style, zIndex = 3) => ({
  id, type: 'text', x, y, width, height, rotation: 0, zIndex, style, content,
});

const shape = (id, x, y, width, height, style, zIndex = 1, rotation = 0) => ({
  id, type: 'shape', x, y, width, height, rotation, zIndex, style, content: '',
});

const project = {
  schemaVersion: 1,
  meta: { title: 'Демо: гейты на словах', stageWidth: 1920, stageHeight: 1080 },
  audio: { src: '/audio/demo.mp3', duration: +(source.speechDuration + 0.5).toFixed(3), words },
  scene: {
    elements: [
      shape('bg', 0, 0, 1920, 1080, { background: '#11141a' }, 0),
      text('title', 140, 130, 1300, 180,
        'Объяснение, которое останавливается',
        { color: '#f5f7fa', 'font-family': 'Georgia, serif', 'font-size': '68px', 'line-height': '1.15', 'font-weight': '700', opacity: '0' }),
      shape('accent', 140, 350, 220, 12, { background: '#e4572e', 'border-radius': '6px', opacity: '0' }, 2),
      text('lead', 140, 420, 1000, 260,
        'Звук замирает, картинка ждёт, и внимание возвращается к тому, что происходит на экране.',
        { color: '#9fb0c4', 'font-family': 'system-ui, sans-serif', 'font-size': '36px', 'line-height': '1.5', opacity: '0' }),
      shape('card', 1240, 400, 520, 340, { background: '#1b2430', 'border-radius': '28px', border: '2px solid #2c3a4d', opacity: '0' }, 1),
      shape('dot', 1420, 500, 160, 160, { background: '#f3a712', 'border-radius': '50%', opacity: '0' }, 2),
      text('footer', 140, 900, 1200, 80,
        'Возобновление — с той же секунды. Перемотки не происходит.',
        { color: '#6d7f95', 'font-family': 'system-ui, sans-serif', 'font-size': '28px', opacity: '0' }),
    ],
    cues: [
      { id: 'c-title', at: at(0), targetId: 'title', animation: { property: 'opacity', from: 0, to: 1, duration: 700, ease: 'outQuad' } },
      { id: 'c-accent', at: at(iOstanavlivaetsya), targetId: 'accent', animation: { property: 'opacity', from: 0, to: 1, duration: 400, ease: 'outQuad' } },
      { id: 'c-accent-grow', at: at(iOstanavlivaetsya), targetId: 'accent', animation: { property: 'scaleX', from: 0, to: 1, duration: 600, ease: 'outQuad' } },
      { id: 'c-lead', at: at(iGlavnaya), targetId: 'lead', animation: { property: 'opacity', from: 0, to: 1, duration: 600, ease: 'outQuad' } },
      { id: 'c-card', at: at(find('Здесь')), targetId: 'card', animation: { property: 'opacity', from: 0, to: 1, duration: 500, ease: 'outQuad' } },
      { id: 'c-dot', at: at(find('Звук')), targetId: 'dot', animation: { property: 'opacity', from: 0, to: 1, duration: 400, ease: 'outQuad' } },
      { id: 'c-dot-move', at: at(find('Звук')), targetId: 'dot', animation: { property: 'y', from: 0, to: -60, duration: 900, ease: 'inOutQuad' } },
      { id: 'c-footer', at: at(find('Никакой')), targetId: 'footer', animation: { property: 'opacity', from: 0, to: 1, duration: 500, ease: 'outQuad' } },
    ],
    gates: [
      {
        id: 'gate-choice',
        at: at(iGlavnaya, -0.15),
        config: {
          kind: 'choice',
          prompt: 'Что является часами проекта?',
          options: [
            { id: 'opt-audio', label: 'Позиция в аудио' },
            { id: 'opt-timer', label: 'Отдельный таймер' },
            { id: 'opt-frames', label: 'Счётчик кадров' },
          ],
          correctId: 'opt-audio',
        },
        onWrong: 'retry',
        maxAttempts: 3,
      },
      {
        id: 'gate-input',
        at: at(iEnergiya, -0.2),
        config: {
          kind: 'input',
          prompt: 'Как называется точка, где плеер останавливается и ждёт ответа?',
          accept: ['гейт', 'gate'],
          caseSensitive: false,
        },
        onWrong: 'reveal',
        maxAttempts: 2,
      },
    ],
  },
};

/**
 * Вторая фикстура — для e2e. То же аудио, но гейты на ранних словах:
 * тест не должен ждать пятнадцать секунд, чтобы проверить остановку.
 * Механика от этого не меняется, меняется только время ожидания.
 */
const iSmotrish = find('смотришь');
const iMoment = find('момент');

const e2e = {
  ...project,
  meta: { ...project.meta, title: 'e2e: ранние гейты' },
  scene: {
    ...project.scene,
    cues: [project.scene.cues[0]],
    gates: [
      {
        id: 'gate-choice',
        at: at(iSmotrish),
        config: {
          kind: 'choice',
          prompt: 'Что является часами проекта?',
          options: [
            { id: 'opt-audio', label: 'Позиция в аудио' },
            { id: 'opt-timer', label: 'Отдельный таймер' },
          ],
          correctId: 'opt-audio',
        },
        onWrong: 'retry',
        maxAttempts: 3,
      },
      {
        id: 'gate-input',
        at: at(iMoment),
        config: { kind: 'input', prompt: 'Введи слово «гейт»', accept: ['гейт'], caseSensitive: false },
        onWrong: 'reveal',
        maxAttempts: 2,
      },
    ],
  },
};

await mkdir(new URL('.', AUDIO_OUT), { recursive: true });
await copyFile(MP3, AUDIO_OUT);
await writeFile(FIXTURE_OUT, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
await writeFile(new URL('fixtures/projects/e2e.json', ROOT), `${JSON.stringify(e2e, null, 2)}\n`, 'utf8');

console.log(`слов: ${words.length}, длительность: ${project.audio.duration} с`);
console.log(`демо — гейты на словах: «${words[iGlavnaya].text}» (${words[iGlavnaya].start} с), `
  + `«${words[iEnergiya].text}» (${words[iEnergiya].start} с)`);
console.log(`e2e  — гейты на словах: «${words[iSmotrish].text}» (${words[iSmotrish].start} с), `
  + `«${words[iMoment].text}» (${words[iMoment].start} с)`);
