/**
 * Повтор куска: остановки ВНУТРИ молчат, виновная остановка спрашивает снова.
 *
 * Решение владельца (02.08.2026): автор может провести ребро выхода НАЗАД,
 * к уже пройденному куску («повтори объяснение и попробуй снова»). Плеер
 * обязан узнать, что зритель здесь уже был, и не открывать заново остановки
 * внутри повторяемого куска — кроме той, что отправила на повтор: она
 * спрашивает снова, потому что её ответ стирается вместе с уходом назад.
 *
 * fixtures/projects/repeat.json (scripts/build-repeat-fixture.mjs):
 * s-a — молчащий кусок (одна внутренняя остановка g-a, kind: continue),
 * s-b — виновный кусок (одна остановка-развилка g-b): неверный ответ ведёт
 * в s-a, верный — в s-end. Дорожки короткие и уже существующие
 * (ask.mp3, branch-yes.mp3), их длину скрипт не менял.
 *
 * «Молчит» здесь проверяется НЕ фактом «открылась и тут же закрылась» —
 * инвариант №4 такого не допускает («молчащая остановка законна только
 * если она НЕ НАСТУПАЕТ вовсе»). Проверка — счётчик всех переходов плеера
 * в состояние `at-gate` за весь прогон: их ровно три (g-a, первое открытие
 * g-b, повторное открытие g-b). Если бы g-a открылась на повторе, счётчик
 * был бы четыре, а тест обязан был бы покраснеть.
 *
 * Клики — по ВИДИМЫМ кнопкам оснастки (`getByRole('button', ...)`), а не
 * вызов `player.answer()` напрямую: логика ответа исправна и при сломанной
 * раскладке или наложении, а зритель нажимает то, что видит на экране.
 */
import { expect, test, type Page } from '@playwright/test';

async function openRepeat(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Журнал состояний плеера копится ДО первой навигации: MutationObserver
  // вешается на #state сразу после DOMContentLoaded, то есть раньше, чем
  // зритель успевает нажать «Играть». Так подсчёт `at-gate` не зависит
  // от того, в какой момент тест решил заглянуть в DOM.
  await page.addInitScript(() => {
    (window as unknown as { __stateLog: string[] }).__stateLog = [];
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('state');
      if (!el) return;
      const log = (window as unknown as { __stateLog: string[] }).__stateLog;
      const push = (): void => { log.push(el.textContent ?? ''); };
      push();
      new MutationObserver(push).observe(el, { childList: true, characterData: true, subtree: true });
    });
  });

  await page.goto('/?fixture=repeat', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
  return errors;
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const stateLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stateLog: string[] }).__stateLog);
const repeatingLabel = (page: Page) => page.locator('#repeating');

test.describe('повтор куска: молчащая остановка и виновница', () => {
  test('молчащая остановка не наступает вовсе, виновная спрашивает снова, надпись видна на экране', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = await openRepeat(page);

    // Надпись скрыта до первого повтора: первый проход — не возвращение.
    await expect(repeatingLabel(page)).not.toBeVisible();

    await page.getByRole('button', { name: 'Играть' }).click();

    // Первая остановка: g-a внутри s-a, kind: continue → кнопка «Дальше».
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
    await expect(repeatingLabel(page), 'первый проход s-a — это не повтор').not.toBeVisible();
    await page.getByRole('button', { name: 'Дальше' }).click();

    // Стык s-a → s-b беззвучный (расписание, а не опрос): следующая остановка
    // sна экране — это уже g-b в s-b, развилка «Верно» / «Неверно».
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
    await expect(page.getByRole('button', { name: 'Верно', exact: true })).toBeVisible();
    await expect(repeatingLabel(page), 'первый проход s-b — тоже не повтор').not.toBeVisible();

    await page.getByRole('button', { name: 'Неверно' }).click();

    // Неверный ответ уводит на повтор s-a. Надпись обязана появиться —
    // §5 [Р] product.md: без неё зритель решит, что зациклился, и уйдёт.
    // toBeVisible(), а не toHaveCount(): элемент существует в DOM всегда,
    // видимость переключается стилем display.
    await expect(repeatingLabel(page), 'зритель вернулся к уже слышанному куску').toBeVisible({
      timeout: 15_000,
    });
    await expect(repeatingLabel(page)).toHaveText('Возвращаемся к пройденному');

    // Пока s-a доигрывает повтор (около 2.9 с), состояние обязано ОСТАВАТЬСЯ
    // «playing»: g-a не должна открыться. Несколько замеров внутри окна,
    // а не один — если бы гейт мигнул и тут же закрылся (запрещено
    // инвариантом №4), одиночная проверка могла бы промахнуться мимо кадра.
    for (let i = 0; i < 4; i++) {
      expect(await stateOf(page), 'g-a молчит на повторе').not.toBe('at-gate');
      await page.waitForTimeout(500);
    }

    // Виновная остановка (g-b) спрашивает снова — тот же вопрос виден опять.
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
    await expect(page.getByRole('button', { name: 'Верно', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Верно', exact: true }).click();

    // Верный ответ на этот раз — s-b ведёт в s-end, объяснение заканчивается.
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('ended');
    await expect(page.locator('[data-id="label-end"]')).toBeVisible();

    // Итоговая проверка «наступала ли молчащая остановка вовсе»: ровно три
    // входа в at-gate за весь прогон (g-a, первый g-b, повторный g-b).
    // Четвёртый означал бы, что g-a всё-таки открылась на повторе.
    const log = await stateLog(page);
    const gateEntries = log.filter((s) => s === 'at-gate').length;
    expect(gateEntries, `журнал состояний: ${JSON.stringify(log)}`).toBe(3);

    expect(errors, 'прогон не должен ронять страницу').toEqual([]);
  });
});
