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
    await expect(page.getByTestId('stopcard-prompt')).toBeVisible();

    await page.getByTestId('stopcard-prompt').fill('Какой из них легче?');
    await page.getByTestId('stopcard-prompt').blur();
    await page.getByTestId('stopcard-option-label-0').fill('Первый');
    await page.getByTestId('stopcard-option-label-0').blur();

    // До нажатия ответ никуда своего не ведёт — иначе кнопки ветки не было бы,
    // и тест проверял бы не то, что называет.
    const branch = page.getByTestId('stopcard-option-branch-0');
    await expect(branch, 'у свежего ответа обязан быть тупик — иначе ветку заводить не от чего').toBeVisible();
    await branch.click();

    const rulesAfter = await rulesOf(page);
    expect(
      rulesAfter.length,
      'правил выхода не прибавилось — ветка не завелась, сколько бы кнопок ни нажалось',
    ).toBe(rulesBefore.length + 1);

    const added = rulesAfter[rulesAfter.length - 1]!;
    expect(added.when).toHaveLength(1);
    expect(added.goto, 'правило ведёт в никуда').toBeTruthy();

    // Ветка ДЕЙСТВИТЕЛЬНО появилась в проекте, а не только в правиле:
    // правило, ведущее в несуществующую главу, схема бы не пропустила,
    // но проверить это здесь дешевле, чем узнать при сохранении.
    const chapterExists = await page.evaluate(
      (goto) =>
        (window as unknown as { __project: { segments: { id: string }[] } }).__project.segments.some(
          (segment) => segment.id === goto,
        ),
      added.goto,
    );
    expect(chapterExists, `глава «${added.goto}» из правила не найдена в проекте`).toBe(true);

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

    // На сцене прибавилось РОВНО: вопрос плюс по элементу на ответ.
    const options = await page.getByTestId('stopcard-prompt').evaluate(
      () => (window as unknown as {
        __project: { segments: { gates: { config: { options: unknown[] } }[] }[] };
      }).__project.segments[0]!.gates.at(-1)!.config.options.length,
    );
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(before + 1 + options);

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

    // Вид остановки — В КАРТОЧКЕ. Ищем внутри неё намеренно: найдись орган
    // где-то ещё, тест обязан этого не заметить, потому что охраняет он
    // путь автора, а не наличие узла на странице.
    await card.getByTestId('stop-kind').locator('select').selectOption('fork');
    await expect(card.getByTestId('fork-hint'), 'карточка молчит о том, чем развилка отличается')
      .toBeVisible();

    const split = card.getByTestId('gate-split');
    await expect(split, 'в карточке нет разреза — развилку объявить можно, а сделать нельзя')
      .toBeVisible();
    await expect(split, 'разрез погашен там, где делить есть что').toBeEnabled();
    await split.click();

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
