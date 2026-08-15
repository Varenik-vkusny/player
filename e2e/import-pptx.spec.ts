/**
 * Импорт презентации: путь автора целиком, в живом браузере.
 *
 * Юниты проверяют раскладку на разобранных данных, а здесь проверяется то,
 * чего они дать не могут: что 14-мегабайтная библиотека вообще грузится
 * динамическим импортом в браузере, что `File.arrayBuffer` доезжает до неё,
 * и что собранный проект переживает запись в слот работы и перезагрузку.
 *
 * → ADR-031
 */
import { expect, test, type Page } from '@playwright/test';

const TEXT_DECK = 'fixtures/import/canva-page-text.pptx';
const NOTES_DECK = 'fixtures/import/canva-page-notes.pptx';

interface ProjectView {
  readonly meta: { readonly title: string; readonly stageWidth: number; readonly stageHeight: number };
  readonly segments: readonly {
    readonly speech?: string;
    readonly audio: { readonly src?: string; readonly fileId?: string; readonly duration: number };
    readonly elements: readonly { readonly id: string; readonly type: string; readonly content: string }[];
    readonly slides: readonly {
      readonly states: Record<string, { readonly x: number; readonly y: number; readonly style: Record<string, string> }>;
    }[];
  }[];
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Перезагрузка, которую редактор запускает сам после импорта. */
async function importDeck(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __old?: true }).__old = true;
  });
  await page.getByTestId('import-pptx-input').setInputFiles(path);
  await page.waitForFunction(
    () =>
      (window as unknown as { __old?: true }).__old === undefined &&
      document.documentElement.dataset['ready'] === '1',
    null,
    { timeout: 60_000 },
  );
}

const projectOf = (page: Page): Promise<ProjectView> =>
  page.evaluate(() => (window as unknown as { __project: ProjectView }).__project);

test.describe('импорт презентации', () => {
  test('файл превращается в проект с ГЕОМЕТРИЕЙ исходника', async ({ page }) => {
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    const project = await projectOf(page);
    const segment = project.segments[0]!;

    // Сцена совпадает со страницей один в один — измерено, ADR-031.
    expect(project.meta.stageWidth).toBe(1920);
    expect(project.meta.stageHeight).toBe(1080);

    // Эталон — сырой XML, прочитанный глазами:
    // <a:off x="977903" y="758828"/> при 9525 EMU на пиксель → 102.667, 79.667.
    // Проверка «элементов столько же» была бы ПУСТА: она верна при любой
    // реализации импорта, в том числе при полностью перепутанной раскладке.
    const states = segment.slides[0]!.states;
    expect(states['p1-e0']!.x).toBe(103);
    expect(states['p1-e0']!.y).toBe(80);
    expect(states['p1-e0']!.style['color']).toBe('#416180');
    expect(states['p1-e1']!.x).toBe(466);
    expect(states['p1-e1']!.style['font-weight']).toBe('bold');

    // По идентификатору, а не по месту в массиве: подложка фона стоит первой,
    // и обращение по индексу поехало бы при любой такой добавке. Именно так
    // этот тест и покраснел, когда подложка появилась.
    const byId = (id: string): string =>
      segment.elements.find((el) => el.id === id)!.content;
    expect(byId('p1-e0')).toBe('ПОДГОТОВИЛИ ТИМУР И АЛЛАУДИН');
    expect(byId('p1-e1')).toBe('АГЕНТСТВО');

    // Фон страницы — подложкой во всю сцену: без неё тёмный текст лёг бы
    // на тёмную сцену темы. Найдено глазами, тестами не ловилось.
    expect(states['p1-bg']!.style['background']).toBe('#F2F2F3');
  });

  test('импортированный кусок НЕМОЙ, и это законно с версии 13', async ({ page }) => {
    // До v13 такой проект не прошёл бы разбор вовсе, и импорт был бы
    // невозможен целиком. Слом: вернуть «ровно один источник» — редактор
    // покажет отказ вместо проекта.
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    const audio = (await projectOf(page)).segments[0]!.audio;
    expect(audio.src).toBeUndefined();
    expect(audio.fileId).toBeUndefined();
    expect(audio.duration).toBeGreaterThan(0);
  });

  test('заметки докладчика приезжают текстом озвучки', async ({ page }) => {
    // То, ради чего импорт имеет смысл: слайд приезжает вместе с тем,
    // что по нему надо сказать.
    await openEditor(page);
    await importDeck(page, NOTES_DECK);

    const project = await projectOf(page);
    expect(project.segments[0]!.speech).toBe('КОНТРОЛЬ-ЗАМЕТКИ-40 проверка доезда в pptx');
  });

  test('сцена рисует импортированные элементы, а не пустой холст', async ({ page }) => {
    // Проверка ПО ВИДИМОМУ: юнит-тест на раскладку остался бы зелёным
    // и в случае, когда рендер не получил ни одного элемента.
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    await expect(page.getByText('АГЕНТСТВО').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('ПОДГОТОВИЛИ ТИМУР И АЛЛАУДИН').first()).toBeVisible();
  });
});
