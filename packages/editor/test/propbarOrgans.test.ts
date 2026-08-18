/**
 * Сессия 48, решение владельца 18.08.2026: 13 кнопок расположения
 * (выравнивание объектов, раскладка, слои, «копировать форматирование»)
 * убраны с полосы свойств над холстом (`stage/PropBar.tsx`) и переехали
 * в блок «Расположение» панели «Объект» (`panels/Inspector.tsx`), за дверь
 * «Ещё…» — полоса при окне 1280 с открытым каталогом не помещает даже пять
 * полей стиля (673 px при доступных 586), органы там были обречены всегда.
 *
 * Проверяется ТЕКСТ ИСХОДНИКА, тем же приёмом, что `uiChrome.test.ts`
 * и `uiTokens.test.ts` (комментарий там же объясняет, почему: обходить
 * такую охрану случайно нельзя). Список testid, с которым сверяемся, взят
 * из `stage/organs.ts` ИМПОРТОМ, а не переписан руками — иначе список
 * здесь и список там разошлись бы молча, и это была бы ровно та болезнь,
 * ради конца которой органы вообще вынесены в общий модуль.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALIGN_BUTTONS, DISTRIBUTE_BUTTONS, LAYER_BUTTONS } from '../src/stage/organs.js';

const SRC = join(process.cwd(), 'packages/editor/src');

const ORGAN_TEST_IDS: readonly string[] = [
  ...ALIGN_BUTTONS.map((b) => b.testId),
  ...DISTRIBUTE_BUTTONS.map((b) => b.testId),
  ...LAYER_BUTTONS.map((b) => b.testId),
  'copy-format',
];

describe('органы расположения ушли с полосы свойств за дверь «Ещё…» (Сессия 48)', () => {
  // Положительный контроль прибора, общий для обоих тестов файла: если
  // organs.ts вдруг отдал не 13 органов, сверяться дальше не с чем —
  // «ничего лишнего» и «ничего не потеряно» одинаково ничего не значили бы.
  it('organs.ts отдаёт ровно 13 органов — есть с чем сверяться', () => {
    expect(ORGAN_TEST_IDS.length).toBe(13);
    expect(new Set(ORGAN_TEST_IDS).size, 'в списке органов есть повторы testid').toBe(13);
  });

  /**
   * Что должно сломаться, чтобы покраснел: вернуть на полосу хотя бы одну
   * из 13 кнопок (например, снова инлайновым `<button data-testid="align-left">`
   * или через новый импорт `stage/organs.js`).
   */
  it('PropBar.tsx не содержит ни одного органа расположения', () => {
    const text = readFileSync(join(SRC, 'stage/PropBar.tsx'), 'utf8');

    // Положительный контроль: файл на месте, и то, что на полосе ДОЛЖНО
    // остаться, там есть — иначе «органов нет» означало бы «пусто», а не
    // «почищено верно».
    expect(text, 'полоса лишилась полей стиля — это не входило в задачу').toContain('ed-propbar-field');
    expect(text, 'дверь «Ещё…» пропала — она обязана остаться').toContain('propbar-more');

    const guiltyIds = ORGAN_TEST_IDS.filter((id) => text.includes(id));
    expect(guiltyIds, `на полосе остались testid органов: ${guiltyIds.join(', ')}`).toEqual([]);

    expect(text, 'PropBar.tsx снова импортирует stage/organs.js').not.toMatch(/organs\.js/);
    for (const symbol of ['ALIGN_BUTTONS', 'DISTRIBUTE_BUTTONS', 'LAYER_BUTTONS', 'COPY_FORMAT_SHAPES']) {
      expect(text, `PropBar.tsx снова упоминает ${symbol}`).not.toContain(symbol);
    }
  });

  /**
   * `data-testid` кнопок в Inspector.tsx — не литералы (кнопки рисуются
   * перебором массивов из organs.ts), поэтому текстовый поиск бьёт не по
   * самим id, а по факту, что КАЖДАЯ из четырёх групп РЕНДЕРИТСЯ
   * (`.map(` — не просто импортирована) плюс отдельно по литералу
   * `copy-format`, единственной кнопке без своего массива.
   *
   * Что должно сломаться, чтобы покраснел: удалить одну из групп кнопок
   * из разметки Inspector.tsx (перенос стал потерей), оставив хоть импорт
   * нетронутым — именно поэтому проверяется `.map(`, а не голое имя
   * символа: голое имя осталось бы в строке импорта и при вырезанном JSX.
   */
  it('все 13 органов рендерятся в Inspector.tsx — перенесены, а не потеряны', () => {
    const text = readFileSync(join(SRC, 'panels/Inspector.tsx'), 'utf8');

    expect(text, 'Inspector.tsx не берёт органы из stage/organs.js').toContain("from '../stage/organs.js'");

    expect(text, 'ALIGN_BUTTONS не рендерится (нет .map)').toMatch(/ALIGN_BUTTONS\s*\.map\(/);
    expect(text, 'DISTRIBUTE_BUTTONS не рендерится (нет .map)').toMatch(/DISTRIBUTE_BUTTONS\s*\.map\(/);
    expect(text, 'LAYER_BUTTONS не рендерится (нет .map)').toMatch(/LAYER_BUTTONS\s*\.map\(/);
    expect(text, 'COPY_FORMAT_SHAPES нигде не поставлена в разметку').toMatch(/shapes=\{COPY_FORMAT_SHAPES\}/);
    expect(text, 'testid copy-format пропал из Inspector.tsx').toContain('copy-format');
  });
});
