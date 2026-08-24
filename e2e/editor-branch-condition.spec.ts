/**
 * Вид «Ветки»: у полосы видно, ПРИ КАКОМ ОТВЕТЕ рассказ в неё уходит
 * (Сессия 48, задача B; долг Сессии 43, `branches.md` §5.1).
 *
 * До этой сессии автор видел только, ЧТО рассказ расходится (полосы веток
 * на экране), но не видел, каким ответом зритель туда попадает. Замер
 * живого редактора 18.08.2026 (фикстура `branching`, вид «Ветки») —
 * текст строк дерева был:
 *   "▾Основная0:49Выборконец"
 *   "Концовка: да0:03Концовка: даконец"
 *   "Концовка: нет0:02Концовка: нетконец"
 * Условия не было ни в одной строке — это «до».
 *
 * fixtures/projects/branching.json: гейт `gate-start` на сегменте `n-start`,
 * варианты `opt-yes` — подпись «Да», `opt-no` — подпись «Нет». Правило `e-yes`
 * ведёт в `n-yes` («Концовка: да»), `e-no` — в `n-no` («Концовка: нет»).
 *
 * Подписи вариантов взяты ИЗ ФИКСТУРЫ (третий источник, не код и не
 * `conditionText`, вызванный отдельно): проверяется, что показанный текст
 * СОДЕРЖИТ ровно эти слова, а не то, что функция вернула то же, что сама
 * бы и вернула.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/**
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: `branchTree.ts` вернуть
 * `entryCondition: null` у дочерних полос (как в юнит-тестовом сломе того
 * же понятия), либо `BranchesView.tsx` перестать рисовать
 * имя ветки, либо спрятать его тем же приёмом, которым однажды
 * уже была спрятана подпись поля на полосе свойств (`clip-path`,
 * `scrollWidth` без видимого места) — поэтому проверяется ВИДИМОСТЬ
 * (ненулевой размер на экране), а не только присутствие в DOM.
 */
test('у веток видна разная строка условия входа, с подписью варианта из фикстуры', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openEditor(page, 'branching');
  await page.getByTestId('view-branches').click();
  await expect(page.getByTestId('branches-view')).toBeVisible();

  await expect(page.getByTestId('branch-row-n-yes')).toBeVisible();
  await expect(page.getByTestId('branch-row-n-no')).toBeVisible();

  /*
    С 25.08.2026 условие входа читается ИЗ ИМЕНИ ВЕТКИ, а не из отдельной
    строки под ним. Имя теперь и есть ответ, который в ветку ведёт
    (`branchTree.ts`), а прежняя строка «otvet» = «Да» дословно повторяла
    его же и была убрана как шум по слову владельца.

    Утверждение теста не изменилось ни на букву: автор ВИДИТ, при каком
    ответе играет каждая ветка, и у разных веток это разное. Изменился
    только узел, который это несёт.
  */
  const yesCondition = page.getByTestId('branch-title-n-yes');
  const noCondition = page.getByTestId('branch-title-n-no');

  await expect(yesCondition, 'имя полосы «да» не найдено').toBeVisible();
  await expect(noCondition, 'имя полосы «нет» не найдено').toBeVisible();

  // Видимость — размером на экране, не только присутствием в DOM: обрезка
  // без места (`scrollWidth` при `clientWidth 1`) уже один раз давала три
  // зелёных e2e при пустом экране (Сессия про полосу свойств).
  const yesBox = await yesCondition.boundingBox();
  const noBox = await noCondition.boundingBox();
  expect(yesBox, 'условие «да» есть в DOM, но без видимой площади').not.toBeNull();
  expect(noBox, 'условие «нет» есть в DOM, но без видимой площади').not.toBeNull();
  expect(yesBox!.width, 'условие «да» схлопнуто по ширине').toBeGreaterThan(1);
  expect(yesBox!.height, 'условие «да» схлопнуто по высоте').toBeGreaterThan(1);
  expect(noBox!.width, 'условие «нет» схлопнуто по ширине').toBeGreaterThan(1);
  expect(noBox!.height, 'условие «нет» схлопнуто по высоте').toBeGreaterThan(1);

  const yesText = (await yesCondition.textContent())!;
  const noText = (await noCondition.textContent())!;

  // Подпись варианта — слово автора («Да»/«Нет»), взятое из самой фикстуры,
  // а не id варианта («opt-yes»/«opt-no») и не переизобретённый перевод.
  expect(yesText, `строка условия «да»: «${yesText}»`).toContain('Да');
  expect(noText, `строка условия «нет»: «${noText}»`).toContain('Нет');
  // Взаимоисключение — ловит реализацию, показавшую одну и ту же строку
  // (или обе подписи разом) у каждой полосы.
  expect(yesText).not.toContain('Нет');
  expect(noText).not.toContain('Да');
  expect(yesText, 'у обеих полос одна и та же строка условия').not.toBe(noText);

  // Полоса «Основная» (корневая, `n-start`) — в неё не ведёт никакое
  // правило выхода, условия входа у неё нет и быть не может. Поэтому
  // и названа она не ответом, а словом «Основная»: если бы имя строилось
  // из условия вслепую, здесь вышла бы пустота или чужой ответ.
  await expect(page.getByTestId('branch-title-n-start')).toHaveText('Основная');

  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
});
