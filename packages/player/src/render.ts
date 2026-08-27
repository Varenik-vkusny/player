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
import type { Element, ElementState, Style, Theme } from '@player/core';
import { getElementRenderer } from './renderers/registry.js';

export const DEFAULT_STAGE_WIDTH = 1920;
export const DEFAULT_STAGE_HEIGHT = 1080;

/**
 * Ключ байтов (`assetId` картинки, `Font.assetId` шрифта) → адрес, по которому
 * их можно показать (`blob:`-адрес из `resolveProjectAssets`).
 *
 * Отрисовка синхронная, хранилище байтов — асинхронное (IndexedDB). Карта —
 * единственный мост между ними: она собирается ДО сборки сцены
 * (`Player.load`, `packages/player/src/assets.ts`) и передаётся внутрь уже
 * готовой, поэтому сам рендер ни разу не становится async.
 */
export type AssetUrls = ReadonlyMap<string, string>;

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

/**
 * Метка сцены. Нужна, чтобы правила стилей одного проекта не задели другой.
 *
 * Лист стилей глобален для документа, где бы ни стоял тег `<style>`. Значит
 * два проекта на одной странице — предпросмотр редактора и плеер рядом —
 * с одинаковым идентификатором стиля подменяли бы правила друг друга МОЛЧА.
 * Измерено S14: с приставкой контейнера один и тот же идентификатор дал
 * 21px в первой сцене и 22px во второй, а ручная правка осталась сильнее
 * выросшей специфичности (77px).
 *
 * Счётчик, а не случайное число: рендер обязан быть детерминированным —
 * одинаковый слайд всегда даёт одинаковый DOM (см. `renderScene`).
 */
const SCENE_UID = new WeakMap<HTMLElement, string>();
let sceneCounter = 0;

/**
 * Метка сцены хоста. Экспортирована для рендерера фигур: наконечник стрелки
 * — `<marker id="...">` — обязан быть уникален на всей СТРАНИЦЕ (не только
 * в своём `<svg>`), а страница может держать несколько сцен разом (лента
 * миниатюр — по одной `ScenePreview` на карточку). Тот же приём, что у
 * `ensureSheet` ниже, а не второй способ разводить идентификаторы.
 */
export function sceneUid(host: HTMLElement): string {
  const known = SCENE_UID.get(host);
  if (known !== undefined) return known;

  const uid = `sc${++sceneCounter}`;
  SCENE_UID.set(host, uid);
  host.dataset['scene'] = uid;
  return uid;
}

/**
 * Записывает стили проекта правилами CSS для этой сцены.
 *
 * Правилами класса, а не обходом элементов, и это не приём экономии.
 * Живая связь, отцепление ПО СВОЙСТВУ и «вернуть как в стиле» — всё три
 * даёт сам каскад браузера, и писать их нечем (S14, ADR-029):
 *
 *   инлайн элемента перекрывает правило класса ПОКОМПОНЕНТНО — правка
 *   кегля рукой дала 72px, а цвет и скругление остались стилевыми;
 *   одна запись в правило увела непотревоженный элемент с 40 на 90px,
 *   не тронув отцепленный;
 *   снятие ключа вернуло элемент на ТЕКУЩЕЕ значение стиля, а не на то,
 *   что было в момент отцепления.
 *
 * Значения проходят через `setProperty` детали, а не подставляются в текст.
 * Так они, во-первых, разбираются ровно тем же путём, что и сегодняшний
 * инлайн (`applyElement` ниже), а во-вторых, значение с фигурной скобкой
 * не может разорвать правило: браузер отбрасывает то, чего не понимает,
 * ещё до сборки текста.
 */
export function applyStyles(host: HTMLElement, styles: readonly Style[]): void {
  const uid = sceneUid(host);
  const sheet = ensureSheet(uid);

  const carrier = document.createElement('div');
  const rules: string[] = [];

  for (const style of styles) {
    carrier.style.cssText = '';
    for (const [key, value] of Object.entries(style.props)) {
      carrier.style.setProperty(key, String(value));
    }
    const declarations = carrier.style.cssText;
    if (declarations === '') continue;

    rules.push(`[data-scene="${uid}"] .st-${style.id} { ${declarations} }`);
  }

  sheet.textContent = rules.join('\n');
}

/**
 * Лист стилей этой сцены. Один на сцену, дописывается в конец `head`.
 *
 * В конец не для порядка в файле: специфичность у правила стиля и у правила
 * сцены одинаковая, и при равной специфичности решает ПОРЯДОК. Проверено
 * в обе стороны (S14): тот же селектор из листа, вставленного раньше,
 * проиграл (90px против 11px), из вставленного позже — выиграл (12px).
 * Лист, оказавшийся выше базовых правил, молча перестал бы действовать.
 */
