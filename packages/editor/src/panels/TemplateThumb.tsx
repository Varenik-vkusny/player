/**
 * НАСТОЯЩИЙ снимок шаблона внутри плитки каталога.
 *
 * Замер живой Канвы 20.08.2026, панель «Шаблоны»: плитка 153×86 (16:9),
 * две колонки, зазор 8, подписей под плитками НЕТ — и внутри каждой лежит
 * настоящая картинка шаблона, со своим цветом, шрифтом и фотографиями.
 *
 * У нас там была СХЕМА — серые прямоугольники в координатах сцены
 * (`LayoutThumb`). Схема честно показывала раскладку, но рядом с канвовской
 * плиткой выглядела чертежом рядом с фотографией, и владелец сказал об этом
 * прямым текстом: «всё ещё нихуя не похоже». Оформлением это не лечилось.
 *
 * **Второго рендера здесь НЕТ, и это главное.** Картинка строится тем же
 * `ScenePreview`, которым рисуется большая сцена и карточки ленты слайдов
 * (инвариант №5). Приём взят у ленты слайдов дословно — собрать сегмент
 * из одного слайда, отдать его превью, вызвать `fit` по коробке, — потому
 * что он там уже проверен и работает.
 *
 * **Сегмент плитки строит сам `applyTemplate`**, тот же, что кладёт шаблон
 * на сцену по нажатию. Отсюда свойство, которого у схемы быть не могло:
 * плитка показывает РОВНО то, что ляжет, — не похожее, а то же самое.
 * Расхождение между картинкой и результатом стало невыразимым, а не
 * «проверяется тестом».
 *
 * Тема и стили берутся из проекта: у шаблона нет своих цветов, он ссылается
 * на роли темы. Без них миниатюра красилась бы запасными значениями и
 * расходилась бы с холстом — та же причина, по которой их получает лента
 * слайдов.
 */
import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';

import { ScenePreview, type Segment as SceneSegment } from '@player/player';
import type { Segment, Style, Theme } from '@player/core';

import { applyTemplate, type SceneTemplate } from '../state/templates.js';

export interface TemplateThumbProps {
  readonly template: SceneTemplate;
  /**
   * Текущая глава проекта — ОБРАЗЕЦ, из которого берётся пустая.
   *
   * Сочинять пустой сегмент полями было бы вторым источником правды о схеме:
   * у главы есть `exit`, `audio`, `at` у слайда и ещё десяток обязательных
   * полей, и любое расхождение с настоящей схемой всплыло бы не здесь,
   * а в чужом месте. Проще и надёжнее взять настоящую главу и очистить
   * то, что должно быть пустым, — тогда остальные поля заведомо верны.
   */
  readonly baseSegment: Segment;
  /** Размер сцены проекта: шаблон раскладывается в его координатах. */
  readonly stage: { readonly width: number; readonly height: number };
  /**
   * Окно, в которое смотрит снимок, в единицах сцены. По умолчанию — вся
   * сцена: шаблон занимает её целиком, и показывать надо её целиком.
   *
   * Панель заготовок передаёт сюда коробку самого элемента: заготовка
   * занимает малую часть сцены, и в масштабе сцены подпись в 28 px
   * превращалась бы в четыре пикселя.
   */
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly theme: Theme;
  readonly styles: readonly Style[];
}

export function TemplateThumb(
  { template, baseSegment, stage, viewport, theme, styles }: TemplateThumbProps,
): ReactElement {
  const view = viewport ?? stage;
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ScenePreview | null>(null);

  /**
   * Пустой сегмент, на который кладётся шаблон.
   *
   * `duration: 0` и пустой `authorSpans` — по тому же основанию, что
   * у карточки ленты слайдов: снимок статичен, времени в нём нет вовсе,
   * и пустой список здесь не «пока не сделали», а единственное осмысленное
   * значение.
   *
   * Слайд ровно один и стоит на нуле: у сегмента из одного слайда переход
   * неоткуда брать, поэтому `seek(0)` даёт точный снимок, а не приближение.
   */
  const thumbSegment: SceneSegment = useMemo(() => {
    const firstSlide = baseSegment.slides[0];
    if (!firstSlide) throw new Error('у главы нет ни одного слайда — миниатюру строить не из чего');
    const empty: Segment = {
      ...baseSegment,
      elements: [],
      slides: [{ ...firstSlide, states: {} }],
      gates: [],
    };
    /*
      Раскладка идёт в координатах ОКНА, а не проекта: applyTemplate кладёт
      элемент относительно ЦЕНТРА сцены, и разложи мы в координатах 1920x1080,
      а показывай окно 1400x220 — элемент уехал бы из кадра вместе с центром.
      Для шаблонов окно и есть сцена, поэтому там ничего не меняется.
    */
    const filled = applyTemplate(template, empty, { width: view.width, height: view.height });
    const slide = filled.slides[0];
    if (!slide) throw new Error('applyTemplate вернул главу без слайдов');
    return {
      source: { kind: 'url', url: '' },
      offset: 0,
      words: [],
      duration: 0,
      elements: filled.elements,
      slides: [slide],
      gates: [],
      authorSpans: [],
      stage: { width: view.width, height: view.height },
      theme,
      styles,
    };
  }, [template, baseSegment, stage.width, stage.height, view.width, view.height, theme, styles]);

  // Создание и уничтожение узла сцены — отдельно от правок, как у ленты
  // слайдов: два эффекта вместо одного, чтобы пересборка при изменении
  // данных шла точечным rebuild, а не пересозданием превью.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const stageNode = document.createElement('div');
    // Плитка нажимается целиком, элементы внутри жестов не принимают.
    stageNode.style.pointerEvents = 'none';
    host.appendChild(stageNode);

    const preview = new ScenePreview(stageNode, thumbSegment);
    previewRef.current = preview;
    preview.seek(0);
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }

    return () => {
      preview.destroy();
      previewRef.current = null;
      stageNode.remove();
    };
    // thumbSegment намеренно не в зависимостях: правки догоняет эффект ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.rebuild(thumbSegment);
    preview.seek(0);
    const host = hostRef.current;
    if (host && host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }
  }, [thumbSegment]);

  return <div className="ed-tile-scene" ref={hostRef} data-testid={`template-thumb-${template.id}`} />;
}
