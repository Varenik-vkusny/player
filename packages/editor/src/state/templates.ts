/**
 * Шаблоны сцены: готовый набор элементов и, если нужно, гейт, который
 * применение кладёт в сегмент одним действием — ДАННЫЕ, а не код (тот же
 * приём, что `state/library.ts`, и то же требование теста: пополнение
 * каталога — это дописанная запись в `SCENE_TEMPLATES`, а не правка React,
 * см. `test/templates.test.ts`, «пополнение не требует правок в React»).
 *
 * Шаблон описывает элементы через `dx`/`dy` — смещение от центра сцены,
 * а не абсолютные `x`/`y`: так шаблон остаётся годным для любого размера
 * сцены (см. `createElement`, тот же приём для одиночной вставки).
 *
 * **Появление во времени в схеме v3.** Кью больше нет — появление элемента
 * выражается тем, что на СЛАЙДЕ появления его состояние отличается от
 * состояния на предыдущем слайде (плеер анимирует переход сам, FLIP).
 * Элементы заготовки ложатся на кадры главы КАК ЕСТЬ, в своём финальном
 * виде. Появления у заготовок больше нет — решение владельца 25.08.2026,
 * разбор в комментарии к `SceneTemplate.elements` ниже.
 *
 * Гейт — другое дело: у него свой момент (`TemplateGate.atSeconds`), это
 * секунда ОСТАНОВКИ. Вопрос выносится на сцену к этой секунде отдельной
 * механикой (`askOnStage`), и она использует `insertOrPatchSlideAt`.
 */
import { DEFAULT_TRANSITION_SECONDS, resolveTimeRef } from '@player/core';
import type { Element, ElementState, Gate, Segment, Slide, TimeRef, Word } from '@player/core';

import { freeId } from './elements.js';
import { bindOption, setGateKind } from './gates.js';
import { libraryItem } from './library.js';

/** Что шаблон кладёт на сцену: элемент из библиотеки со сдвигом и своим текстом. */
export interface TemplateElement {
  /** id заготовки из ELEMENT_LIBRARY. */
  readonly item: string;
  /** Смещение центра элемента относительно центра сцены, в единицах сцены. */
  readonly dx: number;
  readonly dy: number;
  readonly width?: number;
  readonly height?: number;
  readonly content?: string;
  readonly style?: Readonly<Record<string, string | number>>;
  /*
   * ПОЛЕЙ ПОЯВЛЕНИЯ У ЭЛЕМЕНТА ЗАГОТОВКИ БОЛЬШЕ НЕТ. Решение владельца
   * 25.08.2026: плитка кладёт ровно то, что на ней нарисовано, одним
   * кадром — без второго кадра, без ромбика и без анимации.
   *
   * Было иначе: почти каждая заготовка объявляла отложенное появление
   * (0.2 / 0.4 / 0.5 / 0.6 / 0.8 / 1.0 / 1.2 с), и автор, нажав плитку
   * «Название объяснения», получал вдобавок кадр на 0.5 с и морфинг
   * на 0.6 с. На плитке не было показано ни одного из трёх: снимок
   * плитки рисуется по нулевой секунде, где второй текст ещё скрыт.
   *
   * Владелец упёрся в это трижды и сказал прямо: «какого хуя, если я
   * создал слайд с заголовком с первой секунды, то почему подзаголовок
   * появляется только после него».
   *
   * Появление никуда не делось как механика — его включает АВТОР, когда
   * захочет: разница между соседними кадрами и есть анимация.
   * У гейта своё `atSeconds` (TemplateGate ниже) и оно остаётся:
   * это момент ОСТАНОВКИ, а не появление элемента.
   */
}

/**
 * Гейт шаблона. Варианты ссылаются на элементы `SceneTemplate.elements`
 * по ПОРЯДКОВОМУ номеру, а не по id: id элемента вычисляется через `freeId`
 * только в момент вставки и заранее неизвестен.
 */
export interface TemplateGate {
  readonly atSeconds: number;
  readonly prompt: string;
  readonly optionIndexes: readonly number[];
  readonly correctIndex: number;
}

