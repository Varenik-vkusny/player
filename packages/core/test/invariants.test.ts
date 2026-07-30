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

/** Что редактору разрешено импортировать за пределами своего пакета. */
const ALLOWED_EDITOR_IMPORTS = new Set([
  '@player/core',
  '@player/player',
  'react',
  'react-dom/client',
]);

/**
 * Внешние источники, из которых импортирует файл.
 *
 * Блочные комментарии вырезаются до поиска: пояснение, цитирующее строку
 * импорта, — не импорт. Строчные комментарии остаются, и это осознанно:
 * вырезать их надёжно нельзя, не разбирая строковые литералы, а охраннику
 * положено ошибаться в сторону строгости.
 */
function externalImportsOf(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const sources: string[] = [];
  for (const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const source = match[1]!;
    // Относительные пути внутри пакета никого не волнуют.
    if (source.startsWith('.')) continue;
    sources.push(source);
  }
  return sources;
}

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
    const offenders: string[] = [];

    for (const file of sourceFiles(EDITOR_DIR)) {
      for (const source of externalImportsOf(readFileSync(file, 'utf8'))) {
        if (!ALLOWED_EDITOR_IMPORTS.has(source)) {
          offenders.push(`${file.replace(ROOT, '')}: ${source}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('охранник ловит запрещённый импорт, а не только молчит', () => {
    // Проверка самого охранника. Тест, который зелен потому, что ничего
    // не проверяет, хуже отсутствующего — это правило записано парой строк
    // выше про сам редактор, и к охраннику оно относится ровно так же.
    expect(externalImportsOf(`import { a } from 'konva';`)).toEqual(['konva']);
    expect(externalImportsOf(`export { b } from "moveable";`)).toEqual(['moveable']);
    expect(externalImportsOf(`import { c } from './local.js';`)).toEqual([]);
  });

  it('упоминание импорта в пояснении не считается импортом', () => {
    // Охранник читает исходник текстом, а не разбирает его. Пока он смотрел
    // и на комментарии, честное пояснение вида «список сверен с `eases`
    // фактического пакета» роняло инвариант: в нём процитирована строка
    // импорта, которой в коде нет. Обратная сторона — комментарий стал бы
    // способом спрятать настоящую зависимость от проверки, поэтому из текста
    // вырезаются только блочные комментарии: именно в них живут пояснения,
    // где цитировать импорт естественно. Строчные остаются под подозрением —
    // охраннику положено ошибаться в сторону строгости, потому что лишнее
    // срабатывание приводит человека посмотреть, а пропуск — нет.
    const text = [
      '/**',
      " * Список сверен с `import { eases } from 'animejs'` установленного пакета.",
      ' */',
      "import { ANIMATABLE } from '@player/core';",
    ].join('\n');
    expect(externalImportsOf(text)).toEqual(['@player/core']);
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

  it('перечень закрыт и назван поимённо', () => {
    // Поимённо, а не «длина больше нуля»: в версии схемы 2 перечень был
    // enum'ом кью и потому охранялся самой схемой. Кью больше нет, перечень
    // стал законом для движка морфинга — и если его не проверять составом,
    // проверка становится зелёной впустую.
    expect([...ANIMATABLE]).toEqual([
      'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'opacity', 'filter',
    ]);
    expect(new Set(ANIMATABLE).size).toBe(ANIMATABLE.length);
  });

  it('изменение width и height между слайдами инвариант не нарушает', () => {
    // Геометрия слайда хранит width/height, но морфинг анимирует их через
    // scaleX/scaleY, то есть через transform. Модель хранит, композитор двигает.
    expect(ANIMATABLE).toContain('scaleX');
    expect(ANIMATABLE).toContain('scaleY');
  });
});

/**
 * Файлы, которым читать `project.segments` и `project.entry` положено
 * по должности.
 *
 * Дверца защищает от размазывания доступа к СОДЕРЖИМОМУ сегмента — аудио,
 * элементам, слайдам. Перечисленные ниже работают с самим КОСТЯКОМ: они
 * ищут сегмент, добавляют, удаляют, считают достижимость. Требовать от них
 * ходить через `segmentOf` — то же, что требовать от редактора оглавления
 * смотреть на книгу через страницу.
 *
 * Список закрытый и растёт только через ADR. Каждая запись обязана
 * объяснять, почему файл работает с костяком, а не с содержимым:
 *
 * schema.ts — валидатор: он определяет формат, ему поля видеть обязательно.
 * graph.ts — поиск сегмента и выбор следующего, это и есть работа с костяком.
 * preview.ts — сама дверца.
 * state/project.ts — редьюсер редактора, сторона записи, парная к segmentOf
 *   (ADR-010). Читать проект целиком — его работа.
 * state/exits.ts — правила выхода и состав сегментов, то есть редактор
 *   костяка. Содержимое сегмента он не трогает вовсе.
 * state/editorHistory.ts — починка после отмены: проверяет, существует ли
 *   ещё сегмент, который автор смотрел. Тот же род работы, что у project.ts.
 * panels/SegmentPanel.tsx — панель самого костяка: рисует список сегментов
 *   и правила выхода. Ей костяк и показывать. Содержимое сегмента —
 *   элементы, слайды, аудио — она не открывает.
 *
 * ЧТО ОХРАНЯЕТСЯ НА САМОМ ДЕЛЕ. Дверца бережёт путь к СОДЕРЖИМОМУ: код,
 * который хочет элементы, слайды или дорожку, обязан спросить `segmentOf`.
 * Именно поэтому переходы v1→v2 и v2→v3 поменяли одну функцию. Перечисление
 * сегментов костяка — другая работа, и запрещать её значило бы требовать
 * от редактора оглавления смотреть на книгу через страницу.
 */
const NARROW_DOOR_EXEMPT = [
  join('packages', 'core', 'src', 'schema.ts'),
  join('packages', 'core', 'src', 'graph.ts'),
  join('packages', 'player', 'src', 'preview.ts'),
  join('packages', 'editor', 'src', 'state', 'project.ts'),
  join('packages', 'editor', 'src', 'state', 'exits.ts'),
  join('packages', 'editor', 'src', 'state', 'editorHistory.ts'),
  join('packages', 'editor', 'src', 'panels', 'SegmentPanel.tsx'),
];

/** Код без комментариев: пояснение, называющее поле, — не обращение к нему. */
function codeWithoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('дверца: project.segments и project.entry читают в одном месте', () => {
  const DIRS = [
    join(ROOT, 'packages', 'core', 'src'),
    join(ROOT, 'packages', 'player', 'src'),
    join(ROOT, 'packages', 'editor', 'src'),
    join(ROOT, 'apps', 'playground', 'src'),
  ];

  it('охранник умеет находить нарушение: иначе он зелен впустую', () => {
    const code = codeWithoutComments('const s = project.segments; // project.entry');
    expect(/project\.(segments|entry)\b/.test(code)).toBe(true);
  });

  it('охранник не считает нарушением комментарий', () => {
    const code = codeWithoutComments('// поменяется project.segments, а не всё выше');
    expect(/project\.(segments|entry)\b/.test(code)).toBe(false);
  });

  it('вне дверцы к segments и entry напрямую не ходят', () => {
    const offenders: string[] = [];

    for (const dir of DIRS) {
      for (const file of sourceFiles(dir)) {
        const relative = file.replace(ROOT, '').replace(/^[\\/]/, '');
        if (NARROW_DOOR_EXEMPT.some((exempt) => relative.endsWith(exempt))) continue;
        const code = codeWithoutComments(readFileSync(file, 'utf8'));
        for (const match of code.matchAll(/project\.(segments|entry)\b/g)) {
          offenders.push(`${relative}: project.${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
