import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ProjectSchema } from '@player/core';
import type { Project, Scene } from '@player/core';

import { ANIMATION_PRESETS, ELEMENT_LIBRARY } from '../src/state/library.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import { applyTemplate, SCENE_TEMPLATES, sceneTemplate, type SceneTemplate } from '../src/state/templates.js';
import { connect, uncoveredOptions } from '../src/state/graph.js';

const ROOT = new URL('../../../', import.meta.url).pathname.slice(1);
const STAGE = { width: 1920, height: 1080 };

function emptyScene(): Scene {
  return { elements: [], cues: [], gates: [] };
}

/**
 * Минимальный валидный проект вокруг сцены — узел с трёхсекундной дорожкой,
 * чтобы поймать метку шаблона, которая ушла за конец дорожки (см. задание
 * сессии: ни один шаблон не имеет права ставить метку позже 3 с именно
 * по этой причине — узлы фикстуры `branching.json` тоже трёхсекундные).
 */
function projectAround(scene: Scene): Project {
  return {
    schemaVersion: 2,
    meta: { title: 'Тест шаблона', stageWidth: STAGE.width, stageHeight: STAGE.height },
    entry: 'node-1',
    nodes: [
      {
        id: 'node-1',
        title: '',
        audio: { src: 'audio/test.mp3', duration: 3, words: [] },
        scene,
        edges: [],
      },
    ],
  };
}

describe('SCENE_TEMPLATES: каждый шаблон даёт сцену, которую принимает настоящая схема', () => {
  for (const template of SCENE_TEMPLATES) {
    it(`«${template.id}» проходит ProjectSchema.safeParse`, () => {
      const scene = applyTemplate(template, emptyScene(), STAGE);
      const project = projectAround(scene);
      const result = ProjectSchema.safeParse(project);
      if (!result.success) {
        // Issues в сообщении теста — иначе отладка была бы вслепую.
        expect.fail(`«${template.id}» не проходит схему: ${JSON.stringify(result.error.issues, null, 2)}`);
      }
    });
  }
});

