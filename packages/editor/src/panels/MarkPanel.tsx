/**
 * Панель выделенной метки: гейт или слайд.
 *
 * Раньше вторым видом метки была анимация (кью). В схеме v3 кью нет —
 * появление элемента выражается разницей состояний на соседних слайдах,
 * а слайд сам стал меткой на дорожке. Эта панель занимает то же место
 * в раскладке, что и раньше (`Editor.tsx` рисует либо её, либо `Inspector`,
 * никогда обе сразу).
 *
 * Чисто презентационная, как и `Inspector.tsx`: правила продукта — смена
 * вида гейта, минимумы схемы, привязка варианта к элементу — целиком живут
 * в чистом модуле `state/gates.ts` (ADR-010). Этот файл только раскладывает
 * виджеты и передаёт готовый `Gate` в редьюсер через колбэк `onUpdateGate`.
 *
 * У слайда правится переход — плавно или резко (`onSetSlideTransition`
 * → действие `setSlideTransition` → `state/slides.ts`). Время метки-слайда,
 * как и время гейта, правится перетаскиванием по дорожке (`moveMark`),
 * а не полем в этой панели.
 */
import { useState, type ReactElement } from 'react';

import type { Element, Gate, Slide, TimeRef, Word } from '@player/core';

import {
  addOption,
  bindOption,
  promptOf,
  removeOption,
  setAccept,
  setCaseSensitive,
  setCorrect,
  setFork,
  setGateKind,
  setMaxAttempts,
  setOnWrong,
  setOptionLabel,
  setPrompt,
} from '../state/gates.js';
import { retargetMark, wordAnchorProblem } from '../track/marks.js';
import {
  POSITIVE_INTEGER,
  ChoiceField,
  NumberField,
  ReadonlyField,
  StringField,
  ValidatedStringField,
  type Choice,
} from './fields.js';

export type SelectedMarkData =
  | { readonly kind: 'gate'; readonly gate: Gate }
  | { readonly kind: 'slide'; readonly slide: Slide };

export interface MarkPanelProps {
  mark: SelectedMarkData;
  /** Для привязки варианта ответа (ADR-011). */
  elements: readonly Element[];
  /** Расшифровка части. Пустая — законный случай: часть без озвучки. */
  words: readonly Word[];
  /** Перепривязка метки (действие `moveMark`): к слову или к секунде. */
  onRetargetMark: (at: TimeRef) => void;
  /**
   * Гейт стоит внутри перехода между слайдами.
   *
   * Не ошибка: продукт доведёт переход до конца мгновенно и покажет
   * законную картинку (product.md §3 [Р]). Но автор почти наверняка
   * промахнулся — он ставил вопрос к тому, что сейчас едет, а зритель
   * увидит уже приехавшее. Поэтому предупреждение, а не запрет.
   */
  gateInsideTransition?: boolean;
  onUpdateGate: (gate: Gate) => void;
  /** Переход выделенного слайда: плавно или резко (действие `setSlideTransition`). */
  onSetSlideTransition: (transition: Slide['transition']) => void;
  /**
   * Переименование переменной остановки (действие `renameVariable`).
   *
   * Отдельным колбэком, а не через `onUpdateGate`: правка расходится
   * каскадом по правилам выхода ВСЕХ частей, то есть трогает проект целиком,
   * а не один гейт. Собрать её панелью, как остальные правки гейта,
   * было бы нельзя — панель других частей не видит.
   */
  onRenameVariable: (name: string) => void;
  /** Почему такое имя переменной принять нельзя (`state/exits.ts`). */
  variableProblemOf: (name: string) => string | undefined;
  /** Действие `removeMark`/`removeSlide` в редьюсере уже есть — эта кнопка его вызывает. */
  onRemove: () => void;
  /**
   * Разрезать часть по этой развилке (действие `splitAtGate`).
   *
   * Отдельным жестом, а не побочным эффектом переключения типа остановки:
   * разрез рождает несколько частей и уводит половину слайдов в новую.
   * Автор должен иметь возможность объявить развилку, посмотреть и передумать,
   * не перестраивая объяснение движением мыши по выпадающему списку.
   */
  onSplitAtGate?: (() => void) | undefined;
  /**
   * Почему разрез сейчас невозможен. `undefined` — возможен.
   *
   * Строкой, а не булевым: запрещённая кнопка без причины — это тупик,
   * в котором автор не понимает, что он сделал не так.
   */
  splitBlockedReason?: string | undefined;
}

