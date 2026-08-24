import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ОХРАНА ШАБЛОННОЙ СТРОКИ styles.ts.
 *
 * Весь файл — одна шаблонная строка: `export const EDITOR_STYLES = ` … ``.
 * Любая обратная кавычка ВНУТРИ неё обрывает строку, и дальше идёт
 * синтаксический мусор: редактор просто перестаёт открываться.
 *
 * Заведено 20.08.2026 после ЧЕТВЁРТОГО случая за сутки. Каждый раз я
 * ставил кавычки в комментарии, машинально оформляя имя класса или
 * свойства, — и каждый раз это стоило прогона и нескольких минут поиска.
 *
 * Почему нужен именно тест:
 *   - типизация этого НЕ ловит: с точки зрения TypeScript файл валиден,
 *     просто строка кончается раньше;
 *   - грабля записана в самом styles.ts комментарием, и я его читал,
 *     и всё равно наступил четыре раза. Записанное правило не работает,
 *     работает проверка;
 *   - падение проявляется не там, где ошибка: сборка ломается в vite,
 *     а виден пустой экран редактора.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: любая обратная кавычка между
 * открывающей и закрывающей — хоть в правиле, хоть в комментарии.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('../src/styles.ts', import.meta.url)),
  'utf8',
);

describe('styles.ts — одна шаблонная строка', () => {
  it('внутри неё нет обратных кавычек', () => {
    const first = SOURCE.indexOf('`');
    const last = SOURCE.lastIndexOf('`');
    expect(first, 'открывающей кавычки нет — файл перестал быть шаблонной строкой')
      .toBeGreaterThan(-1);
    expect(last, 'закрывающей кавычки нет').toBeGreaterThan(first);

    const inside = SOURCE.slice(first + 1, last);
    const lines = inside.split('\n');
    const offenders = lines
      .map((line, index) => ({ line, at: index + 2 }))
      .filter((row) => row.line.includes('`'))
      .map((row) => `строка ${row.at}: ${row.line.trim().slice(0, 70)}`);

    expect(
      offenders,
      `обратные кавычки внутри шаблонной строки — редактор не откроется:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
