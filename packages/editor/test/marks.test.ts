import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject, normalizeWord, resolveTimeRef, splitIntoWords } from '@player/core';
import type { TimeRef, Word } from '@player/core';

import {
  DEFAULT_SNAP_SECONDS,
  anchorStateOf,
  chooseTarget,
  crossedStop,
  markSeconds,
  nextOrphan,
  retargetMark,
  timeRefAt,
  wordAnchorProblem,
  wordAt,
} from '../src/track/marks.js';
import type { MarkTarget } from '../src/track/marks.js';

function word(text: string, start: number, end: number): Word {
  return { text, start, end, source: 'alignment' };
}

/**
 * Синтетическая фраза со всеми интересными местами сразу:
 * стык двух слов (1.5), короткая щель 0.1 с, длинная пауза 2.2 с,
 * слово с прописной буквы, «ё» и запятой — на нём проверяется нормализация.
 */
const WORDS: readonly Word[] = [
  word('Привет', 1.0, 1.5),
  word('мир', 1.5, 1.9),
  word('Ёжик,', 2.0, 2.4),
  word('бежит', 2.4, 2.8),
  word('дальше', 5.0, 5.4),
];

/**
 * Привязка к слову: индекс сверяется точно, смещение — с точностью до
 * плавающей запятой. Смещение всегда разность двух долей секунды, поэтому
 * `4.85 - 5.0` даёт −0.15000000000000036, и сравнение на равенство проверяло
 * бы двоичное представление, а не поведение модуля.
 */
function expectWordTarget(target: MarkTarget, wordIndex: number, offset: number): void {
  if (target.kind !== 'word') {
    throw new Error(`Ожидалась привязка к слову, получено «${target.kind}»`);
  }
  expect(target.wordIndex).toBe(wordIndex);
  expect(target.offset).toBeCloseTo(offset, 12);
}

/** Ссылка на слово с сужением типа: без него не добраться до `anchor`. */
function wordRef(ref: TimeRef): Extract<TimeRef, { kind: 'word' }> {
  if (ref.kind !== 'word') throw new Error(`Ожидалась ссылка на слово, получено «${ref.kind}»`);
  return ref;
}

/**
 * Выбор привязки метки автором (`product.md` §2в [Р]).
 *
 * Обе привязки работали в модели с самого начала, интерфейс всегда выбирал
 * слово. Здесь проверяется перевод одной в другую — и главное, что смещение
 * («на слове плюс 0,2 с») переживает переключение туда и обратно. Потерять
 * его значило бы тихо сдвинуть анимацию, оставив метку на прежнем месте.
 */
describe('переключение привязки метки', () => {
  it('слово → секунда: метка остаётся ровно там же по времени', () => {
    const ref: TimeRef = timeRefAt(WORDS, 2.6);
    const next = retargetMark(ref, WORDS, 'seconds');

    expect(next.kind).toBe('seconds');
    expect(markSeconds(next, WORDS)).toBeCloseTo(markSeconds(ref, WORDS), 12);
  });

  it('секунда → слово: возвращается на то же слово с тем же смещением', () => {
    const asWord = wordRef(timeRefAt(WORDS, 2.6));
    const asSeconds = retargetMark(asWord, WORDS, 'seconds');
    const back = wordRef(retargetMark(asSeconds, WORDS, 'word'));

    expect(back.wordIndex).toBe(asWord.wordIndex);
    expect(back.offset).toBeCloseTo(asWord.offset, 12);
  });

  it('смещение переживает круг и для метки ПЕРЕД словом', () => {
    // 4.85 — за 0.15 с до слова «дальше»: отрицательное смещение, ровно тот
    // случай «сработать чуть раньше, чем оно прозвучит», который в demo.json
    // авторы расставили руками.
    const asWord = wordRef(timeRefAt(WORDS, 4.85));
    expect(asWord.offset).toBeCloseTo(-0.15, 12);

    const back = wordRef(retargetMark(retargetMark(asWord, WORDS, 'seconds'), WORDS, 'word'));
    expect(back.wordIndex).toBe(asWord.wordIndex);
    expect(back.offset).toBeCloseTo(-0.15, 12);
  });

  it('та же привязка — тот же объект, лишнего шага истории не будет', () => {
    const ref: TimeRef = { kind: 'seconds', t: 3.9 };
    expect(retargetMark(ref, WORDS, 'seconds')).toBe(ref);
  });

  it('в паузе привязать к слову нельзя, и причина названа', () => {
    // 3.9 — середина длинной паузы: слова здесь нет, и это точный ответ,
    // а не запасной вариант.
    const ref: TimeRef = { kind: 'seconds', t: 3.9 };

    expect(wordAnchorProblem(ref, WORDS)).toMatch(/рядом нет слова/);
    expect(() => retargetMark(ref, WORDS, 'word')).toThrow(/рядом нет слова/);
  });

  it('без расшифровки привязка к слову недоступна, и сказано почему', () => {
    const ref: TimeRef = { kind: 'seconds', t: 1 };

    expect(wordAnchorProblem(ref, []), 'у части нет расшифровки').toMatch(/расшифровки/);
    expect(() => retargetMark(ref, [], 'word')).toThrow(/расшифровки/);
  });

  it('там, где слово есть, привязка к нему разрешена', () => {
    expect(wordAnchorProblem({ kind: 'seconds', t: 2.6 }, WORDS)).toBeUndefined();
  });
});

