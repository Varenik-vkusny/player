import { describe, expect, it } from 'vitest';

import { keyToIntent, type KeyContext, type KeyIntent } from '../src/keyboard.js';

/** Модификаторы события клавиатуры — короче, чем перечислять все пять полей на каждый вызов. */
type Mods = Partial<{ shift: boolean; ctrl: boolean; meta: boolean; alt: boolean }>;

function press(key: string, mods: Mods = {}) {
  return {
    key,
    shiftKey: mods.shift ?? false,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
  };
}

/*
 * `hasClipboard: true` у контекстов правки текста — НЕ случайность.
 * Так тест доказывает, что Ctrl+V там молчит из-за каретки в тексте,
 * а не из-за пустого буфера: при `false` он был бы зелёным по неверной
 * причине и остался бы зелёным, даже если убрать проверку контекста.
 *
 * `canGroup` и `canUngroup` (Сессия 35) стоят в `true` ВЕЗДЕ по тому же
 * правилу: молчание Ctrl+G при правке текста обязано доказывать проверку
 * каретки, а не отсутствие того, что группировать.
 */
const NORMAL: KeyContext = { hasSelection: true, editingText: false, inTextField: false, hasClipboard: true, canGroup: true, canUngroup: true };
const NO_SELECTION: KeyContext = { hasSelection: false, editingText: false, inTextField: false, hasClipboard: true, canGroup: true, canUngroup: true };
const EMPTY_CLIPBOARD: KeyContext = { hasSelection: true, editingText: false, inTextField: false, hasClipboard: false, canGroup: true, canUngroup: true };
const EDITING_TEXT: KeyContext = { hasSelection: true, editingText: true, inTextField: false, hasClipboard: true, canGroup: true, canUngroup: true };
const NO_SELECTION_EDITING_TEXT: KeyContext = { hasSelection: false, editingText: true, inTextField: false, hasClipboard: true, canGroup: true, canUngroup: true };
const IN_TEXT_FIELD: KeyContext = { hasSelection: true, editingText: false, inTextField: true, hasClipboard: true, canGroup: true, canUngroup: true };

/** Выделен один элемент: связывать нечего, разбирать нечего. */
const NOTHING_TO_GROUP: KeyContext = { ...NORMAL, canGroup: false, canUngroup: false };

describe('обычный режим, есть выделение: вся раскладка работает', () => {
  const cases: Array<[string, Mods, KeyIntent]> = [
    ['Delete', {}, { kind: 'delete' }],
    ['Backspace', {}, { kind: 'delete' }],
    ['ArrowLeft', {}, { kind: 'nudge', dx: -1, dy: 0 }],
    ['ArrowRight', {}, { kind: 'nudge', dx: 1, dy: 0 }],
    ['ArrowUp', {}, { kind: 'nudge', dx: 0, dy: -1 }],
    ['ArrowDown', {}, { kind: 'nudge', dx: 0, dy: 1 }],
    ['ArrowLeft', { shift: true }, { kind: 'nudge', dx: -10, dy: 0 }],
    ['ArrowRight', { shift: true }, { kind: 'nudge', dx: 10, dy: 0 }],
    ['ArrowUp', { shift: true }, { kind: 'nudge', dx: 0, dy: -10 }],
    ['ArrowDown', { shift: true }, { kind: 'nudge', dx: 0, dy: 10 }],
    ['z', { ctrl: true }, { kind: 'undo' }],
    ['z', { meta: true }, { kind: 'undo' }],
    ['z', { ctrl: true, shift: true }, { kind: 'redo' }],
    ['z', { meta: true, shift: true }, { kind: 'redo' }],
    ['y', { ctrl: true }, { kind: 'redo' }],
    ['Escape', {}, { kind: 'deselect' }],
  ];

  it.each(cases)('%s %o → %o', (key, mods, expected) => {
    expect(keyToIntent(press(key, mods), NORMAL)).toEqual(expected);
  });
});

