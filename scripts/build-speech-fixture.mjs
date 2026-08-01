// Собирает эталонную фикстуру, где текст озвучки (Segment.speech, схема v7)
// и расшифровка дорожки (audio.words) РАСХОДЯТСЯ. Без такого расхождения
// выравнивание (alignWords) проверялось бы на случае, где ломаться нечему.
//
// Расшифровка НЕ копируется сюда: скрипт читает её из fixtures/projects/demo.json
// при каждом запуске. Копия разъехалась бы с оригиналом тихо — именно это уже
// случилось с build-branching-fixture.mjs, который сегодня не воспроизводит
// свою фикстуру.
//
// demo.json — файл версии 1: `segments` там ещё не существует, дорожка лежит
// в корне (`audio.src`, `audio.duration`, `audio.words`). speech.json пишется
// сразу в версии 7 — так же, как в своё время conditions.json был заведён
// сразу в версии 5. Ни один существующий файл в fixtures/projects/ не трогается.
//
// Текст озвучки строится как ПРАВКА настоящей расшифровки, а не независимый
// текст: те же 100 слов, склеенные пробелами, и ровно ТРИ внесённых
// расхождения — иначе тексты совпали бы дословно (расхождений ноль) или
// покрывали бы не весь список §4 `docs/product.md` (расхождений меньше трёх).
//
// §4 называет три глагола живой речи против написанного текста: «перефразирует,
// пропускает, добавляет» (плюс «оговаривается, обрывается» — им отдельных
// операций alignWords не соответствует, здесь не моделируются). Ровно три
// глагола — ровно три операции alignWords, и фикстура обязана нести все три,
// иначе она проверяет не весь раздел, а его часть:
//
//   перефразировал   → `replaced` (расхождение 1)
//   пропустил слово  → `added`    (расхождение 2 — слово ЕСТЬ в расшифровке,
//                                  но ОТСУТСТВУЕТ в тексте озвучки)
//   произнёс лишнее  → `removed`  (расхождение 3 — слово ЕСТЬ в тексте
//                                  озвучки, но ОТСУТСТВУЕТ в расшифровке)
//
// Направления `added`/`removed` подтверждены прогоном, а не угаданы — см.
// комментарий у расхождения 2 ниже. Три расхождения разнесены по тексту
// (индексы расшифровки 10, 36, 71), чтобы ни одна пара не оказалась соседней:
// `collapseReplacements` схлопывает СОСЕДНЮЮ пару «пропало и появилось»
// в `replaced`, и вплотную стоящие правки слились бы в чужую операцию.
//
// Запуск: node scripts/build-speech-fixture.mjs

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const DEMO_SOURCE = new URL('fixtures/projects/demo.json', ROOT);
const FIXTURE_OUT = new URL('fixtures/projects/speech.json', ROOT);

const demo = JSON.parse(await readFile(DEMO_SOURCE, 'utf8'));
if (demo.schemaVersion !== 1) {
  throw new Error(
    `demo.json ожидался версии 1 (расшифровка ещё в audio.words корня), `
    + `а найдена версия ${demo.schemaVersion}. Читать расшифровку неоткуда — обнови этот скрипт.`,
  );
}

/** Настоящая расшифровка — те же объекты, что лежат в demo.json. Не копия, чтение. */
const words = demo.audio.words;
if (!Array.isArray(words) || words.length === 0) {
  throw new Error('demo.json.audio.words пуст — расшифровку строить не из чего.');
}

/** Ищет слово по тексту (без учёта регистра), чтобы расхождение стояло на смысле. */
function findWordIndex(text, from = 0) {
  const index = words.findIndex((w, i) => i >= from && w.text.toLowerCase() === text.toLowerCase());
  if (index === -1) throw new Error(`Слово «${text}» не найдено в расшифровке demo.json`);
  return index;
}

