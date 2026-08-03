/**
 * Хранилище работы автора между сеансами.
 *
 * Один слот: «то, над чем я сейчас работаю». Не список проектов — управление
 * работами это отдельная сущность, а здесь замыкается круг «сохранил вечером —
 * продолжил утром».
 *
 * Про React не знает и знать не должен — как и `save.ts`, и по той же причине.
 *
 * **Отдельная база, а не хранилище внутри `player-preview`.** Канал
 * предпросмотра — транспорт: он перезаписывается на каждом «Открыть в плеере»
 * под единственным ключом и живёт ровно до следующего показа. Работа автора
 * живёт до тех пор, пока он сам её не заменит. Смешать их значило бы, что
 * предпросмотр затирает сохранённое.
 *
 * Технически отдельная база нужна ещё и потому, что добавление хранилища
 * в существующую подняло бы её версию до 2, а читающая половина канала
 * в `apps/playground/src/main.ts` открывает `player-preview` с версией 1.
 * `indexedDB.open` с версией ниже текущей отказывает — предпросмотр сломался
 * бы у всех, у кого база уже создана, и остался бы рабочим на чистом профиле.
 * Дефект, не воспроизводящийся на свежем браузере, — худший вид дефекта.
 */
import { type Project } from '@player/core';
import { serializeProject } from './save.js';

const WORK_DB = 'player-workspace';
const WORK_DB_VERSION = 1;
const WORK_STORE = 'work';
/** Ключ единственного слота работы. */
export const WORK_KEY = 'current';

/**
 * Имя блокировки, которой вкладка объявляет слот своим.
 *
 * Совпадать с именем базы не обязано, но совпадает намеренно: две сущности
 * describe один и тот же слот, и разные имена пришлось бы держать в голове.
 */
export const WORK_LOCK = 'player-workspace';

/** Запись слота: текст проекта плюс то, что нужно автору для узнавания. */
export interface StoredWork {
  /** Проект как текст — тот же формат, что у файла на диске. */
  readonly text: string;
  /** Когда записан. Для надписи автору, не для разрешения конфликтов. */
  readonly savedAt: number;
  /** Откуда работа пришла: имя фикстуры или имя открытого файла. */
  readonly origin: string;
}

/**
 * Открывает (и при необходимости создаёт) базу слота.
 *
 * `indexedDB` может физически отсутствовать — например, в некоторых режимах
 * приватного просмотра. Тогда обращение бросает синхронно, и это обязано
 * долететь до вызывающего, а не превратиться в зависшее обещание.
 */
function openWorkDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен в этой вкладке'));
      return;
    }
    const request = indexedDB.open(WORK_DB, WORK_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WORK_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error('indexedDB.open не сообщил причину отказа'));
    };
  });
}

/**
 * Кладёт работу в слот.
 *
 * Через `serializeProject`, а не через `JSON.stringify` напрямую: та прогоняет
 * результат обратно через `loadProject`. Негодный проект обязан упасть здесь,
 * пока ошибку ещё можно связать с тем, что автор только что сделал. Найденная
 * при завтрашнем открытии, она будет выглядеть как испорченный файл без причины.
 *
 * Ждём `tx.oncomplete`, а не успех `put`: `put` сообщает, что запрос принят,
 * а не что он записан. Вкладку могут закрыть между этими двумя моментами.
 */
export async function saveWork(project: Project, origin: string): Promise<void> {
  const text = serializeProject(project);
  const record: StoredWork = { text, savedAt: Date.now(), origin };

  const db = await openWorkDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WORK_STORE, 'readwrite');
      tx.objectStore(WORK_STORE).put(record, WORK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('транзакция IndexedDB не сообщила причину'));
      tx.onabort = () => reject(tx.error ?? new Error('транзакция IndexedDB прервана'));
    });
  } finally {
    db.close();
  }
}

/** Читает слот. `undefined` — слот пуст, это штатный случай первого запуска. */
export async function readWork(): Promise<StoredWork | undefined> {
  const db = await openWorkDb();
  try {
    return await new Promise<StoredWork | undefined>((resolve, reject) => {
      const tx = db.transaction(WORK_STORE, 'readonly');
      const request = tx.objectStore(WORK_STORE).get(WORK_KEY);
      request.onsuccess = () => resolve(request.result as StoredWork | undefined);
      request.onerror = () =>
        reject(request.error ?? new Error('чтение IndexedDB не сообщило причину'));
    });
  } finally {
    db.close();
  }
}

/**
 * Очищает слот.
 *
 * Нужен не для порядка, а как выход из тупика: слот с испорченными данными
 * иначе запирал бы редактор навсегда — при каждом открытии одна и та же ошибка
 * и никакого способа начать заново.
 */
export async function clearWork(): Promise<void> {
  const db = await openWorkDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WORK_STORE, 'readwrite');
      tx.objectStore(WORK_STORE).delete(WORK_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('транзакция IndexedDB не сообщила причину'));
      tx.onabort = () => reject(tx.error ?? new Error('транзакция IndexedDB прервана'));
    });
  } finally {
    db.close();
  }
}

/**
 * Объявляет слот своим на всё время жизни вкладки.
 *
 * Возвращает `true`, если слот достался этой вкладке, и `false`, если его уже
 * держит другая. Вторая вкладка обязана открыться на чтение: тихо писать в тот
 * же слот значило бы затирать работу первой без единого признака, что что-то
 * исчезло, — а автор правит в первой вкладке час и узнаёт об этом завтра.
 *
 * Блокировка удерживается обещанием, которое не резолвится никогда: так Web
 * Locks и устроены — блокировка живёт, пока живёт обещание обработчика.
 * Освобождать её вручную не нужно и негде.
 *
 * **Измерено, а не предположено (S10, Chromium 151):** слот освобождается
 * за 2 мс и при закрытии вкладки, и при КРАХЕ рендерера. Это и был главный
 * риск решения: переживи блокировка смерть вкладки, один аварийно закрытый
 * браузер запер бы автора в режиме чтения навсегда, без способа это отменить.
 * → `docs/research/spikes.md`, S10
 */
export function claimWorkSlot(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    throw new Error('Web Locks недоступны в этой вкладке: слот работы нечем защитить');
  }
  return new Promise((resolve) => {
    void navigator.locks.request(WORK_LOCK, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      // Слот не достался — обработчик обязан завершиться сразу. В очередь
      // с `ifAvailable` запрос не встаёт (спецификация зовёт обработчик
      // с null и на этом заканчивает), но вечное обещание здесь оставило бы
      // висеть незавершённый запрос на всё время жизни вкладки.
      if (lock === null) return undefined;
      return new Promise<never>(() => {});
    });
  });
}
