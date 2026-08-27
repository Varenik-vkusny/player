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

import { loadProject } from '@player/core';

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

    /*
     * ТРЕБОВАНИЕ УТОЧНЕНО 25.08.2026. Раньше строка обязана была содержать
     * слово «шов» и отправлять ставить остановку. Она говорила автору, чего
     * разрез НЕ делает, и предлагала пойти сделать что-то другое — то есть
     * орган собственным сообщением объяснял, что он не нужен. Владелец
     * прочитал это как «надо убирать этот вариант».
     *
     * Теперь строка отвечает на три вопроса, которые он задал дословно:
     * куда делась вторая половина, почему дорожка стала короче и что
     * теперь можно сделать.
     */
    await expect(line, 'не сказано, что вторая половина не пропала')
      .toContainText('не пропала');
    await expect(line, 'не объяснено, почему дорожка стала короче')
      .toContainText('короче');
    await expect(line, 'не сказано, ЗАЧЕМ разрез нужен')
      .toContainText('начало главы');

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
    /*
     * ЧТО ИМЕННО ДЕЛАЕТ КНОПКА — переделано 25.08.2026, решение владельца.
     *
     * БЫЛО: заводила ОДНУ главу под этот ответ, а глава при этом оставалась
     * неразрезанной. То есть зритель отвечал на метке, рассказ шёл до конца
     * главы и только потом уходил в ветку. Владелец наткнулся на это первым
     * же вопросом сессии: «я ответил на вопрос, а меня никуда не перекинуло».
     *
     * СТАЛО: если глава ещё не разрезана по этой метке — режем. Разрез сам
     * заводит ветку под КАЖДЫЙ ответ, включая этот, и делает остаток рассказа
     * продолжением. Заводить сверху ещё одну ветку нельзя: у ответа стало бы
     * два правила, и второе недостижимо — правила читаются по порядку.
     *
     * Отсюда четыре главы: голова, две ветки, продолжение.
     */
    expect(after).toHaveLength(4);

    const owner = after.find((s) => s.id === 's-explain')!;
    // По правилу на КАЖДЫЙ ответ, и ветки названы подписями вариантов:
    // «Гейт» и «Таймер» — слова автора из фикстуры, а не схемы.
    expect(owner.rules).toHaveLength(2);
    const created = after.find((s) => s.id === owner.rules[0]!.goto);
    expect(created?.title).toBe('Гейт');
    expect(after.find((s) => s.id === owner.rules[1]!.goto)?.title).toBe('Таймер');
    expect(owner.rules[0]!.when).toEqual(['equals:чем-останавливается=opt-gate']);

    // Остаток рассказа не пропал — он стал отдельной главой.
    expect(
      after.some((s) => s.title.endsWith('— продолжение')),
      'остаток рассказа исчез вместо того, чтобы стать продолжением',
    ).toBe(true);

    // Автор видит результат немедленно, не уходя со своего места.
    expect(await gotoText(page, 0)).toContain('Гейт');
    expect(await gotoText(page, 1)).toContain('Таймер');

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
    // Четыре главы: голова, две ветки, продолжение (см. тест выше).
    const made = await graphOf(page);
    expect(made).toHaveLength(4);
    expect(made.find((s) => s.id === 's-explain')!.rules).toHaveLength(2);

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

/**
 * ВТОРОЙ ВОПРОС — НА ВЕТКЕ. Весь путь, которым владелец шёл 26.08.2026.
 *
 * Он сделал развилку, перешёл на ветку «Вариант 1» и задал вопрос там же.
 * Получил красную полосу и потерял работу — ДВАЖДЫ, по двум разным
 * причинам, и обе ломали ровно то, ради чего заводятся ветки:
 *
 *   1) Переменная «gate-1» записывается дважды: в сегменте «s-1»
 *      и в «segment-1». Имя метки бралось свободным ВНУТРИ главы,
 *      а схема требует уникальности по всему проекту.
 *   2) segments.4.audio.offset: Смещение отсчитывается от начала ФАЙЛА,
 *      а у немого сегмента файла нет: ожидался 0, получено 2.5.
 *      Ветки немые по построению, и разрез двигал им окно.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: вернуть `freeId('gate', currentSegment.gates)`
 * или безусловный сдвиг окна — проект снова перестанет сохраняться.
 *
 * Проверяется НАСТОЯЩЕЙ загрузкой схемой, а не отсутствием полосы:
 * «полосы нет» зелено и тогда, когда её просто не успели показать.
 */
