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
import { useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

import { DEFAULT_TRANSITION_DIRECTION, DIRECTED_TRANSITIONS } from '@player/core';
import type { Element, Gate, Slide, TimeRef, TransitionDirection, Word } from '@player/core';

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
import type { OptionDestination } from '../state/conditionText.js';
import { retargetMark, wordAnchorProblem } from '../track/marks.js';
import {
  DIRECTION_INFO, DIRECTION_ORDER, TRANSITION_INFO, TRANSITION_ORDER,
} from '../transitions.js';
import {
  POSITIVE_INTEGER,
  Checkbox,
  ChoiceField,
  MultilineField,
  NumberField,
  RangeField,
  ReadonlyField,
  Radio,
  StringField,
  ValidatedStringField,
  type Choice,
} from '../ui/fields.js';
import { Button } from '../ui/index.js';

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
  /** Приём перехода выделенного слайда (действие `setSlideTransition`). */
  onSetSlideTransition: (transition: Slide['transition']) => void;
  /** Направление перехода (действие `setSlideTransitionDirection`, схема v10). */
  onSetSlideTransitionDirection: (direction: TransitionDirection) => void;
  /**
   * Живое значение продолжительности перехода — каждое движение ползунка,
   * `commit: false` (действие `setSlideTransitionSeconds`). Коммит-точку
   * жеста ставит `onCommitHistory` ниже, тем же способом, что и у остальных
   * полей-жестов панели (`Inspector.tsx`, `TrackView`).
   */
  onSetSlideTransitionSeconds: (transitionSeconds: number) => void;
  /** Завершает жест, открытый `onSetSlideTransitionSeconds` (см. `state/editorHistory.ts`). */
  onCommitHistory: () => void;
  /**
   * Потолок продолжительности перехода — расстояние до ПРЕДЫДУЩЕГО слайда
   * (ADR-020, `packages/player/src/morph.ts`, `morphSecondsFor`). Панель
   * сама его не считает: он зависит от соседних меток на дорожке, которых
   * эта панель не видит. `undefined`, когда выделена не метка-слайд —
   * ровно тот же приём, что и у `gateInsideTransition` выше.
   */
  slideTransitionGapSeconds?: number | undefined;
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
  /**
   * Куда ведёт вариант ответа — готовым ответом на каждый `optionId`.
   *
   * Считается наверху (`Editor.tsx`, `optionDestination`), потому что ответ
   * зависит от ПРОЕКТА целиком: правило выхода вправе смотреть на переменную,
   * записанную гейтом другой главы. Панель проекта не видит и видеть не
   * должна — она чисто презентационная (см. заголовок модуля).
   */
  destinationOf?: ((optionId: string) => OptionDestination) | undefined;
  /**
   * Завести главу под ответ и связать её с ним — одним шагом истории.
   *
   * Действие приезжает готовым сверху (`Editor.tsx`): собрать его здесь
   * панель не может — ей не видно ни проекта, ни истории, и не должно быть
   * видно (см. заголовок модуля).
   */
  onBranchFromOption?: ((optionId: string) => void) | undefined;
}