describe('ArrowUp/ArrowDown: вверх — это уменьшение y, координаты сцены растут вниз', () => {
  it('ArrowUp даёт dy: -1, а не +1', () => {
    expect(keyToIntent(press('ArrowUp'), NORMAL)).toEqual({ kind: 'nudge', dx: 0, dy: -1 });
  });

  it('ArrowDown даёт dy: +1', () => {
    expect(keyToIntent(press('ArrowDown'), NORMAL)).toEqual({ kind: 'nudge', dx: 0, dy: 1 });
  });
});

describe('Shift меняет ровно шаг nudge — 1 на 10 — и ничего больше', () => {
  it('Shift+Delete остаётся delete, не превращается в другое намерение', () => {
    expect(keyToIntent(press('Delete', { shift: true }), NORMAL)).toEqual({ kind: 'delete' });
  });

  it('Shift+Escape остаётся deselect', () => {
    expect(keyToIntent(press('Escape', { shift: true }), NORMAL)).toEqual({ kind: 'deselect' });
  });

  it('Shift+Ctrl+Y — не описанное сочетание, undefined (Ctrl+Y задан только без Shift)', () => {
    expect(keyToIntent(press('y', { ctrl: true, shift: true }), NORMAL)).toBeUndefined();
  });

  it('Cmd+Y (без Ctrl) — не redo: спецификация называет только Ctrl+Y, Cmd+Y занят браузером', () => {
    expect(keyToIntent(press('y', { meta: true }), NORMAL)).toBeUndefined();
  });

  it('шаг ровно 1 без Shift и ровно 10 с Shift, ни на одной из осей не 2 и не 5', () => {
    expect(keyToIntent(press('ArrowRight'), NORMAL)).toEqual({ kind: 'nudge', dx: 1, dy: 0 });
    expect(keyToIntent(press('ArrowRight', { shift: true }), NORMAL)).toEqual({
      kind: 'nudge',
      dx: 10,
      dy: 0,
    });
  });
});

describe('без выделения: delete и nudge бессмысленны, отмена и deselect работают всегда', () => {
  const meaninglessWithoutSelection: Array<[string, Mods]> = [
    ['Delete', {}],
    ['Backspace', {}],
    ['ArrowLeft', {}],
    ['ArrowRight', {}],
    ['ArrowUp', {}],
    ['ArrowDown', {}],
    ['ArrowLeft', { shift: true }],
    ['ArrowUp', { shift: true }],
  ];

  it.each(meaninglessWithoutSelection)('%s %o → undefined без выделения', (key, mods) => {
    expect(keyToIntent(press(key, mods), NO_SELECTION)).toBeUndefined();
  });

  it('Ctrl+Z работает без выделения — отмена не про выделение', () => {
    expect(keyToIntent(press('z', { ctrl: true }), NO_SELECTION)).toEqual({ kind: 'undo' });
  });

  it('Cmd+Shift+Z работает без выделения', () => {
    expect(keyToIntent(press('z', { meta: true, shift: true }), NO_SELECTION)).toEqual({ kind: 'redo' });
  });

  it('Ctrl+Y работает без выделения', () => {
    expect(keyToIntent(press('y', { ctrl: true }), NO_SELECTION)).toEqual({ kind: 'redo' });
  });

  it('Escape снимает (не существующее) выделение без ошибки — безопасный no-op для редьюсера', () => {
    expect(keyToIntent(press('Escape'), NO_SELECTION)).toEqual({ kind: 'deselect' });
  });
});

