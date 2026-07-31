/**
 * Оформление редактора.
 *
 * Строкой, а не отдельным .css: пакет отдаётся хосту исходниками, и импорт
 * стилей заставил бы всякого, кто его встраивает, настраивать обработку CSS
 * у себя. Тут ровно та же логика, по которой плеер собирается без внешних
 * зависимостей — встраивание не должно требовать обвязки.
 *
 * Сцену это почти не касается: правила отсюда не адресуют .scene-el и не
 * задают внешний вид — его задаёт только проект, иначе редактор показывал бы
 * не то, что увидит зритель. Единственное исключение — .ed-stage-host
 * [contenteditable] ниже: это не про внешний вид, а про то же самое
 * исключение из user-select: none, что и у .ed-words и полей инспектора,
 * и действует оно только пока StageView сам включил contenteditable на время
 * правки текста (см. «Правка текста на холсте» в docs/superpowers/specs).
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

/* Правка текста на холсте (двойной клик, StageView.beginTextEdit). Пока
   идёт набор, автору нужно выделять текст и переносить каретку мышью, как
   и в .ed-words/.ed-insp-input выше — иначе жест перетаскивания сцены
   заодно тянул бы синее выделение текста. Селектор бьёт только по узлу,
   у которого contenteditable сейчас включён самим StageView (это флаг на
   время правки, а не постоянное правило разметки), и перестаёт что-либо
   значить, как только правка закоммичена и атрибут снят. */