/**
 * Раздел каталога, в котором стоит заготовка.
 *
 * Заведён 20.08.2026: у натуры панель разбита на именованные разделы
 * («Недавно использованные», «Больше шаблонов для вас», «Просмотр
 * категорий»), а у нас была одна сплошная сетка. Владелец сказал прямо:
 * «надо структурировать во всех категориях так же, как в Канве».
 *
 * Разделы у нас СМЫСЛОВЫЕ, а не «недавние» и «рекомендованные»: последние
 * два — это состояние пользователя и работа их сервера, а у нас ни того,
 * ни другого нет. Пустой раздел «Недавно использованные» был бы обманом
 * той же породы, что пункт рейки без содержимого.
 *
 * Перечень закрытый: забытый раздел обязан ломать типизацию, а не молча
 * ронять заготовку из панели.
 */
export type TemplateGroup = 'начало' | 'текст' | 'раскладка' | 'вопрос';

export interface SceneTemplate {
  readonly id: string;
  readonly label: string;
  /** В каком разделе панели показывать. */
  readonly group: TemplateGroup;
  readonly elements: readonly TemplateElement[];
  readonly gate?: TemplateGate;
}

const WHITE = '#f5f7fa';
const ACCENT_TEXT = '#4c8dff';
const MUTED = '#9fb0c4';
const PANEL = '#1b2430';
const SANS = 'system-ui, sans-serif';

/**
 * Пять заготовок сцены. Метки времени — секунды, не слова (инвариант №10):
 * у произвольной дорожки, на которую ляжет шаблон, слов может не быть.
 *
 * Ни одна метка не позже 3 с — короче любой дорожки в фикстурах проекта.
 */
