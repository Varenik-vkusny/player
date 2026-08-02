/**
 * Запросы к хребту объяснения. Чистые функции: ни DOM, ни состояния, ни времени.
 *
 * Живут в ядре, а не внутри класса плеера, потому что выбор следующего сегмента —
 * правило продукта. Правило продукта обязано проверяться юнит-тестом,
 * а не прогоном звука в браузере: в S3 логика паузы была верна и прошла бы
 * любой юнит-тест, а дефект сидел в звуке — здесь ровно наоборот, и смешивать
 * эти два слоя значит не иметь возможности проверить ни один.
 *
 * **Гейта здесь больше нет.** В версии схемы 2 выбор следующего узла делался
 * по ответу на гейте, прямо из середины дорожки. В версии 3 гейт только
 * записывает ответ в переменную, а решение принимает выход сегмента — и принять
 * его больше негде, потому что `Exit` есть поле сегмента (ADR-015).
 */
import type { Condition, ExitRule, Project, Segment } from './schema.js';

/**
 * Ответ зрителя на одном гейте.
 *
 * Не `GateAttempt` из плеера: ядро про плеер не знает (инвариант №6),
 * а для выбора ветки от ответа нужны ровно два поля.
 */
export interface Answer {
  /**
   * Что зритель ответил. Для гейта с выбором — `id` варианта, для ввода —
   * введённая строка, для кнопки «дальше» — пустая строка.
   */
  readonly value: string;
  readonly correct: boolean;
}

/**
 * Накопленные ответы зрителя: имя переменной → ответ.
 *
 * Живут на всё объяснение и переживают переходы между сегментами, поэтому выход
 * сегмента вправе опереться на ответ, данный раньше. Это состояние зрителя,
 * а не часть файла проекта, — поэтому тип, а не Zod-схема.
 */
export type Answers = Readonly<Record<string, Answer | undefined>>;

/**
 * Сегмент по идентификатору.
 *
 * Бросает, а не отдаёт `undefined`: сегмента, которого нет, — это рассинхрон
 * состояния, и увидеть его надо там, где спросили, а не тремя кадрами позже
 * в виде пустой сцены.
 */
export function findSegment(project: Project, segmentId: string): Segment {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    throw new Error(`Сегмента «${segmentId}» нет в объяснении`);
  }
  return segment;
}

/**
 * Подошло ли условие под накопленные ответы.
 *
 * Переменной может не быть вовсе: зритель дошёл до выхода, не ответив
 * на гейт (гейт стоял в ветке, которую он не видел, или сегменту вообще
 * не задавали вопросов). Это не ошибка — условие просто не подошло.
 */
