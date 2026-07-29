# Граф сегментов: план реализации захода 1

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-СКИЛЛ: используйте
> superpowers:subagent-driven-development или superpowers:executing-plans,
> чтобы выполнять план задача за задачей. Шаги размечены чекбоксами.

**Цель:** ответ на гейте выбирает, какой узел зритель услышит следующим.

**Устройство:** корень схемы становится графом узлов; `audio` и `scene`
переезжают внутрь узла без правки полей, поэтому `Segment` и весь рендер
не меняются. Рёбра лежат на узле и выбираются ответом либо концом дорожки.

**Стек:** TypeScript, Zod, anime.js, Vitest, Playwright, pnpm-воркспейс.

Спецификация: [`docs/superpowers/specs/2026-07-29-segment-graph-design.md`](../specs/2026-07-29-segment-graph-design.md)

## Общие ограничения

Действуют в каждой задаче, повторно не упоминаются.

- **Инвариант №1.** Аудио — единственный источник времени. Ни `setInterval`,
  ни счётчик кадров не двигают сцену. Декодирование дорожки не трогает часы.
- **Инвариант №4.** Гейт останавливает всё сразу; перемотки не происходит.
- **Инвариант №5.** Один рендер на редактор и плеер. Редактор импортирует
  рендер из плеера.
- **Инвариант №6.** Направление `editor → player → core`. Обратных импортов нет.
  Список внешних импортов редактора закрыт: `@player/core`, `@player/player`,
  `react`, `react-dom/client` — **не расширять**.
- **Инвариант №7.** Изменение схемы = бамп версии + миграция + фикстура + тест.
- **Инвариант №8.** Анимируются только свойства из `ANIMATABLE`.
- **Инвариант №10.** Метки привязаны к словам транскрипта. У каждого узла
  свой транскрипт — привязка становится привязкой внутри узла.
- **Фикстуры в `fixtures/projects/` неприкосновенны.** Их семь: `minimal`,
  `two-gates`, `edge-cases`, `demo`, `e2e`, `empty`, `scene-gate`. Чинить тест
  правкой фикстуры запрещено.
- **Чини корень.** Никаких фолбэков, заглушенных ошибок, подставных значений.
- **После каждой задачи — `pnpm check`.** Не «в конце».
- **Типы выводятся через `z.infer`, руками не пишутся** (ADR-004).
- Комментарии и сообщения об ошибках — по-русски, как во всём проекте.

---

## Структура файлов

**Меняются:**

- `packages/core/src/schema.ts` — корень схемы, узлы, рёбра, валидация графа
- `packages/core/src/migrations.ts` — первая запись реестра
- `packages/player/src/preview.ts:51-59` — `segmentOf` получает `nodeId`
- `packages/player/src/player.ts` — обход графа, кэш дорожек
- `packages/editor/src/Editor.tsx:82` — текущий узел
- `apps/playground/src/preview.ts:47`, `apps/playground/src/main.ts` — стенд

**Создаются:**

- `packages/core/src/graph.ts` — чистые запросы к графу (без DOM, без React)
- `packages/editor/src/state/graph.ts` — правила правки графа
- `packages/player/src/trackCache.ts` — декодированные дорожки
- `fixtures/projects/branching.json` — эталон развилки
- `spikes/s9-seam/` — спайк стыка
- `docs/adr/ADR-013-segment-graph.md`, `docs/adr/ADR-014-track-preload.md`

---

## Задача 1: схема v2 и миграция

**Файлы:**
- Изменить: `packages/core/src/schema.ts:12` (версия), `:156-215` (корень)
- Изменить: `packages/core/src/migrations.ts:20`
- Тест: `packages/core/test/migrations.test.ts` (создать)

**Интерфейсы:**
- Отдаёт: `SCHEMA_VERSION = 2`; типы `Node`, `Edge`, `EdgeWhen`, `Audio`;
  `NodeSchema`, `EdgeSchema`, `ProjectSchema`; константу `ENTRY_NODE_ID`
- Потребляет: существующие `SceneSchema`, `WordSchema`, `Id`, `TimeRefSchema`

- [ ] **Шаг 1: падающий тест миграции**

Создать `packages/core/test/migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject, migrateToCurrent, SCHEMA_VERSION } from '../src/index.js';

const FIXTURES = join(process.cwd(), 'fixtures', 'projects');

describe('миграция v1 → v2', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.json'));

  it('фикстуры на месте: иначе тест зелен впустую', () => {
    expect(files.length).toBe(7);
  });

  it.each(files)('%s открывается после миграции', (file) => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
    const project = loadProject(raw);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.nodes).toHaveLength(1);
    expect(project.nodes[0]!.edges).toEqual([]);
  });

  it.each(files)('%s: озвучка и сцена переносятся без правок', (file) => {
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
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `pnpm exec vitest run -t "миграция v1"`
Ожидается: FAIL — `project.nodes` не существует, `schemaVersion` равна 1.

- [ ] **Шаг 3: поднять версию и описать узел с рёбрами**

В `packages/core/src/schema.ts` заменить строку 12:

```ts
export const SCHEMA_VERSION = 2;
```

Вынести озвучку в отдельную схему (она была встроена в корень, строки 164-169)
и добавить перед `ProjectSchema`:

```ts
export const AudioSchema = z.object({
  src: z.string().min(1),
  duration: z.number().finite().positive(),
  /** Всегда присутствует. Пустой массив делает невалидной любую ссылку на слово. */
  words: z.array(WordSchema),
});

