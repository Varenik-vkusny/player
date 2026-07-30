import { describe, expect, it } from 'vitest';

import type { ElementState, Segment } from '@player/core';

import {
  assertImageFile,
  createImageElement,
  fitWithin,
  outputMimeOf,
  type EncodedImage,
} from '../src/state/image.js';

const STAGE = { width: 1920, height: 1080 };

function segment(): Segment {
  return {
    id: 'seg-1',
    title: '',
    audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
    elements: [],
    slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
    gates: [],
    exit: { rules: [], default: null },
  };
}

function emptyStates(): Record<string, ElementState> {
  return {};
}

describe('fitWithin: подгонка размера картинки под сцену', () => {
  it('картинка меньше сцены по обеим сторонам — размер не меняется', () => {
    expect(fitWithin({ width: 400, height: 300 }, STAGE)).toEqual({ width: 400, height: 300 });
  });

  it('картинка ровно совпадает со сценой — размер не меняется', () => {
    expect(fitWithin({ width: 1920, height: 1080 }, STAGE)).toEqual({ width: 1920, height: 1080 });
  });

  it('картинка шире сцены — сжимается по ширине, высота пропорциональна', () => {
    // 3840×2160 — вдвое больше сцены по каждой стороне, аспект тот же.
    expect(fitWithin({ width: 3840, height: 2160 }, STAGE)).toEqual({ width: 1920, height: 1080 });
  });

  it('очень широкая панорама — ограничивает ширина, высота становится маленькой', () => {
    // 6000×500: по ширине пришлось бы делить на ~3.125, по высоте сцена
    // всё равно вместила бы без сжатия — узкое ограничение побеждает.
    const result = fitWithin({ width: 6000, height: 500 }, STAGE);
    expect(result.width).toBe(1920);
    expect(result.height).toBeCloseTo(160, 0);
  });

  it('очень высокий снимок — ограничивает высота', () => {
    const result = fitWithin({ width: 500, height: 6000 }, STAGE);
    expect(result.height).toBe(1080);
    expect(result.width).toBeCloseTo(90, 0);
  });

  it('никогда не увеличивает маленькую картинку', () => {
    expect(fitWithin({ width: 16, height: 16 }, STAGE)).toEqual({ width: 16, height: 16 });
  });

  it('пропорции сохраняются в пределах округления', () => {
    const original = { width: 4000, height: 2500 };
    const result = fitWithin(original, STAGE);
    const originalRatio = original.width / original.height;
    const resultRatio = result.width / result.height;
    expect(resultRatio).toBeCloseTo(originalRatio, 1);
  });

  it('результат никогда не даёт ноль даже при экстремальном сжатии', () => {
    const result = fitWithin({ width: 100000, height: 1 }, STAGE);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('бросает на неположительных размерах картинки', () => {
    expect(() => fitWithin({ width: 0, height: 100 }, STAGE)).toThrow();
    expect(() => fitWithin({ width: 100, height: -1 }, STAGE)).toThrow();
  });

  it('бросает на неположительных размерах сцены', () => {
    expect(() => fitWithin({ width: 100, height: 100 }, { width: 0, height: 1080 })).toThrow();
  });
});

describe('assertImageFile: файл обязан быть картинкой', () => {
  it('не бросает на image/png, image/jpeg, image/webp, image/svg+xml', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) {
      expect(() => assertImageFile({ type, name: 'a' })).not.toThrow();
    }
  });

  it('бросает громкую ошибку на файле не-картинке, с именем файла в сообщении', () => {
    expect(() => assertImageFile({ type: 'application/pdf', name: 'отчёт.pdf' })).toThrow(
      /отчёт\.pdf/,
    );
  });

  it('бросает на пустом типе — не молчит про неизвестный формат', () => {
    expect(() => assertImageFile({ type: '', name: 'файл' })).toThrow();
  });

  it('бросает на text/plain', () => {
    expect(() => assertImageFile({ type: 'text/plain', name: 'заметка.txt' })).toThrow();
  });
});

describe('outputMimeOf: выбор формата перекодирования', () => {
  it('png, gif, svg — сохраняются как png ради прозрачности', () => {
    expect(outputMimeOf('image/png')).toBe('image/png');
    expect(outputMimeOf('image/gif')).toBe('image/png');
    expect(outputMimeOf('image/svg+xml')).toBe('image/png');
  });

  it('jpeg, webp и прочие фотографические форматы — перекодируются в jpeg', () => {
    expect(outputMimeOf('image/jpeg')).toBe('image/jpeg');
    expect(outputMimeOf('image/webp')).toBe('image/jpeg');
    expect(outputMimeOf('image/heic')).toBe('image/jpeg');
  });
});

describe('createImageElement: элемент по пропорциям картинки', () => {
  const encoded: EncodedImage = { dataUri: 'data:image/png;base64,AAAA', width: 800, height: 600 };

  it('размер состояния равен размеру подготовленной картинки', () => {
    const { state } = createImageElement(segment(), emptyStates(), STAGE, encoded);
    expect(state.width).toBe(800);
    expect(state.height).toBe(600);
  });

  it('элемент центрирован на сцене по своему размеру', () => {
    const { state } = createImageElement(segment(), emptyStates(), STAGE, encoded);
    expect(state.x).toBeCloseTo(STAGE.width / 2 - 800 / 2, 6);
    expect(state.y).toBeCloseTo(STAGE.height / 2 - 600 / 2, 6);
  });

  it('content — это data-URI, а не путь к файлу', () => {
    const { element } = createImageElement(segment(), emptyStates(), STAGE, encoded);
    expect(element.content).toBe(encoded.dataUri);
  });

  it('тип элемента — image, идентификатор свободный', () => {
    const { element } = createImageElement(segment(), emptyStates(), STAGE, encoded);
    expect(element.type).toBe('image');
    expect(element.id).toBe('image-1');
  });

  it('второй элемент на непустом сегменте получает следующий свободный id и zIndex выше', () => {
    const first = createImageElement(segment(), emptyStates(), STAGE, encoded);
    const seg = { ...segment(), elements: [first.element] };
    const second = createImageElement(seg, { [first.element.id]: first.state }, STAGE, encoded);
    expect(second.element.id).not.toBe(first.element.id);
    expect(second.state.zIndex).toBeGreaterThan(first.state.zIndex);
  });
});
