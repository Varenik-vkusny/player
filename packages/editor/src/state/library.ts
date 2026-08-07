/**
 * Библиотека, из которой автор собирает объяснение: заготовки элементов сцены
 * и заготовки появления — ДАННЫЕ, а не код.
 *
 * Пополнить каталог значит дописать запись в один из массивов ниже, а не
 * менять `InsertPanel.tsx` или панель шаблонов — это подтверждено тестом
 * (`library.test.ts`, «пополнение не требует правок в React»).
 *
 * Элементы и заготовки появления живут в одном файле: оба каталога отвечают
 * на один вопрос («что автор может положить на сцену или как оно должно
 * появиться»), и оба малы — заводить два файла ради формального разделения
 * нет причины.
 */
import type { Element } from '@player/core';

/**
 * Виды элемента, которые понимает схема. Тип берётся ИЗ схемы, а не
 * повторяется здесь: раньше строка перечисляла три вида руками, и рядом
 * стоял комментарий с их количеством — то самое гниющее число, о котором
 * предупреждает CLAUDE.md.
 *
 * Новых видов не заводить росчерком: это правка схемы (инвариант №7,
 * бамп версии + миграция + фикстура + тест). Круг, стрелка, рамка, линия,
 * скобка, выноска — все `type: 'shape'` с разным `style`.
 */
export type ElementType = Element['type'];

/**
 * Одна заготовка библиотеки: что именно кладётся на сцену.
 *
 * В отличие от v2, поля ниже разъезжаются по двум сущностям схемы при
 * вставке (`state/elements.ts`, `createElement`): `type`/`content` уходят
 * в `Element`, `width`/`height`/`style` — в начальное `ElementState`.
 * Заготовка их не различает специально: автору всё равно важен только
 * итоговый вид элемента на сцене, а не то, в каком поле схемы он хранится.
 */
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
    id: 'video',
    label: 'Видео',
    type: 'video',
    // 16:9 — не вкусовщина: говорящую голову снимают в этом отношении,
    // а элемент заводится именно под неё (product.md §2ж [Р], «видео
    // кладётся НА слайды, а не слайды внутрь видео»).
    width: 480,
    height: 270,
    // Пусто по той же причине, что у картинки: ждёт источника.
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
 * Заготовка появления элемента — замена анимационным кью версии 2.
 *
 * Кью с `property`/`from`/`to`/`duration`/`ease` в схеме v3 не существует
 * (инвариант №8 остался только как список того, что дозволено композитору,
 * см. `ANIMATABLE` в `@player/core`) — появление теперь выражается разницей
 * состояний элемента на двух соседних слайдах, и морфинг между ними считает
 * плеер сам (FLIP по `x`/`y`/`width`/`height`/`rotation`/`opacity`/`visible`).
 *
 * Заготовка поэтому описывает не анимацию, а НАЧАЛЬНЫЙ патч состояния:
 * `applyTemplate` (`state/templates.ts`) кладёт элемент в его обычном виде
 * на слайд появления и в виде `base` с этим патчем — на предыдущий слайд,
 * и плеер анимирует переход между ними тем же способом, каким анимировал бы
 * любую другую пару соседних слайдов.
 *
 * `hiddenAtStart` — это ровно то же, что раньше означал кью «opacity 0 → 1»:
 * ADR-015 переводит его в `visible: false → true`, а не в число, потому что
 * это отдельный переход (элемент проявляется на месте), а не число прозрачности.
 * `dx`/`dy` — смещение стартовой позиции относительно конечной (было «слайд
 * влево»). `growFrom` — элемент стартует с нулевого размера: `'both'` — по
 * обеим осям (был `scale`), `'width'` — только по ширине (был `scaleX`,
 * подчёркивание «вырастает»).
 */
export interface AnimationPreset {
  readonly id: string;
  readonly label: string;
  readonly hiddenAtStart?: boolean;
  readonly dx?: number;
  readonly dy?: number;
  readonly growFrom?: 'both' | 'width';
}

export const ANIMATION_PRESETS: readonly AnimationPreset[] = [
  {
    id: 'slide-in-left',
    label: 'Выехать слева',
    dx: -40,
  },
  {
    id: 'fade-in',
    label: 'Проявиться',
    hiddenAtStart: true,
  },
  {
    id: 'grow',
    label: 'Увеличиться',
    growFrom: 'both',
  },
  {
    id: 'underline',
    label: 'Подчеркнуть',
    growFrom: 'width',
  },
];

/** Заготовка появления по id. Бросает, если такой заготовки нет, как `libraryItem`. */
export function animationPreset(id: string): AnimationPreset {
  const preset = ANIMATION_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`В библиотеке появлений нет заготовки «${id}»`);
  }
  return preset;
}
