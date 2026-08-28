/** Чип слайда.
 *
 * Часть общего листа стилей редактора. Собирается в index.ts;
 * порядок сборки НЕСУЩИЙ — см. пояснение там.
 */
export const SLIDES_CSS = `/* ЧИП СЛАЙДА. Оформление перенесено сюда с «<li>» (Сессия 47) — до этого
   класс «ed-slide-button» не значил НИЧЕГО: правила с таким селектором
   в проекте не существовало.

   Чем это оборачивалось, замерено 18.08.2026 в живом браузере. Кнопка
   оставалась голой кнопкой браузера, а editor.html объявляет
   «color-scheme: dark», поэтому её лицо — тёмный системный ButtonFace
   (107 по всем трём каналам), квадратные углы, кегль UA. Поверх него подпись вида
   перехода писалась ролью --ui-content-fg-secondary, рассчитанной
   на светлую панель: отношение яркостей 1.12:1 при пороге WCAG 4.5:1.
   Слова «Срез» и «Морфинг» на экране не было вовсе. На своём фоне
   (--ui-surface-raised) та же пара даёт 5.39:1, на выделенном
   (--ui-action-selected-bg) — 5.22:1.

   Признак выделения — «aria-current», а НЕ «aria-pressed». Прежнее правило
   висело на «[aria-pressed='true']», которого разметка не ставит нигде,
   и потому не срабатывало ни разу: замерено, что у всех 15 строк фон
   был одинаков, включая текущую. То есть автор не видел, какой слайд
   выбран, — не «плохо видел», а не видел совсем. Ни один тест этого
   не проверял; теперь проверяет e2e/editor-slide-chip.spec.ts.

   «aria-pressed» здесь был бы и семантически неверен: это переключатель
   («нажато / не нажато»), а список слайдов сообщает «вот этот сейчас
   текущий» — ровно то, что значит «aria-current». Так же помечен
   и список сегментов. */
.ed-slide-button {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-s);
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg);
  font: inherit;
  font-size: var(--ui-type-s);
  text-align: left;
  cursor: pointer;
}

.ed-slide-button[aria-current='true'] {
  border-color: var(--ui-playhead);
  background: var(--ui-action-selected-bg);
  color: var(--ui-content-fg);
}

.ed-slide-time {
  font-variant-numeric: tabular-nums;
  min-width: 44px;
}

.ed-slide-transition { color: var(--ui-content-fg-secondary); font-size: var(--ui-type-xs); }

.ed-elements-empty { margin: 0; color: var(--ui-content-fg-secondary); font-size: var(--ui-type-s); }

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

/* Строка и кнопка «на слайде» стоят рядом, а не одна в другой: кнопку
   в кнопку браузер не разрешает (§12.4). */
.ed-element-item {
  display: flex;
  align-items: stretch;
  gap: 2px;
}
.ed-element-item .ed-element-row { min-width: 0; }

.ed-element-on-slide {
  flex: 0 0 auto;
  width: 22px;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-s);
  background: var(--ui-surface-panel);
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-m);
  line-height: 1;
  cursor: pointer;
}
.ed-element-on-slide:hover { border-color: var(--ui-action-selected-line); color: var(--ui-content-fg); }

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
  border-radius: var(--ui-radius-s);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--ui-type-s);
  text-align: left;
  cursor: pointer;
}
.ed-element-row:hover { border-color: var(--ui-line-strong); }
.ed-element-row-selected { border-color: var(--ui-action-selected-line); background: var(--ui-action-selected-bg); }

.ed-element-type {
  flex: 0 0 auto;
  font-size: var(--ui-type-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-content-fg-secondary);
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
  color: var(--ui-content-fg-secondary);
}

/* Колонка «своя озвучка + лента слайдов + дорожка» — единственный ребёнок
   третьей строки грида .ed-root (auto 1fr auto). Без обёртки AudioSourcePanel
   стал бы четвёртым прямым ребёнком .ed-root, а строк под него
   в grid-template-rows нет.

   min-height: 0 — приём против того, что грид-ребёнок не сжимается меньше
   своего содержимого.

   min-width: 0 — ТОТ ЖЕ приём по горизонтали, и он не косметика. Лента
   слайдов — ряд из N карточек по 170 px; без этой строки пятнадцать слайдов
   давали содержимому 2550 px, колонка растягивалась под них внутри окна
   на 1879, и ширину наследовали ВОЛНА И ПОЛОСА МЕТОК. Лента при этом
   не прокручивалась вовсе (scrollWidth совпадал с clientWidth), а работа
   с метками ломалась: четыре e2e падали, потому что полоса уезжала
   за экран. Замерено 01.08.2026. */
.ed-track-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  /* ПОТОЛОК ЗОНЫ — пол сцены (Сессия 47). Строка грида под зону — auto,
     то есть её высота считается от содержимого, а строка сцены — 1fr,
     то есть отдаёт всё, что осталось. Пола у сцены не было: раскрыв обе
     панели зоны (озвучку и ленту слайдов, обе свёрнуты по умолчанию
     и обе раскрываются одним щелчком), автор получал на 1280x800 холст
     83 px, на 1280x720 — ТРИ, на 1280x660 — ноль. Ни ошибки,
     ни предупреждения; замерено 18.08.2026 на фикстуре demo.

     Это тот же дефект, что уже починен по горизонтали: --ed-stage-min
     ниже заведён дословно потому, что «1fr сцены отдаёт всё, что осталось,
     то есть НОЛЬ: холст исчезал целиком». Число пола взято той же долей:
     320/1920 = 1/6, значит по вертикали 1080/6 = 180. В упоре масштаб
     сцены одинаков по обеим осям — это одно правило, а не два числа.

     330 = 150 + 180. Слагаемое 150 — всё постоянное, что стоит между окном
     и холстом: шапка 49, полоса свойств 57, полоса масштаба 43 и ЛИНИЯ
     под областью холста (border-bottom у .ed-main) — один пиксель. Первые
     три постоянны намеренно, у каждой своя купленная причина (см. .ed-header
     и .ed-zoom-strip); четвёртое слагаемое найдено ПРОГОНОМ, а не сложением:
     сумма трёх полос давала 149, холст выходил на пиксель меньше ожидаемого,
     и этим пикселем оказалась видимая линия под областью холста.

     Считать это в CSS неоткуда, поэтому сумма охраняется замером в живом
     браузере: e2e/track-zone-budget.spec.ts. Без той охраны литерал сгнил бы
     молча в день, когда шапке добавят строку.

     На состояние по умолчанию потолок НЕ влияет и влиять не должен:
     на 1280x800 он равен 470 при зоне 367. Высота зоны по умолчанию —
     общий ресурс жестовых e2e через масштаб сцены, и она обязана остаться
     ровно прежней; это тоже проверяется тем же файлом.

     ПОТОЛОК ТОЛЬКО У «ДОРОЖЕК», и это не полумера. В «Ветках» зону
     разрешено растягивать — «там не рисуют на холсте» (branches.md §3),
     и высоту ей задаёт своё правило (55vh у .ed-branches-space). Замерено
     18.08.2026: общий потолок ужимал полотно веток с 440 до 406 и двигал
     эталон chrome-branches-zone. То есть чинил бы «Дорожки» за счёт вида,
     которого эта задача не касается вовсе. Что «Ветки» съедают холст
     сильнее допустимого (на 1280x800 холсту остаётся 146 px) — отдельная
     находка, и она записана, а не исправлена мимоходом. */
  /* 330 -> 327 -> 335 (20.08.2026). Последний шаг: строка полосы свойств
     48 -> 56, чтобы вокруг всплывающей пилюли был воздух, как у натуры
     (её пилюля 40 в строке 56, по 8 сверху и снизу).

     Постоянный хром между окном и холстом: шапка 57 + строка свойств 56
     + полоса масштаба 40 + линия под холстом 1 = 154. Замерено, а не
     сложено: сумма охраняется живым браузером (track-zone-budget.spec.ts),
     иначе литерал сгниёт молча. Пол сцены 180 не меняется, отсюда 334. */
  --ed-zone-budget-offset: 334px;

  /* ТЁМНАЯ ЗОНА. Ни одно правило ниже по файлу не переписано под тёмное:
     они как обращались к ролям, так и обращаются, а роли здесь получают
     другие значения. Тот же приём, которым сделана тема сцены.

     Почему зона тёмная — три довода владельца, ни один не про вкус:
     экран делится по смыслу (сверху составляют, снизу размечают время);
     волна — единственный сигнал в редакторе, а сигналы читаются
     на тёмном; все названные им референсы (CapCut, Premiere, DaVinci)
     делают таймлайн тёмным при любом цвете остального.

     ЗОНА ДЕЛИТСЯ С ВИДОМ «ВЕТКИ»: оба вида тёмные, иначе экран прыгает
     при переключении. Набор объявлен на общем предке обоих видов
     именно поэтому. */
  --ui-surface-base: var(--ui-zone-surface-base);
  --ui-surface-panel: var(--ui-zone-surface-panel);
  --ui-surface-raised: var(--ui-zone-surface-raised);
  --ui-surface-overlay: var(--ui-zone-surface-raised);
  --ui-surface-placeholder: var(--ui-zone-placeholder);
  --ui-field-bg: var(--ui-zone-surface-raised);
  --ui-content-fg: var(--ui-zone-fg);
  --ui-content-fg-secondary: var(--ui-zone-fg-secondary);
  --ui-content-fg-tertiary: var(--ui-zone-fg-tertiary);
  --ui-line: var(--ui-zone-line);
  --ui-line-strong: var(--ui-zone-line-strong);
  --ui-line-disabled: var(--ui-zone-line-disabled);
  --ui-focus: var(--ui-zone-accent);
  --ui-focus-ring: var(--ui-zone-accent-ring);
  --ui-action-primary-bg: var(--ui-zone-accent);
  --ui-action-primary-fg: var(--ui-zone-accent-ink);
  --ui-action-selected-line: var(--ui-zone-accent);
  --ui-action-selected-bg: var(--ui-zone-selected-bg);
  --ui-feedback-positive: var(--ui-zone-positive);
  --ui-playhead: var(--ui-zone-head);
  --ui-mark-gate: var(--ui-zone-accent);
  --ui-mark-tail: var(--ui-zone-mark-tail);
  --ui-shadow-overlay: var(--ui-zone-shadow);

  background: var(--ui-surface-base);
  color: var(--ui-content-fg);
}

.ed-track-column--tracks {
  max-height: calc(100vh - var(--ed-zone-budget-offset));
}

`;
