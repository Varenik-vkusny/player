import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ОХРАНА ШАБЛОННЫХ СТРОК ЛИСТА СТИЛЕЙ.
 *
 * Каждая часть в `src/styles/` — одна шаблонная строка вида
 * `export const XXX_CSS = ` … ``. Любая обратная кавычка ВНУТРИ неё
 * обрывает строку, и дальше идёт синтаксический мусор: редактор просто
 * перестаёт открываться.
 *
 * Заведено 20.08.2026 после ЧЕТВЁРТОГО случая за сутки. Каждый раз кавычки
 * ставились в комментарии, машинально, при оформлении имени класса или
 * свойства, — и каждый раз это стоило прогона и нескольких минут поиска.
 *
 * Почему нужен именно тест:
 *   - типизация этого НЕ ловит: с точки зрения TypeScript файл валиден,
 *     просто строка кончается раньше;
 *   - грабля записана комментарием в самом файле, её читали — и всё равно
 *     наступили четыре раза. Записанное правило не работает, работает
 *     проверка;
 *   - падение проявляется не там, где ошибка: сборка ломается в vite,
 *     а виден пустой экран редактора.
 *
 * 28.08.2026: лист разрезан с одного файла на части. Проверка стала обходить
 * КАТАЛОГ, а не один путь, — и потому накрывает и те части, которых ещё нет:
 * новый файл в `src/styles/` попадает под охрану сам, без правки теста.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: любая обратная кавычка между
 * открывающей и закрывающей в ЛЮБОЙ части — хоть в правиле, хоть
 * в комментарии.
 */
const DIR = fileURLToPath(new URL('../src/styles/', import.meta.url));
const PARTS = readdirSync(DIR)
  .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
  .sort();

describe('части листа стилей — шаблонные строки без обратных кавычек внутри', () => {
  it('части вообще найдены (иначе проверка зелена по пустоте)', () => {
    expect(PARTS.length).toBeGreaterThan(1);
  });

  for (const name of PARTS) {
    it(`${name}: внутри шаблонной строки нет обратных кавычек`, () => {
      const source = readFileSync(DIR + name, 'utf8');
      const first = source.indexOf('`');
      const last = source.lastIndexOf('`');
      expect(first, 'открывающей кавычки нет — файл перестал быть шаблонной строкой').toBeGreaterThan(-1);
      expect(last, 'закрывающей кавычки нет').toBeGreaterThan(first);

      const inside = source.slice(first + 1, last);
      const before = source.slice(0, first).split('\n').length;
      const offenders = inside
        .split('\n')
        .map((line, index) => ({ line, at: before + index }))
        .filter((row) => row.line.includes('`'))
        .map((row) => `строка ${row.at}: ${row.line.trim().slice(0, 70)}`);

      expect(
        offenders,
        `обратные кавычки внутри шаблонной строки ${name} — редактор не откроется:\n${offenders.join('\n')}`,
      ).toEqual([]);
    });
  }
});
