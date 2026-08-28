import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ProjectSchema, resolveTimeRef, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Project, Segment } from '@player/core';

import { ELEMENT_LIBRARY } from '../src/state/library.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import { applyTemplate, askOnStage, SCENE_TEMPLATES, sceneTemplate, type SceneTemplate } from '../src/state/templates.js';
import { connect, uncoveredOutcomes } from '../src/state/exits.js';
import { addOption, createGate, setGateKind, setPrompt } from '../src/state/gates.js';

const ROOT = new URL('../../../', import.meta.url).pathname.slice(1);
const STAGE = { width: 1920, height: 1080 };

/**
 * Сегмент с одним слайдом на нуле и трёхсекундной дорожкой — короче любой
 * дорожки в фикстурах проекта не бывает, ни одна метка шаблона не позже 3 с
 * именно по этой причине (см. задание сессии).
 */
function emptySegment(): Segment {
  return {
    authorSpans: [],
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'audio/test.mp3', offset: 0, duration: 3, words: [] },
    elements: [],
    slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
    gates: [],
    exit: { rules: [], default: null },
  };
}

function projectAround(segment: Segment): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест шаблона', stageWidth: STAGE.width, stageHeight: STAGE.height, theme: ThemeSchema.parse({}) },
    entry: segment.id,
    styles: [],
    fonts: [],
    segments: [segment],
  };
}

describe('SCENE_TEMPLATES: каждый шаблон даёт сегмент, который принимает настоящая схема', () => {
  for (const template of SCENE_TEMPLATES) {
    it(`«${template.id}» проходит ProjectSchema.safeParse`, () => {
      const segment = applyTemplate(template, emptySegment(), STAGE);
      const project = projectAround(segment);
      const result = ProjectSchema.safeParse(project);
      if (!result.success) {
        expect.fail(`«${template.id}» не проходит схему: ${JSON.stringify(result.error.issues, null, 2)}`);
      }
    });
  }
});

describe('applyTemplate: двойное применение не даёт конфликта id', () => {
  for (const template of SCENE_TEMPLATES) {
    it(`«${template.id}» дважды подряд — все id уникальны`, () => {
      const once = applyTemplate(template, emptySegment(), STAGE);
      const twice = applyTemplate(template, once, STAGE);

      const elementIds = twice.elements.map((e) => e.id);
      expect(new Set(elementIds).size).toBe(elementIds.length);

      const slideIds = twice.slides.map((s) => s.id);
      expect(new Set(slideIds).size).toBe(slideIds.length);

      const gateIds = twice.gates.map((g) => g.id);
      expect(new Set(gateIds).size).toBe(gateIds.length);

      // Схема тоже должна принять результат двойного применения.
      const project = projectAround(twice);
      const result = ProjectSchema.safeParse(project);
      if (!result.success) {
        expect.fail(
          `двойное применение «${template.id}» не проходит схему: ${JSON.stringify(result.error.issues, null, 2)}`,
        );
      }
    });
  }
});

describe('applyTemplate: добавляет к сегменту, не заменяет его', () => {
  it('существующие элементы остаются теми же объектами по ссылке, новые добавлены', () => {
    const withOld = applyTemplate(sceneTemplate('title'), emptySegment(), STAGE);
    const oldElement = withOld.elements[0]!;

    const withNew = applyTemplate(sceneTemplate('bullets'), withOld, STAGE);

    // Старый элемент — тот же объект, новые добавлены следом.
    expect(withNew.elements[0]).toBe(oldElement);
    expect(withNew.elements.length).toBe(withOld.elements.length + 4);
  });

  it('шаблон без гейта не трогает существующий массив gates — та же ссылка', () => {
    const segment = emptySegment();
    const next = applyTemplate(sceneTemplate('title'), segment, STAGE);
    expect(next.gates).toBe(segment.gates);
  });
});

