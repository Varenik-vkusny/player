/**
 * Хранилище файлов, загруженных автором, и разрешение адреса озвучки.
 *
 * Почему это живёт в плеере, а не в редакторе. Читать файл обязан тот, кто
 * заводит звук, то есть плеер. Инвариант №6 задаёт направление
 * `editor → player → core` и запрещает плееру знать про редактор — значит
 * хранилище может стоять только здесь, а редактор импортирует его отсюда.
 * Ядру это место не подходит по другой причине: `core` не знает про DOM,
 * а IndexedDB — браузерное API.
 *
 * Почему отдельная база, а не соседнее хранилище рядом с предпросмотром.
 * Канал предпросмотра (`player-preview`) перезаписывается на каждом открытии
 * предпросмотра по одному ключу `current` — это переменная, а не архив.
 * Озвучка обязана пережить любое число предпросмотров, и делить с ними
 * жизненный цикл ей нельзя.
 *
 * Размер измерен, а не предположен: S8 дал 30 МБ в IndexedDB за 59 мс против
 * потолка `localStorage` в 5 242 869 символов. Аудио в проект не помещается
 * ни при каком раскладе, поэтому проект хранит ключ, а не байты.
 */

const DB_NAME = 'player-assets';
const DB_VERSION = 1;
const STORE = 'audio';

/** Что лежит в хранилище под одним ключом. */
export interface StoredAudio {
  /** Имя файла, как его назвал автор. Нужно, чтобы показать его в редакторе. */
  readonly name: string;
  /** MIME-тип из объекта File. Пустая строка, если браузер его не дал. */
  readonly type: string;
  readonly bytes: ArrayBuffer;
  /** Длительность в секундах, полученная ИЗ ДЕКОДЕРА при загрузке. */
  readonly durationSeconds: number;
  /** Когда добавлен, мс эпохи. */
  readonly addedAt: number;
}

/**
 * Откуда берётся звук сегмента.
 *
 * Размеченное объединение, а не строка с префиксом: разбор адреса не должен
 * расползаться по потребителям. Ровно один вариант — ровно одно поведение.
 */
export type AudioSource =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'file'; readonly fileId: string }
  /**
   * Немой сегмент (схема v13): звука нет, есть объявленная длительность.
   *
   * Длина едет ЗДЕСЬ, а не берётся отдельным доводом, и это не удобство:
   * `clockFor` получает ровно один аргумент, и часы обязаны строиться из него
   * целиком. У озвученного сегмента длину даёт декодированный буфер, у немого
   * взять её больше неоткуда — значит она обязана быть частью описания
   * источника, иначе появится второй путь передачи длительности.
   */
  | { readonly kind: 'silent'; readonly seconds: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => {
      reject(request.error ?? new Error(`Не удалось открыть базу ${DB_NAME}`));
    };
  });
}

/**
 * Ключ озвучки — SHA-256 её содержимого.
 *
 * Раньше ключом был случайный UUID, и один и тот же файл, загруженный дважды,
 * занимал место дважды: содержимое никто не сравнивал (ADR-021, «что осталось
 * открытым»). Хэш делает повторную загрузку бесплатной и, что важнее, делает
 * её ИДЕМПОТЕНТНОЙ — а это единственная защита от сирот, которая у нас есть.
 *
 * Сборки мусора нет СОЗНАТЕЛЬНО. Отмена в редакторе возвращает прежний
 * `fileId`, и байты обязаны её пережить; удаление «неиспользуемого» при
 * сохранении сломало бы отмену тише, чем её кто-нибудь заметил бы.
 *
 * Префикс `aud-` сохранён: по нему узнаются ключи этого хранилища, и уже
 * существующие проекты держат ссылки вида `aud-<uuid>` — они остаются
 * рабочими, потому что ключ здесь только выдаётся, но не разбирается.
 */
export async function audioIdFor(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `aud-${hex}`;
}

/**
 * Кладёт байты озвучки под ключом её содержимого и возвращает этот ключ.
 *
 * Ключ выдаётся здесь, а не приходит снаружи: тот, кто владеет хранилищем,
 * владеет и пространством имён в нём.
 */
export async function putAudio(
  audio: Omit<StoredAudio, 'addedAt'>,
): Promise<string> {
  const fileId = await audioIdFor(audio.bytes);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...audio, addedAt: Date.now() }, fileId);
      tx.oncomplete = () => { resolve(); };
      tx.onerror = () => {
        reject(tx.error ?? new Error('Не удалось сохранить озвучку'));
      };
      tx.onabort = () => {
        // Переполнение квоты приходит именно сюда. Молчать нельзя: автор
        // должен узнать, что его файл НЕ сохранён, а не обнаружить это
        // при следующем открытии проекта.
        reject(tx.error ?? new Error('Запись озвучки отменена браузером'));
      };
    });
  } finally {
    db.close();
  }
  return fileId;
}

/** Достаёт озвучку по ключу. `null`, если такой записи нет. */
export async function getAudio(fileId: string): Promise<StoredAudio | null> {
  const db = await openDb();
  try {
    return await new Promise<StoredAudio | null>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(fileId);
      request.onsuccess = () => {
        resolve((request.result as StoredAudio | undefined) ?? null);
      };
      request.onerror = () => {
        reject(request.error ?? new Error(`Не удалось прочитать озвучку ${fileId}`));
      };
    });
  } finally {
    db.close();
  }
}

/**
 * Превращает источник в адрес, по которому браузер может забрать звук.
 *
 * Это узкий слой, через который проходят ВСЕ обращения к озвучке — тот же
 * приём, что `segmentOf` для сегментов. Выше по коду про существование
 * IndexedDB не знает никто.
 *
 * Для загруженного файла возвращается объектный адрес, и его обязан отозвать
 * тот, кто заказал: удерживаемый `blob:`-адрес держит в памяти весь файл.
 * Отсюда пара с `releaseAudioUrl`, а не одинокая функция.
 */
export async function resolveAudioUrl(source: AudioSource): Promise<string> {
  if (source.kind === 'url') return source.url;
  if (source.kind === 'silent') {
    // Громко и здесь. У немого сегмента адреса нет и быть не может: часы для
    // него строятся отдельной веткой в `AudioClocks.clockFor`, и попадание
    // сюда означает, что ветку обошли. Вернуть пустую строку значило бы
    // получить сегмент, который молчит ПО ДРУГОЙ ПРИЧИНЕ, чем задумано,
    // и отличить одно от другого потом уже нечем.
    throw new Error(
      'У немого сегмента нет адреса озвучки. Часы для него строит clockFor, '
      + 'минуя разрешение адреса; сюда попали в обход этой ветки.',
    );
  }

  const stored = await getAudio(source.fileId);
  if (!stored) {
    // Громко и в месте возникновения. Тихий возврат пустого адреса дал бы
    // немую сцену, которая выглядит как обычный проект без звука.
    throw new Error(
      `Озвучка ${source.fileId} не найдена в хранилище этого браузера. `
      + 'Проект ссылается на файл, который был загружен в другом браузере '
      + 'или удалён вместе с данными сайта.',
    );
  }
  return URL.createObjectURL(new Blob([stored.bytes], { type: stored.type || 'audio/mpeg' }));
}

/** Отзывает адрес, выданный `resolveAudioUrl`. Для файла с сервера — ничего. */
export function releaseAudioUrl(source: AudioSource, url: string): void {
  if (source.kind === 'file') URL.revokeObjectURL(url);
}
