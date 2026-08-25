/**
 * Слайды сегмента — чистая логика, без React и DOM.
 *
 * Слайд — снимок сцены в момент времени, не отдельная страница (см. схему,
 * комментарий `SlideSchema`): каждый слайд несёт ПОЛНЫЙ набор состояний
 * видимых элементов, а не разницу с предыдущим. Отсюда ключевое правило
 * UX этого модуля — `addSlide` копирует состояния предыдущего слайда
 * целиком: непрерывность (элемент остаётся на месте) получается сама,
 * потому что состояние уже скопировано, а разрыв — осознанный выбор
 * автора, который он делает, дальше меняя или убирая скопированное.
 *
 * Без копирования у нового слайда просто не было бы состояний вообще, и
 * КАЖДЫЙ элемент сцены на нём считался бы «только что прибывшим» (нет
 * в states предыдущего слайда, ADR-015) — то есть сцена бы обнулялась
 * при каждой вставке слайда, а не продолжалась.
 */
import { DEFAULT_TRANSITION_SECONDS, DIRECTED_TRANSITIONS, resolveTimeRef } from '@player/core';
import type {
  Element, ElementState, Segment, Slide, TimeRef, TransitionDirection, Word,
} from '@player/core';

import { secondsText } from '../timeText.js';
import { prefixOf } from './duplicate.js';
import { freeId } from './elements.js';

/** Глубокая копия states: `style` — вложенный объект, поверхностного spread мало. */
function cloneStates(states: Readonly<Record<string, ElementState>>): Record<string, ElementState> {
  return Object.fromEntries(
    Object.entries(states).map(([id, state]) => [id, { ...state, style: { ...state.style } }]),
  );
}

function slideIndex(segment: Segment, slideId: string): number {
  return segment.slides.findIndex((slide) => slide.id === slideId);
}

/**
 * Секунды ссылки — падает громко, как и `resolveTimeRef` из ядра: слайд
 * с меткой, указывающей в никуда, не может быть вставлен молча.
 */
function seconds(ref: TimeRef, words: readonly Word[]): number {
  return resolveTimeRef(ref, words);
}

/**
 * Куда на самом деле встанет слайд, если тащить его в эту секунду.
 *
 * КУПЛЕНО НЕРАБОЧИМ ПРОЕКТОМ 25.08.2026. Владелец перетащил ромб слайда
 * к самому началу — туда, где уже стоит первый кадр, — и получил:
 *
 *   Не удалось сохранить работу в браузере: Проект не прошёл валидацию:
 *   Сегмент «s-1»: два слайда на одной секунде (0.000) — какой из них
 *   показывать, неизвестно
 *
 * То есть жест разрешили, состояние испортили, а сказали об этом ПОТОМ,
 * при попытке сохранить. Автор к этому моменту уже не может сохранить
 * работу и не понимает, чем провинился: он всего лишь подвинул метку.
 *
 * Тот же класс, что и у «Поставить слайд здесь» этим утром: жест
 * не спрашивает правило, а правило срабатывает позже и больнее.
 *
 * ПРАВИЛО. Слайд не перепрыгивает соседей. Схема требует строгого порядка
 * и запрещает две метки на одной секунде, значит законный отрезок для
 * перетаскиваемого слайда — между предыдущим и следующим, не касаясь их.
 * Зазор берём тот же, каким метка «накрывает» секунду (MARK_HIT_SECONDS):
 * встав ближе, метка стала бы неотличима от соседней.
 *
 * Прилипание к границе, а не отказ: рука в жесте всегда немного выходит
 * за край, и отказывать на каждый выход значило бы дёргать метку.
 *
 * Если соседи стоят ТЕСНЕЕ двух зазоров, законного места нет вовсе —
 * тогда слайд остаётся там, где стоял. Молча двигать его в единственную
 * «почти законную» точку значило бы врать о том, куда попал палец.
 */
