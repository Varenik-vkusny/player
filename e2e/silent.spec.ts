/**
 * Немой сегмент (схема v13): время идёт и слайды сменяются без единого звука.
 *
 * Почему это e2e, а не юнит. Арифметику часов закрывает
 * `packages/player/test/silentClock.test.ts` на подставном контексте, но он
 * по построению не может ответить на главный вопрос: заводится ли всё это
 * в живом браузере, где `AudioContext` создаётся по-настоящему и просыпается
 * только по жесту. В S3 логика паузы была верна и прошла бы любой юнит-тест,
 * а дефект сидел в звуке.
 *
 * Проверяется ГЕОМЕТРИЯ, а не состояние. «Состояние стало ended» верно при
 * любой реализации, которая просто досчитала до конца, — в том числе при
 * такой, где сцена не поменялась ни разу.
 */
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, fixture: string): Promise<void> {
  await page.goto(`/?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);

test.describe('немой сегмент', () => {
  test('время идёт без звука: проект доигрывает до конца', async ({ page }) => {
    // Слом: вернуть в схему требование «ровно один источник» — фикстура
    // перестанет грузиться, и метка готовности не появится вовсе.
    await open(page, 'silent');
    await page.getByRole('button', { name: 'Играть' }).click();

    await expect.poll(() => stateOf(page), { timeout: 20_000 }).toBe('ended');
  });

  test('слайды СМЕНЯЮТСЯ: элемент переезжает туда, куда велит следующий слайд', async ({ page }) => {
    // Здесь и лежит несущее утверждение. В фикстуре `counter` стоит на
    // (260, 560) в первом слайде, на (900, 560) во втором и на (260, 760)
    // в третьем — то есть сдвигается СНАЧАЛА вбок, ПОТОМ вниз. Проверка
    // «сдвинулся хоть куда-нибудь» прошла бы и на сломанном порядке слайдов.
    await open(page, 'silent');
    const counter = page.locator('[data-id="counter"]');
    await expect(counter).toBeVisible();

    const start = await counter.boundingBox();
    expect(start, 'элемента нет на сцене — дальше проверять нечего').not.toBeNull();

    await page.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(page), { timeout: 20_000 }).toBe('ended');

    const end = await counter.boundingBox();
    expect(end).not.toBeNull();

    // Третий слайд: тот же x, что и у первого, но заметно ниже.
    expect(Math.abs(end!.x - start!.x), 'по горизонтали третий слайд равен первому').toBeLessThan(4);
    expect(end!.y - start!.y, 'третий слайд опускает подпись на 200 единиц сцены').toBeGreaterThan(20);
  });

  test('у немого сегмента нет расшифровки, и редактор говорит об этом прямо', async ({ page }) => {
    // Молчание тут было бы хуже отказа: автор не понял бы, почему метки
    // ставятся по секундам, а не по словам (инвариант №10).
    await page.goto('/editor.html?fixture=silent', { waitUntil: 'load' });
    await expect(page.getByText('Расшифровки нет')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('без звука: 6 с')).toBeVisible();
  });

  test('транспорт редактора играет немой сегмент', async ({ page }) => {
    // Регрессия на настоящий дефект, найденный руками в браузере: транспорт
    // ходил за адресом озвучки напрямую, минуя ветку немых часов, и падал
    // с «У немого сегмента нет адреса озвучки». Кнопка при этом ничего
    // не делала — ни звука, ни движения, ни сообщения автору.
    //
    // Слом: убрать ветку `source.kind === 'silent'` из `useTransport` —
    // транспорт снова не построится, и позиция останется на нуле.
    await page.goto('/editor.html?fixture=silent', { waitUntil: 'load' });
    await page.waitForFunction(
      () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
      undefined,
      { timeout: 20_000 },
    );

    await page.getByRole('button', { name: 'Играть' }).click();

    // Именно движение позиции, а не смена состояния: состояние `playing`
    // выставляется до первого кадра и о ходе времени не говорит ничего.
    await expect
      .poll(
        () => page.evaluate(
          () => (window as unknown as { __transport: { positionSeconds: number } })
            .__transport.positionSeconds,
        ),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(1);
  });
});
