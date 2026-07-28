/**
 * Панель выделенной метки: гейт или анимация.
 *
 * До этой сессии метка на дорожке выделялась, но настраивать её было нечем —
 * панель свойств продолжала показывать элемент сцены (см. срез 3 плана
 * сессии). Эта панель занимает то же место в раскладке (`Editor.tsx` рисует
 * либо её, либо `Inspector`, никогда обе сразу).
 *
 * Чисто презентационная, как и `Inspector.tsx`: правила продукта — смена
 * вида гейта, минимумы схемы, привязка варианта к элементу, сброс from/to
 * при смене анимируемого свойства — целиком живут в чистых модулях
 * `state/gates.ts` и `state/animation.ts` (ADR-010). Этот файл только
 * раскладывает виджеты и передаёт готовый `Gate`/`Cue` в редьюсер через
 * колбэки `onUpdateGate`/`onUpdateCue`.
 */
import { useState, type ReactElement } from 'react';

import { ANIMATABLE, type Cue, type Element, type Gate } from '@player/core';

import {
  addOption,
  bindOption,
  promptOf,
  removeOption,
  setAccept,
  setCaseSensitive,
  setCorrect,
  setGateKind,
  setMaxAttempts,
  setOnWrong,
  setOptionLabel,
  setPrompt,
} from '../state/gates.js';
import {
  EASINGS,
  defaultsFor,
  setDuration,
  setEase,
  setFrom,
  setProperty,
  setTo,
  type Animatable,
} from '../state/animation.js';
import {
  ANY_NUMBER,
  POSITIVE,
  POSITIVE_INTEGER,
  ChoiceField,
  NumberField,
  ReadonlyField,
  StringField,
  type Choice,
} from './fields.js';

export type SelectedMarkData = { readonly kind: 'gate'; readonly gate: Gate } | { readonly kind: 'cue'; readonly cue: Cue };

export interface MarkPanelProps {
  mark: SelectedMarkData;
  /** Для привязки варианта ответа (ADR-011) и выбора цели анимации. */
  elements: readonly Element[];
  onUpdateGate: (gate: Gate) => void;
  onUpdateCue: (cue: Cue) => void;
  /** Действие `removeMark` в редьюсере уже есть — эта кнопка его вызывает. */
  onRemove: () => void;
}

