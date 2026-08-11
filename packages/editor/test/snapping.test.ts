import { describe, expect, it } from 'vitest';

import { unionBox, type Box } from '../src/stage/geometry.js';
import { snap, snapResize } from '../src/stage/snapping.js';
import { MIN_SIZE, resizeBox } from '../src/stage/transform.js';

const STAGE = { width: 1920, height: 1080 };

function box(x: number, y: number, width = 50, height = 50, rotation = 0): Box {
  return { x, y, width, height, rotation };
}

describe('snap: прилипание к соседям', () => {
  it('левый край подтягивается к левому краю соседа', () => {
    // Сосед стоит в стороне по вертикали, поэтому в игре только ось X.
    const moving = box(100, 400);
    const other = box(105, 0, 200);
    expect(snap(moving, [other], STAGE, 8).dx).toBeCloseTo(5, 9);
  });

  it('дальше порога не прилипает вовсе', () => {
    // Слом: сравнивать `distance < threshold * 2` или забыть сравнение —
    // элемент притягивался бы через полэкрана.
    //
    // Сосед отнесён далеко намеренно. Первая версия этого теста ставила его
    // на 120 при взятом 100…150 — и покраснела, потому что ЦЕНТР взятого
    // (125) оказался в пяти единицах от левого края соседа. Прилипание там
    // было настоящим, а неверными были мои числа: девять пар опорных точек
    // считать надо все, а не только «край с краем».
    const moving = box(100, 400);
    const other = box(300, 0, 200);
    expect(snap(moving, [other], STAGE, 8).dx).toBe(0);
  });

  it('ЦЕНТР взятого прилипает к КРАЮ соседа, а не только край к краю', () => {
    /*
     * Поведение закреплено намеренно: так подпись центрируют по краю
     * фигуры, и так же ведут себя Canva и Figma. Все девять пар опорных
     * точек (три у взятого × три у соседа) равноправны.
     *
     * Слом: сличать только одноимённые пары (левый с левым, центр
     * с центром) — выравнивание подписи по краю перестало бы работать,
     * причём молча: обычное выравнивание края с краем осталось бы целым,
     * и ни один другой тест файла не покраснел бы.
     */
    const moving = box(100, 400);
    const other = box(120, 0, 200);
    // Центр взятого — 125, левый край соседа — 120.
    expect(snap(moving, [other], STAGE, 8).dx).toBeCloseTo(-5, 9);
  });

  it('оси считаются независимо: прилипание по X не двигает по Y', () => {
    // Слом: искать одну «ближайшую точку» по обеим осям сразу — выровнять
    // что-то одно стало бы невозможно, элемент всегда прыгал бы в угол.
    const result = snap(box(100, 400), [box(105, 0, 200)], STAGE, 8);
    expect(result.dx).toBeCloseTo(5, 9);
    expect(result.dy).toBe(0);
  });

  it('центр подтягивается к центру холста', () => {
    // Центр сцены 960. Бокс шириной 50 центрирован при x = 935.
    const result = snap(box(931, 400), [], STAGE, 8);
    expect(result.dx).toBeCloseTo(4, 9);
    const centred = 931 + result.dx + 25;
    expect(centred).toBeCloseTo(960, 9);
  });

  it('ПОВЁРНУТЫЙ сосед притягивает своим ВИДИМЫМ краем, а не полем x', () => {
    /*
     * Квадрат 100×100 под 45° занимает от −20.71 до 120.71, хотя его `x`
     * равен нулю, а `x + width` — сотне. Автор видит именно 120.71: это
     * тот край, с которым он выравнивает.
     *
     * Реализация, берущая опорные точки прямо из полей бокса, дала бы
     * цели 0 / 50 / 100 — до ближайшей 23.71 при пороге 8, то есть
     * прилипания не было бы вовсе. И только на повёрнутых: на остальных
     * обе реализации совпадают, поэтому дефект читался бы как «иногда
     * не прилипает».
     */
    const rotated = box(0, 0, 100, 100, 45);
    const bounds = unionBox([rotated])!;
    expect(bounds.x + bounds.width).toBeCloseTo(50 + 50 * Math.SQRT2, 9);

    const moving = box(123.71, 400);
    const result = snap(moving, [rotated], STAGE, 8);
    expect(result.dx).toBeCloseTo(bounds.x + bounds.width - 123.71, 6);
  });

  it('порог задаётся в единицах сцены и потому одинаков на любом масштабе', () => {
    /*
     * Несущее свойство ADR-007: восемь ЭКРАННЫХ пикселей обязаны означать
     * одно и то же расстояние для руки автора при любом масштабе сцены.
     * Вызывающий делит экранный порог на масштаб — здесь проверяется, что
     * такой порог ведёт себя одинаково на всех четырёх масштабах спайка S6.
     *
     * Слом: передать сюда экранный порог как есть — на масштабе 0.198
     * прилипание срабатывало бы с расстояния 8 единиц сцены вместо 40,
     * то есть с 1.6 экранного пикселя. Автор решил бы, что его нет.
     */
    const SCREEN_PX = 8;
    /*
     * Оба бокса шириной 200 — не для красоты. При меньшей ширине опорные
     * точки взятого и соседа сходятся ближе, чем порог на масштабе 0.198
     * (там он равен 40.4 единицы сцены), и в игру вступает пара «центр
     * с краем» — ответ остаётся верным, но перестаёт быть единственным,
     * и тест начинает проверять не то, что называет. При ширине 200
     * соседние пары разнесены на 100 единиц, то есть заведомо дальше
     * любого из четырёх порогов.
     */
    for (const scale of [1, 0.5, 0.25, 0.198]) {
      const threshold = SCREEN_PX / scale;
      const withinScene = (SCREEN_PX - 0.5) / scale;
      const beyondScene = (SCREEN_PX + 0.5) / scale;

      expect(
        snap(box(100, 400, 200), [box(100 + withinScene, 0, 200)], STAGE, threshold).dx,
        `масштаб ${scale}: расстояние в 7.5 экранного пикселя обязано прилипнуть`,
      ).toBeCloseTo(withinScene, 6);
      expect(
        snap(box(100, 400, 200), [box(100 + beyondScene, 0, 200)], STAGE, threshold).dx,
        `масштаб ${scale}: расстояние в 8.5 экранного пикселя прилипать не должно`,
      ).toBe(0);
    }
  });

  it('отрицательный порог бросает, а не молча ничего не делает', () => {
    expect(() => snap(box(0, 0), [], STAGE, -1)).toThrow(/[Пп]орог/);
  });
});

