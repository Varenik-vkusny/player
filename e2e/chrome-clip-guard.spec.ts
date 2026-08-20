/**
 * ОХРАНА НА КЛАСС ДЕФЕКТА: хром не прячет содержимое молча.
 *
 * Не про панель метки и не про список элементов — правило для ВСЕХ узлов
 * хрома разом.
 *
 * Зачем класс, а не случай. Панель метки, раздавленная до 24 px при
 * 1427 px содержимого (1.7 %), прошла мимо 473 зелёных тестов. Причина
 * не в том, что тестов мало, а в том, что все они спрашивали не то:
 * Playwright перед щелчком САМ прокручивает вложенный контейнер и честно
 * нажимает кнопку внутри щели. То есть «нажимается ли» зелено и на
 * раздавленной панели. Спрашивать надо не «достаётся ли», а «СКОЛЬКО ВИДНО».
 *
 * Правило. Узел хрома имеет право прятать своё содержимое по вертикали
 * только если он ОБЪЯВЛЕННЫЙ контейнер прокрутки — то есть назван ниже
 * поимённо. Всякий другой обязан показывать содержимое целиком.
 *
 * Почему `overflow: visible` не считается сокрытием. Беда этого класса —
 * ТИХОЕ сокращение: содержимое исчезает, и ни один сигнал об этом не
 * говорит. При `visible` содержимое выходит наружу ВИДИМО, налезая на
 * соседей: это громкий отказ,он другого класса и ловится глазами.
 * Ровно по этой причине `overflow: visible` оставлен в `.ed-side >
 * .ed-inspector` намеренно (styles.ts, комментарий там же).
 *
 * Имена классов берутся через `el.classList`, а НЕ разбором строки
 * `className`. Куплено 18.08.2026: разбор регуляркой внутри строки для
 * `page.evaluate` МОЛЧА исказил имена — `ed-side` доложился как `ed-`,
 * `ed-elements-list` как `ed-element`. Числа при этом остались верными,
 * и отчёт выглядел достоверно. Белый список, собранный по таким именам,
 * не совпал бы ни с чем и охрана стала бы декоративной.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: любой узел хрома, не названный
 * в списке ниже, начинает прятать своё содержимое. Проверено ВОЗВРАЩЁННОЙ
 * БЕДОЙ, а не выдуманным сломом: удаление правила
 * `.ed-side > .ed-inspector { flex: 0 0 auto; overflow: visible; }`
 * возвращает панель метки в то самое состояние, с которого началась
 * программа. Вывод красного и зелёного — в журнале Сессии 49.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

/**
 * Узлы, которым прятать содержимое по вертикали РАЗРЕШЕНО, и почему.
 * Список закрытый и лежит на виду: дописать себя в него можно только
 * нарочно и заметно.
 *
 * Собран ИЗМЕРЕНИЕМ живой страницы (spikes/s49-ux/probe-clip.mjs),
 * а не выписан из styles.ts: объявленный overflow и фактическое сокрытие —
 * разные вещи.
 */
