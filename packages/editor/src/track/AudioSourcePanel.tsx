/**
 * Своя озвучка сегмента: загрузка файла автора и расшифровка.
 *
 * Стоит рядом с TrackView (тот же модуль «дорожка») — то же место, где автор
 * уже ищет свойства звука: играть/пауза, часы, кнопка остановки. Компонент
 * держит асинхронный путь ФАЙЛА (чтение → декодирование → хранилище плеера)
 * и подтверждение замены, но саму правку проекта не делает — как и везде
 * в редакторе, её кладёт `Editor.tsx` через `dispatch`, получив готовые
 * `fileId`/`duration` или `words` через колбэки.
 *
 * Асинхронность и есть причина, по которой это отдельный компонент, а не
 * добавка в презентационный TrackView: декодирование, IndexedDB и сетевой
 * вызов расшифровки — не то, что TrackView обязан знать.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

import type { Word } from '@player/core';
import { getAudio, putAudio, type AudioSource } from '@player/player';

import { replaceAudioConfirmMessage } from '../state/audio.js';
import { transcribeAudio } from '../transcribe.js';

export interface AudioSourcePanelProps {
  readonly source: AudioSource;
  /**
   * Сколько меток (слайды + гейты) сейчас привязано к слову — считает
   * вызывающий (`state/audio.ts: wordMarkCount`) от ЖИВОГО сегмента,
   * поэтому число в подтверждении не может отстать от последней правки.
   */
  readonly wordMarkCount: number;
  /** Автор подтвердил замену — пишет новый источник в проект. */
  readonly onReplace: (fileId: string, durationSeconds: number) => void;
  /** Расшифровка вернула слова — кладёт их в audio.words. */
  readonly onWordsTranscribed: (words: readonly Word[]) => void;
  /** Текст озвучки текущего куска. `''` — поля `speech` в проекте нет. */
  readonly speech: string;
  /**
   * Живое событие уже идущего жеста набора текста — та же семантика
   * `commit: false`, что и у числовых полей `Inspector.tsx` (см. её
   * комментарий модуля): вызывается на КАЖДУЮ правку textarea, коммит-точку
   * ставит `onCommitHistory` на потере фокуса.
   */
  readonly onSpeechChange: (text: string) => void;
  /** Завершает жест, открытый `onSpeechChange` (потеря фокуса поля). */
  readonly onCommitHistory: () => void;
}

type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'decoding' }
  | { readonly status: 'confirm'; readonly fileId: string; readonly duration: number; readonly name: string }
  | { readonly status: 'error'; readonly message: string };

type TranscribeState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string };

