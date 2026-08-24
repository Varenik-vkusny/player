/**
 * Переключение на главу с НЕНУЛЕВЫМ окном звука не роняет редактор.
 *
 * Предмет теста — дефект, который жил с Сессии 37 как `known-bugs.md` №13
 * («`positionSeconds` до старта и после конца равна минус окну дорожки»)
 * и был записан как враньё в числе. В Сессии 43 он перестал быть числом:
 * при щелчке по главе редактор читает позицию головки, чтобы построить
 * метку времени, и `-4` уходит в `assertSeconds`, который честно бросает
 * `RangeError: Секунда метки не может быть отрицательной, получено -4`.
 * React снимает всё дерево — автор видит белый экран.
 *
 * Проверено руками в живом Chrome 17.08.2026 на фикстуре `split-track`:
 * `document.querySelector('.ed-root')` шёл из объекта в `null`, одинаково
 * при щелчке из нового вида «Ветки» и из старой панели глав. Значит дефект
 * не в виде, а в переводе координат (`player.ts`, `#toSegmentTime`).
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: убрать зажатие в окно главы
 * в `#toSegmentTime` (`Math.min(Math.max(...), duration)`) — позиция снова
 * станет отрицательной до старта, и редактор снова снимет себя с экрана.
 *
 * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет, и это главное. Проверяется не «глава
 * переключилась» (это верно всегда, когда переключение вообще работает),
 * а то, что редактор ОСТАЛСЯ НА ЭКРАНЕ. Фикстура выбрана та единственная,
 * где у главы есть своё окно в общем файле: на `demo` с нулевым окном
 * неверный код даёт верный ответ, потому что `0 − 0 = 0`.
 */
import { expect, test, type Page } from '@playwright/test';
import { openChapters } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/**
 * Дождаться, пока дорожка ДЕКОДИРОВАНА, и только потом щёлкать.
 *
 * Это не украшение и не борьба с гонкой: без ожидания тест ЗЕЛЁН ПРИ
 * СЛОМАННОМ КОДЕ. Пока часов нет, `positionSeconds` отдаёт ноль по другой
 * ветке (`#clock ? … : 0`), отрицательному числу взяться неоткуда, и падать
 * нечему. Проверено сломом 17.08.2026: без этой строки из трёх тестов
 * краснел один. Тест на несущее свойство обязан краснеть от слома предмета,
 * а не от удачи в расписании.
 */
async function waitTransportReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

test.describe('переключение главы с окном звука', () => {
  /**
   * ЧЕСТНО ПРО ЭТИ ДВА ТЕСТА: под Playwright они остаются ЗЕЛЁНЫМИ и при
   * сломанном коде — проверено сломом 17.08.2026, оба раза 2 passed.
   * Крах воспроизводится в живом Chrome рукой, но не в этом расписании.
   *
   * Оставлены не для доказательства, а как дешёвая сеть: если редактор
   * когда-нибудь начнёт сниматься с экрана при смене главы, они это скажут.
   * Доказывает починку ТРЕТИЙ тест, ниже, и только он.
   */
  test('щелчок по главе с ненулевым окном не снимает редактор с экрана', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));

    await openEditor(page, 'split-track');
    await waitTransportReady(page);

    // Контроль прибора: до щелчка редактор на месте. Без этого «остался
    // на экране» ничего не доказывало бы — он мог не появиться вовсе.
    await expect(page.locator('.ed-root')).toBeVisible();

    // `s-left` начинается на 2.5 с внутри общего файла — то самое окно,
    // из-за которого позиция уходила в минус.
    await openChapters(page);
    await page.getByTestId('segment-s-left').click();

    await expect(page.locator('.ed-root')).toBeVisible();
    expect(crashes).toEqual([]);
  });

  test('щелчок по плитке главы в виде «Ветки» — тот же путь, та же проверка', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));

    await openEditor(page, 'split-track');
    await waitTransportReady(page);
    await page.getByRole('button', { name: 'Ветки', exact: true }).click();

    // Плитка — видимая кнопка, и жмём именно по ней: проверка вызова
    // обработчика в этом проекте уже была зелёной при неработающем экране.
    await page.getByTestId('chapter-pick-s-left').click();

    await expect(page.locator('.ed-root')).toBeVisible();
    expect(crashes).toEqual([]);
  });

  /**
   * НЕСУЩИЙ ТЕСТ, и построен он так после двух неудачных попыток —
   * обе описаны здесь, потому что ошибка поучительнее результата.
   *
   * Попытка 1: щёлкнуть и посмотреть позицию один раз. Зелёная при сломанном
   * коде: пока часов нет, позиция идёт по другой ветке (`#pending`), и брать
   * отрицательному числу неоткуда.
   * Попытка 2: дождаться готовности дорожки и посмотреть один раз. Тоже
   * зелёная при сломанном коде: к моменту замера позиция уже устаканилась.
   *
   * Отрицательной позиция бывает НЕ ВСЁ ВРЕМЯ, а в промежутке между сменой
   * окна главы и первым движением головки. Один замер попадает в него
   * случайно — значит замер обязан быть не один. Выборка в кадре за секунду
   * ловит промежуток целиком.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убрать зажатие в окно в `transport.ts`
   * (`positionSeconds`) — минимум выборки станет −4, ровно окно `s-left`.
   *
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. На главе с нулевым окном неверный
   * код даёт верный ответ (`0 − 0 = 0`), поэтому фикстура взята та, где
   * окно ненулевое, и глава выбрана та, у которой оно равно четырём.
   */
  test('позиция головки в главе с окном ни в один кадр не уходит в минус', async ({ page }) => {
    await openEditor(page, 'split-track');
    await waitTransportReady(page);
    await openChapters(page);
    await page.getByTestId('segment-s-left').click();

    const minimum = await page.evaluate(async () => {
      const read = (): number =>
        (window as unknown as { __transport?: { positionSeconds: number } })
          .__transport?.positionSeconds ?? 0;
      let least = read();
      const until = performance.now() + 1000;
      while (performance.now() < until) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        least = Math.min(least, read());
      }
      return least;
    });

    expect(minimum).toBeGreaterThanOrEqual(0);
  });
});
