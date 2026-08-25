/**
 * Буфер обмена слайдов (ADR-025) — чистая логика, без редьюсера и без React.
 *
 * Прецедент — `duplicate.test.ts`: там тоже проверяется чистый модуль
 * (`copySegment`) напрямую, а не через `state/project.ts`. Здесь то же самое
 * для `copySlideToClipboard` / `pasteSlide` / `duplicateSlideAt`.
 */
import { describe, expect, it } from 'vitest';

import { loadProject, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Element, ElementState, Project, Segment, Slide, TimeRef } from '@player/core';

import { addProblem, addSlide, copySlideToClipboard, cutProblem, duplicateSlideAt, MARK_HIT_SECONDS, pasteProblem, pasteSlide, removeSlide, setTransition, setTransitionDirection, type SlideClipboard } from '../src/state/slides.js';
import { serializeProject } from '../src/state/save.js';

function el(id: string, type: Element['type'] = 'shape', content = ''): Element {
  return { id, type, content, locked: false };
}

function state(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {}, ...overrides };
}

const seconds = (t: number): TimeRef => ({ kind: 'seconds', t });

/** Секунды слайда — тесты используют только `kind: 'seconds'`, приведение безопасно. */
function slideSeconds(slide: Slide): number {
  if (slide.at.kind !== 'seconds') throw new Error('фикстура сломана: ожидался TimeRef.seconds');
  return slide.at.t;
}

/**
 * Часть на 10 секунд с одним элементом (`shape-1`) и двумя слайдами:
 * стартовый на нуле и второй на 5-й секунде — его и копируют в тестах.
 */
function baseSegment(): Segment {
  return {
    authorSpans: [],
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
    elements: [el('shape-1')],
    slides: [
      { id: 'slide-1', at: seconds(0), transition: 'morph', transitionSeconds: 0.6, states: { 'shape-1': state() } },
      { id: 'slide-2', at: seconds(5), transition: 'morph', transitionSeconds: 0.6, states: { 'shape-1': state({ x: 50 }) } },
    ],
    gates: [],
    exit: { rules: [], default: null },
  };
}

/** Ручной буфер — не через `copySlideToClipboard` — там, где важен ПОЛНЫЙ контроль над тем, что в нём лежит. */
function clipboardOf(
  elements: Element[],
  states: Record<string, ElementState>,
  transition: Slide['transition'] = 'morph',
): SlideClipboard {
  return { sourceSegmentId: 'other-segment', transition, transitionSeconds: 0.6, states, elements };
}

function project(segment: Segment): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Буфер обмена слайдов', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: segment.id,
    styles: [],
    segments: [segment],
  };
}

describe('pasteSlide: отказы вставки (ADR-025, «Куда именно встаёт слайд»)', () => {
  it('вставка на 0.000 отвергается: место первого слайда занято навсегда', () => {
    const segment = baseSegment();
    const clipboard = copySlideToClipboard(segment, 'slide-2');
    expect(() => pasteSlide(segment, clipboard, seconds(0))).toThrow(/нуле/);
  });

  it('вставка на секунду, занятую существующим слайдом (в пределах MARK_HIT_SECONDS), отвергается', () => {
    const segment = baseSegment();
    const clipboard = copySlideToClipboard(segment, 'slide-2');
    // slide-2 стоит на 5 с; 5 + половина MARK_HIT_SECONDS — попадание В неё.
    expect(() => pasteSlide(segment, clipboard, seconds(5 + MARK_HIT_SECONDS / 2))).toThrow(/уже стоит слайд/);
  });

  it('вставка за длиной дорожки отвергается', () => {
    const segment = baseSegment(); // duration: 10
    const clipboard = copySlideToClipboard(segment, 'slide-2');
    expect(() => pasteSlide(segment, clipboard, seconds(10.5))).toThrow(/длиной дорожки/);
  });
});

