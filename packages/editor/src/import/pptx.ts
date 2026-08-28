/**
 * Переходник: разобранная презентация → проект.
 *
 * Один нормализатор с адаптерами — решение [Р] `product.md` §11. Здесь
 * адаптер ровно один, pptx, и он же пока единственный вход.
 *
 * **Библиотека сюда НЕ импортируется.** Вход описан своим минимальным
 * интерфейсом, поэтому модуль проверяется без 14-мегабайтного движка
 * разбора, а его логика не зависит от чужих релизов. Цена названа
 * в [ADR-031](../../../../docs/adr/ADR-031-pptx-import.md): переименование
 * поля в библиотеке компилятор не поймает, и это ловит отдельный тест,
 * прогоняющий настоящую библиотеку на настоящем файле.
 *
 * → [ADR-031](../../../../docs/adr/ADR-031-pptx-import.md)
 */
import {
  DEFAULT_TRANSITION_SECONDS,
  loadProject,
  SCHEMA_VERSION,
  type Project,
  type ProjectInput,
} from '@player/core';

/**
 * Куски проекта ДО умолчаний — выведены из той же схемы.
 *
 * Не описаны здесь руками намеренно: второе описание умолчаний разъехалось
 * бы с первым молча, и первым разъехалось бы то, что тише всего — состояние
 * элемента с его десятком полей.
 */
type SegmentInput = ProjectInput['segments'][number];
type ElementInput = SegmentInput['elements'][number];
type SlideInput = SegmentInput['slides'][number];
type StateInput = SlideInput['states'][string];

/**
 * Сколько секунд отводится странице при импорте.
 *
 * Это ЗАГОТОВКА, а не измерение, и так и называется. Вывести длительность
 * не из чего: озвучки ещё нет, а темп речи у нас не измерен — подставить
 * «слов в минуту» значило бы выдать догадку за число (решение владельца
 * 15.08.2026: импорт даёт шаблон, метки автор расставляет сам).
 *
 * Одно число на все страницы намеренно. Правило «длинная заметка — длиннее
 * страница» выглядит умнее, но опирается на тот же неизмеренный темп речи
 * и разъедется с реальной озвучкой ровно так же, только незаметнее.
 */
export const IMPORT_SLIDE_SECONDS = 5;

/** Сколько EMU в одном пикселе сцены. Измерено, см. ADR-031. */
export const EMU_PER_PX = 9525;

// ---------------------------------------------------------------------------
// Вход: минимум, который мы читаем у разобранной презентации.
// ---------------------------------------------------------------------------

export interface PptxTextStyle {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly color?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly align?: string;
  readonly characterSpacing?: number;
  readonly lineSpacingExactPt?: number;
}

export interface PptxShapeStyle {
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  /**
   * Наконечники стрелок соединителя, как их отдаёт библиотека:
   * `'none'` | `'triangle'` | … Ширина/длина наконечника (`…ArrowWidth`,
   * `…ArrowLength`) сюда намеренно не входят — их пока никто не рисует
   * (задача 4), а поле, которое никто не читает, — это долг.
   */
  readonly connectorStartArrow?: string;
  readonly connectorEndArrow?: string;
}

export interface PptxElement {
  readonly type: string;
  readonly name?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly flipHorizontal?: boolean;
  readonly flipVertical?: boolean;
  readonly text?: string;
  readonly textStyle?: PptxTextStyle;
  readonly shapeType?: string;
  readonly shapeStyle?: PptxShapeStyle;
  readonly children?: readonly PptxElement[];
  /** Путь картинки внутри презентации (например `ppt/media/image1.png`). */
  readonly imagePath?: string;
  /** Контур произвольной фигуры (`shapeType === 'custom'`), строка SVG-пути. */
  readonly pathData?: string;
  /** Система координат `pathData`, EMU. Обязана идти парой с `pathData`. */
  readonly pathWidth?: number;
  readonly pathHeight?: number;
}

