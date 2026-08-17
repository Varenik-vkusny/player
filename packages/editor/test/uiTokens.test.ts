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

/**
 * Без комментариев CSS. Нужно охране кеглей: в styles.ts живёт historical
 * пояснение, дословно содержащее «3.4em при font-size:12px даёт 40.8px» —
 * это ОБЪЯСНЕНИЕ, а не объявление, и охрана, считающая его нарушением,
 * не могла бы позеленеть иначе как правкой самого пояснения.
 */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Всё, что вне блока ролей и вне комментариев. */
function styleBody(): string {
  return withoutComments(EDITOR_STYLES.replace(rolesBlockFull(), ''));
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

  // Кегли. Тот же закон, что у цветов: разнобой не виден ни в одном тесте
  // и копится молча. Замер 17.08.2026: 65 объявлений кегля на восьми разных
  // значениях (12, 11, 10, 13, 14, 15, 18 и 10.5 px).
  it('вне блока ролей нет сырых font-size', () => {
    const raw = [...styleBody().matchAll(/font-size:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((value) => !value.startsWith('var('));
    expect(raw, `сырые кегли: ${raw.join(', ')}`).toEqual([]);
  });

  /**
   * Дыра, которой не было в задании: сокращение `font:` задаёт кегль тоже,
   * и охрана выше его НЕ ВИДИТ. Самый крупный кегль редактора жил именно
   * так — `font: 14px/1.5 system-ui, sans-serif` на .ed-root задавал базу
   * для всего хрома, и проверка «сырых font-size нет» была бы зелёной при
   * живом сыром кегле в самом важном месте файла.
   *
   * `font: inherit` разрешён и нужен: им 26 правил передают базу полям
   * ввода и кнопкам, которые иначе взяли бы шрифт операционной системы.
   * Размера он не несёт, поэтому и не нарушает.
   */
  it('кегль не прячется в сокращении font:', () => {
    const raw = [...styleBody().matchAll(/(?<![-a-z])font:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((value) => value !== 'inherit');
    expect(raw, `кегль в сокращении font: ${raw.join(', ')}`).toEqual([]);
  });

  // 50% исключено намеренно: это КРУГ, а не скругление. Долг Сессии 15
  // помнит, как «очевидно пиксельное» поле border-radius роняло панель
  // на эталонной фикстуре, где круг задан через 50%.
  // Замер 17.08.2026: 51 объявление на восьми значениях (6, 4, 2, 3, 8,
  // 5, 1 px и 50%), а не 22 на семи, как значилось в плане.
  it('вне блока ролей нет сырых border-radius, кроме 50%', () => {
    const raw = [...styleBody().matchAll(/border-radius:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((value) => !value.startsWith('var(') && value !== '50%');
    expect(raw, `сырые скругления: ${raw.join(', ')}`).toEqual([]);
  });

  it('каждая объявленная роль хотя бы раз использована', () => {
    const declared = declaredRoles();
    const mentioned = mentionedRoles();
    const dead = [...declared].filter((name) => !mentioned.has(name));
    expect(dead, `неиспользуемые роли: ${dead.join(', ')}`).toEqual([]);
  });
});
