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
 * **Здесь по-прежнему НЕТ `play()`, `autoplay` и касаний `currentTime`** —
 * но уже по другой причине, чем до Сессии 37. Раньше видео не играло вовсе;
 * теперь оно играет, и управляет им `video.ts`, а не рендерер.
 *
 * Разделение не косметическое. Рендерер зовётся и РЕДАКТОРОМ (инвариант №5:
 * один рендер на плеер и редактор), а в редакторе видео играть не должно:
 * автор смотрит на неподвижную сцену. Пусти рендерер видео — и оно поехало
 * бы под руками у автора, причём без всяких часов.
 *
 * Устройство воспроизведения и его числа — [ADR-028]. Коротко: видео ведомое,
 * пускается по расписанию звука, идёт само, сверяется по порогу 0.25 с.
 * Инвариант №1 при этом не нарушен: видео не двигает сцену, не открывает
 * гейт и не завершает сегмент.
 *
 * **Узел переиспользуется, а не пересоздаётся.** `applyElement` зовёт
 * рендерер на КАЖДОМ проходе (`render.ts:146`) — в том числе каждый кадр
 * морфинга. Создание нового `<video>` сбрасывало бы загрузку по кадру
 * и давало бы мигание, которого не увидел бы ни один юнит-тест.
 */
registerElementRenderer('video', (node, element) => {
  // Скругление живёт на УЗЛЕ, а `<video>` вставлен внутрь дочерним, поэтому
  // без обрезки его прямые углы вылезают за круг: `border-radius` сам по себе
  // потомков не режет. Владелец 12.08.2026: голова сидит в КРУГЕ.
  //
  // Ставится только здесь, а не общим правилом для всех элементов: общее
  // обрезало бы и то, что обрезать не просили.
  node.style.overflow = 'hidden';

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

/**
 * Группа — узел-контейнер (v11). Собственного вида не имеет.
 *
 * Рендерер обязан существовать, а не отсутствовать «за ненадобностью»:
 * `applyElement` бросает на незарегистрированном типе (`render.ts`),
 * и это правильно — молчаливого пропуска элемента там нет по устройству.
 *
 * **Тело намеренно пустое, и `textContent = ''` здесь НЕЛЬЗЯ**, в отличие
 * от соседей выше. Дети группы — это её DOM-потомки, и очистка содержимого
 * вымела бы их. Рендерер зовётся на КАЖДОМ проходе, в том числе каждый
 * кадр морфинга, так что вымело бы ровно то, что группа показывает.
 *
 * Вложенности в `renderScene` пока НЕТ: дерево строится не здесь, и до
 * рекурсивного рендера группа рисуется как пустой бокс. Это названо вслух
 * в docs/session-28-plan.md §7, пункты 3–5.
 */
registerElementRenderer('group', () => {});
