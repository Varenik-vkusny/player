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
  /* Редактор занимает окно и не прокручивается целиком: прокрутка есть
     внутри панелей, а сама раскладка обязана оставаться на месте.
     Без этого длинное сообщение об ошибке на дорожке раздвигало сетку
     шире окна — у детей grid и flex минимальный размер по умолчанию
     равен содержимому, — и сцена уезжала за край вместе с масштабом. */
  overflow: hidden;
  background: #07090c;
  color: #e6edf5;
  font: 14px/1.5 system-ui, sans-serif;
}

/* Шапка обязана иметь ПОСТОЯННУЮ высоту.
   Иначе при выделении элемента в ней появляется строка с координатами,
   переносится на вторую строку на узком окне, шапка вырастает — и сцена
   уезжает вниз ровно в тот момент, когда автор взялся за элемент.
   Замерено: сдвиг 21 px на экране, то есть 119 пикселей сцены при
   масштабе 0.177. Элемент прыгает под курсором. */
.ed-header {
  display: flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid #1c242f;
  overflow: hidden;
  white-space: nowrap;
}

/* Сжимаются подписи, а не заголовок: имя проекта важнее счётчиков. */
.ed-title { flex: 0 0 auto; }
.ed-muted {
  color: #7d8fa5;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

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

.ed-actions { display: flex; gap: 8px; flex: 0 0 auto; margin-left: auto; }

.ed-action {
  padding: 4px 10px;
  border: 1px solid #2c3a4d;
  border-radius: 6px;
  background: #1b2430;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.ed-action:hover { border-color: #4c8dff; }

.ed-selection {
  color: #7d8fa5;
  font-variant-numeric: tabular-nums;
  /* Тот же закон, что и у шапки: показания выделения не имеют права
     менять раскладку. Полный текст остаётся в разметке для теста
     и экранного диктора. */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Жест не должен превращаться в прокрутку или зум страницы. */
.ed-stage-host { touch-action: none; }

/* Середина: сцена, список элементов и панель свойств. Обе боковые колонки
   фиксированной ширины, сцена забирает остальное. min-height: 0 обязателен —
   без него содержимое не даёт грид-строке сжаться, и дорожка уезжает
   за нижний край окна. */
.ed-main {
  display: grid;
  grid-template-columns: 1fr 220px 260px;
  min-height: 0;
  min-width: 0;
  border-bottom: 1px solid #1c242f;
}

.ed-inspector { border-left: 1px solid #1c242f; }

/* Панель элементов: вставка и удаление сверху, список — снизу и растягивается.
   flex-column, а не grid с фиксированным числом строк: сообщение об ошибке
   вставки картинки — условный ребёнок, и число строк грида «поехало» бы
   в его отсутствие. Список получает flex: 1 1 auto и забирает весь остаток
   высоты независимо от того, сколько соседей сейчас отрисовано. */
.ed-elements-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: #0b0f14;
  border-left: 1px solid #1c242f;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.ed-insert { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px; }

.ed-delete-row {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

/* Сообщение о каскадном удалении не имеет права раздвинуть панель шире
   отведённой колонки — тот же закон, что и у .ed-failure на дорожке. */
.ed-delete-msg {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7d8fa5;
  font-size: 11px;
}

.ed-elements {
  flex: 1 1 auto;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  min-height: 0;
}

.ed-elements-empty { margin: 0; color: #7d8fa5; font-size: 12px; }

.ed-elements-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  min-height: 0;
}

/* Настоящая кнопка, а не строка со своим обработчиком клика: Tab обходит
   список без отдельной клавиатурной машинерии (см. срез 6 плана). */
.ed-element-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.ed-element-row:hover { border-color: #2c3a4d; }
.ed-element-row-selected { border-color: #4c8dff; background: #111a24; }

.ed-element-type {
  flex: 0 0 auto;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #7d8fa5;
}

.ed-element-id { flex: 0 0 auto; font-variant-numeric: tabular-nums; }

/* min-width: 0 обязателен: без него содержимое элемента (в том числе
   длинный текст) не даёт строке сжаться и раздвигает панель. */
.ed-element-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7d8fa5;
}

/* Дорожка. */
.ed-track {
  display: grid;
  gap: 8px;
  padding: 10px 16px 12px;
  background: #0b0f14;
  min-width: 0;
}

.ed-transport {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ed-play {
  width: 34px;
  height: 34px;
  border: 1px solid #2c3a4d;
  border-radius: 8px;
  background: #1b2430;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ed-play:hover:not(:disabled) { border-color: #4c8dff; }
.ed-play:disabled { opacity: 0.4; cursor: default; }

.ed-clock { color: #7d8fa5; font-variant-numeric: tabular-nums; }

/* Сообщение об ошибке не имеет права двигать раскладку. Оно длинное
   и содержит путь к файлу, а флекс-строка по умолчанию расширяется
   под содержимое ребёнка. Обрезаем многоточием — полный текст всё равно
   остаётся в разметке и доступен тесту и экранному диктору. */
.ed-failure {
  color: #ff8a6b;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Полоса с волной. Всё внутри позиционируется от неё, поэтому relative
   здесь несущий, а не косметический. */
.ed-lane {
  position: relative;
  height: 72px;
  cursor: pointer;
  /* Жест перемотки не должен превращаться в прокрутку страницы. */
  touch-action: none;
}

.ed-ticks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ed-tick {
  position: absolute;
  top: 2px;
  padding-left: 4px;
  border-left: 1px solid #2c3a4d;
  font-size: 10px;
  color: #55637a;
  font-variant-numeric: tabular-nums;
  /* Подпись не должна ловить курсор: под ней перемотка. */
  pointer-events: none;
}

/* Головка. Ширина в один пиксель и сдвиг на полпикселя влево, чтобы линия
   стояла ровно на своей секунде, а не правее её. */
.ed-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: #e4572e;
  pointer-events: none;
}

/* Кнопки добавления метки прижаты вправо: слева транспорт, справа правки. */
.ed-add { margin-left: auto; display: flex; gap: 8px; flex: 0 0 auto; }

.ed-add-mark {
  padding: 5px 10px;
  border: 1px solid #2c3a4d;
  border-radius: 6px;
  background: #1b2430;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.ed-add-mark:hover:not(:disabled) { border-color: #4c8dff; }
.ed-add-mark:disabled { opacity: 0.4; cursor: default; }

/* Полоса меток. Отдельной строкой под волной: лежи метки поверх неё,
   они отбирали бы у перемотки половину нажатий. */
.ed-marks {
  position: relative;
  height: 22px;
  border-top: 1px solid #1c242f;
}

.ed-mark {
  position: absolute;
  top: 2px;
  /* Половина ширины влево: метка стоит НА своей секунде, а не правее её. */
  margin-left: -9px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #7d8fa5;
  font-size: 11px;
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.ed-mark:hover { color: #e6edf5; }
.ed-mark-selected { border-color: #4c8dff; color: #e6edf5; }

/* Привязка к слову — не украшение, а то, что автор обязан видеть без
   раскрытия свойств: от неё зависит, переживёт ли метка замену озвучки. */
.ed-mark-word { color: #a8c686; }
.ed-mark-gate { color: #e4572e; }
.ed-mark-gate.ed-mark-word { color: #a8c686; }

/* Строка транскрипта. Одна строка с прокруткой: расти в высоту она
   не имеет права — иначе дорожка съест сцену.

   line-height и max-height заданы в px, а не em/безразмерным множителем.
   3.4em при font-size:12px даёт 40.8px — величину, не представимую в сетке
   1/64 px, которой Chrome меряет раскладку (40.8×64 = 2611.2). Браузер
   округляет до 40.796875px, и эта дробность поднимается по дереву до
   .ed-track → .ed-main → .ed-stage-host, оставляя область сцены с дробной
   высотой (измерено: 534.203125px вместо 534px). Автор из-за этого видит
   сцену на дробной позиции — источник именно ЗДЕСЬ, а не в самой области
   сцены, и чинить нужно источник. */
.ed-words {
  margin: 0;
  max-height: 40px;
  overflow: auto;
  color: #55637a;
  font-size: 12px;
  line-height: 20px;
  user-select: text;
}

.ed-word-active {
  color: #e6edf5;
  background: #1b2430;
  border-radius: 3px;
}

/* Волна.

   display: block убирает щель под канвой: по умолчанию она inline и стоит
   на базовой линии строки, поэтому под ней остаётся место под нижние
   выносные элементы — полоса выглядит смещённой вверх без единой причины
   в разметке.

   Фон в CSS, а не заливкой по канве: он не меняется от кадра к кадру,
   а перерисовка идёт каждый кадр воспроизведения.

   Размер здесь не задаётся вовсе. Он приходит компоненту пропсами и в тех
   же числах уходит в размер битмапа; правило в CSS стало бы вторым хозяином
   ширины, и волна расползлась бы относительно собственной картинки. */
.ed-waveform {
  display: block;
  background: #0b0f14;
}

/* Панель свойств.

   Своего места в раскладке не занимает и не назначает: где стоит панель,
   решает тот, кто её вставляет. Здесь только внутреннее устройство. */
.ed-inspector {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 14px;
  background: #0b0f14;
  /* Прокручивается сама. Длинный текст элемента не имеет права растягивать
     редактор и выдавливать сцену. */
  overflow: auto;
  min-height: 0;
}

.ed-insp-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7d8fa5;
}

.ed-insp-body { display: grid; gap: 14px; }

/* Одна колонка: идентификатор, тип, содержимое. */
.ed-insp-block { display: grid; gap: 8px; }

/* Две колонки: x/y, ширина/высота, поворот/слой встают парами — так видно,
   что это пары, и панель не растёт в высоту на ровном месте. */
.ed-insp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
}

/* min-width: 0 обязателен: без него поле в колонке 1fr не сжимается ниже
   своей ширины по умолчанию и выдавливает соседнее за край панели. */
.ed-insp-field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.ed-insp-label { font-size: 11px; color: #7d8fa5; }

.ed-insp-input,
.ed-insp-area {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid #1c242f;
  border-radius: 4px;
  background: #07090c;
  color: #e6edf5;
  font: inherit;
  /* Моноширинные цифры: иначе числа дёргаются по ширине на каждой правке
     и на каждом кадре перетаскивания элемента мышью. */
  font-variant-numeric: tabular-nums;
}

/* Поля правятся текстом, в отличие от остального редактора, где выделение
   мешает жестам. */
.ed-insp-input,
.ed-insp-area { user-select: text; }

/* Обводку фокуса браузер рисует свою, и мы её не убираем: по панели ходят
   с клавиатуры, а потерянный фокус дороже выигрыша в виде. */
.ed-insp-input:focus,
.ed-insp-area:focus { border-color: #4c8dff; }

/* Значение не разобралось в число или не проходит по схеме — наружу не ушло
   ничего. Это обязано быть видно: молчание автор примет за успешную правку.
   Единственный цвет вне палитры редактора, и ровно потому, что ошибка не
   должна читаться как обычное состояние. */
.ed-insp-input[aria-invalid='true'] { border-color: #ff6b6b; }

/* readonly, а не disabled: значение остаётся фокусируемым и копируемым. */
.ed-insp-input[readonly] {
  background: transparent;
  color: #7d8fa5;
  cursor: default;
}

.ed-insp-area {
  min-height: 76px;
  line-height: 1.4;
  resize: vertical;
}

.ed-insp-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #7d8fa5;
}

.ed-insp-empty {
  display: grid;
  gap: 6px;
  margin: 0;
}
`;
