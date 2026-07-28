import { describe, expect, it } from 'vitest';

import { computePeaks, peakToBar } from '../src/track/peaks.js';
import type { Peak } from '../src/track/peaks.js';

/** Пила из `count` отсчётов, где значение равно индексу: `samples[i] === i`. */
function indexRamp(count: number): Float32Array {
  const samples = new Float32Array(count);
  // До 2^24 целое представимо во float32 точно, поэтому индекс переживает
  // запись и читается обратно ровно тем же числом.
  for (let i = 0; i < count; i += 1) samples[i] = i;
  return samples;
}

/** Синус ровно из целого числа периодов: `period` обязан делить `count` нацело. */
function tone(count: number, period: number): Float32Array {
  if (count % period !== 0) throw new RangeError('Период должен делить длину нацело');
  const cycle = new Float32Array(period);
  for (let i = 0; i < period; i += 1) cycle[i] = Math.sin((2 * Math.PI * i) / period);
  const samples = new Float32Array(count);
  // Тайлинг готовым периодом, а не Math.sin на каждый отсчёт: подготовка
  // фикстуры не должна занимать больше, чем то, что мы меряем.
  for (let offset = 0; offset < count; offset += period) samples.set(cycle, offset);
  return samples;
}

function globalMax(peaks: readonly Peak[]): number {
  return peaks.reduce((top, peak) => (peak.max > top ? peak.max : top), Number.NEGATIVE_INFINITY);
}

function globalMin(peaks: readonly Peak[]): number {
  return peaks.reduce((low, peak) => (peak.min < low ? peak.min : low), Number.POSITIVE_INFINITY);
}

describe('известный сигнал даёт известные пики', () => {
  it('чередование −1/+1: в каждом бакете обе крайности', () => {
    const samples = Float32Array.from([-1, 1, -1, 1, -1, 1, -1, 1]);
    expect(computePeaks(samples, 4)).toEqual([
      { min: -1, max: 1 },
      { min: -1, max: 1 },
      { min: -1, max: 1 },
      { min: -1, max: 1 },
    ]);
  });

  it('пила от −1 до +1 шагом 0.25: ответ посчитан руками', () => {
    // Все восемь значений представимы во float32 точно, поэтому сравнение
    // строгое, без toBeCloseTo.
    const samples = Float32Array.from([-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]);
    expect(computePeaks(samples, 4)).toEqual([
      { min: -1, max: -0.75 },
      { min: -0.5, max: -0.25 },
      { min: 0, max: 0.25 },
      { min: 0.5, max: 0.75 },
    ]);
  });

  it('внутри бакета порядок отсчётов на пик не влияет', () => {
    const samples = Float32Array.from([0.25, -0.5, 0.75, -1]);
    expect(computePeaks(samples, 1)).toEqual([{ min: -1, max: 0.75 }]);
  });

  it('один отсчёт на бакет: пик вырождается в сам отсчёт', () => {
    const samples = Float32Array.from([0.5, -0.25, 1]);
    expect(computePeaks(samples, 3)).toEqual([
      { min: 0.5, max: 0.5 },
      { min: -0.25, max: -0.25 },
      { min: 1, max: 1 },
    ]);
  });
});