/**
 * Круг на ЭТАЛОННОЙ фикстуре, а не на синтетике. Синтетический набор слов
 * подтвердил бы только то, что модуль согласован сам с собой; demo.json
 * несёт смещения, расставленные руками автора (0.15 и 0.2 с ДО слова),
 * и именно на них круг ведёт себя не так, как ожидаешь.
 *
 * **Что здесь измерено, а не предположено.** Время круг сохраняет точно
 * всегда. СЛОВО — не всегда: метка «за 0.15 с до „главная"» стоит на 14.387,
 * а эта секунда лежит ВНУТРИ предыдущего слова «есть» (14.250–14.537).
 * Правило `chooseTarget` — «попадание внутрь слова сильнее притяжения», —
 * и оно правильное само по себе, но означает, что вернувшаяся привязка
 * указывает на «есть», а не на «главная».
 *
 * Для автора это не мелочь: время не изменилось, поэтому в редакторе
 * НИЧЕГО не видно, а при замене голоса метка поедет за другим словом.
 * Поэтому интерфейс обязан показывать слово привязки постоянно, а не
 * предлагать переключение как безобидный тумблер. Тест закрепляет
 * измеренное поведение, чтобы оно не поменялось молча.
 */
describe('переключение привязки на demo.json', () => {
  const demo = loadProject(
    JSON.parse(
      readFileSync(
        join(fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url)), 'demo.json'),
        'utf8',
      ),
    ),
  );
  const segment = demo.segments[0]!;
  const words = segment.audio.words;
  const onWord = [...segment.slides, ...segment.gates]
    .map((mark) => mark.at)
    .filter((at): at is Extract<TimeRef, { kind: 'word' }> => at.kind === 'word');

  it('время метки круг сохраняет точно — все метки фикстуры', () => {
    expect(onWord.length, 'в demo.json есть метки на словах').toBeGreaterThan(0);

    for (const ref of onWord) {
      const seconds = markSeconds(ref, words);
      const back = retargetMark(retargetMark(ref, words, 'seconds'), words, 'word');
      expect(markSeconds(back, words), `метка на ${seconds} с`).toBeCloseTo(seconds, 9);
    }
  });

  it('слово сохраняется у меток ВНУТРИ слова и теряется у меток ПЕРЕД словом', () => {
    const kept: number[] = [];
    const moved: number[] = [];

    for (const ref of onWord) {
      const back = wordRef(retargetMark(retargetMark(ref, words, 'seconds'), words, 'word'));
      (back.wordIndex === ref.wordIndex ? kept : moved).push(ref.wordIndex);
    }

    // Обе группы непусты — иначе тест проверял бы только одну ветку правила.
    expect(kept.length, 'метки внутри своего слова круг переживают').toBeGreaterThan(0);
    expect(moved.length, 'метки перед словом уезжают на предыдущее').toBeGreaterThan(0);

    // Точное правило — не «смещение отрицательное», а «секунда попала ВНУТРЬ
    // другого слова». Отрицательное смещение в ПАУЗЕ (перед словом, но после
    // конца предыдущего) привязку сохраняет: притяжение выбирает то же слово.
    for (const ref of onWord) {
      const seconds = markSeconds(ref, words);
      const inside = wordAt(words, seconds);
      const back = wordRef(retargetMark(retargetMark(ref, words, 'seconds'), words, 'word'));

      if (inside >= 0 && inside !== ref.wordIndex) {
        expect(back.wordIndex, `метка на ${seconds} с попала внутрь слова №${inside}`).toBe(inside);
      } else {
        expect(back.wordIndex, `метка на ${seconds} с`).toBe(ref.wordIndex);
      }
    }
  });
});

