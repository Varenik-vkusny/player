// Собирает фикстуру развилки — эталон графа сегментов для e2e Задачи 7.
//
// Одноразовый скрипт: фикстура коммитится в репозиторий, а не пересобирается
// на каждый прогон. Повторяет приём build-demo-fixture.mjs — слова читаются
// из транскрипта спайка S5, метки ставятся хелперами find()/at() по смыслу
// слова, а не по номеру, иначе привязка развалится при правке текста.
//
// Три узла (ADR-013): n-start — гейт-выбор на раннем слове с двумя
// option-рёбрами; n-yes и n-no — концовки (edges: []) с разным видимым
// текстом. Разный текст обязателен: e2e отличает узлы только по тому, что
// нарисовано на экране, и при одинаковом тексте позеленел бы даже сломанный
// переход.
//
// n-start ссылается на /audio/demo.mp3 — у него настоящий транскрипт, и гейт
// привязан к слову (инвариант №10). n-yes и n-no получают СВОИ короткие
// дорожки (branch-yes.wav / branch-no.wav, генерируются этим же скриптом).
// Если бы все три узла делили один src, на границе узлов не менялся бы
// источник звука: тот же файл — попадание в кэш, тот же буфер, и переход
// в плеере проверялся бы на случае, где ломаться нечему.
//
// Длительность узлов-концовок объявлена в схеме (3 с), а не выведена из
// декодированного буфера: clock.ts берёт duration из AudioBuffer, поэтому
// короткий wav обязателен — 48-секундный demo.mp3 на конце сделал бы e2e
// завершения неприлично медленным.
//
// Вариант ответа — сам элемент сцены (ADR-011, гибрид гейта): id элементов
// opt-yes/opt-no совпадает с id вариантов гейта, поэтому e2e кликает по
// видимому блоку через [data-id="opt-yes"], а не по системной плашке.
//
// Запуск: node scripts/build-branching-fixture.mjs

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const WORDS = new URL('spikes/s5-words/audio/ru-RU-SvetlanaNeural.words.json', ROOT);
const FIXTURE_OUT = new URL('fixtures/projects/branching.json', ROOT);
const BRANCH_DURATION = 3;
const BRANCH_SAMPLE_RATE = 44100;

/**
 * Пишет короткий моно WAV (16 бит PCM) с тихим синусоидальным тоном.
 *
 * Амплитуда сведена к нулю линейной рампой на первых и последних 10 мс —
 * без неё обрыв синуса на границе файла даёт щелчок, и спайк стыка мерил бы
 * дефект фикстуры вместо дефекта перехода между узлами.
 */
function makeToneWav(freqHz, seconds = BRANCH_DURATION, sampleRate = BRANCH_SAMPLE_RATE, amplitude = 0.2) {
  const numSamples = Math.round(seconds * sampleRate);
  const fadeSamples = Math.round(0.01 * sampleRate); // 10 мс
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // размер fmt-чанка для PCM
  buffer.writeUInt16LE(1, 20); // формат 1 = PCM
  buffer.writeUInt16LE(1, 22); // моно
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // байт в секунду
  buffer.writeUInt16LE(bytesPerSample, 32); // выравнивание блока
  buffer.writeUInt16LE(16, 34); // бит на отсчёт

  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let gain = 1;
    if (i < fadeSamples) gain = i / fadeSamples;
    else if (i >= numSamples - fadeSamples) gain = (numSamples - 1 - i) / fadeSamples;
    const value = amplitude * gain * Math.sin(2 * Math.PI * freqHz * t);
    const sample = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    buffer.writeInt16LE(sample, 44 + i * bytesPerSample);
  }

  return buffer;
}

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

/**
 * Дорожка n-start. Значения совпадают с demo.json/e2e.json: та же озвучка,
 * тот же файл — у этого узла настоящий транскрипт, и гейт привязан к слову.
 */
const startAudio = { src: '/audio/demo.mp3', duration: +(source.speechDuration + 0.5).toFixed(3), words };

/**
 * Дорожка узла-концовки: своя, короткая, с пустым транскриптом (words: []).
 * Длительность объявлена явно (BRANCH_DURATION), а не выведена из декодированного
 * буфера — см. комментарий вверху файла.
 */
const branchAudio = (src) => ({ src, duration: BRANCH_DURATION, words: [] });

const AUDIO_DIR = new URL('apps/playground/public/audio/', ROOT);
const YES_AUDIO_SRC = '/audio/branch-yes.wav';
const NO_AUDIO_SRC = '/audio/branch-no.wav';
const YES_TONE_HZ = 220;
const NO_TONE_HZ = 330;