describe('pasteSlide: элементы (ADR-025, таблица из трёх случаев)', () => {
  it('элемент переиспользуется, когда в целевой части уже есть тот же id/type/content: новых элементов не заводится', () => {
    const segment = baseSegment(); // shape-1: type 'shape', content ''
    const clipboard = copySlideToClipboard(segment, 'slide-2'); // states: { 'shape-1': ... }

    const next = pasteSlide(segment, clipboard, seconds(3));

    expect(next.elements).toHaveLength(segment.elements.length); // не выросло
    const inserted = next.slides.find((s) => slideSeconds(s) === 3)!;
    expect(Object.keys(inserted.states)).toEqual(['shape-1']); // ключ состояния прежний
  });

  it('id остаётся прежним, когда он свободен в целевой части: заводится элемент с ТЕМ ЖЕ id', () => {
    const segment = baseSegment(); // не содержит 'text-9'
    const clipboard = clipboardOf([el('text-9', 'text', 'привет')], { 'text-9': state({ x: 12 }) });

    const next = pasteSlide(segment, clipboard, seconds(3));

    const created = next.elements.find((e) => e.id === 'text-9');
    // `locked: false` появилось в v11: поле с умолчанием, и созданный
    // элемент обязан его нести — иначе он не прошёл бы разбор схемы.
    expect(created).toEqual({ id: 'text-9', type: 'text', content: 'привет', locked: false });
    const inserted = next.slides.find((s) => slideSeconds(s) === 3)!;
    expect(inserted.states['text-9']).toEqual(state({ x: 12 }));
  });

  it('id занят ДРУГИМ элементом (иной type/content): заводится НОВЫЙ элемент через freeId, исходный не тронут', () => {
    const segment = baseSegment(); // shape-1: type 'shape', content ''
    const clipboard = clipboardOf([el('shape-1', 'text', 'другое')], { 'shape-1': state({ x: 77 }) });

    const next = pasteSlide(segment, clipboard, seconds(3));

    // исходный элемент цел
    expect(next.elements.find((e) => e.id === 'shape-1')).toEqual(segment.elements[0]);
    // новый элемент заведён от префикса ('shape-1' → 'shape' → 'shape-2', первый свободный)
    const created = next.elements.find((e) => e.type === 'text' && e.content === 'другое');
    expect(created?.id).toBe('shape-2');
    const inserted = next.slides.find((s) => slideSeconds(s) === 3)!;
    expect(inserted.states['shape-2']).toEqual(state({ x: 77 }));
    expect(inserted.states['shape-1']).toBeUndefined();
  });
});

describe('pasteSlide: время и снимок', () => {
  it('вставленный слайд встаёт ПО ВРЕМЕНИ, а не в конец списка', () => {
    const segment = baseSegment(); // слайды на 0 и 5
    const clipboard = copySlideToClipboard(segment, 'slide-2');

    const next = pasteSlide(segment, clipboard, seconds(2)); // между 0 и 5

    expect(next.slides.map(slideSeconds)).toEqual([0, 2, 5]);
  });

  it('буфер несёт снимок: скопировали → удалили элемент из части → вставили → элемент вернулся', () => {
    const segment = baseSegment();
    const clipboard = copySlideToClipboard(segment, 'slide-2'); // снимок сделан ДО удаления

    const withoutElement: Segment = {
      ...segment,
      elements: [],
      slides: segment.slides.map((s) => ({ ...s, states: {} })),
    };

    const next = pasteSlide(withoutElement, clipboard, seconds(3));

    expect(next.elements.some((e) => e.id === 'shape-1')).toBe(true);
    const inserted = next.slides.find((s) => slideSeconds(s) === 3)!;
    expect(inserted.states['shape-1']).toBeDefined();
  });

  it('transition переезжает из буфера, а не берётся по умолчанию', () => {
    const segment = baseSegment();
    const withCut: Segment = {
      ...segment,
      slides: [segment.slides[0]!, { ...segment.slides[1]!, transition: 'cut' }],
    };
    const clipboard = copySlideToClipboard(withCut, 'slide-2');

    const next = pasteSlide(withCut, clipboard, seconds(3));

    const inserted = next.slides.find((s) => slideSeconds(s) === 3)!;
    expect(inserted.transition).toBe('cut');
  });
});

describe('pasteSlide: результат проходит схему целиком', () => {
  it('вставленный слайд проходит ProjectSchema: порядок слайдов, отсутствие повтора id, ни одного состояния без хозяина', () => {
    const segment = baseSegment();
    const clipboard = copySlideToClipboard(segment, 'slide-2');

    const pasted = pasteSlide(segment, clipboard, seconds(3));
    const text = serializeProject(project(pasted));

    expect(() => loadProject(JSON.parse(text))).not.toThrow();
  });
});

describe('pasteProblem: те же три причины, что у pasteSlide, объяснённые текстом', () => {
  it('начало части занято: причина названа, число совпадает', () => {
    const segment = baseSegment();
    expect(pasteProblem(segment, seconds(0))).toMatch(/нуле/);
  });

  it('секунда попадает в существующую метку: причина названа', () => {
    const segment = baseSegment();
    expect(pasteProblem(segment, seconds(5 + MARK_HIT_SECONDS / 2))).toMatch(/уже стоит слайд/);
  });

  it('секунда за длиной дорожки: причина названа', () => {
    const segment = baseSegment(); // duration: 10
    expect(pasteProblem(segment, seconds(10.5))).toMatch(/длиной дорожки/);
  });

  it('вставка возможна: undefined', () => {
    const segment = baseSegment();
    expect(pasteProblem(segment, seconds(3))).toBeUndefined();
  });

  /**
   * Несущее свойство: `pasteProblem` и `pasteSlide` смотрят на ОДНИ правила.
   * Красный здесь означает ровно одно — правила разъехались (проверено
   * сломом: `pasteSlide` получила собственную дополнительную проверку,
   * которой нет в `pasteProblem`, — см. отчёт).
   */
  it('pasteProblem вернула undefined ⟺ pasteSlide не бросила', () => {
    const segment = baseSegment();
    const clipboard = copySlideToClipboard(segment, 'slide-2');
    const candidates = [0, 3, 5 + MARK_HIT_SECONDS / 2, 7, 10.5];

    for (const t of candidates) {
      const problem = pasteProblem(segment, seconds(t));
      if (problem === undefined) {
        expect(() => pasteSlide(segment, clipboard, seconds(t))).not.toThrow();
      } else {
        expect(() => pasteSlide(segment, clipboard, seconds(t))).toThrow();
      }
    }
  });
});

