import { describe, expect, it } from 'vitest';

import { align, distribute, restack, type Placed, type Stacked } from '../src/state/arrange.js';
import { unionBox, type Box } from '../src/stage/geometry.js';

const STAGE = { width: 1920, height: 1080 };

function box(x: number, y: number, width = 100, height = 100, rotation = 0): Box {
  return { x, y, width, height, rotation };
}

function placed(id: string, b: Box): Placed {
  return { id, box: b };
}

/** Левый ВИДИМЫЙ край — то, что выравнивает автор. */
function leftOf(b: Box): number {
  return unionBox([b])!.x;
}

function apply(items: readonly Placed[], moves: readonly { id: string; x: number; y: number }[]): Placed[] {
  return items.map((item) => {
    const move = moves.find((candidate) => candidate.id === item.id)!;
    return placed(item.id, { ...item.box, x: move.x, y: move.y });
  });
}

describe('align: выравнивание', () => {
  const three = [
    placed('a', box(100, 0)),
    placed('b', box(250, 200)),
    placed('c', box(40, 400)),
  ];

  it('по левому краю ставит всех на левый край общей рамки', () => {
    const moves = align(three, 'left', STAGE);
    const lefts = apply(three, moves).map((item) => leftOf(item.box));
    expect(new Set(lefts)).toEqual(new Set([40]));
  });

  it('по правому краю ставит всех правым краем на правый край общей рамки', () => {
    const moves = align(three, 'right', STAGE);
    const rights = apply(three, moves).map((item) => leftOf(item.box) + item.box.width);
    // Общая рамка: от 40 до 350.
    expect(new Set(rights)).toEqual(new Set([350]));
  });

  it('ОДИН выделенный выравнивается по ХОЛСТУ, а не сам по себе', () => {
    /*
     * У одного элемента нет соседей, и общая рамка выделения совпадает
     * с ним самим — то есть выравнивание по ней не двигало бы его никуда,
     * и кнопка выглядела бы сломанной.
     *
     * Слом: считать опору через unionBox всегда — этот тест покраснеет,
     * а все остальные останутся зелёными, потому что при двух и более
     * выделенных обе реализации совпадают.
     */
    const one = [placed('a', box(700, 300))];
    expect(align(one, 'left', STAGE)[0]!.x).toBe(0);
    expect(align(one, 'right', STAGE)[0]!.x).toBe(STAGE.width - 100);
    expect(align(one, 'centerX', STAGE)[0]!.x).toBe(STAGE.width / 2 - 50);
  });

  it('выравнивание идемпотентно: второе нажатие уже ничего не двигает', () => {
    // Иначе автор «доводит» элементы повторными нажатиями, а каждое
    // нажатие — отдельный шаг истории.
    const once = apply(three, align(three, 'top', STAGE));
    const twice = apply(once, align(once, 'top', STAGE));
    expect(twice.map((item) => item.box.y)).toEqual(once.map((item) => item.box.y));
  });

  it('ПОВЁРНУТЫЙ элемент равняется видимым краем, а не полем x', () => {
    /*
     * Квадрат 100×100 под 45° имеет `x = 0`, а видимый левый край −20.71.
     * Реализация, присваивающая полю `x` целевую границу, поставила бы его
     * на 20.71 правее остальных — столбик выглядел бы кривым ровно на один
     * элемент, и только если автор что-то повернул.
     */
    const items = [placed('straight', box(200, 0)), placed('turned', box(500, 200, 100, 100, 45))];
    const after = apply(items, align(items, 'left', STAGE));
    const lefts = after.map((item) => leftOf(item.box));
    expect(lefts[0]).toBeCloseTo(lefts[1]!, 9);
    // И поле x у повёрнутого при этом НЕ равно полю x у прямого.
    expect(after[1]!.box.x).not.toBeCloseTo(after[0]!.box.x, 6);
  });

  it('пустое выделение не даёт правок', () => {
    expect(align([], 'left', STAGE)).toEqual([]);
  });
});

