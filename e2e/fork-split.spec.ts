/**
 * Развилка в редакторе: переключатель типа остановки и разрез повествования.
 *
 * Автор не должен знать про `correctId`, `exit` и «правила выхода». Он видит
 * две остановки — вопрос и развилку — и одно действие: разделить рассказ.
 * Правила выхода появляются сами.
 *
 * Нажимается ВИДИМАЯ кнопка панели, а не зовётся действие редьюсера: разрез
 * исправен и при панели, которая его не показывает, а автору от исправного
 * разреза без кнопки толку нет. Ровно этот класс дефекта уже находили —
 * гейт, чью метку невозможно нажать (known-bugs §7).
 *
 * fixtures/projects/exit-branch.json: одна остановка-развилка на второй
 * секунде, слайд только на нуле — метка остановки ничем не перекрыта.
 */
import { expect, test, type Page } from '@playwright/test';

import { loadProject } from '@player/core';
import { openChapters } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Состав частей проекта прямо из состояния редактора. */
const segmentsOf = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as {
      __project: { segments: { id: string; audio: { offset: number; duration: number } }[] };
    }).__project.segments.map((segment) => ({
      id: segment.id,
      offset: segment.audio.offset,
      duration: segment.audio.duration,
    })));

async function selectFork(page: Page): Promise<void> {
  await page.getByTestId('mark-gate-g-ask').click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();
}

test.describe('панель остановки говорит про вопрос и развилку', () => {
  test('панель называется «Остановка», а не внутренним словом', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    await expect(page.getByTestId('mark-panel')).toContainText('Остановка');
    // «Гейт» — слово схемы. В интерфейсе его быть не должно (product.md §2).
    await expect(page.getByTestId('mark-panel')).not.toContainText('Гейт');
  });

  test('остановка без верного ответа показана как развилка', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    // exit-branch хранит correctId: null — это развилка, и панель обязана
    // показать именно её, а не «вопрос, у которого почему-то нет верного».
    await expect(page.getByTestId('stop-kind')).toBeVisible();
    await expect(page.getByTestId('fork-hint')).toBeVisible();
  });

  test('у развилки не предлагают выбрать правильный вариант', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    // Ровно та ложь, которую версия 4 убрала из данных: показывать её
    // на экране значило бы вернуть обратно.
    await expect(page.getByTestId('gate-option-correct-0')).toHaveCount(0);
  });

  test('переключение в «вопрос» возвращает выбор верного варианта', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    // По значению, а не по подписи: подпись — текст для человека, её правят
    // ради ясности, и тест не должен от этого краснеть.
    await page.getByLabel('Что это за остановка', { exact: true }).selectOption('question');

    await expect(page.getByTestId('gate-option-correct-0')).toBeVisible();
    await expect(page.getByTestId('fork-hint')).toHaveCount(0);
  });
});

