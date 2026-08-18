/**
 * Поля ввода редактора: подпись, орган и место под причину.
 *
 * Лежит в `ui/`, а не рядом с местом применения, и это не вкусовщина.
 * Компонент, положенный рядом, переиспользовать не станут — его просто
 * не найдут, и через месяц рядом ляжет второй такой же. Так и вышло:
 * до Сессии 51 файл жил в `panels/`, его знали ТРИ файла из пятнадцати,
 * а по редактору были рассыпаны 28 сырых `input`/`select`/`textarea`,
 * половина из них — без единой подписи.
 *
 * Вынесены в отдельный файл по ADR-010 ровно потому, что ничего в них не
 * знает про то, чьё значение они правят — элемент, гейт или анимацию.
 *
 * Чисто презентационные: значение приходит пропсом, наружу уходит только
 * то, что успешно разобралось. Ни один из них не читает и не пишет проект —
 * это делает вызывающий компонент через колбэки.
 *
 * ⬛ ПОДПИСЬ ОБЯЗАТЕЛЬНА У КАЖДОГО, и это выражено ТИПОМ: `label: string`,
 * без `?`. Правило, выразимое типом, выражают типом, а не договорённостью.
 * Орган без подписи не существует ни для чтения с экрана, ни для поиска
 * по имени в тесте — а забыть необязательное поле можно молча. Перепись
 * Сессии 51 нашла девять таких органов: три файловых, вся форма условия
 * выхода и переименование главы.
 */
import { useId, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

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
  /**
   * Класс для ЧУЖОЙ РАСКЛАДКИ, не для вида — тем же правилом, что у Button:
   * он ДОПИСЫВАЕТСЯ к собственному классу поля, а не заменяет его.
   *
   * Заведён потому, что Field ставит подпись НАД органом (.ed-insp-field —
   * grid без колонок). Однострочным местам — шапке, пилюле масштаба, полосе
   * свойств — нужна строка, и полоса свойств уже решила это снаружи
   * (.ed-propbar-field .ed-insp-field спрямляет колонку в строку). Без этого
   * пропа такие места остаются с сырым органом: измерено при переводе
   * Сессии 51, два исполнителя независимо отказались по этой причине.
   */
  className?: string | undefined;

  /**
   * `undefined` — значения нет и показывать нечего: так выглядит поле,
   * у выделенной пачки которого общего значения не существует
   * (`StyleReadResult` вариант `mixed`, Сессия 32). Поле при этом остаётся
   * рабочим: набранное число уходит наружу и становится общим для всех.
   * Ноль здесь был бы не «пусто», а вполне настоящее значение, которого
   * автор не вводил, — тот же класс дефекта, ради которого заведён `draft`.
   */
  value: number | undefined;
  accepts: Accepts;
  /** Что показать в пустом поле серым. Обычно `undefined`. */
  placeholder?: string;
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
  /**
   * Метка для тестов. Проп, а не «прокинем ...rest»: перечень пропсов у поля
   * закрыт намеренно, и произвольные атрибуты сквозь него не проходят.
   * Без неё перевод сырых органов на библиотеку был невозможен — на них
   * висит 30 меток, от которых зависят e2e.
   */
  testId?: string | undefined;
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
export function NumberField({
  testId,
  className,
  label,
  value,
  accepts,
  placeholder,
  onCommit,
  onBlurCommit,
}: NumberFieldProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const text = draft ?? (value === undefined ? '' : String(value));
  const parsed = draft === null ? undefined : parseNumber(draft);
  const invalid = draft !== null && (parsed === undefined || !accepts(parsed));

  return (
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        data-testid={testId}
        className="ed-insp-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={text}
        placeholder={placeholder}
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
    </Field>
  );
}

interface RangeFieldProps {
  label: string;
  /** Класс для чужой раскладки — дописывается, а не заменяет. */
  className?: string | undefined;

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
  /**
   * Метка для тестов. Проп, а не «прокинем ...rest»: перечень пропсов у поля
   * закрыт намеренно, и произвольные атрибуты сквозь него не проходят.
   * Без неё перевод сырых органов на библиотеку был невозможен — на них
   * висит 30 меток, от которых зависят e2e.
   */
  testId?: string | undefined;
}

/**
 * Ползунок — числовое поле без набираемой строки.
 *
 * Та же обёртка `.ed-insp-field` и та же пара `label`/`input`, что
 * у `NumberField`, но без его черновика: черновик существует ради
 * состояний строки, которые ещё не разобрались в число, а у `range`
 * таких состояний нет (см. `onCommit` выше).
 */
export function RangeField({
  label, value, min, max, step, onCommit, onCommitEnd, className, testId,
}: RangeFieldProps): ReactElement {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        data-testid={testId}
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
    </Field>
  );
}