describe('правка текста на холсте (editingText): всё принадлежит вводу, кроме Escape', () => {
  const ownedByEditing: Array<[string, Mods]> = [
    ['Delete', {}],
    ['Backspace', {}],
    ['ArrowLeft', {}],
    ['ArrowRight', {}],
    ['ArrowUp', {}],
    ['ArrowDown', {}],
    ['ArrowLeft', { shift: true }],
    ['z', { ctrl: true }],
    ['z', { meta: true }],
    ['z', { ctrl: true, shift: true }],
    ['z', { meta: true, shift: true }],
    ['y', { ctrl: true }],
  ];

  it.each(ownedByEditing)(
    '%s %o → undefined, отдаём браузеру/contenteditable',
    (key, mods) => {
      expect(keyToIntent(press(key, mods), EDITING_TEXT)).toBeUndefined();
    },
  );

  it('Escape коммитит правку текста, а не снимает выделение', () => {
    expect(keyToIntent(press('Escape'), EDITING_TEXT)).toEqual({ kind: 'commitText' });
  });

  it('commitText по Escape не зависит от hasSelection — режим правки текста главнее', () => {
    expect(keyToIntent(press('Escape'), NO_SELECTION_EDITING_TEXT)).toEqual({ kind: 'commitText' });
  });

  it('без выделения в режиме правки текста Delete всё равно undefined (правило editingText, а не hasSelection)', () => {
    expect(keyToIntent(press('Delete'), NO_SELECTION_EDITING_TEXT)).toBeUndefined();
  });
});

describe('текстовое поле панели свойств (inTextField): ничего не съедается', () => {
  const ownedByField: Array<[string, Mods]> = [
    ['Delete', {}],
    ['Backspace', {}],
    ['ArrowLeft', {}],
    ['ArrowRight', {}],
    ['ArrowUp', {}],
    ['ArrowDown', {}],
    ['ArrowLeft', { shift: true }],
    ['z', { ctrl: true }],
    ['z', { meta: true }],
    ['z', { ctrl: true, shift: true }],
    ['z', { meta: true, shift: true }],
    ['y', { ctrl: true }],
    // Escape — намеренно тоже undefined: у <input> есть нативный откат
    // несохранённого значения по Escape, deselect бы его отобрал.
    ['Escape', {}],
  ];

  it.each(ownedByField)('%s %o → undefined', (key, mods) => {
    expect(keyToIntent(press(key, mods), IN_TEXT_FIELD)).toBeUndefined();
  });
});

describe('Alt — системные сочетания, всегда undefined, даже при выделении в обычном режиме', () => {
  const altCases: Array<[string, Mods]> = [
    ['Delete', { alt: true }],
    ['Backspace', { alt: true }],
    ['ArrowLeft', { alt: true }],
    ['ArrowRight', { alt: true }],
    ['ArrowUp', { alt: true }],
    ['ArrowDown', { alt: true }],
    ['z', { alt: true, ctrl: true }],
    ['z', { alt: true, meta: true, shift: true }],
    ['y', { alt: true, ctrl: true }],
    ['Escape', { alt: true }],
  ];

  it.each(altCases)('%s %o → undefined', (key, mods) => {
    expect(keyToIntent(press(key, mods), NORMAL)).toBeUndefined();
  });

  it('Alt перебивает даже режим правки текста', () => {
    expect(keyToIntent(press('Escape', { alt: true }), EDITING_TEXT)).toBeUndefined();
  });

  it('Alt перебивает даже текстовое поле панели', () => {
    expect(keyToIntent(press('Delete', { alt: true }), IN_TEXT_FIELD)).toBeUndefined();
  });
});

describe('буквы z/y без Ctrl/Cmd — обычный ввод, не наше', () => {
  it('голое z без модификаторов', () => {
    expect(keyToIntent(press('z'), NORMAL)).toBeUndefined();
  });

  it('голое Z с одним только Shift (заглавная буква, не сочетание)', () => {
    expect(keyToIntent(press('Z', { shift: true }), NORMAL)).toBeUndefined();
  });

  it('голое y без модификаторов', () => {
    expect(keyToIntent(press('y'), NORMAL)).toBeUndefined();
  });
});

describe('неизвестные клавиши — undefined во всех контекстах; Tab редактор не имеет права глотать', () => {
  const unknownKeys = ['a', 'F5', 'Tab', 'Enter', '1'];
  const contexts: Array<[string, KeyContext]> = [
    ['обычный режим, есть выделение', NORMAL],
    ['обычный режим, без выделения', NO_SELECTION],
    ['правка текста на холсте', EDITING_TEXT],
    ['текстовое поле панели', IN_TEXT_FIELD],
  ];

  for (const [label, context] of contexts) {
    for (const unknownKey of unknownKeys) {
      it(`${unknownKey} в контексте «${label}» → undefined`, () => {
        expect(keyToIntent(press(unknownKey), context)).toBeUndefined();
      });
    }
  }
});

