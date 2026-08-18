/**
 * Стиль элемента сцены — восемь полей, которые показывает редактор,
 * и функции чтения/записи в свободную карту `style` (ADR-012).
 *
 * В схеме v3 `style` переехал с `Element` на `ElementState` (см. schema.ts:
 * «здесь намеренно нет style» у `ElementSchema») — стиль это ГДЕ и КАК,
 * а не КТО, и живёт на слайде, а не на самом элементе. Этот модуль от
 * переезда не пострадал: он как читал/писал произвольную карту `style`,
 * так и продолжает — просто карта теперь берётся из `ElementState.style`,
 * а не из `Element.style`.
 *
 * `ElementStateSchema.style` — `Record<string, string | number>`, схема ключи
 * не ограничивает вовсе. Значит набор полей, которые видит автор в панели,
 * это продуктовое решение, а не следствие схемы, и его фиксирует этот
 * модуль, а не компонент — иначе набор незаметно расползётся по разным
 * местам UI.
 *
 * Правило отбора важнее списка: из полей стиля исключается всё, что есть
 * в `ANIMATABLE`. Если автор выставит `opacity: 0.5` в стиле, а на элементе
 * висит анимация появления `opacity 0 → 1`, они молча подерутся за одно
 * CSS-свойство и победит анимация (ADR-009: элемент держится в `from` до
 * старта, дальше — в значении анимации). Автор увидит, что поле «не
 * работает», и не поймёт почему. Прозрачность и блюр живут в анимации;
 * положение и поворот — в геометрии элемента (`x`/`y`/`rotation`), не
 * в style. `style.test.ts` проверяет непересечение с ANIMATABLE перебором
 * константы, а не на глаз: если однажды кто-то добавит сюда `opacity`,
 * тест обязан покраснеть.
 *
 * Второе правило: ни одно поле не двигает раскладку за пределы бокса
 * элемента — `padding`, `margin`, `border` в набор не входят.
 *
 * Одно поле, `border-radius`, хранит не голое число, а число с единицей —
 * px или %. Круг (точка, аватарка) — базовая потребность автора, и `50%`
 * единственный способ его получить (см. `fixtures/projects/demo.json` →
 * элемент `dot`). Единица — часть значения, а не оформление: `50%`
 * и `50px` значат разное (процент считается от размера бокса элемента),
 * поэтому их нельзя свести к одному числовому скаляру — отсюда структура
 * `LengthOrPercent { amount, unit }` вместо голого `number`.
 *
 * Чтение никогда не бросает на значении, которого не понимает. `style` —
 * свободная карта: туда может попасть что угодно — CSS, который наше поле
 * не умеет разобрать, значение из другой версии редактора или ключ,
 * которого в наборе восьми вообще нет (`opacity` под управлением анимации,
 * `border`, вписанный руками в JSON, — оба реально есть в demo.json).
 * Это не ошибка и не битые данные, это честное ограничение редактора.
 * `getStyleValue` и `readStyleEntry` возвращают такое как
 * `{ kind: 'raw', text }`, а не бросают — иначе один непонятный CSS ронял
 * бы всю панель свойств целиком (тот же класс дефекта, что раньше был
 * у `markSeconds`: падать громко правильно, падать целиком — нет).
 *
 * Бросают они по-прежнему на баге вызывающего кода: `getStyleValue`
 * запросили с ключом, которого нет в STYLE_FIELDS (её ключ статически
 * ограничен восемью полями — если runtime всё равно получил чужой ключ,
 * это подделанный тип или опечатка в коде, а не данные); `setStyleValue`
 * попросили записать значение не из закрытого списка или не разбираемое —
 * туда попадает только то, что уже должно быть провалидировано виджетом
 * этого поля. `readStyleEntry`, в отличие от обеих, принимает произвольный
 * ключ произвольных данных и поэтому никогда не бросает даже на незнакомом
 * ключе — см. её комментарий.
 */
import { ELEMENT_TYPES, ThemeSchema, type Element, type ElementState } from '@player/core';

/** Карта style элемента — ровно то же, что `ElementStateSchema.style`. */
export type ElementStyle = ElementState['style'];