test.describe('разрез повествования по развилке', () => {
  test('кнопка разреза делит часть: появляются ветки и продолжение', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    const before = await segmentsOf(page);
    expect(before.map((s) => s.id)).toEqual(['s-ask', 's-right', 's-left']);

    await page.getByTestId('gate-split').click();

    const after = await segmentsOf(page);
    // Исходная часть, две ветки, продолжение — и прежние две концовки.
    expect(after.length).toBe(before.length + 3);
  });

  /**
   * Решение [Р] (`product.md` §2б) существовало с Сессии 8, проверки не было.
   * Ветки рождаются пустыми ПО ПОСТРОЕНИЮ разреза — значит предупреждение
   * обязано появиться ровно в тот момент, когда автор нажал «разделить»,
   * а не когда-нибудь потом при попытке публикации.
   */
  test('после разреза автор видит, что новые ветки пусты', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    // «Пустые главы» живут в панели «Главы» — открываем её ДО выбора метки:
    // «Разрезать» стоит в панели «Метка», а панель — общий слот с «Главами»
    // (см. e2e/panels.ts), и обе двери подряд не открыть — вторая сгонит
    // первую. Выбор метки ниже сам переключит слот на «Метку».
    await openChapters(page);

    // До разреза пустых частей в этой фикстуре нет: у концовок есть элементы.
    await expect(page.getByTestId('empty-segments')).toContainText('Во всех главах что-то есть');

    // Метка живёт в виде «Дорожки» — «Главы» его подменили выше.
    await page.getByTestId('view-tracks').click();
    await selectFork(page);
    await page.getByTestId('gate-split').click();

    const created = await page.evaluate(
      () =>
        (window as unknown as {
          __project: {
            segments: { id: string; elements: unknown[]; slides: unknown[]; gates: unknown[] }[];
          };
        }).__project.segments
          .filter((s) => s.elements.length === 0 && s.slides.length === 1 && s.gates.length === 0)
          .map((s) => s.id),
    );
    expect(created.length, 'разрез создал пустые ветки').toBeGreaterThan(0);

    // Разрез открыл «Метку» — снова «Главы», тем же слотом.
    await openChapters(page);

    // Предупреждение видно, и названа причина, а не просто счётчик.
    await expect(page.getByTestId('empty-segments')).toContainText('здесь пока ничего нет');
    await expect(page.getByTestId('empty-segments')).toContainText('публиковать нельзя');
    // И каждая такая часть помечена прямо в списке частей.
    for (const id of created) {
      await expect(page.getByTestId(`segment-empty-${id}`)).toBeVisible();
    }
  });

  test('продолжение звучит со своего окна того же файла', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);
    await page.getByTestId('gate-split').click();

    const after = await segmentsOf(page);
    const head = after.find((segment) => segment.id === 's-ask')!;
    // Развилка стоит на второй секунде: голова кончается там, продолжение
    // с неё начинается. Файл при этом не режется — меняются только окна.
    expect(head.duration).toBeCloseTo(2, 3);
    const tail = after.find((segment) => segment.offset > 0);
    expect(tail, 'у продолжения ненулевое смещение окна').toBeTruthy();
    expect(tail!.offset).toBeCloseTo(2, 3);
  });

  test('разрезанный проект остаётся валидным и сохраняется', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openEditor(page, 'exit-branch');
    await selectFork(page);
    await page.getByTestId('gate-split').click();

    // Проект прогоняется через НАСТОЯЩУЮ загрузку, а не через флаг на window:
    // «спросить страницу, всё ли хорошо» — это проверка, которая зелена
    // и тогда, когда спрашивать нечего.
    const raw = await page.evaluate(() =>
      JSON.parse(JSON.stringify((window as unknown as { __project: unknown }).__project)));
    expect(() => loadProject(raw), 'разрезанный проект обязан грузиться').not.toThrow();

    const project = loadProject(raw);
    // Каждая ветка доводит зрителя дальше, а не в тупик: достижимость —
    // не то же самое, что целостность ссылок.
    const head = project.segments.find((segment) => segment.id === 's-ask')!;
    expect(head.exit.rules.length).toBe(2);
    for (const rule of head.exit.rules) {
      const branch = project.segments.find((segment) => segment.id === rule.goto);
      expect(branch, `ветка «${rule.goto}» существует`).toBeTruthy();
      expect(branch!.exit.default, `ветка «${rule.goto}» ведёт в продолжение`).not.toBeNull();
    }

    expect(errors, 'разрез не должен ронять редактор').toEqual([]);
  });
});

/**
 * Метка режет главу ГДЕ УГОДНО (`product.md` §2з [Р] — прямая отмена прежнего
 * [Р] «разрезать можно только на гейте»).
 *
 * Нажимается ВИДИМАЯ кнопка транспорта, а не зовётся действие редьюсера,
 * по той же причине, что и у разреза по развилке выше: разрез исправен
 * и при кнопке, до которой нельзя дотянуться, а автору от такого разреза
 * толку нет.
 *
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: проверки «глав стало две». Она верна при любой
 * реализации, включая ту, что копирует главу целиком, оставив обеим один
 * и тот же кусок звука. Проверяется, что ОКНО ПОДЕЛЕНО.
 */
