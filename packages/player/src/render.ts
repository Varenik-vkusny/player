/**
 * ЕДИНСТВЕННАЯ функция рендера сцены.
 *
 * Инвариант №5: редактор импортирует её отсюда. Модуль не знает ни про React,
 * ни про аудио — принимает контейнер и описание сцены. Второй реализации
 * некуда взяться: она не предусмотрена конструкцией.
 *
 * Подтверждено спайком S7: 0 различающихся пикселей из 921 600 между
 * ванильным хостом и хостом React. Решение — docs/adr/ADR-003-render.md.
 */
import type { Element, Scene } from '@player/core';

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
 * Вычисляет масштаб и отступы для вписывания сцены в контейнер (letterbox).
 *
 * Масштабирование через transform, а не zoom: спецификация CSS Transforms
 * прямо говорит, что transform не влияет на поток содержимого, поэтому
 * раскладка считается один раз и переносы строк не могут разойтись.
 */
export function fitStage(hostWidth: number, hostHeight: number, stage: StageSize): Fit {
  if (!(hostWidth > 0) || !(hostHeight > 0)) {
    throw new RangeError(`Некорректный размер контейнера: ${hostWidth}x${hostHeight}`);
  }
  const scale = Math.min(hostWidth / stage.width, hostHeight / stage.height);
  return {
    scale,
    offsetX: (hostWidth - stage.width * scale) / 2,
    offsetY: (hostHeight - stage.height * scale) / 2,
  };
}

function applyElement(node: HTMLElement, element: Element): void {
  node.className = `scene-el scene-${element.type}`;
  node.dataset['id'] = element.id;

  const style = node.style;
  style.position = 'absolute';
  style.left = `${element.x}px`;
  style.top = `${element.y}px`;
  style.width = `${element.width}px`;
  style.height = `${element.height}px`;
  style.zIndex = String(element.zIndex);
  // Инвариант №8: смещение и поворот только через transform.
  style.transform = element.rotation ? `rotate(${element.rotation}deg)` : '';
  style.margin = '0';
  style.boxSizing = 'border-box';

  for (const [key, value] of Object.entries(element.style)) {
    style.setProperty(key, String(value));
  }

  switch (element.type) {
    case 'text':
      node.textContent = element.content;
      break;
    case 'image':
      node.textContent = '';
      style.backgroundImage = element.content ? `url(${element.content})` : '';
      style.backgroundSize = 'cover';
      break;
    case 'shape':
    case 'group':
      node.textContent = '';
      break;
  }
}

/**
 * Строит сцену внутри контейнера. Возвращает карту id → узел, чтобы анимации
 * могли адресовать элементы, не разыскивая их по DOM.
 *
 * Контейнер приводится к известному состоянию целиком: рендер обязан быть
 * функцией от сцены, а не от истории вызовов.
 */
export function renderScene(
  host: HTMLElement,
  scene: Scene,
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
  // и одинаковая сцена всегда даёт одинаковый DOM.
  for (const element of scene.elements) {
    const node = document.createElement('div');
    applyElement(node, element);
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
): Fit {
  const fit = fitStage(hostWidth, hostHeight, stage);
  host.style.transform = `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`;
  return fit;
}
