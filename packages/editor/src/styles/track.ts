/** Дорожка: лента слайдов, транспорт, ручки.
 *
 * Часть общего листа стилей редактора. Собирается в index.ts;
 * порядок сборки НЕСУЩИЙ — см. пояснение там.
 */
export const TRACK_CSS = `/* Карточки ленты слайдов и полоска положения (SlideStripCards, §14.11,
   product.md §2д [Р]). Стоит ПОД строкой причины, между телом озвучки
   и дорожкой — тем же ребёнком .ed-track-column, а не отдельной строкой
   грида .ed-root (см. комментарий у .ed-track-column выше). До Сессии 47
   тот же класс звался .ed-slide-strip-wrap и держал ещё и голову ленты
   (кнопку складывания, счётчик, кнопки буфера) — голова переехала в общую
   шапку зоны (SlideStripHead), здесь остались только карточки. */
.ed-slide-strip-cards {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 16px 4px;
  background: var(--ui-surface-panel);
  border-bottom: 1px solid var(--ui-line);
  min-width: 0;
}

/* Кнопка складывания ленты (Сессия 41, SlideStripHead с Сессии 47). Похожа
   на .ed-audio-source-toggle намеренно: оба складывающихся блока стоят
   рядом в общей шапке зоны, и разный вид кнопки читался бы автором как
   разное действие. */
.ed-slide-strip-toggle {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-m);
  background: transparent;
  color: var(--ui-content-fg);
  font: inherit;
  font-size: var(--ui-type-s);
  cursor: pointer;
}

.ed-slide-strip-toggle:hover {
  border-color: var(--ui-line-strong);
}

.ed-slide-strip-counter {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--ui-content-fg);
  font-weight: 600;
  white-space: nowrap;
}

/* Кнопки буфера обмена (SlideStripHead) — свой класс, а не .ed-actions:
   .ed-actions прижимает себя к правому краю строки (margin-left: auto),
   а эта группа обязана стоять СРАЗУ после счётчика слайдов, оставляя
   margin-left: auto единственному правому якорю строки — .ed-zone-views
   (см. её комментарий). */
.ed-slide-strip-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

/* Причина, по которой «Вырезать»/«Вставить»/«Дублировать» погашены — под
   общей шапкой зоны, во всю ширину, а не в title: на подсказки при
   наведении никто не смотрит (см. дефект «Гейт на этой секунде», найденный
   обходом отрисованного текста). Обрезка ellipsis спрятала бы часть причины
   от автора, поэтому длинная причина переносится, а не режется.

   Свой фон и паддинг (Сессия 47): раньше строка жила внутри
   .ed-slide-strip-wrap и получала их от обёртки, теперь она отдельный
   ребёнок .ed-track-column и несёт их сама.

   line-height задан ЦЕЛЫМ числом пикселей, а не множителем, и это не
   вкусовщина: 12px x 1.4 = 16.8px, а такая величина не ложится в сетку
   1/64 px, которой Chrome меряет раскладку. Дробь протекала вверх по
   flex-колонке и делала дробной высоту .ed-stage-host — падал e2e
   «область сцены получает целые размеры» (roundtrip.spec.ts), и следом
   ехала геометрия ручек ресайза. Юнит-тесты этого не видят вовсе:
   раскладка живёт только в браузере.

   min-height держит строку ВСЕГДА, даже когда причины нет: без этого
   строка появлялась бы и исчезала при перемотке головки, а вместе с ней
   прыгала бы высота сцены под руками автора. */
.ed-slide-strip-note {
  /* display обязателен: min-height не действует на строчный элемент,
     а разметка отдаёт сюда span. Без block пустая строка схлопнулась бы
     в ноль, и место, ради которого min-height и стоит, не удержалось бы. */
  display: block;
  padding: 2px 16px;
  background: var(--ui-surface-panel);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-s);
  line-height: 16px;
  min-height: 16px;
}

/* Ровная лента: все карточки одного размера, порядок — позиция в ряду,
   а не секунда (product.md §2д [Р]). Прокрутка своя, дорожку не трогает. */
/* Отступы сверху и снизу — не воздух, а место под ВЫДЕЛЕННУЮ карточку:
   она приподнимается на translateY и растёт на scale(1.1), а оба приёма
   рисуют за пределами своего бокса. Считаются от размера карточки, а не
   подбираются: при высоте 72 рост даёт 79.2, то есть по 3.6 сверху и снизу,
   плюс подъём 7 — сверху нужно 10.6, снизу базового хватает.
   Ужаты вместе с карточкой в Сессии 34 (было 14/10 при высоте 90). */
.ed-slide-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 4px 5px;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
  scrollbar-width: thin;
}

/* Карточка. Размер ПОСТОЯННЫЙ у всех: фокус ниже двигает её transform'ом,
   который не участвует в раскладке, — иначе ряд пересобирался бы при
   каждом выборе и соседи «прыгали» бы (это и есть довод владельца против
   варианта с лупой, planning.md §14.11). */
.ed-slide-strip-card {
  position: relative;
  flex: 0 0 auto;
  /* 128x72 — те же 16:9, что и сцена, ужато с 160x90 в Сессии 34 ради
     высоты холста. Сцена 1920x1080 показана здесь и так в масштабе 7 %:
     карточка даёт впечатление о раскладке и цвете, а не читаемые детали,
     и на 20 % мельче она даёт ровно то же впечатление. */
  width: 128px;
  height: 72px;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-m);
  background: var(--ui-surface-panel);
  overflow: hidden;
  cursor: pointer;
  opacity: 0.78;
  transform-origin: 50% 100%;
  transition: transform var(--ui-motion-base) cubic-bezier(0.2, 0.8, 0.2, 1), border-color var(--ui-motion-fast), opacity var(--ui-motion-fast), box-shadow var(--ui-motion-fast);
}
/* Наведение меняет только цвет и прозрачность — НЕ раскладку и НЕ transform:
   лента не имеет права уползать из-под курсора (product.md §2д [Р]). */
.ed-slide-strip-card:hover { opacity: 1; border-color: var(--ui-action-selected-line); }

.ed-slide-strip-card-current {
  opacity: 1;
  border-color: var(--ui-action-selected-line);
  /* Подъём считается от карточки: 9 при высоте 90, значит 7 при 72. */
  transform: translateY(-7px) scale(1.1);
  box-shadow: var(--ui-shadow-selected);
  z-index: 4;
}

/* Сцена карточки — ScenePreview плеера, инвариант №5. Узел, которым владеет
   ScenePreview, вставляется внутрь на JS и получает собственный размер
   1920×1080 с transform-масштабом (см. render.ts, applyFit) — эта обёртка
   обязана резать его оверфлоу, иначе несмасштабированная сцена распирала бы
   карточку (тот же приём, каким любой узел ScenePreview режется снаружи
   контейнером с overflow: hidden). */
.ed-slide-strip-scene {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
}

.ed-slide-strip-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 6px;
  background: var(--ui-surface-overlay);
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-xs);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Полоска положения: третий из трёх ориентиров после дальнего прыжка
   (счётчик, полоска, плавная прокрутка — product.md §2д [Р]). */
.ed-slide-strip-posbar {
  position: relative;
  height: 4px;
  margin: 2px 4px 0;
  background: var(--ui-surface-panel);
  border-radius: var(--ui-radius-s);
}

.ed-slide-strip-posthumb {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--ui-surface-placeholder);
  border-radius: var(--ui-radius-s);
}

.ed-slide-strip-postick {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 8px;
  margin-left: -1px;
  background: var(--ui-action-primary-bg);
  border-radius: var(--ui-radius-s);
}

/* Дорожка. position: relative держит абсолютную ручку тяги
   (.ed-track-resize-handle, задача 2.2) — ручка не участвует в гриде,
   не толкает .ed-transport вниз и не входит в minHeightOf() из tiers.ts:
   она лежит в верхнем паддинге секции (padding-top 10px > её высоты 6px). */
.ed-track {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 10px 16px 12px;
  background: var(--ui-surface-panel);
  min-width: 0;
}

/* Ручка тяги за верхнюю кромку (задача 2.2): полоса 6px, cursor: row-resize.
   touch-action: none — тот же приём, что у .ed-ruler-body/.ed-lane: жест
   тяги не должен превращаться в прокрутку страницы на тач-устройстве. */
.ed-track-resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  touch-action: none;
}

/* Корешок свёрнутой дорожки (задача 2.2): кнопка развернуть, имя звука,
   часы. Высота задаётся инлайн из TrackView (COLLAPSED_H) — число тира,
   а не константа CSS, тем же приёмом, что и у .ed-lane-heads. */
.ed-track-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ed-track-expand {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-m);
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.ed-track-expand:hover { border-color: var(--ui-action-selected-line); }

.ed-track-collapsed-name {
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-s);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Высота ЯВНО задана числом TRANSPORT_H из tiers.ts (каркас, задача 2.1):
   без этого правила высота строки берётся из самого высокого ребёнка
   (.ed-play, 34px), и minHeightOf() из tiers.ts считает одно (40), а DOM
   показывает другое — вторая правда об одной и той же высоте, ровно то,
   от чего сама модель ступеней уходила, вычисляя ступень из числа, а не
   храня оба рядом. */
.ed-transport {
  display: flex;
  align-items: center;
  height: 40px;
  gap: 12px;
  min-width: 0;
}

.ed-play {
  width: 34px;
  height: 34px;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-l);
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ed-play:hover:not(:disabled) { border-color: var(--ui-action-selected-line); }
.ed-play:disabled { opacity: 0.4; cursor: default; }

/* nowrap — не украшение, а починка настоящего дефекта (Сессия 55).
   В полосе шириной по холсту часы «00:00.0 / 00:48.6» при окне 1280
   переносились на вторую строку: замер дал высоту 42 в полосе 40,
   и охрана обрезки поймала это как «хром прячет содержимое молча»,
   509 видимых из 511.

   Это ТОТ ЖЕ дефект, из-за которого удалена строка причин: высота
   зависела от того, влез ли текст в ширину окна. Ловить его дважды
   в одну сессию — хороший знак про охрану и плохой про мою память. */
.ed-clock {
  color: var(--ui-content-fg-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Сообщение об ошибке не имеет права двигать раскладку. Оно длинное
   и содержит путь к файлу, а флекс-строка по умолчанию расширяется
   под содержимое ребёнка. Обрезаем многоточием — полный текст всё равно
   остаётся в разметке и доступен тесту и экранному диктору. */
.ed-failure {
  color: var(--ui-feedback-critical);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Настоящий выбор файла. Прячется целиком: его вид не поддаётся оформлению
   и не встал бы в ряд с соседними кнопками. Нажатие делает кнопка рядом —
   скрытию это не мешает, программный click() работает и на display: none. */
.ed-file-input { display: none; }

/* Полосы про слот работы. Обе ПОД шапкой и обе с переносом по словам:
   в шапке стоит overflow: hidden и nowrap, и там любая из них обрезалась бы
   многоточием на первых словах — то есть автор увидел бы, что что-то есть,
   но не узнал бы что.

   Режим чтения — не ошибка автора и не поломка, поэтому предупреждающий
   жёлтый, а не красный: он ничего не сделал неправильно, просто вторая
   вкладка. Отказ записи красный: работа действительно может пропасть. */
.ed-workspace-readonly,
.ed-workspace-error {
  padding: 8px 16px;
  font-size: var(--ui-type-m);
  line-height: 1.45;
  border-bottom: 1px solid var(--ui-line);
}

/* Полосы сообщений. Держит их ОДИН постоянный узел — см. комментарий
   к сетке .ed-root выше.

   Потолок высоты нужен на случай длинного текста ошибки: без него сообщение
   в несколько абзацев отняло бы у холста столько, сколько захочет. Прокрутка
   внутри полосы, а не рост полосы наружу. */
.ed-notices {
  display: flex;
  flex-direction: column;
  max-height: 28vh;
  overflow-y: auto;
}

.ed-workspace-readonly {
  color: var(--ui-feedback-warn-fg);
  background: var(--ui-feedback-warn-bg);
}

.ed-workspace-error {
  color: var(--ui-feedback-critical);
  background: var(--ui-feedback-critical-bg);
}

/* Сообщение о том, что действие автора зацепило больше, чем видно.
   Не ошибка, поэтому не красное — но и не молчание. Перенос по словам,
   а не обрезка: смысл здесь в числе, и обрезать его нельзя. */
.ed-notice {
  color: var(--ui-feedback-positive);
  font-size: var(--ui-type-s);
  line-height: 1.45;
  min-width: 0;
}

/* Пять полос дорожки (каркас, задача 2.1): колонка голов и контейнер
   прокрутки — родные дети одного грида в две колонки. 120px — ширина
   колонки голов, число снято с натуры прототипа (design/montage.css). */
.ed-lanes {
  display: grid;
  grid-template-columns: 120px 1fr;
  min-width: 0;
}

/* Колонка голов. Стоит СНАРУЖИ контейнера прокрутки — не внутри него
   с position: sticky. Причина внешняя: e2e/track-zoom.spec.ts:57 считает
   ожидаемое положение метки от .x контейнера .ed-lane-scroll («внешняя
   правда, независимая от того, что нарисовало само полотно»); с липкой
   головой внутри контейнера .x стал бы левым краем ГОЛОВЫ, и проверка
   разъехалась бы ровно на ширину колонки голов. Высота задаётся инлайн
   из TrackView (minHeightOf(tier) − TRANSPORT_H) — число тира, а не
   константа CSS. */
.ed-lane-heads {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.ed-lane-head {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 0 8px;
  min-width: 0;
}

.ed-lane-head-title {
  font-size: var(--ui-type-xs);
  font-weight: 600;
  color: var(--ui-content-fg-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Подпись полосы, которая ЕЩЁ И КНОПКА: «Звук» и «Слайды» складывают свои
   панели. Выглядит как подпись, а не как кнопка, намеренно — рамка и заливка
   у каждой второй подписи вернули бы в зону ту самую ленту одинаковых
   прямоугольников, ради ухода от которой всё затевалось. Что это орган,
   говорит треугольник состояния слева и отклик на наведение. */
.ed-lane-head-button {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-content-fg-secondary);
  font: inherit;
  font-size: var(--ui-type-xs);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.ed-lane-head-button:hover { color: var(--ui-content-fg); }
.ed-lane-head-button:disabled { cursor: default; opacity: 0.5; }

/* Масштаб дорожки в голове линейки (Сессия 55). Голова 120 px и высота
   линейки 24 — орган обязан влезть в них, не растя полосу: вырасти она,
   и зона отняла бы у холста ровно столько же. Поэтому без рамки и почти
   без полей, как подпись рядом. */
.ed-track-zoom {
  align-self: start;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-content-fg-secondary);
  font: inherit;
  font-size: var(--ui-type-xs);
  font-weight: 600;
  cursor: pointer;
}

.ed-lane-head-note {
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Контейнер прокрутки — ЕДИНСТВЕННЫЙ на все пять полос (каркас, задача 2.1
   свела в один прежние .ed-lane-scroll у волны и .ed-marks-scroll у меток
   с односторонней синхронизацией scrollLeft между ними — синхронизировать
   больше нечего). Имя СОХРАНЕНО: e2e/track-zoom.spec.ts:57 считает
   ожидаемое положение метки от .x именно этого контейнера.

   Высота задана ЯВНО инлайн из TrackView, а не через auto — по той же
   причине, что была у .ed-lane-scroll раньше: у блока с overflow-x: auto
   и auto-высотой браузер добавляет толщину горизонтальной полосы прокрутки
   К итоговой высоте, а не рисует её ВНУТРИ уже отведённого места.

   Решение владельца 06.08.2026 (A1) остаётся в силе: скролбар у ЭТОЙ полосы
   виден (не overlay — измерено 15px в живом Chrome). Раньше он отнимал
   высоту только у волны (свой контейнер на одну полосу), теперь контейнер
   общий на пять полос — отнимает высоту у ВСЕГО стека тел, а не у волны
   отдельно; волна больше не подстраивается под clientHeight контейнера
   (см. TrackView, laneHeight('sound', tier)), потому что мерить так
   ОДНУ полосу из пяти было бы неверно — отняло бы чужую высоту у соседних
   полос. */
.ed-lane-scroll {
  overflow-x: auto;
  overflow-y: hidden;
}

/* Полотно всех тел дорожки: ширина — канва (laneWidth × zoom, track-zoom.md
   §2), задана инлайн. position: relative держит позиционирование головки
   (.ed-playhead, top:0/bottom:0 — на всю высоту стека). */
.ed-lane-bodies {
  position: relative;
}

/* Полоса делений времени. Тот же .ed-ticks/.ed-tick, что и раньше жил
   поверх волны, теперь в своей строке — ей не нужно делить пиксели
   с волной. Высота задаётся инлайн из TrackView. relative держит
   position: absolute у .ed-ticks/.ed-tick внутри. */
.ed-ruler-body {
  position: relative;
  /* Линейка — поверхность перемотки наравне с волной, поэтому и курсор,
     и touch-action у неё те же, что у .ed-lane ниже. Без touch-action жест
     перемотки на тач-устройстве превращался бы в прокрутку страницы. */
  cursor: pointer;
  touch-action: none;
}

/* Полоса с волной. Высота задаётся инлайн из TrackView
   (laneHeight('sound', tier)) — формулой, а не измерением контейнера
   (см. комментарий у .ed-lane-scroll выше). Разделитель — безусловный:
   эта полоса никогда не первая в стеке (перед ней всегда идёт
   .ed-ruler-body). */
.ed-lane {
  cursor: pointer;
  border-top: 1px solid var(--ui-line);
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
  border-left: 1px solid var(--ui-line-strong);
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
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
  background: var(--ui-playhead);
  pointer-events: none;
}

/* Кнопки добавления метки прижаты вправо: слева транспорт, справа правки. */
.ed-add { margin-left: auto; display: flex; gap: 8px; flex: 0 0 auto; }

/* Значок следует за строкой: размер от кегля, цвет от текста (ADR-034).
   flex: 0 0 auto — значок не сжимается вместе с подписью. */
.ed-icon { width: 1em; height: 1em; flex: 0 0 auto; }

.ed-add-mark {
  /* inline-flex, а не строчная раскладка, ИМЕННО из-за значка: строчный svg
     садится на базовую линию и тянет высоту строки вниз, а высоту этой
     кнопки трогать нельзя — раздел 8 track-zoom.md запрещает поднимать
     высоту зоны дорожки хоть на пиксель, и высота зоны — общий ресурс
     жестовых тестов (прилипание к направляющим). При align-items: center
     высота строки остаётся за подписью: значок 1em = 12px меньше её
     line-height 18px и в расчёт не входит.

     Число 18, а не 16: line-height здесь наследуется от .ed-root безразмерной
     полуторой, то есть равен 1.5 от СОБСТВЕННОГО кегля кнопки (12px). Стояло
     16 — сгнило до Сессии 45 и там же поймано замером: кнопка 30px
     (5+5 отступа, 18 строка, 1+1 рамка), а не 28. Проверено откатом
     на inline-block — те же 30, значит значок высоту не менял.
     Отступ даёт gap, а не пробел в разметке: во флексе пробел по краям
     текстового узла схлопывается. */
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-m);
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: var(--ui-type-s);
  cursor: pointer;
  white-space: nowrap;
}
.ed-add-mark:hover:not(:disabled) { border-color: var(--ui-action-selected-line); }
.ed-add-mark:disabled { opacity: 0.4; cursor: default; }

/* Ступени масштаба дорожки (track-zoom.md §§1, 8). Встают в СУЩЕСТВУЮЩУЮ
   строку .ed-transport, не заводя новой строки по высоте — раздел 8
   спецификации запрещает поднимать высоту зоны дорожки хоть на пиксель.

   Высота одной кнопки (padding 5px сверху и снизу + line-height 16px +
   рамка 1px сверху и снизу = 28px) заведомо меньше высоты .ed-play (34px),
   а .ed-transport — строка с align-items: center, а не stretch, то есть
   её высота равна высоте самого высокого ребёнка. Кнопка ниже .ed-play
   не может поднять высоту строки. line-height и padding — целыми px
   по той же причине, что и везде в этом файле: измерение, а не вкус. */
.ed-zoom { display: flex; gap: 4px; flex: 0 0 auto; }

.ed-zoom-step {
  padding: 5px 10px;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-m);
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: var(--ui-type-s);
  line-height: 16px;
  cursor: pointer;
}
.ed-zoom-step:hover { border-color: var(--ui-action-selected-line); }
.ed-zoom-step[aria-pressed='true'] {
  border-color: var(--ui-action-selected-line);
  color: var(--ui-content-fg);
}

/* Ступень, чьё полотно не помещается в канву браузера на текущей ширине
   окна (A2, zoomBlockedReason в zoom.ts). ГАСНЕТ, а не исчезает: кнопка
   остаётся в разметке и в фокусе таба, opacity и курсор — единственные
   визуальные сигналы, причина — в title и в aria-disabled для читалки
   экрана. Не aria-pressed='false' с тем же видом: автору нужно ОТЛИЧИТЬ
   «не выбрана» от «недоступна», иначе он решит, что масштаб просто не тот. */
.ed-zoom-step[aria-disabled='true'] {
  opacity: 0.4;
  cursor: default;
}
.ed-zoom-step[aria-disabled='true']:hover { border-color: var(--ui-line-strong); }

/* Полоса меток. Отдельной строкой под волной: лежи метки поверх неё,
   они отбирали бы у перемотки половину нажатий. */
/* Две головы, а не одна: слайды сверху, остановки снизу (тот же порядок,
   что у .ed-lane-head в .ed-lane-heads) — но ТЕЛО одно (tiers.ts,
   marksBodyHeight, каркас, задача 2.1). Пока была одна полоса и одна
   голова, метка на том же слове перекрывала соседнюю ЦЕЛИКОМ — слайд
   рисуется позже и перехватывал нажатие, из-за чего настройки такой
   остановки нельзя было открыть вовсе (known-bugs §7). Случай частый:
   миграция ставит слайд на каждое слово с кью.

   Свой контейнер прокрутки (.ed-marks-scroll) полоса меток больше не
   заводит: она стоит внутри ОБЩЕГО .ed-lane-scroll вместе с остальными
   телами (каркас, задача 2.1) — прежняя односторонняя синхронизация
   scrollLeft между волной и метками ушла целиком, синхронизировать
   больше нечего. Высота задаётся инлайн из TrackView (пропс heightPx
   у MarksLane, marksBodyHeight(tier)). border-top безусловный: эта
   полоса никогда не первая в стеке (перед ней всегда идут ruler и sound). */
.ed-marks {
  position: relative;
  border-top: 1px solid var(--ui-line);
}

/* Полоса капли: отрезки «моё» клипами (v14, ADR-032, bubble.md §3).

   Фона у полосы НЕТ намеренно. Пустое место между клипами — это «здесь
   распоряжается зритель», и оно читается само; залей его — и на полосе
   окажется вдвое больше прямоугольников, чем смыслов.

   Высота приходит инлайн из TrackView (laneHeight('bubble', tier)),
   как у остальных полос: второе число в CSS разошлось бы с tiers.ts молча. */
.ed-bubble-lane {
  position: relative;
  /* Курсор обещает то, что полоса умеет: тянуть по пустому месту — рисовать. */
  cursor: crosshair;
}

.ed-span {
  position: absolute;
  top: 3px;
  bottom: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px;
  box-sizing: border-box;
  border: 1px solid var(--ui-action-selected-line);
  border-radius: var(--ui-radius-s);
  background: var(--ui-action-selected-bg);
  color: var(--ui-content-fg);
  font-size: var(--ui-type-xs);
  line-height: 1;
  overflow: hidden;
  cursor: grab;
}

.ed-span:active { cursor: grabbing; }

/* Черновик — то, что автор сейчас рисует. Пунктиром и без ручек: отрезка
   ещё нет ни в проекте, ни в истории, и обещать ему поведение готового
   значило бы соврать на полкадра. */
.ed-span-draft {
  border-style: dashed;
  opacity: 0.7;
  pointer-events: none;
}

.ed-span-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Подпись не должна перехватывать жест: тянут за клип, а не за слово. */
  pointer-events: none;
}

/* Ручки краёв. Шире, чем выглядят: 6 px — это меньше пальца и меньше
   промаха мышью, поэтому область захвата расширена паддингом, а видимая
   полоска остаётся тонкой. */
.ed-span-grip {
  flex: 0 0 auto;
  width: 4px;
  align-self: stretch;
  border-radius: var(--ui-radius-s);
  background: var(--ui-action-primary-bg);
  cursor: ew-resize;
}

.ed-span-remove {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-s);
  background: transparent;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-xs);
  line-height: 1;
  cursor: pointer;
}

.ed-span-remove:hover {
  background: var(--ui-feedback-critical-bg);
  color: var(--ui-feedback-critical);
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
  border-radius: var(--ui-radius-s);
  background: transparent;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-xs);
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.ed-mark:hover { color: var(--ui-content-fg); }
.ed-mark-selected { border-color: var(--ui-action-selected-line); color: var(--ui-content-fg); }

/* Привязка к слову — не украшение, а то, что автор обязан видеть без
   раскрытия свойств: от неё зависит, переживёт ли метка замену озвучки.
   Классы названы состояниями якоря из product.md §4 (bound / pinned /
   orphan), а не видами ссылки: интерфейс говорит с автором на языке
   документа, а не схемы. */
.ed-mark-bound { color: var(--ui-feedback-positive); }
.ed-mark-gate { color: var(--ui-mark-gate); }
.ed-mark-gate.ed-mark-bound { color: var(--ui-feedback-positive); }

/* МЕТКА РОВНО В КОНЦЕ ГЛАВЫ.

   Слово владельца 26.08.2026: «пусть головка вопроса рисуется чуть
   по-другому, чтобы было отличительно, что она именно в конце стоит
   и сразу чтобы было понятно».

   Отличие не косметическое: после вопроса на такой метке продолжения
   не будет — резать после неё нечего. Метка на предпоследней секунде
   выглядит на глаз так же, а даёт главу длиной в секунду.

   Признак ДВОЙНОЙ, как у сироты ниже, и по той же причине: цвет один
   уже несёт род метки и выделение, а на дальтонизме перестаёт различать.
   Здесь это стенка справа (рассказ упирается) плюс сдвиг самой метки
   влево — иначе у края полосы её половина уходит за обрез. */
/* МЕТКА В КОНЦЕ ГЛАВЫ — ОДНА ФИГУРА.

   Слово владельца 26.08.2026: «когда ты ставишь метку в любом месте,
   глава обрезается на этом месте, и вопрос и так и так будет в конце.
   Вопрос только в том, чтобы сделать вид этой метки на дорожке нормальным.
   Просто соедини это в одну фигуру, чтобы было легко понимать, что это,
   и нажимать на это».

   Он прав по сути: вопрос ВСЕГДА оказывается в конце своей главы —
   «Задать вопрос с ответами» режет главу по метке. Значит разводить
   столбик и стенку на два предмета было незачем: два предмета на одном
   месте и путали.

   Прежние редакции и почему они не годились:
     — столбик 18 вплотную к стенке 2x22: один предмет на вид, а нажимать
       надо было в столбик («фиг пойми, на что жать»);
     — столбик, зазор и стенка 3x32 с подпоркой: разошлись, но стали ТРЕМЯ
       деталями там, где смысл один.

   Теперь одна фигура: брусок у самого края полосы, выше и заметнее обычной
   метки. Нажимать — в него целиком. Глиф не нужен: фигура сама и есть знак,
   поэтому кегль нулевой. */
.ed-mark-at-end {
  /* Прижата к своей секунде слева: секунда последняя, и всё правее
     полоса срезает. */
  margin-left: -14px;
  width: 14px;
  /* Выше обычной метки (18) и приподнята, чтобы остаться на её оси.
     Подъём — отрицательным полем, а НЕ через top: top у .ed-mark-gate задан
     ниже по файлу, и при равной силе правил побеждает позднее. Замер
     26.08.2026: с top в 38px фигура осталась на 827 — ровно там же,
     где обычная метка, то есть правило не сработало вовсе.

     ОБРАТНЫХ КАВЫЧЕК ЗДЕСЬ НЕТ НАМЕРЕННО: файл — одна шаблонная строка,
     и кавычка в комментарии рвёт её. Наступил сюда снова 26.08.2026. */
  height: 28px;
  margin-top: -5px;
  background: currentColor;
  border-radius: var(--ui-radius-s);
}

/* Сирота: слово потерялось, метка стоит в догадке машины.
   Отличается ДВУМЯ признаками сразу, и это не избыточность. Цвет один
   не годится: он уже несёт род метки и выделение, а на дальтонизме
   и вовсе перестаёт различать. Восклицательный знак в углу читается
   независимо от цвета и не отнимает основной знак у рода метки —
   ромб слайда и столбик гейта обязаны остаться на месте. */
.ed-mark-orphan { color: var(--ui-feedback-warn); }
.ed-mark-gate.ed-mark-orphan { color: var(--ui-feedback-warn); }
.ed-mark-orphan::after {
  content: '!';
  position: absolute;
  top: -4px;
  right: -3px;
  font-size: var(--ui-type-xs);
  font-weight: 700;
  line-height: 1;
  color: var(--ui-feedback-warn);
}

/* Строка списка «проверьте эти места» (product.md §4). Стоит НАД полосой
   меток, потому что относится ко всей дорожке, а не к выбранной метке. */
.ed-orphans {
  margin: 0;
  padding: 4px 8px;
  border-top: 1px solid var(--ui-line);
  background: var(--ui-feedback-warn-bg);
  color: var(--ui-feedback-warn-fg);
  font-size: var(--ui-type-s);
  line-height: 1.4;
}
.ed-orphans-sign { color: var(--ui-feedback-warn); font-weight: 700; }
.ed-orphans-next {
  padding: 1px 8px;
  border: 1px solid var(--ui-feedback-warn-line);
  border-radius: var(--ui-radius-s);
  background: var(--ui-feedback-warn-bg-strong);
  color: var(--ui-feedback-warn-fg);
  font: inherit;
  cursor: pointer;
}
.ed-orphans-next:hover { background: var(--ui-feedback-warn-bg-hover); }

/* Что получилось у последнего разреза (Сессия 51, задача Б1).

   Роли берутся ОБЩИЕ, а не --ui-zone-*: строка живёт внутри нижней зоны,
   а зона переобъявляет общие роли своими значениями на .ed-track-column.
   Обратись правило к --ui-zone-* напрямую — оно перестало бы следовать
   за зоной, если зону однажды перекрасят.

   Не предупреждение и не отказ: разрез УДАЛСЯ, и жёлтый фон сказал бы
   автору обратное. Отсюда акцентная полоса слева, тот же приём, каким
   в зоне помечено выбранное.

   Переносится, а не режется: имена глав задаёт автор, и длина строки
   от нас не зависит. Обрезка по ширине — ровно тот класс дефекта, из-за
   которого в проекте заведено правило мерить scrollWidth. */
.ed-split-result {
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--ui-line);
  border-left: 3px solid var(--ui-action-selected-line);
  background: var(--ui-action-selected-bg);
  color: var(--ui-content-fg);
  font-size: var(--ui-type-s);
  line-height: 1.4;
}

`;