describe('ни один отсчёт не потерян и не учтён дважды', () => {
  // Длины намеренно не кратны числу бакетов — кроме одной кратной для контроля,
  // что тест не проходит только на «неудобных» числах.
  const CASES = [
    [7, 3],
    [10, 4],
    [101, 10],
    [1000, 7],
    [48_001, 1200],
    [999_983, 1200],
    [48_000, 1200],
  ] as const;

  it.each(CASES)('длина %i на %i бакетов: сумма длин бакетов равна длине дорожки', (count, buckets) => {
    // На пиле `samples[i] === i` пик бакета — это его границы: min — первый
    // индекс, max — последний. Значит длина бакета восстанавливается как
    // max − min + 1, и её можно сложить, а не оценивать на глаз.
    const peaks = computePeaks(indexRamp(count), buckets);
    expect(peaks).toHaveLength(buckets);

    const covered = peaks.reduce((sum, peak) => sum + (peak.max - peak.min + 1), 0);
    expect(covered).toBe(count);
  });

  it.each(CASES)('длина %i на %i бакетов: бакеты идут встык, без дыр и нахлёстов', (count, buckets) => {
    const peaks = computePeaks(indexRamp(count), buckets);

    expect(peaks[0]!.min).toBe(0);
    expect(peaks[buckets - 1]!.max).toBe(count - 1);
    for (let i = 1; i < buckets; i += 1) {
      // Дыра дала бы разрыв больше единицы, нахлёст — меньше.
      expect(peaks[i]!.min).toBe(peaks[i - 1]!.max + 1);
    }
  });

  it('остаток размазан по ширине, а не свален в первые бакеты', () => {
    // 10 отсчётов на 4 бакета: длины обязаны чередоваться 2/3/2/3, а не 3/3/2/2.
    const lengths = computePeaks(indexRamp(10), 4).map((peak) => peak.max - peak.min + 1);
    expect(lengths).toEqual([2, 3, 2, 3]);
  });
});

describe('синус', () => {
  // Период 331 отсчётов взят намеренно «неудобным»: 331 не делится на 4,
  // поэтому вершина синуса приходится между отсчётами (индекс 82.75) и
  // максимум заведомо меньше единицы. На круглом периоде вроде 480 пик лёг бы
  // в отсчёт точно, и «близко к +1» превратилось бы в «ровно +1» — проверка
  // того, что мы умеем читать один заранее известный элемент.
  const COUNT = 331 * 144;
  const samples = tone(COUNT, 331);
  const BUCKET_COUNTS = [1, 7, 100, 960, 1200] as const;

  it.each(BUCKET_COUNTS)('на %i бакетах максимум близок к +1, минимум к −1', (buckets) => {
    const peaks = computePeaks(samples, buckets);
    expect(globalMax(peaks)).toBeCloseTo(1, 3);
    expect(globalMin(peaks)).toBeCloseTo(-1, 3);
  });

  it('крайности не зависят от числа бакетов: это одни и те же отсчёты', () => {
    const reference = computePeaks(samples, 1)[0]!;
    for (const buckets of BUCKET_COUNTS) {
      const peaks = computePeaks(samples, buckets);
      // Строгое равенство, а не близость: разбиение меняет группировку,
      // но глобальные крайности берутся из того же массива.
      expect(globalMax(peaks)).toBe(reference.max);
      expect(globalMin(peaks)).toBe(reference.min);
    }
  });

  it.each(BUCKET_COUNTS)('на %i бакетах ни один пик не вылезает за амплитуду сигнала', (buckets) => {
    for (const peak of computePeaks(samples, buckets)) {
      expect(peak.min).toBeLessThanOrEqual(peak.max);
      expect(peak.max).toBeLessThanOrEqual(1);
      expect(peak.min).toBeGreaterThanOrEqual(-1);
    }
  });
});

describe('вырожденный по содержанию, но валидный вход', () => {
  it('тишина даёт нули, а не NaN', () => {
    const peaks = computePeaks(new Float32Array(1000), 37);
    expect(peaks).toHaveLength(37);
    for (const peak of peaks) {
      expect(Number.isNaN(peak.min)).toBe(false);
      expect(Number.isNaN(peak.max)).toBe(false);
      expect(peak.min).toBe(0);
      expect(peak.max).toBe(0);
    }
  });

  it('один бакет на весь массив даёт глобальные минимум и максимум', () => {
    const samples = Float32Array.from([0.25, -0.75, 0.5, -0.125, 1, -0.5]);
    expect(computePeaks(samples, 1)).toEqual([{ min: -0.75, max: 1 }]);
  });

  it('один бакет на одном отсчёте', () => {
    expect(computePeaks(Float32Array.from([-0.5]), 1)).toEqual([{ min: -0.5, max: -0.5 }]);
  });

  it('сигнал без знакопеременности: пик не тянется к нулю искусственно', () => {
    // min и max берутся из отсчётов, а не «от нуля до максимума».
    const samples = Float32Array.from([0.5, 0.75, 0.5, 0.625]);
    expect(computePeaks(samples, 2)).toEqual([
      { min: 0.5, max: 0.75 },
      { min: 0.5, max: 0.625 },
    ]);
  });
});

