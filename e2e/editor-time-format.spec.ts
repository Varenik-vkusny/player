/**
 * Одно и то же время — одной записью (Сессия 47, Задача 4).
 *
 * ЧТО БЫЛО ИЗМЕРЕНО 18.08.2026 на ОДНОМ экране редактора, фикстура demo:
 *
 *   часы транспорта      00:00.0
 *   счётчик ленты        1 / 15 · 0.00 с
 *   чип слайда           0.00 с
 *   строка причины       ... (получено 0.000 с)
 *
 * Нулевая секунда, написанная тремя способами сразу. Автор не может понять,
 * одно это число или разные.
 *
 * ПРАВИЛО, КОТОРОЕ ЗДЕСЬ ОХРАНЯЕТСЯ, — НЕ «ВЕЗДЕ ОДИНАКОВО». Перепись
 * показала, что часть разнобоя осмысленна: часы транспорта читаются как
 * часы (`MM:SS.S`), поля ввода панели метки пишут число с запятой по
 * русской раскладке, а сообщения `throw` держат три знака для того, кто
 * чинит код. Свести их значило бы сломать три разных случая ради
 * единообразия.
 *
 * Охраняется ровно один случай — ТОТ, В КОТОРОМ БЫЛ РАЗНОБОЙ: момент или
 * длительность в секундах, показанные автору подписью. Такая подпись
 * обязана выглядеть как `N.NN с` везде, где встречается.
 *
 * Почему два знака — выведено, а не выбрано: две метки не могут стоять
 * ближе, чем MARK_HIT_SECONDS = 0.01 с, поэтому два знака различают любые
 * две метки, какие модель допускает, а третий показывал бы разряд,
 * в котором различий не бывает. Разбор — в packages/editor/src/timeText.ts.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * Подпись секунд: число, пробел, «с». Двоеточие часов сюда не попадает
 * намеренно — `00:00.0` это другой случай (см. шапку файла).
 */
const SECONDS_LABEL = /(\d+)([.,])(\d+)\s+с(?![а-яё])/gu;

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

/**
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: любое место,
 * где секунды снова напишут с другим числом знаков или с другим
 * разделителем. Проверено сломом: возврат `toFixed(3)` в строке причины
 * (`state/slides.ts`) даёт «0.000 с» и красное с указанием места.
 *
 * Собираются ВСЕ подписи разом, а не две назначенные: назначенная пара
 * охраняла бы себя, а третье место могло бы разойтись молча — именно так
 * разнобой и накопился.
 */
test('время для автора: все подписи секунд на экране написаны одинаково', async ({ page }) => {
  await openEditor(page);

  await expect(page.getByTestId('slide-clipboard-note')).toBeVisible();

  /**
   * ПРИЧИНУ НАДО ВЫЗВАТЬ, А НЕ ЖДАТЬ. Куплено сломом 18.08.2026: сперва
   * тест просто читал то, что оказалось на экране, и возврат `toFixed(3)`
   * в ветке «на этой секунде уже стоит слайд» он НЕ ЗАМЕТИЛ — на нетронутом
   * проекте видны совсем другие причины (головка на нуле и пустой буфер),
   * а та ветка не выполняется вовсе. Проверка охраняла бы места, до которых
   * случайно дошла, — то есть не охраняла бы ничего.
   *
   * Поэтому: выбрать слайд НЕ на нуле (иначе сработает ветка «начало главы
   * занято») и наполнить буфер. Тогда «Вставить» гаснет именно с той
   * причиной, где секунды и писались тремя знаками.
   */
  await page.getByTestId('slide-node-1-slide-2').click();
  await page.getByTestId('slide-copy').click();
  await expect(
    page.getByTestId('slide-clipboard-note'),
    'ветка «уже стоит слайд» не выполнилась — тест не дошёл до места, ради которого написан',
  ).toContainText('уже стоит слайд');

  const found = await page.evaluate(
    ({ source, flags }) => {
      const pattern = new RegExp(source, flags);
      const seen: { text: string; where: string }[] = [];
      const roots = ['.ed-track-column', '.ed-slide-panel'];
      for (const root of roots) {
        const node = document.querySelector(root);
        if (!node) throw new Error(`нет узла ${root}`);
        // Обходятся ЛИСТЬЯ, а не innerText целиком: иначе одно и то же
        // вхождение считалось бы много раз (у предка и у потомка), и место
        // в сообщении назвать было бы нечем.
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
          const text = (current.textContent ?? '').trim();
          if (text) {
            for (const match of text.matchAll(pattern)) {
              const owner = current.parentElement;
              seen.push({
                text: match[0],
                where: `${root} → ${(owner?.className || '').toString().split(' ')[0] || owner?.tagName || '?'}`,
              });
            }
          }
          current = walker.nextNode();
        }
      }
      return seen;
    },
    { source: SECONDS_LABEL.source, flags: SECONDS_LABEL.flags },
  );

  // Положительный контроль: подписи ВООБЩЕ нашлись. Пустой список прошёл бы
  // любую проверку ниже, и «формат единый» означало бы «мерить было нечего».
  expect(
    found.length,
    'на экране не нашлось ни одной подписи секунд — проверять нечего, прибор врёт',
  ).toBeGreaterThan(1);

  const wrong = found.filter(({ text }) => {
    const match = /(\d+)([.,])(\d+)/u.exec(text);
    if (!match) return true;
    return match[2] !== '.' || match[3]!.length !== 2;
  });

  expect(
    wrong,
    `подписи секунд написаны по-разному. Ожидается N.NN с. Нашлось: `
    + found.map((item) => `«${item.text}» (${item.where})`).join('; '),
  ).toEqual([]);
});

/**
 * Часы транспорта — ДРУГОЙ случай, и этот тест держит границу: сводить
 * их к «N.NN с» было бы ошибкой, а не улучшением.
 *
 * Что должно сломаться, чтобы он покраснел: кто-нибудь «доунифицирует»
 * часы до подписи секунд. Тест назовёт это вслух, а не даст молча
 * отобрать у автора привычный вид положения в дорожке.
 */
test('время для автора: часы транспорта остаются часами, а не подписью секунд', async ({ page }) => {
  await openEditor(page);
  const clock = await page.getByTestId('track-clock').textContent();
  expect(clock, 'часы транспорта пусты').toBeTruthy();
  expect(
    clock!.trim(),
    `часы транспорта показывают «${clock}» — ожидался вид MM:SS.S / MM:SS.S`,
  ).toMatch(/^\d{2}:\d{2}\.\d\s*\/\s*\d{2}:\d{2}\.\d$/u);
});