test.describe('метка режет главу где угодно, а не только на остановке', () => {
  test('кнопка «разделить здесь» делит главу, и окно звука делится вместе с ней', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    const before = await segmentsOf(page);

    // Правый щелчок по пустому месту дорожки: он сам перематывает головку
    // в точку щелчка (Сессия 55) и открывает меню места с пунктом разреза.
    const box = await page.getByTestId('track-lane').boundingBox();
    if (!box) throw new Error('дорожка не видна');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2, { button: 'right' });

    const at = await page.evaluate(() =>
      (window as unknown as { __transport: { positionSeconds: number } }).__transport.positionSeconds);
    expect(at, 'головка обязана стоять внутри главы, иначе пункт разреза законно погашен').toBeGreaterThan(0);

    await expect(page.getByTestId('ctxmenu-split-here')).toHaveAttribute('aria-disabled', 'false');
    await page.getByTestId('ctxmenu-split-here').click();

    const after = await segmentsOf(page);
    // Промежуточная проверка «предыдущий шаг СОСТОЯЛСЯ»: без неё проверки
    // ниже сравнивали бы главу саму с собой и молчали бы об этом.
    expect(after.length, 'разрез обязан был родить ровно одну новую главу')
      .toBe(before.length + 1);

    // Обе главы находятся НАБЛЮДЕНИЕМ, а не допущением о том, какая из трёх
    // глав фикстуры текущая: новая — та, которой не было; разрезанная — та,
    // у которой изменилась длительность. Допущение «первая в массиве»
    // совпало бы с правдой случайно и разъехалось бы при смене фикстуры.
    const wasById = new Map(before.map((segment) => [segment.id, segment]));
    const tail = after.find((segment) => !wasById.has(segment.id))!;
    const head = after.find((segment) => {
      const was = wasById.get(segment.id);
      return was !== undefined && was.duration !== segment.duration;
    })!;
    expect(tail, 'новая глава не найдена').toBeTruthy();
    expect(head, 'ни у одной прежней главы не изменилась длительность').toBeTruthy();
    const source = wasById.get(head.id)!;

    // Несущее: вторая глава начинается там, где кончилась первая, и вместе
    // они дают исходное окно целиком. Скопированный offset дал бы здесь
    // равные offset у обеих.
    expect(tail.offset).toBeCloseTo(head.offset + head.duration, 3);
    expect(head.duration + tail.duration).toBeCloseTo(source.duration, 3);
    expect(tail.offset, 'окно продублировано, а не поделено').toBeGreaterThan(head.offset);
  });

  test('в самом начале главы кнопка погашена и называет причину', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    // Головка стоит на нуле сразу после открытия — делить нечего. Щёлкаем
    // у самого левого края дорожки, чтобы правый щелчок (он тоже перематывает)
    // не увёл головку с нуля.
    const box = await page.getByTestId('track-lane').boundingBox();
    if (!box) throw new Error('дорожка не видна');
    await page.mouse.click(box.x, box.y + box.height / 2, { button: 'right' });

    await expect(page.getByTestId('ctxmenu-split-here')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('ctxmenu-why-split-here')).toContainText('в самом начале главы');
  });

  test('разрезанный проект остаётся загружаемым схемой', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    const countBefore = (await segmentsOf(page)).length;

    const box = await page.getByTestId('track-lane').boundingBox();
    if (!box) throw new Error('дорожка не видна');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2, { button: 'right' });
    await page.getByTestId('ctxmenu-split-here').click();

    // ПРОМЕЖУТОЧНАЯ ПРОВЕРКА «предыдущий шаг СОСТОЯЛСЯ», без которой тест
    // декоративен: проект валиден и когда разреза не было вовсе. Поймано
    // сломом при написании — с пустым обработчиком тест оставался зелёным,
    // ровно как e2e «Ctrl+Z убирает вставленное» в Сессии 33.
    expect((await segmentsOf(page)).length, 'разреза не произошло — проверять нечего')
      .toBe(countBefore + 1);

    const project = await page.evaluate(() => (window as unknown as { __project: unknown }).__project);
    // Валидность данных не равна достижимости поведения, но невалидные
    // данные не спасёт ничто: это нижняя граница, а не доказательство.
    expect(() => loadProject(project)).not.toThrow();
  });
});