const ALLOWED_TO_CLIP = new Set([
  // Договор правой колонки: прокручивается она целиком, а подпанели
  // внутри неё растут по содержимому. Именно колонка и есть тот один
  // контейнер, которому прокрутка поручена.
  'ed-side',
  // Списки со своим потолком высоты — прокрутка у них по назначению.
  'ed-slide-list',
  'ed-segment-list',
  'ed-elements-list',
  'ed-slide-strip-cards',
  'ed-lane-scroll',
  'ed-catalog-body',
  'ed-rail',
  'ed-stage-scroll',
  // Расшифровка дорожки: длинный текст, прокрутка по назначению.
  'ed-words-body',
  // Визуально спрятанный <input type="file"> — 1 px при 21 px содержимого.
  // Прячется намеренно: наружу торчит своя кнопка.
  'ed-audio-input',

  /*
   * СНИМКИ СЦЕНЫ — не обрезка, а масштаб, и разница здесь принципиальная.
   *
   * Внутри этих узлов лежит настоящая сцена в своих координатах (1920x1080),
   * вписанная в коробку трансформацией. `scrollHeight` меряет содержимое
   * ДО трансформации, поэтому прибор видит «88 из 1080» и объявляет
   * сокрытие 8 %. На экране при этом видно ВСЁ: кадр целиком, просто мелко.
   *
   * Прибор не сломан — он меряет то, что умеет; выразить «содержимое
   * масштабировано» через scrollHeight нельзя вовсе.
   *
   * `ed-slide-strip-scene` внесён заодно, хотя сегодня не краснеет:
   * лента слайдов свёрнута по умолчанию, и её карточки просто не дошли
   * до обхода. Это мина — она сработала бы у первого, кто откроет ленту
   * в состоянии по умолчанию, и выглядела бы находкой.
   */
  'ed-tile-scene',
  'ed-slide-strip-scene',

  /*
   * ⚠️ ЕДИНСТВЕННЫЙ КЛАСС, КОТОРЫЙ ПРЯЧЕТ НАМЕРЕННО, и потому опасный.
   *
   * `ed-visually-hidden` убирает текст с глаз, оставляя его экранному
   * диктору. Сторож обязан его видеть — он и видит: 1 px при 21 px
   * содержимого. Внесён сюда потому, что иначе сторож краснел бы
   * на своём же назначении.
   *
   * ЭТО НЕ РАЗРЕШЕНИЕ ПРЯТАТЬ. Проект уже покупал ровно такой дефект:
   * подписи полей полосы свойств существуют в DOM, имеют размер 1×1
   * и clip-path, и три e2e были зелёными при пустом экране. Разница
   * с тем случаем одна и она обязательна к соблюдению:
   *
   *   класс вешается ТОЛЬКО на дубликат смысла, у которого есть видимый
   *   носитель рядом.
   *
   * Сегодня носитель один: подпись поля поиска, чей текст виден
   * подсказкой внутри самого поля. Подсказка исчезает при вводе — потому
   * дубликат и нужен, — но пока поле пусто, человек видит то же слово.
   *
   * Повесить этот класс на единственный носитель смысла значит вернуть
   * тот дефект, и сторож об этом уже не скажет.
   */
  'ed-visually-hidden',

  // ⬛ НИЖЕ — НЕ РАЗРЕШЕНИЕ, А ЗАПИСАННЫЙ ДОЛГ.
  // Заголовок и приписка головки дорожки обрезаны по вертикали:
  // 13 px при 17 px содержимого (76.5 %), overflow: hidden. Срезается
  // низ строчных с выносными элементами. Найдено Сессией 49 (Н-03),
  // записано в docs/debt.md. Внесены сюда, чтобы охрана ловила НОВОЕ,
  // а не краснела на известном; убрать отсюда при починке.
  'ed-lane-head-title',
  'ed-lane-head-note',
]);

/** Сколько узлов хрома обход обязан увидеть, чтобы считаться состоявшимся. */
const MIN_NODES = 150;

type Clip = {
  cls: string[];
  tag: string;
  testid: string | null;
  client: number;
  scroll: number;
  pct: number;
  overflowY: string;
};

type Census = { considered: number; total: number; probeSeen: boolean; clipping: Clip[] };

/**
 * Перепись сокрытого + КОНТРОЛЬ САМОГО ПРИБОРА в одном заходе.
 *
 * Контроль обязателен: «никто не прячет» и «детектор не работает»
 * выглядят одинаково — пустым списком. Поэтому в страницу впрыскивается
 * заведомо обрезанный узел, и если детектор его НЕ находит, тест обязан
 * упасть, каким бы чистым ни выглядел список.
 */
