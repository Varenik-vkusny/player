// Сессия 49 — сплошная проверка UX редактора, окно 1920×1080.
//
// Это ИЗМЕРИТЕЛЬНЫЙ спайк, не правка. Ничего не чинит — только меряет живой
// DOM на demo и two-gates и печатает числа.
//
// Ловушка (Сессия 48, замечена контроллером в СВОЁМ приборе этой же сессии):
// строковый разбор `el.className.split(/\s+/)` внутри текста, который идёт
// в `page.evaluate` как строка функции, может исказить регэксп при передаче.
// Здесь везде `Array.from(el.classList)` — надёжный DOM API, а не разбор строки.
//
// Каждое СОЧЕТАНИЕ состояний — свой свежий browser.newContext(): свёрнутость
// каталога и высота дорожки живут в localStorage и переживают page.goto
// (CLAUDE.md, «состояние течёт между замерами»). После каждого действия,
// которое должно что-то изменить, замер СНАЧАЛА подтверждает, что состояние
// действительно то, что предполагается (положительный контроль), и только
// потом снимается целевое число.
//
// headless: true — измеряется раскладка и содержимое DOM, а не кадры и не
// время; тот же выбор оправдан в run-bottom-zone.mjs (S16) для той же задачи.
//
// Запуск (дев-сервер стенда должен быть поднят — pnpm dev, порт 5179):
//   node spikes/s49-ux/ux-1920x1080.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:5179';
const VIEWPORT = { width: 1920, height: 1080 };

let contextsOpened = 0;
let stepsRun = 0;
let totalErrors = 0;

function attachErrorCollectors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function freshPage(browser, fixture) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const errors = attachErrorCollectors(page);
  await page.goto(`${BASE}/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  contextsOpened++;
  return { context, page, errors };
}

async function closeCtx(context, errors) {
  totalErrors += errors.length;
  await context.close();
}

/** Обёртка шага: ловит исключение, помечает шаг ok/не ok, приписывает НОВЫЕ ошибки страницы. */
async function step(steps, errors, name, fn) {
  const before = errors.length;
  let ok = false;
  let detail = '';
  try {
    const r = await fn();
    ok = r.ok;
    detail = r.detail;
  } catch (e) {
    ok = false;
    detail = `ИСКЛЮЧЕНИЕ: ${e && e.message ? e.message : String(e)}`;
  }
  const newErrors = errors.slice(before);
  steps.push({ name, ok, detail, newErrors });
  stepsRun++;
  return ok;
}

/**
 * Первый элемент сцены, который реально можно кликнуть ПРЯМО СЕЙЧАС:
 * видим по CSS (не факт для элементов не на текущем слайде — видимость
 * задаёт `slide.states`, а не сам факт существования элемента в проекте)
 * и не перехвачен другим узлом (замечено на "bg": фон во весь холст,
 * клик по его центру в этой фикстуре достаётся `.ed-stage-canvas`).
 * "bg" пробуется последним — он либо перехвачен, либо это единственный
 * элемент вообще.
 */
/**
 * Слайд 1 фикстуры demo показывает ТОЛЬКО фон ("bg"), и у фона
 * `pointer-events: none` (замечено диагностикой отдельно — фон нельзя
 * выделить кликом никогда, это не дефект прибора). Остальные элементы
 * появляются постепенно по слайдам (ADR-015: слайд хранит состояния,
 * а не список элементов) — первый слайд, где виден хоть один элемент
 * КРОМЕ фона, снят прогоном: node-1-slide-3 показывает "title".
 * Переходим на первый такой слайд, иначе выделять на дефолтном слайде
 * буквально нечего.
 */
async function selectSlideWithVisibleElement(page) {
  const info = await page.evaluate(() => {
    const seg = window.__project.segments[0];
    for (const s of seg.slides) {
      const visibleNonBg = Object.keys(s.states).filter(
        (k) => k !== 'bg' && s.states[k].visible !== false,
      );
      if (visibleNonBg.length > 0) return { slideId: s.id, visibleNonBg };
    }
    return null;
  });
  if (!info) return null;
  await page.getByTestId(`slide-${info.slideId}`).click();
  await page.waitForTimeout(150);
  return info;
}

/**
 * Клик по элементу СЦЕНЫ — НЕ через `locator(...).click()`.
 *
 * Найдено диагностикой отдельно: у узлов сцены (`[data-id]`) стоит
 * `pointer-events: none` ВСЕГДА, даже в редакторе — это общий рендер
 * с плеером (инвариант №5), и вне гейта у сцены `pointer-events: none`
 * по инварианту №3. Playwright `locator.click()` требует, чтобы целевой
 * узел оказался ТЕМ САМЫМ, что вернёт нативный hit-test в точке клика —
 * это структурно невозможно, `elementFromPoint` всегда отдаёт обёртку
 * `.ed-stage-canvas`, которая перехватывает клик и делает выбор САМА
 * (JS-хит-тест по прямоугольникам, не нативная доставка события).
 *
 * Тот же приём, что в существующих e2e (`e2e/arrange.spec.ts`,
 * `centerOnScreen`/`clickElement`): координаты явно из
 * `getBoundingClientRect`, клик — «сырым» `page.mouse.click(x, y)`,
 * который не проверяет, кто там «должен» стоять по DOM.
 */
async function pickClickableElement(page) {
  const ids = await page.evaluate(() => window.__project.segments[0].elements.map((e) => e.id));
  const ordered = [...ids.filter((id) => id !== 'bg'), ...ids.filter((id) => id === 'bg')];
  for (const id of ordered) {
    const rect = await page.evaluate((elId) => {
      const el = document.querySelector(`[data-testid="stage-scene"] [data-id="${elId}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, id);
    if (!rect) continue;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(80);
    const gripVisible = await page.locator('[data-grip="se"]').isVisible().catch(() => false);
    if (gripVisible) return { id, allIds: ids };
  }
  return { id: null, allIds: ids };
}

