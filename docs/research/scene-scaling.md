Дата проверки: 2026-07-27

# Масштабирование сцены: логические 1920×1080 на любом экране

Исследование под задачу: автор кладёт элементы мышью в абсолютных координатах на
холсте 1920×1080; зритель открывает это на чём угодно от десктопа до телефона
380 px; раскладка обязана быть **идентичной**, а не адаптивной.

Измеримый критерий, ради которого всё это: на экране 380 px с троттлингом CPU 4×
сцена из 15 анимированных элементов держит 60 fps (не ниже 55), раскладка
пиксель-в-пиксель совпадает с десктопной (с точностью до коэффициента).

---

## 0. Главный водораздел

Все способы «уменьшить сцену» делятся на два класса, и разница между ними —
не вкусовая, а определяющая:

| Класс | Механизм | Что происходит с раскладкой |
|---|---|---|
| **После layout** | `transform: scale()` | Layout считается один раз в логических 1920×1080. Коэффициент `k` применяется к готовому результату при отрисовке. Переносы строк, метрики шрифта, позиции боксов **не зависят от `k`**. |
| **Во время layout** | `zoom`, `cqw`/`cqh`, `rem`, `vw`, `%` | Layout пересчитывается при каждом новом `k`. Все длины проходят через округление в внутренние единицы движка и через метрики шрифта, округлённые под новый размер. Переносы строк **могут отличаться**. |

Спецификация CSS Transforms Level 1 прямо говорит:

