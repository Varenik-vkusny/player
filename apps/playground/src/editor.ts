/**
 * Стенд редактора: решает, откуда взять проект, и отдаёт его редактору.
 *
 * Валидация здесь обязательна ровно как в плеере. Редактор, открывший
 * битый проект «как получилось», молча испортит его при сохранении.
 *
 * Порядок источников (Сессия 16):
 *
 * 1. `?fixture=X` задан явно — фикстура, как было всегда. Явная просьба
 *    сильнее сохранённого: иначе нельзя было бы открыть эталонный проект,
 *    не стерев свою работу, и каждый e2e-тест открывал бы чужое.
 * 2. Иначе — слот работы, если в нём что-то есть.
 * 3. Иначе — фикстура `demo`, как было всегда.
 */
import { loadProject, type Project } from '@player/core';
import { claimWorkSlot, clearWork, mountEditor, readWork } from '@player/editor';

/** Имя ограничено, чтобы адресная строка не превращалась в способ читать файлы. */
const FIXTURE_NAME = /^[\w-]+$/;

/**
 * Отказ, пришедший из слота работы, а не из фикстуры.
 *
 * Отличать обязательно: битый слот запирал бы редактор навсегда — при каждом
 * открытии одна и та же ошибка и ни одного способа начать заново. Битая
 * фикстура — это сломанный репозиторий, и предлагать автору «очистить»
 * в ответ на неё было бы враньём: чистить нечего.
 */
class WorkSlotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkSlotError';
  }
}

async function fixture(name: string): Promise<Project> {
  if (!FIXTURE_NAME.test(name)) throw new Error(`Недопустимое имя фикстуры: ${name}`);
  const response = await fetch(`/fixtures/${name}.json`);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить проект ${name}: HTTP ${response.status}`);
  }
  return loadProject(await response.json());
}

/** Что открыть и как это назвать в слоте при следующей записи. */
async function chooseProject(): Promise<{ project: Project; origin: string }> {
  const requested = new URLSearchParams(location.search).get('fixture');

  if (requested !== null) {
    return { project: await fixture(requested), origin: `фикстура ${requested}` };
  }

  const work = await readWork();
  if (work === undefined) {
    return { project: await fixture('demo'), origin: 'фикстура demo' };
  }

  // Тихо откатиться к демо здесь нельзя. Автор увидел бы чужой проект вместо
  // своего и решил бы, что работа пропала бесследно, — хотя она, скорее всего,
  // цела, а сломано что-то одно. Молчание тут не мягче ошибки, а хуже неё.
  try {
    return { project: loadProject(JSON.parse(work.text)), origin: work.origin };
  } catch (error: unknown) {
    throw new WorkSlotError(
      `Сохранённая работа («${work.origin}») не открывается: ${String(error)}`,
    );
  }
}

async function main(): Promise<void> {
  const host = document.getElementById('editor-host');
  if (!(host instanceof HTMLElement)) throw new Error('В разметке нет #editor-host');

  // Слот объявляется своим ДО того, как что-то показано: вторая вкладка
  // обязана узнать, что она вторая, раньше, чем автор начнёт в ней править.
  // Блокировка держится всё время жизни вкладки и снимается сама — измерено
  // в S10, в том числе при крахе рендерера.
  const canWrite = await claimWorkSlot();

  const { project, origin } = await chooseProject();

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
      canWrite,
      origin,
      onReady: (preview) => {
        if (preview) resolve();
      },
    });
  });

  await document.fonts.ready;
  document.documentElement.dataset['ready'] = '1';
}

void main().catch((error: unknown) => {
  // Громко и в том месте, где возникло. Никаких заглушек — но у редактора,
  // в отличие от плеера, до Сессии 16 не было и коробки: исключение уходило
  // в консоль, а автор видел чёрный прямоугольник и больше ничего.
  //
  // textContent, а не разметка: сообщения валидации цитируют строки из
  // проекта (идентификаторы, заголовки), а проект — внешние данные.
  // Поверх контейнера редактора, а не под ним. `#editor-host` объявлен
  // `position: fixed; inset: 0` и накрывает всё окно даже пустым — сообщение,
  // просто добавленное в body, оказалось бы ПОД ним. Оно было бы видно
  // глазами (контейнер прозрачен) и при этом неспособно принять нажатие:
  // кнопка выхода из тупика не нажималась бы вовсе. Поймано e2e-тестом,
  // который жмёт по видимой кнопке, а не зовёт обработчик.
  const sheet = document.createElement('div');
  sheet.style.cssText =
    'position:fixed;inset:0;z-index:1;overflow:auto;background:#07090c';

  const box = document.createElement('pre');
  box.style.cssText = 'color:#ff8a6b;padding:16px;white-space:pre-wrap;font:13px/1.5 monospace';
  box.textContent = String(error);
  box.dataset['testid'] = 'editor-load-error';
  sheet.append(box);
  document.body.prepend(sheet);

  // Выход из тупика — только для слота. Без него испорченная запись означала
  // бы, что редактор не открывается больше никогда, и починить это можно
  // было бы только инструментами разработчика, которых у автора нет.
  if (error instanceof WorkSlotError) {
    const reset = document.createElement('button');
    reset.textContent = 'Забыть сохранённую работу и открыть эталонный проект';
    reset.style.cssText = 'margin:0 16px 16px;padding:8px 12px;font-size:13px;cursor:pointer';
    reset.dataset['testid'] = 'forget-work';
    reset.onclick = () => {
      void clearWork().then(() => {
        location.href = location.pathname;
      });
    };
    sheet.append(reset);
  }

  // Метка готовности ставится и на отказе: иначе тест, ждущий её, повиснет
  // до таймаута и покажет «страница не загрузилась» вместо настоящей причины.
  document.documentElement.dataset['ready'] = '1';
  throw error;
});
