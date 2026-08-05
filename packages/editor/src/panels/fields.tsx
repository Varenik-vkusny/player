/**
 * Мелкие поля ввода, общие для панели свойств элемента (`Inspector.tsx`)
 * и панели выделенной метки (`MarkPanel.tsx`).
 *
 * Вынесены в отдельный файл по ADR-010 ровно потому, что ничего в них не
 * знает про то, чьё значение они правят — элемент, гейт или анимацию.
 * Дублировать эти компоненты в двух файлах значило бы дважды чинить
 * один и тот же класс дефектов раскладки (см. `NumberField` ниже).
 *
 * Чисто презентационные: значение приходит пропсом, наружу уходит только
 * то, что успешно разобралось. Ни один из них не читает и не пишет проект —
 * это делает вызывающий компонент через колбэки.
 */
import { useId, useState, type ReactElement } from 'react';

/** Что считать пригодным для отправки наружу. Разбор уже отсеял всё, что не число. */
export type Accepts = (value: number) => boolean;

export const ANY_NUMBER: Accepts = () => true;
/** `width`/`height`/`duration` в схеме — `positive()`. */
export const POSITIVE: Accepts = (value) => value > 0;
/** `zIndex` в схеме — `int()`. */
export const INTEGER: Accepts = (value) => Number.isInteger(value);
/** `maxAttempts` в схеме — `int().positive()`. */
export const POSITIVE_INTEGER: Accepts = (value) => Number.isInteger(value) && value > 0;

/**
 * Строка в число, если она уже целое число, а не шаг на пути к нему.
 *
 * `Number` сам по себе для этого не годится: `Number('')` и `Number(' ')`
 * дают ноль — правдоподобное значение, которого автор не вводил.
 */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

interface NumberFieldProps {
  label: string;
  value: number;
  accepts: Accepts;
  onCommit: (value: number) => void;
  /**
   * Потеря фокуса поля — точка коммита истории для «живых» правок
   * (`state/editorHistory.ts`): набор числа шлёт `onCommit` на каждую
   * распознанную цифру (десятки живых событий одного жеста), а сюда
   * зовут ровно один раз в его конце. Необязательна: поле, которому
   * коммит-точка не нужна (правки, не участвующие в отдельном жесте —
   * например, редко печатаемое число вроде количества попыток гейта),
   * просто её не передаёт, и тогда каждая цифра остаётся самостоятельным
   * шагом — тоже корректное, просто более мелкое зерно истории.
   */
  onBlurCommit?: () => void;
}

/**
 * Числовое поле.
 *
 * Наивная реализация — `onChange={(e) => onCommit(Number(e.target.value))}` —
 * делает поле нередактируемым, и каждый способ поломки выглядит по-своему:
 * стёртое поле даёт `Number('') === 0`, и элемент прыгает в угол сцены;
 * начатое с минуса даёт NaN; «1.» на пути к «1.5» тоже разбирается не в то,
 * что автор набирает. Причина одна: пока строка набирается, она проходит
 * через состояния, которые числом не являются, а поле обязано их показывать.
 *
 * Поэтому набираемая строка живёт здесь, а наружу уходит только то, что
 * разобралось в конечное число и прошло по ограничению схемы. Не разобралось —
 * не уходит ничего, и поле помечается как ошибочное: молчание вместо правки
 * автор принял бы за успешную правку.
 *
 * `draft === null` означает «поле показывает пропс». Черновик появляется
 * с первым нажатием клавиши и исчезает на потере фокуса — этим и решается
 * второе требование: пока поле не правят, числа едут за элементом, который
 * тащат мышью по сцене. Отдельная синхронизация для этого не нужна, а с ней
 * поле пришлось бы «догонять» пропс и решать, чьё значение новее.
 *
 * `type="text"`, а не `type="number"`: у числового поля браузер отдаёт пустую
 * строку на любой недобор («-», «1e»), то есть ровно те состояния, ради
 * которых черновик и заведён, до нас не доходят вовсе.
 */
export function NumberField({ label, value, accepts, onCommit, onBlurCommit }: NumberFieldProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const text = draft ?? String(value);
  const parsed = draft === null ? undefined : parseNumber(draft);
  const invalid = draft !== null && (parsed === undefined || !accepts(parsed));

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
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
          const number = parseNumber(next);
          if (number !== undefined && accepts(number)) onCommit(number);
        }}
        // Черновик снимается — поле показывает то, что на самом деле лежит
        // в источнике. Незавершённый или отвергнутый ввод исчезает вместе
        // с ним, и жест (если он был) считается законченным.
        onBlur={() => {
          setDraft(null);
          onBlurCommit?.();
        }}
      />
    </div>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /**
   * Живое значение — зовётся на каждое движение ползунка (`onChange`
   * ползунка, в отличие от текстового поля, и есть уже разобранное число:
   * `<input type="range">` физически не может вернуть то, что числом
   * не является, у него нет промежуточных состояний вроде «1.» или «-» —
   * значение всегда лежит между `min` и `max` с шагом `step`). Поэтому,
   * в отличие от `NumberField`, здесь нет черновика и нечего разбирать:
   * то, что union-компонент показывает, то и уходит наружу.
   */
  onCommit: (value: number) => void;
  /**
   * Жест (перетаскивание ползунка) закончен — точка коммита истории,
   * как `onBlurCommit` у `NumberField`. Не блюр: отпустив кнопку мыши,
   * ползунок остаётся сфокусированным, блюра не происходит вовсе, поэтому
   * закрывает жест `pointerup`/`pointercancel` — тот же сигнал, которым
   * `TrackView` закрывает перетаскивание метки по дорожке. `onBlur` тоже
   * слушается — подстраховка на случай ухода фокуса клавишей Tab
   * посреди жеста.
   */
  onCommitEnd: () => void;
}

