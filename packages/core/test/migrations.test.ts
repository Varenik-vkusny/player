/**
 * Миграции схемы: v1 → v2 → v3 → v4.
 *
 * Главное здесь — не «проект открылся», а «проект означает то же самое».
 * Валидный результат с другим смыслом — самый дорогой способ ошибиться:
 * он выглядит как успех.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadProject } from '../src/load.js';
import { MIGRATIONS, migrateToCurrent, SchemaVersionError } from '../src/migrations.js';
import { ProjectSchema, SCHEMA_VERSION } from '../src/schema.js';
import { resolveTimeRef } from '../src/time.js';

// fileURLToPath, а не pathname.slice(1): на Linux путь начинается со слэша,
// и slice(1) отрезал бы его. Приём уже размножался по тестам копированием.
const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): any => JSON.parse(readFileSync(join(DIR, name), 'utf8'));
const all = readdirSync(DIR).filter((name) => name.endsWith('.json'));

/** Секунды каждого слайда сегмента — чтобы проверять, что состояние наступает вовремя. */
function timeline(name: string, segmentIndex = 0) {
  const segment = loadProject(raw(name)).segments[segmentIndex]!;
  return segment.slides.map((slide) => ({
    t: Number(resolveTimeRef(slide.at, segment.audio.words).toFixed(3)),
    states: slide.states,
  }));
}