export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
  {
    id: 'title',
    label: 'Заголовок',
    group: 'текст',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: 0,
        width: 1400,
        height: 220,
        content: 'Заголовок',
        style: {
          'font-family': SANS,
          'font-size': '96px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
      },
    ],
  },
  {
    id: 'title-text',
    label: 'Заголовок и текст',
    group: 'текст',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: -260,
        width: 1400,
        height: 160,
        content: 'Заголовок',
        style: {
          'font-family': SANS,
          'font-size': '64px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
      },
      {
        item: 'text',
        dx: 0,
        dy: 60,
        width: 1200,
        height: 300,
        content: 'Поясняющий текст под заголовком.',
        style: {
          'font-family': SANS,
          'font-size': '32px',
          color: MUTED,
          'line-height': '1.5',
          'text-align': 'center',
        },
      },
    ],
  },
  {
    id: 'two-columns',
    label: 'Сравнение двух колонок',
    group: 'раскладка',
    elements: [
      // Панели-подложки сперва — идут в сцену первыми и остаются позади
      // текста (zIndex растёт по порядку заготовки, см. applyTemplate).
      {
        item: 'shape',
        dx: -440,
        dy: 0,
        width: 720,
        height: 640,
        style: { background: PANEL, 'border-radius': '20px' },
      },
      {
        item: 'shape',
        dx: 440,
        dy: 0,
        width: 720,
        height: 640,
        style: { background: PANEL, 'border-radius': '20px' },
      },
      {
        item: 'text',
        dx: -440,
        dy: -220,
        width: 640,
        height: 120,
        content: 'Вариант A',
        style: { 'font-family': SANS, 'font-size': '44px', 'font-weight': '700', color: WHITE, 'text-align': 'center' },
      },
      {
        item: 'text',
        dx: 440,
        dy: -220,
        width: 640,
        height: 120,
        content: 'Вариант Б',
        style: { 'font-family': SANS, 'font-size': '44px', 'font-weight': '700', color: WHITE, 'text-align': 'center' },
      },
      {
        item: 'text',
        dx: -440,
        dy: 40,
        width: 640,
        height: 400,
        content: 'Описание первого варианта.',
        style: { 'font-family': SANS, 'font-size': '28px', color: MUTED, 'line-height': '1.5', 'text-align': 'center' },
      },
      {
        item: 'text',
        dx: 440,
        dy: 40,
        width: 640,
        height: 400,
        content: 'Описание второго варианта.',
        style: { 'font-family': SANS, 'font-size': '28px', color: MUTED, 'line-height': '1.5', 'text-align': 'center' },
      },
    ],
  },
  {
    id: 'bullets',
    label: 'Список пунктов',
    group: 'текст',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: -300,
        width: 1200,
        height: 140,
        content: 'Список пунктов',
        style: {
          'font-family': SANS,
          'font-size': '56px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
      },
      {
        item: 'text',
        dx: 0,
        dy: -80,
        width: 1000,
        height: 100,
        content: 'Первый пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
      },
      {
        item: 'text',
        dx: 0,
        dy: 40,
        width: 1000,
        height: 100,
        content: 'Второй пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
      },
      {
        item: 'text',
        dx: 0,
        dy: 160,
        width: 1000,
        height: 100,
        content: 'Третий пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
      },
    ],
  },
  {
    id: 'question',
    label: 'Вопрос с вариантами',
    group: 'вопрос',
    elements: [
      {
        item: 'text',
        dx: 0,
        dy: -260,
        width: 1400,
        height: 160,
        content: 'Вопрос?',
        style: {
          'font-family': SANS,
          'font-size': '56px',
          'font-weight': '700',
          color: WHITE,
          'text-align': 'center',
        },
      },
      {
        item: 'text',
        dx: -380,
        dy: 140,
        width: 700,
        height: 160,
        content: 'Вариант 1',
        style: {
          'font-family': SANS,
          'font-size': '40px',
          color: WHITE,
          'text-align': 'center',
          background: PANEL,
          'border-radius': '20px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        },
      },
      {
        item: 'text',
        dx: 380,
        dy: 140,
        width: 700,
        height: 160,
        content: 'Вариант 2',
        style: {
          'font-family': SANS,
          'font-size': '40px',
          color: WHITE,
          'text-align': 'center',
          background: PANEL,
          'border-radius': '20px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        },
      },
    ],
    // Варианты привязаны к элементам сцены (индексы 1 и 2, ADR-035): зритель
    // жмёт по тому, что нарисовал автор, а не по системной кнопке поверх.
    gate: { atSeconds: 1, prompt: 'Вопрос?', optionIndexes: [1, 2], correctIndex: 1 },
  },
  /*
   * РАСКЛАДКИ ПО ИНДУСТРИАЛЬНОМУ ПЕРЕЧНЮ (добавлены 20.08.2026).
   *
   * Состав НЕ выдуман и не срисован с чужого экрана: взят перечень
   * встроенных раскладок Slidev (MIT, sli.dev/builtin/layouts) — cover,
   * intro, section, statement, quote, fact, two-cols, two-cols-header,
   * center, image-left/right, end. Тот же по смыслу набор лежит
   * в PowerPoint, Keynote и Google Slides («Title Slide», «Section
   * Header», «Two Content», «Comparison»), то есть это отраслевой
   * стандарт, а не чья-то собственность. Заимствован СОСТАВ,
   * реализация здесь своя.
   *
   * Зачем: каталог у натуры заполнен доверху, у нас было пять плиток
   * и пустое поле под ними. Похожесть каталога держится на количестве
   * заготовок, а не на вёрстке сетки, — и владелец сказал об этом
   * прямым текстом.
   *
   * Слова «раздел» в подписях НЕТ намеренно: оно запрещено словарём
   * проекта (CLAUDE.md). Slidev-овский section назван «Заставкой».
   *
   * Текст ВНУТРИ заставки — «Глава вторая», а не «Часть вторая», и это
   * тоже словарь, а не вкус. Поймано прогоном в тот же день: страж
   * editor-segments.spec.ts ищет слово «часть» по ВИДИМОМУ ТЕКСТУ
   * страницы и не различает интерфейс и содержимое заготовки. Он прав:
   * заготовка попадает автору на экран, и слово из неё он унесёт
   * в свой словарь.
   */
  {
    id: 'cover',
    label: 'Обложка',
    group: 'начало',
    elements: [
    {
      item: 'text',
      dx: 0,
      dy: -60,
      width: 1500,
      height: 240,
      content: 'Название объяснения',
      style: {
        'font-family': SANS,
        'font-size': '110px',
        'font-weight': '700',
        color: WHITE,
        'text-align': 'center',
      },
    },
    {
      item: 'text',
      dx: 0,
      dy: 130,
      width: 1200,
      height: 100,
      content: 'Кто рассказывает и о чём',
      style: {
        'font-family': SANS,
        'font-size': '44px',
        color: MUTED,
        'text-align': 'center',
      },
    },
    ],
  },
  {
    id: 'divider',
    label: 'Заставка',
    group: 'начало',
    elements: [
    {
      item: 'shape',
      dx: 0,
      dy: 0,
      width: 1920,
      height: 1080,
      style: { background: PANEL, 'border-radius': '0px' },
    },
    {
      item: 'text',
      dx: 0,
      dy: 0,
      width: 1400,
      height: 200,
      content: 'Глава вторая',
      style: {
        'font-family': SANS,
        'font-size': '96px',
        'font-weight': '700',
        color: WHITE,
        'text-align': 'center',
      },
    },
    ],
  },
  {
    id: 'statement',
    label: 'Утверждение',
    group: 'текст',
    elements: [
    {
      item: 'text',
      dx: 0,
      dy: 0,
      width: 1500,
      height: 400,
      content: 'Одна мысль, ради которой всё',
      style: {
        'font-family': SANS,
        'font-size': '84px',
        'font-weight': '700',
        color: WHITE,
        'text-align': 'center',
        'line-height': '1.2',
      },
    },
    ],
  },
  {
    id: 'quote',
    label: 'Цитата',
    group: 'текст',
    elements: [
    {
      item: 'text',
      dx: 0,
      dy: -40,
      width: 1400,
      height: 300,
      content: '«Здесь чужие слова, которые стоит привести дословно»',
      style: {
        'font-family': SANS,
        'font-size': '64px',
        'font-style': 'italic',
        color: WHITE,
        'text-align': 'center',
        'line-height': '1.35',
      },
    },
    {
      item: 'text',
      dx: 0,
      dy: 180,
      width: 900,
      height: 80,
      content: '— кто это сказал',
      style: {
        'font-family': SANS,
        'font-size': '36px',
        color: MUTED,
        'text-align': 'center',
      },
    },
    ],
  },
  {
    id: 'fact',
    label: 'Число крупно',
    group: 'текст',
    elements: [
    {
      item: 'text',
      dx: 0,
      dy: -80,
      width: 1200,
      height: 320,
      content: '87 %',
      style: {
        'font-family': SANS,
        'font-size': '240px',
        'font-weight': '700',
        color: ACCENT_TEXT,
        'text-align': 'center',
      },
    },
    {
      item: 'text',
      dx: 0,
      dy: 180,
      width: 1200,
      height: 120,
      content: 'что именно это число значит',
      style: {
        'font-family': SANS,
        'font-size': '44px',
        color: MUTED,
        'text-align': 'center',
      },
    },
    ],
  },
  {
    id: 'two-cols-header',
    label: 'Заголовок и две колонки',
    group: 'раскладка',
    elements: [
    {
      item: 'text',
      dx: 0,
      dy: -340,
      width: 1500,
      height: 140,
      content: 'Заголовок',
      style: {
        'font-family': SANS,
        'font-size': '72px',
        'font-weight': '700',
        color: WHITE,
        'text-align': 'center',
      },
    },
    {
      item: 'text',
      dx: -390,
      dy: 60,
      width: 700,
      height: 420,
      content: 'Слева',
      style: {
        'font-family': SANS,
        'font-size': '40px',
        color: WHITE,
        'line-height': '1.5',
      },
    },
    {
      item: 'text',
      dx: 390,
      dy: 60,
      width: 700,
      height: 420,
      content: 'Справа',
      style: {
        'font-family': SANS,
        'font-size': '40px',
        color: WHITE,
        'line-height': '1.5',
      },
    },
    ],
  },
  {
    id: 'picture-caption',
    label: 'Картинка с подписью',
    group: 'раскладка',
    elements: [
    {
      item: 'shape',
      dx: 0,
      dy: -70,
      width: 1100,
      height: 620,
      style: { background: PANEL, 'border-radius': '24px' },
    },
    {
      item: 'text',
      dx: 0,
      dy: 330,
      width: 1100,
      height: 100,
      content: 'Что на картинке',
      style: {
        'font-family': SANS,
        'font-size': '40px',
        color: MUTED,
        'text-align': 'center',
      },
    },
    ],
  },
  {
    id: 'text-and-picture',
    label: 'Текст и картинка',
    group: 'раскладка',
    elements: [
    {
      item: 'text',
      dx: -420,
      dy: 0,
      width: 780,
      height: 500,
      content: 'Объяснение слева, а справа то, о чём речь',
      style: {
        'font-family': SANS,
        'font-size': '48px',
        color: WHITE,
        'line-height': '1.4',
      },
    },
    {
      item: 'shape',
      dx: 430,
      dy: 0,
      width: 800,
      height: 560,
      style: { background: PANEL, 'border-radius': '24px' },
    },
    ],
  },
  {
    id: 'closing',
    label: 'Финал',
    group: 'начало',
    elements: [
    {
      item: 'text',
      dx: 0,
      dy: 0,
      width: 1400,
      height: 240,
      content: 'Спасибо',
      style: {
        'font-family': SANS,
        'font-size': '120px',
        'font-weight': '700',
        color: WHITE,
        'text-align': 'center',
      },
    },
    ],
  },
];

/** Заготовка шаблона по id. Бросает, если такой заготовки нет — как `libraryItem`. */
export function sceneTemplate(id: string): SceneTemplate {
  const template = SCENE_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) {
    throw new Error(`Среди шаблонов сцены нет «${id}»`);
  }
  return template;
}