describe('метка внутри слова', () => {
  it('привязывается к этому слову со смещением от его начала', () => {
    expectWordTarget(chooseTarget(WORDS, 1.2), 0, 0.2);
    expectWordTarget(chooseTarget(WORDS, 2.6), 3, 0.2);
  });

  it('ровно на начале слова даёт нулевое смещение', () => {
    expect(chooseTarget(WORDS, 1.0)).toEqual({ kind: 'word', wordIndex: 0, offset: 0 });
    expect(chooseTarget(WORDS, 5.0)).toEqual({ kind: 'word', wordIndex: 4, offset: 0 });
  });

  it('внутри слова притяжение не действует: соседнее слово не перехватывает метку', () => {
    // 2.79 отстоит от начала «бежит» на 0.39, а от начала следующего слова —
    // на 2.21. Но решает не расстояние, а попадание внутрь.
    expect(chooseTarget(WORDS, 2.79)).toEqual({ kind: 'word', wordIndex: 3, offset: 2.79 - 2.4 });
    // И наоборот: конец длинного слова не уезжает на следующее слово,
    // хотя до его начала может быть ближе, чем до собственного начала.
    const long: readonly Word[] = [word('длинное', 0, 4), word('за', 4, 4.5)];
    expect(chooseTarget(long, 3.9)).toEqual({ kind: 'word', wordIndex: 0, offset: 3.9 });
  });

  it('поиск слова под секундой находит его же', () => {
    expect(wordAt(WORDS, 1.2)).toBe(0);
    expect(wordAt(WORDS, 2.6)).toBe(3);
    expect(wordAt(WORDS, 1.95)).toBe(-1);
    expect(wordAt([], 1.2)).toBe(-1);
  });
});

