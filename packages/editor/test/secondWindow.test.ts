import { describe, expect, it, vi } from 'vitest';

import {
  BRANCHES_CHANNEL,
  createBranchesClient,
  createBranchesHost,
  type BroadcastChannelLike,
  type ChannelFactory,
  type MainMessage,
  type WindowMessage,
} from '../src/state/secondWindow.js';

/**
 * Общая шина для теста: имитирует `BroadcastChannel` — доставляет сообщение
 * всем ПОДПИСЧИКАМ конкретного канала, КРОМЕ отправителя (у настоящего
 * `BroadcastChannel` это правило встроено в браузер; фальшивка обязана
 * соблюдать его сама, иначе тест докажет не поведение транспорта,
 * а поведение фальшивки — см. ловушку в задании).
 *
 * Новая шина на каждый вызов `createTestBus()`, чтобы тесты не делили
 * состояние через общее имя канала.
 */
function createTestBus(): ChannelFactory {
  const subscribers = new Map<string, Set<BroadcastChannelLike>>();
  return (name: string): BroadcastChannelLike => {
    const channel: BroadcastChannelLike = {
      onmessage: null,
      postMessage(data) {
        for (const peer of subscribers.get(name) ?? []) {
          if (peer === channel) continue; // не доставляем отправителю его же сообщение
          peer.onmessage?.({ data });
        }
      },
      close() {
        subscribers.get(name)?.delete(channel);
      },
    };
    let peers = subscribers.get(name);
    if (peers === undefined) {
      peers = new Set();
      subscribers.set(name, peers);
    }
    peers.add(channel);
    return channel;
  };
}