/** Финальное (полностью появившееся) состояние элемента шаблона. */
function finalState(te: TemplateElement, item: ReturnType<typeof libraryItem>, width: number, height: number, stage: { width: number; height: number }, zIndex: number): ElementState {
  return {
    x: stage.width / 2 + te.dx - width / 2,
    y: stage.height / 2 + te.dy - height / 2,
    width,
    height,
    rotation: 0,
    zIndex,
    opacity: 1,
    visible: true,
    flipX: false,
    flipY: false,
    style: te.style ? { ...item.style, ...te.style } : { ...item.style },
  };
}

/**
 * Строит новый элемент шаблона и его финальное (полностью появившееся)
 * состояние — часть `applyTemplate`, вынесенная в отдельную функцию, чтобы
 * `askOnStage` могла собрать элементы вопроса той же геометрией заготовки
 * `question`, не переписывая её числа заново (см. комментарий у `askOnStage`).
 *
 * НЕ добавляет элемент в `elements` — этим заведует вызывающий: порядок
 * вставки (значит, и порядковый `zIndex`) решает он, а не эта функция.
 */
function instantiateTemplateElement(
  te: TemplateElement,
  elements: readonly { id: string }[],
  zIndex: number,
  stage: { width: number; height: number },
): { element: Element; final: ElementState } {
  const item = libraryItem(te.item);
  const width = te.width ?? item.width;
  const height = te.height ?? item.height;
  const element: Element = {
    id: freeId(item.id, elements),
    type: item.type,
    content: te.content ?? item.content,
    // v11: шаблон кладёт элементы верхним уровнем и незапертыми.
    locked: false,
  };
  const final = finalState(te, item, width, height, stage, zIndex);
  return { element, final };
}