interface StringFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  /**
   * Класс для ЧУЖОЙ РАСКЛАДКИ, не для вида — тем же правилом, что у Button:
   * он ДОПИСЫВАЕТСЯ к собственному классу поля, а не заменяет его.
   *
   * Заведён потому, что Field ставит подпись НАД органом (.ed-insp-field —
   * grid без колонок). Однострочным местам — шапке, пилюле масштаба, полосе
   * свойств — нужна строка, и полоса свойств уже решила это снаружи
   * (.ed-propbar-field .ed-insp-field спрямляет колонку в строку). Без этого
   * пропа такие места остаются с сырым органом: измерено при переводе
   * Сессии 51, два исполнителя независимо отказались по этой причине.
   */
  className?: string | undefined;
  /**
   * Клавиши поля: Enter, Escape и прочее. Нужны полям правки на месте —
   * например переименованию главы в дереве веток, где Enter завершает ввод.
   */
  onKeyDown?: ((event: KeyboardEvent<HTMLInputElement>) => void) | undefined;
  /**
   * Фокус сразу при появлении. Только для полей, которые ПОЯВЛЯЮТСЯ по
   * действию автора (правка имени на месте): у поля, стоящего в панели
   * всегда, автофокус уводил бы курсор без спроса.
   */
  autoFocus?: boolean | undefined;
  /**
   * Потеря фокуса — точка коммита истории для «живых» правок
   * (state/editorHistory.ts). Тот же приём, что у NumberField.onBlurCommit,
   * и заведён он здесь по той же причине: правка шлёт onCommit на КАЖДУЮ
   * букву (десятки живых событий одного жеста), а сюда зовут ровно один раз
   * в его конце.
   *
   * Без этого крючка поле негодно для всего, что правится вживую: пипетка
   * цвета положила бы в историю по шагу на каждое движение, а поле
   * с черновиком у вызывающего не смогло бы отличить «печатает» от
   * «закончил». Перевод пяти сырых органов Сессии 51 встал ровно на этом —
   * три исполнителя независимо уперлись в одну и ту же нехватку.
   */
  onBlurCommit?: (() => void) | undefined;
  /**
   * Погашено. Например, «Имя нового стиля» при отсутствии выделения:
   * сохранять нечего, и поле обязано это показывать, а не принимать ввод
   * в никуда. Отсутствие пропа — это ПОВЕДЕНИЕ, а не облик, поэтому
   * без него перевод такого органа был бы запрещён.
   */
  disabled?: boolean | undefined;
  /**
   * Метка для тестов. Проп, а не «прокинем ...rest»: перечень пропсов у поля
   * закрыт намеренно, и произвольные атрибуты сквозь него не проходят.
   * Без неё перевод сырых органов на библиотеку был невозможен — на них
   * висит 30 меток, от которых зависят e2e.
   */
  testId?: string | undefined;
}

/**
 * Однострочное текстовое поле.
 *
 * Черновика здесь нет и не нужно: у строки нет промежуточных состояний,
 * которые нельзя отдать наружу. Пустая строка — законное значение.
 */
