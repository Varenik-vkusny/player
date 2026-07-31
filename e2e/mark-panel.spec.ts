/**
 * Срез 3 (настройка гейта) и срез 4 (настройка анимации) плана сессии 3:
 * панель выделенной метки (`panels/MarkPanel.tsx`).
 *
 * Критерий приёмки сессии — «гейт с выбором варианта, собранный в редакторе,
 * работает в плеере», плюс гейт-ввод и анимация с правленым свойством.
 * Каждый тест доходит до настоящего плеера (тот же круг, что и
 * `e2e/roundtrip.spec.ts`) и нажимает по видимым узлам — проверка «вызвался
 * ли колбэк панели» была бы зелёной и при сломанной привязке варианта
 * к элементу (ADR-011), и при потерянной правке свойства анимации.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function waitTransportReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

async function setNumberField(page: Page, label: string, value: number): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press('Tab');
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);

test.describe('панель гейта: выбор варианта', () => {
  test('гейт с вариантами, привязанными к элементам сцены, собранный в редакторе, работает в плеере', async ({
    page,
    context,
  }) => {
    await openEditor(page, 'empty');
    await waitTransportReady(page);

    // Два текстовых элемента, разнесённые по сцене, чтобы клики в плеере
    // однозначно попадали каждый в свой узел.
    await page.getByTestId('insert-text').click(); // text-1, авто-выделен
    await setNumberField(page, 'X, px', 100);
    await setNumberField(page, 'Y, px', 400);

    await page.getByTestId('insert-text').click(); // text-2, авто-выделен
    await setNumberField(page, 'X, px', 1000);
    await setNumberField(page, 'Y, px', 400);

    const ids = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { elements: { id: string }[] }[] } })
          .__project.segments[0]!.elements.map((element) => element.id),
    );
    expect(ids).toEqual(['text-1', 'text-2']);

    // Гейт СТРОГО после нулевой секунды, а не на ней: гейт ровно на t=0
    // упирается в отдельный, не связанный с этой сессией дефект плеера —
    // см. отчёт сессии, раздел «Что выглядит неправильным». Секунда 1
    // безопасна и здесь не нужна ради самого теста.
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(seconds: number): void } }).__transport.seek(1);
    });
    await expect(page.getByTestId('track-clock')).toContainText('00:01', { timeout: 5_000 });
    await page.getByRole('button', { name: /остановка/ }).click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    await page.getByLabel('Вид', { exact: true }).selectOption('choice');
    await page.getByLabel('Вопрос', { exact: true }).fill('Что было часами проекта?');

    await page.getByTestId('gate-option-bind-0').selectOption('text-1');
    await page.getByTestId('gate-option-bind-1').selectOption('text-2');
    await page.getByTestId('gate-option-correct-1').check();

    const gate = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: unknown[] }[] } })
          .__project.segments[0]!.gates[0],
    );
    expect(gate).toMatchObject({
      config: {
        kind: 'choice',
        options: [
          { id: 'text-1' },
          { id: 'text-2' },
        ],
        correctId: 'text-2',
      },
    });

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });
    await expect(player.locator('[data-id="text-1"]')).toBeVisible();
    await expect(player.locator('[data-id="text-2"]')).toBeVisible();

    await player.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(player), { timeout: 20_000 }).toBe('at-gate');

    // Гибрид ADR-011: варианты — сами элементы сцены, плашки нет вовсе.
    await expect(player.locator('#overlay[data-open="1"]')).toBeHidden();

    // Неверный вариант — клик ПО ВИДИМОМУ ЭЛЕМЕНТУ сцены, не answer() напрямую.
    await player.locator('[data-id="text-1"]').click();
    expect(await stateOf(player), 'неверный ответ не пропускает дальше').toBe('at-gate');

    await player.locator('[data-id="text-2"]').click();
    await expect.poll(() => stateOf(player), 'верный ответ пропускает дальше').toBe('playing');
  });
});

test.describe('панель гейта: ввод ответа', () => {
  test('гейт с вводом слова, собранный в редакторе, принимает ответ', async ({ page, context }) => {
    await openEditor(page, 'empty');
    await waitTransportReady(page);

    // Гейт СТРОГО после нулевой секунды — см. комментарий в тесте выше.
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(seconds: number): void } }).__transport.seek(1);
    });
    await expect(page.getByTestId('track-clock')).toContainText('00:01', { timeout: 5_000 });
    await page.getByRole('button', { name: /остановка/ }).click();
    await page.getByLabel('Вид', { exact: true }).selectOption('input');
    await page.getByLabel('Вопрос', { exact: true }).fill('Что является часами проекта?');

    const accept = page.getByTestId('gate-accept');
    await accept.fill('аудио');
    await accept.press('Tab');

    const config = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: { config: unknown }[] }[] } })
          .__project.segments[0]!.gates[0]!.config,
    );
    expect(config).toMatchObject({ kind: 'input', accept: ['аудио'], caseSensitive: false });

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });

    await player.getByRole('button', { name: 'Играть' }).click();
    await expect(player.locator('#gate-input')).toBeVisible({ timeout: 20_000 });

    // Другой регистр — гейт создан с caseSensitive: false по умолчанию.
    await player.locator('#gate-input').fill('АУДИО');
    await player.getByRole('button', { name: 'Ответить' }).click();

    await expect(player.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect.poll(() => stateOf(player)).toBe('playing');
  });
});


test.describe('привязка метки: слово или секунда', () => {
  /**
   * Инвариант №10 с другой стороны: раньше интерфейс ВСЕГДА выбирал слово,
   * и часть без расшифровки разметить было нечем. Проверяется по тому, что
   * легло в проект: подпись в панели была бы зелёной и при потерянной правке.
   */
  test('автор переводит метку со слова на секунду, и время не сдвигается', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);

    const slideId = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { slides: { id: string }[] }[] } })
          .__project.segments[0]!.slides[1]!.id,
    );
    const refOf = () =>
      page.evaluate(
        (id) =>
          (window as unknown as {
            __project: { segments: { slides: { id: string; at: { kind: string } }[] }[] };
          }).__project.segments[0]!.slides.find((slide) => slide.id === id)!.at,
        slideId,
      );

    // Секунды считаются из проекта, а не берутся из интерфейса: подпись
    // на дорожке округлена, а сравнивать надо то, что реально сохранено.
    const words = await page.evaluate(
      () =>
        (window as unknown as {
          __project: { segments: { audio: { words: { start: number }[] } }[] };
        }).__project.segments[0]!.audio.words,
    );
    const secondsOf = (ref: { kind: string; t?: number; wordIndex?: number; offset?: number }) =>
      ref.kind === 'seconds' ? ref.t! : words[ref.wordIndex!]!.start + ref.offset!;

    const before = await refOf();
    expect(before.kind, 'метка эталонной фикстуры стоит на слове').toBe('word');

    await page.getByTestId(`mark-slide-${slideId}`).click();
    await expect(page.getByTestId('mark-time')).toBeVisible();

    // Слово привязки видно автору постоянно — круг «к секунде и обратно»
    // может выбрать другое слово, и это единственный способ это заметить.
    await expect(page.getByLabel('Слово', { exact: true })).not.toHaveValue('');

    await page.getByLabel('Метка привязана', { exact: true }).selectOption('seconds');

    const after = await refOf();
    expect(after.kind, 'привязка поменялась на секунду').toBe('seconds');
    expect(secondsOf(after), 'метка осталась на том же времени').toBeCloseTo(
      secondsOf(before),
      6,
    );
  });

  /**
   * Ветка без озвучки — законный случай (`product.md` §2в [Р]), а не ошибка.
   * `exit-branch.json` несёт части с ПУСТОЙ расшифровкой давно; интерфейс
   * до сих пор об этом молчал.
   */
  test('без расшифровки привязка к слову не предлагается, и сказано почему', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    const words = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { audio: { words: unknown[] } }[] } })
          .__project.segments[0]!.audio.words.length,
    );
    expect(words, 'у части нет расшифровки').toBe(0);

    // Под дорожкой, где обычно строка расшифровки, — не пустота, а причина.
    await expect(page.getByTestId('track-words')).toContainText(/Расшифровки нет/);

    await page.getByTestId('mark-gate-g-ask').click();
    await expect(page.getByTestId('mark-time')).toBeVisible();

    const anchor = page.getByLabel('Метка привязана', { exact: true });
    await expect(anchor).toHaveValue('seconds');
    // Молча погашенная кнопка — тупик; причина обязана быть на экране.
    await expect(page.getByTestId('word-anchor-problem')).toContainText(/расшифровки/);
    await expect(
      anchor.locator('option[value="word"]'),
      'привязка к слову не предлагается вовсе',
    ).toHaveCount(0);
  });
});

