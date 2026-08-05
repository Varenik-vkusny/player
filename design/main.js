/*
  Классический скрипт, не модуль: страница обязана открываться
  двойным щелчком с file://, а ES-модули оттуда не грузятся.

  ЗДЕСЬ ЖИВЁТ МОДЕЛЬ, А НЕ АНИМАЦИЯ МАКЕТА. Правило §16 прямое: макет без
  названной сущности под ним — обещание, которое нечем исполнить. Поэтому
  всё, у чего есть сущность, рисуется ИЗ НЕЁ:

    · состав панели свойств считается из `appliesTo` — как в продукте
      (`editor/src/state/style.ts`, `styleFieldsFor`). Над картинкой полей
      стиля ровно два не потому, что так нарисовано, а потому что так
      посчитано;
    · сирота цвета вычисляется сверкой с закрытым списком ролей, а не
      помечена флажком в данных;
    · выравнивание действительно двигает элементы.

  Числа геометрии — в пикселях сцены 1920x1080, как в схеме. Вписывание
  масштабом — приём продукта (ADR-007), здесь повторён, чтобы значения
  в данных значили то же, что значат в проекте.
*/
(function () {
  'use strict';

  var SCENE_W = 1920;
  var SCENE_H = 1080;

  // ==========================================================================
  // ТЕМА СЦЕНЫ — ЗАКРЫТЫЙ СПИСОК ИЗ ДЕСЯТИ РОЛЕЙ
  // Решение владельца 05.08.2026. Закрытый, потому что палитра обязана
  // заполнять ТОТ ЖЕ набор ролей — иначе каталог палитр перестаёт быть
  // данными (strategy.md §3.3), а сирота цвета перестаёт быть вычислимой.
  // `fallback` — не украшение: он и есть запасное значение в ссылке,
  // и берётся из темы по умолчанию, а не выдумывается по месту.
  // ==========================================================================
  var THEME_ROLES = [
    { token: '--scene-bg',           label: 'Фон',              what: 'подложка сцены',            kind: 'color',  fallback: '#0f1620' },
    { token: '--scene-ink',          label: 'Текст',            what: 'основной текст',            kind: 'color',  fallback: '#e8eef6' },
    { token: '--scene-ink-muted',    label: 'Текст приглушён',  what: 'пояснения и подписи',       kind: 'color',  fallback: '#93a4b8' },
    { token: '--scene-accent',       label: 'Акцент',           what: 'то, на что смотрит зритель',kind: 'color',  fallback: '#4c8dff' },
    { token: '--scene-accent-ink',   label: 'Текст на акценте', what: 'поверх акцентной плашки',   kind: 'color',  fallback: '#06121f' },
    { token: '--scene-surface',      label: 'Плашка',           what: 'карточки внутри сцены',     kind: 'color',  fallback: '#1b2430' },
    { token: '--scene-line',         label: 'Линия',            what: 'границы и стрелки',         kind: 'color',  fallback: '#2c3a4c' },
    { token: '--scene-font',         label: 'Шрифт основной',   what: 'текст',                     kind: 'font',   fallback: 'system-ui, sans-serif' },
    { token: '--scene-font-display', label: 'Шрифт заголовков', what: 'заголовки',                 kind: 'font',   fallback: 'Georgia, serif' },
    { token: '--scene-radius',       label: 'Скругление',       what: 'плашки и рамки',            kind: 'length', fallback: '28px' }
  ];

  var ROLE_TOKENS = THEME_ROLES.map(function (role) { return role.token; });

  // Палитра — ДАННЫЕ. Пополнение = запись в этот массив, ни строки React,
  // ни правки схемы. Четвёртая заведена нарочно: одна лишняя запись —
  // и её видно в галерее, это и есть проверка правила §3.3.
  var PALETTES = [
    { id: 'night', label: 'Ночь', values: {
      '--scene-bg': '#0f1620', '--scene-ink': '#e8eef6', '--scene-ink-muted': '#93a4b8',
      '--scene-accent': '#4c8dff', '--scene-accent-ink': '#06121f',
      '--scene-surface': '#1b2430', '--scene-line': '#2c3a4c', '--scene-radius': '28px' } },
    { id: 'warm', label: 'Тепло', values: {
      '--scene-bg': '#1a1410', '--scene-ink': '#f6ece0', '--scene-ink-muted': '#c0a68c',
      '--scene-accent': '#ff9d4c', '--scene-accent-ink': '#1f1206',
      '--scene-surface': '#2a2018', '--scene-line': '#46352a', '--scene-radius': '28px' } },
    { id: 'paper', label: 'Бумага', values: {
      '--scene-bg': '#f4f1ea', '--scene-ink': '#23201b', '--scene-ink-muted': '#6d675d',
      '--scene-accent': '#b4472e', '--scene-accent-ink': '#fdfcf9',
      '--scene-surface': '#e6e1d6', '--scene-line': '#cbc4b4', '--scene-radius': '4px' } },
    { id: 'chalk', label: 'Доска', values: {
      '--scene-bg': '#16211c', '--scene-ink': '#eef5ef', '--scene-ink-muted': '#9db3a6',
      '--scene-accent': '#ffe066', '--scene-accent-ink': '#1c2a22',
      '--scene-surface': '#1f2d26', '--scene-line': '#35473c', '--scene-radius': '2px' } }
  ];

  // Шрифтовая пара — тоже данные, и отдельно от цвета: сменить гарнитуру,
  // не трогая палитру, — частое желание, а слитая пара его запрещает.
  var FONT_PAIRS = [
    { id: 'system',  label: 'Системная',   '--scene-font': 'system-ui, sans-serif',    '--scene-font-display': 'system-ui, sans-serif' },
    { id: 'georgia', label: 'С засечками', '--scene-font': 'system-ui, sans-serif',    '--scene-font-display': 'Georgia, serif' },
    { id: 'mono',    label: 'Моноширинная','--scene-font': 'ui-monospace, monospace',  '--scene-font-display': 'ui-monospace, monospace' }
  ];

  // ==========================================================================
  // ПОЛЯ СТИЛЯ — ЗЕРКАЛО ПРОДУКТА
  // packages/editor/src/state/style.ts, STYLE_FIELDS. Шесть полей только
  // у текста, два — у всех трёх типов. Это не решение макета, а `appliesTo`,
  // и переписывать его здесь было бы враньём.
  //
  // Чего в списке НЕТ и не будет: opacity и filter. Правило отбора из шапки
  // style.ts — из полей стиля исключено всё, что есть в ANIMATABLE, иначе
  // поле и анимация молча подерутся за одно CSS-свойство и победит анимация.
  // ==========================================================================
  var ALL_TYPES = ['text', 'image', 'shape'];
  var TEXT_ONLY = ['text'];

  var STYLE_FIELDS = [
    { key: 'font-family',   label: 'Шрифт',       type: 'choice',           appliesTo: TEXT_ONLY },
    { key: 'font-size',     label: 'Кегль',       type: 'length',           appliesTo: TEXT_ONLY },
    { key: 'font-weight',   label: 'Насыщенность',type: 'choice',           appliesTo: TEXT_ONLY },
    { key: 'color',         label: 'Цвет',        type: 'color',            appliesTo: TEXT_ONLY },
    { key: 'text-align',    label: 'Выравнивание',type: 'choice',           appliesTo: TEXT_ONLY },
    { key: 'line-height',   label: 'Межстрочный', type: 'number',           appliesTo: TEXT_ONLY },
    { key: 'background',    label: 'Фон',         type: 'color',            appliesTo: ALL_TYPES },
    { key: 'border-radius', label: 'Скругление',  type: 'length-or-percent',appliesTo: ALL_TYPES }
  ];

  // Что выносится НА панель над объектом, а что раскрывается в «Ещё».
  // Разделение — единственное живое место, где решается «не пихать кучу
  // кнопок в одно место»: на панели частое, редкое в панели «Объект».
  var BAR_FIELDS = {
    text:  ['font-family', 'font-size', 'font-weight', 'color', 'text-align'],
    image: ['border-radius'],
    shape: ['background', 'border-radius']
  };

  var CHOICES = {
    'font-family': [
      { value: 'var(--scene-font, system-ui, sans-serif)', label: 'Основной темы' },
      { value: 'var(--scene-font-display, Georgia, serif)', label: 'Заголовочный темы' },
      { value: 'system-ui, sans-serif', label: 'Системный' },
      { value: 'Georgia, serif', label: 'Georgia' },
      { value: 'ui-monospace, monospace', label: 'Моноширинный' }
    ],
    'font-weight': [
      { value: '400', label: 'Обычная' }, { value: '500', label: 'Средняя' },
      { value: '600', label: 'Полужирная' }, { value: '700', label: 'Жирная' },
      { value: '800', label: 'Чёрная' }
    ],
    'text-align': [
      { value: 'left', label: 'По левому краю' }, { value: 'center', label: 'По центру' },
      { value: 'right', label: 'По правому краю' }, { value: 'justify', label: 'По ширине' }
    ]
  };

  var ANIMATIONS = ['Выехать слева', 'Проявиться', 'Увеличиться', 'Подчеркнуть'];

  // ==========================================================================
  // СЦЕНА. Геометрия в пикселях 1920x1080 — как в схеме.
  // `style` — свободная карта, ровно как ElementStateSchema.style.
  // rotation / z / opacity / visible лежат РЯДОМ со style, а не внутри:
  // в схеме они поля ElementState, а не пары CSS.
  // ==========================================================================
  var ELEMENTS = [
    { id: 'title', type: 'text', name: 'Заголовок',
      content: 'Производная', box: { x: 150, y: 130, w: 900, h: 120 },
      rotation: 0, z: 0, opacity: 1, visible: true,
      style: { 'font-family': 'var(--scene-font-display, Georgia, serif)', 'font-size': 84,
               'font-weight': '600', 'color': 'var(--scene-ink, #e8eef6)', 'line-height': 1.1 } },

    // Сирота цвета С запасным значением: роли `--scene-brand` не существует,
    // браузер берёт запасное — и всё ВЫГЛЯДИТ нормально. Это и есть опасный
    // случай: молчит и у автора, и у зрителя.
    { id: 'lead', type: 'text', name: 'Пояснение',
      content: 'Скорость, с которой меняется величина. Не «сколько», а «как быстро».',
      box: { x: 150, y: 290, w: 880, h: 180 },
      rotation: 0, z: 0, opacity: 1, visible: true,
      style: { 'font-size': 40, 'line-height': 1.45, 'color': 'var(--scene-brand, #93a4b8)' } },

    { id: 'photo', type: 'image', name: 'Картинка',
      content: 'kasatelnaya.png', box: { x: 150, y: 540, w: 430, h: 240 },
      rotation: 0, z: 0, opacity: 1, visible: true,
      style: { 'border-radius': 'var(--scene-radius, 28px)' } },

    // Сирота цвета БЕЗ запасного: объявление отброшено целиком, текст
    // унаследованно чёрный. Ровно то, что измерил S11 — и ровно то, что
    // автор увидел бы, не поняв причины.
    { id: 'caption', type: 'text', name: 'Подпись',
      content: 'Касательная в точке — это и есть производная',
      box: { x: 150, y: 830, w: 820, h: 70 },
      rotation: 0, z: 0, opacity: 1, visible: true,
      style: { 'font-size': 30, 'color': 'var(--scene-brand)' } },

    { id: 'card', type: 'shape', name: 'Плашка', content: '',
      box: { x: 1180, y: 230, w: 520, h: 520 },
      rotation: 0, z: 0, opacity: 1, visible: true,
      style: { 'background': 'var(--scene-surface, #1b2430)',
               'border-radius': 'var(--scene-radius, 28px)' } },

    { id: 'dot', type: 'shape', name: 'Точка', content: '',
      box: { x: 1300, y: 390, w: 220, h: 220 },
      rotation: 0, z: 1, opacity: 1, visible: true,
      style: { 'background': 'var(--scene-accent, #4c8dff)', 'border-radius': '50%' } }
  ];

  // Каталоги-данные, которых сегодня в продукте нет, но механика для них
  // уже есть (SCENE_TEMPLATES с позициями и без содержимого).
  var LAYOUTS = ['Заголовок', 'Заголовок и текст', 'Два столбца', 'Текст и картинка',
                 'Сравнение', 'Схема с подписями'];
  var SHAPES  = ['Круг', 'Стрелка', 'Рамка', 'Линия', 'Скобка', 'Выноска'];
  var TEXT_PRESETS = [
    { label: 'Заголовок',    size: 34 },
    { label: 'Подзаголовок', size: 22 },
    { label: 'Основной',     size: 16 },
    { label: 'Подпись',      size: 13 }
  ];

  // ==========================================================================
  // Ссылка на роль и сирота — ВЫЧИСЛЯЮТСЯ, а не помечены в данных.
  // ==========================================================================
  var VAR_RE = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/;

  /** Разбирает `var(--role, запасное)`. Третий вид значения, которого
   *  сегодняшняя панель НЕ ИМЕЕТ: tryColor (style.ts:271) принимает ровно
   *  #RRGGBB, поэтому ссылка разбирается как {kind:'raw'} и показывается
   *  текстом. Находка Сессии 20. */
  function parseRef(value) {
    var match = VAR_RE.exec(String(value).trim());
    if (!match) return null;
    return {
      token: match[1],
      fallback: match[2] ? match[2].trim() : null,
      known: ROLE_TOKENS.indexOf(match[1]) >= 0
    };
  }

  function orphans() {
    var found = [];
    ELEMENTS.forEach(function (el) {
      Object.keys(el.style).forEach(function (key) {
        var ref = parseRef(el.style[key]);
        if (ref && !ref.known) found.push({ el: el, key: key, ref: ref });
      });
    });
    return found;
  }

  // ==========================================================================
  // Состояние вида. `selected` — МНОЖЕСТВО, и это проектное решение:
  // в продукте сегодня `selectedId: string | undefined` (editorHistory.ts:69),
  // и множественное выделение приходит только Сессией 22.
  // ==========================================================================
  var selected = [];
  var panel = 'templates';
  var palette = 'night';
  var fontPair = 'georgia';

  var scene = document.getElementById('scene');
  var elsHost = document.getElementById('scene-els');
  var overlay = document.getElementById('scene-overlay');
  var propbar = document.getElementById('propbar');
  var body = document.getElementById('catalog-body');
  var title = document.getElementById('catalog-title');
  var hint = document.getElementById('catalog-hint');
  var note = document.getElementById('note');
  var rail = document.getElementById('rail');
  var counter = document.getElementById('checkcount');
  var counterText = document.getElementById('checkcount-text');

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function pct(value, total) { return (value / total * 100) + '%'; }

  // ==========================================================================
  // ОТРИСОВКА СЦЕНЫ
  // Стиль накатывается через setProperty — тем же вызовом, что у плеера
  // (render.ts:115). Поэтому сирота без запасного здесь не изображается,
  // а происходит: браузер отбрасывает объявление, и текст чернеет сам.
  // ==========================================================================
  function drawScene() {
    elsHost.textContent = '';
    ELEMENTS.forEach(function (el) {
      var node = make('div', 'el el--' + el.type);
      node.dataset.id = el.id;
      node.style.left = el.box.x + 'px';
      node.style.top = el.box.y + 'px';
      node.style.width = el.box.w + 'px';
      node.style.height = el.box.h + 'px';
      node.style.zIndex = String(el.z);
      node.style.opacity = String(el.opacity);
      if (!el.visible) node.style.visibility = 'hidden';
      if (el.rotation) node.style.transform = 'rotate(' + el.rotation + 'deg)';

      Object.keys(el.style).forEach(function (key) {
        var value = el.style[key];
        node.style.setProperty(key, typeof value === 'number' && key !== 'line-height'
          ? value + 'px' : String(value));
      });

      if (el.type === 'text') node.textContent = el.content;
      if (el.type === 'image') node.textContent = el.content;
      elsHost.appendChild(node);
    });
  }

  function fit() {
    elsHost.style.setProperty('--fit', String(scene.clientWidth / SCENE_W));
  }

  // ==========================================================================
  // ВЫДЕЛЕНИЕ И ПАНЕЛЬ СВОЙСТВ
  // ==========================================================================
  function elementById(id) {
    return ELEMENTS.filter(function (el) { return el.id === id; })[0];
  }

  function bounds(list) {
    var x1 = Math.min.apply(null, list.map(function (e) { return e.box.x; }));
    var y1 = Math.min.apply(null, list.map(function (e) { return e.box.y; }));
    var x2 = Math.max.apply(null, list.map(function (e) { return e.box.x + e.box.w; }));
    var y2 = Math.max.apply(null, list.map(function (e) { return e.box.y + e.box.h; }));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /** Состав панели = поля, применимые КО ВСЕМ выделенным. Для разных типов
   *  пересечение может быть пустым — тогда остаются `Фон` и `Скругление`
   *  (они у всех трёх) или вообще ничего, и это честно видно. */
  function fieldsFor(list) {
    var types = list.map(function (el) { return el.type; });
    return STYLE_FIELDS.filter(function (field) {
      return types.every(function (type) { return field.appliesTo.indexOf(type) >= 0; });
    });
  }

  function styleLabel(field, el) {
    var raw = el ? el.style[field.key] : undefined;
    // Невыставленное поле показывает СВОЁ ИМЯ, а не прочерк: прочерк
    // сообщает «пусто», но не сообщает, что за кнопка, — и автор не знает,
    // что нажимает. Видно только глазами: состав панели при этом верный.
    if (raw === undefined) return field.label;
    var ref = parseRef(raw);
    if (ref) {
      var role = THEME_ROLES.filter(function (r) { return r.token === ref.token; })[0];
      return role ? role.label : ref.token;
    }
    if (field.type === 'choice') {
      var found = (CHOICES[field.key] || []).filter(function (c) { return c.value === String(raw); })[0];
      return found ? found.label : String(raw);
    }
    return String(raw);
  }

  /** Образец цвета. Форма взята у Canva и взята не для красоты: цвет текста
   *  сцены бывает почти белым, и квадратик такого цвета на светлой полосе
   *  ПРОПАДАЕТ — кнопка есть, а видно её нет. У них поэтому цвет текста
   *  показан буквой с цветной чертой под ней, а заливка — кругом с обводкой.
   *  Найдено глазами на своём же макете после перехода на светлый хром. */
  function swatchFor(el, key) {
    var raw = el ? el.style[key] : undefined;
    var wrap = make('span', 'ink');
    if (key === 'color') wrap.appendChild(make('span', 'ink__glyph', 'А'));

    var bar = make('span', key === 'color' ? 'ink__rule' : 'ink__fill');
    if (raw === undefined) bar.classList.add('ink--none');
    else bar.style.background = String(raw);

    var ref = raw === undefined ? null : parseRef(raw);
    if (ref && !ref.known) bar.classList.add('ink--orphan');
    wrap.appendChild(bar);
    return wrap;
  }

  function barButton(label, onClick, extraClass) {
    var button = make('button', 'objectbar__btn' + (extraClass ? ' ' + extraClass : ''), label);
    button.type = 'button';
    if (onClick) button.addEventListener('click', onClick);
    else button.disabled = true;
    return button;
  }

  function sep() { return make('span', 'objectbar__sep'); }

  var ALIGN_OPS = [
    { id: 'left',   glyph: '⇤', title: 'По левому краю' },
    { id: 'centerX',glyph: '↔', title: 'По центру по горизонтали' },
    { id: 'right',  glyph: '⇥', title: 'По правому краю' },
    { id: 'top',    glyph: '⤒', title: 'По верхнему краю' },
    { id: 'centerY',glyph: '↕', title: 'По центру по вертикали' },
    { id: 'bottom', glyph: '⤓', title: 'По нижнему краю' }
  ];

  /** Выравнивание по СЦЕНЕ для одного и ДРУГ ПО ДРУГУ для двух и более.
   *  Разница подписана в панели: иначе автор нажимает наугад. */
  function align(op) {
    var list = selected.map(elementById);
    var frame = list.length > 1 ? bounds(list) : { x: 0, y: 0, w: SCENE_W, h: SCENE_H };
    list.forEach(function (el) {
      if (op === 'left') el.box.x = frame.x;
      if (op === 'right') el.box.x = frame.x + frame.w - el.box.w;
      if (op === 'centerX') el.box.x = frame.x + (frame.w - el.box.w) / 2;
      if (op === 'top') el.box.y = frame.y;
      if (op === 'bottom') el.box.y = frame.y + frame.h - el.box.h;
      if (op === 'centerY') el.box.y = frame.y + (frame.h - el.box.h) / 2;
    });
    render();
  }

  /** Распределение требует минимум ТРЁХ: между двумя распределять нечего.
   *  Кнопка не прячется, а гаснет — пропавшая кнопка выглядит как поломка. */
  function distribute(axis) {
    var list = selected.map(elementById);
    if (list.length < 3) return;
    var key = axis === 'x' ? 'x' : 'y';
    var size = axis === 'x' ? 'w' : 'h';
    list.sort(function (a, b) { return a.box[key] - b.box[key]; });
    var first = list[0].box[key];
    var last = list[list.length - 1].box[key];
    var step = (last - first) / (list.length - 1);
    list.forEach(function (el, index) { el.box[key] = first + step * index; });
    void size;
    render();
  }

  function drawOverlay() {
    overlay.textContent = '';
    if (!selected.length) return;

    var list = selected.map(elementById);
    var frame = bounds(list);

    // Рамка каждого участника — тонкая и без ручек. Ручки только у общей:
    // восемь ручек на каждом из трёх объектов дали бы 24 мишени.
    if (list.length > 1) {
      list.forEach(function (el) {
        var member = make('div', 'selection selection--member');
        member.style.left = pct(el.box.x, SCENE_W);
        member.style.top = pct(el.box.y, SCENE_H);
        member.style.width = pct(el.box.w, SCENE_W);
        member.style.height = pct(el.box.h, SCENE_H);
        overlay.appendChild(member);
      });
    }

    var box = make('div', 'selection selection--group');
    box.style.left = pct(frame.x, SCENE_W);
    box.style.top = pct(frame.y, SCENE_H);
    box.style.width = pct(frame.w, SCENE_W);
    box.style.height = pct(frame.h, SCENE_H);
    [[0,0],[50,0],[100,0],[0,50],[100,50],[0,100],[50,100],[100,100]].forEach(function (at) {
      var handle = make('span', 'selection__handle');
      handle.style.left = at[0] + '%';
      handle.style.top = at[1] + '%';
      box.appendChild(handle);
    });
    overlay.appendChild(box);

    // Направляющие нарисованы, механики за ними нет: `guides` приходит
    // в редактор Сессией 22 и отдельным ADR.
    if (list.length > 1) {
      var vline = make('div', 'guide guide--v');
      vline.style.left = pct(frame.x + frame.w / 2, SCENE_W);
      overlay.appendChild(vline);
    }

    // Над объектом плавает только ПИЛЮЛЯ из двух кнопок, а не свойства —
    // снято с натуры у Canva 05.08.2026. Свойства живут в неподвижной
    // полосе над холстом: там им хватает ширины, и они не закрывают работу.
    var pill = make('div', 'pill');
    pill.style.left = pct(frame.x + frame.w / 2, SCENE_W);
    pill.style.top = pct(frame.y, SCENE_H);
    pill.appendChild(barButton('🔒', function () { open('object'); }));
    pill.appendChild(barButton('···', function () { open('object'); }));
    overlay.appendChild(pill);

    // Ручка поворота под объектом — тоже их приём.
    var rotate = make('div', 'rotate', '↻');
    rotate.style.left = pct(frame.x + frame.w / 2, SCENE_W);
    rotate.style.top = pct(frame.y + frame.h, SCENE_H);
    overlay.appendChild(rotate);
  }

  /** Наполняет НЕПОДВИЖНУЮ полосу свойств. Состав считается из типа
   *  выделенного, поэтому «кучи кнопок в одном месте» не существует:
   *  контролы не прячутся, а не создаются. */
  function buildBar(bar, list) {

    var many = list.length > 1;
    var fields = fieldsFor(list);

    if (many) {
      bar.appendChild(make('span', 'objectbar__count', list.length + ' объекта'));
      bar.appendChild(sep());
      ALIGN_OPS.forEach(function (op) {
        var button = barButton(op.glyph, function () { align(op.id); });
        button.title = op.title + ' (друг по другу)';
        bar.appendChild(button);
      });
      var spreadX = barButton('⇹', list.length >= 3 ? function () { distribute('x'); } : null);
      spreadX.title = list.length >= 3
        ? 'Разложить поровну по горизонтали'
        : 'Разложить поровну можно от трёх объектов';
      bar.appendChild(spreadX);
      bar.appendChild(sep());
    }

    // Поля стиля — ТОЛЬКО частые. Остальное в «Ещё»: это и есть ответ
    // на «не пихать кучу кнопок в одно место».
    var onBar = many
      ? fields
      : fields.filter(function (f) { return BAR_FIELDS[list[0].type].indexOf(f.key) >= 0; });

    if (!onBar.length) {
      bar.appendChild(make('span', 'objectbar__count', 'Общих свойств нет'));
      bar.appendChild(sep());
    }

    onBar.forEach(function (field) {
      var el = many ? null : list[0];
      if (field.type === 'color') {
        // У нескольких выделенных значение может быть разным, и общего
        // образца не существует. Пустой образец без подписи — НЕВИДИМАЯ
        // кнопка: поле в пересечении есть, а нажать не на что. Поэтому
        // у группы цвет подписан словом, а образец помечен как «разное».
        var button = barButton(el ? '' : field.label, function () { open('theme'); });
        button.title = field.label + ' — взять роль из темы';
        var mark = el ? swatchFor(el, field.key) : make('span', 'ink__fill ink--mixed');
        button.appendChild(mark);
        var ref = el ? parseRef(el.style[field.key]) : null;
        if (ref && !ref.known) button.appendChild(make('span', 'objectbar__warn', ' !'));
        bar.appendChild(button);
      } else {
        bar.appendChild(barButton(styleLabel(field, el), function () { open('object'); }));
      }
    });

    // Справа — общее для всех типов, как у Canva (Effects · Animate ·
    // Position). «Эффектов» у нас нет и выдумывать их нечем.
    bar.appendChild(make('span', 'topbar__spacer'));
    bar.appendChild(barButton('Появление', function () { open('object'); }));
    bar.appendChild(barButton('Положение', function () { open('object'); }));
    bar.appendChild(barButton('Ещё…', function () { open('object'); }));
  }

  // ==========================================================================
  // ПАНЕЛИ КАТАЛОГА
  // ==========================================================================
  function section(name) {
    var node = make('section', 'psec');
    node.appendChild(make('h3', 'psec__title', name));
    return node;
  }

  function gallery(items) {
    var grid = make('div', 'gallery');
    items.forEach(function (label) { grid.appendChild(make('div', 'gallery__cell', label)); });
    return grid;
  }

  function applyPalette(id) {
    var found = PALETTES.filter(function (p) { return p.id === id; })[0];
    if (!found) return;
    palette = id;
    // Вся смена палитры — записи на ОДНОМ узле. Элементы не обходятся
    // и не перерисовываются: их инлайновый стиль не трогается вовсе.
    Object.keys(found.values).forEach(function (token) {
      scene.style.setProperty(token, found.values[token]);
    });
    render();
  }

  function applyFontPair(id) {
    var found = FONT_PAIRS.filter(function (p) { return p.id === id; })[0];
    if (!found) return;
    fontPair = id;
    scene.style.setProperty('--scene-font', found['--scene-font']);
    scene.style.setProperty('--scene-font-display', found['--scene-font-display']);
    render();
  }

  /** Заменить сироту на настоящую роль. */
  function adoptRole(item, token) {
    var role = THEME_ROLES.filter(function (r) { return r.token === token; })[0];
    item.el.style[item.key] = 'var(' + token + ', ' + role.fallback + ')';
    render();
  }

  /** «Сделать своим цветом» — законный ответ автора: запасное значение
   *  уже что-то рисует. Без запасного значения ответа НЕТ: цвет неизвестен,
   *  и кнопка обязана быть погашена с названной причиной, а не подставлять
   *  чёрный молча. */
  function makeLiteral(item) {
    if (!item.ref.fallback) return;
    item.el.style[item.key] = item.ref.fallback;
    render();
  }

  function themePanel() {
    var frag = document.createDocumentFragment();

    var roles = section('Роли темы — десять, список закрыт');
    var list = make('div', 'roles');
    THEME_ROLES.forEach(function (role) {
      var row = make('button', 'role');
      row.type = 'button';
      var swatch = make('span', 'role__swatch');
      if (role.kind === 'color') {
        // Значение берётся с САМОЙ СЦЕНЫ, а не через var() в панели.
        // Панель лежит вне .scene, переменных темы там нет, и var() тихо
        // взял бы запасное — образцы показывали бы тему по умолчанию даже
        // после смены палитры. Найдено глазами: цифры при этом верные.
        swatch.style.background =
          getComputedStyle(scene).getPropertyValue(role.token).trim() || role.fallback;
      } else {
        swatch.classList.add('role__swatch--type');
        swatch.textContent = role.kind === 'font' ? 'A' : '◲';
      }
      var label = make('span', 'role__label', role.label);
      label.appendChild(make('span', 'role__what', ' · ' + role.what));
      row.appendChild(swatch);
      row.appendChild(label);
      row.appendChild(make('span', 'role__token', role.token.replace('--scene-', '')));
      list.appendChild(row);
    });
    roles.appendChild(list);
    roles.appendChild(make('p', 'psec__note',
      'Одиннадцатая роль потребует бампа схемы — это и есть цена закрытого ' +
      'списка, названная вслух. Взамен палитра остаётся данными, а сирота ' +
      'цвета становится вычислимой.'));
    frag.appendChild(roles);

    var pal = section('Палитры');
    var grid = make('div', 'palettes');
    PALETTES.forEach(function (item) {
      var card = make('button', 'palette');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(item.id === palette));
      var strip = make('div', 'palette__strip');
      ['--scene-bg', '--scene-surface', '--scene-ink', '--scene-accent', '--scene-line']
        .forEach(function (token) {
          var band = make('span');
          band.style.background = item.values[token];
          strip.appendChild(band);
        });
      card.appendChild(strip);
      card.appendChild(make('span', 'palette__label', item.label));
      card.addEventListener('click', function () { applyPalette(item.id); });
      grid.appendChild(card);
    });
    pal.appendChild(grid);
    pal.appendChild(make('p', 'psec__note',
      'Палитра — данные: пополнение это запись в массив, ни строки React, ' +
      'ни правки схемы. Применение пишет роли на один узел сцены — элементы ' +
      'не обходятся и не перерисовываются (измерено S11).'));
    frag.appendChild(pal);

    var fonts = section('Шрифтовые пары');
    FONT_PAIRS.forEach(function (pair) {
      var card = make('button', 'fontpair');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(pair.id === fontPair));
      var display = make('span', 'fontpair__display', pair.label);
      display.style.fontFamily = pair['--scene-font-display'];
      var sample = make('span', 'fontpair__body', 'Скорость, с которой меняется величина');
      sample.style.fontFamily = pair['--scene-font'];
      card.appendChild(display);
      card.appendChild(sample);
      card.addEventListener('click', function () { applyFontPair(pair.id); });
      fonts.appendChild(card);
    });
    frag.appendChild(fonts);

    var found = orphans();
    var orph = section('Сироты цвета — ' + found.length);
    if (!found.length) {
      orph.appendChild(make('div', 'todo', 'Ни одной ссылки на несуществующую роль.'));
    }
    found.forEach(function (item) {
      var card = make('div', 'orphan');
      card.appendChild(make('div', 'orphan__where', item.el.name + ' · поле «' +
        (STYLE_FIELDS.filter(function (f) { return f.key === item.key; })[0] || {}).label + '»'));
      card.appendChild(make('div', 'orphan__what', String(item.el.style[item.key])));
      card.appendChild(make('p', 'orphan__why', item.ref.fallback
        ? 'Роли ' + item.ref.token + ' не существует. Показано запасное значение, ' +
          'поэтому выглядит правильно — и молчит. Плеер не предупредит никогда.'
        : 'Роли ' + item.ref.token + ' не существует, и запасного значения нет. ' +
          'Браузер отбросил объявление целиком — на сцене унаследованный чёрный.'));

      var acts = make('div', 'orphan__acts');
      var take = make('button', 'button-block', 'Взять роль: Текст приглушён');
      take.type = 'button';
      take.addEventListener('click', function () { adoptRole(item, '--scene-ink-muted'); });
      acts.appendChild(take);

      var own = make('button', 'button-block', item.ref.fallback
        ? 'Сделать своим цветом (' + item.ref.fallback + ')'
        : 'Своим цветом нельзя: запасного значения нет');
      own.type = 'button';
      own.disabled = !item.ref.fallback;
      if (item.ref.fallback) own.addEventListener('click', function () { makeLiteral(item); });
      acts.appendChild(own);
      card.appendChild(acts);
      orph.appendChild(card);
    });
    frag.appendChild(orph);
    return frag;
  }

  function objectPanel() {
    var frag = document.createDocumentFragment();
    if (selected.length !== 1) {
      frag.appendChild(make('div', 'todo', selected.length
        ? 'Выделено несколько. Полный состав показывается для одного объекта: ' +
          'у разных типов поля разные, и «общее» здесь было бы враньём.'
        : 'Ничего не выделено.'));
      return frag;
    }
    var el = selected.map(elementById)[0];

    var about = section('Объект');
    var rows = make('div', 'fields');
    [['Имя', el.name], ['Тип', el.type], ['Идентификатор', el.id]].forEach(function (pair) {
      var row = make('div', 'field');
      row.appendChild(make('span', 'field__label', pair[0]));
      row.appendChild(make('span', 'field__value', pair[1]));
      rows.appendChild(row);
    });
    about.appendChild(rows);
    frag.appendChild(about);

    var geo = section('Где и как велик');
    var geoRows = make('div', 'fields');
    [['X, px', Math.round(el.box.x)], ['Y, px', Math.round(el.box.y)],
     ['Ширина, px', Math.round(el.box.w)], ['Высота, px', Math.round(el.box.h)],
     ['Поворот, °', el.rotation], ['Слой', el.z],
     ['Прозрачность', el.opacity], ['Показывать', el.visible ? 'да' : 'нет']]
      .forEach(function (pair) {
        var row = make('div', 'field');
        row.appendChild(make('span', 'field__label', pair[0]));
        row.appendChild(make('span', 'field__value', pair[1]));
        geoRows.appendChild(row);
      });
    geo.appendChild(geoRows);
    geo.appendChild(make('p', 'psec__note',
      'Прозрачность и «показывать» — поля ElementState в схеме, а не пары ' +
      'CSS в style. Поэтому они здесь, а не среди свойств вида.'));
    frag.appendChild(geo);

    var content = section(el.type === 'image' ? 'Путь к картинке' : 'Содержимое');
    var contentRow = make('div', 'field');
    contentRow.appendChild(make('span', 'field__label', el.type === 'image' ? 'Файл' : 'Текст'));
    contentRow.appendChild(make('span', 'field__value', el.content || '—'));
    content.appendChild(contentRow);
    frag.appendChild(content);

    var view = section('Вид — ' + fieldsFor([el]).length + ' из 8 полей применимы');
    var viewRows = make('div', 'fields');
    fieldsFor([el]).forEach(function (field) {
      var row = make('div', 'field');
      row.appendChild(make('span', 'field__label', field.label));
      var raw = el.style[field.key];
      var ref = parseRef(raw);
      var value = make('span', 'field__value');
      if (raw === undefined) {
        value.textContent = 'не задано';
      } else if (ref) {
        value.classList.add('field__value--token');
        if (!ref.known) value.classList.add('field__value--orphan');
        var role = THEME_ROLES.filter(function (r) { return r.token === ref.token; })[0];
        value.textContent = (ref.known ? 'роль: ' + role.label : 'СИРОТА ' + ref.token);
      } else {
        value.textContent = String(raw);
      }
      row.appendChild(value);
      viewRows.appendChild(row);
    });
    view.appendChild(viewRows);
    view.appendChild(make('p', 'psec__note',
      'Ссылка на роль — третий вид значения рядом с «разобрано» и «не понимаю». ' +
      'Сегодняшняя панель его не имеет: tryColor принимает ровно #RRGGBB ' +
      '(style.ts:271), и var(--scene-…) показался бы просто строкой.'));
    frag.appendChild(view);

    var anim = section('Появление');
    ANIMATIONS.forEach(function (name) {
      var button = make('button', 'fontpair', name);
      button.type = 'button';
      anim.appendChild(button);
    });
    anim.appendChild(make('p', 'psec__note',
      'Прозрачность и размытие живут здесь, а не в свойствах вида: они ' +
      'в ANIMATABLE, и поле стиля молча подралось бы с анимацией за одно ' +
      'CSS-свойство (ADR-012, шапка style.ts).'));
    frag.appendChild(anim);
    return frag;
  }

  var PANELS = {
    templates: { title: 'Шаблоны', hint:
      'Раскладка — это шаблон сцены с позициями и без содержимого. Механика ' +
      'уже есть (SCENE_TEMPLATES), каталог заводится дописыванием записей.',
      build: function () {
        var frag = document.createDocumentFragment();
        var one = section('Раскладки');
        one.appendChild(gallery(LAYOUTS));
        frag.appendChild(one);
        return frag;
      } },

    shapes: { title: 'Фигуры', hint:
      'Заготовки элементов — уже данные в продукте (ELEMENT_LIBRARY), ' +
      'и это охраняется тестом «пополнение не требует правок в React».',
      build: function () {
        var frag = document.createDocumentFragment();
        var one = section('Заготовки');
        one.appendChild(gallery(SHAPES));
        one.appendChild(make('p', 'psec__note',
          'Потолок каталога — не число видов элемента, а плоскость записи ' +
          'стиля: у «Выноски» хвостик сделан скруглением трёх углов из ' +
          'четырёх, потому что псевдоэлемент в схеме выразить нечем.'));
        frag.appendChild(one);
        return frag;
      } },

    text: { title: 'Текст', hint:
      'Заготовки текста отличаются только значениями полей стиля — значит ' +
      'тоже данные.',
      build: function () {
        var frag = document.createDocumentFragment();
        var one = section('Заготовки');
        TEXT_PRESETS.forEach(function (preset) {
          var button = make('button', 'fontpair', preset.label);
          button.type = 'button';
          button.style.fontSize = preset.size + 'px';
          one.appendChild(button);
        });
        frag.appendChild(one);
        return frag;
      } },

    theme: { title: 'Тема сцены', hint:
      'Тема живёт В ПРОЕКТЕ и уезжает к зрителю вместе с объяснением. ' +
      'Это единственная из правок схемы, которая предлагается, — v9. ' +
      'Здесь она спроектирована, но не внедрена.',
      build: themePanel },

    own: { title: 'Своё', hint: 'Загруженные картинки автора.',
      build: function () {
        var frag = document.createDocumentFragment();
        frag.appendChild(make('div', 'todo',
          'Не проектировалось в Сессии 20 и названо вслух: хранение своих ' +
          'файлов упирается в слот хранения (долги Сессии 16), а не в вид ' +
          'панели. Рисовать сюда галерею значило бы обещать решённым то, ' +
          'что не решено.'));
        return frag;
      } },

    // Панель «Части» УБРАНА в Сессии 21. Части — это карта, а карта стала
    // отдельным режимом в верхней полосе (montage.js). Заодно ушло
    // утверждение «ориентир Ren'Py»: проверено первоисточником 05.08.2026 —
    // доски ветвлений у Ren'Py нет вовсе, ветвление там пишется текстом,
    // а встроенная доска это открытая заявка renpy/renpy#6676.
    // → docs/session-21-journal.md, находка 1.

    object: { title: 'Объект', hint:
      'Полный состав свойств выделенного. Открывается кнопкой «Ещё…» ' +
      'с панели над объектом — на самой панели только частое.',
      build: objectPanel }
  };

  function open(name) {
    panel = name;
    render();
  }

  function drawPanel() {
    var current = PANELS[panel] || PANELS.templates;
    title.textContent = current.title;
    hint.textContent = current.hint;
    body.textContent = '';
    body.appendChild(current.build());
    rail.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.panel === panel));
    });
  }

  // Пояснение под сценой меняется по состоянию: макет обязан показывать
  // не только «как выглядит», но и «почему так».
  function drawNote() {
    var list = selected.map(elementById);
    var text;
    if (!list.length) {
      text = 'Ничего не выделено — панели свойств НЕТ ВОВСЕ. Контролы не спрятаны, ' +
        'они не созданы: состав считается из типа выделенного. Нажмите на объект; ' +
        'Shift — добавить второй.';
    } else if (list.length === 1) {
      var count = fieldsFor(list).length;
      text = 'Выделен «' + list[0].name + '» (' + list[0].type + '): применимых полей ' +
        'стиля ' + count + ' из 8. Это посчитано из appliesTo, а не нарисовано — ' +
        'у картинки и фигуры полей ровно два.';
    } else {
      text = 'Выделено ' + list.length + '. Показано ПЕРЕСЕЧЕНИЕ полей по типам плюс ' +
        'выравнивание. Кнопки работают: для одного — по сцене, для двух и более — ' +
        'друг по другу. Разложить поровну можно от трёх.';
    }
    note.textContent = '';
    note.appendChild(make('b', null, 'Что здесь видно. '));
    note.appendChild(document.createTextNode(text));
  }

  function drawCounter() {
    var found = orphans();
    counter.hidden = found.length === 0;
    counterText.textContent = 'Проверьте ' + found.length +
      (found.length === 1 ? ' место' : found.length < 5 ? ' места' : ' мест');
  }

  function render() {
    drawScene();
    fit();
    drawOverlay();
    // Полоса пуста, когда ничего не выделено, — но её высота остаётся.
    propbar.textContent = '';
    if (selected.length) buildBar(propbar, selected.map(elementById));
    drawPanel();
    drawNote();
    drawCounter();
  }

  // ==========================================================================
  // Ввод
  // ==========================================================================
  elsHost.addEventListener('click', function (event) {
    var node = event.target.closest('.el');
    if (!node) return;
    var id = node.dataset.id;
    if (event.shiftKey) {
      var at = selected.indexOf(id);
      if (at >= 0) selected.splice(at, 1); else selected.push(id);
    } else {
      selected = [id];
    }
    render();
  });

  scene.addEventListener('click', function (event) {
    if (event.target.closest('.el') || event.target.closest('.objectbar')) return;
    selected = [];
    render();
  });

  rail.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-panel]');
    if (button) open(button.dataset.panel);
  });

  counter.addEventListener('click', function () { open('theme'); });

  // Переключатель «Линия | Карта» ведёт montage.js: там же живёт сам режим.
  // Второй обработчик на те же кнопки был бы вторым источником правды
  // о том, какой вид открыт, — а они расходятся молча.

  window.addEventListener('resize', fit);
  render();
})();
