/**
 * Подготовка картинки к вставке на сцену.
 *
 * Автор перетаскивает файл на холст. Круг «редактор → плеер» идёт через
 * localStorage (`state/save.ts`), у которого квота — единицы мегабайт на
 * origin (docs/superpowers/specs/2026-07-28-editor-authoring-design.md,
 * раздел «Риски»). Снимок экрана на несколько мегабайт эту квоту пробьёт,
 * поэтому картинка уменьшается до размеров сцены и перекодируется ДО того,
 * как попадёт в `content` элемента. Видимой разницы нет: больше сцены
 * картинку всё равно не покажут.
 *
 * Модуль разделён на чистую часть и браузерную. `fitWithin`, `assertImageFile`,
 * `outputMimeOf`, `createImageElement` не знают ни про DOM, ни про File —
 * проверены юнитами в node. `encodeImageFile` этой чистоты не имеет: ей нужны
 * `createImageBitmap` и `canvas`, а это только браузер — проверяется e2e-тестом
 * перетаскивания файла на сцену, не юнитом.
 */
import type { Element, Scene } from '@player/core';

import { createElement } from './elements.js';
import { libraryItem } from './library.js';

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface EncodedImage extends Size {
  readonly dataUri: string;
}

/**
 * Вписывает размер картинки в максимум, сохраняя пропорции и НИКОГДА
 * не увеличивая исходник.
 *
 * Маленькая картинка остаётся как есть: раздувать её до размеров сцены
 * незачем — на экране разницы не видно, а на диске будет.
 */
export function fitWithin(original: Size, max: Size): Size {
  if (!(original.width > 0 && original.height > 0)) {
    throw new RangeError(
      `Размеры картинки должны быть положительными, получено ${original.width}×${original.height}`,
    );
  }
  if (!(max.width > 0 && max.height > 0)) {
    throw new RangeError(`Размеры сцены должны быть положительными, получено ${max.width}×${max.height}`);
  }
  const scale = Math.min(1, max.width / original.width, max.height / original.height);
  return {
    // Math.max(1, …): ElementSchema требует width/height positive() — при
    // экстремальном сжатии округление не имеет права дать ноль.
    width: Math.max(1, Math.round(original.width * scale)),
    height: Math.max(1, Math.round(original.height * scale)),
  };
}

/**
 * Бросает громко, если файл — не картинка.
 *
 * Молча игнорировать нельзя (CLAUDE.md: «чини корень, не глуши ошибку»):
 * автор перетащил файл и вправе узнать, почему на сцене ничего не появилось.
 */
export function assertImageFile(file: { readonly type: string; readonly name: string }): void {
  if (!file.type.startsWith('image/')) {
    throw new Error(
      `Нельзя вставить файл «${file.name}»: это не картинка (тип «${file.type || 'не определён'}»)`,
    );
  }
}

/**
 * Форматы с прозрачностью перекодируются в PNG, остальные — в JPEG.
 *
 * Перекодирование, а не только уменьшение размера, даёт основной выигрыш:
 * скриншот 1920×1080 в PNG весит мегабайты, тот же кадр в JPEG — сотни
 * килобайт, хотя количество пикселей не изменилось вовсе.
 */
const ALPHA_TYPES = new Set(['image/png', 'image/gif', 'image/svg+xml']);
const JPEG_QUALITY = 0.85;

export function outputMimeOf(sourceType: string): string {
  return ALPHA_TYPES.has(sourceType) ? 'image/png' : 'image/jpeg';
}

/**
 * Кодирует файл в уменьшенный data-URI, вписанный в `stage`.
 *
 * Браузерная часть: `createImageBitmap` и `canvas` недоступны в node без
 * полифилла, поэтому здесь нет юнитов — только e2e перетаскивания файла.
 */
export async function encodeImageFile(file: File, stage: Size): Promise<EncodedImage> {
  assertImageFile(file);
  const bitmap = await createImageBitmap(file);
  try {
    const target = fitWithin({ width: bitmap.width, height: bitmap.height }, stage);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Нельзя подготовить картинку: 2D-контекст канвы недоступен');
    }
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const dataUri = canvas.toDataURL(outputMimeOf(file.type), JPEG_QUALITY);
    return { dataUri, width: target.width, height: target.height };
  } finally {
    bitmap.close();
  }
}

/**
 * Собирает новый элемент `image` из уже подготовленной картинки.
 *
 * Размер и положение берутся из `encoded`, а не из заготовки `image`
 * библиотеки (`state/library.ts`): пропорции элемента обязаны быть
 * пропорциями картинки
 * («Размеры созданного элемента — по пропорциям картинки, вписать в сцену»).
 * Остальное — id, zIndex, пустой style — даёт та же фабрика, что и для
 * кнопки «Картинка» на панели вставки, чтобы не заводить второй способ
 * присвоить идентификатор.
 */
export function createImageElement(scene: Scene, stage: Size, encoded: EncodedImage): Element {
  const base = createElement(libraryItem('image'), scene, stage);
  return {
    ...base,
    width: encoded.width,
    height: encoded.height,
    x: stage.width / 2 - encoded.width / 2,
    y: stage.height / 2 - encoded.height / 2,
    content: encoded.dataUri,
  };
}