/**
 * Ползунок — числовое поле без набираемой строки.
 *
 * Та же обёртка `.ed-insp-field` и та же пара `label`/`input`, что
 * у `NumberField`, но без его черновика: черновик существует ради
 * состояний строки, которые ещё не разобрались в число, а у `range`
 * таких состояний нет (см. `onCommit` выше).
 */
export function RangeField({ label, value, min, max, step, onCommit, onCommitEnd }: RangeFieldProps): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ed-insp-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onCommit(Number(event.target.value))}
        onPointerUp={onCommitEnd}
        onPointerCancel={onCommitEnd}
        onBlur={onCommitEnd}
      />
    </div>
  );
}

interface StringFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

/**
 * Однострочное текстовое поле.
 *
 * Черновика здесь нет и не нужно: у строки нет промежуточных состояний,
 * которые нельзя отдать наружу. Пустая строка — законное значение.
 */
export function StringField({ label, value, onCommit }: StringFieldProps): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ed-insp-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
    </div>
  );
}

interface ValidatedStringFieldProps {
  label: string;
  value: string;
  /** Почему такое значение принять нельзя. `undefined` — можно. */
  problemOf: (value: string) => string | undefined;
  onCommit: (value: string) => void;
}

/**
 * Строка, у которой не всякое значение законно, — например имя переменной.
 *
 * Черновик здесь нужен по той же причине, что и у `NumberField`, только
 * причина другая: набираемая строка проходит через состояния, которые
 * значением быть не могут. Путь к имени «ответ про дроби» лежит через
 * пустую строку и через «ответ » с хвостовым пробелом — оба схема отвергает.
 * Отдавать их наружу нельзя, а показывать в поле обязательно, иначе поле
 * нельзя набрать.
 *
 * Отвергнутое значение не уходит МОЛЧА: рядом стоит причина. Молчание
 * автор принял бы за успешную правку — и узнал бы правду, когда правило
 * развилки не сработает у зрителя.
 */
export function ValidatedStringField({
  label,
  value,
  problemOf,
  onCommit,
}: ValidatedStringFieldProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const text = draft ?? value;
  const problem = draft === null ? undefined : problemOf(draft);

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ed-insp-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={text}
        aria-invalid={problem !== undefined}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (problemOf(next) === undefined) onCommit(next);
        }}
        // Черновик снимается — поле показывает то, что на самом деле лежит
        // в проекте. Незавершённый или отвергнутый ввод исчезает вместе с ним.
        onBlur={() => setDraft(null)}
      />
      {problem === undefined ? null : (
        <p className="ed-insp-note" role="alert" data-testid={`field-problem-${id}`}>
          {problem}
        </p>
      )}
    </div>
  );
}

/** Многострочное поле. */
export function MultilineField({ label, value, onCommit }: StringFieldProps): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="ed-insp-area"
        spellCheck={false}
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
    </div>
  );
}

/**
 * Поле только для чтения.
 *
 * Поле, а не подпись с текстом: значение должно оставаться выделяемым
 * и копируемым — идентификаторы набирают в ссылках анимаций и гейтов.
 * `readOnly`, а не `disabled`, по той же причине: отключённое поле
 * недоступно ни фокусу, ни выделению.
 */
export function ReadonlyField({ label, value }: { label: string; value: string }): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="ed-insp-input" type="text" value={value} readOnly />
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

/** Цвет — системный color picker браузера. См. Inspector.tsx для разбора формата. */
export function ColorField({ label, value, onCommit }: ColorFieldProps): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ed-insp-input"
        type="color"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
    </div>
  );
}

export interface Choice {
  readonly value: string;
  readonly label: string;
}

interface ChoiceFieldProps {
  label: string;
  value: string;
  choices: readonly Choice[];
  onCommit: (value: string) => void;
}

/**
 * Выбор из закрытого списка.
 *
 * Черновика здесь не нужно: `<select>` физически не может вернуть значение
 * вне своих `<option>`, поэтому всё, что приходит в `onChange`, уже входит
 * в список.
 */
export function ChoiceField({ label, value, choices, onCommit }: ChoiceFieldProps): ReactElement {
  const id = useId();

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="ed-insp-input"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}
