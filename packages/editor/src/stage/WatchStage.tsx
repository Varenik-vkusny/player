/**
 * Вторая сцена редактора: «смотрю».
 *
 * Долг §12.5, открытый с Сессии 7. Сцена правки (`StageView`) показывает
 * ОДИН слайд — статичный снимок выбранного, — и потому переход между слайдами
 * автору физически негде увидеть: он описывает морфинг, которого не может
 * посмотреть. Блокер лежал в `StageView`: предпросмотр там собирается из
 * одного слайда (`slides: [currentSlide]`), и второго снимка у него нет.
 *
 * Решение владельца 31.07.2026 — не переделывать ту сцену, а поставить рядом
 * вторую. Разделение «что правлю» и «что смотрю» вышло дешевле переделки:
 * левая сцена не изменилась ни строкой, а правая берёт ПОЛНЫЙ сегмент
 * и просто спрашивает у плеера, как он выглядит в секунду головки.
 *
 * Инвариант №5 соблюдён по построению: рендер тут не свой, а тот же
 * `ScenePreview` из плеера, что и у сцены правки.
 */
import { useLayoutEffect, useRef, type ReactElement } from 'react';

// Segment здесь — ВИДОВОЕ представление плеера (со `stage`, `duration`
// и словами), а не сегмент схемы из ядра. Имена совпадают, содержимое нет;
// взять не тот тип — ровно та ошибка, от которой предостерегает CLAUDE.md
// про совпадающие имена типов.
import { ScenePreview, type Segment } from '@player/player';

export interface WatchStageProps {
  /** Полный сегмент со ВСЕМИ слайдами: из них и складывается переход. */
  readonly segment: Segment;
  /** Секунда головки. Ведущий здесь transport, сцена ведомая (инвариант №2). */
  readonly seconds: number;
}

export function WatchStage({ segment, seconds }: WatchStageProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ScenePreview | null>(null);
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  // Пересборка только при СТРУКТУРНОЙ правке — ровно по тому же основанию,
  // что и у сцены правки: иначе каждый pointermove при перетаскивании
  // уничтожал бы и строил сцену заново.
  const structureKey =
    `${segment.stage.width}x${segment.stage.height}`
    + `|${segment.elements.map((element) => element.id).join(',')}`
    + `|${segment.slides.map((slide) => slide.id).join(',')}`;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const stage = document.createElement('div');
    // Инвариант №3 в редакторской редакции: смотровая сцена не принимает
    // жестов вообще. Править её нельзя — на то есть левая.
    stage.style.pointerEvents = 'none';
    host.appendChild(stage);

    const preview = new ScenePreview(stage, segment);
    previewRef.current = preview;
    preview.seek(secondsRef.current);
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }

    const observer = new ResizeObserver(() => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        preview.fit(host.clientWidth, host.clientHeight);
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      preview.destroy();
      previewRef.current = null;
      stage.remove();
    };
    // segment намеренно не в зависимостях: пересобираемся по structureKey,
    // а точечные правки догоняет эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // Точечная правка: состояния слайдов поменялись, структура — нет.
  // `rebuild` вместо `updateElement`: правка одного элемента на ОДНОМ слайде
  // меняет и то, как он едет между слайдами, — то есть весь переход, а не
  // один узел. Считать разницу здесь значило бы завести вторую реализацию
  // морфинга рядом с настоящей.
  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.rebuild(segment);
    preview.seek(secondsRef.current);
    const host = hostRef.current;
    if (host && host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }
  }, [segment]);

  useLayoutEffect(() => {
    previewRef.current?.seek(seconds);
  }, [seconds]);

  return <div className="ed-watch-host" ref={hostRef} data-testid="watch-stage" />;
}