/**
 * Условие перехода по ребру — размеченное объединение, а не строка-предикат.
 *
 * Объединение, чтобы редактор мог собрать ребро выпадающим списком, а схема
 * проверила, что gateId и optionId существуют. Строка-предикат сделала бы
 * ветвление кодом внутри данных.
 */
export const EdgeWhenSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('option'), gateId: Id, optionId: Id }),
  z.object({ kind: z.literal('correct'), gateId: Id }),
  z.object({ kind: z.literal('wrong'), gateId: Id }),
  /** Узел доиграл до конца. Не более одного на узел. */
  z.object({ kind: z.literal('end') }),
]);

export const EdgeSchema = z.object({
  id: Id,
  to: Id,
  when: EdgeWhenSchema,
});

/**
 * Узел графа: своя озвучка, своя сцена, свои исходящие рёбра.
 *
 * Рёбра лежат здесь, а не общим списком в корне: ребро выбирается только пока
 * играет этот узел, и удаление узла обязано быть локальной операцией.
 */
export const NodeSchema = z.object({
  id: Id,
  title: z.string().default(''),
  audio: AudioSchema,
  scene: SceneSchema,
  edges: z.array(EdgeSchema).default([]),
});
```

Заменить `ProjectSchema` (строки 156-172, до `.superRefine`) на:

```ts
export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    meta: z.object({
      title: z.string(),
      stageWidth: z.number().int().positive().default(1920),
      stageHeight: z.number().int().positive().default(1080),
    }),
    /** Узел, с которого начинается объяснение. Явно, а не «первый в массиве». */
    entry: Id,
    nodes: z.array(NodeSchema).min(1),
  })
```

Проверки в `.superRefine` переносятся внутрь узла — это Задача 2. Пока
достаточно, чтобы существующие проверки времени и `targetId` работали
для каждого узла: обернуть тело в `project.nodes.forEach((node, n) => { … })`,
заменив `project.audio` на `node.audio`, `project.scene` на `node.scene`,
а путь `['scene', …]` на `['nodes', n, 'scene', …]`.

Обновить экспорт типов в конце файла:

```ts
export type Audio = z.infer<typeof AudioSchema>;
export type EdgeWhen = z.infer<typeof EdgeWhenSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Node = z.infer<typeof NodeSchema>;
```

- [ ] **Шаг 4: написать миграцию**

В `packages/core/src/migrations.ts` заменить строку 20 на:

```ts
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
```

- [ ] **Шаг 5: тест зелёный**

Запустить: `pnpm exec vitest run -t "миграция v1"`
Ожидается: PASS, 17 проверок.

- [ ] **Шаг 6: полная проверка**

Запустить: `pnpm typecheck && pnpm test:unit`
Ожидается: типы могут падать в плеере и редакторе — это Задача 3, здесь
достаточно, чтобы **ядро** было зелёным. Тест инвариантов №7 должен пройти:
он проверяет, что проект будущей версии не открывается.

- [ ] **Шаг 7: коммит**

```bash
git add packages/core/src/schema.ts packages/core/src/migrations.ts \
        packages/core/test/migrations.test.ts
git commit -m "Схема v2: проект становится графом узлов, первая миграция"
```

---

## Задача 2: валидация графа

**Файлы:**
- Изменить: `packages/core/src/schema.ts` (`.superRefine`)
- Тест: `packages/core/test/graph-validation.test.ts` (создать)

**Интерфейсы:**
- Потребляет: `ProjectSchema`, `loadProject` из Задачи 1
- Отдаёт: правила целостности графа; ничего нового не экспортирует

- [ ] **Шаг 1: падающий тест**

Создать `packages/core/test/graph-validation.test.ts`. Хелпер строит валидный
двухузловой проект, каждый тест ломает ровно одно.

```ts
import { describe, expect, it } from 'vitest';
import { loadProject } from '../src/index.js';

function twoNodes() {
  const audio = { src: 'a.mp3', duration: 10, words: [] };
  const gate = {
    id: 'g1',
    at: { kind: 'seconds', t: 5 },
    config: {
      kind: 'choice',
      prompt: 'Как думаешь?',
      options: [{ id: 'o1', label: 'Так' }, { id: 'o2', label: 'Иначе' }],
      correctId: 'o1',
    },
  };
  return {
    schemaVersion: 2,
    meta: { title: 'Тест' },
    entry: 'n1',
    nodes: [
      {
        id: 'n1', title: 'Первый', audio,
        scene: { elements: [], cues: [], gates: [gate] },
        edges: [
          { id: 'e1', to: 'n2', when: { kind: 'option', gateId: 'g1', optionId: 'o1' } },
          { id: 'e2', to: 'n2', when: { kind: 'option', gateId: 'g1', optionId: 'o2' } },
        ],
      },
      { id: 'n2', title: 'Второй', audio, scene: { elements: [], cues: [], gates: [] }, edges: [] },
    ],
  };
}

