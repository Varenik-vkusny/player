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

import { markSeconds } from '../track/marks.js';

export interface SlidePanelProps {
  slides: readonly Slide[];
  words: readonly Word[];
  currentSlideId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)} с`;
}

export function SlidePanel({
  slides,
  words,
  currentSlideId,
  onSelect,
  onAdd,
  onRemove,
}: SlidePanelProps): ReactElement {
  return (
    <section className="ed-slide-panel" aria-label="Слайды">
      <h2 className="ed-insp-title">Слайды</h2>
      <ul className="ed-slide-list">
        {slides.map((slide, index) => {
          const isCurrent = slide.id === currentSlideId;
          // Первый слайд обязан стоять на нуле и не может быть удалён
          // (state/slides.ts, removeSlide); последний оставшийся — тоже:
          // сегменту нечего было бы показывать без единого слайда.
          const canRemove = index > 0 && slides.length > 1;
          return (
            <li key={slide.id} className="ed-slide-row">
              <button
                type="button"
                className={isCurrent ? 'ed-slide-button ed-slide-button-current' : 'ed-slide-button'}
                aria-current={isCurrent ? 'true' : undefined}
                data-testid={`slide-${slide.id}`}
                onClick={() => onSelect(slide.id)}
              >
                <span className="ed-slide-time">{formatSeconds(markSeconds(slide.at, words))}</span>
                <span className="ed-slide-transition">
                  {slide.transition === 'morph' ? 'плавно' : 'разрез'}
                </span>
              </button>
              <button
                type="button"
                className="ed-action"
                data-testid={`slide-remove-${slide.id}`}
                disabled={!canRemove}
                title={canRemove ? 'Удалить слайд' : 'Нельзя удалить первый или единственный слайд'}
                onClick={() => onRemove(slide.id)}
              >
                Удалить
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="ed-action" data-testid="slide-add" onClick={onAdd}>
        Добавить слайд
      </button>
    </section>
  );
}