export function MarkPanel({
  mark,
  elements,
  words,
  onRetargetMark,
  gateInsideTransition = false,
  onUpdateGate,
  onSetSlideTransition,
  onSetSlideTransitionDirection,
  onSetSlideTransitionSeconds,
  onCommitHistory,
  slideTransitionGapSeconds,
  onRenameVariable,
  variableProblemOf,
  onRemove,
  onSplitAtGate,
  splitBlockedReason,
  destinationOf,
  onBranchFromOption,
}: MarkPanelProps): ReactElement {
  const containerRef = useRef<HTMLElement>(null);
  const markId = mark.kind === 'gate' ? mark.gate.id : mark.slide.id;

  /**
   * Задача 6: щелчок по хвосту ведёт к каталогу приёмов.
   *
   * Прокручивает саму панель (она и есть «правая колонка» — `.ed-inspector`
   * скроллится сама, `styles.ts`), а не только реагирует на клик по хвосту:
   * выделение слайда ЛЮБЫМ виджетом дорожки (хвост, ромб) приводит к одному
   * и тому же — каталог должен быть виден, раз слайд выбран.
   *
   * Зависимость — `kind` и `id`, а не `mark` целиком: `mark` меняет ссылку
   * на КАЖДОЕ живое движение ползунка длительности или ручки стыка
   * (`onSetSlideTransitionSeconds`/`onTransitionSecondsLive` дальше по цепочке
   * дают новый `Segment`), а скроллить нужно один раз, при смене ВЫДЕЛЕНИЯ,
   * а не на каждый кадр жеста — иначе прокрутка дёргалась бы под пальцем.
   *
   * `container.scrollTop`, а не `scrollIntoView`: он прокрутил бы и предков,
   * то есть увёл бы всю страницу редактора (тот же довод, что у прокрутки
   * за головкой в `TrackView`, Задача 4). `getBoundingClientRect` для обоих
   * элементов, а не `offsetTop`: `.ed-inspector` не позиционирован, и
   * `offsetTop` мерил бы смещение не от него, а от ближайшего предка,
   * у которого `position` не `static`.
   */
  useLayoutEffect(() => {
    if (mark.kind !== 'slide') return;
    const container = containerRef.current;
    if (!container) return;
    const catalog = container.querySelector<HTMLElement>('.ed-transition-catalog');
    if (!catalog) return;
    const containerRect = container.getBoundingClientRect();
    const catalogRect = catalog.getBoundingClientRect();
    // Уже целиком видно — трогать прокрутку незачем.
    if (catalogRect.top >= containerRect.top && catalogRect.bottom <= containerRect.bottom) return;
    container.scrollTop += catalogRect.top - containerRect.top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark.kind, markId]);

  return (
    <aside className="ed-inspector" data-testid="mark-panel" ref={containerRef}>
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
            destinationOf={destinationOf}
            onBranchFromOption={onBranchFromOption}
          />
        ) : (
          <SlideMarkPanel
            key={mark.slide.id}
            slide={mark.slide}
            gapSeconds={requireGapSeconds(slideTransitionGapSeconds)}
            onSetTransition={onSetSlideTransition}
            onSetTransitionDirection={onSetSlideTransitionDirection}
            onSetTransitionSeconds={onSetSlideTransitionSeconds}
            onCommitHistory={onCommitHistory}
          />
        )}
        <MarkTimeBlock
          at={mark.kind === 'gate' ? mark.gate.at : mark.slide.at}
          words={words}
          onRetarget={onRetargetMark}
        />
        <div className="ed-insp-block">
          <Button data-testid="mark-remove" onClick={onRemove}>
            Удалить метку
          </Button>
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
  /** Куда ведёт вариант ответа — см. `ChoiceOptionsEditorProps`. */
  destinationOf?: ((optionId: string) => OptionDestination) | undefined;
  /** Завести главу под ответ и связать — см. `ChoiceOptionsEditorProps`. */
  onBranchFromOption?: ((optionId: string) => void) | undefined;
}

