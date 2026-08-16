/**
 * Разрез части по развилке — операция, ради которой заводилось окно дорожки.
 *
 * Автор объявляет остановку развилкой, и цельное повествование делится:
 * всё до остановки остаётся здесь, всё после уезжает в продолжение, а между
 * ними появляется по части на каждый вариант ответа. Это и есть те узлы,
 * которые потом рисует карта.
 *
 * Чистый модуль: ни React, ни DOM, ни `project.segments`. Он работает
 * с ОДНОЙ частью и возвращает несколько — сборка проекта из них принадлежит
 * `state/project.ts`, узкой дверце на сторону записи. Так разрез можно
 * проверять юнит-тестами без проекта вообще, а дверца остаётся закрытой.
 *
 * Что здесь считается правильным (и почему):
 *
 *   Граница части невидима — решение [Р] в product.md. Поэтому первый слайд
 *   продолжения не «похож» на сцену в момент разреза, а является её точным
 *   снимком: зритель не видит стыка, потому что показывать на стыке нечего.
 *
 *   Аудио физически не режется — тоже [Р]. Обе половины ссылаются на ОДИН
 *   файл разными окнами (`audio.offset` + `audio.duration`, схема v4).
 *
 *   Метки времени привязаны к словам — инвариант №10. Слова второй половины
 *   уезжают вместе с частью, поэтому их индексы сдвигаются, и всё, что на них
 *   ссылалось, обязано переехать согласованно.
 */
import type { Gate, Segment, Slide, TimeRef, Word } from '@player/core';
import {
  alignWords, DEFAULT_TRANSITION_SECONDS, resolveTimeRef, splitIntoWords,
} from '@player/core';

import { freeId } from './elements.js';

/** Ветка развилки: какой вариант ответа в неё ведёт и как её назвать. */
export interface SplitBranch {
  /** Идентификатор варианта у гейта-развилки. */
  readonly optionId: string;
  /** Заголовок будущей части. Пустой — подставится по метке варианта. */
  readonly title?: string;
}

export interface SplitResult {
  /** Что осталось от исходной части: до развилки включительно. */
  readonly head: Segment;
  /** По одной части на вариант ответа, в порядке вариантов гейта. */
  readonly branches: readonly Segment[];
  /**
   * Продолжение — всё, что звучало после развилки.
   *
   * `null`, когда развилка стоит в самом конце дорожки и отрезать нечего.
   * Тогда ветки не сходятся обратно, а заканчивают объяснение. Это законный
   * случай, а не ошибка: развилка в финале — обычный приём.
   */
  readonly tail: Segment | null;
}

export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

/**
 * Ниже этого зазора продолжение считается пустым.
 *
 * Не «строго больше нуля»: часть длиной в микросекунды — не продолжение,
 * а мусор, который зритель не услышит, зато на карте он будет занимать узел.
 */
const MIN_TAIL_SECONDS = 0.05;

/** Секунды метки внутри части. Своя обёртка — чтобы не тянуть слова в каждый вызов. */
function secondsOf(ref: TimeRef, words: readonly Word[]): number {
  return resolveTimeRef(ref, words);
}

/**
 * Сдвигает метку на начало новой части.
 *
 * Секунды уменьшаются на точку разреза; ссылка на слово меняет ИНДЕКС, но
 * сохраняет якорь и смещение — слово то же самое, просто в новом транскрипте
 * оно стоит раньше. Перепривязка здесь была бы ошибкой: якорь описывает
 * текст вокруг слова, а текст не изменился.
 *
 * Сирота проходит той же веткой, и это верно: её `wordIndex` — индекс
 * догадки в ЭТОЙ расшифровке, при разрезе он сдвигается наравне с обычным.
 * Спред сохраняет и вид, и `lost`: разрез части не выясняет судьбу слова,
 * он двигает координаты.
 */
function shiftRef(ref: TimeRef, splitSeconds: number, wordsCut: number): TimeRef {
  if (ref.kind === 'seconds') {
    return { kind: 'seconds', t: Math.max(0, ref.t - splitSeconds) };
  }
  return { ...ref, wordIndex: ref.wordIndex - wordsCut };
}