/** Как показывать и разбирать значение поля. */
export type StyleValueType = 'color' | 'length' | 'length-or-percent' | 'number' | 'choice';

export interface StyleChoice {
  readonly value: string;
  readonly label: string;
}

/**
 * Число с единицей — px или %. Проценты и пиксели намеренно не сведены
 * в один скаляр: `50%` от бокса 100×100 и `50%` от бокса 400×400 — разные
 * пиксели, а `50px` — всегда одно и то же число. Смешивать единицы в одном
 * числовом поле значило бы тихо терять смысл при каждом чтении.
 */
export interface LengthOrPercent {
  readonly amount: number;
  readonly unit: 'px' | '%';
}

/**
 * Ключи ровно восьми утверждённых полей. Расширение набора — правка
 * ADR-012 и этого списка вместе, не тихое добавление где-то в компоненте.
 */
export type StyleFieldKey =
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'color'
  | 'text-align'
  | 'line-height'
  | 'background'
  | 'border-radius';

/**
 * Смысловая группа поля на полосе свойств. Перечень ЗАКРЫТЫЙ, а поле
 * ОБЯЗАТЕЛЬНОЕ — и то и другое нарочно: полоса группируется разделителями
 * по этому признаку, и девятое поле, заведённое без группы, встало бы
 * в конец последней группы МОЛЧА. Тип заставляет выбрать, а не вспомнить.
 *
 * Разбиение утверждено владельцем 18.08.2026 словами «что за буквы ·
 * как расставлены · где лежит».
 */
export type StyleFieldGroup = 'буквы' | 'расстановка' | 'плашка';

export interface StyleFieldDef {
  readonly key: StyleFieldKey;
  /** Смысловая группа — см. StyleFieldGroup. */
  readonly group: StyleFieldGroup;
  /** Человеческое название по-русски — для панели, не для CSS. */
  readonly label: string;
  readonly valueType: StyleValueType;
  /** К каким типам элементов применимо поле. */
  readonly appliesTo: readonly Element['type'][];
  /**
   * Значение по умолчанию в «авторском» представлении — том же, которое
   * возвращает `getStyleValue` внутри `{ kind: 'parsed' }`. Используется,
   * когда ключ отсутствует в style, то есть это ровно то, что автор
   * увидит для только что созданного элемента.
   */
  readonly default: string | number | LengthOrPercent;
  /** Только для valueType === 'choice' — закрытый список допустимых значений. */
  readonly choices?: readonly StyleChoice[];
}

/**
 * Результат чтения одного значения style.
 *
 * `parsed` — модуль разобрал значение и уверен в его смысле, можно отдавать
 * в виджет поля как есть. `token` — значение оказалось ссылкой на роль темы,
 * `var(--roleName, fallback)`, где `--roleName` входит в закрытый список
 * `ThemeSchema.shape` (десять ролей), а `fallback` — запасное значение,
 * присутствие которого ОБЯЗАТЕЛЬНО (см. `tryToken`: спайк S11 — браузер
 * молча отбрасывает объявление с неизвестным токеном целиком, ни ошибки,
 * ни предупреждения). `raw` — под ключом лежит нечто, что этот модуль
 * не понимает, и это НЕ повод бросать исключение (см. комментарий в шапке
 * файла): `text` хранит исходное значение как строку, чтобы панель могла
 * показать его текстом и не потерять при записи соседнего поля — ни чтение,
 * ни `setStyleValue` не трогают ключи, которые их не просили менять.
 *
 * `mixed` — значения нет, потому что выделено несколько элементов и общего
 * значения у них не существует. Отдельный вариант, а не «значение первого»:
 * значение первого выглядит как общее, и автор, поправив его, получает не то,
 * что видел. Из `getStyleValue` этот вариант не приходит НИКОГДА — его
 * возвращает только `commonStyleValue`, которой и дано право сказать
 * «общего нет».
 */
export type StyleReadResult =
  | { readonly kind: 'parsed'; readonly value: string | number | LengthOrPercent }
  | { readonly kind: 'token'; readonly token: string; readonly fallback: string }
  | { readonly kind: 'raw'; readonly text: string }
  | { readonly kind: 'mixed' };

