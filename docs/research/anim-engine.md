Дата проверки: 2026-07-27

# A1. Движок анимаций для ведомого таймлайна

Вопрос: чем двигать сцену, если таймлайн **ведомый** — время приходит из аудио,
а движок обязан только «показать состояние на момент `t`» и не иметь права
двигаться сам.

Проверялось на соответствие законам №1 (аудио — единственный источник времени),
№2 (таймлайн ведомый, никогда не играет сам), №4 (гейт останавливает мгновенно,
перемотки нет), №8 (только `transform`/`opacity`/`filter`), №9 (ESM без фреймворка).

---

## 0. Что на самом деле проверяем

Обычные сравнения анимационных библиотек («какая красивее/быстрее») здесь
бесполезны. Нам нужны четыре свойства, и только они:

1. **Абсолютное позиционирование.** Движок должен принимать `t` и приводить сцену
   к состоянию `t`, а не «доигрывать на дельту». Любой движок, который внутри
   складывает дельты, даёт накопительный дрейф и проваливает спайк S1
   (важен наклон, а не максимум).
2. **Отсутствие собственных часов.** Не «мы не запускаем плеер», а «движок
   физически не может сдвинуть сцену без нашего вызова».
3. **Точное финальное состояние.** На гейте элемент обязан быть в *точно*
   конечном значении, а не «почти доехал». Это спайк S2.
4. **Корректность при seek назад.** Возврат к `t` в прошлом должен восстанавливать
   состояние, а не оставлять «залипшие» свойства.

Дальше каждый кандидат оценивается ровно по этим пунктам.

---

## 1. GSAP — главный кандидат

### 1.1 Версия и живость

| Факт | Значение | Источник |
|---|---|---|
| Последняя версия | **3.15.0**, опубликована **2026-04-13** | `registry.npmjs.org/gsap` (dist-tags + `time`) |
| Коммиты в `master` | последний push **2026-04-13** | GitHub API `repos/greensock/GSAP` |
| Открытых issue | **7** | там же |
| Звёзд | 27 106 | там же |
| Загрузок в неделю | **4 034 507** (18–24.07.2026) | `api.npmjs.org/downloads/point/last-week/gsap` |
| Мейнтейнер | GreenSock, принадлежит **Webflow** (поглощение осенью 2024) | https://webflow.com/blog/gsap-becomes-free |

Проект живой без вопросов. Единственное замечание — темп релизов замедлился:
между 3.14.x и 3.15.0 прошло заметное время, а последний коммит на момент
проверки трёхмесячной давности. Для зрелой библиотеки это норма, но это уже
не «релиз раз в месяц», как было до поглощения.

### 1.2 Лицензия — здесь главный риск проекта

Это единственный пункт всего ресёрча, который может закрыть вариант целиком.
Разбираю подробно, потому что в интернете гуляют **три разные** версии ответа,
и две из них устарели.

> **Как проверялось.** Текст лицензии вытянут **с первоисточника**
> https://gsap.com/community/standard-license/ **2026-07-27** (сырой HTML,
> с разбором разметки — см. ниже про закомментированный блок), а не из статей и
> не из блога Webflow. Блог и обзоры используются только как подтверждение
> хронологии. Цитаты ниже — дословные.

**Что стоит в npm.** Поле `license` пакета `gsap@3.15.0`:

```
Standard 'no charge' license: https://gsap.com/standard-license.
```

Это не SPDX-идентификатор. Практическое следствие: любой автоматический
лицензионный сканер в CI пометит GSAP как «unknown / non-standard». Заложить
это в настройку проверки зависимостей заранее.

**Где лежит текст.** Ни в npm-тарболе, ни в корне GitHub-репозитория
файла `LICENSE` **нет** (проверено: распакован `gsap-3.15.0.tgz` — только
`README.md` и `SECURITY.md`; в репозитории корень — `.gitignore`, `README.md`,
`SECURITY.md`, `dist`, `esm`, `package.json`, `src`, `types`). Текст лицензии
существует **только как веб-страница** https://gsap.com/community/standard-license/.

**Действующая редакция.** Effective date: 2025-04-30, last modified: 2025-05-30,
Copyright © 2025, Webflow.

**Ловушка, на которую надо не попасться.** На той же странице в HTML присутствует
блок «Plain English Summary» со старым текстом («…as long as end users are not
charged a fee of any kind… please sign up for a "Business" Club GSAP membership»).
Проверено: этот блок **закомментирован** в разметке (`<!-- … -->`) и не
отображается — это остаток прежней лицензии. Модели и статьи, обученные на
старых данных, цитируют именно его. **Он не действует.** Действуют разделы I–VI.

**Что разрешено (verbatim, раздел I):**

> "Permitted Uses" means the implementation and/or use of GSAP Products on any
> website, web application, or digital interface by any person or entity (which
> may include, for clarity, those of companies that compete with Webflow in other
> areas of business).

**Что запрещено (verbatim, раздел I):**

> "Prohibited Uses" means any implementation and/or use of GSAP Products in tools
> that allow users to build visual animations without code that encourages,
> induces, or materially assists in creating a solution that competes with
> Webflow's visual animation building capabilities.

> "Competitive Products" means any software, tool, or service that enables users
> to create, edit, or manage animations through a visual interface or builder
> similar to Webflow.

**Раздел III:**

> You may not: Use any GSAP Products for any Prohibited Uses **without prior
> written consent**; Reverse engineer any GSAP Products for the purpose of
> creating Competitive Products; Remove or alter any proprietary notices or
> branding from GSAP Products.

**Как это ложится на наш продукт — и это не абстрактный вопрос.**

Продукт распадается на две части, и лицензия смотрит на них **по-разному**:

- **Плеер** — это «web application / digital interface». Попадает в Permitted
  Uses буквально, без натяжек. Коммерческое использование прямо разрешено
  (FAQ: «Commercial usage is covered under the standard license»), бонусные
  плагины (SplitText, MorphSVG и прочие бывшие Club) включены бесплатно.
  Про SaaS запрета нет: платность конечного продукта лицензию не волнует —
  это как раз то, что изменилось в 2025 году.
- **Редактор** — это инструмент, в котором автор ставит гейты на таймлайне и
  собирает анимации **через визуальный интерфейс без кода**. Формально он
  попадает под определение «Competitive Products» дословно. Запрет же
  («Prohibited Uses») сформулирован уже: он срабатывает, только если инструмент
  «competes with Webflow's visual animation building capabilities».

То есть мы ровно в серой зоне, и — важно — сам вендор это признаёт. FAQ на той
же странице:

> What if a WordPress plugin or theme or other niche tool allows users to create
> GSAP-driven effects through a visual interface? Is that prohibited?
> We want to encourage developers to build on top of GSAP, including visual tools
> that don't directly compete with Webflow's rich animation-building capabilities.
> If you are not sure if your product might be considered a "Prohibited Use",
> feel free to contact us so we can talk through it!

**Аргумент в нашу пользу:** Webflow — конструктор сайтов, его Interactions
анимируют вёрстку страницы. Мы делаем интерактивные объяснения с озвучкой и
гейтами; выход — не сайт, а плеер. Пересечение слабое, и мы явно ближе к «niche
tool», который FAQ разрешает.

**Аргумент против:** запрет написан широко, трактует его правообладатель, и
раздел V позволяет Webflow отозвать лицензию по своему усмотрению
(«in its discretion») при несоблюдении условий.

**Вывод по лицензии:** механизм снятия риска в лицензии прописан прямым текстом —
«prior written consent». Значит:

1. Для плеера GSAP берём без оговорок уже сейчас.
2. **До того, как редактор станет публично доступен пользователям**, получить
   письменное подтверждение от Webflow/GreenSock через форму контакта. Это не
   формальность «на всякий случай» — это ровно та процедура, которую лицензия
   предусматривает для нашего случая.
3. Архивировать в репозиторий копию текста лицензии на дату и переписку с
   ответом. Причина в разделе VI:

> Amendments: Webflow reserves the right to update or modify this GSAP License at
> any time by posting the revised terms on this website… Notwithstanding, you may
> continue using previous versions of GSAP Products under the applicable terms
> licensed to you prior to the effective date of the revised GSAP License.

