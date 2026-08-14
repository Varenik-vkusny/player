/**
 * Сироты цвета.
 *
 * Проверка на пустоту, снятая заранее: «на чистом проекте сирот нет» верно
 * при любой реализации, включая ту, что всегда возвращает пустой список.
 * Поэтому каждый тест ниже требует НЕНУЛЕВОЕ и ТОЧНОЕ число на данных,
 * где сироты расставлены нарочно, а один тест прямо проверяет, что здоровые
 * ссылки сиротами не считаются.
 */
import { loadProject } from '@player/core';
import type { Project } from '@player/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { colorOrphans } from '../src/state/colorOrphans.js';

const FIXTURE = fileURLToPath(new URL('../../../fixtures/projects/styles.json', import.meta.url));
const base = (): Project => loadProject(JSON.parse(readFileSync(FIXTURE, 'utf8')));

/**
 * Сироты фикстуры: стили проекта плюс слайды ЕДИНСТВЕННОГО её сегмента.
 *
 * Функция принимает стили и слайды, а не проект: `project.segments` читаются
 * ровно в одном месте, и тест инвариантов это охраняет — он и поймал первую
 * редакцию, ходившую к проекту напрямую.
 */
const orphansOf = (project: Project) => colorOrphans(project.styles, project.segments[0]!.slides);

describe('сироты цвета', () => {
  it('здоровая фикстура не даёт ни одной сироты', () => {
    // Фикстура ссылается на роли ТОЛЬКО с запасом: `var(--scene-accent, #4c8dff)`.
    // Слом: убрать запас в фикстуре — тест покраснеет. Он же страхует
    // от реализации, которая считает сиротой любую ссылку подряд.
    expect(orphansOf(base())).toEqual([]);
  });

  it('неизвестная роль в СТИЛЕ находится, и место названо', () => {
    const project = base();
    project.styles[0]!.props['color'] = 'var(--scene-nonexistent, #fff)';

    const found = orphansOf(project);

    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe('unknown-role');
    expect(found[0]!.role).toBe('--scene-nonexistent');
    expect(found[0]!.where).toEqual({ kind: 'style', styleId: 'heading' });
  });

  it('ссылка БЕЗ запасного значения — тоже сирота, хотя роль существует', () => {
    // Самый неочевидный случай и самый дорогой: сегодня она разрешается,
    // а в другом проекте, где роли нет, элемент почернеет насквозь.
    // Слом: считать сиротой только неизвестную роль — тест краснеет здесь.
    const project = base();
    project.styles[1]!.props['color'] = 'var(--scene-ink-muted)';

    const found = orphansOf(project);

    expect(found).toHaveLength(1);
    expect(found[0]!.reason).toBe('no-fallback');
    expect(found[0]!.role).toBe('--scene-ink-muted');
  });

  it('сирота у ЭЛЕМЕНТА на слайде находится и указывает слайд', () => {
    const project = base();
    project.segments[0]!.slides[0]!.states['sub']!.style['color'] = 'var(--нет-такой)';

    const found = orphansOf(project);

    expect(found).toHaveLength(1);
    expect(found[0]!.where).toEqual({ kind: 'element', slideId: 'st-1', elementId: 'sub' });
  });

  it('считает КАЖДОЕ место, а не каждую роль', () => {
    // Одна и та же сломанная роль в трёх местах — это три места, которые
    // автору придётся открыть. Слом: складывать в Set по имени роли —
    // тест покраснеет на числе.
    const project = base();
    project.styles[0]!.props['color'] = 'var(--scene-nope, #fff)';
    project.styles[1]!.props['color'] = 'var(--scene-nope, #fff)';
    project.segments[0]!.slides[1]!.states['note']!.style['background'] = 'var(--scene-nope, #000)';

    expect(orphansOf(project)).toHaveLength(3);
  });

  it('две ссылки внутри одного значения считаются обе', () => {
    const project = base();
    project.styles[2]!.props['background'] =
      'linear-gradient(var(--scene-a), var(--scene-b, #fff))';

    const found = orphansOf(project);

    expect(found.map((o) => o.role)).toEqual(['--scene-a', '--scene-b']);
  });
});
