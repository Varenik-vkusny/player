/** Карточка главы и панель озвучки.
 *
 * Часть общего листа стилей редактора. Собирается в index.ts;
 * порядок сборки НЕСУЩИЙ — см. пояснение там.
 */
export const CHAPTER_CSS = `/* Карточка главы: колонка справа от полотна, открывается правой кнопкой.

   НЕ ПРИВЯЗАНА К ПЛИТКЕ и не висит над ней: доска ездит и масштабируется,
   и карточка, привязанная к плитке, уезжала бы вместе с ней прямо во время
   чтения, а лежащая поверх — закрывала бы соседние главы от нажатия. */
.ed-chapter-card {
  flex: 0 0 300px;
  min-width: 0;
  overflow-y: auto;
  box-sizing: border-box;
  border-left: 1px solid var(--ui-line);
  padding: 12px 14px;
  background: var(--ui-surface-panel);
  color: var(--ui-content-fg);
}

.ed-chapter-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ed-chapter-card-order {
  flex: 0 0 auto;
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-s);
  background: var(--ui-action-selected-bg);
  color: var(--ui-action-selected-line);
  font-size: var(--ui-type-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ed-chapter-card-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--ui-type-m);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ed-chapter-card-close {
  flex: 0 0 auto;
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--ui-content-fg-secondary);
  font: inherit;
  cursor: pointer;
}

.ed-chapter-card-time {
  margin: 6px 0 0;
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
}

.ed-chapter-card-text {
  margin: 8px 0 0;
  font-size: var(--ui-type-s);
  color: var(--ui-content-fg-secondary);
  white-space: pre-wrap;
}

/* Правка метки главы в карточке: образцы цвета и поле знака. */
.ed-chapter-card-badge {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--ui-line);
  display: grid;
  gap: 8px;
}

.ed-chapter-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Образец — круг, а не квадрат: квадрат того же размера читался бы как
   ещё одна маленькая плитка, а плитки на этом экране значат другое. */
.ed-chapter-swatch {
  appearance: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--ui-chapter-gray);
}

/* Выбранный обведён кольцом ТОГО ЖЕ цвета, что и рамка выделения в остальном
   хроме: «выбрано» на всём экране показывается одинаково. */
.ed-chapter-swatch--on {
  border-color: var(--ui-action-selected-line);
}

/* «Без цвета» — перечёркнутый образец. Пустой кружок читался бы как ещё
   один цвет, совпавший с фоном. */
.ed-chapter-swatch--none {
  background: var(--ui-surface-panel);
  position: relative;
  overflow: hidden;
}
.ed-chapter-swatch--none::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--ui-content-fg-tertiary);
  transform: rotate(45deg);
}

.ed-chapter-swatch--gray { background: var(--ui-chapter-gray); }
.ed-chapter-swatch--blue { background: var(--ui-chapter-blue); }
.ed-chapter-swatch--green { background: var(--ui-chapter-green); }
.ed-chapter-swatch--amber { background: var(--ui-chapter-amber); }
.ed-chapter-swatch--red { background: var(--ui-chapter-red); }
.ed-chapter-swatch--violet { background: var(--ui-chapter-violet); }
.ed-chapter-swatch--teal { background: var(--ui-chapter-teal); }
.ed-chapter-swatch--pink { background: var(--ui-chapter-pink); }

.ed-chapter-card-hint {
  margin: 0;
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
}

.ed-chapter-rename {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 6px;
  border: 0;
  background: var(--ui-surface-panel);
  color: var(--ui-content-fg);
  font: inherit;
  font-size: var(--ui-type-xs);
}

.ed-branch-tail {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: var(--ui-type-xs);
  color: var(--ui-content-fg-tertiary);
  white-space: nowrap;
}

/* Хвост-повтор ведёт НАЗАД по рассказу — та же роль, что у меток «дальше»
   на дорожке (--ui-mark-tail), взята сюда по смыслу, а не заново придумана. */
.ed-branch-tail--repeat {
  color: var(--ui-mark-tail);
}

/* Тело панели озвучки (AudioSourceBody): подпись файла, кнопки, подтверждения.
   Стоит над дорожкой, под строкой причины ленты слайдов — рисуется только
   когда панель раскрыта (Сессия 47: до этого тот же класс держал ВЕСЬ
   блок, включая кнопку складывания и подпись, видимые постоянно; теперь
   кнопка живёт в общей шапке зоны — AudioSourceHead, — а подпись «файл
   на сервере: …» не дублируется больше нигде, кроме этого блока). */
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

/* Кнопка складывания (AudioSourceHead). Текстовая, а не один значок: слово
   «Озвучка» заодно называет панель, у которой своего заголовка не было
   вовсе — до Сессии 34 строка просто начиналась с имени файла. Стоит
   теперь в общей шапке зоны, а не над собственным телом (Сессия 47). */
.ed-audio-source-toggle {
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

.ed-audio-source-toggle:hover:not(:disabled) {
  border-color: var(--ui-line-strong);
}

/* Погашенная кнопка обязана ВЫГЛЯДЕТЬ погашенной — тот же закон, что
   у .ed-btn:disabled выше. Гаснет она, когда панели есть что сообщить:
   свернуть ошибку или подтверждение замены нельзя. */
.ed-audio-source-toggle:disabled {
  opacity: 0.4;
  cursor: default;
}

.ed-audio-current {
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-s);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

/* «без звука: 6 с» в общей шапке нижней зоны. Появляется ТОЛЬКО у немого
   сегмента (см. silentLabel в AudioSourcePanel.tsx) и потому не съедает
   запас шапки у остальных: её содержимое 1075 из 1280.

   Не ужимается и не обрезается многоточием, в отличие от соседей по строке:
   текст короткий и фиксированной формы, а его обрезка означала бы потерю
   ровно того сведения, ради возвращения которого он здесь и стоит. */
.ed-audio-silent {
  flex: 0 0 auto;
  white-space: nowrap;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-s);
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

`;