export function StringField({
  label, value, onCommit, onBlurCommit, disabled, className, onKeyDown, autoFocus, testId,
}: StringFieldProps): ReactElement {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        data-testid={testId}
        className="ed-insp-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => onCommit(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlurCommit}
      />
    </Field>
  );
}

interface ValidatedStringFieldProps {
  label: string;
  /** Класс для чужой раскладки — дописывается, а не заменяет. */
  className?: string | undefined;

  value: string;
  /** Почему такое значение принять нельзя. `undefined` — можно. */
  problemOf: (value: string) => string | undefined;
  onCommit: (value: string) => void;
  /**
   * Метка для тестов. Проп, а не «прокинем ...rest»: перечень пропсов у поля
   * закрыт намеренно, и произвольные атрибуты сквозь него не проходят.
   * Без неё перевод сырых органов на библиотеку был невозможен — на них
   * висит 30 меток, от которых зависят e2e.
   */
  testId?: string | undefined;
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
  testId,
  className,
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
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        data-testid={testId}
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
    </Field>
  );
}

/** Многострочное поле. */
export function MultilineField({ label, value, onCommit, onBlurCommit, disabled, className, testId }: StringFieldProps): ReactElement {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} className={className}>
      <textarea
        id={id}
        data-testid={testId}
        className="ed-insp-area"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(event) => onCommit(event.target.value)}
        onBlur={onBlurCommit}
      />
    </Field>
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
export interface ReadonlyFieldProps {
  label: string;
  /**
   * Класс для ЧУЖОЙ РАСКЛАДКИ, не для вида — тем же правилом, что у Button:
   * он ДОПИСЫВАЕТСЯ к собственному классу поля, а не заменяет его.
   *
   * Заведён потому, что Field ставит подпись НАД органом (.ed-insp-field —
   * grid без колонок). Однострочным местам — шапке, пилюле масштаба, полосе
   * свойств — нужна строка, и полоса свойств уже решила это снаружи
   * (.ed-propbar-field .ed-insp-field спрямляет колонку в строку). Без этого
   * пропа такие места остаются с сырым органом: измерено при переводе
   * Сессии 51, два исполнителя независимо отказались по этой причине.
   */
  className?: string | undefined;

  value: string;
  /**
   * Что стоит рядом со значением — например, образец цвета у имени роли
   * темы. Слот, а не «сделаем второй компонент»: без него вызывающему
   * некуда деть соседа, и он оставляет орган сырым. Так и вышло при
   * переводе Сессии 51.
   */
  trailing?: ReactNode;
  testId?: string | undefined;
}

export function ReadonlyField({ label, value, trailing, className, testId }: ReadonlyFieldProps): ReactElement {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} className={className}>
      <span className="ed-readonly">
        <input id={id} data-testid={testId} className="ed-insp-input" type="text" value={value} readOnly />
        {trailing}
      </span>
    </Field>
  );
}

interface ColorFieldProps {
  label: string;
  /**
   * Класс для ЧУЖОЙ РАСКЛАДКИ, не для вида — тем же правилом, что у Button:
   * он ДОПИСЫВАЕТСЯ к собственному классу поля, а не заменяет его.
   *
   * Заведён потому, что Field ставит подпись НАД органом (.ed-insp-field —
   * grid без колонок). Однострочным местам — шапке, пилюле масштаба, полосе
   * свойств — нужна строка, и полоса свойств уже решила это снаружи
   * (.ed-propbar-field .ed-insp-field спрямляет колонку в строку). Без этого
   * пропа такие места остаются с сырым органом: измерено при переводе
   * Сессии 51, два исполнителя независимо отказались по этой причине.
   */
  className?: string | undefined;

