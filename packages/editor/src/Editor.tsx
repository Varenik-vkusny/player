/**
 * Корень редактора: раскладка и состояние.
 *
 * Держит редактируемый проект (обёрнутый историей отмены/повтора,
 * `state/editorHistory.ts`) и выделение. Всё остальное — производное:
 * момент на дорожке приходит от транспорта, геометрия элементов — от
 * состояния текущего слайда, картинка — от предпросмотра из плеера.
 *
 * Компоненты ниже — только вид. Логика живёт в модулях, которые про React
 * не знают: state/project (редьюсер), state/editorHistory (отмена/повтор),
 * state/slides (слайды), state/exits (сегменты и выход), state/gates
 * (правила панели метки), keyboard (раскладка клавиатуры), stage/geometry
 * и stage/transform (координаты и жесты), track/transport (звук), track/peaks
 * (волна). Каждый из них покрыт юнитами. Переписать интерфейс — значит
 * заменить компоненты и styles.ts, не трогая ни одной проверенной строчки.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import type {
  Condition, Element, ElementState, Gate, Project, Slide, Style, Theme, TimeRef,
  TransitionDirection, Word,
} from '@player/core';
import { findSegment } from '@player/core';
import { morphSecondsFor, segmentOf, type ScenePreview } from '@player/player';

import { keyToIntent, type KeyContext, type KeyIntent } from './keyboard.js';
import { CATALOG_CATEGORIES, type PanelId } from './chrome/catalog.js';
import { CatalogPanel } from './chrome/CatalogPanel.js';
import { CatalogRail } from './chrome/CatalogRail.js';
import {
  CATALOG_WIDTH_MAX,
  CATALOG_WIDTH_MIN,
  readChromeLayout,
  SIDE_SPINE_WIDTH_PX,
  SIDE_WIDTH_MAX,
  SIDE_WIDTH_MIN,
  writeChromeLayout,
  type ChromeLayout,
} from './chrome/layoutStore.js';
import { Splitter } from './chrome/Splitter.js';
import { Button, ChoiceField, Icon, IconButton } from './ui/index.js';
import { ElementList } from './panels/ElementList.js';
import { toRows } from './panels/elementRows.js';
import { SegmentPanel } from './panels/SegmentPanel.js';
import { Inspector } from './panels/Inspector.js';
import { InsertPanel } from './panels/InsertPanel.js';
import { TextStylesPanel } from './panels/TextStylesPanel.js';
import { MarkPanel, type SelectedMarkData } from './panels/MarkPanel.js';
import { formatRemovalMessage, statesOnSlides } from './panels/removalMessage.js';
import { SlidePanel } from './panels/SlidePanel.js';
import { StylesPanel } from './panels/StylesPanel.js';
import { TemplatesPanel } from './panels/TemplatesPanel.js';
import { ThemePanel } from './panels/ThemePanel.js';
import { ContextMenu, type MenuItem } from './stage/ContextMenu.js';
import { PropBar } from './stage/PropBar.js';
import { LAYER_BUTTONS } from './stage/organs.js';
import { type Box, childBoxInGroup, childBoxInScene } from './stage/geometry.js';
import {
  align,
  distribute,
  restack,
  type AlignKind,
  type DistributeAxis,
  type LayerMove,
  type Placed,
} from './state/arrange.js';
import { canRedoState, canUndoState, historyReducer, initialHistoryState } from './state/editorHistory.js';
import { createElement } from './state/elements.js';
import { answerVariables, variableRenameProblem } from './state/exits.js';
import { branchTree } from './state/branchTree.js';
import { durationRange } from './state/durationRange.js';
import { extractBlockedReason } from './state/extractBranch.js';
import { createGate, gateInsideTransition } from './state/gates.js';
import { activeGroupOf, type GroupChildBox, reflowGroup } from './state/groupElements.js';
import { optionDestination } from './state/conditionText.js';
import { speechLossWarning, splitAtTimeNotice, splitBlockedReason } from './state/split.js';
import { createImageElement, encodeImageFile } from './state/image.js';
import { libraryItem } from './state/library.js';
import { freeId, pasteProblemAt, segmentSlide, soleSelectedId, splitHereProblem, type MarkKind } from './state/project.js';
import { colorOrphans } from './state/colorOrphans.js';
import { paletteById } from './state/palettes.js';
import { propbarStyleFields } from './state/propbar.js';
import { cutProblem as slideCutProblem, slideAt as slideAtSeconds, slideOnMark } from './state/slides.js';
import {
  commonStyleValue,
  setStyleValue,
  styleFieldsFor,
  type ElementStyle,
  type LengthOrPercent,
  type StyleFieldKey,
} from './state/style.js';
import { sceneTemplate } from './state/templates.js';
import { THEME_ROLES } from './theme.js';
import { TRANSITION_INFO } from './transitions.js';
import { downloadProject, openInPlayer, openProjectFile } from './state/save.js';
import { createBranchesHost, type BranchesHost } from './state/secondWindow.js';
import { saveWork } from './state/workspace.js';
import { importPptxFile, PPTX_ACCEPT } from './import/openPptx.js';
import { wordMarkCount } from './state/audio.js';
import { StageView, type StageViewHandle } from './stage/StageView.js';
import { AudioSourceBody, AudioSourceHead, useAudioSource } from './track/AudioSourcePanel.js';
import { gateName, secondsText } from './timeText.js';
import { anchorStateOf, markSeconds, timeRefAt } from './track/marks.js';
import type { SpanRange } from './track/spans.js';
import type { Mark } from './track/MarksLane.js';
import { BranchesView } from './track/BranchesView.js';
import { SlideStripCards, SlideStripHead, SlideStripNote } from './track/SlideStrip.js';
import { TrackView } from './track/TrackView.js';
import { useTransport } from './track/useTransport.js';

export interface EditorProps {
  project: Project;
  /** Сообщает хосту, что сцена построена. Вызывается с null при снятии. */
  onReady?: (preview: ScenePreview | null) => void;
  /**
   * Принадлежит ли слот работы этой вкладке.
   *
   * `false` — слот держит другая вкладка, и здесь можно только смотреть.
   * Писать в занятый слот значило бы затирать работу первой вкладки без
   * единого признака, что что-то исчезло. Умолчание `true`: хост, который
   * про слот не знает вовсе (тесты, встраивание), ведёт себя как раньше.
   */
  canWrite?: boolean;
  /** Откуда пришла работа: имя фикстуры или имя открытого файла. */
  origin?: string;
}

/**
 * Пауза между последней правкой и записью в слот.
 *
 * Пауза, а не запись на каждое действие: перетаскивание элемента даёт десятки
 * правок в секунду, и каждая из них прогоняла бы проект через полную
 * валидацию (`serializeProject`). Полсекунды автор не замечает, а руку с мыши
 * он к этому моменту уже снял.
 */
const AUTOSAVE_PAUSE_MS = 500;

/**
 * `INPUT`/`TEXTAREA`/`SELECT` — поля, в которых клавиши принадлежат вводу,
 * а не командам редактора (в том числе стрелки внутри `<select>`).
 *
 * Параметр типизирован через `globalThis.Element`, а не голым `Element`:
 * это имя в файле уже занято типом элемента сцены из `@player/core`.
 */
function isTextFieldNode(node: globalThis.Element | null): boolean {
  if (!node) return false;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
}

/**
 * Формат «в руке» — что «Копировать форматирование» (`PropBar.tsx`,
 * data-testid `copy-format`) сняло с исходного элемента и ждёт второго
 * щелчка (`docs/design/styles.md` §5, натура снята в Canva 14.08.2026).
 *
 * `elementType` проверяется ПЕРЕД применением: формат текста на фигуру
 * не переносится, схема отвергла бы стиль чужого типа (ProjectSchema.
 * superRefine, «Наборы свойств не пересекаются»).
 *
 * `kind: 'style'` — источник сам стоял на стиле: приёмник получает ТОТ ЖЕ
 * `styleId`, то есть попадает в ту же живую связь — ровно то же действие,
 * что «Применить» в StylesPanel.
 *
 * `kind: 'values'` — источник свободен от стиля: копируются СЫРЫЕ значения
 * полей `styleFieldsFor(type)`, какими они лежат в его карте `style` —
 * без повторного разбора через `setStyleValue`, потому что это уже
 * провалидированные значения (в том числе ссылки на роль темы,
 * `var(--x, y)`), а строгий разбор `setStyleValue` такую ссылку отверг бы
 * как значение не того формата для поля.
 */
type CopyFormat =
  | { readonly kind: 'style'; readonly sourceId: string; readonly elementType: Element['type']; readonly styleId: string }
  | { readonly kind: 'values'; readonly sourceId: string; readonly elementType: Element['type']; readonly props: ElementStyle };