const text = (id, x, y, width, height, content, style, zIndex = 1) => ({
  id, type: 'text', x, y, width, height, rotation: 0, zIndex, style, content,
});

const shape = (id, x, y, width, height, style, zIndex = 0, rotation = 0) => ({
  id, type: 'shape', x, y, width, height, rotation, zIndex, style, content: '',
});

const background = () => shape('bg', 0, 0, 1920, 1080, { background: '#11141a' }, 0);

// Гейт на раннем слове — том же, что у e2e.json: e2e не должен ждать, пока
// озвучка доедет до вопроса.
const iSmotrish = find('смотришь');

const startScene = {
  elements: [
    background(),
    text('prompt', 140, 160, 1640, 160,
      'Отвечаешь: да или нет?',
      { color: '#f5f7fa', 'font-family': 'system-ui, sans-serif', 'font-size': '56px', 'font-weight': '700', 'text-align': 'center' }),
    // id элемента совпадает с id варианта гейта ниже — ADR-011: сам блок
    // и есть кликабельный вариант ответа, без системной плашки поверх.
    text('opt-yes', 140, 460, 760, 160,
      'Да',
      { background: '#1b2430', 'border-radius': '20px', color: '#f5f7fa', 'font-family': 'system-ui, sans-serif', 'font-size': '40px', 'text-align': 'center' }),
    text('opt-no', 1020, 460, 760, 160,
      'Нет',
      { background: '#1b2430', 'border-radius': '20px', color: '#f5f7fa', 'font-family': 'system-ui, sans-serif', 'font-size': '40px', 'text-align': 'center' }),
  ],
  cues: [],
  gates: [
    {
      id: 'gate-start',
      at: at(iSmotrish),
      config: {
        kind: 'choice',
        prompt: 'Отвечаешь: да или нет?',
        options: [
          { id: 'opt-yes', label: 'Да' },
          { id: 'opt-no', label: 'Нет' },
        ],
        // Оба варианта равноправны — это развилка, а не проверка знания.
        // Схема требует correctId у choice-гейта независимо от того, как
        // используется исход; на маршрут это поле не влияет (маршрут решают
        // рёбра kind: 'option').
        correctId: 'opt-yes',
      },
      onWrong: 'retry',
      maxAttempts: null,
    },
  ],
};

/** Концовка: своя сцена с текстом, по которому e2e отличит узел от соседнего. */
const endingScene = (elementId, content) => ({
  elements: [
    background(),
    text(elementId, 140, 460, 1640, 160, content,
      { color: '#f5f7fa', 'font-family': 'system-ui, sans-serif', 'font-size': '56px', 'font-weight': '700', 'text-align': 'center' }),
  ],
  cues: [],
  gates: [],
});

const project = {
  schemaVersion: 2,
  meta: { title: 'Фикстура развилки: да или нет', stageWidth: 1920, stageHeight: 1080 },
  entry: 'n-start',
  nodes: [
    {
      id: 'n-start',
      title: 'Выбор',
      audio: startAudio,
      scene: startScene,
      edges: [
        { id: 'e-yes', to: 'n-yes', when: { kind: 'option', gateId: 'gate-start', optionId: 'opt-yes' } },
        { id: 'e-no', to: 'n-no', when: { kind: 'option', gateId: 'gate-start', optionId: 'opt-no' } },
      ],
    },
    {
      id: 'n-yes',
      title: 'Концовка: да',
      audio: branchAudio(YES_AUDIO_SRC),
      scene: endingScene('result-yes', 'Ты выбрал да'),
      edges: [],
    },
    {
      id: 'n-no',
      title: 'Концовка: нет',
      audio: branchAudio(NO_AUDIO_SRC),
      scene: endingScene('result-no', 'Ты выбрал нет'),
      edges: [],
    },
  ],
};

await writeFile(FIXTURE_OUT, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

const yesWav = makeToneWav(YES_TONE_HZ);
const noWav = makeToneWav(NO_TONE_HZ);
await writeFile(new URL('branch-yes.wav', AUDIO_DIR), yesWav);
await writeFile(new URL('branch-no.wav', AUDIO_DIR), noWav);

console.log(`узлов: ${project.nodes.length}, слов: ${words.length}, длительность n-start: ${startAudio.duration} с`);
console.log(`n-start: гейт «${words[iSmotrish].text}» (${words[iSmotrish].start} с), рёбер: ${project.nodes[0].edges.length}`);
console.log(`branch-yes.wav: ${YES_TONE_HZ} Гц, ${yesWav.length} байт`);
console.log(`branch-no.wav: ${NO_TONE_HZ} Гц, ${noWav.length} байт`);
