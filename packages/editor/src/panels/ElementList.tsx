/**
 * Список элементов сцены — второй способ выделения, помимо клика по сцене.
 *
 * Существует ради элемента, чья анимация появления ещё не отыграла: клик
 * по сцене такой элемент найти не может — StageView фильтрует попадание по
 * видимости (ADR-010, «Выделяется то, что ВИДНО»), а список показывает
 * всё, что есть в scene.elements, независимо от того, что сейчас нарисовано.
 *
 * Строки — настоящие `<button>`: обход Tab работает без своей машинерии,
 * а порядок обхода совпадает с тем, что автор видит глазами (по zIndex).
 */
import type { ReactElement, ReactNode } from 'react';

import { IconButton, Icon, Section } from '../ui/index.js';

import type { ElementRow } from './elementRows.js';

export interface ElementListProps {
  rows: readonly ElementRow[];
  selectedIds: readonly string[];
  onSelect: (id: string) => void;
  /** Поместить элемент на текущий слайд — §12.4. */
  onPutOnSlide: (id: string) => void;
  /** Убрать с текущего слайда, НЕ удаляя из части — парное к предыдущему. */
  onRemoveFromSlide: (id: string) => void;
  /**
   * Действие заголовка секции «Элементы» — кнопка «Удалить» выделенное,
   * стоит в одной строке с названием списка, на который действует.
   * Обработчик и disabled собирает Editor.tsx: список только показывает.
   */
  headerAction?: ReactNode;
}

export function ElementList({
  rows,
  selectedIds,
  onSelect,
  onPutOnSlide,
  onRemoveFromSlide,
  headerAction,
}: ElementListProps): ReactElement {
  return (
    <div className="ed-elements" data-testid="element-list" aria-label="Элементы сцены">
      <Section title="Элементы" action={headerAction}>
        {rows.length === 0 ? (
          <p className="ed-elements-empty">Сцена пуста</p>
        ) : (
          <ul className="ed-elements-list">
            {rows.map((row) => (
              <li key={row.id} className="ed-element-item">
                <button
                  type="button"
                  className={
                    selectedIds.includes(row.id) ? 'ed-element-row ed-element-row-selected' : 'ed-element-row'
                  }
                  aria-pressed={selectedIds.includes(row.id)}
                  data-testid={`element-row-${row.id}`}
                  /*
                    Подпись строки не влезает в колонку и обрезается многоточием:
                    замер 18.08.2026 на demo при окне 1280 — обрезаны ПЯТЬ строк
                    из семи, худшей нужно 251 px при видимых 123. Обрезка сама
                    по себе законна (колонка 231 px, и шире ей взяться неоткуда),
                    незаконно было то, что прочитать строку целиком нельзя было
                    ни здесь, ни наведением.

                    Почему title, хотя в проекте записано «на подсказки при
                    наведении не смотрят». То правило про ПРИЧИНУ гашения:
                    там есть что показать видимо, и показать надо видимо.
                    Здесь видимого места нет физически, и единственная
                    названная планом замена — перенос на две строки — замерена
                    и оказалась ХУЖЕ: строка растёт 28 → 46 px, в потолок
                    списка (180 px) влезает 3.9 строки вместо 6.4, и при этом
                    ДВЕ подписи из пяти всё равно остаются обрезанными.
                    Платить третью списка за половину решения смысла нет.

                    Берётся `full`, а не `summary`: `summary` обрезан потолком
                    в 40 знаков ради раскладки, и подсказка из него не дала бы
                    прочитать строку целиком — тексту demo нужно 58. Подсказка
                    из обрезанного выглядела бы как решение, не будучи им.

                    На доступное имя кнопки title не влияет: у кнопки с текстом
                    имя берётся из содержимого, а title — только запасной путь.
                  */
                  title={row.full}
                  onClick={() => onSelect(row.id)}
                >
                  <span className="ed-element-type">{row.type}</span>
                  <span className="ed-element-id">{row.id}</span>
                  <span className="ed-element-summary">{row.summary}</span>
                  {/* Элемент существует в сегменте, но на этом слайде у него ещё
                      нет состояния — появится только на более позднем слайде.
                      Не показать это значило бы дать автору выделить элемент
                      и упереться в пустую панель свойств без объяснения. */}
                  {!row.onSlide ? <span className="ed-element-not-on-slide">не на слайде</span> : null}
                </button>
                {/*
                  Сестра строки, а не вложенная в неё кнопка: кнопку в кнопку
                  браузер не разрешает, а нажатие по внутренней всё равно
                  поднялось бы к внешней и выделило элемент вместо действия.

                  §12.4: элемент живёт в ГЛАВЕ, а его состояние — на слайде.
                  Здесь автор управляет вторым, не трогая первое: «убрать»
                  снимает элемент с этого кадра, оставляя его в главе и на
                  остальных слайдах. Удаление насовсем — другая кнопка,
                  в панели свойств, и это различие держится намеренно.
                */}
                <IconButton
                  className="ed-element-on-slide"
                  testId={`element-slide-toggle-${row.id}`}
                  hint={row.onSlide ? 'Убрать с этого слайда' : 'Поместить на этот слайд'}
                  label={
                    row.onSlide
                      ? `Убрать «${row.id}» с этого слайда`
                      : `Поместить «${row.id}» на этот слайд`
                  }
                  onClick={() => (row.onSlide ? onRemoveFromSlide(row.id) : onPutOnSlide(row.id))}
                >
                  <Icon name={row.onSlide ? 'minus' : 'plus'} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