export interface PptxSlide {
  readonly elements: readonly PptxElement[];
  readonly notes?: string | null;
  readonly backgroundColor?: string | null;
}

export interface PptxDeck {
  readonly width: number;
  readonly height: number;
  readonly slides: readonly PptxSlide[];
}

export interface ImportOptions {
  /** Заголовок проекта. Обычно имя файла без расширения. */
  readonly title?: string;
  /** Сколько секунд отводить странице. По умолчанию — заготовка. */
  readonly secondsPerSlide?: number;
  /**
   * Путь картинки внутри презентации → ключ её байтов в хранилище плеера.
   *
   * Байты достаёт `openPptx.ts` (мост к библиотеке); сюда приходит уже
   * готовая карта — переходник в хранилище не ходит (ADR-031).
   */
  readonly assetIdByPath?: ReadonlyMap<string, string>;
  /** Шрифты, уже уложенные в хранилище плеера, тем же приёмом. */
  readonly fonts?: readonly { readonly family: string; readonly assetId: string }[];
}

/** Что импорт срезал и почему — чтобы сказать автору, а не умолчать. */
export interface ImportReport {
  readonly slides: number;
  readonly elements: number;
  /** Служебные фигуры, которые ничего не рисуют. */
  readonly droppedInvisible: number;
  /**
   * Картинки, для которых байты достать НЕ удалось: приезжают пустой рамкой
   * без `assetId`. Раньше это было ЛЮБОЙ картинкой (байты не доставались
   * вовсе); теперь картинка — это отказ по конкретному пути, а не правило.
   */
  readonly picturesWithoutBytes: number;
  /** Картинки, получившие ключ байтов в хранилище плеера. */
  readonly picturesWithBytes: number;
  /** Шрифтов, переданных доводом и уложенных в `project.fonts`. */
  readonly fonts: number;
  /**
   * Фигур, приехавших контуром (`path`), а не прямоугольником со своим
   * оформлением. Считает и произвольные фигуры Canva, и пресетные линии —
   * контур для линии строится отдельно, из габарита и признаков отражения.
   */
  readonly vectors: number;
  /** Страниц, с которых приехал текст заметок. */
  readonly pagesWithNotes: number;
}

export interface ImportResult {
  readonly project: Project;
  readonly report: ImportReport;
}

// ---------------------------------------------------------------------------

/** Наш тип элемента по типу из презентации. */
function elementType(source: PptxElement): ElementInput['type'] {
  if (source.type === 'text') return 'text';
  if (source.type === 'group') return 'group';
  if (source.type === 'picture' || source.type === 'image') return 'image';
  // connector, ole, table, chart, ink, unknown — всё это прямоугольник
  // со своим оформлением. Нового типа схема не получает: измерено, что
  // непрямоугольного в нашем материале нет (ADR-031).
  return 'shape';
}

/** Цвет, который что-то закрашивает. `transparent` и пустое — не закрашивают. */
function paints(color: string | undefined): color is string {
  return color !== undefined && color !== '' && color !== 'transparent' && color !== 'none';
}

/**
 * Рисует ли фигура хоть что-нибудь.
 *
 * Правило простое: фигура без заливки и без обводки не рисует ничего,
 * и переносить её значит принести автору невидимый прямоугольник,
 * который нельзя ни увидеть, ни объяснить.
 *
 * **На материале владельца не срабатывает НИ РАЗУ** — проверено прогоном
 * 26-страничной презентации: `отброшеноНевидимых: 0`. Это правило,
 * а не следствие наблюдения, и разница названа честно.
 *
 * Раньше здесь стояло, что Canva кладёт вокруг картинок отдельные
 * прозрачные рамки-обтравки. Это НЕВЕРНО: прозрачна маска самой картинки
 * (`picture/custom/transparent` — 113 штук), отдельных элементов нет.
 * Все 93 фигуры-украшения имеют настоящую заливку.
 */