export function Editor({
  project,
  onReady,
  canWrite = true,
  origin = 'без имени',
}: EditorProps): ReactElement {
  const [state, dispatch] = useReducer(historyReducer, project, initialHistoryState);
  const currentProject = state.history.present;

  /**
   * Что пошло не так со слотом работы: не удалось записать или не удалось
   * открыть файл. Видно автору полосой, а не только в консоли — иначе он
   * узнает о потере работы завтра, когда вкладку уже не вернуть.
   */
  const [workError, setWorkError] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);

  /** Какая панель каталога открыта на рельсе слева (chrome/catalog.ts). */
  const [panelId, setPanelId] = useState<PanelId>('templates');
  // `undefined` только для 'object' — единственного PanelId шире CategoryId,
  // у которого на рельсе нет ни кнопки, ни записи в каталоге.
  const currentCatalogCategory = CATALOG_CATEGORIES.find((category) => category.id === panelId);

  /**
   * Свёрнутость и ширины панели каталога и правой колонки (Сессия 30,
   * задача владельца «сворачивать/сжимать контролеры»). Настройка вида,
   * не данные проекта — читается один раз при монтировании из
   * `localStorage` (`chrome/layoutStore.ts` сам проверяет форму значения
   * и откатывает порченное на умолчание), пишется на КАЖДОЕ изменение
   * эффектом ниже.
   */
  const [chromeLayout, setChromeLayout] = useState<ChromeLayout>(() => readChromeLayout());

  useEffect(() => {
    writeChromeLayout(chromeLayout);
  }, [chromeLayout]);

  /**
   * Выбор категории на рельсе. Рельс — единственная дорога назад для
   * свёрнутого каталога (задание Сессии 30): у самого каталога, в отличие
   * от правой колонки, нет своего корешка, потому что рельс уже играет
   * эту роль и никогда не сворачивается.
   */
  /**
   * Что набрано в поиске каталога.
   *
   * Живёт в состоянии вида, а не проекта: это не свойство объяснения,
   * а положение органа. Сбрасывается при смене категории — искать
   * «заголовок» среди фигур бессмысленно, и оставленный от прошлой
   * категории запрос показал бы пустую панель без видимой причины.
   */
  const [catalogQuery, setCatalogQuery] = useState('');

  const handleSelectCategory = useCallback((id: PanelId) => {
    setPanelId(id);
    setCatalogQuery('');
    setChromeLayout((previous) => (previous.catalogCollapsed ? { ...previous, catalogCollapsed: false } : previous));
  }, []);

  const handleToggleCatalogCollapsed = useCallback(() => {
    setChromeLayout((previous) => ({ ...previous, catalogCollapsed: !previous.catalogCollapsed }));
  }, []);

  const handleToggleSideCollapsed = useCallback(() => {
    setChromeLayout((previous) => ({ ...previous, sideCollapsed: !previous.sideCollapsed }));
  }, []);

  const handleCatalogWidthChange = useCallback((width: number) => {
    setChromeLayout((previous) => ({ ...previous, catalogWidth: width }));
  }, []);

  const handleSideWidthChange = useCallback((width: number) => {
    setChromeLayout((previous) => ({ ...previous, sideWidth: width }));
  }, []);

  // Мост к правке текста на холсте (см. StageView.beginTextEdit): Escape
  // в контексте editingText даёт намерение commitText (keyboard.ts), а
  // закрывать правку умеет только StageView — он один держит ссылку на
  // редактируемый DOM-узел. Клик мимо и потеря фокуса StageView коммитит
  // сам, без участия Editor.tsx; этот мост нужен ровно для Escape.
  const stageRef = useRef<StageViewHandle>(null);

  // Сегмент, который сейчас правит автор, — настоящий объект хребта, а не
  // видовое представление segmentOf: он нужен там, где правка обращается
  // к сегменту напрямую (вставка элемента, добавление слайда). findSegment —
  // узкая дверца ядра для чтения сегмента по id (та же, которой пользуется
  // segmentOf и nextSegment), а не второй самодельный обход project.segments.
  const currentSegment = useMemo(
    () => findSegment(currentProject, state.currentSegmentId),
    [currentProject, state.currentSegmentId],
  );

  // Слайд, который автор сейчас правит. Узкая дверца — segmentSlide
  // (state/project.ts): она уже проверяет, что слайд существует.
  const currentSlide = useMemo(
    () => segmentSlide(currentProject, state.currentSegmentId, state.currentSlideId),
    [currentProject, state.currentSegmentId, state.currentSlideId],
  );

  // Единственная точка, через которую редактор видит дорожку и элементы —
  // видовое представление плеера. Когда проект стал графом сегментов,
  // поменялась segmentOf, а не это место и не всё, что ниже.
  const segment = useMemo(
    () => segmentOf(currentProject, state.currentSegmentId),
    [currentProject, state.currentSegmentId],
  );

  /**
   * Секунды гейтов текущего сегмента — предпросмотр обязан на них встать.
   *
   * Без этого дорожка редактора проезжала гейт молча: на линейке стоял
   * квадратик, автор жал «играть», звук шёл дальше, и редактор показывал
   * поведение, которого у зрителя не будет. Инвариант №4 — про плеер, но
   * автор судит о своей работе по редактору.
   *
   * Считается тем же `markSeconds`, что и метки на дорожке (см. `marks`
   * ниже): два разных способа разрешить один TimeRef разошлись бы, и
   * остановка случилась бы не там, где нарисован квадратик.
   */
  const gateSeconds = useMemo(
    () => segment.gates.map((gate) => markSeconds(gate.at, segment.words)),
    [segment],
  );

  const transport = useTransport(segment.source, segment.duration, gateSeconds, segment.offset);

  // Ровно одно, а не «первое из списка»: показать свойства первого при трёх
  // выделенных значит соврать автору о том, что он сейчас правит.
  const soleId = soleSelectedId(state.selectedIds);
  const selected =
    soleId === undefined ? undefined : segment.elements.find((element) => element.id === soleId);

  /**
   * Состояние выделенного элемента на ТЕКУЩЕМ слайде.
   *
   * undefined — законный случай, а не рассинхрон: список элементов
   * (ElementList) специально показывает элементы, ещё не появившиеся
   * на этом слайде, и автор вправе выделить такой элемент — просто
   * геометрию и вид у него на этом слайде взять неоткуда.
   */
  const selectedState = selected === undefined ? undefined : currentSlide.states[selected.id];

  /**
   * Показания выделения. С 19.08.2026 живут в полосе свойств, а не в правом
   * верхнем углу шапки (см. комментарий на месте выноса).
   *
   * Размер и поворот из строки УБРАНЫ. Не ради краткости: они напечатаны
   * тут же рядом полями самой полосы и панели «Объект», а строка при этом
   * съедала около 220 px у полосы, которой места не хватает и без неё
   * (замер Сессии 48: полям нужно 673 при доступных 586). Положение
   * оставлено — его полоса полями не показывает.
   */
  const selectionReadout =
    selected === undefined
      ? 'ничего не выделено'
      : selectedState === undefined
        ? `${selected.id}: нет на этом слайде`
        : `${selected.id}: ${selectedState.x} × ${selectedState.y}`;

  // Выделение метки на дорожке — состояние вида, а не проекта: в файл оно
  // не попадает и переписку интерфейса переживать не обязано (как и раньше).
  // Выделение элемента и выделение метки исключают друг друга: панель справа
  // показывает ровно одно из двух, и клавиатурные команды (Delete, стрелки)
  // обязаны однозначно понимать, что выделено.
  const [selectedMark, setSelectedMark] = useState<{ kind: MarkKind; id: string } | undefined>(
    undefined,
  );

  /** Формат «в руке» (см. комментарий типа `CopyFormat` выше). */
  const [copyFormat, setCopyFormat] = useState<CopyFormat | undefined>(undefined);

  const markData: SelectedMarkData | undefined = useMemo(() => {
    if (!selectedMark) return undefined;
    if (selectedMark.kind === 'gate') {
      const gate = segment.gates.find((candidate) => candidate.id === selectedMark.id);
      return gate ? { kind: 'gate', gate } : undefined;
    }
    const slide = segment.slides.find((candidate) => candidate.id === selectedMark.id);
    return slide ? { kind: 'slide', slide } : undefined;
  }, [selectedMark, segment.gates, segment.slides]);

  // Метка могла исчезнуть не только через кнопку удаления, но и через Ctrl+Z
  // (отмена её добавления) — тот же случай, что и «выделенного элемента нет
  // в восстановленном проекте» для state.selectedIds, только selectedMark
  // здесь не часть history и сама себя не проверяет.
  useEffect(() => {
    if (selectedMark && !markData) setSelectedMark(undefined);
  }, [selectedMark, markData]);

  /**
   * `additive` — автор держал Shift: добавить к выделению, а не заменить его.
   *
   * Признак приходит СНАРУЖИ, от того, кто видел событие мыши или клавиатуры,
   * а не считывается здесь из какого-нибудь общего состояния клавиш: такое
   * состояние обязательно разъедется с действительностью, стоит окну потерять
   * фокус с зажатым Shift.
   */
  const handleSelect = useCallback((id: string | undefined, additive = false) => {
    // Выделение элемента и метки взаимоисключающи (см. комментарий выше).
    setSelectedMark(undefined);
    dispatch({ type: 'select', id, mode: additive ? 'toggle' : 'replace' });
  }, []);

  /** Итог обведения резиновой рамкой — один шаг истории на весь улов. */
  const handleSelectMany = useCallback((ids: readonly string[], additive: boolean) => {
    setSelectedMark(undefined);
    dispatch({ type: 'selectMany', ids, mode: additive ? 'add' : 'replace' });
  }, []);

  /**
   * Нажатие по метке на дорожке ведёт туда головку.
   *
   * Та же связка, что и у ленты слайдов (§2г [Р]): головка — единственный
   * указатель «где я». Без неё автор жмёт по ромбу слайда, чтобы его
   * поправить, головка остаётся где стояла, и правка уходит в другой слайд.
   *
   * Работает и для остановок: нажав по гейту, автор хочет увидеть кадр,
   * в котором зритель получит вопрос, — а не тот, где головка застряла.
   *
   * Секунды берутся из уже посчитанного списка меток, а не разрешаются
   * заново: два способа разрешить один TimeRef разошлись бы, и головка
   * встала бы не на ту метку, по которой нажали.
   */
  const marksRef = useRef<readonly Mark[]>([]);
  const handleSelectMark = useCallback((kind: MarkKind, id: string) => {
    setSelectedMark({ kind, id });
    dispatch({ type: 'select', id: undefined });
    const mark = marksRef.current.find((candidate) => candidate.kind === kind && candidate.id === id);
    if (mark) transport.seek(mark.seconds);
  }, [transport]);

  const handleRemoveMark = useCallback(() => {
    if (!selectedMark) return;
    // Гейт снимается действием removeMark, слайд — своим отдельным
    // removeSlide (у него своя проверка «нельзя остаться без слайдов»
    // и «нельзя убрать первый слайд») — то же разделение, что и в редьюсере.
    if (selectedMark.kind === 'gate') {
      dispatch({ type: 'removeMark', kind: 'gate', id: selectedMark.id });
    } else {
      dispatch({ type: 'removeSlide', slideId: selectedMark.id });
    }
    setSelectedMark(undefined);
  }, [selectedMark]);

  const handleUpdateGate = useCallback((gate: Gate) => dispatch({ type: 'updateGate', gate }), []);

  const handleRenameVariable = useCallback(
    (name: string) => {
      if (!selectedMark || selectedMark.kind !== 'gate') return;
      dispatch({ type: 'renameVariable', gateId: selectedMark.id, name });
    },
    [selectedMark],
  );

  // Причину отказа считает тот же модуль, что и сама правка (state/exits.ts),
  // — иначе поле показывало бы «всё хорошо» там, где запись отвергается.
  const variableProblemOf = useCallback(
    (name: string): string | undefined => {
      if (!selectedMark || selectedMark.kind !== 'gate') return undefined;
      return variableRenameProblem(currentProject, selectedMark.id, name);
    },
    [selectedMark, currentProject],
  );

  // Перепривязка — тот же `moveMark`, что и перетаскивание: метка меняет
  // способ ссылки на время, а не сущность. Отдельного действия не нужно.
  const handleRetargetMark = useCallback(
    (at: TimeRef) => {
      if (!selectedMark) return;
      dispatch({ type: 'moveMark', kind: selectedMark.kind, id: selectedMark.id, at });
    },
    [selectedMark],
  );

  const handleSetSlideTransition = useCallback(
    (transition: Slide['transition']) => {
      if (!selectedMark || selectedMark.kind !== 'slide') return;
      dispatch({ type: 'setSlideTransition', slideId: selectedMark.id, transition });
    },
    [selectedMark],
  );

  const handleSetSlideTransitionDirection = useCallback(
    (direction: TransitionDirection) => {
      if (!selectedMark || selectedMark.kind !== 'slide') return;
      dispatch({ type: 'setSlideTransitionDirection', slideId: selectedMark.id, direction });
    },
    [selectedMark],
  );

  /**
   * Живое событие ползунка продолжительности (`MarkPanel.tsx`, `RangeField`).
   * `commit: false` — тот же приём, что и у `handleElementStateChangeLive`
   * ниже: коммит-точку жеста ставит `handleCommitHistory` на `pointerup`.
   */
  const handleSetSlideTransitionSecondsLive = useCallback(
    (transitionSeconds: number) => {
      if (!selectedMark || selectedMark.kind !== 'slide') return;
      dispatch({
        type: 'setSlideTransitionSeconds',
        slideId: selectedMark.id,
        transitionSeconds,
        commit: false,
      });
    },
    [selectedMark],
  );

  /**
   * Предупреждение ADR-022: развилка режется без расшифровки, а у части
   * есть текст озвучки — продолжение родится без него (см. `speechLossWarning`,
   * `state/split.ts`). Состояние вида, как `removalMessage`/`imageDropError`
   * ниже: считается ДО разреза, потому что после него исходного сегмента уже
   * нет и считать не по чему.
   */
  const [speechSplitWarning, setSpeechSplitWarning] = useState<string | undefined>(undefined);

  const handleSplitAtGate = useCallback(
    (gateId: string) => {
      const gate = currentSegment.gates.find((candidate) => candidate.id === gateId);
      setSpeechSplitWarning(gate ? speechLossWarning(currentSegment, gate) : undefined);
      dispatch({ type: 'splitAtGate', gateId });
    },
    [currentSegment],
  );

  // Кого автор изображает, открывая предпросмотр: переменная → id варианта.
  // Пустая строка значит «не отвечал», и это состояние по умолчанию —
  // настоящий зритель приходит без ответов.
  const [viewAs, setViewAs] = useState<Record<string, string>>({});
  const viewAsVariables = useMemo(
    () => answerVariables(currentProject).filter((variable) => variable.options.length > 0),
    [currentProject],
  );

  /**
   * Адрес предпросмотра с изображаемыми ответами.
   *
   * `correct` считается ЗДЕСЬ, а не в плеере: правильность — свойство ответа
   * в момент, когда он дан, и плееру неоткуда взять её для ответа, которого
   * зритель не давал. У развилки `correctId` равен null, и тогда неверных
   * ответов нет вовсе.
   */
  const previewUrl = useMemo(() => {
    const answers: Record<string, { value: string; correct: boolean }> = {};
    for (const variable of viewAsVariables) {
      const chosen = viewAs[variable.name];
      if (chosen === undefined || chosen === '') continue;
      answers[variable.name] = {
        value: chosen,
        correct: variable.correctId === null ? true : variable.correctId === chosen,
      };
    }
    if (Object.keys(answers).length === 0) return '/?from=editor';
    // Стартуем с ТЕКУЩЕЙ части автора, а не с начала объяснения. Иначе плеер
    // переспросит ту же переменную и затрёт заданный ответ своим — режим
    // не сработал бы ровно там, ради чего заведён.
    return `/?from=editor&at=${encodeURIComponent(state.currentSegmentId)}`
      + `&as=${encodeURIComponent(JSON.stringify(answers))}`;
  }, [viewAs, viewAsVariables, state.currentSegmentId]);

  const handleAddSegment = useCallback(() => dispatch({ type: 'addSegment' }), []);
  const handleRemoveSegment = useCallback((id: string) => dispatch({ type: 'removeSegment', id }), []);
  const handleDuplicateSegment = useCallback(
    (id: string) => dispatch({ type: 'duplicateSegment', segmentId: id }),
    [],
  );
  const handleConnect = useCallback(
    (when: readonly Condition[], goto: string) => dispatch({ type: 'connect', when, goto }),
    [],
  );
  const handleDisconnect = useCallback((ruleId: string) => dispatch({ type: 'disconnect', ruleId }), []);
  const handleAddCondition = useCallback(
    (ruleId: string, condition: Condition) => dispatch({ type: 'addCondition', ruleId, condition }),
    [],
  );
  const handleRemoveCondition = useCallback(
    (ruleId: string, index: number) => dispatch({ type: 'removeCondition', ruleId, index }),
    [],
  );

  const handleSelectSegment = useCallback((id: string) => {
    // Выделенная метка принадлежала дорожке прежнего сегмента — тот же
    // довод, что и в handleSelect для выделения элемента.
    setSelectedMark(undefined);
    dispatch({ type: 'selectSegment', id });
  }, []);

  /**
   * Выбор слайда в ленте ВЕДЁТ головку на его метку.
   *
   * Решение владельца 31.07.2026: головка — единственный указатель «где я».
   * Без связки автор выбирает слайд 2, двигает элемент, и правка рождает
   * слайд там, где осталась головка, — то есть выбор молча теряется.
   * Заодно сходятся обе сцены: «правлю» показывает выбранный слайд,
   * «смотрю» идёт за головкой, и оба показывают один момент.
   */
  const handleSelectSlide = useCallback((id: string) => {
    dispatch({ type: 'selectSlide', id });
    const slide = currentSegment.slides.find((candidate) => candidate.id === id);
    if (slide) transport.seek(markSeconds(slide.at, segment.words));
  }, [currentSegment.slides, segment.words, transport]);

  /**
   * ...и ОБРАТНО: головка ведёт выбранный слайд.
   *
   * Без этой половины связка односторонняя, и получается хуже, чем было:
   * правка уходит в слайд под головкой (§14.9), а показывается автору слайд
   * под выделением. Автор правит не то, что видит. Замерено на `demo.json`:
   * головка на 46.8 с — сцена «правлю» показывала один элемент из семи,
   * сцена «смотрю» все семь.
   *
   * Сравнение идёт с РЕФОМ, а не с `currentSlideId` в зависимостях: иначе
   * нажатие в ленте слайдов запускало бы эффект с ещё не доехавшей позицией
   * и тут же перевыбирало бы слайд под старой головкой.
   *
   * Стоящая НА метке головка попадает в её слайд через `slideOnMark`
   * с допуском: `transport.seek` возвращает позицию через часы, и требовать
   * от неё побитового равенства — значит поставить выбор слайда в
   * зависимость от последнего бита мантиссы.
   */
  const headSlideRef = useRef<string | null>(null);
  useEffect(() => {
    const words = segment.words;
    const head = transport.positionSeconds;
    const slide = slideOnMark(currentSegment, head, words)
      ?? slideAtSeconds(currentSegment, head, words);
    if (headSlideRef.current === slide.id) return;
    headSlideRef.current = slide.id;
    dispatch({ type: 'selectSlide', id: slide.id });
  }, [transport.positionSeconds, currentSegment, segment.words]);

  const handleRemoveSlide = useCallback((slideId: string) => dispatch({ type: 'removeSlide', slideId }), []);

  /**
   * Буфер обмена слайдов (ADR-025) — кнопки ленты (`SlideStrip`, §14.13).
   * Цель всех четырёх — `state.currentSlideId`. Момент вставки (для
   * pasteSlide/duplicateSlide) — головка дорожки; сами обработчики заведены
   * НИЖЕ, сразу после headTimeRef (используют её, второго timeRefAt не
   * заводят).
   */
  const handleCopySlide = useCallback(
    () => dispatch({ type: 'copySlide', slideId: state.currentSlideId }),
    [state.currentSlideId],
  );
  const handleCutSlide = useCallback(
    () => dispatch({ type: 'cutSlide', slideId: state.currentSlideId }),
    [state.currentSlideId],
  );

  /**
   * Добавляет слайд после текущего выделенного — копией его состояний
   * (это уже делает `slidesApi.addSlide`, здесь только вычисляется момент
   * вставки). Момент — середина между текущим слайдом и следующим, либо,
   * если текущий последний, середина оставшегося хвоста дорожки: оба случая
   * гарантированно проходят проверку `addSlide` («позже предыдущего, раньше
   * следующего»), не полагаясь на положение головки плеера.
   */
  const handleAddSlide = useCallback(() => {
    const slides = currentSegment.slides;
    const index = slides.findIndex((slide) => slide.id === state.currentSlideId);
    const anchor = slides[index]!;
    const next = slides[index + 1];
    const words = segment.words;
    const anchorSeconds = markSeconds(anchor.at, words);
    const target = next
      ? (anchorSeconds + markSeconds(next.at, words)) / 2
      : anchorSeconds + Math.max(0.1, (segment.duration - anchorSeconds) / 2);
    dispatch({ type: 'addSlide', afterSlideId: anchor.id, at: timeRefAt(words, target) });
  }, [currentSegment.slides, state.currentSlideId, segment.words, segment.duration]);

  /**
   * Одношаговая правка содержимого элемента (текст, путь к картинке) —
   * самостоятельный шаг истории. Геометрия и вид сюда не входят: они живут
   * в состоянии слайда и правятся через setElementState (см. ниже).
   */
  const handleElementContentChange = useCallback((element: Element) => {
    dispatch({ type: 'replaceElement', element });
  }, []);

  /**
   * Куда смотрит головка — в виде ссылки на время (инвариант №10).
   *
   * Правка сцены ложится в слайд под этой меткой, а если метки там нет,
   * слайд рождается (§14.9). `timeRefAt` возвращает ссылку, разрешающуюся
   * ровно в ту же секунду: привязка к слову хранит смещение от начала
   * слова, а не само начало, — поэтому метка встаёт ТОЧНО на головку,
   * и вторая правка попадает в уже рождённый слайд, а не рядом с ним.
   */
  const headTimeRef = useCallback(
    (): TimeRef => timeRefAt(segment.words, transport.positionSeconds),
    [segment.words, transport.positionSeconds],
  );

  const handlePasteSlide = useCallback(
    () => dispatch({ type: 'pasteSlide', at: headTimeRef() }),
    [headTimeRef],
  );
  const handleDuplicateSlide = useCallback(
    () => dispatch({ type: 'duplicateSlide', slideId: state.currentSlideId, at: headTimeRef() }),
    [state.currentSlideId, headTimeRef],
  );

  /**
   * Почему в место под головкой нельзя положить слайд (ADR-025). Про ВРЕМЯ
   * и только про время — см. комментарий `pasteProblem` в state/slides.ts.
   *
   * Считается ОДИН раз на обе кнопки: и вставка, и дублирование метят в одну
   * секунду, поэтому причина отказа по месту у них общая. Дверца
   * `pasteProblemAt` нужна потому, что `pasteProblem` ждёт МОДЕЛЬ сегмента,
   * а `segment` выше — вид плеера (`segmentOf`), у которого поля называются
   * иначе; состав аргументов дверцы фиксирован намеренно, см. её комментарий.
   */
  const slideSpotProblem = pasteProblemAt(currentProject, state.currentSegmentId, headTimeRef());

  /**
   * Почему «Вставить» недоступна: к месту добавляется пустой буфер.
   *
   * У «Дублировать» этой причины НЕТ и быть не может: `duplicateSlideAt`
   * работает через свой временный буфер и авторского не читает. Сведи их
   * в один сигнал — и автор не смог бы размножить кадр, пока чего-нибудь
   * не скопирует, а логика редьюсера была бы при этом исправна.
   */
  const slidePasteProblem = state.slideClipboard === undefined
    ? 'Буфер пуст: скопируйте или вырежьте слайд'
    : slideSpotProblem;

  /**
   * Почему «Вырезать» недоступна для слайда ПОД ГОЛОВКОЙ — общий сигнал для
   * `SlideStripHead` (гасит кнопку) и `SlideStripNote` (объясняет причину),
   * которые с Сессии 47 стоят в разных местах дерева и обязаны показывать
   * одно и то же. Дальше по файлу `slideCutProblem` вызывается ещё раз
   * с ДРУГИМ id — на конкретной метке в MarkPanel, — там пересчёт нужен
   * по-настоящему, здесь нет.
   */
  const currentSlideCutProblem = slideCutProblem(currentSegment, state.currentSlideId);

  /**
   * Позиция, замороженная на время жеста.
   *
   * Нужна ровно для одного случая: автор тащит элемент на ИГРАЮЩЕЙ дорожке.
   * Головка в этот момент едет, и каждое событие жеста просилось бы в свою
   * секунду — вместо одного слайда получилась бы дорожка из слайдов, по
   * одному на кадр перетаскивания.
   */
  const gestureAtRef = useRef<TimeRef | null>(null);

  /** Одношаговая правка состояния элемента (цвет, чекбокс, стрелки). */
  const handleElementStateChange = useCallback((elementId: string, patch: Partial<ElementState>) => {
    dispatch({ type: 'setElementState', elementId, patch, at: headTimeRef() });
  }, [headTimeRef]);

  /**
   * Живое событие уже идущего жеста — перетаскивание на сцене, набор числа
   * в панели свойств. НЕ создаёт шаг истории само по себе: коммит-точку
   * ставит `handleCommitHistory` (см. `state/editorHistory.ts`).
   */
  const handleElementStateChangeLive = useCallback((elementId: string, patch: Partial<ElementState>) => {
    gestureAtRef.current ??= headTimeRef();
    dispatch({ type: 'setElementState', elementId, patch, at: gestureAtRef.current, commit: false });
  }, [headTimeRef]);

  /** Завершает жест, открытый `handleElementStateChangeLive`/`handleMoveMark`. */
  const handleCommitHistory = useCallback(() => {
    gestureAtRef.current = null;
    dispatch({ type: 'commit' });
  }, []);

  /**
   * Пачка правок состояний ОДНИМ шагом истории — общая часть всех кнопок
   * полоски расположения.
   *
   * `commit: false` у каждой правки плюс один `commit` в конце. Тот же приём,
   * что у стрелок клавиатуры и у перетаскивания пачки: без него `Ctrl+Z`
   * после выравнивания троих возвращал бы их по одному, и автор смотрел бы,
   * как ряд разъезжается обратно.
   */
  const applyArrange = useCallback(
    (patches: readonly { id: string; patch: Partial<ElementState> }[]) => {
      if (patches.length === 0) return;
      const at = headTimeRef();
      for (const { id, patch } of patches) {
        dispatch({ type: 'setElementState', elementId: id, patch, at, commit: false });
      }
      dispatch({ type: 'commit' });
    },
    [headTimeRef],
  );

  /** Выделенные, которые ЕСТЬ на текущем слайде: остальных двигать негде. */
  const arrangeItems = useCallback(
    (): Placed[] =>
      state.selectedIds.flatMap((id) => {
        const elementState = currentSlide.states[id];
        return elementState
          ? [{
              id,
              box: {
                x: elementState.x,
                y: elementState.y,
                width: elementState.width,
                height: elementState.height,
                rotation: elementState.rotation,
              },
            }]
          : [];
      }),
    [state.selectedIds, currentSlide],
  );

  /** Столько знаков уезжает в файл — как и при перетаскивании (StageView). */
  const roundCoord = (value: number): number => Number(value.toFixed(2));

  const handleAlign = useCallback(
    (kind: AlignKind) => {
      const moves = align(arrangeItems(), kind, segment.stage);
      applyArrange(
        moves.map((move) => ({
          id: move.id,
          patch: { x: roundCoord(move.x), y: roundCoord(move.y) },
        })),
      );
    },
    [arrangeItems, segment.stage, applyArrange],
  );

  const handleDistribute = useCallback(
    (axis: DistributeAxis) => {
      const moves = distribute(arrangeItems(), axis);
      applyArrange(
        moves.map((move) => ({
          id: move.id,
          patch: { x: roundCoord(move.x), y: roundCoord(move.y) },
        })),
      );
    },
    [arrangeItems, applyArrange],
  );

  /**
   * Стопка слоёв текущего слайда и те из выделенных, кто на ней есть.
   *
   * Стопка собирается в порядке `segment.elements`, а не по ключам `states`.
   * При равных `zIndex` порядок решает именно он: `topmostAt` берёт того,
   * кто позже в массиве, потому что `renderScene` вставляет узлы в порядке
   * массива. Порядок ключей объекта — другая величина, и разойдясь
   * с попаданием по клику, она дала бы автору стопку, не совпадающую
   * с тем, что он видит.
   */
  const layerStack = useMemo(() => {
    const layers = segment.elements.flatMap((element) => {
      const elementState = currentSlide.states[element.id];
      return elementState ? [{ id: element.id, zIndex: elementState.zIndex }] : [];
    });
    const moving = state.selectedIds.filter((id) => currentSlide.states[id] !== undefined);
    return { layers, moving };
  }, [segment.elements, currentSlide, state.selectedIds]);

  /**
   * Что изменится в стопке от такого хода. ПУСТО — значит ход ничего
   * не меняет: элемент уже наверху, уже внизу или двигать некого.
   *
   * Отдельно от самого хода затем, чтобы меню правой кнопки гасило
   * невозможный пункт ТЕМ ЖЕ вычислением, каким ход совершается. Спроси
   * меню «возможно ли» своим способом — и оно рано или поздно разошлось бы
   * с действием: показывало бы живой пункт, который ничего не делает.
   */
  const layerPatches = useCallback(
    (move: LayerMove) =>
      restack(layerStack.layers, layerStack.moving, move)
        .filter((layer) => currentSlide.states[layer.id]!.zIndex !== layer.zIndex)
        .map((layer) => ({ id: layer.id, patch: { zIndex: layer.zIndex } })),
    [layerStack, currentSlide],
  );

  const handleLayer = useCallback(
    (move: LayerMove) => {
      if (layerStack.moving.length === 0) return;
      applyArrange(layerPatches(move));
    },
    [layerStack.moving.length, layerPatches, applyArrange],
  );

  /**
   * Выделенные, у которых есть состояние на ТЕКУЩЕМ слайде, вместе с их
   * типом и текущим style — общая опора полосы свойств (`stage/PropBar.tsx`).
   * Тот же фильтр, что у `arrangeItems` выше, и по той же причине: писать
   * style тоже некуда без состояния слайда (`ElementStateSchema.style`,
   * ADR-012) — элемент, ещё не появившийся на этом слайде, полоса пропускает
   * молча, как и раскладка.
   */
  const propbarSelection = useMemo(
    () =>
      state.selectedIds.flatMap((id) => {
        const element = segment.elements.find((candidate) => candidate.id === id);
        const elementState = currentSlide.states[id];
        return element && elementState
          ? [{ id, type: element.type, style: elementState.style }]
          : [];
      }),
    [state.selectedIds, segment.elements, currentSlide],
  );

  /** Состав полосы — чистая функция от типов (`state/propbar.ts`, юнит-тест). */
  const propbarFields = useMemo(
    () => propbarStyleFields(propbarSelection.map((item) => item.type)),
    [propbarSelection],
  );

  /**
   * Значение поля на полосе — ОБЩЕЕ у всех выделенных или «разное».
   *
   * До Сессии 32 здесь стоял `propbarSelection[0]`, то есть значение первого
   * выделенного выдавалось за общее. Соврать так легко, а заметить трудно:
   * цвет настоящий, поле рабочее, ни в консоли, ни в тестах ни следа —
   * автор узнаёт правду, только поправив цвет троих и получив не то, что
   * видел. Решение о том, есть ли общее значение, принимает чистая
   * `commonStyleValue` (`state/style.ts`, юнит-тесты), а показывает его
   * тот же `StyleFieldWidget`, что и для одиночного выделения.
   *
   * Пустой массив здесь не бывает: `propbarFields` пуст, пока пуст
   * `propbarSelection` (`propbarStyleFields([])` = `[]`, см. её комментарий),
   * а на пустом списке `commonStyleValue` бросает громко.
   */
  const propbarStyleValueOf = useCallback(
    (key: StyleFieldKey) => commonStyleValue(propbarSelection.map(({ style }) => style), key),
    [propbarSelection],
  );

  /**
   * Пачка правок style ОДНИМ шагом истории — тот же приём, что у `applyArrange`
   * для геометрии: правка поля с полосы задевает СРАЗУ ВСЕХ выделенных,
   * у кого есть состояние на этом слайде, и Ctrl+Z обязан вернуть их разом,
   * а не по одному.
   */
  const handlePropbarStyleCommit = useCallback(
    (key: StyleFieldKey, value: string | number | LengthOrPercent) => {
      applyArrange(
        propbarSelection.flatMap(({ id, style }) => {
          const next = setStyleValue(style, key, value);
          return next === style ? [] : [{ id, patch: { style: next } }];
        }),
      );
    },
    [propbarSelection, applyArrange],
  );

  /**
   * Живое событие набора числа с полосы (`length`/`number`/`length-or-percent`
   * — см. `styleFieldWidget.tsx`). `commit: false` на каждую распознанную
   * цифру, коммит-точку жеста ставит `handleCommitHistory` на потере фокуса
   * поля — тот же приём, что у `handleElementStateChangeLive`.
   */
  const handlePropbarStyleLive = useCallback(
    (key: StyleFieldKey, value: string | number | LengthOrPercent) => {
      const at = headTimeRef();
      for (const { id, style } of propbarSelection) {
        const next = setStyleValue(style, key, value);
        if (next !== style) {
          dispatch({ type: 'setElementState', elementId: id, patch: { style: next }, at, commit: false });
        }
      }
    },
    [propbarSelection, headTimeRef],
  );

  /**
   * Живое событие правки роли темы (`ThemePanel.tsx`) — тот же приём, что
   * у `handleElementStateChangeLive`: `commit: false` на каждое движение
   * пипетки/нажатие клавиши, коммит-точку ставит `handleCommitHistory`
   * на потере фокуса поля.
   */
  const handleSetThemeRoleLive = useCallback((role: keyof Theme, value: string) => {
    dispatch({ type: 'setThemeRole', role, value, commit: false });
  }, []);

  /**
   * Палитра (`ThemePanel.tsx`, образец из `PALETTES`) — ВСЕ десять ролей
   * ОДНОЙ записью в историю. Тот же приём, что у `applyArrange`: `commit:
   * false` на каждую роль, один явный `commit` в конце закрывает жест —
   * `historyReducer` (`state/editorHistory.ts`) кладёт в past состояние ДО
   * первой отличающейся роли и больше не пушет, пока жест открыт, поэтому
   * Ctrl+Z возвращает прежнюю тему целиком.
   */
  const handleApplyPalette = useCallback((paletteId: string) => {
    const palette = paletteById(paletteId);
    for (const role of THEME_ROLES) {
      dispatch({ type: 'setThemeRole', role, value: palette.theme[role], commit: false });
    }
    dispatch({ type: 'commit' });
  }, []);

  /**
   * «Сохранить вид как стиль» (`StylesPanel.tsx`, ADR-029): собирает `Style`
   * из СОБСТВЕННОЙ карты выделенного элемента на текущем слайде, но только
   * по ключам `styleFieldsFor(type)` (ADR-012) — не всю карту целиком, иначе
   * в стиль ушли бы и посторонние ключи (например, руками вписанный `border`).
   * Идентификатор — машинный (`freeId`, латиница/цифры/дефис), имя — то, что
   * ввёл автор. Один dispatch: редьюсер (`case 'addStyle'`) одним шагом
   * истории и кладёт стиль в проект, и переводит элемент на него.
   */
  const handleSaveStyle = useCallback(
    (name: string) => {
      if (selected === undefined || selectedState === undefined) return;
      const keys = new Set(styleFieldsFor(selected.type).map((field) => field.key));
      const props = Object.fromEntries(
        Object.entries(selectedState.style).filter(([key]) => keys.has(key as StyleFieldKey)),
      );
      const style: Style = {
        id: freeId('style', currentProject.styles),
        name,
        type: selected.type,
        props,
      };
      dispatch({ type: 'addStyle', style, sourceElementId: selected.id });
    },
    [selected, selectedState, currentProject.styles],
  );

  /** Применить стиль к выделенному — тот же `setElementState`, что и любая другая правка вида. */
  const handleApplyStyle = useCallback(
    (styleId: string) => {
      if (selected === undefined) return;
      dispatch({ type: 'setElementState', elementId: selected.id, patch: { styleId }, at: headTimeRef() });
    },
    [selected, headTimeRef],
  );

  const handleDeleteStyle = useCallback((styleId: string) => {
    dispatch({ type: 'removeStyle', styleId });
  }, []);

  /**
   * «Взять» набор со склада (`StylesPanel.tsx`): панель уже слила его через
   * `mergeStyleSet` (свои `project.styles` против набора) и решила
   * переименования — сюда приходит готовый к вставке список, редьюсер
   * (`case 'addStyles'`) кладёт его в `project.styles` одним шагом истории.
   */
  const handleTakeStyles = useCallback((incoming: readonly Style[]) => {
    if (incoming.length === 0) return;
    dispatch({ type: 'addStyles', styles: incoming });
  }, []);

  /**
   * «Копировать форматирование» — снимает формат с ОДНОГО выделенного
   * (см. комментарий типа `CopyFormat` выше). Источник без style на этом
   * слайде взять нечего — кнопка и без этой проверки гаснет по
   * `copyFormatEnabled`, но обработчик обязан оставаться безопасным сам
   * по себе, а не полагаться на то, что кнопка его прикрыла.
   */
  const handleCopyFormat = useCallback(() => {
    if (selected === undefined || selectedState === undefined) return;
    if (
      selectedState.styleId !== undefined
      && currentProject.styles.some((style) => style.id === selectedState.styleId)
    ) {
      setCopyFormat({
        kind: 'style',
        sourceId: selected.id,
        elementType: selected.type,
        styleId: selectedState.styleId,
      });
      return;
    }
    const keys = new Set(styleFieldsFor(selected.type).map((field) => field.key));
    const props = Object.fromEntries(
      Object.entries(selectedState.style).filter(([key]) => keys.has(key as StyleFieldKey)),
    );
    setCopyFormat({ kind: 'values', sourceId: selected.id, elementType: selected.type, props });
  }, [selected, selectedState, currentProject.styles]);

  /**
   * Клик по сцене — тонкая обёртка над `handleSelect`: если формат «в руке»
   * и клик попал в ДРУГОЙ элемент ТОГО ЖЕ типа с видом на этом слайде,
   * применяет формат ОДНИМ dispatch и разряжает руку. Клик по элементу
   * чужого типа или пустому месту формат не трогает — автор может целиться
   * ещё раз. Только сцена (не `ElementList`): «Копировать форматирование» —
   * инструмент холста, как и в Canva, откуда снята натура.
   */
  const handleStageSelect = useCallback(
    (id: string | undefined, additive = false) => {
      if (copyFormat !== undefined && !additive && id !== undefined && id !== copyFormat.sourceId) {
        const target = segment.elements.find((element) => element.id === id);
        const targetState = currentSlide.states[id];
        if (target !== undefined && targetState !== undefined && target.type === copyFormat.elementType) {
          const patch: Partial<ElementState> =
            copyFormat.kind === 'style'
              ? { styleId: copyFormat.styleId }
              : { style: { ...targetState.style, ...copyFormat.props } };
          dispatch({ type: 'setElementState', elementId: id, patch, at: headTimeRef() });
          setCopyFormat(undefined);
        }
      }
      handleSelect(id, additive);
    },
    [copyFormat, segment.elements, currentSlide, headTimeRef, handleSelect],
  );

  const handleInsert = useCallback(
    (itemId: string) => {
      const { element, state: elementState } = createElement(
        libraryItem(itemId),
        currentSegment,
        currentSlide.states,
        segment.stage,
      );
      dispatch({ type: 'addElement', element, state: elementState, at: headTimeRef() });
    },
    [currentSegment, currentSlide.states, segment.stage, headTimeRef],
  );

  /**
   * Шаблон правит elements, слайды и gates разом — ОДИН шаг истории на кнопку
   * (действие `applyTemplate`, а не отдельные addElement/addSlide/addGate по
   * очереди, которые historyReducer положил бы в историю по одному).
   */
  const handleApplyTemplate = useCallback((templateId: string) => {
    dispatch({ type: 'applyTemplate', template: sceneTemplate(templateId) });
  }, []);

  /**
   * Сообщение о каскаде после удаления элемента.
   *
   * Удаление снимает состояние элемента со ВСЕХ слайдов, где оно было.
   * Без сообщения автор видит, что с дорожки исчезло сразу несколько
   * вещей, и это выглядит как баг редактора, а не как его собственное
   * действие. Считается ДО удаления: после него считать уже не по чему.
   */
  const [removalMessage, setRemovalMessage] = useState<string | undefined>(undefined);

  const handleDeleteSelected = useCallback(() => {
    const ids = state.selectedIds;
    if (ids.length === 0) return;
    // Сообщение о каскаде — про один элемент. При пачке оно не собирается:
    // сложить три отчёта в одну строку значит выдумать формулировку,
    // которой автор ещё не видел. Пачка удаляется молча, поштучно — с отчётом.
    setRemovalMessage(
      ids.length === 1
        ? formatRemovalMessage(ids[0]!, statesOnSlides(segment.slides, ids[0]!))
        : undefined,
    );
    dispatch({ type: 'removeElement', ids });
  }, [state.selectedIds, segment.slides]);

  /**
   * Меню правой кнопки: где оно открыто, либо `undefined` — закрыто.
   *
   * Точка в координатах ОКНА, потому что меню — узел с `position: fixed`.
   * Состояние ВИДА, не проекта: в историю отмены не пишется и в файл
   * не уезжает.
   */
  const [contextMenuAt, setContextMenuAt] = useState<{ x: number; y: number } | undefined>(
    undefined,
  );

  /**
   * Правая кнопка по элементу сцены.
   *
   * Нажатие по НЕВЫДЕЛЕННОМУ сначала выделяет его — так делает Canva
   * (снято с натуры 11.08.2026), и иначе меню действовало бы на прежнее
   * выделение, а показано было бы над другим объектом. Нажатие по уже
   * выделенному выделения НЕ трогает: иначе правая кнопка по одному
   * из трёх выделенных схлопывала бы пачку до одного.
   */
  const handleStageContextMenu = useCallback(
    (elementId: string | undefined, at: { x: number; y: number }) => {
      /*
       * Промах по пустому месту (Сессия 33) снимает выделение — ровно так же,
       * как это делает ОБЫЧНЫЙ щелчок по пустому месту. Иначе меню, открытое
       * над голым холстом, предлагало бы «Дублировать» и «Удалить» над теми
       * объектами, на которые автор не показывал.
       *
       * Раньше меню по пустому месту не открывалось вовсе: предложить там
       * было нечего. Теперь есть — «Вставить».
       */
      if (elementId === undefined) handleSelect(undefined);
      else if (!state.selectedIds.includes(elementId)) handleSelect(elementId);
      setContextMenuAt(at);
    },
    [state.selectedIds, handleSelect],
  );

  /**
   * Состав меню. Ходы по слоям берутся из `LAYER_BUTTONS` полосы свойств —
   * подписи обязаны быть одни, иначе один и тот же ход назывался бы
   * в двух местах по-разному.
   *
   * Невозможный ход ГАСНЕТ, но остаётся: у объекта, уже лежащего внизу,
   * «На задний план» показан серым. Спрятать значило бы отобрать действие
   * молча — автор решит, что его не существует (грабли С30 §20б).
   */
  // Меню открывается и по пустому месту холста (Сессия 33), где выделения
  // нет вовсе. Ходы над объектом там ГАСНУТ, но остаются: спрятать их
  // значило бы отобрать действие молча (грабли С30 §20б).
  const hasSelection = state.selectedIds.length > 0;

  const contextMenuItems = useMemo(
    (): readonly MenuItem[] => [
      {
        id: 'copy',
        label: 'Копировать',
        shortcut: 'Ctrl+C',
        disabled: !hasSelection,
        onSelect: () => dispatch({ type: 'copyElements', ids: state.selectedIds }),
      },
      {
        id: 'cut',
        label: 'Вырезать',
        shortcut: 'Ctrl+X',
        disabled: !hasSelection,
        onSelect: () => dispatch({ type: 'cutElements', ids: state.selectedIds }),
      },
      {
        id: 'paste',
        label: 'Вставить',
        shortcut: 'Ctrl+V',
        // Единственный пункт, живой при пустом выделении: правая кнопка
        // по голому холсту существует ради него одного.
        disabled: state.elementClipboard === undefined,
        onSelect: () => dispatch({ type: 'pasteElements', at: headTimeRef() }),
      },
      {
        id: 'duplicate',
        label: 'Дублировать',
        shortcut: 'Ctrl+D',
        separatorBefore: true,
        disabled: !hasSelection,
        onSelect: () =>
          dispatch({ type: 'duplicateElements', ids: state.selectedIds, at: headTimeRef() }),
      },
      {
        id: 'delete',
        label: 'Удалить',
        shortcut: 'Delete',
        disabled: !hasSelection,
        onSelect: handleDeleteSelected,
      },
      ...LAYER_BUTTONS.map((button, index) => ({
        id: button.testId,
        label: button.label,
        separatorBefore: index === 0,
        disabled: !hasSelection || layerPatches(button.move).length === 0,
        onSelect: () => handleLayer(button.move),
      })),
    ],
    [
      state.selectedIds,
      state.elementClipboard,
      hasSelection,
      headTimeRef,
      handleDeleteSelected,
      layerPatches,
      handleLayer,
    ],
  );

  // Ошибка вставки картинки: файл не картинка, либо кодирование не удалось.
  // Падает громко (CLAUDE.md), но громко — это видимое сообщение автору,
  // а не только исключение в консоли.
  const [imageDropError, setImageDropError] = useState<string | undefined>(undefined);

  const handleImageDrop = useCallback(
    (file: File) => {
      setImageDropError(undefined);
      encodeImageFile(file, segment.stage)
        .then((encoded) => {
          const { element, state: elementState } = createImageElement(
            currentSegment,
            currentSlide.states,
            segment.stage,
            encoded,
          );
          dispatch({ type: 'addElement', element, state: elementState, at: headTimeRef() });
        })
        .catch((error: unknown) => {
          setImageDropError(error instanceof Error ? error.message : String(error));
        });
    },
    [currentSegment, currentSlide.states, segment.stage],
  );

  const elementRows = useMemo(
    () => toRows(segment.elements, currentSlide.states),
    [segment.elements, currentSlide.states],
  );

  /**
   * Метки на дорожке: гейты и слайды (кроме первого — он обязан стоять
   * на нуле и не может быть сдвинут, `state/project.ts`, `moveMark`).
   * Показывать его как перетаскиваемую метку значило бы предлагать жест,
   * который редьюсер тут же отвергнет броском посреди перетаскивания.
   *
   * Секунды считаются из TimeRef здесь, а не хранятся: инвариант №10 требует,
   * чтобы в проекте лежала ссылка на слово, а не результат её разрешения.
   */
  // Секунды всех слайдов, включая нулевой: длительность перехода урезана
  // расстоянием до ПРЕДЫДУЩЕЙ метки (ADR-020), а предыдущей у второго
  // слайда как раз нулевой — выкинув его, получили бы не то число.
  // Вынесено из `marks` ниже, чтобы `selectedSlideGapSeconds` не считал
  // тот же массив второй раз тем же способом.
  const slideSeconds = useMemo(
    () => segment.slides.map((slide) => markSeconds(slide.at, segment.words)),
    [segment.slides, segment.words],
  );

  /**
   * Сколько мест ссылаются на цвет темы, который не разрешится.
   *
   * Считается ЗДЕСЬ, а не в панели дорожки: сироты живут и в стилях
   * ПРОЕКТА, и у элементов слайда, а вниз приезжает только сегмент.
   * Показывается тем же счётчиком, где живут сироты меток — второй
   * счётчик на ту же болезнь приучил бы автора смотреть в одно место
   * и пропускать другое (`design/styles.md` §4).
   *
   * Плеер про это не скажет никогда: браузер отбрасывает неразрешённую
   * ссылку МОЛЧА, и элемент чернеет насквозь — базовое оформление сцены
   * его не спасает (замерено S14).
   */
  const colorOrphanCount = useMemo(
    () => colorOrphans(currentProject.styles, segment.slides).length,
    [currentProject.styles, segment.slides],
  );

  const marks = useMemo((): Mark[] => {
    const fromGates = segment.gates.map((gate): Mark => ({
      kind: 'gate',
      id: gate.id,
      seconds: markSeconds(gate.at, segment.words),
      anchor: anchorStateOf(gate.at),
      // Остановка ни к чему не едет: окна движения у неё нет.
      morphSeconds: 0,
      // Потолка длительности у остановки тоже нет — поле есть только потому,
      // что интерфейс Mark общий для гейта и слайда; ручка стыка (Задача 5)
      // рисуется лишь там, где morphSeconds > 0, а это у гейта никогда не так.
      gapSeconds: 0,
      // Подсказка автору при наведении: словами продукта, а не схемы.
      // Развилка от вопроса отличается отсутствием верного ответа.
      //
      // ОСТАНОВКА НАЗЫВАЕТСЯ СВОИМ ВОПРОСОМ, а не ключом. Прежде здесь
      // стояло «Остановка «gate-choice»» — идентификатор схемы, которого
      // автор не заводил. Поля `title` у гейта нет вовсе (схема: id, at,
      // config, onWrong, maxAttempts, recordAs), но человеческий текст
      // у него ЕСТЬ: это `prompt` — вопрос, который автор сам и написал,
      // а у «Дальше» — надпись на кнопке. Запасной вид — время метки:
      // оно же стоит на дорожке, и по нему остановку видно.
      title: `${gate.config.kind === 'choice' && gate.config.correctId === null ? 'Развилка' : 'Остановка'} ${gateName(gate, markSeconds(gate.at, segment.words))}`,
    }));

    const fromSlides = segment.slides.slice(1).map((slide, offset): Mark => {
      const index = offset + 1;
      const morphSeconds = morphSecondsFor(
        slide.transition, slide.transitionSeconds, index, slideSeconds,
      );
      const info = TRANSITION_INFO[slide.transition];
      return {
        kind: 'slide',
        id: slide.id,
        seconds: slideSeconds[index]!,
        anchor: anchorStateOf(slide.at),
        morphSeconds,
        // Потолок ручки стыка (Задача 5, ADR-020) — расстояние до
        // ПРЕДЫДУЩЕЙ метки, то же вычисление, что у selectedSlideGapSeconds
        // ниже, но для КАЖДОГО слайда: ручка тянет ту метку, на которой
        // начался жест, а не обязательно выбранную.
        gapSeconds: slideSeconds[index]! - slideSeconds[index - 1]!,
        // СЛАЙД НАЗЫВАЕТСЯ ВРЕМЕНЕМ, а не ключом. Прежде стояло
        // «Слайд «node-1-slide-1»» — ключ схемы. Имени у слайда нет
        // (схема: id, at, transition, transitionSeconds, states), а время
        // есть, и оно же написано на его чипе в правой колонке и под
        // самой меткой: по нему автор слайд и найдёт.
        title: slide.transition === 'cut'
          ? `Слайд на ${secondsText(slideSeconds[index]!)}: ${info.label.toLowerCase()}, без движения`
          : `Слайд на ${secondsText(slideSeconds[index]!)}: ${info.label.toLowerCase()}, движение ${secondsText(morphSeconds)} до метки`,
      };
    });
    return [...fromGates, ...fromSlides];
  }, [segment.gates, segment.slides, segment.words, slideSeconds]);

  /**
   * Потолок продолжительности перехода выделенного слайда — расстояние
   * до ПРЕДЫДУЩЕГО слайда (ADR-020), передаётся в `MarkPanel` пропсом:
   * панель сама не видит соседних меток, а `morphSecondsFor` в плеере
   * режет длительность именно этим числом.
   */
  const selectedSlideGapSeconds = useMemo((): number | undefined => {
    if (!markData || markData.kind !== 'slide') return undefined;
    const index = segment.slides.findIndex((candidate) => candidate.id === markData.slide.id);
    if (index <= 0) return undefined; // первый слайд меткой не бывает — см. MarkPanel.tsx
    return slideSeconds[index]! - slideSeconds[index - 1]!;
  }, [markData, segment.slides, slideSeconds]);

  // Через ref, а не через зависимость handleSelectMark: метки пересчитываются
  // на каждую правку сегмента, а обработчику нужен только их СПИСОК в момент
  // нажатия. В зависимостях он пересоздавал бы колбэк на каждое движение мыши.
  marksRef.current = marks;

  const handleMoveMark = useCallback(
    (kind: MarkKind, id: string, seconds: number) => {
      // Перетаскивание метки — жест, как и перетаскивание элемента: событие
      // приходит на каждый pointermove и обязано остаться «живым», иначе
      // Ctrl+Z будет отменять один кадр протаскивания, а не жест целиком.
      // Коммит-точку ставит handleCommitHistory на pointerup (см. TrackView).
      dispatch({
        type: 'moveMark',
        kind,
        id,
        at: timeRefAt(segment.words, seconds),
        commit: false,
      });
    },
    [segment.words],
  );

  /**
   * Капля этой главы и её отрезки «моё» для полосы дорожки (v14, ADR-032).
   *
   * Капля — ПЕРВЫЙ элемент типа `video`. Несколько капель на сцене одновременно
   * не измерены ни разу (`bubble.md` §8.3: цена двойного декодирования
   * неизвестна), поэтому вторая и далее полосы не получают — и это названо
   * здесь, а не выяснится однажды на чужом проекте.
   *
   * `undefined` (капли нет) и «капля есть, отрезков ноль» — разные состояния:
   * во втором полоса рисуется пустой, и пустота её и есть сообщение «всё
   * время здесь распоряжается зритель».
   *
   * Секунды разрешаются тем же `markSeconds`, что и метки: два способа
   * разрешить один `TimeRef` разошлись бы, и клип встал бы не там, где стоит.
   */
  const bubble = useMemo(() => {
    const head = currentSegment.elements.find((element) => element.type === 'video');
    if (!head) return undefined;
    return {
      elementId: head.id,
      spans: currentSegment.authorSpans
        .filter((span) => span.elementId === head.id)
        .map((span) => ({
          fromSeconds: markSeconds(span.from, currentSegment.audio.words),
          toSeconds: markSeconds(span.to, currentSegment.audio.words),
        })),
    };
  }, [currentSegment]);

  /**
   * Индексы отрезков капли В ОБЩЕМ массиве сегмента.
   *
   * Полоса адресует отрезки своим порядковым номером — она видит только
   * отрезки капли. Редьюсер работает с общим массивом, где могут лежать
   * и чужие. Перевод живёт ЗДЕСЬ, в одном месте: сделай его в редьюсере —
   * и действие перестало бы быть понятным без знания того, кто его послал.
   */
  const bubbleSpanIndexes = useMemo(
    () => currentSegment.authorSpans
      .map((span, index) => ({ span, index }))
      .filter(({ span }) => span.elementId === bubble?.elementId)
      .map(({ index }) => index),
    [currentSegment, bubble],
  );

  const handleCreateSpan = useCallback(
    (range: SpanRange) => {
      if (!bubble) throw new Error('Отрезок нарисован, а капли в главе нет');
      dispatch({
        type: 'addSpan',
        elementId: bubble.elementId,
        from: timeRefAt(currentSegment.audio.words, range.fromSeconds),
        to: timeRefAt(currentSegment.audio.words, range.toSeconds),
      });
    },
    [bubble, currentSegment],
  );

  const handleEditSpan = useCallback(
    (index: number, range: SpanRange) => {
      const target = bubbleSpanIndexes[index];
      if (target === undefined) throw new Error(`Отрезка капли №${index} нет`);
      // `commit: false` — тяга приходит на каждый `pointermove` и обязана
      // остаться ОДНИМ шагом истории, как перетаскивание метки.
      dispatch({
        type: 'moveSpan',
        index: target,
        from: timeRefAt(currentSegment.audio.words, range.fromSeconds),
        to: timeRefAt(currentSegment.audio.words, range.toSeconds),
        commit: false,
      });
    },
    [bubbleSpanIndexes, currentSegment],
  );

  const handleRemoveSpan = useCallback(
    (index: number) => {
      const target = bubbleSpanIndexes[index];
      if (target === undefined) throw new Error(`Отрезка капли №${index} нет`);
      dispatch({ type: 'removeSpan', index: target });
    },
    [bubbleSpanIndexes],
  );

  /**
   * Живое событие ручки стыка на дорожке (Задача 5, `MarksLane.tsx`).
   *
   * Тот же dispatch, что `handleSetSlideTransitionSecondsLive` выше, и то же
   * действие `setSlideTransitionSeconds`, но ЭТОТ обработчик принимает id
   * явно: ручка на дорожке может тянуть метку, которая сейчас не выделена
   * в панели, а `handleSetSlideTransitionSecondsLive` работает только
   * с `selectedMark`. Коммит-точку жеста ставит `handleCommitHistory`
   * напрямую в проп `TrackView.onTransitionSecondsCommit` ниже — отдельного
   * обработчика для неё заводить незачем, `onMoveMarkEnd` устроен так же.
   */
  const handleTrackTransitionSecondsLive = useCallback((id: string, transitionSeconds: number) => {
    dispatch({ type: 'setSlideTransitionSeconds', slideId: id, transitionSeconds, commit: false });
  }, []);

  const handleAddGate = useCallback(() => {
    const id = freeId('gate', currentSegment.gates);
    const gate = createGate(id, timeRefAt(segment.words, transport.positionSeconds));
    dispatch({ type: 'addGate', gate });
    dispatch({ type: 'select', id: undefined });
    setSelectedMark({ kind: 'gate', id: gate.id });
  }, [currentSegment.gates, segment.words, transport.positionSeconds]);

  /**
   * Метка на позиции головки: глава делится надвое (`product.md` §2з [Р]).
   *
   * Секунды берутся у транспорта в момент нажатия, а не из состояния:
   * головка ходит каждый кадр, и запомненное число разошлось бы с тем,
   * что автор видит на дорожке.
   *
   * Выделение слайда и элемента сбрасывает сам редьюсер: выделенное могло
   * уехать во вторую главу, и ссылка на него стала бы висячей.
   */
  /**
   * Какой вид показывает нижняя зона (`branches.md` §3).
   *
   * Живёт в редакторе, а не в проекте: это настройка автора для себя,
   * зритель её не видит никогда — тот же закон, что у сворачивания ленты
   * слайдов и панели озвучки.
   */
  const [bottomView, setBottomView] = useState<'tracks' | 'branches'>('tracks');

  /**
   * Свёрнута ли лента слайдов. По умолчанию ДА (Сессия 41, решение владельца
   * 15.08.2026 по замеру: лента отнимала у сцены 98 px). Живёт здесь, а не
   * в `SlideStrip.tsx` (до Сессии 47 жила там): голова ленты (кнопка,
   * счётчик, кнопки буфера) стоит в общей шапке нижней зоны — `SlideStripHead`
   * — а карточки — отдельным блоком под строкой причины — `SlideStripCards`.
   * Двум разным компонентам, стоящим в разных местах дерева, состояние
   * общее взять неоткуда, кроме как сверху. Тот же приём и по той же
   * причине, что у складывания панели озвучки (`AudioSourcePanel.tsx`,
   * `useAudioSource`): «скрыто в редакторе» и «скрыто для зрителя» — разные
   * вещи, и в проект это состояние не попадает никогда.
   */
  const [slidesCollapsed, setSlidesCollapsed] = useState(true);

  /**
   * Дерево веток целиком — то, из чего вид «Ветки» строит полосы и плитки
   * (Сессия 43: вид показывает не только основную ветку, а всё дерево).
   *
   * Считается от ПРОЕКТА, а не от текущего сегмента: ветка это цепочка,
   * и дерево видно только целиком. Доступ к `project.segments` идёт через
   * `branchTree` — один узкий слой, как того требует CLAUDE.md, а не
   * обход списка прямо в разметке.
   */
  const lanes = useMemo(() => branchTree(currentProject), [currentProject]);

  /**
   * Вилка длительностей объяснения (`branches.md` §8). Одного числа у него
   * нет: ветки разной длины — у разных зрителей разное время, и любое
   * единственное число будет враньём.
   */
  const durationSpread = useMemo(() => durationRange(currentProject), [currentProject]);

  /**
   * Связь со ВТОРЫМ ОКНОМ (`tracks.md` §4).
   *
   * Хост живёт всю жизнь редактора, а не открывается вместе с окном:
   * второе окно может открыться и раньше, и позже, и заново после
   * перезагрузки, и в каждом случае оно шлёт `hello`, а хост отдаёт
   * последнее состояние. Проверять, открыто ли окно, чтобы решить,
   * заводить ли канал, значило бы завести гонку на ровном месте.
   *
   * Второе окно ничего не решает: жесты приходят сюда и уходят в тот же
   * редьюсер, что и жесты из главного окна. Одна сторона записи на две
   * стороны показа — та же дисциплина, по которой редактор берёт рендер
   * у плеера, а не пишет свой.
   */
  const branchesHostRef = useRef<BranchesHost | null>(null);
  useEffect(() => {
    const host = createBranchesHost((gesture) => {
      if (gesture.kind === 'pick') dispatch({ type: 'selectSegment', id: gesture.chapterId });
      else if (gesture.kind === 'rename') {
        dispatch({ type: 'renameSegment', id: gesture.chapterId, title: gesture.title });
      } else if (gesture.kind === 'extract') {
        dispatch({ type: 'extractToBranch', chapterIds: gesture.chapterIds });
      }
    });
    branchesHostRef.current = host;
    return () => {
      host.close();
      branchesHostRef.current = null;
    };
  }, []);

  /**
   * Состояние уходит во второе окно ТЕКСТОМ проекта — той же формы, что
   * уходит в файл. Своего формата для окна не заводим: он разъехался бы
   * с файловым молча.
   *
   * Но БЕЗ ВАЛИДАЦИИ, и это не небрежность. `serializeProject` проверяет
   * проект схемой и БРОСАЕТ на непрошедшем — он для сохранения, где автор
   * нажал кнопку и обязан узнать о поломке. Здесь другое: во время правки
   * проект законно бывает временно невалидным. Пример из прогона 17.08.2026:
   * автор переназначает цель правила выхода, и в промежутке у главы `s-b`
   * правила перестают покрывать все исходы, а запасного выхода ещё нет.
   *
   * Первая версия этого места звала `serializeProject`, и бросок из ЭФФЕКТА
   * снимал весь редактор — три e2e умерли на ровном месте, причём ни один
   * из них не про второе окно вовсе. Зеркало не имеет права убивать того,
   * кого отражает.
   *
   * Невалидное состояние доедет до второго окна как есть, и оно скажет
   * об этом словами (`BranchesWindow.tsx`): показать «проект не открылся»
   * честнее, чем показывать позавчерашнее дерево, притворяясь свежим.
   */
  useEffect(() => {
    branchesHostRef.current?.publish({
      text: JSON.stringify(currentProject),
      currentSegmentId: state.currentSegmentId,
    });
  }, [currentProject, state.currentSegmentId]);

  const handleOpenSecondWindow = useCallback(() => {
    window.open('/branches.html', 'player-branches', 'width=1280,height=800');
  }, []);

  const handleRenameSegment = useCallback((id: string, title: string) => {
    dispatch({ type: 'renameSegment', id, title });
  }, []);

  /**
   * Причина отказа считается ЗДЕСЬ и раздаётся обоим потребителям: кнопке,
   * чтобы гаснуть, и обработчику, чтобы не звать невозможный разрез.
   * Одна функция, один проект, одни аргументы — разойтись нечему.
   */
  const splitProblem = splitHereProblem(
    currentProject, state.currentSegmentId, transport.positionSeconds,
  );

  /**
   * Что автор прочитает после разреза. Состояние вида, как `removalMessage`
   * и `speechSplitWarning`: считается ДО разреза, потому что после него
   * исходной главы уже нет и считать не по чему.
   */
  const [splitNotice, setSplitNotice] = useState<string | undefined>(undefined);

  const handleSplitHere = useCallback(() => {
    // Вторая проверка, а не «на всякий случай»: между отрисовкой кнопки
    // и щелчком по ней проходит время, за которое автор мог переключить
    // главу. Отказ здесь ТИХИЙ намеренно — кнопка в этот момент уже
    // погашена и объясняет причину сама, а бросок из редьюсера снял бы
    // весь редактор (17.08.2026, белый экран у владельца).
    if (splitProblem !== undefined) return;
    // Те же аргументы, что уйдут в разрез: `splitAtTime` зовёт
    // `splitSegmentAtTime(segment, seconds, project.segments)`. Разойтись
    // именам продолжения тут нечем — их считает одна и та же функция.
    setSplitNotice(currentSegment
      ? splitAtTimeNotice(currentSegment, currentProject.segments)
      : undefined);
    dispatch({ type: 'splitAtTime', seconds: transport.positionSeconds });
    setSelectedMark(undefined);
  }, [transport.positionSeconds, splitProblem, currentSegment, currentProject]);

  /**
   * Строка держится до тех пор, пока автор не ушёл из главы, где резал.
   * Переключился — событие перестало относиться к тому, что он видит,
   * и строка обязана уйти, а не остаться подписью к чужой дорожке.
   */
  useEffect(() => {
    setSplitNotice(undefined);
  }, [state.currentSegmentId]);

  /**
   * Сколько меток сейчас привязано к слову — для текста подтверждения
   * замены озвучки (AudioSourcePanel). Считается от ЖИВОГО сегмента
   * (currentSegment, а не segment-предпросмотр — оба несут одни и те же
   * `at`, но currentSegment уже под рукой), поэтому число не отстаёт
   * от последней правки автора между открытием диалога и подтверждением.
   */
  const audioWordMarkCount = useMemo(() => wordMarkCount(currentSegment), [currentSegment]);

  const handleReplaceAudio = useCallback(
    (fileId: string, durationSeconds: number) => {
      dispatch({ type: 'replaceSegmentAudio', fileId, duration: durationSeconds });
    },
    [],
  );

  // «Заменить и расшифровать»: AudioSourcePanel уже сходила за расшифровкой
  // НОВОГО файла и приносит готовые слова — здесь замена и перенос меток
  // уходят одним dispatch, одним шагом истории (см. комментарий действия
  // в state/project.ts: старых слов для сопоставления между двумя
  // действиями уже не было бы). Проверено e2e (editor-audio-align.spec.ts,
  // «Ctrl+Z один раз возвращает и дорожку, и расшифровку разом»): тест ловит
  // разбиение этого dispatch на два — подтверждено намеренным сломом
  // и откатом при подготовке задачи 7 (Круг правок 1).
  const handleReplaceAudioWithTranscript = useCallback(
    (fileId: string, durationSeconds: number, words: readonly Word[]) => {
      dispatch({ type: 'replaceSegmentAudio', fileId, duration: durationSeconds, words });
    },
    [],
  );

  const handleWordsTranscribed = useCallback((words: readonly Word[]) => {
    dispatch({ type: 'setSegmentWords', words });
  }, []);

  /** Живое событие набора текста озвучки — см. комментарий модуля Inspector.tsx. */
  const handleSpeechChange = useCallback((text: string) => {
    dispatch({ type: 'setSpeech', text, commit: false });
  }, []);

  /**
   * Состояние и обработчики панели озвучки (`AudioSourceHead`/`AudioSourceBody`,
   * `track/AudioSourcePanel.tsx`). Хук вызывается здесь, а не внутри одного
   * из двух видов, потому что оба вида — голова в шапке зоны и тело над
   * дорожкой — стоят в разных местах дерева и обязаны видеть ОДНО и то же
   * состояние (открыта ли панель, что грузится, что подтверждается).
   */
  const audioSource = useAudioSource({
    source: segment.source,
    wordMarkCount: audioWordMarkCount,
    onReplace: handleReplaceAudio,
    onReplaceWithTranscript: handleReplaceAudioWithTranscript,
    onWordsTranscribed: handleWordsTranscribed,
    lastRetarget: state.lastRetarget,
  });

  /**
   * Имя звука в голове полосы `sound` дорожки (каркас, задача 2.1).
   *
   * Настоящее человеческое имя файла грузится АСИНХРОННО из хранилища
   * плеера, и делает это `useAudioSource` (`getAudio(source.fileId)`) —
   * второй асинхронный запрос к тому же хранилищу отсюда завёл бы вторую
   * правду об одном и том же имени. До Сессии 47 это было ограничением:
   * имя жило внутри `AudioSourcePanel` и не было видно снаружи, поэтому
   * здесь стоял запасной вид (`fileId`) даже когда человеческое имя уже
   * было известно. Теперь хук вызывается в `Editor.tsx` и отдаёт готовое
   * `loadedName` — второй правды больше нет, имя приходит из одного места.
   */
  const soundLabel = segment.source.kind === 'file'
    ? (audioSource.loadedName ?? segment.source.fileId)
    : segment.source.kind === 'url'
      ? segment.source.url
      : 'без звука';

  // Ссылка стабильна: иначе эффект в StageView считал бы её изменившейся
  // на каждый рендер и пересобирал сцену по десять раз в секунду.
  const handleReady = useCallback(
    (preview: ScenePreview | null) => {
      // Для проверок в браузере и e2e: доступ к предпросмотру без раскопок по DOM.
      (window as unknown as { __preview: ScenePreview | null }).__preview = preview;
      onReady?.(preview);
    },
    [onReady],
  );

  // Тоже для тестов: сохранённый проект должен сверяться с тем, что на экране,
  // а лезть за ним в React иначе неоткуда. В эффекте, а не в теле рендера:
  // рендер React вправе выбросить, и тогда снаружи оказалось бы состояние,
  // которого на экране никогда не было.
  useLayoutEffect(() => {
    (window as unknown as { __project: Project }).__project = currentProject;
  }, [currentProject]);

  /**
   * Автосохранение работы в слот.
   *
   * Через паузу после последней правки: таймер перезаводится на каждое
   * изменение проекта, поэтому во время перетаскивания запись не случается
   * ни разу, а через полсекунды после остановки — один раз.
   *
   * Вкладка без слота не пишет вовсе. Это не оптимизация, а решение владельца:
   * вторая вкладка предупреждает и не пишет, потому что тихая перезапись здесь
   * равна потере работы, и заметить её нечем.
   *
   * Отказ записи не глушится. Он не может «упасть громко» в обычном смысле —
   * исключение из отложенной задачи ушло бы только в консоль, — поэтому
   * поднимается в полосу, которую автор видит глазами.
   */
  useEffect(() => {
    if (!canWrite) return undefined;

    const timer = setTimeout(() => {
      saveWork(currentProject, origin)
        .then(() => setWorkError(undefined))
        .catch((error: unknown) => {
          setWorkError(`Не удалось сохранить работу в браузере: ${String(error)}`);
        });
    }, AUTOSAVE_PAUSE_MS);

    return () => clearTimeout(timer);
  }, [currentProject, canWrite, origin]);

  /**
   * Открытие своего файла — вторая половина кнопки «Сохранить».
   *
   * Проект кладётся в слот, и вкладка перезагружается на свой же адрес БЕЗ
   * параметров. Так «откуда берётся проект» остаётся одной дорогой — той же,
   * которой работа открывается обычным утром. Замена состояния на месте была
   * бы второй дорогой, и её пришлось бы отдельно решать: что делать с историей
   * отмен от прежнего проекта, которая к новому не относится вовсе.
   *
   * `location.pathname` без строки запроса намеренно: остаться на `?fixture=X`
   * значило бы, что после перезагрузки откроется фикстура, а не открытый файл.
   */
  const handleOpenFile = useCallback(
    async (file: File): Promise<void> => {
      // Проверка здесь, а не только в виде отключённой кнопки. Отключённая
      // кнопка — это внешний вид, а слот защищать надо в том месте, где
      // в него пишут: до `handleOpenFile` можно дотянуться и мимо неё.
      if (!canWrite) {
        setWorkError('Работа открыта в другой вкладке — здесь нельзя открыть файл');
        return;
      }
      try {
        const opened = await openProjectFile(file);
        await saveWork(opened, file.name);
        location.href = location.pathname;
      } catch (error: unknown) {
        setWorkError(`Не удалось открыть ${file.name}: ${String(error)}`);
      }
    },
    [canWrite],
  );

  /**
   * Импорт презентации: тот же путь, что и у «Открыть файл».
   *
   * Отдельная кнопка, а не второе расширение у той же: открытие проекта
   * и импорт презентации — разные действия с разной ценой. Открытие
   * возвращает работу как была, импорт СОБИРАЕТ новую из чужого формата
   * и часть данных при этом теряет (картинки приезжают рамками, ADR-031).
   * Спрятать это за общей кнопкой значило бы сделать потерю незаметной.
   */
  const handleImportPptx = useCallback(
    async (file: File): Promise<void> => {
      if (!canWrite) {
        setWorkError('Работа открыта в другой вкладке — здесь нельзя импортировать');
        return;
      }
      try {
        const { project, report } = await importPptxFile(file);
        await saveWork(project, file.name);
        location.href = location.pathname;
        // Строка ниже до перезагрузки не доживёт — она для случая, когда
        // переход не состоялся. Молчать о срезанном нельзя: автор увидит
        // рамки вместо картинок и решит, что импорт сломался.
        setWorkError(
          `Импортировано страниц: ${report.slides}, элементов: ${report.elements}. `
          + `Картинок без содержимого: ${report.picturesWithoutBytes}, `
          + `линий, приехавших рамкой: ${report.linesAsFrames}.`,
        );
      } catch (error: unknown) {
        setWorkError(`Не удалось импортировать ${file.name}: ${String(error)}`);
      }
    },
    [canWrite],
  );

  /**
   * Что из выделенного можно собрать в группу, а что разобрать.
   *
   * Считается ЗДЕСЬ, а не в `keyboard.ts`: та таблица отвечает на вопрос
   * о клавише и знания об элементах не имеет — и не должна (ADR-010).
   *
   * `canGroup` требует не меньше ДВУХ и всех — верхнего уровня. Второе
   * условие сегодня выполняется само (выделить ребёнка группы нельзя,
   * пока нет захода внутрь), но написано сразу: с появлением захода
   * в Сессии 36 недостающая проверка дала бы группу внутри чужой группы
   * молча, а схема упала бы уже при сохранении.
   */
  const groupability = useMemo(() => {
    const selected = state.selectedIds
      .map((id) => segment.elements.find((element) => element.id === id))
      .filter((element): element is Element => element !== undefined);
    return {
      canGroup: selected.length >= 2 && selected.every((element) => element.parentId === undefined),
      canUngroup: selected.some((element) => element.type === 'group'),
    };
  }, [state.selectedIds, segment.elements]);

  /**
   * Клавиатура (срез 6). `keyToIntent` — чистая таблица без React и DOM
   * (`keyboard.ts`); этот эффект только собирает контекст из фактического
   * состояния и вызывает её, как и требует ADR-010.
   *
   * Слушатель на `window`, а не React-обработчик на корневом `<div>`: фокус
   * в момент нажатия может стоять на `document.body` (например, сразу после
   * загрузки страницы, до первого клика), а `body` — предок этого `<div>`,
   * а не потомок, и событие до него по всплытию не дошло бы вовсе.
   *
   * `inTextField` читается из `document.activeElement` В МОМЕНТ события,
   * а не из состояния редактора: состояние легко рассинхронизировать
   * (забыть сбросить флаг на blur), а активный элемент — источник истины,
   * который никогда не соврёт.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const active = document.activeElement;
      const context: KeyContext = {
        hasSelection: state.selectedIds.length > 0,
        // Правка текста на холсте (двойной клик по элементу, StageView.
        // beginTextEdit) ставит узлу contentEditable и фокусирует его —
        // проверка честная (реальное свойство DOM активного элемента),
        // а не флаг, который можно забыть сбросить.
        editingText: active instanceof HTMLElement && active.isContentEditable,
        inTextField: isTextFieldNode(active),
        // Пустой буфер обязан оставить Ctrl+V браузеру — см. `KeyContext`.
        hasClipboard: state.elementClipboard !== undefined,
        ...groupability,
      };
      const intent = keyToIntent(event, context);
      if (!intent) return; // не наша клавиша — Tab и всё остальное продолжает жить своей жизнью

      event.preventDefault();

      switch (intent.kind) {
        case 'delete':
          handleDeleteSelected();
          return;
        case 'nudge': {
          /**
           * Двигаются ВСЕ выделенные, каждый на одну и ту же дельту.
           *
           * Те, кого нет на этом слайде, пропускаются: их некуда двигать,
           * но это не повод не двигать остальных.
           *
           * `commit: false` у каждого плюс один `commit` в конце — это одно
           * нажатие стрелки, значит ОДИН шаг отмены. Без этого Ctrl+Z после
           * сдвига троих возвращал бы их по одному, и автор видел бы, как
           * пачка разъезжается. Тот же приём, которым уже коммитится
           * перетаскивание (см. `handleCommitHistory`).
           */
          const at = headTimeRef();
          /** Новые ЛОКАЛЬНЫЕ боксы сдвинутых — считаются здесь же, потому что
           *  `currentSlide` в этом кадре ещё несёт состояние ДО сдвига. */
          const nudged = new Map<string, Box>();
          let moved = false;
          for (const id of state.selectedIds) {
            const currentState = currentSlide.states[id];
            if (!currentState) continue;

            /**
             * Дельта стрелки — СЦЕННАЯ, и это видно из `keyboard.ts`: «вверх»
             * там уменьшает `y`, то есть речь про оси ЭКРАНА. У элемента
             * верхнего уровня `x`/`y` тоже сценные, и прибавка гонит его
             * ровно туда, куда показывает стрелка.
             *
             * У ребёнка группы `x`/`y` ЛОКАЛЬНЫЕ. Та же прибавка погнала бы
             * его вдоль осей ГРУППЫ: на группе, повёрнутой на 10°, стрелка
             * вправо уводила бы вниз на 0.17 от переезда — измерено e2e.
             * Это тот же дефект, что починен у тяги мышью в срезе 3а, только
             * пришедший другим путём, через клавиатуру.
             *
             * Перевод делает ТА ЖЕ пара функций, что и жест, а не третья
             * формула: «повернуть дельту на минус угол группы» из неё
             * выводится, а второе описание одного факта разошлось бы молча.
             */
            const owner = segment.elements.find((element) => element.id === id);
            const groupState =
              owner?.parentId === undefined ? undefined : currentSlide.states[owner.parentId];

            let box: Box;
            if (groupState) {
              const scene = childBoxInScene(groupState, currentState);
              box = childBoxInGroup(groupState, {
                ...scene,
                x: scene.x + intent.dx,
                y: scene.y + intent.dy,
              });
            } else {
              box = {
                x: currentState.x + intent.dx,
                y: currentState.y + intent.dy,
                width: currentState.width,
                height: currentState.height,
                rotation: currentState.rotation,
              };
            }
            // Округления здесь нет намеренно: у ребёнка повёрнутой группы
            // локальные координаты дробные по существу, и округление каждого
            // нажатия копило бы ошибку — пятнадцать нажатий увели бы объект
            // на несколько пикселей от того, куда его вела стрелка.
            nudged.set(id, box);

            dispatch({
              type: 'setElementState',
              elementId: id,
              patch: { x: box.x, y: box.y },
              at,
              commit: false,
            });
            moved = true;
          }

          /**
           * Охват группы следует за содержимым и когда его двигают стрелками,
           * а не только мышью (`endGesture` в `StageView`). Иначе одно и то же
           * действие автора давало бы разный результат в зависимости от того,
           * каким органом он его сделал, — расхождение, которое видно глазами:
           * рамка отстала бы от содержимого до следующей тяги мышью.
           */
          const activeGroupId = activeGroupOf(segment.elements, state.selectedIds);
          const activeGroupState =
            activeGroupId === undefined ? undefined : currentSlide.states[activeGroupId];
          if (moved && activeGroupId !== undefined && activeGroupState) {
            const children: GroupChildBox[] = [];
            for (const element of segment.elements) {
              if (element.parentId !== activeGroupId) continue;
              const childState = currentSlide.states[element.id];
              if (!childState) continue;
              // Сдвинутые берутся из `nudged`, остальные — как лежат: слайд
              // ещё не пересобран, и `currentSlide` для сдвинутых устарел.
              children.push({ id: element.id, box: nudged.get(element.id) ?? childState });
            }
            const reflow = reflowGroup(activeGroupState, children);
            if (reflow) {
              dispatch({
                type: 'setElementState',
                elementId: activeGroupId,
                patch: reflow.group,
                at,
                commit: false,
              });
              for (const child of reflow.children) {
                dispatch({
                  type: 'setElementState',
                  elementId: child.id,
                  patch: child.box,
                  at,
                  commit: false,
                });
              }
            }
          }

          if (moved) dispatch({ type: 'commit' });
          return;
        }
        case 'duplicate':
          /**
           * Вся пачка одним действием, а не циклом: копия трёх выделенных —
           * один жест автора и обязана быть одним шагом отмены (та же
           * причина, по которой сдвиг стрелками выше склеивается в один
           * шаг через `commit: false` + `commit`).
           *
           * `preventDefault` уже вызван выше на любое намерение — без него
           * Chrome открыл бы окно «добавить в закладки» поверх редактора.
           */
          dispatch({ type: 'duplicateElements', ids: state.selectedIds, at: headTimeRef() });
          return;
        case 'copy':
          dispatch({ type: 'copyElements', ids: state.selectedIds });
          return;
        case 'cut':
          dispatch({ type: 'cutElements', ids: state.selectedIds });
          return;
        case 'paste':
          // Вставка идёт в слайд ПОД ГОЛОВКОЙ, как и копия по Ctrl+D:
          // на голом месте дорожки она рождает слайд, и это та же правка
          // сцены, а не особый случай.
          dispatch({ type: 'pasteElements', at: headTimeRef() });
          return;
        case 'undo':
          dispatch({ type: 'undo' });
          return;
        case 'redo':
          dispatch({ type: 'redo' });
          return;
        case 'deselect':
          handleSelect(undefined);
          return;
        case 'zoom':
          // Масштаб — состояние ВИДА сцены, и живёт он в StageView (см. шапку
          // `stage/zoom.ts`: у числа обязан быть ровно один потребитель).
          // Здесь только мост, как и у commitText ниже.
          if (intent.to === 'in') stageRef.current?.zoomIn();
          else if (intent.to === 'out') stageRef.current?.zoomOut();
          else stageRef.current?.zoomFit();
          return;
        case 'commitText':
          // Escape во время правки текста на холсте. StageView сам знает,
          // какой узел сейчас редактируется, и сам решает, коммитить ли
          // (содержимое могло не измениться) — здесь только мост к нему.
          stageRef.current?.commitTextEdit();
          return;
        case 'group':
          dispatch({ type: 'groupElements', ids: state.selectedIds });
          return;
        case 'ungroup': {
          /**
           * Разбирается ПЕРВАЯ группа среди выделенных, а не все сразу.
           *
           * Выделить две группы одновременно сегодня можно (рамкой), и
           * разобрать обе одним нажатием выглядело бы логично. Но `canUngroup`
           * отвечает «есть ли что разбирать», а не «сколько», и разборка
           * пачки — отдельное действие с отдельным вопросом про историю.
           * Берём одну и не притворяемся, что умеем больше.
           */
          const group = state.selectedIds
            .map((id) => segment.elements.find((element) => element.id === id))
            .find((element) => element?.type === 'group');
          // `canUngroup` уже проверил, что группа есть; молчаливый выход
          // здесь означал бы расхождение двух проверок одного факта.
          if (group === undefined) {
            throw new Error('Ctrl+Shift+G дошёл до обработчика, но группы среди выделенного нет');
          }
          dispatch({ type: 'ungroupElements', groupId: group.id });
          return;
        }
        default: {
          /**
           * Забытое намерение — МОЛЧАЛИВЫЙ дефект, а не безобидный пропуск.
           *
           * `preventDefault` выше уже отобрал сочетание у браузера. Ветка,
           * которой здесь нет, означает: родное действие браузера подавлено,
           * своё не выполнено, автор нажал и не получил ничего — ни реакции,
           * ни ошибки. Ровно тот класс, что «нарисовано, но не нажимается».
           *
           * `never` превращает это в ошибку ТИПИЗАЦИИ: новое намерение
           * в `KeyIntent` перестаёт собираться, пока ему не написан
           * обработчик. Дефект ловится до запуска, а не жалобой автора.
           */
          const unhandled: never = intent;
          throw new Error(
            `Намерение «${(unhandled as KeyIntent).kind}» описано в таблице клавиш, но не обработано`,
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedIds, currentSlide, handleDeleteSelected, handleSelect]);

  return (
    <div className="ed-root">
      <header className="ed-header">
        <strong className="ed-title">{currentProject.meta.title}</strong>
        {/* СЧЁТЧИК «7 элементов · 2 остановки» УБРАН из шапки 19.08.2026.
            Он не терялся: те же числа сказаны на экране ещё дважды —
            элементы перечислены списком, остановки посчитаны на голове
            полосы дорожки. Прежний комментарий бюджета шапки называл его
            первым кандидатом на вылет ровно по этой причине. Убран не ради
            места, а потому что повтор третьим шрифтом читается как новая
            величина, а не как та же самая. */}
        <span className="ed-actions">
          {/* ГРУППА 1 — история правок, ЗНАЧКАМИ.
              Словами она занимала 196 px на двоих, и при окне 1280 имени
              работы оставалось 69 px: шапка показывала «Демо:...». Огрызок
              хуже отсутствия — это в проекте записано измерением, и здесь
              он появился ровно из-за переноса облика (кегль вырос с 12
              до натурных 14). У обеих натур история правок — значки.
              Подпись не потеряна: она в aria-label и в подсказке. */}
          <span className="ed-actions-group">
          <IconButton
            label="Отменить"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!canUndoState(state)}
            reason="Отменять нечего"
          >
            <Icon name="undo" />
          </IconButton>
          <IconButton
            label="Повторить"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!canRedoState(state)}
            reason="Повторять нечего"
          >
            <Icon name="redo" />
          </IconButton>
          </span>

          {/* ГРУППА 2 — работа с файлом.

              «Сохранить» БОЛЬШЕ НЕ ГЛАВНАЯ (было утверждено 18.08.2026,
              переоткрыто владельцем 19.08.2026 при переносе облика с натуры).
              Причина не вкусовая: у обеих натур — Канвы и КапКута — залитая
              кнопка стоит в ПРАВОМ ВЕРХНЕМ УГЛУ и означает «отдать работу
              зрителю» («Поделиться», «Export»). Залитая кнопка в середине
              ряда не читается как главная: заливка среди пяти соседей
              работает, а положение — нет.

              Наш точный аналог «Поделиться» — «Открыть в плеере»: это конец
              работы автора. Он и стал главным, см. группу 3. */}
          <span className="ed-actions-group">
          <Button
            onClick={() => downloadProject(currentProject)}
          >
            Сохранить
          </Button>
          {/* Открытие файла — пара к «Сохранить». Настоящий input прячется:
              его вид не поддаётся оформлению и не совпадает с соседями,
              а нажатие по нему делает кнопка. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="ed-file-input"
            data-testid="open-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Значение сбрасывается сразу: иначе выбор ТОГО ЖЕ файла второй
              // раз не даст события change вовсе, и кнопка будет выглядеть
              // сломанной ровно в том случае, когда автор повторяет действие.
              event.target.value = '';
              if (file) void handleOpenFile(file);
            }}
          />
          <Button
            data-testid="open-file"
            disabled={!canWrite}
            title={canWrite ? undefined : 'Работа открыта в другой вкладке'}
            onClick={() => fileInputRef.current?.click()}
          >
            Открыть файл
          </Button>
          {/* Импорт презентации. Тот же приём со спрятанным input, что и выше. */}
          <input
            ref={pptxInputRef}
            type="file"
            accept={PPTX_ACCEPT}
            className="ed-file-input"
            data-testid="import-pptx-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleImportPptx(file);
            }}
          />
          <Button
            data-testid="import-pptx"
            disabled={!canWrite}
            title={canWrite ? 'Презентация из Canva, PowerPoint, Google Slides или Keynote' : 'Работа открыта в другой вкладке'}
            onClick={() => pptxInputRef.current?.click()}
          >
            Импорт презентации
          </Button>
          </span>

          {/* ГРУППА 3 — выход к зрителю. */}
          <span className="ed-actions-group">
          {/* Режим «смотреть как зритель, ответивший X» (product.md §2б [Р]).
              Без него условные варианты ответа физически непроверяемы: редактор
              показывает автору все варианты, а зритель видит часть, и увидеть
              эту часть автору больше негде. */}
          {viewAsVariables.length > 0 ? (
            <span className="ed-view-as" data-testid="view-as">
              {viewAsVariables.map((variable) => (
                /* Имя переменной ПОДПИСЬЮ поля, а не пунктом внутри списка:
                   иначе список растягивается по самому длинному пункту
                   и выдавливает соседей из шапки. Проверено глазами.

                   `ed-field--inline` спрямляет поле в строку: по умолчанию
                   подпись стоит НАД органом, а в шапке строка одна. */
                <ChoiceField
                  key={variable.name}
                  className="ed-field--inline ed-view-as-item"
                  /* Подпись — человеческая, а не ключ схемы.

                     Было `variable.name`, то есть `recordAs` остановки:
                     на видном месте шапки стояло «gate-choice». Автор
                     такого имени не задавал и прочитать его не может.

                     Одна остановка — подпись «Зритель»: различать нечего,
                     и короткое слово говорит о назначении органа больше,
                     чем текст вопроса. Несколько — подписью становится сам
                     вопрос: тогда различать НАДО, и никакое общее слово
                     этого не сделает. Полный вопрос стоит подсказкой
                     в обоих случаях. */
                  label={viewAsVariables.length === 1 ? 'Зритель' : variable.prompt || variable.name}
                  testId={`view-as-${variable.name}`}
                  value={viewAs[variable.name] ?? ''}
                  choices={[
                    { value: '', label: 'не отвечал' },
                    ...variable.options.map((option) => ({ value: option.id, label: option.label })),
                  ]}
                  onCommit={(value) =>
                    setViewAs((previous) => ({ ...previous, [variable.name]: value }))
                  }
                />
              ))}
            </span>
          ) : null}
          {/* ГЛАВНОЕ ДЕЙСТВИЕ, правый верхний угол. См. группу 2 о том,
              почему оно переехало сюда с «Сохранить». */}
          <Button
            kind="главная"
            onClick={() => openInPlayer(currentProject, previewUrl)}
          >
            Открыть в плеере
          </Button>
          </span>
        </span>
        {/* СТРОКА ВЫДЕЛЕНИЯ УЕХАЛА В ПОЛОСУ СВОЙСТВ (stage/PropBar.tsx).
            Она занимала правый верхний угол — самое заметное место окна,
            где у обеих натур стоит главное действие, — и печатала там
            «ничего не выделено». Хуже того, ровно то же самое было
            напечатано вторым текстом в полосе над холстом: «Ничего
            не выделено. Выберите элемент на холсте». Одна мысль дважды
            на одном экране — тот самый случай, который проект уже покупал
            («две панели рядом дают две одинаковые подписи»).

            Узел не спрятан и не удалён: он ПЕРЕЕХАЛ вместе со своим
            data-testid туда, где показания выделения и должны читаться —
            в полосу свойств этого самого выделения. Прятать его классом
            было бы прямым повторением дефекта «подписи полей невидимы»:
            двадцать e2e остались бы зелёными при пустом месте на экране. */}
      </header>

      {/* Полосы про слот работы — отдельной строкой ПОД шапкой, а не внутри
          неё. У `.ed-header` стоит `overflow: hidden` и `white-space: nowrap`:
          надпись там молча обрезалась бы многоточием, и автор увидел бы
          начало фразы вместо предупреждения. Состояние было бы верным,
          а человек не узнал бы ничего. */}
      {canWrite ? null : (
        <div className="ed-workspace-readonly" role="status" data-testid="workspace-readonly">
          Работа уже открыта в другой вкладке. Здесь можно смотреть, но правки
          не сохранятся — чтобы не затереть то, что вы делаете там.
        </div>
      )}
      {workError ? (
        <div className="ed-workspace-error" role="alert" data-testid="workspace-error">
          {workError}
        </div>
      ) : null}

      {/*
        Шесть прямых детей .ed-main — ровно столько же колонок в её гриде
        (styles.ts). Число ДЕТЕЙ держится постоянным вне зависимости от
        свёрнутости: свёрнутая зона отдаёт пустой узел на своё место
        (комментарий у каждого такого узла ниже), а не пропадает из DOM
        совсем, — иначе auto-placement грида сдвинул бы всех соседей
        в чужие колонки, потеряв рельс/сцену на месте. Ширины колонок
        обнуляются через инлайн-переменные на самом .ed-main: так же,
        как задизайнено в styles.ts (--ed-catalog-w, --ed-right-w и парные
        им --ed-*-splitter-w для ручек, которых у свёрнутой зоны нет).
      */}
      <div
        className="ed-main"
        style={{
          '--ed-catalog-w': chromeLayout.catalogCollapsed ? '0px' : `${chromeLayout.catalogWidth}px`,
          '--ed-catalog-splitter-w': chromeLayout.catalogCollapsed ? '0px' : '6px',
          '--ed-side-splitter-w': chromeLayout.sideCollapsed ? '0px' : '6px',
          '--ed-right-w': chromeLayout.sideCollapsed
            ? `${SIDE_SPINE_WIDTH_PX}px`
            : `${chromeLayout.sideWidth}px`,
        } as CSSProperties}
      >
        {/* Колонка 1: рельс категорий. Никогда не сворачивается — это
            единственная дорога назад для свёрнутого каталога. */}
        <CatalogRail current={panelId} onSelect={handleSelectCategory} />

        {/* Колонка 2: панель каталога. Свёрнутая — не рендерится вовсе
            (ширина колонки и так 0, а не отрисовывать содержимое дешевле
            и безопаснее: без overflow: hidden на .ed-catalog контент шириной
            350px в колонке 0px просто вылез бы поверх сцены). */}
        {chromeLayout.catalogCollapsed ? (
          <div aria-hidden="true" />
        ) : (
          <CatalogPanel
            title={currentCatalogCategory?.label ?? 'Объект'}
            query={catalogQuery}
            onQueryChange={setCatalogQuery}
            /* Заголовок печатается только у панелей без пункта на рейке:
               их имя больше нигде не подсвечено. */
            showTitle={currentCatalogCategory === undefined}
            onCollapse={handleToggleCatalogCollapsed}
          >
            {panelId === 'templates' ? (
              <TemplatesPanel
                onApply={handleApplyTemplate}
                query={catalogQuery}
                theme={currentProject.meta.theme}
                styles={currentProject.styles}
                baseSegment={currentSegment}
                // Схема на плитке рисуется в координатах СЦЕНЫ ПРОЕКТА, а не
                // в своих: у проекта 4:3 схема, нарисованная в 16:9, показала
                // бы не ту раскладку, которая ляжет.
                stage={{ width: currentProject.meta.stageWidth, height: currentProject.meta.stageHeight }}
              />
            ) : panelId === 'shapes' ? (
              <InsertPanel
                onInsert={handleInsert}
                category="shape"
                query={catalogQuery}
                sectionTitle="Фигуры для сцены"
                stage={{ width: currentProject.meta.stageWidth, height: currentProject.meta.stageHeight }}
                theme={currentProject.meta.theme}
                styles={currentProject.styles}
                baseSegment={currentSegment}
              />
            ) : panelId === 'text' ? (
              /* Вкладка «Текст» — НЕ сетка плиток, а список карточек
                 со ступенями размера: у натуры это другой компонент,
                 см. шапку TextStylesPanel.tsx. */
              <TextStylesPanel onInsert={handleInsert} query={catalogQuery} />
            ) : panelId === 'own' ? (
              <InsertPanel
                onInsert={handleInsert}
                category="own"
                query={catalogQuery}
                sectionTitle="Ваши файлы"
                stage={{ width: currentProject.meta.stageWidth, height: currentProject.meta.stageHeight }}
                theme={currentProject.meta.theme}
                styles={currentProject.styles}
                baseSegment={currentSegment}
              />
            ) : panelId === 'theme' ? (
              <ThemePanel
                theme={currentProject.meta.theme}
                onChangeRole={handleSetThemeRoleLive}
                onCommitHistory={handleCommitHistory}
                onApplyPalette={handleApplyPalette}
              />
            ) : panelId === 'styles' ? (
              <StylesPanel
                styles={currentProject.styles}
                segments={currentProject.segments}
                selectedElement={selected}
                selectedElementState={selectedState}
                onSave={handleSaveStyle}
                onApply={handleApplyStyle}
                onDelete={handleDeleteStyle}
                onTake={handleTakeStyles}
              />
            ) : (
              // panelId === 'object': панель свойств выделенного элемента —
              // переехала сюда с правой колонки (Сессия 30, задача «полоса
              // свойств»). Открывается кнопкой «Ещё» полосы над холстом, не
              // с рельса (см. chrome/catalog.ts). Пропсы те же, что раньше
              // стояли в <aside className="ed-side">.
              <Inspector
                element={selected}
                state={selectedState}
                styles={currentProject.styles}
                onContentChange={(content) => {
                  if (selected) handleElementContentChange({ ...selected, content });
                }}
                onStateChange={(patch) => {
                  if (selected) handleElementStateChange(selected.id, patch);
                }}
                onStateChangeLive={(patch) => {
                  if (selected) handleElementStateChangeLive(selected.id, patch);
                }}
                onCommitHistory={handleCommitHistory}
                // Блок «Расположение» (Сессия 48) — те же обработчики,
                // что раньше шли в PropBar, проведённые сюда без второй
                // реализации хода (см. комментарий ArrangeBlock в Inspector.tsx).
                selectedCount={state.selectedIds.length}
                onAlign={handleAlign}
                onDistribute={handleDistribute}
                onLayer={handleLayer}
                copyFormatEnabled={selected !== undefined && selectedState !== undefined}
                copyFormatArmed={copyFormat !== undefined}
                onCopyFormat={handleCopyFormat}
              />
            )}
          </CatalogPanel>
        )}

        {/* Колонка 3: ручка между каталогом и сценой. Тянуть у свёрнутого
            каталога нечего — ручка тогда не рендерится, трек колонки и так
            обнулён (--ed-catalog-splitter-w выше). */}
        {chromeLayout.catalogCollapsed ? (
          <div aria-hidden="true" />
        ) : (
          <Splitter
            width={chromeLayout.catalogWidth}
            min={CATALOG_WIDTH_MIN}
            max={CATALOG_WIDTH_MAX}
            side="left"
            onChange={handleCatalogWidthChange}
          />
        )}

        {/* Колонка 4: сцена. Всегда одна и та же ширина 1fr — сворачивание
            боковых зон её только увеличивает. */}
        <div className="ed-stages">
        {/*
          Полоска и холст — колонка. Полоска стоит НАД холстом в раскладке,
          а не поверх него: лёжа поверх, она перехватывала бы нажатия
          по элементам под собой (журнал Сессии 29, §8).
        */}
        <div className="ed-stage-cell">
        <PropBar
          selectedCount={state.selectedIds.length}
          selectionReadout={selectionReadout}
          styleFields={propbarFields}
          styleValueOf={propbarStyleValueOf}
          onStyleCommit={handlePropbarStyleCommit}
          onStyleLiveCommit={handlePropbarStyleLive}
          onStyleCommitHistory={handleCommitHistory}
          onOpenObject={() => handleSelectCategory('object')}
        />
        <StageView
          ref={stageRef}
          segment={segment}
          currentSlide={currentSlide}
          selectedIds={state.selectedIds}
          onSelect={handleStageSelect}
          onSelectMany={handleSelectMany}
          onElementStateChange={handleElementStateChangeLive}
          onElementContentChange={handleElementContentChange}
          onCommitHistory={handleCommitHistory}
          onContextMenu={handleStageContextMenu}
          onImageDrop={handleImageDrop}
          onReady={handleReady}
        />
        </div>
        </div>

        {/* Колонка 5: ручка между сценой и правой колонкой. Та же логика,
            что у колонки 3, только для правой стороны. */}
        {chromeLayout.sideCollapsed ? (
          <div aria-hidden="true" />
        ) : (
          <Splitter
            width={chromeLayout.sideWidth}
            min={SIDE_WIDTH_MIN}
            max={SIDE_WIDTH_MAX}
            side="right"
            onChange={handleSideWidthChange}
          />
        )}

        {/* Колонка 6: правая колонка. В отличие от каталога, свернуть её
            в пустоту нельзя — своего рельса у неё нет, и без видимого следа
            автор не нашёл бы дорогу назад (задание Сессии 30: «кнопка
            развернуть обязана остаться доступной у свёрнутой зоны»).
            Свёрнутая — это узкая полоска-корешок (.ed-side-spine) с ОДНОЙ
            кнопкой развернуть, а не пустой узел, как у колонок 2/3/5. */}
        {chromeLayout.sideCollapsed ? (
          <div className="ed-side-spine" aria-label="Слайды, сегменты и метки (свёрнуто)">
            <button
              type="button"
              className="ed-side-expand"
              data-testid="collapse-side"
              aria-expanded="false"
              aria-label="Развернуть правую колонку"
              onClick={handleToggleSideCollapsed}
            >
              <Icon name="chevron-left" />
            </button>
          </div>
        ) : (
          <aside className="ed-side" aria-label="Слайды, сегменты и метки">
            <div className="ed-side-collapse-row">
              <button
                type="button"
                className="ed-side-collapse"
                data-testid="collapse-side"
                aria-expanded="true"
                aria-label="Свернуть правую колонку"
                onClick={handleToggleSideCollapsed}
              >
                <Icon name="chevron-right" />
              </button>
            </div>
            {removalMessage ? (
              <span className="ed-notice" role="status" data-testid="removal-message">
                {removalMessage}
              </span>
            ) : null}
            {imageDropError ? (
              <span className="ed-failure" role="alert" data-testid="image-drop-error">
                {imageDropError}
              </span>
            ) : null}
            <ElementList
              rows={elementRows}
              selectedIds={state.selectedIds}
              onSelect={handleSelect}
              onPutOnSlide={(id) => dispatch({ type: 'putElementOnSlide', elementId: id })}
              onRemoveFromSlide={(id) => dispatch({ type: 'removeElementFromSlide', elementId: id })}
              headerAction={
                <Button
                  onClick={handleDeleteSelected}
                  disabled={state.selectedIds.length === 0}
                >
                  Удалить
                </Button>
              }
            />
            <SlidePanel
              slides={segment.slides}
              words={segment.words}
              currentSlideId={state.currentSlideId}
              onSelect={handleSelectSlide}
              onAdd={handleAddSlide}
              onRemove={handleRemoveSlide}
              cutProblem={(slideId) => slideCutProblem(currentSegment, slideId)}
            />
            {/* ADR-022: разрез без расшифровки потерял текст озвучки продолжения.
                Рядом с панелью глав — тот же класс сообщения, что и «Пустые
                главы» внутри неё (state/exits.ts: emptySegments), только здесь
                это разовое событие самого разреза, а не постоянно пересчитываемое
                состояние проекта (см. handleSplitAtGate выше). */}
            {speechSplitWarning ? (
              <span className="ed-warning" role="status" data-testid="speech-split-warning">
                {speechSplitWarning}
              </span>
            ) : null}
            <SegmentPanel
              project={currentProject}
              currentSegmentId={state.currentSegmentId}
              onSelectSegment={handleSelectSegment}
              onAddSegment={handleAddSegment}
              onRemoveSegment={handleRemoveSegment}
              onDuplicateSegment={handleDuplicateSegment}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onAddCondition={handleAddCondition}
              onRemoveCondition={handleRemoveCondition}
            />
            {markData ? (
              <MarkPanel
                mark={markData}
                elements={segment.elements}
                words={segment.words}
                onRetargetMark={handleRetargetMark}
                gateInsideTransition={markData.kind === 'gate'
                  && gateInsideTransition(markData.gate, segment.slides, segment.words)}
                onUpdateGate={handleUpdateGate}
                onSetSlideTransition={handleSetSlideTransition}
                onSetSlideTransitionDirection={handleSetSlideTransitionDirection}
                onSetSlideTransitionSeconds={handleSetSlideTransitionSecondsLive}
                onCommitHistory={handleCommitHistory}
                slideTransitionGapSeconds={selectedSlideGapSeconds}
                onRenameVariable={handleRenameVariable}
                variableProblemOf={variableProblemOf}
                onRemove={handleRemoveMark}
                onSplitAtGate={markData.kind === 'gate'
                  ? () => handleSplitAtGate(markData.gate.id)
                  : undefined}
                splitBlockedReason={markData.kind === 'gate'
                  ? splitBlockedReason(markData.gate, segment.words)
                  : undefined}
                /* Куда ведёт вариант — читается ЗДЕСЬ, где виден проект
                   целиком: правило выхода вправе смотреть на переменную,
                   записанную гейтом другой главы. Панель проекта не видит. */
                destinationOf={markData.kind === 'gate'
                  ? (optionId) => optionDestination(
                    currentProject, state.currentSegmentId, markData.gate.recordAs, optionId,
                  )
                  : undefined}
                /* Одна отправка на оба дела — глава и правило в неё. Ctrl+Z
                   обязан отменять их вместе: половина отката оставила бы
                   главу, до которой не дойти. Довод и устройство — в разборе
                   действия `branchFromOption` (state/project.ts). */
                onBranchFromOption={markData.kind === 'gate'
                  ? (optionId) => dispatch({
                    type: 'branchFromOption', gateId: markData.gate.id, optionId,
                  })
                  : undefined}
              />
            ) : (
              // Ничего не выделено и метка не выбрана — свойств показывать
              // нечего. Панель «Объект» (см. CatalogPanel выше) — единственное
              // место, где теперь стоит Inspector; двух его копий на экране
              // быть не должно (задание Сессии 30, «полоса свойств»).
              null
            )}
          </aside>
        )}

        {/* Колонка 7 (второй ряд): НИЖНЯЯ ЗОНА.

            Переехала сюда из корня редактора 20.08.2026. Была третьим
            рядом .ed-root и потому физически не могла не тянуться во всю
            ширину окна: рейка и каталог обрывались на середине высоты,
            а дорожка подныривала под них.

            У натуры наоборот, и это совпало у двух независимых продуктов:
            рейка и панель — колонны во всю высоту, а нижняя зона живёт
            ПРАВЕЕ них (замер КапКута: зона начинается с x = 356, а не
            с нуля). Совпавшее у двоих — закон, а не их вкусовщина.

            Сетка .ed-main получила второй ряд, первые три колонки
            растянуты на оба (styles.ts, правила .ed-main > :nth-child).
            Позиции заданы по номеру ребёнка, а не по классу: свёрнутые
            зоны отдают на своё место безымянный <div aria-hidden>,
            и правило по классу их бы не увидело. */}
      {/* Обёрнуты вместе: .ed-root — грид с тремя строками (auto 1fr auto),
          и третья строка обязана остаться ОДНИМ ребёнком, иначе разметка
          требует четвёртой строки. */}
      {/* Вид дописан классом, потому что потолок высоты зоны (styles.ts,
          --ed-zone-budget-offset) относится ТОЛЬКО к «Дорожкам». В «Ветках»
          зону разрешено растягивать — «там не рисуют на холсте»
          (`branches.md` §3), и её высоту задаёт своё правило (55vh
          у .ed-branches-space). Один потолок на оба вида ужал бы дерево
          веток на 34 px, то есть починил бы «Дорожки» за счёт вида,
          которого эта задача не касается. */}
      <div className={bottomView === 'branches' ? 'ed-track-column ed-track-column--branches' : 'ed-track-column ed-track-column--tracks'}>
        {/* Переключатель видов нижней зоны (`branches.md` §3, решение
            владельца 13.08.2026). Две кнопки, а не вкладки: их две
            и больше не будет.

            ХОЛСТ НЕ ГАСНЕТ НИ В ОДНОМ ВИДЕ — несущее свойство, а не
            удобство: выбрав главу в «Ветках», автор сразу видит её
            картинку. Полноэкранный режим карты отвергнут именно потому,
            что этого дать не мог. Поэтому переключается только СОДЕРЖИМОЕ
            зоны, а раскладка выше не трогается вовсе.

            Три полосы-заголовка (крошки, «Озвучка», «Слайды») сведены
            в ОДНУ строку (Сессия 47): 117 из 367 px зоны по умолчанию
            уходило на три головы, прежде чем автор видел хоть секунду
            дорожки. Головы озвучки и слайдов — `AudioSourceHead`
            и `SlideStripHead` — встают в общий ряд с крошками и
            переключателем видов только в виде «Дорожки»: в «Ветках»
            им предмета нет вовсе, и вид «Ветки» этим не трогается. */}
        <div className="ed-zone-head">
          <span className="ed-zone-crumbs" data-testid="zone-crumbs">
            Основная › {currentSegment.title || currentSegment.id}
          </span>
          {bottomView === 'tracks' ? (
            <>
              <AudioSourceHead state={audioSource} />
              <SlideStripHead
                slides={segment.slides}
                words={segment.words}
                currentSlideId={state.currentSlideId}
                collapsed={slidesCollapsed}
                onToggleCollapsed={() => setSlidesCollapsed((was) => !was)}
                onDuplicate={handleDuplicateSlide}
                onCopy={handleCopySlide}
                onCut={handleCutSlide}
                onPaste={handlePasteSlide}
                cutProblem={currentSlideCutProblem}
                duplicateProblem={slideSpotProblem}
                pasteProblem={slidePasteProblem}
              />
            </>
          ) : null}
          <span className="ed-zone-views">
            <button
              type="button"
              className={bottomView === 'tracks' ? 'ed-zone-view ed-zone-view--on' : 'ed-zone-view'}
              data-testid="view-tracks"
              aria-pressed={bottomView === 'tracks'}
              onClick={() => setBottomView('tracks')}
            >
              Дорожки
            </button>
            <button
              type="button"
              className={bottomView === 'branches' ? 'ed-zone-view ed-zone-view--on' : 'ed-zone-view'}
              data-testid="view-branches"
              aria-pressed={bottomView === 'branches'}
              onClick={() => setBottomView('branches')}
            >
              Ветки
            </button>
            {/* Второе окно показывает дерево веток во весь экран — решение
                владельца 16.08.2026 (`tracks.md` §4). Кнопка стоит рядом
                с переключателем видов, а не в верхней полосе: она про то же
                самое дерево, и искать её автор будет здесь. */}
            <button
              type="button"
              className="ed-zone-view"
              data-testid="open-second-window"
              onClick={handleOpenSecondWindow}
              title="Дерево веток во весь экран на втором мониторе"
            >
              Второе окно
            </button>
          </span>
        </div>

        {bottomView === 'branches' ? (
          <BranchesView
            lanes={lanes}
            currentId={state.currentSegmentId}
            onPick={handleSelectSegment}
            onRename={handleRenameSegment}
            range={durationSpread}
            extractReason={(ids) => extractBlockedReason(currentProject, ids)}
            onExtract={(chapterIds) => dispatch({ type: 'extractToBranch', chapterIds })}
          />
        ) : (
        <>
        <SlideStripNote
          cutProblem={currentSlideCutProblem}
          duplicateProblem={slideSpotProblem}
          pasteProblem={slidePasteProblem}
        />
        {audioSource.open ? (
          <AudioSourceBody
            state={audioSource}
            speech={currentSegment.speech ?? ''}
            onSpeechChange={handleSpeechChange}
            onCommitHistory={handleCommitHistory}
          />
        ) : null}
        {!slidesCollapsed ? (
          <SlideStripCards
            theme={segment.theme}
            styles={segment.styles}
            slides={segment.slides}
            words={segment.words}
            elements={segment.elements}
            currentSlideId={state.currentSlideId}
            stageWidth={segment.stage.width}
            stageHeight={segment.stage.height}
            onSelectSlide={handleSelectSlide}
          />
        ) : null}
        <TrackView
          transport={transport}
          soundLabel={soundLabel}
          words={segment.words}
          marks={marks}
          selectedMark={selectedMark}
          onSelectMark={handleSelectMark}
          onMoveMark={handleMoveMark}
          onMoveMarkEnd={handleCommitHistory}
          slideCount={segment.slides.length}
          onAddGate={handleAddGate}
          onSplitHere={handleSplitHere}
          splitProblem={splitProblem}
          splitNotice={splitNotice}
          colorOrphanCount={colorOrphanCount}
          onTransitionSecondsLive={handleTrackTransitionSecondsLive}
          onTransitionSecondsCommit={handleCommitHistory}
          bubble={bubble}
          onCreateSpan={handleCreateSpan}
          onEditSpan={handleEditSpan}
          onEditSpanEnd={handleCommitHistory}
          onRemoveSpan={handleRemoveSpan}
        />
        </>
        )}
      </div>
      </div>

      {/*
        Меню правой кнопки — соседка всей раскладки, а не потомок сцены.
        У сцены свой `transform` масштаба, а `position: fixed` внутри
        трансформированного предка перестаёт быть оконным и начинает
        считаться от него: меню промахивалось бы мимо курсора тем сильнее,
        чем мельче масштаб.
      */}
      {contextMenuAt === undefined ? null : (
        <ContextMenu
          at={contextMenuAt}
          items={contextMenuItems}
          onClose={() => setContextMenuAt(undefined)}
        />
      )}
    </div>
  );
}
