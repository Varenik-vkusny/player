/**
 * Разбор черновика числового виджета секции «Вид» (Inspector.tsx).
 *
 * Чистая функция — вынесена из компонента, чтобы приведение значения виджета
 * к тому, что ждёт `setStyleValue`, было проверено юнитом, а не только
 * просмотром кода (ADR-010: логика вне компонентов переживает переписку вида).
 *
 * Паттерн тот же, что у `NumberField` геометрии в Inspector.tsx: набираемая
 * строка проходит через состояния, которые числом ещё не являются
 * («-», «1.», пустая строка), и их нельзя отдавать дальше — `Number('')`
 * и `Number(' ')` дают 0, правдоподобное значение, которого автор не вводил.
 */
export function parseStyleDraft(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Собирает `LengthOrPercent` (border-radius) из независимо набираемых числа
 * и единицы. Число живёт в текстовом черновике виджета, единица — в отдельном
 * select без промежуточных состояний; `setStyleValue` же ждёт их одним
 * объектом. Сборка объекта из двух частей — забота этой функции, а не
 * компонента: компонент лишь передаёт actual текст и текущую единицу.
 */
export function composeLengthOrPercent(
  amountText: string,
  unit: 'px' | '%',
): { amount: number; unit: 'px' | '%' } | undefined {
  const amount = parseStyleDraft(amountText);
  return amount === undefined ? undefined : { amount, unit };
}