Лицензия может измениться односторонне и без уведомления, а текст живёт только
на веб-странице. Защита — зафиксированная версия пакета плюс сохранённая копия
условий на момент внедрения. Права на *уже полученную* версию сохраняются.

### 1.3 Годится ли `gsap.timeline()` как ведомый таймлайн

Да. Проверено по исходникам `gsap@3.15.0` (`src/gsap-core.js`), не по докам.

Схема: `const tl = gsap.timeline({ paused: true })` при сборке, затем каждый кадр
`tl.time(t, true)` или `tl.seek(t)`.

**Позиционирование абсолютное, дрейфа нет.** `time()` → `totalTime()` →
`_lazySafeRender(this, totalTime, …)`. Поля `_tTime` и `_time` **присваиваются**
из аргумента, а не инкрементируются. Складывания дельт в коде нет вообще.
Тайминги нормализуются через

```js
_roundPrecise = value => Math.round(value * 10000000) / 10000000 || 0
```

то есть до 1e-7 с (100 нс) — на три порядка точнее, чем что-либо, что может дать
аудио-часы. **Накопление ошибки при частом seek структурно невозможно:** состояние
каждый раз пересчитывается от абсолютного `t`. Для спайка S1 это значит, что
наклон drift(t) со стороны движка равен нулю по построению; весь дрейф, если он
появится, придёт от часов (см. раздел 8), а не от GSAP.

**Seek назад — отдельная явно реализованная ветка**, а не побочный эффект.
В `Timeline.render` (строка ~1537):

```js
if (time >= prevTime && totalTime >= 0) {
    child = this._first;   // вперёд по списку
    …
} else {
    child = this._last;    // назад по списку
    let adjustedTime = totalTime < 0 ? totalTime : time;
    …
}
```

При движении вперёд рендерятся все дети с `_start <= time` в порядке списка;
при движении назад — обход с конца, и дети, чей `_start` больше плейхеда,
получают отрицательное локальное время → `ratio = 0` → начальные значения.
Поэтому перемотка назад корректно **восстанавливает** сцену, а не оставляет
залипшие свойства. Это ровно то поведение, которое нам нужно.

**Важная деталь про колбэки.** `seek()` и `time()` ведут себя **по-разному**:

```js
seek(position, suppressEvents) {
    return this.totalTime(_parsePosition(this, position), _isNotFalse(suppressEvents));
}
time(value, suppressEvents) { … }
```

У `seek()` `suppressEvents` по умолчанию **`true`** (подтверждено и документацией:
«(default = `true`) — If `true` (the default), no events or callbacks will be
triggered»). У `time()` значение просто пробрасывается, то есть по умолчанию
колбэки **сработают**. При вызове каждый кадр это означает шторм `onComplete`/
`onUpdate`. Вывод для кода: гонять `tl.seek(t)` либо `tl.time(t, true)` —
но никогда `tl.time(t)`.

Отдельно: `_lazySafeRender` (строки 116–119) принудительно сбрасывает отложенную
инициализацию твинов **до и после** рендера, с комментарием «typically when
someone calls seek() or time() or progress(), they expect an immediate render».
То есть `.time()`/`.seek()` дают синхронный, полностью применённый рендер к
моменту возврата из вызова — нам это нужно для детерминизма кадра (S8).

### 1.4 Можно ли физически запретить GSAP тикать самому

Это прямое требование закона №2, поэтому проверял по исходникам, а не по докам.

**`gsap.ticker.sleep()` — недостаточно.** Он действительно гасит rAF:

```js
sleep() {
    (_raf ? cancelAnimationFrame : clearTimeout)(_id);
    _tickerActive = 0;
    _req = _emptyFunc;
}
```

но GSAP **сам себя будит**. `_wake = () => !_tickerActive && _ticker.wake()`
вызывается из нескольких мест, и главное из них — **конструктор `Animation`**
(базовый класс и для `Tween`, и для `Timeline`, строка 1164):

```js
_tickerActive || _ticker.wake();
```

То есть любое создание твина или таймлайна — даже с `paused: true` — заново
запускает rAF-цикл. Плюс `_windowExists() && _wake()` на импорте модуля
(строка 3251). Ставка на `sleep()` — это гарантия «до первого твина». Не годится.

**Правильный выключатель — снять корневой таймлайн с тикера.** Вся связь между
тикером и сценой — ровно одна строка (3155):

```js
_ticker.add(Timeline.updateRoot);
```

и `updateRoot` публично выставлен наружу (`gsap.updateRoot`, типизирован как
`function updateRoot(time: number): void`). Поэтому

```js
gsap.ticker.remove(gsap.updateRoot);
```

**физически отсоединяет** сцену от часов GSAP: тикер может продолжать крутиться,
но ни один его кадр больше не способен что-либо подвинуть. Это документированный
приём, а не хак — https://gsap.com/docs/v3/GSAP/gsap.updateRoot() приводит его
дословно, с пометкой «This is only intended for advanced users».

При этом наш собственный `tl.time(t, true)` продолжает работать: `totalTime()`
рендерит напрямую через `_lazySafeRender`, минуя тикер.

**Второй, независимый рубеж:** таймлайн с `paused: true` имеет `_ts = 0`, а в
цикле `Timeline.render` стоит условие `… && child._ts`, поэтому корневой таймлайн
приостановленного ребёнка не двигает в принципе. Два независимых механизма —
`_ts = 0` и отсутствие `updateRoot` в слушателях.

**Главное: это проверяется тестом, а не верой** (как требует закон №9).
Проверка в одну строку: `gsap.ticker._listeners` (поле публично) не должно
содержать `updateRoot`. Плюс поведенческий тест: собрать таймлайн, не трогать
его N кадров, убедиться, что `transform` цели не изменился.

Замечание на будущее: `lagSmoothing()` в нашей схеме не нужен вовсе — он правит
дельты внутреннего тикера, а мы этим тикером не пользуемся. Отключать его
(`gsap.ticker.lagSmoothing(0)`) не вредно, но и не решает ничего; настоящий
выключатель — только `remove(updateRoot)`.

### 1.5 Точность финального состояния — самый важный технический факт

Требование «на гейте элемент **точно** в финале, а не почти доехал» (спайк S2)
GSAP выполняет **по построению**, и это видно в коде.

Во-первых, время твина прищёлкивается к границам (`Tween.render`, строка 2425;
`_tinyNum = 1e-8`):

```js
tTime = (totalTime > tDur - _tinyNum && !isNegative) ? tDur
      : (totalTime < _tinyNum) ? 0
      : totalTime,
```

Любое время в пределах 1e-8 от конца становится **ровно** `tDur`, любое около
нуля — **ровно** `0`. Значит `ratio = ease(1)` — точная единица, а не 0.9999.

Во-вторых, при `ratio === 1` GSAP пишет **авторскую конечную строку целиком**,
а не результат интерполяции. В ядре (`_renderComplexString`, строка 2716):

```js
} else if (ratio === 1 && data.e) {   // e = ending string
    s = data.e;
}
```

и в CSSPlugin (строки 27 и 29):

```js
_renderPropWithEnd = (ratio, data) =>
    data.set(data.t, data.p, ratio === 1 ? data.e : …, data),
_renderCSSPropWithBeginningAndEnd = (ratio, data) =>
    data.set(data.t, data.p, ratio === 1 ? data.e : ratio ? … : data.b, data),
```

Итог: если плейхед стоит на конце твина **или где угодно после него**, в стиль
записывается ровно то, что автор задал (`x: 300` → `translateX(300px)`), без
плавающей запятой. Симметрично `ratio === 0` → `data.b`, исходное значение.

**Это и есть ответ на третий случай из задания.** Никакой отдельной логики
«доснапить в конечное состояние» писать не нужно — она уже внутри и работает
для любой точки остановки. Более того, промежуточные значения тоже округляются
(`Math.round(v * 1e6) / 1e6` в `_renderPlain`, `1e4` в комплексных строках),
что убирает мусорные хвосты вроде `299.99999997px`.

### 1.6 Стоимость seek на таймлайне с сотнями твинов

Честный ответ: **O(n) обход, индексированного поиска нет.** В `Timeline.render`
дети — односвязный список, и он обходится целиком:

```js
child = this._first;
while (child) {
    next = child._next;
    if ((child._act || time >= child._start) && child._ts && pauseTween !== child) {
        child.render(…);
    }
    child = next;
}
```

Ни бинарного поиска по `_start`, ни интервального дерева. При плейхеде у конца
таймлайна условие `time >= child._start` истинно для **всех** предшествующих
детей, то есть формально `render()` зовётся у каждого из них каждый кадр.

Смягчает это ранний выход в `Tween.render` (строка 2429):

```js
} else if (tTime !== this._tTime || !totalTime || force || …) {
```

У уже завершённого твина `tTime === this._tTime === tDur`, и всё тело рендера
пропускается. Поэтому реальная стоимость кадра — **O(n) переходов по указателям
и O(n) дешёвых сравнений, но O(k) записей в стиль**, где k — число твинов, у
которых локальное время реально изменилось (обычно единицы).

Практический вывод: для сотен твинов это микросекунды, узким местом будет не
обход, а стиль/композитор. Но цифру надо **померить**, а не поверить — это
входит в спайк S6. Если n уйдёт в тысячи, штатный приём — разбить на вложенные
дочерние таймлайны по сценам: родитель обходит десятки детей, а не тысячи
твинов (вложенные таймлайны рендерятся рекурсивно тем же кодом).

### 1.7 Размер, ESM, tree-shaking, TypeScript

Измерено на распакованном `gsap-3.15.0.tgz` локально:

| Файл | raw | gzip -9 | brotli |
|---|---|---|---|
| `dist/gsap.min.js` (ядро + CSSPlugin) | 72 927 B | **28 268 B** | **25 706 B** |

Это тот минимум, который нам нужен: ядро + CSSPlugin (без него не анимируются
CSS-свойства). ScrollTrigger, Draggable, SplitText и прочее нам не требуется и
в бандл не попадёт.

**Чистый ESM без бандлера — работает.** `package.json` объявляет
`"module": "index.js"`, полноценные `exports` с веткой `import`, и
`"sideEffects": false`. Ключевое: импорты внутри ESM-сборки **с явными
расширениями `.js`**:

```js
import { gsap, … } from "./gsap-core.js";
import { CSSPlugin } from "./CSSPlugin.js";
```

— значит модуль грузится нативно из голого `<script type="module">` без сборщика.
Закон №9 не нарушается. (На практике плеер всё равно собирается Vite в один
ESM-файл, но проверяемость сохраняется.)

Оговорка по tree-shaking: `sideEffects: false` объявлен, но в `index.js` стоит
`TweenMaxWithCSS = gsapWithCSS.core.Tween` с комментарием
`// to protect from tree shaking` — GSAP намеренно удерживает CSSPlugin от
вытряхивания. Реальная экономия от tree-shaking на ядре невелика — рассчитывать
надо на ~25–28 КБ сжатыми. Точную цифру тряхнутого бандла **не выяснено** (не стал
ставить сборщик; померить в момент первой сборки плеера).

**TypeScript:** типы first-party, лежат в `types/` (`"types": "types/index.d.ts"`),
включая `gsap.updateRoot`, `ticker.sleep()`, `ticker.lagSmoothing()`. Со strict
проблем не ожидается — типы рукописные, а не сгенерированные.

---

## 2. Нативный Web Animations API (WAAPI)

Ноль килобайт, ноль лицензионных рисков, ноль вопросов о живости проекта. Именно
поэтому его надо рассматривать всерьёз, а не отмахиваться.

### 2.1 `currentTime`: тип и точность

**Тип — вопрос закрыт.** Спека раздвоена: Level 1 объявляет
`attribute double? currentTime`, Level 2 патчит на `CSSNumberish?` с явной
оговоркой:

> When associated with a **progress-based timeline**, current time must be
> returned as a `CSSNumericValue`… **Otherwise** current time must be returned as
> a **double** value, representing the time in units of milliseconds.

Проверено по исходникам движков и замером в Chrome 150:

| Движок | Обычная (document) timeline | Progress-based (scroll/view) |
|---|---|---|
| Chrome 150 | **`number`** (замер: `typeof === "number"`) | `CSSUnitValue` (`unit:"percent"`) |
| Safari | `double` (`WebAnimationTime::operator CSSNumberish()`) | `CSSUnitValue` percent |
| Firefox | **`number`** (`[BinaryName="currentTimeAsDouble"] attribute double?`) | н/д, ScrollTimeline не отгружен |

**У нас часы аудио и `DocumentTimeline`, значит везде простое число в
миллисекундах.** `CSSNumericValue` нам не грозит.

Остаётся трение в TypeScript: `lib.dom.d.ts` объявляет
`currentTime: CSSNumberish | null`, `type CSSNumberish = number | CSSNumericValue`.
Заведённый на это issue TypeScript #54496 **закрыт как «Working as Intended»** —
фикса не будет. В strict-режиме `anim.currentTime + 1` не компилируется, нужен
каст или хелпер с рантайм-проверкой на каждом чтении.

**Точность — здесь я исправляю собственную ошибку.** Первоначально я счёл, что к
`Animation.currentTime` применяется общее для Firefox огрубление таймеров
(`privacy.reduceTimerPrecision`, 2 мс по умолчанию). **Это неверно.** Проверка по
`dom/animation/AnimationUtils.h` в gecko-dev показывает, что огрубление стоит
только на **геттере** и только в режиме `resistFingerprinting`, с комментарием в
самом коде: «CSS Animations needs to have its Time Reduction Logic refactored, so
it's currently only clamping for RFP mode». Сеттер точен всегда. Поскольку мы
только пишем и никогда не читаем обратно, для нас это безвредно.

Реальная картина по точности:

- **Спека** рекомендует микросекунды: «0.001 is distinguishable from 0.0».
- **Chrome** — полный double. Замер 2000 значений: 42 неточных round-trip,
  макс. относительная ошибка ~1 ULP (`500.5` читается как `500.49999999999994`).
- **Safari** — квантование ровно до микросекунды:
  `std::round(time.microseconds()) / 1000` в `WebAnimationUtilities.h`. То есть
  `currentTime = 0.0001` прочитается как `0`.
- **Квантования по границам кадров нет нигде.** Время можно ставить в
  произвольную дробную точку.

При шаге кадра ~16.7 мс всё это несущественно.

### 2.2 Ручное позиционирование работает и специфицировано

`pause()` + присвоение `currentTime` — штатный способ скраба, спека называет его
прямо: «The current time of an animation can be set to a new value **to seek the
animation**».

Полезная деталь: `pause()` асинхронен (`pending === true`), но **первое же
присвоение `currentTime` синхронно дозавершает паузу** («synchronously complete
the pause operation»). Замер подтверждает: после `pause()` → `pending === true`,
после `currentTime = 500` → `pending === false`. Ждать `await anim.ready` перед
скрабом не нужно.

Ещё удобнее: **перемотка в конец не переводит анимацию в `finished`**. Замер:
при `duration: 1000` и `currentTime = 1000` (и даже `2000`) `playState` остаётся
`"paused"`. Значит `playState === "paused"` можно использовать как дешёвый
ассерт «анимация точно не идёт сама» — прямая проверка закона №2.

**Синхронность.** Спека (§6.13 Model liveness) гарантирует, что модель
обновляется немедленно и `getComputedStyle` возвращает «fully up-to-date state».
Но там же прямая оговорка:

> a user agent **may render a frame with none of the above changes applied**.

То есть **модель синхронна, пиксели — со следующего кадра.** Для схемы
«rAF → время из аудио → расставить `currentTime`» это ровно то, что нужно.

### 2.3 Групповой абстракции нет — и это подтверждено окончательно

`GroupEffect` / `SequenceEffect` из Web Animations Level 2 **не отгружены нигде,
даже за флагом**:

- Chrome: `typeof GroupEffect === "undefined"` (замер); в Chrome Platform Status
  запрос по `GroupEffect` даёт `{"total_count": 0}` — фич-энтри даже не заводили.
- Safari: поиск в WebKit Bugzilla — **0 записей**.
- Firefox: поиск в Bugzilla@Mozilla — **0 записей**.
- MDN BCD: файла `api/GroupEffect.json` не существует (404).
- `lib.dom.d.ts`: ни одного упоминания.