function ensureSheet(uid: string): HTMLStyleElement {
  const found = document.head.querySelector<HTMLStyleElement>(`style[data-scene-styles="${uid}"]`);
  if (found) return found;

  const sheet = document.createElement('style');
  sheet.dataset['sceneStyles'] = uid;
  document.head.appendChild(sheet);
  return sheet;
}

/**
 * Лист стилей вшитых шрифтов проекта. Один на ДОКУМЕНТ, а не на сцену.
 *
 * `applyFonts` не получает `host`: `@font-face` — не правило сцены, оно
 * объявляет имя шрифта браузеру целиком, и `font-family` в `ElementState.style`
 * ссылается на это имя тем же способом что при обычных, не вшитых
 * гарнитурах. Разводить его по сценам нечем и незачем — два проекта с разными
 * файлами под одним `family` уже разошлись бы на уровне данных, а не рендера.
 *
 * Тот же приём, что `ensureSheet`: найти по метке или завести один раз
 * в конец `head`. НЕ второй способ добавлять стили в документ.
 */
function ensureFontsSheet(): HTMLStyleElement {
  const found = document.head.querySelector<HTMLStyleElement>('style[data-project-fonts]');
  if (found) return found;

  const sheet = document.createElement('style');
  sheet.dataset['projectFonts'] = '';
  document.head.appendChild(sheet);
  return sheet;
}

/**
 * Объявляет браузеру вшитые импортом шрифты проекта (`Project.fonts`, v17).
 *
 * Байты уже разрешены в адреса (`resolveProjectAssets`) — эта функция
 * синхронная и только пишет `@font-face`. Шрифт, чей `assetId` не нашёлся
 * в карте (байтов нет в этом браузере), молча пропускается: `@font-face`
 * без `src` не сделал бы ничего, кроме шума в консоли.
 *
 * **Синтетической жирности нет** (ловушка №1 в constraints.md, перемерено
 * 27.08.2026): вес, объявленный у `@font-face`, ни на что не влияет,
 * `font-synthesis` можно не трогать. Здесь объявление простое.
 */
export function applyFonts(
  fonts: readonly { family: string; assetId: string }[],
  assets: AssetUrls,
): void {
  const sheet = ensureFontsSheet();
  const rules: string[] = [];
  for (const font of fonts) {
    const url = assets.get(font.assetId);
    if (url === undefined) continue;
    rules.push(`@font-face { font-family: "${font.family}"; src: url(${url}); }`);
  }
  sheet.textContent = rules.join('\n');
}

export function applyElement(
  node: HTMLElement,
  element: Element,
  state: ElementState,
  assets?: AssetUrls,
): void {
  node.className = state.styleId === undefined
    ? `scene-el scene-${element.type}`
    : `scene-el scene-${element.type} st-${state.styleId}`;
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

  /**
   * Ключи, которые ЭТА функция поставила в прошлый раз, но которых больше
   * нет в состоянии, снимаются явно.
   *
   * `setProperty` умеет только записывать. Пока ключи из карты стиля
   * не исчезали, снимать было нечего, и дефект не проявлялся ни разу —
   * поэтому он и дожил до сих пор. Проявился на «вернуть как в стиле»:
   * модель обновлялась верно, пометка отличия пропадала, а элемент
   * оставался с прежним инлайном НАВСЕГДА — инлайн сильнее правила класса.
   *
   * Это НЕ дефект стилей. Он и без них бил бы в плеере: ключ, который есть
   * на одном слайде и отсутствует на соседнем, оставался бы на элементе
   * после точечной перерисовки (`#renderStates`, половины перехода). Просто
   * до появления стилей такое состояние никто не строил.
   *
   * Снимаются ТОЛЬКО свои ключи, а не весь инлайн: рядом живут значения,
   * поставленные не здесь — `cursor` и `opacity` у кликабельного варианта
   * в гейте (`player.ts`), фон картинки у рендерера типа (`registry.ts`).
   * Чистка `cssText` стёрла бы и их.
   */
  const previous = node.dataset['styleKeys'];
  if (previous !== undefined && previous !== '') {
    for (const key of previous.split(' ')) {
      if (!(key in state.style)) style.removeProperty(key);
    }
  }

  for (const [key, value] of Object.entries(state.style)) {
    style.setProperty(key, String(value));
  }

  const keys = Object.keys(state.style);
  if (keys.length === 0) delete node.dataset['styleKeys'];
  else node.dataset['styleKeys'] = keys.join(' ');

  const renderer = getElementRenderer(element.type);
  if (!renderer) {
    throw new Error(`Для типа элемента «${element.type}» не зарегистрирован DOM-рендерер`);
  }
  renderer(node, element, assets);
}