const census = (page: Page): Promise<Census> =>
  page.evaluate(() => {
    const root = document.querySelector('.ed-root');
    if (!root) throw new Error('нет .ed-root — мерить нечего');

    const scan = (): Clip[] => {
      const out: Clip[] = [];
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const cls = Array.from(el.classList).filter((c) => c.startsWith('ed-'));
        if (cls.length === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.scrollHeight <= el.clientHeight + 1) continue;
        const cs = getComputedStyle(el);
        // Содержимое, выходящее наружу видимо, не спрятано — другой класс.
        if (cs.overflowY === 'visible') continue;
        out.push({
          cls,
          tag: el.tagName.toLowerCase(),
          testid: el.getAttribute('data-testid'),
          client: el.clientHeight,
          scroll: el.scrollHeight,
          pct: Math.round((el.clientHeight / el.scrollHeight) * 1000) / 10,
          overflowY: cs.overflowY,
        });
      }
      return out;
    };

    const all = Array.from(root.querySelectorAll('*'));
    const considered = all.filter((el) =>
      Array.from(el.classList).some((c) => c.startsWith('ed-')),
    ).length;

    const clipping = scan();

    // Заведомое «да» для прибора.
    const probe = document.createElement('div');
    probe.className = 'ed-probe-clip-selftest';
    probe.style.cssText = 'height:20px;overflow:auto;';
    probe.innerHTML = '<div style="height:200px"></div>';
    root.appendChild(probe);
    const probeSeen = scan().some((c) => c.cls.includes('ed-probe-clip-selftest'));
    probe.remove();

    return { considered, total: all.length, probeSeen, clipping };
  });

const openEditor = async (page: Page, fixture: string): Promise<void> => {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
};

const report = (clips: Clip[]): string =>
  clips
    .map(
      (c) =>
        `.${c.cls.join('.')}${c.testid ? ` [${c.testid}]` : ''} — видно ${c.client} из ${c.scroll} (${c.pct} %), overflow-y: ${c.overflowY}`,
    )
    .join('\n');

/**
 * Общая проверка одного состояния хрома.
 *
 * Три утверждения, и каждое обязательно:
 *   1) обход состоялся (иначе пустой список ничего не значит);
 *   2) прибор видит заведомо обрезанное;
 *   3) собственно правило.
 */
const expectNothingHidden = async (page: Page, where: string): Promise<void> => {
  const c = await census(page);

  expect(c.considered, `обход не состоялся: узлов ed-* всего ${c.considered} (${where})`)
    .toBeGreaterThanOrEqual(MIN_NODES);
  expect(c.probeSeen, `детектор НЕ увидел заведомо обрезанный узел (${where}) — прибор сломан`)
    .toBe(true);

  const offenders = c.clipping.filter((x) => !x.cls.some((n) => ALLOWED_TO_CLIP.has(n)));
  expect(
    offenders,
    `хром прячет содержимое молча (${where}):\n${report(offenders)}`,
  ).toEqual([]);
};

test('хром не прячет содержимое: обычный вид', async ({ page }) => {
  await openEditor(page, 'demo');
  await expectNothingHidden(page, 'фикстура demo, 1280x800');
});

/**
 * Состояние, в котором и родился дефект: выделена метка, и в правой
 * колонке появилась её панель. Именно она была раздавлена до 1.7 %.
 */
test('хром не прячет содержимое: выделена остановка', async ({ page }) => {
  await openEditor(page, 'two-gates');
  await page.locator('.ed-mark-gate').first().click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();
  await expectNothingHidden(page, 'фикстура two-gates, выделена остановка');
});

/**
 * Свёрнутый каталог — другая раскладка: колонки шире, полоса свойств
 * длиннее. Раздавить панель может и это.
 */
test('хром не прячет содержимое: каталог свёрнут', async ({ page }) => {
  await openEditor(page, 'two-gates');
  await page.getByTestId('collapse-catalog').click();

  // Положительный контроль на состояние прибора: каталог ДЕЙСТВИТЕЛЬНО
  // свёрнут. Свёрнутость живёт в хранилище и переживает переход,
  // поэтому подразумевать её нельзя — её меряют.
  const catalogWidth = await page.evaluate(() => {
    const el = document.querySelector('.ed-catalog');
    return el ? el.getBoundingClientRect().width : -1;
  });
  expect(catalogWidth, 'каталог не свернулся — состояние не то, что проверяем').toBeLessThan(100);

  await page.locator('.ed-mark-gate').first().click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();
  await expectNothingHidden(page, 'фикстура two-gates, каталог свёрнут');
});
