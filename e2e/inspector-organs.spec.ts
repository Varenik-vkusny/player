/**
 * Органы «Расположения» панели «Объект» после перевода на `ui/IconButton`
 * (Сессия 53): выравнивание, раскладка, слои и «копировать форматирование»
 * рисуются одним компонентом библиотеки вместо тринадцати самодельных
 * `<button className="ed-propbar-btn">`.
 *
 * Единственная поведенческая проверка, которую перевод облика обязан не
 * тронуть: погашенная кнопка «Разложить» ОБЯЗАНА остаться видимой и назвать
 * причину — так уже устроен `Button` (см. ui/Button.tsx), и `IconButton`
 * обязан повторить приём, а не спрятать погашенную кнопку молча.
 *
 * Проверка «вызвался ли onDistribute» была бы зелёной при полностью
 * перекрытой кнопке — в этом проекте так уже находили дефект наложения
 * (полоса свойств поверх кнопок ответа гейта, CLAUDE.md). Поэтому здесь
 * смотрим на видимую кнопку и на то, что реально отвечает на клик
 * в её координатах (`elementFromPoint`, тот же приём, что
 * в editor-propbar-more.spec.ts), а не на факт вызова обработчика.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/**
 * Клик по элементу НА СЦЕНЕ. Shift зажимается КЛАВИАТУРОЙ: у `mouse.click`
 * полей модификаторов нет вовсе, и лишний ключ в опциях выбрасывается молча
 * (тот же приём, что в arrange.spec.ts и propbar-mixed.spec.ts).
 */
async function clickElement(page: Page, id: string, shift = false): Promise<void> {
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up('Shift');
}

/**
 * Кнопки «Расположения» переехали с полосы свойств за дверь «Объект»
 * (Сессия 48) — тот же путь, что используют arrange.spec.ts
 * и editor-propbar-more.spec.ts.
 */
async function openObjectPanel(page: Page): Promise<void> {
  await page.getByTestId('propbar-more').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
}

test('погашенная кнопка «Разложить» видна и называет причину', async ({ page }) => {
  await openEditor(page, 'morph');

  // Фикстура morph показывает на первом слайде ровно двух: mover и leaver.
  // Раскладка требует трёх (между двумя элементами промежуток ровно один,
  // и равнять его нечему) — двух выделенных достаточно, чтобы кнопка
  // была погашена, и это ровно тот случай, который проверяет задача.
  await clickElement(page, 'mover');
  await clickElement(page, 'leaver', true);
  await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(2);

  await openObjectPanel(page);

  const distribute = page.getByTestId('distribute-x');

  // Положительный контроль: кнопка вообще есть и её ВИДНО — а не «нашлась
  // в DOM, но раздавлена/скрыта». toBeVisible() — тот геометрический смысл,
  // а не факт присутствия узла.
  await expect(distribute, 'кнопка «Разложить по горизонтали» не видна').toBeVisible();

  // Погашена — то самое состояние, которое проверяет задача.
  await expect(distribute).toBeDisabled();

  // title называет причину, а не молчит и не показывает голый label —
  // тот же текст, что раньше стоял на полосе свойств (stage/organs.ts,
  // сохранён дословно при переводе на IconButton).
  await expect(distribute).toHaveAttribute(
    'title',
    'Разложить поровну по горизонтали — нужно выделить хотя бы три',
  );

  // Кнопка не просто "visible" по CSS — она реально ДОСТИЖИМА в своих
  // экранных координатах, а не перекрыта соседним узлом молча.
  const hit = await distribute.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { coveredBy: at === el || el.contains(at) ? null : (at?.className ?? '(ничего)') };
  });
  expect(hit.coveredBy, `«Разложить по горизонтали» накрыта другим узлом: ${hit.coveredBy}`).toBeNull();
});

/**
 * Подсказка «копировать форматирование» — ДВА РАЗНЫХ ТЕКСТА, и ни один
 * не был охраняем ничем до Сессии 53.
 *
 * История: при переводе органа на `IconButton` спецификация давала одно
 * поле `label` и на имя, и на подсказку. Живая кнопка потеряла «(Ctrl+Alt+C)» —
 * сочетание клавиш, о котором автор больше НИГДЕ не узнаёт: в редакторе
 * нет ни списка сочетаний, ни меню. Потеря не уронила ни одного теста:
 * editor-copy-format.spec.ts щёлкает по кнопке и смотрит на результат,
 * а на её `title` не смотрит никто.
 *
 * Что должно сломаться, чтобы эти два теста покраснели:
 *  - убрать `hint` у IconButton в Inspector.tsx — живая кнопка перестанет
 *    называть сочетание клавиш (первый тест);
 *  - убрать `reason` — погашенная кнопка перестанет объяснять, ПОЧЕМУ она
 *    погашена, и покажет своё имя вместо причины (второй тест).
 * Проверено обоими сломами, оба вывода — в сообщении коммита.
 *
 * Верно ли это при ЛЮБОЙ реализации? Нет: подсказка живого состояния
 * и причина гашения — разные строки, и совпасть они могут только если
 * их нарочно сделать одной, что и было дефектом.
 */
test('живая кнопка «копировать форматирование» называет сочетание клавиш', async ({ page }) => {
  await openEditor(page, 'demo');

  // Один элемент со стилем на этом слайде — единственное состояние,
  // в котором копирование формата доступно (тот же путь, что
  // в editor-copy-format.spec.ts).
  await page.getByTestId('element-row-title').click();
  await expect(page.getByTestId('selection-readout')).toContainText('title');

  await openObjectPanel(page);

  const copyFormat = page.getByTestId('copy-format');

  // Положительный контроль: кнопка ЖИВАЯ. Без него тест был бы зелёным
  // и на погашенной кнопке — у той свой текст, и совпадения не было бы,
  // но проверка ниже сообщала бы не о том состоянии, о котором думает.
  await expect(copyFormat).toBeEnabled();

  await expect(copyFormat).toHaveAttribute(
    'title',
    'Копировать форматирование (Ctrl+Alt+C)',
  );

  // Имя органа при этом НЕ несёт сочетания клавиш: имя не имеет права
  // меняться от состояния, а подсказка при наведении — имеет.
  await expect(copyFormat).toHaveAttribute('aria-label', 'Копировать форматирование');
});

test('погашенная кнопка «копировать форматирование» называет причину', async ({ page }) => {
  await openEditor(page, 'morph');

  // Двое выделенных: копирование формата берёт вид РОВНО одного элемента,
  // поэтому на пачке оно погашено.
  await clickElement(page, 'mover');
  await clickElement(page, 'leaver', true);
  await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(2);

  await openObjectPanel(page);

  const copyFormat = page.getByTestId('copy-format');
  await expect(copyFormat).toBeVisible();
  await expect(copyFormat).toBeDisabled();
  await expect(copyFormat).toHaveAttribute(
    'title',
    'Копировать форматирование — нужно выделить один элемент с видом на этом слайде',
  );
});