export function MarkPanel({ mark, elements, onUpdateGate, onUpdateCue, onRemove }: MarkPanelProps): ReactElement {
  return (
    <aside className="ed-inspector" data-testid="mark-panel">
      <h2 className="ed-insp-title">{mark.kind === 'gate' ? 'Гейт' : 'Анимация'}</h2>
      <div className="ed-insp-body">
        {mark.kind === 'gate' ? (
          // key по id: при выборе другой метки виджеты (и их внутренние
          // черновики, см. AcceptListField) пересоздаются с нуля, как
          // у Inspector.ElementFields.
          <GatePanel key={mark.gate.id} gate={mark.gate} elements={elements} onUpdate={onUpdateGate} />
        ) : (
          <CuePanel key={mark.cue.id} cue={mark.cue} elements={elements} onUpdate={onUpdateCue} />
        )}
        <div className="ed-insp-block">
          <button type="button" className="ed-action" data-testid="mark-remove" onClick={onRemove}>
            Удалить метку
          </button>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Гейт
// ---------------------------------------------------------------------------

const GATE_KIND_CHOICES: readonly Choice[] = [
  { value: 'continue', label: 'Дальше (без вопроса)' },
  { value: 'choice', label: 'Выбор варианта' },
  { value: 'input', label: 'Ввод ответа' },
];

const ON_WRONG_CHOICES: readonly Choice[] = [
  { value: 'retry', label: 'Попробовать снова' },
  { value: 'reveal', label: 'Показать правильный ответ' },
  { value: 'continue', label: 'Пропустить дальше' },
];

interface GatePanelProps {
  gate: Gate;
  elements: readonly Element[];
  onUpdate: (gate: Gate) => void;
}

function GatePanel({ gate, elements, onUpdate }: GatePanelProps): ReactElement {
  // Память о вопросе при переключении вида (choice/input → continue → …) —
  // забота панели, а не state/gates.ts: модуль намеренно ничего не хранит
  // сам (см. docstring promptOf). Инициализируется текущим вопросом и дальше
  // обновляется на каждый переход, у которого он был.
  const [rememberedPrompt, setRememberedPrompt] = useState<string | undefined>(promptOf(gate));

  const handleKindChange = (kind: string): void => {
    if (kind !== 'continue' && kind !== 'choice' && kind !== 'input') {
      throw new Error(`Неизвестный вид гейта «${kind}»`);
    }
    const currentPrompt = promptOf(gate);
    onUpdate(setGateKind(gate, kind, currentPrompt ?? rememberedPrompt));
    if (currentPrompt !== undefined) setRememberedPrompt(currentPrompt);
  };

  const config = gate.config;

  return (
    <>
      <div className="ed-insp-block">
        <ReadonlyField label="Идентификатор" value={gate.id} />
        <ChoiceField
          label="Вид"
          value={config.kind}
          choices={GATE_KIND_CHOICES}
          onCommit={handleKindChange}
        />
      </div>

      {config.kind !== 'continue' && (
        <div className="ed-insp-block">
          <StringField label="Вопрос" value={config.prompt} onCommit={(prompt) => onUpdate(setPrompt(gate, prompt))} />
        </div>
      )}

      {config.kind === 'choice' && (
        <ChoiceOptionsEditor gate={gate} config={config} elements={elements} onUpdate={onUpdate} />
      )}

      {config.kind === 'input' && <InputAnswerEditor gate={gate} config={config} onUpdate={onUpdate} />}

      <div className="ed-insp-block">
        <h3 className="ed-insp-title">Поведение при ответе</h3>
        <ChoiceField
          label="Если ответ неверный"
          value={gate.onWrong}
          choices={ON_WRONG_CHOICES}
          onCommit={(value) => {
            if (value !== 'retry' && value !== 'reveal' && value !== 'continue') {
              throw new Error(`Неизвестное поведение при ошибке «${value}»`);
            }
            onUpdate(setOnWrong(gate, value));
          }}
        />
        <MaxAttemptsField gate={gate} onUpdate={onUpdate} />
      </div>
    </>
  );
}

type ChoiceConfig = Extract<Gate['config'], { kind: 'choice' }>;
type InputConfig = Extract<Gate['config'], { kind: 'input' }>;

interface ChoiceOptionsEditorProps {
  gate: Gate;
  config: ChoiceConfig;
  elements: readonly Element[];
  onUpdate: (gate: Gate) => void;
}

/** «Не привязан» — сохраняет вариант системной кнопкой (ADR-011). */
const UNBOUND = '';

function ChoiceOptionsEditor({ gate, config, elements, onUpdate }: ChoiceOptionsEditorProps): ReactElement {
  return (
    <div className="ed-insp-block">
      <h3 className="ed-insp-title">Варианты ответа</h3>
      {config.options.map((option, index) => {
        // Элемент, уже занятый ДРУГИМ вариантом этого гейта, из списка выбора
        // исключается — иначе bindOption бросил бы «занят», и панель упала бы
        // на самом обычном клике, вместо того чтобы просто не предлагать
        // недопустимый выбор.
        const takenByOthers = new Set(
          config.options.filter((other) => other.id !== option.id).map((other) => other.id),
        );
        const boundElementId = elements.some((element) => element.id === option.id) ? option.id : UNBOUND;
        const bindChoices: readonly Choice[] = [
          { value: UNBOUND, label: '— не привязан (системная кнопка) —' },
          ...elements
            .filter((element) => !takenByOthers.has(element.id))
            .map((element) => ({ value: element.id, label: `${element.id} · ${element.type}` })),
        ];

        return (
          <div className="ed-insp-field" key={option.id} data-testid={`gate-option-${index}`}>
            <label className="ed-insp-label" htmlFor={`gate-option-label-${index}`}>
              Подпись варианта {index + 1}
            </label>
            <input
              id={`gate-option-label-${index}`}
              className="ed-insp-input"
              type="text"
              value={option.label}
              data-testid={`gate-option-label-${index}`}
              onChange={(event) => onUpdate(setOptionLabel(gate, option.id, event.target.value))}
            />

            <label className="ed-insp-label">
              <input
                type="radio"
                name={`gate-correct-${gate.id}`}
                data-testid={`gate-option-correct-${index}`}
                checked={option.id === config.correctId}
                onChange={() => onUpdate(setCorrect(gate, option.id))}
              />{' '}
              Правильный вариант
            </label>

            <label className="ed-insp-label" htmlFor={`gate-option-bind-${index}`}>
              Элемент сцены, служащий этим вариантом
            </label>
            <select
              id={`gate-option-bind-${index}`}
              className="ed-insp-input"
              data-testid={`gate-option-bind-${index}`}
              value={boundElementId}
              onChange={(event) => {
                const elementId = event.target.value;
                if (elementId !== UNBOUND) onUpdate(bindOption(gate, option.id, elementId));
              }}
            >
              {bindChoices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="ed-action"
              data-testid={`gate-option-remove-${index}`}
              disabled={config.options.length <= 2}
              title={
                config.options.length <= 2
                  ? 'У гейта «выбор» должно остаться не меньше двух вариантов'
                  : 'Удалить этот вариант'
              }
              onClick={() => onUpdate(removeOption(gate, option.id))}
            >
              Удалить вариант
            </button>
          </div>
        );
      })}
      <button type="button" className="ed-action" data-testid="gate-option-add" onClick={() => onUpdate(addOption(gate))}>
        Добавить вариант
      </button>
    </div>
  );
}

interface InputAnswerEditorProps {
  gate: Gate;
  config: InputConfig;
  onUpdate: (gate: Gate) => void;
}

/**
 * Принимаемые ответы — по одному на строке.
 *
 * Черновик, как у `NumberField`: строка живёт в компоненте, наружу уходит
 * только на потере фокуса, и пустые строки внутри (обычная вещь при вводе —
 * например, автор нажал Enter и ещё не напечатал следующую строку)
 * отфильтровываются здесь же. `setAccept` бросает громкую ошибку на ЛЮБОЙ
 * пустой строке в списке — это верно для окончательного значения, но
 * означало бы падение на каждое нажатие Enter, если вызывать его на onChange.
 * Если после фильтрации совсем ничего не осталось, значение не коммитится
 * вовсе — гейт остаётся с прежним, валидным списком ответов, а не с пустым.
 */
function InputAnswerEditor({ gate, config, onUpdate }: InputAnswerEditorProps): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? config.accept.join('\n');

  const commit = (): void => {
    if (draft === null) return;
    const lines = draft.split('\n').filter((line) => line.trim() !== '');
    setDraft(null);
    if (lines.length === 0) return;
    onUpdate(setAccept(gate, lines));
  };

  return (
    <div className="ed-insp-block">
      <h3 className="ed-insp-title">Ответ</h3>
      <div className="ed-insp-field">
        <label className="ed-insp-label" htmlFor="gate-accept">
          Принимаемые ответы (по одному на строке)
        </label>
        <textarea
          id="gate-accept"
          className="ed-insp-area"
          data-testid="gate-accept"
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      </div>
      <label className="ed-insp-label">
        <input
          type="checkbox"
          data-testid="gate-case-sensitive"
          checked={config.caseSensitive}
          onChange={(event) => onUpdate(setCaseSensitive(gate, event.target.checked))}
        />{' '}
        Учитывать регистр
      </label>
    </div>
  );
}

interface MaxAttemptsFieldProps {
  gate: Gate;
  onUpdate: (gate: Gate) => void;
}

function MaxAttemptsField({ gate, onUpdate }: MaxAttemptsFieldProps): ReactElement {
  const unlimited = gate.maxAttempts === null;

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label">
        <input
          type="checkbox"
          data-testid="gate-unlimited-attempts"
          checked={unlimited}
          onChange={(event) => onUpdate(setMaxAttempts(gate, event.target.checked ? null : 1))}
        />{' '}
        Без ограничения попыток
      </label>
      {!unlimited && (
        <NumberField
          label="Максимум попыток"
          value={gate.maxAttempts ?? 1}
          accepts={POSITIVE_INTEGER}
          onCommit={(value) => onUpdate(setMaxAttempts(gate, value))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Анимация
// ---------------------------------------------------------------------------

const PROPERTY_LABELS: Record<Animatable, string> = {
  x: 'Сдвиг по X',
  y: 'Сдвиг по Y',
  scale: 'Масштаб',
  scaleX: 'Масштаб по X',
  scaleY: 'Масштаб по Y',
  rotate: 'Поворот',
  opacity: 'Прозрачность',
  filter: 'Размытие (blur)',
};

const PROPERTY_CHOICES: readonly Choice[] = ANIMATABLE.map((property) => ({
  value: property,
  label: PROPERTY_LABELS[property],
}));

const EASE_CHOICES: readonly Choice[] = EASINGS.map((ease) => ({ value: ease, label: ease }));

interface CuePanelProps {
  cue: Cue;
  elements: readonly Element[];
  onUpdate: (cue: Cue) => void;
}

function assertAnimatable(value: string): Animatable {
  if ((ANIMATABLE as readonly string[]).includes(value)) return value as Animatable;
  throw new Error(`Неизвестное анимируемое свойство «${value}»`);
}

function CuePanel({ cue, elements, onUpdate }: CuePanelProps): ReactElement {
  const spec = cue.animation;
  const isFilter = spec.property === 'filter';
  const fromIsUndefined = spec.from === undefined;

  return (
    <>
      <div className="ed-insp-block">
        <ReadonlyField label="Идентификатор" value={cue.id} />
        <ChoiceField
          label="Цель"
          value={cue.targetId}
          choices={elements.map((element) => ({ value: element.id, label: `${element.id} · ${element.type}` }))}
          onCommit={(targetId) => onUpdate({ ...cue, targetId })}
        />
      </div>

      <div className="ed-insp-block">
        <h3 className="ed-insp-title">Что анимируется</h3>
        <ChoiceField
          label="Свойство"
          value={spec.property}
          choices={PROPERTY_CHOICES}
          onCommit={(value) => onUpdate({ ...cue, animation: setProperty(spec, assertAnimatable(value)) })}
        />

        <label className="ed-insp-label">
          <input
            type="checkbox"
            data-testid="cue-from-auto"
            checked={fromIsUndefined}
            onChange={(event) =>
              onUpdate({
                ...cue,
                animation: setFrom(spec, event.target.checked ? undefined : defaultsFor(spec.property).from),
              })
            }
          />{' '}
          Начать с того, что уже на узле (без явного «от»)
        </label>

        {!fromIsUndefined &&
          (isFilter ? (
            <StringField
              label="Начало (например blur(8px))"
              value={String(spec.from ?? '')}
              onCommit={(value) => onUpdate({ ...cue, animation: setFrom(spec, value) })}
            />
          ) : (
            <NumberField
              label="Начало"
              value={Number(spec.from ?? 0)}
              accepts={ANY_NUMBER}
              onCommit={(value) => onUpdate({ ...cue, animation: setFrom(spec, value) })}
            />
          ))}

        {isFilter ? (
          <StringField
            label="Конец (например blur(0px))"
            value={String(spec.to)}
            onCommit={(value) => onUpdate({ ...cue, animation: setTo(spec, value) })}
          />
        ) : (
          <NumberField
            label="Конец"
            value={Number(spec.to)}
            accepts={ANY_NUMBER}
            onCommit={(value) => onUpdate({ ...cue, animation: setTo(spec, value) })}
          />
        )}

        <NumberField
          label="Длительность, мс"
          value={spec.duration}
          accepts={POSITIVE}
          onCommit={(value) => onUpdate({ ...cue, animation: setDuration(spec, value) })}
        />

        <ChoiceField
          label="Плавность"
          value={spec.ease}
          choices={EASE_CHOICES}
          onCommit={(value) => onUpdate({ ...cue, animation: setEase(spec, value) })}
        />
      </div>
    </>
  );
}