test.describe('второй вопрос на ветке', () => {
  const askHere = async (page: Page): Promise<void> => {
    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку здесь' }).click();
    await page.locator('[data-testid^="mark-gate-"]').last().click();
    await page.getByTestId('stopcard-make-question').click();
  };

  test('проект остаётся валидным, а переменные разными', async ({ page }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    await askHere(page);
    const afterFirst = await page.evaluate(() => (window as unknown as {
      __project: { segments: { id: string }[] };
    }).__project.segments.length);
    expect(afterFirst, 'первая развилка не собралась — дальше проверять нечего').toBe(4);

    // Переходим на ветку и спрашиваем там же.
    await page.getByRole('button', { name: 'Ветки' }).click();
    await page.getByTestId('chapter-pick-segment-1').click();
    await page.getByRole('button', { name: 'Дорожки' }).click();
    await askHere(page);

    const raw = await page.evaluate(() =>
      JSON.parse(JSON.stringify((window as unknown as { __project: unknown }).__project)));
    expect(
      () => loadProject(raw),
      'проект со вторым вопросом на ветке не грузится — работа не сохранится',
    ).not.toThrow();

    const project = loadProject(raw);
    const variables = project.segments.flatMap((s) => s.gates.map((g) => g.recordAs));
    expect(variables.length, 'вопросов меньше двух — проверять нечего').toBeGreaterThan(1);
    expect(new Set(variables).size, 'две метки пишут одну переменную').toBe(variables.length);

    // Имена глав тоже обязаны различаться: иначе в списке «и тогда»
    // встанут две одинаковые строки, и выбрать нужную нечем.
    const titles = project.segments.map((s) => s.title);
    expect(new Set(titles).size, 'в проекте две главы с одинаковым именем').toBe(titles.length);
  });
});

/**
 * ОСТАНОВКА НА САМОМ КОНЦЕ ГЛАВЫ ВСЁ РАВНО СРАБАТЫВАЕТ.
 *
 * Куплено 26.08.2026, владелец: «я всё поставил как надо, а в плеере
 * вопроса не показало, сразу кинуло в вариант».
 *
 * Разрез по развилке оставляет метку РОВНО на конце головы — в этом весь
 * его смысл: ответить и уйти в ветку, не дослушивая. А конец главы плеер
 * проверял с допуском 0.02 с, то есть РАНЬШЕ, чем `position >= gate.at`.
 * Метка не срабатывала никогда.
 *
 * Замер до починки: глава 24.300 с, метка на 24.300 с, разница 0.000;
 * плеер доходил до состояния `ended`, вопрос не открывался.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убрать в `#startFrameLoop` проверку «осталась
 * неотработанная метка в пределах главы» — плеер снова проскочит мимо.
 *
 * Проверяется В ПЛЕЕРЕ, на объяснении, собранном руками в редакторе:
 * зелёный редактор ничего не говорит о том, что увидит зритель.
 */
test.describe('вопрос на конце главы', () => {
  test('плеер встаёт на нём, а не проскакивает в ветку', async ({ page, context }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку здесь' }).click();
    await page.locator('[data-testid^="mark-gate-"]').last().click();
    await page.getByTestId('stopcard-make-question').click();

    // ПРЕДЫДУЩИЙ ШАГ СОСТОЯЛСЯ, и это несущая проверка: метка обязана стоять
    // ровно на конце главы — иначе тест охранял бы совсем другой случай.
    const numbers = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: {
          segments: {
            audio: { duration: number; words: { start: number }[] };
            gates: { at: { kind: string; t?: number; wordIndex?: number; offset?: number } }[];
          }[];
        };
      }).__project;
      const head = project.segments[0]!;
      const gate = head.gates[0]!;
      const at = gate.at.kind === 'seconds'
        ? gate.at.t!
        : (head.audio.words[gate.at.wordIndex!]?.start ?? -1) + (gate.at.offset ?? 0);
      return { duration: head.audio.duration, at };
    });
    expect(numbers.at, 'метка не на конце главы — проверяется не тот случай')
      .toBeCloseTo(numbers.duration, 2);

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
      timeout: 30_000,
    });

    // Перемотка стенда — чтобы не сидеть 24 секунды (ADR-036).
    await player.evaluate(
      (t) => (window as unknown as { __player: { seek(seconds: number): void } }).__player.seek(t),
      numbers.duration - 0.8,
    );
    await player.getByRole('button', { name: 'Играть' }).click();

    await expect
      .poll(
        () => player.evaluate(() => document.getElementById('state')?.textContent),
        { timeout: 15_000, message: 'плеер не встал на вопросе' },
      )
      .toBe('at-gate');

    const position = await player.evaluate(
      () => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds,
    );
    expect(position, 'встал не на метке').toBeCloseTo(numbers.at, 1);
  });
});