describe('snap: направляющие', () => {
  it('после прилипания возвращается линия ровно там, где совпало', () => {
    const result = snap(box(100, 400), [box(105, 0, 200)], STAGE, 8);
    const vertical = result.guides.filter((guide) => guide.axis === 'x');
    expect(vertical).not.toHaveLength(0);
    expect(vertical.some((guide) => Math.abs(guide.at - 105) < 0.001)).toBe(true);
  });

  it('линия тянется от дальнего края соседа до дальнего края взятого', () => {
    // Сосед по вертикали занимает 0…50, взятый после прилипания 400…450.
    // Линия обязана накрыть оба, иначе не видно, ЧТО с чем выровнялось.
    const result = snap(box(100, 400), [box(105, 0, 200)], STAGE, 8);
    const guide = result.guides.find((item) => item.axis === 'x' && Math.abs(item.at - 105) < 0.001)!;
    expect(guide.from).toBeCloseTo(0, 9);
    expect(guide.to).toBeCloseTo(450, 9);
  });

  it('без совпадения линий нет вовсе', () => {
    // Слом: рисовать линию по ближайшей цели независимо от порога —
    // холст покрылся бы линиями на любом движении.
    expect(snap(box(500, 500), [box(700, 700)], STAGE, 8).guides).toHaveLength(0);
  });

  it('совпадение сразу по двум осям даёт две линии', () => {
    const other = box(105, 405, 200, 200);
    const result = snap(box(100, 400), [other], STAGE, 8);
    expect(result.guides.filter((guide) => guide.axis === 'x')).not.toHaveLength(0);
    expect(result.guides.filter((guide) => guide.axis === 'y')).not.toHaveLength(0);
  });

  it('два соседа, выровненных между собой, дают ОДНУ линию, а не две одинаковых', () => {
    // Слом: складывать линии без сверки — на слайде с колонкой из пяти
    // выровненных элементов автор получал бы пять линий в одном пикселе,
    // и каждая рисовалась бы поверх предыдущей.
    const a = box(105, 0, 200, 50);
    const b = box(105, 60, 200, 50);
    const result = snap(box(100, 400), [a, b], STAGE, 8);
    const at105 = result.guides.filter(
      (guide) => guide.axis === 'x' && Math.abs(guide.at - 105) < 0.001,
    );
    // Протяжённости у них разные (соседи стоят на разной высоте), поэтому
    // сверка идёт по всей тройке at/from/to — но одинаковых быть не должно.
    const unique = new Set(at105.map((guide) => `${guide.at}:${guide.from}:${guide.to}`));
    expect(unique.size).toBe(at105.length);
  });
});

