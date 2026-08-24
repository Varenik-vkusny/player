/**
 * Транспорт второго окна — дерево веток на втором мониторе.
 *
 * Второе окно — только вид (`docs/design/tracks.md` §4, §6): оно ничего
 * не хранит, а получает состояние от главного окна и отправляет обратно
 * жесты автора. Та же дисциплина, по которой редактор берёт рендер
 * у плеера, а не пишет свой (инвариант №5) — здесь применена к паре окон
 * вместо пары пакетов.
 *
 * Про React не знает и знать не должен — как `workspace.ts` и `save.ts`,
 * и по той же причине: это правило продукта, а не свойство интерфейса.
 * Само окно и его разметку собирает другой слой, этот файл только
 * доставляет сообщения.
 */

/** Имя канала между главным окном и вторым. */
export const BRANCHES_CHANNEL = 'player-branches';

/**
 * Имя блокировки, которой второе окно объявляет себя живым.
 *
 * Совпадать с именем канала не обязано, но совпадает намеренно — как
 * в `workspace.ts` для пары «база/блокировка» одного слота: это разные
 * сущности одной и той же связи, и разные имена пришлось бы держать
 * в голове порознь.
 */
export const BRANCHES_LOCK = 'player-branches';

/**
 * Что главное окно шлёт второму.
 *
 * Состояние идёт ТЕКСТОМ проекта — тем же форматом, что `serializeProject`
 * кладёт в файл на диске. Второе окно не получает объект `Project`
 * напрямую: канал должен уметь пронести состояние через `postMessage`,
 * а текст уже проверен на разбор тем, кто его собрал.
 */
export type MainMessage =
  | { readonly kind: 'state'; readonly text: string; readonly currentSegmentId: string }
  | { readonly kind: 'closing' };

import type { ChapterBadge } from '@player/core';

/**
 * Что второе окно шлёт главному.
 *
 * Только ЖЕСТЫ, никогда состояние — второе окно не имеет права принести
 * в главное ничего, чего оно само не хранит.
 */
export type WindowMessage =
  | { readonly kind: 'hello' }
  | { readonly kind: 'pick'; readonly chapterId: string }
  | { readonly kind: 'rename'; readonly chapterId: string; readonly title: string }
  /**
   * Метка главы: цвет и знак на плитке (схема v16). Как и всё остальное,
   * второе окно только ПРОСИТ — правку делает главное.
   */
  | {
    readonly kind: 'badge';
    readonly chapterId: string;
    readonly badge: ChapterBadge | undefined;
  }
  /**
   * «Вынести в ветку». Правку делает ГЛАВНОЕ окно — второе только просит,
   * ровно как с `pick` и `rename`. Своих правок второе окно не применяет
   * и своего состояния не держит (`tracks.md` §6).
   */
  | { readonly kind: 'extract'; readonly chapterIds: readonly string[] };

/**
 * То, что транспорту нужно от канала связи. Подмножество `BroadcastChannel`
 * ровно в объёме, который здесь используется.
 */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/**
 * Фабрика канала — параметром, а не жёстко зашитым `new BroadcastChannel`,
 * чтобы связь между окнами проверялась тестом без живого браузера: тест
 * подставляет свою шину, устроенную так же, как настоящая (не доставляет
 * отправителю его же сообщения).
 */
export type ChannelFactory = (name: string) => BroadcastChannelLike;

/**
 * Открывает настоящий `BroadcastChannel`.
 *
 * `BroadcastChannel` может физически отсутствовать в среде — тогда это
 * обязано долететь до вызывающего явной ошибкой, а не тихой заглушкой:
 * молчащий транспорт выглядит как «второе окно просто не обновляется»,
 * и искать такое будут в раскладке, а не в связи.
 *
 * Не отдаём сам `BroadcastChannel` наружу как есть: его `onmessage` несёт
 * настоящий `MessageEvent`, а не `{ data }` из `BroadcastChannelLike`.
 * Оборачиваем сами, чтобы наружу уходило ровно то, что описано в типе.
 */
function defaultChannelFactory(name: string): BroadcastChannelLike {
  if (typeof BroadcastChannel === 'undefined') {
    throw new Error(
      'BroadcastChannel недоступен в этой вкладке: связь со вторым окном невозможна',
    );
  }
  const real = new BroadcastChannel(name);
  const wrapper: BroadcastChannelLike = {
    postMessage: (data) => real.postMessage(data),
    close: () => real.close(),
    onmessage: null,
  };
  real.onmessage = (event) => wrapper.onmessage?.({ data: event.data });
  return wrapper;
}

/** Сторона ГЛАВНОГО окна. */
export interface BranchesHost {
  /** Шлёт текущее состояние. Зовётся на каждое изменение проекта и на каждый `hello`. */
  publish(state: { text: string; currentSegmentId: string }): void;
  /** Закрывает канал и сообщает второму окну, что главное уходит. */
  close(): void;
}

