/**
 * Панель слайдов текущего сегмента.
 *
 * Слайд — снимок сцены в момент времени (ADR-015), и эта панель — второй
 * способ работы с ним, помимо дорожки: список по порядку, с их временами,
 * выбор текущего для правки, добавление и удаление. Метка на дорожке
 * (`track/MarksLane.tsx`) даёт то же самое жестом перетаскивания, но не
 * показывает список целиком и не позволяет выбрать первый слайд — он
 * специально не входит в перетаскиваемые метки (см. `Editor.tsx`, `marks`).
 *
 * Чисто презентационная, как `ElementList.tsx`: правило «нельзя удалить
 * первый или единственный слайд» целиком живёт в `state/slides.ts`
 * (`removeSlide`) — здесь оно только предсказано ДО клика, чтобы кнопка
 * показывала невозможность действия, а не падала (см. CLAUDE.md,
 * «проверяй проходимость»).
 */
import type { ReactElement } from 'react';

import type { Slide, Word } from '@player/core';

import { secondsText } from '../timeText.js';
import { markSeconds } from '../track/marks.js';
import { TRANSITION_INFO } from '../transitions.js';
import { Button, Section } from '../ui/index.js';

export interface SlidePanelProps {
  slides: readonly Slide[];
  words: readonly Word[];
  currentSlideId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  /**
   * Почему слайд нельзя вырезать/удалить (`state/slides.ts`, `cutProblem`).
   * `undefined` — можно. Единственный источник правила «первый и единственный
   * слайд не удаляются» — раньше здесь было собственное выражение
   * (`index > 0 && slides.length > 1`), вторая копия того же правила.
   */
  cutProblem: (slideId: string) => string | undefined;
}

// Свой formatSeconds здесь был; он заменён общим `secondsText` (Сессия 47,
// «одинаковые случаи пишутся одинаково»). Вид не изменился ни на символ —
// это и была та запись, к которой сведены остальные.

export function SlidePanel({
  slides,
  words,
  currentSlideId,
  onSelect,
  onAdd,
  onRemove,
  cutProblem,
}: SlidePanelProps): ReactElement {
  return (
    <section className="ed-slide-panel" aria-label="Слайды">
      <Section title="Слайды">
        <ul className="ed-slide-list">
          {slides.map((slide) => {
            const isCurrent = slide.id === currentSlideId;
            // Правило «первый и единственный слайд не удаляются» живёт целиком
            // в state/slides.ts (cutProblem) — здесь оно только предсказано
            // ДО клика, одним источником с removeSlide и с кнопкой «Вырезать».
            const canRemove = cutProblem(slide.id) === undefined;
            return (
              <li key={slide.id} className="ed-slide-row">
                <button
                  type="button"
                  className={isCurrent ? 'ed-slide-button ed-slide-button-current' : 'ed-slide-button'}
                  aria-current={isCurrent ? 'true' : undefined}
                  data-testid={`slide-${slide.id}`}
                  onClick={() => onSelect(slide.id)}
                >
                  <span className="ed-slide-time">{secondsText(markSeconds(slide.at, words))}</span>
                  <span className="ed-slide-transition">
                    {TRANSITION_INFO[slide.transition].label}
                  </span>
                </button>
                <Button
                  data-testid={`slide-remove-${slide.id}`}
                  disabled={!canRemove}
                  title={canRemove ? 'Удалить слайд' : 'Нельзя удалить первый или единственный слайд'}
                  onClick={() => onRemove(slide.id)}
                >
                  Удалить
                </Button>
              </li>
            );
          })}
        </ul>
        <Button data-testid="slide-add" onClick={onAdd}>
          Добавить слайд
        </Button>
      </Section>
    </section>
  );
}
