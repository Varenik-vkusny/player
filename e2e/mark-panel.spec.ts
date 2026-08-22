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

/**
 * Ставит гейт под ТЕКУЩЕЙ головкой: кнопка «остановка» убрана в Сессии 55,
 * теперь это пункт меню правой кнопки `ctxmenu-add-gate`. Правый щелчок сам
 * перематывает головку в точку щелчка — целимся в ТУ ЖЕ секунду, где она
 * уже стоит (обычно поставлена заранее через `__transport.seek`), чтобы
 * не сдвинуть её повторно.
 */
async function addGateAtHead(page: Page): Promise<void> {
  const box = await page.getByTestId('track-lane').boundingBox();
  if (!box) throw new Error('дорожка не видна');
  const duration = await page.evaluate(
    () =>
      (window as unknown as { __transport: { durationSeconds: number } }).__transport
        .durationSeconds,
  );
  const seconds = await page.evaluate(
    () => (window as unknown as { __transport: { positionSeconds: number } }).__transport.positionSeconds,
  );
  await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + box.height / 2, {
    button: 'right',
  });
  await page.getByTestId('ctxmenu-add-gate').click();
}

test.describe('панель гейта: выбор варианта', () => {
  test('гейт с вариантами, привязанными к элементам сцены, собранный в редакторе, работает в плеере', async ({
    page,
    context,
  }) => {
    await openEditor(page, 'empty');
    await waitTransportReady(page);

    // Два текстовых элемента, разнесённые по сцене, чтобы клики в плеере
    // однозначно попадали каждый в свой узел.
    // Каталог переехал на рельс (Сессия 30): заготовка видна, только когда
    // открыта её категория. Клик по рельсу — часть жеста автора, а не обход.
    // Координаты живут в панели «Объект» (Сессия 30): на полосе над холстом
    // только частые поля стиля, остальное открывается кнопкой «Ещё…».
    // Это тот же жест, что делает автор, а не обход интерфейса.
    await page.getByTestId('rail-text').click();
    await page.getByTestId('insert-text').click(); // text-1, авто-выделен
    await page.getByTestId('propbar-more').click();
    await setNumberField(page, 'X, px', 100);
    await setNumberField(page, 'Y, px', 400);

    await page.getByTestId('rail-text').click();
    await page.getByTestId('insert-text').click(); // text-2, авто-выделен
    await page.getByTestId('propbar-more').click();
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
    await addGateAtHead(page);
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    await page.getByLabel('Вид', { exact: true }).selectOption('choice');
    // Вопрос правится в КАРТОЧКЕ остановки над её меткой, а не в панели
    // (Сессия 55). В панели этого поля больше нет намеренно: два поля на одно
    // значение — два места, куда автор может написать разное, и строгий режим
    // Playwright поймал их как две одинаковые подписи на одном экране.
    await page.getByTestId('stopcard-prompt').fill('Что было часами проекта?');
    await page.getByTestId('stopcard-prompt').blur();

    await page.getByTestId('gate-option-bind-0').selectOption('text-1');
    await page.getByTestId('gate-option-bind-1').selectOption('text-2');
    await page.getByTestId('gate-option-correct-1').check();

    const gate = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: unknown[] }[] } })
          .__project.segments[0]!.gates[0],
    );
    /*
     * ПРОВЕРЯЕТСЯ СВЯЗЬ, А НЕ ПОДМЕНА ИМЕНИ (ADR-035, схема v15).
     *
     * До версии 15 привязка МЕНЯЛА `id` варианта на идентификатор элемента —
     * единственный доступный способ, потому что плеер искал узел совпадением
     * имён. Побочные следствия были прямые: вместе с именем ехал `correctId`
     * и условия правил выхода, ссылавшиеся на этот ответ.
     *
     * Теперь у варианта своё имя и явное поле. Тест утверждает именно это:
     * имена ответов НЕ тронуты, а связь с фигурой записана.
     */
    expect(gate).toMatchObject({
      config: {
        kind: 'choice',
        options: [
          { id: 'option-1', elementId: 'text-1' },
          { id: 'option-2', elementId: 'text-2' },
        ],
        correctId: 'option-2',
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
    await addGateAtHead(page);
    await page.getByLabel('Вид', { exact: true }).selectOption('input');
    await page.getByTestId('stopcard-prompt').fill('Что является часами проекта?');
    await page.getByTestId('stopcard-prompt').blur();

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
              // Схема v5: у правила список условий через И, а не одно условие.
              exit: { rules: { when: { variable: string }[] }[] };
            }[];
          };
        }).__project.segments[0]!,
    );
    expect(renamed.gates[0]!.recordAs, 'имя остановки поменялось').toBe('куда пошёл зритель');
    expect(
      renamed.exit.rules.flatMap((rule) => rule.when.map((condition) => condition.variable)),
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

    // Каталог из восьми плиток (Сессия 23) заменил `<select>` версии 8:
    // нажатие идёт по ВИДИМОЙ плитке, а не через программный selectOption —
    // проверка «вызвался ли обработчик» была бы зелёной и при сломанной
    // привязке клика к плитке.
    const cutTile = page.getByTestId('transition-cut');
    await expect(cutTile, 'плитка «Срез» видна в каталоге').toBeVisible();
    await expect(cutTile, 'плавный переход выбран по умолчанию, не резкий').toHaveAttribute('aria-pressed', 'false');
    await cutTile.click();
    await expect(cutTile, 'плитка «Срез» стала выбранной').toHaveAttribute('aria-pressed', 'true');

    expect(await transitionOf(slideId), 'резкий переход дошёл до проекта').toBe('cut');

    // Правка обязана быть шагом истории, а не состоянием виджета.
    await page.keyboard.press('Control+z');
    expect(await transitionOf(slideId), 'отмена вернула плавный переход').toBe('morph');
  });
});