// Расхождение 1 (replaced): меняем форму «останавливается» → «останавливалось» —
// общее начало «останавлива» (11 букв из 15) держится больше 2/3 длины слова,
// поэтому alignWords схлопнёт пару removed+added в одну операцию `replaced`,
// а не сочтёт слово исчезнувшим.
//
// Расхождение 2 (added): в тексте озвучки ПРОПУЩЕНО слово, которое есть
// в расшифровке. Направление проверено прогоном, а не угадано: тест вызывает
// alignWords(splitIntoWords(speech), audio.words) — speech идёт ПЕРВЫМ
// аргументом (`before`), расшифровка ВТОРЫМ (`after`). Слово, лишнее
// в `before` и отсутствующее в `after`, alignWords помечает `removed`,
// а не `added` (проверено на align.test.ts: «другое слово… `removed`, `added`»
// и на этой самой фикстуре — первая попытка вставить слово в speech дала
// removed, не added). `added` получает только слово, которого нет в `before`,
// но которое есть в `after` — то есть эту ветку включает пропуск слова
// в тексте озвучки, а не вставка.
const stopsIndex = findWordIndex('останавливается');
const REPLACED_FROM = words[stopsIndex].text;
const REPLACED_TO = 'останавливалось';

const omittedIndex = findWordIndex('обычное');
const OMITTED_WORD = words[omittedIndex].text;

// Расхождение 3 (removed): диктор произнёс лишнее слово, которого в тексте
// не было, — «конечно» перед «Когда» (индекс расшифровки 71, далеко от
// расхождений 1 и 2, чтобы не задеть collapseReplacements).
const insertBeforeIndex = findWordIndex('когда');
const INSERTED_WORD = 'конечно';
const INSERTED_BEFORE = words[insertBeforeIndex].text;

if (insertBeforeIndex - omittedIndex < 2 || omittedIndex - stopsIndex < 2) {
  throw new Error('Расхождения стоят слишком близко — collapseReplacements может их слить.');
}

const speechWords = words.map((w) => w.text);
// Порядок применения — от старшего исходного индекса к младшему: splice
// на большем индексе не задевает позиции меньших индексов, а обратный
// порядок незаметно сдвинул бы их и подставил не то слово.
speechWords.splice(insertBeforeIndex, 0, INSERTED_WORD); // (3) лишнее слово
speechWords.splice(omittedIndex, 1); // (2) пропуск слова, которое есть в расшифровке
speechWords[stopsIndex] = REPLACED_TO; // (1) замена формы

const speech = speechWords.join(' ');

const segment = {
  id: 's-speech',
  title: 'Текст озвучки против расшифровки',
  speech,
  audio: {
    src: demo.audio.src,
    offset: 0,
    duration: demo.audio.duration,
    words,
  },
  elements: [],
  slides: [
    { id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} },
  ],
  gates: [],
  exit: { rules: [], default: null },
};

const project = {
  schemaVersion: 7,
  meta: { title: 'Расхождение текста озвучки и расшифровки', stageWidth: 1920, stageHeight: 1080 },
  entry: segment.id,
  segments: [segment],
};

await writeFile(FIXTURE_OUT, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

console.log(`расшифровка: ${words.length} слов, взято из demo.json (${demo.audio.src})`);
console.log(`текст озвучки: ${speechWords.length} слов`);
console.log(`расхождение 1 (replaced, «перефразировал»): «${REPLACED_FROM}» → «${REPLACED_TO}» (индекс расшифровки ${stopsIndex})`);
console.log(`расхождение 2 (added, «пропустил»): в тексте озвучки нет слова «${OMITTED_WORD}» (индекс расшифровки ${omittedIndex}) — в расшифровке оно есть`);
console.log(`расхождение 3 (removed, «добавил лишнее»): в тексте озвучки есть слово «${INSERTED_WORD}» перед «${INSERTED_BEFORE}» (индекс расшифровки ${insertBeforeIndex}) — в расшифровке его нет`);
console.log(`записано: ${FIXTURE_OUT.pathname}`);