/**
 * Вставляет патч состояний в слайд, ДЕЙСТВУЮЩИЙ в момент `atSeconds` —
 * общая механика появления элементов «внутри» сегмента, а не с самого начала.
 *
 * Если слайда ровно на этой секунде нет, вставляет новый: копия состояний
 * ближайшего предыдущего слайда (иначе то, что уже видно, пропало бы) плюс
 * патч. Если слайд ровно на этой секунде уже есть — дописывает патч в него.
 *
 * Вынесена из `applyTemplate` (`laterPatches`), чтобы `askOnStage` могла
 * поставить появление вопроса на секунду ОСТАНОВКИ той же механикой —
 * дважды написанное «вставить слайд появления» разошлось бы на первой же
 * правке одного из двух мест.
 */
function insertOrPatchSlideAt(
  slides: readonly Slide[],
  atSeconds: number,
  patch: Readonly<Record<string, ElementState>>,
  words: readonly Word[],
): Slide[] {
  const at: TimeRef = { kind: 'seconds', t: atSeconds };
  let insertAfter = 0;
  for (let i = 0; i < slides.length; i += 1) {
    if (resolveTimeRef(slides[i]!.at, words) < atSeconds) insertAfter = i;
  }
  const anchor = slides[insertAfter]!;
  const existingAtSameTime = slides.find((slide) => resolveTimeRef(slide.at, words) === atSeconds);

  if (existingAtSameTime) {
    const i = slides.indexOf(existingAtSameTime);
    const next = slides.slice();
    next[i] = { ...existingAtSameTime, states: { ...existingAtSameTime.states, ...patch } };
    return next;
  }

  const newSlide: Slide = {
    id: freeId('slide', slides),
    at,
    transition: 'morph',
    transitionSeconds: DEFAULT_TRANSITION_SECONDS,
    states: { ...anchor.states, ...patch },
  };
  const next = slides.slice();
  next.splice(insertAfter + 1, 0, newSlide);
  return next;
}


