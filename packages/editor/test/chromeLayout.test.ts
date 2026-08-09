import { describe, expect, it, vi } from 'vitest';

import {
  CATALOG_WIDTH_MAX,
  CATALOG_WIDTH_MIN,
  DEFAULT_CHROME_LAYOUT,
  parseChromeLayout,
  serializeChromeLayout,
  SIDE_WIDTH_MAX,
  SIDE_WIDTH_MIN,
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
      sideCollapsed: false,
      sideWidth: 260,
    };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('число ниже минимума — тоже умолчания', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { catalogCollapsed: false, catalogWidth: 10, sideCollapsed: false, sideWidth: 260 };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    warn.mockRestore();
  });

  it('отсутствующее поле — умолчания и предупреждение', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { catalogCollapsed: false, catalogWidth: 300, sideCollapsed: false };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('булево поле не булево — умолчания', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { catalogCollapsed: 'да', catalogWidth: 300, sideCollapsed: false, sideWidth: 260 };
    expect(parseChromeLayout(JSON.stringify(broken))).toEqual(DEFAULT_CHROME_LAYOUT);
    warn.mockRestore();
  });

  it('правильное значение — читается как есть, без предупреждения', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good: ChromeLayout = {
      catalogCollapsed: true,
      catalogWidth: CATALOG_WIDTH_MIN,
      sideCollapsed: false,
      sideWidth: SIDE_WIDTH_MAX,
    };
    expect(parseChromeLayout(JSON.stringify(good))).toEqual(good);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('границы пределов включительно — не откат на умолчания', () => {
    const good: ChromeLayout = {
      catalogCollapsed: false,
      catalogWidth: CATALOG_WIDTH_MAX,
      sideCollapsed: true,
      sideWidth: SIDE_WIDTH_MIN,
    };
    expect(parseChromeLayout(JSON.stringify(good))).toEqual(good);
  });
});

describe('serializeChromeLayout ↔ parseChromeLayout: обходит без потерь', () => {
  it('сериализованное значение читается обратно тем же', () => {
    const layout: ChromeLayout = {
      catalogCollapsed: true,
      catalogWidth: 420,
      sideCollapsed: true,
      sideWidth: 300,
    };
    expect(parseChromeLayout(serializeChromeLayout(layout))).toEqual(layout);
  });
});
