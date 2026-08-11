/**
 * Виджет одного поля стиля — выбирается по `valueType`, не по ключу поля.
 *
 * Вынесен из `Inspector.tsx` в Сессии 30: полоса свойств над холстом
 * (`stage/PropBar.tsx`) показывает частые поля стиля выделенного элемента
 * теми же виджетами, что и панель «Объект» (`Inspector.tsx`) — редкие.
 * Задание прямо требует переиспользовать приём правки стиля, а не заводить
 * второй, поэтому оба места зовут ровно эту функцию, а не две её копии.
 *
 * Ключи ровно восьми утверждённых полей. Расширение набора — правка ADR-012
 * и `state/style.ts`, не тихое добавление второго виджета здесь.
 */
import { useId, useState, type ReactElement } from 'react';

import {
  ANY_NUMBER,
  NumberField,
  ReadonlyField,
  ColorField,
  ChoiceField,
} from './fields.js';
import type { LengthOrPercent, StyleFieldDef, StyleReadResult } from '../state/style.js';
import { composeLengthOrPercent, parseStyleDraft } from './styleDraft.js';

export interface StyleFieldWidgetProps {
  field: StyleFieldDef;
  read: StyleReadResult;
  onCommit: (value: string | number | LengthOrPercent) => void;
  /** Живое событие набора числа — см. комментарий модуля Inspector.tsx. */
  onLiveCommit: (value: string | number | LengthOrPercent) => void;
  onCommitHistory: () => void;
}

/**
 * Значение, которое `style.ts` не смог разобрать (`kind: 'raw'`), этим
 * виджетом не редактируется — только показывается через `ReadonlyField`, тот
 * же компонент, что и для идентификатора элемента: видно, выделяемо
 * и копируемо, но не потеряно и не заменено угадыванием. Разобрать «2em»
 * в px/% переключатель значило бы выдумать единицу, которой автор не писал, —
 * тот же класс дефекта, что и падение `markSeconds` из S2: одно непонятное
 * значение не имеет права ронять или тихо портить всю панель.
 *
 * `length`/`number`/`length-or-percent` набираются посимвольно — те же поля
 * коммитят «живыми» событиями через `onLiveCommit` и закрывают жест на
 * `onCommitHistory` (потеря фокуса). `color`/`choice` меняются целиком одним
 * действием (выбор из пикера или списка) — им живой коммит не нужен.
 */
export function StyleFieldWidget({
  field,
  read,
  onCommit,
  onLiveCommit,
  onCommitHistory,
}: StyleFieldWidgetProps): ReactElement {
  if (read.kind === 'token') {
    return (
      <TokenField field={field} token={read.token} fallback={read.fallback} onCommit={onCommit} />
    );
  }

  if (read.kind === 'raw') {
    return <ReadonlyField label={`${field.label} (не распознано)`} value={read.text} />;
  }

  if (read.kind === 'mixed') {
    return (
      <MixedField
        field={field}
        onCommit={onCommit}
        onLiveCommit={onLiveCommit}
        onCommitHistory={onCommitHistory}
      />
    );
  }

  switch (field.valueType) {
    case 'color':
      return <ColorField label={field.label} value={read.value as string} onCommit={onCommit} />;
    case 'length':
      return (
        <NumberField
          label={`${field.label}, px`}
          value={read.value as number}
          accepts={ANY_NUMBER}
          onCommit={onLiveCommit}
          onBlurCommit={onCommitHistory}
        />
      );
    case 'number':
      return (
        <NumberField
          label={field.label}
          value={read.value as number}
          accepts={ANY_NUMBER}
          onCommit={onLiveCommit}
          onBlurCommit={onCommitHistory}
        />
      );
    case 'choice':
      return (
        <ChoiceField
          label={field.label}
          value={read.value as string}
          choices={field.choices ?? []}
          onCommit={onCommit}
        />
      );
    case 'length-or-percent':
      return (
        <LengthOrPercentField
          label={field.label}
          value={read.value as LengthOrPercent}
          onCommit={onCommit}
          onLiveCommit={onLiveCommit}
          onCommitHistory={onCommitHistory}
        />
      );
    default:
      // StyleValueType закрыт пятью значениями. Шестое здесь — баг
      // конфигурации модуля (кто-то расширил тип и забыл про виджет),
      // а не данные с диска, поэтому падаем громко, а не молчим.
      throw new Error(`Секция «Вид»: неизвестный тип значения поля «${String(field.valueType)}»`);
  }
}