function drawsSomething(source: PptxElement): boolean {
  const style = source.shapeStyle;
  if (paints(style?.fillColor)) return true;
  if (paints(style?.strokeColor) && (style?.strokeWidth ?? 0) > 0) return true;
  return false;
}

function textProps(style: PptxTextStyle | undefined): Record<string, string | number> {
  const props: Record<string, string | number> = {};
  if (style === undefined) return props;

  // Запасной `sans-serif` — не украшение, а совпадение с Canva. Измерено
  // контроллером 27.08.2026 в живой Canva: её собственный `Barlow
  // Condensed` кириллицы не несёт, и кириллический текст она сама рисует
  // ЗАПАСНЫМ шрифтом (`АГЕНТСТВО`: вшитым 607.23 = запасным 607.23,
  // латиница расходится: 492.61 против 667.09 — прибор различает шрифты).
  // Без явного запасного браузер взял бы засечковый Times, и слайд
  // выглядел бы чужим — единственный способ совпасть с Canva это упасть
  // в ТОТ ЖЕ запасной, а не в свой.
  if (style.fontFamily) props['font-family'] = `"${style.fontFamily}", sans-serif`;
  // Кегль библиотека отдаёт в ПИКСЕЛЯХ, согласованно с координатами
  // (18 pt приезжают как 24). Проверено спайком: 119.09 pt → 158.7866 px.
  if (style.fontSize !== undefined) props['font-size'] = `${round(style.fontSize)}px`;
  if (style.color) props['color'] = style.color;
  if (style.bold) props['font-weight'] = 'bold';
  if (style.italic) props['font-style'] = 'italic';
  if (style.align) props['text-align'] = style.align;
  // Трекинг в OOXML — сотые доли пункта.
  if (style.characterSpacing) props['letter-spacing'] = `${round(style.characterSpacing / 100)}pt`;
  if (style.lineSpacingExactPt) props['line-height'] = `${round(style.lineSpacingExactPt)}pt`;
  return props;
}

function shapeProps(style: PptxShapeStyle | undefined): Record<string, string | number> {
  const props: Record<string, string | number> = {};
  if (style === undefined) return props;

  if (paints(style.fillColor)) props['background'] = style.fillColor;
  if (paints(style.strokeColor) && (style.strokeWidth ?? 0) > 0) {
    props['border'] = `${round(style.strokeWidth ?? 1)}px solid ${style.strokeColor}`;
  }
  return props;
}

/**
 * Краска контура — свойствами стиля, а не внутри самого контура.
 *
 * Так автор может перекрасить фигуру полосой свойств, как любой другой
 * элемент (ловушка №5, `constraints.md`). `stroke-width` — БЕЗ единиц:
 * `fixtures/projects/vectors.json` уже хранит его так (`"4"`, не `"4px"`),
 * и два способа записать одно и то же разъехались бы молча.
 */
function vectorProps(style: PptxShapeStyle | undefined): Record<string, string | number> {
  const props: Record<string, string | number> = {};
  if (style === undefined) return props;

  props['fill'] = paints(style.fillColor) ? style.fillColor : 'none';
  if (paints(style.strokeColor) && (style.strokeWidth ?? 0) > 0) {
    props['stroke'] = style.strokeColor;
    props['stroke-width'] = `${round(style.strokeWidth ?? 1)}`;
  }
  return props;
}

