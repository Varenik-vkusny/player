/**
 * Дорожка: волна, головка, перемотка мышью и строка транскрипта.
 *
 * Компонент презентационный. Он не грузит звук, не декодирует и не считает
 * пики — всё это делает Transport, который про React не знает. Сюда приходят
 * готовые числа, отсюда уходят вызовы transport.seek. Когда интерфейс будут
 * переписывать, выбросят этот файл, а не то, что умеет продукт.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { Word } from '@player/core';

import { plural, type PluralForms } from '../plural.js';
import type { MarkKind } from '../state/project.js';
import { nextOrphan } from './marks.js';
import { MarksLane, type Mark } from './MarksLane.js';
import {
  COLLAPSED_H,
  hiddenNote,
  lanesOf,
  laneHeight,
  marksBodyHeight,
  minHeightOf,
  resolveDrag,
  SEPARATOR_H,
  trackTier,
  trackDefaultHeight,
  type LaneName,
  type TrackTier,
} from './tiers.js';
import { BubbleLane } from './BubbleLane.js';
import type { SpanRange } from './spans.js';
import type { TransportApi } from './useTransport.js';
import { Waveform } from './Waveform.js';
import { clockText } from '../timeText.js';
/* Меню правой кнопки берётся ГОТОВОЕ, у сцены. Второе всплывающее меню
   в одном редакторе — это два места, где одно и то же поведение (разворот
   у края окна, обход с клавиатуры, гашение невозможного пункта) начнёт
   расходиться на первой же правке. */
import { ContextMenu, type MenuItem } from '../stage/ContextMenu.js';
import { PlainSelect } from '../ui/index.js';
import { canvasWidth, largestFittingZoom, zoomBlockedReason, zoomFits, ZOOM_STEPS, type ZoomStep } from './zoom.js';

/** Разделитель между полосами — толщиной из `tiers.ts`, который её же и складывает. */
const SEPARATOR: CSSProperties = { borderTop: `${SEPARATOR_H}px solid var(--ui-line)` };

/**
 * Тела полос дорожки (задача 2.1, каркас): та же последовательность, что
 * и головы (`lanesOf(tier)`), но `slides` и `stops` слиты в одно тело
 * `marks` — так уже устроен продукт (`tiers.ts: marksBodyHeight`, разметка
 * `.ed-mark-slide`/`.ed-mark-gate` разведена по `top` внутри ОДНОГО полотна).
 */
function bodyLanesOf(tier: TrackTier, showBubble: boolean): readonly LaneName[] {
  const lanes: LaneName[] = [];
  for (const lane of lanesOf(tier, showBubble)) {
    if (lane === 'stops') continue; // слито в предыдущую 'slides' → 'marks'
    lanes.push(lane === 'slides' ? 'marks' : lane);
  }
  return lanes;
}

/** Заголовок головы полосы — словами автора, не схемы (`product.md` §2а). */
function laneTitle(lane: LaneName, _soundLabel: string): string {
  switch (lane) {
    case 'ruler':
      return '';
    case 'bubble':
      // «Капля», а не «видео» и не «голова»: словарь един для автора
      // и зрителя, и в спецификации это называется каплей везде.
      return 'Капля';
    case 'sound':
      // «Звук», а не имя файла: заголовок называет ПОЛОСУ, подпись под ним —
      // её содержимое, как у остальных («Слайды» / «6»). Имя файла ушло
      // в подпись ещё и потому, что человеческого имени сюда не доходит:
      // оно грузится асинхронно внутри AudioSourcePanel, и в крупной строке
      // стоял бы сырой идентификатор.
      return 'Звук';
    case 'slides':
      return 'Слайды';
    case 'stops':
      return 'Остановки';
    case 'words':
      return 'Расшифровка';
    case 'marks':
      // Достижимо только на ступени 'minimal' (слайды и остановки слиты
      // уже в головах) — эта ступень в задаче 2.1 не включается: высота
      // дорожки не меняется ничем (ручка — задача 2.2), тир всегда 'full'.
      return 'Слайды и остановки';
  }
}

/** Подпись под заголовком головы — содержимое полосы: число или имя звука. */
function laneNote(
  lane: LaneName,
  counts: { slides: number; stops: number; words: number; spans: number },
  soundLabel: string,
): string {
  switch (lane) {
    case 'ruler':
      return '';
    case 'bubble':
      // Число ОТРЕЗКОВ, а не «есть капля / нет капли»: полоса уже отвечает
      // на второй вопрос самим своим присутствием. Ноль здесь осмыслен —
      // «капля есть, и всё время ею распоряжается зритель».
      return String(counts.spans);
    case 'sound':
      return soundLabel;
    case 'slides':
      return String(counts.slides);
    case 'stops':
      return String(counts.stops);
    case 'words':
      return String(counts.words);
    case 'marks':
      return String(counts.slides + counts.stops);
  }
}

/** Винительный падеж: «Проверьте 1 метку / 2 метки / 5 меток». */
const ORPHAN_MARKS: PluralForms = { one: 'метку', few: 'метки', many: 'меток' };
/** Тот же падеж: «Проверьте 1 место / 2 места / 5 мест». */
const ORPHAN_COLORS: PluralForms = { one: 'место', few: 'места', many: 'мест' };