  value: string;
  /**
   * Общего цвета у выделенной пачки нет — образец обязан ПОКАЗАТЬ это
   * полосками, а не рисовать какой-нибудь цвет (Сессия 32).
   *
   * Пометка живёт на самом образце, а не в подписи, и это куплено снимком:
   * подписи полей на полосе свойств визуально скрыты (`.ed-propbar-field
   * .ed-insp-label` в `styles.ts` — `width: 1px`, `clip-path`), поэтому слово
   * в подписи до автора не доходит вовсе, хотя и остаётся в разметке, доступно
   * чтению с экрана и прекрасно находится тестом. Каркас метит образец ровно
   * по этой причине (`design/shell.css`, `.ink--mixed`).
   *
   * `<input type="color">` пустого состояния не имеет: он всегда рисует
   * какой-нибудь цвет. Поэтому полоски рисуются поверх образца, а не вместо
   * значения.
   */
  mixed?: boolean;
  onCommit: (value: string) => void;
  /**
   * Потеря фокуса — точка коммита истории для «живых» правок
   * (state/editorHistory.ts). Тот же приём, что у NumberField.onBlurCommit,
   * и заведён он здесь по той же причине: правка шлёт onCommit на КАЖДУЮ
   * букву (десятки живых событий одного жеста), а сюда зовут ровно один раз
   * в его конце.
   *
   * Без этого крючка поле негодно для всего, что правится вживую: пипетка
   * цвета положила бы в историю по шагу на каждое движение, а поле
   * с черновиком у вызывающего не смогло бы отличить «печатает» от
   * «закончил». Перевод пяти сырых органов Сессии 51 встал ровно на этом —
   * три исполнителя независимо уперлись в одну и ту же нехватку.
   */
  onBlurCommit?: (() => void) | undefined;
  /**
   * Метка для тестов. Проп, а не «прокинем ...rest»: перечень пропсов у поля
   * закрыт намеренно, и произвольные атрибуты сквозь него не проходят.
   * Без неё перевод сырых органов на библиотеку был невозможен — на них
   * висит 30 меток, от которых зависят e2e.
   */
  testId?: string | undefined;
}

/** Цвет — системный color picker браузера. См. Inspector.tsx для разбора формата. */
export function ColorField({ label, value, mixed = false, onCommit, onBlurCommit, className, testId }: ColorFieldProps): ReactElement {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        data-testid={testId}
        className={mixed ? 'ed-insp-input ed-insp-input--mixed' : 'ed-insp-input'}
        type="color"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
        onBlur={onBlurCommit}
      />
    </Field>
  );
}

export interface Choice {
  readonly value: string;
  readonly label: string;
}

interface ChoiceFieldProps {
  label: string;
  /**
   * Класс для ЧУЖОЙ РАСКЛАДКИ, не для вида — тем же правилом, что у Button:
   * он ДОПИСЫВАЕТСЯ к собственному классу поля, а не заменяет его.
   *
   * Заведён потому, что Field ставит подпись НАД органом (.ed-insp-field —
   * grid без колонок). Однострочным местам — шапке, пилюле масштаба, полосе
   * свойств — нужна строка, и полоса свойств уже решила это снаружи
   * (.ed-propbar-field .ed-insp-field спрямляет колонку в строку). Без этого
   * пропа такие места остаются с сырым органом: измерено при переводе
   * Сессии 51, два исполнителя независимо отказались по этой причине.
   */
  className?: string | undefined;

  /** Пустая строка — значения нет; тогда обязателен `placeholder`. */
  value: string;
  choices: readonly Choice[];
  /**
   * Подпись пункта-заглушки для пустого значения — «разное» у пачки, у которой
   * общего значения нет (Сессия 32). Пункт выбирается сам и НЕДОСТУПЕН для
   * выбора руками: «разное» — это состояние, а не вариант, который автор может
   * кому-то назначить.
   */
  placeholder?: string;
  onCommit: (value: string) => void;
  /**
   * Метка для тестов. Проп, а не «прокинем ...rest»: перечень пропсов у поля
   * закрыт намеренно, и произвольные атрибуты сквозь него не проходят.
   * Без неё перевод сырых органов на библиотеку был невозможен — на них
   * висит 30 меток, от которых зависят e2e.
   */
  testId?: string | undefined;
}

