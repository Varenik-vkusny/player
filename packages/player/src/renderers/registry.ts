/**
 * @player/player — Реестр DOM-рендереров элементов.
 *
 * Позволяет регистрировать пользовательские и стандартные функции отрисовки
 * элементов сцены без применения hardcoded switch-case.
 */
import type { Element, ElementState } from '@player/core';

export type ElementDOMRenderer = (
  node: HTMLElement,
  element: Element,
  state: ElementState,
) => void;

const elementRenderers = new Map<string, ElementDOMRenderer>();

/** Регистрация DOM-рендерера для типа элемента. */
export function registerElementRenderer(type: string, renderer: ElementDOMRenderer): void {
  elementRenderers.set(type, renderer);
}

/** Получение DOM-рендерера по типу элемента. */
export function getElementRenderer(type: string): ElementDOMRenderer | undefined {
  return elementRenderers.get(type);
}

// Регистрация встроенных рендереров
registerElementRenderer('text', (node, element) => {
  node.textContent = element.content;
});

registerElementRenderer('image', (node, element) => {
  node.textContent = '';
  node.style.backgroundImage = element.content ? `url(${element.content})` : '';
  node.style.backgroundSize = 'cover';
});

registerElementRenderer('shape', (node) => {
  node.textContent = '';
});

/**
 * Видео — элемент сцены (v10). Появился ради §2ж [Р]: «говорящая голова —
 * элемент сцены, а не фон; видео кладётся НА слайды, а не слайды внутрь
 * видео».
 *
 * **Здесь НЕТ и не должно быть `play()`, `autoplay` и любого касания
 * `currentTime`.** У `<video>` собственные часы, и запущенное видео стало
 * бы ВТОРЫМ источником времени — прямое нарушение инварианта №1.
 * Правильное устройство известно и описано инвариантом №2 на примере
 * таймлайна: ведомый, которому каждый кадр выставляют время, посчитанное
 * от аудио. Сделать так — отдельная работа с ADR: посекундная перемотка
 * `currentTime` рвёт декодирование, а `play()` с коррекцией дрейфа —
 * это уже второй часовой механизм, который надо доказывать замером.
 *
 * Поэтому сегодня видео **существует и рисуется, но не играет**, и это
 * названо вслух, а не спрятано.
 *
 * **Узел переиспользуется, а не пересоздаётся.** `applyElement` зовёт
 * рендерер на КАЖДОМ проходе (`render.ts:146`) — в том числе каждый кадр
 * морфинга. Создание нового `<video>` сбрасывало бы загрузку по кадру
 * и давало бы мигание, которого не увидел бы ни один юнит-тест.
 */
registerElementRenderer('video', (node, element) => {
  let video = node.firstElementChild;
  if (!(video instanceof HTMLVideoElement)) {
    node.textContent = '';
    video = node.appendChild(document.createElement('video'));
    const created = video as HTMLVideoElement;
    // Немой и без autoplay: звук проекта один, и он в дорожке (инвариант №1).
    created.muted = true;
    created.playsInline = true;
    // `metadata`, а не `auto`: нужен первый кадр, а не весь файл.
    created.preload = 'metadata';
    created.style.display = 'block';
    created.style.width = '100%';
    created.style.height = '100%';
    // Как у картинки: `cover` — бокс задаёт автор, кадр подстраивается.
    created.style.objectFit = 'cover';
  }

  const element_ = video as HTMLVideoElement;
  // Пустой src недопустим: браузер запросил бы по нему саму страницу.
  // Поэтому пусто — это ОТСУТСТВИЕ атрибута, а не атрибут с пустым значением.
  if (element.content === '') {
    element_.removeAttribute('src');
  } else if (element_.getAttribute('src') !== element.content) {
    element_.setAttribute('src', element.content);
  }
});