const TEXT_ONLY: readonly Element['type'][] = ['text'];
// Ссылка на перечень схемы, а не своя копия. Копия здесь уже была и уже
// разошлась: она перечисляла три типа, комментарий рядом называл версию
// схемы v3, а схема к тому времени ушла вперёд. Неполный массив ошибкой
// не является — он типизирован как Element['type'][], — поэтому разойтись
// он мог только молча. → ELEMENT_TYPES в @player/core
const ALL_TYPES: readonly Element['type'][] = ELEMENT_TYPES;

/**
 * Восемь полей, ключи kebab-case — как в фикстурах. Значения по умолчанию
 * взяты из `fixtures/projects/demo.json`, чтобы стиль по умолчанию совпадал
 * с тем, как выглядит остальной проект: текстовые — из style элементов
 * `lead`/`footer` (те же значения, что уже использует `state/elements.ts`
 * для фабрики текста), фон и скругление — из style элемента `card`
 * (те же значения, что фабрика фигуры).
 */
export const STYLE_FIELDS: readonly StyleFieldDef[] = [
  {
    key: 'font-family',
    group: 'буквы',
    label: 'Шрифт',
    valueType: 'choice',
    appliesTo: TEXT_ONLY,
    default: 'system-ui, sans-serif',
    choices: [
      { value: 'system-ui, sans-serif', label: 'Системный (без засечек)' },
      { value: 'Georgia, serif', label: 'Georgia (с засечками)' },
      { value: 'ui-monospace, monospace', label: 'Моноширинный' },
    ],
  },
  {
    key: 'font-size',
    group: 'буквы',
    label: 'Кегль',
    valueType: 'length',
    appliesTo: TEXT_ONLY,
    default: 36,
  },
  {
    key: 'font-weight',
    group: 'буквы',
    label: 'Насыщенность',
    valueType: 'choice',
    appliesTo: TEXT_ONLY,
    default: '400',
    choices: [
      { value: '400', label: 'Обычная' },
      { value: '500', label: 'Средняя' },
      { value: '600', label: 'Полужирная' },
      { value: '700', label: 'Жирная' },
      { value: '800', label: 'Чёрная' },
    ],
  },
  {
    key: 'color',
    group: 'буквы',
    label: 'Цвет',
    valueType: 'color',
    appliesTo: TEXT_ONLY,
    default: '#9fb0c4',
  },
  {
    key: 'text-align',
    group: 'расстановка',
    label: 'Выравнивание',
    valueType: 'choice',
    appliesTo: TEXT_ONLY,
    default: 'left',
    choices: [
      { value: 'left', label: 'По левому краю' },
      { value: 'center', label: 'По центру' },
      { value: 'right', label: 'По правому краю' },
      { value: 'justify', label: 'По ширине' },
    ],
  },
  {
    key: 'line-height',
    group: 'расстановка',
    label: 'Межстрочный',
    valueType: 'number',
    appliesTo: TEXT_ONLY,
    default: 1.5,
  },
  {
    key: 'background',
    group: 'плашка',
    label: 'Фон',
    valueType: 'color',
    appliesTo: ALL_TYPES,
    default: '#1b2430',
  },
  {
    key: 'border-radius',
    group: 'плашка',
    label: 'Скругление',
    valueType: 'length-or-percent',
    appliesTo: ALL_TYPES,
    default: { amount: 28, unit: 'px' },
  },
];

const FIELDS_BY_KEY = new Map(STYLE_FIELDS.map((field) => [field.key, field]));

/** Поля, применимые к данному типу элемента — в порядке таблицы ADR-012. */
export function styleFieldsFor(type: Element['type']): readonly StyleFieldDef[] {
  return STYLE_FIELDS.filter((field) => field.appliesTo.includes(type));
}

/** Баг вызывающего кода: ключ вне STYLE_FIELDS не бывает у корректно написанной панели. */
function requireField(key: string): StyleFieldDef {
  const field = FIELDS_BY_KEY.get(key as StyleFieldKey);
  if (!field) {
    throw new Error(
      `Поле стиля «${key}» не входит в утверждённый набор из восьми (ADR-012) — ` +
        'расширение набора требует правки ADR, а не тихого добавления',
    );
  }
  return field;
}