/** Состояния сцены на момент `seconds`: снимок последнего наступившего слайда. */
function statesAt(slides: readonly Slide[], words: readonly Word[], seconds: number): Slide['states'] {
  let current: Slide | undefined;
  for (const slide of slides) {
    if (secondsOf(slide.at, words) <= seconds) current = slide;
  }
  // Первый слайд обязан стоять на нуле (схема), поэтому «ни одного
  // наступившего» невозможно ни при каком неотрицательном `seconds`.
  if (!current) {
    throw new SplitError('У главы нет слайда на нуле — снимок сцены взять неоткуда');
  }
  return current.states;
}

/** Элементы, которые действительно используются перечисленными слайдами. */
function usedElements(segment: Segment, slides: readonly Slide[]): Segment['elements'] {
  const used = new Set<string>();
  for (const slide of slides) {
    for (const id of Object.keys(slide.states)) used.add(id);
  }
  return segment.elements.filter((element) => used.has(element.id));
}

/** Две половины главы, разрезанной в момент `at`. Выходы каждой — дело вызывающего. */
interface Halves {
  /** Всё до разреза. Выход поставлен продолжением; развилка его перепишет. */
  readonly head: Segment;
  /** Всё после разреза. `null`, когда после разреза не осталось ничего. */
  readonly tail: Segment | null;
  /** Сколько слов расшифровки досталось голове — нужно для сдвига меток. */
  readonly wordsCut: number;
}

/**
 * ШОВ: как ЛЮБОЙ разрез главы делит её надвое.
 *
 * Заведён Сессией 41, когда к разрезу по развилке добавился разрез меткой
 * в произвольном месте (`product.md` §2з отменяет [Р] «разрезать только
 * на гейте»). Написать второй разрез рядом было бы дешевле на день и дороже
 * навсегда: две правды об одном и том же расходятся молча и ровно тогда,
 * когда на них перестают смотреть — тем же доводом, которым `segmentOf`
 * держит доступ к `project.segments` в одном месте.
 *
 * Здесь живёт всё, что от вида разреза НЕ зависит: окно дорожки, слова
 * расшифровки, шов текста озвучки, расход слайдов и остановок по времени,
 * снимок сцены первым слайдом продолжения. Чем разрезы отличаются — это
 * ВЫХОДЫ и то, появляются ли ветки; и то и другое остаётся снаружи.
 *
 * Выход головы поставлен простым продолжением, потому что это верно
 * по умолчанию для любого разреза: договорив первую половину, рассказ идёт
 * во вторую. Развилка его переписывает правилами на варианты.
 */