describe('шаблон «question»: гейт привязан к реально созданным элементам', () => {
  /**
   * ЧТО ИМЕННО ЗДЕСЬ ОХРАНЯЕТСЯ. Заготовка «вопрос» обещает автору, что
   * зритель будет жать по НАРИСОВАННЫМ фигурам, а не по системным кнопкам
   * поверх сцены. Держится это обещание на ссылке `option.elementId`.
   *
   * Проверка сменилась вместе с устройством (ADR-035, схема v15): до неё
   * связь выражалась совпадением `option.id` с идентификатором элемента,
   * и тест сверял совпадение. Совпадение больше не значит ничего — плеер
   * читает только поле.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: заготовка перестала проставлять `elementId`
   * (зритель получит системные кнопки вместо фигур автора) или проставила
   * ссылку на элемент, которого в сегменте нет (проект не разберётся).
   */
  it('каждый ответ ссылается на реально созданный элемент, correctId — один из вариантов', () => {
    const segment = applyTemplate(sceneTemplate('question'), emptySegment(), STAGE);
    const gate = segment.gates[0];
    expect(gate).toBeDefined();
    if (!gate) throw new Error('гейт «question» не создан');
    const config = gate.config;
    if (config.kind !== 'choice') throw new Error('гейт «question» обязан быть choice');

    const elementIds = new Set(segment.elements.map((e) => e.id));
    for (const option of config.options) {
      expect(
        option.elementId,
        `ответ «${option.id}» не привязан к фигуре — зритель получит системную кнопку`,
      ).toBeDefined();
      expect(
        elementIds.has(option.elementId!),
        `ответ «${option.id}» ссылается на элемент «${option.elementId}», которого нет в сегменте`,
      ).toBe(true);
    }
    expect(config.options.some((option) => option.id === config.correctId)).toBe(true);
  });

  it('гейт несёт recordAs, равный собственному id', () => {
    const segment = applyTemplate(sceneTemplate('question'), emptySegment(), STAGE);
    const gate = segment.gates[0]!;
    expect(gate.recordAs).toBe(gate.id);
  });
});

describe('SCENE_TEMPLATES: ссылки на библиотеки существуют', () => {
  for (const template of SCENE_TEMPLATES) {
    describe(`«${template.id}»`, () => {
      for (const te of template.elements) {
        it(`item «${te.item}» есть в ELEMENT_LIBRARY`, () => {
          expect(ELEMENT_LIBRARY.some((item) => item.id === te.item)).toBe(true);
        });

        /* Проверки «preset заготовки есть в ANIMATION_PRESETS» больше нет:
           поля `preset` у элемента заготовки не существует с 25.08.2026.
           Плитка кладёт всё сразу, одним кадром — решение владельца,
           разбор в комментарии к SceneTemplate.elements. */
      }
    });
  }
});

describe('пополнение SCENE_TEMPLATES не требует правок в React', () => {
  const templatesPanelSource = readFileSync(
    join(ROOT, 'packages', 'editor', 'src', 'panels', 'TemplatesPanel.tsx'),
    'utf8',
  );

  it('каталог шаблонов не пуст — иначе проверка ничего не проверяет', () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThan(0);
  });

  for (const template of SCENE_TEMPLATES as readonly SceneTemplate[]) {
    it(`id «${template.id}» не встречается в исходнике TemplatesPanel.tsx`, () => {
      expect(templatesPanelSource).not.toContain(`'${template.id}'`);
      expect(templatesPanelSource).not.toContain(`"${template.id}"`);
    });

    it(`label «${template.label}» не встречается в исходнике TemplatesPanel.tsx`, () => {
      expect(templatesPanelSource).not.toContain(template.label);
    });
  }

  it('сам компонент не содержит списка шаблонов — только чтение SCENE_TEMPLATES', () => {
    expect(templatesPanelSource).toContain('SCENE_TEMPLATES');
  });
});

