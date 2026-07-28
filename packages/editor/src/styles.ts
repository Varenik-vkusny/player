/**
 * Оформление редактора.
 *
 * Строкой, а не отдельным .css: пакет отдаётся хосту исходниками, и импорт
 * стилей заставил бы всякого, кто его встраивает, настраивать обработку CSS
 * у себя. Тут ровно та же логика, по которой плеер собирается без внешних
 * зависимостей — встраивание не должно требовать обвязки.
 *
 * Сцену это не касается: ни одно правило отсюда не адресует .scene-el.
 * Внешний вид сцены задаёт только проект, иначе редактор показывал бы
 * не то, что увидит зритель.
 */
export const EDITOR_STYLES = `
.ed-root {
  position: absolute;
  inset: 0;
  /* Иначе перетаскивание элемента заодно выделяет текст сцены синим:
     жест мышью для браузера неотличим от протягивания по тексту.
     Видно только глазами — на числах, которые проверяют тесты, это
     никак не сказывается. */
  user-select: none;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: #07090c;
  color: #e6edf5;
  font: 14px/1.5 system-ui, sans-serif;
}

.ed-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid #1c242f;
}

.ed-muted { color: #7d8fa5; }

/* Сцена вписывается в эту область. Overflow скрыт, потому что летербокс
   считается от размеров именно этого узла. */
.ed-stage-host {
  position: relative;
  overflow: hidden;
  min-height: 0;
}

/* Рамка выделения. Соседка сцены, а не её потомок: служебных узлов
   внутри сцены быть не должно. */
.ed-frame {
  position: absolute;
  /* Контур, а не рамка. border участвует в раскладке: проценты в позиции
     абсолютных потомков считаются от padding-box, поэтому при border: 1px
     ручка с left: 100% вставала на пиксель внутрь угла, и растягивание
     не доезжало. outline рисуется снаружи и на раскладку не влияет. */
  outline: 1px solid #4c8dff;
  /* Рамка не ловит указатель: перетаскивание тела элемента обрабатывает
     контейнер по геометрии. Ловят только ручки. */
  pointer-events: none;
  transform-origin: 50% 50%;
}

/* Размер ручки в пикселях контейнера, а не сцены: иначе на узком окне
   она сожмётся вместе со сценой и станет непопадаемой. */
.ed-grip {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  box-sizing: border-box;
  border: 1px solid #4c8dff;
  border-radius: 2px;
  background: #0b0f14;
  pointer-events: auto;
  touch-action: none;
}

.ed-grip-rotate {
  left: 50%;
  top: -26px;
  border-radius: 50%;
  cursor: grab;
}

.ed-selection {
  margin-left: auto;
  color: #7d8fa5;
  font-variant-numeric: tabular-nums;
}

/* Жест не должен превращаться в прокрутку или зум страницы. */
.ed-stage-host { touch-action: none; }

.ed-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-top: 1px solid #1c242f;
  background: #0b0f14;
}

.ed-seek { flex: 1; }
.ed-time { font-variant-numeric: tabular-nums; color: #7d8fa5; }
`;