describe('applyTemplate: двойное применение не даёт конфликта id', () => {
  for (const template of SCENE_TEMPLATES) {
    it(`«${template.id}» дважды подряд — все id уникальны`, () => {
      const once = applyTemplate(template, emptyScene(), STAGE);
      const twice = applyTemplate(template, once, STAGE);

      const elementIds = twice.elements.map((e) => e.id);
      expect(new Set(elementIds).size).toBe(elementIds.length);

      const cueIds = twice.cues.map((c) => c.id);
      expect(new Set(cueIds).size).toBe(cueIds.length);

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

describe('applyTemplate: добавляет к сцене, не заменяет её', () => {
  it('существующие элементы остаются теми же объектами по ссылке, новые добавлены', () => {
    const existing = emptyScene();
    const withOld = applyTemplate(sceneTemplate('title'), existing, STAGE);
    const oldElement = withOld.elements[0]!;

    const withNew = applyTemplate(sceneTemplate('bullets'), withOld, STAGE);

    // Старый элемент — тот же объект, новые добавлены следом.
    expect(withNew.elements[0]).toBe(oldElement);
    expect(withNew.elements.length).toBe(withOld.elements.length + 4);
  });

  it('шаблон без гейта не трогает существующий массив gates — та же ссылка', () => {
    const scene = emptyScene();
    const next = applyTemplate(sceneTemplate('title'), scene, STAGE);
    expect(next.gates).toBe(scene.gates);
  });

  it('шаблон без анимаций не трогает существующий массив cues — та же ссылка', () => {
    // Ни один из пяти шаблонов сегодня не обходится совсем без анимаций,
    // поэтому эталон — сцена уже с cues от предыдущего применения: второе
    // применение шаблона БЕЗ гейта (title) не обязано трогать чужие cues,
    // если оно не добавляет своих — но title добавляет анимацию, так что
    // здесь проверяем именно то, что предыдущие cues остаются как есть,
    // а не заменяются новым массивом целиком.
    const scene = emptyScene();
    const withTitle = applyTemplate(sceneTemplate('title'), scene, STAGE);
    const oldCue = withTitle.cues[0]!;
    const withBullets = applyTemplate(sceneTemplate('bullets'), withTitle, STAGE);
    expect(withBullets.cues[0]).toBe(oldCue);
  });

  it('zIndex новых элементов выше существующих', () => {
    const withOld = applyTemplate(sceneTemplate('title'), emptyScene(), STAGE);
    const maxOld = Math.max(...withOld.elements.map((e) => e.zIndex));
    const withNew = applyTemplate(sceneTemplate('title'), withOld, STAGE);
    const added = withNew.elements.slice(withOld.elements.length);
    expect(added.every((e) => e.zIndex > maxOld)).toBe(true);
  });
});

describe('шаблон «question»: гейт привязан к реально созданным элементам', () => {
  it('каждый option.id совпадает с id созданного элемента, correctId — один из вариантов', () => {
    const scene = applyTemplate(sceneTemplate('question'), emptyScene(), STAGE);
    const gate = scene.gates[0];
    expect(gate).toBeDefined();
    if (!gate) throw new Error('гейт «question» не создан');
    const config = gate.config;
    if (config.kind !== 'choice') throw new Error('гейт «question» обязан быть choice');

    const elementIds = new Set(scene.elements.map((e) => e.id));
    for (const option of config.options) {
      expect(elementIds.has(option.id), `option.id «${option.id}» должен быть id реального элемента`).toBe(true);
    }
    expect(config.options.some((option) => option.id === config.correctId)).toBe(true);
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
    return projectAround(emptyScene());
  }

  it('применение шаблона добавляет РОВНО один шаг в history.past', () => {
    const state = initialHistoryState(baseProject());
    expect(state.history.past.length).toBe(0);

    const next = historyReducer(state, { type: 'applyTemplate', template: sceneTemplate('title') });
    expect(next.history.past.length).toBe(1);
    expect(next.history.present.nodes[0]!.scene.elements.length).toBe(1);
  });

  it('один undo убирает шаблон целиком', () => {
    const state = initialHistoryState(baseProject());
    const afterApply = historyReducer(state, { type: 'applyTemplate', template: sceneTemplate('question') });
    expect(afterApply.history.present.nodes[0]!.scene.elements.length).toBe(3);
    expect(afterApply.history.present.nodes[0]!.scene.gates.length).toBe(1);

    const afterUndo = historyReducer(afterApply, { type: 'undo' });
    expect(afterUndo.history.present.nodes[0]!.scene.elements.length).toBe(0);
    expect(afterUndo.history.present.nodes[0]!.scene.gates.length).toBe(0);
    expect(afterUndo.history.present).toBe(state.history.present);
  });
});

/**
 * Проходимость, а не только валидность.
 *
 * Шаблон «вопрос с вариантами» затевался ради готового взаимодействия, и
 * следующее, что автор сделает, — разведёт варианты по разным узлам. Схема
 * не запрещает гейту без рёбер держать бесконечный `retry`, поэтому такой
 * шаблон прошёл бы и `ProjectSchema`, и все проверки формы данных — а потом
 * `graph.connect` отказал бы автору ровно на том действии, ради которого
 * он шаблон и нажал.
 *
 * Проверяем не «валидны ли данные», а «доходит ли автор до цели»: тот же
 * класс, что найденная в Сессии 4 навсегда недостижимая ветка.
 */
describe('шаблон «вопрос»: варианты действительно можно развести по узлам', () => {
  const audio = { src: 'a.mp3', duration: 10, words: [] };

  function projectWithQuestion(): { project: Project; gateId: string; optionIds: string[] } {
    const scene = applyTemplate(
      sceneTemplate('question'),
      { elements: [], cues: [], gates: [] },
      { width: 1920, height: 1080 },
    );
    const gate = scene.gates[0]!;
    const optionIds = gate.config.kind === 'choice' ? gate.config.options.map((option) => option.id) : [];
    return {
      project: {
        schemaVersion: 2,
        meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
        entry: 'n1',
        nodes: [
          { id: 'n1', title: '', audio, scene, edges: [] },
          { id: 'n2', title: 'Да', audio, scene: { elements: [], cues: [], gates: [] }, edges: [] },
          { id: 'n3', title: 'Нет', audio, scene: { elements: [], cues: [], gates: [] }, edges: [] },
        ],
      },
      gateId: gate.id,
      optionIds,
    };
  }

  it('гейт шаблона не держит бесконечный retry: иначе connect откажет', () => {
    const { project, gateId } = projectWithQuestion();
    const gate = project.nodes[0]!.scene.gates.find((candidate) => candidate.id === gateId)!;
    expect(gate.onWrong === 'retry' && gate.maxAttempts === null).toBe(false);
  });

  it('оба варианта разводятся по разным узлам, и покрытие становится полным', () => {
    const { project, gateId, optionIds } = projectWithQuestion();
    expect(optionIds).toHaveLength(2);

    let next = connect(project, 'n1', { kind: 'option', gateId, optionId: optionIds[0]! }, 'n2');
    next = connect(next, 'n1', { kind: 'option', gateId, optionId: optionIds[1]! }, 'n3');

    expect(uncoveredOptions(next.nodes[0]!)).toEqual([]);
    // И главное: получившийся проект обязан ЗАГРУЖАТЬСЯ. Судит настоящий
    // валидатор, а не моё представление о его правилах.
    const parsed = ProjectSchema.safeParse(next);
    expect(
      parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe('ok');
  });
});
