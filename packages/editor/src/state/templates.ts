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
 * У элемента без `preset` или с `atSeconds: 0` появляться неоткуда: слайд
 * на нуле — стартовый вид сегмента, морфить в него не из чего. Поэтому:
 *
 *   - элементы без preset или с atSeconds === 0 получают финальное
 *     состояние сразу на первом слайде сегмента;
 *   - элементы с preset и atSeconds > 0 получают на первом слайде состояние
 *     С ПАТЧЕМ заготовки появления (`AnimationPreset`, `state/library.ts`),
 *     а на новом слайде, вставленном в момент atSeconds, — обычное
 *     финальное состояние. Между ними и есть появление.
 *
 * `applyTemplate` — единственная функция этого модуля, которая трогает
 * `Segment`. Она ДОБАВЛЯЕТ к сегменту, а не заменяет его: у автора уже
 * могло что-то лежать (см. комментарий самой функции).
 */
import { DEFAULT_TRANSITION_SECONDS, resolveTimeRef } from '@player/core';
import type { Element, ElementState, Gate, Segment, TimeRef } from '@player/core';

import { freeId } from './elements.js';
import { animationPreset, libraryItem, type AnimationPreset } from './library.js';

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
  /** id заготовки появления из ANIMATION_PRESETS. undefined — без появления. */
  readonly preset?: string;
  /** Когда появляется, секунды от начала сегмента. Не длиннее 3 с (см. applyTemplate). */
  readonly atSeconds: number;
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
        preset: 'fade-in',
        atSeconds: 0,
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
        preset: 'fade-in',
        atSeconds: 0,
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
        preset: 'fade-in',
        atSeconds: 0.6,
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
        preset: 'fade-in',
        atSeconds: 0,
      },
      {
        item: 'shape',
        dx: 440,
        dy: 0,
        width: 720,
        height: 640,
        style: { background: PANEL, 'border-radius': '20px' },
        preset: 'fade-in',
        atSeconds: 0.2,
      },
      {
        item: 'text',
        dx: -440,
        dy: -220,
        width: 640,
        height: 120,
        content: 'Вариант A',
        style: { 'font-family': SANS, 'font-size': '44px', 'font-weight': '700', color: WHITE, 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 0.4,
      },
      {
        item: 'text',
        dx: 440,
        dy: -220,
        width: 640,
        height: 120,
        content: 'Вариант Б',
        style: { 'font-family': SANS, 'font-size': '44px', 'font-weight': '700', color: WHITE, 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 0.6,
      },
      {
        item: 'text',
        dx: -440,
        dy: 40,
        width: 640,
        height: 400,
        content: 'Описание первого варианта.',
        style: { 'font-family': SANS, 'font-size': '28px', color: MUTED, 'line-height': '1.5', 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 0.8,
      },
      {
        item: 'text',
        dx: 440,
        dy: 40,
        width: 640,
        height: 400,
        content: 'Описание второго варианта.',
        style: { 'font-family': SANS, 'font-size': '28px', color: MUTED, 'line-height': '1.5', 'text-align': 'center' },
        preset: 'fade-in',
        atSeconds: 1,
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
        preset: 'fade-in',
        atSeconds: 0,
      },
      {
        item: 'text',
        dx: 0,
        dy: -80,
        width: 1000,
        height: 100,
        content: 'Первый пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
        preset: 'slide-in-left',
        atSeconds: 0.4,
      },
      {
        item: 'text',
        dx: 0,
        dy: 40,
        width: 1000,
        height: 100,
        content: 'Второй пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
        preset: 'slide-in-left',
        atSeconds: 0.8,
      },
      {
        item: 'text',
        dx: 0,
        dy: 160,
        width: 1000,
        height: 100,
        content: 'Третий пункт.',
        style: { 'font-family': SANS, 'font-size': '36px', color: WHITE, 'text-align': 'center' },
        preset: 'slide-in-left',
        atSeconds: 1.2,
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
        preset: 'fade-in',
        atSeconds: 0,
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
        preset: 'fade-in',
        atSeconds: 0.4,
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
        preset: 'fade-in',
        atSeconds: 0.6,
      },
    ],
    // Варианты — сами элементы сцены (индексы 1 и 2, см. ADR-011 и bindOption
    // в state/gates.ts): гейт указывает вопрос ровно там же, куда автор уже
    // положил текст, а не системную кнопку поверх.
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.5,
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
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.2,
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.5,
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.4,
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.4,
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
      preset: 'fade-in',
      atSeconds: 0.7,
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
      preset: 'fade-in',
      atSeconds: 0.4,
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
      preset: 'fade-in',
      atSeconds: 0.0,
    },
    {
      item: 'shape',
      dx: 430,
      dy: 0,
      width: 800,
      height: 560,
      style: { background: PANEL, 'border-radius': '24px' },
      preset: 'fade-in',
      atSeconds: 0.4,
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
      preset: 'fade-in',
      atSeconds: 0.0,
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
 * Патч состояния «до появления» — накладывается на финальное состояние,
 * чтобы получить состояние элемента на первом слайде сегмента (см. описание
 * заготовок появления в `state/library.ts`). `dx`/`dy` заготовки в патч
 * не входят — они считаются относительно финального `x`/`y`, которого
 * этот патч не знает, и накладываются вызывающим (`applyTemplate`) отдельно.
 */
function startPatch(preset: AnimationPreset): Partial<ElementState> {
  const patch: Partial<ElementState> = {};
  if (preset.hiddenAtStart) patch.visible = false;
  if (preset.growFrom === 'both') {
    patch.width = 0;
    patch.height = 0;
  } else if (preset.growFrom === 'width') {
    patch.width = 0;
  }
  return patch;
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
): Segment {
  const firstSlide = segment.slides[0];
  if (!firstSlide) {
    throw new Error(`В сегменте «${segment.id}» нет ни одного слайда`);
  }

  const startStates = firstSlide.states;
  const startZ = Object.values(startStates).reduce((max, state) => Math.max(max, state.zIndex), -1) + 1;

  const elements = segment.elements.slice();
  const newElements: Element[] = [];
  let nextStartStates = startStates;
  // Момент появления → состояние, которое нужно на слайде в этот момент.
  const laterPatches = new Map<number, Record<string, ElementState>>();

  template.elements.forEach((te, index) => {
    const item = libraryItem(te.item);
    const width = te.width ?? item.width;
    const height = te.height ?? item.height;
    const zIndex = startZ + index;

    const element: Element = {
      id: freeId(item.id, elements),
      type: item.type,
      content: te.content ?? item.content,
      // v11: шаблон кладёт элементы верхним уровнем и незапертыми.
      locked: false,
    };
    elements.push(element);
    newElements.push(element);

    const final = finalState(te, item, width, height, stage, zIndex);

    if (te.preset === undefined || te.atSeconds <= 0) {
      // Без появления или появление прямо на старте: слайду на нуле морфить
      // не из чего, кладём сразу финальное состояние.
      nextStartStates = { ...nextStartStates, [element.id]: final };
      return;
    }

    const preset = animationPreset(te.preset);
    const patch = startPatch(preset);
    if (preset.dx !== undefined) patch.x = final.x + preset.dx;
    if (preset.dy !== undefined) patch.y = final.y + preset.dy;
    const start: ElementState = { ...final, ...patch };
    nextStartStates = { ...nextStartStates, [element.id]: start };

    const bucket = laterPatches.get(te.atSeconds) ?? {};
    bucket[element.id] = final;
    laterPatches.set(te.atSeconds, bucket);
  });

  let slides = segment.slides.slice();
  slides[0] = nextStartStates === startStates ? firstSlide : { ...firstSlide, states: nextStartStates };

  // Слайды появления — по возрастанию времени, каждый копией предыдущего
  // плюс патч элементов, которые появляются именно в этот момент.
  const words = segment.audio.words;
  for (const atSeconds of [...laterPatches.keys()].sort((a, b) => a - b)) {
    const at: TimeRef = { kind: 'seconds', t: atSeconds };
    let insertAfter = 0;
    for (let i = 0; i < slides.length; i += 1) {
      if (resolveTimeRef(slides[i]!.at, words) < atSeconds) insertAfter = i;
    }
    const anchor = slides[insertAfter]!;
    const existingAtSameTime = slides.find((slide) => resolveTimeRef(slide.at, words) === atSeconds);
    const patch = laterPatches.get(atSeconds)!;

    if (existingAtSameTime) {
      const i = slides.indexOf(existingAtSameTime);
      slides[i] = { ...existingAtSameTime, states: { ...existingAtSameTime.states, ...patch } };
      continue;
    }

    const newSlide = {
      id: freeId('slide', slides),
      at,
      transition: 'morph' as const,
      transitionSeconds: DEFAULT_TRANSITION_SECONDS,
      states: { ...anchor.states, ...patch },
    };
    slides.splice(insertAfter + 1, 0, newSlide);
  }

  let gates = segment.gates;
  if (template.gate) {
    const { atSeconds, prompt, optionIndexes, correctIndex } = template.gate;
    const options = optionIndexes.map((optionIndex) => {
      const element = newElements[optionIndex];
      if (!element) {
        throw new Error(`Шаблон «${template.id}»: гейт ссылается на элемент №${optionIndex}, которого нет`);
      }
      return { id: element.id, label: element.content };
    });
    const correctElement = newElements[correctIndex];
    if (!correctElement) {
      throw new Error(`Шаблон «${template.id}»: гейт ссылается на элемент №${correctIndex}, которого нет`);
    }
    const gateId = freeId('gate', segment.gates);
    const gate: Gate = {
      id: gateId,
      at: { kind: 'seconds', t: atSeconds },
      config: { kind: 'choice', prompt, options, correctId: correctElement.id },
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
