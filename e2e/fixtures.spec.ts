/**
 * Скриншотная регрессия эталонных фикстур.
 *
 * Остальные тесты спрашивают у продукта, что он думает: какое состояние,
 * какая позиция, вызвался ли обработчик. Здесь спрашивается единственное,
 * ради чего всё это существует, — что зритель видит на экране. Ловятся
 * поломки, которые не рвут ни одного утверждения о поведении: съехавшая
 * раскладка, потерянный стиль, анимация, отработавшая не на своей секунде.
 *
 * Список фикстур не записан руками, а читается из fixtures/projects.
 * Иначе новая эталонная фикстура остаётся без охраны до тех пор, пока
 * кто-нибудь не вспомнит дописать её сюда, — а вспоминают редко.
 *
 * Моменты снимков — доли длительности, а не круглые секунды. У minimal.json
 * дорожка 4 с, у demo.json — 48.6 с; фиксированные «0, 5, 10» проверяли бы
 * у одной фикстуры всё, а у другой — первые проценты и ничего дальше.
 *
 * Ошибки страницы проверяются наравне с картинкой. Битая фикстура и упавшая
 * валидация дают чёрный снимок, а не красный тест; при первом прогоне такой
 * снимок молча станет эталоном, и дальше тест будет вечнозелёным и пустым.
 */
import { readFileSync, readdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

const FIXTURES_DIR = new URL('../fixtures/projects/', import.meta.url);

/** Доли длительности: начало, три четверти и самый конец дорожки. */
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * Длительность дорожки фикстуры.
 *
 * Разбор ручной и придирчивый: файл читается в обход схемы, на этапе сборки
 * списка тестов, и молчаливое `undefined` здесь превратилось бы в снимок
 * с именем `NaN` вместо внятной ошибки.
 */
function durationOf(fixture: string): number {
  const file = new URL(`${fixture}.json`, FIXTURES_DIR);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  if (typeof parsed !== 'object' || parsed === null || !('audio' in parsed)) {
    throw new Error(`В фикстуре ${fixture}.json нет поля audio`);
  }
  const audio: unknown = parsed.audio;
  if (typeof audio !== 'object' || audio === null || !('duration' in audio)) {
    throw new Error(`В фикстуре ${fixture}.json нет audio.duration`);
  }
  const duration: unknown = audio.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`У фикстуры ${fixture}.json негодная длительность: ${String(duration)}`);
  }
  return duration;
}

/** Времена снимков одной фикстуры, строками — одно значение и в адрес, и в имя эталона. */
function momentsOf(fixture: string): string[] {
  const duration = durationOf(fixture);
  // Округление до миллисекунды обязательно: 48.6 × 0.75 в двоичной
  // арифметике даёт 36.449999999999996, и имя эталона зависело бы от неё.
  return FRACTIONS.map((fraction) => (duration * fraction).toFixed(3));
}

// Сортировка не косметика: readdir отдаёт порядок файловой системы, и без неё
// имена тестов зависели бы от того, на какой машине их читают.
const FIXTURES: readonly string[] = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  .sort();

// Пустой список — это не «ноль тестов», а сломанный путь до фикстур.
// Молчаливо зелёный прогон без единого снимка хуже красного.
if (FIXTURES.length === 0) {
  throw new Error(`В ${FIXTURES_DIR.pathname} не нашлось ни одной фикстуры`);
}

/** Открывает оснастку на моменте и требует, чтобы страница обошлась без ошибок. */
async function openMoment(page: Page, fixture: string, at: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  // fonts=test включает подмену шрифтов. Она нужна именно здесь, где эталон
  // хранится: иначе набор шрифтов Windows против набора Ubuntu сделает его
  // недетерминированным по причине, не связанной с кодом (ADR-006).
  await page.goto(`/preview.html?fixture=${fixture}&t=${at}&fonts=test`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });

  expect(errors, `${fixture} на ${at} с открылась с ошибками`).toEqual([]);
}

test.describe('скриншотная регрессия эталонных фикстур', () => {
  // Вьюпорт задаётся здесь, а не берётся из конфига: 1280×720 — то же
  // отношение сторон, что у логической сцены 1920×1080, поэтому масштаб
  // выходит ровно 2/3 и полос по краям не появляется. deviceScaleFactor: 1
  // отвязывает эталон от того, как настроен монитор снимавшей машины.
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  for (const fixture of FIXTURES) {
    for (const at of momentsOf(fixture)) {
      test(`${fixture}: сцена на ${at} с совпадает с эталоном`, async ({ page }) => {
        await openMoment(page, fixture, at);

        // Снимок берётся с контейнера, а не со страницы: его размер задан
        // вьюпортом, поэтому смысл эталона не поедет, если на странице
        // однажды появится что-нибудь ещё.
        await expect(page.locator('#stage-host')).toHaveScreenshot(`${fixture}-${at}.png`);
      });
    }
  }
});