describe('метка рядом со словом', () => {
  it('чуть раньше начала слова даёт отрицательное смещение и тот же индекс', () => {
    // Ровно то, что стоит в demo.json у гейтов: сработать чуть раньше, чем
    // слово прозвучит, — это всё ещё метка на слове, а не на секунде.
    expectWordTarget(chooseTarget(WORDS, 4.85), 4, -0.15);
  });

  it('после конца слова смещение больше его длительности', () => {
    // 1.9 — конец «мир»: интервал полуоткрытый, внутрь секунда не попала,
    // но ближайшее слово всё то же, и смещение равно его длине.
    expectWordTarget(chooseTarget(WORDS, 1.9), 1, 0.4);
  });

  it('ровно посередине щели побеждает слово, идущее позже', () => {
    // Щель 1.9…2.0: до конца «мир» и до начала «Ёжик,» одинаковые 0.05.
    // Правило зафиксировано: метка в паузе ставится в ожидании следующего
    // слова, а не вдогонку предыдущему.
    expectWordTarget(chooseTarget(WORDS, 1.95), 2, -0.05);
  });

  it('стык двух слов принадлежит следующему', () => {
    // 1.5 — конец «Привет» и начало «мир» одновременно. Половина интервала
    // закрыта слева, поэтому смещение выходит нулевым, а не длиной «Привет».
    expect(chooseTarget(WORDS, 1.5)).toEqual({ kind: 'word', wordIndex: 1, offset: 0 });
    expect(wordAt(WORDS, 1.5)).toBe(1);
  });

  it('порог притяжения задаётся явно и действительно решает', () => {
    // 4.7 отстоит от «дальше» на 0.3 — дальше порога по умолчанию.
    expect(chooseTarget(WORDS, 4.7)).toEqual({ kind: 'seconds' });
    expectWordTarget(chooseTarget(WORDS, 4.7, 0.5), 4, -0.3);
    // Нулевой порог выключает притяжение целиком, но не трогает попадание
    // внутрь слова.
    expect(chooseTarget(WORDS, 1.95, 0)).toEqual({ kind: 'seconds' });
    expectWordTarget(chooseTarget(WORDS, 1.2, 0), 0, 0.2);
  });

  it('порог по умолчанию покрывает измеренное расхождение таймингов', () => {
    // S5: MFA даёт p95 30–90 мс, edge-tts опережает звук на 43–95 мс.
    // Порог обязан быть заметно больше, иначе привязка к слову становится
    // делом везения. Верхняя граница — чтобы межфразовая пауза (0.84 с
    // в demo.json) не съедалась притяжением с обеих сторон.
    expect(DEFAULT_SNAP_SECONDS).toBeGreaterThan(0.095);
    expect(DEFAULT_SNAP_SECONDS).toBeLessThan(0.84 / 2);
  });
});

describe('там, где слова нет', () => {
  it('длинная пауза остаётся секундами', () => {
    // Пауза 2.8…5.0: середина отстоит от обоих слов больше чем на секунду.
    expect(chooseTarget(WORDS, 3.9)).toEqual({ kind: 'seconds' });
    expect(timeRefAt(WORDS, 3.9)).toEqual({ kind: 'seconds', t: 3.9 });
  });

  it('далеко до первого и после последнего слова — тоже секунды', () => {
    expect(chooseTarget(WORDS, 0)).toEqual({ kind: 'seconds' });
    expect(chooseTarget(WORDS, 6)).toEqual({ kind: 'seconds' });
  });

  it.each([0, 0.5, 12.75, 1e6])('пустой транскрипт: секунда %s не привязывается к слову', (t) => {
    // ADR-008: ссылка на слово при пустом words невалидна по схеме. Значит
    // построить её должно быть невозможно, а не «поймается при загрузке».
    expect(chooseTarget([], t)).toEqual({ kind: 'seconds' });
    expect(timeRefAt([], t)).toEqual({ kind: 'seconds', t });
    // Порог притяжения здесь ничего не меняет: тянуться не к чему.
    expect(chooseTarget([], t, 1e9)).toEqual({ kind: 'seconds' });
  });
});

describe('круговая проверка: секунда → ссылка → секунда', () => {
  /** Начала, середины, концы слов, стык, щель, пауза и края дорожки. */
  const MOMENTS = [
    0, 0.5, 0.9, 1.0, 1.25, 1.4999, 1.5, 1.75, 1.9, 1.95, 2.0, 2.2, 2.39,
    2.4, 2.8, 3.0, 3.9, 4.8, 4.85, 5.0, 5.2, 5.4, 5.6, 6.0,
  ];

  it.each(MOMENTS)('секунда %s возвращается той же', (t) => {
    expect(markSeconds(timeRefAt(WORDS, t), WORDS)).toBeCloseTo(t, 12);
  });

  it.each([0, 0.05, DEFAULT_SNAP_SECONDS, 1, 10])(
    'при пороге %s круговой перевод точен на всех моментах',
    (snap) => {
      // Порог меняет, какой ветвью пойдёт привязка, но не результат:
      // ссылка обязана указывать ровно туда, куда автор поставил метку.
      for (const t of MOMENTS) {
        expect(markSeconds(timeRefAt(WORDS, t, snap), WORDS)).toBeCloseTo(t, 12);
      }
    },
  );

  it('накопления ошибки при повторной привязке нет', () => {
    let t = 2.2;
    for (let i = 0; i < 1000; i += 1) t = markSeconds(timeRefAt(WORDS, t), WORDS);
    expect(t).toBeCloseTo(2.2, 12);
  });
});