describe('целостность графа', () => {
  it('эталон валиден: иначе все проверки ниже зелены впустую', () => {
    expect(() => loadProject(twoNodes())).not.toThrow();
  });

  it('стартовый узел обязан существовать', () => {
    const p = twoNodes();
    p.entry = 'нет-такого';
    expect(() => loadProject(p)).toThrow(/Стартовый узел/);
  });

  it('ребро в несуществующий узел не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges[0].to = 'нет-такого';
    expect(() => loadProject(p)).toThrow(/несуществующий узел/);
  });

  it('ребро на чужой гейт не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges[0].when.gateId = 'g-другой';
    expect(() => loadProject(p)).toThrow(/гейт/);
  });

  it('непокрытый вариант не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges.pop();
    expect(() => loadProject(p)).toThrow(/не покрыт/);
  });

  it('два ребра на один вариант не проходят', () => {
    const p = twoNodes();
    p.nodes[0].edges[1].when.optionId = 'o1';
    expect(() => loadProject(p)).toThrow(/дважды/);
  });

  it('ребро на несуществующий вариант не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges[1].when.optionId = 'нет-такого';
    expect(() => loadProject(p)).toThrow(/варианта/);
  });

  it('смешивать варианты и верно-неверно нельзя', () => {
    const p = twoNodes();
    p.nodes[0].edges[1].when = { kind: 'wrong', gateId: 'g1' };
    expect(() => loadProject(p)).toThrow(/смешивать/);
  });

  it('верно без неверно не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges = [{ id: 'e1', to: 'n2', when: { kind: 'correct', gateId: 'g1' } }];
    expect(() => loadProject(p)).toThrow(/оба/);
  });

  it('гейт continue рёбер иметь не может', () => {
    const p = twoNodes();
    p.nodes[0].scene.gates[0].config = { kind: 'continue', label: 'Дальше' };
    expect(() => loadProject(p)).toThrow(/continue/);
  });

  it('два ребра «конец узла» не проходят', () => {
    const p = twoNodes();
    p.nodes[0].edges.push({ id: 'e3', to: 'n2', when: { kind: 'end' } });
    p.nodes[0].edges.push({ id: 'e4', to: 'n1', when: { kind: 'end' } });
    expect(() => loadProject(p)).toThrow(/конец узла/);
  });

  it('повтор идентификатора узла не проходит', () => {
    const p = twoNodes();
    p.nodes[1].id = 'n1';
    expect(() => loadProject(p)).toThrow(/повторяется/);
  });

  it('гейт без рёбер законен: это обычный гейт, а не развилка', () => {
    const p = twoNodes();
    p.nodes[0].edges = [];
    expect(() => loadProject(p)).not.toThrow();
  });

  it('узел без исходящих рёбер законен: это концовка', () => {
    const p = twoNodes();
    expect(loadProject(p).nodes[1]!.edges).toEqual([]);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `pnpm exec vitest run -t "целостность графа"`
Ожидается: FAIL — проверок графа ещё нет, ломающие тесты не бросают.

- [ ] **Шаг 3: реализовать проверки**

В `.superRefine` `ProjectSchema` добавить **перед** циклом по узлам:

```ts
const nodeIds = new Set(project.nodes.map((node) => node.id));

if (nodeIds.size !== project.nodes.length) {
  ctx.addIssue({
    code: 'custom',
    path: ['nodes'],
    message: 'Идентификатор узла повторяется',
  });
}

if (!nodeIds.has(project.entry)) {
  ctx.addIssue({
    code: 'custom',
    path: ['entry'],
    message: `Стартовый узел «${project.entry}» не существует`,
  });
}
```

Внутрь цикла по узлам, после существующих проверок времени, добавить:

```ts
const gatesById = new Map(node.scene.gates.map((gate) => [gate.id, gate]));
const byGate = new Map<string, typeof node.edges>();
let endEdges = 0;

node.edges.forEach((edge, i) => {
  const path = ['nodes', n, 'edges', i];

  if (!nodeIds.has(edge.to)) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'to'],
      message: `Ребро ведёт в несуществующий узел «${edge.to}»`,
    });
  }

  if (edge.when.kind === 'end') {
    endEdges += 1;
    return;
  }

  const gateId = edge.when.gateId;
  if (!gatesById.has(gateId)) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'when', 'gateId'],
      message: `Ребро ссылается на гейт «${gateId}», которого нет в этом узле`,
    });
    return;
  }

  const list = byGate.get(gateId) ?? [];
  list.push(edge);
  byGate.set(gateId, list);
});

if (endEdges > 1) {
  ctx.addIssue({
    code: 'custom',
    path: ['nodes', n, 'edges'],
    message: 'У узла больше одного ребра «конец узла»: следующий узел неоднозначен',
  });
}

// Правило полного покрытия: если у гейта есть рёбра, они обязаны покрыть
// все его исходы. Ловушки нет намеренно — она позволила бы автору не отвечать
// на вопрос «а что при таком ответе».
for (const [gateId, edges] of byGate) {
  const path = ['nodes', n, 'edges'];
  const gate = gatesById.get(gateId)!;
  const kinds = new Set(edges.map((edge) => edge.when.kind));
  const byOption = kinds.has('option');
  const byVerdict = kinds.has('correct') || kinds.has('wrong');

  if (byOption && byVerdict) {
    ctx.addIssue({
      code: 'custom',
      path,
      message: `Гейт «${gateId}»: нельзя смешивать рёбра по вариантам и по верно/неверно`,
    });
    continue;
  }

  if (gate.config.kind === 'continue') {
    ctx.addIssue({
      code: 'custom',
      path,
      message: `Гейт «${gateId}» вида continue не может иметь рёбер: у него один исход`,
    });
    continue;
  }

  if (byOption) {
    if (gate.config.kind !== 'choice') {
      ctx.addIssue({
        code: 'custom',
        path,
        message: `Гейт «${gateId}»: рёбра по вариантам бывают только у гейта с выбором`,
      });
      continue;
    }
    const optionIds = gate.config.options.map((option) => option.id);
    const covered = edges.map((edge) =>
      edge.when.kind === 'option' ? edge.when.optionId : '');

    for (const optionId of new Set(covered)) {
      if (!optionIds.includes(optionId)) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `Гейт «${gateId}»: ребро ведёт от варианта «${optionId}», которого у гейта нет`,
        });
      }
      if (covered.filter((id) => id === optionId).length > 1) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `Гейт «${gateId}»: вариант «${optionId}» покрыт дважды`,
        });
      }
    }

    for (const optionId of optionIds) {
      if (!covered.includes(optionId)) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `Гейт «${gateId}»: вариант «${optionId}» не покрыт ребром. `
            + 'Либо покройте все варианты, либо снимите рёбра с этого гейта.',
        });
      }
    }
    continue;
  }

  if (!kinds.has('correct') || !kinds.has('wrong')) {
    ctx.addIssue({
      code: 'custom',
      path,
      message: `Гейт «${gateId}»: нужны оба ребра — и «верно», и «неверно»`,
    });
  }
}
```

- [ ] **Шаг 4: тест зелёный**

Запустить: `pnpm exec vitest run -t "целостность графа"`
Ожидается: PASS, 14 проверок.

- [ ] **Шаг 5: старые фикстуры не сломались**

Запустить: `pnpm exec vitest run packages/core`
Ожидается: PASS. Все семь фикстур мигрируют в узел без рёбер, а узел без
рёбер законен — новые проверки их не задевают.

- [ ] **Шаг 6: коммит**

```bash
git add packages/core/src/schema.ts packages/core/test/graph-validation.test.ts
git commit -m "Валидация графа: полное покрытие ответов вместо ловушки"
```

---

## Задача 3: дверца получает узел

**Файлы:**
- Изменить: `packages/player/src/preview.ts:44-59`
- Изменить: `packages/player/src/player.ts:80`
- Изменить: `packages/editor/src/Editor.tsx:82`
- Изменить: `apps/playground/src/preview.ts:47`
- Изменить: `apps/playground/src/main.ts:106,119,120`
- Тест: `packages/core/test/invariants.test.ts` (дополнить)

**Интерфейсы:**
- Отдаёт: `segmentOf(project: Project, nodeId: string): Segment`,
  `entryNodeOf(project: Project): string`
- Тип `Segment` **не меняется** — в этом весь смысл

- [ ] **Шаг 1: падающий охранный тест**

Дополнить `packages/core/test/invariants.test.ts`. Помещается сюда, а не
в плеер, потому что рядом уже живут остальные охранники инвариантов.

```ts
/**
 * Файлы, которым читать project.audio и project.scene положено по должности.
 *
 * schema.ts — валидатор: он определяет формат, ему эти поля видеть обязательно.
 * preview.ts — сама дверца.
 * state/project.ts — редьюсер редактора, сторона записи, парная к segmentOf
 * (ADR-010). Читать проект целиком — его работа.
 */
const NARROW_DOOR_EXEMPT = [
  join('packages', 'core', 'src', 'schema.ts'),
  join('packages', 'player', 'src', 'preview.ts'),
  join('packages', 'editor', 'src', 'state', 'project.ts'),
];

/** Код без комментариев: пояснение, называющее поле, — не обращение к нему. */
function codeWithoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('дверца: project.audio и project.scene читают в одном месте', () => {
  const DIRS = [
    join(ROOT, 'packages', 'core', 'src'),
    join(ROOT, 'packages', 'player', 'src'),
    join(ROOT, 'packages', 'editor', 'src'),
    join(ROOT, 'apps', 'playground', 'src'),
  ];

  it('охранник умеет находить нарушение: иначе он зелен впустую', () => {
    const code = codeWithoutComments('const d = project.audio.duration; // project.scene');
    expect(/project\.(audio|scene)\b/.test(code)).toBe(true);
  });

  it('охранник не считает нарушением комментарий', () => {
    const code = codeWithoutComments('// поменяется project.audio, а не всё выше');
    expect(/project\.(audio|scene)\b/.test(code)).toBe(false);
  });

  it('вне дверцы к audio и scene напрямую не ходят', () => {
    const offenders: string[] = [];

    for (const dir of DIRS) {
      for (const file of sourceFiles(dir)) {
        const relative = file.replace(ROOT, '').replace(/^[\\/]/, '');
        if (NARROW_DOOR_EXEMPT.some((exempt) => relative.endsWith(exempt))) continue;
        const code = codeWithoutComments(readFileSync(file, 'utf8'));
        for (const match of code.matchAll(/project\.(audio|scene)\b/g)) {
          offenders.push(`${relative}: project.${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `pnpm exec vitest run -t "дверца"`
Ожидается: FAIL со списком нарушителей — `apps/playground/src/main.ts`
даст три обращения (`project.audio.duration`, `project.audio.words`,
`project.scene.gates`).

- [ ] **Шаг 3: дверца принимает узел**

В `packages/player/src/preview.ts` заменить строки 44-59:

```ts
/**
 * Достаёт сегмент указанного узла.
 *
 * Единственная точка, через которую плеер, предпросмотр и редактор видят
 * озвучку и сцену. Узел передаётся явно, а не берётся по умолчанию: код,
 * который не сказал, какой узел он показывает, почти наверняка ошибается.
 */
export function segmentOf(project: Project, nodeId: string): Segment {
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Узла «${nodeId}» нет в проекте`);
  }
  return {
    src: node.audio.src,
    words: node.audio.words,
    duration: node.audio.duration,
    scene: node.scene,
    stage: { width: project.meta.stageWidth, height: project.meta.stageHeight },
  };
}