describe('Ctrl+D — копия выделенного', () => {
  it('с выделением даёт намерение копии', () => {
    // Краснеет, если сочетание не разобрано вовсе: автор жмёт Ctrl+D
    // и получает окно закладок Chrome вместо копии.
    expect(keyToIntent(press('d', { ctrl: true }), NORMAL)).toEqual({ kind: 'duplicate' });
  });

  it('Cmd+D на macOS — то же самое', () => {
    // Краснеет, если проверять только ctrlKey: на маке сочетания нет вовсе.
    expect(keyToIntent(press('d', { meta: true }), NORMAL)).toEqual({ kind: 'duplicate' });
  });

  it('БЕЗ выделения — не наша клавиша', () => {
    // Несущий тест. Краснеет, если вернуть намерение всегда: редьюсер
    // получил бы пустой список ids, а вызывающий погасил бы событие —
    // то есть Ctrl+D переставал бы работать и как закладка, и как копия.
    expect(keyToIntent(press('d', { ctrl: true }), NO_SELECTION)).toBeUndefined();
  });

  it('в текстовом поле панели — не наша клавиша', () => {
    // Краснеет, если проверку inTextField обойти: автор, правящий подпись,
    // на Ctrl+D получил бы копию объекта вместо ожидаемого от поля.
    expect(keyToIntent(press('d', { ctrl: true }), IN_TEXT_FIELD)).toBeUndefined();
  });

  it('при правке текста на холсте — не наша клавиша', () => {
    expect(keyToIntent(press('d', { ctrl: true }), EDITING_TEXT)).toBeUndefined();
  });

  it('одна буква d без модификатора — не наша клавиша', () => {
    // Краснеет, если забыть про модификатор: буква стала бы неотличима
    // от набора, и раскладка украла бы у автора обычный ввод.
    expect(keyToIntent(press('d'), NORMAL)).toBeUndefined();
  });
});

/**
 * Масштаб холста (Сессия 32). Все три сочетания — ЧУЖИЕ по умолчанию:
 * у браузера Ctrl+= и Ctrl+− масштабируют страницу, Ctrl+0 возвращает 100 %.
 * Раскладка обязана отвечать на них намерением, а вызывающий — гасить событие,
 * иначе автор получит два масштаба сразу.
 */
describe('масштаб холста с клавиатуры', () => {
  const cases: Array<[string, Mods, KeyIntent]> = [
    ['=', { ctrl: true }, { kind: 'zoom', to: 'in' }],
    // Клавиша «плюс» на цифровой раскладке отдаёт именно «+», а не «=».
    // Проверяй мы только «=», сочетание не работало бы у части авторов, молча.
    ['+', { ctrl: true }, { kind: 'zoom', to: 'in' }],
    ['-', { ctrl: true }, { kind: 'zoom', to: 'out' }],
    ['0', { ctrl: true }, { kind: 'zoom', to: 'fit' }],
    ['=', { meta: true }, { kind: 'zoom', to: 'in' }],
    ['0', { meta: true }, { kind: 'zoom', to: 'fit' }],
  ];

  it.each(cases)('%s %o → %o', (key, mods, intent) => {
    expect(keyToIntent(press(key, mods), NORMAL)).toEqual(intent);
  });

  it('масштаб не зависит от выделения: это про то, КАК автор смотрит', () => {
    // Краснеет, если масштаб привяжут к выделению по образцу Ctrl+D: автор,
    // ничего не выделивший, потерял бы возможность приблизиться.
    expect(keyToIntent(press('=', { ctrl: true }), NO_SELECTION)).toEqual({
      kind: 'zoom',
      to: 'in',
    });
  });

  it('в текстовом поле и при правке текста на холсте — не наша клавиша', () => {
    expect(keyToIntent(press('=', { ctrl: true }), IN_TEXT_FIELD)).toBeUndefined();
    expect(keyToIntent(press('0', { ctrl: true }), EDITING_TEXT)).toBeUndefined();
  });

  it('без модификатора цифра и знаки остаются обычным набором', () => {
    // Краснеет, если забыть про модификатор: раскладка украла бы у автора
    // ввод нуля и минуса.
    expect(keyToIntent(press('0'), NORMAL)).toBeUndefined();
    expect(keyToIntent(press('-'), NORMAL)).toBeUndefined();
  });

  it('Alt снимает намерение, как и у всех остальных сочетаний', () => {
    expect(keyToIntent(press('=', { ctrl: true, alt: true }), NORMAL)).toBeUndefined();
  });
});

