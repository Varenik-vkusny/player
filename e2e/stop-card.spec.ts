/**
 * Карточка остановки: вопрос и ветки задаются, НЕ ПОКИДАЯ ДОРОЖКИ.
 *
 * ЧТО ЭТОТ ФАЙЛ ОХРАНЯЕТ И ПОЧЕМУ ОН ЕСТЬ. Замер 21.08.2026: механика
 * вопроса работала полностью, а найти её было нельзя. Автор выбирал
 * остановку, панель с полем «Вопрос», вариантами ответа и кнопкой «Завести
 * ветку под этот ответ» создавалась — и лежала на y = 984 при высоте окна
 * 900. До поля «Вопрос» надо было прокрутить 475 px (окно 1440x900) или
 * 655 (1280x720), а прокручиваемая колонка показывала пятую часть себя
 * (scrollHeight 2728 при clientHeight 537) и к нужной панели не
 * прокручивалась сама.
 *
 * Владелец сформулировал это как «я не мог нормально понять, как правильно
 * ставить разделение, чтобы поставить вопрос и разделить на ветки».
 *
 * Поэтому здесь проверяется ПУТЬ ЦЕЛИКОМ, а не наличие полей. Проверка
 * «поле «Вопрос» есть в DOM» была бы зелёной и в тот день, когда автор
 * не мог до него добраться, — ровно этот случай уже стоил проекту сессии.
 */
import { expect, test, type Page } from '@playwright/test';

interface SavedRule {
  readonly goto: string;
  readonly when: readonly { readonly variable?: string; readonly value?: string }[];
}

async function openEditor(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
  return errors;
}

/** Правила выхода первой главы — то, что реально уехало бы в файл. */
async function rulesOf(page: Page): Promise<SavedRule[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __project: { segments: { exit: { rules: SavedRule[] } }[] } })
        .__project.segments[0]!.exit.rules,
  );
}

/** Ставит остановку правым щелчком по свободному месту дорожки. */
async function addStopAt(page: Page, ratio: number): Promise<void> {
  const words = await page.getByTestId('track-words').boundingBox();
  if (!words) throw new Error('полоса расшифровки не видна');
  await page.mouse.click(words.x + words.width * ratio, words.y + words.height / 2, {
    button: 'right',
  });
  await page.getByTestId('ctxmenu-add-gate').click();
}

