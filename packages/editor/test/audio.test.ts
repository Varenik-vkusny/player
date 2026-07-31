import { describe, expect, it } from 'vitest';

import { replaceAudioConfirmMessage, wordMarkCount, type MarkedSegment } from '../src/state/audio.js';

function segment(slideKinds: readonly ('word' | 'seconds')[], gateKinds: readonly ('word' | 'seconds')[]): MarkedSegment {
  return {
    slides: slideKinds.map((kind) => ({
      at: kind === 'word'
        ? { kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'x', before: '', after: '' } }
        : { kind: 'seconds', t: 0 },
    })),
    gates: gateKinds.map((kind) => ({
      at: kind === 'word'
        ? { kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'x', before: '', after: '' } }
        : { kind: 'seconds', t: 0 },
    })),
  };
}

describe('wordMarkCount', () => {
  it('считает слайды и гейты вместе', () => {
    expect(wordMarkCount(segment(['word', 'seconds', 'word'], ['word']))).toBe(3);
  });

  it('ноль, когда все метки уже на секундах', () => {
    expect(wordMarkCount(segment(['seconds', 'seconds'], ['seconds']))).toBe(0);
  });

  it('ноль, когда меток нет вовсе', () => {
    expect(wordMarkCount(segment([], []))).toBe(0);
  });
});

describe('replaceAudioConfirmMessage', () => {
  it('согласует число с русской формой множественного', () => {
    expect(replaceAudioConfirmMessage(1)).toMatch(/1 метка/);
    expect(replaceAudioConfirmMessage(3)).toMatch(/3 метки/);
    expect(replaceAudioConfirmMessage(11)).toMatch(/11 меток/);
  });

  it('ноль меток формулируется отдельно — нечего терять', () => {
    expect(replaceAudioConfirmMessage(0)).toMatch(/без потерь/);
  });

  it('объясняет, что момент на дорожке не сдвинется', () => {
    expect(replaceAudioConfirmMessage(2)).toMatch(/останется прежним/);
  });
});