function isBlank(value: string | number | LengthOrPercent | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  // 0 — валидное число (например, border-radius: 0), пустой строкой не считается.
  return typeof value === 'string' && value.trim() === '';
}

// ---------------------------------------------------------------------------
// Разбор, допускающий неудачу — используется при чтении. НИКОГДА не бросает,
// а сигналит «не понимаю» через undefined; вызывающий превращает это в raw.
// ---------------------------------------------------------------------------

/**
 * Цвет — только то, что виджет способен показать и вернуть.
 *
 * `<input type="color">` по спецификации HTML принимает РОВНО «#» и шесть
 * шестнадцатеричных цифр: и `transparent`, и `rgba(0,0,0,0)`, и сокращённое
 * `#abc` он молча заменяет на `#000000`, а Chrome вдобавок пишет в консоль
 * «The specified value … must be a valid CSS color».
 *
 * Раньше сюда проходила любая непустая строка. Пока в проектах лежал только
 * шестизначный hex, это ничего не значило; фигуры «Рамка» и «Скобка» из
 * библиотеки (`state/library.ts`) задают прозрачный фон и сделали дефект
 * достижимым нажатием кнопки — панель предлагала правку цвета, которого
 * не могла ни показать, ни сохранить, и предупреждала об этом в консоль.
 *
 * Всё остальное — законный CSS, просто не редактируемый этим виджетом:
 * возвращаем undefined, и значение показывается текстом, как любое другое
 * непонятое (это уже проверено `e2e/style.spec.ts`).
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function tryColor(raw: string | number): string | undefined {
  const text = String(raw).trim();
  return HEX_COLOR.test(text) ? text : undefined;
}

/**
 * Ссылка на роль темы — `var(--roleName, fallback)`.
 *
 * Роль сцены живёт в `ThemeSchema` (@player/core) — закрытый список из
 * десяти CSS custom properties. Элемент ссылается на роль обычной строкой
 * в своей карте стиля, и это остаётся строкой всегда: бампа схемы такая
 * ссылка не требует (ADR при `ThemeSchema`).
 *
 * Запасное значение проверяется на присутствие, а не только на синтаксис:
 * S11 измерил, что `var(--неизвестный)` без запаса браузер отбрасывает
 * ЦЕЛИКОМ — не как чёрный цвет, а как отсутствующее объявление, без единой
 * строки в консоли. Автор увидел бы нередактируемый чёрный текст и не понял
 * бы почему. Поэтому `var(--x)` без запятой — не токен вовсе, а `raw`
 * (заряженное ружьё, которое эта функция отказывается взводить).
 *
 * Имя роли не входит в `ThemeSchema.shape` — тоже не токен, а `raw`: иначе
 * панель показала бы автору «роль темы» и покрасила бы запасным значением,
 * то есть соврала бы, что тема на элемент влияет.
 *
 * Разделитель — ровно первая запятая после имени роли: у `--scene-font`
 * запасное значение само содержит запятую (`system-ui, sans-serif`,
 * см. `STYLE_FIELDS['font-family'].default`), и `(.+)` жадно захватывает
 * весь остаток до закрывающей скобки, а не режет по каждой запятой.
 *
 * Не привязана к `valueType` поля намеренно: роли темы включают не только
 * цвета (`--scene-radius`, `--scene-font`), а `STYLE_FIELDS` содержит поля
 * ровно тех же типов (`length-or-percent`, `choice`) — ограничение токена
 * одним `'color'` оставило бы эти роли нераспознаваемыми без причины.
 */
const TOKEN_REF = /^var\(\s*(--[^\s,()]+)\s*,\s*([\s\S]+)\)$/;

function tryToken(raw: string | number): { token: string; fallback: string } | undefined {
  if (typeof raw !== 'string') return undefined;
  const match = TOKEN_REF.exec(raw.trim());
  if (!match) return undefined;
  const token = match[1]!;
  const fallback = match[2]!.trim();
  if (fallback === '') return undefined;
  if (!Object.prototype.hasOwnProperty.call(ThemeSchema.shape, token)) return undefined;
  return { token, fallback };
}

function tryLength(raw: string | number): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/.exec(raw.trim());
  return match ? Number(match[1]) : undefined;
}