/**
 * Слово, которым названо отсутствие общего значения. Одно на весь редактор:
 * две формулировки одного состояния разошлись бы молча — ровно та болезнь,
 * из-за которой в Сессии 30 на одном экране оказались две подписи «Фон».
 */
const MIXED = 'разное';

interface MixedFieldProps {
  field: StyleFieldDef;
  onCommit: (value: string | number | LengthOrPercent) => void;
  onLiveCommit: (value: string | number | LengthOrPercent) => void;
  onCommitHistory: () => void;
}

/**
 * Поле, у выделенной пачки которого общего значения НЕ существует
 * (`StyleReadResult` вариант `mixed`, Сессия 32).
 *
 * Три требования, и третье куплено дефектом этой же сессии.
 *
 * 1. **Не врать.** До этой сессии полоса показывала значение первого
 *    выделенного как будто оно общее: цвет настоящий, поле рабочее, ни одного
 *    признака беды.
 * 2. **Остаться действующим.** Поле продолжает править — набранное или
 *    выбранное значение становится общим для всей пачки. Помеченное, но
 *    неработающее поле хуже врущего: автор нажмёт и решит, что редактор сломан.
 * 3. **Быть ВИДИМЫМ.** Первая реализация несла слово «разное» только в подписи
 *    поля — и это выглядело безупречно: тесты подпись находят, `getByLabel`
 *    работает, все проверки зелёные. А автор не видел ничего: подписи полей
 *    на полосе свойств визуально скрыты (`.ed-propbar-field .ed-insp-label`
 *    в `styles.ts` — `width: 1px`, `clip-path: inset(50%)`). Нашлось снимком.
 *    Поэтому у цвета пометка живёт на самом поле штриховкой
 *    (`.ed-insp-input--mixed`), у числовых — пустым полем с подсказкой,
 *    у списка — пунктом-заглушкой. Каркас метит образец ровно по этой
 *    причине (`design/main.js:500-511`, `design/shell.css` `.ink--mixed`),
 *    и его довод я сначала прочитал наоборот.
 *
 * Подпись слово «разное» тоже несёт — в панели «Объект» подписи видны, да и
 * читающему с экрана штриховка недоступна. Просто на подпись нельзя
 * ПОЛАГАТЬСЯ.
 *
 * Цветовому полю образцом служит УМОЛЧАНИЕ поля, а не цвет первого выделенного:
 * показать цвет первого значило бы вернуть ровно ту картинку, которую эта
 * сессия и убирает.
 */
function MixedField({ field, onCommit, onLiveCommit, onCommitHistory }: MixedFieldProps): ReactElement {
  const label = `${field.label} — ${MIXED}`;

  switch (field.valueType) {
    case 'color':
      return <ColorField label={label} value={field.default as string} mixed onCommit={onCommit} />;
    case 'length':
      return (
        <NumberField
          label={`${field.label}, px — ${MIXED}`}
          value={undefined}
          placeholder={MIXED}
          accepts={ANY_NUMBER}
          onCommit={onLiveCommit}
          onBlurCommit={onCommitHistory}
        />
      );
    case 'number':
      return (
        <NumberField
          label={label}
          value={undefined}
          placeholder={MIXED}
          accepts={ANY_NUMBER}
          onCommit={onLiveCommit}
          onBlurCommit={onCommitHistory}
        />
      );
    case 'choice':
      return (
        <ChoiceField
          label={label}
          value=""
          placeholder={MIXED}
          choices={field.choices ?? []}
          onCommit={onCommit}
        />
      );
    case 'length-or-percent':
      return (
        <LengthOrPercentField
          label={label}
          // Единица берётся из умолчания поля: у `<select>` пустого состояния
          // нет, а «разное» уже сказано подписью. Выбор единицы при этом
          // работает и назначает её всей пачке.
          value={field.default as LengthOrPercent}
          amountMissing
          onCommit={onCommit}
          onLiveCommit={onLiveCommit}
          onCommitHistory={onCommitHistory}
        />
      );
    default:
      // Тот же довод, что и у основного разбора ниже: шестой тип здесь — баг
      // конфигурации модуля, а не данные с диска.
      throw new Error(`Полоса свойств: неизвестный тип значения поля «${String(field.valueType)}»`);
  }
}

interface TokenFieldProps {
  field: StyleFieldDef;
  /** Имя CSS custom property, например «--scene-accent». */
  token: string;
  /** Запасное значение из `var(--role, fallback)` — то, что реально рисуется. */
  fallback: string;
  onCommit: (value: string | number | LengthOrPercent) => void;
}

