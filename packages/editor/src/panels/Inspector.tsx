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
 *
 * Отмена и повтор (срез 2). Числовые поля этой панели набираются посимвольно,
 * и каждая распознанная цифра — самостоятельный вызов `onCommit` (см.
 * `NumberField` в `fields.tsx`) — то есть набор «120» без дополнительных мер
 * дал бы три шага истории на одну осознанную правку. Коммит-точка здесь
 * ровно там же, где и раньше был черновик: `onLiveChange` шлёт каждую
 * распознанную цифру как «живое» событие уже идущего жеста
 * (`state/editorHistory.ts`, `commit: false`), а `onCommitHistory` — на потере
 * фокусом поля — закрывает жест одним шагом. Поля без набора текста (цвет,
 * выбор из списка) коммитят через обычный `onChange` немедленно: там нет
 * промежуточных состояний одного жеста, которые стоило бы склеивать.
 */
import { useId, useState, type ReactElement } from 'react';

import type { Element } from '@player/core';

import {
  ANY_NUMBER,
  INTEGER,
  MultilineField,
  NumberField,
  POSITIVE,
  ReadonlyField,
  StringField,
  ColorField,
  ChoiceField,
} from './fields.js';
import {
  getStyleValue,
  setStyleValue,
  styleFieldsFor,
  type ElementStyle,
  type LengthOrPercent,
  type StyleFieldDef,
  type StyleFieldKey,
  type StyleReadResult,
} from '../state/style.js';
import { composeLengthOrPercent, parseStyleDraft } from './styleDraft.js';

export interface InspectorProps {
  /** undefined — ничего не выделено. */
  element: Element | undefined;
  /** Одношаговая правка — например, смена цвета в системном пикере. */
  onChange: (element: Element) => void;
  /** Живое событие уже идущего жеста набора числа — см. комментарий модуля. */
  onLiveChange: (element: Element) => void;
  /** Завершает жест, открытый через `onLiveChange` (потеря фокуса поля). */
  onCommitHistory: () => void;
}

export function Inspector(props: InspectorProps): ReactElement {
  const { element, onChange, onLiveChange, onCommitHistory } = props;

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
        <ElementFields
          key={element.id}
          element={element}
          onChange={onChange}
          onLiveChange={onLiveChange}
          onCommitHistory={onCommitHistory}
        />
      )}
    </aside>
  );
}

interface ElementFieldsProps {
  element: Element;
  onChange: (element: Element) => void;
  onLiveChange: (element: Element) => void;
  onCommitHistory: () => void;
}