function GatePanel({
  gate,
  elements,
  onUpdate,
  onRenameVariable,
  variableProblemOf,
  onSplit,
  splitBlockedReason,
  destinationOf,
  onBranchFromOption,
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
        <ChoiceOptionsEditor
          gate={gate}
          config={config}
          elements={elements}
          onUpdate={onUpdate}
          destinationOf={destinationOf}
          onBranchFromOption={onBranchFromOption}
        />
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
            после этой точки станет отдельной главой, а на каждый вариант появится
            своя.
          </p>
          <Button
            data-testid="gate-split"
            disabled={splitBlockedReason !== undefined || onSplit === undefined}
            title={splitBlockedReason ?? 'Разделить повествование по этой развилке'}
            onClick={() => onSplit?.()}
          >
            Разделить повествование здесь
          </Button>
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
  /**
   * Куда ведёт вариант. Считается наверху (`Editor.tsx`) функцией
   * `optionDestination`: ей нужен ПРОЕКТ целиком — правило выхода вправе
   * смотреть на переменную, записанную гейтом другой главы, — а сюда
   * приезжает один гейт.
   *
   * `undefined` — назначение не считали (панель зовут из места, где проекта
   * нет). Тогда строки просто нет: выдумывать за неё нечего.
   */
  destinationOf?: ((optionId: string) => OptionDestination) | undefined;
  /**
   * Завести главу под этот ответ и связать её с ним — одним действием.
   *
   * `undefined` — панель зовут оттуда, где проекта нет, и заводить главу
   * не в чем. Тогда кнопки просто не будет.
   */
  onBranchFromOption?: ((optionId: string) => void) | undefined;
}

/** «Не привязан» — сохраняет вариант системной кнопкой (ADR-011). */
const UNBOUND = '';

function ChoiceOptionsEditor({
  gate, config, elements, onUpdate, destinationOf, onBranchFromOption,
}: ChoiceOptionsEditorProps): ReactElement {
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
        const destination = destinationOf?.(option.id);
        const bindChoices: readonly Choice[] = [
          { value: UNBOUND, label: '— не привязан (системная кнопка) —' },
          ...elements
            .filter((element) => !takenByOthers.has(element.id))
            .map((element) => ({ value: element.id, label: `${element.id} · ${element.type}` })),
        ];

        return (
          <div className="ed-insp-field" key={option.id} data-testid={`gate-option-${index}`}>
            <StringField
              label={`Подпись варианта ${index + 1}`}
              value={option.label}
              onCommit={(value) => onUpdate(setOptionLabel(gate, option.id, value))}
              testId={`gate-option-label-${index}`}
            />

            {/* Куда ведёт ЭТОТ вариант — сразу под его подписью.

                Секция «Правила выхода» остаётся полным видом и никуда
                не девается: там правило заводят и правят. Здесь короткий
                ответ на вопрос, который автор задаёт, глядя на вариант,
                и ради которого сегодня ему пришлось бы держать связь
                двух панелей в голове.

                Устройство при этом не меняется ни на йоту: строка ЧИТАЕТ
                уже принятое решение выхода главы (ADR-015), а не принимает
                своё. Поля для ребра у остановки как не было, так и нет. */}
            {destination ? (
              <p
                className={destination.via === 'none'
                  ? 'ed-option-goto ed-option-goto--none'
                  : 'ed-option-goto'}
                data-testid={`gate-option-goto-${index}`}
                data-via={destination.via}
              >
                {destination.text}
              </p>
            ) : null}

            {/* «Завести ветку» — только у тупика.

                Сегодня, чтобы ответ куда-то вёл, автор идёт в два места:
                «Добавить главу» в правой колонке, потом «Правила выхода»
                там же. Ни одно из двух не подсказано, и связь между ними
                он держит в голове. Кнопка делает оба дела одним шагом
                истории — Ctrl+Z отменяет их вместе, а не половину.

                У варианта, который УЖЕ ведёт в главу, кнопки нет: предложить
                завести вторую на тот же ответ значило бы предложить правило,
                до которого рассказ никогда не дойдёт (правила читаются по
                порядку, второе про тот же ответ мертво). */}
            {destination?.via === 'none' && onBranchFromOption ? (
              <Button
                data-testid={`gate-option-branch-${index}`}
                onClick={() => onBranchFromOption(option.id)}
              >
                Завести ветку под этот ответ
              </Button>
            ) : null}

            {/* У развилки верного ответа нет вовсе — показывать выбор
                «правильного» значило бы вернуть на экран ровно ту ложь,
                которую версия 4 убрала из данных. */}
            {config.correctId !== null && (
              <Radio
                label="Правильный вариант"
                name={`gate-correct-${gate.id}`}
                checked={option.id === config.correctId}
                onSelect={() => onUpdate(setCorrect(gate, option.id))}
                testId={`gate-option-correct-${index}`}
              />
            )}

            <ChoiceField
              label="Элемент сцены, служащий этим вариантом"
              value={boundElementId}
              choices={bindChoices}
              onCommit={(elementId) => {
                if (elementId !== UNBOUND) onUpdate(bindOption(gate, option.id, elementId));
              }}
              testId={`gate-option-bind-${index}`}
            />

            <Button
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
            </Button>
          </div>
        );
      })}
      <Button data-testid="gate-option-add" onClick={() => onUpdate(addOption(gate))}>
        Добавить вариант
      </Button>
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
      <MultilineField
        label="Принимаемые ответы (по одному на строке)"
        value={text}
        onCommit={setDraft}
        onBlurCommit={commit}
        testId="gate-accept"
      />
      <Checkbox
        label="Учитывать регистр"
        checked={config.caseSensitive}
        onChange={(checked) => onUpdate(setCaseSensitive(gate, checked))}
        testId="gate-case-sensitive"
      />
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
      <Checkbox
        label="Без ограничения попыток"
        checked={unlimited}
        onChange={(checked) => onUpdate(setMaxAttempts(gate, checked ? null : 1))}
        testId="gate-unlimited-attempts"
      />
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
 * Метка-слайда без потолка длительности — состояние, которого быть не должно
 * (см. `slideTransitionGapSeconds` в `MarkPanelProps`). Падаем здесь же,
 * а не подставляем 0 или Infinity: молчаливая подстановка нарисовала бы
 * ползунок с ложным потолком, и автор поставил бы значение, которое плеер
 * тут же обрежет по-настоящему.
 */