/** Узел, с которого начинается объяснение. */
export function entryNodeOf(project: Project): string {
  return project.entry;
}
```

Экспортировать `entryNodeOf` из `packages/player/src/index.ts` рядом
с `segmentOf` (строка 23).

- [ ] **Шаг 4: три места вызова**

`packages/player/src/player.ts:80`:

```ts
    this.#nodeId = entryNodeOf(project);
    this.#segment = segmentOf(project, this.#nodeId);
```

Добавить приватное поле `#nodeId: string;` и импорт `entryNodeOf`.

`packages/editor/src/Editor.tsx:82`:

```ts
  const [nodeId, setNodeId] = useState(() => entryNodeOf(currentProject));
  const segment = useMemo(() => segmentOf(currentProject, nodeId), [currentProject, nodeId]);
```

`apps/playground/src/preview.ts:47`:

```ts
const preview = new ScenePreview(stage, segmentOf(project, entryNodeOf(project)));
```

`apps/playground/src/main.ts` — здесь настоящая утечка. Заменить обращения
на сегмент, взятый один раз:

```ts
const segment = segmentOf(project, entryNodeOf(project));
const duration = segment.duration;
for (const gate of segment.scene.gates) {
  const at = resolveTimeRef(gate.at, segment.words);
```

- [ ] **Шаг 5: тесты зелёные**

