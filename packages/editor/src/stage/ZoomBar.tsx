/**
 * Панель масштаба холста — «−», текущий масштаб списком, «+».
 *
 * Место снято с натуры (Canva, 11.08.2026): управление масштабом стоит
 * в нижней строке ОКНА, ПОД холстом, и дизайн собой не накрывает.
 *
 * Первая попытка сделала панель плавающей поверх правого нижнего угла
 * холста — я запомнил «в правом нижнем углу» и потерял, что она вне холста.
 * Панель отнимала у автора угол его же сцены; поймал это тест паритета
 * рендера (инвариант №5), потому что снимок узла сцены захватывает всё,
 * нарисованное поверх её области.
 *
 * Строка постоянна и не появляется вместе с чем-либо: меняйся её наличие,
 * менялась бы площадь холста, сцена пересчитывала бы масштаб, и элемент
 * уезжал бы из-под курсора между двумя кликами двойного щелчка — дефект,
 * купленный в Сессии 29 (см. шапку `PropBar.tsx`).
 *
 * Список — обычный `<select>`, а не своё меню. Меню правой кнопки
 * (`ContextMenu.tsx`) заведено там, где браузер не даёт ничего готового;
 * здесь даёт: `<select>` сам открывается, сам закрывается по клику мимо, сам
 * ходит с клавиатуры и сам не вылезает за край окна. Своё меню ради восьми
 * пунктов было бы третьей реализацией одного и того же.
 *
 * Крайняя ступень ГАСИТ кнопку, а не убирает её: ступень остаётся законным
 * понятием, просто дальше идти некуда. Тот же приём, что у
 * `zoomBlockedReason` дорожки, и так же ведёт себя Canva.
 */
import type { ReactElement } from 'react';

import type { Zoom } from '@player/player';

import { STAGE_ZOOM_STEPS, zoomPercent } from './zoom.js';

export interface ZoomBarProps {
  /** Что выбрано: вписывание или ступень. */
  zoom: Zoom;
  /** Фактический масштаб — то, во сколько раз сцена нарисована прямо сейчас. */
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPick: (zoom: Zoom) => void;
}

/** Значение `<option>` для вписывания. Число сюда попасть не может: у ступеней точка. */
const FIT_VALUE = 'fit';

export function ZoomBar({
  zoom,
  scale,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onPick,
}: ZoomBarProps): ReactElement {
  return (
    <div
      className="ed-stage-zoom"
      data-testid="zoom-bar"
      /**
       * Нажатие по панели НЕ адресовано сцене.
       *
       * Без этого кнопки не работают вовсе, и молча: нажатие по пустому месту
       * холста начинает обведение рамкой и берёт `setPointerCapture` на узле
       * сцены, а браузер после захвата переадресует последующий `click`
       * захватившему узлу — то есть до кнопки он не доходит. Проверено
       * прогоном: клик по «+» не менял ни масштаб, ни выбранный пункт списка,
       * при этом ни ошибки, ни предупреждения.
       *
       * Тот же приём и та же причина, что у `handleGripDown` в `StageView`.
       */
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="ed-stage-zoom-btn"
        data-testid="zoom-out"
        aria-label="Отдалить"
        title="Отдалить (Ctrl+−)"
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        −
      </button>

      <select
        className="ed-stage-zoom-value"
        data-testid="zoom-select"
        aria-label="Масштаб холста"
        value={zoom === 'fit' ? FIT_VALUE : String(zoom)}
        onChange={(event) =>
          onPick(event.target.value === FIT_VALUE ? 'fit' : Number(event.target.value))
        }
      >
        {/* Фактический процент стоит в подписи вписывания, а не отдельным
            числом рядом: при вписывании автору нужны ОБА ответа — что сейчас
            действует режим и во сколько раз сцена уменьшена, — а два виджета
            ради этого повторяли бы друг друга на всех остальных ступенях. */}
        <option value={FIT_VALUE}>Вписать ({zoomPercent(scale)})</option>
        {STAGE_ZOOM_STEPS.map((step) => (
          <option key={step} value={String(step)}>
            {zoomPercent(step)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="ed-stage-zoom-btn"
        data-testid="zoom-in"
        aria-label="Приблизить"
        title="Приблизить (Ctrl+=)"
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        +
      </button>
    </div>
  );
}