// ════════════════════════════════════════════════════════════════════════
// БЛОК A — перепись обрезанного
// ════════════════════════════════════════════════════════════════════════

const SCAN_OVERFLOW = () => {
  const root = document.querySelector('.ed-root');
  if (!root) throw new Error('нет .ed-root');
  const all = root.querySelectorAll('*');
  let total = 0;
  let edCount = 0;
  const vertical = [];
  const horizontal = [];

  for (const el of all) {
    total++;
    const classes = Array.from(el.classList); // НЕ el.className.split(regex) — см. шапку файла
    if (!classes.some((c) => c.startsWith('ed-'))) continue;
    edCount++;
    const cs = getComputedStyle(el);
    const base = {
      cls: classes.join(' '),
      tag: el.tagName.toLowerCase(),
      testid: el.dataset ? el.dataset['testid'] || null : null,
      id: el.id || null,
    };
    if (el.scrollHeight > el.clientHeight + 1) {
      vertical.push({
        ...base,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        visiblePct: Math.round((el.clientHeight / el.scrollHeight) * 1000) / 10,
        overflowY: cs.overflowY,
        flex: cs.flex,
      });
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      horizontal.push({
        ...base,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        visiblePct: Math.round((el.clientWidth / el.scrollWidth) * 1000) / 10,
        overflowX: cs.overflowX,
        textOverflow: cs.textOverflow,
        title: el.getAttribute('title'),
        ariaLabel: el.getAttribute('aria-label'),
      });
    }
  }
  vertical.sort((a, b) => a.visiblePct - b.visiblePct);
  horizontal.sort((a, b) => a.visiblePct - b.visiblePct);
  return { total, edCount, vertical, horizontal };
};

async function probeControl(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.ed-root');
    if (!root) return { injected: false, seen: false };
    const probe = document.createElement('div');
    probe.className = 'ed-probe-test';
    probe.setAttribute('data-testid', 'probe-test');
    probe.style.height = '20px';
    probe.style.overflow = 'auto';
    const inner = document.createElement('div');
    inner.style.height = '200px';
    probe.appendChild(inner);
    root.appendChild(probe);
    const seen = probe.scrollHeight > probe.clientHeight + 1;
    root.removeChild(probe);
    return { injected: true, seen };
  });
}

async function runBlockA(browser, fixture, opts = {}) {
  const { context, page, errors } = await freshPage(browser, fixture);
  let gateClick = null;
  if (opts.clickGate) {
    const gateMark = page.locator('.ed-mark-gate').first();
    const count = await gateMark.count();
    if (count > 0) {
      await gateMark.click();
      try {
        await page.getByTestId('mark-panel').waitFor({ state: 'visible', timeout: 5000 });
        gateClick = 'ok: mark-panel появилась';
      } catch (e) {
        gateClick = `НЕ появилась: ${e.message}`;
      }
    } else {
      gateClick = 'НЕ НАЙДЕНА .ed-mark-gate';
    }
  }
  const scan = await page.evaluate(SCAN_OVERFLOW);
  let control = null;
  if (scan.vertical.length === 0 && scan.horizontal.length === 0) {
    control = await probeControl(page);
  }
  await closeCtx(context, errors);
  return { fixture, gateClick, scan, control, errors: errors.slice() };
}

// ════════════════════════════════════════════════════════════════════════
// БЛОК B — путь автора, с консолью
// ════════════════════════════════════════════════════════════════════════