function tryNumber(raw: string | number): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isNaN(value) ? undefined : value;
}

function tryChoice(raw: string | number, field: StyleFieldDef): string | undefined {
  const text = String(raw).trim();
  const choices = field.choices ?? [];
  return choices.some((choice) => choice.value === text) ? text : undefined;
}

function tryLengthOrPercent(raw: string | number): LengthOrPercent | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { amount: raw, unit: 'px' } : undefined;
  }
  const match = /^(-?\d+(?:\.\d+)?)(px|%)?$/.exec(raw.trim());
  if (!match) return undefined;
  return { amount: Number(match[1]), unit: match[2] === '%' ? '%' : 'px' };
}

/** Пытается разобрать сырое значение известного поля. undefined = «есть, но не понимаем» → raw. */
function tryParseKnown(
  raw: string | number,
  field: StyleFieldDef,
): string | number | LengthOrPercent | undefined {
  switch (field.valueType) {
    case 'color':
      return tryColor(raw);
    case 'length':
      return tryLength(raw);
    case 'length-or-percent':
      return tryLengthOrPercent(raw);
    case 'number':
      return tryNumber(raw);
    case 'choice':
      return tryChoice(raw, field);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Строгий разбор — используется при записи. Сюда попадает то, что уже
// должно быть провалидировано виджетом этого поля; несоответствие — баг
// вызывающего, бросаем громко и по-русски.
// ---------------------------------------------------------------------------

function assertScalar(value: string | number | LengthOrPercent, field: StyleFieldDef): string | number {
  if (typeof value === 'object') {
    throw new Error(`Поле «${field.label}» (${field.key}): ожидалось число или строка, получен объект`);
  }
  return value;
}

function parseLengthStrict(value: string | number, field: StyleFieldDef): number {
  const parsed = tryLength(value);
  if (parsed === undefined) {
    throw new Error(
      `Поле «${field.label}» (${field.key}): не удалось разобрать длину «${value}» — ` +
        'ожидалось число в пикселях, например «36px»',
    );
  }
  return parsed;
}

function parseNumberStrict(value: string | number, field: StyleFieldDef): number {
  const parsed = tryNumber(value);
  if (parsed === undefined) {
    throw new Error(`Поле «${field.label}» (${field.key}): не удалось разобрать число «${value}»`);
  }
  return parsed;
}

function parseColorStrict(value: string | number, field: StyleFieldDef): string {
  const parsed = tryColor(value);
  if (parsed === undefined) {
    throw new Error(
      `Поле «${field.label}» (${field.key}): пустое значение — сброс обязан удалять ключ, а не хранить пустую строку`,
    );
  }
  return parsed;
}

function parseChoiceStrict(value: string | number, field: StyleFieldDef): string {
  const parsed = tryChoice(value, field);
  if (parsed === undefined) {
    const choices = field.choices ?? [];
    throw new Error(
      `Поле «${field.label}» (${field.key}): значение «${String(value).trim()}» не входит в список ` +
        `допустимых (${choices.map((choice) => choice.value).join(', ')})`,
    );
  }
  return parsed;
}

function coerceLengthOrPercent(value: string | number | LengthOrPercent, field: StyleFieldDef): LengthOrPercent {
  if (typeof value === 'object') {
    if (!Number.isFinite(value.amount) || (value.unit !== 'px' && value.unit !== '%')) {
      throw new Error(`Поле «${field.label}» (${field.key}): некорректное значение длины/процента`);
    }
    return value;
  }
  const parsed = tryLengthOrPercent(value);
  if (!parsed) {
    throw new Error(
      `Поле «${field.label}» (${field.key}): не удалось разобрать «${value}» — ` +
        'ожидалось число в пикселях или процентах, например «28px» или «50%»',
    );
  }
  return parsed;
}

function formatLength(value: number, field: StyleFieldDef): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Поле «${field.label}» (${field.key}): значение должно быть конечным числом`);
  }
  return `${value}px`;
}

function formatNumber(value: number, field: StyleFieldDef): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Поле «${field.label}» (${field.key}): значение должно быть конечным числом`);
  }
  return String(value);
}

function formatLengthOrPercent(value: LengthOrPercent): string {
  return `${value.amount}${value.unit}`;
}