/** Куда и в каком порядке ставить один узел сцены. */
export interface Placement {
  readonly element: Element;
  readonly state: ElementState;
  /** Внутрь кого класть: id элемента-группы либо `undefined` — прямо в хост. */
  readonly parentId: string | undefined;
}

/**
 * Решает, кто чей потомок и в каком порядке вставляется. DOM не трогает.
 *
 * Вынесено из `renderScene` не ради красоты: юниты идут в `node` без DOM
 * (`vitest.config.ts`), поэтому всё, что зовёт `document.createElement`,
 * проверяется только браузером. Здесь же живёт единственное во всём рендере
 * НЕОЧЕВИДНОЕ решение — дерево, порядок и обнаружение сироты, — и оно обязано
 * быть проверяемым без браузера.
 *
 * **Родитель всегда раньше своих детей.** На это опирается `renderScene`:
 * узел родителя он берёт из карты уже вставленных.
 *
 * **Обход не может зациклиться по построению.** Начинают его только элементы
 * с пустым `parentId`, а спуск идёт по `parentId` вниз; участник цикла пустого
 * `parentId` не имеет, корнем не становится и рекурсию не начинает. Цикл
 * поэтому не вешает обход, а обнаруживается счётом непоставленных.
 */
export function planPlacement(
  elements: readonly Element[],
  states: SlideStates,
): Placement[] {
  const childrenOf = new Map<string, Element[]>();
  const roots: Element[] = [];
  let expected = 0;

  for (const element of elements) {
    // ADR-015: элемента без состояния на слайде нет вовсе.
    if (states[element.id] === undefined) continue;
    expected += 1;

    const { parentId } = element;
    if (parentId === undefined) {
      roots.push(element);
      continue;
    }
    const siblings = childrenOf.get(parentId);
    if (siblings === undefined) childrenOf.set(parentId, [element]);
    else siblings.push(element);
  }

  const order: Placement[] = [];
  const walk = (element: Element, parentId: string | undefined): void => {
    const state = states[element.id];
    if (state === undefined) return;
    order.push({ element, state, parentId });
    for (const child of childrenOf.get(element.id) ?? []) walk(child, element.id);
  };
  for (const root of roots) walk(root, undefined);

  /**
   * Непоставленный элемент — это либо сирота (родителя на слайде нет), либо
   * участник цикла. Схема запрещает и то и другое, но `renderScene` получает
   * данные и из редактора, который держит сегмент в памяти и не гоняет его
   * через разбор на каждое нажатие. Тихо пропустить нельзя: автор увидел бы,
   * что объект исчез со сцены, без единого слова о причине.
   */
  if (order.length !== expected) {
    const placed = new Set(order.map((p) => p.element.id));
    const lost = elements
      .filter((el) => states[el.id] !== undefined && !placed.has(el.id))
      .map((el) => `«${el.id}» → «${el.parentId ?? ''}»`);
    throw new Error(
      `Элементы есть на слайде, но их некуда положить: ${lost.join(', ')}. `
      + 'Либо группы нет на этом слайде, либо вложенность зациклена.',
    );
  }

  return order;
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
  assets?: AssetUrls,
): Map<string, HTMLElement> {
  host.textContent = '';
  host.style.position = 'relative';
  host.style.width = `${stage.width}px`;
  host.style.height = `${stage.height}px`;
  host.style.transformOrigin = '0 0';
  host.style.overflow = 'hidden';

  /**
   * Карта ПЛОСКАЯ, хотя DOM теперь дерево, и это несущее требование.
   * По ней адресуют узлы `ScenePreview.updateElement` (перетаскивание
   * в редакторе) и `buildMorph` (участники перехода). Вложенная карта
   * сломала бы обоих молча.
   */
  const nodes = new Map<string, HTMLElement>();

  // Метка сцены — на КАЖДЫЙ узел, не только на хост: рендерер фигуры
  // (renderers/registry.ts) получает `node`, а не `host`, и без метки
  // на узле ему неоткуда взять `uid` для уникального id наконечника стрелки.
  const uid = sceneUid(host);

  // Порядок вставки задан порядком в массиве: рендер детерминирован,
  // и одинаковый слайд всегда даёт одинаковый DOM.
  for (const { element, state, parentId } of planPlacement(elements, states)) {
    const node = document.createElement('div');
    node.dataset['scene'] = uid;
    applyElement(node, element, state, assets);

    // Родитель уже в карте: `planPlacement` ставит его раньше детей.
    const parent = parentId === undefined ? host : nodes.get(parentId);
    if (parent === undefined) {
      throw new Error(`Узел группы «${parentId}» не создан раньше своего ребёнка «${element.id}»`);
    }
    parent.appendChild(node);
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