async function runDemoWalkthrough(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const steps = [];

  // Масштаб холста НЕ трогаем: остаётся дефолтным «Вписать». При
  // zoom=100% на 1920×1080 сцена (1920×1080) шире области холста, которая
  // при развёрнутых каталоге/колонке — всего ~1226×624 px (замерено
  // диагностикой отдельно), и клик по геометрическому центру видимого на
  // глаз элемента при этом попадает в `.ed-stage-canvas`, а не в сам
  // элемент, — НАХОДКА, вынесенная в отчёт отдельно. Здесь же измерению
  // это только мешает бы, поэтому шаги идут на «Вписать», где элементы
  // кликаются штатно; экранная дельта переноса/ресайза сравнима с заказанной
  // напрямую — движок сам делит на масштаб и обратно умножает при рендере
  // (инвариант «масштаб — из DOM»), поэтому визуальный сдвиг в экранных px
  // не зависит от текущего масштаба, если жест реализован верно.
  await step(steps, errors, 'масштаб холста — читаем «как есть» (Вписать)', async () => {
    const value = await page.locator('[data-testid="zoom-select"]').inputValue();
    const scale = await page.evaluate(() => {
      const bg = document.querySelector('[data-id="bg"]');
      return bg ? bg.getBoundingClientRect().width / 1920 : null;
    });
    return { ok: value === 'fit', detail: `zoom-select value=${value}, фактический масштаб=${scale}` };
  });

  await step(steps, errors, 'перейти на слайд, где виден элемент кроме фона', async () => {
    const info = await selectSlideWithVisibleElement(page);
    return {
      ok: info !== null,
      detail: info ? `слайд ${info.slideId}, видны: [${info.visibleNonBg.join(', ')}]` : 'не найдено ни одного такого слайда',
    };
  });

  let targetId = null;
  let sel = null;
  let elementIds = [];

  await step(steps, errors, 'элементы фикстуры найдены и один выделен кликом', async () => {
    const picked = await pickClickableElement(page);
    elementIds = picked.allIds;
    targetId = picked.id;
    sel = targetId ? `[data-testid="stage-scene"] [data-id="${targetId}"]` : null;
    return {
      ok: targetId !== null,
      detail: `ids=[${elementIds.join(', ')}], кликабельным оказался=${targetId}`,
    };
  });

  await step(steps, errors, 'после клика видна ручка ресайза se', async () => {
    if (!sel) return { ok: false, detail: 'нет выделенного элемента (см. предыдущий шаг)' };
    await page.waitForTimeout(80);
    const gripVisible = await page.locator('[data-grip="se"]').isVisible().catch(() => false);
    return { ok: gripVisible, detail: `data-grip="se" виден=${gripVisible}` };
  });

  let beforeMove = null;
  await step(steps, errors, 'подвинуть мышью на 60×40', async () => {
    beforeMove = await page.locator(sel).boundingBox();
    if (!beforeMove) return { ok: false, detail: 'нет boundingBox элемента до переноса' };
    const cx = beforeMove.x + beforeMove.width / 2;
    const cy = beforeMove.y + beforeMove.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const after = await page.locator(sel).boundingBox();
    const dx = after.x - beforeMove.x;
    const dy = after.y - beforeMove.y;
    const ok = Math.abs(dx - 60) < 1.5 && Math.abs(dy - 40) < 1.5;
    return { ok, detail: `заказано 60×40, вышло ${dx.toFixed(1)}×${dy.toFixed(1)} (масштаб холста 100%)` };
  });

  await step(steps, errors, 'изменить размер за data-grip="se" на 40×30', async () => {
    const gripBox = await page.locator('[data-grip="se"]').boundingBox();
    const elBefore = await page.locator(sel).boundingBox();
    if (!gripBox || !elBefore) return { ok: false, detail: 'ручка se или элемент не найдены' };
    const gx = gripBox.x + gripBox.width / 2;
    const gy = gripBox.y + gripBox.height / 2;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx + 40, gy + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const elAfter = await page.locator(sel).boundingBox();
    const dw = elAfter.width - elBefore.width;
    const dh = elAfter.height - elBefore.height;
    const ok = Math.abs(dw - 40) < 2 && Math.abs(dh - 30) < 2;
    return { ok, detail: `заказано +40×+30, вышло ${dw.toFixed(1)}×${dh.toFixed(1)}` };
  });

  let rotateHit = null;
  await step(steps, errors, 'ручка rotate достижима (elementFromPoint)', async () => {
    const rotateGrip = page.locator('[data-grip="rotate"]');
    const visible = await rotateGrip.isVisible().catch(() => false);
    if (!visible) return { ok: false, detail: 'data-grip="rotate" не видна' };
    const rb = await rotateGrip.boundingBox();
    const rcx = rb.x + rb.width / 2;
    const rcy = rb.y + rb.height / 2;
    rotateHit = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.getAttribute('data-grip') || `${el.tagName}.${Array.from(el.classList).join('.')}` : null;
      },
      [rcx, rcy],
    );
    return { ok: rotateHit === 'rotate', detail: `elementFromPoint в центре ручки отдал: ${rotateHit}` };
  });

  await step(steps, errors, 'повернуть за ручку rotate', async () => {
    const rotateGrip = page.locator('[data-grip="rotate"]');
    const visible = await rotateGrip.isVisible().catch(() => false);
    if (!visible) return { ok: false, detail: 'ручка недоступна для замера угла' };
    const angleOf = () =>
      page.evaluate((selArg) => {
        const el = document.querySelector(selArg);
        const t = getComputedStyle(el).transform;
        if (t === 'none') return 0;
        const m = new DOMMatrix(t);
        return (Math.atan2(m.b, m.a) * 180) / Math.PI;
      }, sel);
    const angleBefore = await angleOf();
    const rb = await rotateGrip.boundingBox();
    const rcx = rb.x + rb.width / 2;
    const rcy = rb.y + rb.height / 2;
    await page.mouse.move(rcx, rcy);
    await page.mouse.down();
    await page.mouse.move(rcx + 60, rcy + 15, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const angleAfter = await angleOf();
    const delta = angleAfter - angleBefore;
    return { ok: Math.abs(delta) > 1, detail: `угол ${angleBefore.toFixed(1)}° → ${angleAfter.toFixed(1)}° (Δ=${delta.toFixed(1)}°)` };
  });

  let slidesBefore = null;
  let slidesAfter = null;
  await step(steps, errors, 'добавить слайд', async () => {
    slidesBefore = await page.evaluate(() => window.__project.segments[0].slides.length);
    await page.getByTestId('slide-add').click();
    await page.waitForTimeout(80);
    slidesAfter = await page.evaluate(() => window.__project.segments[0].slides.length);
    return { ok: slidesAfter === slidesBefore + 1, detail: `слайдов было ${slidesBefore}, стало ${slidesAfter}` };
  });

  await step(steps, errors, 'свернуть каталог (для проверки хром-персистентности)', async () => {
    await page.getByTestId('collapse-catalog').click();
    await page.waitForTimeout(80);
    const gone = (await page.locator('.ed-catalog').count()) === 0;
    return { ok: gone, detail: `.ed-catalog отсутствует в DOM: ${gone}` };
  });

  await step(steps, errors, 'перезагрузить страницу', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, { timeout: 30_000 });
    return { ok: true, detail: 'reload завершён, data-ready=1' };
  });

  await step(steps, errors, 'слайд после перезагрузки (фикстура ?fixture= перечитывается заново — ОЖИДАЕМО не сохраняется)', async () => {
    const n = await page.evaluate(() => window.__project.segments[0].slides.length);
    return { ok: n === slidesAfter, detail: `ожидали (если бы сохранялось) ${slidesAfter}, реально после reload ${n}` };
  });

  await step(steps, errors, 'сворот каталога пережил перезагрузку (это отдельный канал — localStorage хрома, не проект)', async () => {
    const gone = (await page.locator('.ed-catalog').count()) === 0;
    return { ok: gone, detail: `.ed-catalog отсутствует после reload: ${gone}` };
  });

  await closeCtx(context, errors);
  return { fixture: 'demo', steps };
}

