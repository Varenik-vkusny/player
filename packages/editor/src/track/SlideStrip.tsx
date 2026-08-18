/**
 * Лента слайдов (§14.11): ровный ряд карточек одного размера, порядок —
 * позиция в ряду, а не секунда. Решение владельца 01.08.2026, записано
 * как [Р] в `docs/product.md` §2д, прототип — `marks-strip.html`.
 *
 * Устройство намеренно повторяет прототип, а не придумывает своё:
 *
 *   — карточки одного размера всегда; фокус — `transform`, который
 *     в раскладке не участвует, поэтому ряд не пересобирается (иначе
 *     соседний слайд подпрыгивал бы при выборе);
 *   — картинка карточки — настоящая сцена плеера (`ScenePreview`,
 *     инвариант №5), а не своя миниатюрная отрисовка;
 *   — три ориентира после прыжка: счётчик, полоска положения, плавная
 *     прокрутка — без них дальний прыжок в ленте не читается (владелец
 *     отверг вариант с лупой ровно по этой причине, `planning.md` §14.11);
 *   — связь с дорожкой только по нажатию, наведение не двигает ничего.
 *
 * Дорожка (`TrackView`/`MarksLane`) этим модулем не заменяется и не
 * трогается: у ленты нет своего понятия времени, кроме подписи под ней.
 *
 * Разделена на три вида (Сессия 47, «одна полоса вместо трёх»):
 * `SlideStripHead` — кнопка складывания, счётчик и кнопки буфера обмена,
 * стоит в общей шапке нижней зоны (`Editor.tsx`, `.ed-zone-head`), ровно
 * одна строка ВСЕГДА; `SlideStripNote` — строка причины под шапкой,
 * рисуется ВСЕГДА, даже пустой; `SlideStripCards` — сами карточки
 * и полоска положения, только когда лента раскрыта. Свёрнутость ленты
 * живёт в `Editor.tsx` (`useState`, не в проекте — тот же приём и по той
 * же причине, что у панели озвучки), потому что кнопка складывания стоит
 * в шапке зоны, а карточки — отдельным блоком под дорожкой причины;
 * без общего состояния наверху эти два места не смогли бы согласоваться.
 */
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type { Element, Slide, Style, Theme, Word } from '@player/core';
import { ScenePreview, type Segment } from '@player/player';

import { Button } from '../ui/index.js';
import { markSeconds } from './marks.js';
import { slideChangeSummary } from './slide-summary.js';
import { secondsText } from '../timeText.js';

export interface SlideStripHeadProps {
  readonly slides: readonly Slide[];
  readonly words: readonly Word[];
  readonly currentSlideId: string;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onDuplicate: () => void;
  readonly onCopy: () => void;
  readonly onCut: () => void;
  readonly onPaste: () => void;
  /** Почему «Вырезать» недоступна. `undefined` — доступна. */
  readonly cutProblem: string | undefined;
  /**
   * Почему «Дублировать» недоступна. `undefined` — доступна.
   *
   * Отдельный сигнал, а не общий с «Вставить», и это не симметрия ради
   * симметрии. Обе кнопки метят в одну секунду — головку дорожки, — но
   * дублирование НЕ ЧИТАЕТ буфер автора: `duplicateSlideAt` работает через
   * свой временный `SlideClipboard`. Сведи их в один сигнал — и пустой буфер
   * гасил бы «Дублировать» с причиной «Буфер пуст», то есть автор не мог бы
   * размножить кадр, пока чего-нибудь не скопирует. Логика редьюсера при
   * этом исправна, и юнит-тест такого не поймал бы.
   */
  readonly duplicateProblem: string | undefined;
  /** Почему «Вставить» недоступна. `undefined` — доступна. */
  readonly pasteProblem: string | undefined;
}

/**
 * Голова ленты: кнопка складывания, счётчик «N / M · сс с» и четыре кнопки
 * буфера обмена. Возвращает фрагмент, не свой контейнер (тот же приём,
 * что и у `ui/Section` и `AudioSourceHead`): встаёт на место среди соседей
 * по строке общей шапки нижней зоны, не заводя собственной раскладки.
 * Обязана остаться ровно в одну строку ВСЕГДА.
 */
