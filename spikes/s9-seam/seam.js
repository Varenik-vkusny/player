// S9: стык двух дорожек графа сегментов — три сценария перехода между узлами.
//
// Сценарий A (расписание). Оба буфера декодированы заранее, второй источник
// планируется абсолютным контекстным временем через source.start(when), где
// when — конец первой дорожки. Меряется в OfflineAudioContext: он
// детерминирован и рендерит точные сэмплы, по которым можно искать скачок
// на стыке без шума живого воспроизведения.
//
// Сценарии B и C — живой AudioContext. Здесь мера — планирование по стенным
// часам (rAF, decodeAudioData — настоящие асинхронные операции с реальной
// задержкой), а её OfflineAudioContext не воспроизводит.
//
// B — стык по опросу в кадре: ровно то же условие, что сейчас в продукте
// (packages/player/src/player.ts:270): `position >= duration - 0.02` внутри
// requestAnimationFrame. Оба буфера уже декодированы (предзагрузка), меняется
// только МЕХАНИЗМ переключения — что получится, если писать переход «в лоб».
//
// C — то же самое, но decodeAudioData второй дорожки вызывается в момент
// обнаружения стыка, а не заранее: число обосновывает политику предзагрузки.
//
// Разрывы ищутся МЕТОДИКОЙ S3 (spikes/s1-timeline/index.html, функция runS3):
// сигнал пишется через AudioWorkletNode-«тap», подключённый к тому же сигналу,
// что идёт на выход; внутри непрерывных участков записи (соседние чанки
// непрерывны, только если между ними ровно один квант обработки) ищется скачок
// |x[n]-x[n-1]| выше порога max(typical*20, 0.05), где typical — медиана
// модуля разности по всей записи. Для оффлайн-рендера (A) участок один и
// детерминирован — склеивать по времени нечего, но порог тот же.
//
// AudioClock — тот же спайковый модуль, что и в S1/S2/S3 (spikes/lib/audio-clock.mjs,
// origin для packages/player/src/clock.ts): его start()/position используют
// leadTime=0.02 и rampMs=8 по умолчанию — те же числа, что в проде. Сценарий B
// намеренно построен на этом же примитиве: это ответ на вопрос «что получится,
// если стык написать простейшим способом поверх уже готовых часов».

import { AudioClock } from '../lib/audio-clock.mjs';

const BRANCH_SECONDS = 3.0;  // как узлы-концовки в fixtures/projects/branching.json
const LONG_SECONDS = 49.0;   // ориентир на длительность demo.mp3 (~48-49 с)
const SAMPLE_RATE = 44100;   // частота исходного WAV; контекст почти наверняка ресэмплит
const NEAR_END = 0.5;        // на сколько раньше конца дорожки стартуем, чтобы не ждать всю длину

/**
 * Пишет короткий моно WAV (16 бит PCM) с тихим синусоидальным тоном.
 *
 * Амплитуда сведена к нулю линейной рампой на первых и последних 10 мс —
 * без неё обрыв синуса на границе файла дал бы щелчок сам по себе, и спайк
 * измерил бы дефект тестовой дорожки, а не дефект стыка. Тот же приём и те же
 * числа, что в scripts/build-branching-fixture.mjs (makeToneWav), только без
 * Node Buffer — здесь это браузер, пишем прямо в ArrayBuffer.
 */
export function makeToneWav(freqHz, seconds, sampleRate = SAMPLE_RATE, amplitude = 0.2) {
  const numSamples = Math.round(seconds * sampleRate);
  const fadeSamples = Math.round(0.01 * sampleRate); // 10 мс
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);      // размер fmt-чанка для PCM
  view.setUint16(20, 1, true);       // формат 1 = PCM
  view.setUint16(22, 1, true);       // моно
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // байт в секунду
  view.setUint16(32, bytesPerSample, true); // выравнивание блока
  view.setUint16(34, 16, true);      // бит на отсчёт
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let gain = 1;
    if (i < fadeSamples) gain = i / fadeSamples;
    else if (i >= numSamples - fadeSamples) gain = (numSamples - 1 - i) / fadeSamples;
    const value = amplitude * gain * Math.sin(2 * Math.PI * freqHz * t);
    const sample = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    view.setInt16(44 + i * bytesPerSample, sample, true);
  }
  return buffer;
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Скачки сигнала в ОДНОМ детерминированном массиве — для офлайн-рендера (A). */
function clicksInSignal(signal) {
  const deltas = new Float32Array(signal.length - 1);
  for (let i = 1; i < signal.length; i++) deltas[i - 1] = Math.abs(signal[i] - signal[i - 1]);
  const sorted = Float32Array.from(deltas).sort();
  const typical = sorted[Math.floor(sorted.length * 0.5)] || 1e-9;
  const limit = Math.max(typical * 20, 0.05);
  let clicks = 0;
  for (let i = 0; i < deltas.length; i++) if (deltas[i] > limit) clicks++;
  return { clicks, typical, limit };
}