async function runGateWalkthrough(browser) {
  const { context, page, errors } = await freshPage(browser, 'two-gates');
  const steps = [];

  const gateIds = await page.evaluate(() => window.__project.segments[0].gates.map((g) => g.id));
  await step(steps, errors, 'остановки фикстуры найдены', async () => ({
    ok: gateIds.length > 0,
    detail: `ids=[${gateIds.join(', ')}]`,
  }));

  await step(steps, errors, 'щёлкнуть остановку → панель метки', async () => {
    await page.getByTestId(`mark-gate-${gateIds[0]}`).click();
    try {
      await page.getByTestId('mark-panel').waitFor({ state: 'visible', timeout: 5000 });
      return { ok: true, detail: `mark-gate-${gateIds[0]} → mark-panel видна` };
    } catch (e) {
      return { ok: false, detail: e.message };
    }
  });

  // Кнопка «Разделить повествование здесь» существует в DOM ТОЛЬКО когда
  // остановка — «Развилка» (`config.correctId === null`, MarkPanel.tsx
  // `StopKindEditor`, `isFork && (...)`), а не «Вопрос». Гейт по умолчанию
  // на этой фикстуре — «Вопрос», поэтому сперва меняем тип явно тем же
  // ходом, что доступен автору: списком «Что это за остановка».
  await step(steps, errors, 'сменить тип остановки на «Развилка»', async () => {
    const select = page.getByLabel('Что это за остановка', { exact: true });
    const found = (await select.count()) > 0;
    if (!found) return { ok: false, detail: 'поле "Что это за остановка" не найдено' };
    await select.selectOption('fork');
    await page.waitForTimeout(80);
    const value = await select.inputValue();
    return { ok: value === 'fork', detail: `значение после выбора: ${value}` };
  });

  let segmentsBefore = null;
  let segmentsAfter = null;
  await step(steps, errors, 'сделать развилкой', async () => {
    const splitBtn = page.getByTestId('gate-split');
    const visible = await splitBtn.isVisible().catch(() => false);
    const enabled = visible ? await splitBtn.isEnabled() : false;
    if (!visible || !enabled) return { ok: false, detail: `кнопка видна=${visible} доступна=${enabled}` };
    segmentsBefore = await page.evaluate(() => window.__project.segments.length);
    await splitBtn.click();
    await page.waitForTimeout(120);
    segmentsAfter = await page.evaluate(() => window.__project.segments.length);
    return { ok: segmentsAfter > segmentsBefore, detail: `сегментов было ${segmentsBefore}, стало ${segmentsAfter}` };
  });

  await step(steps, errors, 'переключиться в «Ветки»', async () => {
    await page.getByTestId('view-branches').click();
    await page.waitForTimeout(120);
    const visible = await page.getByTestId('branches-view').isVisible().catch(() => false);
    return { ok: visible, detail: `branches-view видна=${visible}` };
  });

  await step(steps, errors, 'проехать по дереву (панорама средней кнопкой)', async () => {
    const box = await page.getByTestId('branches-space').boundingBox();
    if (!box) return { ok: false, detail: 'нет branches-space' };
    const before = await page.evaluate(() => window.__branchesViewForTest ?? null).catch(() => null);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx - 150, cy - 80, { steps: 10 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(120);
    // Косвенный контроль: после панорамы плитка/строка под старым центром может
    // смениться. Надёжнее — сверить читаемый масштаб (не должен был поменяться
    // от панорамы, в отличие от zoom) и сам факт отсутствия ошибок.
    void before;
    return { ok: true, detail: 'жест средней кнопкой выполнен без исключения (см. errors для этого шага)' };
  });

  await step(steps, errors, 'масштаб дерева меняется колесом (Ctrl+wheel = zoom)', async () => {
    const before = await page.getByTestId('branches-zoom').textContent();
    const box = await page.getByTestId('branches-space').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Control');
    for (let i = 0; i < 15; i++) await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await page.waitForTimeout(120);
    const after = await page.getByTestId('branches-zoom').textContent();
    return { ok: before !== after, detail: `масштаб дерева: ${before} → ${after}` };
  });

  await step(steps, errors, 'вернуться в «Дорожки»', async () => {
    await page.getByTestId('view-tracks').click();
    await page.waitForTimeout(120);
    const visible = await page.getByTestId('marks-lane').isVisible().catch(() => false);
    return { ok: visible, detail: `marks-lane видна=${visible}` };
  });

  await step(steps, errors, 'перезагрузить страницу', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, { timeout: 30_000 });
    return { ok: true, detail: 'reload завершён' };
  });

  await step(steps, errors, 'развилка после перезагрузки (фикстура перечитывается заново — ОЖИДАЕМО)', async () => {
    const n = await page.evaluate(() => window.__project.segments.length);
    return { ok: n === segmentsAfter, detail: `ожидали (если бы сохранялось) ${segmentsAfter}, реально ${n}` };
  });

  await step(steps, errors, 'вид после перезагрузки — снова «Дорожки» (bottomView не в localStorage, это ожидаемо)', async () => {
    const pressed = await page.getByTestId('view-tracks').getAttribute('aria-pressed');
    return { ok: pressed === 'true', detail: `aria-pressed(view-tracks)=${pressed}` };
  });

  await closeCtx(context, errors);
  return { fixture: 'two-gates', steps };
}

