/**
 * Привязка меток дорожки к словам транскрипта.
 *
 * Инвариант №10: метки времени привязаны к словам, а не к миллисекундам;
 * секунды — только там, где слова нет. Смысл продуктовый (ADR-008): автор
 * ставит анимацию на слово «энергия», потом правит соседнее предложение или
 * перегенерирует озвучку другим голосом. Метка обязана остаться на слове,
 * а не уехать вместе со сдвигом дорожки.
 *
 * Здесь принимается ровно одно решение: чем становится жест «поставить метку
 * на секунде t» — ссылкой на слово или ссылкой на секунду. Дальше метка живёт
 * как `TimeRef`, и обратно в секунды её переводит только `core`.
 *
 * Модуль чистый: ни DOM, ни React. Секунду вызывающий добывает из дорожки сам
 * (`TrackView` переводит `clientX` в время), а сюда отдаёт готовое число —
 * поэтому правила привязки проверяются в node без браузера.
 */
import { buildAnchor, resolveTimeRef } from '@player/core';
import type { TimeRef, Word } from '@player/core';

/** Куда попала метка, поставленная на секунду t. */
export type MarkTarget =
  | { readonly kind: 'word'; readonly wordIndex: number; readonly offset: number }
  | { readonly kind: 'seconds' };

/**
 * Состояние якоря на языке `product.md` §4 — то, что видит и понимает автор.
 *
 * Схема хранит виды `TimeRef`, документ говорит о состояниях якоря, и это
 * РАЗНЫЕ словари: `word` — про устройство ссылки, `bound` — про то, что
 * с меткой всё в порядке. Перевод собран в одной функции по той же причине,
 * по которой доступ к сегментам идёт через `segmentOf`: разъедься эти два
 * словаря по десятку мест — и однажды `seconds` где-то перестанет считаться
 * зафиксированным вручную.
 */
export type MarkAnchor = 'bound' | 'pinned' | 'orphan';

/**
 * Состояние якоря метки.
 *
 * `pinned` — это `seconds`, и здесь видно, почему отдельного поля не завели:
 * «автор зафиксировал место вручную, выравнивание его не трогает» — ровно
 * описание секундной метки, которую `retargetByAlignment` возвращает нетронутой.
 */
export function anchorStateOf(ref: TimeRef): MarkAnchor {
  switch (ref.kind) {
    case 'word':
      return 'bound';
    case 'seconds':
      return 'pinned';
    case 'orphan':
      return 'orphan';
  }
}

/** Минимум, нужный для обхода сирот: что это за метка, где стоит и в каком состоянии. */
export interface AnchoredMark {
  readonly kind: 'gate' | 'slide';
  readonly id: string;
  readonly anchor: MarkAnchor;
  readonly seconds: number;
}

/**
 * Следующая сирота по дорожке — для кнопки «к следующей».
 *
 * Обход круговой: за последней идёт первая. Список «проверьте эти места»
 * из §4 [Р] — это работа, которую автор делает до конца, а не однажды
 * сверху вниз; упереться в конец списка и получить мёртвую кнопку значило бы
 * заставить его вручную вспоминать, с какой метки он начал.
 *
 * Порядок — по секундам, а не по порядку в массиве: автор видит дорожку,
 * и «следующая» для него та, что правее, независимо от того, слайд это
 * или гейт и в каком списке он лежит.
 *
 * `undefined` возвращается ровно когда сирот нет вовсе. Если выбрана
 * не сирота (или ничего не выбрано), обход начинается с первой.
 */
export function nextOrphan(
  marks: readonly AnchoredMark[],
  selected: { readonly kind: string; readonly id: string } | undefined,
): AnchoredMark | undefined {
  const orphans = marks
    .filter((mark) => mark.anchor === 'orphan')
    .sort((a, b) => a.seconds - b.seconds);

  if (orphans.length === 0) return undefined;

  const current = orphans.findIndex(
    (mark) => mark.kind === selected?.kind && mark.id === selected.id,
  );

  // `current === -1` (выбрана не сирота или ничего) даёт индекс 0 — первую.
  return orphans[(current + 1) % orphans.length];
}