/** Секунды с одним знаком после запятой — тот же формат, что и у часов дорожки. */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)} с`;
}

export function AudioSourcePanel({
  source,
  wordMarkCount,
  onReplace,
  onWordsTranscribed,
  speech,
  onSpeechChange,
  onCommitHistory,
}: AudioSourcePanelProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [transcribe, setTranscribe] = useState<TranscribeState>({ status: 'idle' });

  // Имя текущего файла — только у загруженного автором (у файла с сервера
  // имя незачем доставать, оно и так видно в src). Ключ в зависимостях,
  // а не сам `source`: он собирается заново на каждый рендер (segmentOf),
  // и объект в deps перечитывал бы хранилище на каждое движение мыши, — тот
  // же приём, что и `sourceKey` в `useTransport.ts`.
  const sourceKey = source.kind === 'file' ? `file:${source.fileId}` : `url:${source.url}`;
  const [loadedName, setLoadedName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (source.kind !== 'file') {
      setLoadedName(undefined);
      return;
    }
    let cancelled = false;
    getAudio(source.fileId)
      .then((stored) => { if (!cancelled) setLoadedName(stored?.name); })
      .catch(() => { if (!cancelled) setLoadedName(undefined); });
    return () => { cancelled = true; };
    // sourceKey, а не source — см. комментарий выше про ключ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const handlePick = useCallback(() => inputRef.current?.click(), []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сброс value: повторный выбор ТОГО ЖЕ файла обязан снова дать change —
    // иначе браузер не выстрелит событие второй раз подряд на одном имени.
    event.target.value = '';
    if (!file) return;

    setUpload({ status: 'decoding' });
    void (async () => {
      const original = await file.arrayBuffer();
      // decodeAudioData отсоединяет переданный ArrayBuffer (нейтрализует
      // его), поэтому для хранения нужна отдельная копия — иначе putAudio
      // получил бы уже опустошённый буфер.
      const forDecode = original.slice(0);
      const context = new AudioContext();
      try {
        // Длительность ИЗ ДЕКОДЕРА, не из File и не из поля схемы:
        // demo.mp3 на 0.36 с длиннее объявленного в фикстурах (CLAUDE.md).
        const buffer = await context.decodeAudioData(forDecode);
        const fileId = await putAudio({
          name: file.name,
          type: file.type,
          bytes: original,
          durationSeconds: buffer.duration,
        });
        setUpload({ status: 'confirm', fileId, duration: buffer.duration, name: file.name });
      } finally {
        void context.close();
      }
    })().catch((error: unknown) => {
      setUpload({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (upload.status !== 'confirm') return;
    onReplace(upload.fileId, upload.duration);
    setUpload({ status: 'idle' });
  }, [upload, onReplace]);

  // Отказ — не менять НИЧЕГО (CLAUDE.md): просто закрываем подтверждение,
  // dispatch не вызывается. Файл уже лежит в хранилище плеера (putAudio
  // выше), но на проект это не влияет — сирота в IndexedDB безопасна,
  // это тот же случай, что и любой отменённый жест.
  const handleCancel = useCallback(() => setUpload({ status: 'idle' }), []);

  const handleTranscribe = useCallback(() => {
    setTranscribe({ status: 'loading' });
    transcribeAudio(source)
      .then((result) => {
        onWordsTranscribed(result.words);
        setTranscribe({ status: 'idle' });
      })
      .catch((error: unknown) => {
        setTranscribe({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
  }, [source, onWordsTranscribed]);

  const currentLabel = source.kind === 'file'
    ? `файл автора: ${loadedName ?? source.fileId}`
    : `файл на сервере: ${source.url}`;

  return (
    <div className="ed-audio-source">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="ed-audio-input"
        onChange={handleFileChange}
        data-testid="audio-file-input"
      />
      <span className="ed-audio-current" data-testid="audio-current">{currentLabel}</span>
      <button
        type="button"
        className="ed-action"
        onClick={handlePick}
        disabled={upload.status === 'decoding'}
      >
        {upload.status === 'decoding' ? 'Загрузка…' : 'Загрузить озвучку'}
      </button>
      <button
        type="button"
        className="ed-action"
        onClick={handleTranscribe}
        disabled={transcribe.status === 'loading'}
        data-testid="transcribe-button"
      >
        {transcribe.status === 'loading' ? 'Расшифровываю…' : 'Расшифровать'}
      </button>

      {upload.status === 'confirm' ? (
        <span className="ed-audio-confirm" role="alertdialog" data-testid="audio-replace-confirm">
          <span className="ed-notice">
            «{upload.name}», {formatDuration(upload.duration)}. {replaceAudioConfirmMessage(wordMarkCount)}
          </span>
          <button
            type="button"
            className="ed-action"
            onClick={handleConfirm}
            data-testid="audio-replace-confirm-yes"
          >
            Заменить озвучку
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={handleCancel}
            data-testid="audio-replace-confirm-no"
          >
            Отмена
          </button>
        </span>
      ) : null}

      {upload.status === 'error' ? (
        <span className="ed-failure" role="alert" data-testid="audio-upload-error">
          Не удалось загрузить озвучку: {upload.message}
        </span>
      ) : null}

      {transcribe.status === 'error' ? (
        <span className="ed-failure" role="alert" data-testid="transcribe-error">
          {transcribe.message}
        </span>
      ) : null}

      <SpeechField value={speech} onCommit={onSpeechChange} onBlurCommit={onCommitHistory} />
    </div>
  );
}

interface SpeechFieldProps {
  value: string;
  onCommit: (text: string) => void;
  onBlurCommit: () => void;
}

/**
 * Текст озвучки куска — что автор произносит, а не что услышала машина
 * (это расшифровка, `audio.words`, отдельное поле рядом).
 *
 * Черновик — тот же приём, что и у `NumberField` (`panels/Inspector.tsx`,
 * см. её комментарий модуля): пока поле в фокусе, показывается ИМЕННО
 * набираемый текст, а не то, что уже лежит в проекте. Без черновика курсор
 * прыгал бы на каждую букву — редьюсер обрезает текст (`setSpeech` в
 * `state/project.ts`), а обрезанное значение, возвращённое в поле немедленно,
 * съедало бы хвостовой пробел ровно в момент, когда автор печатает следующее
 * слово через пробел.
 */
function SpeechField({ value, onCommit, onBlurCommit }: SpeechFieldProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;

  return (
    <div className="ed-insp-field ed-audio-speech">
      <label className="ed-insp-label" htmlFor={id}>
        Текст озвучки
      </label>
      <textarea
        id={id}
        className="ed-insp-area"
        data-testid="speech-input"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          onCommit(next);
        }}
        onBlur={() => {
          setDraft(null);
          onBlurCommit();
        }}
      />
      <p className="ed-insp-note">
        То, что вы произносите на этом куске. Расшифровка — это то, что услышала машина;
        они могут расходиться.
      </p>
    </div>
  );
}
