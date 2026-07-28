/**
 * Отмена и повтор — чистая логика, без React и DOM.
 *
 * Снимки состояний, а не патчи. Редьюсер уже иммутабельный и уже обязан
 * сохранять ссылки на неизменившиеся поддеревья (см. `state/elements.ts`,
 * `state/project.ts`): правка одного элемента даёт новый `project`, новый
 * `scene`, новый массив `elements` и новый элемент, а `cues` и `gates`
 * остаются теми же объектами по ссылке. Значит снимок стоит сотни байт,
 * а не размер всего JSON — 20 КБ это цена текстового представления, а не
 * цена одной ссылки в массиве.
 *
 * Даже если бы это было не так и каждый снимок был полной копией проекта:
 * 50 шагов × 20 КБ = 1 МБ, что для вкладки браузера ничто. Раз память не
 * ограничивает выбор, выбираем по надёжности — а тут снимки выигрывают
 * решительно. История патчей требует обратного патча на каждый тип
 * действия; ошибка в одном обратном патче портит проект тихо и находится
 * через двадцать шагов отладки. Снимок неправильным быть не может: это
 * ровно то состояние, которое уже было принято и отрисовано.
 *
 * Модуль дженерик и не знает про `Project` — он про историю чего угодно.
 * Что считать «шагом» (жест целиком, а не промежуточный кадр перетаскивания;
 * `select` в историю не попадает вовсе) — решает вызывающий код в редьюсере,
 * этот модуль лишь хранит последовательность снимков.
 */

/** Сколько шагов назад можно отступить. Задание требует минимум 20, берём с запасом. */
export const HISTORY_LIMIT = 50;

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

/** Пустая история — единственное состояние, отменять и повторять пока нечего. */
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Фиксирует новое состояние как отдельный шаг.
 *
 * `future` очищается: правка после отмены убивает ветку, которая была
 * отменена, — это общепринятое поведение (тот же Ctrl+Z в любом текстовом
 * редакторе), и другого выбора у истории с одной веткой нет.
 *
 * Если `next` — тот же объект, что уже лежит в `present` (сравнение по
 * ссылке), шаг не создаётся и возвращается тот же `history`. Редьюсер умеет
 * отвечать на пустую правку тем же объектом состояния (ссылочная
 * целостность нужна ему самому, см. ADR-010), и раз правки не было, не
 * должно быть и шага истории — иначе Ctrl+Z будет отменять то, чего автор
 * не делал.
 */
export function push<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history;

  const past = history.past.concat(history.present);
  // Кольцевой буфер: переполнение отрезает самый старый шаг, а не растёт
  // бесконечно. slice — не мутация, past уже новый массив от concat выше.
  const bounded = past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;

  return { past: bounded, present: next, future: [] };
}

/**
 * Шаг назад. На границе (нечего отменять) — не ошибка, а нормальное
 * состояние интерфейса: кнопка отмены в этот момент выключена через
 * `canUndo`, и вызов на границе должен быть безопасным no-op, а не
 * исключением, которое надо ловить на каждом вызове.
 *
 * Возвращает тот же объект `history` по ссылке, если отменять нечего —
 * это позволяет вызывающему коду не пересобирать зависимые состояния
 * (например, время сцены) там, где отмена фактически не произошла.
 */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;

  // Индекс уже проверен строкой выше — bang безопасен (тот же приём, что
  // в state/project.ts и track/peaks.ts при noUncheckedIndexedAccess).
  const previous = history.past[history.past.length - 1]!;
  const past = history.past.slice(0, -1);
  const future = [history.present].concat(history.future);

  return { past, present: previous, future };
}

/** Шаг вперёд. Симметрично `undo`: на границе — тот же объект по ссылке. */
export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;

  // Индекс уже проверен строкой выше — bang безопасен, см. undo.
  const next = history.future[0]!;
  const future = history.future.slice(1);
  const past = history.past.concat(history.present);

  return { past, present: next, future };
}

/** Есть ли что отменять. Для дизейбла кнопки в интерфейсе. */
export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

/** Есть ли что повторять. Для дизейбла кнопки в интерфейсе. */
export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
