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
 * исключение из user-select: none, что и у .ed-words-body и полей инспектора,
 * и действует оно только пока StageView сам включил contenteditable на время
 * правки текста (см. «Правка текста на холсте» в docs/superpowers/specs).
 */
export const EDITOR_STYLES = `
/* Роли хрома редактора (--ui-*). На .ed-root, а не на :root: EDITOR_STYLES
   вешается глобальным <style> в чужой хост-документ (index.ts), и :root
   отдал бы переменные всему документу хоста, столкнувшись с его
   собственными. .ed-root — единственный предок всего, что рисует редактор
   (порталов и вставок в document.body в пакете нет). Значения — ШАГ 2:
   светлые, снятые с design/tokens.css. Список ролей при этом НЕ ТРОНУТ —
   поменялись только значения, и это лучшая проверка системы, какая
   возможна: будь роли привязаны к тёмному, список не пережил бы смены.
   Полный список ролей и почему — docs/design/ui-tokens.md.

   Откат стоит правки ЭТОГО блока и больше ничего: ни одно правило ниже
   цвета не называет. Тёмный набор вторым не сохранён намеренно — два
   набора без нужды это долг, а не гибкость.

   Откуда какое значение:
     18 ролей  — прямой заменой из design/tokens.css по совпадающему имени;
     11 ролей  — выведены из родителя, у которого светлое значение есть
                 (поля от surface-raised, погашенная рамка от line,
                 семейство warn от feedback-warn, критическая плашка
                 от feedback-critical);
      3 роли   — головка и метки, сняты с МОНТАЖА прототипа
                 (design/montage.css). Оговорка ui-tokens.md §3 про то,
                 что прототип-де рисовал только канву, верна для Сессии 20
                 и неверна для Сессии 21: монтаж рисует и головку, и метки,
                 и хвост, и выражает их через уже решённые роли. */
.ed-root {
  --ui-surface-base: #ffffff;
  --ui-surface-panel: #ffffff;
  --ui-surface-raised: #f2f3f5;
  --ui-surface-overlay: #ffffff;
  --ui-surface-placeholder: #c9ced6;
  --ui-field-bg: #f2f3f5;
  /* Поле вокруг сцены. Единственная роль, оставшаяся ТЁМНОЙ при светлом
     хроме, и это не недоделка: её значение связано с preview.html
     инвариантом №5 — см. .ed-stage-host ниже. */
  --ui-surface-canvas: #07090c;

  --ui-content-fg: #0e1318;
  --ui-content-fg-secondary: #5b6472;
  --ui-content-fg-tertiary: #838b99;

  --ui-line: #e3e6ea;
  --ui-line-strong: #c9ced6;
  --ui-line-disabled: #eef0f3;

  --ui-focus: #4c8dff;
  --ui-action-primary-bg: #4c8dff;
  --ui-action-selected-line: #4c8dff;
  --ui-action-selected-bg: #e8f0ff;
  --ui-focus-ring: #4c8dff88;

  /* Направляющая — НЕ синяя, в отличие от рамки выделения и рамки обведения.
     Синяя линия рядом с синей рамкой читается как ещё одна граница элемента,
     а не как подсказка о выравнивании. Тем же приёмом разводят их Canva
     и Figma: у обеих направляющие в малиновом конце спектра. */
  --ui-guide: #e0398f;

  /* Заливка рамки обведения — ОТДЕЛЬНАЯ роль, а не --ui-focus-ring.
     Кольцо фокуса задумано для теней и держит 53 % непрозрачности; заливкой
     оно закрашивает холст так, что автор не видит, что именно обводит.
     Проверено глазами 09.08.2026: на тёмном холсте разница решающая. */
  --ui-marquee-fill: #4c8dff22;

  --ui-feedback-positive: #12a05f;
  --ui-feedback-warn: #a8720b;
  --ui-feedback-warn-fg: #6b4907;
  --ui-feedback-warn-bg: #fdf6e6;
  --ui-feedback-warn-bg-strong: #f8e9c7;
  --ui-feedback-warn-bg-hover: #f2dda6;
  --ui-feedback-warn-line: #e0c584;
  --ui-feedback-critical: #d32f2f;
  --ui-feedback-critical-bg: #fdecec;

  /* Головка — ИНК, а не красная: так в монтаже прототипа (.mt-head берёт
     var(--ui-content-fg)). На светлой дорожке красная головка спорила бы
     с меткой сироты, у которой красный несёт смысл, а у головки нет. */
  --ui-playhead: #0e1318;
  --ui-mark-gate: #2f6fe0;
  --ui-mark-tail: #93b4f0;

  --ui-shadow-selected: 0 0 0 1px var(--ui-focus-ring), 0 10px 22px #0e131826;
  --ui-motion-fast: 0.18s;
  --ui-motion-base: 0.22s;
}

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
  background: var(--ui-surface-base);
  color: var(--ui-content-fg);
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
  border-bottom: 1px solid var(--ui-line);
  overflow: hidden;
  white-space: nowrap;
}

/* Сжимаются подписи, а не заголовок: имя проекта важнее счётчиков. */
.ed-title { flex: 0 0 auto; }
.ed-muted {
  color: var(--ui-content-fg-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Сцена вписывается в эту область. Overflow скрыт, потому что летербокс
   считается от размеров именно этого узла.

   ФОН ЗДЕСЬ — ЧАСТЬ ИНВАРИАНТА №5, а не оформление, и он ОБЯЗАН совпадать
   с фоном #stage-host в apps/playground/preview.html. Причина измерена
   и описана там же: Chromium выбирает режим сглаживания текста по тому,
   какой непрозрачный фон лежит под узлом со сценой, — субпиксельный
   (цветная кайма) или чёрно-белый. Разные фоны у двух хостов дают разные
   каймы букв при полностью одинаковом рендере.

   Проверено прогоном 06.08.2026 при переводе хрома на светлые значения:
   узел без своего фона унаследовал белый от .ed-root, и паритет упал
   с 0 до 0.2825 % пикселей при пороге 0.1 — то есть светлый хром сломал
   инвариант №5, не тронув ни строки рендера. С этим объявлением — снова 0.

   Поэтому поле вокруг сцены у автора остаётся тёмным, хотя весь остальной
   хром светлый: у прототипа --ui-surface-canvas светлый, и взять его
   значение отсюда нельзя, пока preview.html тёмный. Осветлять надо ОБА хоста
   одной правкой, и это перезапишет скриншотные эталоны — снимки берутся
   именно с #stage-host preview.html вместе с летербоксом. */
.ed-stage-host {
  position: relative;
  overflow: hidden;
  min-height: 0;
  background-color: var(--ui-surface-canvas);
}

/* Правка текста на холсте (двойной клик, StageView.beginTextEdit). Пока
   идёт набор, автору нужно выделять текст и переносить каретку мышью, как
   и в .ed-words-body/.ed-insp-input выше — иначе жест перетаскивания сцены
   заодно тянул бы синее выделение текста. Селектор бьёт только по узлу,
   у которого contenteditable сейчас включён самим StageView (это флаг на
   время правки, а не постоянное правило разметки), и перестаёт что-либо
   значить, как только правка закоммичена и атрибут снят. */
.ed-stage-host [contenteditable='true'] {
  user-select: text;
}

/* Рамка выделения. Соседка сцены, а не её потомок: служебных узлов
   внутри сцены быть не должно. */
/* Полоска расположения. Лежит ПОВЕРХ холста абсолютом, а не раздвигает его:
   раздвигая, она меняла бы площадь сцены на каждое выделение, сцена
   перемасштабировалась бы, и элементы дёргались бы под курсором автора
   ровно в тот момент, когда он в них целится. */
/* Колонка «полоска сверху, холст под ней». min-height: 0 обязателен, иначе
   содержимое не даёт грид-ячейке сжаться и дорожка уезжает за край окна —
   та же причина, что у .ed-main. */
.ed-stage-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.ed-stage-cell > .ed-stage-host {
  flex: 1;
  min-height: 0;
}

/* Строка полоски. Высота ЗАДАНА и не зависит от того, есть ли выделение:
   меняйся она, холст менял бы размер в момент выделения, сцена
   пересчитывала бы масштаб, и элемент уезжал бы из-под курсора между двумя
   кликами двойного щелчка. Пустая строка — цена постоянства, и она мала. */
.ed-arrange-row {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  flex: none;
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-surface-panel);
}

/* Подсказка в пустой строке. Без неё белая полоса над тёмным холстом
   читается как поломка вёрстки, а не как «здесь пока нечего показывать»:
   проверено глазами 09.08.2026. */
.ed-arrange-hint {
  font-size: 12px;
  color: var(--ui-content-fg-tertiary);
}

.ed-arrange {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ed-arrange-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-content-fg);
  cursor: pointer;
}

.ed-arrange-btn svg {
  width: 16px;
  height: 16px;
  /* Значок рисуется прямоугольниками без собственной заливки: цвет берётся
     от кнопки, поэтому гашение и наведение красят его сами собой. */
  fill: currentColor;
}

.ed-arrange-btn:hover:not(:disabled) {
  background: var(--ui-action-selected-bg);
}

.ed-arrange-btn:disabled {
  color: var(--ui-content-fg-tertiary);
  cursor: default;
}

.ed-arrange-sep {
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: var(--ui-line);
}

/* Направляющая при перетаскивании. Толщина приходит из разметки в пикселях
   контейнера, поэтому линия остаётся волосяной на любом масштабе сцены.
   Цвет отдельной ролью: направляющая обязана отличаться от рамки выделения,
   иначе автор читает её как ещё одну границу элемента. */
.ed-guide {
  position: absolute;
  background: var(--ui-guide);
  pointer-events: none;
}

/* Резиновая рамка обведения. Заливка полупрозрачная, чтобы было видно, что
   попало внутрь: сплошная закрывала бы ровно те элементы, ради которых жест
   и затевается. Указатель не ловит по той же причине, что и .ed-frame. */
.ed-marquee {
  position: absolute;
  outline: 1px solid var(--ui-focus);
  background: var(--ui-marquee-fill);
  pointer-events: none;
}

.ed-frame {
  position: absolute;
  /* Контур, а не рамка. border участвует в раскладке: проценты в позиции
     абсолютных потомков считаются от padding-box, поэтому при border: 1px
     ручка с left: 100% вставала на пиксель внутрь угла, и растягивание
     не доезжало. outline рисуется снаружи и на раскладку не влияет. */
  outline: 1px solid var(--ui-focus);
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
  border: 1px solid var(--ui-action-selected-line);
  border-radius: 2px;
  background: var(--ui-surface-panel);
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
  border: 1px solid var(--ui-line-strong);
  border-radius: 6px;
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.ed-action:hover { border-color: var(--ui-action-selected-line); }

/* Недоступная кнопка обязана ВЫГЛЯДЕТЬ недоступной.
   Здесь заданы и фон, и цвет, и cursor: pointer, поэтому браузерное
   оформление disabled перебито полностью — кнопка неотличима от рабочей,
   автор жмёт её и не понимает, почему ничего не происходит. Проверка
   toBeDisabled() в тесте при этом зелёная: в DOM атрибут стоит.
   Найдено глазами в браузере, а не тестом. Касается и «Отменить»
   с «Повторить»: они гаснут по пустой истории с самого начала.

   ВНИМАНИЕ: в этом файле нельзя ставить обратные кавычки даже в
   комментариях — весь EDITOR_STYLES это одна шаблонная строка, и они
   её обрывают. Наступил дважды за одну сессию. */
.ed-action:disabled {
  opacity: 0.4;
  cursor: default;
  border-color: var(--ui-line-disabled);
}
.ed-action:disabled:hover { border-color: var(--ui-line-disabled); }

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
  color: var(--ui-content-fg-secondary);
  white-space: nowrap;
}

.ed-view-as-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ed-view-as-name {
  color: var(--ui-content-fg-secondary);
  white-space: nowrap;
}

.ed-view-as-select {
  max-width: 140px;
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg);
  border: 1px solid var(--ui-line-strong);
  border-radius: 6px;
  padding: 2px 4px;
}

.ed-selection {
  color: var(--ui-content-fg-secondary);
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
  border-bottom: 1px solid var(--ui-line);
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
  border-left: 1px solid var(--ui-line);
}

.ed-watch-title {
  padding: 2px 8px;
  color: var(--ui-content-fg-secondary);
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

.ed-inspector { border-left: 1px solid var(--ui-line); }

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
  background: var(--ui-surface-panel);
  border-left: 1px solid var(--ui-line);
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
.ed-templates-label { font-size: 11px; color: var(--ui-content-fg-secondary); }

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
  color: var(--ui-content-fg-secondary);
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
.ed-segment-panel,
.ed-theme-panel {
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
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.ed-slide-row[aria-pressed='true'] {
  border-color: var(--ui-playhead);
  background: var(--ui-action-selected-bg);
  color: var(--ui-content-fg);
}

.ed-slide-time {
  font-variant-numeric: tabular-nums;
  min-width: 44px;
}

.ed-slide-transition { color: var(--ui-content-fg-secondary); font-size: 11px; }

.ed-elements-empty { margin: 0; color: var(--ui-content-fg-secondary); font-size: 12px; }

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
  border-radius: 4px;
  background: var(--ui-surface-panel);
  color: var(--ui-content-fg-secondary);
  font-size: 14px;
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
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.ed-element-row:hover { border-color: var(--ui-line-strong); }
.ed-element-row-selected { border-color: var(--ui-action-selected-line); background: var(--ui-action-selected-bg); }

.ed-element-type {
  flex: 0 0 auto;
  font-size: 10px;
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
}

/* Своя озвучка сегмента: загрузка файла автора и расшифровка. Строкой над
   дорожкой — то же место, где автор уже ищет свойства звука. */
.ed-audio-source {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 16px;
  background: var(--ui-surface-panel);
  border-bottom: 1px solid var(--ui-line);
  min-width: 0;
}

.ed-audio-current {
  color: var(--ui-content-fg-secondary);
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

/* Отчёт о переносе меток после замены с расшифровкой — своя строка,
   тем же приёмом, что и .ed-audio-confirm.

   line-height ЦЕЛЫМ px здесь несущий, а не косметика — измерено в браузере
   при подготовке этой задачи: унаследованный от .ed-notice line-height 1.45
   при font-size 12px даёт 17.4px, не представимые в сетке 1/64px, которой
   Chrome меряет раскладку (17.4×64 = 1113.6) — браузер округляет до
   17.390625px, и это поднимается по дереву .ed-audio-source → .ed-track-column
   → .ed-root ровно так же, как уже документировано у .ed-audio-speech ниже
   (там источник другой — .ed-insp-label/.ed-insp-note/.ed-insp-area, — но
   механизм и пострадавшая цепочка те же). Проверено: .ed-stage-host держит
   целые 720×265 с одним .ed-notice в подтверждении (не тронут этой правкой)
   и снова целые с .ed-audio-retarget-report ниже.

   Составной селектор (обе части класса на одном элементе), а не
   переопределение самого .ed-notice, — по той же причине, что
   и .ed-audio-speech .ed-insp-area: .ed-notice используется по всему
   редактору, и там дробный line-height безвреден; ломает именно этот один
   экземпляр, лежащий в «auto»-строке грида над сценой. Специфичность здесь
   не формальность: класс .ed-notice объявлен НИЖЕ по файлу, и при равной
   специфичности (обе — один класс) правило source order отдало бы победу
   ЕМУ, а не этому блоку, — составной селектор поднимает специфичность
   и снимает зависимость от порядка объявления. */
.ed-audio-retarget-report.ed-notice {
  flex: 1 1 100%;
  line-height: 18px;
}

/* Текст озвучки — своя строка под кнопками, тем же приёмом, что и
   .ed-audio-confirm: длинному textarea тесно между кнопками загрузки. */
.ed-audio-speech {
  flex: 1 1 100%;
}

/* Целые px у высоты поля и line-height подписи/пояснения — тот же приём,
   что и у .ed-words-body ниже («расти в высоту она не имеет права — иначе
   дорожка съест сцену», и там же — почему line-height нужен именно в px).

   Источников дробного пикселя здесь оказалось ДВА, и оба пришлось найти
   измерением, а не одним чтением кода:

   1) .ed-insp-label/.ed-insp-note используют унаследованный line-height
      («normal» и множитель 1.4) — 11px×1.4 = 15.4px не представимо в сетке
      1/64px, которой Chrome меряет раскладку (15.4×64 = 985.6), браузер
      округляет до 15.390625px. Чинится line-height в целых px.

   2) У textarea общий .ed-insp-area задаёт min-height 76px — без атрибута
      rows браузер по умолчанию считает интринсик-высоту textarea как
      2 строки ТЕКУЩЕГО (унаследованного, дробного) line-height + паддинг
      + рамка, и это даёт дробный результат (измерено: 51.1875px). Explicit
      height здесь не помогает сам по себе: правило CSS про min/max —
      «используемое значение не может быть меньше min-height» — держит
      верх ЛЮБОГО height, явного или интринсик, независимо от специфичности
      правил (это про взаимодействие свойств, не про каскад). Поэтому
      здесь ещё и обнулён min-height — только тогда height ниже 76px
      начинает работать.

   Оба источника поднимали дробный пиксель по дереву .ed-audio-source →
   .ed-track-column → .ed-root (строка «auto») до .ed-main (строка «1fr»)
   и .ed-stage-host. .ed-insp-label/.ed-insp-note/.ed-insp-area используются
   по всему редактору и там безвредны — ломает именно ЭТО место, потому что
   оно единственное лежит в «auto»-строке грида над сценой, поэтому фикс
   точечный (свои классы), а не правка общих. Резиновая — resize: vertical
   у базового класса никуда не делся, автор раздвинет поле сам.

   Сама высота (40px, не 76px общих) — вторая, отдельная причина чинить,
   а не то же самое: даже с целым числом пикселей поле всё равно ЗАНИМАЕТ
   место в «auto»-строке над сценой, и это место больше не достаётся сцене.
   На фикстуре с двумя стейджами рядом (§12.5, 1280×800) поле высотой
   76px ужимало высоту .ed-track-column ровно настолько, что редактор
   переставал быть «по ширине» (scale = containerWidth / 1920 = 0.2083,
   измерено на пристинной сборке ДО этой сессии) и становился «по высоте»
   (scale = containerHeight / 1080 = 0.1926). На меньшем масштабе
   перетаскивание ручки resize ловит уже известную (editor.spec.ts:257,
   её же комментарий) субпиксельную погрешность округления координат мыши
   крупнее — на 0.2083 она тонет в допуске 0.05, на 0.1926 нет. 40px
   оставляет высоте сцены достаточный запас, чтобы остаться «по ширине»
   (измерено: тот же тест на той же фикстуре — см. отчёт задачи). */
.ed-audio-speech .ed-insp-area {
  min-height: 0;
  height: 40px;
}
.ed-audio-speech .ed-insp-label,
.ed-audio-speech .ed-insp-note {
  line-height: 16px;
}

/* Лента слайдов (§14.11, product.md §2д [Р]). Стоит МЕЖДУ своей озвучкой
   и дорожкой — тем же ребёнком .ed-track-column, а не отдельной строкой
   грида .ed-root (см. комментарий у .ed-track-column выше). */
.ed-slide-strip-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 16px 4px;
  background: var(--ui-surface-panel);
  border-bottom: 1px solid var(--ui-line);
  min-width: 0;
}

.ed-slide-strip-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.ed-slide-strip-counter {
  font-variant-numeric: tabular-nums;
  color: var(--ui-content-fg);
  font-weight: 600;
  white-space: nowrap;
}

/* Причина, по которой «Вырезать»/«Вставить»/«Дублировать» погашены — рядом
   со счётчиком, а не в title: на подсказки при наведении никто не смотрит
   (см. дефект «Гейт на этой секунде», найденный обходом отрисованного
   текста). Обрезка ellipsis спрятала бы часть причины от автора, поэтому
   длинная причина переносится, а не режется.

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
  color: var(--ui-content-fg-secondary);
  font-size: 12px;
  line-height: 16px;
  min-height: 16px;
}

/* Ровная лента: все карточки одного размера, порядок — позиция в ряду,
   а не секунда (product.md §2д [Р]). Прокрутка своя, дорожку не трогает. */
.ed-slide-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 4px 10px;
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
  width: 160px;
  height: 90px;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  border: 1px solid var(--ui-line-strong);
  border-radius: 6px;
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
  transform: translateY(-9px) scale(1.1);
  box-shadow: var(--ui-shadow-selected);
  z-index: 4;
}

/* Сцена карточки — ScenePreview плеера, инвариант №5. Узел, которым владеет
   ScenePreview, вставляется внутрь на JS и получает собственный размер
   1920×1080 с transform-масштабом (см. render.ts, applyFit) — эта обёртка
   обязана резать его оверфлоу, иначе несмасштабированная сцена распирала бы
   карточку (тот же приём, что и у .ed-watch-host). */
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
  font-size: 10.5px;
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
  border-radius: 2px;
}

.ed-slide-strip-posthumb {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--ui-surface-placeholder);
  border-radius: 2px;
}

.ed-slide-strip-postick {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 8px;
  margin-left: -1px;
  background: var(--ui-action-primary-bg);
  border-radius: 1px;
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
  border-radius: 6px;
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.ed-track-expand:hover { border-color: var(--ui-action-selected-line); }

.ed-track-collapsed-name {
  color: var(--ui-content-fg-secondary);
  font-size: 12px;
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
  border-radius: 8px;
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ed-play:hover:not(:disabled) { border-color: var(--ui-action-selected-line); }
.ed-play:disabled { opacity: 0.4; cursor: default; }

.ed-clock { color: var(--ui-content-fg-secondary); font-variant-numeric: tabular-nums; }

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
  font-size: 13px;
  line-height: 1.45;
  border-bottom: 1px solid var(--ui-line);
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
  font-size: 12px;
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
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-content-fg-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ed-lane-head-note {
  font-size: 10px;
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
  font-size: 10px;
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

.ed-add-mark {
  padding: 5px 10px;
  border: 1px solid var(--ui-line-strong);
  border-radius: 6px;
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: 12px;
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
  border-radius: 6px;
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: 12px;
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
  color: var(--ui-content-fg-secondary);
  font-size: 11px;
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
  font-size: 10px;
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
  font-size: 12px;
  line-height: 1.4;
}
.ed-orphans-sign { color: var(--ui-feedback-warn); font-weight: 700; }
.ed-orphans-next {
  padding: 1px 8px;
  border: 1px solid var(--ui-feedback-warn-line);
  border-radius: 4px;
  background: var(--ui-feedback-warn-bg-strong);
  color: var(--ui-feedback-warn-fg);
  font: inherit;
  cursor: pointer;
}
.ed-orphans-next:hover { background: var(--ui-feedback-warn-bg-hover); }

/* Свой ряд каждому роду метки внутри одного тела .ed-marks (69px = 34
   слайды + 1 разделитель + 34 остановки, tiers.ts, marksBodyHeight).
   Разведение по вертикали, а не по z-index: порядок наложения решает, КТО
   сверху, но обе метки продолжают занимать один и тот же пиксель —
   недоступной становится просто другая из них.

   Порядок рядов (слайды сверху, остановки снизу) СОВПАДАЕТ с порядком
   голов .ed-lane-head в .ed-lane-heads (каркас, задача 2.1: «Слайды» —
   голова номер 3, «Остановки» — номер 4) — иначе автор видел бы столбики
   остановок рядом с подписью «Слайды». Числа — центр 18px-иконки в своём
   34px ряду: (34−18)/2 = 8, второй ряд начинается с 35 (34 + разделитель). */
.ed-mark-slide { top: 8px; }
.ed-mark-gate { top: 43px; }

/* Окно движения: сцена едет к слайду и приезжает НА метку (ADR-020).
   Хвост лежит слева от ромба и кончается ровно под ним — иначе автор
   не увидит, что близко стоящие слайды укоротили себе переход.

   Задача 6: теперь кнопка, а не картинка — щелчок без перетаскивания
   выделяет метку, поэтому pointer-events здесь больше не none. Ромб
   рисуется ПОСЛЕ хвоста в разметке (MarksLane.tsx) и потому лежит выше
   в порядке наложения — он остаётся органом управления сверху хвоста,
   а не наоборот. Сброс паддинга и рамки — потому что элемент теперь
   кнопка, у которой оба по умолчанию не нулевые.

   top сдвинут вместе с .ed-mark-slide (каркас, задача 2.1: ряд слайдов
   переехал с top:22 на top:8, разница −14 — тот же сдвиг применён и здесь:
   было 29 (22+7 от верха иконки), стало 15 (8+7). */
.ed-mark-tail {
  position: absolute;
  top: 15px;
  height: 3px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: var(--ui-mark-tail);
  font: inherit;
  cursor: pointer;
}

/* Ручка стыка (Задача 5): тянет левый конец хвоста, метка (ромб) стоит на
   месте — окно перехода кончается НА метке (ADR-020). Шире хвоста и
   вылезает влево от его начала — при ×1 сам хвост всего 7.2px, непопадаемая
   мишень, ради которой всё и затевалось. Рисуется ПОСЛЕ хвоста и ПЕРЕД
   ромбом (MarksLane.tsx): лежит выше хвоста, чтобы ловить нажатие вместо
   выделения метки, но ниже ромба — тот обязан остаться доступен, даже
   если хвост нулевой длины упёрся бы в него вплотную.

   top сдвинут той же арифметикой, что у .ed-mark-tail выше: было 25
   (22+3 от верха иконки), стало 11 (8+3). */
.ed-mark-transition-handle {
  position: absolute;
  top: 11px;
  width: 10px;
  height: 11px;
  margin-left: -7px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: var(--ui-mark-tail);
  cursor: ew-resize;
  touch-action: none;
}
.ed-mark-transition-handle:hover { border-color: var(--ui-action-selected-line); }

/* Строка транскрипта. Последнее тело в стеке дорожки (каркас, задача 2.1):
   стоит внутри .ed-lane-bodies шириной канвы, а не отдельной строкой
   .ed-track-column — расти в высоту она не имеет права ни там, ни здесь.
   Высота задаётся инлайн из TrackView (laneHeight('words', tier), 28px
   на ступени 'full') — целым числом по той же причине, что и раньше
   (см. историю ниже), overflow: hidden не даёт содержимому просочиться
   за пределы отведённой полосы. border-top безусловный: эта полоса
   никогда не первая в стеке.

   line-height задан в px, а не em/безразмерным множителем — историческая
   причина: 3.4em при font-size:12px даёт 40.8px, величину, не представимую
   в сетке 1/64 px, которой Chrome меряет раскладку (40.8×64 = 2611.2).
   Браузер округляет такое до дробного пикселя, и дробность поднимается
   по дереву до .ed-stage-host, оставляя область сцены с дробной высотой
   (измерено на прежней раскладке: 534.203125px вместо 534px). */
.ed-words-body {
  margin: 0;
  /* По вертикали ПРОКРУЧИВАЕТСЯ, а не обрезается. Полоса высотой 28 px,
     а расшифровка демо занимает 80 — замерено в браузере: clientHeight 28
     против scrollHeight 80, то есть 52 px содержимого. С overflow: hidden
     две трети текста были не просто не видны, а НЕДОСТИЖИМЫ, и ни один
     из 284 тестов этого не показал: обрезка текста оставляет зелёными
     все сигналы. До каркаса у полосы стояло overflow: auto при
     max-height 40 — прокрутка здесь не новшество, а возврат отнятого.
     По горизонтали hidden: горизонталь у дорожки одна и общая, ею ведает
     .ed-lane-scroll, и второй орган прокрутки того же самого спорил бы
     с первым. */
  overflow-x: hidden;
  overflow-y: auto;
  border-top: 1px solid var(--ui-line);
  color: var(--ui-content-fg-tertiary);
  font-size: 12px;
  line-height: 20px;
  user-select: text;
}

.ed-word-active {
  color: var(--ui-content-fg);
  background: var(--ui-surface-raised);
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
  background: var(--ui-surface-panel);
}

/* Панель свойств.

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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-content-fg-secondary);
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
  border-radius: 8px;
  background: var(--ui-feedback-warn-bg);
  color: var(--ui-feedback-warn-fg);
  font-size: 13px;
  line-height: 1.45;
}

/* Пояснение к выбору автора: что случится, если нажать. Не предупреждение —
   ничего не сломано, просто действие необратимо и стоит объяснить его заранее. */
.ed-insp-hint {
  margin: 0;
  color: var(--ui-content-fg-secondary);
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

.ed-insp-label { font-size: 11px; color: var(--ui-content-fg-secondary); }

.ed-insp-input,
.ed-insp-area {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--ui-line);
  border-radius: 4px;
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
  font-size: 11px;
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
  border-radius: 4px;
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg-secondary);
  font: inherit;
  font-size: 10px;
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
  border-radius: 4px;
  background: var(--ui-surface-raised);
  color: var(--ui-content-fg-secondary);
  font: inherit;
  /* Стрелка крупнее подписи плитки: она и есть всё содержимое кнопки. */
  font-size: 14px;
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
  border-radius: 3px;
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
  border-radius: 6px;
  background: var(--ui-surface-raised);
  color: inherit;
  font: inherit;
  font-size: 12px;
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
  color: var(--ui-feedback-positive);
}

.ed-graph-empty {
  margin: 0;
  color: var(--ui-content-fg-secondary);
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
  border: 1px solid var(--ui-feedback-critical);
  border-radius: 6px;
}

.ed-graph-hole-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--ui-feedback-critical);
}

.ed-graph-select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid var(--ui-line);
  border-radius: 4px;
  background: var(--ui-field-bg);
  color: var(--ui-content-fg);
  font: inherit;
  font-size: 12px;
}
`;