function cutInTwo(
  segment: Segment,
  at: number,
  tailId: string | null,
  tailTitle: string,
): Halves {
  const words = segment.audio.words;

  // --- дорожка: одно окно превращается в два, файл не трогается ---

  const wordsCut = words.filter((word) => word.start < at).length;
  const headWords = words.slice(0, wordsCut);
  const tailWords = words.slice(wordsCut).map((word) => ({
    ...word,
    start: word.start - at,
    end: word.end - at,
  }));

  const tailSeconds = segment.audio.duration - at;
  const hasTail = tailId !== null && tailSeconds >= MIN_TAIL_SECONDS;

  // --- текст озвучки: делится тем же швом, что и расшифровка ---
  //
  // Своим индексом делить нельзя: слова речи и слова расшифровки — разные
  // разбиения (у автора «объяснение», у Deepgram «объясненье»), и k-е слово
  // одного не обязано быть k-м словом другого. Шов переносится
  // сопоставлением — это и есть правило `CLAUDE.md` «сравнивать пословно
  // можно только после сопоставления последовательностей».
  const speechCut = speechCutIndex(segment.speech, words, wordsCut);

  const spokenWords = segment.speech === undefined ? [] : splitIntoWords(segment.speech);
  const headSpeech = speechCut === undefined
    ? segment.speech
    : joinWords(spokenWords.slice(0, speechCut));
  const tailSpeech = speechCut === undefined
    ? undefined
    : joinWords(spokenWords.slice(speechCut));

  // --- слайды и остановки расходятся по времени разреза ---

  const headSlides = segment.slides.filter((slide) => secondsOf(slide.at, words) <= at);
  const tailSlides = segment.slides.filter((slide) => secondsOf(slide.at, words) > at);
  const headGates = segment.gates.filter((candidate) => secondsOf(candidate.at, words) <= at);
  const tailGates = segment.gates.filter((candidate) => secondsOf(candidate.at, words) > at);

  const head: Segment = {
    ...segment,
    speech: headSpeech,
    audio: { ...segment.audio, duration: at, words: headWords },
    elements: usedElements(segment, headSlides),
    slides: headSlides,
    gates: headGates,
    // Продолжения нет — выход исходной главы остаётся у головы: договаривает
    // отныне она. Есть — уходим в него.
    exit: hasTail ? { rules: [], default: tailId } : segment.exit,
  };

  // --- продолжение: первый слайд — точный снимок сцены на разрезе ---

  const snapshot = statesAt(segment.slides, words, at);

  const tail: Segment | null = hasTail
    ? {
      id: tailId,
      title: tailTitle,
      // Не наследуется от исходной главы: её описание описывает ЦЕЛОЕ,
      // а не продолжение. Скопировать значило бы соврать на карте.
      description: '',
      speech: tailSpeech,
      audio: {
        ...segment.audio,
        // Файл тот же, окно сдвинуто: «аудио физически не режется».
        offset: segment.audio.offset + at,
        duration: tailSeconds,
        words: tailWords,
      },
      elements: usedElements(segment, [
        {
          id: 'snapshot', at: { kind: 'seconds', t: 0 },
          transition: 'cut', transitionSeconds: DEFAULT_TRANSITION_SECONDS, states: snapshot,
        },
        ...tailSlides,
      ]),
      slides: [
        {
          id: freeId('slide', tailSlides),
          at: { kind: 'seconds', t: 0 },
          // Не морфинг: на стыке глав анимировать нечего. Граница невидима
          // потому, что картинка совпадает с предыдущим кадром, а не потому,
          // что переход её сглаживает.
          transition: 'cut',
          // Срез не длится, поэтому число здесь роли не играет; ставим
          // умолчание, чтобы у поля не было второго значения на один смысл.
          transitionSeconds: DEFAULT_TRANSITION_SECONDS,
          states: snapshot,
        },
        ...tailSlides.map((slide) => ({ ...slide, at: shiftRef(slide.at, at, wordsCut) })),
      ],
      gates: tailGates.map((candidate) => ({
        ...candidate,
        at: shiftRef(candidate.at, at, wordsCut),
      })),
      // Куда шло объяснение после этой главы, туда теперь идёт продолжение:
      // выход отвечает на вопрос «что дальше, когда договорили», а договаривает
      // отныне именно оно.
      exit: segment.exit,
    }
    : null;

  return { head, tail, wordsCut };
}

/**
 * Свободное имя для второй главы: «X — продолжение», «X — продолжение 2»…
 *
 * НАЙДЕНО ГЛАЗАМИ 15.08.2026, а не тестом. Метка режет главу где угодно,
 * значит резать её будут МНОГОКРАТНО — и второй разрез той же главы давал
 * второму продолжению ровно то же имя, что и первому. В виде «Ветки» автор
 * видел две плитки с одинаковой подписью и не мог их различить. Ни один
 * тест на это не жаловался: имена схема не проверяет.
 *
 * Тот же класс дефекта уже записан в измерениях проекта: «две панели рядом
 * дают две одинаковые подписи».
 *
 * Считается от ЗАНЯТЫХ имён, а не от числа глав: главу могли переименовать,
 * и счётчик разошёлся бы с тем, что автор видит на экране.
 */
