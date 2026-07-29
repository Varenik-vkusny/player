/**
 * Библиотека, из которой автор собирает объяснение: заготовки элементов сцены
 * и заготовки анимаций — ДАННЫЕ, а не код.
 *
 * Пополнить каталог значит дописать запись в один из массивов ниже, а не
 * менять `InsertPanel.tsx` или панель анимации — это подтверждено тестом
 * (`library.test.ts`, «пополнение не требует правок в React»). Раньше формы
 * фигур и наборы стилей были литералами внутри `state/elements.ts`
 * (`DEFAULT_SIZE`, `DEFAULT_STYLE`, `TEXT_PLACEHOLDER`) — этот файл их
 * заменяет, а не дублирует.
 *
 * Элементы и анимации живут в одном файле: оба каталога отвечают на один
 * вопрос («что автор может положить на сцену или повесить на элемент»),
 * и оба малы — заводить два файла ради формального разделения нет причины.
 */
import type { Animatable } from './animation.js';

/**
 * Три вида элемента, которые понимает СХЕМА (`ElementSchema.type` в
 * `@player/core` допускает ещё и `'group'`, но редактор его пока не создаёт).
 * Новых видов не заводить: это правка схемы (инвариант №7, бамп версии +
 * миграция + фикстура + тест). Круг, стрелка, рамка, линия, скобка,
 * выноска — все `type: 'shape'` с разным `style`.
 */
export type ElementType = 'text' | 'shape' | 'image';

/** Одна заготовка библиотеки: что именно кладётся на сцену. */
export interface LibraryItem {
  /** Идентификатор заготовки. Он же префикс id элемента и суффикс data-testid. */
  readonly id: string;
  /** Подпись на кнопке панели вставки. */
  readonly label: string;
  /** Тип элемента СХЕМЫ, а не библиотеки: их всего три (см. `ElementType`). */
  readonly type: ElementType;
  readonly width: number;
  readonly height: number;
  readonly style: Readonly<Record<string, string | number>>;
  /** Начальное содержимое. Для фигур и картинки пусто. */
  readonly content: string;
}

const ACCENT = '#4c8dff';

/**
 * Каталог заготовок. Порядок — порядок кнопок на панели вставки.
 *
 * Первые три (`text`/`shape`/`image`) обязаны давать РОВНО то же, что раньше
 * давали литералы `DEFAULT_SIZE`/`DEFAULT_STYLE`/`TEXT_PLACEHOLDER` из
 * `state/elements.ts` — иначе это не перенос данных, а смена поведения
 * (проверено в `library.test.ts`). Их `id` совпадают с именами типов схемы
 * специально: `data-testid` кнопок (`insert-text`/`insert-shape`/
 * `insert-image`) уже используется существующими e2e и обязан сохраниться.
 */
export const ELEMENT_LIBRARY: readonly LibraryItem[] = [
  {
    id: 'text',
    label: 'Текст',
    type: 'text',
    width: 600,
    height: 120,
    // Значения — из fixtures/projects/demo.json (элементы lead и card),
    // чтобы созданный элемент выглядел как соседи, а не как чужеродная
    // вставка со стандартными браузерными значениями.
    style: {
      'font-family': 'system-ui, sans-serif',
      'font-size': '36px',
      color: '#9fb0c4',
      'line-height': '1.5',
    },
    // Заглушка текста — автор перепишет её двойным кликом сразу после создания.
    content: 'Новый текст',
  },
  {
    id: 'shape',
    label: 'Фигура',
    type: 'shape',
    width: 300,
    height: 300,
    style: { background: '#1b2430', 'border-radius': '28px' },
    content: '',
  },
  {
    id: 'image',
    label: 'Картинка',
    type: 'image',
    width: 480,
    height: 320,
    // Пусто и намеренно: image ждёт файла (перетаскивание на холст), стиль
    // ему пока задавать нечем.
    style: {},
    content: '',
  },
  {
    id: 'circle',
    label: 'Круг',
    type: 'shape',
    width: 240,
    height: 240,
    style: { background: '#1b2430', 'border-radius': '50%' },
    content: '',
  },
  {
    id: 'arrow',
    label: 'Стрелка',
    type: 'shape',
    width: 320,
    height: 120,
    style: {
      background: ACCENT,
      // Древко — прямоугольник от 0% до 60% ширины, от 35% до 65% высоты;
      // голова — треугольник от 60% до 100% ширины, от 15% до 85% высоты.
      // Проценты, а не пиксели: многоугольник обязан тянуться вместе
      // с элементом при изменении размера, а не сохранять фиксированную
      // геометрию в пикселях исходной формы.
      'clip-path': 'polygon(0% 35%, 60% 35%, 60% 15%, 100% 50%, 60% 85%, 60% 65%, 0% 65%)',
    },
    content: '',
  },
  {
    id: 'frame',
    label: 'Рамка',
    type: 'shape',
    width: 400,
    height: 260,
    style: { background: 'transparent', border: `4px solid ${ACCENT}`, 'border-radius': '12px' },
    content: '',
  },
  {
    id: 'line',
    label: 'Линия',
    type: 'shape',
    width: 400,
    height: 6,
    style: { background: ACCENT, 'border-radius': '3px' },
    content: '',
  },
  {
    id: 'bracket',
    label: 'Скобка',
    type: 'shape',
    width: 60,
    height: 300,
    style: {
      background: 'transparent',
      // Квадратная скобка «[»: левая, верхняя и нижняя границы есть, правой
      // нет — без неё прямоугольник читался бы как рамка, а не как скоба,
      // открытая с одной стороны.
      'border-left': `4px solid ${ACCENT}`,
      'border-top': `4px solid ${ACCENT}`,
      'border-bottom': `4px solid ${ACCENT}`,
    },
    content: '',
  },
  {
    id: 'callout',
    label: 'Выноска',
    type: 'shape',
    width: 360,
    height: 160,
    style: {
      background: '#1b2430',
      // Три угла скруглены, один (нижний левый) прямой — читается как
      // облачко реплики с «хвостиком», без псевдоэлементов: их в схеме
      // выразить нечем (`style` — плоская запись CSS-свойств).
      'border-radius': '24px 24px 24px 0',
    },
    content: '',
  },
];

