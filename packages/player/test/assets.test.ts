/**
 * Ключ загруженной озвучки считается ИЗ СОДЕРЖИМОГО.
 *
 * До этого ключ был случайным UUID, и один и тот же файл, загруженный дважды,
 * занимал место дважды: содержимое никто не сравнивал (ADR-021, «что осталось
 * открытым»). Сборки мусора при этом нет и не будет — отмена восстанавливает
 * прежний `fileId`, и байты обязаны её пережить.
 */
import { describe, expect, it } from 'vitest';

import { audioIdFor, blobIdFor } from '../src/assets.js';

const bytesOf = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('audioIdFor', () => {
  it('одно и то же содержимое даёт один и тот же ключ', async () => {
    const first = await audioIdFor(bytesOf('одна и та же озвучка'));
    const second = await audioIdFor(bytesOf('одна и та же озвучка'));

    expect(first).toBe(second);
  });

  it('разное содержимое даёт разные ключи', async () => {
    const first = await audioIdFor(bytesOf('первая озвучка'));
    const second = await audioIdFor(bytesOf('вторая озвучка'));

    expect(first).not.toBe(second);
  });

  it('ключ сохраняет префикс aud- и длину хэша', async () => {
    const id = await audioIdFor(bytesOf('что угодно'));

    // Префикс остаётся, потому что по нему узнаются ключи этого хранилища,
    // а уже существующие проекты держат ссылки вида `aud-<uuid>`.
    expect(id).toMatch(/^aud-[0-9a-f]{64}$/);
  });

  it('ключ не зависит от того, кусок это большего буфера или свой', async () => {
    // File.arrayBuffer() отдаёт свой буфер, но байты могут прийти и срезом.
    // Ключ обязан считаться по содержимому, а не по подложке.
    const whole = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const slice = whole.slice(2, 5);
    const standalone = new Uint8Array([3, 4, 5]);

    expect(await audioIdFor(slice.buffer as ArrayBuffer)).toBe(
      await audioIdFor(standalone.buffer as ArrayBuffer),
    );
  });
});

describe('blobIdFor', () => {
  it('одинаковые байты дают ОДИН ключ: картинка не ляжет дважды', async () => {
    const a = new TextEncoder().encode('одна картинка').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('одна картинка').buffer as ArrayBuffer;
    expect(await blobIdFor(a)).toBe(await blobIdFor(b));
  });

  it('разное содержимое даёт разные ключи', async () => {
    const a = new TextEncoder().encode('первая').buffer as ArrayBuffer;
    const b = new TextEncoder().encode('вторая').buffer as ArrayBuffer;
    expect(await blobIdFor(a)).not.toBe(await blobIdFor(b));
  });

  it('ключ картинки и ключ озвучки на ОДНИХ байтах не совпадают', async () => {
    // Иначе одно содержимое, положенное как звук и как картинка, дало бы
    // один ключ на два разных хранилища — и путаницу, которую не видно.
    const bytes = new TextEncoder().encode('одно и то же').buffer as ArrayBuffer;
    expect(await blobIdFor(bytes)).not.toBe(await audioIdFor(bytes));
  });
});
