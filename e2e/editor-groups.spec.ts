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
import { openLayers } from './panels.js';

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

/** Двойной щелчок в точку ЭКРАНА: `clickCount: 2` — настоящая пара кликов,
 *  не синтетический `dblclick`-эквивалент по селектору. */
async function doubleClickAt(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.mouse.click(point.x, point.y, { clickCount: 2 });
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

/**
 * Поворачивает ВЫДЕЛЕННУЮ (одну) группу жестом за ручку `rotate` на заданный
 * угол вокруг центра её рамки — тем же приёмом, что и
 * `stage-controls-reachable.spec.ts:184`: ручка ведётся по своей окружности,
 * радиус сохраняется, чтобы двигался именно угол, а не случайное попадание.
 * `rotateBox` (`transform.ts`) выводит новый поворот из УГЛОВОГО смещения
 * указателя относительно старта (через `grabOffset`), поэтому итоговый
 * поворот бокса равен ровно `degrees`, а не зависит от радиуса ручки.
 *
 * Угол — параметр, а не всегда четверть оборота: группа `mover`+`leaver`
 * сильно вытянута (1440×200 в единицах сцены), и поворот на 90° уносит её
 * за пределы сцены 1920×1080 — часть содержимого стала бы физически
 * невидимой. Небольшой угол держит группу на сцене и достаточен, чтобы
 * поймать пропущенное слагаемое поворота (грабля §13 журнала С35): 0°
 * и 20° различаются в `sin`/`cos` ровно тем, ради чего тест и существует.
 *
 * Жестом, а не новой фикстурой с повёрнутой группой (план С36 §11): такая
 * фикстура стоила бы пяти новых скриншотных эталонов, а ручка поворота уже
 * умеет поворачивать (тест выше по ссылке).
 */
async function rotateSelectedGroup(page: Page, degrees: number): Promise<void> {
  const before = await page.evaluate(() => {
    const frame = document.querySelector('.ed-frame')!.getBoundingClientRect();
    const grip = document.querySelector('[data-grip="rotate"]')!.getBoundingClientRect();
    return {
      center: { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 },
      grip: { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2 },
    };
  });
  const radius = Math.hypot(before.grip.x - before.center.x, before.grip.y - before.center.y);
  const startAngle = Math.atan2(before.grip.y - before.center.y, before.grip.x - before.center.x);
  const targetAngle = startAngle + (degrees * Math.PI) / 180;
  const target = {
    x: before.center.x + radius * Math.cos(targetAngle),
    y: before.center.y + radius * Math.sin(targetAngle),
  };
  await dragFrom(page, before.grip, target.x - before.grip.x, target.y - before.grip.y);
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

  /**
   * ЗАХОД ВНУТРЬ ГРУППЫ (Сессия 36, решение владельца).
   *
   * Двойной щелчок по содержимому обязан выделить РЕБЁНКА, а не группу,
   * которую уже умеет выделять одиночный щелчок (тест выше). Проверяется
   * через `ElementList`: `aria-pressed` строки читает `selectedIds` напрямую,
   * а не геометрию — здесь важен именно ID выделенного, а не то, где он
   * нарисован (геометрию проверяет следующий тест).
   *
   * Краснеет, если `visibleLayers`/`handleStageDoubleClick` продолжают
   * отсеивать содержимое группы фильтром `parentId === undefined`: тогда
   * попадание разрешится в саму группу, и выделенным останется её id.
   */
  test('двойной щелчок по содержимому группы выделяет ребёнка, а не группу', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    const groupId = await groupTwo(page);

    // Снять выделение клавишей, а не кликом по (10, 10): та точка попадает
    // в панель списка элементов, а не в холст, и клика по холсту не будет —
    // предыдущее выделение группы пережило бы этот клик молча.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

    await doubleClickAt(page, await centerOnScreen(page, 'mover'));

    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`element-row-${groupId}`)).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * МИНА ИЗ §14 ЖУРНАЛА С35, ТЕПЕРЬ В ОВЕРЛЕЕ: `syncFrame` берёт
   * `currentSlide.states[id]` и подставляет в `boxToScreen`. Для выделенного
   * РЕБЁНКА группы координаты в состоянии ЛОКАЛЬНЫЕ, и без приведения через
   * `childBoxInScene` рамка нарисовалась бы у начала координат сцены — не
   * там, где ребёнка видно.
   *
   * Проверяется ГЕОМЕТРИЕЙ (`getBoundingClientRect`), а не наличием класса
   * или текста — ровно то требование, которого не хватало предыдущим двум
   * ложным зеленям сессии (журнал С35, §14, шаг 3).
   *
   * Краснеет, если `syncFrame` продолжает строить бокс напрямую из
   * `currentSlide.states[id]` без пересчёта через `childBoxInScene`.
   */
  test('выделенный ребёнок обведён рамкой там, где он виден', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const frameBox = await page.getByTestId('selection-frame').boundingBox();
    if (!frameBox) throw new Error('рамка выделения не нарисована у выделенного ребёнка');
    const moverScreen = await screenBox(page, 'mover');

    expect(frameBox.x, 'рамка обязана стоять там же, где виден ребёнок').toBeCloseTo(moverScreen.x, 0);
    expect(frameBox.y).toBeCloseTo(moverScreen.y, 0);
    expect(frameBox.width).toBeCloseTo(moverScreen.width, 0);
    expect(frameBox.height).toBeCloseTo(moverScreen.height, 0);
  });

  /**
   * Выход — снятием выделения (Escape), без отдельного пути «наружу»:
   * `activeGroupOf` выводит «внутри» из выделения, значит после Escape
   * автор снаружи по построению. Следующий одиночный щелчок по тому же
   * месту обязан снова брать ГРУППУ, как до входа.
   *
   * Промежуточная проверка после Escape (рамки нет) обязательна — урок
   * Сессии 33: тест на откат должен убедиться, что предыдущий шаг
   * («заход внутрь и выделение ребёнка») СОСТОЯЛСЯ, иначе финальная
   * проверка была бы зелёной и при полностью нерабочем заходе.
   *
   * Краснеет, если «внутри» не выводится заново из ПУСТОГО выделения —
   * например, если что-то держит id прежней группы отдельным полем
   * и после Escape продолжает считать автора внутри.
   */
  test('Escape выходит: следующий щелчок по тому же месту снова берёт группу', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    const groupId = await groupTwo(page);

    await page.keyboard.press('Escape');
    const moverCenter = await centerOnScreen(page, 'mover');
    await doubleClickAt(page, moverCenter);
    await expect(
      page.getByTestId('element-row-mover'),
      'заход внутрь обязан состояться до проверки выхода',
    ).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

    await page.mouse.click(moverCenter.x, moverCenter.y);

    await expect(page.getByTestId(`element-row-${groupId}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * Бледная рамка группы — решение владельца: пока автор внутри, видно, где
   * кончается группа, а не только где стоит выделенный ребёнок. Проверяется
   * ГЕОМЕТРИЕЙ по той же причине, что и рамка выделения выше.
   *
   * Краснеет, если рамка рисуется по наличию group-элемента в сегменте
   * (есть всегда после Ctrl+G), а не по тому, что автор СЕЙЧАС внутри неё.
   */
  test('пока автор внутри группы — на холсте бледная рамка группы, после выхода её нет', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    const groupId = await groupTwo(page);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('group-frame')).toHaveCount(0);

    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const groupFrameBox = await page.getByTestId('group-frame').boundingBox();
    if (!groupFrameBox) throw new Error('бледной рамки группы нет, пока автор внутри');
    const groupScreen = await screenBox(page, groupId);

    expect(groupFrameBox.x).toBeCloseTo(groupScreen.x, 0);
    expect(groupFrameBox.y).toBeCloseTo(groupScreen.y, 0);
    expect(groupFrameBox.width).toBeCloseTo(groupScreen.width, 0);
    expect(groupFrameBox.height).toBeCloseTo(groupScreen.height, 0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('group-frame')).toHaveCount(0);
  });

  /**
   * ДЕФЕКТ ИЗ ШАПКИ ЗАДАНИЯ Сессии 36, ИЗМЕРЕННЫЙ В ЖИВОМ БРАУЗЕРЕ.
   *
   * Вся арифметика жеста считает в координатах СЦЕНЫ, а `ElementState.x/y`
   * ребёнка группы — ЛОКАЛЬНЫЕ, от угла группы (`render.ts` ставит их прямо
   * в CSS `left`/`top` относительно узла группы). Запись жеста без перевода
   * кладёт сценное число в локальное поле: тяга на 60×40 экранных px ранее
   * давала переезд 91.7×71.3 — сценная координата ДОБАВЛЯЛАСЬ к координате,
   * уже включающей смещение группы.
   *
   * Проверяется на группе БЕЗ поворота: именно на ней замер и был снят,
   * и именно на ней дефект самый грубый — рамка группы (162, тест выше)
   * прибавляет к ребёнку смещение x=160, значит переезд искажается уже
   * от этого одного слагаемого, без всякого поворота.
   *
   * Краснеет, если запись жеста (StageView.tsx, тело перетаскивания)
   * продолжает писать бокс СЦЕНЫ прямо в `ElementState` ребёнка группы,
   * минуя перевод в локальные координаты (`childBoxInGroup`).
   */
  test('тяга ребёнка внутри НЕПОВЁРНУТОЙ группы: экранный переезд равен жесту', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const before = await screenBox(page, 'mover');
    const DX = 60;
    const DY = 40;
    await dragFrom(page, await centerOnScreen(page, 'mover'), DX, DY);

    const after = await screenBox(page, 'mover');

    /**
     * Допуск 10, а не 3, и это НЕ подгонка под зелень.
     *
     * Прилипание задано в ЭКРАННЫХ пикселях (8 px, решение Сессии 33), значит
     * законный доводчик может сдвинуть результат жеста на эти 8 плюс
     * округление координат. До зазора вокруг сцены (Сессия 36) масштаб был
     * крупнее, те же 8 экранных px покрывали меньше единиц сцены, и жест
     * до направляющей не доставал — допуск 3 держался случайно.
     *
     * Проверено опытом, а не рассуждением: тяга ВНИЗ дала недобор 6.3 px,
     * тяга ВВЕРХ — перелёт 3.8 px. Ошибка масштаба дала бы одинаковую долю
     * в обе стороны; разные знаки и разные величины, обе меньше порога, —
     * это доводчик, а не арифметика.
     *
     * Сила теста сохраняется: дефект, ради которого он написан, давал переезд
     * 91.7 px на жест 60 px, то есть промах 31.7 — втрое больше допуска.
     */
    const TOLERANCE = 10;
    expect(
      Math.abs(after.x - before.x - DX),
      `экранный переезд по x обязан быть ${DX}px, получено ${after.x - before.x}`,
    ).toBeLessThan(TOLERANCE);
    expect(
      Math.abs(after.y - before.y - DY),
      `экранный переезд по y обязан быть ${DY}px, получено ${after.y - before.y}`,
    ).toBeLessThan(TOLERANCE);
  });

  /**
   * ТА ЖЕ ПРОВЕРКА НА ПОВЁРНУТОЙ ГРУППЕ — МИНА, НЕВИДИМАЯ НА ПРЕДЫДУЩЕМ ТЕСТЕ.
   *
   * Перевод жеста в локальные координаты обязан учитывать угол группы
   * (`childBoxInGroup` поворачивает вокруг ЕЁ центра), а не только вычитать
   * смещение угла. На НЕПОВЁРНУТОЙ группе (тест выше) обе формулы — «вычесть
   * угол» и «повернуть вокруг центра и вычесть» — дают одно и то же, поэтому
   * потеря поворота там незаметна. Группа здесь повёрнута ЖЕСТОМ за ручку.
   *
   * Краснеет, если перевод результата жеста в локальные координаты не
   * учитывает поворот группы (использует смещение без `rotate`).
   */
  test('тяга ребёнка внутри ПОВЁРНУТОЙ группы: экранный переезд равен жесту', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await clickElement(page, 'mover'); // одиночный щелчок по содержимому берёт ГРУППУ целиком
    await expect(page.getByTestId('selection-frame')).toBeVisible();
    // 10°, а не более крутой угол: группа `mover`+`leaver` сильно вытянута
    // (1440×200), и её содержимое при повороте начинает подходить близко
    // к краю сцены (y=0) — там стоит направляющая холста (`targetsOf` в
    // `snapping.ts` включает [0, size/2, size] кандидатами), и прилипание
    // ПОДЛИННО срабатывает («прилипание у ПОВЁРНУТОГО элемента не делается
    // намеренно» — это про `snapResize`, а не про `snap` при перетаскивании:
    // тот прилипание рассматривает бокс как неповёрнутый). 10° поворота
    // достаточно, чтобы поймать пропущенное слагаемое поворота, и держит
    // содержимое подальше от направляющих холста.
    await rotateSelectedGroup(page, 10);

    const rotation = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: { segments: { slides: { states: Record<string, { rotation: number }> }[] }[] };
      }).__project;
      const group = Object.entries(project.segments[0]!.slides[0]!.states).find(
        ([, state]) => state.rotation !== 0,
      );
      return group?.[1].rotation ?? 0;
    });
    expect(rotation, 'группа обязана была повернуться жестом, иначе тест ничего не проверяет')
      .toBeCloseTo(10, 0);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const before = await screenBox(page, 'mover');
    const DX = 60;
    const DY = 40;
    await dragFrom(page, await centerOnScreen(page, 'mover'), DX, DY);

    const after = await screenBox(page, 'mover');

    /**
     * По x допуск ЖЁСТКИЙ — и именно он держит охраняемый дефект.
     *
     * Прилипание по этой оси в данной раскладке не срабатывает: измерено
     * 15.08.2026 на шести разных жестах, ошибка по x ровно 0.00 во всех
     * шести. А дефект, ради которого тест написан (координаты сцены,
     * записанные в локальное поле ребёнка), давал переезд 91.7 px вместо
     * 60 — промах 31.7, мимо этого допуска на порядок.
     */
    expect(
      Math.abs(after.x - before.x - DX),
      `экранный переезд по x обязан быть ${DX}px, получено ${after.x - before.x}`,
    ).toBeLessThan(4);

    /**
     * По y допуск ОСВЕДОМЛЁН О ПРИЛИПАНИИ, и это ослабление названо вслух.
     *
     * Сессия 41 вернула холсту 69 px, масштаб сцены вырос с 0.1685 до 0.2324,
     * и те же 40 экранных px стали давать 172 единицы сцены вместо 237.
     * Ребёнок начал заканчивать жест рядом с направляющей холста, и она
     * его подтягивает.
     *
     * ЭТО НЕ ДЕФЕКТ ПРОДУКТА, а столкновение с УЖЕ ЗАПИСАННЫМ долгом
     * «прилипание при перетаскивании не отключено у повёрнутых элементов»
     * (`docs/debt.md`). Проверено сломом: при `SNAP_PX = 0` тест проходит
     * с прежним жёстким допуском.
     *
     * Уйти от направляющих не удалось: измерено шесть жестов и пять положений
     * группы, направляющие ловят жест в 29 случаях из 30 — фикстура `morph`
     * слишком плотная по вертикали (холст 0/540/1080 плюс края `label`).
     *
     * ЧТО ЭТОТ ДОПУСК БОЛЬШЕ НЕ ЛОВИТ, честно: увод вдоль осей группы
     * величиной меньше порога прилипания. Для угла 10° и переезда 60 px
     * это 10.4 px — всё ещё краснеет; для углов меньше 8° уже нет.
     * Закрыть по-настоящему может только починка самого долга.
     */
    const SNAP_PX_SCREEN = 8;
    expect(
      Math.abs(after.y - before.y - DY),
      `экранный переезд по y обязан быть ${DY}px, получено ${after.y - before.y}`,
    ).toBeLessThanOrEqual(SNAP_PX_SCREEN + 2);
  });

  /**
   * Ресайз ребёнка ручкой обязан менять его размер, а не швырять его
   * в сторону. Тот же дефект записи, что у перетаскивания выше, только
   * в ветке `resizeBox`/`snapResize`: без перевода в локальные координаты
   * бокс СЦЕНЫ лёг бы в `ElementState`, и ребёнок отрисовался бы со вторым,
   * лишним смещением на угол группы — то есть уехал бы, а не подрос.
   *
   * Противоположный ручке угол (левый верхний у ручки `se`) — неподвижная
   * точка ресайза (та же гарантия, что у `transform.ts:resizeBox`). Именно
   * его положение и швыряет дефект: у ребёнка внутри группы лишнее слагаемое
   * добавляется к x/y, а размер меняется верно, значит проверка размера ОДНА
   * дефект не поймает — обязательна и проверка неподвижного угла.
   *
   * Краснеет, если запись ресайза ребёнка группы не переведена в локальные
   * координаты.
   */
  test('ресайз ребёнка ручкой меняет его размер, а не швыряет его', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const before = await screenBox(page, 'mover');
    const grip = await page.locator('[data-grip="se"]').boundingBox();
    if (!grip) throw new Error('ручка se не видна у выделенного ребёнка группы');

    await dragFrom(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 80, 60);

    const after = await screenBox(page, 'mover');

    expect(after.width, 'ширина обязана вырасти').toBeGreaterThan(before.width + 20);
    expect(after.height, 'высота обязана вырасти').toBeGreaterThan(before.height + 10);
    // Левый верхний угол противоположен ручке se и обязан остаться на месте —
    // ручка обязана менять размер, а не швырять элемент в сторону.
    expect(Math.abs(after.x - before.x), `левый край уехал на ${after.x - before.x}px`).toBeLessThan(4);
    expect(Math.abs(after.y - before.y), `верхний край уехал на ${after.y - before.y}px`).toBeLessThan(4);
  });

  /**
   * `reflowGroup` (план С36 §8): охват группы обязан следовать за
   * содержимым, когда ребёнка вытащили за прежний край.
   *
   * Тянем `mover` далеко вниз, за прежний нижний край группы (охват
   * `mover`+`leaver` кончается на y=360 у фикстуры `morph`, слайд 1). После
   * отпускания бледная рамка группы обязана дорасти до нового положения
   * ребёнка — иначе автор видит содержимое, торчащее за пределами рамки,
   * которая, по решению владельца, обозначает границу группы.
   *
   * Краснеет, если `endGesture` не зовёт `reflowGroup` после жеста над
   * ребёнком группы: рамка останется на прежнем месте, а `mover` уедет
   * далеко за её нижний край.
   */
  test('рамка группы охватывает содержимое после того, как ребёнка вытащили за край', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    await dragFrom(page, await centerOnScreen(page, 'mover'), 0, 220);

    const groupFrameBox = await page.getByTestId('group-frame').boundingBox();
    if (!groupFrameBox) throw new Error('бледной рамки группы нет после пересчёта охвата');
    const moverScreen = await screenBox(page, 'mover');

    expect(
      groupFrameBox.y + groupFrameBox.height,
      'нижний край рамки группы обязан достать до нижнего края ребёнка',
    ).toBeGreaterThanOrEqual(moverScreen.y + moverScreen.height - 2);
  });

  /**
   * Стрелки — тот же класс, что тяга мышью, только через `Editor.tsx`.
   *
   * У элемента ВЕРХНЕГО УРОВНЯ стрелка прибавляет дельту к `x`/`y`, а они
   * сценные, значит объект едет вдоль осей ЭКРАНА — и это то, что автор
   * видит у любого объекта, как бы тот ни был повёрнут. У ребёнка группы
   * `x`/`y` локальные, и та же прибавка гонит его вдоль осей ГРУППЫ.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: возврат `nudge` к прямой
   * прибавке `currentState.x + dx`. На группе с углом 30° сломанный код
   * даёт по вертикали половину горизонтального переезда вместо нуля.
   *
   * НА НЕПОВЁРНУТОЙ ГРУППЕ ЭТОТ СЛОМ НЕВИДИМ: сдвиг вдоль осей группы
   * и вдоль осей экрана там одно и то же. Поэтому группа поворачивается
   * настоящим жестом, а не берётся из фикстуры, где все углы нулевые.
   */
  test('стрелка двигает ребёнка ПОВЁРНУТОЙ группы по осям экрана, а не вдоль осей группы', async ({
    page,
  }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await clickElement(page, 'mover'); // одиночный щелчок берёт ГРУППУ целиком
    await expect(page.getByTestId('selection-frame')).toBeVisible();
    // 10°, по тому же доводу, что у теста тяги выше: группа сильно вытянута,
    // и крутой угол подводит содержимое к краю сцены.
    await rotateSelectedGroup(page, 10);

    // Промежуточная проверка: поворот СОСТОЯЛСЯ. Без неё тест на неповёрнутой
    // группе проверял бы тождество и был бы зелен при любой реализации.
    const rotation = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: { segments: { slides: { states: Record<string, { rotation: number }> }[] }[] };
      }).__project;
      const group = Object.entries(project.segments[0]!.slides[0]!.states).find(
        ([, state]) => state.rotation !== 0,
      );
      return group?.[1].rotation ?? 0;
    });
    expect(rotation, 'группа обязана была повернуться жестом, иначе тест ничего не проверяет')
      .toBeCloseTo(10, 0);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const before = await screenBox(page, 'mover');
    // Быстрый шаг (Shift) — 10 единиц сцены за нажатие. Пятнадцать нажатий
    // дают переезд, у которого вертикальная составляющая сломанного кода
    // (sin 10° ≈ 0.17 от горизонтальной) заведомо крупнее шума округления.
    for (let i = 0; i < 15; i += 1) await page.keyboard.press('Shift+ArrowRight');
    const after = await screenBox(page, 'mover');

    const dx = after.x - before.x;
    const dy = after.y - before.y;

    expect(dx, 'стрелка вправо обязана двигать вправо').toBeGreaterThan(20);
    expect(
      Math.abs(dy),
      `стрелка была горизонтальной, а по вертикали уехало на ${dy.toFixed(1)}px при переезде ${dx.toFixed(1)}px вбок`,
    ).toBeLessThan(3);
  });

  /**
   * Охват группы обязан следовать за содержимым и когда его двигают
   * СТРЕЛКАМИ, а не только мышью. Иначе одно и то же действие автора даёт
   * разный результат в зависимости от того, каким органом он его сделал:
   * после тяги рамка догоняет, после стрелок — отстаёт до следующей тяги.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: пропуск вызова `reflowGroup`
   * в ветке `nudge` (`Editor.tsx`). Тогда рамка останется на прежнем месте,
   * а ребёнок уедет за её правый край.
   *
   * Проверяется ГЕОМЕТРИЯ, а не наличие узла: «видимость не равна наличию».
   */
  test('рамка группы догоняет содержимое и после сдвига стрелками', async ({ page }) => {
    await openEditor(page);
    await openLayers(page);
    await groupTwo(page);

    await page.keyboard.press('Escape');
    await doubleClickAt(page, await centerOnScreen(page, 'mover'));
    await expect(page.getByTestId('element-row-mover')).toHaveAttribute('aria-pressed', 'true');

    const frameBefore = await page.getByTestId('group-frame').boundingBox();
    if (!frameBefore) throw new Error('бледной рамки группы нет сразу после захода внутрь');
    const moverBefore = await screenBox(page, 'mover');

    // ВНИЗ, а не вбок: охват `mover`+`leaver` вытянут по горизонтали
    // (1440×200), и `mover` в нём левее — сдвиг вправо двигал бы ЛЕВЫЙ край
    // охвата, а не правый. По вертикали же ребёнок выходит за прежний нижний
    // край сразу. Поймано промежуточной проверкой ниже, а не рассуждением.
    // 30 нажатий по 10 единиц — 300 единиц сцены вниз.
    for (let i = 0; i < 30; i += 1) await page.keyboard.press('Shift+ArrowDown');

    const frameAfter = await page.getByTestId('group-frame').boundingBox();
    if (!frameAfter) throw new Error('бледная рамка группы пропала после сдвига стрелками');
    const mover = await screenBox(page, 'mover');

    // Промежуточная проверка ПРО ДРУГОЕ: сдвиг стрелками состоялся. Без неё
    // тест был бы зелёным и при полностью отключённых стрелках — двигать
    // нечего, догонять нечего, рамка законно стоит на месте.
    expect(
      mover.y - moverBefore.y,
      'ребёнок обязан был уехать вниз, иначе стрелки не сработали вовсе',
    ).toBeGreaterThan(20);

    // А это уже сам предмет: рамка догнала.
    expect(
      frameAfter.y + frameAfter.height,
      'нижний край рамки группы обязан достать до нижнего края ребёнка',
    ).toBeGreaterThanOrEqual(mover.y + mover.height - 2);
    expect(
      frameAfter.y + frameAfter.height,
      'рамка обязана была вырасти вниз, а не остаться прежней',
    ).toBeGreaterThan(frameBefore.y + frameBefore.height + 20);
  });
});
