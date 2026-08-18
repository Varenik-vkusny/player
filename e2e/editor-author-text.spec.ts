/**
 * В тексте для автора нет ключей из схемы (Сессия 47, Задача 5).
 *
 * ЗАМЕРЕНО 18.08.2026, фикстура demo: метки на дорожке подписаны
 * «Слайд «node-1-slide-1»: морфинг, движение 0.30 с до метки» и
 * «Остановка «gate-choice»». Эти строки идут и в `title`, и в имя
 * для тех, кто метку не видит. `node-1-slide-1` и `gate-choice` —
 * ключи схемы: автор их не заводил и сопоставить ни с чем на экране
 * не может.
 *
 * Родня закрытому в Сессии 46 `var(--scene-surface…` в подписи элемента:
 * там в текст для человека протёк язык CSS, здесь — ключ схемы.
 *
 * ЧТО СЮДА НЕ ВХОДИТ. Сообщения `throw new Error(...)` не предмет: они
 * адресованы тому, кто чинит код, и обязаны называть предмет точно.
 * Имена ЭЛЕМЕНТОВ тоже: `elementName` показывает содержимое текста,
 * а при его отсутствии id, и эти id задаёт сам автор.
 *
 * ИСТОЧНИК ОЖИДАЕМОГО — данные проекта, а не тот код, что строит подписи.
 * Ключи берутся из `window.__project`; строй их тест сам, он был бы
 * зелен при любой реализации.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

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
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: в подпись метки
 * снова подставят `slide.id` или `gate.id`. На коде до починки красный
 * с перечислением обеих подписей.
 *
 * Собираются ВСЕ подписи и имена нижней зоны разом, а не две назначенные:
 * назначенная пара охраняла бы себя, а третье место протекло бы молча.
 */
test('текст для автора: подписи меток не содержат ключей схемы', async ({ page }) => {
  await openEditor(page);
  await expect(page.locator('.ed-track-column')).toBeVisible();

  const { keys, labels } = await page.evaluate(() => {
    const project = (window as unknown as {
      __project: {
        segments: { slides: { id: string }[]; gates: { id: string }[] }[];
      };
    }).__project;
    const segment = project.segments[0]!;
    const collected: string[] = [];
    for (const node of document.querySelectorAll('.ed-track-column [title], .ed-track-column [aria-label]')) {
      for (const attribute of ['title', 'aria-label']) {
        const value = node.getAttribute(attribute);
        if (value) {
          collected.push(
            `${attribute}=«${value}» у .${(node.className || '').toString().split(' ')[0] || node.tagName}`,
          );
        }
      }
    }
    return {
      keys: [...segment.slides.map((s) => s.id), ...segment.gates.map((g) => g.id)],
      labels: collected,
    };
  });

  // Положительный контроль прибора: подписи и ключи ВООБЩЕ нашлись.
  // Пустой список прошёл бы проверку ниже и означал бы «мерить было нечего».
  expect(labels.length, 'в нижней зоне не нашлось ни одной подписи').toBeGreaterThan(3);
  expect(keys.length, 'в проекте не нашлось ни слайдов, ни остановок').toBeGreaterThan(1);

  const leaked = labels.filter((label) => keys.some((key) => label.includes(key)));
  expect(
    leaked,
    `в тексте для автора протекли ключи схемы (${keys.join(', ')}):\n${leaked.join('\n')}`,
  ).toEqual([]);
});

/**
 * Обратная сторона той же монеты. Убрать ключ можно двумя способами:
 * назвать предмет по-человечески — или стереть упоминание вовсе. Второе
 * прошло бы предыдущий тест и оставило автора без опоры.
 *
 * Что должно сломаться, чтобы он покраснел: подпись метки перестанет
 * называть время (например, станет просто «Слайд: морфинг»).
 */
test('текст для автора: подпись метки называет слайд его временем', async ({ page }) => {
  await openEditor(page);

  /**
   * Отбор по УЗЛАМ МЕТОК, а не по началу текста. Первая версия брала любой
   * `title`, начинающийся со слова «Остановка», и хватала кнопку транспорта
   * «Остановка на этой секунде» — та не метка и времени называть не обязана.
   * Тест краснел на исправном продукте: отбор врал, а не предмет.
   */
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="mark-slide-"], [data-testid^="mark-gate-"]')]
      .map((node) => node.getAttribute('title') ?? '')
      .filter((title) => title !== ''),
  );

  expect(titles.length, 'подписей меток не нашлось — проверять нечего').toBeGreaterThan(1);

  const slideTitles = titles.filter((title) => title.startsWith('Слайд'));
  expect(slideTitles.length, 'подписей слайдов не нашлось').toBeGreaterThan(0);
  for (const title of slideTitles) {
    expect(title, `подпись «${title}» не называет времени слайда`).toMatch(/\d+\.\d{2} с/u);
  }

  // Остановка названа своим вопросом либо, если вопрос пуст, временем —
  // но не пустым местом.
  const stopTitles = titles.filter((title) => !title.startsWith('Слайд'));
  expect(stopTitles.length, 'подписей остановок не нашлось').toBeGreaterThan(0);
  for (const title of stopTitles) {
    expect(
      title,
      `подпись остановки «${title}» ничего не называет: ни вопроса, ни времени`,
    ).toMatch(/«.+»|\d+\.\d{2} с/u);
  }
});
