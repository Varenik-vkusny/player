/**
 * Группы в редакторе: собрать, двигать и масштабировать как одно (Сессия 35).
 *
 * Каждый тест жмёт НАСТОЯЩИЕ мышь и клавиатуру. Проверка «попал ли нужный id
 * в состояние редактора» была бы зелёной при любом дефекте попадания
 * указателя или порядка эффектов — тот же довод, что в `multi-select.spec.ts`.
 *
 * Главная тонкость здесь — ЧТО проверять после перетаскивания. Координаты
 * содержимого отсчитываются от группы, поэтому при переезде группы они
 * НЕ МЕНЯЮТСЯ вовсе: в проекте едет только группа. Значит проверять надо
 * экранные боксы содержимого, а не его состояния — иначе тест был бы зелёным
 * и у совершенно неподвижной сцены.
 *
 * Фикстура `morph`: `mover` и `leaver` стоят на первом слайде далеко друг
 * от друга, промахнуться указателем мимо одного в другой нельзя.
 */
import { expect, test, type Page } from '@playwright/test';

interface Box { x: number; y: number; width: number; height: number }

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=morph', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Элементы сегмента из ПРОЕКТА: то, что уедет в файл. */
async function elementsOf(page: Page): Promise<{ id: string; type: string; parentId?: string }[]> {
  return page.evaluate(() => {
    const project = (window as unknown as {
      __project: { segments: { elements: { id: string; type: string; parentId?: string }[] }[] };
    }).__project;
    return project.segments[0]!.elements.map((element) => ({ ...element }));
  });
}

