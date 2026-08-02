// Собирает фикстуру повтора куска — эталон для Задачи 9 (плеер: повтор).
//
// Два сегмента: «a» (одна молчащая внутри остановка после повтора) и «b»
// (виновная остановка — неверный ответ ведёт назад в «a», верный — в конец).
// Дорожки короткие и уже существующие (ask.mp3, branch-yes.mp3): их длину
// менять нельзя — она вписана в e2e/editor-segments.spec.ts:112.
//
// Аудиоблоки (src/offset/duration/words) НЕ копируются вручную — скрипт
// читает их из уже существующей эталонной фикстуры exit-branch.json, где
// эти же дорожки уже размечены. Так исключён дрейф чисел между двумя
// файлами, который CLAUDE.md прямо называет источником ложных докладов.
//
// Запуск: node scripts/build-repeat-fixture.mjs

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SOURCE_FIXTURE = new URL('fixtures/projects/exit-branch.json', ROOT);
const FIXTURE_OUT = new URL('fixtures/projects/repeat.json', ROOT);

const source = JSON.parse(await readFile(SOURCE_FIXTURE, 'utf8'));
const findSegment = (id) => {
  const segment = source.segments.find((s) => s.id === id);
  if (!segment) throw new Error(`В ${SOURCE_FIXTURE} нет сегмента «${id}»`);
  return segment;
};

// s-ask звучит на ask.mp3, s-right — на branch-yes.mp3: обе дорожки короткие
// и уже используются в других эталонных фикстурах.
const audioA = findSegment('s-ask').audio;
const audioB = findSegment('s-right').audio;

// Элемент несёт только идентичность и содержимое (ADR-015): геометрия
// и стиль — это состояние на слайде, а не свойство элемента.
const text = (id, content) => ({ id, type: 'text', content });
const shape = (id) => ({ id, type: 'shape', content: '' });

const state = (x, y, width, height, style, zIndex = 1) => ({
  x, y, width, height, rotation: 0, zIndex, opacity: 1, visible: true, style,
});

const bgState = () => state(0, 0, 1920, 1080, { background: '#11141a' }, 0);

const titleStyle = {
  color: '#f5f7fa',
  'font-family': 'system-ui, sans-serif',
  'font-size': '64px',
  'font-weight': '700',
  'text-align': 'center',
};

// Кусок «a»: одна остановка ВНУТРИ него (g-a). На первом проходе она
// открывается, отвечать «дальше»; на повторе — молчит по построению задачи.
const segmentA = {
  id: 's-a',
  title: 'Кусок A: молчащая внутри остановка',
  audio: audioA,
  elements: [shape('bg-a'), text('label-a', 'Кусок A')],
  slides: [
    {
      id: 'a-1',
      at: { kind: 'seconds', t: 0 },
      transition: 'cut',
      states: {
        'bg-a': bgState(),
        'label-a': state(140, 440, 1640, 200, titleStyle),
      },
    },
  ],
  gates: [
    {
      id: 'g-a',
      at: { kind: 'seconds', t: 1 },
      config: { kind: 'continue', label: 'Дальше' },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'ответА',
    },
  ],
  exit: { rules: [], default: 's-b' },
};

// Кусок «b»: виновная остановка (g-b). Неверный ответ ведёт обратно в «a»
// (повтор), верный — в конец объяснения. onWrong: 'continue' — ответ,
// даже неверный, не останавливает дорожку внутри сегмента: маршрут решает
// ВЫХОД, когда дорожка доиграет (ADR-015), а не гейт.
//
// Варианты ответа НЕ связаны с элементами сцены (в отличие от branching.json):
// как и в exit-branch.json, оба id варианта не совпадают ни с одним id
// элемента, поэтому оснастка рисует их настоящими <button> в оверлее —
// e2e нажимает ИХ, а не системную плашку.
const segmentB = {
  id: 's-b',
  title: 'Кусок B: виновная остановка',
  audio: audioB,
  elements: [shape('bg-b'), text('label-b', 'Кусок B')],
  slides: [
    {
      id: 'b-1',
      at: { kind: 'seconds', t: 0 },
      transition: 'cut',
      states: {
        'bg-b': bgState(),
        'label-b': state(140, 460, 1640, 160, titleStyle),
      },
    },
  ],
  gates: [
    {
      id: 'g-b',
      at: { kind: 'seconds', t: 1 },
      config: {
        kind: 'choice',
        prompt: 'Верно или неверно?',
        options: [
          { id: 'opt-right', label: 'Верно' },
          { id: 'opt-wrong', label: 'Неверно' },
        ],
        correctId: 'opt-right',
      },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'ответБ',
    },
  ],
  exit: {
    rules: [
      // Неверный ответ отправляет назад в «a» — это и есть повтор.
      { id: 'r-repeat', when: [{ kind: 'wrong', variable: 'ответБ' }], goto: 's-a' },
      // Верный ответ ведёт в настоящий конец. Правило схемы требует ТОТАЛЬНОГО
      // покрытия исходов: пары «верно»/«неверно» по одной переменной хватает,
      // но `goto` не может значить «null» — концу нужен собственный сегмент.
      { id: 'r-end', when: [{ kind: 'correct', variable: 'ответБ' }], goto: 's-end' },
    ],
    default: null,
  },
};

// Настоящая концовка: свой видимый текст, чтобы e2e отличил её от «Кусок B»,
// и нулевой набор остановок — default: null здесь законен без всяких
// оговорок про покрытие, потому что покрывать нечего (rules.length === 0).
const segmentEnd = {
  id: 's-end',
  title: 'Конец объяснения',
  // Своя дорожка, отличная от предыдущего сегмента (s-b): общий src на стыке
  // означал бы попадание в кэш и тот же буфер — переход проверялся бы
  // на случае, где ломаться нечему (тот же приём, что в exit-branch.json).
  audio: audioA,
  elements: [shape('bg-end'), text('label-end', 'Конец')],
  slides: [
    {
      id: 'end-1',
      at: { kind: 'seconds', t: 0 },
      transition: 'cut',
      states: {
        'bg-end': bgState(),
        'label-end': state(140, 460, 1640, 160, titleStyle),
      },
    },
  ],
  gates: [],
  exit: { rules: [], default: null },
};

const project = {
  schemaVersion: 7,
  meta: { title: 'Повтор куска: молчащая остановка и виновница', stageWidth: 1920, stageHeight: 1080 },
  entry: 's-a',
  segments: [segmentA, segmentB, segmentEnd],
};

await writeFile(FIXTURE_OUT, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

console.log(`сегментов: ${project.segments.length}`);
console.log(`s-a: аудио ${audioA.src}, ${audioA.duration} с, слов: ${audioA.words.length}`);
console.log(`s-b: аудио ${audioB.src}, ${audioB.duration} с, слов: ${audioB.words.length}`);
console.log(`s-end: аудио ${audioA.src}, ${audioA.duration} с`);
console.log(`ребро повтора: g-b «неверно» → s-a; g-b «верно» → s-end`);
