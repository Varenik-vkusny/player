/**
 * Склад наборов стилей: то, что делает стиль ШАБЛОНОМ, а не оформлением.
 *
 * Решение владельца 14.08.2026: автор собрал стили, сохранил набор и открыл
 * его в другом уроке. Пресет, живущий внутри одного проекта, шаблоном
 * не является (`design/styles.md` §4а).
 *
 * **Склад — источник, а не место хранения.** Стили КОПИРУЮТСЯ в проект
 * (ADR-029 §6), и проект остаётся самодостаточным. Причина — инвариант №9:
 * плеер собирается в самостоятельный бандл и открывается в голом HTML.
 * Проект, ссылающийся на склад, у зрителя не разрешился бы, и по замеру S14
 * это была бы не пропажа стиля, а ПОЧЕРНЕВШАЯ сцена без единой ошибки
 * в консоли.
 *
 * **Отдельная база, а не хранилище внутри существующих.** Ровно по тем же
 * двум причинам, что расписаны в `workspace.ts`: смысл жизни у данных разный,
 * а добавление хранилища в чужую базу подняло бы её версию и сломало бы
 * читающую половину у всех, у кого база уже создана. Дефект,
 * не воспроизводящийся на свежем браузере, — худший вид дефекта.
 */
import { StyleSchema } from '@player/core';
import type { Style } from '@player/core';

const SETS_DB = 'player-style-sets';
const SETS_DB_VERSION = 1;
const SETS_STORE = 'sets';

/**
 * Набор стилей на складе.
 *
 * Проверяется схемой при ЧТЕНИИ, а не только при записи. Данные лежат
 * в браузере автора и могли быть записаны прошлой версией продукта; набор,
 * взятый с испорченного склада, иначе попал бы в проект и уронил бы его
 * загрузку далеко от места, где ошибку можно связать с причиной.
 */
export interface StyleSet {
  readonly id: string;
  readonly name: string;
  /** Когда записан. Для порядка в списке и надписи автору. */
  readonly savedAt: number;
  readonly styles: readonly Style[];
}

/**
 * Разбирает запись склада.
 *
 * Отдельно от работы с базой намеренно: это единственная часть склада,
 * которую можно проверить без браузера, и она же единственная, где есть
 * что проверять.
 */
export function parseStyleSet(raw: unknown): StyleSet {
  const bad = (why: string): never => {
    throw new Error(`Набор стилей на складе испорчен: ${why}`);
  };

  if (typeof raw !== 'object' || raw === null) return bad('это не запись');
  const record = raw as Record<string, unknown>;

  const { id, name, savedAt, styles } = record;
  if (typeof id !== 'string' || id === '') return bad('нет идентификатора');
  if (typeof name !== 'string' || name === '') return bad('нет имени');
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return bad('нет времени записи');
  if (!Array.isArray(styles)) return bad('нет списка стилей');

  // Каждый стиль — той же схемой, что и в проекте. Своей проверки здесь
  // не заводится: два описания одного смысла разъезжаются молча, и склад
  // стал бы дырой в обход схемы проекта.
  const checked = styles.map((style, index) => {
    const parsed = StyleSchema.safeParse(style);
    if (!parsed.success) {
      return bad(`стиль №${index + 1}: ${parsed.error.issues[0]?.message ?? 'нет причины'}`);
    }
    return parsed.data;
  });

  return { id, name, savedAt, styles: checked };
}

/**
 * Имена, под которыми стили лягут в проект, если взять набор.
 *
 * Столкновение идентификаторов разрешается ПЕРЕИМЕНОВАНИЕМ пришедшего,
 * а не заменой своего: свои стили уже применены к элементам, и подмена
 * значений под ними изменила бы вид урока, которого автор не трогал.
 *
 * Возвращает стили, готовые к вставке, и карту переименований — она нужна
 * панели, чтобы сказать автору «два стиля пришли под новыми именами»,
 * а не сделать это молча.
 */
export function mergeStyleSet(
  own: readonly Style[],
  incoming: readonly Style[],
): { readonly styles: readonly Style[]; readonly renamed: ReadonlyMap<string, string> } {
  const taken = new Set(own.map((style) => style.id));
  const renamed = new Map<string, string>();
  const merged: Style[] = [];

  for (const style of incoming) {
    if (!taken.has(style.id)) {
      taken.add(style.id);
      merged.push(style);
      continue;
    }

    // Суффикс числом, а не случайной строкой: идентификатор попадает
    // в селектор CSS, и автор увидит его в панели рядом с именем.
    let n = 2;
    while (taken.has(`${style.id}-${n}`)) n += 1;
    const id = `${style.id}-${n}`;
    taken.add(id);
    renamed.set(style.id, id);
    merged.push({ ...style, id });
  }

  return { styles: merged, renamed };
}

function openSetsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен в этой вкладке'));
      return;
    }
    const request = indexedDB.open(SETS_DB, SETS_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SETS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error('indexedDB.open не сообщил причину отказа'));
    };
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SETS_STORE, mode);
    const request = run(transaction.objectStore(SETS_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Запрос к складу отказал без причины'));
  });
}

/** Кладёт набор на склад под своим идентификатором, заменяя одноимённый. */
export async function saveStyleSet(set: StyleSet): Promise<void> {
  const checked = parseStyleSet(set);
  const db = await openSetsDb();
  try {
    await tx(db, 'readwrite', (store) => store.put(checked, checked.id));
  } finally {
    db.close();
  }
}

/** Все наборы склада, свежие первыми. Испорченные записи падают громко. */
export async function listStyleSets(): Promise<readonly StyleSet[]> {
  const db = await openSetsDb();
  try {
    const raw = await tx<unknown[]>(db, 'readonly', (store) => store.getAll());
    return raw.map(parseStyleSet).sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

/** Убирает набор со склада. Проекты, куда его уже взяли, это не трогает. */
export async function deleteStyleSet(id: string): Promise<void> {
  const db = await openSetsDb();
  try {
    await tx(db, 'readwrite', (store) => store.delete(id));
  } finally {
    db.close();
  }
}