export interface TrackViewProps {
  transport: TransportApi;
  /**
   * Имя звука в голове полосы `sound` (каркас, задача 2.1). Считается наверху
   * (`Editor.tsx`) от `segment.source`: у файла имя грузится асинхронно из
   * хранилища плеера уже внутри `AudioSourcePanel` (тот компонент трогать
   * нельзя — закрытый список задачи), поэтому здесь тот же запасной вид,
   * что показывает сама панель ДО того, как асинхронное имя пришло —
   * идентификатор файла или URL, а не выдуманное «красивое» имя.
   */
  soundLabel: string;
  words: readonly Word[];
  marks: readonly Mark[];
  selectedMark: { kind: MarkKind; id: string } | undefined;
  onSelectMark: (kind: MarkKind, id: string) => void;
  onMoveMark: (kind: MarkKind, id: string, seconds: number) => void;
  /** Перетаскивание метки завершено — точка коммита истории (срез 2). */
  onMoveMarkEnd: () => void;
  /**
   * Сколько слайдов в главе — подпись под головой полосы «Слайды».
   *
   * Именно СЛАЙДОВ, а не меток: первый слайд стоит на нуле и ромба
   * на дорожке не получает, поэтому счёт по меткам давал число на единицу
   * меньше того, что показывает лента слайдов на том же экране.
   */
  slideCount: number;
  /** Добавляет гейт на текущей позиции. */
  onAddGate: () => void;
  /**
   * Ставит метку на текущей позиции: глава делится надвое.
   *
   * `product.md` §2з [Р] — отмена прежнего [Р] «разрезать можно только
   * на гейте». Позицию сюда не передаём: она и так живёт в транспорте,
   * а второй её экземпляр в пропе разошёлся бы с головкой ровно тогда,
   * когда автор её двигает.
   */
  onSplitHere: () => void;
  /** Разрезать главу по развилке — у метки, у которой есть варианты ответа. */
  onSplitAtGate: (gateId: string) => void;
  /** Есть ли у метки варианты ответа: от этого зависит, каким будет разрез. */
  hasOptions: (gateId: string) => boolean;
  /**
   * Почему разрез сейчас невозможен. Считает ОДНА функция на весь редактор
   * (`state/project.ts`, `splitHereProblem`), и та же, которой отказывает
   * сам разрез — иначе кнопка и действие расходятся в промежутке между
   * сменой главы и дозагрузкой её дорожки, и разрез бросает из редьюсера,
   * снимая всё дерево React. Так и случилось 17.08.2026.
   */
  splitProblem: string | undefined;
  /**
   * Что получилось у ПОСЛЕДНЕГО разреза по времени и что делать дальше.
   *
   * Строка приезжает готовой (`state/split.ts`, `splitAtTimeNotice`), а не
   * собирается здесь: имя продолжения считает разрез, и второй счёт разошёлся
   * бы с ним ровно тогда, когда имя занято и появляется число.
   *
   * `undefined` — разреза в этой главе ещё не было, и строки нет вовсе.
   * Пустая строка-заготовка «ничего не произошло» приучала бы глаз
   * пропускать это место, ровно как отменённое «0 меток требуют проверки».
   */
  splitNotice?: string | undefined;
  /**
   * Сколько мест ссылаются на цвет темы, который не разрешится.
   *
   * Числом, а не списком: панель дорожки показывает СЧЁТЧИК, а разбор
   * мест — дело панели стилей. Считается наверху (`Editor.tsx`) функцией
   * `colorOrphans`, потому что ей нужны стили ПРОЕКТА, а сюда приезжает
   * только один сегмент.
   *
   * Умолчание — ноль: без него каждый вызывающий обязан был бы считать
   * сирот, даже если ему это не нужно.
   */
  colorOrphanCount?: number;
  /** Живое событие ручки стыка (Задача 5) — пробрасывается в `MarksLane`. */
  onTransitionSecondsLive: (id: string, seconds: number) => void;
  /** Жест ручки стыка завершён — коммит истории, как `onMoveMarkEnd`. */
  onTransitionSecondsCommit: () => void;
  /**
   * Капля этой главы и её отрезки «моё» — или `undefined`, если капли нет.
   *
   * `undefined` и «капля есть, отрезков ноль» — РАЗНЫЕ состояния, и второе
   * обязано показывать пустую полосу: решение владельца 16.08.2026 — полоса
   * появляется от появления капли, а не от появления отрезков. Пустая полоса
   * и есть сообщение «здесь всё время распоряжается зритель».
   */
  bubble?: {
    readonly elementId: string;
    /** Отрезки по порядку, секунды уже разрешены (`markSeconds`). */
    readonly spans: readonly SpanRange[];
  } | undefined;
  onCreateSpan: (range: SpanRange) => void;
  onEditSpan: (index: number, range: SpanRange) => void;
  onEditSpanEnd: () => void;
  onRemoveSpan: (index: number) => void;

  /*
   * Буфер слайдов приехал сюда из строки НАД дорожкой (Сессия 55).
   *
   * Там четыре кнопки стояли всегда, а под ними строкой печатались ТРИ
   * причины разом — по одной от каждой погашенной. В узкой зоне строка
   * переносилась на вторую, и замер дал прямое следствие: высота холста
   * зависела от того, влез ли текст в ширину окна (306 -> 322, холст
   * 344 -> 328, ровно 16 px).
   *
   * Теперь это пункты меню правой кнопки ПО МЕТКЕ СЛАЙДА: и действие,
   * и его причина стоят рядом со своим предметом, и причина показывается
   * ровно одна — та, что сейчас мешает.
   */
  /*
   * СКЛАДЫВАНИЕ ПОЛОС — У САМИХ ПОЛОС (Сессия 55, по слову владельца
   * 22.08.2026: «есть сверху кнопка слайды и кнопка озвучка… так и должно
   * быть точно?»).
   *
   * Нет, не должно. Это был последний остаток строки органов над дорожкой:
   * две кнопки, которые открывают панели СВОИХ полос, стояли в общем ряду
   * с крошками и счётчиком, и ничто не связывало их с тем, чем они
   * управляют. Теперь подпись полосы «Звук» и подпись полосы «Слайды» сами
   * и есть эти кнопки.
   */
  soundOpen: boolean;
  onToggleSound: () => void;
  /**
   * Почему складывать озвучку сейчас нельзя. `undefined` — можно.
   *
   * Кнопка при этом ОСТАЁТСЯ и гаснет, а не исчезает: спрятанный орган
   * неотличим от несуществующего, и автор считает его задуманным. Это уже
   * записанное правило проекта, и я нарушил его здесь на первой же правке —
   * поймали три e2e, которые ищут кнопку по имени.
   */
  soundToggleProblem: string | undefined;
  slidesOpen: boolean;
  onToggleSlides: () => void;
  /** Ставит слайд на секунде, куда показал автор. */
  onAddSlideHere: () => void;
  /** Убирает слайд, по метке которого открыто меню. */
  onRemoveSlide: (slideId: string) => void;
  /** Почему этот слайд убрать нельзя. `undefined` — можно. */
  slideRemoveProblem: (slideId: string) => string | undefined;
  onDuplicateSlide: () => void;
  onCopySlide: () => void;
  onCutSlide: () => void;
  onPasteSlide: () => void;
  slideCutProblem: string | undefined;
  /**
   * Почему нельзя поставить слайд в секунду головки. `undefined` — можно.
   *
   * До 25.08.2026 пункт «Поставить слайд здесь» был ЕДИНСТВЕННЫМ в этом
   * меню без проверки — и ронял редактор броском изнутри редьюсера,
   * когда на секунде уже стоял слайд.
   */
  addSlideProblem: string | undefined;
  slideDuplicateProblem: string | undefined;
  slidePasteProblem: string | undefined;
}

// Свой formatTime переехал в общий `clockText` (Сессия 47) вместе
// с защитой от нечисловой позиции: часы транспорта и подписи линейки —
// один случай, и запись у него одна.

/** Шаг делений линейки: столько секунд, чтобы подписи не слипались. */
function tickStep(duration: number, width: number): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  // Примерно 90 пикселей на подпись — иначе они наезжают друг на друга.
  const wanted = (duration * 90) / Math.max(width, 1);
  return candidates.find((step) => step >= wanted) ?? candidates[candidates.length - 1]!;
}

