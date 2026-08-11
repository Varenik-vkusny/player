/**
 * ЕДИНСТВЕННАЯ функция рендера сцены.
 *
 * Инвариант №5: редактор импортирует её отсюда. Модуль не знает ни про React,
 * ни про аудио — принимает контейнер, элементы раздела и их состояния
 * на нужном слайде. Второй реализации некуда взяться: она не предусмотрена
 * конструкцией.
 *
 * Подтверждено спайком S7: 0 различающихся пикселей из 921 600 между
 * ванильным хостом и хостом React. Решение — docs/adr/ADR-003-render.md.
 *
 * Со схемы v3 рендер получает ДВА аргумента вместо одной сцены: элементы
 * (кто это) и состояния слайда (где они и как выглядят). Разделение не
 * косметическое — оно и есть условие морфинга: элемент с устойчивым `id`
 * живёт через все слайды раздела, меняя только состояние.
 */
import type { Element, ElementState, Theme } from '@player/core';
import { getElementRenderer } from './renderers/registry.js';

export const DEFAULT_STAGE_WIDTH = 1920;
export const DEFAULT_STAGE_HEIGHT = 1080;

export interface StageSize {
  width: number;
  height: number;
}

export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Во сколько раз рисовать сцену: `'fit'` — вписать в контейнер целиком,
 * число — масштаб как есть (`1` — единица сцены в один CSS-пиксель).
 *
 * Отдельный тип, а не `number | 'fit'` по месту: вписывание и заданное число —
 * два РАЗНЫХ состояния, а не число со значением по умолчанию. Растянутое окно
 * меняет первое и не имеет права трогать второе.
 */
export type Zoom = number | 'fit';

/** Состояния элементов на слайде: id элемента → где он и как выглядит. */
export type SlideStates = Readonly<Record<string, ElementState | undefined>>;

/**
 * Вычисляет масштаб и отступы для вписывания сцены в контейнер (letterbox).
 *
 * Масштабирование через transform, а не zoom: спецификация CSS Transforms
 * прямо говорит, что transform не влияет на поток содержимого, поэтому
 * раскладка считается один раз и переносы строк не могут разойтись.
 *
 * **Отступы округляются до целого пикселя, и это не косметика.** Деление
 * пополам даёт половину пикселя всякий раз, когда разность нечётна. Цена
 * половины пикселя тем выше, чем мельче масштаб: перевод экранной координаты
 * в сценическую делит на масштаб, и при 0.208 те же 0.5 px экрана становятся
 * 2.4 единицы сцены.
 *
 * Найдено прогоном в Сессии 13: панель озвучки изменила высоту контейнера
 * с 535 на 490, отступ стал 132.5 вместо 155, и e2e на изменение размера
 * ручкой разошёлся ровно на 2.4. Дефект существовал всё время — просто
 * ни одна раскладка до сих пор не попадала на нечётную разность.
 *
 * Побочная польза: сцена перестаёт стоять на дробном пикселе, то есть
 * текст на ней больше не мылится.
 *
 * **`zoom` — масштаб, заданный автором вместо вписывания (Сессия 32).**
 * `'fit'` (по умолчанию, и это то, что зовёт плеер) считает масштаб от размера
 * контейнера, как раньше. Число — это масштаб как есть: `1` значит «единица
 * сцены рисуется одним CSS-пикселем», ровно тот смысл, который показывает
 * процентом Canva (померено на её документе 11.08.2026: при вписывании
 * там 60 %, и это 1149 CSS-px на сцену 1920).
 *
 * Аргумент живёт ЗДЕСЬ, а не в редакторе, намеренно, и это усиление
 * инварианта №5, а не послабление: своя формула летербокса в редакторе была
 * бы второй реализацией вписывания, и разошлись бы они молча — на масштабе 1
 * (обычный десктоп) обе дают одно и то же. Отступы при увеличенной сцене
 * уходят в минус, и это правильный ответ для того, кто рисует сцену В окне;
 * вызывающему, который хочет прокрутку, полагается передать сюда размер
 * ПОЛОТНА, а не окна, — тогда отступы получатся нулевыми (см. `StageView`).
 */
export function fitStage(
  hostWidth: number,
  hostHeight: number,
  stage: StageSize,
  zoom: Zoom = 'fit',
): Fit {
  if (!(hostWidth > 0) || !(hostHeight > 0)) {
    throw new RangeError(`Некорректный размер контейнера: ${hostWidth}x${hostHeight}`);
  }
  if (zoom !== 'fit' && !(Number.isFinite(zoom) && zoom > 0)) {
    throw new RangeError(`Некорректный масштаб сцены: ${zoom}`);
  }
  const scale = zoom === 'fit' ? Math.min(hostWidth / stage.width, hostHeight / stage.height) : zoom;
  return {
    scale,
    offsetX: Math.round((hostWidth - stage.width * scale) / 2),
    offsetY: Math.round((hostHeight - stage.height * scale) / 2),
  };
}