describe('cutProblem: почему слайд нельзя вырезать (ADR-025, третья копия правила из SlidePanel/SlideStrip)', () => {
  it('единственный слайд: причина названа', () => {
    const single: Segment = { ...baseSegment(), slides: [baseSegment().slides[0]!] };
    expect(cutProblem(single, 'slide-1')).toMatch(/Единственный слайд/);
  });

  it('первый слайд из нескольких: причина названа', () => {
    const segment = baseSegment(); // slide-1 на 0, slide-2 на 5
    expect(cutProblem(segment, 'slide-1')).toMatch(/Первый слайд/);
  });

  it('второй и далее слайд из нескольких: можно, undefined', () => {
    const segment = baseSegment();
    expect(cutProblem(segment, 'slide-2')).toBeUndefined();
  });

  /**
   * Несущее свойство: `cutProblem` и `removeSlide` смотрят на ОДНО правило —
   * ровно то, ради чего заведён `cutProblem` (устранение третьей копии).
   * Красный здесь означает, что правила разъехались.
   *
   * Проверено сломом: `removeSlide` на секунду получила собственную ветку
   * `if (index === 1) throw new Error('нельзя вырезать второй слайд')`,
   * которой нет в `cutProblem` — тест упал (`второй слайд бросил, а
   * cutProblem сказала «можно»), подтвердив, что проверка ловит расхождение.
   * Ветка убрана; тест снова зелёный.
   */
  it('cutProblem вернула undefined ⟺ removeSlide не бросила', () => {
    const segment = baseSegment();
    for (const slideId of ['slide-1', 'slide-2']) {
      const problem = cutProblem(segment, slideId);
      if (problem === undefined) {
        expect(() => removeSlide(segment, slideId)).not.toThrow();
      } else {
        expect(() => removeSlide(segment, slideId)).toThrow();
      }
    }
  });
});

describe('duplicateSlideAt: композиция copySlideToClipboard + pasteSlide', () => {
  it('дублирует слайд сегмента и вставляет копию на at за один вызов', () => {
    const segment = baseSegment();

    const next = duplicateSlideAt(segment, 'slide-2', seconds(3));

    const inserted = next.slides.find((s) => slideSeconds(s) === 3)!;
    expect(inserted.states['shape-1']).toEqual(segment.slides[1]!.states['shape-1']);
    expect(next.elements).toHaveLength(segment.elements.length);
  });
});

/**
 * Направление перехода (v10). Проверяется здесь, а не через редьюсер, по той
 * же причине, что и остальное в этом файле: логика чистая.
 */
