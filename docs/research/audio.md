Дата проверки: 2026-07-27

# Аудио как единственный источник времени: что реально даёт веб в 2026

Исследование под инвариант №1 («аудио — единственный источник времени») и №4
(«гейт останавливает всё сразу, перемотки не происходит никогда»).

Контекст проверки: Safari 26.5 — текущий стабильный (вышел 2026-05-11), Safari 27 —
бета с WWDC26 (2026-06-08)
([Safari release notes / WebKit blog](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/)).
Это важно: часть фактов ниже меняется ровно между 26 и 27.

---

## 0. Краткий ответ

Источник времени — **`AudioContext`**, звук — **`AudioBufferSourceNode`** поверх
буфера, полученного из `decodeAudioData`. Не `<audio>.currentTime`.

Решающий аргумент — не теория, а конкретный баг платформы: в Safari до версии 27
`HTMLMediaElement.currentTime` обновляется **шагами по 250 мс**, см. §1.1. Это
на порядок больше бюджета «гейт с перелётом < 20 мс».

Каноническая формула — в §1.3.

---

## 1. Источник времени

### 1.1 `HTMLMediaElement.currentTime`

**Спецификация ничего не гарантирует про частоту обновления.** HTML-спека
описывает «current playback position» и «official playback position», и
единственная нормативная привязка ко времени — частота события `timeupdate`:
UA не должен слать его чаще чем раз в 15–250 мс
([HTML Standard, media elements](https://html.spec.whatwg.org/multipage/media.html)).
Само значение `currentTime` спекой не квантуется — но и не обязано быть точным.

**Firefox.** Значение загрубляется от timing-атак. `privacy.reduceTimerPrecision`
включён по умолчанию и равен **2 мс**, то есть `currentTime` всегда кратен 0.002.
При включённом `privacy.resistFingerprinting` — **100 мс**
([MDN, HTMLMediaElement.currentTime → Reduced time precision](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)).
2 мс нам не мешают (ошибка ограничена и не копится). 100 мс ломают всё, но RFP —
явный режим паранойи, в нём мы деградируем осознанно.

**Safari — вот здесь проблема.** В WebKit воспроизведение уехало в GPU-процесс, и
`currentTime` в WebContent-процессе брался из снимка состояния, который GPU-процесс
шлёт **раз в 250 мс**. Наружу это выглядело как лестница: значение стоит, потом
прыгает на четверть секунды. Исправлено только в Safari 27:

> «Fixed `HTMLMediaElement.currentTime` to report smoothly progressing values
> instead of updating only at fixed intervals.»
> — [Release Notes for Safari Technology Preview 243](https://webkit.org/blog/17953/release-notes-for-safari-technology-preview-243/),
> коммит [311867@main](https://github.com/WebKit/WebKit/commit/6bf6c9f35c739bb60113cc258516b3a12cd339c4),
> [webkit.org/b/307515](https://bugs.webkit.org/show_bug.cgi?id=307515)

Заголовок коммита: «Use a TimeProgressEstimator to interpolate
`AudioVideoRendererRemote::currentTime()` between GPU updates». Константа интервала
названа в коммите — `remoteAudioVideoRendererUpdateInterval`, **250 мс**. Формула
интерполяции, которую WebKit теперь применяет внутри:

```
cachedTime + effectiveRate * min(now - wallTime, updateInterval)
```

То есть сам браузер экстраполирует медиавремя настенными часами с клампом на один
интервал обновления. Запомним — это пригодится как эталон, если мы когда-нибудь
всё-таки будем читать время из `<audio>`.

**Chrome.** Документированного загрубления сверх общих анти-fingerprint мер не
нашёл. Blink считает медиавремя в `media::AudioClock` внутри `AudioRendererImpl`
([исходники](https://github.com/chromium/chromium/blob/master/media/renderers/audio_renderer_impl.h)),
но **точную гранулярность `currentTime` в Chrome я не выяснил** — исходник
`media/base/audio_clock.h` по доступным зеркалам не открылся. Считать это
проверенным нельзя, нужен замер.

**Вывод по §1.1.** Построить часы точностью 30 мс на 10 минутах на голом
`<audio>.currentTime` — нельзя, пока в целевой матрице есть Safari ≤ 26.x. Дрейфа
там нет (значение *есть* позиция в аудио, оно не может уехать), но квантование
250 мс превышает оба бюджета: и 30 мс на рассинхрон, и 20 мс на перелёт гейта.

Отдельно: у `<audio>` нет никакого аналога `outputLatency`, то есть компенсировать
задержку вывода (Bluetooth!) на нём нечем в принципе.

### 1.2 `AudioContext.currentTime`

Нормативно:

> «This is the time in seconds of the sample frame immediately following the last
> sample-frame in the block of audio most recently processed by the context's
> rendering graph. […] When the `BaseAudioContext` is in the "running" state, the
> value of this attribute is monotonically increasing and is updated by the
> rendering thread in uniform increments, corresponding to one render quantum.»
> — [Web Audio API 1.1, W3C](https://www.w3.org/TR/webaudio-1.1/)

Render quantum по умолчанию — 128 сэмплов
([WebAudio/web-audio-api#1170](https://github.com/WebAudio/web-audio-api/pull/1170/files)).
Значит шаг:

| sampleRate | 128 / SR |
|---|---|
| 48 000 Гц | **2.667 мс** |
| 44 100 Гц | **2.902 мс** |

(Спека отдельно приводит ≈5.805 мс как типичную `baseLatency` при 44.1 кГц — это
два кванта, двойная буферизация, а не размер кванта.)

Размер кванта с недавних пор конфигурируем (`renderSizeHint` в конструкторе,
эксперимент Chromium — [blink-dev intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/MlLqosTB0cQ)),
но нам это не нужно: 2.7 мс на порядок меньше бюджета.

**Загрубление от Spectre.** Firefox: `privacy.reduceTimerPrecision` = 2 мс по
умолчанию распространяется и на `audioCtx.currentTime`; с `resistFingerprinting` —
100 мс ([MDN, BaseAudioContext.currentTime](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)).
Про Chrome ходит утверждение «с Chrome 79 точность `ctx.currentTime` ограничена
~3 мс ради Spectre» — **первичного источника я не нашёл**, и цифра подозрительно
совпадает с 128/48000 = 2.67 мс, то есть скорее всего это просто render quantum, а
не отдельная мера. Считаю это непроверенным.

Практический итог: **загрубление нам не мешает**. Оно ограничено ~3 мс, оно не
накапливается, и главное — часы и звук здесь порождаются одним и тем же счётчиком
сэмплов, поэтому дрейф между ними структурно равен нулю. Это ровно то свойство,
ради которого написан инвариант №1.

Мониторить в Firefox: `privacy.resistFingerprinting` → 100 мс. Детектируется
замером шага `currentTime` на старте; при обнаружении — деградируем явно, а не
молча.

### 1.3 Каноническая формула позиции

Три сущности:

- `baseLatency` — «number of seconds of processing latency incurred by the
  `AudioContext` passing the audio from the `AudioDestinationNode` to the audio
  subsystem» ([spec](https://www.w3.org/TR/webaudio-1.1/)). Типично 0.00 для
  `latencyHint: "interactive"`, ~0.15 для `"playback"`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency)).
- `outputLatency` — «the interval between the time the UA requests the host system
  to play a buffer and the time at which the first sample in the buffer is actually
  processed by the audio output device» ([spec](https://www.w3.org/TR/webaudio-1.1/)).
  Зависит от железа: 0 с на встроенных динамиках/проводных, **0.178 с на Bluetooth**
  (замер в Firefox/macOS, [jamieonkeys.dev](https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/)).
- `getOutputTimestamp()` → `{ contextTime, performanceTime }`, где `contextTime` —
  «the time of the sample frame which is currently being rendered by the audio
  output device», в тех же единицах, что `currentTime`.

Поддержка ([MDN browser-compat-data, api/AudioContext.json](https://github.com/mdn/browser-compat-data/blob/main/api/AudioContext.json)):

| | Chrome | Firefox | Safari / iOS |
|---|---|---|---|
| `baseLatency` | 58 | 70 | 14.1 |
| `outputLatency` | 102 | 70 | **18.4** |
| `getOutputTimestamp` | 57 | 70 | 14.1 |

**Якорь.** При каждом старте источника запоминаем пару (контекстное время, медиавремя):

```js
// t0 выбираем с небольшим запасом вперёд, чтобы попасть в расписание
src.start(t0, offset0);          // offset0 — позиция в буфере, секунды
anchor = { ctxTime: t0, mediaTime: offset0 };
```

**Чтение позиции (playbackRate = 1):**

```
// вариант A, предпочтительный — то, что реально звучит прямо сейчас
audibleCtxTime = ctx.getOutputTimestamp().contextTime

// вариант B, если A невалиден
audibleCtxTime = ctx.currentTime - (ctx.baseLatency + ctx.outputLatency)

position = anchor.mediaTime + (audibleCtxTime - anchor.ctxTime)
position = clamp(position, 0, buffer.duration)
```

Всё остальное на экране — чистая функция от `position`. Таймлайну каждый кадр
выставляем `timeline.currentTime = position * 1000` (инвариант №2).

**Почему нужен fallback и санити-чек.** `getOutputTimestamp()` в Safari
исторически сломан: `contextTime` возвращался около нуля или примерно в 10 000 раз
меньше `currentTime`, тогда как они обязаны быть в одних единицах
([WebAudio/web-audio-api, обсуждение; wavesurfer.js#1007](https://github.com/katspaugh/wavesurfer.js/issues/1007),
[Apple Developer Forums](https://developer.apple.com/forums/thread/696356), с iOS 15.1).
Актуальный статус на 2026 **не выяснен** — поиск по bugs.webkit.org по строке
`getOutputTimestamp` не дал ни одного открытого бага, что слабое свидетельство.
Поэтому: на старте проверяем `|contextTime - currentTime| < 1` и монотонность; не
проходит — переключаемся на вариант B и логируем это громко (инвариант «чини
корень» — молча подставлять B нельзя, это должно быть видно).

Соотношение `outputLatency` и `getOutputTimestamp` спекой строго не определено:
[WebAudio/web-audio-api#2461](https://github.com/WebAudio/web-audio-api/issues/2461)
(открыт 2021-11-20, ответа редакторов нет). Суммирование `baseLatency + outputLatency`
— общепринятая трактовка (две последовательные стадии конвейера), но нормативной
формулы в спеке нет. Это надо знать.

### 1.4 Что будет, если латентность не учесть

`ctx.currentTime` — это время **конца последнего отрендеренного блока**, уже
отданного звуковой подсистеме. То, что слышно ухом в этот момент, отстаёт на
`baseLatency + outputLatency`.

Если не компенсировать — картинка уходит **вперёд** звука на эту величину:

- проводные наушники / встроенный динамик: 0–20 мс — в бюджет 30 мс попадаем случайно;
- Bluetooth: до ~180 мс — бюджет разнесён в шесть раз.

Смещение **постоянное**, оно не растёт, то есть формально «дрейф не растёт»
выполняется. Но критерий «< 30 мс» падает, и падает именно на самом массовом
мобильном сценарии — беспроводные наушники. Хуже того: гейт, привязанный к слову
транскрипта (инвариант №10), сработает *до* того, как слово прозвучит. Пользователь
увидит остановку раньше, чем услышит фразу, к которой она относится.

Отдельный нюанс: `outputLatency` меняется на лету при переключении устройства
вывода (воткнули наушники, подключили AirPods). Читать его надо каждый кадр, а не
один раз на старте. Замеры в [jamieonkeys.dev](https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/)
показывают, что значение скачет при переключении.

---

## 2. Пауза и возобновление

### 2.1 `suspend()` / `resume()` и `currentTime`

`suspend()` «suspends the progression of time in the audio context, temporarily
halting audio hardware access»; `resume()` «resumes the progression of time»
([MDN AudioContext.suspend](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend),
[MDN AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume)).
`currentTime` **замирает** на время suspend и возобновляет рост после resume
([WebAudio/web-audio-api#460](https://github.com/WebAudio/web-audio-api/issues/460),
[#361](https://github.com/WebAudio/web-audio-api/issues/361)).

Это ровно то, что нужно инварианту №4, и это очень изящно: **если контекстные часы
замерли, то якорь `(ctxTime, mediaTime)` остаётся валиден через паузу без единой
поправки.** Возобновление — не перемотка и не пересчёт, а просто продолжение той же
арифметики. Позиция физически не может уехать.

Известная шероховатость: в Chrome промис `resume()` резолвится **раньше**, чем
`currentTime` начинает расти
([Chromium 41302928](https://issues.chromium.org/issues/41302928)). Практическое
следствие для нас: **не пересчитывать якорь по `ctx.currentTime` в момент резолва
промиса.** Так как якорь и так не требует пересчёта, баг нас не задевает — но
соблазн «обновить якорь на всякий случай» надо задавить.

Чего я **не выяснил**: насколько точно реализации замораживают часы — может ли
просочиться квант-другой в момент suspend. Если просачивается, ошибка будет
копиться по циклам гейтов. Это и есть смысл критерия «20 циклов»: он ловит именно
накопление. Замерять обязательно, до кода плеера.

### 2.2 Щелчки

Щелчок берётся из разрыва волны: резкая остановка обрубает сигнал в точке, не
совпадающей с переходом через ноль, и ухо слышит скачок
([alemangui, «Web Audio: the ugly click and the human ear»](http://alemangui.github.io/ramp-to-value)).

Правильно — рампа на `GainNode`. Типичные времена:

- `setTargetAtTime(0, t, 0.015)` — экспоненциальный спад, постоянная времени 15 мс
  (рекомендация alemangui). Минус: **никогда не достигает нуля** точно, поэтому для
  жёсткого стопа не идеален.
- `exponentialRampToValueAtTime` — до нуля не умеет математически, надо целиться в
  0.0001 за ~30 мс.
- `linearRampToValueAtTime(0, t)` — доходит до нуля ровно в момент `t`. Для гейта
  это то, что надо.

Рекомендуемая схема гейта:

```js
const RAMP = 0.008;                       // 8 мс
const tGate = anchor.ctxTime + (T_gate - anchor.mediaTime);

gain.cancelAndHoldAtTime(tGate - RAMP);   // гасим незакончившийся fade-in
gain.setValueAtTime(gain.value, tGate - RAMP);
gain.linearRampToValueAtTime(0, tGate);   // тишина ровно в T_gate
// после наступления tGate:
await ctx.suspend();
position = T_gate;                        // ровно, без округления
```

**«Мгновенно по времени, но без щелчка по звуку» — не противоречие.** Это две
разные величины: логическое время проекта и огибающая амплитуды. Логические часы
останавливаются точно в `T_gate` (перелёт 0 мс — мы не измеряем позицию, мы её
утверждаем). Огибающая гасится за 8 мс, **заканчиваясь** в `T_gate`. То есть
последние 8 мс перед гейтом звучат тише — и всё. Ни одна миллисекунда контента не
проигрывается дважды и не пропускается.

Это работает именно благодаря инварианту №10: гейты привязаны к словам транскрипта,
то есть попадают в паузы между словами, где 8 мс затухания просто нечего портить.

Альтернатива (гасить *после* `T_gate`) хуже: тогда 8 мс контента прозвучат до
паузы и ещё раз после возобновления.

Возобновление — зеркально: `resume()`, затем рампа 0 → 1 за те же 8 мс, начиная с
момента возобновления.

Чего нельзя делать никогда: присваивать `gain.value = 0`. Одно такое место — и
критерий «20 циклов без щелчков» падает.

### 2.3 `AudioBufferSourceNode` нельзя перезапустить

Спека: повторный вызов `start()` на уже запущенном узле обязан бросать
`InvalidStateError`; после `stop()` узел мёртв
([Web Audio API, AudioScheduledSourceNode.start](https://www.w3.org/TR/webaudio-1.1/)).
Узел одноразовый, буфер — нет.

**Но в нашей схеме это не проблема, потому что мы вообще не вызываем `stop()`.**
Гейт — это `suspend()` контекста, а не остановка источника. Источник продолжает
«играть» в замороженном времени. За все 10 минут и все гейты — ровно один
`AudioBufferSourceNode`.

`stop()` + новый узел нужен только на аварийном пути: iOS убил контекст, контекст
пришлось пересоздать. Тогда:

```js
const src = ctx.createBufferSource();
src.buffer = buffer;                       // AudioBuffer переиспользуется, не копируется
src.start(t0, position);                   // position — сохранённая позиция, секунды
anchor = { ctxTime: t0, mediaTime: position };
```

Точность не теряется: `offset` в секундах округляется реализацией до сэмпла, это
20.8 мкс при 48 кГц. Это не перемотка в смысле инварианта №4 — мы стартуем ровно с
той позиции, на которой встали.

---

## 3. Autoplay и мобильные

### 3.1 Правила на 2026

**Chrome** ([Autoplay policy in Chrome](https://developer.chrome.com/blog/autoplay),
политика с апреля 2018, Web Audio подтянули в Chrome 71):

> «Muted autoplay is always allowed. Autoplay with sound is allowed if: the user has
> interacted with the domain (click, tap, etc.)»

Плюс Media Engagement Index на десктопе (порог по истории просмотров; условия
засчитывания: длительность > 7 с, звук не заглушён, вкладка активна, размер видео
> 200×140), плюс установленное PWA. Кросс-доменные iframe требуют явной делегации
через permissions policy.

> «If an AudioContext is created before the document receives a user gesture, it
> will be created in the "suspended" state.»

**Firefox** (с Firefox 66,
[MozillaWiki Media/block-autoplay](https://wiki.mozilla.org/Media/block-autoplay),
[hacks.mozilla.org, 2019-02](https://hacks.mozilla.org/2019/02/firefox-66-to-block-automatically-playing-audible-video-and-audio/)):
блокируется любое потенциально слышимое воспроизведение до жеста. Жестом считаются
клик мыши, нажатие печатного символа / Enter / пробела, touch. Отдельная преференция
`media.autoplay.block-webaudio` блокирует и создание работающего `AudioContext`.

**Safari**: BCD прямо помечает — «new audio contexts are suspended until the
`resume()` method is called via user action, such as the `click` event» (Safari 14.1+).

**Наше правило.** Не полагаться на autoplay вообще. `AudioContext` создаётся
**внутри** обработчика клика по кнопке «Играть», `resume()` вызывается синхронно в
том же обработчике. У плеера и так есть явная кнопка старта — конфликта с продуктом
нет.

### 3.2 iOS Safari

Что важно знать, по убыванию опасности:

**(а) Переключатель «беззвучно» глушит Web Audio, но не `<audio>`.** На iOS
HTML5-аудио идёт по media-каналу, а Web Audio — по ringer-каналу, который
переключатель отключает
([adactio.com/journal/19929](https://adactio.com/journal/19929),
[feross/unmute-ios-audio](https://github.com/feross/unmute-ios-audio),
[T301741 Wikimedia](https://phabricator.wikimedia.org/T301741)).
Для нас это потенциально фатально: половина iPhone живёт с включённым беззвучным
режимом, и озвучка молча не воспроизведётся.

Решение — **Audio Session API**: `navigator.audioSession.type = "playback"`.
Реализовано **только в Safari, с версии 16.4**
([MDN BCD, api/AudioSession.json](https://github.com/mdn/browser-compat-data/blob/main/api/AudioSession.json)),
статус спеки — W3C Working Draft от 2024-11-13
([w3.org/TR/audio-session](https://www.w3.org/TR/audio-session/)), в Chrome/Firefox
не реализовано. Типы по спеке: `auto`, `playback` («used for video or music
playback, podcasts, etc.»), `transient`, `transient-solo`, `ambient`,
`play-and-record`. Инженер WebKit говорит, что `auto` в Safari стартует как
`ambient`, а `ambient` подчиняется ringer-переключателю
([nattog.dev](https://nattog.dev/blog/web-audio-ios-unmute)).

**Прямого нормативного утверждения «`playback` игнорирует ringer switch» я в спеке
не нашёл** — только косвенное (через противопоставление с `ambient`) и практику
разработчиков. Это первый пункт списка на проверку на живом устройстве.

Старый обходной путь — крутить в фоне бесшумный трек в `<audio>`, чтобы
«перетащить» Web Audio на media-канал
([swevans/unmute](https://github.com/swevans/unmute)) — брать не хочу: это ровно
«фолбэк-заглушка», запрещённая разделом «Чини корень».

**(б) Разблокировка.** Жестом считается завершённое касание. `touchstart` в ряде
версий iOS не срабатывает — критерий выполняется только когда палец **оторван** от
экрана; надёжнее вешать разблокировку на `click`/`touchend` и продублировать
`mousedown`/`keydown` ([mattmontag.com](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos)).

**(в) Блокировка экрана / уход в фон / звонок.** `AudioContext` переходит в
состояние **`interrupted`** — «the audio context has been interrupted by an
occurrence outside the control of the web app»
([MDN BaseAudioContext.state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)).
MDN прямо пишет: «In iOS Safari, when a user leaves the page (e.g., switches tabs,
minimizes the browser, or turns off the screen) the audio context's state changes
to "interrupted" and needs to be resumed.» Известны случаи, когда после звонка
контекст **залипает** в `interrupted`
([WebAudio/web-audio-api#2585](https://github.com/WebAudio/web-audio-api/issues/2585)).

Для нас это, вообще говоря, приемлемо: интерактивное объяснение смотрят глядя в
экран, а остановка при уходе в фон — скорее фича. Но обработать надо явно:
подписка на `statechange`, при возврате — не автоматический `resume()`, а показ той
же аффорданс-кнопки, что и на гейте. Позицию при этом **не трогаем** (инвариант №4).

**(г) Задержка и глитчи Web Audio на Safari.** Открытый блокер
[webkit.org/b/221334](https://bugs.webkit.org/show_bug.cgi?id=221334): «Audio passed
through WebAudio is delayed and glitchy on Safari» — ~1 с задержки на macOS,
заикания и провалы в тишину на iOS, особенно на Bluetooth; статус NEW, severity
Blocker, последнее обновление 2022-11. Насколько он актуален на Safari 26.5 —
**не выяснено**, надо мерить.

**(д) Связка `<audio>` + `createMediaElementSource()` на Safari сломана.**
[webkit.org/b/204228](https://bugs.webkit.org/show_bug.cgi?id=204228):
«HTMLAudioElement currentTime out of sync with actual audio when linked to
AudioContext», статус NEW с 2019 года, Safari 13 … 15.1 / iOS 15.0.2. В Chrome и
Firefox того же эффекта нет. Это отдельный гвоздь в гибридную схему (§4).

Кое-что чинится в Safari 27: «Fixed `preservesPitch` and `playbackRate` were not
correctly handled on an `HTMLMediaElement` connected to an `AudioContext` via
`createMediaElementSource`» и «Fixed an issue where setting `HTMLMediaElement.volume`
had no effect when the element was connected to an `AudioContext`»
([WebKit in Safari 27 beta](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/)).
То есть исторически связка чинилась и всё ещё чинится — значит на 26.x ей доверять
рано.

### 3.3 Вкладка ушла в фон

`requestAnimationFrame` **останавливается** в скрытых вкладках и скрытых iframe
([MDN Window.requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)).
Отдельно от этого, страницы со слышимым звуком освобождены от бюджетного
троттлинга таймеров, и освобождение держится ещё несколько секунд после конца звука
([Chrome, Background tabs in Chrome 57](https://developer.chrome.com/blog/background_tabs)).
То есть: таймеры выживают, кадры — нет. Аудио при этом продолжает идти (на десктопе).

**Как мы должны себя вести.** Никак. Это и есть главный дивиденд инварианта №1:
раз всё на экране — чистая функция от позиции в аудио, то отсутствие кадров в фоне
не создаёт рассинхрона в принципе. Нечему уезжать: мы не считаем кадры и не копим
приращения.

Конкретно:
- на `visibilitychange → hidden` не делаем ничего (не паузим, не запоминаем время);
- на `visibilitychange → visible` просто рисуем один кадр из текущей позиции — то
  есть делаем ровно то же, что делаем каждый кадр;
- таймлайн получает `currentTime = position * 1000` в этом же кадре и мгновенно
  оказывается там, где надо (инвариант №2 сам решает задачу);
- никаких «догоняющих» анимаций, никакого seek.

Ловушка, которую надо запретить в код-ревью: любая логика вида «прошло N мс с
прошлого кадра». Она сломается на первом же возврате из фона. Дельты кадров не
существует, есть только позиция.

На iOS сценарий другой — контекст уходит в `interrupted` и звук встаёт (§3.2в).
Обрабатывается тем же путём, что и гейт.

---

## 4. Загрузка 10-минутного файла

### Память распакованного буфера

`AudioBuffer` хранит «non-interleaved IEEE754 32-bit linear PCM», отдельный
`Float32Array` на канал ([MDN AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer)).
`decodeAudioData` **пересэмплирует результат в sampleRate контекста**
([MDN, Basic concepts behind Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Basic_concepts_behind_Web_Audio_API)),
а тот по умолчанию равен частоте устройства вывода.

Формула: `600 с × sampleRate × каналов × 4 байта`.

| формат | сэмплов | байт | |
|---|---|---|---|
| стерео 48 кГц | 57 600 000 | 230 400 000 | **219.7 МиБ** |
| стерео 44.1 кГц | 52 920 000 | 211 680 000 | **201.9 МиБ** |
| моно 48 кГц | 28 800 000 | 115 200 000 | **109.9 МиБ** |
| моно 24 кГц | 14 400 000 | 57 600 000 | **54.9 МиБ** |

К этому в момент декодирования добавляется сжатый `ArrayBuffer` (10 минут при
96 кбит/с ≈ 7.2 МБ) и, вероятно, промежуточная копия на исходной частоте до
ресемпла. Множитель пика **не выяснен**, консервативно закладывать ×1.5–2 от
итогового буфера.

Про лимиты памяти вкладки в iOS Safari достоверных актуальных чисел я не нашёл —
попадаются только старые оценки по устройствам целиком (iPhone 6 — 645 МБ,
6s — 1 ГБ, 7 — 2 ГБ) и общий механизм Jetsam
([Apple Developer Forums](https://developer.apple.com/forums/thread/678318)). Это
**не выяснено**, и потому 220 МБ на стерео я считаю неприемлемым риском, а
110 МБ на моно — приемлемым, но требующим замера.

**Вывод: дорожка озвучки должна быть моно.** Для голоса это не потеря, а
двукратная экономия памяти. Понижение sampleRate контекста до 24 кГц
(`new AudioContext({ sampleRate: 24000 })`) даёт ещё вдвое — держим как аварийный
рычаг, но по умолчанию не берём: на iOS железо работает на 48 кГц, и принудительный
ресемпл всего графа — источник неизученных артефактов и лишней латентности.

### `decodeAudioData` целиком против стриминга

| | `decodeAudioData` + `AudioBufferSourceNode` | `<audio>` + `MediaElementAudioSourceNode` |
|---|---|---|
| время до первого звука | весь файл: скачать + декодировать | первые сотни мс |
| память | 110 МБ (моно 48к) | единицы МБ |
| точность часов | сэмпл; квант 2.7 мс | зависит от `<audio>.currentTime` → 250 мс на Safari ≤26 |
| точный seek | по сэмплам, `start(when, offset)` | через `.currentTime =`, с реальным seek |
| гейт | `ctx.suspend()`, часы замирают, якорь валиден | `.pause()`, но контекстные часы **не** замирают → якорь надо пересчитывать |
| Safari | ок | сломано: [b/204228](https://bugs.webkit.org/show_bug.cgi?id=204228) NEW |
| ringer switch на iOS | глушит, лечится `audioSession` | не глушит |

MDN явно рекомендует `AudioBuffer` только для коротких фрагментов, «typically less
than 45 s», а для длинных — `MediaElementAudioSourceNode`
([MDN AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer)).
Мы идём против этой рекомендации сознательно и с открытыми глазами: она про память,
а у нас в приоритете точность часов, и мы платим за это моно-дорожкой и экраном
загрузки.

Отдельно: **гибрид «`<audio>` как транспорт + Web Audio как часы» не работает.**
При `MediaElementAudioSourceNode` контекстные часы идут независимо от медиаэлемента:
элемент может забуферизоваться и встать, а граф продолжит крутиться на тишине —
и часы уедут ровно на длительность столла. Пришлось бы якориться от
`element.currentTime`, то есть вернуться к лестнице 250 мс. Плюс на Safari эта связка
имеет открытый баг рассинхрона. Гибрид собирает худшее с обеих сторон.

**Стоимость решения, честно.** 10 минут при 96 кбит/с моно ≈ 7.2 МБ. На мобильном
канале 5 Мбит/с это ~12 с до первого звука плюс декодирование. Значит экран загрузки
с прогрессом — обязательная часть продукта, а не недоделка. Если это окажется
неприемлемым — разговор про сегментацию дорожки, а это уже конфликт с «один файл,
одна дорожка» и повод для отдельного ADR.

---

## 5. Waveform для редактора

**wavesurfer.js** — [github.com/katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js).
Проверено 2026-07-27 через GitHub API и npm registry:

- версия **7.12.11**, лицензия **BSD-3-Clause** (совместима, ограничений нет);
- **ноль рантайм-зависимостей**;
- unpacked размер пакета 1 421 910 байт (~1.4 МБ) — но это весь пакет со всеми
  плагинами, типами и форматами сборки; минифицированный размер ядра **не выяснен**;
- проект живой: 10 353 звезды, 36 открытых issue, последний push — 2026-07-27
  (сегодня), не архивирован;
- v7 — переписан на TypeScript, Shadow DOM, плагины.

Проблема не в качестве библиотеки, а в том, что **wavesurfer — это плеер**. Он несёт
собственный транспорт, собственное управление воспроизведением и собственную
отрисовку. Взять его в редактор — значит завести вторую реализацию воспроизведения
рядом с нашим плеером, что упирается прямо в инварианты №5 и №6. Режим «только
пики» существует, но тянет за собой всё остальное.

**peaks.js** — [github.com/bbc/peaks.js](https://github.com/bbc/peaks.js).
Проверено 2026-07-27: лицензия **LGPL-3.0**, 3 403 звезды, 62 открытых issue,
последний push 2025-11-08. Два стоп-фактора:
1. LGPL в бандлируемом фронтенде юридически мутен — «динамическое связывание» в
   ESM-бандле не существует, а значит границы копилефта неочевидны. Для инварианта
   №9 (самостоятельный ESM-бандл) это прямой риск.
2. Штатный путь — генерировать пики бэкендом `bbc/audiowaveform`; вариант «считать
   в браузере через Web Audio» сами авторы называют пригодным только для коротких
   файлов и CPU-затратным.

**Свой рендер пиков.** У нас уже есть распакованный `AudioBuffer` в памяти (§4) —
тот самый, из которого играет плеер. Пики — это один проход по `Float32Array`:
на каждый пиксель ширины берём min/max в бакете. Для 10 минут моно 48 кГц это
28.8 млн сэмплов, один линейный проход; для UI-отзывчивости — в Worker с передачей
буфера как transferable. `OfflineAudioContext` для этого не нужен вовсе: он полезен
только если мы захотим сначала понизить частоту.

Ориентировочно это ~100 строк без зависимостей, и оно автоматически согласовано с
плеером — рисуем ровно тот сигнал, который звучит.

Оценка времени прохода (десятки мс) — **моя оценка, не замер**.

---

## 6. Что нужно измерить до первой строчки кода плеера

Порядок важен: каждый пункт может развернуть решение.

1. `navigator.audioSession.type = "playback"` — действительно ли Web Audio звучит
   на iPhone с включённым беззвучным переключателем. Safari 16.4+. **Если нет —
   вся схема под вопросом, надо возвращаться к `<audio>`.**
2. Расход памяти и время `decodeAudioData` для 10-минутного моно на среднем iPhone.
3. Дрейф `position` относительно `getOutputTimestamp().contextTime` за 10 минут
   без гейтов — критерий < 30 мс, не растёт.
4. То же самое, но с 20 циклами гейтов — ловим накопление ошибки на `suspend`.
5. Валидность `getOutputTimestamp()` на Safari 26.5 (§1.3): в единицах ли она.
6. Актуальность [b/221334](https://bugs.webkit.org/show_bug.cgi?id=221334)
   (глитчи Web Audio) на Safari 26.5, обязательно на Bluetooth.
7. Гранулярность `<audio>.currentTime` в Chrome — для понимания, есть ли у нас
   вообще запасной вариант.

---

## Вердикт

**`AudioContext.currentTime` как источник времени — берём.** Единственный вариант,
у которого дрейф относительно звука равен нулю структурно, а не по договорённости:
часы и звук порождает один счётчик сэмплов. Квант 2.7 мс, загрубление ≤3 мс,
ошибка ограничена и не накапливается.

**`decodeAudioData` + `AudioBufferSourceNode` — берём, условно.** Условие: дорожка
**моно**, и замеры п.2 и п.3 из §6 проходят. Плата — ~110 МБ памяти и экран
загрузки на ~10–15 с на мобильном канале. Покупаем на это точность, точный гейт
без перемотки и одну реализацию транспорта.

**`HTMLMediaElement.currentTime` как источник времени — не берём.** В Safari ≤26.x
он обновляется шагами 250 мс (константа `remoteAudioVideoRendererUpdateInterval`,
исправлено только в Safari 27, коммит 311867@main). Это в 12 раз больше бюджета
перелёта гейта. К моменту, когда Safari 27 разойдётся по устройствам, решение можно
пересмотреть — но не сейчас и не в v1.

**Гибрид `<audio>` + `MediaElementAudioSourceNode` — не берём.** Контекстные часы не
привязаны к позиции медиаэлемента, любой стролл разъезжает их навсегда; плюс
открытый баг рассинхрона в Safari ([b/204228](https://bugs.webkit.org/show_bug.cgi?id=204228)).

**Гейт как `ctx.suspend()` / `ctx.resume()` — берём.** Часы замирают, якорь
`(ctxTime, mediaTime)` переживает паузу без пересчёта, перемотки не существует в
принципе — инвариант №4 выполняется конструктивно, а не проверкой.

**Компенсация латентности — берём.** `getOutputTimestamp().contextTime` с санити-чеком,
иначе `currentTime - (baseLatency + outputLatency)`, читаем каждый кадр. Без неё
Bluetooth даёт до 180 мс постоянного опережения картинки.

**Рампа гейна 8 мс на гейте — берём.** `linearRampToValueAtTime(0, tGate)`, спад
заканчивается ровно в `T_gate`. `gain.value = 0` — запрещено.

**Audio Session API (`type = "playback"`) на iOS — берём, условно.** Условие: п.1
из §6 подтверждается на устройстве. Только Safari 16.4+, в других браузерах вызов
безвреден. Обходной путь с бесшумным `<audio>` — не берём, это заглушка.

**wavesurfer.js — не берём.** Лицензия и живость в порядке (BSD-3-Clause, 7.12.11,
push сегодня), но это второй плеер рядом с нашим — инварианты №5 и №6.

**peaks.js — не берём.** LGPL-3.0 в бандлируемом ESM + зависимость от бэкенда
`audiowaveform`.

**Свой расчёт пиков — берём.** Один проход по уже имеющемуся `AudioBuffer` в Worker.
Ноль зависимостей, ноль ADR, автоматическая согласованность с тем, что звучит.

### Что это решение запрещает

- **Запрещает стриминг звука.** Первый звук — только после полной загрузки и
  декодирования файла. Экран загрузки с прогрессом становится обязательной частью
  продукта.
- **Запрещает стерео в дорожке озвучки** (до тех пор, пока замеры памяти не скажут
  обратного). Моно — не «пока что», а следствие выбора.
- **Запрещает дорожки существенно длиннее 10 минут.** Память растёт линейно:
  каждая минута моно 48 кГц — это 11 МБ. 30 минут — уже 330 МБ, за пределом.
- **Запрещает считать что-либо от дельты кадров.** Никаких `deltaTime`, никаких
  «прошло N мс с прошлого кадра», никаких накопительных сумм. Только позиция.
- **Запрещает автостарт.** `AudioContext` создаётся внутри обработчика жеста, и
  никак иначе. Плеер без явной кнопки «Играть» невозможен.
- **Запрещает фоновое воспроизведение на iOS.** Экран погас — контекст в
  `interrupted`, звук встал. Продукт должен трактовать это как обычную паузу, а не
  как ошибку.
- **Запрещает `gain.value = ...` где бы то ни было в аудиотракте.** Только
  автоматизация `AudioParam` с рампой.
- **Запрещает второй транспорт в редакторе.** Редактор играет тем же плеером
  (инвариант №5), waveform — это картинка над тем же буфером, а не отдельный
  проигрыватель.
- **Запрещает молчаливые фолбэки.** Сломанный `getOutputTimestamp`, отсутствующий
  `outputLatency`, `resistFingerprinting` со 100 мс — всё это переводит плеер в
  явно деградированный режим с громкой диагностикой, а не тихо подменяется.

---

## Источники

Спецификации:
- [Web Audio API 1.1, W3C](https://www.w3.org/TR/webaudio-1.1/) — `currentTime`, render quantum, `baseLatency`, `outputLatency`, `getOutputTimestamp`, `start()`
- [Web Audio API, Editor's Draft](https://webaudio.github.io/web-audio-api/)
- [HTML Standard, media elements](https://html.spec.whatwg.org/multipage/media.html) — playback position, `timeupdate` 15–250 мс
- [Audio Session, W3C WD 2024-11-13](https://www.w3.org/TR/audio-session/) — типы сессий

MDN:
- [HTMLMediaElement.currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime) — reduced time precision, Firefox 2 мс / 100 мс
- [BaseAudioContext.currentTime](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)
- [BaseAudioContext.state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state) — `interrupted`
- [AudioContext.baseLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency), [AudioContext.suspend](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend), [AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume)
- [AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) — Float32, «< 45 s»
- [Window.requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [browser-compat-data, api/AudioContext.json](https://github.com/mdn/browser-compat-data/blob/main/api/AudioContext.json), [api/AudioSession.json](https://github.com/mdn/browser-compat-data/blob/main/api/AudioSession.json) — версии, проверено 2026-07-27

Браузеры:
- [WebKit in Safari 27 beta, WWDC26](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/) (2026-06)
- [Safari Technology Preview 243 release notes](https://webkit.org/blog/17953/release-notes-for-safari-technology-preview-243/) — фикс `currentTime`
- [WebKit commit 311867@main](https://github.com/WebKit/WebKit/commit/6bf6c9f35c739bb60113cc258516b3a12cd339c4) — `TimeProgressEstimator`, 250 мс
- [webkit.org/b/204228](https://bugs.webkit.org/show_bug.cgi?id=204228) — `currentTime` рассинхрон с `AudioContext`, NEW
- [webkit.org/b/221334](https://bugs.webkit.org/show_bug.cgi?id=221334) — Web Audio delayed/glitchy, NEW, Blocker
- [Autoplay policy in Chrome](https://developer.chrome.com/blog/autoplay)
- [Background tabs in Chrome 57](https://developer.chrome.com/blog/background_tabs)
- [Chromium 41302928](https://issues.chromium.org/issues/41302928) — `resume()` резолвится раньше часов
- [MozillaWiki Media/block-autoplay](https://wiki.mozilla.org/Media/block-autoplay), [hacks.mozilla.org 2019-02](https://hacks.mozilla.org/2019/02/firefox-66-to-block-automatically-playing-audible-video-and-audio/)
- [bugzilla 1053011](https://bugzilla.mozilla.org/show_bug.cgi?id=1053011) — выравнивание `currentTime` по блокам, FIXED в Firefox 44

Практика:
- [alemangui, «Web Audio: the ugly click and the human ear»](http://alemangui.github.io/ramp-to-value) — рампы, 15 мс / 30 мс
- [jamieonkeys.dev, output latency](https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/) — замеры, Bluetooth 0.178 с
- [web.dev, Synchronize audio and video playback](https://web.dev/articles/audio-output-latency)
- [adactio.com/journal/19929](https://adactio.com/journal/19929), [nattog.dev](https://nattog.dev/blog/web-audio-ios-unmute), [feross/unmute-ios-audio](https://github.com/feross/unmute-ios-audio) — ringer switch на iOS
- [mattmontag.com, unlock Web Audio](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos) — жесты разблокировки
- [WebAudio/web-audio-api#460](https://github.com/WebAudio/web-audio-api/issues/460), [#361](https://github.com/WebAudio/web-audio-api/issues/361) — `currentTime` при suspend
- [WebAudio/web-audio-api#2461](https://github.com/WebAudio/web-audio-api/issues/2461) — `outputLatency` vs `getOutputTimestamp`, без ответа с 2021
- [WebAudio/web-audio-api#2585](https://github.com/WebAudio/web-audio-api/issues/2585) — залипание в `interrupted` на Safari
- [katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js), [npm](https://registry.npmjs.org/wavesurfer.js/latest) — 7.12.11, BSD-3-Clause, проверено 2026-07-27
- [bbc/peaks.js](https://github.com/bbc/peaks.js) — LGPL-3.0, проверено 2026-07-27

### Не выяснено

- Точная гранулярность `HTMLMediaElement.currentTime` в Chrome.
- Актуальный статус `getOutputTimestamp()` в Safari 26.5 (был сломан с iOS 15.1).
- Нормативное подтверждение, что `audioSession.type = "playback"` обходит ringer switch.
- Лимит памяти вкладки в современном iOS Safari.
- Пиковый множитель памяти во время `decodeAudioData`.
- Точность заморозки `currentTime` при `suspend()` — просачивается ли квант.
- Минифицированный размер ядра wavesurfer.js v7.
- Актуальность webkit.org/b/221334 на Safari 26.5.