function requireGapSeconds(value: number | undefined): number {
  if (value === undefined) {
    throw new Error(
      'У метки-слайда обязан быть потолок длительности перехода (расстояние до предыдущего слайда)',
    );
  }
  return value;
}

/** «2,50» вместо «2.50»: тот же формат, что у соседних полей панели (`formatOffset` выше). */
function formatSeconds(seconds: number): string {
  return seconds.toFixed(2).replace('.', ',');
}

/** Приём есть в каталоге ядра — тип получаем из `TRANSITION_INFO`, ключи которого идут от `Slide['transition']`. */
function isTransitionValue(value: string): value is Slide['transition'] {
  return Object.prototype.hasOwnProperty.call(TRANSITION_INFO, value);
}

interface TransitionCatalogProps {
  value: Slide['transition'];
  onSelect: (transition: Slide['transition']) => void;
}

/**
 * Каталог из восьми плиток — замена `ChoiceField` версии 8 (два значения).
 *
 * Слова автора, а не схемы: подписи и подсказки идут из ОДНОЙ таблицы
 * (`transitions.ts`), а не пишутся здесь заново — вторая копия слов
 * разошлась бы с первой молча, ровно как разошлись `SlidePanel.tsx`
 * и `Editor.tsx` до этой сессии.
 *
 * Проверка `isTransitionValue` — прямой потомок прежнего
 * `if (value !== 'morph' && value !== 'cut') throw`: обработчик клика
 * получает `string` (тип плитки — не выразить прямо в JSX-обработчике без
 * промежуточного шага), и narrowing к `Slide['transition']` обязан пройти
 * явную сверку с перечислением ядра, а не приведением типа.
 */