/**
 * Выбор из закрытого списка.
 *
 * Черновика здесь не нужно: `<select>` физически не может вернуть значение
 * вне своих `<option>`, поэтому всё, что приходит в `onChange`, уже входит
 * в список.
 */
export function ChoiceField({
  testId,
  className,
  label,
  value,
  choices,
  placeholder,
  onCommit,
}: ChoiceFieldProps): ReactElement {
  const id = useId();

  return (
    <Field label={label} htmlFor={id} className={className}>
      <select
        id={id}
        data-testid={testId}
        className="ed-insp-input"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      >
        {placeholder === undefined ? null : (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Подпись, орган и место под причину — обёртка, общая всем полям ниже.
 *
 * Заведена Сессией 51. До неё эта же разметка стояла ВОСЕМЬ раз подряд
 * в этом файле и ещё одиннадцать раз руками по панелям — то есть девятнадцать
 * мест, каждое из которых могло разъехаться поодиночке и одно из которых
 * уже разъехалось: подписи полосы свойств спрятаны `clip-path`, и пометка,
 * положенная в подпись, находится `getByLabel`, а до автора не доходит.
 *
 * `htmlFor` обязателен, а не «желателен»: подпись, не связанная с органом,
 * читается с экрана как отдельный кусок текста, и щелчок по ней не наводит
 * фокус. Связь делает подпись подписью.
 *
 * `reason` — ВИДИМАЯ строка, а не `title`. В проекте это измерено дважды:
 * на подсказки при наведении не смотрят, а `title` у погашенного органа
 * во многих браузерах не показывается вовсе.
 */
export interface FieldProps {
  /** Класс для чужой раскладки — дописывается, а не заменяет. */
  className?: string | undefined;
  /** Подпись. Обязательна — см. заголовок модуля. */
  label: string;
  /** Идентификатор органа, которому эта подпись принадлежит. */
  htmlFor: string;
  /**
   * Почему поле не работает или что с ним не так — строкой под органом.
   * `undefined` — сказать нечего, и строки нет вовсе: пустое место под
   * каждым полем приучало бы глаз его пропускать.
   */
  reason?: string | undefined;
  children: ReactNode;
}

export function Field({ label, htmlFor, reason, className, children }: FieldProps): ReactElement {
  return (
    <div className={className === undefined ? 'ed-insp-field' : `ed-insp-field ${className}`}>
      <label className="ed-insp-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {reason === undefined ? null : (
        <p className="ed-field-reason" role="status">{reason}</p>
      )}
    </div>
  );
}

/**
 * Флажок: своя отрисовка, поведение РОДНОЕ.
 *
 * Родной `input` остаётся в дереве и остаётся тем, чем был, — он лишь
 * становится прозрачным и ложится точно под свой рисунок. Отсюда бесплатно
 * берутся пробел, `Tab`, чтение с экрана, состояние `:disabled` и щелчок
 * по подписи.
 *
 * `display: none` и `visibility: hidden` не годятся: они вынимают орган
 * из порядка обхода клавиатурой, то есть меняют ПОВЕДЕНИЕ, а мы меняем
 * только облик. Рисунок помечен `aria-hidden`: он повторяет то, что уже
 * сказано состоянием самого органа, и вторая его копия для чтения с экрана
 * была бы шумом.
 */
export interface CheckboxProps {
  /** Подпись. Обязательна — см. заголовок модуля. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  /** Видимая причина, по которой флажок погашен либо значение спорно. */
  reason?: string | undefined;
  testId?: string | undefined;
}

export function Checkbox({
  label, checked, onChange, disabled, reason, testId
}: CheckboxProps): ReactElement {
  const id = useId();
  return (
    <div className="ed-toggle-field">
      <label className="ed-toggle" htmlFor={id}>
        <input
          id={id}
        data-testid={testId}
          className="ed-toggle-input"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="ed-toggle-box" aria-hidden="true" />
        <span className="ed-toggle-name">{label}</span>
      </label>
      {reason === undefined ? null : (
        <p className="ed-field-reason" role="status">{reason}</p>
      )}
    </div>
  );
}

/**
 * Переключатель одного из нескольких. Устройство — как у `Checkbox` выше,
 * и по той же причине: облик свой, поведение родное.
 *
 * `name` обязателен и не имеет умолчания: именно он делает несколько
 * переключателей ОДНОЙ группой — без него стрелки не ходят по группе,
 * а выбор перестаёт быть взаимоисключающим. Умолчание здесь молча
 * разъединило бы группу.
 */
export interface RadioProps {
  /** Подпись. Обязательна — см. заголовок модуля. */
  label: string;
  /** Общее имя группы: без него переключатели не связаны друг с другом. */
  name: string;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean | undefined;
  testId?: string | undefined;
}

export function Radio({
  label, name, checked, onSelect, disabled, testId
}: RadioProps): ReactElement {
  const id = useId();
  return (
    <label className="ed-toggle" htmlFor={id}>
      <input
        id={id}
        data-testid={testId}
        className="ed-toggle-input"
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="ed-toggle-box ed-toggle-box--round" aria-hidden="true" />
      <span className="ed-toggle-name">{label}</span>
    </label>
  );
}

/**
 * Выбор файла: кнопка вместо родной надписи «Выберите файл».
 *
 * Родную надпись стилизовать нельзя — её рисует браузер, она разная в разных
 * браузерах и на разных языках системы. Поэтому орган прячется, а нажимает
 * его `<label>`: это РОДНОЕ поведение label, а не перехват щелчка кодом.
 * Значит работают и клавиатура, и чтение с экрана.
 *
 * Имя выбранного файла показывается рядом, потому что спрятанный орган
 * показать его больше не может, а «файл выбран, но какой?» — это тот же
 * молчаливый провал, что и остальные в этом файле.
 */
export interface FileFieldProps {
  /** Подпись. Обязательна — см. заголовок модуля. */
  label: string;
  /** Надпись на кнопке. Обычно «Выбрать файл» или «Заменить». */
  buttonText: string;
  accept: string;
  onPick: (file: File) => void;
  disabled?: boolean | undefined;
  /** Что выбрано сейчас. `undefined` — ещё ничего. */
  pickedName?: string | undefined;
  reason?: string | undefined;
  testId?: string | undefined;
}

export function FileField({
  label, buttonText, accept, onPick, disabled, pickedName, reason, testId
}: FileFieldProps): ReactElement {
  const id = useId();
  return (
    <div className="ed-insp-field">
      <span className="ed-insp-label" id={`${id}-name`}>{label}</span>
      <div className="ed-file">
        <label className="ed-btn ed-file-btn" htmlFor={id}>{buttonText}</label>
        <input
          id={id}
        data-testid={testId}
          className="ed-file-input"
          type="file"
          accept={accept}
          disabled={disabled}
          aria-labelledby={`${id}-name`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Значение органа сбрасывается: иначе повторный выбор ТОГО ЖЕ
            // файла не даёт события вовсе — браузер считает, что ничего
            // не изменилось, и автор молча остаётся с прежним файлом.
            event.target.value = '';
            if (file) onPick(file);
          }}
        />
        {pickedName === undefined ? null : (
          <span className="ed-file-name" title={pickedName}>{pickedName}</span>
        )}
      </div>
      {reason === undefined ? null : (
        <p className="ed-field-reason" role="status">{reason}</p>
      )}
    </div>
  );
}