Косвенное подтверждение: Motion вынуждена реализовывать группировку вручную
(`GroupAnimation.setAll("time", t)` — цикл по детям). Если бы платформа давала
группу, этот код был бы не нужен.

**Ответ по заданию: синхронизировать десятки `Animation` можно только выставляя
`currentTime` каждому в цикле.** Другого способа не существует.

### 2.4 Стоимость — неожиданно хорошая, но с двумя минами

Замер в Chrome 150 (паузированные анимации `transform` + `opacity`, присвоение
всем каждый rAF, 100 кадров):

| N анимаций | JS-цикл, медиана | Кадр, медиана |
|---|---|---|
| 30 | ~0.0 мс | 16.7 мс |
| 100 | 0.1 мс | 16.7 мс |
| 300 | 0.1 мс | 16.7 мс |

Архитектурно присвоение не вызывает синхронный пересчёт: в Blink
`SetCurrentTimeInternal()` лишь выставляет флаг `SetOutdated()`, работа
откладывается до сервисинга таймлайна. **До 300 присвоений в кадр стоимость
теряется в шуме.** Это снимает мой прежний «не выяснено» и, честно говоря,
реабилитирует WAAPI по производительности.

**Мина №1 — чтение в том же тике.** Тот же замер с добавлением
`getComputedStyle(target).transform` после каждого присвоения:

| N | без чтения | с `getComputedStyle` | множитель |
|---|---|---|---|
| 100 | 0.1 мс | **0.9 мс** | ~9x |
| 300 | 0.1 мс | **2.2 мс** | ~22x |

Это плата за гарантию «fully up-to-date state». **Правило, которое надо занести
в код независимо от выбора движка: в кадре только пишем, ничего не читаем через
`getComputedStyle` / `getBoundingClientRect`.**

