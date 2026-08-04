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
import { resolveTimeRef } from '@player/core';
import type { ElementState, Segment, Slide, TimeRef, Word } from '@player/core';

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
    transition: 'morph',
    states: cloneStates(anchor.states),
  };

  const slides = segment.slides.slice();
  slides.splice(index + 1, 0, slide);
  return { ...segment, slides };
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
 */
export function removeSlide(segment: Segment, slideId: string): Segment {
  if (segment.slides.length <= 1) {
    throw new Error('Нельзя удалить последний слайд: сегменту нечего будет показывать');
  }
  const index = slideIndex(segment, slideId);
  if (index < 0) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segment.id}»`);
  }
  if (index === 0) {
    throw new Error('Нельзя удалить первый слайд: он обязан стоять на нуле — это стартовый вид сегмента');
  }

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
      'У первого слайда нет перехода: он стоит на нуле и является стартовым видом части, ехать в него неоткуда',
    );
  }
  if (segment.slides[index]!.transition === transition) return segment;

  const slides = segment.slides.slice();
  slides[index] = { ...slides[index]!, transition };
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
  const changed = (Object.keys(patch) as (keyof ElementState)[]).some((key) => next[key] !== current[key]);
  if (!changed) return segment;

  const slides = segment.slides.slice();
  slides[index] = { ...slide, states: { ...slide.states, [elementId]: next } };
  return { ...segment, slides };
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
