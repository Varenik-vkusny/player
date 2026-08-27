/**
 * Единственное место, где редактор касается библиотеки разбора pptx.
 *
 * Импорт ДИНАМИЧЕСКИЙ намеренно: у библиотеки 14 МБ `dist` и 633 экспорта
 * (ADR-031), и тянуть их в редактор, который презентацию так и не откроет,
 * незачем. Загрузка происходит в момент, когда автор уже выбрал файл.
 *
 * Переходник (`pptx.ts`) библиотеку не знает вовсе и проверяется без неё.
 * Байты картинок и шрифтов достаются ЗДЕСЬ (и только здесь) и кладутся
 * в хранилище плеера (`@player/player`, инвариант №6: `editor → player`),
 * а переходник получает уже готовые ключи доводом.
 */
import { putBlob } from '@player/player';

import { projectFromPptx, type ImportResult, type PptxDeck, type PptxElement } from './pptx.js';

/** Расширение, которое принимает импорт. Одно, и это не временно. */
export const PPTX_ACCEPT = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Имя файла без расширения — годится в заголовок проекта. */
function titleOf(fileName: string): string {
  const cut = fileName.lastIndexOf('.');
  const bare = cut > 0 ? fileName.slice(0, cut) : fileName;
  return bare.trim() || 'Импорт';
}

/**
 * MIME-тип картинки по расширению пути. Список из брифа задачи 3 —
 * ровно те форматы, что встречаются в материале Canva.
 */
function imageMimeOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot + 1).toLowerCase() : '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

/** Обходит дерево элементов (включая группы) и собирает уникальные пути картинок. */
function collectImagePaths(elements: readonly PptxElement[], into: Set<string>): void {
  for (const el of elements) {
    if ((el.type === 'picture' || el.type === 'image') && el.imagePath !== undefined) {
      into.add(el.imagePath);
    }
    if (el.children !== undefined) collectImagePaths(el.children, into);
  }
}

/**
 * Минимум, который нужен от `handler.load(...)` для добычи байтов —
 * свой интерфейс, отдельный от `PptxDeck` в `pptx.ts`: тот описывает то,
 * что ЧИТАЕТ переходник, этот — то, что ЧИТАЕТ мост. Совпадение полей
 * с настоящей библиотекой проверяется прогоном в `importPptx.test.ts`.
 */
interface PptxHandlerLike {
  getMediaArrayBuffer(path: string): Promise<ArrayBuffer | undefined>;
}

interface EmbeddedFontLike {
  readonly name: string;
  readonly rawFontData?: Uint8Array;
}

/** То, что мост читает у `data`, возвращённого `handler.load(...)`. */
interface LoadedDeck extends PptxDeck {
  readonly embeddedFonts?: readonly EmbeddedFontLike[];
}

/**
 * Достаёт байты картинок по путям, собранным из дерева, и кладёт их
 * в хранилище плеера. Возвращает карту «путь → ключ» — только для путей,
 * которые удалось достать и сохранить.
 *
 * Отказ по ОДНОМУ пути не должен ронять весь импорт (`Promise.all` упал бы
 * целиком на первой же ошибке) — поэтому каждый путь обрабатывается
 * независимо, а неудача просто не попадает в карту. Молчать при этом
 * нельзя: путь остаётся вне карты, и `pptx.ts` честно посчитает картинку
 * в `picturesWithoutBytes` — отказ виден автору числом, а не проглочен.
 */
async function collectImageAssets(
  handler: PptxHandlerLike,
  paths: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const assetIdByPath = new Map<string, string>();

  await Promise.all(
    [...paths].map(async (path) => {
      try {
        const bytes = await handler.getMediaArrayBuffer(path);
        if (bytes === undefined) return;
        const assetId = await putBlob('images', {
          name: path,
          type: imageMimeOf(path),
          bytes,
        });
        assetIdByPath.set(path, assetId);
      } catch {
        // Отказ по одному пути НЕ роняет импорт целиком — путь просто
        // не попадает в карту. `handler.getMediaArrayBuffer` бросает на
        // отсутствующей в zip записи, `putBlob` — на квоте хранилища;
        // оба случая для одной картинки не должны стоить всей презентации.
      }
    }),
  );

  return assetIdByPath;
}

/**
 * Кладёт вшитые шрифты в хранилище плеера и возвращает список
 * `{ family, assetId }` — тем же порядком, что `deck.embeddedFonts`.
 *
 * Байты берутся из `rawFontData` (уже `Uint8Array`), НЕ из `dataUrl`:
 * разбирать base64 обратно — лишняя работа и лишний способ ошибиться
 * (брифа задачи 3, шаг 5, пункт 3).
 */
async function collectFontAssets(
  fonts: readonly EmbeddedFontLike[],
): Promise<{ family: string; assetId: string }[]> {
  const result: { family: string; assetId: string }[] = [];

  for (const font of fonts) {
    if (font.rawFontData === undefined) continue;
    // Копия под `ArrayBuffer`, а не `.buffer` исходного `Uint8Array`:
    // `rawFontData` может быть видом в чужой более крупный буфер
    // (например, всего файла zip), и тогда `.buffer` унёс бы лишние байты.
    const bytes = font.rawFontData.slice().buffer;
    const assetId = await putBlob('fonts', {
      name: font.name,
      type: 'font/ttf',
      bytes,
    });
    result.push({ family: font.name, assetId });
  }

  return result;
}

/**
 * Читает файл презентации и собирает из него проект.
 *
 * Отказы не глушатся: неразобранный файл обязан сказать автору, что именно
 * не вышло. Пустой проект вместо ошибки выглядел бы как «презентация
 * оказалась пустой» — неверное объяснение, которое автор не сможет проверить.
 */
export async function importPptxFile(file: File): Promise<ImportResult> {
  const { PptxHandler } = await import('pptx-viewer-core');

  const bytes = await file.arrayBuffer();
  const handler = new PptxHandler();
  const data = await handler.load(bytes);

  // Приведение — ровно здесь и только здесь. Дальше живёт наш собственный
  // минимальный интерфейс, а совпадение имён полей проверяется прогоном
  // настоящей библиотеки в `importPptx.test.ts`.
  const deck = data as unknown as LoadedDeck;

  const imagePaths = new Set<string>();
  for (const slide of deck.slides) collectImagePaths(slide.elements, imagePaths);

  const assetIdByPath = await collectImageAssets(handler, imagePaths);
  const fonts = await collectFontAssets(deck.embeddedFonts ?? []);

  return projectFromPptx(deck, { title: titleOf(file.name), assetIdByPath, fonts });
}