describe('distribute: разложить поровну', () => {
  it('делает равными ПРОМЕЖУТКИ, а не расстояния между центрами', () => {
    /*
     * Ширины 100 / 300 / 200 подобраны так, что две раскладки расходятся.
     * Равные промежутки ставят средний на 350, равные центры — на 375.
     * При одинаковых ширинах обе формулы совпадают, поэтому тест
     * с одинаковыми элементами был бы декоративным.
     */
    const items = [
      placed('a', box(0, 0, 100)),
      placed('b', box(200, 0, 300)),
      placed('c', box(900, 0, 200)),
    ];
    const after = apply(items, distribute(items, 'x'));
    const byId = (id: string): Placed => after.find((item) => item.id === id)!;

    expect(byId('b').box.x).toBe(350);

    const gapAB = byId('b').box.x - (byId('a').box.x + 100);
    const gapBC = byId('c').box.x - (byId('b').box.x + 300);
    expect(gapAB).toBeCloseTo(gapBC, 9);
  });

  it('крайние два не двигаются', () => {
    // Слом: раскладывать от нуля или от центра — габарит группы менялся бы
    // от нажатия кнопки «разложить», хотя автор просил только про промежутки.
    const items = [
      placed('a', box(0, 0, 100)),
      placed('b', box(200, 0, 300)),
      placed('c', box(900, 0, 200)),
    ];
    const after = apply(items, distribute(items, 'x'));
    expect(after.find((item) => item.id === 'a')!.box.x).toBe(0);
    expect(after.find((item) => item.id === 'c')!.box.x).toBe(900);
  });

  it('порядок берётся из ПОЛОЖЕНИЯ, а не из порядка выделения', () => {
    // Автор мог выделить их в любом порядке — раскладка обязана быть та же.
    const forward = [placed('a', box(0, 0)), placed('b', box(300, 0)), placed('c', box(900, 0))];
    const shuffled = [forward[2]!, forward[0]!, forward[1]!];
    const one = distribute(forward, 'x').slice().sort((p, q) => p.id.localeCompare(q.id));
    const two = distribute(shuffled, 'x').slice().sort((p, q) => p.id.localeCompare(q.id));
    expect(two).toEqual(one);
  });

  it('по вертикали работает так же', () => {
    const items = [placed('a', box(0, 0)), placed('b', box(0, 130)), placed('c', box(0, 600))];
    const after = apply(items, distribute(items, 'y'));
    const ys = after.map((item) => item.box.y).sort((p, q) => p - q);
    expect(ys[1]! - (ys[0]! + 100)).toBeCloseTo(ys[2]! - (ys[1]! + 100), 9);
  });

  it('меньше трёх элементов — ошибка, а не молчаливый no-op', () => {
    // Между двумя элементами промежуток один, и равнять его нечему.
    // Молчаливый возврат пустого списка выглядел бы как работающая кнопка.
    expect(() => distribute([placed('a', box(0, 0)), placed('b', box(50, 0))], 'x')).toThrow(/трёх/);
  });
});

describe('restack: порядок наложения', () => {
  const stack: readonly Stacked[] = [
    { id: 'a', zIndex: 0 },
    { id: 'b', zIndex: 1 },
    { id: 'c', zIndex: 2 },
    { id: 'd', zIndex: 3 },
  ];

  /** Порядок снизу вверх — то, как элементы лежат на экране. */
  function orderOf(layers: readonly Stacked[]): string[] {
    return layers.slice().sort((p, q) => p.zIndex - q.zIndex).map((layer) => layer.id);
  }

  it('на передний план поднимает выделенный над остальными', () => {
    expect(orderOf(restack(stack, ['a'], 'front'))).toEqual(['b', 'c', 'd', 'a']);
  });

  it('на задний план опускает под остальных', () => {
    expect(orderOf(restack(stack, ['d'], 'back'))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('вперёд двигает РОВНО на один слой', () => {
    // Слом: перепутать с 'front' — разницы между двумя кнопками не стало бы,
    // и все прочие тесты остались бы зелёными.
    expect(orderOf(restack(stack, ['a'], 'forward'))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('назад двигает ровно на один слой', () => {
    expect(orderOf(restack(stack, ['d'], 'backward'))).toEqual(['a', 'b', 'd', 'c']);
  });

  it('ПАЧКА сохраняет взаимный порядок', () => {
    /*
     * Несущее свойство. Реализация, которая просто раздаёт выделенным
     * подряд идущие номера в порядке выделения (а не в порядке стопки),
     * перетасовала бы их между собой — автор нажал бы одну кнопку
     * и получил бы стопку, которую не заказывал.
     */
    expect(orderOf(restack(stack, ['a', 'c'], 'front'))).toEqual(['b', 'd', 'a', 'c']);
    expect(orderOf(restack(stack, ['b', 'd'], 'back'))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('номера переписываются плотно, от нуля и без дыр', () => {
    // Слом: ставить max + 1 — числа в сохранённом файле росли бы от каждого
    // нажатия, и два слайда одного сегмента расходились бы по номерам
    // у одних и тех же элементов.
    const sparse: readonly Stacked[] = [
      { id: 'a', zIndex: 5 },
      { id: 'b', zIndex: 40 },
      { id: 'c', zIndex: 900 },
    ];
    const next = restack(sparse, ['c'], 'back');
    expect(next.map((layer) => layer.zIndex).sort((p, q) => p - q)).toEqual([0, 1, 2]);
  });

  it('при равных zIndex порядок берётся из списка — как в topmostAt', () => {
    // Две трактовки одного порядка разошлись бы молча: автор кликал бы
    // по одному элементу, а поднимался бы другой.
    const tied: readonly Stacked[] = [
      { id: 'first', zIndex: 0 },
      { id: 'second', zIndex: 0 },
    ];
    expect(orderOf(restack(tied, ['first'], 'front'))).toEqual(['second', 'first']);
  });

  it('уже стоящий впереди от «вперёд» не двигается', () => {
    expect(orderOf(restack(stack, ['d'], 'forward'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('выделены все — порядок не меняется', () => {
    expect(restack(stack, ['a', 'b', 'c', 'd'], 'front')).toEqual(stack);
  });

  it('неизвестный элемент бросает ошибку', () => {
    expect(() => restack(stack, ['ghost'], 'front')).toThrow(/ghost/);
  });
});
