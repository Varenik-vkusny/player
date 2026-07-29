/**
 * Механизм миграций схемы.
 *
 * Заводится сразу, с версией 1, до того как понадобился. Первая миграция
 * всегда пишется в спешке, когда уже есть пользовательские файлы; пустой,
 * но работающий и покрытый тестом механизм превращает эту задачу в рутинную.
 *
 * Инвариант №7: новая версия схемы обязана появляться вместе с миграцией.
 * Это проверяется тестом инвариантов, а не ревью.
 */
import { SCHEMA_VERSION } from './schema.js';

/** Миграция — чистая функция: получает данные версии N, возвращает версии N+1. */
export type Migration = (input: unknown) => unknown;

/** Идентификатор единственного узла, в который сворачивается проект версии 1. */
export const ENTRY_NODE_ID = 'node-1';

/**
 * Форма проекта версии 1 ровно в той мере, в какой миграция её читает.
 *
 * Поля необязательные намеренно: миграция работает до валидации и не имеет
 * права падать на битом входе своим TypeError. Отсутствующее поле доедет
 * до Zod и получит внятное сообщение с путём.
 */
interface ProjectV1 {
  meta?: { title?: unknown };
  audio?: unknown;
  scene?: unknown;
}

/**
 * v1 → v2: «одна дорожка, одна сцена» становится графом из одного узла.
 *
 * audio и scene переносятся по ссылке, без правки полей: так ни одно поле
 * не может тихо поменять смысл по дороге. Рёбер нет — узел без исходящих
 * рёбер и есть концовка, то есть сегодняшнее поведение проекта.
 */
const migrateV1toV2: Migration = (input) => {
  const v1 = input as ProjectV1;
  return {
    schemaVersion: 2,
    meta: v1.meta,
    entry: ENTRY_NODE_ID,
    nodes: [
      {
        id: ENTRY_NODE_ID,
        title: v1.meta?.title,
        audio: v1.audio,
        scene: v1.scene,
        edges: [],
      },
    ],
  };
};

export const MIGRATIONS: Readonly<Record<number, Migration>> = Object.freeze({
  1: migrateV1toV2,
});

export class SchemaVersionError extends Error {
  constructor(message: string, readonly found: unknown) {
    super(message);
    this.name = 'SchemaVersionError';
  }
}

function readVersion(input: unknown): number {
  if (typeof input !== 'object' || input === null) {
    throw new SchemaVersionError('Проект должен быть объектом', input);
  }
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SchemaVersionError(
      `Некорректная schemaVersion: ${JSON.stringify(version)}`,
      version,
    );
  }
  return version;
}

/**
 * Поднимает проект до текущей версии схемы.
 *
 * Падает громко на неизвестной будущей версии: файл из более новой версии
 * продукта нельзя открыть «как получится» — это тихая потеря данных.
 */
export function migrateToCurrent(input: unknown): unknown {
  let version = readVersion(input);

  if (version > SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `Проект сохранён в версии схемы ${version}, а эта сборка понимает только ${SCHEMA_VERSION}. `
      + 'Обновите приложение.',
      version,
    );
  }

  let current = input;
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new SchemaVersionError(
        `Нет миграции с версии ${version} на ${version + 1}. `
        + 'Каждая версия схемы обязана иметь миграцию (инвариант №7).',
        version,
      );
    }
    current = migration(current);
    version = readVersion(current);
  }

  return current;
}
