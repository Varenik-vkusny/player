/**
 * Панель свойств выделенного элемента.
 *
 * Чисто презентационная. На вход приходит элемент, наружу уходит новый
 * элемент — и всё. Проект панель не читает и не пишет: пишет его редьюсер
 * (state/project.ts), единственное место, где это вообще происходит. Сцену
 * в DOM панель тоже не трогает: числа она берёт из пропсов, а не измеряет.
 *
 * Причина такой сухости не в чистоте ради чистоты. Интерфейс редактора будут
 * переписывать целиком, и переживёт это только та панель, которая ни за что
 * не держится — ни за состояние, ни за раскладку, ни за узлы сцены.
 *
 * Схему панель не валидирует: валидация живёт в ElementSchema и обязана
 * падать там. Но одно ограничение схемы здесь всё же знают — `width` и
 * `height` объявлены `positive()`. Ноль или минус, ушедший наружу, попал бы
 * в сохранённый проект, и тот перестал бы загружаться (инвариант №7): ошибка
 * всплыла бы через сессию и далеко от места, где её сделали. Поэтому такое
 * значение наружу не уходит вовсе.
 */
import { useId, useState, type ReactElement } from 'react';

import type { Element } from '@player/core';

export interface InspectorProps {
  /** undefined — ничего не выделено. */
  element: Element | undefined;
  onChange: (element: Element) => void;
}

export function Inspector(props: InspectorProps): ReactElement {
  const { element, onChange } = props;

  return (
    <aside className="ed-inspector" data-testid="inspector">
      <h2 className="ed-insp-title">Свойства</h2>
      {element === undefined ? (
        <p className="ed-insp-empty" data-testid="inspector-empty">
          Ничего не выделено
          <span className="ed-muted">Выберите элемент на сцене, чтобы править его свойства.</span>
        </p>
      ) : (
        // key по идентификатору: при смене выделения поля пересоздаются.
        // Иначе недописанный черновик («-», «1.») пережил бы переход
        // на другой элемент и был бы отправлен уже ему.
        <ElementFields key={element.id} element={element} onChange={onChange} />
      )}
    </aside>
  );
}

interface ElementFieldsProps {
  element: Element;
  onChange: (element: Element) => void;
}

function ElementFields({ element, onChange }: ElementFieldsProps): ReactElement {
  /**
   * Отдать наружу элемент с одним изменённым полем.
   *
   * Остальные поля переносятся как есть, включая те, которых панель не
   * показывает (`style`): панель не вправе терять то, чего не знает.
   */
  const replace = (part: Partial<Element>): void => onChange({ ...element, ...part });

  return (
    <div className="ed-insp-body">
      <div className="ed-insp-block">
        <ReadonlyField label="Идентификатор" value={element.id} />
        <ReadonlyField label="Тип" value={element.type} />
        <p className="ed-insp-note">
          Идентификатор и тип менять нельзя: на идентификатор ссылаются анимации и гейты,
          и переименование здесь тихо оборвало бы эти ссылки.
        </p>
      </div>

      <div className="ed-insp-grid">
        <NumberField
          label="X, px"
          value={element.x}
          accepts={ANY_NUMBER}
          onCommit={(x) => replace({ x })}
        />
        <NumberField
          label="Y, px"
          value={element.y}
          accepts={ANY_NUMBER}
          onCommit={(y) => replace({ y })}
        />
        <NumberField
          label="Ширина, px"
          value={element.width}
          accepts={POSITIVE}
          onCommit={(width) => replace({ width })}
        />
        <NumberField
          label="Высота, px"
          value={element.height}
          accepts={POSITIVE}
          onCommit={(height) => replace({ height })}
        />
        <NumberField
          label="Поворот, °"
          value={element.rotation}
          accepts={ANY_NUMBER}
          onCommit={(rotation) => replace({ rotation })}
        />
        <NumberField
          label="Слой (z-index)"
          value={element.zIndex}
          accepts={INTEGER}
          onCommit={(zIndex) => replace({ zIndex })}
        />
      </div>

      {/*
        Содержимое есть не у всякого типа. У фигуры его показывать нечего,
        у группы — тем более: пустое поле «Текст» под прямоугольником
        предлагает автору правку, которая ни на что не влияет.
      */}
      {element.type === 'text' && (
        <div className="ed-insp-block">
          <MultilineField
            label="Текст"
            value={element.content}
            onCommit={(content) => replace({ content })}
          />
        </div>
      )}
      {element.type === 'image' && (
        <div className="ed-insp-block">
          <StringField
            label="Путь к картинке"
            value={element.content}
            onCommit={(content) => replace({ content })}
          />
        </div>
      )}
    </div>
  );
}

/** Что считать пригодным для отправки наружу. Разбор уже отсеял всё, что не число. */
type Accepts = (value: number) => boolean;

const ANY_NUMBER: Accepts = () => true;
/** `width` и `height` в схеме — `positive()`: ноль и отрицательные не загрузятся. */
const POSITIVE: Accepts = (value) => value > 0;
/** `zIndex` в схеме — `int()`. */
const INTEGER: Accepts = (value) => Number.isInteger(value);

interface NumberFieldProps {
  label: string;
  value: number;
  accepts: Accepts;
  onCommit: (value: number) => void;
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
function NumberField({ label, value, accepts, onCommit }: NumberFieldProps): ReactElement {
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
        // в элементе. Незавершённый или отвергнутый ввод исчезает вместе с ним.
        onBlur={() => setDraft(null)}
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
 * которые нельзя отдать наружу. Пустая строка — законное значение
 * (`content` в схеме — `z.string().default('')`), а не «ещё не дописано».
 */
function StringField({ label, value, onCommit }: StringFieldProps): ReactElement {
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

/** Многострочное поле. Текст на сцене бывает в несколько строк, и переносы значимы. */
function MultilineField({ label, value, onCommit }: StringFieldProps): ReactElement {
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
 * и копируемым — идентификатор набирают в ссылках анимаций и гейтов.
 * `readOnly`, а не `disabled`, по той же причине: отключённое поле
 * недоступно ни фокусу, ни выделению.
 */
function ReadonlyField({ label, value }: { label: string; value: string }): ReactElement {
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

/**
 * Строка в число, если она уже целое число, а не шаг на пути к нему.
 *
 * `Number` сам по себе для этого не годится: `Number('')` и `Number(' ')`
 * дают ноль — правдоподобное значение, которого автор не вводил.
 */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
