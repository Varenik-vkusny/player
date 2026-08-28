/** Органы ввода: поля, флажок, выбор файла.
 *
 * Часть общего листа стилей редактора. Собирается в index.ts;
 * порядок сборки НЕСУЩИЙ — см. пояснение там.
 */
export const FIELDS_CSS = `/* ОРГАНЫ ВВОДА (Сессия 51, задача А2). Библиотека — ui/fields.tsx.

   Ни одного правила «по тегу»: селектор вида «input[type=checkbox]» покрасил
   бы и те органы, что живут вне библиотеки, и тем самым спрятал бы их от
   охраны — беда выглядела бы вылеченной. Красится КЛАСС, который ставит
   библиотека, и потому не покрашенное сразу видно глазом. */

/* Видимая причина под полем. Не «title»: измерено дважды, что на подсказки
   при наведении не смотрят, а у погашенного органа «title» во многих
   браузерах не показывается вовсе. */
.ed-field-reason {
  margin: 2px 0 0;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-xs);
  line-height: 1.4;
}

/* ФЛАЖОК И ПЕРЕКЛЮЧАТЕЛЬ. Облик свой, поведение родное.

   Родной орган НЕ прячется «display: none» — он становится прозрачным
   и ложится точно под свой рисунок. «display: none» вынул бы его из обхода
   клавиатурой, то есть поменял бы поведение, а мы меняем только облик. */
.ed-toggle-field { display: flex; flex-direction: column; }
.ed-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  cursor: pointer;
}
.ed-toggle-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.ed-toggle-box {
  flex: none;
  width: 16px;
  height: 16px;
  border: 1px solid var(--ui-line-strong);
  border-radius: var(--ui-radius-s);
  background: var(--ui-field-bg);
}
/* Круг, а не скругление: 50% — исключение, которое не переводят в роль. */
.ed-toggle-box--round { border-radius: 50%; }
.ed-toggle-name { font-size: var(--ui-type-s); }

/* Отмеченное состояние читается ЗАЛИВКОЙ, а не только галочкой: заливка
   видна боковым зрением, галочка — нет. */
.ed-toggle-input:checked + .ed-toggle-box {
  border-color: var(--ui-action-primary-bg);
  background: var(--ui-action-primary-bg);
  box-shadow: inset 0 0 0 3px var(--ui-field-bg);
}
.ed-toggle-input:focus-visible + .ed-toggle-box {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.ed-toggle-input:disabled + .ed-toggle-box {
  border-color: var(--ui-line-disabled);
  background: var(--ui-surface-placeholder);
}
.ed-toggle-input:disabled ~ .ed-toggle-name { color: var(--ui-content-fg-tertiary); }

/* ВЫБОР ФАЙЛА. Родную надпись «Выберите файл» стилизовать нельзя — её рисует
   браузер, и она разная в разных браузерах и языках системы. Поэтому орган
   прячется, а нажимает его «label»: это РОДНОЕ поведение label, а не
   перехват щелчка кодом, поэтому клавиатура и чтение с экрана работают. */
/* Однострочное поле: подпись и орган в строку, а не столбиком.

   Field по умолчанию ставит подпись НАД органом — так устроен .ed-insp-field
   (grid без колонок), и для панели это верно. Но в шапке, в пилюле масштаба
   и в полосе свойств строка одна, и столбик там ломает раскладку: полоса
   свойств уже чинила это снаружи своим спрямляющим правилом, а измеренная
   регрессия описана рядом с .ed-propbar-field. Класс даёт то же самое
   вызывающему, не заставляя его писать своё правило заново. */
.ed-insp-field.ed-field--inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ed-insp-field.ed-field--inline .ed-insp-label { flex: none; }

.ed-readonly { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ed-file { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ed-file-btn { display: inline-block; }
.ed-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
/* Имя выбранного файла: спрятанный орган показать его больше не может,
   а «файл выбран, но какой?» — тот же молчаливый провал, что и остальные. */
.ed-file-name {
  overflow: hidden;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Куда ведёт вариант ответа (Сессия 51, задача Б2) — строкой под подписью
   варианта, в панели остановки.

   Тише подписи, но не серее допустимого: это ответ на вопрос автора,
   а не сноска. Роль вторичного текста, а не третичного — третичная ступень
   отведена тому, что можно не читать.

   Переносится: имя главы задаёт автор, длина от нас не зависит, а обрезка
   съела бы ровно то единственное слово, ради которого строка заведена. */

.ed-option-goto {
  margin: 2px 0 0;
  color: var(--ui-content-fg-secondary);
  font-size: var(--ui-type-xs);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

/* Тупик — единственное состояние, требующее действия автора, и потому
   единственное, выделенное цветом. Красить все четыре состояния значило бы
   не выделить ни одного. */
.ed-option-goto--none { color: var(--ui-feedback-warn-fg); }

`;
