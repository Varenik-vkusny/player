/**
 * Импорт презентации: раскладка и числа.
 *
 * Проверка «импортировали и получили столько же элементов» ПУСТА — она
 * верна при любой реализации импорта. Поэтому здесь сверяется ГЕОМЕТРИЯ
 * КОНКРЕТНЫХ элементов с исходником, а эталон взят не из выдачи библиотеки,
 * а из сырого XML, прочитанного глазами (`docs/journal/session-40-journal.md` §1.3).
 *
 * → ADR-031
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  IMPORT_SLIDE_SECONDS,
  projectFromPptx,
  type PptxDeck,
  type PptxElement,
} from '../src/import/pptx.js';

const IMPORT_DIR = fileURLToPath(new URL('../../../fixtures/import/', import.meta.url));

// ---------------------------------------------------------------------------
// Чистая часть: своими данными, без библиотеки.
// ---------------------------------------------------------------------------

const text = (over: Partial<PptxElement> = {}): PptxElement => ({
  type: 'text',
  x: 100, y: 200, width: 300, height: 40,
  text: 'Строка',
  textStyle: { fontFamily: 'Barlow', fontSize: 24, color: '#416180' },
  ...over,
});

const deckOf = (...pages: PptxElement[][]): PptxDeck => ({
  width: 1920,
  height: 1080,
  slides: pages.map((elements) => ({ elements })),
});

describe('импорт: раскладка', () => {
  it('координаты переносятся ОДИН В ОДИН, без пересчёта', () => {
    // Слом: прибавить 1 к `x` в `walk` — тест краснеет здесь. Именно этот
    // слом назван в плане: сдвиг системы координат на пиксель.
    const { project } = projectFromPptx(deckOf([text({ x: 977.9, y: 758.8, width: 1886.4, height: 42.9 })]));
    const state = project.segments[0]!.slides[0]!.states['p1-e0']!;

    expect(state.x).toBe(977.9);
    expect(state.y).toBe(758.8);
    expect(state.width).toBe(1886.4);
    expect(state.height).toBe(42.9);
  });

  it('размер сцены берётся у презентации, а не подставляется наш', () => {
    // Слом: захардкодить 1920×1080 — краснеет, потому что источник вправе
    // быть другим. У Canva совпадает, но это свойство Canva, не наше.
    const { project } = projectFromPptx({ width: 1280, height: 720, slides: [{ elements: [text()] }] });
    expect(project.meta.stageWidth).toBe(1280);
    expect(project.meta.stageHeight).toBe(720);
  });

  it('страница становится слайдом, а вся презентация — ОДНИМ куском', () => {
    const { project } = projectFromPptx(deckOf([text()], [text()], [text()]));

    expect(project.segments).toHaveLength(1);
    expect(project.segments[0]!.slides).toHaveLength(3);
    expect(project.segments[0]!.slides.map((s) => s.at)).toEqual([
      { kind: 'seconds', t: 0 },
      { kind: 'seconds', t: IMPORT_SLIDE_SECONDS },
      { kind: 'seconds', t: 2 * IMPORT_SLIDE_SECONDS },
    ]);
    expect(project.segments[0]!.audio.duration).toBe(3 * IMPORT_SLIDE_SECONDS);
  });

  it('кусок приезжает НЕМЫМ: ни дорожки, ни расшифровки', () => {
    // Слом: подставить `src` на файл-заглушку — краснеет. Заглушка была бы
    // фейковыми данными: звука у презентации нет ниоткуда.
    const { project } = projectFromPptx(deckOf([text()]));
    const audio = project.segments[0]!.audio;

    expect(audio.src).toBeUndefined();
    expect(audio.fileId).toBeUndefined();
    expect(audio.words).toEqual([]);
  });

  it('у каждого слайда в состояниях ТОЛЬКО свои элементы', () => {
    // Иначе элемент первой страницы остался бы висеть на второй: рендер
    // рисует элемент ровно тогда, когда у слайда есть его состояние.
    const { project } = projectFromPptx(deckOf([text()], [text(), text()]));
    const [first, second] = project.segments[0]!.slides;

    expect(Object.keys(first!.states)).toEqual(['p1-e0']);
    expect(Object.keys(second!.states)).toEqual(['p2-e1', 'p2-e2']);
  });

  it('заметки страниц становятся текстом озвучки', () => {
    // То, ради чего импорт вообще имеет смысл.
    const { project, report } = projectFromPptx({
      width: 1920,
      height: 1080,
      slides: [
        { elements: [text()], notes: 'Первая мысль' },
        { elements: [text()], notes: '   ' },
        { elements: [text()], notes: 'Третья мысль' },
      ],
    });

    expect(project.segments[0]!.speech).toBe('Первая мысль\n\nТретья мысль');
    expect(report.pagesWithNotes).toBe(2);
  });

  it('без единой заметки поля озвучки НЕТ, а не пустая строка', () => {
    // Схема запрещает пустую строку: отсутствие текста выражается
    // отсутствием поля, иначе состояний два на один смысл. Слом: заменить
    // условие на `speech: speeches.join(...)` — разбор упадёт прямо здесь.
    const { project } = projectFromPptx(deckOf([text()]));
    expect(project.segments[0]!.speech).toBeUndefined();
  });
});

describe('импорт: оформление', () => {
  it('шрифт, кегль, цвет и начертание доезжают', () => {
    const { project } = projectFromPptx(deckOf([
      text({
        textStyle: {
          fontFamily: 'Barlow Condensed Bold',
          fontSize: 158.78666666666666,
          color: '#1D1F20',
          bold: true,
          align: 'left',
          characterSpacing: 359,
          lineSpacingExactPt: 27.7,
        },
      }),
    ]));
    const style = project.segments[0]!.slides[0]!.states['p1-e0']!.style;

    // С запасным `sans-serif`, см. «импорт: шрифты» ниже — совпадение
    // с тем, как САМА Canva рисует кириллицу без своего Barlow Condensed.
    expect(style['font-family']).toBe('"Barlow Condensed Bold", sans-serif');
    expect(style['font-size']).toBe('158.787px');
    expect(style['color']).toBe('#1D1F20');
    expect(style['font-weight']).toBe('bold');
    expect(style['text-align']).toBe('left');
    // Трекинг в OOXML — сотые доли пункта: 359 → 3.59 pt.
    expect(style['letter-spacing']).toBe('3.59pt');
    expect(style['line-height']).toBe('27.7pt');
  });

  it('фон страницы приезжает ПОДЛОЖКОЙ во всю сцену и лежит ниже всех', () => {
    // Найдено ГЛАЗАМИ в браузере при 22 зелёных тестах: без подложки объекты
    // ложатся на тёмную сцену темы, а текст у них свой, тёмный, — слайд
    // нечитаем. Геометрия при этом сходится до пикселя, поэтому проверка
    // раскладки такого не ловит.
    //
    // Слом: убрать ветку `page.backgroundColor` — краснеет здесь.
    const { project } = projectFromPptx({
      width: 1920,
      height: 1080,
      slides: [{ elements: [text()], backgroundColor: '#F2F2F3' }],
    });
    const states = project.segments[0]!.slides[0]!.states;

    expect(states['p1-bg']!.style['background']).toBe('#F2F2F3');
    expect(states['p1-bg']!.width).toBe(1920);
    expect(states['p1-bg']!.height).toBe(1080);
    expect(states['p1-bg']!.zIndex).toBeLessThan(states['p1-e0']!.zIndex);
  });

  it('у каждой страницы фон СВОЙ, а не общий на проект', () => {
    // Тема одна на проект и сгодилась бы только для первой страницы.
    // Измерено: фон свой у 26 страниц из 26.
    const { project } = projectFromPptx({
      width: 1920,
      height: 1080,
      slides: [
        { elements: [text()], backgroundColor: '#F2F2F3' },
        { elements: [text()], backgroundColor: '#1D1F20' },
      ],
    });
    const [first, second] = project.segments[0]!.slides;

    expect(first!.states['p1-bg']!.style['background']).toBe('#F2F2F3');
    expect(second!.states['p2-bg']!.style['background']).toBe('#1D1F20');
  });

  it('без фона подложка НЕ заводится', () => {
    // Иначе у каждой страницы появлялся бы лишний прямоугольник,
    // который автор не заказывал и объяснить не сможет.
    const { project } = projectFromPptx(deckOf([text()]));
    expect(project.segments[0]!.slides[0]!.states['p1-bg']).toBeUndefined();
  });

  it('порядок слоёв сохраняется порядком в списке', () => {
    // Слом: сортировать элементы по любому полю — краснеет. Порядок в OOXML
    // задан порядком в spTree и другого признака слоя там нет.
    const { project } = projectFromPptx(deckOf([
      text({ text: 'низ' }), text({ text: 'середина' }), text({ text: 'верх' }),
    ]));
    const states = project.segments[0]!.slides[0]!.states;

    expect(states['p1-e0']!.zIndex).toBeLessThan(states['p1-e1']!.zIndex);
    expect(states['p1-e1']!.zIndex).toBeLessThan(states['p1-e2']!.zIndex);
  });
});

describe('импорт: группы', () => {
  it('ребёнок группы ссылается вверх и хранит ЛОКАЛЬНЫЕ координаты', () => {
    // Координаты ребёнка отсчитываются от группы (решение владельца
    // 08.08.2026), и библиотека отдаёт их уже локальными — проверено
    // на настоящем файле: у линейки внутри группы x = 0, y = 0.
    const { project } = projectFromPptx(deckOf([
      {
        type: 'group', x: 100, y: 995, width: 1720, height: 1,
        children: [{
          type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 1720, height: 1,
          shapeStyle: { fillColor: '#B7B7BA' },
        }],
      },
    ]));
    const states = project.segments[0]!.slides[0]!.states;
    const elements = project.segments[0]!.elements;

    expect(elements[0]!.type).toBe('group');
    expect(elements[1]!.parentId).toBe('p1-e0');
    expect(states['p1-e0']!.x).toBe(100);
    expect(states['p1-e1']!.x).toBe(0);
    expect(states['p1-e1']!.y).toBe(0);
  });
});

describe('импорт: что срезается', () => {
  it('фигура, которая ничего не рисует, НЕ переносится', () => {
    // Правило, а не следствие наблюдения, и разница важна: на настоящей
    // презентации владельца оно не срабатывает НИ РАЗУ (отброшено 0).
    // Здесь стояло обоснование про «прозрачные рамки-обтравки вокруг
    // картинок» — оно оказалось неверным: прозрачна маска самой картинки,
    // отдельных элементов нет. Само правило верно: фигура без заливки
    // и без обводки не рисует ничего.
    //
    // Слом: убрать проверку `drawsSomething` — краснеет.
    const { project, report } = projectFromPptx(deckOf([
      { type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 846, height: 218, shapeStyle: { fillColor: 'transparent' } },
      text(),
    ]));

    expect(report.droppedInvisible).toBe(1);
    expect(project.segments[0]!.elements).toHaveLength(1);
    expect(project.segments[0]!.elements[0]!.type).toBe('text');
  });

  it('линейка-волосинка переносится: она видима', () => {
    // Зеркало предыдущего. Без него «отбрасывать невидимое» легко
    // превратилось бы в «отбрасывать тонкое».
    const { project } = projectFromPptx(deckOf([
      { type: 'shape', shapeType: 'custom', x: 100, y: 995, width: 1720, height: 1, shapeStyle: { fillColor: '#B7B7BA' } },
    ]));
    expect(project.segments[0]!.elements).toHaveLength(1);
  });

  it('картинка приезжает рамкой и об этом сказано вслух', () => {
    const { project, report } = projectFromPptx(deckOf([
      { type: 'picture', x: 10, y: 20, width: 100, height: 50 },
    ]));

    expect(project.segments[0]!.elements[0]!.type).toBe('image');
    expect(project.segments[0]!.elements[0]!.content).toBe('');
    expect(report.picturesWithoutBytes).toBe(1);
  });

  it('пустая презентация — отказ, а не пустой проект', () => {
    expect(() => projectFromPptx({ width: 1920, height: 1080, slides: [] }))
      .toThrow(/нет ни одной страницы/);
  });
});

// ---------------------------------------------------------------------------
// Задача 3: шрифты, картинки, контуры фигур.
// ---------------------------------------------------------------------------

describe('импорт: картинки получают ключ байтов', () => {
  it('картинка получает ключ байтов по своему пути', () => {
    const { project } = projectFromPptx(
      deckOf([{ type: 'picture', x: 0, y: 0, width: 10, height: 10,
                imagePath: 'ppt/media/image1.png' }]),
      { assetIdByPath: new Map([['ppt/media/image1.png', 'ключ-1']]) },
    );
    const el = project.segments[0]!.elements.find((e) => e.type === 'image')!;
    expect(el.assetId).toBe('ключ-1');
  });

  it('десять элементов на один файл дают ОДИН ключ на всех', () => {
    const один = { type: 'picture', x: 0, y: 0, width: 10, height: 10,
                   imagePath: 'ppt/media/image1.png' } as const;
    const { project } = projectFromPptx(deckOf([один, один, один]),
      { assetIdByPath: new Map([['ppt/media/image1.png', 'ключ-1']]) });
    const ключи = project.segments[0]!.elements
      .filter((e) => e.type === 'image').map((e) => e.assetId);
    expect(ключи).toEqual(['ключ-1', 'ключ-1', 'ключ-1']);
  });

  it('картинка БЕЗ байтов приезжает без ключа и попадает в отчёт', () => {
    const { project, report } = projectFromPptx(
      deckOf([{ type: 'picture', x: 0, y: 0, width: 10, height: 10,
                imagePath: 'ppt/media/нет.png' }]), {});
    expect(project.segments[0]!.elements[0]!.assetId).toBeUndefined();
    expect(report.picturesWithoutBytes).toBe(1);
  });
});

describe('импорт: контуры фигур', () => {
  it('произвольная фигура приезжает контуром в своей системе координат', () => {
    const { project } = projectFromPptx(deckOf([{
      type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 100, height: 2,
      pathData: 'M 0 0 L 21844000 0 L 21844000 12700 L 0 12700 Z',
      pathWidth: 21844000, pathHeight: 12700,
      shapeStyle: { fillColor: '#B7B7BA' },
    }]));
    const el = project.segments[0]!.elements[0]!;
    expect(el.path).toEqual({
      d: 'M 0 0 L 21844000 0 L 21844000 12700 L 0 12700 Z',
      width: 21844000, height: 12700,
    });
  });

  it('краска фигуры едет СВОЙСТВАМИ, чтобы автор мог её сменить', () => {
    const { project } = projectFromPptx(deckOf([{
      type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 10, height: 10,
      pathData: 'M 0 0 L 10 10', pathWidth: 10, pathHeight: 10,
      shapeStyle: { fillColor: '#B7B7BA' },
    }]));
    const style = project.segments[0]!.slides[0]!.states['p1-e0']!.style;
    expect(style['fill']).toBe('#B7B7BA');
  });

  it('пресетная линия становится контуром из угла в угол', () => {
    const { project } = projectFromPptx(deckOf([{
      type: 'shape', shapeType: 'line', x: 0, y: 0, width: 671, height: 348,
      shapeStyle: { strokeColor: '#000000', strokeWidth: 4 },
    }]));
    const el = project.segments[0]!.elements[0]!;
    expect(el.path).toEqual({ d: 'M 0 0 L 671 348', width: 671, height: 348 });
    const style = project.segments[0]!.slides[0]!.states['p1-e0']!.style;
    expect(style['stroke']).toBe('#000000');
    // БЕЗ единиц: так уже записано в fixtures/projects/vectors.json
    // (`"stroke-width": "4"`), и задание («4px») с этим разошлось —
    // сведено к форме фикстуры, иначе два места молча заспорили бы
    // об одном и том же числе.
    expect(style['stroke-width']).toBe('4');
    // Рамки быть не должно: раньше линия приезжала прямоугольником с border,
    // и это ровно тот дефект, который здесь чинится.
    expect(style['border']).toBeUndefined();
  });

  it('отражённая линия идёт из ДРУГОГО угла', () => {
    const { project } = projectFromPptx(deckOf([{
      type: 'shape', shapeType: 'line', x: 0, y: 0, width: 100, height: 50,
      flipHorizontal: true,
      shapeStyle: { strokeColor: '#000000', strokeWidth: 2 },
    }]));
    expect(project.segments[0]!.elements[0]!.path!.d).toBe('M 100 0 L 0 50');
  });

  it('линия НЕ отбрасывается правилом «ничего не рисует»', () => {
    // У линии нет заливки. Правило drawsSomething смотрит и на обводку,
    // но проверить надо: молча пропавшая стрелка — худший исход.
    const { report } = projectFromPptx(deckOf([{
      type: 'shape', shapeType: 'line', x: 0, y: 0, width: 10, height: 10,
      shapeStyle: { strokeColor: '#000000', strokeWidth: 1 },
    }]));
    expect(report.droppedInvisible).toBe(0);
    expect(report.vectors).toBe(1);
  });

  describe('вырожденные габариты не роняют импорт', () => {
    // Найдено прогоном контроллера 27.08.2026: горизонтальный/вертикальный
    // разделитель — обычный слайд, не крайний случай, а схема требует
    // строго положительных `path.width`/`path.height` (это система
    // координат `viewBox`, не размер элемента). Без зажима любая из трёх
    // фигур ниже роняла бы ВЕСЬ импорт `ProjectLoadError`.

    it('горизонтальная линия (height 0): viewBox зажат, строка пути — нет', () => {
      const { project } = projectFromPptx(deckOf([{
        type: 'shape', shapeType: 'line', x: 0, y: 0, width: 500, height: 0,
        shapeStyle: { strokeColor: '#000000', strokeWidth: 2 },
      }]));
      const el = project.segments[0]!.elements[0]!;
      // `L 500 0`, а НЕ `L 500 1`: зажим единицей — только для viewBox,
      // строка пути считается по настоящему (нулевому) габариту.
      expect(el.path).toEqual({ d: 'M 0 0 L 500 0', width: 500, height: 1 });
    });

    it('вертикальная линия (width 0): viewBox зажат, строка пути — нет', () => {
      const { project } = projectFromPptx(deckOf([{
        type: 'shape', shapeType: 'line', x: 0, y: 0, width: 0, height: 300,
        shapeStyle: { strokeColor: '#000000', strokeWidth: 2 },
      }]));
      const el = project.segments[0]!.elements[0]!;
      expect(el.path).toEqual({ d: 'M 0 0 L 0 300', width: 1, height: 300 });
    });

    it('произвольная фигура с нулевой стороной (pathHeight 0)', () => {
      const { project } = projectFromPptx(deckOf([{
        type: 'shape', shapeType: 'custom', x: 0, y: 0, width: 100, height: 0.001,
        pathData: 'M 0 0 L 21844000 0 L 21844000 0 L 0 0 Z',
        pathWidth: 21844000, pathHeight: 0,
        shapeStyle: { fillColor: '#B7B7BA' },
      }]));
      const el = project.segments[0]!.elements[0]!;
      // `pathData` переносится КАК ЕСТЬ (не пересчитывается) — зажимается
      // только система координат контура.
      expect(el.path).toEqual({
        d: 'M 0 0 L 21844000 0 L 21844000 0 L 0 0 Z',
        width: 21844000, height: 1,
      });
    });
  });

  describe('наконечники стрелок', () => {
    // Сырой XML владельца: <a:tailEnd type="triangle".../>,
    // <a:headEnd type="none"/> — стрелка НА КОНЦЕ линии, без наконечника
    // у начала. Библиотека отдаёт это `connectorStartArrow`/`connectorEndArrow`.
    // Рисование — задача 4, здесь только данные.

    it('наконечник на конце переносится, «none» у начала — не кладётся вовсе', () => {
      const { project } = projectFromPptx(deckOf([{
        type: 'shape', shapeType: 'line', x: 0, y: 0, width: 671, height: 348,
        shapeStyle: {
          strokeColor: '#000000', strokeWidth: 4,
          connectorStartArrow: 'none', connectorEndArrow: 'triangle',
        },
      }]));
      const el = project.segments[0]!.elements[0]!;
      expect(el.path!.endArrow).toBe('triangle');
      expect(el.path!.startArrow).toBeUndefined();
    });

    it('наконечники на обоих концах переносятся оба', () => {
      const { project } = projectFromPptx(deckOf([{
        type: 'shape', shapeType: 'line', x: 0, y: 0, width: 100, height: 50,
        shapeStyle: {
          strokeColor: '#000000', strokeWidth: 2,
          connectorStartArrow: 'triangle', connectorEndArrow: 'triangle',
        },
      }]));
      const el = project.segments[0]!.elements[0]!;
      expect(el.path!.startArrow).toBe('triangle');
      expect(el.path!.endArrow).toBe('triangle');
    });

    it('без наконечников ни одно поле не заводится', () => {
      // Слом: заводить `startArrow`/`endArrow` со значением `'none'`
      // вместо пропуска поля — краснеет здесь (`toEqual` ловит лишний ключ).
      const { project } = projectFromPptx(deckOf([{
        type: 'shape', shapeType: 'line', x: 0, y: 0, width: 671, height: 348,
        shapeStyle: {
          strokeColor: '#000000', strokeWidth: 4,
          connectorStartArrow: 'none', connectorEndArrow: 'none',
        },
      }]));
      const el = project.segments[0]!.elements[0]!;
      expect(el.path).toEqual({ d: 'M 0 0 L 671 348', width: 671, height: 348 });
    });
  });
});

describe('импорт: шрифты', () => {
  it('шрифты проекта приезжают списком', () => {
    const { project } = projectFromPptx(deckOf([text()]), {
      fonts: [{ family: 'Barlow Condensed', assetId: 'ш-1' }],
    });
    expect(project.fonts).toEqual([{ family: 'Barlow Condensed', assetId: 'ш-1' }]);
  });

  it('font-family несёт и имя, и запасной sans-serif', () => {
    // Измерено контроллером в живой Canva 27.08.2026: у её собственного
    // Barlow Condensed кириллицы нет, и кириллический текст Canva сама
    // рисует ЗАПАСНЫМ шрифтом (`АГЕНТСТВО`: вшитым 607.23 = запасным
    // 607.23). Совпасть с Canva можно только упав в ТОТ ЖЕ запасной —
    // значит имя не может ехать голым: без явного `sans-serif` браузер
    // взял бы засечковый Times, и слайд выглядел бы чужим.
    //
    // Слом: убрать `, sans-serif` из `textProps` — краснеет здесь.
    const { project } = projectFromPptx(deckOf([
      text({ textStyle: { fontFamily: 'Barlow Condensed' } }),
    ]));
    const family = project.segments[0]!.slides[0]!.states['p1-e0']!.style['font-family'];

    expect(family).toContain('Barlow Condensed');
    expect(family).toContain('sans-serif');
  });
});

// ---------------------------------------------------------------------------
// Настоящая библиотека на настоящем файле.
// ---------------------------------------------------------------------------

async function readDeck(name: string): Promise<PptxDeck> {
  const { PptxHandler } = await import('pptx-viewer-core');
  const bytes = readFileSync(IMPORT_DIR + name);
  const handler = new PptxHandler();
  const data = await handler.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return data as unknown as PptxDeck;
}

describe('импорт: настоящая библиотека на настоящем файле', () => {
  it('имена полей библиотеки совпадают с теми, что читает переходник', async () => {
    // Единственное место, где это проверяется. Переходник библиотеку
    // не импортирует (ADR-031), поэтому переименование поля компилятор
    // не поймает — ловим прогоном. Слом: переименовать `textStyle`
    // в переходнике — здесь исчезнут стили, и тест покраснеет.
    const deck = await readDeck('canva-page-text.pptx');
    const { project } = projectFromPptx(deck, { title: 'Агентство' });
    const states = project.segments[0]!.slides[0]!.states;

    // Эталон — сырой XML, прочитанный глазами:
    //   <a:off x="977903" y="758828"/> <a:ext cx="17970503" cy="408184"/>
    //   при 9525 EMU на пиксель это 102.667, 79.667, 1886.4, 42.854
    //   sz="1800" (18 pt) → 24 px, srgbClr val="416180"
    const first = states['p1-e0']!;
    expect(first.x).toBe(103);
    expect(first.y).toBe(80);
    expect(first.width).toBe(1887);
    expect(first.height).toBe(43);
    expect(first.style['color']).toBe('#416180');
    expect(first.style['font-family']).toBe('"Barlow Condensed", sans-serif');
    expect(first.style['font-size']).toBe('24px');

    //   <a:off x="4438877" y="2320820"/> → 466.03, 243.65
    //   b="true" sz="11909" (119.09 pt) → 158.787 px, srgbClr val="1D1F20"
    const second = states['p1-e1']!;
    expect(second.x).toBe(466);
    expect(second.y).toBe(244);
    expect(second.style['color']).toBe('#1D1F20');
    expect(second.style['font-weight']).toBe('bold');
    expect(second.style['font-size']).toBe('158.787px');

    // По идентификатору, а не по месту в массиве: подложка фона стоит
    // первой, и обращение по индексу поехало бы при любой такой добавке.
    const byId = (id: string): string =>
      project.segments[0]!.elements.find((el) => el.id === id)!.content;
    expect(byId('p1-e0')).toBe('ПОДГОТОВИЛИ ТИМУР И АЛЛАУДИН');
    expect(byId('p1-e1')).toBe('АГЕНТСТВО');

    // Фон настоящей страницы: srgbClr val="F2F2F3" в сыром XML.
    expect(states['p1-bg']!.style['background']).toBe('#F2F2F3');
  }, 60_000);

  it('вшитые шрифты несут ожидаемые имена и размеры байтов', async () => {
    // Единственное место, где ловится переименование поля в библиотеке
    // (`embeddedFonts`, `name`, `rawFontData`) для шрифтов — так же, как
    // тест выше ловит его для координат и стилей текста.
    const { PptxHandler } = await import('pptx-viewer-core');
    const bytes = readFileSync(IMPORT_DIR + 'canva-page-text.pptx');
    const handler = new PptxHandler();
    const deck = await handler.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const fonts = deck.embeddedFonts ?? [];

    expect(fonts).toHaveLength(2);
    const byName = (name: string) => fonts.find((f: { name: string }) => f.name === name)!;
    expect(byName('Barlow Condensed').rawFontData).toHaveLength(96_736);
    expect(byName('Barlow Condensed Bold').rawFontData).toHaveLength(103_912);
  }, 60_000);

  it('картинки canva-page-notes.pptx несут путь ppt/media/image1.png', async () => {
    // Ловит переименование поля `imagePath` в библиотеке: переходник читает
    // его по имени (`pptx.ts`), а `openPptx.ts` — тем же именем, поэтому
    // расхождение молчало бы до сборки карты байтов в браузере.
    const deck = await readDeck('canva-page-notes.pptx');
    const paths: string[] = [];
    for (const slide of deck.slides) {
      for (const el of slide.elements) {
        if (el.type === 'picture' || el.type === 'image') paths.push(el.imagePath ?? '');
      }
    }

    // На фикстуре 10 элементов ссылаются на один и тот же файл картинки —
    // измерено контроллером, см. constraints.md.
    expect(paths).toHaveLength(10);
    expect(paths.every((p) => p === 'ppt/media/image1.png')).toBe(true);
  }, 60_000);

  it('страница Canva ровно 1920 × 1080 — сцена один в один', async () => {
    // sldSz 18288000 × 10287000 EMU = 20 × 11.25 дюйма = 1920 × 1080 при 96 dpi.
    const deck = await readDeck('canva-page-text.pptx');
    expect(deck.width).toBe(1920);
    expect(deck.height).toBe(1080);
  }, 60_000);

  it('заметка докладчика доезжает из файла в текст озвучки', async () => {
    // Положительный контроль поставлен руками: заметка вписана в Canva,
    // найдена в ppt/notesSlides/ и прочитана библиотекой байт в байт.
    const deck = await readDeck('canva-page-notes.pptx');
    const { project, report } = projectFromPptx(deck);

    expect(report.pagesWithNotes).toBe(1);
    expect(project.segments[0]!.speech).toBe('КОНТРОЛЬ-ЗАМЕТКИ-40 проверка доезда в pptx');
  }, 60_000);

  it('настоящая страница проходит схему целиком', async () => {
    // `projectFromPptx` собирает проект через `loadProject`, поэтому сам
    // факт возврата уже означает валидность. Проверяется здесь ИМЕННО это:
    // слом — вернуть черновик приведением типа вместо разбора — сделает
    // тест зелёным по неверной причине, поэтому рядом стоит проверка
    // умолчаний, которые проставляет ТОЛЬКО схема.
    const deck = await readDeck('canva-page-text.pptx');
    const { project } = projectFromPptx(deck);

    expect(project.schemaVersion).toBeGreaterThanOrEqual(13);
    // Тема сцены — умолчание схемы. В черновике её нет вовсе.
    expect(project.meta.theme['--scene-bg']).toBeTruthy();
  }, 60_000);
});