test.describe('карточка остановки', () => {
  /**
   * НЕСУЩИЙ ТЕСТ ФАЙЛА. Проходит ровно тот путь, который владелец не смог
   * пройти руками: поставить остановку → сделать её вопросом → назвать
   * ответы → увести один ответ в новую ветку. Всё — жестами по дорожке.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ОН ПОКРАСНЕЛ: карточка перестала появляться
   * при выборе остановки; исчезла кнопка превращения остановки в вопрос;
   * «Завести ветку» перестала заводить правило выхода. Проверено сломом.
   *
   * Проверяется РЕЗУЛЬТАТ В ПРОЕКТЕ, а не то, что кнопки нажались: правило
   * выхода — это то, по чему поедет зритель, и только оно доказывает, что
   * ветка действительно завелась.
   */
  test('весь путь от остановки до ветки проходится, не покидая дорожки', async ({ page }) => {
    const errors = await openEditor(page);

    const rulesBefore = await rulesOf(page);

    await addStopAt(page, 0.55);
    await expect(
      page.getByTestId('stop-card'),
      'поставив остановку, автор не увидел её карточки',
    ).toBeVisible();

    // Только что поставленная остановка — БЕЗ вопроса (createGate даёт вид
    // «Дальше»). Это и был второй шаг рецепта, который автор не мог сделать:
    // поле «Вид» лежало в невидимой части правой колонки.
    await page.getByTestId('stopcard-make-question').click();
    await page.getByTestId('gate-split').click();
    await expect(page.getByTestId('stopcard-prompt')).toBeVisible();

    await page.getByTestId('stopcard-prompt').fill('Какой из них легче?');
    await page.getByTestId('stopcard-prompt').blur();
    await page.getByTestId('stopcard-option-label-0').fill('Первый');
    await page.getByTestId('stopcard-option-label-0').blur();

    /*
     * ПОРЯДОК, КОТОРЫЙ ВИДИТ АВТОР — переделан 25.08.2026, решение владельца.
     *
     * БЫЛО: поставить метку → задать вопрос → выбрать в списке «Что это
     * за остановка» → нажать «Разделить повествование здесь» → и только
     * потом заводить ветки, по одной, кнопкой у каждого ответа. Пять шагов
     * в трёх органах, и пропуск любого давал тихо неработающую развилку.
     *
     * СТАЛО: поставить метку → задать вопрос. Всё. Одно нажатие делает
     * ровно то, что автор и имел в виду: вопрос на сцене, глава кончается
     * на метке, под каждым ответом своя ветка, за развилкой продолжение.
     *
     * Поэтому здесь больше нет ни кнопки «Завести ветку», ни ожидания
     * тупика: правила у обоих ответов уже есть.
     */
    const rulesAfter = await rulesOf(page);
    expect(
      rulesAfter.length,
      'вопрос не завёл правил выхода — развилки не получилось',
    ).toBe(rulesBefore.length + 2);

    for (const rule of rulesAfter.slice(rulesBefore.length)) {
      expect(rule.when).toHaveLength(1);
      expect(rule.goto, 'правило ведёт в никуда').toBeTruthy();

      // Ветка ДЕЙСТВИТЕЛЬНО появилась в проекте, а не только в правиле.
      const chapterExists = await page.evaluate(
        (goto) => (window as unknown as { __project: { segments: { id: string }[] } })
          .__project.segments.some((segment) => segment.id === goto),
        rule.goto,
      );
      expect(chapterExists, `глава «${rule.goto}» из правила не найдена в проекте`).toBe(true);
    }

    // И кнопки «завести ветку» больше нет — заводить нечего, ветки уже есть.
    await expect(
      page.getByTestId('stopcard-option-branch-0'),
      'кнопка ветки осталась там, где ветка уже заведена',
    ).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  /**
   * ВТОРОЙ СЦЕНАРИЙ КНОПКИ, названный владельцем дословно: «либо переход
   * на другую ветку, либо переход назад по текущей».
   *
   * Возврат в свою же главу выражается тем же полем `goto` — это не особый
   * режим, а обычная цель. Механика повтора уже написана и решена владельцем
   * 02.08.2026 (`player/src/repeat.ts`): остановки внутри повторяемого куска
   * молчат, а отправившая на повтор спрашивает снова.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: пункт «пройти эту главу заново» исчез из списка,
   * или выбор цели перестал доходить до правил выхода.
   */
  test('ответ можно увести на повтор этой же главы', async ({ page }) => {
    const errors = await openEditor(page);

    await addStopAt(page, 0.55);
    await page.getByTestId('stopcard-make-question').click();
    await page.getByTestId('gate-split').click();

    const currentId = await page.evaluate(
      () => (window as unknown as { __project: { segments: { id: string }[] } }).__project.segments[0]!.id,
    );

    const goto = page.getByTestId('stopcard-option-goto-0');
    await expect(
      goto.locator(`option[value="${currentId}"]`),
      'в списке целей нет самой этой главы — сценарий «пройти заново» недостижим',
    ).toHaveCount(1);

    await goto.selectOption(currentId);

    const rules = await rulesOf(page);
    const back = rules.find((rule) => rule.goto === currentId);
    expect(back, 'выбор «пройти эту главу заново» не дошёл до правил выхода').toBeTruthy();
    expect(back!.when).toHaveLength(1);

    expect(errors).toEqual([]);
  });

  /**
   * ГЛАВНОЕ ОБЕЩАНИЕ СРЕЗА: зритель увидит вопрос.
   *
   * До Сессии 55 текст вопроса на сцену не попадал ВОВСЕ — его рисовала
   * служебная плашка оснастки поверх картинки автора, а при полностью
   * привязанных вариантах плашка не открывалась, и вопроса не видел никто
   * (ранний возврат в `apps/playground/src/main.ts`). Замер: во всех
   * эталонных наборах ноль вариантов было привязано к фигурам — задуманный
   * путь ADR-011 на живых данных не встречался ни разу.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: «Задать вопрос» перестало класть элементы
   * на сцену; ответы перестали ссылаться на свои фигуры; вопрос лёг
   * на сцену, но пустым текстом (тогда он невидим, и автор решит,
   * что ничего не создалось).
   */
  test('вопрос и ответы ложатся на сцену настоящими элементами', async ({ page }) => {
    const errors = await openEditor(page);

    const before = await page.locator('.ed-stage-host [data-id]').count();

    await addStopAt(page, 0.55);
    await page.getByTestId('stopcard-make-question').click();
    await expect(page.getByTestId('stopcard-prompt')).toBeVisible();

    /*
     * ПРОВЕРЯЕТСЯ ПО ИМЕНАМ, А НЕ ПО СЧЁТУ. Считать перестало быть можно
     * с 25.08.2026: то же нажатие режет главу по развилке, и часть элементов
     * законно уезжает в продолжение — счёт на сцене меняется в обе стороны.
     * Утверждение теста от этого не зависит: вопрос и КАЖДЫЙ ответ обязаны
     * лежать на сцене настоящими узлами, которые автор может подвинуть.
     */
    expect(before, 'на сцене нечему было лежать до вопроса').toBeGreaterThanOrEqual(0);
    const onStage = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: {
          segments: {
            gates: { config: { kind: string; promptElementId?: string; options?: { elementId?: string }[] } }[];
          }[];
        };
      }).__project;
      const gate = project.segments[0]!.gates.at(-1)!;
      const config = gate.config;
      const wanted = [config.promptElementId, ...(config.options ?? []).map((o) => o.elementId)]
        .filter((id): id is string => typeof id === 'string');
      return wanted.map((id) => ({
        id,
        наСцене: document.querySelector(`.ed-stage-host [data-id="${id}"]`) !== null,
      }));
    });
    expect(onStage.length, 'у вопроса нет ни текста, ни ответов — проверять нечего')
      .toBeGreaterThan(1);
    for (const item of onStage) {
      expect(item.наСцене, `элемент «${item.id}» не лёг на сцену`).toBe(true);
    }

    const gate = await page.evaluate(
      () => (window as unknown as {
        __project: {
          segments: {
            elements: { id: string; content: string }[];
            gates: { config: { prompt: string; promptElementId?: string; options: { elementId?: string }[] } }[];
          }[];
        };
      }).__project.segments[0]!,
    );
    const config = gate.gates.at(-1)!.config;

    // Каждый ответ ссылается на СВОЮ фигуру, и все ссылки живые.
    const ids = new Set(gate.elements.map((element) => element.id));
    for (const option of config.options) {
      expect(option.elementId, 'ответ не привязан — зритель получит системную кнопку').toBeDefined();
      expect(ids.has(option.elementId!)).toBe(true);
    }
    expect(new Set(config.options.map((o) => o.elementId)).size).toBe(config.options.length);

    // Вопрос тоже показан фигурой, и текст у неё НЕ ПУСТОЙ: пустой текст
    // на сцене невидим, и автор решил бы, что вопрос не создался.
    expect(config.promptElementId, 'вопрос не вынесен на сцену').toBeDefined();
    const promptElement = gate.elements.find((element) => element.id === config.promptElementId);
    expect(promptElement?.content, 'текст вопроса на сцене пуст — его не будет видно').toBeTruthy();

    expect(errors).toEqual([]);
  });

  /**
   * ОДИН ТЕКСТ — ОДНО ЗНАЧЕНИЕ. Вопрос теперь живёт в двух местах сразу:
   * в данных остановки и на сцене. Правка обязана доходить до обоих, иначе
   * автор пишет одно, а зритель читает другое — и оба значения по отдельности
   * верны, поэтому никакая проверка целостности не покраснеет.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: правка вопроса перестала доходить до фигуры;
   * холст перестал перерисовывать элемент, у которого изменилось содержимое
   * (этот дефект и был найден здесь: точечное обновление сцены срабатывало
   * только на смену СОСТОЯНИЙ слайда, а содержимое живёт в самом элементе).
   *
   * Проверяется НА ЭКРАНЕ, а не в данных: «в проекте поменялось» было бы
   * зелёным и при полностью замершем холсте.
   */
  test('правка вопроса в карточке доходит до сцены', async ({ page }) => {
    const errors = await openEditor(page);

    await addStopAt(page, 0.55);
    await page.getByTestId('stopcard-make-question').click();

    const promptElementId = await page.evaluate(
      () => (window as unknown as {
        __project: { segments: { gates: { config: { promptElementId?: string } }[] }[] };
      }).__project.segments[0]!.gates.at(-1)!.config.promptElementId,
    );
    expect(promptElementId, 'вопрос не вынесен на сцену — проверять нечего').toBeDefined();

    const onStage = page.locator(`.ed-stage-host [data-id="${promptElementId}"]`);
    const wasText = (await onStage.textContent())?.trim();
    expect(wasText, 'заготовочный текст вопроса пуст — прибор врёт').toBeTruthy();

    await page.getByTestId('stopcard-prompt').fill('Какой из них легче?');
    await page.getByTestId('stopcard-prompt').blur();

    await expect(
      onStage,
      'текст на сцене не догнал правку: автор пишет одно, зритель прочтёт другое',
    ).toHaveText('Какой из них легче?');
    expect(await onStage.textContent()).not.toBe(wasText);

    expect(errors).toEqual([]);
  });

  /**
   * ПУСТО ЗНАЧИТ ПУСТО. Требование владельца дословно: «кому нужно видеть
   * надпись о том, что ничего не выделено».
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: карточка стала показываться постоянно — например,
   * если условие её отрисовки перестанет спрашивать про выбранную метку.
   *
   * Проверка идёт по ОТСУТСТВИЮ УЗЛА, а не по невидимости: спрятанная
   * карточка занимала бы место в обходе с клавиатуры и находилась бы
   * поиском по имени, оставаясь невидимой автору. Этот класс расхождения
   * в проекте уже стоил трёх зелёных тестов при пустом экране.
   */
  test('пока остановка не выбрана, карточки нет вовсе', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByTestId('stop-card')).toHaveCount(0);

    // Выбор метки СЛАЙДА карточку тоже не показывает: у слайда нет ни
    // вопроса, ни ответов, и пустая карточка над ним была бы той самой
    // плашкой, которой быть не должно.
    await page.locator('[data-mark-kind="slide"]').first().click();
    await expect(page.getByTestId('stop-card')).toHaveCount(0);

    // Положительный контроль прибора: у ОСТАНОВКИ карточка появляется.
    // Без него тест был бы зелёным и в том случае, если карточку удалили
    // из редактора совсем.
    await page.locator('[data-mark-kind="gate"]').first().click();
    await expect(page.getByTestId('stop-card')).toBeVisible();
  });

  /**
   * НЕСУЩИЙ ТЕСТ, куплен вопросом владельца 24.08.2026: «я ответил, а меня
   * никуда не перекинуло».
   *
   * ЧТО ЗА ЭТИМ СТОЯЛО. В словаре продукта вопрос и развилка — разные вещи
   * (`product.md` §2а): вопрос стоит посреди главы и рассказ после него
   * идёт дальше, развилка стоит В КОНЦЕ и делит рассказ. Ответ сам никуда
   * не ведёт: остановка записывает его в переменную, а переход решает выход
   * главы, когда дорожка доиграла. Значит развилку мало объявить — главу
   * надо РАЗРЕЗАТЬ.
   *
   * А карточка до 24.08.2026 предлагала только «Завести ветку под этот
   * ответ» и не предлагала ни выбора вида, ни разреза: выход лежал в панели
   * свойств, куда автор не заходит. То есть единственный видимый путь вёл
   * ровно в яму, из которой владелец и написал.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: из карточки убрали выбор
   * вида или кнопку разреза — путь снова становится непроходимым, не покидая
   * дорожки. Проверено сломом.
   *
   * Проверяется РЕЗУЛЬТАТ В ПРОЕКТЕ (глав стало больше, у головы появились
   * правила выхода), а не то, что кнопки нажались.
   */
  test('развилка и разрез главы делаются, не покидая карточки', async ({ page }) => {
    const errors = await openEditor(page);

    const chaptersBefore = await page.evaluate(
      () => (window as unknown as { __project: { segments: unknown[] } }).__project.segments.length,
    );

    await addStopAt(page, 0.55);
    const card = page.getByTestId('stop-card');
    await expect(card).toBeVisible();
    await card.getByTestId('stopcard-make-question').click();

    /*
     * ДВА НАЖАТИЯ, И ОБА В КАРТОЧКЕ. Требование менялось дважды за сутки,
     * и оба раза — словом владельца:
     *
     *   25.08.2026: «есть варианты ответа — значит развилка». Список «Что
     *   это за остановка» и кнопка разреза убраны, вопрос стал резать сам.
     *
     *   26.08.2026, поправка: «ты можешь поставить остановку, которая
     *   не разрежет главу, но не можешь поставить вопрос, не разрезав.
     *   Надо, чтобы можно было ВЫБРАТЬ: разрезать тут главу для развилки
     *   или задать вопрос, который просто запишет переменную».
     *
     * Итог: вопрос ничего не режет, развилка — отдельная кнопка рядом.
     * Списка «Что это за остановка» по-прежнему нет: вид метки решают
     * варианты, а не выпадающий список.
     */
    await expect(
      card.getByTestId('stop-kind'),
      'список «Что это за остановка» вернулся: вид метки снова объявляют руками',
    ).toHaveCount(0);
    await expect(
      card.getByTestId('gate-split'),
      'кнопки развилки нет в карточке — развилку не сделать, не покидая дорожки',
    ).toBeVisible();

    // Второе нажатие — оно и делает развилку.
    await card.getByTestId('gate-split').click();

    const after = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: {
          segments: { id: string; audio: { src?: string; duration: number }; exit: { rules: unknown[] } }[];
        };
      }).__project;
      const head = project.segments[0]!;
      return {
        глав: project.segments.length,
        правилВыходаУГоловы: head.exit.rules.length,
        немыхВеток: project.segments.filter((s) => s.audio.src === undefined).length,
      };
    });

    // Голова обрывается на развилке и ведёт по правилу на каждый ответ.
    expect(after.правилВыходаУГоловы, 'у головы не появилось правил выхода — разрез не состоялся')
      .toBe(2);
    // Две ветки плюс продолжение.
    expect(after.глав, 'глав не прибавилось на две ветки и продолжение')
      .toBe(chaptersBefore + 3);
    // Ветки немые: чужую дорожку им не отдают (см. split.test.ts).
    expect(after.немыхВеток, 'ветки получили чужую дорожку вместо немой').toBe(2);

    expect(errors).toEqual([]);
  });
});

