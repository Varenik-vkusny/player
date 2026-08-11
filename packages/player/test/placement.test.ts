/**
 * Порядок и вложенность узлов сцены (Сессия 35, группы).
 *
 * Предмет проверки — ЧИСТАЯ половина рендера. `renderScene` юнит-тестом
 * не проверяется в принципе: юниты идут в `node` без DOM (`vitest.config.ts`,
 * `environment: 'node'`), и `document.createElement` там не существует.
 * Поэтому решение о том, кто чей потомок и в каком порядке вставляется,
 * вынесено в `planPlacement` — она про списки, а не про DOM.
 *
 * Обнаружение сироты проверяется ТОЛЬКО здесь и никак иначе: чтобы увидеть
 * его в браузере, пришлось бы собрать заведомо испорченный проект, который
 * схема не пропускает (`schema.ts`, запрет «ребёнок на слайде без родителя»).
 */
import { describe, expect, it } from 'vitest';
import { planPlacement } from '@player/player';
import type { Element, ElementState } from '@player/core';

function element(id: string, parentId?: string): Element {
  const base = { id, type: 'shape' as const, content: '', locked: false };
  return parentId === undefined ? base : { ...base, parentId };
}

/** Состояние-заготовка: этим тестам важно только его НАЛИЧИЕ, не геометрия. */
function state(): ElementState {
  return {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    zIndex: 0,
    opacity: 1,
    visible: true,
    flipX: false,
    flipY: false,
    style: {},
  };
}

/** Состояния для всех перечисленных id разом. */
function statesFor(...ids: readonly string[]): Record<string, ElementState> {
  return Object.fromEntries(ids.map((id) => [id, state()]));
}

/** Читаемый слепок плана: «кого кладём» → «внутрь кого». */
function shape(elements: readonly Element[], states: Record<string, ElementState>) {
  return planPlacement(elements, states).map((p) => [p.element.id, p.parentId]);
}

describe('planPlacement: порядок и вложенность', () => {
  /**
   * Вырождение в сегодняшний плоский обход — несущее свойство, а не частный
   * случай. На нём стоят 90 скриншотных эталонов: групп в старых фикстурах
   * нет, значит рекурсия обязана давать ровно то же, что давал плоский цикл.
   */
  it('без групп даёт плоский список в порядке массива', () => {
    const elements = [element('a'), element('b'), element('c')];
    expect(shape(elements, statesFor('a', 'b', 'c'))).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['c', undefined],
    ]);
  });

  /**
   * Родитель ОБЯЗАН стоять раньше своих детей, и это не вкусовщина порядка:
   * `renderScene` берёт узел родителя из карты уже вставленных. Нарушь
   * порядок — и родителя в карте ещё нет, класть ребёнка некуда.
   */
  it('ребёнок идёт после родителя и знает, внутрь кого его класть', () => {
    const elements = [element('g', undefined), element('kid', 'g')];
    expect(shape(elements, statesFor('g', 'kid'))).toEqual([
      ['g', undefined],
      ['kid', 'g'],
    ]);
  });

  /**
   * Порядок братьев решает спор при попадании указателя: побеждает тот, кто
   * позже в массиве, потому что он позже вставлен (`geometry.ts`, `Editor.tsx`).
   * Перевернув братьев, мы перевернули бы и выбор элемента щелчком — молча.
   */
  it('братья сохраняют порядок массива', () => {
    const elements = [element('g'), element('first', 'g'), element('second', 'g')];
    expect(shape(elements, statesFor('g', 'first', 'second'))).toEqual([
      ['g', undefined],
      ['first', 'g'],
      ['second', 'g'],
    ]);
  });

  /** Дерево глубже одного уровня схемой законно — рекурсия обязана его нести. */
  it('внучатый элемент кладётся внутрь своего родителя, а не группы верхнего уровня', () => {
    const elements = [element('outer'), element('inner', 'outer'), element('leaf', 'inner')];
    expect(shape(elements, statesFor('outer', 'inner', 'leaf'))).toEqual([
      ['outer', undefined],
      ['inner', 'outer'],
      ['leaf', 'inner'],
    ]);
  });

  /**
   * ADR-015: элемента без состояния на слайде нет вовсе. Группа не исключение,
   * и её отсутствие уносит поддерево целиком — иначе дети остались бы висеть
   * в координатах несуществующего предка.
   */
  it('группа без состояния уносит с собой всё поддерево', () => {
    const elements = [element('g'), element('kid', 'g'), element('loner')];
    expect(shape(elements, statesFor('loner'))).toEqual([['loner', undefined]]);
  });

  /**
   * Сирота — ребёнок на слайде при отсутствующем родителе. Схема это
   * запрещает, но `renderScene` получает данные и из редактора, который
   * держит сегмент в памяти и не гоняет его через разбор на каждое нажатие.
   * Значит сюда такое ПРИЕХАТЬ может, и тихо пропустить ребёнка нельзя:
   * автор увидел бы, что объект исчез, без единого слова о причине.
   */
  it('ребёнок на слайде без родителя роняет громко, а не пропадает молча', () => {
    const elements = [element('g'), element('kid', 'g')];
    expect(() => planPlacement(elements, statesFor('kid'))).toThrow(/kid/);
  });

  /**
   * Цикл схема тоже запрещает (`schema.ts`, подъём до корня с `seen`).
   * Здесь важно не то, что он обнаружен, а что он не вешает обход: ни один
   * участник цикла не имеет пустого `parentId`, поэтому корнем не станет
   * и рекурсию не начнёт. Ловится тем же счётом непоставленных.
   */
  it('цикл не вешает обход, а роняет', () => {
    const elements = [element('a', 'b'), element('b', 'a')];
    // Образец, а не голый toThrow(): без него тест зеленеет от ЛЮБОГО броска,
    // включая «planPlacement is not a function» до реализации. Поймано на себе.
    expect(() => planPlacement(elements, statesFor('a', 'b'))).toThrow(/«a».*«b»|«b».*«a»/);
  });
});
