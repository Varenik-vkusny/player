import { describe, expect, it } from 'vitest';
import { retargetByAlignment } from '../src/state/retarget.js';

const word = (text: string, start: number) =>
  ({ text, start, end: start + 0.4, source: 'asr' as const });

describe('перенос меток по сопоставлению', () => {
  const before = [word('часы', 0), word('это', 1), word('позиция', 2)];

  it('слово уцелело — метка переезжает на новый индекс, смещение сохраняется', () => {
    const after = [word('и', 0), word('часы', 0.5), word('это', 1.5), word('позиция', 2.5)];
    const { refs, report } = retargetByAlignment(
      [{ kind: 'word', wordIndex: 2, offset: 0.1, anchor: { text: 'позиция', before: 'это', after: '' } }],
      before, after,
    );

    expect(refs[0]).toMatchObject({ kind: 'word', wordIndex: 3, offset: 0.1 });
    expect(report).toMatchObject({ moved: 1, check: 0, toSeconds: 0 });
  });

  it('слово в другой форме — метка переезжает и попадает в «проверьте»', () => {
    const after = [word('часы', 0), word('это', 1), word('позиции', 2)];
    const { refs, report } = retargetByAlignment(
      [{ kind: 'word', wordIndex: 2, offset: 0, anchor: { text: 'позиция', before: 'это', after: '' } }],
      before, after,
    );

    expect(refs[0]).toMatchObject({ kind: 'word', wordIndex: 2 });
    expect(report).toMatchObject({ moved: 0, check: 1, toSeconds: 0 });
  });

  it('слова больше нет — метка становится сиротой и помнит, что искала', () => {
    const after = [word('часы', 0), word('это', 1)];
    const { refs, report } = retargetByAlignment(
      [{ kind: 'word', wordIndex: 2, offset: 0.3, anchor: { text: 'позиция', before: 'это', after: '' } }],
      before, after,
    );

    // Не секунды: до Сессии 17 здесь стоял `toBe('seconds')`, и метка теряла
    // всякую память о происшествии. Сирота хранит и якорь, который искали,
    // и догадку — §4 [Р]: якорь не пропадает молча и не ставится наугад.
    expect(refs[0]).toEqual({
      kind: 'orphan',
      wordIndex: 1,
      // Смещение обнулено: 0.3 отсчитывались от начала ПРОПАВШЕГО слова,
      // и к слову «это» это число отношения не имеет.
      offset: 0,
      lost: { text: 'позиция', before: 'это', after: '' },
    });
    expect(report).toMatchObject({ moved: 0, check: 0, orphaned: 1, toSeconds: 0 });
  });

  it('при равном расстоянии догадка встаёт на ЛЕВОЕ слово, а не на правое', () => {
    // Пропало слово с индексом 2, уцелевшие соседи — 1 и 3, оба в одном шаге.
    const fourWords = [word('часы', 0), word('это', 1), word('позиция', 2), word('звука', 3)];
    const after = [word('часы', 0), word('это', 1), word('звука', 2)];

    const { refs } = retargetByAlignment(
      [{ kind: 'word', wordIndex: 2, offset: 0, anchor: { text: 'позиция', before: 'это', after: 'звука' } }],
      fourWords, after,
    );

    // Левое слово уже прозвучало — метка сработает чуть раньше срока.
    // Правое ещё не прозвучало, и метка опоздала бы: ранняя анимация читается
    // как предвосхищение, поздняя — как лаг.
    expect(refs[0]).toMatchObject({ kind: 'orphan', wordIndex: 1 });
  });

  it('ни одно слово не совпало — догадки нет, метка становится секундной', () => {
    const after = [word('совершенно', 0), word('другой', 1), word('текст', 2)];
    const { refs, report } = retargetByAlignment(
      [{ kind: 'word', wordIndex: 2, offset: 0, anchor: { text: 'позиция', before: 'это', after: '' } }],
      before, after,
    );

    // «Ближайшего найденного якоря» не существует: находок нет вовсе.
    // Поставить метку на первое попавшееся слово — это и есть «наугад».
    expect(refs[0]!.kind).toBe('seconds');
    expect(report).toMatchObject({ orphaned: 0, toSeconds: 1 });
  });

  it('сирота возвращается к своему слову, когда автор его переозвучил', () => {
    // Сирота стоит в догадке на «это», а искала «позиция». В новой записи
    // слово произнесено — метка обязана вернуться сама, иначе `lost` был бы
    // полем, которое только документирует, а не работает.
    const orphanBefore = [word('часы', 0), word('это', 1)];
    const after = [word('часы', 0), word('это', 1), word('позиция', 2)];

    const { refs, report } = retargetByAlignment(
      [{ kind: 'orphan', wordIndex: 1, offset: 0, lost: { text: 'позиция', before: 'это', after: '' } }],
      orphanBefore, after,
    );

    expect(refs[0]).toEqual({
      kind: 'word',
      wordIndex: 2,
      offset: 0,
      anchor: { text: 'позиция', before: 'это', after: '' },
    });
    expect(report).toMatchObject({ recovered: 1, orphaned: 0, moved: 0 });
  });

  it('сирота, чьё слово так и не появилось, остаётся сиротой с новой догадкой', () => {
    const orphanBefore = [word('часы', 0), word('это', 1)];
    const after = [word('и', 0), word('часы', 1), word('это', 2)];

    const { refs, report } = retargetByAlignment(
      [{ kind: 'orphan', wordIndex: 1, offset: 0, lost: { text: 'позиция', before: 'это', after: '' } }],
      orphanBefore, after,
    );

    // Догадка переехала вместе со сдвигом (1 → 2), потерянный якорь сохранён:
    // метка по-прежнему знает, что искать при следующей записи.
    expect(refs[0]).toEqual({
      kind: 'orphan',
      wordIndex: 2,
      offset: 0,
      lost: { text: 'позиция', before: 'это', after: '' },
    });
    expect(report).toMatchObject({ moved: 1, recovered: 0, orphaned: 0 });
  });

  it('секундные метки не трогаются вовсе', () => {
    const { refs, report } = retargetByAlignment(
      [{ kind: 'seconds', t: 1.25 }], before, [word('часы', 0)],
    );
    expect(refs[0]).toEqual({ kind: 'seconds', t: 1.25 });
    expect(report).toMatchObject({ moved: 0, check: 0, toSeconds: 0 });
  });

  it('метка на слово при пустой старой расшифровке падает громко, а не становится нулём', () => {
    // Состояние невалидно по схеме (schema.ts:536: «Ссылка на слово при
    // пустом транскрипте»), сюда попасть может только через порчу данных
    // в обход загрузки. Тихая подстановка нуля запрещена product.md §4:
    // объяснение выглядело бы рабочим и сломалось бы у зрителя.
    expect(() => retargetByAlignment(
      [{ kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'часы', before: '', after: '' } }],
      [], [word('часы', 0)],
    )).toThrow(/транскрипт пуст/);
  });
});
