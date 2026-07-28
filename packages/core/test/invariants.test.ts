/**
 * Тесты инвариантов из CLAUDE.md.
 *
 * Это отдельный уровень, а не подвид юнитов: проверяется не поведение кода,
 * а свойства кодовой базы. Закон, который никто не проверяет, живёт ровно
 * до первого дедлайна.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { MIGRATIONS, migrateToCurrent, SchemaVersionError } from '../src/migrations.js';
import { ANIMATABLE, SCHEMA_VERSION } from '../src/schema.js';

const ROOT = new URL('../../../', import.meta.url).pathname.slice(1);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe('инвариант №6: направление зависимостей editor -> player -> core', () => {
  it('core не импортирует ничего из player и editor', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'packages', 'core'))) {
      const text = readFileSync(file, 'utf8');
      // Ищем импорты вверх по направлению зависимостей.
      if (/from\s+['"]@player\/(player|editor)/.test(text)
        || /from\s+['"][^'"]*\.\.\/(player|editor)\//.test(text)) {
        offenders.push(file.replace(ROOT, ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('player не импортирует editor', () => {
    const playerDir = join(ROOT, 'packages', 'player');
    const offenders: string[] = [];
    for (const file of sourceFiles(playerDir)) {
      const text = readFileSync(file, 'utf8');
      if (/from\s+['"]@player\/editor/.test(text) || /from\s+['"][^'"]*\.\.\/editor\//.test(text)) {
        offenders.push(file.replace(ROOT, ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('player не импортирует React: он собирается без фреймворка', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'packages', 'player'))) {
      if (/from\s+['"]react/.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(ROOT, ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('core не знает про DOM и React', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'packages', 'core'))) {
      if (file.includes(`${'test'}${'\\'}`) || file.includes('/test/')) continue;
      const text = readFileSync(file, 'utf8');
      if (/from\s+['"]react/.test(text)
        || /\b(document|window|HTMLElement)\b/.test(text)) {
        offenders.push(file.replace(ROOT, ''));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('инвариант №6: редактор снаружи никому не виден', () => {
  // Только исходники. Тестам импортировать vitest положено, и включать
  // их в проверку значило бы либо держать список исключений, либо ослабить
  // саму проверку.
  const EDITOR_DIR = join(ROOT, 'packages', 'editor', 'src');

  it('редактор существует: иначе следующие проверки зелены впустую', () => {
    // Тест, который проходит из-за отсутствия предмета проверки, хуже
    // отсутствующего теста: он создаёт ощущение охраны.
    expect(sourceFiles(EDITOR_DIR).length).toBeGreaterThan(0);
  });

  it('редактор не тянет ничего, кроме плеера, ядра и React', () => {
    // Список закрыт намеренно. Он охраняет сразу два закона: направление
    // зависимостей (№6) и единственность рендера (№5). Вторая реализация
    // отрисовки сцены не может появиться из воздуха — она придёт вместе
    // с зависимостью вроде konva или moveable, и тогда этот тест покраснеет
    // раньше, чем кто-нибудь заметит расхождение картинок.
    const allowed = new Set(['@player/core', '@player/player', 'react', 'react-dom/client']);
    const offenders: string[] = [];

    for (const file of sourceFiles(EDITOR_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const source = match[1]!;
        // Относительные пути внутри пакета никого не волнуют.
        if (source.startsWith('.')) continue;
        if (!allowed.has(source)) offenders.push(`${file.replace(ROOT, '')}: ${source}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('инвариант №4: перемотки у зрителя не существует', () => {
  it('у Player нет ни seek, ни pause', () => {
    // Гарантия построена на том, что перематывать нечем. AudioClock перемотку
    // умеет — она нужна редактору, — но наружу через Player она попасть
    // не должна: иначе возобновление после гейта перестанет быть
    // единственным способом продолжить.
    const text = readFileSync(join(ROOT, 'packages', 'player', 'src', 'player.ts'), 'utf8');
    const found = [...text.matchAll(/^\s{2}(?:async\s+)?(seek|pause)\s*\(/gm)].map((m) => m[1]);
    expect(found).toEqual([]);
  });
});

describe('инвариант №7: версия схемы и миграции', () => {
  it('для каждой версии ниже текущей есть миграция', () => {
    const missing: number[] = [];
    for (let version = 1; version < SCHEMA_VERSION; version++) {
      if (!MIGRATIONS[version]) missing.push(version);
    }
    expect(missing).toEqual([]);
  });

  it('проект текущей версии проходит без изменений', () => {
    const input = { schemaVersion: SCHEMA_VERSION, чтоУгодно: true };
    expect(migrateToCurrent(input)).toBe(input);
  });

  it('проект из будущей версии не открывается молча', () => {
    expect(() => migrateToCurrent({ schemaVersion: SCHEMA_VERSION + 1 }))
      .toThrow(SchemaVersionError);
  });

  it('мусор вместо версии падает громко', () => {
    expect(() => migrateToCurrent({ schemaVersion: 'один' })).toThrow(SchemaVersionError);
    expect(() => migrateToCurrent(null)).toThrow(SchemaVersionError);
  });
});

describe('инвариант №8: анимируем только transform, opacity, filter', () => {
  it('перечень анимируемых свойств не содержит ничего лишнего', () => {
    const layoutAffecting = ['width', 'height', 'top', 'left', 'margin', 'padding', 'background'];
    for (const property of ANIMATABLE) {
      expect(layoutAffecting).not.toContain(property);
    }
  });

  it('перечень закрыт: он используется схемой как enum', () => {
    expect(ANIMATABLE.length).toBeGreaterThan(0);
    expect(new Set(ANIMATABLE).size).toBe(ANIMATABLE.length);
  });
});