describe('якорь строится только через core', () => {
  it('текст якоря нормализован, а не взят из транскрипта как есть', () => {
    const ref = wordRef(timeRefAt(WORDS, 2.2));
    expect(ref.wordIndex).toBe(2);
    // «Ёжик,» → «ежик»: строчные, ё → е, без пунктуации.
    expect(ref.anchor).toEqual({ text: 'ежик', before: 'мир', after: 'бежит' });
  });

  it('на краях транскрипта соседи пустые', () => {
    expect(wordRef(timeRefAt(WORDS, 1.0)).anchor).toEqual({
      text: 'привет',
      before: '',
      after: 'мир',
    });
    expect(wordRef(timeRefAt(WORDS, 5.2)).anchor).toEqual({
      text: 'дальше',
      before: 'бежит',
      after: '',
    });
  });

  it.each([1.0, 1.2, 1.5, 1.95, 2.2, 2.6, 4.85, 5.2])(
    'ссылка на секунде %s проходит resolveTimeRef из core',
    (t) => {
      const ref = timeRefAt(WORDS, t);
      expect(() => resolveTimeRef(ref, WORDS)).not.toThrow();
      expect(resolveTimeRef(ref, WORDS)).toBeCloseTo(t, 12);
    },
  );

  it('якорь, собранный руками, ту же проверку не проходит', () => {
    // Доказательство, что предыдущий тест не пустой: тот же индекс и то же
    // смещение, но текст якоря взят из транскрипта как есть.
    const naive: TimeRef = {
      kind: 'word',
      wordIndex: 2,
      offset: 0.2,
      anchor: { text: 'Ёжик,', before: 'мир', after: 'бежит' },
    };
    expect(() => markSeconds(naive, WORDS)).toThrow(/перепривязка/i);
  });
});