// ════════════════════════════════════════════════════════════════════════
// БЛОК C — что регулируется
// ════════════════════════════════════════════════════════════════════════

async function runC1(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const catalogWidth = () =>
    page
      .locator('.ed-catalog')
      .evaluate((el) => el.getBoundingClientRect().width)
      .catch(() => null);

  const out = {};
  out.widthDefault = await catalogWidth();

  const splitterBox = await page.getByTestId('splitter-left').boundingBox();
  out.splitterFound = splitterBox !== null;

  if (splitterBox) {
    let sx = splitterBox.x + splitterBox.width / 2;
    let sy = splitterBox.y + splitterBox.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx - 600, sy, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    out.widthAfterDragFarLeft = await catalogWidth();

    const box2 = await page.getByTestId('splitter-left').boundingBox();
    sx = box2.x + box2.width / 2;
    sy = box2.y + box2.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 900, sy, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    out.widthAfterDragFarRight = await catalogWidth();
  }

  await page.getByTestId('collapse-catalog').click();
  await page.waitForTimeout(80);
  out.collapsedGoneFromDom = (await page.locator('.ed-catalog').count()) === 0;

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, { timeout: 30_000 });
  out.collapsedPersistedAfterReload = (await page.locator('.ed-catalog').count()) === 0;

  await closeCtx(context, errors);
  return out;
}