/**
 * Применяет шаблон к сегменту — добавляет элементы, их появление и, если он
 * есть, гейт с вариантами, привязанными к только что созданным элементам.
 *
 * ДОБАВЛЯЕТ, не заменяет: у автора на сегменте уже могло что-то лежать.
 * Существующие элементы и слайды остаются ТЕМИ ЖЕ объектами по ссылке
 * (на этом держится решение StageView, пересобирать сцену или обновить один
 * элемент) там, где шаблон их не касается.
 *
 * `zIndex` новых элементов выше всех существующих на первом слайде, id всех
 * новых сущностей свободны — два применения одного шаблона подряд
 * не сталкиваются идентификаторами.
 */
export function applyTemplate(
  template: SceneTemplate,
  segment: Segment,
  stage: { width: number; height: number },
  /**
   * Метки ВСЕХ глав проекта — чтобы имя новой было свободно везде, а не
   * только в этой главе. См. разбор у `freeId('gate', …)` ниже.
   */
  takenGates: readonly { readonly id: string }[] = segment.gates,
): Segment {
  const firstSlide = segment.slides[0];
  if (!firstSlide) {
    throw new Error(`В сегменте «${segment.id}» нет ни одного слайда`);
  }

  const startStates = firstSlide.states;
  const startZ = Object.values(startStates).reduce((max, state) => Math.max(max, state.zIndex), -1) + 1;

  const elements = segment.elements.slice();
  const newElements: Element[] = [];
  /*
   * Состояние элементов заготовки ДО их появления. Ложится на КАЖДЫЙ кадр
   * главы, а не только на первый, — см. разбор ниже.
   */
  /** Состояния, которые заготовка кладёт на КАЖДЫЙ кадр главы. */
  const added: Record<string, ElementState> = {};

  template.elements.forEach((te, index) => {
    const zIndex = startZ + index;
    const { element, final } = instantiateTemplateElement(te, elements, zIndex, stage);
    elements.push(element);
    newElements.push(element);
    added[element.id] = final;
  });

  /*
   * ЗАГОТОВКА КЛАДЁТ СВОИ ЭЛЕМЕНТЫ НА ВСЕ КАДРЫ ГЛАВЫ, А НЕ НА ПЕРВЫЙ.
   *
   * «Элемента нет в состояниях кадра» означает «его нет на сцене»
   * (ADR-015). Писали раньше только в `slides[0]`, и заготовка, положенная
   * в главу с готовыми кадрами, исчезала на следующем же: замер 25.08.2026
   * на трёх кадрах (0 / 0.5 / 20) — элемент лёг только на нулевой.
   */
  const slides: Slide[] = segment.slides.map((slide) => ({
    ...slide,
    states: { ...slide.states, ...added },
  }));

  let gates = segment.gates;
  if (template.gate) {
    const { atSeconds, prompt, optionIndexes, correctIndex } = template.gate;
    const options = optionIndexes.map((optionIndex) => {
      const element = newElements[optionIndex];
      if (!element) {
        throw new Error(`Шаблон «${template.id}»: гейт ссылается на элемент №${optionIndex}, которого нет`);
      }
      /*
       * Связь ответа с фигурой — ПОЛЕМ (ADR-035, схема v15). Раньше здесь
       * варианту давали идентификатор элемента, чтобы плеер нашёл узел
       * совпадением имён; теперь у варианта своё имя и явная ссылка.
       */
      return { id: `option-${optionIndex}`, label: element.content, elementId: element.id };
    });
    const correctElement = newElements[correctIndex];
    if (!correctElement) {
      throw new Error(`Шаблон «${template.id}»: гейт ссылается на элемент №${correctIndex}, которого нет`);
    }
    // Верным отмечается ВАРИАНТ, а не элемент: имя варианта больше
    // не совпадает с именем фигуры, и ссылка на фигуру тут была бы битой.
    const correctOptionId = `option-${correctIndex}`;
    /*
     * ИМЯ МЕТКИ СВОБОДНО ПО ВСЕМУ ПРОЕКТУ, А НЕ ВНУТРИ ГЛАВЫ.
     *
     * Куплено 26.08.2026. Схема запрещает писать одну переменную в двух
     * главах — второй ответ затёр бы первый, и правило выхода стало бы
     * неоднозначным. А имя переменной у метки это её же `id` (см.
     * `createGate`), и бралось оно свободным ТОЛЬКО среди меток своей главы.
     *
     * Владелец сделал вопрос на ветке и получил красную полосу:
     *   Переменная «gate-1» записывается дважды: в сегменте «s-1»
     *   и в «segment-1».
     * То есть второй вопрос в объяснении ломал сохранение — а второй вопрос
     * это ровно то, ради чего заводятся ветки.
     */
    const gateId = freeId('gate', takenGates);
    const gate: Gate = {
      id: gateId,
      at: { kind: 'seconds', t: atSeconds },
      config: { kind: 'choice', prompt, options, correctId: correctOptionId },
      // «Продолжить», а не retry: гейт без правил выхода под правило
      // проходимости не попадает, а шаблон «вопрос с вариантами» затевался
      // ровно ради того, чтобы автор развёл варианты по разным сегментам
      // следующим шагом (см. ту же оговорку в исходном комментарии v2).
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: gateId,
    };
    gates = [...segment.gates, gate];
  }

  return { ...segment, elements, slides, gates };
}

