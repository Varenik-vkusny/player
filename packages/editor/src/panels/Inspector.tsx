/**
 * Панель свойств выделенного элемента.
 *
 * Чисто презентационная. На вход приходит элемент и его состояние на
 * ТЕКУЩЕМ слайде, наружу уходят раздельные правки: содержимого (Element) или
 * геометрии/вида (ElementState). Проект панель не читает и не пишет: пишет
 * его редьюсер (state/project.ts), единственное место, где это вообще
 * происходит. Сцену в DOM панель тоже не трогает: числа она берёт из пропсов,
 * а не измеряет.
 *
 * Причина такой сухости не в чистоте ради чистоты. Интерфейс редактора будут
 * переписывать целиком, и переживёт это только та панель, которая ни за что
 * не держится — ни за состояние, ни за раскладку, ни за узлы сцены.
 *
 * `state === undefined` — законный случай, а не рассинхрон (см. ElementList.tsx):
 * элемент существует в сегменте, но на текущем слайде у него ещё нет
 * состояния — появится только на более позднем слайде. Геометрию и вид
 * править тогда не из чего, поэтому секция скрыта, а не показана нулями.
 *
 * Схему панель не валидирует: валидация живёт в ElementStateSchema и обязана
 * падать там. Но одно ограничение схемы здесь всё же знают — `width` и
 * `height` объявлены `positive()`. Ноль или минус, ушедший наружу, попал бы
 * в сохранённый проект, и тот перестал бы загружаться (инвариант №7): ошибка
 * всплыла бы через сессию и далеко от места, где её сделали. Поэтому такое
 * значение наружу не уходит вовсе.
 *
 * Отмена и повтор (срез 2). Числовые поля этой панели набираются посимвольно,
 * и каждая распознанная цифра — самостоятельный вызов `onStateChangeLive`
 * (см. `NumberField` в `fields.tsx`) — то есть набор «120» без дополнительных
 * мер дал бы три шага истории на одну осознанную правку. Коммит-точка здесь
 * ровно там же, где и раньше был черновик: `onStateChangeLive` шлёт каждую
 * распознанную цифру как «живое» событие уже идущего жеста
 * (`state/editorHistory.ts`, `commit: false`), а `onCommitHistory` — на потере
 * фокусом поля — закрывает жест одним шагом. Поля без набора текста (цвет,
 * выбор из списка, чекбокс) коммитят через `onStateChange` немедленно: там нет
 * промежуточных состояний одного жеста, которые стоило бы склеивать.
 */
import type { ReactElement } from 'react';

import type { Element, ElementState, Style } from '@player/core';

import {
  ANY_NUMBER,
  INTEGER,
  MultilineField,
  NumberField,
  POSITIVE,
  ReadonlyField,
  StringField,
} from './fields.js';
import {
  getStyleValue,
  setStyleValue,
  styleFieldsFor,
  type ElementStyle,
  type LengthOrPercent,
  type StyleFieldKey,
} from '../state/style.js';
import { isDetached, revertToStyle } from '../state/styleLink.js';
import { StyleFieldWidget } from './styleFieldWidget.js';
import { Button, AlignIcon } from '../ui/index.js';
import type { AlignKind, DistributeAxis, LayerMove } from '../state/arrange.js';
import {
  ALIGN_BUTTONS,
  DISTRIBUTE_BUTTONS,
  LAYER_BUTTONS,
  COPY_FORMAT_SHAPES,
} from '../stage/organs.js';

/** Прозрачность — число от 0 до 1, как того требует ElementStateSchema. */
const OPACITY: (value: number) => boolean = (value) => value >= 0 && value <= 1;

export interface InspectorProps {
  /** undefined — ничего не выделено. */
  element: Element | undefined;
  /** Состояние элемента на текущем слайде. undefined — элемента здесь ещё нет. */
  state: ElementState | undefined;
  /**
   * Стили проекта (схема v12, `project.styles`) — нужны секции «Вид», чтобы
   * найти стиль по `state.styleId` и проверить отцепление свойств
   * (`styleLink.ts`). Список, а не один стиль: элемент ссылается на любой
   * из них, и панель не знает заранее, на какой именно.
   */
  styles: readonly Style[];
  /** Правка содержимого (текст, путь к картинке) — самостоятельный шаг истории. */
  onContentChange: (content: string) => void;
  /** Одношаговая правка состояния — например, чекбокс видимости или цвет. */
  onStateChange: (patch: Partial<ElementState>) => void;
  /** Живое событие уже идущего жеста набора числа — см. комментарий модуля. */
  onStateChangeLive: (patch: Partial<ElementState>) => void;
  /** Завершает жест, открытый через `onStateChangeLive` (потеря фокуса поля). */
  onCommitHistory: () => void;

