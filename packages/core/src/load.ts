/**
 * Загрузка проекта: миграция, затем валидация. Оба шага падают громко.
 *
 * «Чини корень»: никаких значений по умолчанию вместо ошибки, никаких
 * пропущенных битых полей. Проект, который не проходит валидацию, не
 * открывается — иначе автор узнает о повреждении данных тогда, когда
 * воспроизведение доедет до сломанного места.
 */
import { ProjectSchema, type Project } from './schema.js';
import { migrateToCurrent } from './migrations.js';

export class ProjectLoadError extends Error {
  constructor(message: string, readonly issues: readonly string[]) {
    super(message);
    this.name = 'ProjectLoadError';
  }
}

export function loadProject(input: unknown): Project {
  const migrated = migrateToCurrent(input);
  const result = ProjectSchema.safeParse(migrated);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '<корень>'}: ${issue.message}`,
    );
    throw new ProjectLoadError(
      `Проект не прошёл валидацию (${issues.length} проблем):\n  ${issues.join('\n  ')}`,
      issues,
    );
  }

  return result.data;
}
