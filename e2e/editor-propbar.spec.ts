/**
 * Полоса свойств над холстом: она прокручивается — и обязана об этом сказать.
 *
 * Замер 18.08.2026 (окно 1280, каталог открыт — состояние, в котором редактор
 * открывается): полосе нужно 1276 px, достаётся 586. За краем остаются все
 * тринадцать кнопок выравнивания, раскладки, слоёв и формата и кнопка «Ещё…» —
 * единственная дверь ко всем остальным свойствам. До Сессии 46 об этом
 * не сообщал НИ ОДИН видимый признак.
 *
 * Проверяется здесь именно НЕВИДИМОСТЬ, а не переполнение. Переполнение
 * законно: органов больше, чем ширины, и перестановкой это не решается —
 * из нужных 1276 px одни поля стиля занимают 697 при доступных 586, то есть
 * не помещаются и без единой кнопки. Незаконно молчать о переполнении.
 *
 * Полоса прокрутки признаком НЕ считается и потому не проверяется: в каркасе
 * (design/shell.css) у .propbar прямо стоит scrollbar-width: none, а там, где
 * браузер её рисует, она накладная и тает через секунду после жеста. Признак,
 * который виден только тому, кто уже прокрутил, ничего не сообщает тому, кто
 * не знает, что можно.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function openWithSelection(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.getByTestId('element-row-title').click();
  await expect(page.getByTestId('propbar')).toBeVisible();
}

/** clientWidth / scrollWidth самой полосы. */
async function barSize(page: Page): Promise<{ client: number; scroll: number }> {
  return page.evaluate(() => {
    const bar = document.querySelector('.ed-propbar');
    if (!bar) throw new Error('полоса свойств не найдена — тест мерил бы пустоту');
    return { client: bar.clientWidth, scroll: bar.scrollWidth };
  });
}

/**
 * Что должно сломаться, чтобы покраснел: убрать признак продолжения
 * (например, заставить ScrollStrip никогда не показывать стрелку конца) —
 * тест краснеет, хотя прокрутка работает и все органы «нажимаются».
 *
 * Пустым он быть не может: положительный контроль требует, чтобы полоса
 * на этом окне ДЕЙСТВИТЕЛЬНО не помещалась. Начни она помещаться —
 * покраснеет контроль, а не проверка, и это будет видно по сообщению.
 */
test('полоса свойств не прячет органы молча', async ({ page }) => {
  await openWithSelection(page);

  const size = await barSize(page);
  expect(
    size.scroll,
    `полоса помещается целиком (${size.client} из ${size.scroll}) — признак продолжения проверять не на чем`,
  ).toBeGreaterThan(size.client);

  const arrow = page.getByTestId('propbar-scroll-end');
  await expect(arrow, 'полоса не помещается, а признака продолжения нет').toBeVisible();

  // «Видна» по Playwright — это непустой бокс. Человеку же нужно, чтобы
  // в неё попадал указатель: проверяем, что в середине стрелки лежит она
  // сама, а не что-то поверх неё.
  const onTop = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="propbar-scroll-end"]');
    if (!el) throw new Error('стрелки нет');
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { covered: !el.contains(hit), by: hit?.className ?? '(ничего)' };
  });
  expect(onTop.covered, `стрелка накрыта: ${onTop.by}`).toBe(false);
});

/**
 * Признак обязан не только виднеться, но и ВЕСТИ: стрелка доводит до «Ещё…» —
 * до той самой двери, которая при открытии редактора лежит за краем.
 *
 * Что должно сломаться, чтобы покраснел: стрелка перестаёт прокручивать
 * (шаг 0, потерянный обработчик) — дверь так и остаётся за краем.
 *
 * Промежуточная проверка «до нажатия дверь ДЕЙСТВИТЕЛЬНО не видна» стоит
 * здесь не для красоты: без неё тест остался бы зелёным и в том случае,
 * когда прокручивать нечего, — то есть проверял бы тождество.
 */
test('стрелка продолжения доводит до кнопки «Ещё…»', async ({ page }) => {
  await openWithSelection(page);

  const doorVisible = async (): Promise<boolean> =>
    page.evaluate(() => {
      const bar = document.querySelector('.ed-propbar');
      const door = document.querySelector('[data-testid="propbar-more"]');
      if (!bar || !door) throw new Error('полоса или дверь «Ещё…» не найдены');
      const b = bar.getBoundingClientRect();
      const d = door.getBoundingClientRect();
      return d.left >= b.left - 1 && d.right <= b.right + 1;
    });

  expect(await doorVisible(), 'дверь «Ещё…» видна сразу — прокручивать нечего').toBe(false);

  // Полоса шире экрана на 690 px, а шаг стрелки — 80 % видимого: одного
  // нажатия не хватает по построению, и это не «на всякий случай».
  for (let i = 0; i < 4 && !(await doorVisible()); i += 1) {
    await page.getByTestId('propbar-scroll-end').click();
    await page.waitForTimeout(400); // прокрутка плавная
  }

  expect(await doorVisible(), 'стрелка не довела до «Ещё…»').toBe(true);
});

