/**
 * Страница-оснастка для скриншотных тестов: одна фикстура, один момент, ничего лишнего.
 *
 * Звук здесь не участвует намеренно. Картинка на секунде T — чистая функция
 * от сцены и времени, а дорожка нужна только чтобы это время шло. Побочная
 * выгода решает реальную проблему: у minimal.json, two-gates.json и
 * edge-cases.json аудиофайлов на диске нет, и через класс Player их
 * не открыть вообще.
 *
 * Никакого UI: ни кнопок, ни дорожки, ни оверлея гейта. Всё, что попадёт
 * в кадр, — это сцена.
 */
import { loadProject } from '@player/core';
import { ScenePreview, segmentOf } from '@player/player';

const params = new URLSearchParams(location.search);

const fixture = params.get('fixture') ?? 'demo';
// Имя ограничено, чтобы адресная строка не превращалась в способ читать файлы.
if (!/^[\w-]+$/.test(fixture)) throw new Error(`Недопустимое имя фикстуры: ${fixture}`);

const rawTime = params.get('t') ?? '0';
const time = Number(rawTime);
if (!Number.isFinite(time) || time < 0) throw new Error(`Недопустимый момент: ${rawTime}`);

// Подмена шрифтов только по требованию: см. пояснение в preview.html.
if (params.get('fonts') === 'test') {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/fonts/test-fonts.css';
  document.head.appendChild(link);
}

const host = document.getElementById('stage-host');
if (!(host instanceof HTMLElement)) throw new Error('В разметке нет #stage-host');

const stage = document.createElement('div');
host.appendChild(stage);

const response = await fetch(`/fixtures/${fixture}.json`);
if (!response.ok) {
  throw new Error(`Не удалось загрузить фикстуру ${fixture}: HTTP ${response.status}`);
}
// Валидация обязательна и здесь: битый проект не открывается нигде.
const project = loadProject(await response.json());

const preview = new ScenePreview(stage, segmentOf(project));
preview.seek(time);
preview.fit(host.clientWidth, host.clientHeight);

// Для тестов: доступ к предпросмотру без раскопок по DOM.
(window as unknown as { __preview: ScenePreview }).__preview = preview;

// Шрифты грузятся асинхронно, и снимок, сделанный до их подмены, поймает
// системный запасной шрифт. Это ровно та недетерминированность, ради которой
// свой шрифт и подключается (ADR-006), поэтому готовность объявляем после.
await document.fonts.ready;
document.documentElement.dataset['ready'] = '1';