/**
 * ОСИРОТЕВШАЯ ВЕТКА УХОДИТ ВМЕСТЕ С ПЕРЕНАПРАВЛЕНИЕМ.
 *
 * Владелец, увидев три лишних главы на доске: «почему тут столько веток
 * посторонних висит… если я выбрал, что вариант ответа — это пересмотр
 * или переход на уже существующую главу, то этих веток призраков быть
 * не должно».
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убрать уборку сирот в `setOptionTarget` —
 * ветка под перенаправленным ответом снова останется висеть.
 */
test.describe('перенаправленный ответ', () => {
  test('уносит свою ветку, и Ctrl+Z возвращает её', async ({ page }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку здесь' }).click();
    await page.locator('[data-testid^="mark-gate-"]').last().click();
    await page.getByTestId('stopcard-make-question').click();

    const titlesOf = async (): Promise<string[]> => page.evaluate(() =>
      (window as unknown as { __project: { segments: { title: string }[] } })
        .__project.segments.map((s) => s.title));

    const before = await titlesOf();
    expect(before, 'развилка не собралась — призракам неоткуда взяться').toHaveLength(4);

    // Второй ответ — на повтор этой же главы. Его ветка становится ничьей.
    const headId = await page.evaluate(() =>
      (window as unknown as { __project: { segments: { id: string }[] } }).__project.segments[0]!.id);
    await page.getByTestId('stopcard-option-goto-1').selectOption(headId);

    const after = await titlesOf();
    expect(after, 'ветка под перенаправленным ответом осталась висеть').toHaveLength(3);
    expect(after, 'убрали не ту ветку').toContain('Вариант 1');
    expect(after).not.toContain('Вариант 2');

    await page.keyboard.press('Control+z');
    expect(await titlesOf(), 'Ctrl+Z вернул не всё').toEqual(before);
  });
});

/**
 * УБОРКА СИРОТ НЕ ТРОГАЕТ ГЛАВУ С СОДЕРЖИМЫМ.
 *
 * КУПЛЕНО ПОТЕРЕЙ РАБОТЫ 26.08.2026. Уборка, заведённая накануне, сносила
 * ВСЁ недостижимое — и съела «— продолжение» вместе с пятью элементами
 * рассказа, как только автор увёл ОБА ответа на повтор главы. Владелец:
 * «я потерял конец изначальной главы, как мне в конец попасть».
 *
 * Замер до починки: «Моя первая глава(эл.5)» — и всё; продолжения с пятью
 * элементами не стало.
 *
 * Правило теперь узкое: молча уходит только ветка, которой автор
 * не касался. Глава с содержимым остаётся на доске с пометкой «зритель
 * не попадёт» — предупредить дешевле, чем стереть работу.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убрать проверку `isUntouchedBranch` —
 * продолжение снова исчезнет.
 */