  /**
   * Сколько элементов выделено — управляет блоком «Расположение» (Сессия 48).
   * Он показывается НЕЗАВИСИМО от `element`/`state` выше: при нескольких
   * выделенных `element` законно `undefined` (см. комментарий модуля
   * `Editor.tsx`, `soleSelectedId`) — полей одного элемента показать нечего,
   * но выровнять, разложить или переместить по слоям пачку по-прежнему
   * можно, и раньше это делала полоса свойств именно по счёту выделенных,
   * а не по наличию единственного элемента.
   */
  selectedCount: number;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onLayer: (move: LayerMove) => void;
  /**
   * «Копировать форматирование» (docs/design/styles.md §5) — не «кисть»,
   * слово в интерфейс не идёт (натура снята в Canva 14.08.2026, там пункт
   * называется ровно так). Живо только при ОДНОМ выделенном с видом на этом
   * слайде — снимать формат с пачки или «ниоткуда» нечем.
   */
  copyFormatEnabled: boolean;
  /** Формат уже «в руке» — кнопка обязана выглядеть нажатой. */
  copyFormatArmed: boolean;
  onCopyFormat: () => void;
}

export function Inspector(props: InspectorProps): ReactElement {
  const {
    element,
    state,
    styles,
    onContentChange,
    onStateChange,
    onStateChangeLive,
    onCommitHistory,
    selectedCount,
    onAlign,
    onDistribute,
    onLayer,
    copyFormatEnabled,
    copyFormatArmed,
    onCopyFormat,
  } = props;

  return (
    <aside className="ed-inspector" data-testid="inspector">
      <h2 className="ed-insp-title">Свойства</h2>
      {selectedCount > 0 && (
        <ArrangeBlock
          selectedCount={selectedCount}
          onAlign={onAlign}
          onDistribute={onDistribute}
          onLayer={onLayer}
          copyFormatEnabled={copyFormatEnabled}
          copyFormatArmed={copyFormatArmed}
          onCopyFormat={onCopyFormat}
        />
      )}
      {element === undefined ? (
        /*
         * ДВА РАЗНЫХ СЛУЧАЯ, А НЕ ОДИН (Сессия 48). `element` пуст и когда
         * не выделено ничего, и когда выделено НЕСКОЛЬКО: полей одного
         * элемента показать нечего, но выделение есть, и блок «Расположение»
         * выше живой. Один текст на оба случая давал бы «Ничего не выделено»
         * ровно там, где рядом стоят работающие кнопки над выделенной пачкой,
         * — панель врала бы автору о том, что он сам только что сделал.
         */
        selectedCount > 1 ? (
          <p className="ed-insp-empty" data-testid="inspector-many">
            Выделено несколько
            <span className="ed-muted">
              Свойства правятся у одного элемента. Расположением пачки можно управлять выше.
            </span>
          </p>
        ) : (
          <p className="ed-insp-empty" data-testid="inspector-empty">
            Ничего не выделено
            <span className="ed-muted">Выберите элемент на сцене, чтобы править его свойства.</span>
          </p>
        )
      ) : (
        // key по идентификатору: при смене выделения поля пересоздаются.
        // Иначе недописанный черновик («-», «1.») пережил бы переход
        // на другой элемент и был бы отправлен уже ему.
        <ElementFields
          key={element.id}
          element={element}
          state={state}
          styles={styles}
          onContentChange={onContentChange}
          onStateChange={onStateChange}
          onStateChangeLive={onStateChangeLive}
          onCommitHistory={onCommitHistory}
        />
      )}
    </aside>
  );
}

interface ElementFieldsProps {
  element: Element;
  state: ElementState | undefined;
  styles: readonly Style[];
  onContentChange: (content: string) => void;
  onStateChange: (patch: Partial<ElementState>) => void;
  onStateChangeLive: (patch: Partial<ElementState>) => void;
  onCommitHistory: () => void;
}