/**
 * Кладёт вопрос уже стоящей на дорожке остановки НА СЦЕНУ — настоящими
 * элементами, которые автор двигает и оформляет как всё остальное, а не
 * служебной плашкой поверх картинки (владелец, 21.08.2026: «фигуры должны
 * быть обозначены как то, что они именно кликабельные и относятся
 * к вопросу»).
 *
 * Геометрия и оформление — заготовки `question` из `SCENE_TEMPLATES`,
 * а не переписанные числа: элемент №0 заготовки — вопрос, №1 и №2 —
 * первые два варианта. Лишние варианты (гейт может нести больше двух —
 * число берётся из САМОГО ГЕЙТА, а не из заготовки) раскладываются тем же
 * шагом по горизонтали, что и первые два: шаг вычислен ИЗ разницы их `dx`,
 * а не задан заново литералом.
 *
 * Появление элементов — В МОМЕНТ ОСТАНОВКИ, а не с начала главы: секунда
 * берётся из `gate.at` (`resolveTimeRef`), и `insertOrPatchSlideAt` кладёт
 * состояния новых элементов ровно в слайд, действующий на этой секунде.
 * Ни на одном более раннем слайде (включая первый слайд сегмента) у новых
 * элементов состояния нет вовсе — а элемент без состояния на слайде
 * не рисуется (см. комментарий в шапке файла), значит раньше остановки
 * он и не появится. applyTemplate решает ту же задачу иначе (кладёт
 * элементы видимыми с первого слайда сегмента и патчит их появление внутри
 * первых нескольких секунд шаблона) — здесь секунда появления может быть
 * сколь угодно поздней, поэтому старт «изнутри» первого слайда не годится.
 *
 * Связь вариант ↔ элемент — ТОЛЬКО через `bindOption` (ADR-035): она же
 * проверяет «один элемент — один ответ», своей версии этой проверки здесь
 * нет и не должно быть.
 */