describe('applyTemplate через historyReducer: один шаг истории', () => {
  function baseProject(): Project {
    return projectAround(emptySegment());
  }

  it('применение шаблона добавляет РОВНО один шаг в history.past', () => {
    const state = initialHistoryState(baseProject());
    expect(state.history.past.length).toBe(0);

    const next = historyReducer(state, { type: 'applyTemplate', template: sceneTemplate('title') });
    expect(next.history.past.length).toBe(1);
    expect(next.history.present.segments[0]!.elements.length).toBe(1);
  });

  it('один undo убирает шаблон целиком', () => {
    const state = initialHistoryState(baseProject());
    const afterApply = historyReducer(state, { type: 'applyTemplate', template: sceneTemplate('question') });
    expect(afterApply.history.present.segments[0]!.elements.length).toBe(3);
    expect(afterApply.history.present.segments[0]!.gates.length).toBe(1);

    const afterUndo = historyReducer(afterApply, { type: 'undo' });
    expect(afterUndo.history.present.segments[0]!.elements.length).toBe(0);
    expect(afterUndo.history.present.segments[0]!.gates.length).toBe(0);
    expect(afterUndo.history.present).toBe(state.history.present);
  });
});

/**
 * Проходимость, а не только валидность.
 *
 * Шаблон «вопрос с вариантами» затевался ради готового взаимодействия, и
 * следующее, что автор сделает, — разведёт варианты по разным сегментам.
 * Проверяем не «валидны ли данные», а «доходит ли автор до цели».
 */
