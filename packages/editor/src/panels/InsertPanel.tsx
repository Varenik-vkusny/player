/**
 * Каталог заготовок элементов: плитка на каждую кладёт новый элемент сцены.
 *
 * **Что изменилось в Сессии 52.** Был `div.ed-insert` с `flex-wrap` и
 * кнопками-подписями; стал сеткой плиток по анатомии, снятой замером с живой
 * Канвы (docs/research/2026-08-19-anatomy-canva-capcut.md). Форма плитки
 * здесь ДРУГАЯ, чем у шаблонов, и это не разнобой, а то же правило натуры:
 * у Канвы одна ширина колонки и один зазор на все сетки панели, а число
 * колонок выводится из формы содержимого. Раскладка слайда — 16:9 и две
 * колонки; отдельный объект — 1:1 и три колонки с подписью.
 *
 * **Рисунок плитки выводится из полей самой заготовки** — её пропорций,
 * заливки и скругления (`panels/thumbShapes.ts`). Поэтому круг выглядит
 * кругом, линия — линией, а рамка — контуром, и при этом ни одного имени
 * заготовки в этом файле нет: пополнение библиотеки остаётся дописанной
 * записью в данных, что и проверяет test/library.test.ts.
 *
 * `category` делит каталог между тремя панелями без единого упоминания
 * конкретной заготовки: фильтр читает поле из данных.
 */
import { useMemo, type ReactElement } from 'react';

import type { Segment, Style, Theme } from '@player/core';

import { ELEMENT_LIBRARY, type LibraryCategory } from '../state/library.js';
import type { SceneTemplate } from '../state/templates.js';
import { Tile, TileGrid } from '../ui/index.js';
import { TemplateThumb } from './TemplateThumb.js';

export interface InsertPanelProps {
  onInsert: (itemId: string) => void;
  category: LibraryCategory;
  /**
   * Размер сцены проекта. Нужен НЕ для рисунка плитки (см. ниже), а для
   * `applyTemplate`, который раскладывает элемент относительно центра сцены.
   */
  stage: { readonly width: number; readonly height: number };
  theme: Theme;
  styles: readonly Style[];
  /** Текущая глава — образец пустой для снимка (см. TemplateThumb). */
  baseSegment: Segment;
}

export function InsertPanel(
  { onInsert, category, stage, theme, styles, baseSegment }: InsertPanelProps,
): ReactElement {
  const items = ELEMENT_LIBRARY.filter((item) => item.category === category);

  /*
   * Заготовка библиотеки, притворившаяся шаблоном из одного элемента.
   *
   * Второй машинки для снимка здесь НЕТ и не заводится: `TemplateThumb`
   * умеет рисовать любой шаблон, а шаблон из одной записи — это ровно
   * «положить на пустую сцену вот этот элемент по центру». Так снимок
   * заготовки строится тем же путём, что и снимок шаблона, а значит
   * тем же единым рендером (инвариант №5).
   *
   * Зачем вообще: до 20.08.2026 плитка рисовалась серой схемой из
   * objectShape, и все текстовые заготовки выглядели ОДИНАКОВЫМИ серыми
   * полосками — крупная ступень не отличалась от мелкой ничем, кроме
   * подписи под плиткой. У натуры плитка показывает сам образец своим
   * кеглем, и ступени размера видны сразу. Со снимком это получается
   * само: 96 px и 28 px в одном окне отличаются втрое с лишним.
   *
   * (Имён заготовок в этом файле НЕТ намеренно, включая прозу: охрана
   * library.test.ts ищет их подстрокой по всему исходнику и не различает
   * код и комментарий. Смысл охраны — не дать пополнению библиотеки
   * потребовать правки React; наступил на неё в тот же день.)
   */
  const asTemplates = useMemo(
    () => new Map<string, SceneTemplate>(items.map((item) => [
      item.id,
      { id: item.id, label: item.label, elements: [{ item: item.id, dx: 0, dy: 0, atSeconds: 0 }] },
    ])),
    [items],
  );

  return (
    <TileGrid kind="объект" label="Добавить элемент">
      {items.map((item) => (
        <Tile
          key={item.id}
          shape="объект"
          label={item.label}
          data-testid={`insert-${item.id}`}
          onClick={() => onInsert(item.id)}
        >
          {/*
            Плитка показывает КОРОБКУ САМОЙ ЗАГОТОВКИ, а не всю сцену.

            Со сценой 1920x1080 внутри квадрата в 100 px подпись в 28 px
            превращалась в четыре пикселя — правдиво (столько она и займёт
            на сцене) и совершенно нечитаемо. У натуры плитка текста
            показывает образец крупно, жертвуя масштабом ради узнавания,
            и это верный размен: масштаб автор увидит на холсте через
            секунду, а выбирать он должен ЗДЕСЬ.

            `stage` при этом остаётся настоящим — он нужен applyTemplate,
            который кладёт элемент относительно центра сцены. Меняется
            только окно, в которое смотрит снимок.
          */}
          <TemplateThumb
            template={asTemplates.get(item.id)!}
            baseSegment={baseSegment}
            stage={stage}
            viewport={{ width: item.width, height: item.height }}
            theme={theme}
            styles={styles}
          />
        </Tile>
      ))}
    </TileGrid>
  );
}