/**
 * Контур фигуры, если он у неё есть.
 *
 * Два независимых источника, а не один общий разбор:
 *
 * - произвольная фигура (`shapeType === 'custom'`) отдаёт `pathData` готовой
 *   строкой SVG и свою систему координат `pathWidth`/`pathHeight` (EMU) —
 *   переносится как есть, без пересчёта;
 * - пресетная линия (`shapeType === 'line'`) контура НЕ ОТДАЁТ вовсе,
 *   только габарит и признаки отражения (измерено, `constraints.md`).
 *   Контур строится из угла в угол ПО ГАБАРИТУ элемента (`width`/`height`
 *   в пикселях сцены, те же, что у состояния слайда), направление — по
 *   таблице отражений из брифа задачи 3.
 *
 * Фигуры без того и другого (пресеты вроде `rect`, `roundRect`) контура
 * не получают — для них остаётся прежнее поведение: прямоугольник со своим
 * `background`/`border`.
 */
function shapePath(source: PptxElement): { d: string; width: number; height: number } | undefined {
  if (
    source.shapeType === 'custom'
    && source.pathData !== undefined
    && source.pathWidth !== undefined
    && source.pathHeight !== undefined
  ) {
    return {
      d: source.pathData,
      // Зажато снизу единицей — см. комментарий у линии ниже. Вырожденная
      // (нулевая) сторона — законный габарит контура (тонкий разделитель),
      // а не ошибка данных; схема же требует строго положительных чисел.
      width: Math.max(source.pathWidth, 1),
      height: Math.max(source.pathHeight, 1),
    };
  }

  if (source.shapeType === 'line') {
    const w = round(source.width);
    const h = round(source.height);
    const flipH = source.flipHorizontal ?? false;
    const flipV = source.flipVertical ?? false;

    // Строка пути — по НЕзажатым числам: горизонтальная линия (height 0)
    // обязана остаться горизонтальной (`L 500 0`), а не «утолщиться»
    // до `L 500 1` только потому, что viewBox не может быть нулевым.
    const d = flipH && flipV ? `M ${w} ${h} L 0 0`
      : flipH ? `M ${w} 0 L 0 ${h}`
        : flipV ? `M 0 ${h} L ${w} 0`
          : `M 0 0 L ${w} ${h}`;

    // Система координат (`viewBox`) — ЗАЖАТА снизу единицей: схема требует
    // строго положительных `width`/`height` (делит на них для масштаба),
    // а горизонтальный/вертикальный разделитель — обычный слайд, не
    // крайний случай. Найдено прогоном контроллера 27.08.2026: без зажима
    // `projectFromPptx` бросал `ProjectLoadError` на первой же линии
    // с нулевой стороной. Сам элемент своего габарита НЕ меняет —
    // зажимается только объект контура, не `states[id].width/height`.
    return { d, width: Math.max(w, 1), height: Math.max(h, 1) };
  }

  return undefined;
}

/**
 * Наконечники стрелок соединителя — свойствами контура, а не рисованием:
 * задача 3 только доносит данные, рисует задача 4.
 *
 * `'none'` не кладётся вовсе: отсутствие наконечника выражается
 * отсутствием поля, тем же приёмом, что у отсутствующего текста заметок
 * (`speech`) — иначе у одного смысла было бы два состояния.
 */
function arrowProps(style: PptxShapeStyle | undefined): { startArrow?: string; endArrow?: string } {
  const props: { startArrow?: string; endArrow?: string } = {};
  if (style === undefined) return props;

  if (style.connectorStartArrow !== undefined && style.connectorStartArrow !== 'none') {
    props.startArrow = style.connectorStartArrow;
  }
  if (style.connectorEndArrow !== undefined && style.connectorEndArrow !== 'none') {
    props.endArrow = style.connectorEndArrow;
  }
  return props;
}

/** Три знака после запятой: дальше идёт шум разбора, а не геометрия. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Разворачивает дерево страницы в плоские списки.
 *
 * Дерево у нас выражено ССЫЛКОЙ ВВЕРХ (`parentId`, схема v11), а не списком
 * детей, поэтому обход отдаёт два параллельных списка: элементы проекта
 * и их состояния на этом слайде.
 */