async function runC2(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const leftBox = await page.getByTestId('splitter-left').boundingBox();
  const rightBox = await page.getByTestId('splitter-right').boundingBox();
  const collapseSideBox = await page.getByTestId('collapse-side').boundingBox();
  await closeCtx(context, errors);
  return {
    controlMethodOnKnownSplitter: leftBox !== null, // splitter-left ЗАВЕДОМО существует (Splitter side="left" в Editor.tsx)
    sideSplitterFound: rightBox !== null,
    sideSplitterBox: rightBox,
    collapseSideButtonFound: collapseSideBox !== null,
  };
}

async function runC3(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const trackHeight = () =>
    page
      .locator('.ed-track')
      .evaluate((el) => el.getBoundingClientRect().height)
      .catch(() => null);

  const out = {};
  out.heightDefault = await trackHeight();

  let box = await page.getByTestId('track-resize-handle').boundingBox();
  out.handleFound = box !== null;

  if (box) {
    let hx = box.x + box.width / 2;
    let hy = box.y + box.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy - 800, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    out.heightAfterDragUpFar = await trackHeight();

    box = await page.getByTestId('track-resize-handle').boundingBox();
    hx = box.x + box.width / 2;
    hy = box.y + box.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy + 800, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    out.collapsedAfterDragDownFar = await page.getByTestId('track-collapsed').isVisible().catch(() => false);
    out.heightAfterDragDownFar = out.collapsedAfterDragDownFar ? null : await trackHeight();

    if (out.collapsedAfterDragDownFar) {
      await page.getByTestId('track-expand').click();
      await page.waitForTimeout(80);
    }

    box = await page.getByTestId('track-resize-handle').boundingBox();
    hx = box.x + box.width / 2;
    hy = box.y + box.height / 2;
    const before = await trackHeight();
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx, hy - 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const after = await trackHeight();
    out.customDragDelta60 = { before, after, delta: after - before };
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, { timeout: 30_000 });
  out.heightAfterReload = await trackHeight();

  const heightTracksBeforeSwitch = await trackHeight();
  await page.getByTestId('view-branches').click();
  await page.waitForTimeout(150);
  const branchesZoneHeight = await page
    .locator('.ed-branches-space')
    .evaluate((el) => el.getBoundingClientRect().height)
    .catch(() => null);
  await page.getByTestId('view-tracks').click();
  await page.waitForTimeout(150);
  const heightTracksAfterSwitchBack = await trackHeight();

  out.separateHeights = { heightTracksBeforeSwitch, branchesZoneHeight, heightTracksAfterSwitchBack };

  await closeCtx(context, errors);
  return out;
}

async function runC4(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const options = await page
    .locator('[data-testid="zoom-select"] option')
    .evaluateAll((opts) => opts.map((o) => ({ value: o.value, label: o.textContent })));
  await page.waitForTimeout(100);
  const fitScale = await page.evaluate(() => {
    const bg = document.querySelector('[data-id="bg"]');
    return bg ? bg.getBoundingClientRect().width / 1920 : null;
  });
  await closeCtx(context, errors);
  return { options, fitScaleAt1920x1080: fitScale };
}

async function runC5(browser) {
  const { context, page, errors } = await freshPage(browser, 'two-gates');
  await page.getByTestId('view-branches').click();
  await page.waitForTimeout(150);
  const readZoom = () => page.getByTestId('branches-zoom').textContent();

  const initial = await readZoom();
  const box = await page.getByTestId('branches-space').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);

  await page.keyboard.down('Control');
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await page.waitForTimeout(120);
  const maxReached = await readZoom();

  await page.keyboard.down('Control');
  for (let i = 0; i < 100; i++) await page.mouse.wheel(0, 300);
  await page.keyboard.up('Control');
  await page.waitForTimeout(120);
  const minReached = await readZoom();

  await closeCtx(context, errors);
  return { initial, maxReached, minReached };
}

