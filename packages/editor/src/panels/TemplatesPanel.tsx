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
 * **Подпись под плиткой у нас есть, а у Канвы её нет** — осознанное
 * расхождение, объяснённое в анатомии: у Канвы внутри плитки лежит настоящий
 * снимок шаблона, по нему всё понятно. У нас снимка нет и не будет, плитка
 * рисуется схемой, а две заготовки с одним заголовком на 152 px схемой
 * не различить.
 *
 * Заголовка внутри панели больше НЕТ. Он был (`span.ed-templates-label`),
 * и вместе с заголовком шапки каталога давал два одинаковых слова «Шаблоны»
 * на одном экране — замерено в Сессии 52. У панели один заголовок, и живёт
 * он в `chrome/CatalogPanel.tsx`.
 *
 * (Со строчной буквы намеренно. Охрана `templates.test.ts` ищет подписи
 * заготовок ПОДСТРОКОЙ по всему исходнику, комментарии включая, — а одна
 * из подписей это ровно то слово с прописной. Не придирка теста, а его
 * смысл: он не различает код и прозу и потому не даёт спрятать список
 * в комментарий. Наступить на это успели дважды за одну правку.)
 */
import type { ReactElement } from 'react';

import { libraryItem } from '../state/library.js';
import { SCENE_TEMPLATES, type SceneTemplate } from '../state/templates.js';
import { LayoutThumb, Tile, TileGrid, type ThumbShape } from '../ui/index.js';
import { fillOf, radiusOf, toneOf } from './thumbShapes.js';

export interface TemplatesPanelProps {
  onApply: (templateId: string) => void;
  /** Размер сцены проекта: схема рисуется в его координатах, а не в чужих. */
  stage: { readonly width: number; readonly height: number };
}

/**
 * Схема заготовки: её элементы, разложенные по сцене.
 *
 * `dx`/`dy` заготовки — смещение ЦЕНТРА элемента от центра сцены (см.
 * `state/templates.ts`), поэтому левый верхний угол считается тем же
 * выражением, что и в `applyTemplate`. Разойтись они не могут: разойдись
 * они — плитка показывала бы не то, что кладётся.
 */
function templateShapes(template: SceneTemplate, stage: { width: number; height: number }): ThumbShape[] {
  return template.elements.map((te) => {
    const item = libraryItem(te.item);
    const width = te.width ?? item.width;
    const height = te.height ?? item.height;
    const style = { ...item.style, ...te.style };
    return {
      x: stage.width / 2 + te.dx - width / 2,
      y: stage.height / 2 + te.dy - height / 2,
      width,
      height,
      fill: fillOf(style),
      tone: toneOf(style),
      radius: radiusOf(style),
    };
  });
}

export function TemplatesPanel({ onApply, stage }: TemplatesPanelProps): ReactElement {
  return (
    <TileGrid kind="раскладка" label="Добавить шаблон">
      {SCENE_TEMPLATES.map((template) => (
        <Tile
          key={template.id}
          shape="раскладка"
          label={template.label}
          data-testid={`template-${template.id}`}
          onClick={() => onApply(template.id)}
        >
          <LayoutThumb
            viewWidth={stage.width}
            viewHeight={stage.height}
            shapes={templateShapes(template, stage)}
          />
        </Tile>
      ))}
    </TileGrid>
  );
}