describe('secondWindow: транспорт второго окна', () => {
  // Что должно сломаться: убери ответ хоста на `hello` в createBranchesHost
  // (реализация СЛОМА №1 из задания) — тест краснеет, потому что onState
  // клиента не получает вызова вовсе.
  // Верно ли при любой реализации: да — это прямое требование задания
  // «получив hello, хост обязан отдать последнее опубликованное
  // состояние», а не свойство фальшивой шины.
  it('клиент при создании шлёт hello, и хост в ответ отдаёт УЖЕ опубликованное состояние', () => {
    const bus = createTestBus();
    const onGesture = vi.fn();
    const host = createBranchesHost(onGesture, bus);
    host.publish({ text: '{"segments":[]}', currentSegmentId: 's1' });

    // Состояние опубликовано ДО того, как клиент вообще появился — второе
    // окно, открытое позже правки, обязано получить его по своему hello,
    // а не ждать следующего publish.
    const onState = vi.fn();
    createBranchesClient(onState, bus);

    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({
      kind: 'state',
      text: '{"segments":[]}',
      currentSegmentId: 's1',
    } satisfies MainMessage);
  });

  // Что должно сломаться: host.publish() перестаёт слать сообщение в канал
  // (например, если publish только обновляет lastState, но не зовёт
  // channel.postMessage) — onState не получит вызов после hello.
  // Верно ли при любой реализации: да — «хост, опубликовав состояние,
  // доставляет его клиенту» не зависит от устройства фальшивой шины.
  it('хост, опубликовав состояние ПОСЛЕ hello, доставляет его клиенту', () => {
    const bus = createTestBus();
    const host = createBranchesHost(() => {}, bus);
    const onState = vi.fn();
    createBranchesClient(onState, bus); // шлёт hello; publish ещё не было — hello без ответа

    expect(onState).not.toHaveBeenCalled();

    host.publish({ text: '{"segments":["a"]}', currentSegmentId: 's2' });

    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({
      kind: 'state',
      text: '{"segments":["a"]}',
      currentSegmentId: 's2',
    } satisfies MainMessage);
  });

  // Что должно сломаться: клиент шлёт жест не тем полем/значением, либо
  // хост подменяет содержимое перед вызовом onGesture — assert на глубокое
  // равенство поймает и то, и другое.
  // Верно ли при любой реализации: да — «доходят НЕИЗМЕННЫМИ» это
  // требование к содержимому сообщения, а не к транспорту фальшивки.
  it('pick и rename из клиента доходят до onGesture хоста неизменными', () => {
    const bus = createTestBus();
    const onGesture = vi.fn();
    createBranchesHost(onGesture, bus);
    const client = createBranchesClient(() => {}, bus);

    onGesture.mockClear(); // сбросить вызов от собственного hello клиента

    client.pick('глава-2');
    client.rename('глава-2', 'Новое название');

    expect(onGesture).toHaveBeenCalledTimes(2);
    expect(onGesture).toHaveBeenNthCalledWith(1, {
      kind: 'pick',
      chapterId: 'глава-2',
    } satisfies WindowMessage);
    expect(onGesture).toHaveBeenNthCalledWith(2, {
      kind: 'rename',
      chapterId: 'глава-2',
      title: 'Новое название',
    } satisfies WindowMessage);
  });

  // Ловушка задания: наивная фальшивка, зовущая ВСЕ обработчики подряд
  // (включая отправителя), даёт хосту зациклиться на собственном `hello`
  // → `state` → снова видит своё же сообщение. Этот тест — единственный,
  // который отличает правильную шину от такой наивной.
  // Что должно сломаться: замени фальшивую шину на вариант БЕЗ пропуска
  // отправителя (СЛОМ №2 из задания) — оба вызова ниже перестанут быть
  // нулевыми.
  // Верно ли при любой реализации: да, при условии, что фальшивка сама
  // соблюдает правило «не отправителю» — это ровно то свойство, которое
  // тест и проверяет прямым счётчиком вызовов.
  it('хост не получает собственных publish, клиент не получает собственных pick', () => {
    const bus = createTestBus();
    const onGesture = vi.fn();
    const host = createBranchesHost(onGesture, bus);
    const onState = vi.fn();
    const client = createBranchesClient(onState, bus);

    onGesture.mockClear();
    onState.mockClear();

    host.publish({ text: '{}', currentSegmentId: 's1' });
    // publish дошёл клиенту (проверено в предыдущих тестах) — а onGesture
    // хоста, сидящего на ТОМ ЖЕ канале, не должен был получить его же
    // собственное сообщение.
    expect(onGesture).not.toHaveBeenCalled();

    onState.mockClear();
    client.pick('глава-1');
    // симметрично: onState клиента не получает его же исходящий pick.
    expect(onState).not.toHaveBeenCalled();
  });

  // Что должно сломаться: close() перестаёт звать channel.close() (только
  // шлёт 'closing', но канал остаётся подписанным) — сообщение после close
  // всё равно долетит, и оба ассерта ниже провалятся.
  // Верно ли при любой реализации: да — «после close() сообщения не
  // доставляются» проверяется прямым отсутствием вызова, не зависит от
  // деталей фальшивки, раз сама фальшивка честно убирает канал из подписки
  // по close() (что и является предметом проверки).
  it('close() с обеих сторон закрывает канал: после него сообщения не доставляются', () => {
    const bus = createTestBus();
    const onGesture = vi.fn();
    const host = createBranchesHost(onGesture, bus);
    const onState = vi.fn();
    const client = createBranchesClient(onState, bus);
    onGesture.mockClear();
    onState.mockClear();

    client.close();
    host.publish({ text: '{}', currentSegmentId: 's-closed-client' });
    expect(onState).not.toHaveBeenCalled(); // клиент закрылся — публикация до него не дойдёт

    // Пересобираем пару, чтобы проверить закрытие с другой стороны отдельно.
    const onGesture2 = vi.fn();
    const host2 = createBranchesHost(onGesture2, bus);
    const client2 = createBranchesClient(() => {}, bus);
    onGesture2.mockClear();

    host2.close();
    client2.pick('после-закрытия-хоста');
    expect(onGesture2).not.toHaveBeenCalled();
  });

  // Что должно сломаться: default-фабрика подставляет тихую заглушку вместо
  // BroadcastChannel при его отсутствии (СЛОМ №3 из задания, например
  // возврат канала-пустышки без реальной доставки) — вызов перестанет
  // бросать, и тест покраснеет на .toThrow().
  // Верно ли при любой реализации: да — «нет BroadcastChannel» это свойство
  // среды выполнения, проверяемое прямым удалением глобала, а не деталь
  // фальшивой шины (здесь фальшивка вообще не участвует — используется
  // default-фабрика).
  it('отсутствие BroadcastChannel даёт внятную ошибку, а не тихую заглушку', () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error — умышленно снимаем глобал, чтобы проверить ветку
    // «прибора нет», которую иначе в этой среде (где BroadcastChannel есть) не воспроизвести.
    delete globalThis.BroadcastChannel;
    try {
      expect(() => createBranchesHost(() => {})).toThrow(/BroadcastChannel/);
      expect(() => createBranchesClient(() => {})).toThrow(/BroadcastChannel/);
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  // Дополнительная проверка формы имени канала — не поведенческий тест,
  // а страховка от опечатки в константе, которую использует другой
  // исполнитель, дословно копируя её в свой код.
  it('имя канала — согласованная константа, а не строка, набранная в двух местах', () => {
    expect(BRANCHES_CHANNEL).toBe('player-branches');
  });
});