function walk(
  sources: readonly PptxElement[],
  page: number,
  parentId: string | undefined,
  assetIdByPath: ReadonlyMap<string, string> | undefined,
  counter: {
    next: number;
    dropped: number;
    picturesWithBytes: number;
    picturesWithoutBytes: number;
    vectors: number;
  },
  elements: ElementInput[],
  states: Record<string, StateInput>,
): void {
  for (const source of sources) {
    const type = elementType(source);
    const hasChildren = (source.children?.length ?? 0) > 0;

    // Фигура, которая ничего не рисует и никого не держит, не переносится.
    if (type === 'shape' && !hasChildren && !drawsSomething(source)) {
      counter.dropped += 1;
      continue;
    }

    const assetId = type === 'image' && source.imagePath !== undefined
      ? assetIdByPath?.get(source.imagePath)
      : undefined;
    if (type === 'image') {
      if (assetId !== undefined) counter.picturesWithBytes += 1;
      else counter.picturesWithoutBytes += 1;
    }

    const basePath = type === 'shape' ? shapePath(source) : undefined;
    const path = basePath === undefined
      ? undefined
      : { ...basePath, ...arrowProps(source.shapeStyle) };
    if (path !== undefined) counter.vectors += 1;

    const id = `p${page}-e${counter.next}`;
    counter.next += 1;

    elements.push({
      id,
      type,
      content: type === 'text' ? (source.text ?? '') : '',
      ...(parentId === undefined ? {} : { parentId }),
      ...(assetId === undefined ? {} : { assetId }),
      ...(path === undefined ? {} : { path }),
    });

    states[id] = {
      x: round(source.x),
      y: round(source.y),
      width: round(source.width),
      height: round(source.height),
      rotation: round(source.rotation ?? 0),
      // Порядок в списке И ЕСТЬ порядок слоёв: в OOXML он задан порядком
      // в `spTree`, и библиотека его сохраняет (проверено на слайде 1).
      zIndex: elements.length,
      opacity: 1,
      visible: true,
      flipX: source.flipHorizontal ?? false,
      flipY: source.flipVertical ?? false,
      style: type === 'text'
        ? textProps(source.textStyle)
        : path !== undefined
          ? vectorProps(source.shapeStyle)
          : shapeProps(source.shapeStyle),
    };

    if (hasChildren) {
      walk(source.children ?? [], page, id, assetIdByPath, counter, elements, states);
    }
  }
}

/**
 * Собирает проект из разобранной презентации.
 *
 * **Вся презентация — ОДИН кусок** (решение владельца 15.08.2026): страницы
 * идут слайдами подряд, заметки склеиваются в текст озвучки. Так автор
 * получает шаблон, который сам режет на куски там, где ему нужно, — а не
 * двадцать шесть кусков, которые придётся сшивать обратно.
 *
 * Кусок получается НЕМЫМ (схема v13): звука у презентации нет ниоткуда.
 */
