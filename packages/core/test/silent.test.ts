/**
 * Немой сегмент (схема v13).
 *
 * До v13 сегмент без звука был НЕВЫРАЗИМ: `.refine()` над `audio` требовал
 * ровно один источник, и `loadProject` отвечал
 * `segments.0.audio: Invalid input: expected object, received undefined`.
 * Это и делает первый тест здесь непустым — он проверяет ровно то, чего
 * раньше не существовало.
 *
 * → docs/adr/ADR-030-silent-segment.md
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadProject } from '../src/load.js';
import { migrateToCurrent } from '../src/migrations.js';
import { SCHEMA_VERSION } from '../src/schema.js';

const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): any => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

describe('немой сегмент', () => {
  it('сегмент без src и без fileId проходит разбор', () => {
    // Слом: вернуть в схему `.refine((a) => (a.src === undefined) !== (a.fileId === undefined))`.
    // Тест краснеет с тем самым сообщением, ради которого затевалась v13.
    const project = loadProject(raw('silent.json'));
    const segment = project.segments[0]!;

    expect(segment.audio.src).toBeUndefined();
    expect(segment.audio.fileId).toBeUndefined();
    expect(segment.audio.duration).toBe(6);
  });

  it('у немого сегмента есть текст озвучки, но нет расшифровки — это и есть заготовка', () => {
    // Ровно то состояние, в котором приезжает импорт: что сказать — известно,
    // что прозвучало — ещё нет. Слом: запретить `speech` без дорожки, и тест
    // покраснеет; сегодня это два независимых поля, и так и должно быть.
    const segment = loadProject(raw('silent.json')).segments[0]!;

    expect(segment.speech).toBeTruthy();
    expect(segment.audio.words).toEqual([]);
  });

  it('слайды немого сегмента размечены СЕКУНДАМИ, а не словами', () => {
    // Инвариант №10 разрешает секунды там, где слова нет, и немой сегмент —
    // это ровно тот случай. Слом: разметить слайд `{ kind: 'word' }` —
    // разбор упадёт, потому что ссылка на слово в пустом списке невалидна.
    const segment = loadProject(raw('silent.json')).segments[0]!;

    expect(segment.slides.map((s) => s.at.kind)).toEqual(['seconds', 'seconds', 'seconds']);
  });

  it('ОТКАЗ: у немого сегмента не может быть расшифровки', () => {
    // Слом: убрать проверку `words.length > 0` из `superRefine` — тест
    // покраснеет, потому что бессмысленный проект пройдёт разбор.
    //
    // Слово тут ПОЛНОЕ, с полем `source`, и это не педантизм. С огрызком
    // `{ text, start, end }` разбор падал раньше — на самом `WordSchema`, —
    // и тест был бы зелёным по чужой причине: ровно та ловушка, что
    // разобрана в граблях Сессии 39.
    const broken = raw('silent.json');
    broken.segments[0].audio.words = [
      { text: 'раз', start: 0, end: 0.4, source: 'manual' },
    ];

    expect(() => loadProject(broken)).toThrow(/слов быть не может/);
  });

  it('ОТКАЗ: у немого сегмента не может быть смещения по файлу', () => {
    // Слом: убрать проверку `offset !== 0` — пройдёт сегмент, который
    // смещён внутри файла, которого нет.
    const broken = raw('silent.json');
    broken.segments[0].audio.offset = 1.5;

    expect(() => loadProject(broken)).toThrow(/файла нет/);
  });

  it('ОТКАЗ: двух источников звука сразу по-прежнему не бывает', () => {
    // Это НЕ новый запрет, а охрана старого: ослабляя «ровно один» до
    // «не больше одного», легко потерять вторую половину. Слом: заменить
    // `superRefine` на пустой — покраснеет здесь, а не в v13-тестах.
    const broken = raw('silent.json');
    broken.segments[0].audio.src = '/audio/a.mp3';
    broken.segments[0].audio.fileId = 'sha256-деадбиф';

    expect(() => loadProject(broken)).toThrow(/двух источников/);
  });
});

describe('миграция v12 → v13', () => {
  it('не меняет НИЧЕГО, кроме номера версии', () => {
    // Доказательство для 110 скриншотных эталонов: ослабление проверки
    // не имеет права тронуть ни один существующий проект. Слом: заставить
    // миграцию, например, проставлять `offset: 0` там, где его не было, —
    // сравнение сегментов покраснеет.
    const v12 = raw('styles.json');
    expect(v12.schemaVersion).toBe(12);

    const migrated = migrateToCurrent(v12) as any;

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.meta).toEqual(v12.meta);
    expect(migrated.entry).toEqual(v12.entry);
    expect(migrated.styles).toEqual(v12.styles);
    expect(migrated.segments).toEqual(v12.segments);
  });

  it('поднимает немой проект от самой старой версии до текущей', () => {
    // Немого сегмента в v1 быть не могло, поэтому проверяется другое:
    // что цепочка миграций доходит до 13 и не спотыкается на новом шаге.
    const v1 = raw('demo.json');
    expect(v1.schemaVersion).toBe(1);

    const migrated = migrateToCurrent(v1) as any;
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(() => loadProject(v1)).not.toThrow();
  });
});
