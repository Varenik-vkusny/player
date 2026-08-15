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
}

/** Что импорт срезал и почему — чтобы сказать автору, а не умолчать. */
export interface ImportReport {
  readonly slides: number;
  readonly elements: number;
  /** Служебные фигуры, которые ничего не рисуют. */
  readonly droppedInvisible: number;
  /** Картинки, приехавшие пустыми рамками: байты режутся, см. ADR-031. */
  readonly picturesWithoutBytes: number;
  /**
   * Линии и соединители, приехавшие рамкой по своему габариту.
   *
   * Рисовать линию нам нечем: в схеме есть прямоугольник, а не отрезок.
   * Отбросить их значило бы молча убрать стрелки со схемы автора, поэтому
   * они остаются на своём месте и своего размера — но выглядят прямоугольником,
   * и об этом надо сказать, а не дать автору гадать.
   */
  readonly linesAsFrames: number;
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

  if (style.fontFamily) props['font-family'] = style.fontFamily;
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
  counter: { next: number; dropped: number; pictures: number; lines: number },
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
    if (type === 'image') counter.pictures += 1;
    if (source.shapeType === 'line' || source.type === 'connector') counter.lines += 1;

    const id = `p${page}-e${counter.next}`;
    counter.next += 1;

    elements.push({
      id,
      type,
      content: type === 'text' ? (source.text ?? '') : '',
      ...(parentId === undefined ? {} : { parentId }),
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
      style: type === 'text' ? textProps(source.textStyle) : shapeProps(source.shapeStyle),
    };

    if (hasChildren) {
      walk(source.children ?? [], page, id, counter, elements, states);
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
  const counter = { next: 0, dropped: 0, pictures: 0, lines: 0 };
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

    walk(page.elements, page1, undefined, counter, elements, states);

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
      picturesWithoutBytes: counter.pictures,
      linesAsFrames: counter.lines,
      pagesWithNotes: speeches.length,
    },
  };
}