.ed-stage-host [contenteditable='true'] {
  user-select: text;
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

/* Режим «смотреть как зритель, ответивший X».
   Тот же закон, что у выделения: панель не имеет права выдавливать кнопки
   из шапки. Первая сборка это нарушила — второй селект уехал за край экрана
   и лёг поверх кнопки, и увидеть это можно было только глазами. */
.ed-view-as {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.ed-view-as-title {
  color: #7d8fa5;
  white-space: nowrap;
}

.ed-view-as-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ed-view-as-name {
  color: #7d8fa5;
  white-space: nowrap;
}

.ed-view-as-select {
  max-width: 140px;
  background: #141922;
  color: #e6ecf3;
  border: 1px solid #2a3444;
  border-radius: 6px;
  padding: 2px 4px;
}

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

/* Две сцены рядом: «правлю» и «смотрю» (долг §12.5).

   Колонки равные, а не 2fr/1fr: правая показывает ПЕРЕХОД, ради которого
   всё и затевалось, и уменьшать её значило бы вернуть автора к разглядыванию
   миниатюры. min-width: 0 обязателен обоим — без него сцена с фиксированным
   отношением сторон распирает грид и выдавливает панели, а видно это только
   глазами. */
.ed-stages {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-width: 0;
  min-height: 0;
}

.ed-watch {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid #1c242f;
}

.ed-watch-title {
  padding: 2px 8px;
  color: #7d8fa5;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ed-watch-host {
  position: relative;
  flex: 1 1 auto;
  overflow: hidden;
  min-height: 0;
}

.ed-inspector { border-left: 1px solid #1c242f; }

/* Панель элементов: вставка и удаление сверху, список — снизу и растягивается.
   flex-column, а не grid с фиксированным числом строк: сообщение об ошибке
   вставки картинки — условный ребёнок, и число строк грида «поехало» бы
   в его отсутствие. Список получает flex: 1 1 auto и забирает весь остаток
   высоты независимо от того, сколько соседей сейчас отрисовано. */
/* Прокрутка у самой колонки, а не только у списков внутри.
   Раньше здесь стояли ОБА правила — overflow-y: auto и ниже overflow:
   hidden, — и второе перебивало первое: всё, что не поместилось, просто
   обрезалось. Списки внутри имеют свои потолки по 180 px, но их трое
   (элементы, слайды, части) плюс вставка и шаблоны, и в колонку 615 px
   они не помещаются — нижняя панель уезжала за край и становилась
   недоступной (known-bugs §8, замерено: 191×99 на отметке 528). */
.ed-elements-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: #0b0f14;
  border-left: 1px solid #1c242f;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.ed-insert { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px; }

/* Группа кнопок шаблонов — свой заголовок, кнопки в тех же .ed-insert/.ed-action,
   что и у панели вставки фигур: колонка не должна заводить второй визуальный
   язык ради второго списка кнопок. */
.ed-templates { flex: 0 0 auto; display: flex; flex-direction: column; gap: 6px; }
.ed-templates-label { font-size: 11px; color: #7d8fa5; }

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
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/*
 * Панель слайдов и панель сегментов.
 *
 * Три подпанели — элементы, слайды, части — делят одну боковую колонку,
 * и делить её ВЫСОТОЙ нельзя. Замерено дважды:
 *
 *   у demo.json пятнадцать слайдов дают 823 px и выдавливают список
 *   элементов в НОЛЬ (семь строк честно отрисованы в DOM, но не видны);
 *
 *   у branching.json список частей получает высоту 0 при содержимом 70 px,
 *   кнопки вываливаются за него, и клик по «Концовка: да» попадает
 *   в «Удалить часть», лежащую ниже. Playwright это видит как
 *   «section intercepts pointer events», а автор — как кнопку,
 *   которая делает не то.
 *
 * Поэтому колонка прокручивается ЦЕЛИКОМ, а подпанели растут по содержимому
 * со своим потолком у списков. Ни одна из них не сжимает соседей.
 */
.ed-slide-panel,
.ed-segment-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 0 auto;
}

.ed-slide-list,
.ed-segment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  /* Потолок, а не доля: список не отбирает высоту у соседей и не схлопывается. */
  max-height: 180px;
  flex: 0 0 auto;
}

.ed-slide-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: #1b2430;
  color: #cfd8e3;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.ed-slide-row[aria-pressed='true'] {
  border-color: #e4572e;
  background: #24303f;
  color: #f5f7fa;
}

.ed-slide-time {
  font-variant-numeric: tabular-nums;
  min-width: 44px;
}

.ed-slide-transition { color: #7d8fa5; font-size: 11px; }

.ed-elements-empty { margin: 0; color: #7d8fa5; font-size: 12px; }

.ed-elements-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: 180px;
  flex: 0 0 auto;
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

/* Колонка «своя озвучка + дорожка» — единственный ребёнок третьей строки
   грида .ed-root (auto 1fr auto). Без обёртки AudioSourcePanel стал бы
   четвёртым прямым ребёнком .ed-root, а строк под него в grid-template-rows
   нет. min-height: 0 — тот же приём, что и у .ed-main ниже: без него флекс/
   грид-ребёнок не сжимается меньше своего содержимого и раздвигает окно. */
.ed-track-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Своя озвучка сегмента: загрузка файла автора и расшифровка. Строкой над
   дорожкой — то же место, где автор уже ищет свойства звука. */
.ed-audio-source {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 16px;
  background: #0b0f14;
  border-bottom: 1px solid #1c242f;
  min-width: 0;
}

.ed-audio-current {
  color: #7d8fa5;
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

/* Спрятан визуально, но остаётся в DOM и доступен экранному диктору —
   выбор файла всё равно идёт нативным диалогом ОС по клику на кнопку. */
.ed-audio-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
  padding: 0;
  margin: -1px;
}

/* Подтверждение замены озвучки — занимает всю ширину строки под кнопками,
   а не втискивается между ними: текст длинный (число меток + объяснение). */
.ed-audio-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1 1 100%;
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

/* Сообщение о том, что действие автора зацепило больше, чем видно.
   Не ошибка, поэтому не красное — но и не молчание. Перенос по словам,
   а не обрезка: смысл здесь в числе, и обрезать его нельзя. */
.ed-notice {
  color: #a8c686;
  font-size: 12px;
  line-height: 1.45;
  min-width: 0;
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
/* Две полосы, а не одна: остановки сверху, слайды снизу.
   Пока полоса была одна, метка на том же слове перекрывала соседнюю
   ЦЕЛИКОМ — слайд рисуется позже и перехватывал нажатие, из-за чего
   настройки такой остановки нельзя было открыть вовсе (known-bugs §7).
   Случай частый: миграция ставит слайд на каждое слово с кью. */
.ed-marks {
  position: relative;
  height: 42px;
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

/* Своя полоса каждому роду метки. Разведение по вертикали, а не по z-index:
   порядок наложения решает, КТО сверху, но обе метки продолжают занимать
   один и тот же пиксель — недоступной становится просто другая из них. */
.ed-mark-gate { top: 2px; }
.ed-mark-slide { top: 22px; }

/* Окно движения: сцена едет к слайду и приезжает НА метку (ADR-020).
   Хвост лежит слева от ромба и кончается ровно под ним — иначе автор
   не увидит, что близко стоящие слайды укоротили себе переход. */
.ed-mark-tail {
  position: absolute;
  top: 29px;
  height: 3px;
  border-radius: 2px;
  background: #31527d;
  pointer-events: none;
}

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

/* Предупреждение автору. Не ошибка: продукт покажет законную картинку,
   но расстановка почти наверняка не та, которую автор имел в виду. */
.ed-warning {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #6b4a1f;
  border-left-width: 3px;
  border-radius: 8px;
  background: #241a0d;
  color: #e8c48a;
  font-size: 13px;
  line-height: 1.45;
}

/* Пояснение к выбору автора: что случится, если нажать. Не предупреждение —
   ничего не сломано, просто действие необратимо и стоит объяснить его заранее. */
.ed-insp-hint {
  margin: 0;
  color: #8b93a1;
  font-size: 12px;
  line-height: 1.45;
}

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

/* Панель графа сегментов (Задача 9). Живёт ВНУТРИ .ed-elements-panel, а не
   отдельной колонкой грида: колонка со своей фиксированной шириной — 220px
   и 260px соседей уже съедают бюджет узкого окна (e2e\editor.spec.ts:216
   держит окно 600px и требует масштаб < 0.5 — четвёртая фиксированная
   колонка эту проверку ломает, измерено при первой версии правки). Поэтому
   ширина колонки не меняется вовсе — граф делит высоту с .ed-elements
   (flex: 1 1 auto у обоих, каждый сам прокручивается), а не берёт себе
   ширину. min-width: 0 обязателен на самой панели и на каждом текстовом
   ребёнке — иначе длинный id узла или подпись варианта раздвигает колонку
   шире отведённых 220px, тот же закон, что и у .ed-muted/.ed-delete-msg. */
.ed-graph-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  padding-top: 8px;
  border-top: 1px solid #1c242f;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}

.ed-graph-nodes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ed-graph-node-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.ed-graph-node {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  border: 1px solid #2c3a4d;
  border-radius: 6px;
  background: #1b2430;
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.ed-graph-node:hover { border-color: #4c8dff; }
.ed-graph-node-current { border-color: #4c8dff; background: #111a24; }

/* Не декоративная — это предупреждение автору, что ветку никто не увидит,
   пока он не проведёт к ней ребро (см. комментарий GraphPanel.tsx). */
.ed-graph-unreachable {
  flex: 0 0 auto;
  color: #ff8a6b;
  font-size: 11px;
  white-space: nowrap;
}

.ed-graph-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.ed-graph-edges {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ed-graph-edge-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

/* Переносится, а НЕ обрезается многоточием. Обрезка здесь выглядела
   безобидно (колонку она не раздвигала), но уничтожала ровно то, ради чего
   список рёбер существует: в колонке 190px оба ребра развилки читались как
   «вариант «Да» → Конц…» и «вариант «Нет» → Кон…», то есть автор не видел,
   куда ведёт ребро, и два разных ребра выглядели одинаково. Найдено взглядом
   в браузере — ни один тест на это не смотрел.

   overflow-wrap: anywhere, а не просто перенос по словам: с ним минимальная
   ширина текста равна одному символу, поэтому длинное название узла всё так же
   не может раздвинуть колонку — тот же закон, что и у .ed-muted. */
.ed-graph-edge-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: #a8c686;
}

.ed-graph-empty {
  margin: 0;
  color: #7d8fa5;
  font-size: 12px;
}

.ed-graph-uncovered {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ed-graph-hole-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Дыра в покрытии — то, ради чего вся панель существует (см. GraphPanel.tsx):
   схема откажется грузить проект с непокрытым вариантом, и автор обязан
   увидеть это ДО сохранения, а не после. */
.ed-graph-hole {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid #ff8a6b;
  border-radius: 6px;
}

.ed-graph-hole-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: #ff8a6b;
}

.ed-graph-select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #1c242f;
  border-radius: 4px;
  background: #07090c;
  color: #e6edf5;
  font: inherit;
  font-size: 12px;
}
`;