test.describe('панель слайда: каталог из восьми приёмов и продолжительность', () => {
  /**
   * Фикстура `morph.json` (schemaVersion 3, мигрирует до текущей на загрузке):
   * три слайда на 0, 1 и 2 секундах — второй слайд и берут тесты ниже,
   * расстояние до предыдущего у него ровно 1 с.
   */
  async function selectSecondSlide(page: Page): Promise<string> {
    await openEditor(page, 'morph');
    await waitTransportReady(page);
    const slideId = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { slides: { id: string }[] }[] } })
          .__project.segments[0]!.slides[1]!.id,
    );
    await page.getByTestId(`mark-slide-${slideId}`).click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();
    return slideId;
  }

  /**
   * Слова каталога, а не двоичный тернарник версии 8: до этой сессии ЛЮБОЙ
   * приём, кроме `morph`, подписывался в списке слайдов словом «разрез»
   * (`SlidePanel.tsx:73`) — слайд с активным движением выглядел неподвижным.
   * Слом задания F проверяет именно это: возврат тернарника обязан вернуть
   * тест в красное.
   */
  test('выбор «Растворение» подписывает слайд в списке этим словом, а не «разрез»', async ({ page }) => {
    const slideId = await selectSecondSlide(page);

    const dissolveTile = page.getByTestId('transition-dissolve');
    await expect(dissolveTile, 'плитка «Растворение» видна в каталоге').toBeVisible();
    await dissolveTile.click();
    await expect(dissolveTile, 'плитка «Растворение» стала выбранной').toHaveAttribute('aria-pressed', 'true');

    const row = page.getByTestId(`slide-${slideId}`);
    await expect(row, 'подпись в списке слайдов — «Растворение»').toContainText('Растворение');
    await expect(row, 'подпись НЕ осталась словом «разрез» от старого тернарника').not.toContainText('разрез');
  });

  /**
   * У среза продолжительности не существует (`morphSecondsFor` возвращает 0
   * ДО арифметики) — управление обязано ОТСУТСТВОВАТЬ, а не быть погашенным,
   * и рядом обязана стоять причина словами, а не пустое место.
   */
  test('«Срез» — управления продолжительностью нет на странице, видна причина', async ({ page }) => {
    await selectSecondSlide(page);

    // Слайд фикстуры по умолчанию — morph: управление продолжительностью есть.
    await expect(page.getByTestId('transition-seconds')).toBeVisible();
    await expect(page.getByTestId('transition-seconds-none')).toHaveCount(0);

    await page.getByTestId('transition-cut').click();

    await expect(page.getByTestId('transition-seconds'), 'ползунка после «Среза» на странице нет').toHaveCount(0);
    await expect(page.getByTestId('transition-seconds-none')).toContainText(/нет продолжительности/);
  });

  /**
   * Ползунок не несёт своего состояния (в отличие от `NumberField`, у него
   * нет черновика вовсе) — значение либо дошло до проекта через редьюсер,
   * либо нет. Переоткрытие панели идёт через выбор ДРУГОЙ метки и возврат:
   * `key={slide.id}` в `MarkPanel.tsx` размонтирует и заново монтирует
   * `SlideMarkPanel`, и число обязано прийти заново из пропса, а не выжить
   * в памяти уже уничтоженного компонента.
   */
  test('движение ползунка меняет число и переживает переоткрытие панели', async ({ page }) => {
    const slideId = await selectSecondSlide(page);

    const slider = page.getByLabel('Продолжительность перехода, с', { exact: true });
    await expect(slider).toBeVisible();
    expect(await slider.inputValue(), 'умолчание схемы — 0.6 с').toBe('0.6');

    // `End` — стандартная клавиша range-инпута, ставит значение на max (=1
    // при потолке этого слайда). Такое же нажатие пользователя мышью или
    // клавиатурой, а не вызов обработчика в обход разметки.
    await slider.focus();
    await slider.press('End');
    await expect(slider, 'значение сдвинулось от умолчания').not.toHaveJSProperty('value', '0.6');
    const moved = await slider.inputValue();

    // Другая метка — размонтирует SlideMarkPanel текущего слайда.
    const thirdSlideId = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { slides: { id: string }[] }[] } })
          .__project.segments[0]!.slides[2]!.id,
    );
    await page.getByTestId(`mark-slide-${thirdSlideId}`).click();
    await expect(page.getByTestId(`slide-${thirdSlideId}`)).toBeVisible();

    // И назад — панель второго слайда монтируется заново.
    await page.getByTestId(`mark-slide-${slideId}`).click();
    const reopened = page.getByLabel('Продолжительность перехода, с', { exact: true });
    await expect(reopened, 'значение пережило переоткрытие панели').toHaveJSProperty('value', moved);
  });

  /**
   * Потолок — расстояние до ПРЕДЫДУЩЕГО слайда (ADR-020), не до следующего
   * и не постоянная величина: `max` ползунка обязан считаться из соседних
   * меток дорожки, а не быть захардкожен.
   */
  test('потолок ползунка равен расстоянию до предыдущего слайда', async ({ page }) => {
    await selectSecondSlide(page);

    const slider = page.getByLabel('Продолжительность перехода, с', { exact: true });
    // morph.json: слайды на 0 с и 1 с — расстояние до предыдущего 1 с.
    await expect(slider).toHaveAttribute('max', '1');
  });

  /**
   * Подпись приёма обязана помещаться в плитку ЦЕЛИКОМ.
   *
   * Первая раскладка каталога была на четыре колонки: плитка выходила 49 px,
   * подписи «Растворение» требовалось 63, и она обрезалась многоточием
   * до «Растворен». Ни один сигнал при этом не краснел — обрезка не ломает
   * ничего измеримого, кроме смысла: автор выбирает приём по слову, а слова
   * ему не показали.
   *
   * Ловится только сравнением `scrollWidth` с `clientWidth` или глазами.
   * Глаза не переживают сессию, поэтому здесь прогон.
   *
   * Красным это станет от любой из трёх правок: сузить колонку каталога,
   * увеличить кегль подписи, дать приёму имя длиннее нынешних.
   */
  test('ни одна подпись приёма не обрезана шириной плитки', async ({ page }) => {
    await selectSecondSlide(page);

    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('.ed-transition-tile')]
        .filter((tile) => tile.scrollWidth > tile.clientWidth)
        .map((tile) => ({
          приём: (tile as HTMLElement).dataset['transition'],
          надо: tile.scrollWidth,
          есть: tile.clientWidth,
        })),
    );

    expect(clipped, 'подписи, не поместившиеся в плитку').toEqual([]);
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
