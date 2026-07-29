/**
 * Запросы к графу сегментов. Чистые функции: ни DOM, ни состояния, ни времени.
 *
 * Живут в ядре, а не внутри класса плеера, потому что выбор следующего узла —
 * правило продукта. Правило продукта обязано проверяться юнит-тестом,
 * а не прогоном звука в браузере: в S3 логика паузы была верна и прошла бы
 * любой юнит-тест, а дефект сидел в звуке — здесь ровно наоборот, и смешивать
 * эти два слоя значит не иметь возможности проверить ни один.
 */
import type { Project, SegmentNode } from './schema.js';

/**
 * Исход разобранной попытки на гейте — всё, что нужно для выбора ребра.
 *
 * Не сам `GateAttempt` из плеера: ядро про плеер не знает (инвариант №6),
 * а для выбора ребра из попытки важны ровно два поля.
 */
export interface GateOutcome {
  /** Выбранный вариант. Есть только у гейта с выбором. */
  readonly optionId?: string;
  readonly correct: boolean;
}

/**
 * Узел по идентификатору.
 *
 * Бросает, а не отдаёт `undefined`: узел, которого нет, — это рассинхрон
 * состояния, и увидеть его надо там, где спросили, а не тремя кадрами позже
 * в виде пустой сцены.
 */
export function nodeOf(project: Project, nodeId: string): SegmentNode {
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Узла «${nodeId}» нет в проекте`);
  }
  return node;
}

/**
 * Рёбра, привязанные к этому гейту.
 *
 * Сквозное ребро `end` сюда не попадает намеренно: оно срабатывает не по
 * ответу, а по тому, что узел доиграл. Иначе оно перехватывало бы ответы
 * на любом гейте узла.
 */
function edgesOfGate(node: SegmentNode, gateId: string) {
  return node.edges.filter(
    (edge) => edge.when.kind !== 'end' && edge.when.gateId === gateId,
  );
}

/**
 * Куда вести после ответа на гейте.
 *
 * `undefined` означает «остаться в узле»: у гейта нет рёбер, то есть это
 * обычный гейт, а не развилка. Случай законный и самый частый — так устроены
 * все семь фикстур, доставшихся от версии схемы 1.
 */
export function nextNodeAfterGate(
  node: SegmentNode,
  gateId: string,
  outcome: GateOutcome,
): string | undefined {
  const edges = edgesOfGate(node, gateId);
  if (edges.length === 0) return undefined;

  for (const edge of edges) {
    const when = edge.when;
    if (when.kind === 'option' && when.optionId === outcome.optionId) return edge.to;
    if (when.kind === 'correct' && outcome.correct) return edge.to;
    if (when.kind === 'wrong' && !outcome.correct) return edge.to;
  }

  // Сюда доехать нельзя: правило полного покрытия в схеме требует, чтобы
  // рёбра гейта покрывали все его исходы. Если доехали — молчать нельзя.
  // Тихий выбор «первого попавшегося» увёл бы зрителя не туда, и об этом
  // не узнал бы никто, включая автора объяснения.
  throw new Error(
    `Гейт «${gateId}»: рёбра есть, но ни одно не подошло под ответ. `
    + 'Схема обязана была поймать это при загрузке правилом полного покрытия.',
  );
}

/**
 * Куда вести, когда узел доиграл.
 *
 * `undefined` — объяснение закончилось. Это концовка, а не ошибка: именно
 * такой узел производит миграция с версии 1.
 */
export function nextNodeAtEnd(node: SegmentNode): string | undefined {
  return node.edges.find((edge) => edge.when.kind === 'end')?.to;
}

/**
 * Какие дорожки греть, когда открылся этот гейт.
 *
 * Все возможные продолжения сразу, потому что заранее неизвестно, что ответит
 * зритель, а время на гейте стоит — окно бесплатное. Без повторов: две ветки
 * в один узел не должны декодировать его дважды.
 */
export function preloadTargetsOfGate(node: SegmentNode, gateId: string): string[] {
  return [...new Set(edgesOfGate(node, gateId).map((edge) => edge.to))];
}
