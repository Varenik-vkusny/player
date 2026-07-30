/**
 * Панель шаблонов сцены: кнопка на каждую заготовку кладёт на сцену готовый
 * набор элементов с анимациями (и, у «Вопроса с вариантами», гейт).
 *
 * Презентационный компонент, как и `InsertPanel.tsx`: список кнопок и подписи
 * целиком берутся из `SCENE_TEMPLATES` (state/templates.ts, данные), а не
 * заданы здесь — этим и проверяется, что пополнение каталога шаблонов не
 * требует правки этого файла (test/templates.test.ts, тот же приём, что
 * `library.test.ts` для InsertPanel). Что именно применять решает
 * Editor.tsx через редьюсер (`applyTemplate`) — здесь только вызов колбэка.
 */
import type { ReactElement } from 'react';

import { SCENE_TEMPLATES } from '../state/templates.js';

export interface TemplatesPanelProps {
  onApply: (templateId: string) => void;
}

export function TemplatesPanel({ onApply }: TemplatesPanelProps): ReactElement {
  return (
    <div className="ed-templates">
      <span className="ed-templates-label">Шаблоны</span>
      <div className="ed-insert" role="group" aria-label="Добавить шаблон">
        {SCENE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="ed-action"
            data-testid={`template-${template.id}`}
            onClick={() => onApply(template.id)}
          >
            {template.label}
          </button>
        ))}
      </div>
    </div>
  );
}
