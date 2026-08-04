/**
 * Перенос меток дорожки со старой расшифровки на новую.
 *
 * Инвариант №10: метки времени привязаны к словам, а не к секундам.
 * Когда автор заменяет озвучку, слова у новой дорожки — другие: другой
 * набор, другие границы. Метка, построенная как `wordIndex` в СТАРОМ
 * транскрипте, обязана переехать на тот же текст в НОВОМ, а не молча
 * указывать на случайное слово по тому же индексу.
 *
 * `alignWords` (core) даёт сопоставление последовательностей слов — что
 * совпало, что заменилось, что пропало. Эта функция читает сопоставление
 * и решает судьбу каждой метки. Исходов пять, и все пять — разные новости
 * для автора:
 *
 *   `moved`     — `same`: переезд один в один;
 *   `check`     — `replaced`: слово изменило форму, метка переехала с пометкой;
 *   `orphaned`  — слова больше нет: метка становится СИРОТОЙ и встаёт
 *                 в лучшую догадку — на ближайшее уцелевшее слово;
 *   `recovered` — сирота нашла своё слово в новой записи и снова привязана;
 *   `toSeconds` — уцелевших слов нет ВООБЩЕ, догадку взять неоткуда.
 *
 * До Сессии 17 исходов было три, и потеря слова записывалась переводом
 * в секунды. Это уничтожало информацию: секунды не помнят, что здесь была
 * проблема, и наутро метка выглядела как осознанный выбор автора
 * (`product.md` §4 [Р]: якорь никогда не пропадает молча).
 *
 * Модуль живёт в `editor`, а не в `core`: он знает про метки редактора
 * (`TimeRef` внутри `Slide`/`Gate`) и возвращает отчёт для интерфейса.
 * `core` не должен знать, что кому показывают.
 */
import { alignWords, buildAnchor, checkAnchor } from '@player/core';
import type { AlignOp, TimeRef, Word, WordAnchor } from '@player/core';
import { plural, type PluralForms } from '../plural.js';
import { retargetMark } from '../track/marks.js';

const MARKS: PluralForms = { one: 'метка', few: 'метки', many: 'меток' };

/** Итог переноса меток числами — для отображения автору. */
export type RetargetReport = {
  /** Метка переехала на своё слово: тот же текст, сопоставление `same`. */
  readonly moved: number;
  /** Слово в другой форме — метка переехала, но сопоставление `replaced`: проверить. */
  readonly check: number;
  /** Слова больше нет — метка стала сиротой и стоит в лучшей догадке. */
  readonly orphaned: number;
  /** Сирота нашла своё слово в новой записи и снова привязана к нему. */
  readonly recovered: number;
  /** Ни одного уцелевшего слова — догадки нет, метка стала секундной. */
  readonly toSeconds: number;
};

/** Уцелевшее слово: где оно было и где стало. */
type Survivor = { readonly oldIndex: number; readonly newIndex: number };

/** Якорь, который метка ищет: у привязанной — свой, у сироты — потерянный. */
function soughtAnchor(ref: Exclude<TimeRef, { kind: 'seconds' }>): WordAnchor {
  return ref.kind === 'word' ? ref.anchor : ref.lost;
}

/**
 * Ближайшее уцелевшее слово к тому месту, где метка стояла.
 *
 * `product.md` §4 [Р]: сирота показывается в лучшей догадке — на ближайшем
 * найденном якоре. Расстояние считается В СЛОВАХ старого транскрипта,
 * а не в секундах: у новой озвучки свой темп, и сравнение времён двух
 * дорожек — тот самый ложный друг, против которого написан `align.ts`.
 *
 * **При равном расстоянии остаётся ЛЕВОЕ слово** — сравнение строгое, а
 * `survivors` идут по возрастанию, поэтому левое встречается первым и не
 * вытесняется. Это не вкусовщина: левое слово к моменту метки уже прозвучало,
 * и метка сработает чуть раньше срока; правое ещё не прозвучало, и метка
 * опоздает. Ранняя анимация читается как предвосхищение, поздняя — как лаг.
 *
 * Перебор линейный, а не двоичный, хотя `survivors` отсортирован. Причина
 * та же, что у наибольшей общей подпоследовательности в `align.ts`: размер
 * задачи мал — сотни слов и десятки меток, — и понятность здесь дороже
 * миллисекунд.
 */
