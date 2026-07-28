/**
 * Стенд редактора: открывает эталонную фикстуру и отдаёт её редактору.
 *
 * Валидация здесь обязательна ровно как в плеере. Редактор, открывший
 * битый проект «как получилось», молча испортит его при сохранении.
 */
import { loadProject } from '@player/core';
import { mountEditor } from '@player/editor';

const requested = new URLSearchParams(location.search).get('fixture') ?? 'demo';
// Имя ограничено, чтобы адресная строка не превращалась в способ читать файлы.
if (!/^[\w-]+$/.test(requested)) throw new Error(`Недопустимое имя фикстуры: ${requested}`);

const host = document.getElementById('editor-host');
if (!(host instanceof HTMLElement)) throw new Error('В разметке нет #editor-host');

const response = await fetch(`/fixtures/${requested}.json`);
if (!response.ok) {
  throw new Error(`Не удалось загрузить проект ${requested}: HTTP ${response.status}`);
}
const project = loadProject(await response.json());

// React рисует не синхронно, поэтому готовность объявляется не сразу после
// mountEditor, а когда сцена действительно построена. Иначе тест успел бы
// сделать снимок пустого контейнера и записать его в эталон.
//
// Ждём событие, а не опрашиваем через requestAnimationFrame: в фоновой
// вкладке rAF не срабатывает вовсе, и страница зависала бы навсегда,
// не показывая никакой ошибки. Проверено вручную в Chrome — на прогонах
// Playwright, где вкладка активна, этот дефект не проявлялся.
await new Promise<void>((resolve) => {
  mountEditor(host, project, {
    onReady: (preview) => {
      if (preview) resolve();
    },
  });
});

await document.fonts.ready;
document.documentElement.dataset['ready'] = '1';
