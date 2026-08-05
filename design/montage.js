/*
  МОНТАЖ: дорожка, переходы и карта. Сессия 21.

  Классический скрипт, как и main.js: страница обязана открываться двойным
  щелчком с file://, а ES-модули оттуда не грузятся.

  Отдельным файлом от main.js намеренно. Тот про КАНВУ — что стоит на сцене,
  результат проверяется скриншотом. Этот про МОНТАЖ — когда и как быстро,
  результат проверяется прогоном во времени (strategy.md §2). Разные предметы,
  разные инварианты, разная цена ошибки.

  ЗДЕСЬ ЖИВЁТ МОДЕЛЬ, А НЕ АНИМАЦИЯ МАКЕТА — то же правило §16, что в main.js:
  макет без названной сущности под ним это обещание, которое нечем исполнить.
  Поэтому:

    · состояние дорожки НЕ переключается тумблером «покажи пустое». Часть
      «Разбор» — настоящая пустая ветка, у неё действительно нет звука,
      и `idle` на дорожке ПРОИСХОДИТ, а не изображается. Ровно тем же
      способом, каким в Сессии 20 сирота цвета не рисовалась, а случалась;

    · «разрезать нельзя» считает причину функцией, зеркальной продуктовой
      `splitBlockedReason` (editor/src/state/split.ts:356), а не помечено
      в данных флажком;

    · верхняя граница длительности перехода СЧИТАЕТСЯ от предыдущего слайда.
      Окно движения кончается на метке (ADR-020), значит удлинение уводит
      начало назад и обязано упереться. Число в подсказке — посчитанное;

    · миниатюры слайдов рисуются из `states` — списка состояний элементов,
      как в SlideSchema. В продукте их рисует `ScenePreview` из плеера,
      тот же, что обе сцены редактора: инвариант №5 запрещает второй рендер,
      и поэтому миниатюры на карте бесплатны.

  Разбор — docs/strategy.md. Система канвы — docs/design/system.md.
  Находки этой сессии — docs/session-21-journal.md.
*/
(function () {
  'use strict';

  // ==========================================================================
  // КАТАЛОГ ПЕРЕХОДОВ
  //
  // Решение владельца 05.08.2026: переходы важны, вопрос — как сделать их
  // под формат слайдов, не уступая видеоредакторам. Это ОТМЕНА запрета,
  // стоявшего в strategy.md §2, и записана она именно так.
  //
  // Снято с натуры у Canva («Редактировать как видео» → стык между
  // страницами): каталог из десяти, «Нет вариантов» ПЕРВЫМ, у выбранного
  // настраивается ровно одно — продолжительность в секундах, по умолчанию 0.5.
  // Плавности (easing) в их интерфейсе НЕТ. Значит потеря v2→v3 возвращается
  // наполовину: длительность да, `ease` нет.
  //
  // `by` — чем приём делается, и это не пояснение, а пропуск через инвариант
  // №8 (анимируем только transform, opacity, filter):
  //
  //   'ok'      — законен и измерять нечего;
  //   'measure' — выразим законно, но НЕ ТАК, как делает Canva, и способ
  //               не проверен прогоном. Догадка, пока не измерено;
  //   'cost'    — законен, но у него названная цена.
  // ==========================================================================
  var TRANSITIONS = [
    { id: 'cut', label: 'Срез', by: 'ничем', law: 'ok', fixed: 0,
      note: 'Мгновенно. Длительности нет и быть не может — это не переход, ' +
            'а её отсутствие. Стоит первым, потому что «нет перехода» — ' +
            'запись каталога, а не пустой выбор.' },

    { id: 'morph', label: 'Морфинг', by: 'transform поэлементно', law: 'ok',
      note: 'Элементы едут из состояния в состояние. Единственный, что есть ' +
            'сегодня; у Canva это «Сопоставление» — седьмой пункт из десяти, ' +
            'то есть у них морфинг тоже запись каталога, а не режим.' },

    { id: 'fade', label: 'Растворение', by: 'opacity', law: 'ok',
      note: 'Прежняя сцена гаснет, новая проступает.' },

    { id: 'slide', label: 'Сдвиг', by: 'transform', law: 'ok', directional: true,
      note: 'Сцена уезжает, новая приезжает следом.' },

    { id: 'scale', label: 'Масштаб', by: 'transform', law: 'ok',
      note: 'Новая сцена наплывает из глубины.' },

    { id: 'wipe', label: 'Штора', by: 'transform плашки', law: 'measure', directional: true,
      note: 'У Canva это clip-path, а его в ANIMATABLE нет и по инварианту №8 ' +
            'быть не должно — уводит с композитора. Плашкой, которая едет ' +
            'по кадру, приём выразим на transform. Оба способа звучат ' +
            'правдоподобно, и это ровно тот случай, когда правдоподобное ' +
            'проверяется прогоном, а не рассуждением.' },

    { id: 'iris', label: 'Круг', by: 'transform круга', law: 'measure',
      note: 'То же, что «Штора»: у Canva круговое стирание, у нас — круг, ' +
            'который растёт масштабом. Не измерено.' },

    { id: 'blur', label: 'Размытие', by: 'filter: blur', law: 'cost',
      note: 'Законен по №8, но filter: blur не равноправен остальным: ' +
            'измерено, что он удваивает длину худшего кадра. На 15 элементах ' +
            'запас есть (58.8 fps при пороге 55), при росте числа блюров ' +
            'исчезнет первым.' }
  ];

  // Направление есть не у всех приёмов, и это не «пока не сделали»:
  // у растворения его не бывает. Поэтому переключатель НЕ СОЗДАЁТСЯ,
  // а не гаснет, — иначе он обещал бы направление там, где его нет.
  var DIRECTIONS = [
    { id: 'left',  glyph: '←', label: 'Влево' },
    { id: 'right', glyph: '→', label: 'Вправо' },
    { id: 'up',    glyph: '↑', label: 'Вверх' },
    { id: 'down',  glyph: '↓', label: 'Вниз' }
  ];

  var LAW_LABEL = {
    ok: 'законен по №8',
    measure: 'нужен замер',
    cost: 'законен, но с ценой'
  };

  // Умолчание Canva — 0.5 c. У нас сегодня MORPH_DURATION_S = 0.6
  // (player/src/morph.ts:28), и это число остаётся нашим: менять его заодно
  // с заведением каталога значило бы поменять вид всех 80 эталонов молча.
  var DEFAULT_SECONDS = 0.6;

  // ==========================================================================
  // МОДЕЛЬ ЧАСТЕЙ — ЗЕРКАЛО СХЕМЫ
  //
  // Поля названы как в schema.ts, включая те, которых там ПОКА нет:
  // `about` — это описание части, которого в SegmentSchema не существует.
  // ADR-022 его отверг, и отверг УСЛОВНО: «поле, которое никто не читает».
  // Карточка карты его читает, значит посылка отказа отпала. Решение
  // владельца 05.08.2026: проектируем в v9, не внедряем.
  //
  // `states` слайда — список состояний элементов, а не список элементов
  // (ADR-015). Поэтому переход между соседними слайдами вычисляется сам,
  // и поэтому миниатюра слайда рисуется из его же состояний.
  // ==========================================================================
  var PART_W = 1920, PART_H = 1080;

  function st(x, y, w, h, role) { return { x: x, y: y, w: w, h: h, role: role }; }

  var SEGMENTS = [
    {
      id: 'intro',
      title: 'Зачем производная',
      about: 'Ведём от «скорости» к касательной. В конце спрашиваем, понял ли зритель.',
      audio: { src: 'demo.mp3', duration: 107.2, hasWords: true },
      words: ['и', 'тогда', 'касательная', 'в', 'этой', 'точке', 'становится', 'той',
              'самой', 'скоростью', 'о', 'которой', 'мы', 'говорили'],
      slides: [
        { id: 's1', at: 0,    transition: 'cut',   seconds: 0,
          states: { title: st(150,130,900,120,'ink') } },
        { id: 's2', at: 14,   transition: 'morph', seconds: 0.6,
          states: { title: st(150,130,900,120,'ink'), lead: st(150,290,880,180,'muted') } },
        { id: 's3', at: 31,   transition: 'morph', seconds: 0.6,
          states: { title: st(150,90,700,100,'ink'), lead: st(150,250,880,180,'muted'),
                    card: st(1180,230,520,520,'surface') } },
        { id: 's4', at: 52,   transition: 'fade',  seconds: 0.5,
          states: { title: st(150,90,700,100,'ink'), card: st(1180,230,520,520,'surface'),
                    dot: st(1300,390,220,220,'accent') } },
        { id: 's5', at: 78,   transition: 'morph', seconds: 1.2,
          states: { title: st(150,90,700,100,'ink'), dot: st(700,420,300,300,'accent'),
                    caption: st(150,830,820,70,'muted') } },
        { id: 's6', at: 96,   transition: 'cut',   seconds: 0,
          states: { caption: st(150,400,1600,200,'ink') } }
      ],
      gates: [
        { id: 'g1', at: 41, kind: 'choice', prompt: 'Что такое производная?',
          options: [{ id: 'o1', label: 'Скорость изменения' }, { id: 'o2', label: 'Площадь под кривой' }],
          correctId: 'o1', recordAs: 'znaet', onWrong: 'inline-hint' },
        { id: 'g2', at: 103, kind: 'choice', prompt: 'Понятно про касательную?',
          options: [{ id: 'yes', label: 'Да, понятно' }, { id: 'no', label: 'Нет, объясни ещё раз' }],
          correctId: null, recordAs: 'ponyal', onWrong: 'continue' }
      ],
      exit: {
        rules: [{ id: 'r1', text: 'ответ «Да, понятно»', variable: 'ponyal', goto: 'examples' }],
        default: 'razbor'
      }
    },

    {
      id: 'examples',
      title: 'Примеры',
      about: 'Три бытовых примера: спидометр, температура, курс.',
      audio: { src: 'demo.mp3', duration: 52.4, hasWords: true },
      words: ['спидометр', 'показывает', 'производную', 'пути', 'по', 'времени'],
      slides: [
        { id: 'e1', at: 0,  transition: 'cut',   seconds: 0,
          states: { title: st(150,130,900,120,'ink') } },
        { id: 'e2', at: 18, transition: 'slide', seconds: 0.5,
          states: { title: st(150,130,900,120,'ink'), card: st(1100,300,600,400,'surface') } },
        { id: 'e3', at: 37, transition: 'morph', seconds: 0.6,
          states: { title: st(150,130,900,120,'ink'), dot: st(800,500,240,240,'accent') } }
      ],
      gates: [],
      exit: { rules: [], default: 'final' }
    },

    {
      // ПУСТАЯ ВЕТКА. Родилась разрезом и не наполнена — узкое место,
      // названное в product.md §5 («Новая ветка рождается пустой»).
      // Звука у неё НЕТ по-настоящему, поэтому дорожка встаёт в `idle`
      // не по флажку, а по данным.
      id: 'razbor',
      title: 'Разбор',
      about: '',
      audio: null,
      words: [],
      slides: [
        { id: 'r1', at: 0, transition: 'cut', seconds: 0,
          states: { title: st(150,130,900,120,'ink') } }
      ],
      gates: [],
      exit: { rules: [], default: 'intro' }
    },

    {
      id: 'final',
      title: 'Итог',
      about: 'Собираем сказанное в одну формулировку.',
      audio: { src: 'demo.mp3', duration: 24.8, hasWords: false },
      words: [],
      slides: [
        { id: 'f1', at: 0,  transition: 'cut',   seconds: 0,
          states: { title: st(150,400,1600,200,'ink') } },
        { id: 'f2', at: 12, transition: 'scale', seconds: 0.8,
          states: { title: st(150,300,1600,200,'ink'), caption: st(150,600,1400,120,'muted') } }
      ],
      gates: [],
      exit: { rules: [], default: null }
    }
  ];

  var ENTRY = 'intro';

  var ROLE_COLOR = {
    ink: 'var(--scene-ink, #e8eef6)',
    muted: 'var(--scene-ink-muted, #93a4b8)',
    accent: 'var(--scene-accent, #4c8dff)',
    surface: 'var(--scene-surface, #1b2430)'
  };

  // ==========================================================================
  // ВИД
  // ==========================================================================
  var view = 'line';           // 'line' | 'map'
  var currentId = 'intro';
  var position = 12.48;        // секунда головки
  var trackState = 'ready';    // idle | loading | ready | failed
  var loadTimer = null;
  var selected = null;         // { kind:'slide'|'gate'|'transition', id }
  var mapPanel = null;         // какой узел раскрыт на карте

  /**
   * Масштаб дорожки. НЕ УДОБСТВО, А НЕСУЩАЯ ЧАСТЬ — измерено на этом же
   * прототипе: при масштабе ×1 хвост перехода длиной 0.6 c из 107 c дал
   * ШИРИНУ 7.2 px. Это половина процента ширины полосы: стык нельзя ни
   * разглядеть, ни попасть по нему. Без масштаба переходы неадресуемы
   * в принципе, а не «неудобны».
   *
   * У CapCut ползунок масштаба стоит в правом углу панели дорожки, и до
   * замера я считал его удобством. Число объяснило, почему он там есть.
   */
  var zoom = 1;
  var ZOOMS = [1, 2, 4, 8, 16];

  /**
   * Что выделено НА СЦЕНЕ. Приходит событием из main.js, меняется только там.
   *
   * Выделение на сцене — это элементы; метки на дорожке — слайды и остановки.
   * Разные сущности, и приравнивать их нельзя. Поэтому дорожка отвечает
   * на выделение ПОДСВЕТКОЙ, а не выделением: светятся слайды, где хоть один
   * выделенный элемент меняет состояние. Считается из `Slide.states` —
   * это `record` по id элемента, ноль по схеме.
   *
   * Обратной связи нет намеренно: выбор слайда выделение элементов не трогает.
   * Иначе две зоны начали бы спорить, кто хозяин выделения.
   */
  var sceneSelection = [];

  function segment(id) {
    return SEGMENTS.filter(function (s) { return s.id === id; })[0];
  }
  function current() { return segment(currentId); }

  // ==========================================================================
  // ПРАВИЛА, КОТОРЫЕ СЧИТАЮТСЯ, А НЕ ПОМЕЧЕНЫ
  // ==========================================================================

  /**
   * Почему разрезать нельзя. Зеркало `splitBlockedReason`
   * (editor/src/state/split.ts:356): функция возвращает СТРОКУ-причину
   * или undefined, а не булево. Разница несущая — по находке 4 этой сессии
   * погашенное управление обязано назвать, чего не хватает, иначе автор
   * читает его как поломку.
   */
  function splitBlockedReason(seg, gate) {
    if (!gate) return 'Выберите остановку: резать можно только по ней, а не по секунде';
    if (!seg.audio) return 'У части нет звука — резать нечего';
    var last = seg.gates[seg.gates.length - 1];
    if (gate.id !== last.id) {
      return 'Развилка обязана быть последней в части: она срабатывает ' +
             'на конце дорожки, а не в момент ответа';
    }
    if (gate.correctId !== null) {
      return 'Это вопрос, а не развилка: у него есть верный ответ. ' +
             'Разрез делит повествование по РАВНОПРАВНЫМ веткам';
    }
    return undefined;
  }

  /**
   * Верхняя граница длительности перехода — расстояние до предыдущего слайда.
   *
   * Не перестраховка. Окно движения кончается НА метке (ADR-020), поэтому
   * удлинение уводит НАЧАЛО назад. Хвост, налезший на предыдущий слайд, —
   * это переход, начавшийся раньше, чем закончился прошлый; сцена поехала бы
   * из состояния, которого зритель ещё не видел.
   */
  function maxSeconds(seg, slide) {
    var index = seg.slides.indexOf(slide);
    if (index <= 0) return 0;
    return Math.round((slide.at - seg.slides[index - 1].at) * 10) / 10;
  }

  /**
   * Длительность части. Без звука её НЕТ — ноль, а не «сколько-нибудь».
   *
   * Здесь стоял Math.max(метки, 1), и он печатал пустой ветке «00:01.0» —
   * правдоподобное число, взявшееся из страховки от деления на ноль.
   * Страховка своё место имеет, но не в том, что показывают автору:
   * «часть длиной секунда» и «части нет» — разные вещи.
   */
  function duration(seg) { return seg.audio ? seg.audio.duration : 0; }

  /** Знаменатель для раскладки полос. Страховка от нуля живёт ЗДЕСЬ,
   *  где её никто не прочитает как факт о проекте. */
  function scaleOf(seg) { return duration(seg) || 1; }

  /** Пустая ли ветка — считается, а не помечается. */
  function isEmpty(seg) { return !seg.audio; }

  /** Остановка, на которой стоит головка (в пределах полсекунды). */
  function gateAt(seg, seconds) {
    return seg.gates.filter(function (g) {
      return seconds >= g.at && seconds < g.at + 6;
    })[0];
  }

  function transitionById(id) {
    return TRANSITIONS.filter(function (t) { return t.id === id; })[0];
  }

  function fmt(seconds) {
    var safe = Math.max(0, seconds);
    var m = Math.floor(safe / 60);
    var rest = safe - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (rest < 10 ? '0' : '') + rest.toFixed(1);
  }

  // Шаг делений — тот же набор, что в TrackView.tickStep.
  function tickStep(total, width) {
    var candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
    var wanted = (total * 90) / Math.max(width, 1);
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] >= wanted) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  // ==========================================================================
  // Помощники разметки
  // ==========================================================================
  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(cls, label, onClick, reason) {
    var node = make('button', cls, label);
    node.type = 'button';
    if (onClick) {
      node.addEventListener('click', onClick);
    } else {
      // Гаснет, а не прячется, И НЕСЁТ ПРИЧИНУ. Второе — находка 4:
      // у CapCut погашенный список расшифровки говорит «No tracks»,
      // а не просто сереет. Погашенное без причины читается как поломка.
      node.disabled = true;
      if (reason) node.title = reason;
    }
    return node;
  }

  var host = {};
  ['track-bar', 'track-lanes', 'mapmode', 'map-board', 'map-side', 'gate-layer',
   'mont-panel', 'mont-note'].forEach(function (id) {
    host[id] = document.getElementById(id);
  });

  // ==========================================================================
  // ДОРОЖКА
  //
  // Пять полос сверху вниз: линейка · звук · слайды · остановки · расшифровка.
  // У каждой полосы ГОЛОВА СЛЕВА со своим именем — приём CapCut, снятый
  // с натуры: там же живут кнопки полосы и там же называется причина,
  // когда полоса пуста.
  //
  // Слайды и остановки разъехались по РАЗНЫМ полосам, хотя сегодня в продукте
  // лежат в одной (MarksLane берёт marks с kind). Причина: слайдов много,
  // остановок единицы, и в общей полосе остановка теряется среди ромбов —
  // а она смысловой хребет, на ней стоит весь интерактив. MarkKind их уже
  // различает, так что это перестановка вида, а не модели.
  // ==========================================================================

  /**
   * Перетаскивание левого конца хвоста.
   *
   * Во время жеста НИЧЕГО НЕ ПЕРЕРИСОВЫВАЕТСЯ целиком: полная отрисовка
   * заменила бы узел, за который держится указатель, и жест оборвался бы
   * на первом же движении. Меняются стили того же узла, а `render()`
   * вызывается один раз на `pointerup`.
   *
   * Это ровно то разделение, что у продукта: `onMove` зовётся многократно
   * за жест, а точку истории ставит `onMoveEnd` (MarksLane, срез 2).
   * Перетаскивание обязано быть ОДНИМ шагом истории, а не одним на каждое
   * движение указателя.
   */
  function startDrag(slide, tail, total, body) {
    var seg = current();
    var cap = maxSeconds(seg, slide);
    var rect = body.getBoundingClientRect();
    var label = tail.querySelector('.tail__label');

    function apply(clientX) {
      // Прямоугольник меряется в начале жеста и не перемеряется: полосу
      // нельзя прокрутить, пока указатель захвачен. Если это изменится —
      // мерить заново на каждое движение, как делает seekToPointer.
      var seconds = slide.at - (clientX - rect.left) / rect.width * total;
      seconds = Math.max(0.1, Math.min(cap, Math.round(seconds * 10) / 10));
      slide.seconds = seconds;
      tail.style.left = ((slide.at - seconds) / total * 100) + '%';
      tail.style.width = (seconds / total * 100) + '%';
      if (label) label.textContent = transitionById(slide.transition).label;
      var out = document.querySelector('.mont-range__value');
      if (out) out.textContent = seconds.toFixed(1);
      var range = document.querySelector('.mont-range');
      if (range) range.value = String(seconds);
    }

    function move(event) { apply(event.clientX); }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.body.classList.remove('mt-dragging');
      render();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.body.classList.add('mt-dragging');
    selected = { kind: 'transition', id: slide.id };
  }

  function laneHead(name, sub, extra) {
    var head = make('div', 'mt-lane__head');
    head.appendChild(make('span', 'mt-lane__name', name));
    if (sub) head.appendChild(make('span', 'mt-lane__sub', sub));
    if (extra) head.appendChild(extra);
    return head;
  }

  function drawBar() {
    var seg = current();
    var bar = host['track-bar'];
    bar.textContent = '';

    var playable = trackState === 'ready';
    bar.appendChild(button('mont-btn mont-btn--play', '▶',
      playable ? function () {} : null,
      trackState === 'idle' ? 'Звука у этой части нет' :
      trackState === 'loading' ? 'Читаю запись' : 'Дорожка не загрузилась'));

    var clock = make('code', 'mont-clock',
      fmt(position) + ' / ' + fmt(duration(seg)));
    if (!playable) clock.classList.add('mont-clock--off');
    bar.appendChild(clock);

    bar.appendChild(make('span', 'mont-spacer'));

    // «Разрезать» — причина считается, а не помечена.
    var gate = selected && selected.kind === 'gate'
      ? seg.gates.filter(function (g) { return g.id === selected.id; })[0]
      : null;
    var blocked = splitBlockedReason(seg, gate);
    bar.appendChild(button('mont-btn', 'Сделать развилкой',
      blocked ? null : function () { toMap(seg.id); }, blocked));

    bar.appendChild(button('mont-btn', 'Поставить остановку', function () {}));

    // Масштаб — справа, как у CapCut. Кнопки, а не ползунок: ступени
    // именованы, и «×4» это адрес, к которому можно вернуться, а положение
    // ползунка — нет.
    var at = ZOOMS.indexOf(zoom);
    bar.appendChild(make('span', 'mont-sep'));
    bar.appendChild(button('mont-btn', '−',
      at > 0 ? function () { zoom = ZOOMS[at - 1]; render(); } : null,
      'Мельче некуда: вся часть уже видна целиком'));
    bar.appendChild(make('span', 'mont-zoom', '×' + zoom));
    bar.appendChild(button('mont-btn', '+',
      at < ZOOMS.length - 1 ? function () { zoom = ZOOMS[at + 1]; render(); } : null,
      'Крупнее некуда'));
  }

  function drawLanes() {
    var seg = current();
    var lanes = host['track-lanes'];
    lanes.textContent = '';
    var total = scaleOf(seg);
    var headW = 120;
    // Ширина шкалы в пикселях, а не в процентах: при масштабе больше единицы
    // полосы шире контейнера и уезжают под горизонтальную прокрутку. Голова
    // при этом остаётся на месте (`position: sticky`) — иначе, прокрутив
    // дорожку, автор теряет имена полос и причину, по которой полоса пуста.
    var scaleW = Math.round((lanes.clientWidth - headW) * zoom);
    lanes.style.setProperty('--mt-track-w', scaleW + 'px');
    var width = scaleW;

    function left(seconds) { return (seconds / total * 100) + '%'; }

    // ---- Линейка. Стоит на месте ВСЕГДА, даже когда звука нет: у CapCut
    // в пустом проекте деления никуда не деваются, и это тот же принцип
    // зарезервированной высоты, что у полосы свойств в Сессии 20.
    var ruler = make('div', 'mt-lane mt-lane--ruler');
    ruler.appendChild(laneHead('', ''));
    var rbody = make('div', 'mt-lane__body');
    var step = tickStep(total, width);
    for (var t = 0; t <= total; t += step) {
      // Деления линейки — БЕЗ десятых. Десятая доля на подписи каждые
      // десять секунд это шум: она не сообщает ничего, но удлиняет подпись
      // и приближает момент, когда подписи начнут наезжать друг на друга.
      var tick = make('span', 'tick', fmt(t).replace(/\.\d$/, ''));
      tick.style.left = left(t);
      rbody.appendChild(tick);
    }
    ruler.appendChild(rbody);
    lanes.appendChild(ruler);

    // ---- Звук
    var sound = make('div', 'mt-lane mt-lane--sound');
    sound.appendChild(laneHead('Звук',
      seg.audio ? seg.audio.src : 'нет файла'));
    var sbody = make('div', 'mt-lane__body');

    if (trackState === 'idle') {
      // Пустое состояние — ПРИГЛАШЕНИЕ, а не пустота. У CapCut тело дорожки
      // в пустом проекте это зона-приёмник «Drag and drop media here».
      var drop = make('div', 'mt-lane__empty');
      drop.appendChild(make('span', 'mt-lane__empty-sign', '↓'));
      drop.appendChild(make('span', null, 'Перетащите запись или запишите голос'));
      sbody.appendChild(drop);
    } else if (trackState === 'loading') {
      // НЕ пустая волна. Комментарий в самом продукте (TrackView.tsx:155):
      // «Пустая волна вместо неё изображала бы тишину там, где на самом деле
      // нет файла». Тишина и «ещё не прочитано» — разные вещи, и выглядеть
      // одинаково они не имеют права.
      var skeleton = make('div', 'mt-lane__skeleton');
      skeleton.appendChild(make('span', null, 'Читаю запись…'));
      sbody.appendChild(skeleton);
    } else {
      var wave = make('div', 'wave');
      // Число столбиков растёт с масштабом. Иначе те же 160 растягиваются
      // в блоки, и волна начинает врать о звуке: на ×16 она показывала бы
      // шесть секунд шестью прямоугольниками. В продукте пики считает
      // peaks.ts по реальному буферу, и их плотность тоже от масштаба.
      var bars = 160 * zoom;
      for (var i = 0; i < bars; i++) {
        var bar = make('span', 'wave__bar');
        var h = 12 + Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)) * 82;
        bar.style.height = h + '%';
        wave.appendChild(bar);
      }
      sbody.appendChild(wave);
    }
    sound.appendChild(sbody);
    lanes.appendChild(sound);

    // ---- Слайды. Хвост ПЕРЕД ромбом — окно движения кончается на метке
    // (ADR-020). Длина хвоста и есть продолжительность перехода, нулевая
    // длина — срез. Стык у нас нарисован с Сессии 14, просто им до сих пор
    // нельзя было управлять.
    var slides = make('div', 'mt-lane mt-lane--slides');
    slides.appendChild(laneHead('Слайды', seg.slides.length));
    var slbody = make('div', 'mt-lane__body');
    seg.slides.forEach(function (slide) {
      var kind = transitionById(slide.transition);

      if (slide.seconds > 0) {
        var tail = make('button', 'tail');
        tail.type = 'button';
        tail.style.left = left(slide.at - slide.seconds);
        tail.style.width = (slide.seconds / total * 100) + '%';
        tail.title = kind.label + ', ' + slide.seconds + ' c — щёлкните, чтобы сменить приём';
        if (selected && selected.kind === 'transition' && selected.id === slide.id) {
          tail.classList.add('tail--on');
        }
        if (kind.law !== 'ok') tail.classList.add('tail--check');
        tail.appendChild(make('span', 'tail__label', kind.label));
        tail.addEventListener('click', function (event) {
          event.stopPropagation();
          selected = { kind: 'transition', id: slide.id };
          render();
        });

        // РУЧКА НА ЛЕВОМ КОНЦЕ — продолжительность задаётся прямо во времени.
        // Ползунок в панели говорит «0.6», ручка показывает, сколько это
        // относительно озвучки, а вопрос у автора именно второй.
        var grip = make('span', 'tail__grip');
        grip.title = 'Тянуть — продолжительность перехода';
        grip.addEventListener('pointerdown', function (event) {
          event.stopPropagation();
          event.preventDefault();
          startDrag(slide, tail, total, slbody);
        });
        tail.appendChild(grip);

        slbody.appendChild(tail);
      }

      var dia = make('button', 'mt-mark mt-mark--slide');
      dia.type = 'button';
      dia.style.left = left(slide.at);
      dia.title = 'Слайд · ' + kind.label;
      if (selected && selected.kind === 'slide' && selected.id === slide.id) {
        dia.classList.add('mt-mark--on');
      }
      // ОТВЕТ ДОРОЖКИ НА ВЫДЕЛЕНИЕ СЦЕНЫ — подсветка, а не выделение.
      // Слайд светится, если хоть один выделенный элемент в нём меняет
      // состояние. Вопрос, на который это отвечает: «где во времени живёт
      // то, что я держу». Считается из states, ноль по схеме.
      if (sceneSelection.some(function (id) { return slide.states[id] !== undefined; })) {
        dia.classList.add('mt-mark--lit');
      }
      dia.addEventListener('click', function (event) {
        event.stopPropagation();
        selected = { kind: 'slide', id: slide.id };
        position = slide.at;
        render();
      });
      slbody.appendChild(dia);
    });
    slides.appendChild(slbody);
    lanes.appendChild(slides);

    // ---- Остановки
    var stops = make('div', 'mt-lane mt-lane--stops');
    stops.appendChild(laneHead('Остановки', seg.gates.length || 'нет'));
    var stbody = make('div', 'mt-lane__body');
    seg.gates.forEach(function (gate) {
      var fork = gate.correctId === null;
      var node = make('button', 'mt-mark mt-mark--gate' + (fork ? ' mt-mark--fork' : ''));
      node.type = 'button';
      node.style.left = left(gate.at);
      node.title = (fork ? 'Развилка' : 'Вопрос') + ' · пишет в «' + gate.recordAs + '»';
      if (selected && selected.kind === 'gate' && selected.id === gate.id) {
        node.classList.add('mt-mark--on');
      }
      node.addEventListener('click', function (event) {
        event.stopPropagation();
        selected = { kind: 'gate', id: gate.id };
        position = gate.at;
        render();
      });
      stbody.appendChild(node);

      if (fork) {
        // Развилка обязана быть ПОСЛЕДНЕЙ в части (product.md §5), то есть
        // она всегда у правого края. Подпись поэтому уходит влево от метки:
        // вправо ей места нет по построению, а не иногда.
        var label = make('span', 'fork-label', 'развилка → карта');
        label.style.left = left(gate.at);
        stbody.appendChild(label);
      }
    });
    stops.appendChild(stbody);
    lanes.appendChild(stops);

    // ---- Расшифровка. Часть без расшифровки — законный случай, поэтому
    // строка сразу говорит, ЧТО ДЕЛАТЬ, а не «пусто».
    var words = make('div', 'mt-lane mt-lane--words');
    words.appendChild(laneHead('Расшифровка', seg.words.length || 'нет'));
    var wbody = make('div', 'mt-lane__body mt-lane__body--text');
    if (!seg.words.length) {
      wbody.appendChild(make('span', 'mt-lane__hint',
        seg.audio
          ? 'Расшифровки нет — метки этой части ставятся по секундам'
          : 'Звука нет, поэтому и расшифровки нет'));
    } else {
      seg.words.forEach(function (word) {
        wbody.appendChild(make('span', 'word', word + ' '));
      });
    }
    words.appendChild(wbody);
    lanes.appendChild(words);

    // ---- Головка сквозь все полосы, включая линейку. Снято у CapCut:
    // именно это связывает пять полос в одну шкалу.
    if (trackState === 'ready') {
      var headline = make('div', 'mt-head');
      // От ширины ШКАЛЫ, а не от 100% контейнера: при масштабе больше
      // единицы это разные величины, и головка уехала бы от своей секунды
      // ровно во столько раз, во сколько увеличен масштаб.
      headline.style.left = 'calc(' + headW + 'px + var(--mt-track-w) * ' + (position / total) + ')';
      lanes.appendChild(headline);
    }
  }

  // ==========================================================================
  // ГЕЙТ В РЕДАКТОРЕ
  //
  // Состояние, у которого механики НЕТ ВОВСЕ: preview.ts прокидывает `gates`
  // (строка 54 и 81), но `prompt` и `options` не рисует нигде. То есть автор
  // физически не может увидеть свою остановку такой, какой её увидит зритель, —
  // ни в одном месте редактора. Это не пробел макета, а пробел продукта.
  //
  // Слой кладётся в .scene отдельным узлом, которого main.js не трогает:
  // тот чистит #scene-els и #scene-overlay, а этот сосед им обоим.
  // ==========================================================================
  function drawGateLayer() {
    var layer = host['gate-layer'];
    if (!layer) return;
    layer.textContent = '';
    var seg = current();
    var gate = view === 'line' ? gateAt(seg, position) : null;
    layer.hidden = !gate;
    if (!gate) return;

    var card = make('div', 'gatecard');
    card.appendChild(make('div', 'gatecard__kind',
      gate.correctId === null ? 'Развилка' : 'Вопрос'));
    card.appendChild(make('div', 'gatecard__prompt', gate.prompt));
    var opts = make('div', 'gatecard__opts');
    gate.options.forEach(function (option) {
      var node = make('button', 'gatecard__opt', option.label);
      node.type = 'button';
      if (option.id === gate.correctId) node.classList.add('gatecard__opt--right');
      opts.appendChild(node);
    });
    card.appendChild(opts);
    card.appendChild(make('div', 'gatecard__foot',
      'Пишет ответ в переменную «' + gate.recordAs + '». Никуда не перекидывает: ' +
      'поля для рёбер у остановки нет вообще.'));
    layer.appendChild(card);
  }

  // ==========================================================================
  // КАРТА
  //
  // Узел = КАРТОЧКА-КЛИП, а не прямоугольник с подписью. Снято с натуры
  // у CapCut: клип там показывает СЕБЯ — шапка «имя + длительность» поверх,
  // тело — лента собственных кадров. Перенос прямой: тело карточки —
  // лента слайдов части.
  //
  // Миниатюры бесплатны: в продукте их рисует ScenePreview из плеера, тот же,
  // что и обе сцены редактора. Инвариант №5 («один рендер на редактор
  // и плеер») здесь не ограничение, а подарок.
  //
  // Пунктир = ветка родилась пустой. Взято у Twine, где пустой узел тоже
  // пунктирный, — и это ровно узкое место product.md §5, которое Twine
  // показывает, а не прячет.
  // ==========================================================================

  function thumb(seg, slide) {
    var node = make('div', 'thumb');
    Object.keys(slide.states).forEach(function (key) {
      var s = slide.states[key];
      var box = make('span', 'thumb__el');
      box.style.left = (s.x / PART_W * 100) + '%';
      box.style.top = (s.y / PART_H * 100) + '%';
      box.style.width = (s.w / PART_W * 100) + '%';
      box.style.height = (s.h / PART_H * 100) + '%';
      box.style.background = ROLE_COLOR[s.role];
      node.appendChild(box);
    });
    void seg;
    return node;
  }

  function nodeCard(seg) {
    var card = make('div', 'node');
    card.dataset.id = seg.id;
    if (isEmpty(seg)) card.classList.add('node--empty');
    if (seg.id === currentId) card.classList.add('node--current');
    if (seg.id === ENTRY) card.classList.add('node--entry');

    var head = make('div', 'node__head');
    if (seg.id === ENTRY) head.appendChild(make('span', 'node__start', '▸ старт'));
    head.appendChild(make('span', 'node__title', seg.title));
    // У части без звука длительности НЕТ. Показать сюда посчитанное
    // Math.max(метки, 1) значило бы напечатать «00:01.0» — правдоподобное
    // число, взявшееся из ниоткуда. Пустая ветка обязана выглядеть пустой,
    // а не короткой.
    head.appendChild(make('span', 'node__dur' + (seg.audio ? '' : ' node__dur--none'),
      seg.audio ? fmt(seg.audio.duration) : 'нет звука'));
    card.appendChild(head);

    // ЛЕНТА СЛАЙДОВ — тело карточки. Это и есть «ноды в структуре видео».
    var strip = make('div', 'node__strip');
    seg.slides.forEach(function (slide) { strip.appendChild(thumb(seg, slide)); });
    // Остановки лежат ПОВЕРХ ленты, на своих секундах: развилка обязана быть
    // видна на карточке, иначе рёбра выходят из ниоткуда.
    seg.gates.forEach(function (gate) {
      var pin = make('span', 'node__pin' + (gate.correctId === null ? ' node__pin--fork' : ''));
      pin.style.left = (gate.at / scaleOf(seg) * 100) + '%';
      pin.title = gate.correctId === null ? 'Развилка' : 'Вопрос';
      strip.appendChild(pin);
    });
    card.appendChild(strip);

    // Описание — поле, которого в схеме НЕТ. Проектируется в v9.
    var about = make('div', 'node__about', seg.about || 'Описания нет');
    if (!seg.about) about.classList.add('node__about--none');
    card.appendChild(about);

    var facts = make('div', 'node__facts');
    facts.appendChild(make('span', null, seg.slides.length + ' сл.'));
    facts.appendChild(make('span', null, (seg.gates.length || 'нет') + ' ост.'));
    facts.appendChild(make('span', null, seg.audio
      ? (seg.audio.hasWords ? 'расшифровка есть' : 'без расшифровки')
      : 'без звука'));
    card.appendChild(facts);

    if (isEmpty(seg)) {
      // Ветка родилась пустой. Две кнопки, обе с настоящей механикой
      // в продукте: запись с нуля и copySegment (duplicate.ts:150).
      var acts = make('div', 'node__acts');
      acts.appendChild(button('mont-btn mont-btn--wide', 'Записать с нуля', function () {
        toLine(seg.id);
      }));
      acts.appendChild(button('mont-btn mont-btn--wide', 'Скопировать часть…', function () {
        mapPanel = seg.id;
        render();
      }));
      card.appendChild(acts);
    }

    card.addEventListener('click', function () { mapPanel = seg.id; render(); });
    card.addEventListener('dblclick', function () { toLine(seg.id); });
    return card;
  }

  /** Ряды карты: узел стоит на ряд ниже того, кто на него ссылается. */
  function rows() {
    var depth = {};
    depth[ENTRY] = 0;
    var changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      SEGMENTS.forEach(function (seg) {
        if (depth[seg.id] === undefined) return;
        var targets = seg.exit.rules.map(function (r) { return r.goto; });
        if (seg.exit.default) targets.push(seg.exit.default);
        targets.forEach(function (id) {
          var next = depth[seg.id] + 1;
          if (depth[id] === undefined || depth[id] < next) {
            // Петля назад («повтор пройденного») не должна угонять глубину
            // в бесконечность: узел, уже стоящий выше, остаётся на месте.
            if (depth[id] === undefined) { depth[id] = next; changed = true; }
          }
        });
      });
    }
    var byRow = [];
    SEGMENTS.forEach(function (seg) {
      var d = depth[seg.id] === undefined ? 0 : depth[seg.id];
      if (!byRow[d]) byRow[d] = [];
      byRow[d].push(seg);
    });
    return byRow;
  }

  function drawMap() {
    var board = host['map-board'];
    board.textContent = '';

    rows().forEach(function (list) {
      var row = make('div', 'map__row');
      list.forEach(function (seg) {
        var cell = make('div', 'map__cell');
        cell.appendChild(nodeCard(seg));

        // Рёбра — ровно одного типа, «дальше» (product.md §5 [Р]).
        // Подпись ребра = условие правила выхода: текст такой же, какой
        // считает ruleText в SegmentPanel.tsx:116.
        var outs = make('div', 'map__outs');
        seg.exit.rules.forEach(function (rule) {
          outs.appendChild(make('span', 'edge', rule.text + ' → ' + segment(rule.goto).title));
        });
        if (seg.exit.default) {
          outs.appendChild(make('span', 'edge edge--else',
            'иначе → ' + segment(seg.exit.default).title));
        } else {
          outs.appendChild(make('span', 'edge edge--end', 'конец объяснения'));
        }
        cell.appendChild(outs);
        row.appendChild(cell);
      });
      board.appendChild(row);
    });
  }

  function drawMapSide() {
    var side = host['map-side'];
    side.textContent = '';
    var seg = mapPanel ? segment(mapPanel) : null;

    if (!seg) {
      side.appendChild(make('h2', 'mont-panel__title', 'Карта'));
      side.appendChild(make('p', 'mont-panel__hint',
        'Ноды в структуре видео: тело карточки — лента слайдов части, ' +
        'а не прямоугольник с подписью. Снято у CapCut, где клип показывает ' +
        'себя, а не ссылку на себя. Щёлкните узел; двойной щелчок открывает ' +
        'его на линии.'));
      side.appendChild(make('p', 'mont-panel__note',
        'Карта не бывает по-настоящему пустой: на неё попадают из развилки, ' +
        'а разрез уже породил ветки. Вопрос «полезна ли карта на одном узле» ' +
        'снимается тем, что такое состояние недостижимо.'));
      return;
    }

    side.appendChild(make('h2', 'mont-panel__title', seg.title));

    var f1 = make('div', 'mont-field');
    f1.appendChild(make('span', 'mont-field__label', 'Название'));
    f1.appendChild(make('span', 'mont-field__value', seg.title));
    side.appendChild(f1);

    var f2 = make('div', 'mont-field');
    f2.appendChild(make('span', 'mont-field__label', 'Описание'));
    f2.appendChild(make('span', 'mont-field__value' + (seg.about ? '' : ' mont-field__value--none'),
      seg.about || 'нет'));
    side.appendChild(f2);

    side.appendChild(make('p', 'mont-panel__note',
      'Описания в схеме НЕТ: SegmentSchema это id, title, speech, audio, ' +
      'elements, slides, gates, exit. ADR-022 отверг план части — но отверг ' +
      'условно, «поле, которое никто не читает». Эта карточка его читает, ' +
      'значит посылка отказа отпала. Решение владельца: проектируем в v9, ' +
      'не внедряем.'));

    var out = make('div', 'mont-sec');
    out.appendChild(make('h3', 'mont-sec__title', 'Выход'));
    seg.exit.rules.forEach(function (rule) {
      out.appendChild(make('div', 'mont-row',
        rule.text + ' → ' + segment(rule.goto).title));
    });
    out.appendChild(make('div', 'mont-row', seg.exit.default
      ? 'иначе → ' + segment(seg.exit.default).title
      : 'иначе → конец объяснения'));
    out.appendChild(make('p', 'mont-panel__note',
      'Решение о следующей части принимает ВЫХОД, и принять его больше негде: ' +
      'поля для рёбер у остановки нет вообще. Остановка только записывает ' +
      'ответ в переменную. Шарнир развилки — это имя переменной, а не объект.'));
    side.appendChild(out);

    side.appendChild(button('mont-btn mont-btn--wide mont-btn--primary',
      'Открыть на линии', function () { toLine(seg.id); }));
  }

  // ==========================================================================
  // ПАНЕЛЬ ЛИНИИ: переходы и выделенное
  // ==========================================================================
  function drawLinePanel() {
    var panel = host['mont-panel'];
    panel.textContent = '';
    var seg = current();

    if (selected && selected.kind === 'transition') {
      var slide = seg.slides.filter(function (s) { return s.id === selected.id; })[0];
      var cap = maxSeconds(seg, slide);

      panel.appendChild(make('h2', 'mont-panel__title', 'Переход'));
      panel.appendChild(make('p', 'mont-panel__hint',
        'Переход живёт В СТЫКЕ, не внутри слайда, — снято у Canva. У нас стык ' +
        'уже нарисован хвостом перед ромбом: окно движения кончается на метке ' +
        '(ADR-020), длина хвоста и есть продолжительность, нулевая длина — срез.'));

      var grid = make('div', 'trans');
      TRANSITIONS.forEach(function (kind) {
        var card = make('button', 'trans__card');
        card.type = 'button';
        card.setAttribute('aria-pressed', String(kind.id === slide.transition));
        card.appendChild(make('span', 'trans__demo trans__demo--' + kind.id));
        card.appendChild(make('span', 'trans__label', kind.label));
        var law = make('span', 'trans__law trans__law--' + kind.law, LAW_LABEL[kind.law]);
        card.appendChild(law);
        card.addEventListener('click', function () {
          slide.transition = kind.id;
          slide.seconds = kind.fixed === 0 ? 0
            : Math.min(slide.seconds || DEFAULT_SECONDS, cap);
          render();
        });
        grid.appendChild(card);
      });
      panel.appendChild(grid);

      var chosen = transitionById(slide.transition);
      panel.appendChild(make('p', 'mont-panel__note', chosen.note));

      // Направление — только у тех приёмов, у кого оно есть. Не «погашено
      // у остальных», а НЕ СОЗДАНО: у растворения направления не бывает,
      // и погашенный переключатель обещал бы, что бывает. Тот же принцип,
      // что у полосы свойств Сессии 20 — состав считается из применимости.
      if (chosen.directional) {
        var dir = make('div', 'mont-sec');
        dir.appendChild(make('h3', 'mont-sec__title', 'Направление'));
        var pad = make('div', 'mt-dirs');
        DIRECTIONS.forEach(function (d) {
          var b = make('button', 'mt-dir', d.glyph);
          b.type = 'button';
          b.title = d.label;
          b.setAttribute('aria-pressed', String((slide.dir || 'left') === d.id));
          b.addEventListener('click', function () { slide.dir = d.id; render(); });
          pad.appendChild(b);
        });
        dir.appendChild(pad);
        panel.appendChild(dir);
      }

      // Продолжительность — раскрывается ПОД каталогом, как у Canva,
      // и только у того, у кого она бывает.
      if (chosen.fixed !== 0) {
        var dur = make('div', 'mont-sec');
        dur.appendChild(make('h3', 'mont-sec__title', 'Продолжительность (секунды)'));
        var range = document.createElement('input');
        range.type = 'range';
        range.className = 'mont-range';
        range.min = '0.1';
        range.max = String(Math.max(cap, 0.2));
        range.step = '0.1';
        range.value = String(Math.min(slide.seconds, cap));
        var out2 = make('span', 'mont-range__value', slide.seconds.toFixed(1));
        range.addEventListener('input', function () {
          slide.seconds = Math.round(parseFloat(range.value) * 10) / 10;
          render();
        });
        var line = make('div', 'mont-range__line');
        line.appendChild(range);
        line.appendChild(out2);
        dur.appendChild(line);
        dur.appendChild(make('p', 'mont-panel__note',
          'Потолок ' + cap.toFixed(1) + ' c — это расстояние до предыдущего слайда, ' +
          'и он посчитан, а не выбран. Окно движения кончается НА метке, значит ' +
          'удлинение уводит начало назад. Хвост, налезший на прошлый слайд, — ' +
          'переход, начавшийся раньше, чем закончился предыдущий: сцена поехала ' +
          'бы из состояния, которого зритель ещё не видел.'));
        panel.appendChild(dur);
      }
      return;
    }

    if (selected && selected.kind === 'gate') {
      var gate = seg.gates.filter(function (g) { return g.id === selected.id; })[0];
      panel.appendChild(make('h2', 'mont-panel__title',
        gate.correctId === null ? 'Развилка' : 'Вопрос'));
      panel.appendChild(make('p', 'mont-panel__hint', gate.prompt));
      gate.options.forEach(function (option) {
        panel.appendChild(make('div', 'mont-row', option.label +
          (option.id === gate.correctId ? '  — верный' : '')));
      });
      var reason = splitBlockedReason(seg, gate);
      panel.appendChild(button('mont-btn mont-btn--wide mont-btn--primary',
        'Сделать развилкой', reason ? null : function () { toMap(seg.id); }, reason));
      if (reason) panel.appendChild(make('p', 'mont-panel__note', 'Нельзя: ' + reason + '.'));
      else panel.appendChild(make('p', 'mont-panel__note',
        'Разрез делит повествование здесь: всё до остановки остаётся в этой ' +
        'части, всё после уезжает в продолжение, и на каждый вариант ответа ' +
        'появляется часть. Механика есть — splitSegmentAtGate (split.ts:124). ' +
        'Дальше — на карту: завести ветку на линии нечем.'));
      return;
    }

    if (selected && selected.kind === 'slide') {
      var sl = seg.slides.filter(function (s) { return s.id === selected.id; })[0];
      panel.appendChild(make('h2', 'mont-panel__title', 'Слайд'));
      panel.appendChild(thumb(seg, sl));
      panel.appendChild(make('p', 'mont-panel__note',
        'Слайд хранит не список элементов, а список их СОСТОЯНИЙ (ADR-015). ' +
        'Поэтому переход между соседними слайдами вычисляется сам, и поэтому ' +
        'миниатюра рисуется из тех же данных, что и сцена.'));
      return;
    }

    panel.appendChild(make('h2', 'mont-panel__title', 'Дорожка'));
    panel.appendChild(make('p', 'mont-panel__hint',
      'Пять полос, у каждой голова слева со своим именем и своей причиной, ' +
      'когда она пуста. Щёлкните хвост перед ромбом — это стык, там живёт ' +
      'переход. Щёлкните ромб — слайд, шестиугольник — остановка.'));
    panel.appendChild(make('p', 'mont-panel__note',
      'Часть «Разбор» — настоящая пустая ветка: звука у неё нет в данных, ' +
      'а не помечено флажком. Откройте её, и дорожка встанет в «звука нет» ' +
      'по-настоящему.'));
  }

  // ==========================================================================
  // Переключение видов
  // ==========================================================================
  function toLine(id) {
    view = 'line';
    if (id && id !== currentId) {
      currentId = id;
      selected = null;
      position = 0;
      var seg = current();
      if (!seg.audio) {
        trackState = 'idle';
      } else {
        // `loading` — не декорация: TransportState его различает
        // (transport.ts:20), а интерфейс сегодня не показывает вовсе.
        // Здесь оно настоящее, с ожиданием.
        trackState = 'loading';
        if (loadTimer) clearTimeout(loadTimer);
        loadTimer = setTimeout(function () {
          trackState = 'ready';
          position = Math.min(12.48, duration(current()) / 4);
          render();
        }, 700);
      }
    }
    render();
  }

  function toMap(id) {
    view = 'map';
    if (id) mapPanel = id;
    render();
  }

  // ==========================================================================
  function drawNote() {
    var note = host['mont-note'];
    if (!note) return;
    var seg = current();
    var text;
    if (view === 'map') {
      text = 'Карта: ' + SEGMENTS.length + ' части. Узел — карточка-клип с лентой ' +
        'слайдов внутри. Пунктирная — ветка родилась пустой; у неё две кнопки, ' +
        'и обе с готовой механикой в продукте.';
    } else if (trackState === 'idle') {
      text = 'У части «' + seg.title + '» звука НЕТ — это настоящая пустая ветка, ' +
        'а не тумблер «покажи пустое». Линейка на месте, транспорт погашен, ' +
        'причина стоит в голове полосы.';
    } else if (trackState === 'loading') {
      text = 'Дорожка читается. Это значение TransportState, которое код различает ' +
        'с Сессии 7, а интерфейс не показывал ни разу.';
    } else if (sceneSelection.length) {
      var lit = seg.slides.filter(function (s) {
        return sceneSelection.some(function (id) { return s.states[id] !== undefined; });
      }).length;
      text = 'На сцене выделено ' + sceneSelection.length + '. Дорожка отвечает ' +
        'ПОДСВЕТКОЙ, а не выделением: светятся ' + lit + ' из ' + seg.slides.length +
        ' слайдов — те, где выделенное меняет состояние. Считается из states, ' +
        'ноль по схеме. Обратно связь не идёт: выбор слайда выделение не трогает.';
    } else {
      text = 'Часть «' + seg.title + '»: ' + seg.slides.length + ' слайдов, ' +
        seg.gates.length + ' остановок. Хвост перед ромбом — стык, в нём живёт ' +
        'переход, тяните его левый конец — это продолжительность.';
    }
    note.textContent = '';
    note.appendChild(make('b', null, 'Что здесь видно. '));
    note.appendChild(document.createTextNode(text));
  }

  function render() {
    document.body.dataset.view = view;
    host['mapmode'].hidden = view !== 'map';

    if (view === 'line') {
      drawBar();
      drawLanes();
      // Панель-оверлей появляется ТОЛЬКО при выделении. Постоянно висящая
      // панель закрывала бы сцену без причины — а «свойства приходят к тому,
      // что выделено, и вне выделения их нет вовсе» это правило Сессии 20,
      // и оно не перестаёт действовать оттого, что выделили метку, а не элемент.
      host['mont-panel'].hidden = !selected;
      if (selected) drawLinePanel();
    } else {
      host['mont-panel'].hidden = true;
      drawMap();
      drawMapSide();
    }
    drawGateLayer();
    drawNote();

    document.querySelectorAll('.viewswitch button').forEach(function (node) {
      node.setAttribute('aria-pressed',
        String((node.dataset.view || 'line') === view));
    });
  }

  document.querySelectorAll('.viewswitch button').forEach(function (node) {
    node.addEventListener('click', function () {
      if ((node.dataset.view || 'line') === 'map') toMap(currentId); else toLine();
    });
  });

  // Канва сообщает о выделении, дорожка слушает. Обратного канала нет.
  document.addEventListener('scene-selection', function (event) {
    var ids = event.detail.ids;
    // Перерисовываем, только если состав ИЗМЕНИЛСЯ: main.js шлёт событие
    // на каждой своей отрисовке, включая те, где выделение то же самое.
    if (ids.join(',') === sceneSelection.join(',')) return;
    sceneSelection = ids;
    if (view === 'line') { drawLanes(); drawNote(); }
  });

  host['track-lanes'].addEventListener('click', function (event) {
    if (event.target.closest('.mt-mark') || event.target.closest('.tail')) return;
    selected = null;
    render();
  });

  window.addEventListener('resize', function () {
    if (view === 'line') drawLanes();
  });

  render();
})();
