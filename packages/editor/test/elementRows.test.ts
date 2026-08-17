import { describe, expect, it } from 'vitest';

import type { Element, ElementState } from '@player/core';

import { toRows } from '../src/panels/elementRows.js';

function element(overrides: Partial<Element> & { id: string }): Element {
  return { type: 'shape', content: '', locked: false, ...overrides };
}

function state(overrides: Partial<ElementState> = {}): ElementState {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 0,
    opacity: 1,
    visible: true,
    flipX: false,
    flipY: false,
    style: {},
    ...overrides,
  };
}

describe('toRows: порядок', () => {
  it('сортирует по убыванию zIndex — верхний слой сверху списка', () => {
    const low = element({ id: 'low' });
    const high = element({ id: 'high' });
    const mid = element({ id: 'mid' });
    const states = { low: state({ zIndex: 0 }), high: state({ zIndex: 5 }), mid: state({ zIndex: 2 }) };

    const rows = toRows([low, high, mid], states);

    expect(rows.map((row) => row.id)).toEqual(['high', 'mid', 'low']);
  });

  it('при равном zIndex порядок стабилен — по id', () => {
    const b = element({ id: 'b' });
    const a = element({ id: 'a' });
    const states = { b: state({ zIndex: 1 }), a: state({ zIndex: 1 }) };

    const rows = toRows([b, a], states);

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('не мутирует входной массив', () => {
    const elements = [element({ id: 'b' }), element({ id: 'a' })];
    const copy = [...elements];
    const states = { b: state({ zIndex: 1 }), a: state({ zIndex: 2 }) };

    toRows(elements, states);

    expect(elements).toEqual(copy);
  });

  it('пустая сцена даёт пустой список', () => {
    expect(toRows([], {})).toEqual([]);
  });

  it('элемент без состояния на этом слайде уходит в конец списка', () => {
    const onSlide = element({ id: 'here' });
    const notOnSlide = element({ id: 'later' });
    const states = { here: state({ zIndex: -100 }) };

    const rows = toRows([notOnSlide, onSlide], states);

    // Даже отрицательный zIndex присутствующего элемента побеждает
    // отсутствующего: отсутствие state не сравнимо с числом.
    expect(rows.map((row) => row.id)).toEqual(['here', 'later']);
    expect(rows.find((row) => row.id === 'here')!.onSlide).toBe(true);
    expect(rows.find((row) => row.id === 'later')!.onSlide).toBe(false);
  });

  it('несколько элементов без состояния упорядочены между собой по id', () => {
    const b = element({ id: 'b' });
    const a = element({ id: 'a' });

    const rows = toRows([b, a], {});

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(rows.every((row) => !row.onSlide)).toBe(true);
  });
});

describe('toRows: короткое содержимое', () => {
  it('текст — сам текст, обрезанный, если длинный', () => {
    const short = element({ id: 't1', type: 'text', content: 'Привет' });
    expect(toRows([short], { t1: state() })[0]!.summary).toBe('Привет');

    const long = element({ id: 't2', type: 'text', content: 'а'.repeat(100) });
    const summary = toRows([long], { t2: state() })[0]!.summary;
    expect(summary.length).toBeLessThan(45);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('пустой текст получает заметную заглушку, а не пустую строку', () => {
    const empty = element({ id: 't3', type: 'text', content: '   ' });
    expect(toRows([empty], { t3: state() })[0]!.summary).toBe('(пустой текст)');
  });

  it('текст схлопывает переносы строк в пробелы', () => {
    const multiline = element({ id: 't4', type: 'text', content: 'Строка1\nСтрока2' });
    expect(toRows([multiline], { t4: state() })[0]!.summary).toBe('Строка1 Строка2');
  });

  it('картинка без content — «ждёт файла»', () => {
    const el = element({ id: 'i1', type: 'image', content: '' });
    expect(toRows([el], { i1: state() })[0]!.summary).toContain('ждёт файла');
  });

  it('картинка с data-URI не показывает содержимое дословно', () => {
    const el = element({
      id: 'i2',
      type: 'image',
      content: 'data:image/png;base64,' + 'A'.repeat(500),
    });
    const summary = toRows([el], { i2: state() })[0]!.summary;
    expect(summary.length).toBeLessThan(50);
    expect(summary).not.toContain('base64');
  });

  it('картинка с путём/URL показывает его', () => {
    const el = element({ id: 'i3', type: 'image', content: '/img/photo.png' });
    expect(toRows([el], { i3: state() })[0]!.summary).toBe('/img/photo.png');
  });

  it('фигура с background в стиле показывает его', () => {
    const el = element({ id: 's1', type: 'shape' });
    const rows = toRows([el], { s1: state({ style: { background: '#1b2430' } }) });
    expect(rows[0]!.summary).toContain('#1b2430');
  });

  it('фигура без background в стиле — просто «фигура»', () => {
    const el = element({ id: 's2', type: 'shape' });
    expect(toRows([el], { s2: state() })[0]!.summary).toBe('фигура');
  });

  it('фигура без состояния на слайде — тоже просто «фигура», без падения', () => {
    const el = element({ id: 's3', type: 'shape' });
    expect(toRows([el], {})[0]!.summary).toBe('фигура');
  });
});

/**
 * Язык таблицы стилей в текст для автора не течёт (Сессия 46, Задача 2).
 *
 * До починки строка собиралась как `фигура, фон ${background}`, где
 * background — СЫРОЕ значение стиля. Автор читал дословно
 * «фигура, фон var(--scene-surface, #1b2430» (ещё и обрезанное шириной
 * колонки). Родня «слайду slide-1»: внутреннее имя выдано за подпись.
 *
 * Правило (docs/design/system.md §2): ссылка на роль темы называется РОЛЬЮ,
 * свой цвет — называется своим. Сырой #RRGGBB автору показывать можно —
 * он его сам и выбрал; var(...) показывать нельзя, это язык таблицы стилей.
 */
describe('toRows: фон фигуры называется по-человечески', () => {
  /**
   * Что должно сломаться, чтобы покраснел: вернуть подстановку сырого
   * значения — в строке немедленно появятся `var(` и `--`.
   *
   * Проверяются ОБА: и что мусора нет, и что на его месте стоит имя роли.
   * Одного «нет var(» мало — ему удовлетворяет и пустая строка, и «фигура».
   */
  it('ссылка на роль темы названа ролью, а не языком CSS', () => {
    const el = element({ id: 'sh', type: 'shape' });
    const rows = toRows([el], {
      sh: state({ style: { background: 'var(--scene-surface, #1b2430)' } }),
    });
    const summary = rows[0]!.summary;

    expect(summary).not.toContain('var(');
    expect(summary).not.toContain('--');
    expect(summary).not.toContain('#');
    // Подпись роли — та же, что в панели темы (THEME_FIELDS), а не своя.
    expect(summary).toContain('Плашка');
  });

  /**
   * Роль БЕЗ запасного значения — всё равно роль: имя её известно, и назвать
   * его автору можно. Хрупкость такой ссылки при переносе в другой проект —
   * забота счётчика сирот (state/colorOrphans.ts), у него на это свой текст,
   * и второй счётчик той же болезни в списке элементов был бы ошибкой,
   * уже названной в проекте.
   */
  it('роль без запасного значения тоже названа ролью', () => {
    const el = element({ id: 'sh', type: 'shape' });
    const rows = toRows([el], { sh: state({ style: { background: 'var(--scene-accent)' } }) });

    expect(rows[0]!.summary).toContain('Акцент');
    expect(rows[0]!.summary).not.toContain('var(');
  });

  /**
   * Сирота: роли с таким именем в теме НЕТ. Имя выдумывать нельзя —
   * `docs/design/system.md` §4 прямо говорит, что редактор единственное
   * место, где о сироте можно узнать. Поэтому строка говорит, что роль
   * неизвестна, и НЕ выдаёт её за существующую.
   *
   * Что должно сломаться, чтобы покраснел: начать подставлять сюда любое
   * имя роли (например, ближайшее по написанию) — проверка «нет слова
   * из словаря ролей» покраснеет.
   */
  it('неизвестная роль названа неизвестной, а имя не выдумывается', () => {
    const el = element({ id: 'sh', type: 'shape' });
    const rows = toRows([el], {
      sh: state({ style: { background: 'var(--scene-nosuch, #123456)' } }),
    });
    const summary = rows[0]!.summary;

    expect(summary).not.toContain('var(');
    expect(summary).not.toContain('--');
    // Ни одна настоящая роль не названа: сирота — это не «Плашка».
    for (const label of ['Плашка', 'Акцент', 'Линия', 'Фон сцены', 'Текст']) {
      expect(summary, `сирота выдана за роль «${label}»`).not.toContain(label);
    }
    expect(summary).toContain('фигура');
  });

  /** Свой цвет остаётся своим: автор его сам выбрал, прятать нечего. */
  it('свой цвет показывается как есть', () => {
    const el = element({ id: 'sh', type: 'shape' });
    const rows = toRows([el], { sh: state({ style: { background: '#1b2430' } }) });
    expect(rows[0]!.summary).toContain('#1b2430');
  });

  /**
   * Длинное значение не раздвигает колонку. Проверка не декоративная:
   * градиент из шести стопов — законное значение background, и до Сессии 46
   * он уезжал в строку целиком.
   */
  it('длинное своё значение обрезается, как и текст', () => {
    const el = element({ id: 'sh', type: 'shape' });
    const long = 'linear-gradient(90deg, #111111 0%, #222222 20%, #333333 40%, #444444 100%)';
    const rows = toRows([el], { sh: state({ style: { background: long } }) });

    expect(rows[0]!.summary.length).toBeLessThan(long.length);
    expect(rows[0]!.summary).toContain('…');
  });
});