describe('Ctrl+C / Ctrl+X / Ctrl+V — буфер обмена элементов', () => {
  it('Ctrl+C с выделением даёт намерение копии в буфер', () => {
    expect(keyToIntent(press('c', { ctrl: true }), NORMAL)).toEqual({ kind: 'copy' });
  });

  it('Ctrl+X с выделением даёт намерение вырезания', () => {
    expect(keyToIntent(press('x', { ctrl: true }), NORMAL)).toEqual({ kind: 'cut' });
  });

  it('Ctrl+V при непустом буфере даёт намерение вставки', () => {
    expect(keyToIntent(press('v', { ctrl: true }), NORMAL)).toEqual({ kind: 'paste' });
  });

  it('Cmd на macOS — то же самое для всех трёх', () => {
    expect(keyToIntent(press('c', { meta: true }), NORMAL)).toEqual({ kind: 'copy' });
    expect(keyToIntent(press('x', { meta: true }), NORMAL)).toEqual({ kind: 'cut' });
    expect(keyToIntent(press('v', { meta: true }), NORMAL)).toEqual({ kind: 'paste' });
  });

  it('без выделения Ctrl+C и Ctrl+X — НЕ наши', () => {
    /*
     * Слом: вернуть намерение независимо от выделения. Вызывающий гасит
     * событие на любое намерение, и автор, нажавший Ctrl+C ни на чём,
     * потерял бы обычное копирование выделенного текста страницы.
     */
    expect(keyToIntent(press('c', { ctrl: true }), NO_SELECTION)).toBeUndefined();
    expect(keyToIntent(press('x', { ctrl: true }), NO_SELECTION)).toBeUndefined();
  });

  it('при ПУСТОМ буфере Ctrl+V — НЕ наш', () => {
    // Та же физика, только про буфер: вставлять нечего, значит и отбирать
    // у браузера сочетание не за что.
    expect(keyToIntent(press('v', { ctrl: true }), EMPTY_CLIPBOARD)).toBeUndefined();
  });

  it('в текстовом поле панели все три молчат, хотя буфер полон', () => {
    expect(keyToIntent(press('c', { ctrl: true }), IN_TEXT_FIELD)).toBeUndefined();
    expect(keyToIntent(press('x', { ctrl: true }), IN_TEXT_FIELD)).toBeUndefined();
    expect(keyToIntent(press('v', { ctrl: true }), IN_TEXT_FIELD)).toBeUndefined();
  });

  it('при правке текста на холсте все три молчат, хотя буфер полон', () => {
    // Автор правит буквы в элементе: Ctrl+C там копирует БУКВЫ средствами
    // браузера, а не объект сцены. Перехват отобрал бы у него набор текста.
    expect(keyToIntent(press('c', { ctrl: true }), EDITING_TEXT)).toBeUndefined();
    expect(keyToIntent(press('x', { ctrl: true }), EDITING_TEXT)).toBeUndefined();
    expect(keyToIntent(press('v', { ctrl: true }), EDITING_TEXT)).toBeUndefined();
  });

  it('Ctrl+Shift+C — НЕ наше: это выбор элемента в инструментах разработчика', () => {
    expect(keyToIntent(press('c', { ctrl: true, shift: true }), NORMAL)).toBeUndefined();
    expect(keyToIntent(press('v', { ctrl: true, shift: true }), NORMAL)).toBeUndefined();
  });

  it('с Alt — не наше, как и всё остальное', () => {
    expect(keyToIntent(press('c', { ctrl: true, alt: true }), NORMAL)).toBeUndefined();
  });

  it('голые c/x/v без модификаторов — не наши', () => {
    expect(keyToIntent(press('c'), NORMAL)).toBeUndefined();
    expect(keyToIntent(press('x'), NORMAL)).toBeUndefined();
    expect(keyToIntent(press('v'), NORMAL)).toBeUndefined();
  });
});