describe('направление перехода: смена приёма не оставляет невыразимого состояния', () => {
  function directed(): Segment {
    const segment = baseSegment();
    return setTransitionDirection(setTransition(segment, 'slide-2', 'slide'), 'slide-2', 'up');
  }

  it('направление ставится приёму, у которого оно есть', () => {
    expect(directed().slides[1]!.transitionDirection).toBe('up');
  });

  it('приёму без направления его поставить НЕЛЬЗЯ — падает громко', () => {
    // «Растворение» направления не имеет. Молчаливое принятие записало бы
    // в проект поле, которое схема отвергнет при сохранении: сломали бы
    // в панели, а упало бы в другом месте и позже.
    const segment = setTransition(baseSegment(), 'slide-2', 'dissolve');
    expect(() => setTransitionDirection(segment, 'slide-2', 'up')).toThrow(/нет направления/);
  });

  it('СМЕНА приёма на ненаправленный СБРАСЫВАЕТ направление', () => {
    // Тот же дефект с другой стороны, и эта сторона опаснее: здесь автор
    // ничего запрещённого не делает — он просто передумал. Без сброса
    // проект переставал бы проходить валидацию после обычного клика.
    const after = setTransition(directed(), 'slide-2', 'dissolve');

    expect(after.slides[1]!.transition).toBe('dissolve');
    expect(after.slides[1]!.transitionDirection).toBeUndefined();
    expect('transitionDirection' in after.slides[1]!).toBe(false);
  });

  it('сброшенное направление доживает до файла: сохранённый проект валиден', () => {
    // Контрольная строка. Проверка «поля нет в объекте» прошла бы и у кода,
    // который кладёт туда undefined — а `undefined` в JSON исчезает молча,
    // и разница между «нет ключа» и «ключ со значением undefined» видна
    // только тому, кто сериализует. Здесь она и проверяется.
    const segment = setTransition(directed(), 'slide-2', 'dissolve');
    const project: Project = {
      schemaVersion: SCHEMA_VERSION,
      meta: { title: 'т', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
      entry: segment.id,
      styles: [],
      segments: [segment],
    };

    expect(() => loadProject(JSON.parse(serializeProject(project)))).not.toThrow();
  });
});

/**
 * Меню не предлагает того, что редьюсер отвергнет.
 *
 * КУПЛЕНО ПАДЕНИЕМ РЕДАКТОРА 25.08.2026. Пункт «Поставить слайд здесь» был
 * единственным в меню дорожки без проверки: он звал `addSlide` вслепую,
 * и когда на секунде уже стоял слайд, бросок прилетал ИЗНУТРИ редьюсера —
 * то есть уносил всё дерево редактора, а не одно действие. Владелец описал
 * это словами «получилось случайно три слайда, после этого я никакой из них
 * не смог даже удалить»: удалять было нечем, полосы дорожки на экране
 * больше не существовало.
 *
 * УТВЕРЖДЕНИЕ ОДНОСТОРОННЕЕ, И ЭТО НАРОЧНО. `addProblem` строже редьюсера
 * (см. её комментарий), поэтому равенства между ними быть не должно —
 * должно быть включение: бросок ⇒ причина. Проверять равенство значило бы
 * закрепить тестом ровно ту дыру, из-за которой всё и упало.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ. Убери у `addProblem` проверку
 * занятого места — и на секунде слайда появится бросок без причины. Убери
 * проверку первого слайда — покраснеет отрицательная секунда. Тождеством
 * это не является: `addSlide` знает правило отказом, `addProblem` — словами,
 * и написаны они порознь.
 *
 * Якорь берётся так же, как его берёт меню (`handleAddSlideHere`):
 * последний слайд СТРОГО раньше новой секунды. Это часть проверяемого
 * утверждения — меню и правило обязаны целиться в одно место.
 */
describe('addProblem: там, где addSlide бросает, у меню есть причина', () => {
  /** Как ставит слайд меню: якорь — последний слайд строго раньше секунды. */
  function addHere(segment: Segment, at: TimeRef): void {
    const t = (at as { kind: 'seconds'; t: number }).t;
    const before = [...segment.slides]
      .filter((slide) => slideSeconds(slide) < t)
      .sort((a, b) => slideSeconds(b) - slideSeconds(a))[0];
    if (!before) throw new Error('Некуда поставить слайд: до этой секунды нет ни одного');
    addSlide(segment, before.id, at);
  }

  /* Слайды фикстуры стоят на 0 и 5, дорожка 10 с. Выборка нарочно накрывает
     обе границы вплотную: занятые секунды, соседние с ними и промежутки. */
  const sweep = [-1, 0, 0.001, 2.5, 4.999, 5, 5.001, 7.5, 9.9];

  for (const t of sweep) {
    it(`секунда ${t}: если addSlide отказывает, причина названа`, () => {
      const segment = baseSegment();
      const at = seconds(t);

      let threw = false;
      try {
        addHere(segment, at);
      } catch {
        threw = true;
      }

      if (threw) expect(addProblem(segment, at)).toBeTypeOf('string');
    });
  }

  it('ни одна секунда дорожки не роняет редьюсер молча', () => {
    const segment = baseSegment();
    const survivors: number[] = [];

    // Шаг 1 мс — мельче, чем окно MARK_HIT_SECONDS (10 мс), иначе выборка
    // проскочила бы мимо него и объявила зелень, ничего не проверив.
    for (let ms = -100; ms <= 10_000; ms += 1) {
      const at = seconds(ms / 1000);
      if (addProblem(segment, at) !== undefined) continue;
      try {
        addHere(baseSegment(), at);
      } catch {
        survivors.push(ms / 1000);
      }
    }

    expect(survivors).toEqual([]);
  });

  it('на занятой секунде причина названа ВРЕМЕНЕМ, тем же текстом, что у «Вставить»', () => {
    const segment = baseSegment();
    const at = seconds(5);
    expect(addProblem(segment, at)).toBe(pasteProblem(segment, at));
  });

  it('раньше первого слайда — своя причина, а не та же самая', () => {
    expect(addProblem(baseSegment(), seconds(0)))
      .toBe('Раньше первого слайда поставить нельзя: он держит начало главы');
  });
});