export function SlideStripHead({
  slides,
  words,
  currentSlideId,
  collapsed,
  onToggleCollapsed,
  onDuplicate,
  onCopy,
  onCut,
  onPaste,
  cutProblem,
  duplicateProblem,
  pasteProblem,
}: SlideStripHeadProps): ReactElement {
  const currentIndex = slides.findIndex((slide) => slide.id === currentSlideId);
  const currentSlide = currentIndex >= 0 ? slides[currentIndex] : undefined;
  const counterText = currentSlide
    ? `${currentIndex + 1} / ${slides.length} · ${secondsText(markSeconds(currentSlide.at, words))}`
    : `– / ${slides.length}`;

  return (
    <>
      {/* Кнопка складывания — текстовая, а не один значок, тем же приёмом
          и по той же причине, что у панели озвучки: слово «Слайды» заодно
          называет ленту, у которой своего заголовка не было вовсе. */}
      <button
        type="button"
        className="ed-slide-strip-toggle"
        data-testid="slide-strip-toggle"
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
        <span>Слайды</span>
      </button>
      <span className="ed-slide-strip-counter" data-testid="strip-counter">{counterText}</span>
      <div className="ed-slide-strip-actions">
        <Button
          data-testid="slide-duplicate"
          disabled={duplicateProblem !== undefined}
          onClick={onDuplicate}
        >
          Дублировать
        </Button>
        <Button data-testid="slide-copy" onClick={onCopy}>
          Копировать
        </Button>
        <Button
          data-testid="slide-cut"
          disabled={cutProblem !== undefined}
          onClick={onCut}
        >
          Вырезать
        </Button>
        <Button
          data-testid="slide-paste"
          disabled={pasteProblem !== undefined}
          onClick={onPaste}
        >
          Вставить
        </Button>
      </div>
    </>
  );
}

export interface SlideStripNoteProps {
  readonly cutProblem: string | undefined;
  readonly duplicateProblem: string | undefined;
  readonly pasteProblem: string | undefined;
}

/**
 * Строка причины под шапкой зоны — рисуется ВСЕГДА, даже пустой. Появляйся
 * она только при наличии причины, высота головы менялась бы при каждой
 * перемотке головки, и сцена под руками автора прыгала бы. `min-height`
 * в стилях держит место.
 *
 * Свёрнутая лента отнимает МЕСТО, а не ВОЗМОЖНОСТИ: голова со счётчиком
 * и кнопками буфера остаётся видна и при свёрнутых карточках — спрячь мы
 * эту строку, автор видел бы погашенные кнопки без объяснения (`screens.md`
 * §6).
 */
export function SlideStripNote({ cutProblem, duplicateProblem, pasteProblem }: SlideStripNoteProps): ReactElement {
  // Одна строка на все причины разом: кнопки могут быть недоступны
  // ОДНОВРЕМЕННО (головка на первом слайде + пустой буфер), и автор обязан
  // увидеть обе, а не только последнюю посчитанную (wordAnchorProblem,
  // track/marks.ts — тот же принцип: объяснить, а не погасить молча).
  //
  // Повторы убираются `Set`, и это не украшательство: при непустом буфере
  // `duplicateProblem` и `pasteProblem` — ОДНА И ТА ЖЕ причина про место
  // головки, и без свёртки автор читал бы «на этой секунде уже стоит слайд»
  // дважды подряд.
  const clipboardNote = [...new Set(
    [cutProblem, duplicateProblem, pasteProblem].filter((problem): problem is string => problem !== undefined),
  )].join(' · ');

  return <span className="ed-slide-strip-note" data-testid="slide-clipboard-note">{clipboardNote}</span>;
}

export interface SlideStripCardsProps {
  /**
   * Тема сцены. Миниатюра — тот же `ScenePreview`, что и большая сцена
   * (инвариант №5), поэтому без темы карточки красились бы запасными
   * значениями ссылок и расходились бы с холстом.
   */
  readonly theme: Theme;
  readonly styles: readonly Style[];
  readonly slides: readonly Slide[];
  readonly words: readonly Word[];
  readonly elements: readonly Element[];
  readonly currentSlideId: string;
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly onSelectSlide: (id: string) => void;
}

/** Метрики прокрутки — то, из чего строится полоска положения под лентой. */
interface ScrollMetrics {
  readonly scrollLeft: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  /** Центр текущей карточки в пикселях ленты — undefined, пока не измерен. */
  readonly pickCenter: number | undefined;
}

const EMPTY_METRICS: ScrollMetrics = { scrollLeft: 0, scrollWidth: 0, clientWidth: 0, pickCenter: undefined };