function ElementFields({
  element,
  state,
  styles,
  onContentChange,
  onStateChange,
  onStateChangeLive,
  onCommitHistory,
}: ElementFieldsProps): ReactElement {
  return (
    <div className="ed-insp-body">
      <div className="ed-insp-block">
        <ReadonlyField label="Идентификатор" value={element.id} />
        <ReadonlyField label="Тип" value={element.type} />
        <p className="ed-insp-note">
          Идентификатор и тип менять нельзя: на идентификатор ссылаются гейты и слайды,
          и переименование здесь тихо оборвало бы эти ссылки.
        </p>
      </div>

      {state === undefined ? (
        <p className="ed-insp-note" data-testid="inspector-no-state">
          Этот элемент не появляется на текущем слайде — геометрия и вид недоступны
          для правки. Выберите слайд, на котором он уже есть, либо слайд, где он
          появится.
        </p>
      ) : (
        <>
          <div className="ed-insp-grid">
            <NumberField
              label="X, px"
              value={state.x}
              accepts={ANY_NUMBER}
              onCommit={(x) => onStateChangeLive({ x })}
              onBlurCommit={onCommitHistory}
            />
            <NumberField
              label="Y, px"
              value={state.y}
              accepts={ANY_NUMBER}
              onCommit={(y) => onStateChangeLive({ y })}
              onBlurCommit={onCommitHistory}
            />
            <NumberField
              label="Ширина, px"
              value={state.width}
              accepts={POSITIVE}
              onCommit={(width) => onStateChangeLive({ width })}
              onBlurCommit={onCommitHistory}
            />
            <NumberField
              label="Высота, px"
              value={state.height}
              accepts={POSITIVE}
              onCommit={(height) => onStateChangeLive({ height })}
              onBlurCommit={onCommitHistory}
            />
            <NumberField
              label="Поворот, °"
              value={state.rotation}
              accepts={ANY_NUMBER}
              onCommit={(rotation) => onStateChangeLive({ rotation })}
              onBlurCommit={onCommitHistory}
            />
            <NumberField
              label="Слой (z-index)"
              value={state.zIndex}
              accepts={INTEGER}
              onCommit={(zIndex) => onStateChangeLive({ zIndex })}
              onBlurCommit={onCommitHistory}
            />
          </div>

          <div className="ed-insp-block">
            <NumberField
              label="Прозрачность"
              value={state.opacity}
              accepts={OPACITY}
              onCommit={(opacity) => onStateChangeLive({ opacity })}
              onBlurCommit={onCommitHistory}
            />
            <label className="ed-insp-label">
              <input
                type="checkbox"
                data-testid="element-visible"
                checked={state.visible}
                onChange={(event) => onStateChange({ visible: event.target.checked })}
              />{' '}
              Видим на этом слайде
            </label>
          </div>

          <StyleSection
            element={element}
            state={state}
            styles={styles}
            onStyleChange={(style) => onStateChange({ style })}
            onStyleChangeLive={(style) => onStateChangeLive({ style })}
            onCommitHistory={onCommitHistory}
          />
        </>
      )}

      {/* Содержимое есть не у всякого типа. У фигуры его показывать нечего. */}
      {element.type === 'text' && (
        <div className="ed-insp-block">
          <MultilineField label="Текст" value={element.content} onCommit={onContentChange} />
        </div>
      )}
      {element.type === 'image' && (
        <div className="ed-insp-block">
          <StringField label="Путь к картинке" value={element.content} onCommit={onContentChange} />
        </div>
      )}
      {element.type === 'video' && (
        <div className="ed-insp-block">
          {/*
            Подпись отличается от картинкиной намеренно. Две панели рядом
            уже давали два одинаковых заголовка («Фон» у роли темы и «Фон»
            у стиля элемента), и поймал это строгий режим Playwright
            в тесте ПРО ДРУГОЕ. «Путь к видео» с «Путь к картинке»
            не совпадает, и совпасть не может: типы взаимоисключающие.
          */}
          <StringField label="Путь к видео" value={element.content} onCommit={onContentChange} />
        </div>
      )}
    </div>
  );
}