async function runC6(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const sideScrollHeight = () => page.locator('.ed-side').evaluate((el) => el.scrollHeight);

  const before = await sideScrollHeight();
  const elementsToggle = page.locator('.ed-section-toggle', { hasText: 'Элементы' }).first();
  const elementsToggleCount = await elementsToggle.count();
  let afterCollapse = null;
  let elementsExpandedAfterReload = null;
  if (elementsToggleCount > 0) {
    await elementsToggle.click();
    await page.waitForTimeout(80);
    afterCollapse = await sideScrollHeight();
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, { timeout: 30_000 });
    elementsExpandedAfterReload = await page
      .locator('.ed-section-toggle', { hasText: 'Элементы' })
      .first()
      .getAttribute('aria-expanded');
  }

  const stripToggle = page.getByTestId('slide-strip-toggle');
  const stripFound = (await stripToggle.count()) > 0;
  let stripExpandedInitially = null;
  let stripExpandedAfterToggleAndReload = null;
  if (stripFound) {
    stripExpandedInitially = await stripToggle.getAttribute('aria-expanded').catch(() => null);
    await stripToggle.click();
    await page.waitForTimeout(80);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, { timeout: 30_000 });
    stripExpandedAfterToggleAndReload = await page
      .getByTestId('slide-strip-toggle')
      .getAttribute('aria-expanded')
      .catch(() => null);
  }

  await closeCtx(context, errors);
  return {
    sideScrollHeightDefault: before,
    sideScrollHeightAfterCollapseElements: afterCollapse,
    elementsSectionExpandedAfterReload: elementsExpandedAfterReload,
    stripFound,
    stripExpandedInitially,
    stripExpandedAfterToggleAndReload,
  };
}

// ════════════════════════════════════════════════════════════════════════
// БЛОК D — сочетания
// ════════════════════════════════════════════════════════════════════════

async function runD1(browser) {
  const { context, page, errors } = await freshPage(browser, 'two-gates');
  await page.getByTestId('slide-strip-toggle').click();
  await page.waitForTimeout(100);
  const stripExpanded = await page.getByTestId('slide-strip-toggle').getAttribute('aria-expanded');

  const gateIds = await page.evaluate(() => window.__project.segments[0].gates.map((g) => g.id));
  await page.getByTestId(`mark-gate-${gateIds[0]}`).click();
  await page.getByTestId('mark-panel').waitFor({ state: 'visible', timeout: 5000 });

  const dims = await page.locator('[data-testid="mark-panel"]').evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));

  await closeCtx(context, errors);
  return {
    stripExpanded,
    ...dims,
    visiblePct: dims.scrollHeight > 0 ? Math.round((dims.clientHeight / dims.scrollHeight) * 1000) / 10 : null,
  };
}

async function runD2(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  // PropBar не монтирует свой тулбар (testid "propbar"), пока ничего не
  // выделено (PropBar.tsx: `if (selectedCount === 0) return <hint/>`) —
  // без выделения измерять там нечего. На слайде 1 виден только фон,
  // а у него `pointer-events: none` — переходим на слайд, где видно
  // что-то ещё (см. selectSlideWithVisibleElement).
  await selectSlideWithVisibleElement(page);
  const picked = await pickClickableElement(page);
  await page.waitForTimeout(80);

  if (picked.id === null) {
    await closeCtx(context, errors);
    return {
      elementSelected: null,
      allIds: picked.allIds,
      note: 'НЕ УДАЛОСЬ выделить ни один элемент — измерение пропущено',
    };
  }

  await page.getByTestId('collapse-catalog').click();
  await page.waitForTimeout(100);

  const dims = await page.locator('[data-testid="propbar"]').evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));

  const fields = await page.locator('.ed-propbar-field').evaluateAll((els) => {
    const strip = document.querySelector('[data-testid="propbar"]');
    const stripRect = strip.getBoundingClientRect();
    let fullyOffscreen = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.left >= stripRect.right || r.right <= stripRect.left) fullyOffscreen++;
    }
    return { total: els.length, fullyOffscreen };
  });

  const scrollEndVisible = await page.getByTestId('propbar-scroll-end').isVisible().catch(() => false);

  await closeCtx(context, errors);
  return { elementSelected: picked.id, allIds: picked.allIds, ...dims, fields, scrollEndArrowVisible: scrollEndVisible };
}

async function runD3(browser) {
  const { context, page, errors } = await freshPage(browser, 'demo');
  const hostHeight = () => page.locator('.ed-stage-host').evaluate((el) => el.clientHeight);

  const tracksHeight = await hostHeight();
  await page.getByTestId('view-branches').click();
  await page.waitForTimeout(150);
  const branchesHeight = await hostHeight();

  await closeCtx(context, errors);
  return { tracksHeight, branchesHeight, bothAtLeast180: tracksHeight >= 180 && branchesHeight >= 180 };
}

// ════════════════════════════════════════════════════════════════════════
// ЗАПУСК
// ════════════════════════════════════════════════════════════════════════

const browser = await chromium.launch({ headless: true });

const blockA_demo = await runBlockA(browser, 'demo');
const blockA_twoGates = await runBlockA(browser, 'two-gates', { clickGate: true });

const blockB_demo = await runDemoWalkthrough(browser);
const blockB_gate = await runGateWalkthrough(browser);

const blockC1 = await runC1(browser);
const blockC2 = await runC2(browser);
const blockC3 = await runC3(browser);
const blockC4 = await runC4(browser);
const blockC5 = await runC5(browser);
const blockC6 = await runC6(browser);

