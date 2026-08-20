/**
 * Каталог шаблонов сцены: плитка на каждую заготовку кладёт на сцену готовый
 * набор элементов с анимациями (и, у одной из них, гейт).
 *
 * **Что изменилось в Сессии 52.** Раньше здесь был `div.ed-insert` с
 * `flex-wrap` и кнопками-подписями внутри — буквально список кнопок в строку.
 * Владелец указал на это прямым текстом, и правкой цвета такое не лечится:
 * нужна другая разметка. Теперь это сетка плиток по анатомии, снятой замером
 * с живой Канвы (docs/research/2026-08-19-anatomy-canva-capcut.md): плитка
 * 16:9 — форма самого слайда, — и ДВЕ колонки.
 *
 * **Рисунок плитки строится из тех же данных**, что и сам шаблон: каждый
 * элемент заготовки становится прямоугольником в координатах сцены. Поэтому
 * «сравнение двух колонок» показывает две колонки, а список пунктов — список,
 * и ни одного имени шаблона в этом файле нет. Пополнение каталога остаётся
 * дописанной записью в данных — это и проверяет test/templates.test.ts.
 *
 * **Что изменилось 20.08.2026: снимок вместо схемы, и подписи больше нет.**
 *
 * Прежний текст на этом месте гласил: «у нас снимка нет и не будет, плитка
 * рисуется схемой». Второе утверждение оказалось неверным — снимок появился
 * (`TemplateThumb`), и без единой строки нового рендера: плитка строится тем
 * же `ScenePreview` и тем же `applyTemplate`, что кладут шаблон на сцену.
 *
 * Подпись под плиткой держалась ровно на схеме: две заготовки с одинаковой
 * верхней строкой на 152 px схемой не различить. Со снимком различаются —
 * у них разный текст, цвет и раскладка, — и подпись убрана, как у натуры
 * (замер 20.08.2026: в панели «Шаблоны» Канвы подписей под плитками нет).
 *
 * (Имён заготовок в этом файле нет даже в прозе: охрана templates.test.ts
 * ищет их подстрокой по всему исходнику и не различает код и комментарий.
 * Смысл охраны — не дать спрятать список заготовок в текст.)
 *
 * Заголовка внутри панели больше НЕТ. Он был (`span.ed-templates-label`),
 * и вместе с заголовком шапки каталога давал два одинаковых слова «Шаблоны»
 * на одном экране — замерено в Сессии 52. Имя панели живёт
 * в `chrome/CatalogPanel.tsx` и печатается только там, где его негде
 * прочитать (см. showTitle).
 *
 * (Со строчной буквы намеренно. Охрана `templates.test.ts` ищет подписи
 * заготовок ПОДСТРОКОЙ по всему исходнику, комментарии включая, — а одна
 * из подписей это ровно то слово с прописной. Не придирка теста, а его
 * смысл: он не различает код и прозу и потому не даёт спрятать список
 * в комментарий. Наступить на это успели дважды за одну правку.)
 */
import { Fragment, type ReactElement } from 'react';

import type { Segment, Style, Theme } from '@player/core';

import { SCENE_TEMPLATES, type TemplateGroup } from '../state/templates.js';
import { CatalogSection, EmptyState, Tile, TileGrid } from '../ui/index.js';
import { TemplateThumb } from './TemplateThumb.js';

export interface TemplatesPanelProps {
  onApply: (templateId: string) => void;
  /** Размер сцены проекта: шаблон раскладывается в его координатах, а не в чужих. */
  stage: { readonly width: number; readonly height: number };
  /** Тема проекта: у шаблона нет своих цветов, он ссылается на её роли. */
  theme: Theme;
  /** Именованные наборы свойств: элемент шаблона может ссылаться на стиль. */
  styles: readonly Style[];
  /** Текущая глава — образец, из которого миниатюра берёт пустую (см. TemplateThumb). */
  baseSegment: Segment;
  /**
   * Что набрано в поиске панели. Пустая строка — показать всё.
   *
   * Фильтр НАСТОЯЩИЙ: строка поиска у натуры есть, и завести её пустой
   * ради сходства значило бы соврать так же, как пунктом рейки без
   * содержимого. Ищется по подписи заготовки, без учёта регистра.
   */
  query: string;
}

export function TemplatesPanel(
  { onApply, stage, theme, styles, baseSegment, query }: TemplatesPanelProps,
): ReactElement {
  const needle = query.trim().toLowerCase();
  const shown = needle === ''
    ? SCENE_TEMPLATES
    : SCENE_TEMPLATES.filter((t) => t.label.toLowerCase().includes(needle));

  if (shown.length === 0) {
    return <EmptyState title="Ничего не нашлось" hint="Попробуйте другое слово" />;
  }

  /*
   * РАЗДЕЛЫ, как у натуры: панель разбита на именованные блоки, а не идёт
   * одной сплошной сеткой. Порядок разделов задан здесь и совпадает
   * с порядком работы автора: начало объяснения, потом текстовые кадры,
   * потом раскладки, потом остановка с вопросом.
   *
   * При поиске разделы не рисуются: найденное показывается одной сеткой.
   * Разбивать четыре совпадения на четыре заголовка — это заголовков
   * больше, чем содержимого.
   */
  const ORDER: readonly { readonly id: TemplateGroup; readonly title: string }[] = [
    { id: 'начало', title: 'Начало и конец' },
    { id: 'текст', title: 'Текстовые кадры' },
    { id: 'раскладка', title: 'Раскладки' },
    { id: 'вопрос', title: 'Остановка с вопросом' },
  ];

  const tile = (template: (typeof SCENE_TEMPLATES)[number]) => (
    <Tile
      key={template.id}
      shape="раскладка"
      label={template.label}
      showLabel={false}
      data-testid={`template-${template.id}`}
      onClick={() => onApply(template.id)}
    >
      <TemplateThumb
        template={template}
        baseSegment={baseSegment}
        stage={stage}
        theme={theme}
        styles={styles}
      />
    </Tile>
  );

  if (needle !== '') {
    return (
      <>
        <CatalogSection title="Найдено" count={shown.length} />
        <TileGrid kind="раскладка" label="Добавить шаблон">
          {shown.map(tile)}
        </TileGrid>
      </>
    );
  }

  return (
    <>
      {ORDER.map((section) => {
        const items = shown.filter((t) => t.group === section.id);
        if (items.length === 0) return null;
        return (
          <Fragment key={section.id}>
            <CatalogSection title={section.title} count={items.length} />
            <TileGrid kind="раскладка" label={`Добавить шаблон: ${section.title}`}>
              {items.map(tile)}
            </TileGrid>
          </Fragment>
        );
      })}
    </>
  );
}
