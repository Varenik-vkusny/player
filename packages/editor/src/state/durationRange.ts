/**
 * Вилка длительностей объяснения: самый короткий и самый длинный путь
 * зрителя от `project.entry` до конца.
 *
 * Зачем (`docs/design/branches.md` §8): одной длительности у объяснения нет.
 * Ветки разной длины — значит у разных зрителей разное время, и любое
 * единственное число будет враньём. Показываются два числа, оба честные:
 * у каждой ветки — её собственная длительность; у объяснения — вилка.
 *
 * Путь зрителя — последовательность глав от входа по рёбрам выхода: рёбра —
 * это `exit.rules[].goto` И `exit.default` (оба способа выйти, тот же набор,
 * что берёт `reachableFrom` в `exits.ts`). Длина пути — сумма `audio.duration`
 * её глав.
 *
 * Чистый модуль — без React, без DOM, как и его соседи в `state/`.
 */
import type { Project } from '@player/core';

export interface DurationRange {
  /** Самый короткий путь зрителя, в секундах. */
  readonly minSeconds: number;
  /** Самый длинный путь зрителя, в секундах. */
  readonly maxSeconds: number;
  /** Совпали ли концы: у объяснения без единой развилки вилки нет, есть число. */
  readonly single: boolean;
  /**
   * Были ли отброшены пути из-за повторов. Повтор — законная механика
   * продукта (`repeat.json`), и путь через него может идти сколько угодно
   * раз; в вилку берётся путь БЕЗ повторного посещения главы.
   */
  readonly repeatsIgnored: boolean;
}

/**
 * Все рёбра выхода главы: правила и запасной выход — оба способа продолжить
 * рассказ. Порядок значения не имеет: ниже перебираются ОБА конца.
 */
function targetsOf(segment: Project['segments'][number]): readonly string[] {
  const targets = segment.exit.rules.map((rule) => rule.goto);
  if (segment.exit.default !== null) targets.push(segment.exit.default);
  return targets;
}

/**
 * Обход в глубину от `id` с множеством глав, стоящих НА ТЕКУЩЕМ ПУТИ.
 *
 * Ребро в главу, уже стоящую на этом пути, не берётся (иначе повтор даёт
 * бесконечный путь), а его отбрасывание фиксируется через `onRepeat`.
 * Возвращает пару [минимум, максимум] длины путей, ЗАКАНЧИВАЮЩИХСЯ в `id`
 * или дальше — то есть длину поддерева, растущего из этой главы, включая
 * саму главу.
 *
 * Глава без выхода (правил нет и `default === null`) — лист: путь кончается
 * здесь, [длительность, длительность].
 */
function walk(
  project: Project,
  byId: ReadonlyMap<string, Project['segments'][number]>,
  id: string,
  onPath: ReadonlySet<string>,
  onRepeat: () => void,
): { min: number; max: number } {
  const segment = byId.get(id);
  // Ссылка на несуществующую главу не бывает в валидном проекте (схема это
  // проверяет); функция всё равно не бросает — тем же доводом, что
  // и `reachableFrom`: она отвечает на вопрос «сколько», а не «валиден ли».
  if (!segment) return { min: 0, max: 0 };

  const own = segment.audio.duration;
  const nextOnPath = new Set(onPath);
  nextOnPath.add(id);

  const targets = targetsOf(segment).filter((to) => {
    if (!nextOnPath.has(to)) return true;
    onRepeat();
    return false;
  });

  if (targets.length === 0) return { min: own, max: own };

  let min = Infinity;
  let max = -Infinity;
  for (const to of targets) {
    const child = walk(project, byId, to, nextOnPath, onRepeat);
    min = Math.min(min, child.min);
    max = Math.max(max, child.max);
  }

  return { min: own + min, max: own + max };
}

export function durationRange(project: Project): DurationRange {
  const byId = new Map(project.segments.map((segment) => [segment.id, segment] as const));

  let repeatsIgnored = false;
  const { min, max } = walk(project, byId, project.entry, new Set(), () => {
    repeatsIgnored = true;
  });

  return {
    minSeconds: min,
    maxSeconds: max,
    single: Math.abs(max - min) < 1e-9,
    repeatsIgnored,
  };
}