describe('реестр миграций', () => {
  it('для каждой версии ниже текущей есть миграция', () => {
    for (let version = 1; version < SCHEMA_VERSION; version++) {
      expect(MIGRATIONS[version], `нет миграции с версии ${version}`).toBeTypeOf('function');
    }
  });

  it('проект из будущей версии не открывается молча', () => {
    expect(() => migrateToCurrent({ schemaVersion: SCHEMA_VERSION + 1 }))
      .toThrow(SchemaVersionError);
  });

  it('мусор вместо версии падает громко', () => {
    expect(() => migrateToCurrent({ schemaVersion: 'три' })).toThrow(SchemaVersionError);
    expect(() => migrateToCurrent(null)).toThrow(SchemaVersionError);
  });

  it('миграция чистая: исходный объект не тронут', () => {
    const input = raw('minimal.json');
    const before = JSON.stringify(input);
    migrateToCurrent(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('все эталонные фикстуры открываются цепочкой', () => {
  it('их не меньше восьми: иначе проверка зелена впустую', () => {
    expect(all.length).toBeGreaterThanOrEqual(8);
  });

  it('в наборе есть и версия 1, и версия 2: проверяется цепочка, а не одна ступень', () => {
    const versions = all.map((name) => raw(name).schemaVersion);
    expect(versions).toContain(1);
    expect(versions).toContain(2);
  });

  it.each(all)('%s', (name) => {
    const project = loadProject(raw(name));
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.segments.length).toBeGreaterThan(0);
    expect(project.segments.map((s) => s.id)).toContain(project.entry);
    for (const segment of project.segments) {
      // Сегмент без слайда показывать нечем. Схема этого не примет, но проверить
      // стоит и здесь: произвести слайд — обязанность миграции.
      expect(segment.slides.length).toBeGreaterThan(0);
    }
  });

  it('озвучка переносится без правок', () => {
    for (const name of all.filter((n) => raw(n).schemaVersion === 1)) {
      const source = raw(name);
      const segment = loadProject(source).segments[0]!;
      expect(segment.audio.src).toBe(source.audio.src);
      expect(segment.audio.duration).toBe(source.audio.duration);
      expect(segment.audio.words).toHaveLength(source.audio.words.length);
      expect(segment.elements).toHaveLength(source.scene.elements.length);
      expect(segment.gates).toHaveLength(source.scene.gates.length);
    }
  });
});

describe('кью превращаются в слайды, а не схлопываются', () => {
  it('морфинг покрыт большинством фикстур, а не только новыми', () => {
    const многослайдовые = all.filter((name) =>
      loadProject(raw(name)).segments.some((s) => s.slides.length > 1));
    // Схлопывание в один слайд оставило бы движок морфинга без покрытия
    // со стороны мигрированных проектов — planning.md §11.3.
    expect(многослайдовые.length).toBeGreaterThanOrEqual(5);
  });

  it('каждый кью даёт начало и конец, поэтому длительность не теряется', () => {
    // minimal.json: один кью opacity 0 → 1 на слове №3, длительность 400 мс.
    const slides = timeline('minimal.json');
    expect(slides.length).toBe(3);
    expect(slides[0]!.t).toBe(0);
    expect(Number((slides[2]!.t - slides[1]!.t).toFixed(3))).toBe(0.4);
  });

  it('первый слайд всегда на нуле', () => {
    for (const name of all) {
      for (const segment of loadProject(raw(name)).segments) {
        expect(segment.slides[0]!.at, name).toEqual({ kind: 'seconds', t: 0 });
      }
    }
  });
});

describe('состояние до первого кью — тот же закон, что ADR-009', () => {
  it('элемент стоит там, где стоял бы в версии 2, а не в базовой геометрии', () => {
    // two-gates: question едет y 40 → 0 на слове №0. До начала кью элемент
    // обязан стоять НЕПОДВИЖНО на смещённой позиции, а не сползать к ней.
    const slides = timeline('two-gates.json');
    const y = (i: number) => slides[i]!.states['question']!.y;
    expect(y(0)).toBe(y(1));            // с нуля до старта кью не двигается
    expect(y(1)).toBeGreaterThan(y(2)); // и только потом едет вверх
  });

  it('элемент не виден до собственной анимации появления', () => {
    // Ровно дефект, который стоил Сессии 2 отдельного ADR: карточка была
    // видна все восемь секунд, а потом «появлялась».
    const slides = timeline('two-gates.json');
    for (let i = 0; i < slides.length - 1; i++) {
      expect(slides[i]!.states['card']!.visible, `слайд ${i} на ${slides[i]!.t} с`).toBe(false);
    }
    expect(slides.at(-1)!.states['card']!.visible).toBe(true);
  });
});

describe('свойства кью переводятся, а не переносятся по имени', () => {
  it('x и y — это СМЕЩЕНИЯ поверх раскладки, а не координаты', () => {
    // demo: dot едет y 0 → −60 на слове №58. В состоянии слайда y обязан
    // стать «базовый минус 60», а не «−60».
    const ys = timeline('demo.json').map((s) => s.states['dot']!.y);
    const base = ys[0]!;
    expect(base).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBe(base - 60);
  });

  it('scale переводится в размер, и ноль — законное состояние', () => {
    const slides = timeline('edge-cases.json');
    expect(slides[0]!.states['rotated']!.width).toBe(0);
    expect(slides[0]!.states['rotated']!.height).toBe(0);
    expect(slides[1]!.states['rotated']!.width).toBeGreaterThan(0);
  });

  it('scaleX трогает только ширину', () => {
    const slides = timeline('demo.json');
    expect(new Set(slides.map((s) => s.states['accent']!.height)).size).toBe(1);
    expect(new Set(slides.map((s) => s.states['accent']!.width)).size).toBeGreaterThan(1);
  });

  it('opacity: 0 выражается видимостью, а не нулевой прозрачностью', () => {
    const hidden = timeline('demo.json')[0]!.states['title']!;
    expect(hidden.visible).toBe(false);
    // Именно 1, а не 0: когда элемент проявится, он проявится полностью.
    // «нет в states», «visible: false» и «opacity: 0» — три разные вещи.
    expect(hidden.opacity).toBe(1);
  });
});

describe('элемент теряет геометрию и стиль, оставляя личность', () => {
  it('у элемента остаются только id, type и content', () => {
    const element = loadProject(raw('demo.json')).segments[0]!.elements[0]!;
    expect(Object.keys(element).sort()).toEqual(['content', 'id', 'type']);
  });

  it('прозрачность уезжает из стиля в собственное поле состояния', () => {
    for (const segment of loadProject(raw('demo.json')).segments) {
      for (const slide of segment.slides) {
        for (const state of Object.values(slide.states)) {
          expect(state.style).not.toHaveProperty('opacity');
        }
      }
    }
  });
});

describe('рёбра гейтов становятся правилами выхода', () => {
  const branching = () => loadProject(raw('branching.json')).segments[0]!;

  it('гейт получает переменную, а рёбер у него больше нет', () => {
    const gate = branching().gates[0]!;
    expect(gate.recordAs).toBeTruthy();
    expect(gate).not.toHaveProperty('edges');
  });

  it('ребро по варианту становится сравнением переменной со значением', () => {
    const segment = branching();
    const rules = segment.exit.rules;
    expect(rules.length).toBe(2);
    for (const rule of rules) {
      expect(rule.when[0]!.kind).toBe('equals');
      expect(rule.when[0]!.variable).toBe(segment.gates[0]!.recordAs);
    }
    expect(rules.map((r) => r.goto).sort()).toEqual(['n-no', 'n-yes']);
  });

  it('запасной выход НЕ выдумывается: покрытие вариантов делает его лишним', () => {
    // Первая редакция миграции ставила сюда сам сегмент, чтобы удовлетворить
    // собственное правило, — и получала сегмент с выходом на самого себя.
    expect(branching().exit.default).toBeNull();
  });

  it('узел без рёбер становится концовкой', () => {
    expect(loadProject(raw('minimal.json')).segments[0]!.exit)
      .toEqual({ rules: [], default: null });
  });

  it('onWrong «reveal» становится разбором на месте', () => {
    const migrated = MIGRATIONS[2]!({
      schemaVersion: 2,
      meta: { title: 'т' },
      entry: 'a',
      nodes: [{
        id: 'a',
        title: '',
        audio: { src: 'a.mp3', duration: 10, words: [] },
        scene: {
          elements: [],
          cues: [],
          gates: [{
            id: 'g',
            at: { kind: 'seconds', t: 1 },
            config: { kind: 'continue', label: 'Дальше' },
            onWrong: 'reveal',
            maxAttempts: null,
          }],
        },
        edges: [],
      }],
    }) as { segments: { gates: { onWrong: string }[] }[] };
    expect(migrated.segments[0]!.gates[0]!.onWrong).toBe('inline-explain');
  });
});

describe('миграция не падает своим TypeError на битом входе', () => {
  it('неполный проект доезжает до валидации, а не роняет миграцию', () => {
    // Миграция работает ДО валидации: отсутствующее поле обязано получить
    // внятное сообщение с путём от Zod, а не TypeError из миграции.
    expect(() => MIGRATIONS[2]!({ schemaVersion: 2 })).not.toThrow();
    expect(() => MIGRATIONS[2]!({ schemaVersion: 2, nodes: 'не массив' })).not.toThrow();
    expect(() => MIGRATIONS[1]!({ schemaVersion: 1 })).not.toThrow();
  });
});

/**
 * v3 → v4. Ступень маленькая, но у неё есть ровно один способ ошибиться
 * дорого: «догадаться», что старый выбор был развилкой.
 */
describe('v3 → v4: окно дорожки и право не иметь верного ответа', () => {
  const v3 = () => ({
    schemaVersion: 3,
    meta: { title: 'Старый проект', stageWidth: 1920, stageHeight: 1080 },
    entry: 'a',
    segments: [{
      id: 'a',
      title: 'Часть',
      audio: { src: '/a.mp3', duration: 10, words: [] },
      elements: [],
      slides: [{ id: 's1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
      gates: [{
        id: 'g1',
        at: { kind: 'seconds', t: 2 },
        config: {
          kind: 'choice',
          prompt: 'Верно?',
          options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }],
          correctId: 'yes',
        },
        onWrong: 'continue',
        maxAttempts: null,
        recordAs: 'ответ',
      }],
      exit: { rules: [], default: null },
    }],
  });

  it('дорожка получает окно, начинающееся с начала файла', () => {
    const migrated: any = MIGRATIONS[3]!(v3());
    expect(migrated.segments[0].audio.offset).toBe(0);
  });

  it('окно не трогает остальное в дорожке', () => {
    const before = v3().segments[0]!.audio;
    const after: any = (MIGRATIONS[3]!(v3()) as any).segments[0].audio;
    expect(after.src).toBe(before.src);
    expect(after.duration).toBe(before.duration);
  });

  it('верный ответ сохраняется: старый выбор — это вопрос, а не развилка', () => {
    // Соблазн вывести развилку из того, что переменную гейта читают правила
    // выхода, превратил бы миграцию в угадайку: вопрос, чей ответ используется
    // для ветвления, — законная конструкция, неотличимая по данным.
    const migrated: any = MIGRATIONS[3]!(v3());
    expect(migrated.segments[0].gates[0].config.correctId).toBe('yes');
  });

  it('миграция чистая: исходный объект не тронут', () => {
    const input = v3();
    const before = JSON.stringify(input);
    MIGRATIONS[3]!(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('не падает своим TypeError на битом входе — доводит его до Zod', () => {
    expect(() => MIGRATIONS[3]!({ schemaVersion: 3 })).not.toThrow();
    expect(() => MIGRATIONS[3]!({ schemaVersion: 3, segments: 'не массив' })).not.toThrow();
    expect(() => MIGRATIONS[3]!({ schemaVersion: 3, segments: [null, 7, {}] })).not.toThrow();
  });

  it('уже проставленное окно не затирается', () => {
    const input: any = v3();
    input.segments[0].audio.offset = 12.5;
    const migrated: any = MIGRATIONS[3]!(input);
    expect(migrated.segments[0].audio.offset).toBe(12.5);
  });

  it('проект версии 3 доезжает до текущей версии целиком', () => {
    const project = loadProject(v3());
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.segments[0]!.audio.offset).toBe(0);
  });
});

/**
 * v5 → v6. У дорожки появился второй источник: файл, загруженный автором
 * (`audio.fileId`), и `src` перестал быть обязательным. Миграция сама по себе
 * тривиальна (только бампает версию), поэтому здесь важнее не «мигрировало»,
 * а «схема после этого действительно требует РОВНО одного источника» —
 * иначе `.refine()` мог бы не сработать и версия 6 приняла бы то, что не должна.
 */
describe('v5 → v6: fileId — второй источник дорожки', () => {
  const v5 = () => ({
    schemaVersion: 5,
    meta: { title: 'Проект версии 5', stageWidth: 1920, stageHeight: 1080 },
    entry: 'a',
    segments: [{
      id: 'a',
      title: 'Часть',
      audio: { src: '/a.mp3', offset: 0, duration: 10, words: [] },
      elements: [],
      slides: [{ id: 's1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
      gates: [],
      exit: { rules: [], default: null },
    }],
  });

  it('версия поднимается до 6, а src сохраняется — данные не теряются', () => {
    const migrated: any = MIGRATIONS[5]!(v5());
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.segments[0].audio.src).toBe('/a.mp3');
  });

  it('проект версии 5 доезжает до текущей версии целиком через migrateToCurrent', () => {
    const project = loadProject(v5());
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.segments[0]!.audio.src).toBe('/a.mp3');
    expect(project.segments[0]!.audio.fileId).toBeUndefined();
  });

  it('миграция чистая: исходный объект не тронут', () => {
    const input = v5();
    const before = JSON.stringify(input);
    MIGRATIONS[5]!(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('не падает своим TypeError на битом входе — доводит его до Zod', () => {
    expect(() => MIGRATIONS[5]!({ schemaVersion: 5 })).not.toThrow();
    expect(() => MIGRATIONS[5]!({ schemaVersion: 5, segments: 'не массив' })).not.toThrow();
  });

  it('фикстура uploaded-audio.json (адресация через fileId) валидна', () => {
    const project = raw('uploaded-audio.json');
    expect(project.schemaVersion).toBe(6);
    expect(() => loadProject(project)).not.toThrow();
    const loaded = loadProject(project);
    expect(loaded.segments[0]!.audio.fileId).toBe('aud-fixture-demo');
    expect(loaded.segments[0]!.audio.src).toBeUndefined();
    // Новое значение перечисления `source` (ASR) действительно лежит
    // в фикстуре, а не только упоминается в тесте.
    expect(loaded.segments[0]!.audio.words.some((w) => w.source === 'asr')).toBe(true);
  });

  it('оба источника разом — невалидный проект: ни src, ни fileId не выигрывают молча', () => {
    const project: any = v5();
    project.schemaVersion = 6;
    project.segments[0].audio.fileId = 'aud-something';
    // src уже есть в v5() — теперь их два.
    const result = ProjectSchema.safeParse(project);
    expect(result.success, 'проект с двумя источниками прошёл валидацию, хотя не должен был').toBe(false);
  });

  it('ни одного источника — невалидный проект: дорожке нечем звучать', () => {
    const project: any = v5();
    project.schemaVersion = 6;
    delete project.segments[0].audio.src;
    // ни src, ни fileId не заданы.
    const result = ProjectSchema.safeParse(project);
    expect(result.success, 'проект без источника дорожки прошёл валидацию, хотя не должен был').toBe(false);
  });
});