/**
 * Насколько далеко от слова метка всё ещё считается «на слове», секунды.
 *
 * Нижняя граница задана измерением, а не вкусом. S5: MFA даёт p95 ошибки
 * границы слова 30–90 мс, а тайминги `edge-tts` систематически опережают
 * реальный звук на 43–95 мс. То есть сохранённая граница слова и то, что автор
 * слышит, расходятся на величину порядка 0.1 с — при пороге в те же 0.1 с
 * попадание «на слово» стало бы делом везения.
 *
 * Вторая нижняя граница — то, что авторы делают руками: в `demo.json` гейты
 * стоят за 0.15 и 0.2 с до начала слова, то есть срабатывают чуть раньше, чем
 * оно прозвучит. Порог обязан быть строго больше самого крупного осмысленного
 * смещения: ровно 0.2 не годится ещё и арифметически — 44.388 − 44.188 даёт
 * 0.20000000000000284, и порог 0.2 отверг бы ровно тот случай, ради которого
 * он выбран.
 *
 * Верхнюю границу задают настоящие паузы. В `demo.json` межфразовые паузы —
 * 0.84–0.90 с; при 0.25 с с каждой стороны в середине любой из них остаётся
 * не меньше 0.34 с, где метка честно останется секундной. Щели короче 0.5 с
 * (запятые и вдохи, 0.10–0.31 с в той же фикстуре) притягиваются целиком —
 * и это правильно: там нет паузы, на которую автор мог бы целиться.
 */
export const DEFAULT_SNAP_SECONDS = 0.25;

/**
 * Слово, внутри которого лежит секунда, или −1.
 *
 * Интервал полуоткрытый: `start <= t < end`. Поэтому граница двух соседних
 * слов принадлежит следующему, а не предыдущему, и на стыке метка получает
 * `offset` 0, а не длину предыдущего слова.
 */
export function wordAt(words: readonly Word[], seconds: number): number {
  assertSeconds(seconds, 'Секунда метки');
  // Линейный поиск: сотня слов на дорожку, и ровно так же ищет слово под
  // головкой TrackView. Бинарный поиск потребовал бы гарантии сортировки,
  // которой у схемы нет.
  return words.findIndex((word) => seconds >= word.start && seconds < word.end);
}

/**
 * Решает, к чему привязать метку, поставленную на секунду t.
 *
 * Порядок правил не переставляется: попадание внутрь слова сильнее притяжения.
 * Иначе метка, поставленная в конце длинного слова, уезжала бы на начало
 * следующего — соседнее слово там ближе, чем начало собственного.
 */
export function chooseTarget(
  words: readonly Word[],
  seconds: number,
  snapSeconds: number = DEFAULT_SNAP_SECONDS,
): MarkTarget {
  assertSeconds(seconds, 'Секунда метки');
  assertSnap(snapSeconds);

  const insideIndex = wordAt(words, seconds);
  const inside = insideIndex >= 0 ? words[insideIndex] : undefined;
  if (inside) {
    return { kind: 'word', wordIndex: insideIndex, offset: seconds - inside.start };
  }

  const nearest = nearestWord(words, seconds);
  // Пустой транскрипт: привязываться не к чему. Схема (ADR-008) объявляет
  // `kind: 'word'` при пустом `words` невалидным, поэтому построить такую
  // ссылку должно быть невозможно, а не «поймается валидацией потом».
  if (!nearest) return { kind: 'seconds' };
  // Далеко от любого слова — например длинная пауза между фразами. Секунды
  // здесь не запасной вариант, а точный ответ: слова в этом месте нет.
  if (nearest.distance > snapSeconds) return { kind: 'seconds' };

  // Смещение считается от начала слова и может быть отрицательным: метка
  // перед словом — это «сработать чуть раньше, чем оно прозвучит», а не
  // «привязаться к предыдущему».
  return { kind: 'word', wordIndex: nearest.index, offset: seconds - nearest.word.start };
}