> «For elements whose layout is governed by the CSS box model, the `transform`
> property does not affect the flow of the content surrounding the transformed
> element.»
> — [drafts.csswg.org/css-transforms-1](https://drafts.csswg.org/css-transforms-1/)

Спецификация CSS Viewport Module Level 1 про `zoom` говорит ровно
противоположное:

> «To apply zoom, the used value of a CSS property … is pre-multiplied (before
> any other steps in the used value stage) by the used value of `zoom` for the
> element. … unlike `transform`, scaling the `zoom` property affects layout.»
>
> «zoom is applied during layout (so text can re-lay-out)»
> — [drafts.csswg.org/css-viewport/#zoom-property](https://drafts.csswg.org/css-viewport/#zoom-property)

Фраза «so text can re-lay-out» в нормативном тексте — это приговор всему классу
«во время layout» для нашего требования «раскладка идентична». Дальше в разделе 2
разберём каждый вариант отдельно, но общий вывод определяется здесь.

---

## 1. Базовый подход: логическая сцена + `transform: scale()`

### 1.1 Разметка и формула

```css
.stage-host {              /* живёт и в плеере, и в панели редактора */
  position: relative;
  overflow: hidden;
}

.stage {                   /* один и тот же DOM в плеере и в редакторе */
  position: absolute;
  top: 0; left: 0;
  width: 1920px;
  height: 1080px;
  transform-origin: 0 0;
  /* transform пишется из JS: translate(Xpx, Ypx) scale(k) */
}
```

```
k = min(hostW / 1920, hostH / 1080)
k = clamp(k, MIN_SCALE, MAX_SCALE)   // защита от вырожденных окон, см. 3.1
X = (hostW - 1920 * k) / 2           // letterbox по горизонтали
Y = (hostH - 1080 * k) / 2           // letterbox по вертикали
```

`transform-origin: 0 0` + явный `translate` перед `scale` — предпочтительнее
варианта `top:50%; left:50%; transform: translate(-50%,-50%) scale(k)`, потому
что даёт целые числа для letterbox и упрощает обратное преобразование координат
(см. 1.4).

**Арифметика для нашего худшего случая.** Телефон 380 CSS-px шириной:
`k = 380/1920 ≈ 0.1979`. Сцена займёт 380×214 CSS-px, остальное — чёрные поля.
При DPR 3 эффективный масштаб растеризации `0.1979 × 3 ≈ 0.594` — то есть даже
на «трёхкратном» экране сцена рисуется примерно **вдвое мельче**, чем логический
размер. Логический шрифт 24px превращается в ~14 device px. Это принципиально
важно для двух вещей: (а) текст мельче 32–36 логических px на телефоне будет
физически нечитаем — это ограничение продукта, не техники; (б) память под
текстуры на мобильном получается ~4 % от десктопной, что нам на руку (см. 1.7).

**Продуктовое следствие, которое надо принять сознательно:** на портретном
телефоне сцена 16:9 — это полоска в верхней/средней трети экрана. Так работает
видео, и мы сознательно копируем видео. Если это неприемлемо — надо менять не
способ масштабирования, а требование «раскладка идентична».

### 1.2 Текст: размытие и сглаживание

Ключевой факт — браузер не растеризует слой один раз в логическом размере и
потом не растягивает битмап. Chrome с версии 53 **перерастеризует** содержимое
при изменении масштаба трансформации:

> «Starting in Chrome 53, all content is re-rastered when its transform scale
> changes, if it does not have the `will-change: transform` CSS property. …
> `will-change: transform` forces the content to be rastered into a fixed
> bitmap, which subsequently never changes under transform updates.»
> — [developer.chrome.com/blog/re-rastering-composite](https://developer.chrome.com/blog/re-rastering-composite), 22.09.2016

Отсюда практическое правило номер один:

> **На `.stage` (контейнер со `scale(k)`) `will-change: transform` не ставится
> никогда.** Именно это свойство превращает резкий текст в мыло. Соблазн
> поставить его «для производительности» будет — сопротивляться.

Оговорка из той же статьи: перерастеризация описана для изменений трансформации
**из скрипта**, и явно сказано, что на CSS-анимации и Web Animations это не
распространяется. Нам это подходит: `k` меняется только на resize, то есть из
скрипта. Но это же значит, что **анимировать сам `k`** (например, плавный
переход при повороте экрана) — плохая идея: во время такой анимации текст будет
размыт.

Стандартного способа управлять масштабом растеризации из CSS нет. Запрос на это
висит в CSSWG с 2016 года и до сих пор открыт:
[csswg-drafts#236 «Provide a way to specify rastered content scale for
transformed content»](https://github.com/w3c/csswg-drafts/issues/236). В нём
прямо сказано, что каждый движок решает вопрос своими эвристиками и разработчику
рычагов не дано. Значит: на резкость текста мы **не можем повлиять
декларативно** — только не мешать браузеру (не ставить `will-change`) и
проверять результат замером.

**Субпиксельное сглаживание (LCD text).** Широко воспроизводимое наблюдение:
браузеры отключают субпиксельный антиалиасинг для содержимого, вынесенного на
композиторский слой, из-за чего текст «меняет вес» при появлении трансформации
([css-tricks: Transforms cause font-smoothing weirdness in
Webkit](https://css-tricks.com/forums/topic/transforms-cause-font-smoothing-weirdness-in-webkit/),
[tannerhodges.com: Why is my text blurry?](https://tannerhodges.com/blog/why-is-my-text-blurry/)).
Первоисточника (спека/релиз-ноты движка), подтверждающего текущее поведение на
2026 год, найти не удалось — **не выяснено**, идёт в чек-лист спайка.
Косвенное подтверждение из практики: в трекере reveal.js висит
[#1879](https://github.com/hakimel/reveal.js/issues/1879) — в Safari текст
«дёргает» вес по завершении перехода, и рабочее лекарство там —
`-webkit-font-smoothing: antialiased`, то есть принудительный отказ от
субпиксельного сглаживания вообще, чтобы вес был одинаковым до и после.
Практически для нас это малокритично: на мобильных DPR ≥ 2 субпиксельного
сглаживания и так нет, а на десктопе `k` часто ровно 1 или близко.

**Про WebKit отдельно.** Утверждение «браузер перерастеризует, значит будет
резко» проверено первоисточником только для Chrome. В трекере reveal.js открыт
[#3644](https://github.com/hakimel/reveal.js/issues/3644) (19.06.2024): одна и та
же презентация в Safari 17.5 заметно хуже по чёткости текста и картинок, чем в
Chromium 126 при равном размере окна; Firefox 127 при этом нормален. А в
[#2663](https://github.com/hakimel/reveal.js/issues/2663) показано, что в Firefox
достаточно `transform: translateX(0)`, чтобы текст замылило — то есть дело не в
величине масштаба, а в самом факте попадания на композиторский слой. Резкость на
WebKit и Gecko — не факт, а гипотеза, требующая замера.

### 1.3 Hit-области

Хорошая новость: hit-testing выполняется в трансформированных координатах, и
`getBoundingClientRect()`/`getClientRects()` возвращают уже трансформированные
прямоугольники (CSSOM View; на это ссылается и сама
[CSS Transforms L1](https://drafts.csswg.org/css-transforms-1/)).

Плохая новость: **hit-testing нигде нормативно не описан**. При разборе
css-transforms-1 нормативного текста про hit-testing/pointer-events в спеке нет
вообще; в CSSWG открыт баг именно об этом —
[csswg-drafts#3997](https://github.com/w3c/csswg-drafts/issues/3997) (hit-testing
для 3D-трансформаций не определён). Расхождения между движками задокументированы:
[Mozilla bug 1686390 «hit testing on css transform behaves differently than
Chrome»](https://bugzilla.mozilla.org/show_bug.cgi?id=1686390). Для нашего кейса
(плоский 2D `scale`, без 3D и `perspective`) интероп на практике ожидается
полным, но это ровно то, что обязано быть замерено в спайке, а не принято на
веру.

**Настоящая ловушка здесь не в браузере, а в нашем коде.** Часть DOM API
возвращает координаты в трансформированном пространстве, часть — в
нетрансформированном:

| API | Учитывает трансформацию предка |
|---|---|
| `getBoundingClientRect()`, `getClientRects()` | да |
| `MouseEvent.clientX/clientY`, `PointerEvent.*` | да (координаты вьюпорта) |
| `offsetLeft`, `offsetTop`, `offsetWidth`, `offsetHeight` | нет |
| `clientWidth`, `clientHeight`, `scrollTop` | нет |

Смешивание этих двух семейств — источник багов в перетаскивании, которое у нас
в продукте есть. Единственно правильный рецепт перевода экранных координат в
координаты сцены:

```js
// k берём из самого DOM, а не из последнего значения, посчитанного на resize
const rect = stage.getBoundingClientRect();
const k = rect.width / 1920;
const sceneX = (event.clientX - rect.left) / k;
const sceneY = (event.clientY - rect.top)  / k;
```

Такой расчёт автоматически корректен при браузерном зуме, при pinch-zoom, при
любом DPR и при любом вложенном масштабе в редакторе — потому что читает
фактическую геометрию, а не хранимое число. Хранимый `k` использовать только для
записи `transform`, никогда для обратного преобразования.

Отдельно: перемещение при drag тоже должно делиться на `k`. Дельта указателя
приходит в CSS-пикселях экрана, а записывается в `translate` внутри сцены, то
есть в логических пикселях. Забыть разделить — значит получить «убегающий»
объект на телефоне и «залипающий» на большом мониторе.

Инвариант 3 («вне гейта `pointer-events: none`») с трансформацией
конфликтов не создаёт: `pointer-events` проверяется при hit-testing независимо от
геометрии.

### 1.4 Скругления, тени, границы

`transform` применяется на стадии отрисовки, а содержимое перерастеризуется под
фактический масштаб (см. 1.2). Значит `border-radius` и `box-shadow`
геометрически точны при любом дробном `k` — они не «растягиваются битмапом», а
рисуются заново в нужном размере. Артефакты «квадратных углов» и «ступенчатых
теней» из эпохи растянутых текстур здесь не ожидаются.

Что действительно ломается — **всё, что тоньше одного устройственного пикселя
после умножения на `k`**:

- `border: 1px` при `k ≈ 0.198` и DPR 1 → 0.198 device px. Браузер нарисует
  бледную полупрозрачную линию или не нарисует вовсе. При DPR 3 → 0.59 device px:
  видно, но заметно бледнее, чем на десктопе. То есть «идентичная раскладка» на
  тонких линиях всё равно даст визуально разный результат — не из-за геометрии, а
  из-за физики растра.
- Тень с `blur-radius: 2px` при том же `k` вырождается в почти невидимую.
- Хайрлайны-разделители, характерные для веб-вёрстки, на телефоне исчезнут.

Практический вывод для дизайна сцены: **минимальная «конструктивная» толщина в
логических пикселях должна быть не меньше 4–6 px**, иначе на 380 px её просто не
будет. Это не баг подхода, это следствие того, что мы уменьшаем в 5 раз. Числа
выше — арифметика, а не измерение; точный порог видимости надо получить в спайке.

### 1.5 Шрифты и переносы строк

Это тот пункт, ради которого выбран весь подход, поэтому сформулирую жёстко.

При `transform: scale()` layout сцены считается **один раз** в 1920×1080
логических пикселях. `font-size` в дереве остаётся тем, что написал автор
(например, 24px), метрики шрифта берутся для 24px, ширины глифов и точки
переноса вычисляются для 24px. Величина `k` в этот расчёт не входит вообще —
она применяется уже к готовым геометрическим боксам. Следовательно **переносы
строк физически не могут отличаться** между десктопом и телефоном. Это гарантия
уровня спецификации, а не «на практике работает».

Для сравнения, у `zoom` used value каждой длины домножается на масштаб *до*
layout, и спека прямо предупреждает про re-lay-out текста (цитаты в разделе 0) —
то есть 24px × 0.198 = 4.75px становится фактическим размером шрифта, метрики
округляются под него, и переносы поедут.

Внутренняя точность layout тоже играет за нас: Blink считает layout в
`LayoutUnit` = 1/64 CSS-пикселя
([WebKit wiki: LayoutUnit](https://trac.webkit.org/wiki/LayoutUnit) — там же
история перехода на 1/64), и раз входные данные при разном `k` одинаковы,
одинаков и результат округления.

**Две вещи, которые всё-таки могут порвать идентичность раскладки, и обе
находятся вне `transform`:**

1. **Text inflation / autosizing на мобильных.** MDN:

   > «Many mobile browsers apply a text inflation algorithm to enlarge text …
   > When an element containing text uses 100 % of the screen's width, the
   > algorithm increases its text size».
   > — [MDN: text-size-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/text-size-adjust)

   Это меняет `font-size` уже на стадии layout — ровно то, чего мы избегаем.
   Лечится обязательным `text-size-adjust: 100%` + `-webkit-text-size-adjust: 100%`
   в ресете сцены (значение `100%`, а не `none`: `none` сильнее ломает
   доступность и, по историческим отчётам, ведёт себя иначе при повороте экрана —
   [456bereastreet, 2010](https://www.456bereastreet.com/archive/201012/controlling_text_size_in_safari_for_ios_without_disabling_user_zoom/),
   [Kilian Valkhof: your CSS reset needs
   text-size-adjust](https://kilianvalkhof.com/2022/css-html/your-css-reset-needs-text-size-adjust-probably/)).
   MDN отмечает, что свойство до сих пор не Baseline и остаётся
   экспериментальным, поэтому писать обе записи — префиксную и нет.

2. **Разные шрифты.** Если шрифт не загрузился и сработал фолбэк, метрики другие
   → раскладка другая. Для идентичности шрифты обязаны быть self-hosted,
   с `font-display: block` или явным ожиданием `document.fonts.ready` перед
   стартом плеера. Иначе «идентичная раскладка» будет ломаться не географией
   экранов, а сетью.

### 1.6 GPU-текстуры и растеризация

Модель, из которой надо исходить: браузер решает масштаб растеризации слоя
собственной эвристикой, учитывая накопленную трансформацию до экрана; стандарта
на это нет ([csswg-drafts#236](https://github.com/w3c/csswg-drafts/issues/236)),
Chrome перерастеризует при смене масштаба, если не задан `will-change: transform`
([Chrome blog](https://developer.chrome.com/blog/re-rastering-composite)).

Следствия для нас:

- **Отмасштабированный контейнер не превращается в одну гигантскую текстуру.**
  Сам по себе `transform` на `.stage` не обязан создавать композиторский слой;
  слои получают те потомки, у которых есть своя причина (идущая анимация
  `transform`/`opacity`, `filter` и т. п.). Масштаб контейнера входит в
  накопленную матрицу каждого такого слоя (CTM, см. 1.7), и каждый слой
  растеризуется под свой фактический масштаб. То есть 15 анимированных элементов
  дадут 15 небольших текстур, а не одну текстуру 1920×1080. Это модель,
  выведенная из спеки и поведения Chrome, а не измерение — подтвердить в Layers
  panel (чек-лист 5.2).
- **Мыла не будет, если не мешать.** Никакого `will-change: transform` на
  `.stage`. Никакого `backface-visibility: hidden` / `translateZ(0)` «для
  ускорения» на контейнере — это тот же самый способ зафиксировать растр
  (для `backface-visibility` подтверждения актуального поведения на 2026 год
  найти не удалось — **не выяснено**, в спайк).
- **Память под текстуры на мобильном мала.** При `k ≈ 0.198` слои
  растеризуются примерно в `0.198 × DPR` от логического размера. Полноэкранный
  логический слой 1920×1080 на телефоне DPR 3 растеризуется как ~1140×641 — это
  дешевле, чем такой же слой на десктопе. То есть требование «60 fps на 380 px»
  в этой части подходу помогает, а не мешает.
- **`will-change` на 15 анимированных элементах — тоже плохо.** MDN:

  > «Excessive use of `will-change` will result in excessive memory use and will
  > cause more complex rendering to occur … `will-change` is intended to be used
  > as a last resort to try to deal with existing performance problems.»
  > — [MDN: will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)

  Элементы, анимируемые через CSS-анимацию/WAAPI по `transform`/`opacity`,
  Chrome и так поднимает на слой на время анимации. Ставить `will-change`
  статически в стилях — значит держать 15 текстур постоянно.
- **`filter` — не бесплатное «композиторское» свойство.** Инвариант 8 разрешает
  `filter`, но это не значит, что он такой же дешёвый, как `transform` и
  `opacity`. Рекомендация Chrome прямая: «Restrict animations to `opacity` and
  `transform` to keep animations on the compositing stage of the rendering path»,
  и отдельно про размытие: «Anything that involves a blur (like a shadow, for
  example) takes longer to paint than drawing a red box»
  ([web.dev: Animations guide](https://web.dev/articles/animations-guide)).
  `filter: blur()` — первый кандидат на срыв 60 fps при 4× троттлинге. Замерять
  отдельно и, возможно, ограничивать авторам.

### 1.7 Вложенные `transform`

Спека даёт ровно то, что нужно:

> «Transformations are cumulative. That is, elements establish their local
> coordinate system within the coordinate system of their parent.»
> — [CSS Transforms L1](https://drafts.csswg.org/css-transforms-1/)

Матрицы перемножаются (CTM собирается пост-умножением от предка к потомку), так
что `translateX(100px)` на элементе внутри сцены даёт смещение на 100 **логических**
пикселей — то есть визуально `100 × k`. Это именно то поведение, которое нам
нужно: анимация автора, записанная в логических координатах, одинаково выглядит
на всех экранах.

Проценты тоже безопасны:

> «A percentage for horizontal translations is relative to the width of the
> reference box.»
> — [CSS Transforms L1](https://drafts.csswg.org/css-transforms-1/)

Reference box — собственный бокс элемента, а он посчитан в логических пикселях и
от `k` не зависит. Значит `translate(-50%, -50%)` внутри сцены стабильно.

Подводные камни, которые есть:

- **Порядок записи.** Если writes `transform` контейнера идут в одну строку
  (`translate(...) scale(...)`), надо писать её целиком атомарно. Частичная
  перезапись даст потерю letterbox. Альтернатива — использовать отдельные
  свойства `translate` и `scale` (CSS Transforms L2), тогда resize пишет только
  в `scale`/`translate`, а анимации потомков не конфликтуют. Поддержка это
  позволяет: Chrome/Edge 104+, Firefox 72+, Safari 14.1+, Safari iOS 14.5+
  ([caniuse: css scale property](https://caniuse.com/mdn-css_properties_scale)).
  Порядок применения фиксирован спекой (`translate`, `rotate`, `scale`, затем
  `transform`), так что комбинировать их с `transform` на одном элементе надо
  осознанно.
- **3D и flattening.** `transform-style: preserve-3d` сбрасывается в `flat`,
  если на элементе есть `filter`, `opacity < 1`, `overflow` не `visible` и ряд
  других свойств. Поскольку мы анимируем `filter`, комбинация «3D-анимация +
  filter» внутри сцены будет вести себя не так, как ожидает автор. Точный
  актуальный список условий уплощения в этой сессии не проверен —
  **не выяснено**.
- **Потеря субпиксельной точности.** Позиции внутри сцены задаются в логических
  px; после умножения на `k` они попадают на дробные device px. Это нормально и
  даёт плавное движение, но означает, что «ровно 1 логический пиксель» — не
  единица позиционирования на телефоне. Округлять позиции анимаций до целых
  логических px бессмысленно; округлять до device px — вредно (дёрганое
  движение).
- **`transform` на контейнере меняет containing block.** MDN:

  > «If the property has a value different from `none`, a stacking context will
  > be created. In that case, the element will act as a containing block for any
  > `position: fixed;` or `position: absolute;` elements that it contains.»
  > — [MDN: transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)

  Для сцены это скорее плюс (абсолютное позиционирование внутри отсчитывается от
  сцены), но `position: fixed` внутри сцены перестаёт быть привязанным к
  вьюпорту. Значит любые оверлеи «на весь экран» (модалки, тултипы подсказок)
  должны жить **вне** `.stage`, иначе они отмасштабируются вместе со сценой и
  станут нечитаемыми на телефоне. То же касается `filter` и ряда других свойств
  ([MDN: Containing block](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block)).

### 1.8 Поля ввода и нативные контролы

У нас в продукте есть «вписать слово», значит `<input>` внутри сцены — реальный
сценарий, и это самое рискованное место всего подхода.

Главный вопрос — автозум iOS при фокусе на поле с `font-size` меньше 16px —
разобран по исходникам WebKit в разделе 3.4. Короткий ответ: **Safari смотрит на
computed (логический) `font-size`, а не на визуальный размер после `transform`**.
`<input>` с `font-size: 24px` внутри сцены, ужатой до `k ≈ 0.2`, автозума не
вызовет. Зеркальная ловушка — при `k > 1` поле с `font-size: 12px` автозум
вызовет, хотя визуально выглядит крупным. Правило «≥ 16px» соблюдается **в
логических пикселях сцены**, всегда.

Остальное:

- Каретка, выделение, «ручки» выделения текста и системная лупа рисуются
  системой, а не в дереве сцены. Как они позиционируются в отмасштабированном
  контейнере — **не выяснено**, проверять руками на устройстве.
- Выпадающие списки `<select>`, датапикеры и пр. рендерятся нативным попапом в
  системном масштабе — они не отмасштабируются. Это ожидаемо и, скорее, хорошо.
- WebKit при фокусе на поле **скроллит страницу**, чтобы поднять его над
  клавиатурой, даже если контейнер `position: fixed`. То есть сцена визуально
  «съедет». Обрабатывать через `visualViewport.offsetTop`, а не через пересчёт
  `k` (детали в 3.4).
- Открытие клавиатуры **не** меняет layout viewport на iOS, поэтому `k` не
  пересчитывается. На Android поведение исторически другое — там нужен явный
  `interactive-widget` в meta viewport (см. 3.4).
- Раз гейт останавливает всё (инвариант 4), скачок layout во время ввода не
  испортит синхронизацию с аудио — но испортит впечатление.

**Альтернатива, которую стоит рассмотреть на уровне продукта:** рендерить поля
ввода **вне** отмасштабированной сцены, в экранных координатах, поверх неё. Гейт
у нас и так — отдельный режим, в котором плеер остановлен и открыт интерактив;
логично, что в этот момент появляется UI в экранном масштабе, читаемый на
телефоне. Тогда сцена остаётся чистой геометрией 1920×1080, а формы — нормальным
адаптивным UI. Это архитектурное решение, а не техническое, и его стоит обсудить
до реализации.

---

## 2. Альтернативы

### 2.1 CSS `zoom`

**Статус.** `zoom` перестал быть нестандартным: он определён в
[CSS Viewport Module Level 1](https://drafts.csswg.org/css-viewport/#zoom-property)
и по данным MDN получил статус Baseline в мае 2024
([MDN: zoom](https://developer.mozilla.org/en-US/docs/Web/CSS/zoom)). Firefox
добавил поддержку в 126 ([caniuse: css-zoom](https://caniuse.com/css-zoom)),
Chrome 128 обновил старую нестандартную реализацию до спеки — «changes various
JavaScript APIs to align with the spec, changes zoom to apply to iframe content
documents, and changes it to apply to all inherited length properties (previously
it only changed the inherited font-size)»
([Chrome 128 release notes](https://developer.chrome.com/release-notes/128),
[Intent to Prototype and Ship, 03.02.2024](https://groups.google.com/a/chromium.org/g/blink-dev/c/W8j6RKDeRoM)).
Вместе с этим появился `Element.currentCSSZoom` — по MDN Baseline с марта 2026
([MDN: currentCSSZoom](https://developer.mozilla.org/en-US/docs/Web/API/Element/currentCSSZoom)).
Внимание: таблица caniuse по `css-zoom` смешивает легаси-`zoom` (Chrome с v4,
Safari с v4) со стандартизованным — на неё нельзя опираться, чтобы утверждать,
что везде одинаковое поведение.

**Зрелость на 2026 год.** «CSS Zoom» входит в список из 20 фокус-областей
Interop 2026 ([WebKit: Announcing Interop 2026,
12.02.2026](https://webkit.org/blog/17818/announcing-interop-2026/)). Попадание в
Interop означает, что расхождения между движками ещё не закрыты и над ними
работают прямо сейчас. Свежие правки идут и в WebKit: Safari 26.4 чинил
«performance and correctness issues with inheritance in the modern CSS Zoom
implementation»
([WebKit Features for Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/)).
Для фундамента продукта это плохой признак: мы бы строили основу раскладки на
свойстве, поведение которого сейчас активно выравнивают. `transform`, для
сравнения, в списке Interop 2026 отсутствует — потому что там выравнивать нечего.
Формулировка WebKit там же подтверждает разницу классов:

> «Unlike `transform: scale()`, which is purely visual, `zoom` changes how the
> element participates in layout.»

**Отличия от `transform: scale`, важные для нас:**

| | `transform: scale(k)` | `zoom: k` |
|---|---|---|
| Момент применения | после layout | во время layout |
| Переносы строк | не зависят от `k` | **могут отличаться** |
| Origin | `transform-origin`, по умолчанию центр | сверху/по центру, не настраивается |
| Анимируемость | да | по MDN — «not animatable» (в Safari TP 246 чинили анимируемость по computed value — см. [WebKit release notes](https://webkit.org/blog/18128/release-notes-for-safari-technology-preview-246/)) |
| `getBoundingClientRect` | учитывает | учитывает |
| `offsetWidth` / `clientWidth` | не учитывает | не учитывает (нужен `currentCSSZoom`) |

**Почему не берём.** Единственная причина, по которой `zoom` вообще
рассматривают в презентационных движках — текст остаётся «настоящим» текстом
нужного кегля и потому идеально резкий. Reveal.js этот путь прошёл до конца и
отказался; разбор их кода, коммитов и багов — в 3.1, это самая весомая часть
аргументации против `zoom`, потому что она эмпирическая. Но резкость мы и так получаем через
перерастеризацию (1.2), а платить за неё пришлось бы возможной перевёрсткой
текста — прямым нарушением главного требования. Нормативная фраза «zoom is
applied during layout (so text can re-lay-out)» закрывает вопрос.

Дополнительно: `zoom` меняет систему координат для JS-API неоднородно
(`getBoundingClientRect` учитывает, `offsetTop` нет —
[MDN: currentCSSZoom](https://developer.mozilla.org/en-US/docs/Web/API/Element/currentCSSZoom)),
что делает математику перетаскивания более хрупкой, а не менее. Исторические
баги того же рода: [WebKit bug 77998 «getBoundingClientRect() returns the
incorrect value on elements with the CSS zoom
property»](https://bugs.webkit.org/show_bug.cgi?id=77998).

### 2.2 Container query units (`cqw`, `cqh`)

**Статус.** Поддержка широкая: Chrome/Edge 105+, Safari 16+, Firefox 110+
([caniuse: css-container-query-units](https://caniuse.com/css-container-query-units)).

**Идея.** Объявить host контейнером (`container-type: size`) и писать всю сцену в
`cqw`: `left: 10cqw` вместо `left: 192px`, `font-size: 1.25cqw` вместо `24px`.
Тогда всё пропорционально размеру контейнера, и `transform` не нужен вовсе.

**Почему не берём.**

1. Это класс «во время layout». `font-size: 1.25cqw` при разных ширинах
   контейнера даёт разные фактические кегли → разные метрики → **переносы строк
   могут отличаться**. Гарантии идентичности нет ни на уровне спеки, ни на уровне
   практики.
2. Автор кладёт элементы мышью в пикселях. Пришлось бы конвертировать каждую
   координату в `cqw` и обратно при каждом чтении/записи проекта — лишний слой
   арифметики между редактором и схемой, при том что схема версионируется
   (инвариант 7).
3. `container-type: size` требует, чтобы размер контейнера не зависел от
   содержимого — то есть всё равно нужен явно заданный host. Выигрыша в простоте
   нет.
4. Каждое значение — вычисление на стадии layout, а не одна матрица на весь
   поддеревье. Для 15 анимированных элементов это заведомо дороже.

**Условно применимо** для оформления **вокруг** сцены (панель плеера, кнопки
управления), где адаптивность как раз желательна.

### 2.3 Корневой `font-size` + всё в `rem`/`em`

Механизм: `html { font-size: calc(...) }`, все размеры в сцене в `rem`.

**Почему не берём.** Тот же класс «во время layout», те же риски перевёрстки, но
дополнительно:

- `rem` привязан к **корневому** элементу документа — значит невозможно иметь на
  одной странице сцену в одном масштабе и редакторский UI в другом, а у нас в
  редакторе именно это и происходит. Пришлось бы городить `em`-каскад, который
  копит ошибки округления.
- Ломает пользовательскую настройку размера шрифта в браузере (мы жёстко
  задаём корневой кегль).
- Автор всё равно работает в пикселях → нужна конвертация, как в 2.2.
- Ничего не делает с координатами `left`/`top`, если только не переписать всё
  позиционирование в `rem` тоже — тогда каждый пиксель проекта проходит через
  деление и обратное умножение.

### 2.4 Viewport units + `calc()`

Механизм: `width: calc(var(--x) * 1vw / 19.2)` и т. п.

**Почему не берём.** Всё то же самое, что 2.2/2.3, плюс:

- `vw`/`vh` привязаны к вьюпорту, а не к контейнеру. В редакторе сцена показана
  в панели, размер которой к вьюпорту отношения не имеет → **прямое нарушение
  инварианта 5** (один рендер на редактор и плеер): пришлось бы иметь два разных
  набора стилей. Это одна из немногих альтернатив, которую отсекает не физика, а
  архитектура.
- На мобильных `vh` — отдельная головная боль (см. раздел про iOS).

### 2.5 SVG с `viewBox`

Механизм: `<svg viewBox="0 0 1920 1080">`, элементы сцены — SVG-примитивы,
масштабирование браузер делает сам.

**Плюсы, которые реальны:**

- Масштабирование действительно «бесплатное» и всегда векторное.
- Координаты в `viewBox` — ровно та логическая система, в которой работает автор.
- Hit-testing и `pointer-events` в SVG работают.
- `getScreenCTM()` даёт готовую матрицу для перевода экранных координат в
  координаты сцены — математика перетаскивания становится однозначной.

**Почему не берём:**

1. **Текст в SVG не переносится.** Автоматического переноса строк в SVG-тексте
   нет: атрибут `inline-size` из SVG 2 «doesn't wrap in any browsers and is not
   implemented», а `<textArea>` из SVG 1.2 из SVG 2 выкинут
   ([SVG 2: Text](https://svgwg.org/svg2-draft/text.html); обсуждение статуса —
   [svgwg#1087 «Drop inline-size attribute on text element from SVG2»,
   апрель 2026](https://lists.w3.org/Archives/Public/public-svg-issues/2026Apr/0022.html)).
   Значит любой абзац пришлось бы верстать `<tspan>`-ами вручную и самим считать
   переносы. Для продукта про **объяснения**, где текст — основной носитель
   смысла, это дисквалифицирует.
2. Чтобы получить нормальный HTML-текст и `<input>` внутри, нужен
   `<foreignObject>`, у которого «there are bugs and inconsistencies in browsers'
   implementations … so thorough testing is necessary»
   ([MDN: foreignObject](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/foreignObject)),
   и известны исторические проблемы именно в связке с `viewBox`
   ([www-svg, 2009](https://lists.w3.org/Archives/Public/www-svg/2009Aug/0012.html)).
   А `foreignObject` внутри отмасштабированного `viewBox` — это тот же самый
   масштабированный HTML, что и в базовом подходе, только с лишним слоем.
3. **Блокер, закрывающий вопрос: WebKit не масштабирует HTML внутри
   `<foreignObject>`** —
   [WebKit bug 23113](https://bugs.webkit.org/show_bug.cgi?id=23113), открыт около
   15 лет. Это не теория: единственный презентационный движок, построивший
   масштабирование на SVG `viewBox` — Marp/Marpit (логический слайд 1280×720,
   `<svg viewBox> > <foreignObject> > <section>`,
   [marpit.marp.app/inline-svg](https://marpit.marp.app/inline-svg)) — вынужден
   тащить полифил
   [`@marp-team/marpit-svg-polyfill`](https://github.com/marp-team/marpit-svg-polyfill),
   который на Safari читает `getScreenCTM()` и **вручную ставит `transform` на
   секцию**. То есть на WebKit «бесплатное масштабирование через SVG» всё равно
   вырождается в `transform: scale()`, только с лишним слоем абстракции и
   JS-полифилом. Отличная иллюстрация того, что мы бы получили в итоге.
3. Инструментарий: React-редактор, CSS-анимации, обычные UI-компоненты внутри
   сцены — всё это придётся переписывать под SVG.

**Условно берём** — для отдельных графических элементов сцены (иконки, схемы,
стрелки) SVG внутри HTML-сцены остаётся правильным выбором. Не как контейнер
сцены.

### 2.6 Canvas

**Не берём**, и вот чем именно платит тот, кто откажется:

- **Доступность.** Содержимое canvas не существует в дереве доступности:
  «canvas content is not exposed to accessibility tools like semantic HTML»,
  и весь fallback-DOM читается ассистивной технологией как единый кусок текста
  без геометрии. Механизм, который должен был это решить — `addHitRegion()` —
  в браузерах не прижился
  ([MDN: Hit regions and
  accessibility](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Hit_regions_and_accessibility),
  [W3C wiki: Canvas hit testing](https://www.w3.org/wiki/Canvas_hit_testing),
  [TPGi: HTML5 Canvas Accessibility](https://www.tpgi.com/html5-canvas-accessibility-in-firefox-13/)).
- **Интерактив пишется руками.** Hit-testing, фокус, клавиатурная навигация,
  порядок табуляции, состояния hover/active — всё, что браузер даёт бесплатно,
  надо реализовать. У нас интерактив — суть продукта.
- **Текст.** Ни выделения, ни копирования, ни поиска по странице, ни переноса
  строк (`fillText` не переносит), ни автоматической подстановки шрифтовых
  фолбэков с одинаковыми метриками.
- **Ввод.** `<input>` в canvas не существует — нужен наложенный DOM-элемент, то
  есть гибрид, то есть все проблемы обоих подходов сразу.
- **Инвариант 5** формально соблюсти можно (один рендер), но редактор потеряет
  возможность использовать DOM-инспектор, а мы — DevTools для отладки сцены.

Единственное, что canvas даёт взамен — детерминированный контроль над каждым
пикселем и предсказуемая производительность при тысячах объектов. У нас 15.

---

## 3. Практика

### 3.1 Как это делают презентационные движки

У reveal.js, Slidev, Spectacle и impress.js ровно наша задача: слайд фиксированного
логического размера на любом экране. Все четыре пришли к одному и тому же.

| Движок | Логический размер | Механизм |
|---|---|---|
| reveal.js 6.0.1 | 960×700 (конфиг) | `transform: translate(-50%,-50%) scale(s)` |
| Slidev | 980×552 | `transform: translate(-50%,-50%) scale(s)` |
| Spectacle | 1366×768 | `transform: scale(s)` + вычисленный `transform-origin` |
| impress.js | 1920×1080 | `transform: scale(s)` на root |
| deck.js | нет (только вниз) | `transform: scale(s)` |
| Marp / Marpit | 1280×720 | SVG `viewBox` + `foreignObject` |

**reveal.js — главный кейс, потому что он через `zoom` прошёл и от него ушёл.**

Формула в `layout()`
([js/reveal.js#L836-L841, v6.0.1](https://github.com/hakimel/reveal.js/blob/6.0.1/js/reveal.js#L836-L841)):

```js
scale = Math.min( size.presentationWidth / size.width, size.presentationHeight / size.height );
scale = Math.max( scale, config.minScale );   // minScale: 0.2
scale = Math.min( scale, config.maxScale );   // maxScale: 2.0
```

Опции по [revealjs.com/presentation-size](https://revealjs.com/presentation-size/):
`width: 960`, `height: 700`, `margin: 0.04`, `minScale: 0.2`, `maxScale: 2.0`,
`disableLayout: false`, `embedded: false`
([js/config.ts#L855-L860](https://github.com/hakimel/reveal.js/blob/6.0.1/js/config.ts#L855-L860)).
`margin` вычитается не из логического слайда, а из доступного вьюпорта до
деления.

В 6.x **переключателя `zoom`/`transform` больше нет** — всегда `transform`,
а `style.zoom = ''` осталось только как сброс легаси
([js/reveal.js#L843-L861](https://github.com/hakimel/reveal.js/blob/6.0.1/js/reveal.js#L843-L861)).
До 4.4.0 логика была такая (обратите внимание — `zoom` применялся при масштабе
**больше** единицы, а не меньше):

```js
// Zoom Scaling
// Content remains crisp no matter how much we scale. Side
// effects are minor differences in text layout and iframe
// viewports changing size.
if( scale > 1 && Device.supportsZoom && window.devicePixelRatio < 2 ) { ... }
// Transform Scaling
// Content layout remains the exact same when scaled up.
// Side effect is content becoming blurred ...
else { ... }
```
— [js/reveal.js#L892-L926, v4.3.1](https://github.com/hakimel/reveal.js/blob/4.3.1/js/reveal.js#L892-L926)

Комментарий в их коде — независимое подтверждение нашего разбора из раздела 0:
у `zoom` «side effects are **minor differences in text layout**», у `transform` —
«content layout remains **the exact same**». Мы формулируем ту же разницу, только
для нас «minor differences in text layout» — не побочный эффект, а
дисквалификация.

Причина отказа зафиксирована дословно:

> «always use css transforms for presentation scaling (zoom has too many quirks
> even if it is slightly sharper on ldpi displays)»
> — [commit e281b32, 31.03.2022](https://github.com/hakimel/reveal.js/commit/e281b3234e)

> «Stop using `zoom` for presentation scaling. Zoom produced sharper upsizing
> than CSS transforms but it's a non-standard CSS property with a few too many
> quirks.»
> — [release notes 4.4.0, 17.10.2022](https://github.com/hakimel/reveal.js/releases/tag/4.4.0)

Конкретные «quirks», которые их к этому привели, — ровно те, что нас волнуют:

- [#3208](https://github.com/hakimel/reveal.js/issues/3208) (2022): при `zoom`
  ломались координаты мыши в интерактивных графиках (Plotly), `scale()` работал
  правильно. **Это прямое подтверждение проблемы hit-областей у `zoom`.**
- [#1549](https://github.com/hakimel/reveal.js/issues/1549) (2016): в Edge при
  `zoom < 0.846` полностью исчезали фоновые изображения; `transform: scale()`
  рисовал корректно.

Обратная сторона, о которой честно надо знать — у `transform` в трекере reveal.js
тоже есть свои открытые баги, и они прямо релевантны нашему критерию резкости:

- [#3644](https://github.com/hakimel/reveal.js/issues/3644) (19.06.2024, open):
  одна и та же презентация в Safari 17.5 заметно хуже по чёткости текста и
  картинок, чем в Chromium 126 при том же размере окна; Firefox 127 —
  нормально. **Значит наше «браузер перерастеризует и всё резко» проверено для
  Chrome, но для WebKit требует отдельного замера.**
- [#2663](https://github.com/hakimel/reveal.js/issues/2663) (2020, open): в
  Firefox достаточно `transform: translateX(0)` на заголовке, чтобы текст стал
  мылить — то есть дело не в величине масштаба, а в самом факте попадания на
  композиторский слой.
- [#1879](https://github.com/hakimel/reveal.js/issues/1879) (2017, open): в
  Safari текст «дёргает» вес по завершении перехода — субпиксельное сглаживание
  выключается на слое и включается обратно. Лечится
  `-webkit-font-smoothing: antialiased` (то есть принудительным отказом от
  субпиксельного сглаживания вообще). Это подтверждает наблюдение из 1.2 и даёт
  готовое лекарство.
- [#1643](https://github.com/hakimel/reveal.js/issues/1643) (open): `iframe`
  внутри отмасштабированного слайда масштабируется вместе с ним, зафиксировать
  нативный размер нельзя. Нам это важно, если внутрь сцены когда-нибудь попадёт
  встроенный контент.

**Slidev** интересен готовым приёмом, который нам пригодится: он публикует
масштаб наружу как CSS-переменную и «размасштабирует» ею оверлеи, которые должны
остаться в системном размере:

```css
.slidev-slide-content { transform: translate(-50%, -50%) scale(var(--slidev-slide-scale)); }
.rough-annotation      { transform: scale(calc(1 / var(--slidev-slide-scale))); }
```
— [SlideContainer.vue](https://github.com/slidevjs/slidev/blob/5734783153be6bb4711d989a14e6a024a17d0d22/packages/client/internals/SlideContainer.vue#L46-L50),
[styles/index.css](https://github.com/slidevjs/slidev/blob/main/packages/client/styles/index.css#L120-L136),
[доки: Canvas Size](https://sli.dev/features/canvas-size).
Размер контейнера он меряет через `useElementSize` (то есть `ResizeObserver`) —
совпадает с нашим выводом в 3.2.

**impress.js** добавляет деталь для 3D: при масштабировании он делит
`perspective` на масштаб, иначе 3D-сцена «едет»
([src/impress.js#L380-L386](https://github.com/impress/impress.js/blob/4edb9e08a04934c9c30ef8ddafe5a49b2dc686c0/src/impress.js#L380-L386)).
Если мы когда-нибудь введём в сцену `perspective` — это готовая ловушка с готовым
решением.

**Marp/Marpit** — единственный, кто пошёл через SVG `viewBox` вместо
`transform`, и его опыт закрывает вопрос по альтернативе 2.5 окончательно
(см. там же).

**Google Slides** — механизм рендеринга публично не документирован,
**не выяснено**. **Figma** к нашему вопросу отношения не имеет: у них не DOM
вообще, а собственный рендерер на WebGL
([Building a professional design tool on the
web](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/)).

**Что мы забираем из чужого опыта:**

1. Формула `min()` + клампы `minScale`/`maxScale` — проверенная временем. Клампы
   стоит взять: они защищают от вырожденных случаев (окно 100 px, огромный
   монитор).
2. Отказ от `zoom` — не наше изобретение, а вывод, к которому пришёл проект с
   десятилетней историей и реальной пользовательской базой.
3. Публиковать `k` в CSS-переменную — дешёвый и полезный приём для оверлеев.
4. В `master` reveal.js появилось округление масштаба до сотых
   (`scale = Math.round( scale * 100 ) / 100`,
   [js/reveal.js#L842](https://github.com/hakimel/reveal.js/blob/master/js/reveal.js#L842)).
   Зачем — в коммите не объяснено, но эффект очевиден: меньше различных значений
   масштаба → меньше поводов для перерастеризации и больше шансов на
   детерминированный растр. Для нас это ещё и способ стабилизировать скриншотные
   тесты. Цена — letterbox перестаёт быть пиксель-точным. Кандидат в эксперимент
   спайка.

### 3.2 Пересчёт `k` при изменении размера

**Чем слушать.** `ResizeObserver` на host-элементе, не `window.resize`.
Причины:

- В редакторе сцена живёт в панели, размер которой меняется без изменения
  размера окна (перетаскивание сплиттера, схлопывание инспектора). `window.resize`
  этого просто не увидит — а инвариант 5 требует одного и того же кода в обоих
  местах.
- `ResizeObserver` отдаёт готовый размер в колбэк и вызывается между layout и
  paint, что избавляет от layout thrashing: «ResizeObserver callbacks are
  processed before paint and after layout»
  ([web.dev: ResizeObserver](https://web.dev/articles/resize-observer),
  [MDN: ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver),
  [CSSWG explainer](https://drafts.csswg.org/resize-observer-1/explainer)).

**Дебаунс не нужен и вреден.** `ResizeObserver` и так коалесцирует изменения по
кадрам, а вся наша работа в колбэке — записать одну строку в `style.transform`.
Дебаунс даст видимое «отставание» сцены от рамки окна при перетаскивании.
Единственное, что стоит сделать — не писать значение, если оно не изменилось.

**Правило против бесконечного цикла.** Наблюдать надо **host**, а писать
`transform` — на **`.stage`**, который вложен в host и на его размер не влияет.
Наблюдать элемент, который сам же и меняешь — прямой путь к
`ResizeObserver loop completed with undelivered notifications`.

**Сломает ли пересчёт идущую анимацию.** Нет, и по трём причинам:

1. Анимации живут на потомках, а мы меняем матрицу предка. Матрицы
   перемножаются (1.7), анимация потомка ничего не знает о `k` и не
   перезапускается.
2. Инвариант 1 соблюдён: время берётся из аудио, resize к времени не
   прикасается. Пересчёт `k` — это чисто визуальная операция.
3. Инвариант 2 тоже: таймлайну на resize мы ничего не сообщаем.

Что **может** произойти — одноразовый скачок: смена масштаба вызывает
перерастеризацию слоёв
([Chrome blog](https://developer.chrome.com/blog/re-rastering-composite)),
и на слабом устройстве это может стоить кадра-двух. При перетаскивании рамки
окна это неважно; при повороте телефона — заметно. Мерить в спайке.

**Чего не делать:** не анимировать переход между старым и новым `k` (см. 1.2 —
во время анимации масштаба текст размывается) и не менять `k` в rAF-цикле
плеера — это не задача цикла отрисовки кадра.

### 3.3 Скриншотные тесты

Проблема очевидна: если `k` дробный и зависит от размера окна, эталонные
скриншоты станут недетерминированными на уровне антиалиасинга.

Официальная документация Playwright формулирует базовое условие прямо:

> «Browser rendering can vary based on the host OS, version, settings, hardware,
> power source (battery vs. power adapter), headless mode, and other factors. For
> consistent screenshots, run tests in the same environment where the baseline
> screenshots were generated.»
> — [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)

То есть первично — контейнеризованное окружение с зафиксированной версией
браузера и шрифтами. Всё остальное — сверху:

- **Фиксировать `deviceScaleFactor: 1` и `scale: 'css'`** в конфиге. Разные
  CI-раннеры дают разный DPR, и это напрямую даёт различия в субпиксельном
  рендеринге текста; явное задание нормализует
  ([Playwright visual regression, обзор практик,
  2026](https://bug0.com/knowledge-base/playwright-visual-regression-testing),
  [Lessons From My 428-Day Battle Against Flaky Playwright
  Screenshots](https://turntrout.com/playwright-tips)).
- **Выбирать вьюпорты, на которых `k` — «хорошее» число.** 1920×1080 → `k = 1`;
  960×540 → `k = 0.5`; 480×270 → `k = 0.25`. На таких масштабах растр ложится на
  сетку и различия между запусками минимальны. Дробный `k` (380 px, `k ≈ 0.1979`)
  тестировать скриншотом можно, но с допуском по пикселям, а не строгим
  сравнением.
- **Отдельно снимать сцену без letterbox.** Снимать не всю страницу, а
  `.stage` — тогда чёрные поля и центрирование не попадают в диф.
- **Гвоздить шрифты.** Self-hosted, ждать `document.fonts.ready`. Шрифтовой
  фолбэк — самая частая причина «поехавших» эталонов.
- **Останавливать анимации.** Раз время у нас берётся из аудио (инвариант 1),
  скриншотный тест должен уметь выставить конкретную позицию и заморозить сцену
  детерминированно — это, кстати, хороший побочный тест самой архитектуры.

Отдельный тест, который стоит написать сразу и который прямо проверяет главное
требование: **отрендерить одну и ту же сцену при `k = 1` и при `k = 0.25`,
уменьшить первый скриншот до размера второго и сравнить с допуском.** Если
раскладка идентична, различия будут только в антиалиасинге. Если где-то поехал
перенос строки — тест это поймает. Такой тест — прямая проверка требования, а не
косвенная.

### 3.4 iOS Safari

Самая враждебная платформа из наших. Разбор по пунктам.

#### Откуда брать размер: `vh`, `dvh`, `svh` — ни то, ни другое

`sv*`/`lv*`/`dv*` поддерживаются с Safari 15.4
([WebKit blog, 14.03.2022](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/),
[caniuse: viewport-unit-variants](https://caniuse.com/viewport-unit-variants)).
Но ни один из них нам не подходит:

- `100vh` = large viewport → выше видимой области, пока тулбар развёрнут.
- `100dvh` — визуально правильный, но обновляется рывками:
  «The values for the dynamic viewport do not update at 60fps. In all browsers
  updating is throttled as the UA UI expands or retracts»
  ([web.dev: viewport units](https://web.dev/blog/viewport-units)). Значит `k`
  будет прыгать ступеньками при сворачивании тулбара — сцена «задышит».
- `100svh` — стабилен, но оставляет полосу снизу.

Плюс исторические баги: `lvh`/`vh` неверно считались относительно small viewport
**в SFSafariViewController** — починено только в Safari 26.0
([WebKit Features in Safari 26.0, 15.09.2025](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
А плеер, скорее всего, будут открывать из мессенджера, то есть именно в in-app
браузере.

**Вывод: размер не брать из CSS-единиц вообще.** Хост — `position: fixed;
inset: 0` (это буквально layout viewport), а `k` считать из измеренного
`ResizeObserver`-ом размера этого элемента. Это ровно то же решение, что в 3.2,
просто на iOS у него нет альтернатив.

#### Meta viewport и safe-area

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

`viewport-fit=cover` отключает автоматическое вписывание контента в safe area
([WebKit: Designing Websites for iPhone X,
22.09.2017](https://webkit.org/blog/7929/designing-websites-for-iphone-x/);
[MDN: meta name=viewport](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport)).
`env(safe-area-inset-*)` поддерживается с Safari iOS 11. Для нас safe area —
это про рамку вокруг сцены (кнопки плеера), а не про саму сцену: letterbox и так
даёт поля.

**`interactive-widget`** (`resizes-visual` / `resizes-content` /
`overlays-content`) управляет тем, что происходит при появлении экранной
клавиатуры. В WebKit он **реализован, но выключен по умолчанию** — в
`UnifiedWebPreferences.yaml` настройка `MetaViewportInteractiveWidgetEnabled`
имеет `status: testable` и `defaultValue: false`
([WebKit standards-position #65, «Needs position», открыт
21.09.2022](https://github.com/WebKit/standards-positions/issues/65)). В Chrome
поддержан с 108, в Firefox с 133. Практический вывод: на iOS мы всё равно
получаем поведение `resizes-visual` (см. ниже), но **на Android его стоит
запросить явно**, иначе Chrome может ресайзить ICB и пересчитывать наш `k` при
открытии клавиатуры.

#### Пинч-зум

`user-scalable=no` и `maximum-scale=1` iOS для **пользовательского** зума
игнорирует с iOS 10 — MDN помечает все три атрибута примечанием «iOS 10+ ignores
it by default»
([MDN: meta name=viewport](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport)).
В коде это `m_forceAlwaysUserScalable` в
[`ViewportConfiguration.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/ViewportConfiguration.cpp),
который расширяет диапазон до `[min(configured,1), max(configured,5)]`.

Для нас это **хорошая новость**:

- Пинч меняет только visual viewport. Layout viewport, `vw/vh`,
  `window.innerWidth/innerHeight` не меняются
  ([MDN: Viewport concepts, обновлено 09.03.2026](https://developer.mozilla.org/en-US/docs/Web/CSS/CSSOM_view/Viewport_concepts)).
  Значит **`k` не пересчитывается**, сцена просто увеличивается целиком —
  ровно как зум видео.
- Минимальный масштаб зажат единицей → отзумить меньше 1 нельзя, «дырок» по краям
  не будет.
- WebKit перерастеризует слои под новый page scale
  (`GraphicsLayerCA::updateContentsScale()`), так что после жеста текст остаётся
  чётким.
- Сбросить зум из JS штатно нельзя: у `VisualViewport` все свойства read-only.

#### Автозум на `<input>` — вопрос закрыт

Это был главный риск, и он разрешается в пользу нашего подхода.

Порог 16px реальный и живёт в
[`WKWebViewIOS.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm):

```objc
const double webViewStandardFontSize = 16;
scale = clampTo<double>(webViewStandardFontSize / fontSize, minimumScale, maximumScale);
```

Откуда берётся `fontSize` — из `WebPageIOS.mm`:

```cpp
information.nodeFontSize = protect(renderer->style())->fontDescription().computedSize();
```

А `computedSize()` в `FontDescription.h` описан так:

```cpp
float m_computedSize { 0 }; // Computed size adjusted for the minimum font size and the zoom factor.
```

Это **computed CSS `font-size`**: он учитывает CSS `zoom`, но не учитывает
`transform` предков — трансформация вообще не участвует в вычислении стиля.
Значит:

- **`font-size: 24px` в логических координатах сцены не вызовет автозум**, даже
  если визуально это 5 px. Правило «≥ 16px» относится к тому, что написано в
  стилях сцены, а не к тому, что видит глаз.
- **Зеркальная ловушка:** если `k > 1` (большой монитор), поле с
  `font-size: 12px` выглядит крупно, но автозум **сработает** — 16/12 = 1.33×.
  То есть на десктопе с большим окном мы можем словить автозум там, где визуально
  всё в порядке. Порог должен соблюдаться в логических пикселях всегда.
- **Ещё один аргумент против `zoom`:** `zoom` входит в `computedSize()`, значит
  при `zoom: 0.2` тот же `<input>` стал бы 4.8px и **автозум бы сработал**.

Автозум к тому же работает только на iPhone-идиоме
(`currentUserInterfaceIdiomIsSmallScreen()` в
[`WKContentViewInteraction.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm)),
на iPad его нет.

Обходные пути, если порог всё же придётся нарушить, — из того же вызова:
`user-scalable=no` в meta гасит именно автозум (через
`allowsUserScalingIgnoringAlwaysScalable()`), при этом пользовательский пинч
остаётся жив благодаря `forceAlwaysUserScalable`; `maximum-scale=1` даёт тот же
эффект через кламп. Независимое подтверждение техники «логические 16px +
визуальное уменьшение трансформацией» —
[Jeffery To, 02.11.2018](https://thingsthemselves.com/no-input-zoom-in-safari-on-iphone-the-pixel-perfect-way/).

**Оговорка честности.** Это вывод из чтения исходников WebKit `main` на
2026-07-27, а не эксперимент на устройстве. В сети встречаются утверждения
обратного («16px под `scale(0.9)` даёт 14.4px и всё-таки зумит»), но они без
первоисточников и противоречат коду. Проверка на реальном iPhone остаётся в
чек-листе спайка — это слишком важно, чтобы принимать по чтению кода.

**Отдельно:** даже без зума WebKit при фокусе **скроллит** страницу, чтобы
открыть поле над клавиатурой (константы `minimumHeightToShowContentAboveKeyboard`,
`caretOffsetFromWindowEdge` в `_zoomToFocusRect`). Это сработает даже при
`position: fixed` контейнере — то есть сцена визуально «съедет» вверх.

#### Клавиатура

На iOS клавиатура ужимает **только visual viewport**; layout viewport и ICB не
меняются, значит `window.innerHeight`, `100vh`, `100dvh`, media queries остаются
прежними
([MDN: Viewport concepts](https://developer.mozilla.org/en-US/docs/Web/CSS/CSSOM_view/Viewport_concepts);
[explainer «viewport-resize-behavior»](https://github.com/bramus/viewport-resize-behavior/blob/main/explainer.md)).

Для нас это значит: **`k` при появлении клавиатуры на iOS не пересчитывается** —
сцена не прыгает. Но она и не сдвигается, поэтому поле может уехать под
клавиатуру, WebKit сам проскроллит, и `visualViewport.offsetTop` станет > 0.
Правильная реакция: **не** трогать `k`, а компенсировать сдвиг отдельно (или
поднимать поле ввода средствами сцены).

Актуальная регрессия: на iOS 26 `visualViewport.offsetTop` не сбрасывается в 0
после закрытия клавиатуры, а `height` остаётся меньше `innerHeight`
([Apple Developer Forums, thread 800125, сентябрь 2025,
FB19889436](https://developer.apple.com/forums/thread/800125)). Значит слепо
доверять `visualViewport` нельзя, нужен sanity-check.

#### Поворот экрана

- `VisualViewport` поддержан с Safari iOS 13; события `resize`, `scroll`;
  `scrollend` в Safari нет
  ([MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)).
- `window.innerWidth/innerHeight` после поворота могут врать — открытый с 2017
  года баг, последнее обновление 21.03.2025, статус NEW:
  [WebKit bug 170595](https://bugs.webkit.org/show_bug.cgi?id=170595). Касается
  WKWebView / in-app браузеров, не самого Safari — но именно там нас и откроют.
  **Значит читать `innerHeight` синхронно в обработчике `orientationchange`
  нельзя.**
- **Зафиксировать ориентацию нельзя:** `ScreenOrientation.lock()` / `unlock()`
  в Safari не поддержаны (сам `ScreenOrientation` — с Safari iOS 16.4). То есть
  «показывать плеер только в landscape» — не вариант, надо жить с портретом.

#### Композитинг: что реально ограничивает нас на iOS

Из [`GraphicsLayerCA.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/ca/GraphicsLayerCA.cpp)
(ветка `main`, 2026-07-27) — три числа, которые стоит запомнить:

```cpp
#if PLATFORM(IOS_FAMILY)
static const int cMaxPixelDimension = 1280;
static const int cMaxPixelDimensionLowMemory = 1024;
#else
static const int cMaxPixelDimension = 2048;
#endif
```

`requiresTiledLayer()` сравнивает с этим порогом `m_size * pageScaleFactor`, где
`m_size` — размер слоя **в собственных координатах**, то есть 1920×1080 **до**
нашего `scale(k)`. Вывод, который надо принять: **любой рисующий слой размером во
всю сцену на iOS гарантированно становится tiled-слоем**, сколько бы мы его
визуально ни ужимали. Практическое правило: не делать одного огромного
painted-слоя на всю сцену — дробить фон на части либо использовать сплошную
заливку без рисования.

```cpp
// Don't let a single tiled layer use more than 156MB of memory.
static const unsigned cMaxScaledTiledLayerMemorySize = 1024 * 1024 * 156;
...
contentsScaleLimitingFactor = clampTo(contentsScaleLimitingFactor, 0.05f, 1.0f);
```

Если слой не влезает в бюджет, WebKit **сам снижает масштаб растеризации, вплоть
до 0.05×**. То есть на iOS размытие может прийти не от нашего `will-change`, а от
бюджета памяти — и мы на это никак не влияем декларативно. Ещё один довод не
делать больших painted-слоёв.

```cpp
static const unsigned cMaxLayerTreeDepth = 128;
static const unsigned cMaxTotalBackdropFilterArea = 1242 * 2208 * 10;
```

Глубина дерева слоёв ограничена 128, и есть **общий бюджет площади под
`backdrop-filter`**. Это прямо касается инварианта 8: он ставит `filter` в один
ряд с `transform` и `opacity`, но по стоимости это разные вещи. Стоит подумать
об уточнении формулировки инварианта — либо разрешать `filter` с оговоркой, либо
явно запретить `backdrop-filter`.

Утверждение «iOS Safari растрирует все слои, а не только видимые, и это даёт
сотни мегабайт» встречается в блогах, но в исходниках и в архивной вики WebKit
подтверждения не имеет — **фольклор**, не опираемся.

#### Fullscreen на iPhone — нет

- MDN BCD для `Element.requestFullscreen()`: `safari_ios` 16.4,
  `partial_implementation: true`, примечание: **«Only available on iPad, not on
  iPhone. Shows an overlay button which cannot be disabled»**
  ([MDN: requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)).
- caniuse подтверждает то же вплоть до iOS Safari 26.5
  ([caniuse: fullscreen](https://caniuse.com/fullscreen)).
- В релиз-нотах WebKit 26.0 / 26.2 / 26.3 / 26.4 изменений для iPhone нет.

**Значит режим «на весь экран» на iPhone мы строим сами:** `viewport-fit=cover`
+ `position: fixed; inset: 0` + обработка динамического тулбара. Вариант с PWA
(«На экран Домой», `display: standalone`) — **не выяснено**, отдельный вопрос.

---

## 4. Вердикт

### 4.1 Что берём

**Логическая сцена 1920×1080 в обычном DOM + `transform: translate(X,Y) scale(k)`
на контейнере, `transform-origin: 0 0`, `k = min(hostW/1920, hostH/1080)`,
letterbox-центрирование, пересчёт по `ResizeObserver` на host.**

Причина ровно одна и она формулируется в одну строку: это **единственный** из
рассмотренных механизмов, для которого спецификация гарантирует, что layout не
зависит от масштаба. Всё остальное — резкость, производительность, простота —
приятные следствия, но решает именно гарантия идентичности.

Обязательные правила, без которых подход разваливается:

1. `will-change: transform` на `.stage` — **запрещено**. И `translateZ(0)`,
   и `backface-visibility: hidden` на нём же.
2. Все размеры и координаты внутри сцены — только `px`. Никаких `%`, `vw`, `vh`,
   `rem`, `cqw` внутри `.stage`.
3. `text-size-adjust: 100%` + `-webkit-text-size-adjust: 100%` в ресете сцены.
4. Шрифты self-hosted, старт плеера — после `document.fonts.ready`.
5. Обратное преобразование координат — только через
   `stage.getBoundingClientRect()`, никогда через хранимый `k`.
6. `position: fixed` оверлеи — вне `.stage`.
7. Масштаб `k` не анимируется.
8. Хост — `position: fixed; inset: 0`, размер меряется `ResizeObserver`-ом.
   Никаких `vh`/`dvh`/`svh`/`window.innerHeight` в вычислении `k`.
9. `<input>` внутри сцены — `font-size ≥ 16px` **в логических пикселях**, всегда,
   при любом `k`. (Или поля выносятся из сцены в экранный слой — см. 1.8.)
10. Meta: `width=device-width, initial-scale=1, viewport-fit=cover`; для Android
    дополнительно явный `interactive-widget`.
11. Не создавать одного рисующего слоя во всю сцену — на iOS он гарантированно
    уходит в тайлинг и может быть автоматически размыт бюджетом памяти (3.4).

Эти одиннадцать правил — кандидаты в ADR: они ограничивают то, что можно писать
в стилях сцены, а значит должны быть зафиксированы письменно, а не жить в голове.

### 4.2 По каждой альтернативе

| Вариант | Решение | Почему |
|---|---|---|
| `transform: scale()` на контейнере | **берём** | Единственный, где layout не зависит от `k` (спека css-transforms-1). |
| CSS `zoom` | **не берём** | Спека: «zoom is applied during layout (so text can re-lay-out)». Прямо нарушает требование идентичности. Плюс: входит в Interop 2026 (расхождения ещё не закрыты), ломает координаты мыши ([reveal.js#3208](https://github.com/hakimel/reveal.js/issues/3208)), и reveal.js от него ушёл осознанно в 4.4.0. Ещё: `zoom` входит в computed `font-size`, а значит включает автозум iOS на полях ввода (3.4). |
| Container query units (`cqw`/`cqh`) | **не берём** для сцены; **условно** для UI вокруг сцены | Класс «во время layout» → риск перевёрстки; требует конвертации координат автора. |
| Корневой `font-size` + `rem` | **не берём** | То же + `rem` глобален, а редактору нужен свой масштаб; ломает пользовательские настройки шрифта. |
| Viewport units + `calc()` | **не берём** | То же + привязка к вьюпорту делает невозможным один рендер для редактора и плеера (нарушение инварианта 5). |
| SVG `viewBox` как контейнер сцены | **не берём** как контейнер; **условно** как элемент внутри сцены | В SVG нет переноса строк (`inline-size` не реализован ни в одном браузере); WebKit не масштабирует HTML в `<foreignObject>` ([bug 23113](https://bugs.webkit.org/show_bug.cgi?id=23113)), из-за чего Marpit вынужден полифилом ставить `transform` вручную — то есть на Safari SVG-путь всё равно приходит к `transform: scale()`. |
| Canvas | **не берём** | Нет доступности, весь интерактив и весь текст — вручную, `<input>` невозможен. |

### 4.3 Что это решение запрещает

Это цена, которую платим сознательно. Каждый пункт — то, чего мы больше **не
сможем** сделать без нового ADR.

- **Никакой адаптивной раскладки.** Ни брейкпоинтов, ни `@media`, ни
  «на телефоне переставим элементы в колонку». Внутри сцены медиазапросов нет
  вообще. Если для мобильных потребуется другая композиция — это будет отдельный
  проект сцены, а не отдельная вёрстка.
- **Никакой перевёрстки текста под экран.** Абзац, который на десктопе занимает
  три строки, займёт три строки везде. Если перевод на другой язык длиннее — он
  вылезет из бокса одинаково на всех устройствах. Спасать будет только автор,
  вручную, в редакторе.
- **Ограничение по читаемости.** На 380 px всё уменьшается в ~5 раз. Логический
  текст мельче ~32 px на телефоне физически нечитаем. Это становится правилом
  дизайна сцен, а не багом.
- **Конфликт с WCAG 1.4.10 Reflow и 1.4.4 Resize Text.** Фиксированная раскладка
  по определению не выполняет требование «контент перекомпоновывается без
  горизонтальной прокрутки при увеличении до 400 %»
  ([W3C: Understanding Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)).
  **Хуже того: браузерный зум страницы наш подход полностью нейтрализует.**
  Зум в 200 % уменьшает вьюпорт в CSS-пикселях вдвое (1920 → 960), значит `k`
  тоже уменьшается вдвое, значит физический размер сцены на экране не меняется
  вообще. Пользователь жмёт Ctrl + «+» и не получает ничего. Работать будет
  только pinch-zoom (визуальный вьюпорт не меняет layout viewport). Это надо
  принять явно и компенсировать отдельным текстовым представлением
  (транскрипт) — что у нас и так есть по инварианту 10. Проверить это поведение
  экспериментом обязательно (см. чек-лист 5.4).
- **Никакого `position: fixed` внутри сцены.** Контейнер с `transform` становится
  containing block для fixed-потомков.
- **Никаких относительных единиц внутри сцены.** `%`, `vw`, `vh`, `rem`, `em`,
  `cqw` внутри `.stage` — запрещены, потому что вводят зависимость layout от
  размера окна. Единственное исключение — `%` в `transform: translate()`, который
  считается от собственного бокса элемента.
- **Никаких «умных» оптимизаций композитора на контейнере.** `will-change`,
  `translateZ(0)`, `backface-visibility: hidden` на `.stage` запрещены — они
  фиксируют растр и превращают текст в мыло.
- **`k` нельзя анимировать.** Ни плавного перехода при повороте, ни зум-эффектов
  на самом контейнере сцены. Зумить можно только внутренние элементы.
- **Мобильная сцена — это полоска 16:9 в letterbox.** Не «на весь экран». Мы
  сознательно ведём себя как видеоплеер.
- **Никакого настоящего фуллскрина на iPhone.** Fullscreen API там нет и не
  предвидится (3.4), а `ScreenOrientation.lock()` в Safari не поддержан — значит
  нельзя ни развернуть плеер на весь экран, ни попросить пользователя
  повернуть телефон программно. Только имитация через `viewport-fit=cover` и
  просьба текстом.
- **Никакого `zoom` внутри сцены.** В том числе как приёма «размасштабировать»
  вложенный элемент — для этого только `transform: scale(1/k)`.
- **Никакого `<input>` мельче 16 логических px**, даже если визуально он должен
  быть мелким. Ограничение приходит из iOS и не обходится без побочных эффектов.

---

## 5. Чек-лист спайка S6

Цель спайка — не «попробовать, работает ли», а **получить числа**. Каждый пункт
формулируется как измерение с критерием прохождения.

### 5.1 Идентичность раскладки (главное)

- [ ] **Тест «уменьшенный десктоп vs телефон».** Отрендерить эталонную сцену с
      текстом (минимум: абзац на 4+ строки, длинное слово на границе переноса,
      два шрифта, число с моноширинным начертанием) при `k = 1`, `k = 0.5`,
      `k = 0.25`, `k = 0.1979` (380 px). Для каждого элемента снять
      `getBoundingClientRect()` и поделить на `k`.
      **Критерий: расхождение ≤ 0.02 логических px по всем четырём сторонам всех
      боксов.**
- [ ] **Счётчик строк.** Для каждого текстового узла снять `getClientRects().length`
      (число строчных боксов) при всех четырёх `k`.
      **Критерий: числа совпадают точно.** Это прямая проверка «переносы не
      поехали».
- [ ] **Тот же тест с `zoom: k` вместо `transform`** — чтобы получить
      контрпример и зафиксировать в репозитории, почему `zoom` отвергнут.
      Ожидание: счётчик строк разойдётся хотя бы на одном `k`.
- [ ] **Тест с text inflation.** Прогнать на реальном Android Chrome и iOS Safari
      **без** `text-size-adjust: 100%` и **с** ним. Зафиксировать разницу.
- [ ] **Тест шрифтового фолбэка.** Заблокировать загрузку веб-шрифта, снять
      счётчик строк. Убедиться, что старт плеера действительно ждёт
      `document.fonts.ready`.

### 5.2 Производительность (целевой критерий)

- [ ] **Базовый прогон.** 15 анимированных элементов (`transform` + `opacity`),
      viewport 380 px, CPU throttling 4×, DevTools Performance.
      **Критерий: p95 длительности кадра ≤ 16.7 мс, ни одного кадра > 18 мс на
      участке 10 с; средний fps ≥ 55.**
- [ ] **Отдельно замерить `filter`.** Тот же прогон, но 5 из 15 элементов
      анимируют `filter: blur()`. Ожидание: заметное падение. Получить число —
      от него зависит, разрешаем ли `blur` авторам вообще.
- [ ] **Влияние `will-change`.** Три варианта: (а) без `will-change` нигде,
      (б) `will-change: transform` на `.stage`, (в) `will-change: transform` на
      всех 15 элементах статически. Замерить fps **и** память под слои
      (`chrome://tracing` / Layers panel).
      **Критерий: подтвердить, что (а) не хуже (б) и (в) по fps, и лучше по
      памяти и по резкости.**
- [ ] **Количество композиторских слоёв.** Снять в Layers panel при `k = 1` и
      `k = 0.1979`. Записать raster memory для обоих. Проверить гипотезу из 1.6,
      что на телефоне памяти уходит меньше.
- [ ] **Стоимость resize.** Замерить длительность кадра, в котором меняется `k`.
      **Критерий: ≤ 50 мс на 4× троттлинге** (одноразовый скачок допустим,
      затяжной ре-растр — нет).
- [ ] **Проверить, что resize не трогает время.** При изменении размера окна
      во время воспроизведения: `audio.currentTime` монотонен, таймлайн не
      перематывается (инварианты 1, 2, 4).

### 5.3 Резкость

- [ ] **Скриншот текста при `k = 0.1979` и `k = 0.75`, DPR 1 / 2 / 3.** Визуально
      и по гистограмме сравнить с эталоном «текст того же визуального размера без
      трансформации». Зафиксировать, есть ли разница.
- [ ] **Тот же снимок с `will-change: transform` на `.stage`** — получить
      наглядное «до/после» для документации (это аргумент, который придётся
      повторять).
- [ ] **Проверить `backface-visibility: hidden` и `translateZ(0)`** на `.stage`:
      фиксируют ли они растр так же, как `will-change` (пункт «не выяснено» № 4).
- [ ] **Тонкие линии.** Элементы с `border` 1/2/4/6 логических px и тени с blur
      2/4/8 логических px при `k = 0.1979`, DPR 1 / 2 / 3. Определить порог, ниже
      которого линия визуально исчезает. Результат превращается в правило для
      дизайна сцен.
- [ ] **`border-radius` при дробном `k`.** Снимок скруглённого угла 24 px при
      `k = 0.1979`. Убедиться, что это дуга, а не ступеньки.

### 5.4 Интерактив и hit-области

- [ ] **Кросс-браузерный hit-test.** Скрипт: пройти сеткой `elementFromPoint`
      по 200 точкам внутри и по границам кликабельных элементов при `k = 0.1979`.
      Прогнать в Chrome, Firefox, Safari (desktop) и в iOS Safari / Android Chrome.
      **Критерий: 100 % совпадение с ожидаемым элементом; расхождений между
      браузерами нет.** Это прямая проверка [Mozilla bug
      1686390](https://bugzilla.mozilla.org/show_bug.cgi?id=1686390) на нашем кейсе.
- [ ] **Границы кликабельной зоны.** Проверить попадание ровно по краю бокса
      (±0.5 device px) — где браузеры расходятся, там и будет «кнопка не
      нажимается» на телефоне.
- [ ] **Перетаскивание.** Проверить, что объект под пальцем не «уезжает» и не
      «отстаёт»: при `k = 0.1979` и при `k = 1` дельта пальца → дельта объекта
      должна быть 1:1 визуально. Это проверка деления на `k` в коде.
- [ ] **Браузерный зум 50 % / 200 % и pinch-zoom.** Два измерения: (а) остаётся
      ли корректным `getBoundingClientRect`-рецепт из 1.3; (б) **меняется ли
      физический размер сцены на экране** при браузерном зуме. Гипотеза из 4.3 —
      не меняется вообще (зум сокращается с `k`). Подтвердить или опровергнуть,
      это прямое следствие для доступности.
- [ ] **`pointer-events: none` вне гейта.** Проверить физически: `elementFromPoint`
      возвращает не элемент сцены. Инвариант 3.

### 5.5 Поля ввода и мобильные платформы

- [ ] **Автозум iOS — подтвердить чтение исходников экспериментом.** Из кода
      WebKit следует, что порог 16px считается по computed (логическому)
      `font-size` (3.4). Проверить на реальном iPhone три случая:
      (а) `font-size: 24px` при `k ≈ 0.2` — **ожидание: автозума нет**;
      (б) `font-size: 12px` при `k ≈ 0.2` — ожидание: автозум есть;
      (в) `font-size: 12px` при `k > 1` — ожидание: автозум есть.
      Если (а) не подтвердится — переходим на схему «поля ввода вне сцены».
- [ ] **Клавиатура.** Замерить `window.innerHeight`, `visualViewport.height`,
      `visualViewport.offsetTop` до фокуса, при открытой клавиатуре и **после её
      закрытия** (регрессия iOS 26, FB19889436 — 3.4). На iOS и Android.
      **Критерий: `k` не меняется ни в одном из трёх состояний; сцена не
      прыгает.** Проверить, помогает ли явный `interactive-widget` на Android.
- [ ] **Автоскролл при фокусе.** Замерить, насколько WebKit сдвигает
      `position: fixed` контейнер, поднимая поле над клавиатурой, и восстановить
      ли положение самим.
- [ ] **Каретка и выделение.** Визуально проверить положение каретки, «ручек»
      выделения и системной лупы в отмасштабированном поле на iOS и Android.
- [ ] **Поворот экрана.** Замерить, сколько кадров сцена находится в неверном
      масштабе после поворота; проверить, не сломался ли letterbox. Отдельно
      проверить в in-app браузере (WKWebView) — там открытый
      [WebKit bug 170595](https://bugs.webkit.org/show_bug.cgi?id=170595)
      про враньё `innerWidth/innerHeight`.
- [ ] **In-app браузеры.** Прогнать плеер в SFSafariViewController / WKWebView
      (Telegram, Instagram) — это основной способ, которым к нам придут.
- [ ] **Пинч-зум.** Убедиться, что `k` не пересчитывается, сцена увеличивается
      целиком, а после жеста текст остаётся чётким.
- [ ] **`dvh` как антипример.** Собрать вариант, где `k` считается от `100dvh`,
      и записать видео сворачивания тулбара — чтобы «дышание» сцены было
      задокументировано и вопрос больше не поднимался.
- [ ] **Safe area и вырез.** Проверить letterbox на устройстве с вырезом при
      `viewport-fit=cover`.
- [ ] **Тайлинг на iOS.** Посмотреть в Web Inspector (Layers), уходит ли
      фоновый слой сцены в tiled-режим (порог `cMaxPixelDimension = 1280`,
      3.4), и сколько это стоит по памяти. Проверить, помогает ли отказ от
      большого painted-слоя в пользу сплошной заливки.
- [ ] **`backdrop-filter`.** Если он вообще планируется — замерить на iOS с
      учётом общего бюджета площади (`cMaxTotalBackdropFilterArea`). По
      результату решить, надо ли уточнять инвариант 8.

### 5.6 Редактор

- [ ] **Один и тот же DOM сцены** рендерится в редакторской панели (`k ≈ 0.4`) и
      в плеере (`k = 1`) — байт-в-байт одинаковая разметка и CSS, отличается
      только значение `transform` на `.stage`. Это проверка инварианта 5 тестом,
      а не верой.
- [ ] **`ResizeObserver` на панели.** Перетащить сплиттер редактора: сцена
      следует без лага и без `ResizeObserver loop` в консоли.
- [ ] **Клик автора в редакторе → координата в проекте.** Кликнуть в известную
      точку при `k ≈ 0.4`, проверить, что в проект записались ожидаемые логические
      координаты с точностью ≤ 0.5 логических px.

### 5.7 Сборка и тесты

- [ ] **Плеер без фреймворка.** Собрать ESM-бандл, открыть в голом HTML,
      проверить масштабирование. Инвариант 9.
- [ ] **Размер кода масштабирования.** Ожидание: ≤ ~40 строк JS. Если получается
      больше — что-то пошло не так.
- [ ] **Скриншотный тест «уменьшенный десктоп vs телефон»** из 3.3 — завести в
      CI сразу, это единственный автоматический страж главного требования.
- [ ] **Детерминированность скриншотов.** Прогнать один и тот же тест 10 раз
      локально и 10 раз в CI. **Критерий: 0 расхождений при `deviceScaleFactor: 1`
      и `scale: 'css'`.**

---

## 6. Что не выяснено

Перечислено явно, чтобы не выдавать догадки за факты:

1. Актуальное на 2026 год поведение субпиксельного (LCD) сглаживания текста на
   композиторских слоях — первоисточник не найден, только косвенные подтверждения
   из багтрекеров.
2. Насколько хорошо WebKit и Gecko перерастеризуют отмасштабированный DOM. Для
   Chrome есть первоисточник, для остальных — только открытые баги reveal.js
   ([#3644](https://github.com/hakimel/reveal.js/issues/3644),
   [#2663](https://github.com/hakimel/reveal.js/issues/2663)), которые
   намекают, что там хуже. Обязательный замер.
3. Автозум iOS: вывод сделан по чтению исходников WebKit `main`, **не
   экспериментом на устройстве**. Считаю установленным, но требующим проверки.
4. Как позиционируются каретка, ручки выделения текста и системные лупы внутри
   отмасштабированного контейнера на iOS.
5. Актуальное поведение `backface-visibility: hidden` / `translateZ(0)` как
   способа зафиксировать масштаб растеризации в современных движках.
6. Точный современный список условий, при которых `transform-style: preserve-3d`
   уплощается в `flat` (важно, потому что мы анимируем `filter`).
7. Порог видимости тонких линий: при каком `k` и DPR `border: 1px` фактически
   исчезает.
8. Текущий дефолт `interactive-widget` в Chrome Android (MDN называет дефолтом
   `resizes-visual`, explainer говорит «browsers retain their platform
   defaults»). Ставить значение явно.
9. Даёт ли установка плеера как PWA (`display: standalone`) полноэкранную
   оболочку на iPhone в обход отсутствующего Fullscreen API.
10. Механизм масштабирования у Google Slides — публичных данных нет.
11. Зачем в `master` reveal.js добавили округление масштаба до сотых — в коммите
    не объяснено.