/**
 * Карточки ленты и полоска положения. Рисуется только когда лента раскрыта —
 * вызывающий (`Editor.tsx`) решает это сам, монтируя и размонтируя
 * компонент, а не пряча его внутри `display: none`. Монтирование заново
 * и есть момент, когда лента обязана прокрутиться к текущему слайду и
 * измерить себя — тот же эффект, что раньше срабатывал на смену `collapsed`
 * в общем компоненте.
 */
export function SlideStripCards({
  theme,
  styles,
  slides,
  words,
  elements,
  currentSlideId,
  stageWidth,
  stageHeight,
  onSelectSlide,
}: SlideStripCardsProps): ReactElement {
  const stripRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>(EMPTY_METRICS);

  /**
   * Нажатие ведёт головку; головка (через `currentSlideId` снаружи) ведёт
   * ленту. Обе связки истинны одновременно, поэтому нужен флаг: без него
   * собственный клик по карточке немедленно попадал бы под эффект
   * автопрокрутки и вызывал бы `scrollTo` на карточку, которая уже видна
   * (задание §14.11: прокрутка — «ТОЛЬКО при смене currentSlideId извне»).
   */
  const selectedFromWithin = useRef(false);

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const card = strip.querySelector<HTMLElement>(`[data-testid="strip-card-${cssEscape(currentSlideId)}"]`);
    setMetrics({
      scrollLeft: strip.scrollLeft,
      scrollWidth: strip.scrollWidth,
      clientWidth: strip.clientWidth,
      pickCenter: card ? card.offsetLeft + card.offsetWidth / 2 : undefined,
    });
  }, [currentSlideId]);

  useLayoutEffect(measure, [measure, slides.length]);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    if (selectedFromWithin.current) {
      selectedFromWithin.current = false;
      return;
    }
    const card = strip.querySelector<HTMLElement>(`[data-testid="strip-card-${cssEscape(currentSlideId)}"]`);
    if (!card) return;
    strip.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - strip.clientWidth / 2,
      behavior: 'smooth',
    });
    // measure() читает готовую позицию сразу; полоска догонит анимацию
    // прокрутки сама через onScroll ниже, кадр за кадром.
    measure();
    // Компонент монтируется заново на каждое раскрытие ленты (`Editor.tsx`
    // рисует его только когда лента раскрыта), поэтому этот эффект и так
    // отрабатывает на разворачивание — то же самое, что раньше давала
    // `collapsed` в зависимостях, когда лента жила в одном компоненте
    // с головой. Без этого автор, работавший на двенадцатом слайде, увидел
    // бы ленту, прокрученную на первый, — и молча, потому что
    // `currentSlideId` при этом не менялся.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlideId]);

  const handleSelect = useCallback((id: string) => {
    selectedFromWithin.current = true;
    onSelectSlide(id);
  }, [onSelectSlide]);

  const total = Math.max(1, metrics.scrollWidth);
  const view = metrics.clientWidth;
  const thumbWidthPct = Math.min(100, Math.max(view > 0 ? (view / total) * 100 : 100, 6));
  const scrollableRange = total - view;
  const thumbLeftPct = scrollableRange > 0
    ? (metrics.scrollLeft / scrollableRange) * (100 - thumbWidthPct)
    : 0;
  const pickPct = total > 0 && metrics.pickCenter !== undefined ? (metrics.pickCenter / total) * 100 : undefined;

  return (
    <div className="ed-slide-strip-cards">
      <div
        className="ed-slide-strip"
        data-testid="slide-strip"
        ref={stripRef}
        onScroll={measure}
      >
        {slides.map((slide, index) => (
          <SlideCard
            key={slide.id}
            slide={slide}
            prevSlide={index > 0 ? slides[index - 1] : undefined}
            elements={elements}
            words={words}
            theme={theme}
            styles={styles}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
            isCurrent={slide.id === currentSlideId}
            onSelect={handleSelect}
          />
        ))}
      </div>
      <div className="ed-slide-strip-posbar">
        <div className="ed-slide-strip-posthumb" style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }} />
        {pickPct !== undefined ? (
          <div className="ed-slide-strip-postick" style={{ left: `${pickPct}%` }} />
        ) : null}
      </div>
    </div>
  );
}