test.describe('уборка сирот', () => {
  test('пустые ветки уходят, а глава с содержимым остаётся', async ({ page }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку здесь' }).click();
    await page.locator('[data-testid^="mark-gate-"]').last().click();
    await page.getByTestId('stopcard-make-question').click();

    const chapters = async (): Promise<{ title: string; elements: number }[]> => page.evaluate(() =>
      (window as unknown as { __project: { segments: { title: string; elements: unknown[] }[] } })
        .__project.segments.map((s) => ({ title: s.title, elements: s.elements.length })));

    const before = await chapters();
    expect(before, 'развилка не собралась — проверять нечего').toHaveLength(4);
    const tail = before.find((c) => c.title.includes('продолжение'));
    expect(tail?.elements, 'в продолжении нет содержимого — терять было бы нечего')
      .toBeGreaterThan(0);

    // Оба ответа — на повтор главы. Обе ветки становятся ничьими,
    // и продолжение тоже перестаёт быть достижимым.
    const headId = await page.evaluate(() =>
      (window as unknown as { __project: { segments: { id: string }[] } }).__project.segments[0]!.id);
    await page.getByTestId('stopcard-option-goto-0').selectOption(headId);
    await page.getByTestId('stopcard-option-goto-1').selectOption(headId);

    const after = await chapters();
    // Пустые ветки ушли...
    expect(after.map((c) => c.title), 'пустая ветка осталась висеть').not.toContain('Вариант 1');
    expect(after.map((c) => c.title)).not.toContain('Вариант 2');
    // ...а работа автора цела.
    const tailAfter = after.find((c) => c.title.includes('продолжение'));
    expect(tailAfter, 'уборка стёрла конец рассказа вместе с работой автора').toBeTruthy();
    expect(tailAfter!.elements, 'продолжение осталось, но опустело').toBe(tail!.elements);

    // И дорога в конец есть: продолжение стоит в списке целей.
    await expect(
      page.getByTestId('stopcard-option-goto-0').locator('option', { hasText: 'продолжение' }),
      'в конец больше не попасть — продолжения нет в списке целей',
    ).toHaveCount(1);
  });
});

/**
 * НАЖАЛ ВАРИАНТ — РАССКАЗ ПОШЁЛ ДАЛЬШЕ.
 *
 * Куплено 26.08.2026 прогоном руками: «нажал на вариант и нихрена
 * не сработало». Плеер оставался на том же вопросе, сколько ни нажимай.
 *
 * ПРИЧИНА. С тех пор как метка с вариантами стала развилкой
 * (`correctId: null`), `isCorrect` не засчитывает НИ ОДИН ответ —
 * засчитывать не с чем. А `onWrong` у только что поставленной метки равен
 * `retry`. Каждый ответ считался неверным, и вопрос открывался заново.
 *
 * Правильность и ход рассказа — разные вещи: «верного ответа нет» означает
 * «любой ответ засчитан», а не «любой ответ неверен».
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убрать `nothingToGrade` из `answer` — плеер снова
 * встанет в петлю на том же вопросе.
 *
 * Проверяется В ПЛЕЕРЕ, настоящим нажатием по фигуре ответа, на объяснении,
 * собранном руками в редакторе.
 */
test.describe('ответ в плеере', () => {
  test('нажатие по варианту уводит из вопроса, а не открывает его заново', async ({
    page,
    context,
  }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку здесь' }).click();
    await page.locator('[data-testid^="mark-gate-"]').last().click();
    await page.getByTestId('stopcard-make-question').click();

    // Метка обязана быть развилкой с «переспросить» — то самое сочетание,
    // на котором плеер зацикливался. Без этой проверки тест охранял бы
    // случай, которого в продукте не бывает.
    const gate = await page.evaluate(() => {
      const head = (window as unknown as {
        __project: { segments: { audio: { duration: number }; gates: { onWrong: string; config: { correctId?: string | null } }[] }[] };
      }).__project.segments[0]!;
      return { correctId: head.gates[0]!.config.correctId ?? null, onWrong: head.gates[0]!.onWrong, duration: head.audio.duration };
    });
    expect(gate.correctId, 'метка не развилка — проверяется не тот случай').toBeNull();
    expect(gate.onWrong, 'у метки не «переспросить» — петли бы и не было').toBe('retry');

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
      timeout: 30_000,
    });

    await player.evaluate(
      (t) => (window as unknown as { __player: { seek(seconds: number): void } }).__player.seek(t),
      gate.duration - 0.8,
    );
    await player.getByRole('button', { name: 'Играть' }).click();

    await expect
      .poll(() => player.evaluate(() => document.getElementById('state')?.textContent), {
        timeout: 15_000,
        message: 'плеер не дошёл до вопроса',
      })
      .toBe('at-gate');

    // Нажимаем по ВИДИМОЙ фигуре ответа, а не зовём answer(): проверка
    // «вызвался ли обработчик» была бы зелёной и при перекрытой фигуре.
    const optionId = await player.evaluate(() => {
      const gates = (window as unknown as {
        __player: { currentGate?: { config: { options?: { elementId?: string }[] } } };
      }).__player.currentGate;
      return gates?.config.options?.[0]?.elementId ?? null;
    });
    expect(optionId, 'у варианта нет фигуры на сцене — нажимать не по чему').toBeTruthy();
    await player.locator(`[data-id="${optionId}"]`).click();

    await expect
      .poll(() => player.evaluate(() => document.getElementById('state')?.textContent), {
        timeout: 15_000,
        message: 'после ответа плеер остался на том же вопросе — петля',
      })
      .not.toBe('at-gate');
  });
});