export function TrackView({
  transport,
  soundLabel,
  words,
  marks,
  selectedMark,
  onSelectMark,
  onMoveMark,
  onMoveMarkEnd,
  slideCount,
  onAddGate,
  onSplitHere,
  onSplitAtGate,
  hasOptions,
  splitProblem,
  splitNotice,
  colorOrphanCount = 0,
  onTransitionSecondsLive,
  onTransitionSecondsCommit,
  bubble,
  onCreateSpan,
  onEditSpan,
  onEditSpanEnd,
  onRemoveSpan,
  soundOpen,
  onToggleSound,
  soundToggleProblem,
  slidesOpen,
  onToggleSlides,
  onAddSlideHere,
  onRemoveSlide,
  slideRemoveProblem,
  onDuplicateSlide,
  onCopySlide,
  onCutSlide,
  onPasteSlide,
  slideCutProblem,
  addSlideProblem,
  slideDuplicateProblem,
  slidePasteProblem,
}: TrackViewProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const laneScrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<ZoomStep>(1);
  const draggingRef = useRef(false);

  // Высота дорожки и складывание (задача 2.2: жест тяги за кромку). Одно
  // состояние на оба поля НАМЕРЕННО — resolveDrag() из tiers.ts возвращает
  // { collapsed, height } одним значением ровно затем, чтобы вызывающий
  // не мог применить высоту, забыв про складывание. Между перезагрузками
  // НЕ сохраняется — решение владельца 06.08.2026: чтение хранилища может
  // бросить, а глушить ошибку запрещено (CLAUDE.md); заводить ради каркаса
  // ещё один слот хранения значило бы расширять объём.
  const [track, setTrack] = useState<{ collapsed: boolean; height: number }>({
    collapsed: false,
    // Глава с каплей открывается выше ровно на свою полосу: иначе полоса,
    // ради которой всё затевалось, оказалась бы за нижней кромкой в первый же
    // раз, и автор решил бы, что её нет.
    height: trackDefaultHeight(bubble !== undefined),
  });
  // «Спрятать полосу капли» — настройка АВТОРА ДЛЯ СЕБЯ, как mute и 👁
  // (`tracks.md` §2): в проект не пишется и до зрителя не доезжает.
  // Отрезки при этом никуда не деваются и продолжают действовать —
  // спрятана полоса, а не владение.
  const [bubbleLaneHidden, setBubbleLaneHidden] = useState(false);
  const showBubbleLane = bubble !== undefined && !bubbleLaneHidden;
  const { collapsed, height: trackHeight } = track;
  const tier = trackTier(trackHeight, showBubbleLane);
  const resizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  // `isPlaying` здесь больше не нужен: кнопка уехала в нижнюю полосу окна
  // вместе с часами. `failure` остался — сообщение о незагрузившейся дорожке
  // рисуется В ПОЛОСЕ ЗВУКА, на месте волны, которой из-за него и нет.
  const { positionSeconds, durationSeconds, peaks, failure } = transport;

  // Ширина видимого окна нужна и канвасу, и переводу времени в пиксели —
  // но меряется она у КОНТЕЙНЕРА прокрутки, не у полотна (.ed-lane): при
  // масштабе больше ×1 полотно само раздувается от ширины по zoom, и
  // наблюдатель, поставленный на него, мерил бы то, что сам же раздувает
  // (docs/plans/2026-08-06-track-zoom.md, Задача 2, шаг 3). Наблюдателем,
  // а не по событию окна: дорожка меняет ширину и когда окно не трогали —
  // например, если рядом откроется панель.
  //
  // Только ШИРИНА (каркас, задача 2.1): высота волны раньше бралась отсюда
  // же (clientHeight контейнера) обходом видимого скролбара одной полосы —
  // теперь контейнер общий на пять полос, скролбар отнимает высоту у ВСЕГО
  // стека, а не у волны, и высота волны считается формулой (laneHeight ниже),
  // а не измерением.
  useLayoutEffect(() => {
    const container = laneScrollRef.current;
    if (!container) throw new Error('TrackView: контейнер прокрутки не смонтирован');
    const measure = (): void => setWidth(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Полотно волны шириной laneWidth × zoom (track-zoom.md §2). При zoom === 1
  // совпадает с шириной контейнера — сегодняшний вид без изменений.
  const canvasWidthPx = canvasWidth(width, zoom);

  // Часть A: гашение кнопки (zoomBlockedReason ниже) останавливает только
  // ВЫБОР новой ступени — оно не спасает автора, который уже стоит на ×8
  // или ×16 и растягивает окно. `laneWidth × zoom` пересекает
  // MAX_CANVAS_WIDTH_PX в тот же кадр, и волна пропадает МОЛЧА (замер
  // в zoom.ts у largestFittingZoom). Проверка идёт при каждом изменении
  // ширины полосы: если активная ступень больше не помещается, опускаемся
  // на наибольшую, которая ещё помещается.
  useEffect(() => {
    if (zoomFits(width, zoom)) return;
    setZoom(largestFittingZoom(width));
  }, [width, zoom]);

  const progress = durationSeconds > 0 ? positionSeconds / durationSeconds : 0;

  // Прокрутка вслед за головкой (Задача 4). Проверка «видна ли головка»
  // обязана идти ПЕРЕД записью в scrollLeft: гнать прокрутку каждый кадр
  // воспроизведения отняло бы у автора возможность смотреть в другое место
  // дорожки во время игры звука. scrollIntoView здесь не годится — он
  // прокручивает и предков, то есть увёл бы всю страницу редактора; пишем
  // только в container.scrollLeft самого контейнера дорожки.
  useEffect(() => {
    const container = laneScrollRef.current;
    if (!container || durationSeconds <= 0) return;
    const headPx = progress * canvasWidthPx;
    const visibleStart = container.scrollLeft;
    const visibleEnd = visibleStart + container.clientWidth;
    if (headPx >= visibleStart && headPx <= visibleEnd) return;
    const maxScrollLeft = Math.max(0, canvasWidthPx - container.clientWidth);
    container.scrollLeft = Math.max(0, Math.min(headPx - container.clientWidth / 2, maxScrollLeft));
  }, [progress, canvasWidthPx, durationSeconds]);

  /** Экранная точка на дорожке → секунда. */
  const seekToPointer = useCallback(
    (clientX: number): void => {
      const lane = laneRef.current;
      if (!lane || durationSeconds <= 0) return;
      // Прямоугольник измеряется заново на каждое движение: полагаться
      // на запомненный нельзя — страницу могли прокрутить прямо в жесте.
      const rect = lane.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      transport.seek(Math.max(0, Math.min(1, ratio)) * durationSeconds);
    },
    [durationSeconds, transport],
  );

  const handleDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekToPointer(event.clientX);
    },
    [seekToPointer],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (draggingRef.current) seekToPointer(event.clientX);
    },
    [seekToPointer],
  );

  const handleUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  /**
   * МАСШТАБ ДОРОЖКИ КОЛЕСОМ С CTRL.
   *
   * Пять кнопок-ступеней в строке транспорта заменены на этот жест плюс
   * один показатель в голове линейки. Жест не выдуман: Ctrl+колесо
   * масштабирует полотно во всех монтажных программах и в Фигме — это
   * индустриальная общность, а не чья-то собственность.
   *
   * `passive: false` обязателен, иначе `preventDefault` не сработает
   * и браузер отдаст жест СТРАНИЦЕ: Ctrl+колесо у него — масштаб всего
   * окна. Автор целился в дорожку, а уехал бы весь редактор.
   *
   * Обработчик вешается вручную, а не через onWheel: React вешает
   * колесо пассивно, и preventDefault внутри него молча не действует —
   * ровно тот случай, когда код верен, консоль чиста, а жест не работает.
   */
  useEffect(() => {
    const container = laneScrollRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const index = ZOOM_STEPS.indexOf(zoom);
      const next = ZOOM_STEPS[event.deltaY < 0 ? index + 1 : index - 1];
      if (next === undefined || next === zoom) return;
      // Та же проверка помещаемости, что стояла у кнопок: ступень, чьё
      // полотно не влезет в канву браузера, не выбирается. Без неё волна
      // пропадала бы МОЛЧА (замер в zoom.ts у largestFittingZoom).
      if (zoomBlockedReason(width, next) !== undefined) return;
      setZoom(next);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoom, width]);

  /**
   * Меню правой кнопки над дорожкой: что открыто и над чем.
   *
   * До Сессии 55 правой кнопки у дорожки не было вовсе — замер прямой:
   * `onContextMenu` не стоял ни на линейке, ни на полосах меток. Действия
   * жили кнопками в строке над дорожкой, вперемешку с навигацией
   * и переключателем вида.
   */
  const [menu, setMenu] = useState<
    { at: { x: number; y: number }; target: { kind: MarkKind | 'place'; id?: string } } | undefined
  >(undefined);

  const handleTrackContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      const node = (event.target as HTMLElement).closest<HTMLElement>('[data-mark-kind]');
      const kind = node?.dataset['markKind'];
      const id = node?.dataset['markId'];
      // Нажатие по метке СНАЧАЛА её выделяет — так же делает меню сцены
      // (снято с натуры у Канвы 11.08.2026). Иначе меню действовало бы
      // на прежнее выделение, а показано было бы над другим предметом.
      if ((kind === 'slide' || kind === 'gate') && id !== undefined) {
        onSelectMark(kind, id);
        setMenu({ at: { x: event.clientX, y: event.clientY }, target: { kind, id } });
        return;
      }
      /*
       * ГОЛОВКА ЗДЕСЬ УЖЕ СТОИТ ГДЕ НАДО, И ВТОРОЙ ПЕРЕМОТКИ БЫТЬ НЕ ДОЛЖНО.
       *
       * Пункты «поставить здесь» и «вставить здесь» метят в позицию головки,
       * поэтому щелчок обязан её туда привести. Приводит `pointerdown`
       * полотна (`handleDown` → `seekToPointer`), который у правой кнопки
       * тоже срабатывает и происходит РАНЬШЕ `contextmenu`.
       *
       * Своя перемотка здесь была бы не просто лишней, а ХУЖЕ: у `contextmenu`
       * тип события `MouseEvent`, и его `clientX` целочисленный, тогда как
       * у `pointerdown` он дробный. Замер: вторая перемотка сдвигала головку
       * до пикселя в сторону — при масштабе ×1 это около 0.06 с, — и место
       * под уже стоящим слайдом переставало считаться занятым. То есть более
       * грубое измерение затирало более точное.
       */
      setMenu({ at: { x: event.clientX, y: event.clientY }, target: { kind: 'place' } });
    },
    [onSelectMark],
  );

  /**
   * Состав меню — по тому, НА ЧТО нажали.
   *
   * Невозможный пункт гаснет, но остаётся: спрятать значило бы отобрать
   * действие молча, и автор решит, что его не существует. Причина стоит
   * ВИДИМОЙ строкой в самом пункте — не в `title`: на подсказки, как
   * измерено в проекте, не смотрят.
   *
   * И причина показывается ровно одна — та, что мешает этому действию.
   * Строка над лентой слайдов печатала три разом, от трёх разных кнопок.
   */
  const menuItems = useMemo((): readonly MenuItem[] => {
    if (menu === undefined) return [];

    /*
     * ДЕЛЕНИЕ МЕНЮ ИДЁТ ПО ТОМУ, НА ЧТО ДЕЙСТВИЕ ДЕЙСТВУЕТ, а не по тому,
     * что они «про слайды».
     *
     * Копировать и вырезать метят в ОБЪЕКТ — `state.currentSlideId`.
     * Вставить и дублировать метят в МЕСТО — секунду под головкой
     * (`headTimeRef`, Editor.tsx). Это видно прямо в их отправках:
     * у первых двух `slideId`, у вторых `at`.
     *
     * Сложи их в одно меню по метке — и получится дефект по построению.
     * Правый щелчок по метке ставит головку РОВНО на эту метку, значит
     * место под головкой заведомо занято ею же, и «Вставить»/«Дублировать»
     * гаснут ВСЕГДА с причиной «уже стоит слайд». Замер 21.08.2026,
     * фикстура demo при непустом буфере: позиция после щелчка 0.7999…
     * (секунда метки), оба пункта `aria-disabled="true"` — то есть автор
     * не мог вставить слайд ни разу и ни при каких условиях.
     *
     * Поэтому объектные действия живут у метки, а местные — у пустого места.
     */
    if (menu.target.kind === 'slide') {
      const slideId = menu.target.id ?? '';
      const removeProblem = slideRemoveProblem(slideId);
      return [
        { id: 'slide-copy', label: 'Копировать слайд', shortcut: 'Ctrl+C', onSelect: onCopySlide },
        { id: 'slide-cut', label: 'Вырезать слайд', shortcut: 'Ctrl+X', disabled: slideCutProblem !== undefined, hint: slideCutProblem, onSelect: onCutSlide },
        {
          id: 'slide-remove',
          label: 'Удалить слайд',
          separatorBefore: true,
          disabled: removeProblem !== undefined,
          hint: removeProblem,
          onSelect: () => onRemoveSlide(slideId),
        },
      ];
    }

    if (menu.target.kind === 'gate') {
      /*
       * РАЗРЕЗ ПО МЕТКЕ С ВАРИАНТАМИ — НЕ ТО ЖЕ, ЧТО РАЗРЕЗ ПО ВРЕМЕНИ.
       *
       * Замер 25.08.2026 на фикстуре exit-branch: разрез по времени уводит
       * ПРАВИЛА ВЫХОДА в продолжение — у головы их остаётся ноль. Для метки
       * с ответами это молча ломает развилку: зритель отвечает, ответ
       * записан, а решает по нему уже конец продолжения.
       *
       * Поэтому у метки с вариантами зовётся `onSplitAtGate` — он режет
       * главу по развилке и оставляет правила там, где они сработают.
       * У метки без вариантов делить по развилке нечего, и остаётся
       * обычный разрез по времени.
       */
      const gateId = menu.target.id;
      const forked = gateId !== undefined && hasOptions(gateId);
      return [
        {
          id: 'gate-split',
          label: 'Разрезать главу здесь',
          disabled: splitProblem !== undefined,
          hint: splitProblem,
          onSelect: forked ? () => onSplitAtGate(gateId) : onSplitHere,
        },
      ];
    }

    /*
     * Пустое место дорожки. Две группы, и деление между ними — то же самое,
     * что делит меню метки от этого: ЧТО Я ДЕЛАЮ С ТЕКУЩИМ СЛАЙДОМ и ЧТО Я
     * КЛАДУ СЮДА.
     *
     * «Копировать»/«Вырезать» есть и здесь, и у метки, и это НЕ дубль:
     * действие одно, цель одна (`state.currentSlideId`), разный только
     * способ показать пальцем. Правый щелчок по любому месту дорожки ведёт
     * туда головку, а головка ВЕДЁТ ТЕКУЩИЙ СЛАЙД (`Editor.tsx`, эффект
     * `headSlideRef`), — значит после щелчка текущим становится слайд,
     * накрывающий эту секунду.
     *
     * Без этого дубля пропала бы возможность, которая была до Сессии 55:
     * ПЕРВЫЙ слайд главы стоит на нуле и ромба на дорожке не получает
     * (решение продукта, не недосмотр). Оставь мы копирование только
     * у метки — первый слайд стало бы нечем даже начать копировать,
     * а раньше это делала кнопка ленты. Щелчок возле нуля возвращает
     * ему доступ.
     */
    return [
      {
        id: 'slide-copy',
        label: 'Копировать слайд',
        shortcut: 'Ctrl+C',
        onSelect: onCopySlide,
      },
      {
        id: 'slide-cut',
        label: 'Вырезать слайд',
        shortcut: 'Ctrl+X',
        disabled: slideCutProblem !== undefined,
        hint: slideCutProblem,
        onSelect: onCutSlide,
      },
      {
        id: 'slide-paste',
        label: 'Вставить слайд здесь',
        shortcut: 'Ctrl+V',
        separatorBefore: true,
        disabled: slidePasteProblem !== undefined,
        hint: slidePasteProblem,
        onSelect: onPasteSlide,
      },
      {
        /* «Сюда», а не «слайд»: дублируется ТЕКУЩИЙ слайд, а щелчок задаёт
           только секунду, куда ляжет копия. */
        id: 'slide-duplicate',
        label: 'Дублировать текущий слайд сюда',
        disabled: slideDuplicateProblem !== undefined,
        hint: slideDuplicateProblem,
        onSelect: onDuplicateSlide,
      },
      {
        id: 'add-slide',
        label: 'Поставить слайд здесь',
        disabled: addSlideProblem !== undefined,
        hint: addSlideProblem,
        onSelect: onAddSlideHere,
      },
      { id: 'add-gate', label: 'Поставить остановку здесь', onSelect: onAddGate },
      {
        /*
         * «РАЗРЕЗАТЬ», А НЕ «РАЗДЕЛИТЬ» — имя исправлено в Сессии 55.
         *
         * Кнопка называлась «разделить здесь», и автор искал ею развилку,
         * а получал ШОВ: вторая глава идёт сразу за первой, выбора
         * не появляется. Продукт сам признавал это строкой после нажатия
         * («Это шов, а не выбор»), то есть имя противоречило собственному
         * объяснению продукта.
         */
        /*
         * ИМЯ НАЗЫВАЕТ ЦЕЛЬ, А НЕ ДЕЙСТВИЕ. Решение владельца 25.08.2026.
         *
         * «Разрезать главу здесь» описывало, что произойдёт с ТЕКУЩЕЙ главой,
         * и автор читал это как потерю: дорожка вдвое короче, вторая половина
         * неизвестно где. Владелец так и написал: «он не поймёт, почему
         * текущая глава стала меньше и куда делась оставшаяся часть».
         *
         * Работа у пункта ровно одна, и она про НОВУЮ главу: прыжок попадает
         * только в НАЧАЛО главы (решение владельца 13.08.2026,
         * design/branches.md §9.1), значит направить ответ в середину
         * рассказа нельзя физически — сначала там надо сделать начало.
         * Имя теперь говорит именно об этом.
         *
         * У метки с вариантами пункт другой и называется иначе: там разрез
         * не создаёт место, а заставляет работать уже объявленную развилку.
         */
        id: 'split-here',
        label: 'Начать отсюда новую главу',
        separatorBefore: true,
        disabled: splitProblem !== undefined,
        hint: splitProblem,
        onSelect: onSplitHere,
      },
      ...(bubble
        ? ([{
            id: 'bubble-lane-toggle',
            label: bubbleLaneHidden ? 'Показать полосу капли' : 'Спрятать полосу капли',
            separatorBefore: true,
            hint: bubbleLaneHidden
              ? 'Отрезки «моё» действуют и сейчас — спрятана полоса, а не владение'
              : 'Настройка для себя: в проект она не пишется и зрителя не касается',
            onSelect: () => setBubbleLaneHidden((hidden) => !hidden),
          }] satisfies MenuItem[])
        : []),
    ];
  }, [
    menu, splitProblem, onSplitHere, onSplitAtGate, hasOptions, onAddGate, onAddSlideHere, onRemoveSlide,
    slideRemoveProblem, bubble, bubbleLaneHidden,
    onDuplicateSlide, onCopySlide, onCutSlide, onPasteSlide,
    slideDuplicateProblem, slideCutProblem, slidePasteProblem,
  ]);

  /**
   * Ручка тяги за верхнюю кромку `.ed-track` (задача 2.2). Тот же приём из
   * трёх обработчиков, что у handleDown/handleMove/handleUp выше и
   * у MarksLane.handleDown — setPointerCapture на pointerdown, чтение
   * захваченного состояния на pointermove, снятие на pointerup/cancel.
   *
   * `startHeight` берётся из ВИДИМОЙ высоты в момент нажатия (COLLAPSED_H,
   * если дорожка уже свёрнута) — иначе тяга вверх из свёрнутого состояния
   * считала бы от забытой большой высоты и подскакивала бы рывком.
   *
   * Возвращаемое resolveDrag() значение применяется ОДНИМ вызовом setTrack —
   * не двумя setState (collapsed и height по отдельности), чтобы не оставить
   * кадр, в котором применена высота без складывания или наоборот.
   */
  const handleResizeDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      resizeRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight: collapsed ? COLLAPSED_H : trackHeight,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [collapsed, trackHeight],
  );

  const handleResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Тянем вверх (clientY уменьшается) — дорожка растёт: знак разности
    // переворачивает направление экрана в направление роста высоты.
    const rawHeight = drag.startHeight + (drag.startY - event.clientY);
    setTrack(resolveDrag(rawHeight));
  }, []);

  const handleResizeUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  /** Двойной щелчок по ручке — свернуть/развернуть, без пересчёта высоты. */
  const handleResizeDoubleClick = useCallback((): void => {
    setTrack((current) => ({ collapsed: !current.collapsed, height: current.height }));
  }, []);

  const orphanCount = marks.filter((mark) => mark.anchor === 'orphan').length;

  const step = tickStep(durationSeconds, canvasWidthPx);
  const ticks: number[] = [];
  for (let t = 0; t <= durationSeconds; t += step) ticks.push(t);

  // Слово, которое звучит сейчас. Ищется линейно: сотня слов на дорожку,
  // а бинарный поиск здесь был бы преждевременной оптимизацией.
  const activeIndex = words.findIndex(
    (word) => positionSeconds >= word.start && positionSeconds < word.end,
  );

  // Каркас (задача 2.1): состав полос — из tiers.ts, не хардкод. Числа
  // считаются от уже пришедших данных (marks по kind, words.length), а не
  // заводят новых пропов. Пустой случай (0 остановок, нет расшифровки)
  // решён минимально: подпись просто показывает «0».
  // Причина, по которой метку сюда не поставить, приходит ПРОПОМ и считается
  // снаружи — от того же проекта, от которого её считает сам разрез.
  //
  // Здесь она когда-то считалась на месте, и рядом стояло предупреждение
  // «повтори её здесь своими условиями — и однажды кнопка нажалась бы,
  // а разрез упал». Предупреждение оказалось верным наполовину: функция
  // бралась ТА ЖЕ САМАЯ, а вот длительность ей давалась ДРУГАЯ — от дорожки
  // (`durationSeconds`), а не от главы. Совпадать этим числам положено,
  // но между сменой главы и дозагрузкой её дорожки они расходятся, и в этот
  // промежуток кнопка была живой при невозможном разрезе.

  const laneCounts = {
    /**
     * Слайдов в главе, а НЕ ромбов на дорожке — решение владельца 15.08.2026:
     * одно и то же называется одним словом и одним числом.
     *
     * Найдено глазами в Сессии 41: голова полосы говорила «Слайды 14», а лента
     * слайдов рядом, на том же экране, — «1 / 15». Оба числа правдивы каждое
     * о своём: метки строятся как `slides.slice(1)` (первый слайд — стартовый
     * вид главы, ромба не получает), и подпись считала МЕТКИ. Но полоса
     * называется «Слайды», значит число под ней обязано отвечать на вопрос
     * автора «сколько в этой главе слайдов», а не «сколько нарисовано ромбов».
     *
     * Приходит пропом, а не выводится из `marks`: прежний способ был удобнее
     * («не заводит новых пропов», как было записано здесь же) — и ровно это
     * удобство увело число от правды.
     */
    slides: slideCount,
    stops: marks.filter((mark) => mark.kind === 'gate').length,
    words: words.length,
    spans: bubble?.spans.length ?? 0,
  };
  const headLanes = lanesOf(tier, showBubbleLane);
  const bodyLanes = bodyLanesOf(tier, showBubbleLane);
  // Скрытые полосы называют себя (задача 2.2): счётчик — в голове линейки,
  // полное предложение — в title. hiddenNote(tier) === undefined значит
  // «скрывать нечего» — тогда голова линейки пуста, а не «0»: пустая
  // строка и «скрывать нечего» разные случаи (tiers.ts).
  const hiddenLaneNote = hiddenNote(tier);
  // Сравнение с САМОЙ ПРОСТОРНОЙ ступенью при тех же условиях по капле:
  // иначе спрятанная автором полоса капли попала бы в счётчик «скрыто
  // от сжатия», и подсказка «потяните дорожку выше» соврала бы — тяга
  // её не вернёт, вернёт кнопка.
  const hiddenLaneCount = lanesOf('full', showBubbleLane).length - headLanes.length;
  // Сумма высот полос. Считается тем же способом, что и minHeightOf()
  // (сложением, а не числом), поэтому головы и тела сходятся на одно и то же
  // число по построению — ту самую сходимость, ради которой marksBodyHeight()
  // прибавляет разделитель внутри себя.
  //
  // Вычитания транспорта больше нет: с Сессии 55 minHeightOf() и есть сумма
  // полос, потому что строки транспорта не существует.
  const lanesTotalHeight = minHeightOf(tier, showBubbleLane);
  const soundHeight = laneHeight('sound', tier);

  return (
    <section className="ed-track" aria-label="Дорожка">
      {/* Ручка тяги (задача 2.2): полоса 6px по верхней кромке .ed-track,
          позиционирована абсолютно — не участвует в гриде секции и не
          толкает .ed-transport вниз: она лежит целиком в верхнем паддинге
          секции (padding-top 10px > высоты ручки 6px). Двойной щелчок —
          свернуть/развернуть; тяга — resolveDrag() из tiers.ts. */}
      <div
        className="ed-track-resize-handle"
        data-testid="track-resize-handle"
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        onPointerCancel={handleResizeUp}
        onDoubleClick={handleResizeDoubleClick}
      />

      {collapsed ? (
        // Корешок свёрнутой дорожки: кнопка развернуть, имя звука, часы.
        // Высота РОВНО COLLAPSED_H (28) — то же число, что использует
        // resolveDrag(). Часы — ТА ЖЕ разметка/формат, что у .ed-transport
        // ниже (data-testid="track-clock", formatTime): свёрнутая дорожка
        // не должна отнимать у автора положение во времени, а второй
        // способ его показывать завёл бы вторую правду о том же числе.
        <div className="ed-track-collapsed" style={{ height: `${COLLAPSED_H}px` }} data-testid="track-collapsed">
          <button
            type="button"
            className="ed-track-expand"
            data-testid="track-expand"
            onClick={() => setTrack((current) => ({ collapsed: false, height: current.height }))}
            aria-label="Развернуть дорожку"
            title="Развернуть дорожку"
          >
            ▸
          </button>
          <span className="ed-track-collapsed-name" title={soundLabel}>
            {soundLabel}
          </span>
          <code className="ed-clock" data-testid="track-clock">
            {clockText(positionSeconds)} / {clockText(durationSeconds)}
          </code>
        </div>
      ) : (
        <>
      {/*
        СТРОКА ТРАНСПОРТА УДАЛЕНА ЦЕЛИКОМ (Сессия 55).

        В ней стояли восемь органов: воспроизведение, часы, пять ступеней
        масштаба и две кнопки действий. Замер 21.08.2026: вместе с двумя
        соседними строками это давало 96 px из 306 — треть зоны уходила
        на органы прежде, чем автор видел хоть секунду дорожки.

        Куда что уехало:
          воспроизведение и часы -> нижняя полоса окна, по центру,
            как у Канвы (замер её таймлайна 19.08.2026);
          ступени масштаба -> один орган в голове линейки плюс
            Ctrl+колесо над дорожкой, как во всех монтажных программах;
          остановка, разрез, полоса капли -> меню правой кнопки,
            где у каждого пункта своя причина видимой строкой.
      */}

      {/*
        Что получилось у последнего разреза — строкой ЗДЕСЬ, вплотную под
        кнопкой «разделить здесь», а не в правой колонке.

        Место выбрано замером, а не вкусом: после щелчка автор смотрит на
        дорожку, по которой щёлкнул. Список глав, который на самом деле
        меняется, живёт в противоположном углу экрана, и замер Сессии 51
        показал ровно ноль подсказок в поле зрения автора.

        Строка ВИДИМАЯ, а не `title`: в проекте записано измерением, что
        на подсказки при наведении не смотрят, а пометка, положенная
        в подпись, находится `getByLabel` и не доходит до автора вовсе —
        три зелёных e2e при пустом экране.
      */}
      {splitNotice ? (
        <p className="ed-split-result" role="status" data-testid="split-result">
          {splitNotice}
        </p>
      ) : null}

      {/*
        Список «проверьте эти места» (`product.md` §4 [Р]) — строкой над
        дорожкой, а не отдельной панелью.

        Считается ОТ МЕТОК, то есть от данных проекта, а не от события замены
        озвучки. Разница видна назавтра: отчёт о переносе живёт, пока открыта
        панель дорожки, а сирота живёт в файле. Покажи мы счётчик только после
        замены — он исчез бы при перезагрузке вместе с памятью о проблеме,
        и §4 «автор получает список» выполнялся бы ровно один сеанс.

        Строки нет, когда сирот нет: пустой блок «0 меток требуют проверки»
        приучал бы глаз пропускать это место.
      */}
      {(orphanCount > 0 || colorOrphanCount > 0) && (
        <p className="ed-orphans" data-testid="orphan-counter">
          <span className="ed-orphans-sign" aria-hidden="true">⚠</span>
          {' '}
          {orphanCount > 0 && (
            <>Проверьте {plural(orphanCount, ORPHAN_MARKS)}: слово не найдено в записи.{' '}</>
          )}
          {/*
            Сироты ЦВЕТА живут в том же счётчике, а не в своём
            (`design/styles.md` §4). Второй счётчик на ту же болезнь —
            ошибка, уже названная в проекте: автор приучился бы смотреть
            в одно место и пропускал бы второе.

            Формулировка «мест», а не «цветов»: сирота бывает и в стиле
            проекта, и у элемента на слайде, и открывать автору придётся
            именно места. Плеер про это не скажет никогда — ему нечем.
          */}
          {colorOrphanCount > 0 && (
            <span data-testid="orphan-colors">
              Проверьте {plural(colorOrphanCount, ORPHAN_COLORS)}: ссылка на цвет темы
              не разрешится.{' '}
            </span>
          )}
          {orphanCount > 0 && (
          <button
            type="button"
            className="ed-orphans-next"
            data-testid="orphan-next"
            onClick={() => {
              const next = nextOrphan(marks, selectedMark);
              if (!next) return;
              onSelectMark(next.kind, next.id);
              // Ведём головку к метке: выделения мало, автор должен увидеть
              // МЕСТО. Перемотка в паузе законна — так же выбирается слайд
              // в ленте (`Editor.tsx`, `handleSelectSlide`).
              transport.seek(next.seconds);
            }}
          >
            к следующей
          </button>
          )}
        </p>
      )}

      {/* Пять полос дорожки (каркас, задача 2.1): состав и высоты — из
          tiers.ts (lanesOf/laneHeight/marksBodyHeight), а не хардкод.
          Головы стоят СНАРУЖИ контейнера прокрутки, отдельной колонкой
          грида, и НЕ липкие (position: sticky запрещён): e2e/track-zoom.spec.ts:57
          считает ожидаемое положение метки от .x контейнера .ed-lane-scroll
          («внешняя правда, независимая от того, что нарисовало само
          полотно») — с липкой головой внутри контейнера этот .x стал бы
          левым краем ГОЛОВЫ, и проверка разъехалась бы ровно на 120px. */}
      <div className="ed-lanes">
        <div className="ed-lane-heads" style={{ height: `${lanesTotalHeight}px` }}>
          {headLanes.map((lane, index) => {
            // Голова линейки (задача 2.2): у неё нет своего счёта (laneNote
            // вернула бы ''), поэтому здесь показывается число СКРЫТЫХ
            // полос, а полное предложение hiddenNote(tier) уходит в title —
            // та же причина, что у обрезанной подписи звука: 120px головы
            // и 10px шрифта не вмещают предложение целиком.
            const isRuler = lane === 'ruler';
            const noteText = isRuler
              ? hiddenLaneNote !== undefined
                ? String(hiddenLaneCount)
                : ''
              : laneNote(lane, laneCounts, soundLabel);
            const noteTitle = isRuler ? (hiddenLaneNote ?? '') : noteText;
            return (
              <div
                key={lane}
                className="ed-lane-head"
                style={{ height: `${laneHeight(lane, tier)}px`, ...(index > 0 ? SEPARATOR : {}) }}
              >
                {/* МАСШТАБ ДОРОЖКИ — в голове линейки, а не в строке органов.
                    Орган стоит рядом с тем, что растягивает: линейка и есть
                    ось, по которой масштаб действует. У головы линейки своей
                    подписи нет (laneTitle отдаёт пустую строку), так что место
                    было свободно и новой высоты зона не получает.

                    Список, а не пять кнопок: ровно тем же органом показан
                    масштаб ХОЛСТА в нижней полосе (ZoomBar), и два масштаба
                    в одном редакторе обязаны выглядеть одинаково — иначе
                    автор учит два разных способа делать одно и то же. */}
                {isRuler ? (
                  <PlainSelect
                    className="ed-track-zoom"
                    testId="track-zoom"
                    ariaLabel="Масштаб дорожки"
                    title="Масштаб дорожки. Ctrl+колесо над дорожкой — то же самое"
                    value={String(zoom)}
                    onPick={(picked) => setZoom(Number(picked) as ZoomStep)}
                    options={ZOOM_STEPS.map((step) => ({
                      value: String(step),
                      label: `×${step}`,
                      /* Ступень, чьё полотно не влезет в канву браузера,
                         не выбирается: иначе волна пропадала бы МОЛЧА
                         (замер в zoom.ts у largestFittingZoom). */
                      disabled: zoomBlockedReason(width, step) !== undefined,
                    }))}
                  />
                ) : lane === 'sound' ? (
                  <button
                    type="button"
                    className="ed-lane-head-title ed-lane-head-button"
                    data-testid="audio-source-toggle"
                    aria-expanded={soundOpen}
                    disabled={soundToggleProblem !== undefined}
                    title={soundToggleProblem ?? (soundOpen ? 'Свернуть озвучку' : 'Развернуть озвучку')}
                    onClick={onToggleSound}
                  >
                    <span aria-hidden="true">{soundOpen ? '▾' : '▸'}</span> {laneTitle(lane, soundLabel)}
                  </button>
                ) : lane === 'slides' ? (
                  <button
                    type="button"
                    className="ed-lane-head-title ed-lane-head-button"
                    data-testid="slide-strip-toggle"
                    aria-expanded={slidesOpen}
                    title={slidesOpen ? 'Свернуть ленту слайдов' : 'Развернуть ленту слайдов'}
                    onClick={onToggleSlides}
                  >
                    <span aria-hidden="true">{slidesOpen ? '▾' : '▸'}</span> {laneTitle(lane, soundLabel)}
                  </button>
                ) : (
                  <span className="ed-lane-head-title">{laneTitle(lane, soundLabel)}</span>
                )}
                {/* title дублирует подпись НЕ для красоты: голова 120 px, шрифт
                    подписи 10 px, и длинное имя звука обрезается многоточием.
                    Обрезка не роняет ничего и не подаёт сигнала — у проекта уже
                    есть случай, когда не влезшая подпись прожила сессию
                    незамеченной при зелёных тестах. */}
                <span
                  className="ed-lane-head-note"
                  data-testid={isRuler ? 'hidden-lanes-note' : undefined}
                  title={noteTitle}
                >
                  {noteText}
                </span>
              </div>
            );
          })}
        </div>

        {/* Контейнер прокрутки — ЕДИНСТВЕННЫЙ на все пять полос (было два:
            .ed-lane-scroll у волны и .ed-marks-scroll у меток с
            односторонней синхронизацией scrollLeft между ними; каркас,
            задача 2.1, свёл их в один — синхронизировать больше нечего).
            Имя СОХРАНЕНО: e2e/track-zoom.spec.ts:57 считает положение метки
            от .x именно этого контейнера. laneRef стоит НЕ здесь, а на
            полотне (.ed-lane-bodies) — seekToPointer меряет
            getBoundingClientRect() полотна, а не контейнера: контейнер стоит
            на месте, полотно уезжает под него при прокрутке (замер
            06.08.2026, docs/design/track-zoom.md §3). */}
        {/* Высота НЕ задаётся: контейнер обнимает стек полос сам.
            Жёсткая высота при overflow-y: hidden означала бы, что
            горизонтальный скролбар отъедает высоту ИЗНУТРИ и срезает низ
            последней полосы. В headless этого не увидеть никогда — там
            скролбар накладной и нулевой толщины (замерено: thicknessProbe 0
            даже с отключённым OverlayScrollbar), а в живом Chrome он
            классический, 15 px (замерено в браузере владельца). То есть
            дефект был бы виден автору и невидим всем 279 e2e разом.
            Высота-по-содержимому снимает это независимо от толщины: сколько
            скролбар займёт, на столько контейнер и вырастет. */}
        {/* Правая кнопка ловится на ПОЛОТНЕ, а не на всей зоне полос: событие
            всплывает, и один обработчик не может разойтись с пятью внизу,
            но левые головы полос в него попадать НЕ ДОЛЖНЫ.

            Головы лежат вне оси времени. Попади щелчок по ним в этот
            обработчик, `seekToPointer` посчитал бы долю левее нуля, зажал бы
            её в ноль и перемотал бы главу в начало — то есть правый щелчок
            по подписи «Звук» молча уводил бы автора на нулевую секунду.
            Плюс в голове линейки стоит список масштаба, которому нужно
            родное меню браузера, а не наше. */}
        <div className="ed-lane-scroll" ref={laneScrollRef} onContextMenu={handleTrackContextMenu}>
          {/* laneRef стоит на ПОЛОТНЕ, а не на полосе волны: ось времени — это
              полотно целиком, и от него считают секунду все поверхности
              перемотки. Пока полос было две, `.ed-lane` совпадала с полотном
              по ширине, и разница не значила ничего; с пятью полосами такое
              совпадение — то самое необъявленное, которое однажды кончается.
              Ширина у полотна задана явно, у полос она 100% от него. */}
          {/*
            ПЕРЕМОТКА ЩЕЛЧКОМ — НА ВСЁМ ПОЛОТНЕ, А НЕ НА ДВУХ ПОЛОСАХ.

            Замер 21.08.2026: обработчики стояли только на линейке (полоска
            24 px) и на волне. Щелчок по полосам «Слайды», «Остановки»
            и «Расшифровка» не делал НИЧЕГО — ни перемотки, ни выделения.
            Автор целился в дорожку и не получал отклика больше чем
            на половине её высоты.

            Один обработчик наверху вместо пяти внизу: пять экземпляров
            одного поведения расходятся на первой же правке, а событие
            и так всплывает. Метки при этом не мешают — MarksLane гасит
            всплытие на своих кнопках, поэтому щелчок ПО МЕТКЕ выбирает
            метку, а не перематывает мимо неё.
          */}
          <div
            className="ed-lane-bodies"
            ref={laneRef}
            style={{ width: `${canvasWidthPx}px` }}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
          >
            {bodyLanes.map((lane, index) => {
              const border = index > 0 ? SEPARATOR : {};
              if (lane === 'ruler') {
                return (
                  <div
                    key={lane}
                    className="ed-ruler-body"
                    style={{ height: `${laneHeight('ruler', tier)}px`, ...border }}
                    // Своих обработчиков перемотки у линейки больше нет:
                    // с Сессии 55 они стоят один раз на полотне выше, и
                    // перематывает ЛЮБАЯ полоса, а не только эти две.
                    data-testid="track-ruler"
                  >
                    <div className="ed-ticks" aria-hidden="true">
                      {ticks.map((t) => (
                        <span key={t} className="ed-tick" style={{ left: `${(t / durationSeconds) * 100}%` }}>
                          {clockText(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }
              if (lane === 'sound') {
                return (
                  <div
                    key={lane}
                    className="ed-lane"
                    style={{ height: `${soundHeight}px`, ...border }}
                    // Обработчики перемотки переехали на полотно (Сессия 55).
                    data-testid="track-lane"
                  >
                    {/* Причина показывается дословно И НА МЕСТЕ ВОЛНЫ.
                        Пустая волна вместо неё изображала бы тишину там, где
                        на самом деле нет файла, — а место выбрано тем же
                        правилом, что и всё остальное в этой зоне: орган (здесь
                        — сообщение) стоит там, где предмет, о котором он
                        говорит. Своей строки при этом не заводит: полоса звука
                        существует всегда и высоту от сообщения не меняет. */}
                    {failure ? (
                      <span className="ed-failure" role="status" data-testid="track-failure">
                        Дорожка не загрузилась: {failure}
                      </span>
                    ) : (
                      <Waveform peaks={peaks} width={canvasWidthPx} height={soundHeight} progress={progress} />
                    )}
                  </div>
                );
              }
              if (lane === 'bubble') {
                // `bubble` здесь заведомо есть: полоса появляется в перечне
                // только при showBubbleLane, а он требует `bubble !== undefined`.
                // Проверка нужна типу, а не логике — и падает громко, если
                // однажды перечень и условие разойдутся.
                if (!bubble) throw new Error('Полоса капли в перечне есть, а самой капли нет');
                return (
                  <BubbleLane
                    key={lane}
                    spans={bubble.spans}
                    durationSeconds={durationSeconds}
                    canvasWidthPx={canvasWidthPx}
                    height={laneHeight('bubble', tier)}
                    style={border}
                    onCreate={onCreateSpan}
                    onEdit={onEditSpan}
                    onEditEnd={onEditSpanEnd}
                    onRemove={onRemoveSpan}
                  />
                );
              }
              if (lane === 'marks') {
                // .ed-marks сама несёт border-top статически в styles.ts —
                // она никогда не первая полоса ни на одной ступени (перед
                // ней всегда идут ruler и sound), поэтому лишний пропс
                // здесь не нужен.
                return (
                  <MarksLane
                    key={lane}
                    marks={marks}
                    durationSeconds={durationSeconds}
                    selected={selectedMark}
                    onSelect={onSelectMark}
                    onMove={onMoveMark}
                    onMoveEnd={onMoveMarkEnd}
                    onTransitionSecondsLive={onTransitionSecondsLive}
                    onTransitionSecondsCommit={onTransitionSecondsCommit}
                    canvasWidthPx={canvasWidthPx}
                    heightPx={marksBodyHeight(tier)}
                  />
                );
              }
              // 'words': слово автора — «расшифровка»; «транскрипт» живёт
              // в схеме и коде (product.md §2а). И это не просто «пусто»:
              // часть без озвучки — законный случай, поэтому строка сразу
              // говорит, что делать.
              return (
                <p
                  key={lane}
                  className="ed-words-body"
                  data-testid="track-words"
                  style={{ height: `${laneHeight('words', tier)}px`, ...border }}
                >
                  {words.length === 0
                    ? 'Расшифровки нет — метки этой главы ставятся по секундам'
                    : words.map((word, wordIndex) => (
                        <span
                          key={`${word.start}-${wordIndex}`}
                          className={wordIndex === activeIndex ? 'ed-word ed-word-active' : 'ed-word'}
                        >
                          {word.text}{' '}
                        </span>
                      ))}
                </p>
              );
            })}

            {/* Головка едет через ВСЕ полосы сверху донизу — раньше стояла
                только над волной (.ed-lane, 72px), теперь родитель — весь
                стек тел (.ed-lane-bodies), и top:0/bottom:0 в CSS дают ей
                высоту стека без единой правки самого правила. */}
            <div className="ed-playhead" data-testid="playhead" style={{ left: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
        </>
      )}

      {/* Меню стоит ВНЕ ветки `collapsed`: свёрнутая дорожка полос не рисует,
          и открывать над ней нечего, но узел меню принадлежит секции целиком,
          а не одному её состоянию. */}
      {menu === undefined ? null : (
        <ContextMenu at={menu.at} items={menuItems} onClose={() => setMenu(undefined)} />
      )}
    </section>
  );
}
