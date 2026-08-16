/**
 * Механизм миграций схемы.
 *
 * Заводится сразу, с версией 1, до того как понадобился. Первая миграция
 * всегда пишется в спешке, когда уже есть пользовательские файлы; пустой,
 * но работающий и покрытый тестом механизм превращает эту задачу в рутинную.
 *
 * Инвариант №7: новая версия схемы обязана появляться вместе с миграцией.
 * Это проверяется тестом инвариантов, а не ревью.
 *
 * **Миграции работают ДО валидации.** Они не имеют права падать на битом
 * входе своим TypeError: отсутствующее поле обязано доехать до Zod
 * и получить внятное сообщение с путём. Отсюда осторожное чтение полей
 * и отсутствие «!» по всему файлу.
 */
import { SCHEMA_VERSION } from './schema.js';

/** Миграция — чистая функция: получает данные версии N, возвращает версии N+1. */
export type Migration = (input: unknown) => unknown;

/** Идентификатор единственного узла, в который сворачивается проект версии 1. */
export const ENTRY_NODE_ID = 'node-1';

/**
 * Форма проекта версии 1 ровно в той мере, в какой миграция её читает.
 */
interface ProjectV1 {
  meta?: { title?: unknown };
  audio?: unknown;
  scene?: unknown;
}

/**
 * v1 → v2: «одна дорожка, одна сцена» становится графом из одного узла.
 *
 * audio и scene переносятся по ссылке, без правки полей: так ни одно поле
 * не может тихо поменять смысл по дороге. Рёбер нет — узел без исходящих
 * рёбер и есть концовка, то есть сегодняшнее поведение проекта.
 */
