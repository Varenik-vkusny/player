/**
 * Связь элемента со стилем: что отцеплено, что вернуть, что впечатать.
 *
 * Чистые функции без React и без DOM — вид редактора перепишут в отдельной
 * сессии (ADR-010), и пережить переписку обязана эта логика, а не разметка.
 *
 * Ключевое решение, из которого следует всё остальное (ADR-029): признак
 * «свойство отличается от стиля» — это НАЛИЧИЕ КЛЮЧА в собственной карте
 * элемента, а не неравенство значений. Сравнение значений дало бы ложное
 * «совпадает» на свойстве, которое автор выставил руками в то же самое
 * число, — и «вернуть как в стиле» на нём перестало бы предлагаться,
 * а после правки стиля элемент внезапно остался бы на месте. Молча.
 */
import type { ElementState, Style } from '@player/core';

import type { ElementStyle } from './style.js';

/**
 * Свойства, которыми элемент отличается от своего стиля.
 *
 * Пусто, если стиля нет вовсе: отличаться не от чего. Ключи собственной
 * карты, которых в стиле нет, отличием НЕ считаются — стиль про них ничего
 * не говорит, и «вернуть как в стиле» вернуло бы в никуда.
 */
export function detachedKeys(
  state: Pick<ElementState, 'style' | 'styleId'>,
  style: Style | undefined,
): readonly string[] {
  if (style === undefined) return [];
  return Object.keys(state.style).filter((key) => key in style.props);
}

/** Отличается ли именно это свойство. */
export function isDetached(
  state: Pick<ElementState, 'style' | 'styleId'>,
  style: Style | undefined,
  key: string,
): boolean {
  if (style === undefined) return false;
  return key in state.style && key in style.props;
}

/**
 * «Вернуть как в стиле» — СНЯТЬ ключ, а не вписать значение стиля.
 *
 * Разница видна не сразу и стоит дорого: вписанное значение — это снова
 * ручная правка, просто совпавшая со стилем сегодня. Следующая правка стиля
 * обошла бы такой элемент стороной, и автор увидел бы, что «один заголовок
 * не слушается», без единого признака причины. Измерено S14: после снятия
 * ключа элемент встаёт на ТЕКУЩЕЕ значение стиля.
 *
 * Ссылочная целостность как у `setStyleValue`: нечего снимать — тот же
 * объект, чтобы не родить шаг истории без правки.
 */
export function revertToStyle(style: ElementStyle, key: string): ElementStyle {
  if (!(key in style)) return style;
  const next = { ...style };
  delete next[key];
  return next;
}

/**
 * Что станет с картой элемента, если стиль удалить.
 *
 * Решение владельца (`design/styles.md` §3.3): элементы превращаются
 * в обычные значения ТЕМ ВИДОМ, который у них был в момент удаления, —
 * не чернеют и не сбрасываются в умолчание.
 *
 * Собственные ключи сильнее: они и были сильнее до удаления, и менять
 * их удаление стиля не вправе.
 */
export function bakeStyle(style: ElementStyle, source: Style): ElementStyle {
  return { ...source.props, ...style };
}

/**
 * Сколько элементов пойдут под нож вместе со стилем.
 *
 * Считаются СОСТОЯНИЯ, а не элементы: один и тот же элемент может идти
 * по этому стилю на трёх слайдах из пяти, и сказать автору «используют
 * 1 элемент» значило бы соврать про объём правки.
 */
export interface StyleUsage {
  /** Сколько состояний слайдов ссылаются на стиль. */
  readonly states: number;
  /** Сколько РАЗНЫХ элементов среди них. */
  readonly elements: number;
}

export function styleUsage(
  segments: readonly { slides: readonly { states: Record<string, ElementState | undefined> }[] }[],
  styleId: string,
): StyleUsage {
  const elements = new Set<string>();
  let states = 0;

  for (const segment of segments) {
    for (const slide of segment.slides) {
      for (const [elementId, state] of Object.entries(slide.states)) {
        if (state?.styleId !== styleId) continue;
        states += 1;
        elements.add(elementId);
      }
    }
  }

  return { states, elements: elements.size };
}