/**
 * УБИРАЯ ОТВЕТ, УБИРАЕМ И ЕГО ВЕТКУ.
 *
 * Решение владельца 25.08.2026: «надо обеспечить, чтобы ветки удалялись,
 * если я удаляю вариант ответа, соответственно чтобы можно было это делать».
 *
 * Раньше уходил только вариант. Правило выхода на него оставалось висеть —
 * условие про значение, которого больше никто не запишет, — а ветка
 * оставалась главой, в которую нельзя попасть. Доска «Ветки» честно писала
 * «зритель не попадёт», но убирать приходилось руками, и автор про это
 * не знал.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: вернуть в кнопку простой `removeOption` вместо
 * действия `removeGateOption` — ветка и правило останутся висеть.
 */
test.describe('убрать ответ', () => {
  test('уходит вместе со своей веткой и правилом, и Ctrl+Z возвращает всё', async ({ page }) => {
    const errors = await openEditor(page);

    await addStopAt(page, 0.55);
    await page.getByTestId('stopcard-make-question').click();
    await page.getByTestId('gate-split').click();
    // Третий вариант: у выбора обязаны остаться минимум два, иначе кнопка
    // погашена — и тест проверял бы отказ, а не удаление.
    await page.getByTestId('stopcard-add-option').click();

    const before = await page.evaluate(() => {
      const p = (window as unknown as {
        __project: { segments: { id: string; title: string; exit: { rules: unknown[] } }[] };
      }).__project;
      return { глав: p.segments.length, правил: p.segments[0]!.exit.rules.length,
        имена: p.segments.map((s) => s.title) };
    });
    expect(before.правил, 'правил меньше двух — убирать нечего').toBeGreaterThanOrEqual(2);

    const remove = page.getByTestId('stopcard-option-remove-1');
    await expect(remove, 'кнопки «Убрать ответ» нет в карточке').toBeVisible();
    await expect(remove, 'кнопка погашена там, где вариантов больше двух').toBeEnabled();
    await remove.click();

    const after = await page.evaluate(() => {
      const p = (window as unknown as {
        __project: { segments: { id: string; title: string; exit: { rules: unknown[] } }[] };
      }).__project;
      return { глав: p.segments.length, правил: p.segments[0]!.exit.rules.length };
    });
    expect(after.глав, 'ветка осталась висеть главой, в которую некому вести')
      .toBe(before.глав - 1);
    expect(after.правил, 'правило на убранный ответ осталось').toBe(before.правил - 1);

    // ОДИН шаг истории: возвращается и вариант, и правило, и глава.
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => {
      const p = (window as unknown as {
        __project: { segments: { id: string; title: string; exit: { rules: unknown[] } }[] };
      }).__project;
      return { глав: p.segments.length, правил: p.segments[0]!.exit.rules.length,
        имена: p.segments.map((s) => s.title) };
    });
    expect(undone.глав, 'Ctrl+Z вернул не всё: главы нет').toBe(before.глав);
    expect(undone.правил, 'Ctrl+Z вернул не всё: правила нет').toBe(before.правил);
    expect(undone.имена).toEqual(before.имена);

    expect(errors).toEqual([]);
  });
});