export function clampSlideSeconds(segment: Segment, slideId: string, seconds: number): number {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»: некуда его двигать`);
  }

  const words = segment.audio.words;
  const at = (slide: Slide): number => resolveTimeRef(slide.at, words);

  const previous = segment.slides[index - 1];
  const next = segment.slides[index + 1];

  const low = previous ? at(previous) + MARK_HIT_SECONDS : 0;
  const high = next ? at(next) - MARK_HIT_SECONDS : segment.audio.duration;

  if (low > high) return at(segment.slides[index]!);

  return Math.min(Math.max(seconds, low), high);
}

/**
 * Почему НЕЛЬЗЯ поставить слайд на эту секунду. `undefined` — можно.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ. `addSlide` ниже бросает — и правильно делает:
 * порядок слайдов несущий, и молча вставленный второй слайд на ту же
 * секунду схема отвергнет при сохранении. Но пункт меню «Поставить слайд
 * здесь» до 25.08.2026 НИЧЕГО не спрашивал, звал `addSlide` вслепую,
 * и бросок прилетал ВНУТРИ редьюсера — то есть уносил всё дерево
 * редактора. Владелец описал это дословно: «получилось случайно три
 * слайда, после этого я никакой из них не смог даже удалить».
 *
 * Замер 25.08.2026, пустая фикстура: заготовка «Название объяснения»
 * ставит слайд на 0.500 с; правый щелчок рядом с началом даёт ту же
 * секунду, и редактор падал с «Новый слайд должен идти раньше следующего
 * слайда «slide-1» (0.500 с), получено 0.500 с». Полоса дорожки исчезала
 * целиком, и выбрать было уже нечего — отсюда «не смог удалить».
 *
 * ПОЧЕМУ СТРОЖЕ, ЧЕМ `addSlide`, А НЕ ТОЧЬ-В-ТОЧЬ. Редьюсер отвергает
 * ровное совпадение секунд, а «место занято» здесь спрашивается тем же
 * `slideOnMark`, которым его спрашивают «Вставить слайд здесь» и
 * «Дублировать сюда» (`pasteProblem`). Причин две, и обе про автора:
 *
 * - три пункта меню «сюда» стоят В ОДНОМ СПИСКЕ, и на одном пикселе они
 *   обязаны отвечать одинаково. Разойдись они — автор увидел бы «уже
 *   стоит слайд» у одного пункта и живой соседний, и правым был бы
 *   ни один из них;
 * - окно `slideOnMark` строго ШИРЕ равенства, значит отказ наступает
 *   раньше броска ВСЕГДА. Не «мы проверили те же случаи», а «случая,
 *   где бросок достижим, не существует».
 *
 * Текст причины взят у `pasteProblem` дословно — слайд назван временем,
 * которое автор видит на метке, а не ключом из схемы.
 */
export function addProblem(segment: Segment, at: TimeRef): string | undefined {
  const words = segment.audio.words;
  const newSeconds = seconds(at, words);

  const first = segment.slides[0];
  if (!first || newSeconds <= seconds(first.at, words)) {
    return 'Раньше первого слайда поставить нельзя: он держит начало главы';
  }

  const hit = slideOnMark(segment, newSeconds, words);
  if (hit) {
    return `На ${secondsText(resolveTimeRef(hit.at, words))} уже стоит слайд`;
  }

  return undefined;
}

/**
 * Добавляет новый слайд сразу после `afterSlideId` — копией его состояний.
 *
 * `at` обязана лечь строго между временем слайда-предшественника и временем
 * следующего слайда (если он есть) — иначе порядок слайдов схема отвергнет
 * при загрузке («слайды идут не по порядку» / «два слайда на одной
 * секунде», schema.ts). Проверка здесь — то же правило, но раньше и с
 * понятным сообщением, а не абстрактным issue.path из zod при сохранении.
 */
export function addSlide(segment: Segment, afterSlideId: string, at: TimeRef): Segment {
  const index = slideIndex(segment, afterSlideId);
  if (index < 0) {
    throw new Error(`Нельзя добавить слайд: слайда «${afterSlideId}», после которого он встаёт, нет в сегменте`);
  }

  const words = segment.audio.words;
  const anchor = segment.slides[index]!;
  const anchorSeconds = seconds(anchor.at, words);
  const newSeconds = seconds(at, words);

  if (newSeconds <= anchorSeconds) {
    throw new Error(
      `Новый слайд должен идти позже слайда «${afterSlideId}» (${anchorSeconds.toFixed(3)} с), `
        + `получено ${newSeconds.toFixed(3)} с`,
    );
  }

  const next = segment.slides[index + 1];
  if (next) {
    const nextSeconds = seconds(next.at, words);
    if (newSeconds >= nextSeconds) {
      throw new Error(
        `Новый слайд должен идти раньше следующего слайда «${next.id}» (${nextSeconds.toFixed(3)} с), `
          + `получено ${newSeconds.toFixed(3)} с`,
      );
    }
  }

  const slide: Slide = {
    id: freeId('slide', segment.slides),
    at,
    /*
     * МГНОВЕННЫЙ, А НЕ МОРФИНГ. Решение владельца 25.08.2026, дословно:
     * «нахуя вот этот хвостик анимации, если у слайда я ещё не поставил
     * никакой анимации и её по факту ещё нет».
     *
     * Он прав буквально: хвост у метки рисуется от `morphSeconds`, а тот
     * считается `morphSecondsFor` и равен нулю ровно при `cut`. То есть
     * хвост был не украшением, а настоящими 0.6 с движения, которых автор
     * не заказывал, — и именно они превращали правку соседнего кадра
     * в плавный переезд элемента через полсцены.
     *
     * Теперь хвост на дорожке означает ровно одно: «здесь автор поставил
     * анимацию». Ставится она у метки, панелью «Метка».
     *
     * Слайды ЗАГОТОВОК сюда не приходят: у них своё рождение
     * (`insertOrPatchSlideAt` в state/templates.ts), и там морфинг стоит
     * намеренно — заготовка объявляет появление (`preset: 'fade-in'`),
     * а появление это и есть плавное изменение видимости.
     */
    transition: 'cut',
    transitionSeconds: DEFAULT_TRANSITION_SECONDS,
    states: cloneStates(anchor.states),
  };

  const slides = segment.slides.slice();
  slides.splice(index + 1, 0, slide);
  return { ...segment, slides };
}

/**
 * Почему этот слайд нельзя вырезать (или удалить — то же правило).
 * `undefined` — можно.
 *
 * Ровно то же условие, что раньше жило только внутри `removeSlide`, теперь
 * доступно ДО клика: пункты меню правой кнопки на дорожке
 * (`track/TrackView.tsx`) обязаны показать невозможность действия заранее
 * и назвать причину, а не поймать исключение ради текста подсказки.
 * Раньше то же правило было продублировано в панели слайдов собственным
 * выражением (`index > 0 && slides.length > 1`); панель удалена в Сессии
 * 55 как дубликат ленты карточек, но урок остался: копия правила
 * разъехалась бы с оригиналом молча, поэтому правило одно.
 */
export function cutProblem(segment: Segment, slideId: string): string | undefined {
  if (segment.slides.length <= 1) {
    return 'Единственный слайд вырезать нельзя: главе нечего показывать';
  }
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  if (index === 0) {
    // Формулировка укорочена 20.08.2026 вместе с соседними: три причины
    // выводятся в нижней зоне ОДНОЙ строкой через точку-разделитель, и
    // прежние длинноты не влезали в её ширину. Строка переносилась
    // на вторую и забирала 16 px у холста — измерено, а не предположено.
    // Смысл сохранён: первый слайд держит начало главы.
    return 'Первый слайд вырезать нельзя: он держит начало главы';
  }
  return undefined;
}

/**
 * Удаляет слайд.
 *
 * Не даёт остаться без единого слайда (`SegmentSchema.slides.min(1)`) —
 * бросает с внятным сообщением по-русски раньше, чем схема откажет молча
 * абстрактным issue.path.
 *
 * Первый слайд (индекс 0) удалить тоже нельзя: схема требует, чтобы он стоял
 * ровно на нуле («первый слайд обязан стоять на нуле», schema.ts) — это
 * стартовый вид сегмента, а не слайд как все остальные, и его роль обязан
 * унаследовать кто-то явно, а не следующий слайд по факту освобождения места.
 *
 * Отказ — целиком забота `cutProblem`: эта функция зовёт её первой строкой
 * и бросает её же текст, ровно так же, как `pasteSlide` зовёт `pasteProblem`.
 */
export function removeSlide(segment: Segment, slideId: string): Segment {
  const problem = cutProblem(segment, slideId);
  if (problem) throw new Error(problem);

  const index = slideIndex(segment, slideId);
  const slides = segment.slides.slice(0, index).concat(segment.slides.slice(index + 1));
  return { ...segment, slides };
}

/**
 * Плавно или резко наступает этот слайд.
 *
 * Значение уже работает в плеере: для `cut` длительность перехода равна нулю
 * (`player/src/morph.ts`). До этой сессии его нельзя было поменять из
 * редактора — то есть инструмент умел только «элемент едет» и не умел
 * «элемент просто появился», что и делало его узконаправленным.
 *
 * Первый слайд отвергается громко, а не правится молча: он стоит на нуле
 * и является стартовым видом сегмента. Перехода В него не существует —
 * ехать неоткуда, — поэтому у значения не было бы смысла, а поле в панели
 * показывало бы автору выбор, ни на что не влияющий.
 */
export function setTransition(segment: Segment, slideId: string, transition: Slide['transition']): Segment {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  if (index === 0) {
    throw new Error(
      'У первого слайда нет перехода: он стоит на нуле и является стартовым видом главы, ехать в него неоткуда',
    );
  }
  if (segment.slides[index]!.transition === transition) return segment;

  const slides = segment.slides.slice();
  /**
   * Смена приёма СБРАСЫВАЕТ направление, если новый приём его не имеет.
   *
   * Без этого получается состояние, которое схема не принимает: автор
   * ставит «Сдвиг» со стрелкой вверх, потом переключает на «Растворение» —
   * направление остаётся, и `superRefine` у `SlideSchema` отвергает проект
   * целиком. Сломали бы в панели перехода, а упало бы при сохранении.
   *
   * Сброс молчаливый и это нормально: направления у «Растворения»
   * не существует, автору нечего сообщать. Вернёт «Сдвиг» — выберет заново.
   */
  const next: Slide = { ...slides[index]!, transition };
  if (!(DIRECTED_TRANSITIONS as readonly string[]).includes(transition)) {
    delete (next as { transitionDirection?: unknown }).transitionDirection;
  }
  slides[index] = next;
  return { ...segment, slides };
}

/**
 * Куда едет переход к этому слайду.
 *
 * Отвергает направление у приёма, который его не имеет, — тем же списком
 * `DIRECTED_TRANSITIONS`, которым это проверяет схема. Дублирование здесь
 * намеренное и не является второй правдой: список ОДИН, в ядре; повторена
 * только точка отказа. Схема ловит битый файл, эта функция — битое
 * действие, и ловить его надо там, где оно произошло, а не при сохранении.
 *
 * Первый слайд отвергается по той же причине, что в `setTransition`:
 * перехода в него не существует.
 */
export function setTransitionDirection(
  segment: Segment,
  slideId: string,
  direction: TransitionDirection,
): Segment {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  if (index === 0) {
    throw new Error(
      'У первого слайда нет перехода: он стоит на нуле и является стартовым видом главы, ехать в него неоткуда',
    );
  }

  const slide = segment.slides[index]!;
  if (!(DIRECTED_TRANSITIONS as readonly string[]).includes(slide.transition)) {
    throw new Error(
      `У приёма «${slide.transition}» нет направления: оно есть только у ${DIRECTED_TRANSITIONS.join(', ')}`,
    );
  }
  if (slide.transitionDirection === direction) return segment;

  const slides = segment.slides.slice();
  slides[index] = { ...slide, transitionDirection: direction };
  return { ...segment, slides };
}

/**
 * Сколько секунд длится переход К этому слайду.
 *
 * Значение хранится как есть — ровно то, что набрал автор, без урезания
 * потолком. Урезание расстоянием до предыдущей метки (ADR-020) делает плеер
 * при воспроизведении (`morphSecondsFor`, `packages/player/src/morph.ts`),
 * а не эта функция: она не знает, где стоят соседние слайды (тот же довод,
 * что у `setTransition` выше про плеер и приём).
 *
 * Первый слайд отвергается ПО ТОЙ ЖЕ причине, что и в `setTransition`:
 * у него нет перехода вовсе, ехать в него неоткуда, значит и длительности
 * ехать некуда быть.
 */
export function setTransitionSeconds(segment: Segment, slideId: string, transitionSeconds: number): Segment {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  if (index === 0) {
    throw new Error(
      'У первого слайда нет перехода: он стоит на нуле и является стартовым видом главы, ехать в него неоткуда',
    );
  }
  if (segment.slides[index]!.transitionSeconds === transitionSeconds) return segment;

  const slides = segment.slides.slice();
  slides[index] = { ...slides[index]!, transitionSeconds };
  return { ...segment, slides };
}

/**
 * Точечная правка состояния элемента на слайде.
 *
 * Правит СУЩЕСТВУЮЩУЮ запись — если элемента ещё нет в `states` этого
 * слайда, это не правка, а первое появление, и у неё нет базового значения,
 * на которое накладывать патч (какой `zIndex` или `style` взять для того,
 * чего не было?). Первое появление элемента на слайде — забота вызывающего
 * (`state/project.ts`, `addElement`), который кладёт туда ПОЛНОЕ состояние.
 *
 * Ссылочная целостность: слайды и элементы, которых правка не коснулась,
 * остаются теми же объектами по ссылке.
 */
/**
 * Равны ли два значения состояния. `style` — вложенный объект, и сравнение
 * ссылок на нём даёт «не равны» всегда: слайды рождаются через `cloneStates`,
 * то есть с ГЛУБОКОЙ копией стиля. Без разбора по ключам правка стиля
 * не катилась бы вперёд никогда, а правка положения — катилась, и автор
 * получил бы правило, работающее через раз.
 */
function sameStateValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key],
  );
}

export function setElementState(
  segment: Segment,
  slideId: string,
  elementId: string,
  patch: Partial<ElementState>,
): Segment {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  const slide = segment.slides[index]!;
  const current = slide.states[elementId];
  if (!current) {
    throw new Error(
      `У элемента «${elementId}» нет состояния на слайде «${slideId}»: нечего править — `
        + 'элемент на этот слайд ещё не помещён',
    );
  }

  const next: ElementState = { ...current, ...patch };
  const changedKeys = (Object.keys(patch) as (keyof ElementState)[])
    .filter((key) => !sameStateValue(next[key], current[key]));
  if (changedKeys.length === 0) return segment;

  const slides = segment.slides.slice();
  slides[index] = { ...slide, states: { ...slide.states, [elementId]: next } };

  carryForward(slides, index, elementId, current, next, changedKeys);
  return { ...segment, slides };
}

/**
 * ПРАВКА КАТИТСЯ ВПЕРЁД. Решение владельца 25.08.2026.
 *
 * ЧТО БЫЛО. Слайд — снимок сцены целиком (ADR-015), поэтому у КАЖДОГО слайда
 * есть значение для каждого элемента. Но значение попадает туда двумя разными
 * путями: автор его поставил или оно скопировалось при рождении слайда.
 * Различить их модель не умеет, и оба выглядели одинаково авторскими.
 *
 * Отсюда сюрприз, который владелец описал дословно: «поставил заголовок
 * сверху, чуть-чуть передвинул, и он съехал резко на середину». Замер
 * на пустой фикстуре, заготовка «Обложка»:
 *
 * | кадр | секунда | y заголовка |
 * |---|---|---|
 * | first | 0.0 | 67.82 — куда поставил автор |
 * | slide-1 | 0.5 | 360 — что положила заготовка |
 *
 * Второй кадр заготовка завела РАДИ ПОДЗАГОЛОВКА (`visible` false→true),
 * про заголовок он мнения не имел вовсе. А плеер честно исполнял разницу:
 * полсекунды заголовок наверху, потом 0.6 с сползания вниз.
 *
 * ПРАВИЛО. Правка едет по следующим кадрам, пока значение на них СОВПАДАЕТ
 * с тем, что было до правки, и упирается в первый кадр, где стоит другое.
 * «Другое» и означает «автор поставил здесь иначе» — то есть намеренное
 * движение переживает правку, а унаследованная копия ей уступает.
 *
 * ПО КАЖДОМУ СВОЙСТВУ ОТДЕЛЬНО, а не по состоянию целиком. Автор мог
 * намеренно перекрасить элемент на третьем кадре, не трогая положения:
 * общий признак остановил бы и переезд тоже, и правка молча не доехала бы
 * туда, где ей ничего не мешало.
 *
 * ЧЕГО ПРАВИЛО НЕ ДЕЛАЕТ. Назад не катится и через кадр, где элемента нет
 * вовсе, не перепрыгивает: пропуск означает, что элемент оттуда ушёл или
 * ещё не пришёл, и что там «то же самое», сказать нечем.
 */
function carryForward(
  slides: Slide[],
  fromIndex: number,
  elementId: string,
  before: ElementState,
  after: ElementState,
  keys: readonly (keyof ElementState)[],
): void {
  const pending = new Set(keys);

  for (let i = fromIndex + 1; i < slides.length && pending.size > 0; i += 1) {
    const later = slides[i]!;
    const laterState = later.states[elementId];
    if (!laterState) return;

    const carry: Record<string, unknown> = {};
    for (const key of [...pending]) {
      if (sameStateValue(laterState[key], before[key])) {
        carry[key] = after[key];
      } else {
        // Автор поставил здесь своё — дальше это свойство не едет.
        pending.delete(key);
      }
    }

    if (Object.keys(carry).length === 0) continue;
    slides[i] = {
      ...later,
      states: { ...later.states, [elementId]: { ...laterState, ...carry } as ElementState },
    };
  }
}

/**
 * Помещает существующий элемент сегмента на слайд, где его ещё нет.
 *
 * Долг §12.4 в `docs/planning.md`. Непрерывность обеспечивало копирование
 * состояний при создании слайда, поэтому элемент, созданный на третьем
 * слайде, есть на третьем и дальше — но не на первом и втором. Осознанный
 * приход «пусть он появится ВОТ ЗДЕСЬ, а раньше его не было» выразить было
 * нечем, хотя ради него и заведено различие «нет в states» против
 * `visible: false`.
 *
 * Вид берётся из БЛИЖАЙШЕГО слайда, где элемент известен — сначала назад,
 * потом вперёд. Это не вкусовщина: переход между соседними слайдами
 * вычисляется как разница их состояний (ADR-015), поэтому вид, взятый
 * издалека, дал бы скачок на ровном месте. Ближайший сосед — единственный
 * вариант, при котором элемент приходит туда, где он и так был бы.
 *
 * Элемента без состояния ХОТЬ ГДЕ не бывает: он рождается вместе с ним
 * (`createElement`). Если такой всё же встретился, данные испорчены,
 * и падать надо здесь, а не подставлять выдуманный прямоугольник.
 */
export function putOnSlide(segment: Segment, slideId: string, elementId: string): Segment {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  if (!segment.elements.some((element) => element.id === elementId)) {
    throw new Error(`Элемента «${elementId}» нет в сегменте «${segment.id}»`);
  }

  const slide = segment.slides[index]!;
  if (slide.states[elementId]) return segment; // уже здесь — не правка, а повтор

  let source: ElementState | undefined;
  for (let i = index - 1; i >= 0 && !source; i--) source = segment.slides[i]!.states[elementId];
  for (let i = index + 1; i < segment.slides.length && !source; i++) {
    source = segment.slides[i]!.states[elementId];
  }
  if (!source) {
    throw new Error(
      `У элемента «${elementId}» нет состояния ни на одном слайде сегмента «${segment.id}» — `
        + 'откуда взять его вид, неизвестно',
    );
  }

  const slides = segment.slides.slice();
  slides[index] = { ...slide, states: { ...slide.states, [elementId]: { ...source } } };
  return { ...segment, slides };
}

/**
 * Убирает элемент со слайда, НЕ удаляя его из сегмента.
 *
 * Парное действие к `putOnSlide` (§12.4). Отличие от `removeElement` —
 * ровно то, ради чего различие вообще заведено: элемент остаётся в части
 * и на других слайдах, а с этого просто уходит. Схема такое допускает:
 * она требует, чтобы ключи `states` указывали на существующий элемент,
 * но не требует, чтобы у элемента было состояние хоть где-то.
 *
 * Слайд, где элемента и так нет, возвращается ТЕМ ЖЕ объектом: «убрать
 * дважды» — не ошибка автора, а повтор, и городить исключение на него
 * значило бы наказывать за настойчивость.
 */
export function removeFromSlide(segment: Segment, slideId: string, elementId: string): Segment {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }

  const slide = segment.slides[index]!;
  if (!slide.states[elementId]) return segment;

  const states = { ...slide.states };
  delete states[elementId];
  const slides = segment.slides.slice();
  slides[index] = { ...slide, states };
  return { ...segment, slides };
}

/**
 * Слайд, который идёт в заданную секунду, — последний, чьё время наступило.
 *
 * `words` передаётся отдельно от `segment.audio.words`, а не берётся из
 * сегмента напрямую: во время редактирования транскрипт может быть ещё
 * не тем, что уже сохранено в сегменте (например, черновик правки слов),
 * и вызывающий вправе решить, какую версию слов подставлять.
 */
/**
 * Насколько близко к метке надо стоять, чтобы попасть В НЕЁ, секунды.
 *
 * Не «допуск на дрожание»: `timeRefAt` возвращает ссылку, разрешающуюся
 * ровно в ту же секунду (привязка к слову хранит смещение, а не начало
 * слова), поэтому головка, стоящая на метке, совпадает с ней точно.
 * Число нужно для другого — автор, перемотавший на 3.003 с при метке
 * на 3.000 с, имеет в виду эту метку, а не новый слайд между ними.
 */
export const MARK_HIT_SECONDS = 0.01;

/**
 * Слайд, чья метка стоит ровно под этой секундой. `undefined` — метки нет.
 *
 * Отличается от `slideAt` тем, что не «последний наступивший», а «этот
 * самый». На этом различии стоит рождение слайда (`planning.md` §14.9):
 * правка на голом месте дорожки обязана создать слайд, а правка на метке —
 * лечь в существующий.
 */
export function slideOnMark(
  segment: Segment,
  at: number,
  words: readonly Word[],
): Slide | undefined {
  return segment.slides.find(
    (slide) => Math.abs(resolveTimeRef(slide.at, words) - at) <= MARK_HIT_SECONDS,
  );
}

export function slideAt(segment: Segment, seconds: number, words: readonly Word[]): Slide {
  const first = segment.slides[0];
  if (!first) {
    // Схема гарантирует slides.min(1) — сюда попадают только при обходе
    // валидации (состояние собрано в обход editorReducer).
    throw new Error(`В сегменте «${segment.id}» нет ни одного слайда`);
  }

  let current = first;
  for (const slide of segment.slides) {
    if (resolveTimeRef(slide.at, words) <= seconds) {
      current = slide;
    } else {
      break; // слайды идут по возрастанию времени (инвариант схемы) — дальше только позже
    }
  }
  return current;
}

/**
 * Буфер обмена слайдов (ADR-025: «слайд переносит состояние, а не момент»).
 *
 * Не несёт `at` источника — переносить его некуда: `TimeRef` вида `word`
 * указывает в расшифровку СВОЕЙ части, а в чужой части (или в той же части
 * на новом месте) этот индекс слова не значит ничего. Момент вставки решает
 * вызывающий `pasteSlide`, передавая `at` снаружи — как и у `addSlide`.
 *
 * `elements` — снимок САМИХ элементов (не только их id): автор вправе
 * скопировать слайд, удалить элемент из части и вставить — элемент обязан
 * вернуться (ADR-025, «Последствия»).
 */
export interface SlideClipboard {
  /** Только для подписи автору («слайд из части N»). В логике НЕ участвует. */
  readonly sourceSegmentId: string;
  readonly transition: Slide['transition'];
  /**
   * Длительность перехода К слайду. Переносится вместе с приёмом, а не
   * берётся умолчанием: приём и его длительность — одно свойство слайда,
   * разделённое на два поля. Скопировать «Растворение за 1.2 с» и получить
   * при вставке «Растворение за 0.6 с» значило бы поменять работу автора
   * молча. ADR-025 переносить `at` запрещает, потому что это МОМЕНТ;
   * длительность моментом не является.
   */
  readonly transitionSeconds: Slide['transitionSeconds'];
  readonly states: Readonly<Record<string, ElementState>>;
  /** Снимок элементов, на которые смотрят `states`. Ровно они, не все элементы части. */
  readonly elements: readonly Element[];
}

/**
 * Копирует слайд в буфер: снимок его состояний и элементов, на которые они
 * ссылаются.
 *
 * Элемент, упомянутый в `states`, которого нет в `segment.elements`, —
 * испорченные данные (`states` обязаны указывать на существующий элемент,
 * schema.ts). Падаем здесь же, а не подставляем выдуманный прямоугольник —
 * тот же принцип, что и в `putOnSlide` выше.
 */
export function copySlideToClipboard(segment: Segment, slideId: string): SlideClipboard {
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  const slide = segment.slides[index]!;

  const elements: Element[] = Object.keys(slide.states).map((elementId) => {
    const element = segment.elements.find((candidate) => candidate.id === elementId);
    if (!element) {
      throw new Error(
        `Слайд «${slideId}» ссылается на элемент «${elementId}», которого нет в сегменте «${segment.id}» — `
          + 'данные повреждены',
      );
    }
    return { ...element };
  });

  return {
    sourceSegmentId: segment.id,
    transition: slide.transition,
    transitionSeconds: slide.transitionSeconds,
    states: cloneStates(slide.states),
    elements,
  };
}

/**
 * Почему вставку в `at` сделать нельзя. `undefined` — можно (ADR-025, «Куда
 * именно встаёт слайд»). Ровно три причины, каждая — своя строка:
 *
 * 1. секунда `<= 0` — место первого слайда занято навсегда (ADR-015);
 * 2. секунда попадает в `MARK_HIT_SECONDS` существующей метки — это
 *    попадание В неё, а не рядом;
 * 3. секунда за длиной дорожки.
 *
 * Буфер сюда НЕ передаётся, хотя `pasteSlide` принимает его рядом с `at`:
 * все три причины — про ВРЕМЯ, и ни одна не читала бы содержимое буфера.
 * Параметр «для симметрии сигнатур» пришлось бы глушить `void`, то есть
 * заявлять необходимость, которой нет, и следующий читатель искал бы,
 * зачем он. Пустота буфера — не причина отсюда: вставлять нечего решает
 * интерфейс, у которого буфера может не быть вовсе (`undefined`).
 *
 * Существует ради интерфейса, ровно как `wordAnchorProblem` в
 * `track/marks.ts`: он обязан ОБЪЯСНИТЬ, почему кнопка «Вставить» недоступна,
 * а не гасить её молча и не ловить исключение ради текста подсказки.
 * Погашенная без причины кнопка — тупик, в котором автор не понимает,
 * что он сделал не так.
 */
export function pasteProblem(segment: Segment, at: TimeRef): string | undefined {
  const words = segment.audio.words;
  const newSeconds = seconds(at, words);

  if (newSeconds <= 0) {
    return `Начало главы занято: первый слайд стоит на нуле (получено ${secondsText(newSeconds)})`;
  }

  const hit = slideOnMark(segment, newSeconds, words);
  if (hit) {
    const hitSeconds = resolveTimeRef(hit.at, words);
    // Слайд назван ВРЕМЕНЕМ, а не ключом. Прежде здесь стояло
    // «уже стоит слайд «node-1-slide-1»» — идентификатор из схемы,
    // которого автор не заводил и не может сопоставить ни с чем на экране.
    // Имени у слайда нет вовсе (схема: id, at, transition, states),
    // а время есть, и оно же написано на его чипе и на метке дорожки —
    // то есть автор по нему слайд НАЙДЁТ. Охраняется authorText.test.ts.
    return `На ${secondsText(hitSeconds)} уже стоит слайд`;
  }

  if (newSeconds > segment.audio.duration) {
    return `За длиной дорожки: ${secondsText(newSeconds)} при длине дорожки ${secondsText(segment.audio.duration)}`;
  }

  return undefined;
}

/**
 * Вставляет слайд из буфера в `at`. Возвращает НОВЫЙ сегмент.
 *
 * `at` разрешается в секунды тем же путём, что и в `addSlide`; привязку
 * к слову (`timeRefAt`) выбирает ВЫЗЫВАЮЩИЙ — этому модулю решение не
 * принадлежит.
 *
 * Отказ по времени — целиком забота `pasteProblem`: эта функция зовёт её
 * первой строкой и бросает её же текст, ровно так же, как `retargetMark`
 * в `track/marks.ts` зовёт `wordAnchorProblem` и бросает `problem`. Проверки
 * обязаны жить в ОДНОМ месте — второй копией условий здесь они бы разъехались
 * молча, и интерфейс однажды объяснил бы отказ, которого `pasteSlide`
 * на самом деле не сделала (или наоборот).
 *
 * Индекс вставки считается ПО ВРЕМЕНИ: слайды идут по возрастанию (инвариант
 * схемы), поэтому новый слайд встаёт туда, где он оказался бы, если бы
 * список пересортировали, а не в конец и не после конкретного соседа.
 *
 * Элементы — по таблице ADR-025: тот же id с тем же `type`/`content`
 * переиспользуется; свободный id заводится с тем же именем; занятый чужим
 * элементом id получает новое имя от ПРЕФИКСА (`prefixOf` из `duplicate.ts`,
 * общий с `copySegment` — свой второй регэксп заводить нельзя, разъедутся).
 * `taken` — явный список выданных на этот вызов id: без него два новых
 * элемента одного префикса, заведённые за один вызов, получили бы одно имя
 * (тот же приём, что приватный `claimer` в `duplicate.ts`, здесь — открытым
 * кодом, потому что публичный API у генератора имён не нужен).
 */
export function pasteSlide(segment: Segment, clipboard: SlideClipboard, at: TimeRef): Segment {
  const problem = pasteProblem(segment, at);
  if (problem) throw new Error(problem);

  const words = segment.audio.words;
  const newSeconds = seconds(at, words);

  // Список занятых id для третьего случая таблицы ADR-025 — засеян тем, что
  // уже есть в части, и пополняется по мере раздачи новых имён в этом вызове.
  const taken: { id: string }[] = segment.elements.map((element) => ({ id: element.id }));

  const newElements: Element[] = [];
  const states: Record<string, ElementState> = {};

  for (const [elementId, state] of Object.entries(clipboard.states)) {
    const sourceElement = clipboard.elements.find((candidate) => candidate.id === elementId);
    if (!sourceElement) {
      throw new Error(
        `Буфер обмена испорчен: состояние элемента «${elementId}» есть, а самого элемента в буфере нет`,
      );
    }

    const existing = segment.elements.find((candidate) => candidate.id === elementId);

    if (existing && existing.type === sourceElement.type && existing.content === sourceElement.content) {
      // Тот же элемент — переиспользуем, ключ состояния остаётся прежним.
      states[elementId] = { ...state, style: { ...state.style } };
      continue;
    }

    if (!existing) {
      // id свободен — заводим элемент с тем же id.
      newElements.push({ ...sourceElement });
      taken.push({ id: elementId });
      states[elementId] = { ...state, style: { ...state.style } };
      continue;
    }

    // id занят другим элементом (иной type/content) — новое имя от префикса.
    const newId = freeId(prefixOf(elementId), taken);
    taken.push({ id: newId });
    newElements.push({ ...sourceElement, id: newId });
    states[newId] = { ...state, style: { ...state.style } };
  }

  const elements = segment.elements.concat(newElements);

  const slide: Slide = {
    id: freeId('slide', segment.slides),
    at,
    transition: clipboard.transition,
    transitionSeconds: clipboard.transitionSeconds,
    states,
  };

  let insertAt = segment.slides.length;
  for (let i = 0; i < segment.slides.length; i++) {
    if (resolveTimeRef(segment.slides[i]!.at, words) > newSeconds) {
      insertAt = i;
      break;
    }
  }

  const slides = segment.slides.slice();
  slides.splice(insertAt, 0, slide);

  return { ...segment, elements, slides };
}

/**
 * Ярлык «копировать этот слайд и вставить на `at`». Буфер автора не трогает —
 * работает через свой временный `SlideClipboard`, композиция `copySlideToClipboard`
 * и `pasteSlide`, а не третья реализация того же правила (ADR-025).
 */
export function duplicateSlideAt(segment: Segment, slideId: string, at: TimeRef): Segment {
  const clipboard = copySlideToClipboard(segment, slideId);
  return pasteSlide(segment, clipboard, at);
}
