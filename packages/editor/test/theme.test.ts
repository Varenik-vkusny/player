import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Element, ElementState, Project } from '@player/core';

import { THEME_FIELDS, THEME_ROLES } from '../src/theme.js';
import { STYLE_FIELDS } from '../src/state/style.js';
import { editorReducer, initialState } from '../src/state/project.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';

/**
 * `docs/design/theme-panel.md` §6 — таблица «чем это охраняется». Каждая
 * проверка ниже отвечает ровно одной строке таблицы.
 */

function element(id: string): Element {
  return { id, type: 'shape', content: '', locked: false };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {}, ...overrides };
}

function baseProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 'seg-1',
    styles: [],
    segments: [
      {
        id: 'seg-1',
        title: '',
        description: '',
        audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
        elements: [element('title')],
        slides: [
          {
            id: 'slide-1',
            at: { kind: 'seconds', t: 0 },
            transition: 'morph',
            transitionSeconds: 0.6,
            states: { title: elementState() },
          },
        ],
        gates: [],
        exit: { rules: [], default: null },
      },
    ],
  };
}

describe('THEME_FIELDS/THEME_ROLES — состав против ThemeSchema.shape', () => {
  it('ключи THEME_FIELDS совпадают с ключами ThemeSchema.shape в обе стороны', () => {
    const schemaKeys = new Set(Object.keys(ThemeSchema.shape));
    const fieldKeys = new Set(Object.keys(THEME_FIELDS));

    const missingInFields = [...schemaKeys].filter((key) => !fieldKeys.has(key));
    const extraInFields = [...fieldKeys].filter((key) => !schemaKeys.has(key));

    expect(missingInFields, `роли схемы без подписи: ${missingInFields.join(', ')}`).toEqual([]);
    expect(extraInFields, `подписи без роли в схеме: ${extraInFields.join(', ')}`).toEqual([]);
  });

  it('THEME_ROLES — ровно Object.keys(ThemeSchema.shape), прогоном, а не переписаны руками', () => {
    expect(THEME_ROLES).toEqual(Object.keys(ThemeSchema.shape));
  });

  it('десять ролей — семь цветов и три строки, как в §2 спецификации', () => {
    const kinds = THEME_ROLES.map((role) => THEME_FIELDS[role].kind);
    expect(kinds.filter((k) => k === 'color')).toHaveLength(7);
    expect(kinds.filter((k) => k === 'text')).toHaveLength(3);
  });
});

describe('editorReducer: setThemeRole', () => {
  it('меняет ровно роль в meta.theme и не трогает сегменты (ссылка на segments сохраняется)', () => {
    const state = initialState(baseProject());
    const segmentsBefore = state.project.segments;

    const next = editorReducer(state, { type: 'setThemeRole', role: '--scene-accent', value: '#ff0000' });

    expect(next.project.meta.theme['--scene-accent']).toBe('#ff0000');
    // Остальные роли не задеты.
    expect(next.project.meta.theme['--scene-bg']).toBe(state.project.meta.theme['--scene-bg']);
    // segments — тот же массив по ссылке: правка НЕ ушла в сегмент.
    expect(next.project.segments).toBe(segmentsBefore);
  });

  it('значение не изменилось — возвращает тот же state по ссылке', () => {
    const state = initialState(baseProject());
    const current = state.project.meta.theme['--scene-accent'];

    const next = editorReducer(state, { type: 'setThemeRole', role: '--scene-accent', value: current });

    expect(next).toBe(state);
  });

  it('роль, которой нет в схеме, бросает', () => {
    const state = initialState(baseProject());
    expect(() =>
      editorReducer(state, { type: 'setThemeRole', role: '--scene-ghost', value: '#000000' }),
    ).toThrow(/--scene-ghost/);
  });
});

describe('historyReducer: setThemeRole — живое событие (isLiveEvent)', () => {
  it('серия commit:false + commit даёт РОВНО один шаг истории', () => {
    const state = initialHistoryState(baseProject());
    const before = state.history.present;

    let s = historyReducer(state, {
      type: 'setThemeRole',
      role: '--scene-accent',
      value: '#111111',
      commit: false,
    });
    expect(s.gestureOpen).toBe(true);
    expect(s.history.past).toEqual([before]);

    s = historyReducer(s, {
      type: 'setThemeRole',
      role: '--scene-accent',
      value: '#222222',
      commit: false,
    });
    // Второе живое событие НЕ создаёт второй шаг — past не растёт.
    expect(s.history.past).toEqual([before]);
    expect(s.gestureOpen).toBe(true);

    s = historyReducer(s, { type: 'commit' });
    expect(s.gestureOpen).toBe(false);
    expect(s.history.present.meta.theme['--scene-accent']).toBe('#222222');
    expect(s.history.past).toEqual([before]);

    const undone = historyReducer(s, { type: 'undo' });
    expect(undone.history.present).toBe(before);
  });

  /**
   * Подписи ролей темы не совпадают с подписями полей стиля элемента.
   *
   * Панель темы стоит ШЕСТЫМ блоком в правой панели, то есть видна
   * одновременно со свойствами выделенного элемента. Первая сборка дала два
   * поля «Фон» и два поля «Скругление» на одном экране: одно про сцену,
   * другое про элемент. Автор их различить не может — подпись и есть всё,
   * что у него есть.
   *
   * Нашлось не рассуждением и не глазами, а тремя упавшими e2e из
   * `style.spec.ts`: `getByLabel('Фон', { exact: true })` стал находить два
   * узла. Playwright в строгом режиме поймал ровно ту неоднозначность,
   * которая мешает человеку, — но поймал ПОБОЧНО, тестом про другое.
   * Здесь она ловится прямо.
   *
   * Красным станет от любой правки, вернувшей совпадение: переименования
   * роли темы, переименования поля стиля, добавления новой роли с занятым
   * словом.
   */
  it('подписи ролей темы не совпадают с подписями полей стиля элемента', () => {
    const styleLabels = new Set(STYLE_FIELDS.map((field) => field.label));
    const collisions = THEME_ROLES
      .map((role) => THEME_FIELDS[role].label)
      .filter((label) => styleLabels.has(label));

    expect(collisions, `подписи, занятые полями стиля: ${collisions.join(', ')}`).toEqual([]);
  });
});