/**
 * Разбивает поток чанков живого ворклета на непрерывные участки и считает
 * скачки — буквально методика S3 (spikes/s1-timeline/index.html, runS3):
 * соседние чанки непрерывны, только если между ними ровно один квант обработки
 * (иначе на месте разрыва записи возникла бы ступенька, которой в реальном
 * звуке нет — сама запись стала бы источником ложных «щелчков»).
 */
function clicksInWorkletChunks(chunks, sampleRate) {
  const quantum = 128 / sampleRate;
  const runs = [];
  let current = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0 && chunks[i].time - chunks[i - 1].time > quantum * 1.5) {
      runs.push(current);
      current = [];
    }
    current.push(chunks[i].data);
  }
  if (current.length) runs.push(current);

  const allDeltas = [];
  let totalSamples = 0;
  for (const run of runs) {
    const size = run.reduce((n, c) => n + c.length, 0);
    const signal = new Float32Array(size);
    let offset = 0;
    for (const c of run) { signal.set(c, offset); offset += c.length; }
    totalSamples += size;
    for (let i = 1; i < size; i++) allDeltas.push(Math.abs(signal[i] - signal[i - 1]));
  }
  const sorted = [...allDeltas].sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length * 0.5)] || 1e-9;
  const limit = Math.max(typical * 20, 0.05);
  const clicks = allDeltas.reduce((n, d) => n + (d > limit ? 1 : 0), 0);
  return { clicks, typical, limit, runs: runs.length, totalSamples };
}

const WORKLET_SOURCE = `
  class Tap extends AudioWorkletProcessor {
    process(inputs) {
      const ch = inputs[0]?.[0];
      if (ch) this.port.postMessage({ data: ch.slice(0), time: currentTime });
      return true;
    }
  }
  registerProcessor('tap', Tap);
`;

async function addTap(ctx) {
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' })));
  const tap = new AudioWorkletNode(ctx, 'tap');
  const chunks = [];
  tap.port.onmessage = (e) => chunks.push(e.data);
  return { tap, chunks };
}