Запустить: `pnpm typecheck && pnpm test:unit`
Ожидается: PASS. Охранник дверцы зелёный, список нарушителей пуст.

- [ ] **Шаг 6: e2e не сломались**

Запустить: `pnpm build:player && pnpm test:e2e`
Ожидается: PASS. Поведение не менялось — узел ровно один, как и раньше.
Скриншотный паритет редактора и плеера обязан сойтись пиксель в пиксель:
если разошёлся, виноват код, а не эталон.

- [ ] **Шаг 7: коммит**

```bash
git add packages/player/src/preview.ts packages/player/src/index.ts \
        packages/player/src/player.ts packages/editor/src/Editor.tsx \
        apps/playground/src packages/core/test/invariants.test.ts
git commit -m "Дверца стала «сегмент такого-то узла» и обзавелась охранником"
```

---

## Задача 4: фикстура развилки

**Файлы:**
- Создать: `scripts/build-branching-fixture.mjs`
- Создать: `fixtures/projects/branching.json`
- Тест: `packages/core/test/graph-validation.test.ts` (дополнить)

**Интерфейсы:**
- Потребляет: `loadProject`, схему из Задач 1-2
- Отдаёт: эталон с двумя узлами и развилкой для e2e Задачи 7

- [ ] **Шаг 1: скрипт сборки фикстуры**

Повторяет приём `scripts/build-demo-fixture.mjs`: фикстура собирается кодом,
а не пишется руками, чтобы слова транскрипта и тайминги были согласованы.

Создать `scripts/build-branching-fixture.mjs`. Берёт узел из `e2e.json`
(у него ранние гейты — e2e не будет ждать), делает из него два узла:
`n-start` с гейтом выбора на 1 секунде и двумя `option`-рёбрами,
`n-yes` и `n-no` — концовки с разными элементами сцены, чтобы на экране
было видно, куда приехали.

Ключевое требование: у `n-yes` и `n-no` **разный текст элемента**, иначе
e2e не отличит один узел от другого и позеленеет при сломанном переходе.

- [ ] **Шаг 2: собрать и проверить**

```bash
node scripts/build-branching-fixture.mjs
```

Дополнить `packages/core/test/graph-validation.test.ts`:

```ts
it('фикстура развилки валидна и имеет три узла', () => {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures', 'projects', 'branching.json'), 'utf8'),
  );
  const project = loadProject(raw);
  expect(project.schemaVersion).toBe(2);
  expect(project.nodes).toHaveLength(3);
  expect(project.nodes[0]!.edges).toHaveLength(2);
  const targets = project.nodes[0]!.edges.map((edge) => edge.to);
  expect(new Set(targets).size).toBe(2);
});
```

Тест числа фикстур из Задачи 1 поднять с 7 до 8, а проверку
«одного узла после миграции» ограничить семью старыми файлами:
`branching.json` уже версии 2 и мигрировать не должен.

- [ ] **Шаг 3: тесты зелёные**

Запустить: `pnpm exec vitest run packages/core`
Ожидается: PASS.

- [ ] **Шаг 4: коммит**

```bash
git add scripts/build-branching-fixture.mjs fixtures/projects/branching.json \
        packages/core/test
git commit -m "Фикстура развилки: три узла, два ребра по вариантам"
```

---

## Задача 5: спайк S9 — стык узлов

**Файлы:**
- Создать: `spikes/s9-seam/index.html`, `spikes/s9-seam/seam.js`
- Изменить: `package.json` (скрипт `spike:seam`)
- Изменить: `docs/research/spikes.md`

**Интерфейсы:**
- Отдаёт три числа для Задачи 6: разрывов на стыке, задержка стыка (мс),
  задержка при недекодированном узле (мс)

- [ ] **Шаг 1: оснастка**

Спайк живёт отдельно от продукта и в `pnpm check` не входит. Меряет три
сценария на двух коротких дорожках:

1. **Стык с предзагрузкой.** Оба буфера декодированы заранее. Второй источник
   планируется на `ctx.currentTime + остаток первого`, то есть через
   `source.start(when)`, а не по событию.
2. **Стык по опросу в кадре.** Переключение по тому же условию, что сегодня
   в `player.ts:268` — `position >= duration - 0.02`.
3. **Стык без предзагрузки.** `decodeAudioData` вызывается в момент стыка.

