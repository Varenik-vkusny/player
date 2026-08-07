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
  type ReactElement,
} from 'react';

import type { Condition, Element, ElementState, Gate, Project, Slide, Theme, TimeRef, Word } from '@player/core';
import { findSegment } from '@player/core';
import { morphSecondsFor, segmentOf, type ScenePreview } from '@player/player';

import { keyToIntent, type KeyContext } from './keyboard.js';
import { ELEMENTS, GATES, plural } from './plural.js';
import { ElementList } from './panels/ElementList.js';
import { toRows } from './panels/elementRows.js';
import { SegmentPanel } from './panels/SegmentPanel.js';
import { Inspector } from './panels/Inspector.js';
import { InsertPanel } from './panels/InsertPanel.js';
import { MarkPanel, type SelectedMarkData } from './panels/MarkPanel.js';
import { formatRemovalMessage, statesOnSlides } from './panels/removalMessage.js';
import { SlidePanel } from './panels/SlidePanel.js';
import { TemplatesPanel } from './panels/TemplatesPanel.js';
import { ThemePanel } from './panels/ThemePanel.js';
import { canRedoState, canUndoState, historyReducer, initialHistoryState } from './state/editorHistory.js';
import { createElement } from './state/elements.js';
import { answerVariables, variableRenameProblem } from './state/exits.js';
import { createGate, gateInsideTransition } from './state/gates.js';
import { speechLossWarning, splitBlockedReason } from './state/split.js';
import { createImageElement, encodeImageFile } from './state/image.js';
import { libraryItem } from './state/library.js';
import { freeId, pasteProblemAt, segmentSlide, type MarkKind } from './state/project.js';
import { cutProblem as slideCutProblem, slideAt as slideAtSeconds, slideOnMark } from './state/slides.js';
import { sceneTemplate } from './state/templates.js';
import { TRANSITION_INFO } from './transitions.js';
import { downloadProject, openInPlayer, openProjectFile } from './state/save.js';
import { saveWork } from './state/workspace.js';
import { wordMarkCount } from './state/audio.js';
import { StageView, type StageViewHandle } from './stage/StageView.js';
import { WatchStage } from './stage/WatchStage.js';
import { AudioSourcePanel } from './track/AudioSourcePanel.js';
import { anchorStateOf, markSeconds, timeRefAt } from './track/marks.js';
import type { Mark } from './track/MarksLane.js';
import { SlideStrip } from './track/SlideStrip.js';
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

  /**
   * Имя звука в голове полосы `sound` дорожки (каркас, задача 2.1).
   *
   * Настоящее человеческое имя файла грузится АСИНХРОННО из хранилища
   * плеера, и делает это уже `AudioSourcePanel` (`getAudio(source.fileId)`)
   * — тот компонент менять нельзя (закрытый список задачи), а второй
   * асинхронный запрос к тому же хранилищу отсюда завёл бы вторую правду
   * об одном и том же имени. Здесь — тот же запасной вид, что `AudioSourcePanel`
   * сама показывает ДО того, как асинхронное имя пришло: идентификатор
   * файла или URL, не выдуманное «красивое» имя.
   */
  const soundLabel = segment.source.kind === 'file' ? segment.source.fileId : segment.source.url;

  const selected =
    state.selectedId === undefined
      ? undefined
      : segment.elements.find((element) => element.id === state.selectedId);

  /**
   * Состояние выделенного элемента на ТЕКУЩЕМ слайде.
   *
   * undefined — законный случай, а не рассинхрон: список элементов
   * (ElementList) специально показывает элементы, ещё не появившиеся
   * на этом слайде, и автор вправе выделить такой элемент — просто
   * геометрию и вид у него на этом слайде взять неоткуда.
   */
  const selectedState = selected === undefined ? undefined : currentSlide.states[selected.id];

  const selectionReadout =
    selected === undefined
      ? 'ничего не выделено'
      : selectedState === undefined
        ? `${selected.id}: нет на этом слайде`
        : `${selected.id}: ${selectedState.x} × ${selectedState.y}, `
          + `${selectedState.width}×${selectedState.height}, ${selectedState.rotation}°`;

  // Выделение метки на дорожке — состояние вида, а не проекта: в файл оно
  // не попадает и переписку интерфейса переживать не обязано (как и раньше).
  // Выделение элемента и выделение метки исключают друг друга: панель справа
  // показывает ровно одно из двух, и клавиатурные команды (Delete, стрелки)
  // обязаны однозначно понимать, что выделено.
  const [selectedMark, setSelectedMark] = useState<{ kind: MarkKind; id: string } | undefined>(
    undefined,
  );

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
  // в восстановленном проекте» для state.selectedId, только selectedMark
  // здесь не часть history и сама себя не проверяет.
  useEffect(() => {
    if (selectedMark && !markData) setSelectedMark(undefined);
  }, [selectedMark, markData]);

  const handleSelect = useCallback((id: string | undefined) => {
    // Выделение элемента и метки взаимоисключающи (см. комментарий выше).
    setSelectedMark(undefined);
    dispatch({ type: 'select', id });
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
    ? 'Буфер пуст: сначала скопируйте или вырежьте слайд'
    : slideSpotProblem;

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
   * Живое событие правки роли темы (`ThemePanel.tsx`) — тот же приём, что
   * у `handleElementStateChangeLive`: `commit: false` на каждое движение
   * пипетки/нажатие клавиши, коммит-точку ставит `handleCommitHistory`
   * на потере фокуса поля.
   */
  const handleSetThemeRoleLive = useCallback((role: keyof Theme, value: string) => {
    dispatch({ type: 'setThemeRole', role, value, commit: false });
  }, []);

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
    const id = state.selectedId;
    if (id === undefined) return;
    setRemovalMessage(formatRemovalMessage(id, statesOnSlides(segment.slides, id)));
    dispatch({ type: 'removeElement', id });
  }, [state.selectedId, segment.slides]);

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
      title: `${gate.config.kind === 'choice' && gate.config.correctId === null ? 'Развилка' : 'Остановка'} «${gate.id}»`,
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
        title: slide.transition === 'cut'
          ? `Слайд «${slide.id}»: ${info.label.toLowerCase()}, без движения`
          : `Слайд «${slide.id}»: ${info.label.toLowerCase()}, движение ${morphSeconds.toFixed(2)} с до метки`,
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
        hasSelection: state.selectedId !== undefined,
        // Правка текста на холсте (двойной клик по элементу, StageView.
        // beginTextEdit) ставит узлу contentEditable и фокусирует его —
        // проверка честная (реальное свойство DOM активного элемента),
        // а не флаг, который можно забыть сбросить.
        editingText: active instanceof HTMLElement && active.isContentEditable,
        inTextField: isTextFieldNode(active),
      };
      const intent = keyToIntent(event, context);
      if (!intent) return; // не наша клавиша — Tab и всё остальное продолжает жить своей жизнью

      event.preventDefault();

      switch (intent.kind) {
        case 'delete':
          handleDeleteSelected();
          return;
        case 'nudge': {
          const id = state.selectedId;
          if (id === undefined) return; // keyToIntent уже проверил hasSelection — здесь просто защита типов
          const currentState = currentSlide.states[id];
          if (!currentState) return; // элемент не появляется на этом слайде — двигать нечего
          dispatch({
            type: 'setElementState',
            elementId: id,
            patch: { x: currentState.x + intent.dx, y: currentState.y + intent.dy },
            at: headTimeRef(),
          });
          return;
        }
        case 'undo':
          dispatch({ type: 'undo' });
          return;
        case 'redo':
          dispatch({ type: 'redo' });
          return;
        case 'deselect':
          handleSelect(undefined);
          return;
        case 'commitText':
          // Escape во время правки текста на холсте. StageView сам знает,
          // какой узел сейчас редактируется, и сам решает, коммитить ли
          // (содержимое могло не измениться) — здесь только мост к нему.
          stageRef.current?.commitTextEdit();
          return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedId, currentSlide, handleDeleteSelected, handleSelect]);

  return (
    <div className="ed-root">
      <header className="ed-header">
        <strong className="ed-title">{currentProject.meta.title}</strong>
        <span className="ed-muted">
          {plural(segment.elements.length, ELEMENTS)} · {plural(segment.gates.length, GATES)}
        </span>
        <span className="ed-actions">
          <button
            type="button"
            className="ed-action"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!canUndoState(state)}
          >
            Отменить
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!canRedoState(state)}
          >
            Повторить
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={() => downloadProject(currentProject)}
          >
            Сохранить
          </button>
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
          <button
            type="button"
            className="ed-action"
            data-testid="open-file"
            disabled={!canWrite}
            title={canWrite ? undefined : 'Работа открыта в другой вкладке'}
            onClick={() => fileInputRef.current?.click()}
          >
            Открыть файл
          </button>
          {/* Режим «смотреть как зритель, ответивший X» (product.md §2б [Р]).
              Без него условные варианты ответа физически непроверяемы: редактор
              показывает автору все варианты, а зритель видит часть, и увидеть
              эту часть автору больше негде. */}
          {viewAsVariables.length > 0 ? (
            <span className="ed-view-as" data-testid="view-as">
              <span className="ed-view-as-title">смотреть как ответивший</span>
              {viewAsVariables.map((variable) => (
                <label key={variable.name} className="ed-view-as-item">
                  {/* Имя переменной подписью, а не внутри каждого пункта:
                      иначе селект растягивается по самому длинному пункту
                      и выдавливает соседей из шапки. Проверено глазами. */}
                  <span className="ed-view-as-name">{variable.name}</span>
                  <select
                    className="ed-view-as-select"
                    data-testid={`view-as-${variable.name}`}
                    value={viewAs[variable.name] ?? ''}
                    onChange={(event) =>
                      setViewAs((previous) => ({ ...previous, [variable.name]: event.target.value }))
                    }
                  >
                    <option value="">не отвечал</option>
                    {variable.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </span>
          ) : null}
          <button
            type="button"
            className="ed-action"
            onClick={() => openInPlayer(currentProject, previewUrl)}
          >
            Открыть в плеере
          </button>
        </span>
        <span className="ed-selection" data-testid="selection-readout">
          {selectionReadout}
        </span>
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

      <div className="ed-main">
        {/* Две сцены рядом — решение владельца 31.07.2026 и закрытие долга
            §12.5, открытого с Сессии 7. Слева «правлю»: один слайд, жесты,
            выделение. Справа «смотрю»: полный сегмент в секунду головки —
            единственное место, где автор видит сам ПЕРЕХОД. */}
        <div className="ed-stages">
        <StageView
          ref={stageRef}
          segment={segment}
          currentSlide={currentSlide}
          selectedId={state.selectedId}
          onSelect={handleSelect}
          onElementStateChange={handleElementStateChangeLive}
          onElementContentChange={handleElementContentChange}
          onCommitHistory={handleCommitHistory}
          onImageDrop={handleImageDrop}
          onReady={handleReady}
        />
        <div className="ed-watch" aria-label="Как это выглядит на дорожке">
          <span className="ed-watch-title">
            смотрю · {transport.positionSeconds.toFixed(2)} с
          </span>
          <WatchStage segment={segment} seconds={transport.positionSeconds} />
        </div>
        </div>
        <aside className="ed-elements-panel" aria-label="Элементы сцены">
          <InsertPanel onInsert={handleInsert} />
          <TemplatesPanel onApply={handleApplyTemplate} />
          <div className="ed-delete-row">
            <button
              type="button"
              className="ed-action"
              onClick={handleDeleteSelected}
              disabled={state.selectedId === undefined}
            >
              Удалить
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
            selectedId={state.selectedId}
            onSelect={handleSelect}
            onPutOnSlide={(id) => dispatch({ type: 'putElementOnSlide', elementId: id })}
            onRemoveFromSlide={(id) => dispatch({ type: 'removeElementFromSlide', elementId: id })}
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
              Рядом с панелью частей — тот же класс сообщения, что и «Пустые
              части» внутри неё (state/exits.ts: emptySegments), только здесь
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
          <ThemePanel
            theme={currentProject.meta.theme}
            onChangeRole={handleSetThemeRoleLive}
            onCommitHistory={handleCommitHistory}
          />
        </aside>
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
          />
        ) : (
          <Inspector
            element={selected}
            state={selectedState}
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
          />
        )}
      </div>

      {/* Обёрнуты вместе: .ed-root — грид с тремя строками (auto 1fr auto),
          и третья строка обязана остаться ОДНИМ ребёнком, иначе разметка
          требует четвёртой строки. AudioSourcePanel стоит над дорожкой —
          то же место, где автор уже ищет свойства звука (играть/пауза,
          часы, кнопка остановки живут в её собственной шапке чуть ниже). */}
      <div className="ed-track-column">
        <AudioSourcePanel
          source={segment.source}
          wordMarkCount={audioWordMarkCount}
          onReplace={handleReplaceAudio}
          onReplaceWithTranscript={handleReplaceAudioWithTranscript}
          onWordsTranscribed={handleWordsTranscribed}
          lastRetarget={state.lastRetarget}
          speech={currentSegment.speech ?? ''}
          onSpeechChange={handleSpeechChange}
          onCommitHistory={handleCommitHistory}
        />
        <SlideStrip
          theme={segment.theme}
          slides={segment.slides}
          words={segment.words}
          elements={segment.elements}
          currentSlideId={state.currentSlideId}
          stageWidth={segment.stage.width}
          stageHeight={segment.stage.height}
          onSelectSlide={handleSelectSlide}
          onDuplicate={handleDuplicateSlide}
          onCopy={handleCopySlide}
          onCut={handleCutSlide}
          onPaste={handlePasteSlide}
          cutProblem={slideCutProblem(currentSegment, state.currentSlideId)}
          duplicateProblem={slideSpotProblem}
          pasteProblem={slidePasteProblem}
        />
        <TrackView
          transport={transport}
          soundLabel={soundLabel}
          words={segment.words}
          marks={marks}
          selectedMark={selectedMark}
          onSelectMark={handleSelectMark}
          onMoveMark={handleMoveMark}
          onMoveMarkEnd={handleCommitHistory}
          onAddGate={handleAddGate}
          onTransitionSecondsLive={handleTrackTransitionSecondsLive}
          onTransitionSecondsCommit={handleCommitHistory}
        />
      </div>
    </div>
  );
}
