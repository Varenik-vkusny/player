/** Панели свойств, секции, прокручиваемые строки.
 *
 * Часть общего листа стилей редактора. Собирается в index.ts;
 * порядок сборки НЕСУЩИЙ — см. пояснение там.
 */
export const PANELS_CSS = `/* Панель свойств.

   Своего места в раскладке не занимает и не назначает: где стоит панель,
   решает тот, кто её вставляет. Здесь только внутреннее устройство. */
.ed-inspector {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 14px;
  background: var(--ui-surface-panel);
  /* Прокручивается сама. Длинный текст элемента не имеет права растягивать
     редактор и выдавливать сцену. */
  overflow: auto;
  min-height: 0;
}

.ed-insp-title {
  margin: 0;
  font-size: var(--ui-type-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* Тёмный, а не серо-синий: заголовок секции обязан читаться как
     заголовок. Было var(--ui-content-fg-secondary) = серо-синий 91/100/114,
     и на белой колонне он выглядел ссылкой. У натуры заголовки разделов
     панели тёмные и весомые (замер ссылки раздела Канвы: вес 600,
     почти чёрный 15/16/21 при непрозрачности 0.85). Вес 600 у нас уже стоял — не хватало цвета. */
  color: var(--ui-content-fg);
}

/* Складывающийся заголовок панели (ui/Section). Кнопка лежит ВНУТРИ
   h2.ed-insp-title и не имеет права выглядеть иначе, чем выглядел
   заголовок до неё: кегль, разрядка, прописные и цвет наследуются,
   а собственная внешность кнопки (фон, рамка, поля, своя гарнитура
   от системы) снимается. Ровно поэтому вид заголовков колонки
   не поехал от того, что они стали нажимаемыми.

   text-transform и letter-spacing перечислены явно, хотя оба наследуемые:
   у button своя таблица стилей браузера, и полагаться на то, что она
   их не перебьёт, значило бы проверять чужое умолчание глазами
   на каждом движке. */
/* Заголовок секции — строка «название слева, действие справа».

   Это раскладка натуры: у Канвы заголовки разделов внутри панели идут
   парой «название слева — ссылка справа» («Недавно использованные …
   Показать все»), замерено Частью 1. У КапКута правая панель тоже
   разложена секциями с заголовками.

   Действие лежит РЯДОМ с кнопкой складывания, а не внутри неё: кнопка
   внутри кнопки недопустима — вложенную не нажать, и дерево доступности
   получается неверным. */
.ed-insp-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Действие заголовка не сжимается: сжимаясь, оно первым делом теряет
   мишень, а не ширину строки. */
.ed-section-action { flex: 0 0 auto; }

.ed-section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Было width: 100%. Теперь заголовок — флекс-строка, и кнопка забирает
     остаток после действия, а не всю ширину: со 100% действие выдавливалось
     бы за край. Нажимается по-прежнему вся свободная ширина заголовка —
     промах мимо узкой мишени автор читает как «кнопка не работает». */
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: left;
  cursor: pointer;
}

.ed-section-toggle:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

/* Подпись занимает остаток строки, чтобы нажималась вся ширина заголовка,
   а не только буквы: промах мимо узкой мишени автор читает как
   «кнопка не работает», а не как «я не попал».

   order: -1 ставит подпись ПЕРЕД стрелкой, то есть стрелка уходит к правому
   краю. Правка приёмщика 17.08.2026 по замеру: стрелка в начале строки
   выталкивала заголовок на 17 px внутрь (12 значок + 6 зазор), и в узкой
   колонке появлялась ТРЕТЬЯ левая кромка — строки списка на 1035, чип слайда
   на 1042, заголовок на 1052. До появления стрелки заголовок стоял на 1035
   вместе со строками. Это возврат прежней кромки, а не новый приём.

   На порядок чтения не влияет: у стрелки aria-hidden, читалке видна только
   подпись, а order меняет лишь показ. */
.ed-section-name { flex: 1 1 auto; min-width: 0; order: -1; }

/* ---- ui/ScrollStrip: строка, которая прокручивается и говорит об этом ----

   Обёртка ширины не имеет своей: она ровно та строка, что была на её месте,
   плюс система координат для наложенных стрелок. position: relative здесь
   и есть весь смысл обёртки. */
.ed-scrollstrip {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

/* Стрелка у края, за которым ещё есть содержимое.

   Наложением (position: absolute), а не в потоке: стрелка в потоке отнимала
   бы у строки 28 px, от этого строка могла бы стать прокручиваемой — и
   появление стрелки порождало бы стрелку. Наложенная ширины не отнимает.

   Заливка — растяжка от фона полосы к прозрачному: под стрелкой содержимое
   не обрывается ножом, а истаивает, и это второй признак продолжения,
   независимый от самой стрелки. */
.ed-scrollstrip-edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  color: var(--ui-content-fg);
  font-size: var(--ui-type-m);
  cursor: pointer;
}

.ed-scrollstrip-edge-start {
  left: 0;
  background: linear-gradient(to right, var(--ui-surface-panel) 55%, transparent);
}

.ed-scrollstrip-edge-end {
  right: 0;
  background: linear-gradient(to left, var(--ui-surface-panel) 55%, transparent);
}

.ed-scrollstrip-edge:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}

.ed-insp-body { display: grid; gap: 14px; }

/* Одна колонка: идентификатор, тип, содержимое. */
.ed-insp-block { display: grid; gap: 8px; }

/* Предупреждение автору. Не ошибка: продукт покажет законную картинку,
   но расстановка почти наверняка не та, которую автор имел в виду. */
.ed-warning {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--ui-feedback-warn-line);
  border-left-width: 3px;
  border-radius: var(--ui-radius-l);
  background: var(--ui-feedback-warn-bg);
  color: var(--ui-feedback-warn-fg);
  font-size: var(--ui-type-m);
  line-height: 1.45;
}

/* Пояснение к выбору автора: что случится, если нажать. Не предупреждение —
   ничего не сломано, просто действие необратимо и стоит объяснить его заранее. */
.ed-insp-hint {
  margin: 0;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-s);
  line-height: 1.45;
}

/* Две колонки: x/y, ширина/высота, поворот/слой встают парами — так видно,
   что это пары, и панель не растёт в высоту на ровном месте. */
.ed-insp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
}

/* Ряд органов «Расположения» (Сессия 48): выравнивание, раскладка, слои
   и копирование формата, переехавшие сюда с полосы свойств по ответу
   владельца 18.08.2026. Сами кнопки переиспользуют роль .ed-icon-btn
   (28x28, скругление, погашенное и нажатое состояние) — новых сырых
   значений тут нет и быть не должно.

   wrap НЕСУЩИЙ, а не косметика: тринадцать кнопок по 28 px требуют
   не меньше 364 px в строку, а колонка каталога по умолчанию 350 и её
   можно сузить до 260 (решение владельца 18.08.2026). Без переноса
   последние кнопки уехали бы за край панели — ровно та болезнь, от
   которой их сюда и переселили. */
.ed-insp-organs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* min-width: 0 обязателен: без него поле в колонке 1fr не сжимается ниже
   своей ширины по умолчанию и выдавливает соседнее за край панели. */
.ed-insp-field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.ed-insp-label { font-size: var(--ui-type-xs); color: var(--ui-content-fg-secondary); }

.ed-insp-input,
.ed-insp-area {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-s);
  background: var(--ui-field-bg);
  color: var(--ui-content-fg);
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
.ed-insp-area:focus { border-color: var(--ui-action-selected-line); }

/* Значение не разобралось в число или не проходит по схеме — наружу не ушло
   ничего. Это обязано быть видно: молчание автор примет за успешную правку.
   Единственный цвет вне палитры редактора, и ровно потому, что ошибка не
   должна читаться как обычное состояние. */
.ed-insp-input[aria-invalid='true'] { border-color: var(--ui-feedback-critical); }

/* Список выбора: ЗАКРЫТОЕ СОСТОЯНИЕ СВОЁ, А СПИСОК РОДНОЙ.

   Родной select со стрелкой браузера был самым заметным дефолтным органом
   на экране. Соблазн — нарисовать своё меню целиком; отвергнут, и не по
   вкусу, а по цене поведения: родной select бесплатно даёт клавиатуру,
   закрытие по щелчку мимо, чтение с экрана и поведение на телефоне.
   Своё меню обязано было бы всё это ВОСПРОИЗВЕСТИ, и каждая забытая мелочь
   молча отняла бы орган у тех, кто не пользуется мышью.

   Поэтому меняется только облик закрытого состояния: appearance снимает
   родную стрелку, свою рисует Icon внутри самого ChoiceField, то есть
   внутри ui/, где svg законен.

   Обёртка нужна затем, что абсолютной стрелке нужен позиционированный
   предок; она СКВОЗНАЯ по раскладке (block/100%), чтобы поле осталось
   там же, где стояло, и не поехали ни шапка, ни полоса свойств. */
.ed-select-wrap {
  position: relative;
  display: block;
  width: 100%;
}

.ed-select-wrap .ed-insp-input {
  appearance: none;
  -webkit-appearance: none;
  /* Место под свою стрелку. Правится ТОЛЬКО правый отступ: у шапки поле
     ужато до padding 2px 4px (.ed-view-as-item выше), и вернуть ему общий
     вертикальный отступ значило бы отдать шапке те же +5 px высоты,
     которыми однажды уже ужало сцену в виде Ветки ниже порога видимости. */
  padding-right: 20px;
}

.ed-select-chevron {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  color: var(--ui-content-fg-secondary);
  /* Стрелка лежит ПОВЕРХ органа, и щелчок обязан проходить сквозь неё.
     Без этого нажатие в правой части поля попадает в картинку и список
     не открывается — ни ошибки, ни предупреждения. В проекте этот класс
     дефекта уже измерен на захвате указателя: кнопки внутри холста
     не работали, и молча. */
  pointer-events: none;
}

/* «Разное» — общего цвета у выделенной пачки нет.

   Полоски рисуются на САМОМ образце, а не рядом с ним и не в подписи, и это
   куплено снимком, а не рассуждением: подписи полей на полосе свойств
   визуально скрыты (.ed-propbar-field .ed-insp-label выше — width: 1px и
   clip-path), поэтому слово «разное» в подписи прекрасно находится тестом
   и не доходит до автора вовсе. Каркас метит образец по той же причине
   (design/shell.css, .ink--mixed) — оттуда и рисунок полосок.

   Метится ВСЁ поле, а не только внутренний образец, и это тоже замер, а не
   вкус: на полосе свойств поле выбора цвета шириной 22 px, внутренний
   образец в нём — около четырёх пикселей, и полоска с шагом 3 px там
   физически не читается. Фон самого поля даёт ~18x26 px видимой штриховки,
   которую видно и на полосе, и в панели «Объект», где поле широкое.

   Два правила для образца вместо одного намеренно: неизвестный псевдоэлемент
   делает недействительным ВЕСЬ список селекторов, поэтому webkit и moz нельзя
   писать через запятую — иначе правило отвалится молча в обоих браузерах. */
.ed-insp-input--mixed {
  background-image: repeating-linear-gradient(
    45deg, var(--ui-surface-raised) 0 3px, var(--ui-line-strong) 3px 6px);
}
.ed-insp-input--mixed::-webkit-color-swatch {
  background-image: repeating-linear-gradient(
    45deg, var(--ui-surface-raised) 0 3px, var(--ui-line-strong) 3px 6px);
}
.ed-insp-input--mixed::-moz-color-swatch {
  background-image: repeating-linear-gradient(
    45deg, var(--ui-surface-raised) 0 3px, var(--ui-line-strong) 3px 6px);
}

/* readonly, а не disabled: значение остаётся фокусируемым и копируемым. */
.ed-insp-input[readonly] {
  background: transparent;
  color: var(--ui-content-fg-secondary);
  cursor: default;
}

.ed-insp-area {
  min-height: 76px;
  line-height: 1.4;
  resize: vertical;
}

.ed-insp-note {
  margin: 0;
  font-size: var(--ui-type-xs);
  line-height: 1.4;
  color: var(--ui-content-fg-secondary);
}

/* ================= КАТАЛОГ ПРИЁМОВ ПЕРЕХОДА =================

   Плитка показывает приём ДВИЖЕНИЕМ, а не картинкой приёма. Это не
   украшение: «сдвиг» и «штора» на неподвижной картинке различаются
   только подписью, и автор выбирал бы по слову, а не по тому, что
   увидит зритель (docs/design/screens.md §4.2, снято с натуры у Canva).

   Анимируются ровно transform, opacity и filter — те же три свойства,
   что инвариант №8 разрешает сцене. Совпадение не случайное: плитка
   показывает то, что приём будет делать на самом деле, поэтому
   изобразить его запрещённым свойством значило бы соврать.

   Движение идёт только под курсором и у выбранной плитки. Восемь
   одновременных петель читались бы как рябь, в которой не разобрать
   ни одну.

   Крючок — data-transition, а НЕ data-testid: последний договор
   с тестами, и переименование в тесте молча погасило бы вид. */
/* ДВЕ колонки, а не четыре. Замерено в браузере: панель метки отдаёт
   каталогу 216 px, при четырёх колонках плитка выходит 49 px, а подписи
   «Растворение» нужно 63 — она обрезалась многоточием, и все проверки
   при этом оставались зелёными. Обрезка не ломает ничего измеримого,
   поэтому ловится только замером scrollWidth или глазами.
   Две колонки дают 106 px: подпись целиком, и плашка сценки вдвое шире,
   то есть движение на ней различимо, ради чего плитка и заведена. */
.ed-transition-catalog {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.ed-transition-tile {
  position: relative;
  /* Место под сценку сверху. overflow прячет уезжающие за край плашки —
     без него они вылезли бы на соседние плитки. */
  padding: 32px 4px 5px;
  overflow: hidden;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-s);
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg-secondary);
  font: inherit;
  font-size: var(--ui-type-xs);
  text-align: center;
  cursor: pointer;
}

.ed-transition-tile:hover { border-color: var(--ui-action-selected-line); }

.ed-transition-tile-selected {
  border-color: var(--ui-action-selected-line);
  background: var(--ui-action-selected-bg);
  color: var(--ui-content-fg);
}

/* Четыре кнопки-стрелки направления (схема v10), снято с натуры Canva.
   Ряд, а не сетка: подписи здесь нет вовсе — только глиф, — поэтому
   грабля обрезки, из-за которой каталог приёмов сделан в две колонки,
   тут неприменима по построению. Четыре кнопки в ряд на 106 px дают
   по 24 px на кнопку: мишень крупнее метки на дорожке при ×1 (9.3 px),
   по которой «физически нельзя попасть». */
.ed-direction-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.ed-direction-btn {
  padding: 4px 0;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-s);
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg-secondary);
  font: inherit;
  /* Стрелка крупнее подписи плитки: она и есть всё содержимое кнопки. */
  font-size: var(--ui-type-m);
  line-height: 1;
  text-align: center;
  cursor: pointer;
}

.ed-direction-btn:hover { border-color: var(--ui-action-selected-line); }

.ed-direction-btn-selected {
  border-color: var(--ui-action-selected-line);
  background: var(--ui-action-selected-bg);
  color: var(--ui-content-fg);
}

/* Две плашки сценки: ::before — прежний вид, ::after — следующий.
   В покое видна только прежняя: приём ещё не играется, и показывать
   обе значило бы показывать середину перехода как состояние. */
.ed-transition-tile::before,
.ed-transition-tile::after {
  content: '';
  position: absolute;
  top: 7px;
  left: 14px;
  right: 14px;
  height: 18px;
  border-radius: var(--ui-radius-s);
}

.ed-transition-tile::before { background: var(--ui-content-fg-tertiary); }

.ed-transition-tile::after {
  background: var(--ui-action-selected-line);
  opacity: 0;
}

/* «Срез» не анимирован НАМЕРЕННО: у него нет длительности, и мгновенность
   честнее изобразить неподвижностью, чем быстрым движением. */
.ed-transition-tile[data-transition='cut']::after { opacity: 0; }

.ed-transition-tile:hover::before,
.ed-transition-tile:hover::after,
.ed-transition-tile-selected::before,
.ed-transition-tile-selected::after {
  animation-duration: 1.8s;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

.ed-transition-tile[data-transition='cut']:hover::before,
.ed-transition-tile[data-transition='cut']:hover::after,
.ed-transition-tile[data-transition='cut'].ed-transition-tile-selected::before,
.ed-transition-tile[data-transition='cut'].ed-transition-tile-selected::after {
  animation: none;
}

.ed-transition-tile[data-transition='morph']:hover::after,
.ed-transition-tile[data-transition='morph'].ed-transition-tile-selected::after {
  animation-name: ed-tr-morph;
}
.ed-transition-tile[data-transition='dissolve']:hover::before,
.ed-transition-tile[data-transition='dissolve'].ed-transition-tile-selected::before {
  animation-name: ed-tr-fade-out;
}
.ed-transition-tile[data-transition='dissolve']:hover::after,
.ed-transition-tile[data-transition='dissolve'].ed-transition-tile-selected::after {
  animation-name: ed-tr-fade-in;
}
.ed-transition-tile[data-transition='slide']:hover::before,
.ed-transition-tile[data-transition='slide'].ed-transition-tile-selected::before {
  animation-name: ed-tr-slide-out;
}
.ed-transition-tile[data-transition='slide']:hover::after,
.ed-transition-tile[data-transition='slide'].ed-transition-tile-selected::after {
  animation-name: ed-tr-slide-in;
}
.ed-transition-tile[data-transition='scale']:hover::before,
.ed-transition-tile[data-transition='scale'].ed-transition-tile-selected::before {
  animation-name: ed-tr-scale-out;
}
.ed-transition-tile[data-transition='scale']:hover::after,
.ed-transition-tile[data-transition='scale'].ed-transition-tile-selected::after {
  animation-name: ed-tr-scale-in;
}
.ed-transition-tile[data-transition='blur']:hover::before,
.ed-transition-tile[data-transition='blur'].ed-transition-tile-selected::before {
  animation-name: ed-tr-blur-out;
}
.ed-transition-tile[data-transition='blur']:hover::after,
.ed-transition-tile[data-transition='blur'].ed-transition-tile-selected::after {
  animation-name: ed-tr-blur-in;
}
.ed-transition-tile[data-transition='wipe']:hover::after,
.ed-transition-tile[data-transition='wipe'].ed-transition-tile-selected::after {
  animation-name: ed-tr-wipe;
}
/* Круглая форма стоит В ПРАВИЛЕ, а не в кадрах анимации. В кадрах она была
   бы постоянной и потому неанимируемой, но сам факт скругления среди
   кадров читался бы как «приём играет форму» — а он играет масштаб.
   Плитка обязана показывать то, что приём делает на самом деле. */
.ed-transition-tile[data-transition='circle']::after { border-radius: 50%; }

.ed-transition-tile[data-transition='circle']:hover::after,
.ed-transition-tile[data-transition='circle'].ed-transition-tile-selected::after {
  animation-name: ed-tr-circle;
}

@keyframes ed-tr-morph {
  0%   { opacity: 1; transform: translateX(-22%) scaleX(0.5); }
  45%  { opacity: 1; transform: none; }
  100% { opacity: 1; transform: none; }
}
@keyframes ed-tr-fade-out {
  0%, 10% { opacity: 1; }
  55%, 100% { opacity: 0; }
}
@keyframes ed-tr-fade-in {
  0%, 10% { opacity: 0; }
  55%, 100% { opacity: 1; }
}
@keyframes ed-tr-slide-out {
  0%, 10% { transform: none; }
  55%, 100% { transform: translateX(-130%); }
}
@keyframes ed-tr-slide-in {
  0%, 10% { opacity: 1; transform: translateX(130%); }
  55%, 100% { opacity: 1; transform: none; }
}
@keyframes ed-tr-scale-out {
  0%, 10% { opacity: 1; transform: none; }
  55%, 100% { opacity: 0; transform: scale(1.5); }
}
@keyframes ed-tr-scale-in {
  0%, 10% { opacity: 0; transform: scale(0.4); }
  55%, 100% { opacity: 1; transform: none; }
}
/* blur(0px), а не blur(0): безразмерный ноль в filter интерполируется
   не везде одинаково, и приём выглядел бы ступенькой вместо наплыва. */
@keyframes ed-tr-blur-out {
  0%, 10% { opacity: 1; filter: blur(0px); }
  55%, 100% { opacity: 0; filter: blur(5px); }
}
@keyframes ed-tr-blur-in {
  0%, 10% { opacity: 0; filter: blur(5px); }
  55%, 100% { opacity: 1; filter: blur(0px); }
}
@keyframes ed-tr-wipe {
  0%, 10% { opacity: 1; transform: translateX(-105%); }
  55%, 100% { opacity: 1; transform: none; }
}
@keyframes ed-tr-circle {
  0%, 10% { opacity: 1; transform: scale(0); }
  55%, 100% { opacity: 1; transform: scale(1.6); }
}

/* Ползунок продолжительности во всю ширину поля, как соседние вводы. */
.ed-insp-range {
  width: 100%;
  accent-color: var(--ui-action-selected-line);
  cursor: pointer;
}

.ed-insp-empty {
  display: grid;
  gap: 6px;
  margin: 0;
}

/* Панель графа сегментов (Задача 9). Живёт ВНУТРИ панели каталога (до
   Сессии 55 — внутри правой колонки .ed-side), а не отдельной
   колонкой грида: узкое окно уже тратит бюджет на остальные фиксированные
   колонки грида .ed-main (e2e\editor.spec.ts:216 держит окно 600px и
   требует масштаб < 0.5 — лишняя фиксированная колонка эту проверку ломает,
   измерено при первой версии правки). Поэтому ширина колонки не меняется
   вовсе — граф делит высоту с .ed-elements (flex: 1 1 auto у обоих, каждый
   сам прокручивается), а не берёт себе ширину. min-width: 0 обязателен
   на самой панели и на каждом текстовом ребёнке — иначе длинный id узла или
   подпись варианта раздвигает колонку шире отведённой var(--ed-right-w),
   тот же закон, что и у .ed-muted/.ed-delete-msg. */
.ed-graph-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  padding-top: 8px;
  border-top: 1px solid var(--ui-line);
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
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-m);
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: var(--ui-type-s);
  text-align: left;
  cursor: pointer;
}
.ed-graph-node:hover { border-color: var(--ui-action-selected-line); }
.ed-graph-node-current { border-color: var(--ui-action-selected-line); background: var(--ui-action-selected-bg); }

/* Не декоративная — это предупреждение автору, что ветку никто не увидит,
   пока он не проведёт к ней ребро (см. комментарий GraphPanel.tsx). */
.ed-graph-unreachable {
  flex: 0 0 auto;
  color: var(--ui-feedback-critical);
  font-size: var(--ui-type-xs);
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
  font-size: var(--ui-type-s);
  color: var(--ui-feedback-positive);
}

.ed-graph-empty {
  margin: 0;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-s);
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
  border: 1px solid var(--ui-feedback-critical);
  border-radius: var(--ui-radius-m);
}

.ed-graph-hole-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--ui-type-xs);
  color: var(--ui-feedback-critical);
}

.ed-graph-select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-s);
  background: var(--ui-field-bg);
  color: var(--ui-content-fg);
  font: inherit;
  font-size: var(--ui-type-s);
}

/* Меню правой кнопки над сценой (stage/ContextMenu.tsx).

   position: fixed, а не absolute: точка берётся из clientX/clientY, то есть
   в координатах ОКНА. При absolute меню уехало бы на смещение ближайшего
   позиционированного предка, и промах был бы тем больше, чем ниже сцена. */
.ed-ctxmenu {
  position: fixed;
  z-index: 60;
  min-width: 208px;
  padding: 4px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-m);
  background: var(--ui-surface-overlay);
  /* Роль подставляется ЦЕЛИКОМ, без своих чисел перед ней.
     Было: box-shadow: 0 6px 20px var(--ui-shadow-selected) — а эта роль
     сама является списком из двух теней. Подстановка давала
     0 6px 20px 0 0 0 1px ..., то есть синтаксический мусор, и браузер
     отбрасывал объявление ЦЕЛИКОМ: меню оставалось без тени и сливалось
     с холстом. Ни ошибки, ни предупреждения — тот же способ провала,
     что у неизвестного токена темы (замер С23). */
  box-shadow: var(--ui-shadow-overlay);
}

.ed-ctxmenu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--ui-line);
}

/* Перенос на вторую строку разрешён РАДИ ПРИЧИНЫ (Сессия 55): у погашенного
   пункта под подписью стоит строка «почему сейчас нельзя». Без wrap она
   встала бы в тот же ряд и сжала бы подпись до многоточия — то есть
   отобрала бы у автора имя действия ради объяснения, почему его нет. */
/* ── Карточка остановки над её меткой (Сессия 55) ─────────────────────────
   Плавает поверх всего: холст под ней не ужимается ни на пиксель. Это было
   прямым условием — жалоба владельца на крошечную сцену старше этой работы,
   и отдавать ей высоту ради панели значило бы чинить одно за счёт другого.

   Растёт ВВЕРХ от метки: снизу только полоса расшифровки и край окна. */
.ed-stopcard {
  position: fixed;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  max-height: 60vh;
  overflow-y: auto;
  padding: 12px;
  border-radius: var(--ui-radius-l);
  background: var(--ui-surface-overlay);
  box-shadow: var(--ui-shadow-overlay);
  color: var(--ui-content-fg);
}

.ed-stopcard-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ed-stopcard-title {
  font-size: var(--ui-type-s);
  font-weight: 600;
  color: var(--ui-content-fg-secondary);
}

.ed-stopcard-close {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--ui-radius-s);
  background: transparent;
  color: var(--ui-content-fg-secondary);
  cursor: pointer;
}
.ed-stopcard-close:hover { color: var(--ui-content-fg); background: var(--ui-surface-raised); }

/* Ответ — своим блоком с линией сверху: без неё три ответа с полями
   и списками читаются одной кашей, и автор не видит, где кончается один. */
.ed-stopcard-option {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-line);
}

.ed-stopcard-goto {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* «и тогда» — не подпись поля, а связка во фразе «Ответ 1 … и тогда …».
   Подписью её делать нельзя: у поля рядом уже есть своё имя в aria-label,
   и второе имя на том же органе развело бы то, что автор читает глазами,
   и то, что находит поиском по имени. */
.ed-stopcard-goto-label {
  flex: 0 0 auto;
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
}

.ed-stopcard-goto-select {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius-s);
  background: var(--ui-field-bg);
  color: var(--ui-content-fg);
  font: inherit;
  font-size: var(--ui-type-s);
}

/* Подпись ответа в панели метки — ЧИТАЕМАЯ строка, а не поле: правится она
   в карточке остановки, и второе поле на то же значение развело бы то, что
   автор видит, и то, что он правит. */
.ed-option-name {
  margin: 0 0 4px;
  font-size: var(--ui-type-xs);
  font-weight: 600;
  color: var(--ui-content-fg-secondary);
}

.ed-stopcard-plain {
  margin: 0;
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
}

.ed-ctxmenu-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--ui-radius-s);
  background: transparent;
  color: var(--ui-content-fg);
  font: inherit;
  font-size: var(--ui-type-m);
  text-align: left;
  cursor: pointer;
}

.ed-ctxmenu-item:hover:not([aria-disabled='true']),
.ed-ctxmenu-item:focus-visible {
  background: var(--ui-action-selected-bg);
  outline: none;
}

/* Погашенный пункт ОСТАЁТСЯ ВИДИМЫМ. Не display: none и не visibility —
   автор обязан видеть, что действие существует, просто сейчас неприменимо.
   Спрятанный пункт неотличим от несуществующего (грабли С30 §20б). */
.ed-ctxmenu-item[aria-disabled='true'] {
  color: var(--ui-content-fg-tertiary);
  cursor: default;
}

.ed-ctxmenu-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Сочетание клавиш справа — приём, снятый с натуры у Canva: меню заодно
   учит клавиатуре. flex: 0 0 auto, чтобы длинная подпись ужимала себя,
   а не сочетание: обрезанное «CTRL+D» не читается вовсе. */
.ed-ctxmenu-key {
  flex: 0 0 auto;
  color: var(--ui-content-fg-tertiary);
  font-size: var(--ui-type-xs);
}

/* ПРИЧИНА, ПОЧЕМУ ПУНКТ ПОГАШЕН — своей строкой под подписью.
   Ширина 100 % заставляет её встать на новую строку внутри wrap-контейнера.

   Здесь причина ВИДНА, а не спрятана в title, и здесь её ровно одна —
   та, что сейчас мешает. Это третий путь, которого требовал долг: строка
   над лентой слайдов печатала ТРИ причины от трёх разных кнопок разом
   и в узкой зоне воровала у холста 16 px, а подсказки, как измерено,
   не читают вовсе. */
.ed-ctxmenu-hint {
  flex: 1 0 100%;
  color: var(--ui-content-fg-tertiary);
  font-size: var(--ui-type-xs);
  white-space: normal;
}
`;