const migrateV1toV2: Migration = (input) => {
  const v1 = input as ProjectV1;
  return {
    schemaVersion: 2,
    meta: v1.meta,
    entry: ENTRY_NODE_ID,
    nodes: [
      {
        id: ENTRY_NODE_ID,
        title: v1.meta?.title,
        audio: v1.audio,
        scene: v1.scene,
        edges: [],
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// v2 → v3: граф узлов становится объяснением из сегментов со слайдами
// ---------------------------------------------------------------------------

/** Формы версии 2 ровно в той мере, в какой миграция их читает. */
interface TimeRefV2 {
  kind?: unknown;
  t?: unknown;
  wordIndex?: unknown;
  offset?: unknown;
  anchor?: unknown;
}
interface ElementV2 {
  id?: unknown; type?: unknown; content?: unknown;
  x?: unknown; y?: unknown; width?: unknown; height?: unknown;
  rotation?: unknown; zIndex?: unknown;
  style?: Record<string, unknown>;
}
interface CueV2 {
  id?: unknown; at?: TimeRefV2; targetId?: unknown;
  animation?: { property?: unknown; from?: unknown; to?: unknown; duration?: unknown };
}
interface GateV2 {
  id?: unknown; at?: unknown; config?: { kind?: unknown };
  onWrong?: unknown; maxAttempts?: unknown;
}
interface EdgeV2 {
  id?: unknown; to?: unknown;
  when?: { kind?: unknown; gateId?: unknown; optionId?: unknown };
}
interface NodeV2 {
  id?: unknown; title?: unknown;
  audio?: { src?: unknown; duration?: unknown; words?: { start?: unknown }[] };
  scene?: { elements?: ElementV2[]; cues?: CueV2[]; gates?: GateV2[] };
  edges?: EdgeV2[];
}
interface ProjectV2 {
  meta?: unknown;
  entry?: unknown;
  nodes?: NodeV2[];
}

/** Состояние элемента на слайде — в том виде, в каком его ждёт схема v3. */
interface StateV3 {
  x: number; y: number; width: number; height: number;
  rotation: number; zIndex: number; opacity: number; visible: boolean;
  style: Record<string, unknown>;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Ключ группировки момента времени — СТРУКТУРНЫЙ, а не по секундам.
 *
 * Два кью на одном слове с одним смещением обязаны попасть на один слайд,
 * и решается это без разрешения ссылки: секунды слова нам для группировки
 * не нужны, а разрешение потребовало бы транскрипта и умело бы падать.
 */
function timeKey(ref: TimeRefV2 | undefined): string {
  if (!ref || typeof ref !== 'object') return 'broken';
  if (ref.kind === 'seconds') return `s:${String(ref.t)}`;
  if (ref.kind === 'word') return `w:${String(ref.wordIndex)}:${String(ref.offset)}`;
  return 'broken';
}

/**
 * Секунды ссылки, если их можно узнать. `undefined` — если нельзя.
 *
 * Нужны только для сортировки слайдов и для вычисления момента, когда
 * анимация ДОИГРАЛА. Не бросает: битая ссылка доедет до валидации схемы v3
 * и получит там своё сообщение.
 */
function secondsOf(ref: TimeRefV2 | undefined, words: { start?: unknown }[]): number | undefined {
  if (!ref || typeof ref !== 'object') return undefined;
  if (ref.kind === 'seconds') {
    return typeof ref.t === 'number' && Number.isFinite(ref.t) ? ref.t : undefined;
  }
  if (ref.kind !== 'word') return undefined;
  const index = ref.wordIndex;
  if (typeof index !== 'number' || !Number.isInteger(index)) return undefined;
  const word = words[index];
  if (!word || typeof word.start !== 'number') return undefined;
  return word.start + num(ref.offset, 0);
}

/**
 * Применить одно значение анимируемого свойства к состоянию элемента.
 *
 * Смещения `x`/`y` и множители `scale*` считаются от БАЗОВОЙ геометрии
 * элемента, а не от текущего состояния: в версии 2 anime.js писал их
 * в `translate` и `scale` поверх раскладки, то есть они всегда были
 * относительны исходного положения, а не предыдущей анимации.
 *
 * Это и есть та самая ловушка, ради которой миграция вообще нетривиальна:
 * `x` в кью — смещение, `x` в состоянии слайда — сама координата.
 */
function applyProperty(
  state: StateV3,
  base: StateV3,
  property: unknown,
  raw: unknown,
): void {
  // filter — единственное строковое свойство; остальные обязаны быть числом.
  if (property === 'filter') {
    if (raw === undefined) return;
    state.style = { ...state.style, filter: String(raw) };
    return;
  }

  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(value)) return;

  switch (property) {
    case 'x': state.x = base.x + value; break;
    case 'y': state.y = base.y + value; break;
    case 'scale': state.width = base.width * value; state.height = base.height * value; break;
    case 'scaleX': state.width = base.width * value; break;
    case 'scaleY': state.height = base.height * value; break;
    case 'rotate': state.rotation = base.rotation + value; break;
    case 'opacity':
      // Полная прозрачность выражается видимостью, а не нулём: это разные
      // переходы (ADR-015). `visible: false → true` — проявление на своём
      // месте с сохранённой позицией, и именно это делал кью «opacity 0 → 1».
      if (value === 0) { state.visible = false; state.opacity = 1; }
      else { state.visible = true; state.opacity = Math.min(1, Math.max(0, value)); }
      break;
    default: break;
  }
}

const cloneStates = (states: Record<string, StateV3>): Record<string, StateV3> =>
  Object.fromEntries(Object.entries(states).map(([id, s]) => [id, { ...s, style: { ...s.style } }]));

/** Событие на дорожке слайдов: кью начался или кью доиграл. */
interface CueEvent {
  key: string;
  seconds: number | undefined;
  /** Ссылка для слайда. У конца анимации слова нет — только секунды. */
  at: unknown;
  starts: CueV2[];
  ends: CueV2[];
}

/**
 * Собирает слайды сегмента из элементов и кью версии 2.
 *
 * Каждый кью даёт ДВА момента: своё начало со значением `from` и свой конец
 * (`at` + длительность) со значением `to`. Так сохраняется не только форма
 * анимации, но и её длительность — а заодно снимается коллизия «кью
 * на нулевой секунде против обязательного нулевого слайда».
 *
 * Теряется плавность: `ease` каждого кью исчезает, переход между слайдами
 * получает свою. Владелец разрешил эту потерю явно (planning.md §11.3).
 */
function slidesOf(node: NodeV2, segmentId: string): unknown[] {
  const elements = node.scene?.elements ?? [];
  const cues = node.scene?.cues ?? [];
  const words = node.audio?.words ?? [];
  const duration = num(node.audio?.duration, 0);

  const base: Record<string, StateV3> = {};
  for (const element of elements) {
    const id = String(element.id);
    const style: Record<string, unknown> = { ...(element.style ?? {}) };

    // `opacity` переезжает из стиля в собственное поле состояния: в v3
    // прозрачность — часть состояния, а не запись открытого стиля.
    let opacity = 1;
    let visible = true;
    if ('opacity' in style) {
      const value = Number(style['opacity']);
      delete style['opacity'];
      if (Number.isFinite(value)) {
        if (value === 0) { visible = false; } else { opacity = Math.min(1, Math.max(0, value)); }
      }
    }

    base[id] = {
      x: num(element.x, 0),
      y: num(element.y, 0),
      width: num(element.width, 0),
      height: num(element.height, 0),
      rotation: num(element.rotation, 0),
      zIndex: num(element.zIndex, 0),
      opacity,
      visible,
      style,
    };
  }

  // Раскладываем кью по моментам. Ключ момента структурный, поэтому два кью
  // на одном слове сходятся на один слайд без разрешения ссылки.
  const events = new Map<string, CueEvent>();
  const ensure = (key: string, seconds: number | undefined, at: unknown): CueEvent => {
    const known = events.get(key);
    if (known) return known;
    const created: CueEvent = { key, seconds, at, starts: [], ends: [] };
    events.set(key, created);
    return created;
  };

  // Нулевой слайд существует всегда: сегмент обязан иметь что показать.
  ensure('s:0', 0, { kind: 'seconds', t: 0 });

  for (const cue of cues) {
    const startKey = timeKey(cue.at);
    const startSeconds = secondsOf(cue.at, words);
    ensure(startKey, startSeconds, cue.at).starts.push(cue);

    if (startSeconds === undefined) continue;
    const ms = num(cue.animation?.duration, 0);
    // Конец анимации не может уехать за дорожку: слайд после конца звука
    // показывать нечем и незачем.
    const endSeconds = Math.min(startSeconds + ms / 1000, duration);
    if (endSeconds <= startSeconds) continue;
    ensure(`s:${endSeconds}`, endSeconds, { kind: 'seconds', t: endSeconds }).ends.push(cue);
  }

  const ordered = [...events.values()].sort((a, b) => {
    const left = a.seconds ?? Number.POSITIVE_INFINITY;
    const right = b.seconds ?? Number.POSITIVE_INFINITY;
    return left - right;
  });

  let current = cloneStates(base);

  /**
   * Состояние, в котором элемент обязан быть ДО своего первого кью.
   *
   * Без этого нулевой слайд показывает элемент в базовой геометрии, и морфинг
   * до первого кью гонит его туда, где он в версии 2 стоял неподвижно:
   * `question` из two-gates сползал бы с y=240 на y=280 и возвращался, а
   * карточка была бы видна все восемь секунд до собственного появления.
   *
   * Это ровно дефект, закрытый [ADR-009], и он воспроизвёлся в миграции —
   * потому что там та же причина: значение `from` существует раньше, чем
   * начинается твин. Ключ — пара «элемент + свойство»: у одного элемента
   * могут быть кью по разным свойствам, и начальное состояние у каждого своё.
   * Побеждает самый ранний кью, при равенстве — первый в массиве.
   */
  const initial = new Map<string, { seconds: number; cue: CueV2 }>();
  for (const cue of cues) {
    if (cue.animation?.from === undefined) continue;
    const key = `${String(cue.targetId)} ${String(cue.animation.property)}`;
    const seconds = secondsOf(cue.at, words) ?? Number.POSITIVE_INFINITY;
    const known = initial.get(key);
    if (!known || seconds < known.seconds) initial.set(key, { seconds, cue });
  }
  for (const { cue } of initial.values()) {
    const target = String(cue.targetId);
    const state = current[target];
    const from = base[target];
    if (state && from) applyProperty(state, from, cue.animation?.property, cue.animation?.from);
  }

  const slides: unknown[] = [];

  ordered.forEach((event, index) => {
    // Сначала доигравшие, потом начинающиеся: у нового кью значение `from`
    // обязано перебить конец предыдущего, а не наоборот.
    for (const cue of event.ends) {
      const target = String(cue.targetId);
      const state = current[target];
      const from = base[target];
      if (state && from) applyProperty(state, from, cue.animation?.property, cue.animation?.to);
    }
    for (const cue of event.starts) {
      const target = String(cue.targetId);
      const state = current[target];
      const from = base[target];
      if (!state || !from) continue;
      const spec = cue.animation;
      // `from` не задан — anime.js брал текущее значение, то есть менять нечего.
      if (spec?.from === undefined) continue;
      applyProperty(state, from, spec.property, spec.from);
    }

    slides.push({
      id: `${segmentId}-slide-${index + 1}`,
      at: event.at,
      transition: 'morph',
      states: cloneStates(current),
    });
    current = cloneStates(current);
  });

  return slides;
}

const ON_WRONG_V3: Readonly<Record<string, string>> = Object.freeze({
  retry: 'retry',
  reveal: 'inline-explain',
  continue: 'continue',
});

/**
 * v2 → v3: граф узлов становится объяснением из сегментов со слайдами.
 *
 * Что меняется по существу, а не по имени:
 *
 * **Кью превращаются в слайды.** Разобрано в `slidesOf`. Схлопывать всё
 * в один слайд было нельзя: тогда движок морфинга не покрывала бы ни одна
 * мигрированная фикстура (planning.md §11.3).
 *
 * **Рёбра гейтов превращаются в правила выхода.** Это меняет ПОВЕДЕНИЕ:
 * в версии 2 ответ на гейте уводил в другой узел немедленно, из середины
 * дорожки; в версии 3 ответ записывается в переменную, сегмент доигрывает
 * до конца, и только выход решает, куда идти. Владелец принял это изменение
 * явно (planning.md §10, ответ на Q3), и `branching.json` правится отдельно,
 * чтобы гейт стоял у конца дорожки.
 *
 * **Геометрия и стиль уезжают из элемента в состояние слайда.** У элемента
 * остаётся только то, что не меняется от слайда к слайду.
 */
const migrateV2toV3: Migration = (input) => {
  const v2 = input as ProjectV2;
  const nodes = Array.isArray(v2.nodes) ? v2.nodes : [];

  // Имена переменных обязаны быть уникальны на всё объяснение: ответы живут
  // до конца объяснения, и два гейта с одним именем сделали бы правило выхода
  // неоднозначным. Идентификаторы гейтов уникальны только внутри узла,
  // поэтому при столкновении имя получает приставку сегмента.
  const usedVariables = new Set<string>();
  const variableOf = (segmentId: string, gateId: string): string => {
    const plain = gateId;
    if (!usedVariables.has(plain)) { usedVariables.add(plain); return plain; }
    const prefixed = `${segmentId}-${gateId}`;
    usedVariables.add(prefixed);
    return prefixed;
  };

  const segments = nodes.map((node) => {
    const segmentId = String(node.id);
    const gates = node.scene?.gates ?? [];

    const variables = new Map<string, string>();
    const gatesV3 = gates.map((gate) => {
      const gateId = String(gate.id);
      const recordAs = variableOf(segmentId, gateId);
      variables.set(gateId, recordAs);
      const onWrong = ON_WRONG_V3[String(gate.onWrong)] ?? 'retry';
      return {
        id: gate.id,
        at: gate.at,
        config: gate.config,
        onWrong,
        maxAttempts: gate.maxAttempts ?? null,
        recordAs,
      };
    });

    // Рёбра узла становятся правилами выхода. Ребро «конец узла» — запасным
    // выходом: оно и означало «дорожка доиграла, иди туда».
    const edges = Array.isArray(node.edges) ? node.edges : [];
    const rules: unknown[] = [];
    let fallback: unknown = null;

    edges.forEach((edge, i) => {
      const when = edge.when;
      const kind = when?.kind;
      if (kind === 'end') { fallback = edge.to; return; }

      const gateId = String(when?.gateId);
      const variable = variables.get(gateId) ?? gateId;
      const condition =
        kind === 'option' ? { kind: 'equals', variable, value: String(when?.optionId) }
          : kind === 'correct' ? { kind: 'correct', variable }
            : kind === 'wrong' ? { kind: 'wrong', variable }
              : undefined;
      if (!condition) return;

      rules.push({ id: edge.id ?? `${segmentId}-rule-${i + 1}`, when: condition, goto: edge.to });
    });

    // Запасной выход НЕ подставляется. В версии 2 действовало правило полного
    // покрытия: если у гейта есть рёбра, они обязаны покрыть все его исходы, —
    // то есть выход уже тотален, и `default` ему не нужен. Схема v3 проверяет
    // ровно это и потому принимает `default: null` при полном покрытии.
    //
    // Первая редакция миграции ставила сюда сам сегмент, чтобы удовлетворить
    // собственное правило «правила без запасного выхода запрещены». Это давало
    // сегмент с выходом на самого себя, то есть вечный цикл, — правдоподобная
    // подстановка вместо проверяемой гарантии.

    return {
      id: node.id,
      title: node.title,
      audio: node.audio,
      elements: (node.scene?.elements ?? []).map((element) => ({
        id: element.id,
        // Значения `group` в версии 3 нет: оно было заведено авансом
        // и не использовалось ни одной фикстурой и ни одной заготовкой.
        type: element.type === 'group' ? 'shape' : element.type,
        content: element.content ?? '',
      })),
      slides: slidesOf(node, segmentId),
      gates: gatesV3,
      exit: { rules, default: fallback },
    };
  });

  return {
    schemaVersion: 3,
    meta: v2.meta,
    entry: v2.entry,
    segments,
  };
};

/**
 * Форма проекта версии 3 ровно в той мере, в какой миграция её читает.
 */
interface ProjectV3 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v3 → v4: у дорожки части появляется окно, у выбора — право не иметь
 * верного ответа.
 *
 * Ставит `audio.offset = 0` каждой части: до версии 4 часть и файл были
 * склеены один к одному, то есть дорожка всегда начиналась с начала файла.
 * Ноль — не заглушка, а точное прежнее поведение.
 *
 * **`correctId` намеренно не трогается.** Соблазн «догадаться, что это была
 * развилка» — по тому, читают ли переменную гейта правила выхода, — превратил
 * бы миграцию в угадайку: вопрос, чей ответ используется для ветвления, —
 * законная и частая конструкция, неотличимая по данным от развилки. В версии 3
 * схема требовала верный ответ у КАЖДОГО выбора, поэтому единственное честное
 * прочтение старого файла: все его выборы — вопросы. Развилку автор объявляет
 * сам, и с версии 4 ему есть чем.
 */
const migrateV3toV4: Migration = (input) => {
  const v3 = input as ProjectV3;

  const segments = Array.isArray(v3.segments)
    ? v3.segments.map((segment) => {
      if (typeof segment !== 'object' || segment === null) return segment;
      const audio = (segment as { audio?: unknown }).audio;
      // Битую или отсутствующую дорожку доводим до Zod нетронутой: внятное
      // сообщение с путём полезнее падения миграции своим TypeError.
      if (typeof audio !== 'object' || audio === null) return segment;
      if ('offset' in audio) return segment;
      return { ...segment, audio: { ...audio, offset: 0 } };
    })
    : v3.segments;

  return {
    schemaVersion: 4,
    meta: v3.meta,
    entry: v3.entry,
    segments,
  };
};

interface ProjectV4 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v4 → v5: у правила выхода одно условие превращается в список из одного.
 *
 * Тривиальна по построению, и это свойство проверялось до того, как язык
 * условий проектировался: если бы миграция получалась нетривиальной, форма
 * была бы выбрана неверно. Ни `notEquals`, ни `compare`, ни условие
 * на варианте ответа в данных версии 4 возникнуть не могут — значит больше
 * миграции делать нечего. → ADR-019
 */
const migrateV4toV5: Migration = (input) => {
  const v4 = input as ProjectV4;

  const segments = Array.isArray(v4.segments)
    ? v4.segments.map((segment) => {
      if (typeof segment !== 'object' || segment === null) return segment;
      const exit = (segment as { exit?: unknown }).exit;
      // Битый или отсутствующий выход доводим до Zod нетронутым: внятное
      // сообщение с путём полезнее падения миграции своим TypeError.
      if (typeof exit !== 'object' || exit === null) return segment;
      const rules = (exit as { rules?: unknown }).rules;
      if (!Array.isArray(rules)) return segment;

      return {
        ...segment,
        exit: {
          ...exit,
          rules: rules.map((rule) => {
            if (typeof rule !== 'object' || rule === null) return rule;
            const when = (rule as { when?: unknown }).when;
            // Уже список — не оборачиваем повторно.
            if (when === undefined || Array.isArray(when)) return rule;
            return { ...rule, when: [when] };
          }),
        },
      };
    })
    : v4.segments;

  return {
    schemaVersion: 5,
    meta: v4.meta,
    entry: v4.entry,
    segments,
  };
};

interface ProjectV5 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v5 → v6: у дорожки появился второй возможный источник — файл, загруженный
 * автором (`audio.fileId`), и `audio.src` перестал быть обязательным.
 *
 * Данные не переносятся, и это не признак лишней миграции. В версии 5 `src`
 * обязателен, значит любой проект версии 5 уже удовлетворяет новому правилу
 * «ровно один источник»: `src` есть, `fileId` нет. Работа миграции здесь —
 * поднять номер версии, и инвариант №7 требует, чтобы она существовала явно,
 * а не подразумевалась.
 *
 * Обратной дороги нет: проект с `fileId` версией 5 непредставим. Это ожидаемо
 * и совпадает с поведением всех предыдущих миграций.
 */
const migrateV5toV6: Migration = (input) => {
  const v5 = input as ProjectV5;

  return {
    schemaVersion: 6,
    meta: v5.meta,
    entry: v5.entry,
    segments: v5.segments,
  };
};

interface ProjectV6 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v6 → v7: появился `Segment.speech` — дословный текст озвучки (ADR-022).
 *
 * Содержимого не меняет НИЧЕГО, и это не оплошность. Поле необязательное,
 * а дописать его существующим проектам было бы нечем: текста, который автор
 * не писал, не существует, а поставить туда расшифровку значило бы выдать
 * распознанное за написанное — ровно ту подмену, против которой заведено
 * различие этих двух полей.
 */
const migrateV6toV7: Migration = (input) => {
  const v6 = input as ProjectV6;

  return {
    schemaVersion: 7,
    meta: v6.meta,
    entry: v6.entry,
    segments: v6.segments,
  };
};

interface ProjectV7 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v7 → v8: у `TimeRef` появился третий вид — `orphan` (`product.md` §4).
 *
 * Содержимого не меняет ничего, и здесь это не пропуск, а единственный
 * честный вариант. Сирота — результат ВЫРАВНИВАНИЯ: она рождается, когда
 * старую расшифровку сопоставили с новой и слово не нашлось. У проекта,
 * лежащего на диске, второй расшифровки нет, сопоставлять не с чем, и объявить
 * его метки сиротами значило бы сообщить о проблеме, которой никто не видел.
 *
 * Обратное прочтение тоже даром: `word` читается как `bound`, `seconds` —
 * как `pinned`, потому что выравнивание секундные метки не трогает. Оба
 * состояния уже записаны существующими данными, дописывать нечего.
 *
 * Зачем тогда бамп версии. Он защищает не переход вперёд, а ОТКАЗ НАЗАД:
 * `migrateToCurrent` ниже обязан громко сказать «проект сохранён в версии 8,
 * а эта сборка понимает только 7», когда старый плеер получит файл с сиротой.
 * Без бампа тот же файл дошёл бы до валидации и упал бы разбором варианта
 * объединения — то есть виноватым выглядел бы проект, а не устаревшая сборка.
 */
const migrateV7toV8: Migration = (input) => {
  const v7 = input as ProjectV7;

  return {
    schemaVersion: 8,
    meta: v7.meta,
    entry: v7.entry,
    segments: v7.segments,
  };
};

interface ProjectV8 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v8 → v9: тема сцены, описание части, приём и длительность перехода.
 *
 * Содержимого не меняет НИЧЕГО, и здесь это не пропуск, а УСЛОВИЕ
 * доказательства. Все три поля добавочные, у всех умолчание воспроизводит
 * сегодняшний вид: тема — десять ролей из `system.md` §2, описание — пустая
 * строка, переход — `morph` и 0.6, то самое число, что было
 * `MORPH_DURATION_S` в плеере. Дописывать существующим проектам нечего:
 * умолчания проставит разбор.
 *
 * Отсюда проверка, у которой есть внятный ответ на вопрос «что должно
 * сломаться, чтобы тест покраснел»: все 80 скриншотных эталонов обязаны
 * совпасть В НОЛЬ ПИКСЕЛЕЙ без единого перезаписанного файла. Красное
 * означает, что умолчание изменило вид. Перезапись эталонов при этой
 * правке запрещена — она превратила бы проверку в её отсутствие.
 *
 * Фикстуры лежат на РАЗНЫХ версиях — семь на v1, остальные по одной-две
 * на v2…v8, — поэтому этот шаг замыкает цепочку у всех шестнадцати сразу,
 * а не только у свежих файлов.
 *
 * Зачем тогда бамп, если содержимое не меняется. Он защищает не переход
 * вперёд, а ОТКАЗ НАЗАД: старая сборка, получив проект с темой, обязана
 * громко сказать «сохранено в версии 9, понимаю 8». Без бампа тот же файл
 * дошёл бы до валидации, лишние поля отбросились бы, и зритель увидел бы
 * сцену без темы — без единого сообщения о том, что показывают не то.
 */
const migrateV8toV9: Migration = (input) => {
  const v8 = input as ProjectV8;

  return {
    schemaVersion: 9,
    meta: v8.meta,
    entry: v8.entry,
    segments: v8.segments,
  };
};

interface ProjectV9 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v9 → v10: видео как тип элемента и направление перехода.
 *
 * Содержимого не меняет НИЧЕГО, и это снова не пропуск, а условие
 * доказательства. Оба поля добавочные: `'video'` только расширяет
 * перечисление — ни один существующий элемент своего типа не меняет,
 * а направление у существующих проектов отсутствует, и отсутствие
 * законно (см. схему).
 *
 * Отсюда проверка с внятным ответом на вопрос «что должно сломаться,
 * чтобы тест покраснел»: все прежние скриншотные эталоны обязаны совпасть
 * В НОЛЬ ПИКСЕЛЕЙ, ни одного перезаписанного. Красное означает, что
 * v10 изменила вид сцены — то есть добавочность нарушена.
 *
 * Зачем тогда бамп, если содержимое не меняется. Он защищает не переход
 * вперёд, а ОТКАЗ НАЗАД. Здесь это не отвлечённое рассуждение, как было
 * в v8→v9: проект с элементом `type: "video"`, попав в сборку, знающую
 * только v9, дошёл бы до валидации, и разбор перечисления отбросил бы
 * элемент. Зритель увидел бы сцену БЕЗ говорящей головы — и ни одного
 * сообщения о том, что показывают не то. Бамп заставляет сборку сказать
 * «сохранено в версии 10, понимаю 9» и остановиться.
 *
 * → docs/research/canva-model.md, реестр отличий, строки 1 и 2
 */
const migrateV9toV10: Migration = (input) => {
  const v9 = input as ProjectV9;

  return {
    schemaVersion: 10,
    meta: v9.meta,
    entry: v9.entry,
    segments: v9.segments,
  };
};

interface ProjectV10 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v10 → v11: группы, запирание, отражение.
 *
 * Содержимого не меняет ничего — третий такой бамп подряд, и снова
 * не по лени. Все пять изменений добавочные: `'group'` расширяет
 * перечисление типов, не трогая ни одного существующего элемента;
 * `parentId` необязателен, и его отсутствие означает «верхний уровень»;
 * `locked`, `flipX`, `flipY` имеют умолчания, воспроизводящие сегодняшнее
 * поведение.
 *
 * Отсюда проверка с внятным ответом на вопрос «что должно сломаться,
 * чтобы тест покраснел»: прежние скриншотные эталоны обязаны совпасть
 * В НОЛЬ ПИКСЕЛЕЙ, ни одного перезаписанного. Красное означает, что
 * умолчание изменило вид, то есть добавочность нарушена.
 *
 * (Числа эталонов здесь намеренно нет: в docstring `migrateV9toV10`
 * стояло «все 85», и за одну сессию оно разошлось с действительностью.)
 *
 * Зачем бамп, если содержимое не меняется. Он защищает ОТКАЗ НАЗАД,
 * и здесь это не отвлечённое рассуждение: проект с группой, попав
 * в сборку, знающую только v10, потерял бы при разборе и тип `'group'`,
 * и `parentId` у детей. Сцена собралась бы — из рассыпанных по холсту
 * элементов, каждый в координатах уже несуществующей группы. Бамп
 * заставляет сборку сказать «сохранено в версии 11, понимаю 10»
 * и остановиться.
 *
 * → docs/session-28-plan.md, реестр отличий строки 5, 6, 8
 */
const migrateV10toV11: Migration = (input) => {
  const v10 = input as ProjectV10;

  return {
    schemaVersion: 11,
    meta: v10.meta,
    entry: v10.entry,
    segments: v10.segments,
  };
};

interface ProjectV11 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
}

/**
 * v11 → v12: стили как объект проекта и ссылка на стиль у состояния слайда.
 *
 * Содержимого не меняет НИЧЕГО, и это условие доказательства, а не лень.
 * Оба изменения добавочные: `styles` имеет умолчание — пустой список,
 * `styleId` необязателен, и его отсутствие означает «элемент идёт своими
 * значениями», то есть ровно сегодняшнее поведение.
 *
 * Отсюда проверка с внятным ответом на вопрос «что должно сломаться, чтобы
 * тест покраснел»: прежние скриншотные эталоны обязаны совпасть В НОЛЬ
 * ПИКСЕЛЕЙ, ни одного перезаписанного. Красное означает, что стили изменили
 * картинку там, где ни одного стиля нет.
 *
 * Зачем бамп, если содержимое не меняется. Он защищает ОТКАЗ НАЗАД. Проект
 * со стилями, попав в сборку, знающую только v11, потерял бы при разборе
 * и `styles`, и все `styleId`. Сцена собралась бы — из элементов, лишённых
 * вида, который автор задал стилями, и притом БЕЗ ошибки: `styleId`
 * необязателен, а `styles` неизвестно. Бамп заставляет сборку сказать
 * «сохранено в версии 12, понимаю 11» и остановиться.
 *
 * → docs/adr/ADR-029-styles.md
 */
const migrateV11toV12: Migration = (input) => {
  const v11 = input as ProjectV11;

  return {
    schemaVersion: 12,
    meta: v11.meta,
    entry: v11.entry,
    segments: v11.segments,
    styles: [],
  };
};

interface ProjectV12 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
  styles?: unknown;
}

/**
 * v12 → v13: сегмент может быть НЕМЫМ — без `src` и без `fileId`.
 *
 * Содержимого не меняет ничего, и на этот раз доказательство короче обычного:
 * изменение — ОСЛАБЛЕНИЕ проверки. Было «ровно один источник», стало
 * «не больше одного». Всё, что проходило разбор в v12, проходит и в v13
 * дословно тем же путём; ни одного поля не добавлено и не переписано.
 *
 * Что должно сломаться, чтобы тест покраснел: любой существующий проект имеет
 * либо `src`, либо `fileId`, значит ветка немого сегмента на них не
 * срабатывает вовсе. Прежние скриншотные эталоны обязаны совпасть в НОЛЬ
 * пикселей — красное означало бы, что ослабление проверки почему-то изменило
 * картинку там, где все сегменты озвучены.
 *
 * Зачем бамп при ослаблении. Он защищает ОТКАЗ НАЗАД, и здесь это не
 * формальность: немой проект, попав в сборку, знающую только v12, упёрся бы
 * в `.refine()` «ни ноль, ни два» и получил бы отказ разбора. Отказ внятный —
 * но он сказал бы «дорожка сломана», хотя сломана версия. Бамп заставляет
 * сборку сказать «сохранено в версии 13, понимаю 12» и остановиться там,
 * где причина видна.
 *
 * → docs/adr/ADR-030-silent-segment.md
 */
const migrateV12toV13: Migration = (input) => {
  const v12 = input as ProjectV12;

  return {
    schemaVersion: 13,
    meta: v12.meta,
    entry: v12.entry,
    segments: v12.segments,
    styles: v12.styles,
  };
};

interface ProjectV13 {
  meta?: unknown;
  entry?: unknown;
  segments?: unknown;
  styles?: unknown;
}

/**
 * v13 → v14: у сегмента появляются отрезки «моё» — промежутки, внутри которых
 * элементом распоряжается автор, а не зритель.
 *
 * **Миграция тождественна по содержимому.** Поле необязательное с умолчанием
 * `[]`, и пустой список означает ровно сегодняшнее поведение: помеченных
 * элементов нет, а непомеченного зритель не касается — сцена мертва
 * по инварианту №3. Ни одно существующее поле не переписывается.
 *
 * Умолчание проставляет СХЕМА, а не эта функция, и это не лень. `.default([])`
 * стоит в одном месте и действует и на миграцию, и на любой другой вход;
 * проставь его здесь руками — появилось бы второе описание умолчания,
 * и разошлись бы они молча.
 *
 * **Что должно сломаться, чтобы тест покраснел.** Сними умолчание в схеме —
 * и каждая из существующих фикстур перестанет разбираться, потому что поля
 * в них нет. Поставь умолчанием непустой список — и капля в первом же
 * объяснении окажется во власти автора там, где раньше была ничья.
 *
 * Скриншотные эталоны обязаны совпасть в НОЛЬ пикселей: отрезки не меняют
 * ни одного состояния слайда, а рисуется сцена по слайдам.
 *
 * **Зачем бамп при чистом добавлении.** Он защищает отказ назад. Проект
 * с отрезками, попав в сборку, знающую только v13, разобрался бы УСПЕШНО —
 * Zod отбрасывает незнакомые ключи молча, — и зритель получил бы каплю,
 * которую можно таскать посреди авторского отрезка. Отказа не было бы вовсе:
 * не «сломалось», а «работает не так», и это худший из двух исходов.
 *
 * → docs/adr/ADR-032-viewer-rights.md
 */
const migrateV13toV14: Migration = (input) => {
  const v13 = input as ProjectV13;

  return {
    schemaVersion: 14,
    meta: v13.meta,
    entry: v13.entry,
    segments: v13.segments,
    styles: v13.styles,
  };
};

export const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
  10: migrateV10toV11,
  11: migrateV11toV12,
  12: migrateV12toV13,
  13: migrateV13toV14,
});

export class SchemaVersionError extends Error {
  constructor(message: string, readonly found: unknown) {
    super(message);
    this.name = 'SchemaVersionError';
  }
}

function readVersion(input: unknown): number {
  if (typeof input !== 'object' || input === null) {
    throw new SchemaVersionError('Проект должен быть объектом', input);
  }
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SchemaVersionError(
      `Некорректная schemaVersion: ${JSON.stringify(version)}`,
      version,
    );
  }
  return version;
}

/**
 * Поднимает проект до текущей версии схемы.
 *
 * Падает громко на неизвестной будущей версии: файл из более новой версии
 * продукта нельзя открыть «как получится» — это тихая потеря данных.
 */
export function migrateToCurrent(input: unknown): unknown {
  let version = readVersion(input);

  if (version > SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `Проект сохранён в версии схемы ${version}, а эта сборка понимает только ${SCHEMA_VERSION}. `
      + 'Обновите приложение.',
      version,
    );
  }

  let current = input;
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new SchemaVersionError(
        `Нет миграции с версии ${version} на ${version + 1}. `
        + 'Каждая версия схемы обязана иметь миграцию (инвариант №7).',
        version,
      );
    }
    current = migration(current);
    version = readVersion(current);
  }

  return current;
}
