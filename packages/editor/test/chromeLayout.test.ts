import { describe, expect, it, vi } from 'vitest';

import {
  CATALOG_WIDTH_MAX,
  CATALOG_WIDTH_MIN,
  DEFAULT_CHROME_LAYOUT,
  parseChromeLayout,
  serializeChromeLayout,
  type ChromeLayout,
} from '../src/chrome/layoutStore.js';

describe('parseChromeLayout: чтение сохранённого состояния хрома', () => {
  it('ключ ещё не писали (null) — умолчания, без предупреждения', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseChromeLayout(null)).toEqual(DEFAULT_CHROME_LAYOUT);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('испорченный JSON — умолчания и console.warn с именем ключа', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseChromeLayout('{ не json')).toEqual(DEFAULT_CHROME_LAYOUT);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('player.editor.chrome');
    warn.mockRestore();
  });

  it('число вне пределов — умолчания и предупреждение', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: ChromeLayout = {
      catalogCollapsed: false,
      catalogWidth: CATALOG_WIDTH_MAX + 1000,
    };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('число ниже минимума — тоже умолчания', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { catalogCollapsed: false, catalogWidth: 10 };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    warn.mockRestore();
  });

  it('отсутствующее поле — умолчания и предупреждение', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { catalogCollapsed: false };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('булево поле не булево — умолчания', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { catalogCollapsed: 'да', catalogWidth: 300 };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    warn.mockRestore();
  });

  it('правильное значение — читается как есть, без предупреждения', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good: ChromeLayout = {
      catalogCollapsed: true,
      catalogWidth: CATALOG_WIDTH_MIN,
    };
    expect(parseChromeLayout(JSON.stringify(good))).toEqual(good);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('границы пределов включительно — не откат на умолчания', () => {
    const good: ChromeLayout = {
      catalogCollapsed: false,
      catalogWidth: CATALOG_WIDTH_MAX,
    };
    expect(parseChromeLayout(JSON.stringify(good))).toEqual(good);
  });

  /**
   * СОВМЕСТИМОСТЬ С ЗАПИСЬЮ ПРОШЛОЙ ВЕРСИИ. В Сессии 55 из раскладки ушли
   * два поля правой колонки — `sideCollapsed` и `sideWidth`, — потому что
   * ушла сама колонка. У всякого, кто открывал редактор до обновления,
   * в `localStorage` лежит запись С НИМИ.
   *
   * Что здесь охраняется: такая запись читается молча и своей шириной
   * каталога, а не откатом на умолчание с предупреждением в консоли. Цена
   * ошибки — не поломка, а тихая пропажа настройки: автор, растянувший
   * каталог, нашёл бы его прежним и решил, что настройка не сохраняется.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: проверка стала запрещать
   * лишние поля (например, сверкой списка ключей), либо разбор начал
   * возвращать разобранный объект целиком — тогда мёртвые поля просочились
   * бы обратно в состояние и уехали в следующую запись. Проверено сломом
   * в обе стороны.
   */
  it('запись прошлой версии читается, а поля удалённой колонки в состояние не попадают', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const oldRecord = {
      catalogCollapsed: false,
      catalogWidth: 420,
      sideCollapsed: true,
      sideWidth: 300,
    };

    const read = parseChromeLayout(JSON.stringify(oldRecord));

    expect(read, 'запись прошлой версии откатилась на умолчания').toEqual({
      catalogCollapsed: false,
      catalogWidth: 420,
    });
    expect(warn, 'законная запись прошлой версии пожаловалась в консоль').not.toHaveBeenCalled();
    expect(Object.keys(read).sort()).toEqual(['catalogCollapsed', 'catalogWidth']);

    warn.mockRestore();
  });
});

describe('serializeChromeLayout ↔ parseChromeLayout: обходит без потерь', () => {
  it('сериализованное значение читается обратно тем же', () => {
    const layout: ChromeLayout = {
      catalogCollapsed: true,
      catalogWidth: 420,
    };
    expect(parseChromeLayout(serializeChromeLayout(layout))).toEqual(layout);
  });
});