export function conditionHolds(condition: Condition, answers: Answers): boolean {
  const answer = answers[condition.variable];
  // Переменной нет — не подошло НИ ОДНО условие, включая `notEquals`.
  // Это не самоочевидно: «ответ не равен красному» у зрителя, который вообще
  // не отвечал, читается как правда. Но тогда правило с `≠` тихо вело бы
  // по ветке, условие которой зритель не выполнял. → ADR-019
  if (!answer) return false;

  switch (condition.kind) {
    case 'equals': return answer.value === condition.value;
    case 'notEquals': return answer.value !== condition.value;
    case 'correct': return answer.correct;
    case 'wrong': return !answer.correct;
    case 'compare': return compareHolds(condition.op, answer.value, condition.value);
    default: {
      // Не `default: return false`: тот глушил проверку полноты, и забытый
      // вид условия молча не срабатывал бы — дефект, невидимый ни в тесте,
      // ни в консоли. Теперь забытый вид ломает сборку.
      const unreachable: never = condition;
      throw new Error(`Неизвестный вид условия: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Сравнение ответа с числом.
 *
 * Переменная хранит СТРОКУ — id выбранного варианта. Если она не приводится
 * к числу, условие просто не подошло: сравнить «красный» с тройкой нельзя,
 * но это законное состояние данных зрителя, а не ошибка кода. Автора про
 * такое правило предупреждает панель проблем — оно не сработает никогда.
 */
function compareHolds(op: 'gt' | 'gte' | 'lt' | 'lte', value: string, against: number): boolean {
  // `Number('')` даёт 0, а пустая строка — это «зритель нажал „дальше“»,
  // а не «ответил нулём». Такое сравнивать не с чем.
  if (value.trim() === '') return false;
  const number = Number(value);
  if (!Number.isFinite(number)) return false;

  switch (op) {
    case 'gt': return number > against;
    case 'gte': return number >= against;
    case 'lt': return number < against;
    case 'lte': return number <= against;
    default: {
      const unreachable: never = op;
      throw new Error(`Неизвестный оператор сравнения: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Подошёл ли ВЕСЬ набор условий: они соединены через И.
 *
 * Пустого набора не бывает — схема требует непустой список, потому что
 * правило без условий это `default`, а он уже есть отдельным полем.
 */
export function conditionsHold(conditions: readonly Condition[], answers: Answers): boolean {
  return conditions.every((condition) => conditionHolds(condition, answers));
}

/**
 * Куда вести и по какому правилу — исход выбора выхода сегмента.
 *
 * `rule: null` означает, что сработал запасной выход (`exit.default`),
 * а не одно из именованных правил: у запасного выхода нет условий, из
 * которых можно было бы взять переменные для сброса.
 */
export type ExitChoice =
  | { readonly goto: string; readonly rule: ExitRule }
  | { readonly goto: string; readonly rule: null };

/**
 * Какой сегмент следующий, когда этот доиграл, и по какому правилу.
 *
 * Правила проверяются по порядку, первое подошедшее выигрывает: порядок
 * задаёт автор, и «первое подошедшее» — единственная семантика, которую
 * он может держать в голове, читая список сверху вниз.
 *
 * `null` — объяснение закончилось. Это концовка, а не ошибка: именно такой
 * выход получает сегмент после миграции с версии 2, то есть это основной
 * случай.
 *
 * Правило возвращается вместе с целью, потому что повтору куска объяснения
 * нужно не только «куда», но и «из-за какого правила»: из правила берутся
 * переменные, чьи ответы надо сбросить, чтобы виновная остановка спросила
 * заново.
 */
export function nextExit(segment: Segment, answers: Answers): ExitChoice | null {
  for (const rule of segment.exit.rules) {
    if (conditionsHold(rule.when, answers)) return { goto: rule.goto, rule };
  }
  return segment.exit.default === null ? null : { goto: segment.exit.default, rule: null };
}

/**
 * Какой сегмент следующий, когда этот доиграл.
 *
 * Обёртка над `nextExit`: два независимых описания одного и того же правила
 * разъехались бы тихо, поэтому цель берётся из единственного источника.
 */
export function nextSegment(segment: Segment, answers: Answers): string | null {
  return nextExit(segment, answers)?.goto ?? null;
}

/**
 * Какие дорожки греть, пока играет этот сегмент.
 *
 * Все возможные продолжения сразу, потому что заранее неизвестно, что ответит
 * зритель. Без повторов: две ветки в один сегмент не должны декодировать его
 * дважды.
 *
 * Гейт из прогрева ушёл вместе с ветвлением по гейту. Окно теперь больше,
 * а не меньше: сегмент линеен и его длительность известна точно, поэтому греть
 * можно с самого начала, а не с момента, когда открылся вопрос.
 */
/**
 * Сколько частей осталось после этой, если путь до конца ОДНОЗНАЧЕН.
 *
 * `null` — впереди развилка, и длина объяснения зависит от того, что зритель
 * ещё не ответил. Это главное свойство продукта, а не краевой случай: точный
 * процент и «часть 3 из 7» одинаково врут, когда путей несколько.
 *
 * Но врут они не ВСЕГДА. Пока впереди у каждой части ровно одно продолжение,
 * остаток известен точно, и прятать его было бы такой же неправдой, только
 * в другую сторону. Поэтому ответ — число там, где оно есть, и `null` там,
 * где его нет.
 *
 * Считается по ВСЕМ возможным продолжениям (`preloadTargetsOfExit`), а не
 * по тому, куда повёл бы текущий набор ответов: вопрос здесь про будущее,
 * а будущих ответов ещё не существует. Два правила, ведущие в одну и ту же
 * часть, неоднозначности не создают — путь всё ещё один.
 *
 * Цикл обрывает счёт: объяснение, возвращающееся само в себя, не имеет
 * определённой длины, и назвать её числом значило бы соврать точнее всего.
 */
export function certainRemaining(project: Project, segmentId: string): number | null {
  const visited = new Set<string>();
  let current = segmentId;
  let remaining = 0;

  for (;;) {
    if (visited.has(current)) return null;
    visited.add(current);

    const targets = preloadTargetsOfExit(findSegment(project, current));
    if (targets.length === 0) return remaining;
    if (targets.length > 1) return null;

    current = targets[0]!;
    remaining += 1;
  }
}

export function preloadTargetsOfExit(segment: Segment): string[] {
  const targets = segment.exit.rules.map((rule) => rule.goto);
  if (segment.exit.default !== null) targets.push(segment.exit.default);
  return [...new Set(targets)];
}
