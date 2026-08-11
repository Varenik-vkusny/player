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
import { describeRetarget, type RetargetReport } from '../state/retarget.js';
import { transcribeAudio } from '../transcribe.js';

export interface AudioSourcePanelProps {
  readonly source: AudioSource;
  /**
   * Сколько меток (слайды + гейты) сейчас привязано к слову — считает
   * вызывающий (`state/audio.ts: wordMarkCount`) от ЖИВОГО сегмента,
   * поэтому число в подтверждении не может отстать от последней правки.
   */
  readonly wordMarkCount: number;
  /**
   * Автор выбрал «Заменить без расшифровки» — законный путь без слов:
   * прежнее поведение, метки переезжают в секунды (`state/project.ts:
   * replaceSegmentAudio`, `words` не передан).
   */
  readonly onReplace: (fileId: string, durationSeconds: number) => void;
  /**
   * Автор выбрал «Заменить и расшифровать» — расшифровка НОВОГО файла уже
   * получена (панель сама сходила за ней перед вызовом), и замена вместе
   * с переносом меток кладётся ОДНИМ действием: без этого между заменой
   * и расшифровкой был бы шаг, на котором старых слов для сопоставления
   * уже нет.
   */
  readonly onReplaceWithTranscript: (
    fileId: string,
    durationSeconds: number,
    words: readonly Word[],
  ) => void;
  /** Расшифровка вернула слова — кладёт их в audio.words. */
  readonly onWordsTranscribed: (words: readonly Word[]) => void;
  /**
   * Отчёт о последнем переносе меток (`EditorState.lastRetarget`) —
   * `undefined`, если последняя замена была без расшифровки или переносить
   * ещё не доводилось. Панель не хранит его сама: это состояние редактора,
   * а не локальный черновик формы.
   */
  readonly lastRetarget: RetargetReport | undefined;
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

/** Общие поля файла, ожидающего решения автора: заменить как — и с чем. */
interface PendingUpload {
  readonly fileId: string;
  readonly duration: number;
  readonly name: string;
}

type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'decoding' }
  | ({ readonly status: 'confirm' } & PendingUpload)
  // Автор нажал «Заменить и расшифровать»: панель сама зовёт расшифровку
  // нового файла, прежде чем что-либо менять в проекте, — кнопки подтверждения
  // остаются видны (заблокированные), чтобы не терять уже принятое решение.
  | ({ readonly status: 'confirm-transcribing' } & PendingUpload)
  // Расшифровка упала. Ошибка обязана остаться видимой и ГРОМКОЙ (CLAUDE.md;
  // product.md §4 запрещает тихий откат на «заменили без расшифровки») —
  // но автор не заперт: подтверждение никуда не делось, можно повторить
  // расшифровку или осознанно выбрать «без расшифровки».
  | ({ readonly status: 'confirm-error'; readonly message: string } & PendingUpload)
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
  onReplaceWithTranscript,
  onWordsTranscribed,
  lastRetarget,
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

  // «Заменить без расшифровки» — сегодняшний путь: доступен и из «confirm»,
  // и из «confirm-error» (расшифровка упала, но отказ от неё остаётся
  // законным выбором автора, не заглушкой, которую подставила бы панель сама).
  const handleReplaceWithoutTranscript = useCallback(() => {
    if (upload.status !== 'confirm' && upload.status !== 'confirm-error') return;
    onReplace(upload.fileId, upload.duration);
    setUpload({ status: 'idle' });
  }, [upload, onReplace]);

  // «Заменить и расшифровать» — расшифровка нового файла ходит здесь же,
  // ДО того, как что-либо уходит в dispatch: замена и перенос меток обязаны
  // остаться одним действием (см. комментарий `onReplaceWithTranscript`).
  // Ошибка расшифровки НЕ откатывается молча на «без расшифровки» — это
  // и есть фолбэк-заглушка, которую CLAUDE.md запрещает: она осталась бы
  // видимой (confirm-error), а замену автор выбирает сам следующим кликом.
  const handleReplaceAndTranscribe = useCallback(() => {
    if (upload.status !== 'confirm' && upload.status !== 'confirm-error') return;
    const { fileId, duration, name } = upload;
    setUpload({ status: 'confirm-transcribing', fileId, duration, name });
    transcribeAudio({ kind: 'file', fileId })
      .then((result) => {
        onReplaceWithTranscript(fileId, duration, result.words);
        setUpload({ status: 'idle' });
      })
      .catch((error: unknown) => {
        setUpload({
          status: 'confirm-error',
          fileId,
          duration,
          name,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }, [upload, onReplaceWithTranscript]);

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

  /**
   * Панель свёрнута ПО УМОЛЧАНИЮ (Сессия 34).
   *
   * Замер: в окне 1280x800 холсту доставалось 84 px из 800, а этой панели —
   * 135. Автор рисует сцену, а видит одну её десятую. Озвучку же он заводит
   * один раз на кусок, дальше панель просто занимает место.
   *
   * Состояние локальное и перезагрузку НЕ переживает — как у складывания
   * дорожки (`TrackView.tsx`, решение владельца 06.08.2026: чтение хранилища
   * может бросить, а глушить ошибку запрещено). Здесь это ничего не стоит
   * именно потому, что значение по умолчанию — «свёрнута»: после перезагрузки
   * состояние ровно то, что и было бы. Хранить нечего.
   */
  const [collapsed, setCollapsed] = useState(true);

  /**
   * СВЕРНУТЬ МОЖНО ТОЛЬКО ТИШИНУ.
   *
   * Панель несёт не одни удобства: в ней живут подтверждение замены озвучки
   * (`role="alertdialog"`), ошибка загрузки, ошибка расшифровки и отчёт
   * о переносе меток. Спрятать их значило бы сделать неотличимыми от
   * несуществующих — ровно тот способ провала, ради которого затеяна вся
   * сессия. Поэтому пока панели есть что сказать, она открыта принудительно,
   * а кнопка складывания ГАСНЕТ, оставаясь видимой.
   */
  const mustSpeak =
    upload.status !== 'idle' || transcribe.status === 'error' || Boolean(lastRetarget);
  const open = !collapsed || mustSpeak;

  return (
    <div className={open ? 'ed-audio-source' : 'ed-audio-source ed-audio-source--collapsed'}>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="ed-audio-input"
        onChange={handleFileChange}
        data-testid="audio-file-input"
      />
      <button
        type="button"
        className="ed-audio-source-toggle"
        data-testid="audio-source-toggle"
        aria-expanded={open}
        disabled={mustSpeak}
        title={
          mustSpeak
            ? 'Панели есть что сообщить — свернуть её сейчас нельзя'
            : open
              ? 'Свернуть озвучку'
              : 'Развернуть озвучку'
        }
        onClick={() => setCollapsed(open)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> Озвучка
      </button>
      <span className="ed-audio-current" data-testid="audio-current">{currentLabel}</span>
      {open ? (
        <>
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

      {upload.status === 'confirm' || upload.status === 'confirm-transcribing' || upload.status === 'confirm-error' ? (
        <span className="ed-audio-confirm" role="alertdialog" data-testid="audio-replace-confirm">
          <span className="ed-notice">
            «{upload.name}», {formatDuration(upload.duration)}. {replaceAudioConfirmMessage(wordMarkCount)}
          </span>
          <button
            type="button"
            className="ed-action"
            onClick={handleReplaceAndTranscribe}
            disabled={upload.status === 'confirm-transcribing'}
            data-testid="audio-replace-transcribe"
          >
            {upload.status === 'confirm-transcribing' ? 'Расшифровываю…' : 'Заменить озвучку и расшифровать'}
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={handleReplaceWithoutTranscript}
            disabled={upload.status === 'confirm-transcribing'}
            data-testid="audio-replace-without-transcript"
          >
            Заменить без расшифровки
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={handleCancel}
            disabled={upload.status === 'confirm-transcribing'}
            data-testid="audio-replace-confirm-no"
          >
            Отмена
          </button>
          {upload.status === 'confirm-error' ? (
            <span className="ed-failure" role="alert" data-testid="audio-replace-transcribe-error">
              Расшифровка не удалась, озвучка НЕ заменена: {upload.message}
            </span>
          ) : null}
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

      {upload.status === 'idle' && lastRetarget ? (
        <span className="ed-notice ed-audio-retarget-report" data-testid="audio-retarget-report">
          {describeRetarget(lastRetarget)}
        </span>
      ) : null}

      <SpeechField value={speech} onCommit={onSpeechChange} onBlurCommit={onCommitHistory} />
        </>
      ) : null}
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
        То, что вы произносите в этой части. Расшифровка — это то, что услышала машина;
        они могут расходиться.
      </p>
    </div>
  );
}