Измеряется через `OfflineAudioContext` — как в S3, где детекция разрывов дала 0,
плюс живой `AudioContext` для задержки по стенным часам. Разрыв ищется
по скачку между соседними сэмплами выше порога S3.

- [ ] **Шаг 2: прогнать на незанятой машине**

```bash
pnpm spikes:serve
# затем http://localhost:5180/s9-seam/
```

Закрыть остальные вкладки и задачи. В S6 фон не тронул медиану и развалил
хвост вдвое; задержка стыка — величина хвостовая, и испортится именно она.

- [ ] **Шаг 3: записать числа**

Дописать в `docs/research/spikes.md` раздел `## S9 — стык узлов` с датой
2026-07-29, таблицей трёх чисел и разбором. Обязательно: что мерили,
чем мерили, и чего число **не** доказывает.

- [ ] **Шаг 4: решить и остановиться, если плохо**

Если планирование через `source.start(when)` даёт 0 разрывов и задержку
в пределах кадра — политика ясна, идём в Задачу 6. Если разрывы есть
или задержка больше — **остановиться и спросить**: это развилка без
очевидно правильной стороны, а обход неочевиден.

- [ ] **Шаг 5: коммит**

```bash
git add spikes/s9-seam package.json docs/research/spikes.md
git commit -m "S9: стык узлов измерен, числа в spikes.md"
```

---

## Задача 6: переход между узлами в плеере

**Файлы:**
- Создать: `packages/player/src/trackCache.ts`
- Создать: `packages/core/src/graph.ts`
- Изменить: `packages/player/src/player.ts`
- Тест: `packages/core/test/graph.test.ts` (создать)

**Интерфейсы:**
- Отдаёт: `nextNodeAfterGate(node, gateId, answer): string | undefined`,
  `nextNodeAtEnd(node): string | undefined` из `@player/core`
- Отдаёт: `TrackCache` с `preload(src)` и `take(src): AudioBuffer`
- Потребляет: `segmentOf`, `entryNodeOf` из Задачи 3

- [ ] **Шаг 1: падающий тест выбора ребра**

Выбор следующего узла — чистая функция, ей место в ядре и в юнит-тестах,
а не внутри класса плеера.

Создать `packages/core/test/graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextNodeAfterGate, nextNodeAtEnd } from '../src/graph.js';

const node = {
  id: 'n1', title: '', audio: { src: 'a.mp3', duration: 10, words: [] },
  scene: { elements: [], cues: [], gates: [] },
  edges: [
    { id: 'e1', to: 'yes', when: { kind: 'option', gateId: 'g1', optionId: 'o1' } },
    { id: 'e2', to: 'no', when: { kind: 'option', gateId: 'g1', optionId: 'o2' } },
    { id: 'e3', to: 'tail', when: { kind: 'end' } },
  ],
} as const;

describe('выбор следующего узла', () => {
  it('вариант ведёт по своему ребру', () => {
    expect(nextNodeAfterGate(node, 'g1', { optionId: 'o1', correct: true })).toBe('yes');
    expect(nextNodeAfterGate(node, 'g1', { optionId: 'o2', correct: false })).toBe('no');
  });

  it('гейт без рёбер не уводит из узла', () => {
    expect(nextNodeAfterGate(node, 'g-другой', { optionId: 'o1', correct: true }))
      .toBeUndefined();
  });

  it('конец узла ведёт по ребру end', () => {
    expect(nextNodeAtEnd(node)).toBe('tail');
  });

  it('узел без ребра end завершает объяснение', () => {
    expect(nextNodeAtEnd({ ...node, edges: [] })).toBeUndefined();
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

Запустить: `pnpm exec vitest run -t "выбор следующего узла"`
Ожидается: FAIL — модуля `graph.ts` нет.

- [ ] **Шаг 3: чистый модуль графа**

Создать `packages/core/src/graph.ts`:

```ts
/**
 * Запросы к графу сегментов. Чистые функции: ни DOM, ни состояния.
 *
 * Живут в ядре, а не в классе плеера, потому что выбор следующего узла —
 * правило продукта, и его надо проверять юнит-тестом, а не прогоном звука.
 */
import type { Node } from './schema.js';

export interface GateOutcome {
  /** Выбранный вариант, если гейт с выбором. */
  readonly optionId?: string;
  readonly correct: boolean;
}

/**
 * Куда вести после ответа на гейте.
 *
 * `undefined` означает «остаться в узле»: у гейта нет рёбер, то есть это
 * обычный гейт, а не развилка. Схема гарантирует, что при наличии рёбер
 * они покрывают все исходы, поэтому «рёбра есть, но ни одно не подошло»
 * до сюда не доезжает.
 */
export function nextNodeAfterGate(
  node: Node,
  gateId: string,
  outcome: GateOutcome,
): string | undefined {
  const edges = node.edges.filter(
    (edge) => edge.when.kind !== 'end' && edge.when.gateId === gateId,
  );
  if (edges.length === 0) return undefined;

  for (const edge of edges) {
    const when = edge.when;
    if (when.kind === 'option' && when.optionId === outcome.optionId) return edge.to;
    if (when.kind === 'correct' && outcome.correct) return edge.to;
    if (when.kind === 'wrong' && !outcome.correct) return edge.to;
  }

  throw new Error(
    `Гейт «${gateId}» имеет рёбра, но ни одно не подошло под ответ. `
    + 'Схема обязана была это поймать при загрузке.',
  );
}