describe('реальные данные: fixtures/projects/demo.json', () => {
  // fileURLToPath, а не pathname.slice(1): на Linux путь начинается со слэша,
  // и slice(1) отрезал бы его.
  const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
  const demo = loadProject(JSON.parse(readFileSync(join(FIXTURES, 'demo.json'), 'utf8')));
  const segment = demo.segments[0]!;
  const words = segment.audio.words;

  it('фикстура прочитана целиком', () => {
    expect(words.length).toBe(100);
    expect(segment.gates.length).toBe(2);
  });

  it('все метки фикстуры переводятся в секунды и лежат на дорожке', () => {
    // Слайды вместо кью: после перехода на схему v3 метками на дорожке
    // стали слайды и гейты, а кью не существует как понятия.
    const refs = [...segment.slides.map((slide) => slide.at), ...segment.gates.map((g) => g.at)];
    for (const ref of refs) {
      const seconds = markSeconds(ref, words);
      expect(Number.isFinite(seconds)).toBe(true);
      expect(seconds).toBeGreaterThanOrEqual(0);
      expect(seconds).toBeLessThanOrEqual(segment.audio.duration);
    }
  });

  it('гейт на слове «энергия» воспроизводится модулем ровно', () => {
    const gate = wordRef(segment.gates[1]!.at);
    const seconds = markSeconds(gate, words);
    expect(seconds).toBeCloseTo(44.188, 12);

    // 44.188 лежит в паузе 0.901 с перед словом «Энергия», в 0.2 от его
    // начала — внутри порога. Модуль строит ровно ту ссылку, что записана
    // в фикстуре автором, включая отрицательное смещение и якорь.
    const rebuilt = wordRef(timeRefAt(words, seconds));
    expect(rebuilt.wordIndex).toBe(gate.wordIndex);
    expect(rebuilt.offset).toBeCloseTo(gate.offset, 10);
    expect(rebuilt.anchor).toEqual(gate.anchor);
    expect(markSeconds(rebuilt, words)).toBeCloseTo(seconds, 12);
  });

  it('гейт на слове «главная» звучит внутри предыдущего слова — и это видно', () => {
    const gate = wordRef(segment.gates[0]!.at);
    const seconds = markSeconds(gate, words);
    expect(seconds).toBeCloseTo(14.387, 12);

    // Слово №31 «есть» занимает 14.25…14.537, то есть 14.387 попадает внутрь
    // него. Попадание сильнее притяжения, поэтому повторная привязка даёт
    // предыдущее слово, а не «главная». Секунда при этом та же — ссылка
    // указывает ровно туда, куда автор поставил метку.
    const rebuilt = wordRef(timeRefAt(words, seconds));
    expect(rebuilt.wordIndex).toBe(31);
    expect(rebuilt.anchor.text).toBe('есть');
    expect(markSeconds(rebuilt, words)).toBeCloseTo(seconds, 12);
  });

  it('межфразовая пауза остаётся секундами', () => {
    // 4.775…5.638 — пауза после «останавливается». Середина от обоих слов
    // дальше порога, и метка там честно не про слово.
    expect(chooseTarget(words, 5.2)).toEqual({ kind: 'seconds' });
    // А внутрифразовая щель 0.1 с (28.7…28.8) притягивается целиком.
    expectWordTarget(chooseTarget(words, 28.75), 60, -0.05);
  });

  it.each([
    0, 0.1, 0.75, 1.063, 5.2, 5.638, 14.387, 14.537, 20.3, 28.75, 43.7,
    44.188, 44.388, 47.325, 48.1, 48.5,
  ])('круговая привязка на настоящей секунде %s точна', (t) => {
    expect(markSeconds(timeRefAt(words, t), words)).toBeCloseTo(t, 12);
  });

  it('каждое начало слова привязывается к своему слову с нулевым смещением', () => {
    words.forEach((w: { start: number }, index: number) => {
      const ref = wordRef(timeRefAt(words, w.start));
      expect(ref.wordIndex).toBe(index);
      expect(ref.offset).toBe(0);
      expect(markSeconds(ref, words)).toBeCloseTo(w.start, 12);
    });
  });
});

