/**
 * Пространство вида «Ветки» — чистая математика, без DOM и без React.
 *
 * Владелец 16.08.2026: вид должен быть «как в фигме — просто пространство,
 * по которому можно ездить, зажимая колёсико мыши», плюс полноценный масштаб.
 * Дерево веток может быть шире и выше окна в разы, поэтому нужен не один
 * фиксированный масштаб (как у холста, `stage/zoom.ts`), а плавающая камера:
 * сдвиг и масштаб вместе, без ступеней — здесь, в отличие от холста, автор
 * не целится в конкретный процент, а листает дерево целиком.
 *
 * `SpaceView` — это ГДЕ стоит камера: `x`/`y` — координата пространства
 * в левом верхнем углу окна, `scale` — во сколько раз пространство крупнее
 * экрана. Всё в модуле — про то, как эта тройка меняется от жестов автора,
 * и ничего — про то, как её применить к DOM (это дело вида, не этого файла).
 */

/** Куда смотрит автор: сдвиг пространства и масштаб. */
export interface SpaceView {
  /** Координата пространства, стоящая в левом верхнем углу окна. */
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;

/** Зазор вокруг дерева при вписывании, в экранных пикселях. */
export const FIT_PADDING_PX = 24;

/** Начало координат, масштаб 1 — вид до первого жеста автора. */
export const IDENTITY_VIEW: SpaceView = { x: 0, y: 0, scale: 1 };

/** Точка пространства → точка окна. */
export function toScreen(view: SpaceView, point: Point): Point {
  return {
    x: (point.x - view.x) * view.scale,
    y: (point.y - view.y) * view.scale,
  };
}

/** Точка окна → точка пространства. Обратное преобразование к `toScreen`. */
export function toSpace(view: SpaceView, point: Point): Point {
  return {
    x: point.x / view.scale + view.x,
    y: point.y / view.scale + view.y,
  };
}

/**
 * Езда: сдвиг указателя в ЭКРАННЫХ пикселях.
 *
 * Семантика — «схватить и потянуть»: точка пространства, которая была под
 * указателем до движения, оказывается под НОВЫМ положением указателя после
 * него (пространство «следует за рукой», как при зажатом колёсике в Figma).
 * Отсюда деление на масштаб — на увеличенном виде та же экранная тяга
 * покрывает меньше пространства, — и знак минус: чтобы точка «поехала»
 * вместе с указателем на `screenDx` вправо, левый верхний угол окна должен
 * сдвинуться в пространстве НА ТУ ЖЕ величину влево.
 *
 * У колеса мыши (`wheelIntent`) физика другая — это не хватание рукой,
 * а прокрутка страницы, — поэтому оно само разворачивает знак перед тем,
 * как передать сдвиг сюда; см. комментарий там.
 */
export function panBy(view: SpaceView, screenDx: number, screenDy: number): SpaceView {
  return {
    x: view.x - screenDx / view.scale,
    y: view.y - screenDy / view.scale,
    scale: view.scale,
  };
}

/**
 * Масштабирование ПОД КУРСОРОМ: точка пространства, лежавшая под указателем,
 * обязана остаться ровно под ним. `factor` — во сколько раз, например 1.1.
 *
 * Приём: сначала узнаём, какая точка пространства сейчас под курсором
 * (`toSpace` от текущего вида), затем подбираем новые `x`/`y` так, чтобы
 * `toScreen` от НОВОГО вида вернул для этой же точки то же самое `screenPoint`.
 * Формула получается сама, без отдельной ветки на «масштаб уже на пределе»:
 * если `zoomAt` подставленный `factor` зажимается до того же `scale`, что
 * и был, слагаемые с `screenPoint` в выводе взаимно уничтожаются и `x`/`y`
 * возвращаются ровно теми же, какими были, — вид не меняется вовсе, как
 * и требуется на упёршемся пределе.
 */
export function zoomAt(view: SpaceView, factor: number, screenPoint: Point): SpaceView {
  const anchor = toSpace(view, screenPoint);
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: anchor.x - screenPoint.x / scale,
    y: anchor.y - screenPoint.y / scale,
  };
}

/**
 * Вписать содержимое в окно с зазором `FIT_PADDING_PX` с каждой стороны,
 * центрируя по обеим осям. Пустая коробка окна (после вычета зазора не
 * остаётся места) или нулевое содержимое — вернуть `IDENTITY_VIEW`: вписывать
 * нечего и не во что, а выдумывать масштаб для пустоты нельзя (тот же довод,
 * что у `tileWidths` в `chapters.ts` для главы нулевой длительности — там,
 * впрочем, отвечали константой минимума, здесь честный ответ — тождество).
 */
/**
 * Каким доска ОТКРЫВАЕТСЯ. Не то же, что «Показать всё».
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ. Доска вписывала дерево при открытии любой ценой,
 * и цена оказалась высокой. Замер 22.08.2026, фикстура `branching`, окно
 * 1440×900: вписывание давало **40 %**, то есть подписи глав рисовались
 * кеглем 4 px. Автор открывал «Ветки» и видел россыпь нечитаемых полосок
 * в пустом поле — ровно то, на что владелец пожаловался словом «пустое».
 *
 * Обратный перекос был тем же вписыванием: у короткой фикстуры
 * (`exit-branch`) оно РАЗДУВАЛО дерево до 148 %, и три главы занимали
 * весь экран.
 *
 * Поэтому при открытии масштаб зажат в читаемое: не мельче
 * `READABLE_MIN_SCALE` и не крупнее единицы. Дерево, которое в эти рамки
 * не влезло, показывается С НАЧАЛА, а не серединой: рассказ читают
 * слева направо, и первая глава — то место, откуда автор смотрит.
 *
 * «Показать всё» (`fitView`) при этом не трогается: там автор просит обзор
 * сознательно и готов к мелкому кеглю.
 */