/** Куда вести, когда узел доиграл. `undefined` — объяснение закончилось. */
export function nextNodeAtEnd(node: Node): string | undefined {
  return node.edges.find((edge) => edge.when.kind === 'end')?.to;
}
```

Экспортировать из `packages/core/src/index.ts`: `export * from './graph.js';`

- [ ] **Шаг 4: тест зелёный**

Запустить: `pnpm exec vitest run -t "выбор следующего узла"`
Ожидается: PASS, 4 проверки.

- [ ] **Шаг 5: кэш дорожек**

Создать `packages/player/src/trackCache.ts`. Требования:

- `preload(src)` декодирует и кладёт в `Map<string, AudioBuffer>`; повторный
  вызов на тот же `src` не декодирует заново
- `take(src)` отдаёт готовый буфер или **бросает**, если его нет: молчаливое
  ожидание внутри — это и есть рваный темп, который запрещено прятать
- потолок кэша задать числом и назвать его в комментарии со ссылкой
  на измерение памяти; при переполнении вытесняется дорожка, дальше всего
  отстоящая от текущего узла
- декодирование **не трогает часы**: `AudioClock` получает только готовый буфер

- [ ] **Шаг 6: обход графа в плеере**

В `packages/player/src/player.ts`:

- на разрешении гейта (после `answer`, там же где `resumeFromFreeze`) вызвать
  `nextNodeAfterGate`; если вернулся узел — перейти, иначе продолжить как сейчас
- на конце дорожки (`player.ts:268`) вместо безусловного `#finish()` вызвать
  `nextNodeAtEnd`; если вернулся узел — перейти, иначе `#finish()`
- **предзагрузка на открытии гейта**: как только гейт остановил время, вызвать
  `preload` для всех целей исходящих рёбер этого гейта. Время стоит — окно
  бесплатное
- для узла без гейтов предзагрузку начать за N секунд до конца, где N взято
  из числа S9
- переход: собрать `segmentOf(project, nextId)`, пересобрать сцену и таймлайн,
  отдать часам буфер из кэша, запустить с нуля

Ловушка: свежая сцена стоит на нуле. После смены узла время выставить заново
до первого кадра, иначе первый кадр покажет неправильное состояние.

- [ ] **Шаг 7: проверка**

Запустить: `pnpm check`
Ожидается: PASS.

- [ ] **Шаг 8: коммит**

```bash
git add packages/core/src/graph.ts packages/core/src/index.ts \
        packages/core/test/graph.test.ts packages/player/src
git commit -m "Плеер ходит по графу: ответ выбирает узел, дорожка греется на гейте"
```

---

## Задача 7: e2e развилки

**Файлы:**
- Создать: `e2e/branching.spec.ts`

- [ ] **Шаг 1: тест, который нажимает по видимой кнопке**

Проверка «вызвался ли обработчик» зелена при любом дефекте раскладки. Тест
обязан кликать по тому, что видно, и проверять текст на экране после перехода.

```ts
import { expect, test } from '@playwright/test';

test.describe('развилка', () => {
  test('первый вариант ведёт в один узел', async ({ page }) => {
    await page.goto('/?fixture=branching');
    await page.getByRole('button', { name: 'Играть' }).click();
    const first = page.locator('[data-id="opt-yes"]');
    await expect(first).toBeVisible();
    await first.click();
    await expect(page.locator('#stage')).toContainText('Ты выбрал да');
    await expect(page.locator('#stage')).not.toContainText('Ты выбрал нет');
  });

  test('второй вариант ведёт в другой узел', async ({ page }) => {
    await page.goto('/?fixture=branching');
    await page.getByRole('button', { name: 'Играть' }).click();
    const second = page.locator('[data-id="opt-no"]');
    await expect(second).toBeVisible();
    await second.click();
    await expect(page.locator('#stage')).toContainText('Ты выбрал нет');
  });

  test('узел без исходящих рёбер завершает объяснение', async ({ page }) => {
    await page.goto('/?fixture=branching');
    await page.getByRole('button', { name: 'Играть' }).click();
    await page.locator('[data-id="opt-yes"]').click();
    await expect(page.locator('[data-state="ended"]')).toBeVisible({ timeout: 15000 });
  });
});
```

Селекторы `opt-yes` / `opt-no` и тексты обязаны совпадать с тем, что положил
`scripts/build-branching-fixture.mjs` в Задаче 4. Если не совпадают —
править фикстуру, а не тест.

- [ ] **Шаг 2: прогнать**

Запустить: `pnpm build:player && pnpm exec playwright test -g "развилка"`
Ожидается: PASS. Сборка перед e2e не случайна: тесты инварианта №9 проверяют
побайтовое совпадение отданного файла с собранным.

- [ ] **Шаг 3: посмотреть глазами**

Открыть `http://localhost:5173/?fixture=branching`, нажать оба варианта,
послушать стык, посмотреть консоль. Тесты и глаза находят разные дефекты,
и множества не пересекаются.

- [ ] **Шаг 4: коммит**

```bash
git add e2e/branching.spec.ts
git commit -m "e2e развилки: разные ответы приводят в разные узлы"
```

---

## Задача 8: правила графа в редакторе

**Файлы:**
- Создать: `packages/editor/src/state/graph.ts`
- Создать: `packages/editor/test/graph.test.ts`
- Изменить: `packages/editor/src/state/project.ts` (новые действия)

**Интерфейсы:**
- Отдаёт: `addNode`, `removeNode`, `connect`, `disconnect`, `reachableFrom`,
  `uncoveredOptions` — чистые функции `(project, …) => Project | результат`
- Потребляет: типы `Node`, `Edge` из `@player/core`