export function projectFromPptx(deck: PptxDeck, options: ImportOptions = {}): ImportResult {
  if (deck.slides.length === 0) {
    // Громко и здесь. Пустой проект прошёл бы схему (`slides` требует
    // минимум один слайд, и мы бы его выдумали) и выглядел бы как
    // «импорт сработал, но презентация пустая» — неверное объяснение.
    throw new Error('В презентации нет ни одной страницы — импортировать нечего');
  }

  const secondsPerSlide = options.secondsPerSlide ?? IMPORT_SLIDE_SECONDS;
  const counter = {
    next: 0,
    dropped: 0,
    picturesWithBytes: 0,
    picturesWithoutBytes: 0,
    vectors: 0,
  };
  const elements: ElementInput[] = [];
  const slides: SlideInput[] = [];
  const speeches: string[] = [];

  for (const [index, page] of deck.slides.entries()) {
    const states: Record<string, StateInput> = {};
    const page1 = index + 1;

    // Фон страницы — ПОДЛОЖКОЙ во всю сцену, а не темой проекта.
    //
    // Найдено глазами в браузере, когда все 22 теста были зелёными: без
    // этого объекты ложатся на тёмную сцену темы, а текст у них свой,
    // тёмный, — и импортированный слайд получается нечитаемым. Геометрия
    // при этом сходится до пикселя, поэтому ни один тест на раскладку
    // такого не поймал бы.
    //
    // Именно подложкой, а не `--scene-bg`: фон свой У КАЖДОЙ страницы
    // (измерено: 26 из 26), а тема одна на проект — она сгодилась бы
    // только для первой страницы и молча испортила бы остальные.
    if (page.backgroundColor) {
      const id = `p${page1}-bg`;
      elements.push({ id, type: 'shape', content: '' });
      states[id] = {
        x: 0,
        y: 0,
        width: deck.width,
        height: deck.height,
        rotation: 0,
        // Ниже всех: подложка обязана стоять под содержимым страницы.
        zIndex: 0,
        opacity: 1,
        visible: true,
        flipX: false,
        flipY: false,
        style: { background: page.backgroundColor },
      };
    }

    walk(page.elements, page1, undefined, options.assetIdByPath, counter, elements, states);

    slides.push({
      id: `sl-${index + 1}`,
      // Секунды, а не слова: расшифровки нет и быть не может, а инвариант
      // №10 разрешает секунды ровно там, где слова нет.
      at: { kind: 'seconds', t: round(index * secondsPerSlide) },
      transition: 'cut',
      transitionSeconds: DEFAULT_TRANSITION_SECONDS,
      states,
    });

    const notes = (page.notes ?? '').trim();
    if (notes.length > 0) speeches.push(notes);
  }

  const segment: SegmentInput = {
    id: 's-import',
    title: options.title ?? 'Импорт',
    description: '',
    // Пустая строка запрещена схемой: отсутствие текста выражается
    // отсутствием поля. Заметок может не быть вовсе — измерено, что
    // у настоящих презентаций их часто нет ни на одной странице.
    ...(speeches.length > 0 ? { speech: speeches.join('\n\n') } : {}),
    audio: {
      // Ни `src`, ни `fileId`: кусок немой. → ADR-030
      offset: 0,
      duration: round(deck.slides.length * secondsPerSlide),
      words: [],
    },
    elements,
    slides,
    gates: [],
    exit: { rules: [], default: null },
  };

  const draft: ProjectInput = {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      title: options.title ?? 'Импорт',
      // Размер берётся у презентации, а не подставляется наш: у Canva
      // страница ровно 1920 × 1080 и совпадает со сценой один в один,
      // но презентация из другого источника вправе быть другой.
      stageWidth: deck.width,
      stageHeight: deck.height,
    },
    entry: segment.id,
    styles: [],
    segments: [segment],
    // Уложены хранилищем плеера (`openPptx.ts`), сюда приходят готовым
    // списком — переходник не ходит в IndexedDB (ADR-031). Умолчание
    // схемы — пустой список, поэтому без шрифтов поле просто не добавится
    // ничего лишнего.
    fonts: options.fonts !== undefined ? [...options.fonts] : [],
  };

  // Через настоящий разбор, а не приведением типа. Умолчания проставляет
  // СХЕМА — тема сцены, `visible`, `zIndex` и десяток полей состояния, —
  // и она же ловит любую ошибку раскладки прямо здесь, в импорте, а не
  // у автора на экране. Приведение типа заглушило бы ровно эту проверку.
  const project: Project = loadProject(draft);

  return {
    project,
    report: {
      slides: deck.slides.length,
      elements: elements.length,
      droppedInvisible: counter.dropped,
      picturesWithoutBytes: counter.picturesWithoutBytes,
      picturesWithBytes: counter.picturesWithBytes,
      fonts: options.fonts?.length ?? 0,
      vectors: counter.vectors,
      pagesWithNotes: speeches.length,
    },
  };
}
