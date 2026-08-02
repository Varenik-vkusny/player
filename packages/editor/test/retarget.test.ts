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

  it('слова больше нет — метка становится секундной, наугад не ставится', () => {
    const after = [word('часы', 0), word('это', 1)];
    const { refs, report } = retargetByAlignment(
      [{ kind: 'word', wordIndex: 2, offset: 0, anchor: { text: 'позиция', before: 'это', after: '' } }],
      before, after,
    );

    expect(refs[0]!.kind).toBe('seconds');
    expect(report).toMatchObject({ moved: 0, check: 0, toSeconds: 1 });
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
