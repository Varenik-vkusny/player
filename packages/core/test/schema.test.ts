import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadProject, ProjectLoadError } from '../src/load.js';
import { SCHEMA_VERSION } from '../src/schema.js';

const FIXTURES = new URL('../../../fixtures/projects/', import.meta.url).pathname.slice(1);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

describe('эталонные фикстуры', () => {
  const names = readdirSync(FIXTURES).filter((n) => n.endsWith('.json'));

  it('фикстуры вообще существуют', () => {
    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  it.each(names)('%s загружается без ошибок', (name) => {
    const project = loadProject(fixture(name));
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('валидация падает громко', () => {
  it('ссылка на слово при пустом транскрипте невалидна', () => {
    const broken = fixture('minimal.json') as Record<string, any>;
    broken.audio.words = [];
    expect(() => loadProject(broken)).toThrow(ProjectLoadError);
  });

  it('анимация на несуществующий элемент невалидна', () => {
    const broken = fixture('minimal.json') as Record<string, any>;
    broken.scene.cues[0].targetId = 'нет-такого';
    expect(() => loadProject(broken)).toThrow(/несуществующий элемент/);
  });

  it('время за пределами дорожки невалидно', () => {
    const broken = fixture('edge-cases.json') as Record<string, any>;
    broken.scene.cues[0].at = { kind: 'seconds', t: 9999 };
    expect(() => loadProject(broken)).toThrow(/выходит за длительность/);
  });

  it('запрещённое для анимации свойство не проходит', () => {
    const broken = fixture('minimal.json') as Record<string, any>;
    broken.scene.cues[0].animation.property = 'width';
    expect(() => loadProject(broken)).toThrow(ProjectLoadError);
  });

  it('гейт с выбором обязан иметь correctId среди вариантов', () => {
    const broken = fixture('two-gates.json') as Record<string, any>;
    broken.scene.gates[0].config.correctId = 'opt-несуществующий';
    expect(() => loadProject(broken)).toThrow(/correctId/);
  });

  it('конец слова раньше начала невалиден', () => {
    const broken = fixture('minimal.json') as Record<string, any>;
    broken.audio.words[0] = { ...broken.audio.words[0], start: 5, end: 1 };
    expect(() => loadProject(broken)).toThrow(ProjectLoadError);
  });

  it('сообщение об ошибке перечисляет проблемы, а не отделывается общими словами', () => {
    const broken = fixture('minimal.json') as Record<string, any>;
    broken.scene.cues[0].targetId = 'нет-такого';
    try {
      loadProject(broken);
      expect.unreachable('загрузка должна была упасть');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectLoadError);
      expect((error as ProjectLoadError).issues.length).toBeGreaterThan(0);
    }
  });
});
