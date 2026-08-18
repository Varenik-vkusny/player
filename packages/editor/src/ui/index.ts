/**
 * Библиотека хрома редактора: то, что переиспользуют.
 *
 * Живёт внутри пакета editor и никем снаружи не импортируется —
 * направление зависимостей editor → player → core (инвариант №6).
 */
export { Button, type ButtonKind } from './Button.js';
export { Icon } from './Icon.js';
export { Section } from './Section.js';
export { ScrollStrip } from './ScrollStrip.js';
export { ICON_PATHS, type IconName } from './icons.js';
export { AlignIcon, type Shape } from './AlignIcon.js';
/**
 * Поля ввода. Переехали из `panels/fields.tsx` в Сессии 51: там их знали
 * три файла из пятнадцати, а по редактору были рассыпаны 28 сырых
 * `input`/`select`/`textarea`, девять из них — без единой подписи.
 *
 * У каждого поля `label: string` БЕЗ `?`. Правило, выразимое типом,
 * выражают типом: подпись, которую можно не передать, однажды не передадут.
 */
export {
  Field, type FieldProps,
  Checkbox, type CheckboxProps,
  Radio, type RadioProps,
  FileField, type FileFieldProps,
  NumberField, RangeField, StringField, ValidatedStringField,
  MultilineField, ReadonlyField, type ReadonlyFieldProps, ColorField, ChoiceField, type Choice,
  parseNumber, type Accepts, ANY_NUMBER, POSITIVE, INTEGER, POSITIVE_INTEGER,
} from './fields.js';