**Мина №2 — Firefox.** Открытый баг
[1720631](https://bugzilla.mozilla.org/show_bug.cgi?id=1720631) «Setting
currentTime on a compositor-accelerated Animation causes a paint + scene build» —
**NEW, заведён 2021-07-15, пять лет без движения**. Изменение `currentTime` у
ускоренной transform-анимации вызывает paint на главном потоке и пересборку
сцены WebRender вместо дешёвого frame build. Комментарий Hiroyuki Ikezoe
(Mozilla): «as far as I know, **Chrome doesn't do that** for transform
animations». Это ровно наш сценарий, и это самый весомый аргумент против WAAPI.
Масштаб деградации в баге не приведён — **не выяснено**.

Safari: данных нет, **не выяснено**.

### 2.5 Финальное состояние — главный подвох WAAPI

Здесь есть измеренная ловушка, которая прямо отвечает на третий случай задания:

| `fill` | `currentTime = 999.999` | `currentTime = 1000` (== duration) |
|---|---|---|
| `'both'` | `opacity: 0.000001` | **`opacity: 0`** ✓ |
| `'none'` | `opacity: 0.000001` | **`opacity: 1`** ← откат в базовое |

При `fill: 'none'` ровно в момент `t === duration` эффект выходит из active phase
и элемент **скачком возвращается в исходное состояние**. То есть «виджет доехал и
замер» на WAAPI работает **только** при `fill: 'both'` (или `'forwards'`).
`'both'` заодно фиксирует и начало: при `currentTime = -500` элемент держит
стартовое значение.

При этом MDN сам предупреждает про вечный fill:

> Using indefinitely filling animations is discouraged. Animations take precedence
> over all static styles…

`commitStyles()` нам не подходит: он пишет **инлайновые стили** (односторонняя
операция, назад в скраб не вернуться), и у него свои проблемы —
`InvalidStateError`, если цель не отрисована (`display:none` или не в DOM,
подтверждено замером); WebKit
[309272](https://bugs.webkit.org/show_bug.cgi?id=309272) — нарушение CSP
`style-src-attr` (NEW, март 2026); Mozilla
[1917071](https://bugzilla.mozilla.org/show_bug.cgi?id=1917071) — коммит
паразитно запускает CSS-транзишны (ASSIGNED).

Итого для нас: обязателен `fill: 'both'` на **всех** эффектах, навсегда.

### 2.6 `filter`, `getAnimations()`, баги WebKit

**`filter` анимируется во всех трёх движках** (Chrome 53 / Firefox 35 /
Safari 9.1), и замер в Chrome это подтверждает. Но у Safari есть открытые баги,
и часть из них касается нас **независимо от выбора движка**, потому что это баги
CSS-фильтров, а не WAAPI:

- [167060](https://bugs.webkit.org/show_bug.cgi?id=167060) — `filter: drop-shadow`
  рендерится **по-разному в анимируемом и статичном состоянии**. Открыт с 2017.
- [229492](https://bugs.webkit.org/show_bug.cgi?id=229492) — анимация на потомках
  ломает `filter` на родителе (изм. 2026-02-02).
- [219729](https://bugs.webkit.org/show_bug.cgi?id=219729) — `filter` не
  применяется к потомкам, пока они анимируются.

**`backdrop-filter` в Safari: интерполяция провалена по всем четырём WPT-тестам**
([235811](https://bugs.webkit.org/show_bug.cgi?id=235811)–[235814](https://bugs.webkit.org/show_bug.cgi?id=235814), все NEW).
**Практический вывод: `backdrop-filter` в анимациях плеера не использовать.**

`getAnimations()` поддержан везде (Chrome 84 / Firefox 75 / Safari 13.1) и
возвращает в том числе CSS-анимации и транзишны. Но в Firefox открыт
[1770591](https://bugzilla.mozilla.org/show_bug.cgi?id=1770591) — не все
псевдоэлементы поддержаны, набор объектов разойдётся между движками.
**Вывод: не полагаться на `getAnimations()` как на источник истины о сцене,
держать собственный реестр.**

Отдельно — открытые баги WebKit, которые бьют именно по «часто обновляем
transform»:

- [304741](https://bugs.webkit.org/show_bug.cgi?id=304741) — «Frequent transform
  updates during CSS transition cause **flickering** in WebKit» (NEW, изм. 2026-04-08).
- [265157](https://bugs.webkit.org/show_bug.cgi?id=265157) — flaky разрешение
  стиля именно у **приостановленной** анимации (NEW, изм. 2026-01-12).
- [223876](https://bugs.webkit.org/show_bug.cgi?id=223876) — «Lots of WPT failures
  for transform interpolation».

Блокирующих багов «скраб паузированной анимации не работает» нет ни в одном
движке. По Chromium — **не выяснено**: публичный трекер issues.chromium.org
программно недоступен (405 на GET).

### 2.7 Итог по WAAPI

Производительность реабилитирована (300 присвоений в кадр бесплатны в Chrome),
механика точна и специфицирована. Хоронят его три вещи:

1. **Нет группы и не будет.** Один «таймлайн» = N объектов, синхронизируемых
   вручную. Вся оркестровка — вложенность, смещения, порядок, seek назад,
   вложенные таймлайны — наш код. Это не «взяли платформу вместо библиотеки»,
   это «написали свою библиотеку», причём ту часть, где у GSAP и anime.js
   вылизаны годами именно граничные случаи.
2. **Вечный `fill: 'both'`** как обязательное условие точного финала, вопреки
   рекомендации MDN, и без работающей альтернативы (`commitStyles` односторонний).
3. **Открытый баг Gecko 1720631** ровно на нашем сценарии, пять лет без движения.

---

## 3. anime.js — реальный второй кандидат, а не запасной

### 3.1 Версия, лицензия, живость

| Факт | Значение | Источник |
|---|---|---|
| Версия | **4.5.0**, опубликована **2026-06-22** | `registry.npmjs.org/animejs` |
| Лицензия | **MIT**, без оговорок | поле `license` в npm + `LICENSE.md` в тарболе |
| Загрузок в неделю | **1 012 554** | `api.npmjs.org/downloads/point/last-week/animejs` |
| Звёзд | 71 528 | GitHub API |
| Открытых issue / PR | **97 / 16** | GitHub search API |
| Коммитов за 6 мес. | **9**, все — Julian Garnier | GitHub API |

**Про лицензию — важное уточнение, потому что в задании стоял вопрос «она
менялась».** Проверено по полю `license` **всех** версий в реестре: смены
лицензии в v4 **не было**, MIT и в 3.2.2, и в 4.5.0. Текст в тарболе — канонический
MIT, «Copyright (c) 2025 Julian Garnier», «without restriction… sublicense,
and/or sell». Платного тира, «anime.js Pro» и pricing-страницы на animejs.com
не существует; монетизация — только GitHub Sponsors. Для нас это означает
**полное отсутствие лицензионного риска** — в отличие от GSAP.

Настоящий риск здесь другой: **bus factor = 1**. Один мейнтейнер, 9 коммитов за
полгода, 97 открытых issue. Библиотека не заброшена (релиз месяц назад), но
запаса прочности у неё меньше, чем у проекта, за которым стоит компания.

### 3.2 Ведомый таймлайн — работает буквально

```js
import { createTimeline } from 'animejs';
const tl = createTimeline({ autoplay: false, defaults: { ease: 'linear' } })
  .add('#s', { x: 400, duration: 1000 }, 0);
tl.seek(t);   // либо tl.currentTime = t;  t в МИЛЛИСЕКУНДАХ
```

Проверено по исходнику (`dist/modules/timer/timer.js:373`):

```js
seek(time, muteCallbacks = 0, internalRender = 0) {
    …
    const isPaused = this.paused;
    this.paused = true;
    tick(this, time + this._delay, ~~muteCallbacks, ~~internalRender, tickModes.AUTO);
    return isPaused ? this : this.resume();
}
```

Позиционирование абсолютное, и на приостановленном таймлайне пауза
**сохраняется** — тикер не пробуждается. Сеттер `currentTime` (стр. 220) делает
`this.pause().seek(+time)`, то есть эквивалентен.

Осторожно с колбэками: `muteCallbacks` по умолчанию `0`, то есть колбэки
**сработают** — поведение обратное GSAP-овскому `seek()`. При вызове каждый кадр
нужно `tl.seek(t, true)`.

### 3.3 Отключение тикера — здесь чище, чем у GSAP

Два независимых механизма, и оба лучше GSAP-овских:

1. **Штатный публичный флаг.** `engine.useDefaultMainLoop = false` — после этого
   `wake()` становится пустышкой навсегда:

   ```js
   wake() {
       if (this.useDefaultMainLoop && !this.reqId) { … }
       return this;
   }
   ```

   Никакого «конструктор твина будит тикер обратно», как в GSAP. Флаг
   документирован (`animejs.com/documentation/engine/engine-properties`).

2. **Эмпирически тикер вообще не запускается.** Замер в реальном Chrome на
   anime 4.5.0: после `createTimeline({autoplay:false})` и восьми
   последовательных `seek()` поле `engine.reqId` **остаётся `0`** — rAF не
   планируется ни разу, а DOM обновляется синхронно в том же тике.

**Важная оговорка, снимающая соблазн:** `engine.update()` (парный метод для
ручного тика) для нас **не годится**. Его сигнатура `update(): void` — он не
принимает время, внутри `const time = this._currentTime = now()`, то есть двигает
анимации по собственным настенным часам, просто из чужого rAF. Это подходит для
интеграции с Three.js, но **не** для «аудио — единственный источник времени».
Правильный путь именно `autoplay: false` + `seek(t)`.

### 3.4 Точность финала

Тот же класс гарантии, что у GSAP, только реализован в одну строку
(`core/helpers.js:156`):

```js
const lerp = (start, end, factor) =>
    factor === 1 ? end : factor === 0 ? start : start + (end - start) * factor;
```

При `factor === 1` возвращается **авторское конечное значение как есть**, без
арифметики с плавающей точкой. Плюс клампинг времени
(`clamp(iterationTime - tween._startTime, 0, tweenChangeDuration)`) и округление
до 12 знаков.

Замер в Chrome подтверждает поведение целиком, включая клампинг за концом и
точную обратную перемотку:

```
seek(1000) -> matrix(1,0,0,1,400,0) opacity=1
seek(1500) -> matrix(1,0,0,1,400,0) opacity=0     ← ровно финал при t == duration
seek(1600) -> matrix(1,0,0,1,400,0) opacity=0     ← клампится на duration
seek(500)  -> matrix(1,0,0,1,200,0) opacity=1     ← назад точно
```

### 3.5 Размер и ESM

Замер (esbuild --bundle --minify, gzip -9) и собственный замер готовых бандлов:

| Что | raw | gzip |
|---|---|---|
| `import { createTimeline } from 'animejs/timeline'` | 36 004 | **13 928** |
| `import { createTimeline, animate } from 'animejs'` | 36 185 | **13 984** |
| `dist/bundles/anime.esm.min.js` (всё целиком) | 118 678 | 40 836 |

**Примерно вдвое легче GSAP** на нашем сценарии (14 КБ против ~26–28 КБ).
23 sub-path экспорта, tree-shaking работает по-настоящему.

`dist/bundles/anime.esm.min.js` — самодостаточный ESM **без bare-импортов**,
грузится из голого `<script type="module">`. Закон №9 выполняется.

---

## 4. Motion (бывший Framer Motion)

### 4.1 Версия, лицензия, живость

| Факт | Значение | Источник |
|---|---|---|
| Версия | **12.42.2**, опубликована **2026-06-30** | `registry.npmjs.org/motion` |
| Лицензия | **MIT** (Copyright (c) 2024 Motion B.V.) | `LICENSE.md` в тарболе, GitHub `spdx_id` |
| Загрузок в неделю | `motion` **16.3 млн** + `framer-motion` **40.9 млн** | npm downloads API |
| Коммитов за 6 мес. | **574**, `pushed_at` — сегодня | GitHub API |
| Открытых issue / PR | 109 / 8 | GitHub search API |
| Мейнтейнер | Matt Perry / Motion B.V. | GitHub |

Самый живой проект из всех рассмотренных. `motion` — тонкий алиас
(`export * from 'framer-motion/dom'`), React в `peerDependenciesMeta` помечен
`optional: true`, то есть **ванильное использование первоклассно**, а не
побочный режим.

**Motion+ (платный) ядро не гейтит.** Включает примеры, туториалы, premium-
компоненты, визуальный редактор переходов. Дословно со страницы: «Motion+ APIs
and examples are licensed under MIT, so once you've added code to your site,
it's yours forever». Ни `animate`, ни sequences, ни `.time` за пейволом нет.

### 4.2 Ручное время — есть, и есть групповая абстракция

```js
import { animate } from "motion";
const a = animate(el, { opacity: [1, 0] }, { duration: 1, autoplay: false });
a.time = t;   // t в СЕКУНДАХ (у anime.js — в миллисекундах, легко перепутать)
```

Sequence-таймлайн в ванили есть и бесплатен: `animate([[el, {…}, {…}], …])`
возвращает `GroupAnimation`, чей сеттер `time` раскладывается по детям
(`motion-dom/dist/es/animation/GroupAnimation.mjs:33`):

```js
set time(time) { this.setAll("time", time) }
```

Замер в Chrome на sequence из двух сегментов по 1 с даёт точные значения,
включая `t = 2.0 → transform=100px, opacity=0` (ровно финал).

### 4.3 Почему это всё-таки не наш вариант — два конкретных факта

**(а) `.time` синхронен только на WAAPI-пути.** Motion выбирает WAAPI, когда
свойство входит в `acceleratedValues = {"opacity","clipPath","filter","transform"}`
и нет `onUpdate`; иначе — свой `JSAnimation`. На JS-пути сеттер `.time` не
рендерит, а **планирует** тик (`JSAnimation.mjs:251`: `this.driver.start(false)`).
Замер:

```
a2 = animate(el, {x:[0,400]}, {duration:1, autoplay:false})
a2.time = 0.25  -> getComputedStyle СРАЗУ = "none"        ← предыдущее значение
        через 2 rAF -> matrix(1,0,0,1,100,0)
```

То есть удобные шорткаты `x`, `y`, `scale`, `rotate` **уводят на путь, где
состояние отстаёт на кадр**. Для нас это прямая угроза детерминизму кадра и
точности гейта. Обходится дисциплиной (писать `transform` полной строкой), но
это ровно тот класс правил, которые кто-нибудь однажды нарушит, и поймать это
будет тяжело.

**(б) Внутренний тикер штатно не отключается.** Глобальный батчер жёстко привязан
к rAF: `createRenderBatcher(requestAnimationFrame, true)`. Есть
недокументированный `MotionGlobalConfig.useManualTiming = true` и опция
`driver` в `ValueTransition`, есть `attachTimeline` — но в типах он помечен
«**This is currently for internal use only**», а `driver` в документации
motion.dev отсутствует. Опираться на приватный контракт ради базового закона
архитектуры нельзя.

**(в) Нет однофайловой ESM-сборки.** `motion/dist/es/index.mjs` содержит
bare-специфер `'framer-motion/dom'`, дальше `'motion-dom'`. Из голого
`<script type="module">` это не грузится — самодостаточен только UMD
`motion/dist/motion.js`, кладущий глобал `Motion`. Прямой конфликт с законом №9
(у GSAP и anime.js такие сборки есть).

Размер: `animate` из `motion` — 22 590 B gzip; `motion/mini` (чистый WAAPI) —
**3 119 B gzip**. Расхождение с заявленными на сайте «18kb / 2.6kb» — вероятно
brotli; **не выяснено**.

---

## 5. Прочие кандидаты

**Theatre.js** — единственная библиотека, спроектированная **ровно** под нашу
задачу, и именно поэтому её обидно отклонять. `@theatre/core@0.7.2`, лицензия
**Apache-2.0**. API попадает в десятку: `sheet.sequence.position` — «The current
position of the playhead. In a time-based sequence, this represents the current
time in seconds», сеттер; `createRafDriver({name, start, stop})` для внешнего
тикания; и даже `sequence.attachAudio({source, audioContext, destinationNode})` —
готовая привязка к аудио. Плюс визуальный редактор кривых, который нам был бы
нужен для редактора.

**Не берём из-за состояния проекта.** Последняя публикация в npm —
**2024-05-19**, последний коммит — **2024-04-11**, 139 открытых issue,
20 322 загрузки в неделю. В README висит: «Theatre.js 1.0 is around the corner.
We have _temporarily_ moved development to a private repo… We'll push our work
back to this public repo soon.» Два с лишним года «soon». Версия 0.x, апстрим
публично мёртв. Класть фундамент продукта на это нельзя.

**Popmotion** — мёртв. `popmotion@11.0.5`, последняя публикация **2022-08-15**,
последний коммит тогда же. Автор — Matt Perry, тот же, что у Motion; проект
фактически влит в Motion. Не рассматривать.

**@okikio/animate** — заброшен. Последняя публикация **2021-06-30**. Репозиторий
формально обновляется, но за последние 12 месяцев в нём ноль не-ботовых
коммитов (только dependabot). Не рассматривать.

---

## 6. Сводное сравнение

| Критерий | GSAP 3.15.0 | anime.js 4.5.0 | Motion 12.42.2 | WAAPI |
|---|---|---|---|---|
| Лицензия | «Standard no-charge», не SPDX, **есть запретная зона** | **MIT** | MIT | — |
| Абсолютный seek | да, `_tTime` присваивается | да, `tick(time + delay)` | да (`.time`, сек) | да (`currentTime`, мс) |
| Дрейф при частом seek | **нет** (по построению) | **нет** (по построению) | нет | нет |
| Seek назад | явная отдельная ветка | корректен (замер) | да | да |
| Точный финал | **да**, `ratio===1 → data.e` | **да**, `factor===1 → end` | да на WAAPI-пути | только при `fill:'both'`; при `'none'` **откат в базовое** |
| Синхронный рендер произвольного `t` (нужен для S2) | да (`_lazySafeRender`) | **да** (замер: тот же тик) | **нет** на JS-пути | да (модель; пиксели — след. кадр) |
| Отключить свой тикер | `ticker.remove(updateRoot)`, `sleep()` **недостаточно** | **`useDefaultMainLoop=false`**, rAF вообще не стартует | **нет** публичного способа | нечего отключать |
| Группа/таймлайн | полноценный, вложенный | полноценный, вложенный | sequence, плоский | **нет** |
| Размер (gzip) | ~25.7 КБ (brotli) / 28.3 КБ | **~14 КБ** | 22.6 КБ / mini 3.1 КБ | 0 |
| ESM в голом HTML | да (импорты с `.js`) | **да** (самодостаточный бандл) | **нет** (только UMD-глобал) | да |
| Живость | 4.0 млн/нед, 7 issue, компания | 1.0 млн/нед, 97 issue, **1 человек** | 16.3 млн/нед, 574 коммита/6 мес | платформа |
| Стоимость seek | O(n) обход, O(k) записей | не выяснено | не выяснено | замер: 300 присв./кадр ≈ 0.1 мс в Chrome; но Gecko [1720631](https://bugzilla.mozilla.org/show_bug.cgi?id=1720631) |

---

## 7. Ответ на прямой вопрос: одна абстракция на три случая?

**Да, и это не компромисс — это следствие того, как устроен ведомый таймлайн.**

Все три случая — не три разных механизма, а три положения плейхеда относительно
одного и того же твина:

| Случай | Что это на таймлайне | Состояние на гейте |
|---|---|---|
| «элемент выезжает» | плейхед **внутри** твина | интерполяция, `0 < ratio < 1` |
| «подсветка появляется» | то же, короткий твин по `opacity`/`filter` | интерполяция |
| «виджет доехал и замер» | плейхед **на конце или после** твина | `ratio === 1` → авторское конечное значение |

Третий случай — не особый режим и не «дотягивание». Он выпадает автоматически из
двух механизмов, проверенных в разделе 1.5: прищёлкивание `tTime` к `tDur`
в пределах 1e-8 и ветка `ratio === 1 → data.e`, которая пишет авторскую конечную
строку. Гейт может стоять в любой точке после конца твина — результат одинаковый
и точный.

Практически это значит, что автор описывает сцену **одним видом сущности** —
твин на отрезке `[t0, t1]`, — и «замер в финале» отдельно выражать не нужно.
Элемент, у которого все твины позади, просто находится в их конечных значениях.

Два уточнения, которые надо превратить в конвенцию проекта, иначе они укусят:

1. **`from()`/`fromTo()` и `immediateRender`.** В GSAP `from`/`fromTo` по
   умолчанию имеют `immediateRender: true` (видно в `src/gsap-core.js`,
   строки 2143 и 2160) — стартовые значения применяются **в момент сборки**
   таймлайна. Для нас это скорее хорошо: таймлайн строится в паузе, и сцена
   сразу оказывается в состоянии `t = 0`. Но если два твина трогают одно
   свойство одного элемента, поздний `fromTo` при сборке перетрёт состояние
   раннего. Конвенция: в таймлайне — только `fromTo` с явными обоими концами,
   `immediateRender` выставлять осознанно, а не по умолчанию.
2. **Единственный источник истины — `t`.** Никаких `.play()`, `.pause()`,
   `.reverse()`, `.progress()` без аргумента на боевом таймлайне: гейт — это
   не `tl.pause()`, а «перестали обновлять `t`». Иначе появляется второе
   состояние, и закон №2 обходится изнутри.

### Почему для третьего случая критична синхронная установка произвольного времени

Это уточнение стало обязательным после замера rAF: на Chrome 151 / Windows в
headed-браузере **медиана интервала кадра 18.67 мс**, а не 16.7 мс.

Критерий S2 — «перелёт гейта < 20 мс». Если бы движок умел вставать только на
границы кадров, то одна лишь дискретность кадра съедала бы почти весь бюджет:
при гейте на 6.000 с и кадрах на 5.994 / 6.013 перелёт — 13 мс, а на длинном
кадре (хвост распределения заметно выше медианы) он вышел бы за 20 мс. То есть
**S2 нельзя пройти, полагаясь на «следующий кадр окажется достаточно близко»**.

Проходится он иначе, и это требование к движку, а не к часам:

> При срабатывании гейта мы **не** отрисовываем последнее пришедшее из аудио
> время. Мы явно ставим `t = t_gate` и требуем, чтобы движок отрисовал **ровно
> эту** точку **синхронно, в том же тике**.

Тогда перелёт равен нулю по построению — независимо от того, каким получился
кадр. Отсюда два свойства, которые из «приятных» превращаются в **обязательные**:

1. Движок принимает **произвольное дробное** время, а не кратное кадру.
2. Присвоение времени приводит к **немедленному** применению состояния,
   а не к запланированному на следующий rAF.

Оба свойства проверены: у GSAP — `_lazySafeRender` внутри `totalTime()`
(раздел 1.3), у anime.js — замер «тот же тик» (раздел 3.2), у WAAPI — модель
обновляется синхронно (раздел 2.2). **У Motion на JS-пути второе свойство
отсутствует** (раздел 4.3) — это и переводит его из «спорный» в «не берём».

Побочный приятный вывод: недоезда («почти доехал») не бывает в принципе.
Промах возможен только в сторону переезда, а переезд за конец твина, как
показано в 1.5 и 3.4, даёт **точное финальное значение**.

---

## 8. Стык с часами проекта

Часы уже выбраны отдельным решением (см. `audio.md` / ADR-002): источник времени —
`AudioContext.currentTime`, позиция считается от якоря через
`getOutputTimestamp()`. Здесь фиксирую только то, что из этого следует для
движка.

**Контракт между часами и движком ровно один:**

```
rAF → позиция из AudioContext (через якорь + getOutputTimestamp)
    → tl.seek(pos)  ← единственный способ сдвинуть сцену
```

Никакой другой путь к движку не допускается — это и есть закон №2 в коде.

**Что здесь важно про кадр.** Замер на Chrome 151 / Windows: медиана интервала
rAF в headed-браузере — **18.67 мс**, то есть кадр систематически длиннее
канонических 16.7 мс. Два следствия:

1. Для S2 (перелёт гейта < 20 мс) кадр съедает почти весь бюджет, поэтому гейт
   обязан ставить `t = t_gate` явно и синхронно — разобрано в разделе 7.
2. Для S1 (дрейф < 30 мс, важен наклон) это **не** проблема: позиция каждый кадр
   вычисляется от аудио заново и подаётся абсолютным значением, а оба
   рекомендуемых движка позиционируются абсолютно (разделы 1.3 и 3.2).
   Длина кадра влияет на **плавность**, но не на **накопление** ошибки.
   Наклон drift(t) со стороны движка равен нулю по построению.

**Чего делать нельзя** (актуально, даже когда медиаэлемент не является часами):

- `timeupdate` как источник времени. MDN: «The event frequency… will be thrown
  between about 4Hz and 66Hz» — от 15 до 250 мс, плавает от нагрузки.
- Полагаться на `HTMLMediaElement.currentTime` для точного позиционирования на
  Safari: до Safari 27 значение квантуется по **250 мс**. Нас это не задевает,
  поскольку часами служит `AudioContext`, но если медиаэлемент когда-нибудь
  появится в схеме (например, `<video>` в сцене) — это мина.

**Общая осторожность к Safari оправдана и подтверждается независимо от часов.**
В разделе 2.6 собраны открытые баги WebKit, которые бьют по нашему сценарию
«часто обновляем transform»: [304741](https://bugs.webkit.org/show_bug.cgi?id=304741)
(мерцание при частых обновлениях transform), [265157](https://bugs.webkit.org/show_bug.cgi?id=265157)
(flaky разрешение стиля у приостановленной анимации), плюс баги интерполяции
`filter`. Это аргумент за то, чтобы прогонять S1/S2/S6 на реальном iOS, а не
только в Playwright WebKit на Windows (последний, как отмечено в `planning.md`,
даёт движок WebKit, но **не** мобильный Safari).

Дросселирование rAF на iOS (энергосбережение, кросс-доменные iframe) — точные
параметры на 2026 год **не выяснены**, мерить на живом устройстве.

---

## 9. Вердикт

### По каждому кандидату

**anime.js 4.5.0 — БЕРЁМ.** Единственный кандидат, который закрывает все четыре
требования из раздела 0 без оговорок и без внешних разрешений. Абсолютный seek,
точное финальное значение (`factor === 1 ? end`), синхронный рендер в том же
тике, и — главное — `engine.useDefaultMainLoop = false` даёт то самое «движок
физически не может тикать сам», которого требует закон №2, причём замер
показывает, что на паузном таймлайне rAF не планируется **вообще ни разу**
(`engine.reqId === 0`). Плюс MIT, вдвое меньший размер и самодостаточный
ESM-бандл для закона №9.

Отдельно важно с учётом замера кадра (медиана 18.67 мс): `seek()` принимает
произвольное дробное время и применяет его **синхронно, в том же тике**. Это
то самое свойство, без которого критерий S2 «перелёт гейта < 20 мс» не
проходится в принципе — см. раздел 7.

**GSAP 3.15.0 — УСЛОВНО, и условие не техническое.** Технически GSAP не хуже,
местами лучше: зрелее, документированнее, `seek()` по умолчанию глушит колбэки,
seek назад реализован явной веткой, гарантия точного финала даже строже
(пишется авторская строка целиком). Берём **только если** до начала работы над
редактором получено **письменное согласие** Webflow по процедуре из раздела III
лицензии. Без этого согласия GSAP допустим исключительно в плеере — но закон №5
(«редактор импортирует рендер из плеера») означает, что один и тот же код
поедет в обе стороны, и разделить их не выйдет.

**Motion 12.42.2 — НЕ БЕРЁМ.** Отличная лицензия и самый живой проект, но три
факта против: `.time` на JS-пути применяется через кадр внутреннего rAF (замер
подтверждает отставание), внутренний тикер публично не отключается
(`useManualTiming` и `driver` недокументированы, `attachTimeline` помечен
«internal use only»), и нет однофайловой ESM-сборки — только UMD-глобал, что
прямо конфликтует с законом №9.

**WAAPI — НЕ БЕРЁМ как основной движок.** По производительности он реабилитирован
(300 присвоений `currentTime` в кадр не стоят ничего в Chrome), точность и
семантика в порядке. Но: групповой абстракции нет и не предвидится
(`GroupEffect` не отгружен нигде, фич-энтри даже не заводили), так что «один
таймлайн» превращается в N объектов, синхронизируемых вручную — то есть мы всё
равно пишем свой движок, только без чужих граблей и без чужих решений граничных
случаев. Точный финал требует вечного `fill: 'both'` (при `fill: 'none'` элемент
в момент `t === duration` **скачком откатывается в базовое состояние** — замерено),
а `commitStyles()` в модели «плейхед ходит туда-сюда» неприменим. Плюс открытый
пять лет баг Gecko [1720631](https://bugzilla.mozilla.org/show_bug.cgi?id=1720631)
ровно на нашем сценарии. Как **низкоуровневый слой под библиотекой** — нормально
и уже используется.

**Theatre.js — НЕ БЕРЁМ, с сожалением.** Спроектирован ровно под нашу задачу
(`sequence.position` как сеттер, `createRafDriver`, готовый `attachAudio`,
редактор кривых), лицензия Apache-2.0. Но последняя публикация — май 2024,
последний коммит — апрель 2024, версия 0.x, разработка «временно» уехала в
приватный репозиторий два года назад. Фундамент на это не кладут.

**Popmotion, @okikio/animate — НЕ БЕРЁМ.** Мертвы (последние релизы 2022 и 2021).

### Ответ на прямой вопрос задания

**Да, одной таймлайн-абстракцией все три случая покрываются** — и «выезжает», и
«подсветка появляется», и «доехал и замер». Третий случай не требует ни особой
сущности, ни доснапливания: и в GSAP, и в anime.js на конце твина применяется
**авторское конечное значение**, а не результат интерполяции (`ratio === 1 →
data.e` и `factor === 1 ? end` соответственно), и время прищёлкивается к границе
твина. Гейт может стоять в любой точке после конца — элемент будет точно в
финале. Подробности и код — разделы 1.5, 3.4, 7.

### Что это решение запрещает

Самое важное здесь — то, что запрещает не выбор библиотеки, а **сама модель
ведомого таймлайна**. Это цена законов №1 и №2, и заплатить её придётся при
любом кандидате.

1. **Никакой физики и инерции.** Пружины, затухание, инерционный докрут,
   velocity-based анимации — это состояние, зависящее от истории, а не функция
   от `t`. Их нельзя перемотать назад и нельзя воспроизвести из произвольной
   точки. Всё, что попадает на таймлайн, обязано быть **чистой функцией
   времени**. Пружинку можно только запечь в кривую заранее.
2. **Никаких CSS-transition и CSS-`@keyframes` на содержимом сцены.** У них
   свои часы, которые мы не контролируем. Любая `transition: .3s` на элементе
   сцены — это скрытое нарушение закона №1, которое не поймается юнит-тестом.
   Это надо ловить линтером или тестом на computed style.
3. **Никакого генеративного и случайного движения без сида.** Кадр на времени
   `t` обязан быть одинаковым при каждом попадании в `t` (спайк S8). `Math.random()`
   внутри анимации ломает детерминизм.
4. **Никакого `<video>` как содержимого сцены** без отдельного решения: у него
   свои часы, и он станет вторым источником времени.
5. **Никаких scroll-linked анимаций** для содержимого сцены — время приходит из
   аудио, не из скролла.
6. **Никаких жестовых/перетаскиваемых элементов, живущих на таймлайне.**
   Интерактив возможен только внутри гейта, и его состояние — не часть
   таймлайна, иначе перемотка его затрёт.

Отдельно — что запрещает выбор **anime.js** конкретно:

7. **Экосистема плагинов GSAP становится недоступна.** MorphSVG, DrawSVG,
   InertiaPlugin, ScrollSmoother. Практически потеря меньше, чем кажется:
   у anime.js в ядре есть модули `svg`, `text`, `draggable`, `layout`,
   `easings`, `waapi`. Но морфинг произвольных SVG-путей уровня MorphSVG
   придётся решать самим.
8. **Коммерческой поддержки нет.** Один мейнтейнер, MIT. Худший сценарий —
   мейнтейнер пропадает, и мы форкаем 14 КБ кода, который к тому времени
   изучим. Это **ограниченный и известный** риск.

Именно эта асимметрия и определила рекомендацию: у anime.js худший случай —
«поддерживаем форк», цена известна и оплачивается нами. У GSAP худший случай —
«правообладатель считает наш редактор Prohibited Use», цена неизвестна и решение
принимаем не мы. На этапе закладки фундамента первое дешевле второго.

### Что сделать до ADR-002

- **S2 проверять правильную вещь.** С учётом медианы кадра 18.67 мс критерий
  «перелёт < 20 мс» проходится не «повезло с кадром», а явной установкой
  `t = t_gate` в момент срабатывания гейта. Спайк должен проверять именно это,
  иначе он померит качество планировщика rAF, а не движка.
- Прогнать S1 (дрейф) и S2 (точность гейта) на anime.js — оба спайка проверяют
  ровно то, что здесь утверждается по исходникам.
- Померить стоимость seek при реалистичном числе твинов (S6): для anime.js эта
  цифра **не выяснена**, для GSAP известна структурно (O(n) обход).
- Прогнать S1/S2/S6 на **реальном iOS**, не только в Playwright WebKit: у WebKit
  открыты баги ровно на частом обновлении `transform` (раздел 2.6).
- Завести правило «в кадре только пишем»: замер показывает, что
  `getComputedStyle` в том же тике удорожает кадр в 9–22 раза (раздел 2.4).
  Это касается любого движка, не только WAAPI.
- Если решим всё-таки идти на GSAP — отправить запрос в Webflow **до** написания
  первой строчки редактора, а не после.

---

## Источники

Лицензии и версии:
- GSAP standard license (Effective 2025-04-30, Last modified 2025-05-30) — https://gsap.com/community/standard-license/
- GSAP pricing — https://gsap.com/pricing/
- Webflow: «Webflow makes GSAP 100% free» — https://webflow.com/blog/gsap-becomes-free
- npm gsap — https://registry.npmjs.org/gsap
- npm animejs — https://registry.npmjs.org/animejs ; LICENSE.md — https://raw.githubusercontent.com/juliangarnier/anime/master/LICENSE.md
- npm motion / framer-motion — https://registry.npmjs.org/motion , https://registry.npmjs.org/framer-motion
- Motion+ — https://motion.dev/plus
- npm @theatre/core — https://registry.npmjs.org/@theatre/core
- GitHub API: greensock/GSAP, juliangarnier/anime, motiondivision/motion, theatre-js/theatre

API и документация:
- `gsap.updateRoot()` — https://gsap.com/docs/v3/GSAP/gsap.updateRoot()/
- `Timeline.seek()` — https://gsap.com/docs/v3/GSAP/Timeline/seek()
- anime.js `seek` — https://animejs.com/documentation/timer/timer-methods/seek
- anime.js `engine.update` / `useDefaultMainLoop` — https://animejs.com/documentation/engine/engine-methods/update , https://animejs.com/documentation/engine/engine-properties
- Motion `animate` — https://motion.dev/docs/animate
- MDN `Animation.currentTime` — https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime
- MDN `Animation.commitStyles` — https://developer.mozilla.org/en-US/docs/Web/API/Animation/commitStyles
- MDN `timeupdate` — https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event
- TypeScript `lib.dom.d.ts` (`CSSNumberish`, отсутствие `GroupEffect`) — https://github.com/microsoft/TypeScript/blob/main/src/lib/dom.generated.d.ts

Исходники, прочитанные напрямую (версии из npm-тарболов):
- `gsap@3.15.0/src/gsap-core.js` — строки 91, 116–119, 880–975, 1164, 1537–1700, 2425, 2429, 2716, 3155, 3251
- `gsap@3.15.0/src/CSSPlugin.js` — строки 27, 29
- `animejs@4.5.0/dist/modules/timer/timer.js` — строки 216–231, 373–383
- `animejs@4.5.0/dist/modules/engine/engine.js`, `core/helpers.js:156`, `core/render.js`
- `motion-dom@12.42.2/dist/es/animation/GroupAnimation.mjs:33`, `JSAnimation.mjs:251`, `NativeAnimation.mjs:123`

Спецификации и баг-трекеры:
- Web Animations Level 2, `currentTime` / «set the current time» / §6.13 Model
  liveness — https://drafts.csswg.org/web-animations-2/
- Gecko 1720631 (`currentTime` на ускоренной анимации → paint + scene build) —
  https://bugzilla.mozilla.org/show_bug.cgi?id=1720631
- Gecko 1770591 (`getAnimations()` и псевдоэлементы) —
  https://bugzilla.mozilla.org/show_bug.cgi?id=1770591
- Gecko 1917071 (`commitStyles` запускает транзишны) —
  https://bugzilla.mozilla.org/show_bug.cgi?id=1917071
- WebKit 304741 (мерцание при частых обновлениях transform), 265157 (flaky стиль
  у паузированной анимации), 223876 (WPT transform interpolation),
  167060 / 219729 / 229492 (`filter`), 235811–235814 (`backdrop-filter`),
  309272 (`commitStyles` и CSP) — https://bugs.webkit.org/
- TypeScript #54496 «`Animation.currentTime` is `CSSNumberish`», закрыт как
  Working as Intended — https://github.com/microsoft/TypeScript/issues/54496

Замеры, выполненные в ходе ресёрча:
- размеры бандлов — распаковка npm-тарболов + `gzip -9` / `zlib.brotliCompressSync`;
- поведение seek/финального состояния GSAP, anime.js, Motion, WAAPI —
  живой Chrome 150/151;
- стоимость присваивания `currentTime` (30/100/300 объектов, 100 кадров) —
  живой Chrome;
- интервал rAF (медиана 18.67 мс) — Chrome 151 / Windows, headed.

**Не выяснено** (перечислено явно, чтобы не выглядело как пробел):
- точная цифра tree-shaken GSAP-бандла (не ставил сборщик);
- стоимость seek в anime.js при сотнях твинов — **основной пробел, закрывается
  спайком S6**;
- масштаб деградации в Gecko 1720631 (в баге цифр нет);
- данные по стоимости массового `currentTime` в Safari;
- параметры дросселирования rAF на iOS в 2026 году;
- открытые баги Chromium по ручному скрабу — публичный трекер
  issues.chromium.org программно недоступен (405 на GET);
- расхождение размеров Motion: сайт заявляет 18 КБ / 2.6 КБ, замер даёт
  22.6 КБ / 3.1 КБ gzip (вероятно, brotli, но не подтверждено).
