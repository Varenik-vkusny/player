/**
 * Единственное место, где редактор касается библиотеки разбора pptx.
 *
 * Импорт ДИНАМИЧЕСКИЙ намеренно: у библиотеки 14 МБ `dist` и 633 экспорта
 * (ADR-031), и тянуть их в редактор, который презентацию так и не откроет,
 * незачем. Загрузка происходит в момент, когда автор уже выбрал файл.
 *
 * Переходник (`pptx.ts`) библиотеку не знает вовсе и проверяется без неё.
 */
import { projectFromPptx, type ImportResult, type PptxDeck } from './pptx.js';

/** Расширение, которое принимает импорт. Одно, и это не временно. */
export const PPTX_ACCEPT = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Имя файла без расширения — годится в заголовок проекта. */
function titleOf(fileName: string): string {
  const cut = fileName.lastIndexOf('.');
  const bare = cut > 0 ? fileName.slice(0, cut) : fileName;
  return bare.trim() || 'Импорт';
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
  return projectFromPptx(data as unknown as PptxDeck, { title: titleOf(file.name) });
}