// ---------------------------------------------------------------------------
// Публичное API
// ---------------------------------------------------------------------------

/**
 * Читает значение одного из восьми полей.
 *
 * Ключ статически ограничен `StyleFieldKey` — вызывающий (панель стиля)
 * всегда берёт его из `STYLE_FIELDS`, поэтому незнакомый ключ здесь — баг,
 * и это по-прежнему бросает громко. А вот значение, лежащее под ключом,
 * может быть чем угодно (свободная карта, чужой JSON, ручная правка) —
 * если разобрать его не получилось, возвращается `{ kind: 'raw', text }`,
 * а не исключение: одно непонятное значение не имеет права ронять всю
 * панель свойств.
 */
export function getStyleValue(style: ElementStyle, key: StyleFieldKey): StyleReadResult {
  const field = requireField(key);
  if (!(key in style)) return { kind: 'parsed', value: field.default };
  const raw = style[key]!;
  const token = tryToken(raw);
  if (token) return { kind: 'token', token: token.token, fallback: token.fallback };
  const parsed = tryParseKnown(raw, field);
  return parsed === undefined ? { kind: 'raw', text: String(raw) } : { kind: 'parsed', value: parsed };
}

/**
 * Общее значение поля у НЕСКОЛЬКИХ выделенных — или `mixed`, если общего нет.
 *
 * Существует потому, что полоса свойств до Сессии 32 показывала значение
 * ПЕРВОГО выделенного как будто оно общее. Выглядело это безупречно: цвет
 * настоящий, поле рабочее, ни одного признака беды. Автор, выделивший три
 * разноцветные фигуры, видел цвет одной из них и, поправив его, получал
 * не то, что видел.
 *
 * Сравниваются РАЗОБРАННЫЕ значения (`getStyleValue`), а не сырые строки
 * из карты style, и это не педантизм: у одного элемента ключа может не быть
 * вовсе (тогда действует `field.default`), у другого тот же самый умолчальный
 * цвет выписан явно. Сырые строки при этом разные, а видит автор одно и то же
 * — и «разное» здесь было бы враньём в другую сторону.
 *
 * Пустой список бросает: «общее значение ни у кого» — это не «разное»,
 * а вызов, которому нечего было спрашивать. Молчаливый ответ здесь скрыл бы
 * рассинхрон у вызывающего (`propbarFields` пуст, пока пуст `propbarSelection`).
 */
export function commonStyleValue(
  styles: readonly ElementStyle[],
  key: StyleFieldKey,
): StyleReadResult {
  const first = styles[0];
  if (first === undefined) {
    throw new Error(`Общее значение поля «${key}» спрашивать не у кого: список стилей пуст`);
  }
  const value = getStyleValue(first, key);
  for (const style of styles) {
    if (!sameReadResult(value, getStyleValue(style, key))) return { kind: 'mixed' };
  }
  return value;
}

/** Одинаковы ли два прочитанных значения с точки зрения автора. */
function sameReadResult(a: StyleReadResult, b: StyleReadResult): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'parsed':
      return sameParsedValue(a.value, (b as { value: string | number | LengthOrPercent }).value);
    case 'token': {
      const other = b as { token: string; fallback: string };
      // Запасное значение — часть смысла, а не оформление: две ссылки на одну
      // роль с разным запасом нарисуются по-разному там, где роли нет (S11).
      return a.token === other.token && a.fallback === other.fallback;
    }
    case 'raw':
      return a.text === (b as { text: string }).text;
    case 'mixed':
      // Сюда не попадают: сравниваются только ответы `getStyleValue`,
      // а она `mixed` не возвращает. Ветка есть, чтобы разбор оставался
      // исчерпывающим и новый вариант нельзя было добавить молча.
      return true;
  }
}

/** `LengthOrPercent` — объект, поэтому `===` здесь дало бы «разное» на равных значениях. */
function sameParsedValue(
  a: string | number | LengthOrPercent,
  b: string | number | LengthOrPercent,
): boolean {
  if (typeof a === 'object' || typeof b === 'object') {
    return typeof a === 'object' && typeof b === 'object' && a.amount === b.amount && a.unit === b.unit;
  }
  return a === b;
}

