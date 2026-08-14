/**
 * Связь элемента со стилем.
 *
 * У каждого теста ниже спрошено ДВА вопроса, а не один: что должно
 * сломаться, чтобы он покраснел, — и верно ли утверждение при ЛЮБОЙ
 * реализации предмета. Второй отсекает проверки, пустые по построению.
 */
import type { ElementState, Style } from '@player/core';
import { describe, expect, it } from 'vitest';

import { bakeStyle, detachedKeys, isDetached, revertToStyle, styleUsage } from '../src/state/styleLink.js';

const heading: Style = {
  id: 'heading',
  name: 'Главный',
  type: 'text',
  props: { 'font-size': '96px', color: 'rgb(1, 2, 3)', 'font-family': 'system-ui' },
};

const state = (style: Record<string, string | number>, styleId?: string): ElementState => ({
  x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 0,
  opacity: 1, visible: true, flipX: false, flipY: false,
  style, ...(styleId === undefined ? {} : { styleId }),
});

describe('чем элемент отличается от стиля', () => {
  it('отличием считается НАЛИЧИЕ ключа, а не неравенство значений', () => {
    // Несущий тест всего механизма. Значение совпадает со стилем ДО ЗНАКА,
    // и всё равно это отличие: автор выставил его руками, значит следующая
    // правка стиля обязана обойти элемент стороной, а панель — предложить
    // «вернуть как в стиле».
    //
    // Слом: сделать признак сравнением значений — тест краснеет здесь.
    const same = state({ 'font-size': '96px' }, 'heading');

    expect(detachedKeys(same, heading)).toEqual(['font-size']);
    expect(isDetached(same, heading, 'font-size')).toBe(true);
  });

  it('ключ, которого в стиле нет, отличием НЕ считается', () => {
    // Стиль про него ничего не говорит — возвращать было бы некуда.
    const own = state({ 'letter-spacing': '2px' }, 'heading');

    expect(detachedKeys(own, heading)).toEqual([]);
    expect(isDetached(own, heading, 'letter-spacing')).toBe(false);
  });

  it('без стиля отличаться не от чего', () => {
    expect(detachedKeys(state({ color: 'red' }), undefined)).toEqual([]);
    expect(isDetached(state({ color: 'red' }), undefined, 'color')).toBe(false);
  });

  it('отличие считается ПО СВОЙСТВУ: правка кегля не отцепляет цвет', () => {
    // То, ради чего отцепление вообще не делается «целиком».
    const one = state({ 'font-size': '48px' }, 'heading');

    expect(detachedKeys(one, heading)).toEqual(['font-size']);
    expect(isDetached(one, heading, 'color')).toBe(false);
    expect(isDetached(one, heading, 'font-family')).toBe(false);
  });
});

describe('вернуть как в стиле', () => {
  it('СНИМАЕТ ключ, а не вписывает значение стиля', () => {
    // Вписанное значение — это снова ручная правка, просто совпавшая
    // со стилем сегодня. Слом: заменить удаление на запись `style.props[key]`
    // — тест краснеет, потому что ключ останется на месте.
    const next = revertToStyle({ 'font-size': '48px', color: 'red' }, 'font-size');

    expect(next).toEqual({ color: 'red' });
    expect('font-size' in next).toBe(false);
  });

  it('нечего снимать — тот же объект по ссылке', () => {
    // Иначе родился бы шаг истории без правки: та же дисциплина, что
    // у `setStyleValue`.
    const style = { color: 'red' };
    expect(revertToStyle(style, 'font-size')).toBe(style);
  });
});

describe('удаление стиля не чернит элементы', () => {
  it('впечатывает значения стиля, но собственные ключи сильнее', () => {
    // Решение владельца: элементы остаются ТЕМ ВИДОМ, который у них был
    // в момент удаления. Слом: впечатывать стиль поверх собственных ключей
    // — тест краснеет на кегле, который автор правил руками.
    const baked = bakeStyle({ 'font-size': '48px' }, heading);

    expect(baked).toEqual({
      'font-size': '48px',
      color: 'rgb(1, 2, 3)',
      'font-family': 'system-ui',
    });
  });

  it('элемент без единой ручной правки получает стиль целиком', () => {
    expect(bakeStyle({}, heading)).toEqual(heading.props);
  });
});

describe('сколько затронет удаление', () => {
  const segments = [
    {
      slides: [
        { states: { title: state({}, 'heading'), note: state({}, 'quiet') } },
        { states: { title: state({}, 'heading'), sub: state({}, 'heading') } },
      ],
    },
    { slides: [{ states: { title: state({}) } }] },
  ];

  it('считает и состояния, и разные элементы', () => {
    // Числа РАЗНЫЕ намеренно: заголовок идёт по стилю на двух слайдах,
    // и сказать автору «используют 2 элемента» значило бы соврать про
    // объём правки, а «3 состояния» — сказать правду.
    //
    // Слом: считать элементы вместо состояний — краснеет `states`.
    // Проверка на пустоту: будь оба числа равны, тест не различал бы
    // реализации, поэтому в данных нарочно есть элемент на двух слайдах.
    expect(styleUsage(segments, 'heading')).toEqual({ states: 3, elements: 2 });
  });

  it('неиспользуемый стиль даёт нули', () => {
    expect(styleUsage(segments, 'plate')).toEqual({ states: 0, elements: 0 });
  });
});