describe('шаблон «вопрос»: варианты действительно можно развести по сегментам', () => {
  const audio = { src: 'a.mp3', offset: 0, duration: 10, words: [] };

  function projectWithQuestion(): { project: Project; gateId: string; optionIds: string[] } {
    const segment = applyTemplate(sceneTemplate('question'), emptySegment(), STAGE);
    const gate = segment.gates[0]!;
    const optionIds = gate.config.kind === 'choice' ? gate.config.options.map((option) => option.id) : [];
    return {
      project: {
        schemaVersion: SCHEMA_VERSION,
        meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
        entry: 'n1',
        styles: [],
        fonts: [],
        segments: [
          { ...segment, id: 'n1', audio },
          {
            authorSpans: [],
            id: 'n2',
            title: 'Да',
            description: '',
            audio,
            elements: [],
            slides: [{ id: 'n2-slide', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
            gates: [],
            exit: { rules: [], default: null },
          },
          {
            authorSpans: [],
            id: 'n3',
            title: 'Нет',
            description: '',
            audio,
            elements: [],
            slides: [{ id: 'n3-slide', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
            gates: [],
            exit: { rules: [], default: null },
          },
        ],
      },
      gateId: gate.id,
      optionIds,
    };
  }

  it('оба варианта разводятся по разным сегментам, и покрытие становится полным', () => {
    const { project, gateId, optionIds } = projectWithQuestion();
    expect(optionIds).toHaveLength(2);

    let next = connect(project, 'n1', [{ kind: 'equals', variable: gateId, value: optionIds[0]! }], 'n2');
    next = connect(next, 'n1', [{ kind: 'equals', variable: gateId, value: optionIds[1]! }], 'n3');

    expect(uncoveredOutcomes(next, next.segments[0]!.id)).toEqual([]);
    // И главное: получившийся проект обязан ЗАГРУЖАТЬСЯ. Судит настоящий
    // валидатор, а не моё представление о его правилах.
    const parsed = ProjectSchema.safeParse(next);
    expect(
      parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe('ok');
  });
});

/**
 * askOnStage: вопрос уже стоящей остановки становится частью сцены —
 * настоящими элементами вместо служебной плашки (владелец, 21.08.2026,
 * задание сессии). Каждый тест ниже сопровождён тем, что именно должно
 * сломаться в коде, чтобы он покраснел — «декоративный тест без слома»
 * тут недопустим по CLAUDE.md.
 */
describe('askOnStage: вопрос остановки становится частью сцены', () => {
  /** Гейт «дальше» на секунде 1 — то, с чего начинается любая метка. */
  function continueGateAt(seconds: number) {
    return createGate('gate-1', { kind: 'seconds', t: seconds });
  }

  function newElementIds(before: Segment, after: Segment): string[] {
    const beforeIds = new Set(before.elements.map((e) => e.id));
    return after.elements.filter((e) => !beforeIds.has(e.id)).map((e) => e.id);
  }

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: askOnStage перестаёт вызывать setGateKind (или
  // вызывает его неверно) — гейт остаётся «дальше», и зритель не увидит
  // вопроса вовсе.
  it('у остановки вида «дальше» после вызова вид стал choice', () => {
    const segment = { ...emptySegment(), gates: [continueGateAt(1)] };
    const result = askOnStage(segment, 'gate-1', STAGE);
    expect(result.gates[0]!.config.kind).toBe('choice');
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: забыт вопрос, забыт один из вариантов, или лишний
  // элемент кладётся на сцену (например, дубликат варианта).
  it('на сцене появилось элементов ровно 1 + число вариантов', () => {
    const segment = { ...emptySegment(), gates: [continueGateAt(1)] };
    const result = askOnStage(segment, 'gate-1', STAGE);
    const gate = result.gates[0]!;
    if (gate.config.kind !== 'choice') throw new Error('гейт обязан стать choice');
    expect(result.elements.length).toBe(segment.elements.length + 1 + gate.config.options.length);
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: askOnStage перестаёт звать bindOption (варианты
  // остаются с elementId === undefined — зритель получит системные кнопки
  // вместо нарисованных фигур), либо привязывает не к тому id.
  it('каждый вариант связан со своим элементом, и все ссылки ведут на реально существующие элементы', () => {
    const segment = { ...emptySegment(), gates: [continueGateAt(1)] };
    const result = askOnStage(segment, 'gate-1', STAGE);
    const gate = result.gates[0]!;
    if (gate.config.kind !== 'choice') throw new Error('гейт обязан стать choice');
    const elementIds = new Set(result.elements.map((e) => e.id));
    for (const option of gate.config.options) {
      expect(option.elementId, `вариант «${option.id}» не привязан к элементу`).toBeDefined();
      expect(elementIds.has(option.elementId!), `ссылка «${option.elementId}» ведёт в никуда`).toBe(true);
    }
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: раскладка лишних вариантов перестаёт сдвигать dx
  // (например, все варианты получают dx первого) — тогда два bindOption
  // указали бы на элементы с одинаковыми координатами, но САМ id элементов
  // всё равно СВОЙ у каждого варианта (createElement их не путает); этот
  // тест проверяет именно СВОИ id, а не совпадение координат (для координат
  // есть отдельный тест на трёх вариантах ниже) — ломается, если bindOption
  // вызывается с одним и тем же elementId дважды.
  it('два варианта не делят одну фигуру — все elementId различны', () => {
    const segment = { ...emptySegment(), gates: [continueGateAt(1)] };
    const result = askOnStage(segment, 'gate-1', STAGE);
    const gate = result.gates[0]!;
    if (gate.config.kind !== 'choice') throw new Error('гейт обязан стать choice');
    const ids = gate.config.options.map((option) => option.elementId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: insertOrPatchSlideAt перестаёт находить слайд на
  // секунде гейта (например, если атора перепутали >/>= при поиске anchor),
  // и патч уезжает не в тот слайд — либо элементы получают состояние уже на
  // первом слайде (видны с начала главы, а не с остановки).
  it('элементы видны В МОМЕНТ ОСТАНОВКИ: у слайда на секунде гейта есть их состояния, у слайда ДО неё — нет', () => {
    const segment = { ...emptySegment(), gates: [continueGateAt(1.5)] };
    const before = segment;
    const result = askOnStage(segment, 'gate-1', STAGE);
    const newIds = newElementIds(before, result);
    expect(newIds.length).toBeGreaterThan(0);

    const words = result.audio.words;
    const atSeconds = resolveTimeRef(result.gates[0]!.at, words);
    const gateSlide = result.slides.find((slide) => resolveTimeRef(slide.at, words) === atSeconds);
    expect(gateSlide, 'слайд на секунде остановки обязан существовать').toBeDefined();
    for (const id of newIds) {
      expect(gateSlide!.states[id], `элемент «${id}» не появился на слайде остановки`).toBeDefined();
    }

    // Слайд на нуле (до остановки) — ни один новый элемент состояния не несёт.
    const firstSlide = result.slides.find((slide) => resolveTimeRef(slide.at, words) === 0)!;
    for (const id of newIds) {
      expect(firstSlide.states[id], `элемент «${id}» виден с начала главы, а не с остановки`).toBeUndefined();
    }
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: вопрос кладётся с содержимым заготовки
  // («Вопрос?») вместо config.prompt — тогда автор поставил бы вопрос
  // на дорожке, а на сцене увидел бы заглушку.
  it('текст вопроса на сцене совпадает с prompt остановки', () => {
    let gate = continueGateAt(1);
    gate = setGateKind(gate, 'choice');
    gate = setPrompt(gate, 'Продолжаем дальше?');
    const segment = { ...emptySegment(), gates: [gate] };
    const result = askOnStage(segment, 'gate-1', STAGE);
    const finalGate = result.gates[0]!;
    if (finalGate.config.kind !== 'choice') throw new Error('гейт обязан остаться choice');
    const optionElementIds = new Set(finalGate.config.options.map((o) => o.elementId));
    const questionElement = result.elements.find((e) => !optionElementIds.has(e.id));
    expect(questionElement, 'элемент вопроса не найден среди новых элементов').toBeDefined();
    expect(questionElement!.content).toBe('Продолжаем дальше?');
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: проверка существования гейта убрана или найдена
  // по неверному полю (например, ищем по recordAs вместо id).
  it('вызов на несуществующей остановке — бросает', () => {
    const segment = emptySegment();
    expect(() => askOnStage(segment, 'no-such-gate', STAGE)).toThrow();
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: askOnStage кладёт битую ссылку (elementId на
  // несуществующий элемент) или пустую строку в content — оба случая схема
  // ловит, а этот тест — нет, если проверять только форму объекта, а не
  // прогонять настоящий ProjectSchema.safeParse.
  it('проект с результатом askOnStage остаётся загружаемым схемой', () => {
    const segment = { ...emptySegment(), gates: [continueGateAt(1)] };
    const result = askOnStage(segment, 'gate-1', STAGE);
    const project = projectAround(result);
    const parsed = ProjectSchema.safeParse(project);
    expect(
      parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe('ok');
  });

  // ЧТО ДОЛЖНО СЛОМАТЬСЯ: раскладка третьего варианта перестаёт сдвигать dx
  // относительно первых двух (например, dxStep всегда 0) — тогда третья
  // кнопка легла бы поверх первой или второй, зритель не смог бы нажать
  // на неё отдельно.
  it('гейт с тремя вариантами даёт три кнопки, и их x попарно различны', () => {
    let gate = continueGateAt(1);
    gate = setGateKind(gate, 'choice');
    gate = addOption(gate); // третий вариант поверх стандартных двух.
    expect(gate.config.kind === 'choice' && gate.config.options.length).toBe(3);
    const segment = { ...emptySegment(), gates: [gate] };

    const result = askOnStage(segment, 'gate-1', STAGE);
    const finalGate = result.gates[0]!;
    if (finalGate.config.kind !== 'choice') throw new Error('гейт обязан остаться choice');
    expect(finalGate.config.options.length).toBe(3);

    const words = result.audio.words;
    const atSeconds = resolveTimeRef(finalGate.at, words);
    const gateSlide = result.slides.find((slide) => resolveTimeRef(slide.at, words) === atSeconds)!;
    const xs = finalGate.config.options.map((option) => gateSlide.states[option.elementId!]!.x);
    expect(new Set(xs).size).toBe(3);
  });
});