function freeTailTitle(
  segment: Segment,
  taken: readonly { readonly title?: string }[],
): string {
  const base = `${segment.title || segment.id} — продолжение`;
  const used = new Set(taken.map((candidate) => candidate.title).filter(Boolean));
  if (!used.has(base)) return base;
  // Со второго: «… продолжение 2». Первое остаётся без числа — приписка «1»
  // к единственному продолжению выглядела бы как обещание второго.
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Почему метку в этот момент поставить нельзя. `undefined` — можно.
 *
 * ОДНА ПРАВДА НА ДВА МЕСТА: этой же функцией разрез отказывается работать,
 * и ею же гаснет кнопка в транспорте. Разъехавшись, они дали бы либо кнопку,
 * которая нажимается и падает, либо погашенную там, где всё законно, —
 * и оба случая молчаливые.
 *
 * Возвращает ПРИЧИНУ, а не `false`: погашенное управление обязано назвать,
 * почему оно погашено (`screens.md` §6).
 */
export function splitAtTimeBlockedReason(
  seconds: number,
  durationSeconds: number,
): string | undefined {
  if (!Number.isFinite(seconds)) {
    return `Метка поставлена в момент «${seconds}» — это не время`;
  }
  if (seconds <= 0) {
    return 'Метка в самом начале главы: до неё нет рассказа, и делить нечего';
  }
  const tailSeconds = durationSeconds - seconds;
  if (tailSeconds < MIN_TAIL_SECONDS) {
    // Не «строго больше нуля»: глава длиной в микросекунды — не глава,
    // а мусор, который зритель не услышит, зато прыгать в него можно будет.
    return `Метка в самом конце главы: после неё остаётся ${tailSeconds.toFixed(2)} с,`
      + ' вторая глава была бы пустой';
  }
  return undefined;
}

/**
 * Делит главу МЕТКОЙ в произвольном месте — там, где стоит головка.
 *
 * `product.md` §2з [Р]: «Метку можно ставить где угодно, не только
 * на вопросе», и это прямо отменяет прежнее [Р] «разрезать можно только
 * на гейте». `branches.md` §2: метка И ЕСТЬ стык глав, отдельного объекта
 * у неё нет — граница между главами и есть метка.
 *
 * Веток не рождается: развилки здесь нет, есть шов. Голова уходит
 * в продолжение простым выходом, продолжение забирает выход исходной главы.
 *
 * Возвращается пара, а не `SplitResult`: у этого разреза веток НЕ БЫВАЕТ,
 * и пустой массив в ответе был бы приглашением однажды его наполнить.
 */
export function splitSegmentAtTime(
  segment: Segment,
  seconds: number,
  takenSegmentIds: readonly { readonly id: string; readonly title?: string }[],
): { readonly head: Segment; readonly tail: Segment } {
  const blocked = splitAtTimeBlockedReason(seconds, segment.audio.duration);
  if (blocked !== undefined) throw new SplitError(blocked);

  const tailId = freeId('segment', takenSegmentIds);
  const { head, tail } = cutInTwo(
    segment, seconds, tailId, freeTailTitle(segment, takenSegmentIds),
  );
  // `tail` здесь не может быть null: длину продолжения проверили выше,
  // и `cutInTwo` отдаёт null только при её нехватке. Проверка нужна типу,
  // а не логике — но падать она обязана громко, а не подставлять заглушку.
  if (!tail) throw new SplitError('Продолжение не собралось, хотя длины хватало');
  return { head, tail };
}

/**
 * Делит часть по остановке `gateId`.
 *
 * `takenSegmentIds` — то, что уже занято в проекте: разрез сам не видит
 * проект, но обязан выдать частям неконфликтующие идентификаторы.
 */
export function splitSegmentAtGate(
  segment: Segment,
  gateId: string,
  takenSegmentIds: readonly { readonly id: string; readonly title?: string }[],
): SplitResult {
  const gate = segment.gates.find((candidate) => candidate.id === gateId);
  if (!gate) {
    throw new SplitError(`В главе «${segment.id}» нет остановки «${gateId}»`);
  }
  if (gate.config.kind !== 'choice') {
    throw new SplitError(
      `Остановка «${gateId}» не спрашивает выбор из вариантов: ветвить нечем. `
      + 'Развилкой может стать только выбор.',
    );
  }

  const words = segment.audio.words;
  const at = secondsOf(gate.at, words);

  if (at <= 0) {
    throw new SplitError(
      `Остановка «${gateId}» стоит в начале главы: до неё нет повествования, `
      + 'и делить нечего.',
    );
  }

  // --- имена новых глав ---
  //
  // Считается ДО разреза, потому что порядок выдачи идентификаторов —
  // наблюдаемое свойство: сначала ветки, потом продолжение. Тот же порядок
  // был и до появления общего шва, и фикстуры на него опираются.

  const hasTail = segment.audio.duration - at >= MIN_TAIL_SECONDS;

  const taken = [...takenSegmentIds];
  const claim = (): string => {
    const id = freeId('segment', taken);
    taken.push({ id });
    return id;
  };

  const branchIds = gate.config.options.map(() => claim());
  const tailId = hasTail ? claim() : null;

  // --- общий шов: всё, что от вида разреза не зависит ---

  // Имя продолжения у разреза по развилке ОСТАВЛЕНО прежним, без проверки
  // на занятость: развилку у одной главы объявляют один раз, повтора здесь
  // не бывает, а поведение это проверено фикстурами и тестами с Сессии 8.
  const halves = cutInTwo(segment, at, tailId, `${segment.title || segment.id} — продолжение`);
  const tail = halves.tail;

  // --- голова: то же повествование, но остановка стала последней ---

  const forkGate: Gate = {
    ...gate,
    // Разрез — это и есть объявление развилки. У развилки верного ответа нет,
    // и с версии 4 схема позволяет это сказать, не назначая «правильную» ветку.
    config: { ...gate.config, correctId: null },
  };

  const head: Segment = {
    ...halves.head,
    gates: halves.head.gates.map((candidate) => (candidate.id === gateId ? forkGate : candidate)),
    // Выход головы, поставленный швом (простое продолжение), здесь
    // ПЕРЕПИСЫВАЕТСЯ: развилка ведёт не в продолжение, а в ветки.
    exit: {
      // По правилу на вариант — покрытие полное, поэтому запасной выход не нужен
      // и схема признаёт такой выход тотальным (см. `ProjectSchema.superRefine`).
      rules: gate.config.options.map((option, index) => ({
        id: `rule-${index + 1}`,
        // Ровно одно условие на правило — иначе схема не признает выход
        // тотальным и потребует запасной выход (см. `ProjectSchema`).
        when: [{ kind: 'equals' as const, variable: gate.recordAs, value: option.id }],
        goto: branchIds[index]!,
      })),
      default: null,
    },
  };

  // --- ветки: пустые главы, сходящиеся обратно в продолжение ---

  const branches: Segment[] = gate.config.options.map((option, index) => ({
    id: branchIds[index]!,
    title: branches_title(gate, option.id, index),
    description: '',
    // Дорожка берётся у исходной части ПО ССЫЛКЕ и с её окном — ровно так же,
    // как это делает `addSegment`: своей озвучки у только что созданной ветки
    // взяться неоткуда, а `audio` обязательно схемой. Автор заменит её, когда
    // запишет ветку.
    audio: segment.audio,
    elements: [],
    slides: [{
      id: 'slide-1', at: { kind: 'seconds', t: 0 },
      transition: 'cut', transitionSeconds: DEFAULT_TRANSITION_SECONDS, states: {},
    }],
    gates: [],
    // Ветки сходятся обратно — самый дешёвый правильный сценарий. Автор уводит
    // ветку в сторону потом, если захочет; обрыв по умолчанию заставил бы его
    // чинить объяснение после каждой развилки.
    exit: { rules: [], default: tailId },
  }));

  return { head, branches, tail };
}

/**
 * Сколько первых слов текста озвучки достаётся голове.
 *
 * `undefined` — делить нечем, и это не ошибка: либо речи нет вовсе, либо
 * нет расшифровки, а без неё шва не существует. Оба случая законны, и оба
 * обязаны быть видимы снаружи, а не свёрнуты в ноль.
 */
function speechCutIndex(
  speech: string | undefined,
  words: readonly Word[],
  wordsCut: number,
): number | undefined {
  if (speech === undefined || words.length === 0) return undefined;

  const spoken = splitIntoWords(speech);
  const ops = alignWords(spoken, words);

  // Два счётчика, а не один, потому что операции потребляют стороны
  // по-разному. Направление проверено прогоном в Задаче 2, а не угадано:
  // `before` — это речь, `after` — расшифровка, значит
  //   same, replaced — потребляют по слову с ОБЕИХ сторон;
  //   removed        — слово есть в речи, в расшифровке его нет
  //                    (диктор проглотил): потребляет только речь;
  //   added          — слово есть в расшифровке, в речи нет
  //                    (диктор сказал от себя): потребляет только её.
  //
  // Граница речи — столько её слов, сколько потреблено к моменту, когда
  // расшифровка дошла до шва.
  let speechTaken = 0;
  let heardTaken = 0;

  for (const op of ops) {
    if (heardTaken >= wordsCut) return speechTaken;

    if (op.kind === 'same' || op.kind === 'replaced') {
      speechTaken += 1;
      heardTaken += 1;
    } else if (op.kind === 'removed') {
      speechTaken += 1;
    } else {
      heardTaken += 1;
    }
  }
  return speechTaken;
}

/**
 * Склеивает слова обратно в текст. `undefined` на пустом списке — не пустая
 * строка: схема (`Segment.speech`) запрещает пустую строку, «текста нет»
 * выражается отсутствием поля.
 */
function joinWords(list: readonly { text: string }[]): string | undefined {
  return list.length === 0 ? undefined : list.map((word) => word.text).join(' ');
}

/**
 * Почему разрез сейчас невозможен, словами для автора. `undefined` — возможен.
 *
 * Живёт рядом с самим разрезом намеренно: запрет и его причина обязаны
 * меняться вместе. Разведи их по разным файлам — и панель однажды покажет
 * кнопку, которая бросит, либо запретит то, что уже разрешено.
 */
export function splitBlockedReason(gate: Gate, words: readonly Word[]): string | undefined {
  if (gate.config.kind !== 'choice') {
    return 'Разделить можно только остановку с вариантами ответа.';
  }
  let at: number;
  try {
    at = secondsOf(gate.at, words);
  } catch {
    // Метка потеряла своё слово — до разреза автору нужно перепривязать её.
    // Молча разрешить разрез значило бы поделить часть не там, где он думает.
    return 'Метка остановки потеряла своё слово в транскрипте: сначала поставьте её заново.';
  }
  if (at <= 0) {
    return 'Развилка стоит в самом начале главы: до неё нет рассказа, и делить нечего.';
  }
  return undefined;
}

/**
 * Предупреждение для автора: у этой развилки продолжение родится БЕЗ текста
 * озвучки (ADR-022).
 *
 * Случай ровно тот, что решает `speechCutIndex` выше: расшифровки нет
 * (`audio.words` пуст), шва не существует, и весь текст остаётся у головы —
 * продолжение получает `speech: undefined`. Молча это не должно произойти:
 * автор написал текст, разрезал кусок и рискует потерять половину из виду.
 *
 * `undefined` — терять нечего:
 *   - речи не было вовсе — предупреждать не о чем;
 *   - расшифровка есть — шов есть, ничего не потеряется;
 *   - продолжения не будет (развилка в самом конце дорожки) — предупреждать
 *     о потере того, что не рождается, было бы враньём.
 *
 * Живёт рядом со самим разрезом по той же причине, что и `splitBlockedReason`:
 * условие и его текст обязаны меняться вместе.
 */
export function speechLossWarning(segment: Segment, gate: Gate): string | undefined {
  if (segment.speech === undefined) return undefined;
  if (segment.audio.words.length > 0) return undefined;

  let at: number;
  try {
    at = secondsOf(gate.at, segment.audio.words);
  } catch {
    // Метка потеряла своё слово — разрез откажет раньше своей ошибкой
    // (splitBlockedReason), дублировать причину здесь не место.
    return undefined;
  }
  if (segment.audio.duration - at < MIN_TAIL_SECONDS) return undefined;

  return 'У продолжения нет текста озвучки: разделить его было не по чему — у этой главы нет '
    + 'расшифровки. Впишите текст продолжения или получите расшифровку и разрежьте заново.';
}

/** Заголовок ветки: метка варианта, а не его идентификатор. */
function branches_title(gate: Gate, optionId: string, index: number): string {
  if (gate.config.kind !== 'choice') return `Ветка ${index + 1}`;
  const option = gate.config.options.find((candidate) => candidate.id === optionId);
  const label = option?.label.trim();
  return label && label.length > 0 ? label : `Ветка ${index + 1}`;
}
