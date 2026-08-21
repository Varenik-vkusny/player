/**
 * Развилка одним потоком: автор нажимает и ПОНИМАЕТ, что получилось.
 *
 * Куплено 18.08.2026: владелец — создатель продукта — нажал «разделить
 * здесь» и не понял, что произошло. Замерено (Сессия 51, задача Б1 шаг 1):
 * после разреза на экране появляется РОВНО НОЛЬ подсказок. Меняется только
 * список глав в правой колонке, куда автор в этот момент не смотрит: он
 * смотрит на дорожку, по которой только что щёлкнул.
 *
 * Модель при этом верна и меняться не должна. Разрез по времени даёт ШОВ:
 * голова уходит в продолжение безусловным «иначе» (`state/split.ts`,
 * «Веток не рождается: развилки здесь нет, есть шов»). Выбор — это другое
 * устройство: остановка записывает ответ, а куда идти, решает выход главы
 * (ADR-015). Чинится ПОКАЗ, а не устройство.
 *
 * Строка ВИДИМАЯ, а не `title`: в проекте записано измерением, что на
 * подсказки при наведении не смотрят, а пометка, положенная в подпись,
 * находится `getByLabel` и не доходит до автора вовсе — три зелёных e2e
 * при пустом экране.
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Заголовки взяты из `fixtures/projects/exit-branch.json` ДОСЛОВНО, а не из
 * `window.__project`. Источник ожидаемого обязан быть другим, чем источник
 * полученного: сверка строки представления с тем же состоянием, из которого
 * она построена, зелена при любой реализации (правило навыка `editor-ui` §4).
 */
const HEAD_TITLE = 'Спрашивает и доигрывает до конца';
const TAIL_TITLE = 'Спрашивает и доигрывает до конца — продолжение';

async function openEditor(page: Page, fixture: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

/**
 * Режет текущую главу в долях её дорожки — так же, как это делает человек.
 * Кнопка «разделить здесь» убрана в Сессии 55: разрез теперь пункт меню
 * правой кнопки по пустому месту дорожки (`ctxmenu-split-here`), и сам
 * правый щелчок заодно перематывает головку в точку щелчка.
 */
async function splitAt(page: Page, ratio: number): Promise<void> {
  const lane = await page.getByTestId('track-lane').boundingBox();
  if (!lane) throw new Error('дорожка не видна');
  await page.mouse.click(lane.x + lane.width * ratio, lane.y + lane.height / 2, { button: 'right' });
  await expect(page.getByTestId('ctxmenu-split-here')).toHaveAttribute('aria-disabled', 'false');
  await page.getByTestId('ctxmenu-split-here').click();
}

/** Размеры узла своими глазами: «нажимается ли» видимости не доказывает. */
const boxOf = (page: Page, testid: string) =>
  page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
      display: style.display,
      visibility: style.visibility,
      clipPath: style.clipPath,
      opacity: style.opacity,
    };
  }, testid);