/**
 * Описывает произвольный ключ карты style — включая ключи вне набора
 * восьми. `style` — свободная карта по схеме, и в demo.json это не гипотеза:
 * `opacity` (под управлением анимации) стоит почти на каждом элементе,
 * `card` несёт руками вписанный `border`. Ни то ни другое не входит
 * в STYLE_FIELDS.
 *
 * В отличие от `getStyleValue`, здесь незнакомый ключ — не баг, а ожидаемый
 * случай: эта функция существует именно для того, чтобы пройти по тому,
 * что реально лежит в данных, а не по тому, что определил редактор.
 * Поэтому она никогда не бросает и на неизвестном ключе тоже возвращает
 * `raw`, а не исключение.
 */
export function readStyleEntry(style: ElementStyle, key: string): StyleReadResult {
  const field = FIELDS_BY_KEY.get(key as StyleFieldKey);
  if (!(key in style)) {
    return field ? { kind: 'parsed', value: field.default } : { kind: 'raw', text: '' };
  }
  const raw = style[key]!;
  const token = tryToken(raw);
  if (token) return { kind: 'token', token: token.token, fallback: token.fallback };
  if (!field) return { kind: 'raw', text: String(raw) };
  const parsed = tryParseKnown(raw, field);
  return parsed === undefined ? { kind: 'raw', text: String(raw) } : { kind: 'parsed', value: parsed };
}

/**
 * Записывает значение поля в карту style, возвращая новую карту.
 *
 * Пустое значение (`null`, `undefined`, пустая или пробельная строка)
 * удаляет ключ, а не пишет пустую строку: пустая строка в CSS ведёт себя
 * непредсказуемо (например, `background: ''` в inline-стиле браузер просто
 * игнорирует, оставляя старое значение висеть), а отсутствие ключа —
 * предсказуемо и однозначно читается через значение по умолчанию.
 *
 * Значение, не подходящее под тип поля (нечисловая длина, вариант вне
 * закрытого списка, объект не там, где ждут скаляр), бросает громкую
 * ошибку — сюда должно попадать только то, что уже провалидировано
 * виджетом этого поля, и несоответствие здесь — всегда баг вызывающего
 * кода, а не данные, которые нужно просто отобразить.
 *
 * Ссылочная целостность: если новое значение равно уже сохранённому (или
 * ключа не было и значение пустое), возвращается тот же объект style по
 * ссылке. На этом основано решение `StageView`, пересобирать сцену или
 * обновить один узел. Ключи, которые не просили менять — в том числе такие,
 * что этот модуль не умеет разобрать (`opacity`, `border`, …), — не
 * трогаются никогда: запись одного поля не может стереть соседнее.
 */
export function setStyleValue(
  style: ElementStyle,
  key: StyleFieldKey,
  value: string | number | LengthOrPercent | null | undefined,
): ElementStyle {
  const field = requireField(key);
  const has = Object.prototype.hasOwnProperty.call(style, key);

  if (isBlank(value)) {
    if (!has) return style;
    const next = { ...style };
    delete next[key];
    return next;
  }

  // isBlank(value) выше исключил null/undefined/пустую строку — дальше
  // value гарантированно string | number | LengthOrPercent, но через
  // внешнюю функцию компилятор этого не видит, отсюда явное сужение.
  const authored = value as string | number | LengthOrPercent;

  let formatted: string;
  switch (field.valueType) {
    case 'length':
      formatted = formatLength(parseLengthStrict(assertScalar(authored, field), field), field);
      break;
    case 'length-or-percent':
      formatted = formatLengthOrPercent(coerceLengthOrPercent(authored, field));
      break;
    case 'number':
      formatted = formatNumber(parseNumberStrict(assertScalar(authored, field), field), field);
      break;
    case 'color':
      formatted = parseColorStrict(assertScalar(authored, field), field);
      break;
    case 'choice':
      formatted = parseChoiceStrict(assertScalar(authored, field), field);
      break;
    default:
      throw new Error(
        `Поле «${field.label}» (${field.key}): неизвестный тип значения «${String(field.valueType)}»`,
      );
  }

  if (has && style[key] === formatted) return style;
  return { ...style, [key]: formatted };
}