/**
 * Сторона ГЛАВНОГО окна транспорта.
 *
 * Хост помнит ПОСЛЕДНЕЕ опубликованное состояние — и это единственное, что
 * он помнит. Второе окно не помнит ничего (§4, §6 `tracks.md`): открывшись
 * позже любого изменения проекта, оно обязано получить актуальную картину
 * по своему `hello`, а не ждать следующей правки автора.
 */
export function createBranchesHost(
  onGesture: (message: WindowMessage) => void,
  channelFactory: ChannelFactory = defaultChannelFactory,
): BranchesHost {
  const channel = channelFactory(BRANCHES_CHANNEL);
  let lastState: { text: string; currentSegmentId: string } | undefined;

  const send = (message: MainMessage): void => channel.postMessage(message);

  channel.onmessage = (event) => {
    const message = event.data as WindowMessage;
    if (message.kind === 'hello') {
      // Второе окно только что открылось и ничего не хранит — если состояние
      // уже публиковалось, оно обязано долететь немедленно, а не после
      // следующей правки автора.
      if (lastState !== undefined) {
        send({ kind: 'state', text: lastState.text, currentSegmentId: lastState.currentSegmentId });
      }
      return;
    }
    onGesture(message);
  };

  return {
    publish(state) {
      lastState = state;
      send({ kind: 'state', text: state.text, currentSegmentId: state.currentSegmentId });
    },
    close() {
      send({ kind: 'closing' });
      channel.close();
    },
  };
}

/** Сторона ВТОРОГО окна. */
export interface BranchesClient {
  pick(chapterId: string): void;
  rename(chapterId: string, title: string): void;
  badge(chapterId: string, badge: ChapterBadge | undefined): void;
  extract(chapterIds: readonly string[]): void;
  close(): void;
}

/**
 * Сторона ВТОРОГО окна транспорта.
 *
 * Шлёт `hello` уже при создании — второе окно, открытое позже любой правки
 * проекта, иначе простояло бы пустым до следующего изменения. Это главный
 * сценарий использования (открыл окно посреди работы), а не край.
 */
export function createBranchesClient(
  onState: (message: MainMessage) => void,
  channelFactory: ChannelFactory = defaultChannelFactory,
): BranchesClient {
  const channel = channelFactory(BRANCHES_CHANNEL);

  channel.onmessage = (event) => onState(event.data as MainMessage);

  const send = (message: WindowMessage): void => channel.postMessage(message);
  send({ kind: 'hello' });

  return {
    pick(chapterId) {
      send({ kind: 'pick', chapterId });
    },
    extract(chapterIds) {
      send({ kind: 'extract', chapterIds });
    },
    rename(chapterId, title) {
      send({ kind: 'rename', chapterId, title });
    },
    badge(chapterId, badge) {
      send({ kind: 'badge', chapterId, badge });
    },
    close() {
      channel.close();
    },
  };
}

/**
 * Держит блокировку, пока второе окно живо. Возвращает функцию отпускания.
 *
 * Зовётся во ВТОРОМ окне. **Измерено, а не предположено** (S10, тот же
 * замер, что у `claimWorkSlot` в `workspace.ts`): блокировка Web Locks
 * снимается за 2 мс и при обычном закрытии вкладки, и при КРАХЕ рендерера —
 * не только при аккуратном выходе. Худший случай «второе окно умерло
 * и заперло главное» этим замером закрыт: главное узнаёт о пропаже второго
 * окна за те же 2 мс, а не зависает в ожидании закрытия, которого не будет.
 * → `docs/research/spikes.md`, S10
 *
 * В отличие от `claimWorkSlot`, здесь обещание держателя резолвится не
 * никогда, а по вызову возвращённой функции — вызывающему есть куда
 * записать «второе окно закрылось», в отличие от вкладки, которая
 * закрывается вместе с процессом.
 */
export function holdSecondWindowLock(): () => void {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    throw new Error('Web Locks недоступны в этой вкладке: живость второго окна нечем подтвердить');
  }

  let resolveHold: (() => void) | undefined;
  let released = false;

  void navigator.locks.request(BRANCHES_LOCK, () => {
    return new Promise<void>((resolve) => {
      // Отпускание могло случиться раньше, чем браузер выдал блокировку —
      // тогда резолвим сразу, а не забываем про уже случившийся вызов.
      if (released) {
        resolve();
        return;
      }
      resolveHold = resolve;
    });
  });

  return () => {
    released = true;
    resolveHold?.();
  };
}

/**
 * Открыто ли сейчас второе окно. Спрашивает `navigator.locks.query()`.
 *
 * Зовётся в ГЛАВНОМ окне, чтобы кнопка могла сказать «второе окно уже
 * открыто». Если `navigator.locks` в среде нет — бросает, а не возвращает
 * `false`: «нет прибора» и «нет окна» — разные ответы, подмена одного
 * другим была бы тихим враньём (отрицательный результат требует контроля
 * над тем, что его вообще можно было получить).
 */
export async function isSecondWindowOpen(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    throw new Error('Web Locks недоступны в этой вкладке: спросить про второе окно нечем');
  }
  const snapshot = await navigator.locks.query();
  return (snapshot.held ?? []).some((lock) => lock.name === BRANCHES_LOCK);
}