/**
 * Ctrl+G и Ctrl+Shift+G — группировка (Сессия 35).
 *
 * Оба сочетания ЧУЖИЕ: у Chrome это «найти далее» и «найти назад». Значит
 * молчание таблицы там, где группировать нечего, — не мелочь: оно возвращает
 * автору поиск браузера вместо действия, которого он не просил.
 */
describe('Ctrl+G — сборка и разборка группы', () => {
  it('Ctrl+G собирает, когда есть что связывать', () => {
    expect(keyToIntent(press('g', { ctrl: true }), NORMAL)).toEqual({ kind: 'group' });
    expect(keyToIntent(press('g', { meta: true }), NORMAL)).toEqual({ kind: 'group' });
  });

  it('Ctrl+Shift+G разбирает, когда среди выделенного есть группа', () => {
    expect(keyToIntent(press('g', { ctrl: true, shift: true }), NORMAL)).toEqual({ kind: 'ungroup' });
    expect(keyToIntent(press('g', { meta: true, shift: true }), NORMAL)).toEqual({ kind: 'ungroup' });
  });

  /**
   * Асимметрия проверок: Shift решает, какое из двух намерений спрашивают,
   * и спрашивают РАЗНОЕ. Один выделенный элемент собрать нельзя, но он же
   * может быть группой — и тогда разобрать его можно.
   */
  it('нечего связывать — Ctrl+G не наш, сочетание остаётся браузеру', () => {
    expect(keyToIntent(press('g', { ctrl: true }), NOTHING_TO_GROUP)).toBeUndefined();
  });

  it('группы среди выделенного нет — Ctrl+Shift+G не наш', () => {
    expect(keyToIntent(press('g', { ctrl: true, shift: true }), NOTHING_TO_GROUP)).toBeUndefined();
  });

  it('выделена одна группа: собрать нельзя, разобрать можно', () => {
    const soleGroup: KeyContext = { ...NORMAL, canGroup: false, canUngroup: true };
    expect(keyToIntent(press('g', { ctrl: true }), soleGroup)).toBeUndefined();
    expect(keyToIntent(press('g', { ctrl: true, shift: true }), soleGroup)).toEqual({ kind: 'ungroup' });
  });

  it('при правке текста на холсте молчат оба — и это из-за каретки', () => {
    // Оба флага в EDITING_TEXT стоят в `true`, поэтому молчание доказывает
    // именно проверку контекста правки, а не отсутствие того, что группировать.
    expect(keyToIntent(press('g', { ctrl: true }), EDITING_TEXT)).toBeUndefined();
    expect(keyToIntent(press('g', { ctrl: true, shift: true }), EDITING_TEXT)).toBeUndefined();
  });

  it('в текстовом поле панели молчат оба', () => {
    expect(keyToIntent(press('g', { ctrl: true }), IN_TEXT_FIELD)).toBeUndefined();
    expect(keyToIntent(press('g', { ctrl: true, shift: true }), IN_TEXT_FIELD)).toBeUndefined();
  });

  it('голая g без модификаторов — обычный ввод, не наше', () => {
    expect(keyToIntent(press('g'), NORMAL)).toBeUndefined();
  });

  it('с Alt — системное сочетание, не наше', () => {
    expect(keyToIntent(press('g', { ctrl: true, alt: true }), NORMAL)).toBeUndefined();
  });
});
