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

import type { Element, ElementState } from '@player/core';

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
import { StyleFieldWidget } from './styleFieldWidget.js';

/** Прозрачность — число от 0 до 1, как того требует ElementStateSchema. */
const OPACITY: (value: number) => boolean = (value) => value >= 0 && value <= 1;

export interface InspectorProps {
  /** undefined — ничего не выделено. */
  element: Element | undefined;
  /** Состояние элемента на текущем слайде. undefined — элемента здесь ещё нет. */
  state: ElementState | undefined;
  /** Правка содержимого (текст, путь к картинке) — самостоятельный шаг истории. */
  onContentChange: (content: string) => void;
  /** Одношаговая правка состояния — например, чекбокс видимости или цвет. */
  onStateChange: (patch: Partial<ElementState>) => void;
  /** Живое событие уже идущего жеста набора числа — см. комментарий модуля. */
  onStateChangeLive: (patch: Partial<ElementState>) => void;
  /** Завершает жест, открытый через `onStateChangeLive` (потеря фокуса поля). */
  onCommitHistory: () => void;
}

export function Inspector(props: InspectorProps): ReactElement {
  const { element, state, onContentChange, onStateChange, onStateChangeLive, onCommitHistory } = props;

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
          state={state}
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
  onContentChange: (content: string) => void;
  onStateChange: (patch: Partial<ElementState>) => void;
  onStateChangeLive: (patch: Partial<ElementState>) => void;
  onCommitHistory: () => void;
}

function ElementFields({
  element,
  state,
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
 */
function StyleSection({
  element,
  state,
  onStyleChange,
  onStyleChangeLive,
  onCommitHistory,
}: StyleSectionProps): ReactElement | null {
  const fields = styleFieldsFor(element.type);
  if (fields.length === 0) return null;

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

  return (
    <div className="ed-insp-block">
      <h3 className="ed-insp-title">Вид</h3>
      {fields.map((field) => (
        <StyleFieldWidget
          key={field.key}
          field={field}
          read={getStyleValue(state.style, field.key)}
          onCommit={(value) => commit(field.key, value)}
          onLiveCommit={(value) => commitLive(field.key, value)}
          onCommitHistory={onCommitHistory}
        />
      ))}
    </div>
  );
}

// StyleFieldWidget и её вспомогательные TokenField/LengthOrPercentField
// переехали в panels/styleFieldWidget.tsx (Сессия 30) — полоса свойств
// над холстом (stage/PropBar.tsx) зовёт ровно тот же виджет, а не второй.