export function askOnStage(segment: Segment, gateId: string, stage: { width: number; height: number }): Segment {
  const gate = segment.gates.find((candidate) => candidate.id === gateId);
  if (!gate) {
    throw new Error(`В сегменте «${segment.id}» нет остановки «${gateId}»: некуда класть вопрос`);
  }

  // Приведение вида — ЧУЖОЙ функцией: setGateKind уже знает, как сохранить
  // вопрос при переключении и какие два варианта дать по умолчанию.
  const choiceGate = gate.config.kind === 'choice' ? gate : setGateKind(gate, 'choice');
  const config = choiceGate.config;
  if (config.kind !== 'choice') {
    // Недостижимо: setGateKind('choice') всегда возвращает choice-конфиг.
    // Оставлено ради сужения типа, а не как ожидаемый случай.
    throw new Error(`Остановка «${gateId}» не приведена к виду «выбор»`);
  }

  const questionTemplate = sceneTemplate('question');
  const questionTe = questionTemplate.elements[0];
  const firstOptionTe = questionTemplate.elements[1];
  const secondOptionTe = questionTemplate.elements[2];
  if (!questionTe || !firstOptionTe || !secondOptionTe) {
    // Заготовка «question» — часть кода этого же файла: расхождение с тем,
    // что читает эта функция, значит саму заготовку сломали, а не вызов.
    throw new Error('Заготовка «question» в SCENE_TEMPLATES повреждена: в ней меньше трёх элементов');
  }
  // Шаг раскладки лишних вариантов — ИЗ заготовки, не литерал: если геометрию
  // заготовки поправят, третий и последующий варианты поедут вместе с ней.
  const dxStep = secondOptionTe.dx - firstOptionTe.dx;

  const firstSlide = segment.slides[0];
  if (!firstSlide) {
    throw new Error(`В сегменте «${segment.id}» нет ни одного слайда`);
  }

  const elements = segment.elements.slice();
  const patch: Record<string, ElementState> = {};

  const startZ = Object.values(firstSlide.states).reduce(
    (max, state) => Math.max(max, state.zIndex), -1,
  ) + 1;

  /*
   * ПУСТОЙ ВОПРОС ЗАМЕНЯЕТСЯ ЗАГОТОВОЧНЫМ ТЕКСТОМ.
   *
   * Остановка, только что поставленная на дорожке, приходит сюда с пустым
   * `prompt` (`setGateKind` не выдумывает текста). Пустой текстовый элемент
   * на сцене НЕВИДИМ: автор нажал «Задать вопрос», увидел две кнопки
   * и ничего между ними — и решил бы, что вопрос не создался.
   *
   * Берётся тот же текст, что у заготовки каталога, чтобы автор видел одно
   * и то же независимо от того, каким путём пришёл.
   */
  const promptText = config.prompt || (questionTe.content ?? '');

  const questionElement = instantiateTemplateElement(
    { ...questionTe, content: promptText },
    elements,
    startZ,
    stage,
  );
  elements.push(questionElement.element);
  patch[questionElement.element.id] = questionElement.final;

  let boundGate = choiceGate;
  config.options.forEach((option, index) => {
    const optionTe: TemplateElement = {
      ...firstOptionTe,
      dx: firstOptionTe.dx + dxStep * index,
      content: option.label,
    };
    const built = instantiateTemplateElement(optionTe, elements, startZ + 1 + index, stage);
    elements.push(built.element);
    patch[built.element.id] = built.final;
    boundGate = bindOption(boundGate, option.id, built.element.id);
  });

  const atSeconds = resolveTimeRef(gate.at, segment.audio.words);
  const slides = insertOrPatchSlideAt(segment.slides, atSeconds, patch, segment.audio.words);

  /*
   * ВОПРОС ТОЖЕ ПОЛУЧАЕТ ССЫЛКУ НА СВОЙ ЭЛЕМЕНТ (`promptElementId`).
   *
   * Без неё вопрос жил бы на экране дважды — как `prompt` в данных
   * остановки и как текст на сцене, — и правка одного не доходила бы
   * до другого. Автор написал бы вопрос в карточке, а зритель прочёл
   * старый на сцене; ни один тест такого не заметил бы, потому что оба
   * значения по отдельности верны.
   */
  if (boundGate.config.kind !== 'choice') {
    throw new Error('askOnStage: вид остановки перестал быть выбором посреди работы');
  }
  boundGate = {
    ...boundGate,
    config: {
      ...boundGate.config,
      prompt: promptText,
      promptElementId: questionElement.element.id,
    },
  };

  const gates = segment.gates.map((candidate) => (candidate.id === gateId ? boundGate : candidate));

  return { ...segment, elements, slides, gates };
}
