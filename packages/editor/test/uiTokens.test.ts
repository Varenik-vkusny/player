import { describe, expect, it } from 'vitest';

import { EDITOR_STYLES } from '../src/styles.js';

/**
 * Блок ролей — первый `.ed-root { ... }` в EDITOR_STYLES (docs/design/ui-tokens.md
 * §1, §6). Дальше по файлу селектор `.ed-root` открывает раскладку, а не роли,
 * поэтому вырезаем именно ПЕРВЫЙ блок фигурных скобок, а не любой `.ed-root`.
 * Внутри блока нет вложенных `{` (значения — цвета, var() и тени на круглых
 * скобках), поэтому «до первой `}`» — надёжная граница.
 */
function rolesBlockFull(): string {
  const match = EDITOR_STYLES.match(/\.ed-root\s*\{[^}]*\}/);
  if (!match) {
    throw new Error('Блок ролей .ed-root не найден в EDITOR_STYLES');
  }
  return match[0];
}

// `m[1]!` — у обоих выражений ровно одна скобочная группа, поэтому у всякого
// совпадения она есть. Это утверждение о РЕГУЛЯРКЕ, а не подавление ошибки:
// без группы совпадения не было бы вовсе.
function declaredRoles(): Set<string> {
  const block = rolesBlockFull();
  const names = [...block.matchAll(/(--ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
  return new Set(names);
}

function mentionedRoles(): Set<string> {
  const names = [...EDITOR_STYLES.matchAll(/var\((--ui-[a-z0-9-]+)\)/g)].map((m) => m[1]!);
  return new Set(names);
}

describe('роли хрома редактора (--ui-*), docs/design/ui-tokens.md', () => {
  // Главная проверка. S11 измерил: браузер отбрасывает объявление
  // с неизвестной переменной ЦЕЛИКОМ, без ошибки и без предупреждения
  // в консоли — опечатка в имени роли это молча пропавший цвет.
  it('каждое упомянутое var(--ui-X) объявлено в блоке .ed-root', () => {
    const declared = declaredRoles();
    const mentioned = mentionedRoles();
    const unknown = [...mentioned].filter((name) => !declared.has(name));
    expect(unknown, `неизвестные роли: ${unknown.join(', ')}`).toEqual([]);
  });

  it('вне блока ролей нет сырых цветов (#hex, rgb(, rgba()', () => {
    const outside = EDITOR_STYLES.replace(rolesBlockFull(), '');
    const rawColors = outside.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    expect(rawColors, `сырые цвета вне блока: ${rawColors.join(', ')}`).toEqual([]);
  });

  it('каждая объявленная роль хотя бы раз использована', () => {
    const declared = declaredRoles();
    const mentioned = mentionedRoles();
    const dead = [...declared].filter((name) => !mentioned.has(name));
    expect(dead, `неиспользуемые роли: ${dead.join(', ')}`).toEqual([]);
  });
});