// ------------------------------------------------------------- Сценарий A
export async function runSeamA(log) {
  log('=== A: стык по расписанию (OfflineAudioContext) ===');

  // Реальная частота устройства: контекст создаём с ней же, чтобы увидеть
  // тот же ресэмплинг при decodeAudioData, что случился бы в проде (WAV
  // записан в 44100 Гц, устройство почти наверняка на 48000 Гц — проверено
  // живым прогоном, decodeAudioData ресэмплит без предупреждения).
  const probe = new AudioContext();
  const deviceSampleRate = probe.sampleRate;
  await probe.close();

  const bytesA = makeToneWav(220, BRANCH_SECONDS);
  const bytesB = makeToneWav(330, BRANCH_SECONDS);

  const length = Math.ceil((BRANCH_SECONDS * 2 + 0.2) * deviceSampleRate);
  const offline = new OfflineAudioContext(1, length, deviceSampleRate);

  const bufferA = await offline.decodeAudioData(bytesA);
  const bufferB = await offline.decodeAudioData(bytesB);

  log(`decodeAudioData ресэмплит: WAV ${SAMPLE_RATE} Гц / ${BRANCH_SECONDS.toFixed(3)} с ` +
    `-> буфер ${bufferA.sampleRate} Гц / ${bufferA.duration.toFixed(6)} с`);

  const srcA = offline.createBufferSource();
  srcA.buffer = bufferA;
  srcA.connect(offline.destination);
  srcA.start(0);

  const srcB = offline.createBufferSource();
  srcB.buffer = bufferB;
  srcB.connect(offline.destination);

  // Ключевой приём сценария: абсолютное контекстное время конца первой
  // дорожки — не относительный сдвиг и не опрос состояния каждый кадр.
  const when = bufferA.duration;
  srcB.start(when);

  const rendered = await offline.startRendering();
  const signal = rendered.getChannelData(0);
  const { clicks, typical, limit } = clicksInSignal(signal);

  // Задержка здесь не снята секундомером: OfflineAudioContext не течёт
  // в реальном времени, и `when` — это и есть момент, в который сработает
  // расписание (спецификация Web Audio гарантирует сэмпл-точность start(t)).
  // 0 мс — прямое следствие того, что мы сами назначили расписание концом
  // первой дорожки, а не отдельно измеренное число. Честно помечаем это.
  const delayMs = 0;

  const result = {
    рендеренныхСэмплов: signal.length,
    частотаКонтекста: deviceSampleRate,
    длительностьБуфераA: +bufferA.duration.toFixed(6),
    типичныйШагСигнала: +typical.toFixed(6),
    порогЩелчка: +limit.toFixed(6),
    разрывов: clicks,
    задержкаСтыкаМс: delayMs,
    задержкаПримечание: 'не измерена секундомером — равна 0 по построению расписания, см. комментарий в коде',
  };
  log(`A: разрывов ${clicks}, задержка ${delayMs} мс (по построению)`);
  return result;
}