/** Строит готовый `TimeRef` для метки на секунде t. */
export function timeRefAt(
  words: readonly Word[],
  seconds: number,
  snapSeconds: number = DEFAULT_SNAP_SECONDS,
): TimeRef {
  const target = chooseTarget(words, seconds, snapSeconds);
  if (target.kind === 'seconds') return { kind: 'seconds', t: seconds };

  return {
    kind: 'word',
    wordIndex: target.wordIndex,
    offset: target.offset,
    // Якорь только через core. Собранный здесь руками разошёлся бы
    // с нормализацией (строчные, ё → е, без пунктуации), и `resolveTimeRef`
    // отверг бы собственную же метку с требованием перепривязки.
    anchor: buildAnchor(words, target.wordIndex),
  };
}

/**
 * Почему эту метку нельзя привязать к слову. `undefined` — можно.
 *
 * Две разные причины, и путать их нельзя: «в части нет расшифровки» —
 * свойство всей части и законное состояние (`product.md` §2в [Р]: ветка
 * без озвучки), а «рядом нет слова» — свойство этого места на дорожке,
 * например середина длинной паузы.
 *
 * Существует ради интерфейса: он обязан ОБЪЯСНИТЬ, почему привязка к слову
 * недоступна, а не молча погасить переключатель. Погашенная без причины
 * кнопка — тупик, в котором автор не понимает, что он сделал не так.
 */
export function wordAnchorProblem(
  ref: TimeRef,
  words: readonly Word[],
  snapSeconds: number = DEFAULT_SNAP_SECONDS,
): string | undefined {
  if (ref.kind === 'word') return undefined;
  if (words.length === 0) {
    return 'У этой главы нет расшифровки, привязывать не к чему: метки ставятся по секундам';
  }
  if (chooseTarget(words, markSeconds(ref, words), snapSeconds).kind !== 'word') {
    return 'На этой секунде рядом нет слова — здесь пауза. Метка остаётся на секунде';
  }
  return undefined;
}

/**
 * Та же метка, привязанная иначе: к слову или к секунде.
 *
 * Обе привязки работали в модели с самого начала (`core/time.ts`), выбирать
 * между ними автор не мог — интерфейс всегда брал слово. Это и делало
 * инструмент узконаправленным: часть без расшифровки разметить было нечем.
 *
 * Перевод идёт ЧЕРЕЗ СЕКУНДЫ, а не через запоминание прежней ссылки: помнить
 * её негде — в схеме такого поля нет и не будет (версия не меняется). Круг
 * при этом точен: смещение строится как `секунда − начало слова`, поэтому
 * «на слове плюс 0,2 с» возвращается тем же самым, — проверено кругом
 * по всем меткам `demo.json`, а не рассуждением.
 *
 * Невозможный перевод падает громко: до сюда доходят только те переключения,
 * которые интерфейс предложил, а предлагает он их по `wordAnchorProblem`.
 *
 * Целью бывает только `seconds` или `word`, хотя видов у `TimeRef` три.
 * Сиротство ставит выравнивание, обнаружив пропажу слова, — назначить его
 * «переводом» нельзя, потому что сирота несёт `lost`, а взять его тут неоткуда:
 * получилась бы метка, которая заявляет о потере, не зная, что потеряла.
 * Отсюда сужение типа, а не проверка в теле: невыразимое дешевле проверяемого.
 * ИСТОЧНИКОМ перевода сирота быть может — любая из двух привязок её снимает.
 */
export function retargetMark(
  ref: TimeRef,
  words: readonly Word[],
  kind: 'seconds' | 'word',
  snapSeconds: number = DEFAULT_SNAP_SECONDS,
): TimeRef {
  if (ref.kind === kind) return ref;

  const seconds = markSeconds(ref, words);
  if (kind === 'seconds') return { kind: 'seconds', t: seconds };

  const problem = wordAnchorProblem(ref, words, snapSeconds);
  if (problem) throw new Error(problem);
  return timeRefAt(words, seconds, snapSeconds);
}

/**
 * Позиция метки на дорожке в секундах.
 *
 * Тонкая обёртка над `resolveTimeRef`: переводить ссылку в секунды разрешено
 * только в core, и вся дорожка ходит туда через эту дверь. Обёртка добавляет
 * ровно одно — проверку самой ссылки. Без неё `wordIndex: 1.5` дал бы от core
 * сообщение «слово №1.5 отсутствует», то есть обвинение транскрипта в том,
 * что испорчена метка.
 *
 * Ссылка на несуществующее или подменившееся слово падает `TimeRefError`
 * из core — это не вырожденный вход, а состояние «нужна перепривязка»,
 * и гасить его здесь нельзя.
 */