/** Состояние элемента на первом слайде — в координатах ПРОЕКТА. */
async function stateOf(page: Page, id: string): Promise<Box> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, Box> }[] }[] };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния «${elementId}»`);
    return { x: state.x, y: state.y, width: state.width, height: state.height };
  }, id);
}

/** Экранный бокс узла на холсте редактора — то, что видит автор. */
async function screenBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`.ed-stage-host [data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла «${elementId}» на сцене редактора`);
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, id);
}

async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await screenBox(page, id);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function clickElement(page: Page, id: string, shift = false): Promise<void> {
  const center = await centerOnScreen(page, id);
  // Shift зажимается клавиатурой: у `page.mouse.click` полей модификаторов
  // нет вовсе, и лишний ключ молча выбрасывается (см. `multi-select.spec.ts`).
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up('Shift');
}

/** Жест мышью в несколько шагов: одно движение не воспроизводит настоящий жест. */
async function dragFrom(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(from.x + (dx * step) / 4, from.y + (dy * step) / 4);
  }
  await page.mouse.up();
}

/** Собирает `mover` и `leaver` в группу и возвращает её id. */
async function groupTwo(page: Page): Promise<string> {
  await clickElement(page, 'mover');
  await clickElement(page, 'leaver', true);
  await page.keyboard.press('Control+g');

  const group = (await elementsOf(page)).find((element) => element.type === 'group');
  expect(group, 'Ctrl+G обязан создать элемент типа group').toBeDefined();
  return group!.id;
}

test.describe('группы в редакторе', () => {
  test('Ctrl+G связывает выделенное: появляется группа, содержимое ссылается на неё', async ({ page }) => {
    await openEditor(page);

    const before = await stateOf(page, 'mover');
    const groupId = await groupTwo(page);

    const elements = await elementsOf(page);
    const mover = elements.find((element) => element.id === 'mover')!;
    const leaver = elements.find((element) => element.id === 'leaver')!;
    expect(mover.parentId, 'содержимое обязано ссылаться на группу').toBe(groupId);
    expect(leaver.parentId).toBe(groupId);

    // Охват обязан накрыть обоих, а координаты содержимого стать локальными.
    const group = await stateOf(page, groupId);
    const moverLocal = await stateOf(page, 'mover');
    expect(group.x + moverLocal.x, 'локальные координаты плюс угол группы дают прежнее место')
      .toBeCloseTo(before.x, 3);
    expect(group.width, 'охват шире одного элемента').toBeGreaterThan(before.width);
  });

  /**
   * Несущее свойство: после сборки автор оперирует ГРУППОЙ. Щелчок по
   * содержимому обязан брать её целиком — иначе кнопка «сгруппировать»
   * сработала бы, а поведение осталось прежним.
   *
   * Проверяется поведением, а не выделенным id: тянем за одного, а уехать
   * обязаны ОБА. Проверка `selectedIds` была бы зелёной и при полностью
   * неработающем перетаскивании.
   */
  test('щелчок по содержимому берёт группу: тянем за одного — едут оба', async ({ page }) => {
    await openEditor(page);
    await groupTwo(page);

    await page.mouse.click(10, 10); // снять выделение, чтобы щелчок был первым
    const moverBefore = await screenBox(page, 'mover');
    const leaverBefore = await screenBox(page, 'leaver');

    await clickElement(page, 'mover');
    await dragFrom(page, await centerOnScreen(page, 'mover'), 80, 50);

    const moverAfter = await screenBox(page, 'mover');
    const leaverAfter = await screenBox(page, 'leaver');

    expect(moverAfter.x - moverBefore.x, 'взятый обязан уехать').toBeGreaterThan(20);
    // Обе дельты равны: содержимое едет вместе, а не порознь.
    expect(leaverAfter.x - leaverBefore.x).toBeCloseTo(moverAfter.x - moverBefore.x, 0);
    expect(leaverAfter.y - leaverBefore.y).toBeCloseTo(moverAfter.y - moverBefore.y, 0);
  });

  /**
   * Переезд группы НЕ трогает состояния содержимого — в этом весь смысл
   * относительных координат. Тест закрепляет именно это: в проекте едет
   * одна группа, на экране едут все.
   */
  test('при переезде группы состояния содержимого в проекте не меняются', async ({ page }) => {
    await openEditor(page);
    const groupId = await groupTwo(page);

    const groupBefore = await stateOf(page, groupId);
    const moverBefore = await stateOf(page, 'mover');

    await clickElement(page, 'mover');
    await dragFrom(page, await centerOnScreen(page, 'mover'), 90, 60);

    const groupAfter = await stateOf(page, groupId);
    const moverAfter = await stateOf(page, 'mover');

    expect(groupAfter.x, 'группа обязана уехать в проекте').not.toBeCloseTo(groupBefore.x, 1);
    expect(moverAfter.x, 'локальные координаты содержимого неизменны').toBeCloseTo(moverBefore.x, 3);
    expect(moverAfter.y).toBeCloseTo(moverBefore.y, 3);
  });

  /**
   * Ручка размера у группы обязана масштабировать СОДЕРЖИМОЕ. Без этого
   * рамка растёт, а внутри не меняется ничего — орган работает наполовину
   * и молча, ровно тот класс дефектов, ради которого заведён
   * `stage-controls-reachable.spec.ts`.
   */
  test('тяга ручки группы масштабирует содержимое, а не только рамку', async ({ page }) => {
    await openEditor(page);
    const groupId = await groupTwo(page);

    await clickElement(page, 'mover');
    await expect(page.getByTestId('selection-frame')).toBeVisible();

    const groupBefore = await stateOf(page, groupId);
    const moverBefore = await stateOf(page, 'mover');

    const grip = await page.locator('[data-grip="se"]').boundingBox();
    if (!grip) throw new Error('ручка se не видна: у выделенной группы обязаны быть ручки');
    await dragFrom(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 120, 80);

    const groupAfter = await stateOf(page, groupId);
    const moverAfter = await stateOf(page, 'mover');

    expect(groupAfter.width, 'рамка группы обязана вырасти').toBeGreaterThan(groupBefore.width);
    expect(moverAfter.width, 'содержимое обязано вырасти вместе с ней')
      .toBeGreaterThan(moverBefore.width);

    // Множитель у содержимого тот же, что у рамки: масштаб пропорционален.
    const frameScale = groupAfter.width / groupBefore.width;
    const childScale = moverAfter.width / moverBefore.width;
    expect(childScale).toBeCloseTo(frameScale, 1);
  });

  /**
   * ПРИЗРАК В СПИСКЕ ПОПАДАНИЙ.
   *
   * Координаты содержимого группы — ЛОКАЛЬНЫЕ. Список кандидатов
   * на попадание строится из состояний напрямую, и если не отсеять
   * содержимое, `mover` со своим локальным `x: 40` числится стоящим
   * у левого верхнего угла СЦЕНЫ — там, где на экране пусто.
   *
   * Автор щёлкает по пустому холсту и выделяет объект, которого там нет
   * видно. Молча: ни ошибки, ни подсветки не на том месте — рамка
   * появляется вокруг настоящего `mover`, далеко от курсора.
   *
   * Проверяется поведением: после щелчка по пустому месту рамки выделения
   * быть не должно вовсе.
   *
   * Слом: перестать отсеивать содержимое в `visibleLayers`.
   */
  test('щелчок по пустому холсту не выделяет содержимое группы по его локальным координатам', async ({ page }) => {
    await openEditor(page);
    const groupId = await groupTwo(page);

    /**
     * Группу надо СНАЧАЛА увезти. Призраки сидят у начала координат сцены
     * (локальный `x` отсчитывается от нуля), а сразу после сборки там же
     * стоит и сама группа — призрак и настоящий бокс накладываются,
     * и тест ничего не проверял бы.
     */
    await clickElement(page, 'mover');
    await dragFrom(page, await centerOnScreen(page, 'mover'), 220, 140);

    const group = await stateOf(page, groupId);
    const local = await stateOf(page, 'mover');
    const scenePoint = { x: local.x + local.width / 2, y: local.y + local.height / 2 };
    expect(scenePoint.x, 'точка обязана лежать ЛЕВЕЕ уехавшей группы').toBeLessThan(group.x);

    /**
     * Отображение «единицы сцены → экран» выводится из ЖИВОГО DOM по самой
     * группе: у неё есть и состояние в проекте, и узел на экране. Считать
     * его от разметки нельзя — первый потомок `.ed-stage-host` это полоса
     * прокрутки, а не масштабированная сцена, и такой пересчёт даёт точку
     * мимо холста. На этом уже обжёгся: тест был зелёным, потому что щелчок
     * уходил в пустоту, а не потому, что призрака нет.
     */
    const groupScreen = await screenBox(page, groupId);
    const scale = groupScreen.width / group.width;
    const screen = {
      x: groupScreen.x + (scenePoint.x - group.x) * scale,
      y: groupScreen.y + (scenePoint.y - group.y) * scale,
    };

    await page.keyboard.press('Escape'); // снять выделение
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

    await page.mouse.click(screen.x, screen.y);

    await expect(
      page.getByTestId('selection-frame'),
      'на пустом месте холста выделяться нечему',
    ).toHaveCount(0);
  });

  test('Ctrl+Shift+G разбирает: содержимое возвращается в координаты сцены', async ({ page }) => {
    await openEditor(page);

    const moverBefore = await stateOf(page, 'mover');
    const leaverBefore = await stateOf(page, 'leaver');
    const groupId = await groupTwo(page);

    // Промежуточная проверка: без неё разборка «вернула как было» могла бы
    // означать, что сборки не случилось вовсе. Урок Сессии 33 — тест на откат
    // обязан убедиться, что предыдущий шаг СОСТОЯЛСЯ.
    expect((await elementsOf(page)).find((element) => element.id === 'mover')!.parentId).toBe(groupId);

    await page.keyboard.press('Control+Shift+g');

    const elements = await elementsOf(page);
    expect(elements.some((element) => element.type === 'group'), 'узел группы обязан исчезнуть')
      .toBe(false);
    expect(elements.find((element) => element.id === 'mover')!.parentId).toBeUndefined();

    const moverAfter = await stateOf(page, 'mover');
    const leaverAfter = await stateOf(page, 'leaver');
    expect(moverAfter.x, 'содержимое вернулось на своё место в сцене').toBeCloseTo(moverBefore.x, 3);
    expect(moverAfter.y).toBeCloseTo(moverBefore.y, 3);
    expect(leaverAfter.x).toBeCloseTo(leaverBefore.x, 3);
  });
});