/** Вид, в котором центр содержимого попадает в центр окна при данном масштабе. */
function centredAt(content: Box, viewportWidth: number, viewportHeight: number, scale: number): { x: number; y: number } {
  return {
    x: content.x + content.width / 2 - viewportWidth / 2 / scale,
    y: content.y + content.height / 2 - viewportHeight / 2 / scale,
  };
}

export const READABLE_MIN_SCALE = 0.75;

export function openView(content: Box, viewportWidth: number, viewportHeight: number): SpaceView {
  const fitted = fitView(content, viewportWidth, viewportHeight);
  const scale = clamp(fitted.scale, READABLE_MIN_SCALE, 1);

  /*
   * Центрировать или показывать с начала — решает то, ВЛЕЗАЕТ ЛИ дерево
   * при выбранном масштабе, а не совпал ли масштаб с вписыванием.
   *
   * Разница поймана тестом: дерево 800×300 в окне 1000×500 вписалось бы
   * на 119 %, потолок срезал до 100 — и по равенству масштабов выходило
   * «не влезло», хотя при 100 % оно влезает с запасом. Автор увидел бы
   * прижатое к углу дерево там, где просилось по центру.
   */
  const availableWidth = viewportWidth - 2 * FIT_PADDING_PX;
  const availableHeight = viewportHeight - 2 * FIT_PADDING_PX;
  const fitsNow = content.width * scale <= availableWidth
    && content.height * scale <= availableHeight;
  if (fitsNow) return { scale, ...centredAt(content, viewportWidth, viewportHeight, scale) };

  // Не влезло: ставим левый верхний угол дерева в угол окна с тем же
  // зазором, что у обзора. Центрирование здесь показало бы СЕРЕДИНУ
  // дерева — место, которого автор не просил.
  return {
    scale,
    x: content.x - FIT_PADDING_PX / scale,
    y: content.y - FIT_PADDING_PX / scale,
  };
}

export function fitView(content: Box, viewportWidth: number, viewportHeight: number): SpaceView {
  const availableWidth = viewportWidth - 2 * FIT_PADDING_PX;
  const availableHeight = viewportHeight - 2 * FIT_PADDING_PX;
  if (!(availableWidth > 0) || !(availableHeight > 0) || !(content.width > 0) || !(content.height > 0)) {
    return IDENTITY_VIEW;
  }

  const scale = clamp(
    Math.min(availableWidth / content.width, availableHeight / content.height),
    MIN_SCALE,
    MAX_SCALE,
  );

  const contentCenter: Point = {
    x: content.x + content.width / 2,
    y: content.y + content.height / 2,
  };
  const viewportCenter: Point = { x: viewportWidth / 2, y: viewportHeight / 2 };

  // Центр содержимого обязан попасть в центр окна: решаем toScreen(view,
  // contentCenter) === viewportCenter относительно view.x/view.y.
  return {
    scale,
    x: contentCenter.x - viewportCenter.x / scale,
    y: contentCenter.y - viewportCenter.y / scale,
  };
}

/**
 * Колесо: что оно означает при данных модификаторах. Разбор намерения
 * отдельно от применения — эта функция не трогает `SpaceView` вовсе,
 * она только решает, что имел в виду автор.
 *
 * **Знак сдвига развёрнут нарочно.** `deltaY > 0` (прокрутка вниз) обязана
 * двигать содержимое ВВЕРХ — та же физика, что у прокрутки страницы: вниз
 * по колесу — вниз по дереву, содержимое уезжает вверх экрана. Но `panBy`
 * устроен как «хватание рукой» (см. его комментарий): положительный сдвиг
 * там тянет содержимое ЗА указателем, то есть вниз. Чтобы колесо, применённое
 * через тот же `panBy`, дало страничную физику, а не хватательную, сюда
 * передаётся `-deltaY`/`-deltaX` — двойное отрицание в `panBy` (там уже есть
 * минус) даёт на выходе ровно `+delta/scale`, то есть простое «сдвинуть вид
 * вперёд на дельту», как и ждёт от колеса любой браузер.
 */
export function wheelIntent(event: {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}):
  | { readonly kind: 'zoom'; readonly factor: number }
  | { readonly kind: 'pan'; readonly screenDx: number; readonly screenDy: number } {
  if (event.ctrlKey || event.metaKey) {
    return { kind: 'zoom', factor: zoomFactorFromWheel(event.deltaY) };
  }
  if (event.shiftKey) {
    return { kind: 'pan', screenDx: -event.deltaY, screenDy: 0 };
  }
  return { kind: 'pan', screenDx: -event.deltaX, screenDy: -event.deltaY };
}

/**
 * Коэффициент масштаба из `deltaY` — экспонента, ради одного свойства:
 * `factor(d) * factor(-d) === 1` РОВНО, а не приблизительно, потому что
 * `exp(a) * exp(-a) = exp(0) = 1` алгебраически, и с плавающей точкой это
 * держится с точностью много лучше требуемой 1e-12 (расходятся только
 * округления двух вызовов `Math.exp`, порядка 1e-16).
 *
 * Прокрутка вниз (`deltaY > 0`) обязана УМЕНЬШАТЬ масштаб — отсюда минус
 * в показателе. Константа чувствительности не измерена, а подобрана: один
 * «тик» колеса (`deltaY` порядка 100) даёт множитель около 0.90, заметный,
 * но не рывок.
 */
function zoomFactorFromWheel(deltaY: number): number {
  const WHEEL_ZOOM_SENSITIVITY = 0.001;
  return Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