export function markSeconds(ref: TimeRef, words: readonly Word[]): number {
  if (ref.kind === 'seconds') {
    assertSeconds(ref.t, 'Секунда метки');
  } else {
    if (!Number.isInteger(ref.wordIndex) || ref.wordIndex < 0) {
      throw new RangeError(
        `Индекс слова должен быть целым неотрицательным числом, получено ${String(ref.wordIndex)}`,
      );
    }
    if (!Number.isFinite(ref.offset)) {
      throw new RangeError(`Смещение метки должно быть конечным числом, получено ${String(ref.offset)}`);
    }
  }

  // `resolveTimeRef` обрезает результат снизу нулём. Здесь эта обрезка никогда
  // не срабатывает: секунда метки неотрицательна по проверке выше, а смещение
  // строилось как `seconds - word.start`, поэтому сумма возвращает ту же
  // секунду. Круговой перевод точен, а не «почти точен».
  return resolveTimeRef(ref, words);
}

/** Ближайшее к секунде слово вместе с расстоянием до него. `undefined` — слов нет. */
function nearestWord(
  words: readonly Word[],
  seconds: number,
): { index: number; word: Word; distance: number } | undefined {
  let best: { index: number; word: Word; distance: number } | undefined;
  for (const [index, word] of words.entries()) {
    const distance = distanceTo(word, seconds);
    // Сравнение нестрогое намеренно: ровно посередине щели побеждает слово,
    // которое идёт позже. Это то же правило, что и на стыке двух слов, и оно
    // совпадает с намерением автора — метка в паузе ставится в ожидании
    // следующего слова, а не вдогонку предыдущему.
    if (best === undefined || distance <= best.distance) best = { index, word, distance };
  }
  return best;
}

/** Расстояние от секунды до слова: ноль внутри, иначе до ближайшей границы. */
function distanceTo(word: Word, seconds: number): number {
  if (seconds < word.start) return word.start - seconds;
  if (seconds > word.end) return seconds - word.end;
  return 0;
}

function assertSeconds(seconds: number, what: string): void {
  // `Number.isFinite` не приводит типы, поэтому строка '1.2' сюда не пролезет.
  if (!Number.isFinite(seconds)) {
    throw new RangeError(`${what} должна быть конечным числом, получено ${String(seconds)}`);
  }
  if (seconds < 0) {
    throw new RangeError(`${what} не может быть отрицательной, получено ${String(seconds)}`);
  }
}

function assertSnap(snapSeconds: number): void {
  if (!Number.isFinite(snapSeconds) || snapSeconds < 0) {
    throw new RangeError(
      `Порог притяжения должен быть конечным неотрицательным числом, получено ${String(snapSeconds)}`,
    );
  }
}

/**
 * Первый гейт, который головка пересекла на этом кадре, — или undefined.
 *
 * Нужен, чтобы предпросмотр в редакторе останавливался на гейте так же, как
 * останавливается плеер. До этого дорожка редактора проезжала гейт молча:
 * на линейке стоял квадратик, автор жал «играть», и звук шёл дальше — то есть
 * редактор показывал поведение, которого у зрителя не будет. Проверено
 * в браузере: 4.5 → 8.4 с через гейт на 6.0 с.
 *
 * Пересечение, а не «позиция больше»: условие `from < gate <= to` не даёт
 * повторно сработать на том же гейте, когда автор нажал «играть» ещё раз,
 * стоя ровно на нём. Останавливаемся на ПЕРВОМ пересечённом, даже если
 * за кадр перескочили сразу через два, — второй сработает на следующем ходу.
 */
export function crossedStop(
  stops: readonly number[],
  from: number,
  to: number,
): number | undefined {
  if (!(to > from)) return undefined;
  let first: number | undefined;
  for (const stop of stops) {
    if (stop > from && stop <= to && (first === undefined || stop < first)) first = stop;
  }
  return first;
}