/**
 * Заготовка по id. Бросает, если такой заготовки нет: опечатка в id обязана
 * быть видна сразу, а не тихо создавать пустой или неверный элемент.
 */
export function libraryItem(id: string): LibraryItem {
  const item = ELEMENT_LIBRARY.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`В библиотеке нет заготовки «${id}»`);
  }
  return item;
}

/**
 * Заготовка анимации: именованный набор (свойство + `from`/`to` +
 * длительность + плавность) — начальная точка настройки, а не замена полям
 * `AnimationSpec`. Отвечает на другой вопрос, чем `defaultsFor`
 * (`state/animation.ts`): `defaultsFor` даёт только «разумные `from`/`to`
 * для свойства» и используется существующей панелью анимации при смене
 * свойства (`setProperty`) — этот срез её не трогает и с ней не объединяет,
 * хотя `fade-in` ниже намеренно совпадает числами с дефолтом `defaultsFor('opacity')`.
 */
export interface AnimationPreset {
  readonly id: string;
  readonly label: string;
  readonly property: Animatable;
  readonly from: number | string;
  readonly to: number | string;
  readonly durationMs: number;
  readonly ease: string;
}

/**
 * `ease` каждой заготовки обязан быть строкой из `EASINGS`
 * (`state/animation.ts`) — это проверяет `library.test.ts`. Причина та же,
 * что у `setEase`: anime.js на неизвестном имени плавности не бросает,
 * а молча ставит линейную, и это не увидит ни тест, ни консоль, если имя
 * не свести к проверенному списку.
 */
export const ANIMATION_PRESETS: readonly AnimationPreset[] = [
  {
    id: 'slide-in-left',
    label: 'Выехать слева',
    property: 'x',
    from: -40,
    to: 0,
    durationMs: 400,
    ease: 'outCubic',
  },
  {
    id: 'fade-in',
    label: 'Проявиться',
    property: 'opacity',
    from: 0,
    to: 1,
    // Те же числа, что у cue по умолчанию при добавлении анимации
    // (Editor.tsx, handleAddCue) — проявление и там, и здесь самая частая
    // и понятная анимация.
    durationMs: 400,
    ease: 'outQuad',
  },
  {
    id: 'grow',
    label: 'Увеличиться',
    property: 'scale',
    from: 0,
    to: 1,
    durationMs: 500,
    ease: 'outBack',
  },
  {
    id: 'underline',
    label: 'Подчеркнуть',
    property: 'scaleX',
    from: 0,
    to: 1,
    // Те же числа, что у элемента accent в fixtures/projects/demo.json:
    // scaleX 0 → 1 за 600 мс — там уже проверено глазами, что подчёркивание
    // растёт слева направо, а не выскакивает целиком.
    durationMs: 600,
    ease: 'outQuad',
  },
];