function TransitionCatalog({ value, onSelect }: TransitionCatalogProps): ReactElement {
  const labelId = useId();

  const handleSelect = (candidate: string): void => {
    if (!isTransitionValue(candidate)) {
      throw new Error(`Неизвестный приём перехода «${candidate}»`);
    }
    onSelect(candidate);
  };

  return (
    <div className="ed-insp-field">
      <span className="ed-insp-label" id={labelId}>Переход</span>
      <div className="ed-transition-catalog" role="group" aria-labelledby={labelId}>
        {TRANSITION_ORDER.map((candidate) => {
          const info = TRANSITION_INFO[candidate];
          const selected = candidate === value;
          return (
            <button
              key={candidate}
              type="button"
              className={selected ? 'ed-transition-tile ed-transition-tile-selected' : 'ed-transition-tile'}
              aria-pressed={selected}
              title={info.hint}
              aria-label={`${info.label} — ${info.hint}`}
              data-testid={`transition-${candidate}`}
              // Отдельный крючок для оформления. `data-testid` — договор
              // с тестами, и вешать на него ещё и вид значило бы, что
              // переименование в тесте молча гасит анимацию плитки.
              data-transition={candidate}
              onClick={() => handleSelect(candidate)}
            >
              {info.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DirectionControlProps {
  slide: Slide;
  onSelect: (direction: TransitionDirection) => void;
}

/**
 * Четыре кнопки-стрелки, снятые с натуры Canva (панель перехода, 07.08.2026).
 *
 * Показывается ТОЛЬКО у приёмов, у которых направление есть — тем же списком
 * `DIRECTED_TRANSITIONS`, которым это проверяет схема. Показать их у
 * «Растворения» значило бы дать автору выбор, ни на что не влияющий:
 * ровно тот дефект, из-за которого у первого слайда нет поля перехода
 * (`state/slides.ts`, `setTransition`).
 *
 * Подсветка при `undefined` берётся из `DEFAULT_TRANSITION_DIRECTION` ядра,
 * а не пишется здесь числом: панель обязана подсвечивать то, что нарисуется.
 * Значение в схеме умолчанием НЕ проставляется — отсюда и подсветка
 * вычисляемая, а не прочитанная.
 */
function DirectionControl({ slide, onSelect }: DirectionControlProps): ReactElement | null {
  const labelId = useId();

  if (!(DIRECTED_TRANSITIONS as readonly string[]).includes(slide.transition)) return null;

  const active = slide.transitionDirection ?? DEFAULT_TRANSITION_DIRECTION;
  const what = slide.transition === 'wipe' ? 'штора' : 'сцена';

  return (
    <div className="ed-insp-field">
      <span className="ed-insp-label" id={labelId}>Направление</span>
      <div className="ed-direction-row" role="group" aria-labelledby={labelId}>
        {DIRECTION_ORDER.map((candidate) => {
          const info = DIRECTION_INFO[candidate];
          const selected = candidate === active;
          return (
            <button
              key={candidate}
              type="button"
              className={selected ? 'ed-direction-btn ed-direction-btn-selected' : 'ed-direction-btn'}
              aria-pressed={selected}
              // Стрелка без слова не читается диктором и ничего не говорит
              // о том, ЧТО поедет: у «Шторы» едет плашка, у «Сдвига» — сцена.
              title={`Едет ${what} ${info.label}`}
              aria-label={`Едет ${what} ${info.label}`}
              data-testid={`transition-direction-${candidate}`}
              onClick={() => onSelect(candidate)}
            >
              {info.glyph}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TransitionSecondsControlProps {
  slide: Slide;
  gapSeconds: number;
  onChangeLive: (transitionSeconds: number) => void;
  onCommitHistory: () => void;
}

/**
 * Продолжительность перехода к слайду — или причина, почему её не бывает.
 *
 * `cut` не гасит управление, а не создаёт его вовсе: у среза продолжительности
 * не существует — `morphSecondsFor` возвращает 0 ДО всякой арифметики с
 * длительностью (`packages/player/src/morph.ts:64-74`). Погашенный ползунок
 * обещал бы автору величину, которой в модели нет: тот же принцип, что
 * у направления приёма в `docs/design/screens.md` §4.2 — переключатель
 * без смысла не гаснет, а не создаётся.
 *
 * Потолок — `gapSeconds`, расстояние до ПРЕДЫДУЩЕГО слайда (ADR-020: окно
 * перехода кончается НА метке, значит удлинение уводит начало назад, в кадр,
 * которого зритель ещё не видел). Плеер уже режет длительность этим потолком
 * (`Math.min(transitionSeconds, gap)`); не показать его здесь значило бы дать
 * автору поставить 3 с и увидеть на экране 1.4 без единой подсказки почему.
 *
 * Записанное значение может превышать потолок — так приходит из файла,
 * ползунок сам такое создать не может (`max` ползунка — сам потолок). Тогда
 * он встаёт НА потолок, а подпись называет ОБА числа: молча показать одно
 * вместо другого значило бы скрыть от автора расхождение между тем, что
 * сохранено, и тем, что реально играется.
 */
function TransitionSecondsControl({
  slide,
  gapSeconds,
  onChangeLive,
  onCommitHistory,
}: TransitionSecondsControlProps): ReactElement {
  if (slide.transition === 'cut') {
    return (
      <p className="ed-insp-note" data-testid="transition-seconds-none">
        У среза нет продолжительности: он происходит мгновенно, ползунок здесь был бы обещанием того, чего не бывает.
      </p>
    );
  }

  const recorded = slide.transitionSeconds;
  const played = Math.max(0, Math.min(recorded, gapSeconds));
  const exceedsGap = recorded > gapSeconds;

  return (
    <div data-testid="transition-seconds">
      <RangeField
        label="Продолжительность перехода, с"
        value={played}
        min={0}
        max={gapSeconds}
        step={0.05}
        onCommit={onChangeLive}
        onCommitEnd={onCommitHistory}
      />
      {exceedsGap ? (
        <p className="ed-insp-note" data-testid="transition-seconds-clamped">
          Записано {formatSeconds(recorded)} с, но реально играется {formatSeconds(played)} с — дальше
          мешает предыдущий слайд, потолок сейчас {formatSeconds(gapSeconds)} с.
        </p>
      ) : played === 0 ? (
        <p className="ed-insp-note" data-testid="transition-seconds-zero">
          Продолжительность равна нулю: переход не играется, слайд сменяется как срез.
        </p>
      ) : (
        <p className="ed-insp-note" data-testid="transition-seconds-caption">
          {formatSeconds(played)} с из потолка {formatSeconds(gapSeconds)} с — это расстояние до предыдущего слайда.
        </p>
      )}
    </div>
  );
}

interface SlideMarkPanelProps {
  slide: Slide;
  /** Потолок длительности — см. `TransitionSecondsControl`. Всегда определён: первый слайд сюда не попадает. */
  gapSeconds: number;
  onSetTransition: (transition: Slide['transition']) => void;
  onSetTransitionDirection: (direction: TransitionDirection) => void;
  onSetTransitionSeconds: (transitionSeconds: number) => void;
  onCommitHistory: () => void;
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
 * и `setTransitionSeconds` бросают на первом слайде.
 */
function SlideMarkPanel({
  slide,
  gapSeconds,
  onSetTransition,
  onSetTransitionDirection,
  onSetTransitionSeconds,
  onCommitHistory,
}: SlideMarkPanelProps): ReactElement {
  return (
    <div className="ed-insp-block">
      <ReadonlyField label="Идентификатор" value={slide.id} />
      <TransitionCatalog value={slide.transition} onSelect={onSetTransition} />
      <DirectionControl slide={slide} onSelect={onSetTransitionDirection} />
      <TransitionSecondsControl
        slide={slide}
        gapSeconds={gapSeconds}
        onChangeLive={onSetTransitionSeconds}
        onCommitHistory={onCommitHistory}
      />
    </div>
  );
}
