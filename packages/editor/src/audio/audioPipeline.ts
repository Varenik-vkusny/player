/**
 * @player/editor — Сервис подсистемы и пайплайна аудио (AudioPipelineService).
 *
 * Капсулирует асинхронные действия с файлами аудио:
 * - Защищённое копирование буфера для IndexedDB и WebAudio decodeAudioData
 * - Транскрибацию речи (ASR)
 * - Синхронизацию выравнивания меток времени
 */
import type { Word } from '@player/core';
import { putAudio } from '@player/player';

export interface AudioPrepareResult {
  readonly fileId: string;
  readonly duration: number;
  readonly audioBuffer: AudioBuffer;
}

export class AudioPipelineService {
  /**
   * Подготавливает и декодирует аудиофайл.
   * Выполняет обязательную копию ArrayBuffer.slice(0) до декодирования,
   * предотвращая нейтрализацию буфера для IndexedDB.
   */
  static async prepareAudioFile(
    file: File,
    audioCtx: AudioContext,
  ): Promise<AudioPrepareResult> {
    const rawBuffer = await file.arrayBuffer();
    // Буфер обязателен к клонированию до decodeAudioData (ADR-021 / ADR-023)
    const cloneForStorage = rawBuffer.slice(0);
    const audioBuffer = await audioCtx.decodeAudioData(rawBuffer);

    // Сохранение исходных байтов в IndexedDB
    const fileId = await putAudio({
      name: file.name,
      type: file.type,
      bytes: cloneForStorage,
      durationSeconds: audioBuffer.duration,
    });

    return {
      fileId,
      duration: audioBuffer.duration,
      audioBuffer,
    };
  }

  /**
   * Отправляет аудиофайл на расшифровку и возвращает список распознанных слов.
   */
  static async transcribeAudio(
    file: File,
    transcribeFn: (file: File) => Promise<readonly Word[]>,
  ): Promise<readonly Word[]> {
    return await transcribeFn(file);
  }
}