// ------------------------------------------------------------- Сценарий B
export async function runSeamB(log, runs = 20) {
  log(`=== B: стык по опросу в кадре, ${runs} прогонов ===`);

  const ctx = new AudioContext();
  await ctx.resume();
  const { tap, chunks } = await addTap(ctx);

  const bytesA = makeToneWav(220, BRANCH_SECONDS);
  const bytesB = makeToneWav(330, BRANCH_SECONDS);
  const bufferA = await ctx.decodeAudioData(bytesA);
  const bufferB = await ctx.decodeAudioData(bytesB); // предзагружено заранее, вне цикла

  log(`буфер A: ${bufferA.duration.toFixed(6)} с при ${ctx.sampleRate} Гц`);

  const delays = [];

  for (let i = 0; i < runs; i++) {
    const clockA = new AudioClock(ctx, bufferA);
    clockA.connectTap(tap);
    const startAtA = clockA.start(bufferA.duration - NEAR_END);
    const idealSeam = startAtA + NEAR_END; // расчётный конец первой дорожки

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      const frame = () => {
        // Ровно то же условие, что в player.ts:270.
        if (clockA.position >= clockA.duration - 0.02) { resolve(); return; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    const clockB = new AudioClock(ctx, bufferB);
    clockB.connectTap(tap);
    const startAtB = clockB.start(0);
    delays.push((startAtB - idealSeam) * 1000);

    // eslint-disable-next-line no-await-in-loop
    await sleep(300); // запас, чтобы тap успел записать начало второй дорожки
    clockB.stop();
  }

  await sleep(100);
  const { clicks, typical, limit, runs: runCount, totalSamples } = clicksInWorkletChunks(chunks, ctx.sampleRate);
  await ctx.close();

  const result = {
    прогонов: runs,
    'задержка стыка, медиана, мс': +median(delays).toFixed(3),
    'задержка стыка, p95, мс': +q(delays, 0.95).toFixed(3),
    'задержка стыка, максимум, мс': +Math.max(...delays).toFixed(3),
    'непрерывных участков записи': runCount,
    'записано сэмплов': totalSamples,
    'типичный шаг сигнала': +typical.toFixed(6),
    'порог щелчка': +limit.toFixed(6),
    разрывов: clicks,
  };
  log(`B: задержка медиана ${result['задержка стыка, медиана, мс']} мс, ` +
    `максимум ${result['задержка стыка, максимум, мс']} мс, разрывов ${clicks}`);
  return result;
}

// ------------------------------------------------------------- Сценарий C
export async function runSeamC(log, runs = 20, decodeReps = 5) {
  log(`=== C: стык без предзагрузки, ${runs} прогонов ===`);

  const ctx = new AudioContext();
  await ctx.resume();
  const { tap, chunks } = await addTap(ctx);

  const bytesA = makeToneWav(220, BRANCH_SECONDS);
  const masterBytesB = makeToneWav(330, BRANCH_SECONDS);
  const bufferA = await ctx.decodeAudioData(bytesA);

  const delays = [];
  const decodeTimesMs = [];

  for (let i = 0; i < runs; i++) {
    const clockA = new AudioClock(ctx, bufferA);
    clockA.connectTap(tap);
    const startAtA = clockA.start(bufferA.duration - NEAR_END);
    const idealSeam = startAtA + NEAR_END;

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      const frame = () => {
        if (clockA.position >= clockA.duration - 0.02) { resolve(); return; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    // Именно то, чего нет в сценарии B: decodeAudioData происходит СЕЙЧАС,
    // а не заранее. .slice(0) — свежая копия: decodeAudioData отсоединяет
    // переданный ArrayBuffer, повторный прогон на той же дорожке иначе упал бы.
    const decodeStart = performance.now();
    // eslint-disable-next-line no-await-in-loop
    const bufferB = await ctx.decodeAudioData(masterBytesB.slice(0));
    decodeTimesMs.push(performance.now() - decodeStart);

    const clockB = new AudioClock(ctx, bufferB);
    clockB.connectTap(tap);
    const startAtB = clockB.start(0);
    delays.push((startAtB - idealSeam) * 1000);

    // eslint-disable-next-line no-await-in-loop
    await sleep(300);
    clockB.stop();
  }

  await sleep(100);
  const { clicks, typical, limit, runs: runCount, totalSamples } = clicksInWorkletChunks(chunks, ctx.sampleRate);

  // Отдельно (не часть живого стыка): decodeAudioData на короткой (3 с,
  // как узел-концовка) и длинной (~49 с, как n-start/demo.mp3) дорожке —
  // чистая цена декодирования как функция длины дорожки.
  const longBytesMaster = makeToneWav(440, LONG_SECONDS);
  const shortTimes = [];
  for (let i = 0; i < decodeReps; i++) {
    const t0 = performance.now();
    // eslint-disable-next-line no-await-in-loop
    await ctx.decodeAudioData(masterBytesB.slice(0));
    shortTimes.push(performance.now() - t0);
  }
  const longTimes = [];
  for (let i = 0; i < decodeReps; i++) {
    const t0 = performance.now();
    // eslint-disable-next-line no-await-in-loop
    await ctx.decodeAudioData(longBytesMaster.slice(0));
    longTimes.push(performance.now() - t0);
  }

  await ctx.close();

  const result = {
    прогонов: runs,
    'задержка стыка (включает decode), медиана, мс': +median(delays).toFixed(3),
    'задержка стыка (включает decode), p95, мс': +q(delays, 0.95).toFixed(3),
    'задержка стыка (включает decode), максимум, мс': +Math.max(...delays).toFixed(3),
    'decodeAudioData на стыке (3 с), медиана, мс': +median(decodeTimesMs).toFixed(3),
    'decodeAudioData на стыке (3 с), максимум, мс': +Math.max(...decodeTimesMs).toFixed(3),
    'непрерывных участков записи': runCount,
    'записано сэмплов': totalSamples,
    'типичный шаг сигнала': +typical.toFixed(6),
    'порог щелчка': +limit.toFixed(6),
    разрывов: clicks,
    'decodeAudioData, 3 с, медиана, мс': +median(shortTimes).toFixed(3),
    'decodeAudioData, 3 с, максимум, мс': +Math.max(...shortTimes).toFixed(3),
    [`decodeAudioData, ${LONG_SECONDS} с, медиана, мс`]: +median(longTimes).toFixed(3),
    [`decodeAudioData, ${LONG_SECONDS} с, максимум, мс`]: +Math.max(...longTimes).toFixed(3),
  };
  log(`C: задержка медиана ${result['задержка стыка (включает decode), медиана, мс']} мс, ` +
    `decode(3с) медиана ${result['decodeAudioData, 3 с, медиана, мс']} мс, ` +
    `decode(${LONG_SECONDS}с) медиана ${result[`decodeAudioData, ${LONG_SECONDS} с, медиана, мс`]} мс, ` +
    `разрывов ${clicks}`);
  return result;
}