/**
 * Кнопки полосы не сжимаются молча.
 *
 * Замер 18.08.2026 ДО починки: при окне 1280 все тринадцать кнопок стояли
 * 16x28 вместо заданных 28x28 (при 1440 — 17x28, свои 28 они получали только
 * при окне 1900). Строка гибкая, а запрета сжиматься у кнопки не было, и она
 * ужималась до min-content своего значка вместо того, чтобы честно переполнить
 * строку. Мишень теряла 43 % ширины и уходила ниже MIN_TILE_PX (24).
 *
 * Что должно сломаться, чтобы покраснел: снять flex: 0 0 auto
 * у .ed-propbar-btn — кнопки снова становятся 16 px широкими.
 */
test('кнопки полосы не сжимаются под нехватку ширины', async ({ page }) => {
  await openWithSelection(page);

  const probe = await page.evaluate(() => {
    const bar = document.querySelector('.ed-propbar');
    if (!bar) throw new Error('полоса свойств не найдена');
    const widths = Array.from(bar.querySelectorAll('.ed-propbar-btn')).map((b) =>
      Math.round(b.getBoundingClientRect().width),
    );
    return { widths, client: bar.clientWidth, scroll: bar.scrollWidth };
  });

  // Положительный контроль: кнопки есть, и ширины на всех не хватает —
  // иначе сжиматься было бы не от чего и проверка ничего не значила бы.
  expect(probe.widths.length, 'кнопок на полосе нет').toBeGreaterThan(10);
  expect(probe.scroll, 'полоса помещается — сжимать её нечему').toBeGreaterThan(probe.client);

  const narrowest = Math.min(...probe.widths);
  expect(narrowest, `самая узкая кнопка ${narrowest} px при заданных 28`).toBe(28);
});

/**
 * Список шрифтов не обрезает собственное выбранное значение.
 *
 * До Сессии 46 на эталоне chrome-propbar было видно «Georgia (с засечками»
 * без закрывающей скобки: потолок поля стоял на 168 px, а полю нужно 196.
 * Обрезка тут особенно скверная тем, что режет ЗНАЧЕНИЕ, а не подпись:
 * автор читает не то, что выбрал.
 *
 * Меряем не «сколько нужно тексту» (это гадание про отступы и стрелку
 * списка, разные у каждого движка), а сравниваем с ЗАВЕДОМЫМ «да»:
 * тот же список, распущенный по содержимому. Если распущенный шире
 * нарисованного — значит нарисованный режет.
 *
 * ⚠️ Первая редакция этой проверки была ДЕКОРАТИВНОЙ, и это выяснилось
 * сломом, а не рассуждением. Она распускала сам список (select.style.width
 * = 'auto') — но ширину режет не он, а потолок max-width его РОДИТЕЛЯ,
 * и «распущенный» упирался в тот же потолок. Тест сравнивал число с самим
 * собой и оставался зелёным при возвращённом потолке 168.
 *
 * Поэтому образец — отдельный узел: копия списка, положенная в того же
 * родителя (чтобы достались те же правила оформления: кегль, отступы,
 * высота), но абсолютом и без потолка — то есть вне тесноты, которую
 * проверяем.
 *
 * Что должно сломаться, чтобы покраснел: вернуть max-width: 168px
 * у .ed-propbar-field.
 */
test('список шрифтов не режет своё же выбранное значение', async ({ page }) => {
  await openWithSelection(page);

  const probe = await page.evaluate(() => {
    const select = document.querySelector('.ed-propbar-field select');
    if (!(select instanceof HTMLSelectElement)) throw new Error('списка шрифтов на полосе нет');
    const chosen = select.options[select.selectedIndex]?.text ?? '';
    const actual = Math.round(select.getBoundingClientRect().width);

    const host = select.parentElement;
    if (!host) throw new Error('у списка нет родителя — образец негде положить');
    const sample = select.cloneNode(true) as HTMLSelectElement;
    sample.removeAttribute('id');
    sample.style.cssText =
      'position:absolute;left:0;top:0;visibility:hidden;width:auto;max-width:none';
    host.appendChild(sample);
    const natural = Math.round(sample.getBoundingClientRect().width);
    sample.remove();
    return { chosen, actual, natural };
  });

  // Положительный контроль прибора: распущенный список ДОЛЖЕН быть шире нуля,
  // иначе «не режет» означало бы «мерить нечего».
  expect(probe.natural, 'ширина списка по содержимому нулевая — прибор врёт').toBeGreaterThan(50);
  expect(
    probe.actual,
    `вариант «${probe.chosen}»: нарисовано ${probe.actual} px при нужных ${probe.natural}`,
  ).toBeGreaterThanOrEqual(probe.natural);
});
