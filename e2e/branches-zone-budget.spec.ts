/**
 * Бюджет высоты нижней зоны в виде «Ветки»: сцена не имеет права исчезнуть.
 *
 * ЭТО ПРОДОЛЖЕНИЕ track-zone-budget.spec.ts, А НЕ ЕГО КОПИЯ. Сессия 47
 * поставила зоне потолок и записала прямо в styles.ts, что поставила его
 * ТОЛЬКО «Дорожкам»: «Что "Ветки" съедают холст сильнее допустимого
 * (на 1280x800 холсту остаётся 146 px) — отдельная находка, и она
 * записана, а не исправлена мимоходом». Здесь эта находка закрывается.
 *
 * ЧТО СЛОМАНО. Высота полотна веток задана правилом .ed-branches-space
 * числом 55vh — то есть растёт вместе с окном и ни на что не оглядывается.
 * Зона в «Ветках» = полотно + шапка зоны, а сцена получает то, что осталось
 * от строки 1fr, и пола у неё в этом виде нет.
 *
 * Замерено мной в живом Chromium 18.08.2026, фикстура demo, ширина 1280:
 *
 *   окно 800  «Дорожки» зона 306  холст 344  |  «Ветки» зона 504  холст 146
 *   окно 720  «Дорожки» зона 306  холст 264  |  «Ветки» зона 460  холст 110
 *   окно 660  «Дорожки» зона 306  холст 204  |  «Ветки» зона 427  холст  83
 *
 * То есть переключение вида — один щелчок по кнопке «Ветки» — отнимает
 * у холста больше половины его высоты, и на ноутбуке от сцены остаётся
 * полоска. `branches.md` §3 разрешает растягивать зону в «Ветках» («там
 * не рисуют на холсте»), но там же несущим свойством записано: «Холст
 * сверху не гаснет и не закрывается НИ В ОДНОМ из видов». 146 px из 800 —
 * это и есть закрытый холст, просто не до нуля.
 *
 * ПОЧЕМУ ЭТОГО НЕ ЛОВИЛ НИ ОДИН ТЕСТ. Все прежние замеры бюджета зоны
 * снимались в «Дорожках» — виде по умолчанию. В «Ветках» высоту зоны
 * не мерил никто.
 */
import { expect, test, type Page } from '@playwright/test';

/** Пол сцены по высоте: 1080/6, та же доля, что у --ed-stage-min (320/1920). */
const STAGE_MIN_H = 180;

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function heights(page: Page): Promise<{
  window: number;
  stageHost: number;
  zone: number;
  space: number;
}> {
  return page.evaluate(() => {
    const node = (selector: string): Element => {
      const found = document.querySelector(selector);
      if (!found) throw new Error(`нет узла ${selector}`);
      return found;
    };
    const h = (selector: string): number => node(selector).getBoundingClientRect().height;
    return {
      window: window.innerHeight,
      stageHost: h('.ed-stage-host'),
      zone: h('.ed-track-column'),
      space: h('.ed-branches-space'),
    };
  });
}

/**
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: снятие потолка
 * с зоны в виде «Ветки» — например возврат .ed-branches-space к голому
 * height: 55vh без оглядки на пол сцены. На коде до починки даёт
 * 146 / 110 / 83 px против порога 180.
 *
 * Три окна одним тестом НАМЕРЕННО: дефект тем сильнее, чем ниже окно,
 * и порог обязан ловить всю тройку, а не самое удобное из них.
 */
for (const height of [800, 720, 660]) {
  test(`ветки: переключив вид на ${height} px высоты, автор не остаётся без сцены`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height });
    await openEditor(page);

    // Положительный контроль ДО жеста: в виде по умолчанию сцена цела.
    // Без него «сцена мала» и «редактор не открылся» выглядят одинаково.
    const before = await heights(page).catch(async () =>
      // В «Дорожках» полотна веток нет — меряем без него.
      page.evaluate(() => ({
        window: window.innerHeight,
        stageHost: document.querySelector('.ed-stage-host')!.getBoundingClientRect().height,
        zone: document.querySelector('.ed-track-column')!.getBoundingClientRect().height,
        space: -1,
      })),
    );
    expect(
      before.stageHost,
      `до переключения вида сцена уже мала (${before.stageHost} px) — прибор врёт`,
    ).toBeGreaterThanOrEqual(STAGE_MIN_H);

    await page.getByTestId('view-branches').click();

    // Вид ДЕЙСТВИТЕЛЬНО переключился. Без этой проверки тест зелен, когда
    // кнопка перестала работать вовсе: «Дорожки» остались на месте, сцена
    // цела, и зелень получена по неверной причине.
    await expect(page.getByTestId('branches-view')).toBeVisible();

    const after = await heights(page);
    expect(
      after.space,
      'полотно веток не нашлось — тест мерил бы не тот вид',
    ).toBeGreaterThan(0);
    expect(
      after.zone,
      'зона не выросла при переключении — значит вид не тот, и тест ничего не проверяет',
    ).toBeGreaterThan(before.zone);

    expect(
      after.stageHost,
      `сцена ужата до ${after.stageHost} px при поле ${STAGE_MIN_H}: переключив вид на «Ветки», автор остался без холста (зона ${after.zone}, полотно ${after.space})`,
    ).toBeGreaterThanOrEqual(STAGE_MIN_H);
  });
}

/**
 * ОХРАНА ТОГО, ЧТО ПОЧИНКА НЕ ПЕРЕУСЕРДСТВОВАЛА. `branches.md` §3 прямо
 * разрешает зоне «Веток» быть выше, чем у «Дорожек»: «В "Ветках" её можно
 * растянуть — там не рисуют на холсте». Потолок обязан ограничить рост,
 * а не сравнять два вида.
 *
 * Что должно сломаться, чтобы покраснел: замена высоты полотна на общую
 * с «Дорожками» (например flex: 1 без своего правила) — тогда зона веток
 * сравняется с зоной дорожек и этот тест покраснеет, хотя предыдущие
 * останутся зелёными.
 */
test('ветки: зона по-прежнему выше, чем у дорожек', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  const tracks = await page.evaluate(
    () => document.querySelector('.ed-track-column')!.getBoundingClientRect().height,
  );

  await page.getByTestId('view-branches').click();
  await expect(page.getByTestId('branches-view')).toBeVisible();
  const branches = await page.evaluate(
    () => document.querySelector('.ed-track-column')!.getBoundingClientRect().height,
  );

  expect(
    branches,
    `зона «Веток» (${branches}) не выше зоны «Дорожек» (${tracks}) — потолок съел то, что branches.md §3 разрешает`,
  ).toBeGreaterThan(tracks);
});