/**
 * Переносит элемент и его состояние на слайде в inline-стиль узла.
 *
 * Публичная намеренно, и это усиление инварианта №5, а не послабление.
 * Редактору нужно двигать один элемент за жест, а `renderScene` пересобирает
 * контейнер целиком. Без этой функции наружу редактор был бы вынужден завести
 * собственное преобразование «состояние → CSS» — то есть вторую реализацию
 * рендера. Здесь она остаётся одна на оба хоста.
 *
 * Узел приводится к состоянию, описанному схемой. Значения, накрученные
 * поверх переходом (transform, opacity, filter), при этом стираются:
 * вызывающий обязан заново выставить время. См. ScenePreview.
 */
/**
 * Записывает тему сцены переменными на её контейнер.
 *
 * Переменными на ПРЕДКЕ, а не инлайном на каждом элементе, и это не приём
 * экономии: измерено S11 — переменная на предке перекрашивает потомков,
 * не трогая их собственный инлайн-стиль. Значит смена темы стоит одной
 * записи и не затирает то, что автор поставил элементу руками.
 *
 * Здесь же и заканчивается вся цена темы для рендера: элемент ссылается
 * на роль обычной строкой своего стиля (`var(--scene-accent, #4c8dff)`),
 * поэтому ни схема состояний, ни `applyElement` про тему не знают вовсе.
 *
 * Запасное значение в ссылке обязательно и остаётся обязательным даже
 * теперь, когда тему кто-то пишет: проект может прийти из чужого шаблона
 * с ролью, которой у нас нет, и тогда браузер отбросит объявление ЦЕЛИКОМ,
 * молча (S11). Эта функция от такого не страхует — страхует запас.
 */
export function applyTheme(host: HTMLElement, theme: Theme): void {
  for (const [role, value] of Object.entries(theme)) {
    host.style.setProperty(role, value);
  }
}

export function applyElement(
  node: HTMLElement,
  element: Element,
  state: ElementState,
): void {
  node.className = `scene-el scene-${element.type}`;
  node.dataset['id'] = element.id;

  const style = node.style;
  style.position = 'absolute';
  style.left = `${state.x}px`;
  style.top = `${state.y}px`;
  style.width = `${state.width}px`;
  style.height = `${state.height}px`;
  style.zIndex = String(state.zIndex);
  style.opacity = String(state.opacity);
  // Инвариант №8: смещение и поворот только через transform.
  style.transform = state.rotation ? `rotate(${state.rotation}deg)` : '';
  style.margin = '0';
  style.boxSizing = 'border-box';

  /**
   * Скрытый элемент прячется видимостью, а не удалением и не `display: none`.
   *
   * `visibility: hidden` сохраняет бокс раскладки, поэтому FLIP может его
   * измерить, а элемент, проявляющийся из `visible: false`, приезжает
   * со своего места — это и отличает его от элемента, которого на прошлом
   * слайде не было вовсе (ADR-015). Из попадания указателя он при этом
   * выпадает, так что кликнуть по невидимому нельзя.
   */
  style.visibility = state.visible ? '' : 'hidden';

  for (const [key, value] of Object.entries(state.style)) {
    style.setProperty(key, String(value));
  }

  const renderer = getElementRenderer(element.type);
  if (!renderer) {
    throw new Error(`Для типа элемента «${element.type}» не зарегистрирован DOM-рендерер`);
  }
  renderer(node, element, state);
}

/**
 * Строит сцену внутри контейнера. Возвращает карту id → узел, чтобы переход
 * мог адресовать элементы, не разыскивая их по DOM.
 *
 * Контейнер приводится к известному состоянию целиком: рендер обязан быть
 * функцией от слайда, а не от истории вызовов.
 *
 * **Элемент без состояния на этом слайде не рисуется вовсе.** Это не то же
 * самое, что `visible: false`: отсутствие означает «его здесь нет», и когда
 * он появится на следующем слайде, ему неоткуда ехать — он просто приходит.
 */
export function renderScene(
  host: HTMLElement,
  elements: readonly Element[],
  states: SlideStates,
  stage: StageSize = { width: DEFAULT_STAGE_WIDTH, height: DEFAULT_STAGE_HEIGHT },
): Map<string, HTMLElement> {
  host.textContent = '';
  host.style.position = 'relative';
  host.style.width = `${stage.width}px`;
  host.style.height = `${stage.height}px`;
  host.style.transformOrigin = '0 0';
  host.style.overflow = 'hidden';

  const nodes = new Map<string, HTMLElement>();
  // Порядок вставки задан порядком в массиве: рендер детерминирован,
  // и одинаковый слайд всегда даёт одинаковый DOM.
  for (const element of elements) {
    const state = states[element.id];
    if (!state) continue;
    const node = document.createElement('div');
    applyElement(node, element, state);
    host.appendChild(node);
    nodes.set(element.id, node);
  }
  return nodes;
}

/**
 * Вписывает уже отрисованную сцену в размеры контейнера.
 *
 * will-change здесь НЕ ставится намеренно: он фиксирует растр, и при смене
 * масштаба картинка становится мыльной (ADR-007).
 */
export function applyFit(
  host: HTMLElement,
  hostWidth: number,
  hostHeight: number,
  stage: StageSize = { width: DEFAULT_STAGE_WIDTH, height: DEFAULT_STAGE_HEIGHT },
  zoom: Zoom = 'fit',
): Fit {
  const fit = fitStage(hostWidth, hostHeight, stage, zoom);
  host.style.transform = `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`;
  return fit;
}
