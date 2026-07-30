import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ProjectSchema } from '@player/core';
import type { Project, Segment } from '@player/core';

import { ANIMATION_PRESETS, ELEMENT_LIBRARY } from '../src/state/library.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import { applyTemplate, SCENE_TEMPLATES, sceneTemplate, type SceneTemplate } from '../src/state/templates.js';
import { connect, uncoveredOutcomes } from '../src/state/exits.js';

const ROOT = new URL('../../../', import.meta.url).pathname.slice(1);
const STAGE = { width: 1920, height: 1080 };

/**
 * Сегмент с одним слайдом на нуле и трёхсекундной дорожкой — короче любой
 * дорожки в фикстурах проекта не бывает, ни одна метка шаблона не позже 3 с
 * именно по этой причине (см. задание сессии).
 */
function emptySegment(): Segment {
  return {
    id: 'seg-1',
    title: '',
    audio: { src: 'audio/test.mp3', duration: 3, words: [] },
    elements: [],
    slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
    gates: [],
    exit: { rules: [], default: null },
  };
}

function projectAround(segment: Segment): Project {
  return {
    schemaVersion: 3,
    meta: { title: 'Тест шаблона', stageWidth: STAGE.width, stageHeight: STAGE.height },
    entry: segment.id,
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
  it('каждый option.id совпадает с id созданного элемента, correctId — один из вариантов', () => {
    const segment = applyTemplate(sceneTemplate('question'), emptySegment(), STAGE);
    const gate = segment.gates[0];
    expect(gate).toBeDefined();
    if (!gate) throw new Error('гейт «question» не создан');
    const config = gate.config;
    if (config.kind !== 'choice') throw new Error('гейт «question» обязан быть choice');

    const elementIds = new Set(segment.elements.map((e) => e.id));
    for (const option of config.options) {
      expect(elementIds.has(option.id), `option.id «${option.id}» должен быть id реального элемента`).toBe(true);
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

        if (te.preset !== undefined) {
          it(`preset «${te.preset}» есть в ANIMATION_PRESETS`, () => {
            expect(ANIMATION_PRESETS.some((preset) => preset.id === te.preset)).toBe(true);
          });
        }
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
  const audio = { src: 'a.mp3', duration: 10, words: [] };

  function projectWithQuestion(): { project: Project; gateId: string; optionIds: string[] } {
    const segment = applyTemplate(sceneTemplate('question'), emptySegment(), STAGE);
    const gate = segment.gates[0]!;
    const optionIds = gate.config.kind === 'choice' ? gate.config.options.map((option) => option.id) : [];
    return {
      project: {
        schemaVersion: 3,
        meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
        entry: 'n1',
        segments: [
          { ...segment, id: 'n1', audio },
          {
            id: 'n2',
            title: 'Да',
            audio,
            elements: [],
            slides: [{ id: 'n2-slide', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
            gates: [],
            exit: { rules: [], default: null },
          },
          {
            id: 'n3',
            title: 'Нет',
            audio,
            elements: [],
            slides: [{ id: 'n3-slide', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
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

    let next = connect(project, 'n1', { kind: 'equals', variable: gateId, value: optionIds[0]! }, 'n2');
    next = connect(next, 'n1', { kind: 'equals', variable: gateId, value: optionIds[1]! }, 'n3');

    expect(uncoveredOutcomes(next.segments[0]!, next.segments[0]!.gates)).toEqual([]);
    // И главное: получившийся проект обязан ЗАГРУЖАТЬСЯ. Судит настоящий
    // валидатор, а не моё представление о его правилах.
    const parsed = ProjectSchema.safeParse(next);
    expect(
      parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe('ok');
  });
});