function ElementFields({ element, onChange, onLiveChange, onCommitHistory }: ElementFieldsProps): ReactElement {
  /**
   * Отдать наружу элемент с одним изменённым полем.
   *
   * Остальные поля переносятся как есть, включая те, которых панель не
   * показывает (`style`): панель не вправе терять то, чего не знает.
   */
  const replace = (part: Partial<Element>): void => onChange({ ...element, ...part });
  const replaceLive = (part: Partial<Element>): void => onLiveChange({ ...element, ...part });

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
          onCommit={(x) => replaceLive({ x })}
          onBlurCommit={onCommitHistory}
        />
        <NumberField
          label="Y, px"
          value={element.y}
          accepts={ANY_NUMBER}
          onCommit={(y) => replaceLive({ y })}
          onBlurCommit={onCommitHistory}
        />
        <NumberField
          label="Ширина, px"
          value={element.width}
          accepts={POSITIVE}
          onCommit={(width) => replaceLive({ width })}
          onBlurCommit={onCommitHistory}
        />
        <NumberField
          label="Высота, px"
          value={element.height}
          accepts={POSITIVE}
          onCommit={(height) => replaceLive({ height })}
          onBlurCommit={onCommitHistory}
        />
        <NumberField
          label="Поворот, °"
          value={element.rotation}
          accepts={ANY_NUMBER}
          onCommit={(rotation) => replaceLive({ rotation })}
          onBlurCommit={onCommitHistory}
        />
        <NumberField
          label="Слой (z-index)"
          value={element.zIndex}
          accepts={INTEGER}
          onCommit={(zIndex) => replaceLive({ zIndex })}
          onBlurCommit={onCommitHistory}
        />
      </div>

      <StyleSection
        element={element}
        onStyleChange={(style) => replace({ style })}
        onStyleChangeLive={(style) => replaceLive({ style })}
        onCommitHistory={onCommitHistory}
      />

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

interface StyleSectionProps {
  element: Element;
  onStyleChange: (style: ElementStyle) => void;
  onStyleChangeLive: (style: ElementStyle) => void;
  onCommitHistory: () => void;
}

/**
 * Секция «Вид»: по виджету на каждое применимое поле стиля.
 *
 * Список полей, подписи, типы значений и умолчания идут из `styleFieldsFor`
 * и `STYLE_FIELDS` (`state/style.ts`, ADR-012) — здесь их нет ни одного
 * захардкоженным. Причина не стиль кода: вид редактора перепишут в отдельной
 * сессии (ADR-010), и пережить переписку обязано описание полей, а не эта
 * разметка. Добавь кто-нибудь девятое поле в модуль — эта секция покажет его
 * без единой правки, потому что `.map` идёт по `styleFieldsFor`, а не по
 * перечисленным здесь ключам.
 *
 * У элемента без применимых полей (`group`) секция не рисует ничего — пустой
 * блок с одним заголовком выглядел бы как баг, а не как «полей нет».
 */
function StyleSection({
  element,
  onStyleChange,
  onStyleChangeLive,
  onCommitHistory,
}: StyleSectionProps): ReactElement | null {
  const fields = styleFieldsFor(element.type);
  if (fields.length === 0) return null;

  const commit = (key: StyleFieldKey, value: string | number | LengthOrPercent): void => {
    const next = setStyleValue(element.style, key, value);
    // Ссылочная целостность setStyleValue: значение не изменилось — тот же
    // объект по ссылке. Дёргать onStyleChange в этом случае бессмысленно:
    // это породило бы шаг истории (срез 2) без настоящей правки.
    if (next === element.style) return;
    onStyleChange(next);
  };

  const commitLive = (key: StyleFieldKey, value: string | number | LengthOrPercent): void => {
    const next = setStyleValue(element.style, key, value);
    if (next === element.style) return;
    onStyleChangeLive(next);
  };

  return (
    <div className="ed-insp-block">
      <h3 className="ed-insp-title">Вид</h3>
      {fields.map((field) => (
        <StyleFieldWidget
          key={field.key}
          field={field}
          read={getStyleValue(element.style, field.key)}
          onCommit={(value) => commit(field.key, value)}
          onLiveCommit={(value) => commitLive(field.key, value)}
          onCommitHistory={onCommitHistory}
        />
      ))}
    </div>
  );
}

interface StyleFieldWidgetProps {
  field: StyleFieldDef;
  read: StyleReadResult;
  onCommit: (value: string | number | LengthOrPercent) => void;
  /** Живое событие набора числа — см. комментарий модуля Inspector.tsx. */
  onLiveCommit: (value: string | number | LengthOrPercent) => void;
  onCommitHistory: () => void;
}

/**
 * Виджет одного поля стиля — выбирается по `valueType`, не по ключу поля:
 * ключей восемь и они могут вырасти, типов значений закрыто пять
 * (`StyleValueType` в state/style.ts), и именно они определяют разметку.
 *
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
function StyleFieldWidget({
  field,
  read,
  onCommit,
  onLiveCommit,
  onCommitHistory,
}: StyleFieldWidgetProps): ReactElement {
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
 *
 * Оба поля стоят друг под другом внутри одного `.ed-insp-field` (`display:
 * grid`), а не в ряд: строчный контейнер для пары «число + единица» —
 * это правка `styles.ts`, а этот файл его не трогает (см. отчёт сессии).
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