const blockD1 = await runD1(browser);
const blockD2 = await runD2(browser);
const blockD3 = await runD3(browser);

await browser.close();

// ─── Печать ─────────────────────────────────────────────────────────────

const line = (n) =>
  `${n.cls.padEnd(40)} testid=${String(n.testid).padEnd(24)} id=${String(n.id).padEnd(10)} ` +
  `видно ${n.visiblePct}%  (client ${'clientHeight' in n ? n.clientHeight : n.clientWidth} / scroll ${
    'scrollHeight' in n ? n.scrollHeight : n.scrollWidth
  })`;

console.log('\n' + '═'.repeat(90));
console.log('БЛОК A — перепись обрезанного');
console.log('═'.repeat(90));
for (const res of [blockA_demo, blockA_twoGates]) {
  console.log(`\n── фикстура ${res.fixture} ${res.gateClick ? `(клик по остановке: ${res.gateClick})` : ''} ──`);
  console.log(`обойдено узлов: ${res.scan.total}, из них с классом ed-: ${res.scan.edCount}`);
  console.log(`\nA1. ВЕРТИКАЛЬНАЯ обрезка (${res.scan.vertical.length}):`);
  for (const n of res.scan.vertical) console.log('  ' + line(n) + `  overflowY=${n.overflowY} flex=${n.flex}`);
  console.log(`\nA2. ГОРИЗОНТАЛЬНАЯ обрезка (${res.scan.horizontal.length}):`);
  for (const n of res.scan.horizontal) {
    const ellipsis = n.textOverflow === 'ellipsis';
    const readable = Boolean(n.title) || Boolean(n.ariaLabel);
    console.log(
      '  ' + line(n) + `  ellipsis=${ellipsis} title="${n.title}" ariaLabel="${n.ariaLabel}" ЧИТАЕМО=${readable}`,
    );
  }
  if (res.control) {
    console.log(`\nA3. контроль прибора (обрезка не найдена!): probe инъекция сработала: ${res.control.seen}`);
  }
  if (res.errors.length) console.log(`ошибки страницы: ${res.errors.join(' | ')}`);
}

console.log('\n' + '═'.repeat(90));
console.log('БЛОК B — путь автора');
console.log('═'.repeat(90));
for (const res of [blockB_demo, blockB_gate]) {
  console.log(`\n── фикстура ${res.fixture} ──`);
  for (const s of res.steps) {
    console.log(`  [${s.ok ? 'OK ' : 'НЕТ'}] ${s.name} — ${s.detail}`);
    if (s.newErrors.length) console.log(`        ОШИБКИ СТРАНИЦЫ НА ШАГЕ: ${s.newErrors.join(' | ')}`);
  }
}

console.log('\n' + '═'.repeat(90));
console.log('БЛОК C — что регулируется');
console.log('═'.repeat(90));
console.log('\nC1 каталог слева:', JSON.stringify(blockC1, null, 2));
console.log('\nC2 правая колонка — есть ли ручка:', JSON.stringify(blockC2, null, 2));
console.log('\nC3 высота нижней зоны:', JSON.stringify(blockC3, null, 2));
console.log('\nC4 масштаб холста:', JSON.stringify(blockC4, null, 2));
console.log('\nC5 масштаб дерева веток:', JSON.stringify(blockC5, null, 2));
console.log('\nC6 складывание секций/ленты:', JSON.stringify(blockC6, null, 2));

console.log('\n' + '═'.repeat(90));
console.log('БЛОК D — сочетания');
console.log('═'.repeat(90));
console.log('\nD1 панель метки при развёрнутых секциях и открытой ленте:', JSON.stringify(blockD1, null, 2));
console.log('\nD2 полоса свойств при свёрнутом каталоге:', JSON.stringify(blockD2, null, 2));
console.log('\nD3 холст в «Дорожках» и в «Ветках»:', JSON.stringify(blockD3, null, 2));

console.log('\n' + '═'.repeat(90));
console.log(`КОНТРОЛЬНЫЕ ЧИСЛА: контекстов открыто ${contextsOpened}, шагов Блока B пройдено ${stepsRun}, ошибок страницы всего ${totalErrors}`);
console.log('═'.repeat(90));

await mkdir(new URL('../results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../results/s49-ux-1920x1080.json', import.meta.url),
  JSON.stringify(
    {
      contextsOpened,
      stepsRun,
      totalErrors,
      blockA: { demo: blockA_demo, twoGates: blockA_twoGates },
      blockB: { demo: blockB_demo, gate: blockB_gate },
      blockC: { c1: blockC1, c2: blockC2, c3: blockC3, c4: blockC4, c5: blockC5, c6: blockC6 },
      blockD: { d1: blockD1, d2: blockD2, d3: blockD3 },
    },
    null,
    2,
  ),
);
console.log('Результат записан: spikes/results/s49-ux-1920x1080.json');