interface StyleSectionProps {
  element: Element;
  state: ElementState;
  styles: readonly Style[];
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
 * разметка. Стиль читается из `state.style` — в схеме v3 он переехал
 * с `Element` на `ElementState` (см. `schema.ts`), тип элемента при этом
 * по-прежнему решает, какие поля вообще применимы.
 *
 * Пометка «отличается от стиля» (ADR-029, схема v12). У элемента, идущего
 * по стилю (`state.styleId`), поле МОЖЕТ быть отцеплено — `isDetached`
 * смотрит на НАЛИЧИЕ ключа в собственной карте, а не на равенство значений
 * (`styleLink.ts`). Пометка — ОТДЕЛЬНЫЙ видимый узел
 * (`data-testid="style-detached-<ключ>"`), а не текст в подписи поля: подписи
 * на полосе свойств визуально скрыты `clip-path`, и в Сессии 30 это уже дало
 * три зелёных e2e при пустом экране. Здесь, в панели «Объект», подписи не
 * скрыты — но пометка всё равно узел, а не довесок к подписи, чтобы это
 * решение не пришлось пересматривать при следующей перекладке разметки.
 */
function StyleSection({
  element,
  state,
  styles,
  onStyleChange,
  onStyleChangeLive,
  onCommitHistory,
}: StyleSectionProps): ReactElement | null {
  const fields = styleFieldsFor(element.type);
  if (fields.length === 0) return null;

  const linkedStyle = state.styleId === undefined
    ? undefined
    : styles.find((style) => style.id === state.styleId);

  const commit = (key: StyleFieldKey, value: string | number | LengthOrPercent): void => {
    const next = setStyleValue(state.style, key, value);
    // Ссылочная целостность setStyleValue: значение не изменилось — тот же
    // объект по ссылке. Дёргать onStyleChange в этом случае бессмысленно:
    // это породило бы шаг истории (срез 2) без настоящей правки.
    if (next === state.style) return;
    onStyleChange(next);
  };

  const commitLive = (key: StyleFieldKey, value: string | number | LengthOrPercent): void => {
    const next = setStyleValue(state.style, key, value);
    if (next === state.style) return;
    onStyleChangeLive(next);
  };

  /**
   * «Вернуть как в стиле» — СНИМАЕТ ключ (`revertToStyle`), не вписывает
   * текущее значение стиля. Одношаговая правка, как чекбокс видимости:
   * `onStyleChange` идёт через `onStateChange` (Inspector.tsx выше), у него
   * `commit` не передан — значит `undefined`, то есть «самостоятельный шаг».
   */
  const revert = (key: StyleFieldKey): void => {
    const next = revertToStyle(state.style, key);
    if (next === state.style) return;
    onStyleChange(next);
  };

  return (
    <div className="ed-insp-block">
      <h3 className="ed-insp-title">Вид</h3>
      {fields.map((field) => {
        const detached = linkedStyle !== undefined && isDetached(state, linkedStyle, field.key);
        return (
          <div key={field.key}>
            <StyleFieldWidget
              field={field}
              read={getStyleValue(state.style, field.key)}
              onCommit={(value) => commit(field.key, value)}
              onLiveCommit={(value) => commitLive(field.key, value)}
              onCommitHistory={onCommitHistory}
            />
            {detached && linkedStyle !== undefined && (
              <div className="ed-insp-note" data-testid={`style-detached-${field.key}`}>
                Отличается от стиля «{linkedStyle.name}»
                <br />
                <Button
                  data-testid={`style-revert-${field.key}`}
                  onClick={() => revert(field.key)}
                >
                  Вернуть как в стиле
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// StyleFieldWidget и её вспомогательные TokenField/LengthOrPercentField
// переехали в panels/styleFieldWidget.tsx (Сессия 30) — полоса свойств
// над холстом (stage/PropBar.tsx) зовёт ровно тот же виджет, а не второй.

interface ArrangeBlockProps {
  selectedCount: number;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onLayer: (move: LayerMove) => void;
  copyFormatEnabled: boolean;
  copyFormatArmed: boolean;
  onCopyFormat: () => void;
}

/**
 * «Расположение»: выравнивание объектов на холсте, раскладка, слои
 * и «копировать форматирование» — органы, до Сессии 48 жившие на полосе
 * свойств над холстом (`stage/PropBar.tsx`). Решение владельца 18.08.2026:
 * полоса при окне 1280 с открытым каталогом не помещает даже пять полей
 * стиля (673 px при доступных 586) — органы сняты с неё совсем и встали
 * здесь, за дверью «Ещё…».
 *
 * Константы `ALIGN_BUTTONS`, `DISTRIBUTE_BUTTONS`, `LAYER_BUTTONS`,
 * `COPY_FORMAT_SHAPES` берутся из `stage/organs.ts` БЕЗ ИЗМЕНЕНИЙ — те же
 * подписи и `data-testid`, что были на полосе (и что зовёт меню правой
 * кнопки холста, `Editor.tsx`, `contextMenuItems`). Второй список с другими
 * словами для одного и того же хода — ровно та болезнь, которая дважды
 * дала на одном экране две подписи «Фон» (Сессия 30, CLAUDE.md).
 *
 * Кнопки — те же `.ed-propbar-btn`/`.ed-propbar-sep`, что и на полосе:
 * готовая роль (28×28, скругление, погашенное и нажатое состояние) уже
 * объявлена в styles.ts, а не сырые значения здесь. Оборачивающий
 * `.ed-insp-organs` даёт им течь на новую строку — панель не такая узкая,
 * как полоса, но и не бесконечная, а переносить закон «кнопка не сжимается»
 * (см. комментарий styles.ts у .ed-propbar-btn) в CSS-flex-wrap можно и без
 * ScrollStrip: сжатия тут не будет, будет перенос.
 *
 * Гашение сохраняет причину в `title` — те же тексты, что раньше стояли
 * на полосе: распределение живо от трёх выделенных, копирование формата —
 * от `copyFormatEnabled` (см. её комментарий в InspectorProps выше).
 * Выравнивание и слои на кнопке никогда не гаснут (полоса их тоже не
 * гасила — гашение хода по слою есть только в контекстном меню, у которого
 * для этого есть точный список через `layerPatches`, недоступный отсюда
 * без второго источника истины).
 */
function ArrangeBlock({
  selectedCount,
  onAlign,
  onDistribute,
  onLayer,
  copyFormatEnabled,
  copyFormatArmed,
  onCopyFormat,
}: ArrangeBlockProps): ReactElement {
  /**
   * Раскладка требует трёх: между двумя элементами промежуток ровно один,
   * и равнять его нечему. Тот же порог, что раньше был в PropBar.tsx —
   * формула переехала СЮДА целиком, а не скопирована: после Сессии 48
   * PropBar.tsx кнопку «Разложить» больше не рисует и порог ему не нужен.
   */
  const canDistribute = selectedCount >= 3;

  return (
    <div className="ed-insp-block">
      <h3 className="ed-insp-title">Расположение</h3>
      <div className="ed-insp-organs">
        {ALIGN_BUTTONS.map(({ kind, label, testId, shapes }) => (
          <button
            key={kind}
            type="button"
            className="ed-propbar-btn"
            data-testid={testId}
            aria-label={label}
            title={label}
            onClick={() => onAlign(kind)}
          >
            <AlignIcon shapes={shapes} />
          </button>
        ))}

        <span className="ed-propbar-sep" aria-hidden="true" />

        {DISTRIBUTE_BUTTONS.map(({ axis, label, testId, shapes }) => (
          <button
            key={axis}
            type="button"
            className="ed-propbar-btn"
            data-testid={testId}
            aria-label={label}
            title={canDistribute ? label : `${label} — нужно выделить хотя бы три`}
            disabled={!canDistribute}
            onClick={() => onDistribute(axis)}
          >
            <AlignIcon shapes={shapes} />
          </button>
        ))}

        <span className="ed-propbar-sep" aria-hidden="true" />

        {LAYER_BUTTONS.map(({ move, label, testId, shapes }) => (
          <button
            key={move}
            type="button"
            className="ed-propbar-btn"
            data-testid={testId}
            aria-label={label}
            title={label}
            onClick={() => onLayer(move)}
          >
            <AlignIcon shapes={shapes} />
          </button>
        ))}

        <span className="ed-propbar-sep" aria-hidden="true" />

        <button
          type="button"
          className="ed-propbar-btn"
          data-testid="copy-format"
          aria-label="Копировать форматирование"
          aria-pressed={copyFormatArmed}
          title={
            copyFormatEnabled
              ? 'Копировать форматирование (Ctrl+Alt+C)'
              : 'Копировать форматирование — нужно выделить один элемент с видом на этом слайде'
          }
          disabled={!copyFormatEnabled}
          onClick={onCopyFormat}
        >
          <AlignIcon shapes={COPY_FORMAT_SHAPES} />
        </button>
      </div>
    </div>
  );
}
