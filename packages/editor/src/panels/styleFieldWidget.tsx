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
  onCommit,
  onLiveCommit,
  onCommitHistory,
}: LengthOrPercentFieldProps): ReactElement {
  const amountId = useId();
  const unitId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const text = draft ?? String(value.amount);
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