export function MarkPanel({
  mark,
  elements,
  words,
  onRetargetMark,
  gateInsideTransition = false,
  onUpdateGate,
  onSetSlideTransition,
  onRenameVariable,
  variableProblemOf,
  onRemove,
  onSplitAtGate,
  splitBlockedReason,
}: MarkPanelProps): ReactElement {
  return (
    <aside className="ed-inspector" data-testid="mark-panel">
      {/* «Остановка», а не «Гейт»: внутреннее слово в интерфейс не течёт
          (product.md §2). Автор видит остановку, вопрос и развилку. */}
      <h2 className="ed-insp-title">{mark.kind === 'gate' ? 'Остановка' : 'Слайд'}</h2>
      <div className="ed-insp-body">
        {mark.kind === 'gate' && gateInsideTransition ? (
          <p className="ed-warning" data-testid="gate-in-transition">
            Остановка стоит внутри перехода между слайдами. Зритель увидит переход
            уже доведённым до конца — вопрос будет задан не к тому, что едет.
          </p>
        ) : null}
        {mark.kind === 'gate' ? (
          // key по id: при выборе другой метки виджеты (и их внутренние
          // черновики, см. AcceptListField) пересоздаются с нуля, как
          // у Inspector.ElementFields.
          <GatePanel
            key={mark.gate.id}
            gate={mark.gate}
            elements={elements}
            onUpdate={onUpdateGate}
            onRenameVariable={onRenameVariable}
            variableProblemOf={variableProblemOf}
            onSplit={onSplitAtGate}
            splitBlockedReason={splitBlockedReason}
          />
        ) : (
          <SlideMarkPanel
            key={mark.slide.id}
            slide={mark.slide}
            onSetTransition={onSetSlideTransition}
          />
        )}
        <MarkTimeBlock
          at={mark.kind === 'gate' ? mark.gate.at : mark.slide.at}
          words={words}
          onRetarget={onRetargetMark}
        />
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
// Привязка метки ко времени: слово или секунда
// ---------------------------------------------------------------------------

interface MarkTimeBlockProps {
  at: TimeRef;
  words: readonly Word[];
  onRetarget: (at: TimeRef) => void;
}

/**
 * Чем метка привязана ко времени — словом расшифровки или секундой.
 *
 * Обе привязки работали в модели всегда, выбирать между ними автор не мог
 * (`product.md` §2в [Р]). Отсюда же и «ветка без озвучки — законный случай»:
 * при пустой расшифровке привязки к слову просто нет, и блок ОБЪЯСНЯЕТ
 * это словами, а не гасит переключатель молча.
 *
 * Слово показано ПОСТОЯННО, а не только при наведении, и это не украшение.
 * Круг «к секунде и обратно к слову» сохраняет время точно, но у метки,
 * стоящей чуть раньше слова, может выбрать ДРУГОЕ слово — то, внутрь
 * которого попала секунда (измерено на `demo.json`, см. `test/marks.test.ts`).
 * Время при этом не меняется, значит по дорожке автор ничего не заметит,
 * а при замене голоса метка поедет не за тем словом. Единственная защита —
 * держать слово привязки на виду.
 *
 * Числового поля времени здесь нет намеренно: время правится перетаскиванием
 * по дорожке. Поле ввода секунд позволяло бы поставить слайд перед предыдущим,
 * а порядок слайдов проверяет только схема при сохранении — то есть ошибка
 * нашлась бы далеко от места, где её сделали.
 */
function MarkTimeBlock({ at, words, onRetarget }: MarkTimeBlockProps): ReactElement {
  const problem = wordAnchorProblem(at, words);
  const choices: readonly Choice[] = [
    // Сирота попадает в список первой и только когда она уже есть: `<select>`
    // не может показать значение, которого нет среди `<option>`, а показал бы
    // молча первое — то есть соврал бы о состоянии метки.
    ...(at.kind === 'orphan' ? [{ value: 'orphan', label: 'Слово не найдено' }] : []),
    { value: 'seconds', label: 'К секунде' },
    ...(problem === undefined || at.kind === 'word' ? [{ value: 'word', label: 'К слову' }] : []),
  ];
  const anchorWord = at.kind === 'word' ? (words[at.wordIndex]?.text ?? at.anchor.text) : undefined;

  return (
    <div className="ed-insp-block" data-testid="mark-time">
      <ChoiceField
        label="Метка привязана"
        value={at.kind}
        choices={choices}
        onCommit={(value) => {
          if (value === 'orphan') {
            // Сиротство ставит выравнивание, а не автор (`product.md` §4:
            // якорь никогда не ставится наугад — наугад ставит машина и сразу
            // сознаётся). Снять его можно, выбрав любую из двух привязок;
            // назначить руками нельзя, и это не заглушка, а отказ.
            throw new Error(
              'Сиротство метки снимается выбором привязки, поставить его вручную нельзя',
            );
          }
          if (value !== 'word' && value !== 'seconds') {
            throw new Error(`Неизвестная привязка метки «${value}»`);
          }
          onRetarget(retargetMark(at, words, value));
        }}
      />
      {at.kind === 'orphan' ? (
        <OrphanBlock at={at} words={words} />
      ) : at.kind === 'word' ? (
        <>
          <ReadonlyField label="Слово" value={anchorWord ?? ''} />
          <p className="ed-insp-note">
            Метка стоит на слове{noticeableOffset(at.offset) ? ` со смещением ${formatOffset(at.offset)}` : ''}.
            Замена голоса, диктора или скорости такую разметку не ломает — меняется только длина.
          </p>
        </>
      ) : (
        <>
          <ReadonlyField label="Секунда" value={at.t.toFixed(2).replace('.', ',')} />
          {problem === undefined ? null : (
            <p className="ed-insp-note" data-testid="word-anchor-problem">
              {problem}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Метка, потерявшая своё слово: что искали, где стоит сейчас и что делать.
 *
 * Три вещи говорятся прямо, потому что §4 запрещает и тихую подстановку,
 * и молчаливую потерю: слово, которого не нашлось; слово, на котором метка
 * стоит СЕЙЧАС; и то, что это догадка машины, а не выбор автора. Убрать
 * любую из трёх — значит вернуть состояние, в котором метка выглядит
 * рабочей и ломается у зрителя.
 */
function OrphanBlock({
  at,
  words,
}: {
  at: Extract<TimeRef, { kind: 'orphan' }>;
  words: readonly Word[];
}): ReactElement {
  // Догадка обязана указывать на существующее слово — это проверяет схема
  // при загрузке. Если сюда всё же пришла ссылка в пустоту, значит проект
  // испорчен мимо валидации, и правильный исход — коробка ошибки редактора,
  // а не подставленный прочерк: подставленный прочерк автор примет за
  // «слово такое», и дефект уедет в сохранённый файл.
  const guess = words[at.wordIndex];
  if (!guess) {
    throw new Error(
      `Догадка сироты указывает на слово №${at.wordIndex}, а всего слов ${words.length}`,
    );
  }

  return (
    <>
      <ReadonlyField label="Искали слово" value={at.lost.text} />
      <ReadonlyField label="Метка стоит на" value={guess.text} />
      <p className="ed-insp-note" data-testid="orphan-note">
        Слова «{at.lost.text}» в этой записи нет. Метка поставлена в лучшую
        догадку — на ближайшее уцелевшее слово. Это выбор машины, а не ваш:
        подтвердите его кнопкой «К слову» или переведите метку на секунду.
      </p>
    </>
  );
}

/**
 * Стоит ли вообще говорить про смещение.
 *
 * Сравнение с нулём здесь не годится: смещение строится как разность двух
 * долей секунды и точным нулём почти никогда не бывает. На метке, стоящей
 * ровно на начале слова, `−1e-16` печаталось бы как «минус 0,00 с» —
 * и автор читал бы бессмыслицу вместо «метка стоит на слове».
 * Порог — половина последнего показываемого знака.
 */
function noticeableOffset(offset: number): boolean {
  return Math.abs(offset) >= 0.005;
}

/** Смещение словами автора: «плюс 0,20 с» / «минус 0,15 с». */
function formatOffset(offset: number): string {
  const value = Math.abs(offset).toFixed(2).replace('.', ',');
  return `${offset < 0 ? 'минус' : 'плюс'} ${value} с`;
}

// ---------------------------------------------------------------------------
// Гейт
// ---------------------------------------------------------------------------

const GATE_KIND_CHOICES: readonly Choice[] = [
  { value: 'continue', label: 'Дальше (без вопроса)' },
  { value: 'choice', label: 'Выбор варианта' },
  { value: 'input', label: 'Ввод ответа' },
];

/**
 * Набор значений — из схемы v3 (`GateSchema.onWrong`): `inline-hint`
 * и `inline-explain` заменили единственный `reveal` версии 2, разведя
 * «короткую подсказку» и «разбор слоем поверх сцены» в два разных исхода.
 */
const ON_WRONG_CHOICES: readonly Choice[] = [
  { value: 'retry', label: 'Попробовать снова' },
  { value: 'inline-hint', label: 'Показать короткую подсказку' },
  { value: 'inline-explain', label: 'Показать разбор' },
  { value: 'continue', label: 'Пропустить дальше' },
];

interface GatePanelProps {
  gate: Gate;
  elements: readonly Element[];
  onUpdate: (gate: Gate) => void;
  onRenameVariable: (name: string) => void;
  variableProblemOf: (name: string) => string | undefined;
  onSplit?: (() => void) | undefined;
  splitBlockedReason?: string | undefined;
}

function GatePanel({
  gate,
  elements,
  onUpdate,
  onRenameVariable,
  variableProblemOf,
  onSplit,
  splitBlockedReason,
}: GatePanelProps): ReactElement {
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
        {/* Без «recordAs»: внутреннее имя поля автору ничего не говорит,
            а слово «переменная» он уже понимает по школьному опыту.
            Имя задаёт автор (product.md §2в [Р]): без него нельзя сослаться
            на этот ответ из будущего вопроса или развилки. */}
        <ValidatedStringField
          label="Ответ запоминается как"
          value={gate.recordAs}
          problemOf={variableProblemOf}
          onCommit={onRenameVariable}
        />
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
        <StopKindEditor
          gate={gate}
          config={config}
          onUpdate={onUpdate}
          onSplit={onSplit}
          splitBlockedReason={splitBlockedReason}
        />
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
            if (
              value !== 'retry'
              && value !== 'inline-hint'
              && value !== 'inline-explain'
              && value !== 'continue'
            ) {
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

/**
 * Две остановки продукта, названные так, как их называет автор.
 *
 * Вопрос — остановка ПОСРЕДИ части: зритель отвечает, повествование
 * продолжается здесь же. Развилка — остановка В КОНЦЕ: она делит
 * объяснение на части.
 *
 * В схеме это одно и то же поле `correctId`, и различие выражено его
 * значением. Автору же про `correctId`, `exit` и «правила выхода» знать
 * незачем: он ставит развилку, а правила появляются сами.
 */
const STOP_KIND_CHOICES: readonly Choice[] = [
  // Коротко, потому что это выпадающий список: длинную подпись он обрезает,
  // и автор видит обрывок фразы. Полное объяснение — в подсказке ниже.
  { value: 'question', label: 'Вопрос — рассказ идёт дальше' },
  { value: 'fork', label: 'Развилка — рассказ делится' },
];

interface StopKindEditorProps {
  gate: Gate;
  config: ChoiceConfig;
  onUpdate: (gate: Gate) => void;
  onSplit?: (() => void) | undefined;
  splitBlockedReason?: string | undefined;
}

function StopKindEditor({ gate, config, onUpdate, onSplit, splitBlockedReason }: StopKindEditorProps): ReactElement {
  const isFork = config.correctId === null;

  return (
    <div className="ed-insp-block" data-testid="stop-kind">
      <ChoiceField
        label="Что это за остановка"
        value={isFork ? 'fork' : 'question'}
        choices={STOP_KIND_CHOICES}
        onCommit={(value) => {
          if (value !== 'question' && value !== 'fork') {
            throw new Error(`Неизвестный тип остановки «${value}»`);
          }
          onUpdate(setFork(gate, value === 'fork'));
        }}
      />

      {isFork && (
        <>
          <p className="ed-insp-hint" data-testid="fork-hint">
            У развилки нет верного ответа: ветки равноправны. Чтобы каждый ответ
            повёл зрителя своей дорогой, разделите повествование здесь — рассказ
            после этой точки станет отдельной частью, а на каждый вариант появится
            своя.
          </p>
          <button
            type="button"
            className="ed-action"
            data-testid="gate-split"
            disabled={splitBlockedReason !== undefined || onSplit === undefined}
            title={splitBlockedReason ?? 'Разделить повествование по этой развилке'}
            onClick={() => onSplit?.()}
          >
            Разделить повествование здесь
          </button>
          {splitBlockedReason !== undefined && (
            <p className="ed-insp-hint" data-testid="split-blocked">{splitBlockedReason}</p>
          )}
        </>
      )}
    </div>
  );
}

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

            {/* У развилки верного ответа нет вовсе — показывать выбор
                «правильного» значило бы вернуть на экран ровно ту ложь,
                которую версия 4 убрала из данных. */}
            {config.correctId !== null && (
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
            )}

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
                  ? 'У остановки с выбором должно остаться не меньше двух вариантов'
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
// Слайд
// ---------------------------------------------------------------------------

/**
 * Слова автора, а не схемы: `morph` и `cut` в интерфейс не течёт.
 * «Плавно» и «резко» — то, как об этом сказал владелец.
 */
const TRANSITION_CHOICES: readonly Choice[] = [
  { value: 'morph', label: 'Плавно — элементы едут' },
  { value: 'cut', label: 'Резко — элементы перепрыгивают' },
];

interface SlideMarkPanelProps {
  slide: Slide;
  onSetTransition: (transition: Slide['transition']) => void;
}

/**
 * Настройка метки-слайда. Время правится перетаскиванием по дорожке —
 * как и у гейта, отдельного поля для него здесь нет.
 *
 * Первого слайда эта панель не видит никогда: меткой на дорожке он не
 * является (`Editor.tsx`, `fromSlides = segment.slides.slice(1)`), потому
 * что стоит на нуле и двигать его нельзя. Поэтому отдельной ветки «у этого
 * слайда перехода нет» здесь НЕТ — она была бы недостижимым кодом. Защита
 * стоит там, где до неё можно дойти: `state/slides.ts`, `setTransition`
 * бросает на первом слайде.
 */
function SlideMarkPanel({ slide, onSetTransition }: SlideMarkPanelProps): ReactElement {
  return (
    <div className="ed-insp-block">
      <ReadonlyField label="Идентификатор" value={slide.id} />
      <ChoiceField
        label="Переход"
        value={slide.transition}
        choices={TRANSITION_CHOICES}
        onCommit={(value) => {
          if (value !== 'morph' && value !== 'cut') {
            throw new Error(`Неизвестный вид перехода «${value}»`);
          }
          onSetTransition(value);
        }}
      />
      <p className="ed-insp-note">
        Плавно — элементы доезжают до этого снимка. Резко — встают в него
        мгновенно, без движения.
      </p>
    </div>
  );
}