test.describe('Б1: после разреза автор знает, что получилось и что дальше', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: снятая отрисовка строки; строка,
   * убранная в атрибут `title`; строка, не называющая ВТОРУЮ главу (то есть
   * не говорящая, что именно получилось); строка, спрятанная `display: none`
   * или схлопнутая в ноль высоты.
   *
   * Проверка «строки нет ДО разреза» стоит здесь не для полноты: без неё
   * тест был бы зелен и на реализации, которая держит эту строку на экране
   * всегда — то есть на реализации, ничего автору не сообщающей.
   */
  test('строка называет обе главы и следующий шаг, и до разреза её нет', async ({ page }) => {
    const errors = await openEditor(page, 'exit-branch');

    await expect(page.getByTestId('split-result')).toHaveCount(0);

    await splitAt(page, 0.5);

    const line = page.getByTestId('split-result');
    await expect(line).toBeVisible();

    // Что получилось: обе половины названы по имени. Без второго имени
    // строка говорила бы «что-то произошло», а это и есть нынешняя беда.
    await expect(line).toContainText(HEAD_TITLE);
    await expect(line).toContainText(TAIL_TITLE);

    // Что это НЕ выбор: слово, отделяющее шов от развилки.
    await expect(line).toContainText('шов');

    // Что дальше: следующий шаг назван действием, а не намёком.
    await expect(line).toContainText('остановк');

    expect(errors).toEqual([]);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: любая реализация, у которой строка есть в DOM,
   * но зритель её не видит — нулевая высота, `clip-path`, прозрачность,
   * `display: none`. Ровно этот класс дефекта в проекте уже находили:
   * `scrollWidth 73` при `clientWidth 1`, три зелёных e2e при пустом экране.
   */
  test('строка не просто в DOM, а имеет размер и не обрезана', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await splitAt(page, 0.5);

    const box = await boxOf(page, 'split-result');
    expect(box).not.toBeNull();
    expect(box!.display).not.toBe('none');
    expect(box!.visibility).toBe('visible');
    expect(Number(box!.opacity)).toBeGreaterThan(0.5);
    expect(box!.clipPath === 'none' || box!.clipPath === 'auto').toBe(true);

    // Высоты хватает на строку текста; ширина — на осмысленную длину.
    expect(box!.clientHeight).toBeGreaterThan(14);
    expect(box!.clientWidth).toBeGreaterThan(200);

    // Текст помещается целиком, а не срезан по вертикали: строка обязана
    // переноситься, а не прятать хвост под потолком высоты.
    expect(box!.scrollHeight).toBeLessThanOrEqual(box!.clientHeight + 1);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: строка, «прибитая» к первому разрезу и не
   * пересчитывающаяся, — например, запомненная в `useState` один раз
   * и не обновлённая на втором разрезе. Автор увидел бы имена от прошлого
   * действия и поверил бы им.
   */
  test('на втором разрезе строка называет НОВЫЕ главы, а не прошлые', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    await splitAt(page, 0.5);
    await expect(page.getByTestId('split-result')).toContainText(TAIL_TITLE);

    // Режем ту же голову ещё раз: имя продолжения обязано стать другим,
    // потому что прежнее уже занято (`freeTailTitle`, state/split.ts).
    await splitAt(page, 0.5);

    const text = (await page.getByTestId('split-result').textContent()) ?? '';
    expect(text).toContain(HEAD_TITLE);
    // Второе продолжение получает СВОЁ имя — строка обязана назвать его,
    // а не повторить имя первого.
    expect(text).not.toBe('');
    const titles: string[] = await page.evaluate(() =>
      (window as unknown as { __project: { segments: { title: string }[] } })
        .__project.segments.map((s) => s.title));
    const newest = titles.filter((t) => t.startsWith(TAIL_TITLE)).sort().at(-1)!;
    expect(newest).not.toBe(TAIL_TITLE);
    expect(text).toContain(newest);
  });
});

/**
 * Заголовки глав — ДОСЛОВНО из фикстур, не из `window.__project`.
 * `fixtures/projects/exit-branch.json`, `inline-explain.json`, `conditions.json`.
 */
const RIGHT_TITLE = 'Направо';
const LEFT_TITLE = 'Налево';
const DEFAULT_TITLE = 'Спрашивает, куда двигаться, и часть вариантов прячет';

/** Открывает панель остановки, щёлкнув по её метке на дорожке. */
async function selectGate(page: Page, gateId: string): Promise<void> {
  await page.getByTestId(`mark-gate-${gateId}`).click();
  // Ждём КАРТОЧКУ, а не панель: с Сессии 55 «куда ведёт ответ» и «завести
  // ветку» живут в карточке остановки над её меткой. В панели их больше нет
  // намеренно — два места, правящих одно значение, это два места, куда автор
  // может написать разное.
  await expect(page.getByTestId('stop-card')).toBeVisible();
}

/**
 * ЧТО ВИДИТ АВТОР рядом с ответом — одной строкой, независимо от того, как
 * это показано.
 *
 * У ответа со своим правилом главу называет ВЫБРАННЫЙ ПУНКТ списка; у ответа
 * без правила — строка под списком. Проверять надо утверждение «автор видит,
 * куда ведёт», а не то, каким органом оно показано, — иначе тест охраняет
 * разметку вместо свойства продукта.
 *
 * Текст списка берётся у ВЫБРАННОГО пункта, а не у всего узла: `textContent`
 * у `select` склеивает подписи ВСЕХ пунктов, и проверка «содержит имя главы»
 * была бы зелёной, даже если выбрана совсем другая.
 */
async function gotoText(page: Page, index: number): Promise<string> {
  const select = page.getByTestId(`stopcard-option-goto-${index}`);
  if (await select.count()) {
    const picked = await select.evaluate(
      (node) => (node as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
    );
    const note = page.getByTestId(`stopcard-option-goto-note-${index}`);
    const noteText = (await note.count()) ? ((await note.textContent()) ?? '') : '';
    return `${picked} ${noteText}`.trim();
  }
  // Сложное условие: списка нет вовсе, стоит честная строка.
  return (await page.getByTestId(`stopcard-option-complex-${index}`).textContent()) ?? '';
}

test.describe('Б2: у варианта ответа видно, куда он ведёт', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снятая отрисовка ответа; ответ, одинаковый
   * у всех вариантов (то есть не считающий назначение, а рисующий заглушку);
   * ответ, называющий id главы вместо её заголовка.
   *
   * Проверяются ОБА варианта разными именами: реализация, печатающая одно
   * и то же рядом с каждым, прошла бы проверку одного варианта.
   */
  test('вариант с правилом называет главу, в которую ведёт', async ({ page }) => {
    const errors = await openEditor(page, 'exit-branch');
    await selectGate(page, 'g-ask');

    expect(await gotoText(page, 0)).toContain(RIGHT_TITLE);
    expect(await gotoText(page, 1)).toContain(LEFT_TITLE);

    // Слово схемы рядом с вариантом недопустимо (product.md §2).
    expect(await gotoText(page, 0)).not.toContain('s-right');

    expect(errors).toEqual([]);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: реализация, которая при отсутствии правила молчит
   * (пустая строка) или подставляет первую попавшуюся главу. Молчание здесь
   * и есть нынешняя беда: автор не отличает «ведёт никуда» от «я не туда
   * посмотрел».
   */
  test('вариант без правила говорит «никуда не ведёт» ВСЛУХ', async ({ page }) => {
    const errors = await openEditor(page, 'inline-explain');
    await selectGate(page, 'g-explain');

    expect(await gotoText(page, 0)).toContain('никуда не ведёт');
    expect(await gotoText(page, 1)).toContain('никуда не ведёт');

    expect(errors).toEqual([]);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: реализация, смотрящая ТОЛЬКО на правила и потому
   * объявляющая «никуда не ведёт» там, где у главы есть безусловный выход.
   * Это была бы прямая ложь: рассказ туда пойдёт.
   *
   * Ровно эта ошибка и делает разрез по времени непонятным — он создаёт
   * именно безусловное «иначе», и не назвать его значит не назвать
   * результат разреза.
   */
  test('вариант без своего правила называет общий выход главы', async ({ page }) => {
    const errors = await openEditor(page, 'conditions');
    await selectGate(page, 'g-count');

    for (const index of [0, 1, 2]) {
      const cell = page.getByTestId(`stopcard-option-goto-${index}`);
      await expect(cell).toBeVisible();
      await expect(cell).toContainText(DEFAULT_TITLE);
      await expect(cell).not.toContainText('никуда не ведёт');
    }

    expect(errors).toEqual([]);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: ответ, положенный в `title`, в `aria-label` или
   * схлопнутый в ноль. Мерятся размеры, а не «нажимается ли»: Playwright
   * сам прокручивает вложенный контейнер и честно найдёт узел в щели.
   */
  test('ответ виден глазами, а не только тесту', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectGate(page, 'g-ask');

    const box = await boxOf(page, 'stopcard-option-goto-0');
    expect(box).not.toBeNull();
    expect(box!.display).not.toBe('none');
    expect(box!.visibility).toBe('visible');
    expect(Number(box!.opacity)).toBeGreaterThan(0.5);
    expect(box!.clipPath === 'none' || box!.clipPath === 'auto').toBe(true);
    expect(box!.clientHeight).toBeGreaterThan(10);
    expect(box!.clientWidth).toBeGreaterThan(60);
    // Текст не срезан по ширине: имя главы задаёт автор, и обрезка молча
    // съела бы ровно то, ради чего строка заведена.
    expect(box!.scrollWidth).toBeLessThanOrEqual(box!.clientWidth + 1);
  });
});

/** Состав глав и правил выхода прямо из состояния редактора. */
const graphOf = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as {
      __project: {
        segments: {
          id: string;
          title: string;
          exit: { rules: { when: { kind: string; variable?: string; value?: unknown }[]; goto: string }[] };
        }[];
      };
    }).__project.segments.map((s) => ({
      id: s.id,
      title: s.title,
      rules: s.exit.rules.map((r) => ({
        goto: r.goto,
        when: r.when.map((c) => `${c.kind}:${c.variable ?? ''}=${String(c.value ?? '')}`),
      })),
    })));

test.describe('Б3: ветку можно завести прямо от варианта', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снятая кнопка; кнопка, создающая главу и НЕ
   * связывающая её (сегодня автор делает это в двух местах, и половина
   * работы выглядит как целая); кнопка, называющая главу идентификатором
   * варианта вместо его подписи.
   *
   * Проверяется И существование главы, И правило выхода в неё. Проверка
   * одного существования была бы зелёной у реализации, оставляющей автора
   * ровно там же, где он был: глава есть, дойти до неё нельзя.
   */
  test('после «завести ветку» глава существует И связана', async ({ page }) => {
    const errors = await openEditor(page, 'inline-explain');
    await selectGate(page, 'g-explain');

    expect(await gotoText(page, 0)).toContain('никуда не ведёт');

    const before = await graphOf(page);
    expect(before).toHaveLength(1);

    await page.getByTestId('stopcard-option-branch-0').click();

    const after = await graphOf(page);
    // Глава появилась, и названа ПОДПИСЬЮ варианта — «Гейт» в этой фикстуре
    // слово автора, а не схемы (fixtures/projects/inline-explain.json).
    expect(after).toHaveLength(2);
    const created = after.find((s) => s.id !== 's-explain');
    expect(created?.title).toBe('Гейт');

    // И связана: у главы с остановкой появилось правило именно на этот вариант.
    const owner = after.find((s) => s.id === 's-explain')!;
    expect(owner.rules).toEqual([
      { goto: created!.id, when: ['equals:чем-останавливается=opt-gate'] },
    ]);

    // Автор видит результат немедленно, не уходя со своего места.
    expect(await gotoText(page, 0)).toContain('Гейт');
    // Второй вариант по-прежнему тупик: заведена ОДНА ветка, а не все.
    expect(await gotoText(page, 1)).toContain('никуда не ведёт');

    expect(errors).toEqual([]);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: реализация из ДВУХ отправок (`addSegment`, затем
   * `connect`) — Ctrl+Z снял бы только правило и оставил висящую главу,
   * то есть отдал бы автору полусделанное состояние.
   *
   * Промежуточная проверка «предыдущий шаг СОСТОЯЛСЯ» стоит здесь не для
   * красоты: в Сессии 33 e2e «Ctrl+Z убирает вставленное» остался зелёным
   * при ПОЛНОСТЬЮ отключённой вставке — отменять было нечего, и число
   * совпало с исходным.
   */
  test('Ctrl+Z отменяет и главу, и правило — целиком, а не половину', async ({ page }) => {
    await openEditor(page, 'inline-explain');
    await selectGate(page, 'g-explain');

    await page.getByTestId('stopcard-option-branch-0').click();

    // Шаг СОСТОЯЛСЯ — без этой проверки тест зелен и при неработающей кнопке.
    const made = await graphOf(page);
    expect(made).toHaveLength(2);
    expect(made.find((s) => s.id === 's-explain')!.rules).toHaveLength(1);

    await page.keyboard.press('Control+z');

    const undone = await graphOf(page);
    expect(undone).toHaveLength(1);
    expect(undone[0]!.rules).toEqual([]);
    expect(await gotoText(page, 0)).toContain('никуда не ведёт');
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: кнопка, показанная всегда. Предложить «завести
   * ветку» там, где ответ уже ведёт в главу, значит предложить завести
   * ВТОРУЮ на тот же ответ — правило, до которого рассказ никогда не дойдёт.
   */
  test('у варианта, который уже ведёт в главу, кнопки нет', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectGate(page, 'g-ask');

    await expect(page.getByTestId('stopcard-option-goto-0')).toContainText('Направо');
    await expect(page.getByTestId('stopcard-option-branch-0')).toHaveCount(0);
    await expect(page.getByTestId('gate-option-branch-1')).toHaveCount(0);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: кнопка, до которой нельзя дотянуться, — раздавленная
   * потолком высоты или уехавшая за край панели. «Нажимается ли» этого
   * не докажет: Playwright сам прокручивает вложенный контейнер и честно
   * нажмёт кнопку внутри 24-пиксельной щели.
   */
  test('кнопка «завести ветку» видна и достижима, а не в щели', async ({ page }) => {
    await openEditor(page, 'inline-explain');
    await selectGate(page, 'g-explain');

    const box = await boxOf(page, 'stopcard-option-branch-0');
    expect(box).not.toBeNull();
    expect(box!.display).not.toBe('none');
    expect(box!.visibility).toBe('visible');
    expect(box!.clientHeight).toBeGreaterThan(20);
    expect(box!.clientWidth).toBeGreaterThan(60);

    // Точка в центре кнопки принадлежит САМОЙ кнопке, а не тому, что её
    // перекрыло: `elementFromPoint` врёт в обе стороны, поэтому спрашиваем
    // его после того, как узел прокручен в видимую часть.
    const onTop = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-testid="stopcard-option-branch-0"]');
      if (!node) return 'НЕТ УЗЛА';
      node.scrollIntoView({ block: 'center' });
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === node || node.contains(hit) ? 'САМА КНОПКА' : (hit?.className ?? 'null');
    });
    expect(onTop).toBe('САМА КНОПКА');
  });
});
