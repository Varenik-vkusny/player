/**
 * Сопоставление двух транскриптов — что совпало, что пропало, что появилось.
 *
 * Зачем это отдельно от `checkAnchor` (time.ts). Тот сравнивает ПОСЛОВНО:
 * ищет в новом транскрипте слово с тем же текстом И теми же соседями, а при
 * двух кандидатах возвращает `lost`. Пока автор вставил кусок в стороне,
 * этого достаточно. Но стоит ему перефразировать соседнее слово — окрестность
 * разошлась, и метка теряется, хотя само слово никуда не делось.
 *
 * Правило из `CLAUDE.md`: сравнивать пословно можно только ПОСЛЕ сопоставления
 * последовательностей. Разные инструменты по-разному режут текст на слова,
 * и сравнение по индексам даёт правдоподобные числа с видом настоящих.
 * Здесь делается то самое сопоставление, после которого сверка по якорю
 * становится законной.
 *
 * Секунды не участвуют вовсе: сопоставляется ПОРЯДОК слов. У новой озвучки
 * своя длина и свой темп, и привязка ко времени здесь была бы ложным другом.
 */
import { normalizeWord } from './time.js';

// `Word` из `./schema.js` здесь больше не нужен: `alignWords` и `splitIntoWords`
// требуют только `.text`. Слова текста озвучки, нарезанные `splitIntoWords`,
// времён не имеют и иметь не могут — сузили тип намеренно, а не по забывчивости.

/**
 * Одна операция сопоставления.
 *
 * `same` несёт ОБА индекса: по ним якорь и переезжает со старого слова
 * на новое. `removed` — слово, на котором могла стоять метка, и теперь
 * его нет: молча переносить её никуда нельзя (`product.md` §4 — якорь
 * никогда не ставится наугад).
 */
export type AlignOp =
  | { readonly kind: 'same'; readonly oldIndex: number; readonly newIndex: number }
  | { readonly kind: 'replaced'; readonly oldIndex: number; readonly newIndex: number }
  | { readonly kind: 'removed'; readonly oldIndex: number }
  | { readonly kind: 'added'; readonly newIndex: number };

/**
 * Считает ли сопоставление два слова одним и тем же.
 *
 * Нормализация обязательна, а не косметична: замерено 01.08.2026, что
 * Deepgram возвращает «ждет» там, где синтез произнёс «ждёт». Сравнение
 * сырых строк потеряло бы метку на ровном месте.
 */
function sameWord(a: { text: string }, b: { text: string }): boolean {
  return normalizeWord(a.text) === normalizeWord(b.text);
}

/**
 * То же слово в другой форме — или уже другое слово?
 *
 * Решение владельца: сравнивается ОБЩЕЕ НАЧАЛО, потому что русский меняет
 * хвост, а не начало. «объяснение»/«объяснения» совпадают на 9 буквах из 10
 * и признаются заменой; «часы»/«время» не совпадают ни одной и остаются
 * разными словами.
 *
 * Порог намеренно строгий: `product.md` §4 запрещает ставить якорь наугад,
 * поэтому ошибиться в скупую сторону дешевле, чем в щедрую. Известная цена
 * порога — однокоренные разные слова («вода»/«водить») сойдут за одно.
 */
function similarWord(a: { text: string }, b: { text: string }): boolean {
  const x = normalizeWord(a.text);
  const y = normalizeWord(b.text);
  if (x === y) return true;

  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i >= Math.ceil((Math.max(x.length, y.length) * 2) / 3);
}

/**
 * Сопоставляет два транскрипта.
 *
 * Наибольшая общая подпоследовательность динамикой. Размер задачи мал —
 * транскрипт сегмента это сотни слов, — поэтому берётся простой и предсказуемый
 * алгоритм, а не хитрый: понятность здесь дороже, чем миллисекунды.
 *
 * Операции возвращаются слева направо в порядке нового транскрипта;
 * `removed` стоит на том месте, где слово исчезло.
 */
export function alignWords(
  before: readonly { text: string }[],
  after: readonly { text: string }[],
): AlignOp[] {
  const n = before.length;
  const m = after.length;

  // lcs[i][j] — длина наибольшей общей подпоследовательности хвостов
  // before[i..] и after[j..]. Считаем с конца, чтобы обратный ход шёл вперёд
  // и порядок операций получался естественным, без разворота массива.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = sameWord(before[i]!, after[j]!)
        ? lcs[i + 1]![j + 1]! + 1
        : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: AlignOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sameWord(before[i]!, after[j]!)) {
      ops.push({ kind: 'same', oldIndex: i, newIndex: j });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: 'removed', oldIndex: i });
      i++;
    } else {
      ops.push({ kind: 'added', newIndex: j });
      j++;
    }
  }
  while (i < n) ops.push({ kind: 'removed', oldIndex: i++ });
  while (j < m) ops.push({ kind: 'added', newIndex: j++ });

  return collapseReplacements(ops, before, after);
}

/**
 * Схлопывает соседнюю пару «пропало и появилось» в замену, если слова похожи.
 *
 * Отдельным проходом, а не внутри динамики: наибольшая общая
 * подпоследовательность отвечает на вопрос «что совпало», и подмешивать
 * в неё вторую меру сходства значит получить алгоритм, поведение которого
 * нельзя объяснить на одном примере.
 *
 * Порядок пары проверяется в обе стороны: обратный ход выдаёт «пропало»
 * первым только из-за нестрогого сравнения в развилке, и полагаться на это
 * значило бы держать корректность на детали, которую легко изменить.
 */
function collapseReplacements(
  ops: readonly AlignOp[],
  before: readonly { text: string }[],
  after: readonly { text: string }[],
): AlignOp[] {
  const result: AlignOp[] = [];

  for (let k = 0; k < ops.length; k++) {
    const current = ops[k]!;
    const next = ops[k + 1];

    const pair =
      next === undefined
        ? undefined
        : current.kind === 'removed' && next.kind === 'added'
          ? { oldIndex: current.oldIndex, newIndex: next.newIndex }
          : current.kind === 'added' && next.kind === 'removed'
            ? { oldIndex: next.oldIndex, newIndex: current.newIndex }
            : undefined;

    if (pair && similarWord(before[pair.oldIndex]!, after[pair.newIndex]!)) {
      result.push({ kind: 'replaced', ...pair });
      k++; // пара съедена целиком
      continue;
    }

    result.push(current);
  }

  return result;
}

/**
 * Единственное место, где текст озвучки режется на слова.
 *
 * Единственное — не для красоты. `CLAUDE.md`: разные инструменты по-разному
 * режут текст, и сравнение по индексам даёт правдоподобные числа с видом
 * настоящих. Суфлёр, выравнивание и подсветка обязаны смотреть на ОДНО
 * разбиение, иначе они разойдутся между собой, а не с реальностью.
 *
 * Знаки препинания остаются приклеенными к слову: снимает их `normalizeWord`
 * при сравнении, и делать это дважды разными способами значило бы завести
 * второе правило нормализации.
 */
export function splitIntoWords(text: string): { text: string }[] {
  return text.split(/\s+/u).filter((word) => word.length > 0).map((word) => ({ text: word }));
}
