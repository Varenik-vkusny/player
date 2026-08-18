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
  useRef,
  useState,
  type CSSProperties,
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
  TRANSPORT_H,
  type LaneName,
  type TrackTier,
} from './tiers.js';
import { BubbleLane } from './BubbleLane.js';
import type { SpanRange } from './spans.js';
import type { TransportApi } from './useTransport.js';
import { Waveform } from './Waveform.js';
import { clockText } from '../timeText.js';
import { Icon } from '../ui/index.js';
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

  const { positionSeconds, durationSeconds, peaks, failure, isPlaying } = transport;

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
  // Сумма высот полос БЕЗ транспорта. Считается тем же способом, что
  // и minHeightOf() (сложением, а не числом), поэтому головы и тела сходятся
  // на одно и то же число по построению — ту самую сходимость, ради которой
  // marksBodyHeight() прибавляет разделитель внутри себя.
  const lanesTotalHeight = minHeightOf(tier, showBubbleLane) - TRANSPORT_H;
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
      <div className="ed-transport">
        <button
          type="button"
          className="ed-play"
          onClick={transport.toggle}
          disabled={Boolean(failure)}
          aria-label={isPlaying ? 'Пауза' : 'Играть'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <code className="ed-clock" data-testid="track-clock">
          {clockText(positionSeconds)} / {clockText(durationSeconds)}
        </code>
        {failure ? (
          // Причина показывается дословно. Пустая волна вместо неё
          // изображала бы тишину там, где на самом деле нет файла.
          <span className="ed-failure" role="status" data-testid="track-failure">
            Дорожка не загрузилась: {failure}
          </span>
        ) : null}

        {/* Ступени масштаба дорожки (track-zoom.md §§1, 8). Встают в эту же
            строку транспорта — новой строки по высоте они не заводят.

            A2: ступень, чьё полотно не поместится в канву браузера на
            текущей ширине окна (`zoomBlockedReason`, `zoom.ts`), ГАСНЕТ —
            остаётся в разметке с `aria-disabled` и причиной в `title`, а не
            исчезает и не ломается молча. Клик по ней — no-op: onClick сам
            проверяет ту же причину, `aria-disabled` — не `disabled`, кнопка
            должна остаться фокусируемой. */}
        <span className="ed-zoom" data-testid="zoom-controls">
          {ZOOM_STEPS.map((zoomStep) => {
            const blockedReason = zoomBlockedReason(width, zoomStep);
            return (
              <button
                key={zoomStep}
                type="button"
                className="ed-zoom-step"
                data-testid={`zoom-${zoomStep}`}
                aria-pressed={zoomStep === zoom}
                aria-disabled={blockedReason !== undefined}
                onClick={() => {
                  if (blockedReason !== undefined) return;
                  setZoom(zoomStep);
                }}
                title={blockedReason ?? `Масштаб дорожки ×${zoomStep}`}
              >
                ×{zoomStep}
              </button>
            );
          })}
        </span>

        <span className="ed-add">
          <button
            type="button"
            className="ed-add-mark"
            onClick={onAddGate}
            // Слово схемы «гейт» пережило чистку словаря Сессии 8 именно
            // здесь: на подсказки при наведении никто не смотрит, а автор
            // видит их так же, как подписи (product.md §2а).
            title="Остановка на этой секунде"
          >
            <Icon name="square" /> остановка
          </button>
          {/* Метка — стык глав (`branches.md` §2). Отдельного значка у неё
              нет: граница между главами и есть метка, поэтому кнопка говорит
              о ДЕЙСТВИИ, а не об объекте.

              Надпись «Разделить здесь», а не «Поставить метку», намеренно:
              слово «метка» в продукте занято дважды — ромбом слайда на дорожке
              и якорем привязки к слову («проверьте N меток»), и `branches.md`
              §1 называет это прямо как причину, по которой заведено слово
              «глава». Третье значение добило бы его. Спецификация надписи
              кнопки не диктует. */}
          <button
            type="button"
            className="ed-add-mark"
            data-testid="split-here"
            disabled={splitProblem !== undefined}
            onClick={onSplitHere}
            title={splitProblem ?? 'Разделить главу надвое в этой секунде'}
          >
            <Icon name="scissors" /> разделить здесь
          </button>

          {/* Переключатель полосы капли. Стоит В ТРАНСПОРТЕ, а не в голове
              самой полосы, по одной причине: спрятанной полосы в перечне нет,
              и кнопка внутри неё исчезла бы вместе с ней — вернуть было бы
              нечем. Управление, которое умеет только выключать, это тупик.

              Показывается лишь тогда, когда в главе есть капля: кнопка,
              включающая то, чего не существует, обещала бы автору полосу,
              которая не появится. */}
          {bubble ? (
            <button
              type="button"
              className="ed-add-mark"
              data-testid="bubble-lane-toggle"
              aria-pressed={!bubbleLaneHidden}
              onClick={() => setBubbleLaneHidden((hidden) => !hidden)}
              title={bubbleLaneHidden
                ? 'Показать полосу капли. Отрезки «моё» действуют и сейчас — спрятана полоса, а не владение'
                : 'Спрятать полосу капли. Это настройка для себя: в проект она не пишется и зрителя не касается'}
            >
              {/* Надпись называет ДЕЙСТВИЕ, а не состояние. Одинаковый текст
                  в обоих положениях оставил бы состояние жить только
                  в `aria-pressed`: тест его видит, автор — нет. В проекте уже
                  записан случай, когда пометка ушла туда, где её находит
                  `getByLabel` и не находит человек. */}
              {bubbleLaneHidden ? '👁 показать каплю' : '🚫 спрятать каплю'}
            </button>
          ) : null}
        </span>
      </div>

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
                <span className="ed-lane-head-title">{laneTitle(lane, soundLabel)}</span>
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
        <div className="ed-lane-scroll" ref={laneScrollRef}>
          {/* laneRef стоит на ПОЛОТНЕ, а не на полосе волны: ось времени — это
              полотно целиком, и от него считают секунду все поверхности
              перемотки. Пока полос было две, `.ed-lane` совпадала с полотном
              по ширине, и разница не значила ничего; с пятью полосами такое
              совпадение — то самое необъявленное, которое однажды кончается.
              Ширина у полотна задана явно, у полос она 100% от него. */}
          <div className="ed-lane-bodies" ref={laneRef} style={{ width: `${canvasWidthPx}px` }}>
            {bodyLanes.map((lane, index) => {
              const border = index > 0 ? SEPARATOR : {};
              if (lane === 'ruler') {
                return (
                  <div
                    key={lane}
                    className="ed-ruler-body"
                    style={{ height: `${laneHeight('ruler', tier)}px`, ...border }}
                    // Линейка перематывает — в монтажной программе это ГЛАВНАЯ
                    // поверхность перемотки, и до перекладки она работала
                    // случайно: контейнер прокрутки БЫЛ полосой волны, поэтому
                    // «щёлкнуть по дорожке» и «попасть в волну» совпадали.
                    // Полос стало пять — совпадение кончилось, и линейка,
                    // на которую автор целится первой, замолчала бы.
                    onPointerDown={handleDown}
                    onPointerMove={handleMove}
                    onPointerUp={handleUp}
                    onPointerCancel={handleUp}
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
                    onPointerDown={handleDown}
                    onPointerMove={handleMove}
                    onPointerUp={handleUp}
                    onPointerCancel={handleUp}
                    data-testid="track-lane"
                  >
                    <Waveform peaks={peaks} width={canvasWidthPx} height={soundHeight} progress={progress} />
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
    </section>
  );
}