- [ ] **Шаг 1: падающие тесты**

По ADR-010 правила живут вне компонентов. Вид редактора будет переписан
целиком в отдельной сессии — правила обязаны это пережить.

Покрыть: добавление узла даёт свободный id; удаление узла убирает входящие
рёбра; удаление стартового узла запрещено; соединение существующих узлов;
повторное соединение того же варианта запрещено; `reachableFrom` находит
недостижимые узлы; `uncoveredOptions` перечисляет непокрытые варианты гейта.

- [ ] **Шаг 2: убедиться, что падают**

Запустить: `pnpm exec vitest run packages/editor/test/graph.test.ts`
Ожидается: FAIL — модуля нет.

- [ ] **Шаг 3: реализовать модуль**

Ссылочная целостность обязательна: неизменившиеся узлы возвращать теми же
объектами. `StageView` решает «пересобирать или обновить» сравнением ссылок,
и пересозданный массив заставит сцену собираться заново на каждое движение мыши.

- [ ] **Шаг 4: действия редьюсера**

Добавить в `EditorAction`: `addNode`, `removeNode`, `selectNode`, `connect`,
`disconnect`. Все правки проекта идут через историю — 50 шагов, снимками.

- [ ] **Шаг 5: проверка и коммит**

```bash
pnpm check
git add packages/editor/src/state packages/editor/test/graph.test.ts
git commit -m "Правила графа: чистый модуль с юнит-тестами, вид ещё не трогаем"
```

---

## Задача 9: граф в редакторе — вид

**Файлы:**
- Создать: `packages/editor/src/panels/GraphPanel.tsx`
- Изменить: `packages/editor/src/Editor.tsx`
- Создать: `e2e/editor-graph.spec.ts`

Интерфейс становится функциональнее, а не красивее: переписывание внешнего
вида — отдельная сессия. Достаточно списка узлов, кнопки «добавить узел»,
переключения текущего узла и показа рёбер выделенного узла.

- [ ] **Шаг 1: панель**

Список узлов, текущий подсвечен. Клик переключает узел: дорожка и холст
показывают его сцену. Кнопка добавления. У выделенного узла — его рёбра
и непокрытые варианты гейтов, чтобы автор видел дыру до сохранения.

- [ ] **Шаг 2: время после смены узла**

Свежий `ScenePreview` стоит на нуле, а смена узла — структурная правка
по определению. Выставить время заново сразу после переключения.

- [ ] **Шаг 3: e2e**

Создать узел, соединить ребром, переключиться, убедиться что холст показывает
другую сцену. Нажимать по видимым элементам.

- [ ] **Шаг 4: список импортов не вырос**

Запустить: `pnpm exec vitest run -t "инвариант №6"`
Ожидается: PASS. Никакой библиотеки для рисования графов — она нарушит
и №6, и №5.

- [ ] **Шаг 5: проверка и коммит**

```bash
pnpm check
git add packages/editor/src e2e/editor-graph.spec.ts
git commit -m "Граф в редакторе: узлы, рёбра, переключение"
```

---

## Задача 10: журнал

**Файлы:**
- Создать: `docs/adr/ADR-013-segment-graph.md`, `docs/adr/ADR-014-track-preload.md`
- Изменить: `docs/status.md`, `docs/architecture.md`, `CLAUDE.md`

- [ ] **Шаг 1: ADR-013 — граф сегментов**

Форма схемы v2, почему рёбра на узле, правило полного покрытия и почему
ловушки нет, узел без исходящих рёбер как концовка, смысл инварианта №4
на стыке как границы на разрыв.

- [ ] **Шаг 2: ADR-014 — предзагрузка**

Политика по числам S9: когда декодируется следующая дорожка, почему на гейте,
потолок кэша, почему декодирование не трогает часы.

- [ ] **Шаг 3: обновить статус и карту**

`docs/status.md` — стадия, новые долги. Заодно снять устаревшее «S8 не
в spikes.md»: S8 лежит в `spikes.md:608`.

- [ ] **Шаг 4: спросить про CLAUDE.md**

В таблице подтверждённого написано «квота `localStorage` под проект», а
`spikes.md:611` фиксирует перевод канала на IndexedDB. Правку закона
**не делать молча** — показать владельцу и спросить.

- [ ] **Шаг 5: коммит**

```bash
git add docs
git commit -m "Журнал: ADR-013 граф сегментов, ADR-014 предзагрузка, статус"
```

---

## Самопроверка плана

**Покрытие спеки.** Схема v2 → Задача 1. Миграция и семь фикстур → Задача 1.
Семантика рёбер и полное покрытие → Задача 2. Дверца и охранник → Задача 3.
Фикстура развилки → Задача 4. Инвариант №4 на стыке и S9 → Задача 5.
Политика декодирования → Задачи 5-6. Переход в плеере, узел-концовка →
Задача 6. e2e развилки → Задача 7. Правила графа вне компонентов → Задача 8.
Вид → Задача 9. ADR-013, ADR-014, расхождения документации → Задача 10.

**Пробелов нет.** Все разделы спецификации имеют задачу.

**Согласованность имён.** `segmentOf(project, nodeId)`, `entryNodeOf(project)`,
`nextNodeAfterGate(node, gateId, outcome)`, `nextNodeAtEnd(node)`,
`ENTRY_NODE_ID`, `TrackCache.preload/take` — используются одинаково во всех
задачах, где встречаются.

**Отложено намеренно.** Заход 2 — библиотека фигур, заготовки анимаций,
шаблоны сцен. Не входит в этот план.