/**
 * Ссылка на роль темы — третий вид значения поля (`kind: 'token'`,
 * `state/style.ts`), отдельный от `parsed` и от `raw`.
 *
 * Показывает ИМЯ роли, а не сырую строку `var(--x, #y)`: автор должен видеть,
 * что значением управляет тема сцены, а не редактировать escape-синтаксис
 * CSS руками — синтаксис здесь деталь хранения, а не то, с чем автор
 * взаимодействует (тот же принцип, что у `border-radius`: единица хранится
 * в значении, но правится отдельным виджетом, не текстом).
 *
 * Рядом — образец запасного значения: то, что реально нарисуется, пока роль
 * темы не объявлена (или в плеере вовсе без темы). Для цветовых полей это
 * ещё и заливка — тот же смысл, что у `ColorField`, только не редактируемый
 * напрямую: значение поля сейчас ссылка, а не цвет.
 *
 * «Отвязать от темы» пишет запасное значение как обычное авторское —
 * `onCommit` (не `onLiveCommit`: смена целиком, без промежуточных состояний
 * набора, как у `ColorField`/`ChoiceField`). `setStyleValue` разберёт строку
 * тем же путём, что и любой другой ввод поля этого типа, поэтому виджет
 * не привязан к одному `valueType` — см. комментарий у `tryToken`.
 */
function TokenField({ field, token, fallback, onCommit }: TokenFieldProps): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {field.label} (роль темы)
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
        {field.valueType === 'color' && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '1.2em',
              height: '1.2em',
              flexShrink: 0,
              borderRadius: '3px',
              background: fallback,
            }}
          />
        )}
        <input id={id} className="ed-insp-input" type="text" value={token} readOnly />
      </div>
      <p className="ed-insp-note">Запасное значение (без темы): {fallback}</p>
      <button type="button" className="ed-insp-input" onClick={() => onCommit(fallback)}>
        Отвязать от темы
      </button>
    </div>
  );
}

interface LengthOrPercentFieldProps {
  label: string;
  value: LengthOrPercent;
  /**
   * Числа нет — общего значения у пачки не существует (`MixedField`).
   * Единица при этом приходит в `value` и остаётся рабочей: выбрать её
   * автор может, а число покажется пустым с подсказкой «разное».
   */
  amountMissing?: boolean;
  onCommit: (value: LengthOrPercent) => void;
  onLiveCommit: (value: LengthOrPercent) => void;
  onCommitHistory: () => void;
}

/**
 * Число плюс единица (сейчас единственное такое поле — `border-radius`).
 *
 * Единица — часть смысла значения, а не оформление (`state/style.ts`:
 * `50%` и `50px` значат разное), поэтому у неё отдельный переключатель,
 * а не текст с подставленным суффиксом, как у `length`.
 *
 * Число набирается тем же паттерном черновика, что и `NumberField` геометрии,
 * и тем же способом коммитит историю: `onLiveCommit` на каждую распознанную
 * цифру, `onCommitHistory` на потере фокуса. Единица меняется отдельным
 * `<select>` и коммитится сразу через `onCommit` — там нет промежуточных
 * состояний ввода, как у текста.
 */
function LengthOrPercentField({
  label,
  value,
  amountMissing = false,
  onCommit,
  onLiveCommit,
  onCommitHistory,
}: LengthOrPercentFieldProps): ReactElement {
  const amountId = useId();
  const unitId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const text = draft ?? (amountMissing ? '' : String(value.amount));
  const parsedAmount = draft === null ? value.amount : parseStyleDraft(draft);
  const invalid = draft !== null && parsedAmount === undefined;

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={amountId}>
        {label}
      </label>
      <input
        id={amountId}
        className="ed-insp-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={amountMissing ? MIXED : undefined}
        aria-invalid={invalid}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const composed = composeLengthOrPercent(next, value.unit);
          if (composed) onLiveCommit(composed);
        }}
        onBlur={() => {
          setDraft(null);
          onCommitHistory();
        }}
      />
      <label className="ed-insp-label" htmlFor={unitId}>
        {label}: единица
      </label>
      <select
        id={unitId}
        className="ed-insp-input"
        value={value.unit}
        onChange={(event) => onCommit({ amount: value.amount, unit: event.target.value as 'px' | '%' })}
      >
        <option value="px">px</option>
        <option value="%">%</option>
      </select>
    </div>
  );
}