interface SlideCardProps {
  readonly theme: Theme;
  readonly styles: readonly Style[];
  readonly slide: Slide;
  readonly prevSlide: Slide | undefined;
  readonly elements: readonly Element[];
  readonly words: readonly Word[];
  readonly stageWidth: number;
  readonly stageHeight: number;
  readonly isCurrent: boolean;
  readonly onSelect: (id: string) => void;
}

function SlideCard({
  slide,
  prevSlide,
  elements,
  words,
  theme,
  styles,
  stageWidth,
  stageHeight,
  isCurrent,
  onSelect,
}: SlideCardProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ScenePreview | null>(null);

  /**
   * Сегмент карточки держит ОДИН слайд — этот, и только этот. Он не про
   * экономию (хотя карточка и не строит чужие слайды): дело в ссылочном
   * равенстве. `setElementState` (state/slides.ts) заменяет в массиве
   * `slides` ровно один объект `Slide`, остальные остаются ТЕМИ ЖЕ ссылками.
   * Собери карточка сегмент из ВСЕГО массива слайдов сразу, каждая правка
   * одного элемента на одном слайде пересобирала бы сцену на КАЖДОЙ карточке
   * ленты — при перетаскивании это пересборка N раз за каждый `pointermove`.
   * Однослайдовый сегмент делает зависимость эффекта ниже точной: карточка
   * пересобирается, только когда меняется ЕЁ СОБСТВЕННЫЙ слайд (или список
   * элементов/слов/размер сцены — тоже стабильные ссылки, пока правка их
   * не касается).
   *
   * Показу это не вредит: у сегмента из одного слайда `phaseAt` (morph.ts)
   * всегда даёт `still` на индексе 0 — переход неоткуда брать, значит любая
   * секунда показывает состояние ровно этого слайда. `.seek(0)` в эффекте
   * ниже — не приближение, а точный снимок.
   */
  const cardSegment: Segment = useMemo(() => ({
    source: { kind: 'url', url: '' },
    offset: 0,
    words,
    duration: 0,
    elements,
    slides: [slide],
    gates: [],
    // Карточка ленты — статичный снимок ОДНОГО слайда, времени в ней нет
    // вовсе (`duration: 0`). Владение — свойство времени, значит здесь его
    // не бывает: пустой список тут не «пока не сделали», а единственно
    // осмысленное значение.
    authorSpans: [],
    stage: { width: stageWidth, height: stageHeight },
    theme,
    styles,
  }), [slide, elements, words, stageWidth, stageHeight, theme, styles]);

  // Строит сцену один раз при монтировании карточки. Пересборка при каждой
  // правке идёт через второй эффект ниже (`rebuild`) — тот же приём: строить
  // ScenePreview один раз на структурные изменения и обновлять точечной
  // правкой (`rebuild`) отдельно, а не заводить второй способ работы
  // с ScenePreview рядом с проверенным.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const stage = document.createElement('div');
    // Сцена карточки не принимает жестов: карточка кликается целиком,
    // а не отдельные элементы внутри неё.
    stage.style.pointerEvents = 'none';
    host.appendChild(stage);

    const preview = new ScenePreview(stage, cardSegment);
    previewRef.current = preview;
    preview.seek(0);
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }

    return () => {
      preview.destroy();
      previewRef.current = null;
      stage.remove();
    };
    // cardSegment намеренно не в зависимостях: правки догоняет эффект ниже,
    // а этот отвечает только за создание и уничтожение узла сцены.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.rebuild(cardSegment);
    preview.seek(0);
    const host = hostRef.current;
    if (host && host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }
  }, [cardSegment]);

  const summary = slideChangeSummary(prevSlide, slide, elements);

  return (
    <button
      type="button"
      className={isCurrent ? 'ed-slide-strip-card ed-slide-strip-card-current' : 'ed-slide-strip-card'}
      data-testid={`strip-card-${slide.id}`}
      onClick={() => onSelect(slide.id)}
    >
      <span className="ed-slide-strip-scene" ref={hostRef} />
      <span className="ed-slide-strip-cap">{summary}</span>
    </button>
  );
}

/**
 * Экранирует id слайда для использования внутри CSS-селектора атрибута.
 *
 * Id слайдов рождаются как `node-1-slide-3` (см. `state/slides.ts`) и не
 * содержат кавычек или спецсимволов CSS сегодня, но `querySelector` обязан
 * остаться корректным и в будущем, а не полагаться на форму id молча.
 */
function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