function nearestSurvivor(survivors: readonly Survivor[], lostIndex: number): Survivor | undefined {
  let best: Survivor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const survivor of survivors) {
    const distance = Math.abs(survivor.oldIndex - lostIndex);
    if (distance < bestDistance) {
      best = survivor;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Нашлось ли потерянное слово в новой записи — и если да, то где.
 *
 * Ради этого сирота и носит `lost`. Автор перезаписал абзац, произнёс
 * пропущенное слово — и метка обязана вернуться к нему сама, а не остаться
 * в списке «проверьте эти места» навсегда. Это прямое следствие §4 [Р]
 * «выравнивание, а не переразметка»: судьба метки пересматривается на каждой
 * замене озвучки, а не однажды.
 *
 * Поиск идёт через `checkAnchor`, то есть по слову ВМЕСТЕ С СОСЕДЯМИ и только
 * при единственном кандидате. Найти «энергия» в записи, где это слово звучит
 * пятикратно, и объявить первое попадание тем самым — это ставить якорь
 * наугад, чего §4 не разрешает даже под видом хорошей новости.
 */
function recoverLost(after: readonly Word[], ref: Extract<TimeRef, { kind: 'orphan' }>): number | undefined {
  const asWord: TimeRef = {
    kind: 'word',
    wordIndex: ref.wordIndex,
    offset: ref.offset,
    anchor: ref.lost,
  };

  const check = checkAnchor(after, asWord);
  if (check.status === 'moved') return check.suggestedIndex;
  // `ok` значит, что по индексу догадки в НОВОЙ расшифровке стоит ровно
  // искомое слово. Совпадение индексов случайно, но само слово — то самое,
  // и отвергать находку из-за того, что она далась дёшево, незачем.
  if (check.status === 'ok' && after[ref.wordIndex] !== undefined) return ref.wordIndex;
  return undefined;
}

/**
 * Переносит метки `refs` со старой расшифровки `before` на новую `after`.
 *
 * Секундные метки (`kind: 'seconds'`) не трогаются вовсе и в отчёт не
 * попадают — им нечего переносить, они уже не привязаны к слову. Это же
 * делает их состоянием `pinned` из §4: «автор зафиксировал место вручную,
 * выравнивание его не трогает» — не отдельное поле, а вот эта строка.
 *
 * Карта `oldIndex → операция` и список уцелевших строятся один раз на весь
 * вызов — а не поиском по массиву на каждую метку, — потому что меток
 * в сегменте может быть много, а сопоставление на весь вызов одно.
 */
export function retargetByAlignment(
  refs: readonly TimeRef[],
  before: readonly Word[],
  after: readonly Word[],
): { readonly refs: readonly TimeRef[]; readonly report: RetargetReport } {
  const ops = alignWords(before, after);
  const byOldIndex = new Map<number, AlignOp>();
  const survivors: Survivor[] = [];

  for (const op of ops) {
    if (op.kind === 'same' || op.kind === 'replaced') {
      byOldIndex.set(op.oldIndex, op);
      survivors.push({ oldIndex: op.oldIndex, newIndex: op.newIndex });
    } else if (op.kind === 'removed') {
      byOldIndex.set(op.oldIndex, op);
    }
  }

  let moved = 0;
  let check = 0;
  let orphaned = 0;
  let recovered = 0;
  let toSeconds = 0;

  const nextRefs = refs.map((ref) => {
    if (ref.kind === 'seconds') return ref;

    // Сирота первым делом пробует вернуться домой: вдруг автор перезаписал
    // кусок и произнёс пропущенное слово. Проверять это ДО обычного переноса
    // обязательно — иначе догадка переехала бы по сопоставлению, и найденное
    // слово осталось бы ненайденным.
    if (ref.kind === 'orphan') {
      const home = recoverLost(after, ref);
      if (home !== undefined) {
        recovered++;
        return {
          kind: 'word' as const,
          wordIndex: home,
          offset: ref.offset,
          anchor: buildAnchor(after, home),
        };
      }
    }

    const op = byOldIndex.get(ref.wordIndex);
    if (op?.kind === 'same') {
      moved++;
      return { ...ref, wordIndex: op.newIndex };
    }
    if (op?.kind === 'replaced') {
      check++;
      return { ...ref, wordIndex: op.newIndex };
    }

    // `removed`, либо слова с таким индексом вовсе не было в сопоставлении.
    // Раньше здесь метка становилась секундной и теряла всякую память о том,
    // что произошло. Теперь она становится сиротой: несёт якорь, который
    // искали, и стоит в лучшей догадке — на ближайшем уцелевшем слове.
    const guess = nearestSurvivor(survivors, ref.wordIndex);
    if (guess) {
      orphaned++;
      return {
        kind: 'orphan' as const,
        wordIndex: guess.newIndex,
        // Смещение обнуляется намеренно. Оно строилось как «секунда минус
        // начало ПРОПАВШЕГО слова»; к другому слову это число не относится
        // никак, и перенести его значило бы произвести правдоподобную цифру
        // с видом настоящей.
        offset: 0,
        lost: soughtAnchor(ref),
      };
    }

    // Уцелевших слов нет ни одного: две расшифровки не совпали НИГДЕ.
    // Догадку взять неоткуда — «ближайшего найденного якоря» не существует, —
    // а ставить метку на первое попавшееся слово §4 запрещает прямо. Остаётся
    // старое поведение: секунды по СТАРОМУ времени, единственному, что про
    // эту метку известно. Случай редкий, но не невозможный: автор мог
    // перезаписать кусок совершенно другими словами.
    //
    // Если слова не было даже в СТАРОЙ расшифровке (индекс вне `before`,
    // например она вовсе пуста) — состояние невалидно по схеме, и
    // `retargetMark` намеренно падает `TimeRefError`. Заглушки на этот случай
    // нет: `product.md` §4 запрещает тихую подстановку.
    toSeconds++;
    return retargetMark(ref, before, 'seconds');
  });

  return { refs: nextRefs, report: { moved, check, orphaned, recovered, toSeconds } };
}

/**
 * Отчёт о переносе меток человеческими словами — для панели дорожки
 * (`AudioSourcePanel`).
 *
 * Строится ИЗ ЧИСЕЛ отчёта, а не наугад: количества в интерфейсе — та же
 * грабля «числа в комментариях гниют» (CLAUDE.md), только в тексте, который
 * видит автор, а не в комментарии. Части необязательны и появляются только
 * когда их число больше нуля.
 *
 * Все нули — легитимный исход (например, все метки сегмента уже были
 * секундными до замены — `retargetByAlignment` их вообще не считает), и тогда
 * возвращается нейтральная фраза, а не пустая строка: молчание выглядело бы
 * как забытая часть интерфейса, а не как «переносить было нечего».
 */
export function describeRetarget(report: RetargetReport): string {
  const parts: string[] = [];
  if (report.moved > 0) {
    parts.push(`Перенесено ${plural(report.moved, MARKS)}.`);
  }
  if (report.recovered > 0) {
    parts.push(`Нашлось заново ${plural(report.recovered, MARKS)} — слово вернулось в запись.`);
  }
  if (report.check > 0) {
    parts.push(`Проверьте ${plural(report.check, MARKS)} — слово изменило форму.`);
  }
  if (report.orphaned > 0) {
    parts.push(
      `Слово не найдено у ${plural(report.orphaned, MARKS)}: `
      + 'они стоят в лучшей догадке и помечены на дорожке.',
    );
  }
  if (report.toSeconds > 0) {
    parts.push(
      `Переведено в секунды ${plural(report.toSeconds, MARKS)}: `
      + 'новая расшифровка не совпала со старой ни одним словом.',
    );
  }
  if (parts.length === 0) {
    return 'Меток, привязанных к слову, в этой части не было — переносить было нечего.';
  }
  return parts.join(' ');
}
