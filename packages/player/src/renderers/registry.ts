/**
 * @player/player — Реестр DOM-рендереров элементов.
 *
 * Позволяет регистрировать пользовательские и стандартные функции отрисовки
 * элементов сцены без применения hardcoded switch-case.
 */
import type { Element } from '@player/core';
import type { AssetUrls } from '../render.js';

/**
 * Третий довод — `assets`, а не `state`. Ни один встроенный рендерер
 * `state` не читал ни разу (сигнатура принимала его только по форме), а
 * `assets` нужен ровно двум рендерерам ниже: картинке — адрес байтов
 * по `assetId`, фигуре с наконечником — не нужен вовсе (краска идёт из
 * `node.style`, см. рендерер `shape`).
 *
 * Тип для `render.ts` импортирован обратно из него же (`../render.js`).
 * Цикл модулей безопасен: доводы типа стираются на сборке, а на рантайме
 * `render.ts` вызывает `registry.ts` через `getElementRenderer`, а не
 * наоборот.
 */
export type ElementDOMRenderer = (
  node: HTMLElement,
  element: Element,
  assets?: AssetUrls,
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

/**
 * Картинка (v17 — импорт из Canva кладёт байты в хранилище плеера, а не
 * адрес в `content`).
 *
 * `assetId` есть → адрес берётся ТОЛЬКО из карты `assets`. Ключа в карте нет
 * (байты не разрешились или их нет в этом браузере) — рисуется пусто,
 * `content` при этом НЕ подставляется: смешать два источника значило бы
 * иногда показать чужую картинку — старое значение `content`, оставшееся
 * от миграции схемы, а не текущие байты.
 *
 * `assetId` нет вовсе — прежнее поведение до v17: адрес или `data:` URL
 * берутся из `content` напрямую. Старые проекты и фикстуры без импорта
 * этим не задеты.
 */
registerElementRenderer('image', (node, element, assets) => {
  node.textContent = '';
  const url = element.assetId !== undefined
    ? assets?.get(element.assetId)
    : (element.content || undefined);
  node.style.backgroundImage = url ? `url(${url})` : '';
  node.style.backgroundSize = 'cover';
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Наконечник стрелки — штатный SVG-приём: `<marker>` в `<defs>`, на пути —
 * `marker-start`/`marker-end` (constraints.md, ловушка №1в).
 *
 * `markerUnits="strokeWidth"` обязателен — без него наконечник не растёт
 * вместе с толщиной линии. Цвет — `context-stroke`, чтобы наконечник
 * красился тем же, чем сама линия, и продолжал слушаться полосы свойств
 * (краска едет свойствами состояния, а не зашивается в контур — ловушка №5).
 * Запасной цвет — САМ цвет обводки элемента, а не буквальный чёрный: пишутся
 * ДВЕ декларации `fill` подряд, и браузер без `context-stroke` отбросит
 * вторую как невалидную, оставив первую в силе; браузер с поддержкой
 * применит вторую, как более позднюю валидную.
 */
function buildArrowMarker(id: string, strokeColor: string, orient: string): SVGMarkerElement {
  const marker = document.createElementNS(SVG_NS, 'marker') as SVGMarkerElement;
  marker.setAttribute('id', id);
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '4');
  marker.setAttribute('orient', orient);
  marker.setAttribute('markerUnits', 'strokeWidth');

  const head = document.createElementNS(SVG_NS, 'path');
  head.setAttribute('d', 'M0,0 L8,4 L0,8 Z');
  const fallback = strokeColor || 'currentColor';
  head.style.cssText = `fill: ${fallback}; fill: context-stroke;`;
  marker.appendChild(head);
  return marker;
}

/**
 * Фигура с контуром, взятым импортом из Canva (v17): `element.path` —
 * SVG-путь и своя система координат (`width`/`height`).
 *
 * Без `path` рендерер — пустой узел, как и раньше (произвольная фигура,
 * которую ещё нечем рисовать).
 *
 * **`overflow: visible` у `<svg>` обязателен.** Импорт зажимает единицей
 * только систему координат контура, а габарит элемента оставляет настоящим:
 * у горизонтальной линии высота state — НОЛЬ. Обводка рисуется по центру
 * пути и наполовину выходит за нулевую высоту бокса; без `overflow: visible`
 * она обрежется, и разделитель пропадёт с экрана целиком, при этом ни один
 * тест на раскладку этого не покажет (constraints.md, ловушка №2 задания).
 *
 * **Краска — из `node.style`, а не из аргумента состояния.** `applyElement`
 * уже записал `state.style` (в том числе `fill`/`stroke`/`stroke-width`)
 * инлайном на `node` ДО вызова этого рендерера — читать их оттуда, а не
 * заводить вторую дверцу к состоянию элемента. Ровно поэтому у
 * `ElementDOMRenderer` нет доводом `state`.
 */
registerElementRenderer('shape', (node, element) => {
  node.textContent = '';
  const path = element.path;
  if (!path) return;

  // Приставка сцены — та же, что у `ensureSheet(uid)`: `renderScene`
  // (render.ts) метит КАЖДЫЙ узел `data-scene` при создании. Без нее две
  // сцены с фигурами на одной странице (лента миниатюр) свели бы наконечники
  // к одинаковым id, и браузер взял бы всегда ПЕРВЫЙ найденный.
  const uid = node.dataset['scene'] ?? element.id;

  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${path.width} ${path.height}`);
  // Контур обязан растянуться по габариту элемента, а не вписаться с полями:
  // без этого фигура разошлась бы с исходником Canva на любом соотношении
  // сторон, отличном от контурного.
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  const svgPath = document.createElementNS(SVG_NS, 'path');
  svgPath.setAttribute('d', path.d);
  const style = node.style;
  const fill = style.getPropertyValue('fill');
  const stroke = style.getPropertyValue('stroke');
  const strokeWidth = style.getPropertyValue('stroke-width');
  // Незаданный fill обязан стать 'none', а не остаться пустым: пустая
  // строка атрибута `fill` браузер трактует как чёрный по умолчанию,
  // и контур без заливки превратился бы в кляксу.
  svgPath.setAttribute('fill', fill || 'none');
  if (stroke) svgPath.setAttribute('stroke', stroke);
  if (strokeWidth) svgPath.setAttribute('stroke-width', strokeWidth);
  svg.appendChild(svgPath);

  if (path.startArrow || path.endArrow) {
    const defs = document.createElementNS(SVG_NS, 'defs');
    if (path.startArrow) {
      const id = `${uid}-${element.id}-arrow-start`;
      defs.appendChild(buildArrowMarker(id, stroke, 'auto-start-reverse'));
      svgPath.setAttribute('marker-start', `url(#${id})`);
    }
    if (path.endArrow) {
      const id = `${uid}-${element.id}-arrow-end`;
      defs.appendChild(buildArrowMarker(id, stroke, 'auto'));
      svgPath.setAttribute('marker-end', `url(#${id})`);
    }
    svg.appendChild(defs);
  }

  node.appendChild(svg);
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
 * в docs/plans/session-28-plan.md §7, пункты 3–5.
 */
registerElementRenderer('group', () => {});