describe('snapResize: прилипание при изменении размера', () => {
  it('прилипает ТЯНУТЫЙ край, а противоположный не двигается ни на единицу', () => {
    /*
     * Несущее свойство всей задачи. Слом: приложить поправку к боксу
     * (`{...moved, x: moved.x + dx}`) вместо точки указателя — правый край
     * встанет на 305 так же, ЛЕВЫЙ уедет со 100 на 105, и элемент поедет
     * вместо того, чтобы растянуться. Ширина при этом останется 200,
     * то есть «изменение размера» размер не изменит.
     */
    const other = box(305, 400, 200);
    const result = snapResize(box(100, 400), 'e', { x: 300, y: 425 }, [other], STAGE, 8);

    expect(result.box.x).toBe(100);
    expect(result.box.width).toBe(205);
  });

  it('ручка `w` не двигает правый край', () => {
    // Зеркало предыдущего: у `w` неподвижен дальний край справа.
    const other = box(95, 400, 200);
    const result = snapResize(box(100, 400), 'w', { x: 97, y: 425 }, [other], STAGE, 8);

    expect(result.box.x).toBe(95);
    expect(result.box.x + result.box.width).toBe(150);
  });

  it('дальше порога не прилипает вовсе', () => {
    // Слом: забыть сравнение с порогом — край притягивался бы через полсцены.
    const other = box(350, 400, 200);
    const result = snapResize(box(100, 400), 'e', { x: 300, y: 425 }, [other], STAGE, 8);

    expect(result.box.width).toBe(200);
    expect(result.guides).toHaveLength(0);
  });

  it('ось, которой ручка не касается, не трогается вовсе', () => {
    /*
     * Слом: считать поправку по обеим осям независимо от ручки — у `e`
     * поехал бы низ элемента, хотя автор тянул вбок. Сосед стоит так,
     * что по вертикали прилипание было бы, если бы его считали.
     */
    const other = box(305, 452, 200, 200);
    const result = snapResize(box(100, 400), 'e', { x: 300, y: 448 }, [other], STAGE, 8);

    expect(result.box.y).toBe(400);
    expect(result.box.height).toBe(50);
  });

  it('СЕРЕДИНА растягиваемого бокса к линиям НЕ липнет — только тянутый край', () => {
    /*
     * Отличие от перетаскивания, где все три опорные точки равноправны.
     * Здесь сосед стоит в двух единицах от того места, где окажется центр
     * (200), и в сотне от тянутого края (300).
     *
     * Слом: передать в `nearestDelta` три опорные точки вместо одной —
     * бокс дёрнулся бы на 2, автор увидел бы прилипание к линии, которой
     * на месте края нет.
     */
    const other = box(202, 400, 20);
    const result = snapResize(box(100, 400), 'e', { x: 300, y: 425 }, [other], STAGE, 8);

    expect(result.box.width).toBe(200);
    expect(result.guides).toHaveLength(0);
  });

  it('у ПОВЁРНУТОГО элемента прилипания нет, и результат равен голому resizeBox', () => {
    /*
     * Слом: убрать проверку `rotation !== 0` — поправка, посчитанная
     * в координатах сцены, ушла бы внутрь `resizeBox`, который поворачивает
     * точку в собственную систему бокса. Край встал бы не на линию, а рядом,
     * причём тем дальше, чем больше угол.
     */
    const rotated = box(100, 400, 50, 50, 30);
    const other = box(305, 400, 200);
    const pointer = { x: 300, y: 425 };

    const result = snapResize(rotated, 'e', pointer, [other], STAGE, 8);

    expect(result.box).toEqual(resizeBox(rotated, 'e', pointer));
    expect(result.guides).toHaveLength(0);
  });

  it('упор в minSize: линия НЕ рисуется там, куда край не доехал', () => {
    /*
     * Ручку протащили за противоположный край: указатель прилипает к 97,
     * но `resizeBox` упирает бокс в minSize и ставит край на 101.
     *
     * Слом: считать линии по прилипшей ТОЧКЕ, а не по результату, — автор
     * увидел бы линию на 97, где края нет и уже не будет.
     */
    const other = box(97, 400, 200);
    const result = snapResize(box(100, 400), 'e', { x: 95, y: 425 }, [other], STAGE, 8);

    expect(result.box.x).toBe(100);
    expect(result.box.width).toBe(MIN_SIZE);
    expect(result.guides).toHaveLength(0);
  });

  it('линия появляется ровно там, где совпал край', () => {
    const other = box(305, 400, 200);
    const result = snapResize(box(100, 400), 'e', { x: 300, y: 425 }, [other], STAGE, 8);

    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]!.axis).toBe('x');
    expect(result.guides[0]!.at).toBeCloseTo(305, 9);
  });

  it('угловая ручка прилипает по двум осям независимо', () => {
    // Справа сосед даёт линию по X, снизу — по Y. Обе обязаны сработать
    // за один жест: слом (считать только первую сработавшую ось) оставил бы
    // угол выровненным лишь наполовину.
    const right = box(305, 0, 200, 50);
    const below = box(0, 605, 50, 200);
    const result = snapResize(box(100, 400), 'se', { x: 300, y: 600 }, [right, below], STAGE, 8);

    expect(result.box.x + result.box.width).toBeCloseTo(305, 9);
    expect(result.box.y + result.box.height).toBeCloseTo(605, 9);
  });

  it('край прилипает к СЕРЕДИНЕ холста, а не только к соседям', () => {
    const result = snapResize(box(100, 400), 'e', { x: 955, y: 425 }, [], STAGE, 8);

    expect(result.box.x + result.box.width).toBeCloseTo(960, 9);
  });

  it('отрицательный порог бросает, а не молча ничего не делает', () => {
    expect(() => snapResize(box(100, 400), 'e', { x: 300, y: 425 }, [], STAGE, -1)).toThrow(RangeError);
  });
});
