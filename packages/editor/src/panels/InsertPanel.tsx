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
import { Fragment, useMemo, type ReactElement } from 'react';

import type { Segment, Style, Theme } from '@player/core';

import { ELEMENT_LIBRARY, type LibraryCategory } from '../state/library.js';
import type { SceneTemplate } from '../state/templates.js';
import { CatalogSection, EmptyState, Tile, TileGrid } from '../ui/index.js';
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
  /** Что набрано в поиске панели. Пустая строка — показать всё. */
  query: string;
  /** Имя раздела над сеткой. */
  sectionTitle: string;
}

export function InsertPanel(
  { onInsert, category, stage, theme, styles, baseSegment, query, sectionTitle }: InsertPanelProps,
): ReactElement {
  const needle = query.trim().toLowerCase();
  const items = ELEMENT_LIBRARY.filter(
    (item) => item.category === category
      && (needle === '' || item.label.toLowerCase().includes(needle)),
  );

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
      {
        id: item.id,
        label: item.label,
        /* Раздел синтетическому шаблону не нужен — он никогда не попадает
           в панель шаблонов, — но поле обязательное, и это верно: забытый
           раздел должен ломать типизацию, а не ронять заготовку молча. */
        group: 'раскладка',
        elements: [{ item: item.id, dx: 0, dy: 0, atSeconds: 0 }],
      },
    ])),
    [items],
  );

  if (items.length === 0) {
    return <EmptyState title="Ничего не нашлось" hint="Попробуйте другое слово" />;
  }

  /*
   * РАЗДЕЛЫ внутри вкладки, как у натуры: её «Элементы» разбиты на блоки
   * («Недавно использованные», «Рекомендации для вас», «Просмотр
   * категорий»), а не идут одной сеткой.
   *
   * Имена разделов лежат в самих заготовках (`group` в ELEMENT_LIBRARY),
   * а не перечислены здесь: пополнение библиотеки не должно требовать
   * правки React — это отдельная охрана, и она уже есть.
   *
   * Порядок разделов — порядок первого появления в библиотеке. Заготовки
   * без раздела собираются в общий, названный вызывающим.
   */
  const sections: { title: string; items: typeof items }[] = [];
  for (const item of items) {
    const title = item.group ?? sectionTitle;
    const found = sections.find((sec) => sec.title === title);
    if (found) found.items.push(item);
    else sections.push({ title, items: [item] });
  }

  const tile = (item: (typeof items)[number]) => (
    <Tile
      key={item.id}
      shape="объект"
      label={item.label}
      data-testid={`insert-${item.id}`}
      onClick={() => onInsert(item.id)}
    >
      <TemplateThumb
        template={asTemplates.get(item.id)!}
        baseSegment={baseSegment}
        stage={stage}
        viewport={{ width: item.width, height: item.height }}
        theme={theme}
        styles={styles}
      />
    </Tile>
  );

  if (needle !== '') {
    return (
      <>
        <CatalogSection title="Найдено" count={items.length} />
        <TileGrid kind="объект" label="Добавить элемент">
          {items.map(tile)}
        </TileGrid>
      </>
    );
  }

  return (
    <>
      {sections.map((sec) => (
        <Fragment key={sec.title}>
          <CatalogSection title={sec.title} count={sec.items.length} />
          <TileGrid kind="объект" label={`Добавить элемент: ${sec.title}`}>
            {sec.items.map(tile)}
          </TileGrid>
        </Fragment>
      ))}
    </>
  );
}