test.describe('панель остановки: имя переменной задаёт автор', () => {
  /**
   * Каскад по правилам выхода — ровно тот дефект, ради которого пункт
   * затевался, и проверяется он там, где он проявился бы: у ЗРИТЕЛЯ.
   * Не пройти каскадом — значит оставить правило, смотрящее на старое имя;
   * проект при этом останется валидным по схеме, интерфейс покажет новое имя,
   * и всё выглядело бы работающим до первого прохождения развилки.
   *
   * `exit-branch.json`: остановка `g-ask` пишет «куда», два правила выхода
   * этого же сегмента ведут в `s-right` и `s-left`.
   */
  test('переименование переменной не ломает развилку у зрителя', async ({ page, context }) => {
    await openEditor(page, 'exit-branch');

    const mark = page.getByTestId('mark-gate-g-ask');
    await expect(mark, 'метка развилки видна на дорожке').toBeVisible();
    await mark.click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    const field = page.getByLabel('Ответ запоминается как', { exact: true });
    await expect(field, 'имя переменной больше не только для чтения').toBeEnabled();
    await expect(field).toHaveValue('куда');

    await field.fill('куда пошёл зритель');

    const renamed = await page.evaluate(
      () =>
        (window as unknown as {
          __project: {
            segments: {
              gates: { recordAs: string }[];
              exit: { rules: { when: { variable: string } }[] };
            }[];
          };
        }).__project.segments[0]!,
    );
    expect(renamed.gates[0]!.recordAs, 'имя остановки поменялось').toBe('куда пошёл зритель');
    expect(
      renamed.exit.rules.map((rule) => rule.when.variable),
      'правила выхода поехали за именем, а не осиротели',
    ).toEqual(['куда пошёл зритель', 'куда пошёл зритель']);

    // Несущая проверка: развилка по-прежнему доводит зрителя до своей ветки.
    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });

    await player.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(player), { timeout: 15_000 }).toBe('at-gate');
    await player.getByRole('button', { name: 'Направо' }).click();

    await expect(player.locator('[data-id="r-bg"]'), 'зритель дошёл до своей ветки').toBeVisible({
      timeout: 15_000,
    });
    await expect(player.locator('[data-id="l-bg"]')).toHaveCount(0);
  });

  test('занятое имя объясняется, а не отвергается молча', async ({ page }) => {
    await openEditor(page, 'two-gates');

    const ids = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: { id: string; recordAs: string }[] }[] } })
          .__project.segments[0]!.gates.map((gate) => ({ id: gate.id, recordAs: gate.recordAs })),
    );
    expect(ids.length, 'фикстура даёт две остановки').toBeGreaterThan(1);

    await page.getByTestId(`mark-gate-${ids[0]!.id}`).click();
    const field = page.getByLabel('Ответ запоминается как', { exact: true });
    await field.fill(ids[1]!.recordAs);

    // Причина видна автору, а не спрятана в консоли.
    await expect(page.getByRole('alert')).toContainText(/уже пишет остановка/);

    const after = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: { recordAs: string }[] }[] } })
          .__project.segments[0]!.gates[0]!.recordAs,
    );
    expect(after, 'отвергнутое имя в проект не попало').toBe(ids[0]!.recordAs);
  });
});

