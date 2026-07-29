import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject, migrateToCurrent, SCHEMA_VERSION } from '../src/index.js';

const FIXTURES = join(process.cwd(), 'fixtures', 'projects');

describe('миграция v1 → v2', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));
  // branching.json — фикстура Задачи 4, собрана сразу в версии 2 и мигрировать
  // не должна: проверки «сворачивается в один узел» относятся только к семи
  // старым файлам версии 1.
  const v1files = files.filter((f) => f !== 'branching.json');

  it('фикстуры на месте: иначе тест зелен впустую', () => {
    expect(files.length).toBe(8);
    expect(v1files.length).toBe(7);
  });

  it.each(v1files)('%s открывается после миграции', (file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
    const project = loadProject(raw);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.nodes).toHaveLength(1);
    expect(project.nodes[0]!.edges).toEqual([]);
  });

  it.each(v1files)('%s: озвучка и сцена переносятся без правок', (file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
    const project = loadProject(raw);
    const node = project.nodes[0]!;
    expect(node.audio.src).toBe(raw.audio.src);
    expect(node.audio.duration).toBe(raw.audio.duration);
    expect(node.audio.words).toHaveLength(raw.audio.words.length);
    expect(node.scene.elements).toHaveLength(raw.scene.elements.length);
    expect(node.scene.gates).toHaveLength(raw.scene.gates.length);
  });

  it('миграция чистая: исходный объект не тронут', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'minimal.json'), 'utf8'));
    const before = JSON.stringify(raw);
    migrateToCurrent(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('стартовый узел указывает на единственный узел', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'demo.json'), 'utf8'));
    const project = loadProject(raw);
    expect(project.entry).toBe(project.nodes[0]!.id);
  });
});