/**
 * ОСТАНОВКА В КОНЦЕ ГЛАВЫ — ВЫБОРОМ, А НЕ ПОПАДАНИЕМ.
 *
 * Слово владельца 26.08.2026: «надо, чтобы точно понимал, что ты поставил
 * вопрос в конце главы, а не на предпоследней секунде, а то так может
 * вырезаться глава длиной в секунду… чтобы можно было ВЫБРАТЬ, что вопрос
 * именно в конце, а не попадать в этот миллиметр».
 *
 * Промах мышью в один пиксель — 0.037 с при масштабе ×1 и куда больше
 * на вписанном. После вопроса глава режется по метке, и остаток длиной
 * в секунду становится отдельной главой: мусор, которого автор не заказывал.
 *
 * Прилипание с порогом сюда не годится: оно молча меняло бы намерение
 * автора, который мог ставить метку у конца НАРОЧНО. Поэтому прямой выбор.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: пункт «в конце главы» убрали или он ставит метку
 * по головке — разница с длиной главы перестанет быть нулевой, и после
 * вопроса появится глава-обрубок.
 */
test.describe('остановка в конце главы', () => {
  test('встаёт ровно на конец, и обрубка после вопроса не появляется', async ({ page }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    // Нарочно щёлкаем НЕ у края: пункт не должен зависеть от места щелчка,
    // в этом вся его суть.
    await page.mouse.click(lane.x + lane.width * 0.3, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку в конце главы' }).click();

    const placed = await page.evaluate(() => {
      const head = (window as unknown as {
        __project: {
          segments: {
            audio: { duration: number; words: { start: number }[] };
            gates: { at: { kind: string; t?: number; wordIndex?: number; offset?: number } }[];
          }[];
        };
      }).__project.segments[0]!;
      const gate = head.gates[0]!;
      const at = gate.at.kind === 'seconds'
        ? gate.at.t!
        : (head.audio.words[gate.at.wordIndex!]?.start ?? -1) + (gate.at.offset ?? 0);
      return { at, duration: head.audio.duration };
    });
    expect(placed.at, 'метка встала не на конец главы').toBeCloseTo(placed.duration, 3);

    await page.getByTestId('stopcard-make-question').click();

    const chapters = await page.evaluate(() =>
      (window as unknown as { __project: { segments: { title: string; audio: { duration: number } }[] } })
        .__project.segments.map((s) => ({ title: s.title, duration: s.audio.duration })));

    // Голова, две ветки — и НИКАКОГО продолжения: резать после метки нечего.
    expect(
      chapters.some((c) => c.title.includes('продолжение')),
      'появилась глава-обрубок, хотя метка стояла ровно в конце',
    ).toBe(false);
    expect(chapters, 'веток не завелось — проверять нечего').toHaveLength(3);

    // Второй раз пункт гаснет и называет причину: две метки на одной секунде
    // автор не различит.
    await page.mouse.click(lane.x + lane.width * 0.3, lane.y + lane.height * 0.75, { button: 'right' });
    const again = page.getByRole('menuitem', { name: /в конце главы/ });
    await expect(again).toHaveAttribute('aria-disabled', 'true');
    await expect(again, 'причина отказа не названа').toContainText('уже стоит остановка');
  });
});

/**
 * МЕТКА В КОНЦЕ ГЛАВЫ ВЫГЛЯДИТ ИНАЧЕ.
 *
 * Слово владельца 26.08.2026: «пусть головка вопроса рисуется чуть
 * по-другому, чтобы было отличительно, что она именно в конце стоит
 * и сразу чтобы было понятно».
 *
 * Отличие не косметическое: после вопроса на такой метке продолжения
 * не будет — резать после неё нечего. Метка на предпоследней секунде
 * выглядела так же, а давала главу длиной в секунду.
 *
 * ПРИЗНАК ДВОЙНОЙ (стенка и подпорка), как у сироты: один признак
 * на дальтонизме и мелком масштабе теряется, два вместе нет.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, И ЭТО ПРОВЕРЕНО ГЛАЗАМИ. Первая редакция рисовала
 * стенку ЗА краем полосы (`right: -5px`) — в разметке она была, а на экране
 * её срезало: метка в конце стоит вплотную к краю. Числа при этом сходились.
 * Поэтому здесь проверяется не только «стенка объявлена», но и «она внутри
 * полосы»; и первая редакция стенки 2x22 отвергнута как неразличимая рядом
 * со столбиком остановки — она стала 3x32.
 */
test.describe('вид метки в конце главы', () => {
  test('отличается от обычной, и её знак не срезан краем полосы', async ({ page }) => {
    await openEditor(page, 'sandbox');
    await page.getByRole('button', { name: 'Обложка' }).click();

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.4, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку здесь' }).click();
    await page.waitForTimeout(200);
    await page.mouse.click(lane.x + lane.width * 0.2, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить остановку в конце главы' }).click();

    const seen = await page.evaluate(() => {
      const read = (id: string): { знак: string; подпорка: string; заКраем: number } => {
        const node = document.querySelector('[data-testid="' + id + '"]')!;
        const wall = getComputedStyle(node, '::before');
        const foot = getComputedStyle(node, '::after');
        const rect = node.getBoundingClientRect();
        const laneRect = document.querySelector('[data-testid="marks-lane"]')!.getBoundingClientRect();
        /*
         * Правый край СТЕНКИ, а не метки. Псевдоэлемент прямоугольником
         * не спросишь, поэтому считаем: `right` у него отсчитывается
         * от правого края метки внутрь, отрицательный — наружу.
         *
         * Первая редакция теста мерила край САМОЙ МЕТКИ — и оставалась
         * зелёной, когда стенку унесли за полосу: метка-то не двигалась.
         * Проверено сломом.
         */
        const wallRight = rect.right - Number.parseFloat(wall.right || '0');
        return {
          // Разделитель НЕ «x»: в «3px» тоже есть x, и разбор ломался
          // молча — высота выходила NaN, а тест краснел на исправном коде.
          знак: wall.width + ' / ' + wall.height,
          подпорка: foot.width + ' / ' + foot.height,
          заКраем: +(wallRight - laneRect.right).toFixed(1),
        };
      };
      const marks = [...document.querySelectorAll('[data-testid^="mark-gate-"]')];
      const atEnd = marks.find((n) => n.className.includes('ed-mark-at-end'));
      const usual = marks.find((n) => !n.className.includes('ed-mark-at-end'));
      return {
        вКонцеЕсть: atEnd !== undefined,
        обычнаяЕсть: usual !== undefined,
        вКонце: atEnd ? read(atEnd.getAttribute('data-testid')!) : null,
        обычная: usual ? read(usual.getAttribute('data-testid')!) : null,
      };
    });

    expect(seen.вКонцеЕсть, 'метка в конце не помечена — рисовать иначе нечего').toBe(true);
    expect(seen.обычнаяЕсть, 'обычной метки нет — сравнивать не с чем').toBe(true);

    // У обычной знака нет вовсе.
    expect(seen.обычная!.знак, 'обычная метка обзавелась стенкой').toBe('auto / auto');

    // У метки в конце знак есть, и он крупнее столбика остановки (18 px),
    // иначе рядом с ним не различается.
    const [ширина, высота] = seen.вКонце!.знак.split(' / ').map((v) => Number.parseFloat(v));
    expect(ширина, 'стенка тоньше волоса').toBeGreaterThanOrEqual(3);
    expect(высота, 'стенка не выше самой метки — рядом со столбиком не различить')
      .toBeGreaterThan(18);
    expect(seen.вКонце!.подпорка, 'подпорки нет — признак остался один').not.toBe('auto / auto');

    // И главное: знак ВНУТРИ полосы. Первая редакция рисовала его за краем,
    // и на экране его не было вовсе при сходящихся числах.
    expect(seen.вКонце!.заКраем, 'стенка вынесена за полосу — на экране её не будет')
      .toBeLessThanOrEqual(0);
  });
});