describe('бакетов больше, чем отсчётов', () => {
  // Задокументированное поведение: длина результата всегда равна `buckets`,
  // лишние бакеты пустые и получают { min: 0, max: 0 }. Значения отсчётов
  // взяты положительными, чтобы пустой бакет нельзя было спутать с занятым.
  const samples = Float32Array.from([1, 2, 3]);

  it.each([4, 5, 3000])('на %i бакетах длина результата равна запрошенной', (buckets) => {
    expect(computePeaks(samples, buckets)).toHaveLength(buckets);
  });

  it.each([4, 5, 3000])('на %i бакетах занятых ровно столько, сколько отсчётов', (buckets) => {
    const peaks = computePeaks(samples, buckets);
    const filled = peaks.filter((peak) => peak.min !== 0 || peak.max !== 0);
    expect(filled).toEqual([
      { min: 1, max: 1 },
      { min: 2, max: 2 },
      { min: 3, max: 3 },
    ]);
    const empty = peaks.filter((peak) => peak.min === 0 && peak.max === 0);
    expect(empty).toHaveLength(buckets - samples.length);
  });

  it('пустые бакеты — ровно нули, а не NaN и не бесконечности', () => {
    for (const peak of computePeaks(samples, 3000)) {
      expect(Number.isFinite(peak.min)).toBe(true);
      expect(Number.isFinite(peak.max)).toBe(true);
    }
  });

  it('пустые бакеты не сдвигают порядок: занятые идут по возрастанию', () => {
    const maxima = computePeaks(indexRamp(9), 40)
      .filter((peak) => peak.max !== 0 || peak.min !== 0)
      .map((peak) => peak.max);
    // Нулевой отсчёт пилы неотличим от пустого бакета — это цена выбранного
    // соглашения, и она здесь видна честно: восемь из девяти.
    expect(maxima).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('вырожденные входы падают громко', () => {
  const samples = Float32Array.from([0.5, -0.5]);

  it.each([0, -1, -1200, 2.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'число бакетов %s недопустимо',
    (buckets) => {
      expect(() => computePeaks(samples, buckets)).toThrow(RangeError);
      expect(() => computePeaks(samples, buckets)).toThrow(/Число бакетов/);
    },
  );

  it('пустая дорожка не возвращает пустой массив молча', () => {
    expect(() => computePeaks(new Float32Array(0), 100)).toThrow(RangeError);
    expect(() => computePeaks(new Float32Array(0), 100)).toThrow(/Пустая дорожка/);
  });

  it('оба входа кривые сразу — падает на том, что проверяется первым', () => {
    expect(() => computePeaks(new Float32Array(0), 0)).toThrow(/Число бакетов/);
  });
});

describe('пик в координаты столбика', () => {
  it('полная амплитуда занимает всю полосу', () => {
    expect(peakToBar({ min: -1, max: 1 }, 100)).toEqual({ top: 0, height: 100 });
  });

  it('тишина — нулевая высота ровно по центру', () => {
    expect(peakToBar({ min: 0, max: 0 }, 100)).toEqual({ top: 50, height: 0 });
  });

  it('половина амплитуды — половина полосы вокруг центра', () => {
    expect(peakToBar({ min: -0.5, max: 0.5 }, 100)).toEqual({ top: 25, height: 50 });
  });

  it('ось Y растёт вниз: положительная часть выше отрицательной', () => {
    const positive = peakToBar({ min: 0, max: 1 }, 100);
    const negative = peakToBar({ min: -1, max: 0 }, 100);
    expect(positive).toEqual({ top: 0, height: 50 });
    expect(negative).toEqual({ top: 50, height: 50 });
  });

  it('перегрузка зажимается в полосу, а не рисуется мимо неё', () => {
    expect(peakToBar({ min: -1.7, max: 2.3 }, 100)).toEqual(peakToBar({ min: -1, max: 1 }, 100));
  });

  it('высота столбика не бывает отрицательной ни при каком пике', () => {
    const samples = tone(4800, 480);
    for (const peak of computePeaks(samples, 97)) {
      const bar = peakToBar(peak, 64);
      expect(bar.height).toBeGreaterThanOrEqual(0);
      expect(bar.top).toBeGreaterThanOrEqual(0);
      expect(bar.top + bar.height).toBeLessThanOrEqual(64);
    }
  });

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])('высота полосы %s недопустима', (height) => {
    expect(() => peakToBar({ min: -1, max: 1 }, height)).toThrow(RangeError);
    expect(() => peakToBar({ min: -1, max: 1 }, height)).toThrow(/Высота полосы/);
  });

  it('нечисловой пик падает, а не уезжает в NaN-геометрию', () => {
    expect(() => peakToBar({ min: Number.NaN, max: 1 }, 100)).toThrow(/конечных чисел/);
    expect(() => peakToBar({ min: -1, max: Number.POSITIVE_INFINITY }, 100)).toThrow(/конечных чисел/);
  });

  it('перепутанные местами поля падают: столбик ушёл бы вверх ногами', () => {
    expect(() => peakToBar({ min: 1, max: -1 }, 100)).toThrow(/больше максимума/);
  });
});

describe('производительность прохода', () => {
  /**
   * Порог мягкий и намеренно не подогнан под замер.
   *
   * В `docs/research/audio.md` §5 время прохода оценено в «десятки мс», и там
   * же честно помечено: «моя оценка, не замер». Здесь — замер, и оценка
   * подтвердилась: 26–44 мс за пять прогонов (Windows 11, Node 22, 2026-07-28).
   * Измеренное время печатается в лог, порог же ловит только смену порядка
   * величины: появившийся в цикле `subarray`, промежуточный массив на бакет
   * или `Math.min(...bucket)` дают секунды, а не миллисекунды.
   *
   * Жёсткий порог тут был бы вредительством: CLAUDE.md прямо предупреждает,
   * что на занятой машине расходится хвост замера, а этот тест ходит в общем
   * прогоне рядом с остальными. Красный тест из-за соседа по CPU научил бы
   * только одному — поднимать порог не глядя.
   */
  const THRESHOLD_MS = 1000;

  // 10 минут моно 48 кГц — предельная дорожка по docs/research/audio.md §4:
  // 28.8 млн отсчётов, ~110 МБ. 1200 бакетов — ширина таймлайна в пикселях.
  const TOTAL = 48_000 * 60 * 10;
  const BUCKETS = 1200;

  it(
    'проход по 28.8 млн отсчётов укладывается в бюджет',
    { timeout: 60_000 },
    () => {
      const samples = tone(TOTAL, 480);

      const started = performance.now();
      const peaks = computePeaks(samples, BUCKETS);
      const elapsed = performance.now() - started;

      // Замер обязан быть виден: число здесь — единственное подтверждение
      // оценки «десятки мс» из audio.md.
      console.log(
        `computePeaks: ${TOTAL} отсчётов → ${BUCKETS} бакетов за ${elapsed.toFixed(1)} мс`,
      );

      // Замер бессмыслен, если считалось не то: проверяем и результат.
      expect(peaks).toHaveLength(BUCKETS);
      expect(globalMax(peaks)).toBeCloseTo(1, 6);
      expect(globalMin(peaks)).toBeCloseTo(-1, 6);

      expect(elapsed).toBeLessThan(THRESHOLD_MS);
    },
  );
});