describe('вырожденные входы падают громко', () => {
  const badSeconds = [-1, -0.001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it.each(badSeconds)('секунда %s недопустима', (t) => {
    expect(() => chooseTarget(WORDS, t)).toThrow(RangeError);
    expect(() => timeRefAt(WORDS, t)).toThrow(RangeError);
    expect(() => wordAt(WORDS, t)).toThrow(RangeError);
    expect(() => chooseTarget([], t)).toThrow(RangeError);
  });

  it('не число вместо секунды тоже падает, а не приводится к нулю', () => {
    for (const t of ['1.2', null, undefined, {}]) {
      expect(() => chooseTarget(WORDS, t as unknown as number)).toThrow(/конечным числом/);
    }
  });

  it.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY])('порог %s недопустим', (snap) => {
    expect(() => chooseTarget(WORDS, 1.2, snap)).toThrow(RangeError);
    expect(() => chooseTarget(WORDS, 1.2, snap)).toThrow(/Порог притяжения/);
    expect(() => timeRefAt(WORDS, 1.2, snap)).toThrow(RangeError);
  });

  const anchor = { text: 'ежик', before: 'мир', after: 'бежит' };

  it.each([1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('индекс слова %s недопустим', (i) => {
    const ref: TimeRef = { kind: 'word', wordIndex: i, offset: 0, anchor };
    expect(() => markSeconds(ref, WORDS)).toThrow(RangeError);
    expect(() => markSeconds(ref, WORDS)).toThrow(/целым неотрицательным/);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'смещение %s недопустимо',
    (offset) => {
      const ref: TimeRef = { kind: 'word', wordIndex: 2, offset, anchor };
      expect(() => markSeconds(ref, WORDS)).toThrow(/Смещение метки/);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('секундная ссылка на %s недопустима', (t) => {
    expect(() => markSeconds({ kind: 'seconds', t }, WORDS)).toThrow(RangeError);
  });

  it('битая ссылка падает сообщением core, а не подставляет ноль', () => {
    // Это не вырожденный вход, а состояние «нужна перепривязка», и оно
    // обязано доходить до вызывающего целиком.
    const missing: TimeRef = { kind: 'word', wordIndex: 99, offset: 0, anchor };
    expect(() => markSeconds(missing, WORDS)).toThrow(/отсутствует/);

    const onEmpty: TimeRef = { kind: 'word', wordIndex: 0, offset: 0, anchor };
    expect(() => markSeconds(onEmpty, [])).toThrow(/транскрипт пуст/);

    const moved: TimeRef = { kind: 'word', wordIndex: 0, offset: 0, anchor };
    expect(() => markSeconds(moved, WORDS)).toThrow(/перепривязка/i);
  });
});

/**
 * Остановка предпросмотра на гейте. До этого дорожка редактора проезжала
 * гейт молча: на линейке стоял квадратик, автор жал «играть», звук шёл
 * дальше — редактор показывал поведение, которого у зрителя не будет.
 * Найдено руками в браузере: 4.5 → 8.4 с через гейт на 6.0 с.
 */
describe('crossedStop: пересечение гейта за кадр', () => {
  it('гейт между прошлым и текущим кадром — останавливаемся на нём', () => {
    expect(crossedStop([6], 5.9, 6.05)).toBe(6);
  });

  it('гейт ещё впереди — не останавливаемся', () => {
    expect(crossedStop([6], 5.5, 5.9)).toBeUndefined();
  });

  it('гейт уже позади — не останавливаемся снова', () => {
    expect(crossedStop([6], 6.1, 6.4)).toBeUndefined();
  });

  it('стоим РОВНО на гейте и жмём «играть» — он не держит нас второй раз', () => {
    // Несущий случай: остановка ставит головку ровно в 6.0, и если бы условие
    // было `>=`, автор больше никогда не проехал бы этот гейт в редакторе.
    expect(crossedStop([6], 6, 6.3)).toBeUndefined();
  });

  it('за кадр перескочили два гейта — берём первый', () => {
    expect(crossedStop([6, 6.2], 5.9, 6.5)).toBe(6);
  });

  it('порядок списка не важен', () => {
    expect(crossedStop([9, 6, 7.5], 5.9, 8)).toBe(6);
  });

  it('гейтов нет — останавливаться не на чем', () => {
    expect(crossedStop([], 0, 30)).toBeUndefined();
  });

  it('головка не двигалась — пересечения нет', () => {
    expect(crossedStop([6], 6, 6)).toBeUndefined();
  });

  it('перемотка назад пересечением не считается', () => {
    expect(crossedStop([6], 20, 1)).toBeUndefined();
  });
});

/**
 * Фикстура §4 несёт метку-сироту, и её якорь `lost` собран СКРИПТОМ
 * (`scripts/build-speech-fixture.mjs`), у которого своя копия правила
 * нормализации: скрипт на .mjs, `normalizeWord` — на TypeScript, импортировать
 * несобранный модуль оттуда нечем.
 *
 * Копия правила — долг, и этот тест его сторожит. Разъедься две нормализации
 * (например, ядро перестанет схлопывать ё → е), якорь сироты в фикстуре
 * молча перестал бы находиться при следующей записи: `recoverLost` сравнивает
 * `normalizeWord(слово)` с `lost.text`, и несовпадение выглядело бы не ошибкой,
 * а «слово так и не произнесли».
 */
describe('якорь сироты в фикстуре собран по правилу ядра', () => {
  const speech = loadProject(
    JSON.parse(
      readFileSync(
        join(fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url)), 'speech.json'),
        'utf8',
      ),
    ),
  );
  const segment = speech.segments[0]!;
  const orphan = segment.slides
    .map((slide) => slide.at)
    .find((at): at is Extract<TimeRef, { kind: 'orphan' }> => at.kind === 'orphan');

  it('в фикстуре есть сирота — иначе новый вид схемы не покрыт эталоном', () => {
    expect(orphan, 'в speech.json нет метки-сироты').toBeDefined();
  });

  it('текст и соседи якоря совпадают с нормализацией ядра', () => {
    const spoken = splitIntoWords(segment.speech ?? '');
    const at = spoken.findIndex((w) => normalizeWord(w.text) === orphan!.lost.text);

    expect(at, 'потерянное слово обязано быть в тексте озвучки').toBeGreaterThanOrEqual(0);
    expect(orphan!.lost.before).toBe(normalizeWord(spoken[at - 1]?.text ?? ''));
    expect(orphan!.lost.after).toBe(normalizeWord(spoken[at + 1]?.text ?? ''));
  });

  it('потерянного слова действительно нет в расшифровке — иначе это не сирота', () => {
    const inTranscript = segment.audio.words
      .some((w) => normalizeWord(w.text) === orphan!.lost.text);
    expect(inTranscript, 'слово есть в расшифровке — метке нечего терять').toBe(false);
  });
});

describe('состояние якоря на языке product.md §4', () => {
  it('ссылка на слово — bound', () => {
    expect(anchorStateOf({
      kind: 'word', wordIndex: 1, offset: 0, anchor: { text: 'а', before: '', after: '' },
    })).toBe('bound');
  });

  it('секунды — pinned: место зафиксировано вручную, выравнивание его не трогает', () => {
    expect(anchorStateOf({ kind: 'seconds', t: 3 })).toBe('pinned');
  });

  it('потерянное слово — orphan', () => {
    expect(anchorStateOf({
      kind: 'orphan', wordIndex: 1, offset: 0, lost: { text: 'а', before: '', after: '' },
    })).toBe('orphan');
  });
});

describe('обход сирот кнопкой «к следующей»', () => {
  const mark = (id: string, seconds: number, anchor: 'bound' | 'pinned' | 'orphan') =>
    ({ kind: 'slide' as const, id, anchor, seconds });

  // Порядок в массиве НАМЕРЕННО не совпадает с порядком по секундам: автор
  // видит дорожку, и «следующая» для него та, что правее, а не та, что дальше
  // в списке слайдов.
  const marks = [
    mark('c', 9, 'orphan'),
    mark('a', 1, 'orphan'),
    mark('b', 5, 'bound'),
    mark('d', 3, 'orphan'),
  ];

  it('ничего не выбрано — первая сирота по дорожке, а не по списку', () => {
    expect(nextOrphan(marks, undefined)?.id).toBe('a');
  });

  it('выбрана сирота — следующая правее по дорожке', () => {
    expect(nextOrphan(marks, { kind: 'slide', id: 'a' })?.id).toBe('d');
    expect(nextOrphan(marks, { kind: 'slide', id: 'd' })?.id).toBe('c');
  });

  it('обход круговой: за последней идёт первая', () => {
    // Иначе кнопка на последней сироте умирает, и автор вручную вспоминает,
    // с какой метки начал обход.
    expect(nextOrphan(marks, { kind: 'slide', id: 'c' })?.id).toBe('a');
  });

  it('выбрана не сирота — обход начинается с начала', () => {
    expect(nextOrphan(marks, { kind: 'slide', id: 'b' })?.id).toBe('a');
  });

  it('одна сирота — кнопка возвращает её же, а не пустоту', () => {
    const single = [mark('only', 2, 'orphan'), mark('b', 5, 'pinned')];
    expect(nextOrphan(single, { kind: 'slide', id: 'only' })?.id).toBe('only');
  });

  it('сирот нет — ходить некуда', () => {
    expect(nextOrphan([mark('a', 1, 'bound'), mark('b', 2, 'pinned')], undefined)).toBeUndefined();
  });

  it('совпадение id при разном роде метки не считается: гейт и слайд — разные метки', () => {
    const mixed = [
      { kind: 'gate' as const, id: 'x', anchor: 'orphan' as const, seconds: 1 },
      { kind: 'slide' as const, id: 'x', anchor: 'orphan' as const, seconds: 4 },
    ];
    expect(nextOrphan(mixed, { kind: 'gate', id: 'x' })?.kind).toBe('slide');
  });
});
