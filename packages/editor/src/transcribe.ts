/**
 * Клиент расшифровки речи (`POST /api/transcribe`) для редактора.
 *
 * Живёт в editor, а не в playground: editor — единственный, кто расшифровку
 * зовёт (кнопка «Расшифровать» у дорожки, `track/AudioSourcePanel.tsx`).
 * Обычный fetch — сетевой вызов, а не импорт, поэтому направление
 * зависимостей `editor → player → core` он не нарушает.
 *
 * Байты озвучки достаёт сам: для файла автора — через `getAudio` (хранилище
 * плеера), для файла с сервера — обычным fetch по `src`. Выше по коду про
 * разницу между источниками никто не знает — та же дисциплина, что
 * у `resolveAudioUrl` в `@player/player`.
 *
 * Тайминги от расшифровщика кладутся как есть. Измерено (S5): Deepgram даёт
 * медиану +30 мс против осциллограммы, и вычитание «систематических 85 мс»
 * сделало бы хуже, а не лучше — поправки здесь нет и не должно быть.
 */
import type { Word } from '@player/core';
import { getAudio, type AudioSource } from '@player/player';

export interface TranscribeResult {
  readonly words: readonly Word[];
  readonly transcript: string;
  readonly durationSeconds: number;
}

interface TranscribeErrorBody {
  readonly error?: string;
  readonly detail?: string;
}

interface TranscribeResponseBody {
  readonly words: ReadonlyArray<{
    readonly text: string;
    readonly start: number;
    readonly end: number;
    readonly confidence: number;
  }>;
  readonly transcript: string;
  readonly durationSeconds: number;
}

function parseErrorBody(raw: string): TranscribeErrorBody {
  try {
    return JSON.parse(raw) as TranscribeErrorBody;
  } catch {
    return { error: raw };
  }
}

/** Байты и MIME-тип текущей озвучки сегмента, независимо от того, откуда она. */
async function resolveBytes(source: AudioSource): Promise<{ bytes: ArrayBuffer; type: string }> {
  if (source.kind === 'file') {
    const stored = await getAudio(source.fileId);
    if (!stored) {
      // Тот же случай, что и в resolveAudioUrl: файл мог быть загружен
      // в другом браузере или удалён вместе с данными сайта. Молчание здесь
      // выглядело бы как зависшая загрузка, а не как объяснимая причина.
      throw new Error(
        `Озвучка не найдена в хранилище этого браузера (${source.fileId}) — расшифровывать нечего`,
      );
    }
    return { bytes: stored.bytes, type: stored.type || 'audio/mpeg' };
  }

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Не удалось скачать озвучку с сервера (${source.url}): код ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return { bytes, type: response.headers.get('content-type') ?? 'audio/mpeg' };
}

/**
 * Отправляет текущую озвучку сегмента на расшифровку.
 *
 * Ошибка (в том числе законный 503 без ключа API на сервере) бросается
 * с русским текстом причины — молча вернуть пустую расшифровку значило бы
 * соврать о том, что было сказано.
 */
export async function transcribeAudio(source: AudioSource, language = 'ru'): Promise<TranscribeResult> {
  const { bytes, type } = await resolveBytes(source);
  const url = `/api/transcribe?language=${encodeURIComponent(language)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': type },
    body: bytes,
  });

  if (!response.ok) {
    const { error, detail } = parseErrorBody(await response.text());
    const reason = error ?? response.statusText;
    throw new Error(
      detail ? `Расшифровка недоступна: ${reason} — ${detail}` : `Расшифровка недоступна: ${reason}`,
    );
  }

  const body = (await response.json()) as TranscribeResponseBody;
  const words: Word[] = body.words.map((word) => ({
    text: word.text,
    start: word.start,
    end: word.end,
    source: 'asr',
    confidence: word.confidence,
  }));

  return { words, transcript: body.transcript, durationSeconds: body.durationSeconds };
}
