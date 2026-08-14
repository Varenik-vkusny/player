/**
 * Склад наборов стилей — та его часть, которую можно проверить без браузера.
 *
 * Сама работа с IndexedDB проверяется e2e: подделывать хранилище значило бы
 * проверять свою подделку. В этом проекте уже был случай, когда агент
 * сгенерировал WAV и прочитал его собственным читателем — числа сошлись,
 * потому что у писателя и читателя одна и та же возможная ошибка.
 */
import type { Style } from '@player/core';
import { describe, expect, it } from 'vitest';

import { mergeStyleSet, parseStyleSet } from '../src/state/styleStore.js';

const style = (id: string, size: string): Style => ({
  id,
  name: id,
  type: 'text',
  props: { 'font-size': size },
});

describe('чтение склада', () => {
  it('испорченная запись падает громко, а не приезжает в проект', () => {
    // Слом: заменить `parseStyleSet` на `raw as StyleSet` — тест краснеет.
    // Без него набор с невалидным стилем попал бы в проект и уронил бы
    // ЗАГРУЗКУ, то есть далеко от места, где ошибку можно связать с причиной.
    expect(() => parseStyleSet({ id: 's', name: 'Набор', savedAt: 1, styles: [{ id: 'ok' }] }))
      .toThrow(/испорчен/);
    expect(() => parseStyleSet(null)).toThrow(/испорчен/);
  });

  it('идентификатор стиля с пробелом не проходит и со склада тоже', () => {
    // Он попадёт в селектор CSS. Та же проверка, что у схемы проекта:
    // склад не имеет права быть дырой в обход неё.
    expect(() =>
      parseStyleSet({
        id: 's', name: 'Набор', savedAt: 1,
        styles: [{ id: 'с пробелом', name: 'Х', type: 'text', props: {} }],
      }),
    ).toThrow();
  });

  it('здоровый набор читается как есть', () => {
    const set = { id: 's', name: 'Мой набор', savedAt: 7, styles: [style('heading', '96px')] };
    expect(parseStyleSet(set)).toEqual(set);
  });
});

describe('взять набор в проект, где уже есть свои стили', () => {
  it('столкновение имён переименовывает ПРИШЕДШИЙ, а не заменяет свой', () => {
    // Несущее решение. Замена своего изменила бы вид урока, которого автор
    // не трогал: свои стили уже применены к элементам.
    //
    // Слом: заменять свой стиль пришедшим — тест краснеет на кегле.
    const own = [style('heading', '96px')];
    const incoming = [style('heading', '10px'), style('quiet', '40px')];

    const { styles, renamed } = mergeStyleSet(own, incoming);

    expect(styles.map((s) => s.id)).toEqual(['heading-2', 'quiet']);
    expect(styles[0]!.props['font-size']).toBe('10px');
    expect(renamed.get('heading')).toBe('heading-2');
  });

  it('переименование сообщается, а не делается молча', () => {
    const { renamed } = mergeStyleSet([style('a', '1px')], [style('a', '2px'), style('b', '3px')]);

    // Ровно одно переименование, и названо какое. Проверка на пустоту:
    // реализация, молча переименовавшая всё подряд, покраснеет здесь.
    expect([...renamed.entries()]).toEqual([['a', 'a-2']]);
  });

  it('свободные имена не трогаются', () => {
    const { styles, renamed } = mergeStyleSet([style('a', '1px')], [style('b', '2px')]);

    expect(styles.map((s) => s.id)).toEqual(['b']);
    expect(renamed.size).toBe(0);
  });

  it('занятый суффикс перешагивается, а не затирается', () => {
    const own = [style('a', '1px'), style('a-2', '2px')];
    const { styles } = mergeStyleSet(own, [style('a', '3px')]);

    expect(styles.map((s) => s.id)).toEqual(['a-3']);
  });
});
