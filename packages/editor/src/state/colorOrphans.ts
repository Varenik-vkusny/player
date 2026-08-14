/**
 * Сироты цвета: ссылки на роль темы, которые не разрешатся у зрителя.
 *
 * Почему это вообще нужен отдельный счёт, а не «упадёт и увидим». Измерено
 * дважды и оба раза страшнее, чем ожидалось:
 *
 *   S11 — браузер отбрасывает `var(--неизвестная)` МОЛЧА: ни ошибки,
 *   ни предупреждения в консоли;
 *   S14 — отбрасывает не так, как думали: объявление ВЫИГРЫВАЕТ каскад
 *   и вычисляется в «унаследованное». Базовое оформление сцены элемент
 *   не спасает — он чернеет насквозь (`rgb(0,0,0)` при базовом
 *   `rgb(10,10,10)`).
 *
 * Для стилей это опаснее, чем для одного элемента: стиль, принесённый
 * из чужого проекта, сошлётся на роль, которой здесь нет, и почернеет
 * не один элемент, а все, кто под этим стилем.
 *
 * **Плеер про это не скажет никогда — ему нечем.** Предупреждать обязан
 * редактор, и счётчик у него ОДИН на все виды сирот (`design/styles.md` §4):
 * второй счётчик на ту же болезнь — ошибка, уже названная в проекте.
 */
import { ThemeSchema } from '@player/core';
import type { Slide, Style } from '@player/core';

/**
 * Любая ссылка на переменную, а не только правильная.
 *
 * Отличается от `TOKEN_REF` в `style.ts` намеренно и не дублирует его:
 * тот отвечает на вопрос «это корректная ссылка на роль, которую можно
 * показать виджетом», и на всё остальное честно говорит «нет». Здесь
 * вопрос обратный — «что здесь СЛОМАНО», — и он требует поймать ровно
 * те случаи, которые тот отвергает.
 */
const ANY_VAR = /var\(\s*(--[^\s,()]+)\s*(,)?/g;

/** Почему ссылка не разрешится. */
export type OrphanReason =
  /** Роли с таким именем в теме нет. Объявление вычислится в «унаследованное». */
  | 'unknown-role'
  /** Роль есть, но запасного значения нет — при переносе в другой проект почернеет. */
  | 'no-fallback';

export interface ColorOrphan {
  readonly role: string;
  readonly reason: OrphanReason;
  /** Свойство, в котором стоит ссылка: `color`, `background`, … */
  readonly key: string;
  /** Где именно: в стиле проекта или у элемента на слайде. */
  readonly where:
    | { readonly kind: 'style'; readonly styleId: string }
    | {
        readonly kind: 'element';
        readonly slideId: string;
        readonly elementId: string;
      };
}

function scanValue(raw: string | number): { role: string; reason: OrphanReason }[] {
  if (typeof raw !== 'string') return [];

  const found: { role: string; reason: OrphanReason }[] = [];
  // Регулярка с `g` несёт состояние между вызовами — сбрасываем явно.
  ANY_VAR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANY_VAR.exec(raw)) !== null) {
    const role = match[1]!;
    const hasFallback = match[2] !== undefined;
    const known = Object.prototype.hasOwnProperty.call(ThemeSchema.shape, role);

    if (!known) found.push({ role, reason: 'unknown-role' });
    else if (!hasFallback) found.push({ role, reason: 'no-fallback' });
  }
  return found;
}

/**
 * Все сироты цвета — и в стилях проекта, и у элементов на слайдах.
 *
 * Принимает стили и слайды, а НЕ проект целиком, и это не вкусовщина:
 * `project.segments` читаются ровно в одном месте (`segmentOf`), и охраняет
 * это тест инвариантов. Он и поймал первую редакцию этой функции.
 *
 * Слайды — текущего сегмента, как и у счётчика сирот-меток рядом: автор
 * смотрит на дорожку одного сегмента, и число обязано означать то же, что
 * и соседнее.
 *
 * Стили проверяются ПЕРВЫМИ и это не порядок ради порядка: одна сирота
 * в стиле красит в чёрный столько элементов, сколько под ним ходит,
 * поэтому автору полезнее увидеть её раньше.
 */
export function colorOrphans(
  styles: readonly Style[],
  slides: readonly Slide[],
): readonly ColorOrphan[] {
  const orphans: ColorOrphan[] = [];

  for (const style of styles) {
    for (const [key, value] of Object.entries(style.props)) {
      for (const { role, reason } of scanValue(value)) {
        orphans.push({ role, reason, key, where: { kind: 'style', styleId: style.id } });
      }
    }
  }

  for (const slide of slides) {
    for (const [elementId, state] of Object.entries(slide.states)) {
      if (state === undefined) continue;
      for (const [key, value] of Object.entries(state.style)) {
        for (const { role, reason } of scanValue(value)) {
          orphans.push({ role, reason, key, where: { kind: 'element', slideId: slide.id, elementId } });
        }
      }
    }
  }

  return orphans;
}