test.describe('панель слайда: переход плавно / резко', () => {
  /**
   * Проверка идёт по тому, что легло В ПРОЕКТ, а не по тому, что показал
   * виджет: `<select>` с правильной подписью был бы зелёным и при потерянной
   * правке. Отмена нужна по той же причине с другой стороны — она доказывает,
   * что значение прошло через редьюсер и историю, а не осело в локальном
   * состоянии компонента.
   *
   * Что `cut` действительно означает нулевую длительность движения,
   * проверяет плеер своим юнитом (`packages/player/test/morph.test.ts`);
   * здесь проверяется ровно то, чего не хватало, — что автор МОЖЕТ это сказать.
   */
  test('автор переключает переход на резкий, и это ложится в проект', async ({ page }) => {
    await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
      timeout: 30_000,
    });

    const transitionOf = (slideId: string) =>
      page.evaluate(
        (id) =>
          (window as unknown as {
            __project: { segments: { slides: { id: string; transition: string }[] }[] };
          }).__project.segments[0]!.slides.find((slide) => slide.id === id)?.transition,
        slideId,
      );

    // Второй слайд части: первый меткой на дорожке не является вовсе.
    const slideId = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { slides: { id: string }[] }[] } })
          .__project.segments[0]!.slides[1]!.id,
    );
    expect(await transitionOf(slideId), 'по умолчанию переход плавный').toBe('morph');

    const mark = page.getByTestId(`mark-slide-${slideId}`);
    await expect(mark, 'метка второго слайда видна на дорожке').toBeVisible();
    await mark.click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    const field = page.getByLabel('Переход', { exact: true });
    await expect(field, 'переход больше не только для чтения').toBeEnabled();
    await field.selectOption('cut');

    expect(await transitionOf(slideId), 'резкий переход дошёл до проекта').toBe('cut');

    // Правка обязана быть шагом истории, а не состоянием виджета.
    await page.keyboard.press('Control+z');
    expect(await transitionOf(slideId), 'отмена вернула плавный переход').toBe('morph');
  });
});

/*
 * Блок «панель анимации» удалён вместе с предметом.
 *
 * Он проверял правку кью — «свойство, from, to, длительность, плавность».
 * В схеме v3 кью не существует: анимация выражается слайдами, а длительность
 * перехода — свойство слайда. Адаптировать было нечего, поэтому тест удалён,
 * а не переписан. Морфинг между слайдами получит собственную страховку
 * в той сессии, где появится (ADR-015).
 */
