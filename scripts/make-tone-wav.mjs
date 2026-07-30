// Пишет короткую дорожку-тон для фикстур. Одноразовая оснастка: файл
// коммитится в репозиторий, а не генерируется на каждый прогон.
//
// Вынесено из scripts/build-branching-fixture.mjs, где та же функция уже
// живёт: третьей дорожке фикстуры нужен был ровно этот генератор, а копия
// кода означала бы, что рампа в начале и конце разъедется между двумя
// местами — и щелчок вернётся в ту фикстуру, которую забудут поправить.
//
// Запуск: node scripts/make-tone-wav.mjs <частота> <секунды> <путь>
// Пример:  node scripts/make-tone-wav.mjs 330 3 apps/playground/public/audio/ask.wav

import { writeFile } from 'node:fs/promises';

const SAMPLE_RATE = 44100;

/**
 * Моно WAV, 16 бит PCM, тихий синус.
 *
 * Амплитуда сведена к нулю линейной рампой на первых и последних 10 мс —
 * без неё обрыв синуса на границе файла даёт щелчок, и спайк стыка мерил бы
 * дефект фикстуры вместо дефекта перехода между сегментами.
 */
function makeToneWav(freqHz, seconds, sampleRate = SAMPLE_RATE, amplitude = 0.2) {
  const numSamples = Math.round(seconds * sampleRate);
  const fadeSamples = Math.round(0.01 * sampleRate); // 10 мс
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');

  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // размер fmt-чанка для PCM
  buffer.writeUInt16LE(1, 20); // формат 1 = PCM
  buffer.writeUInt16LE(1, 22); // моно
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // байт в секунду
  buffer.writeUInt16LE(bytesPerSample, 32); // выравнивание блока
  buffer.writeUInt16LE(16, 34); // бит на отсчёт

  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let gain = 1;
    if (i < fadeSamples) gain = i / fadeSamples;
    else if (i >= numSamples - fadeSamples) gain = (numSamples - 1 - i) / fadeSamples;
    const value = amplitude * gain * Math.sin(2 * Math.PI * freqHz * t);
    const sample = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
    buffer.writeInt16LE(sample, 44 + i * bytesPerSample);
  }

  return buffer;
}

const [freq, seconds, out] = process.argv.slice(2);
if (!freq || !seconds || !out) {
  throw new Error('Нужны три аргумента: <частота Гц> <секунды> <путь к файлу>');
}

const bytes = makeToneWav(Number(freq), Number(seconds));
await writeFile(new URL(out, new URL('../', import.meta.url)), bytes);
console.log(`${out}: ${bytes.length} байт, ${seconds} с, ${freq} Гц`);
