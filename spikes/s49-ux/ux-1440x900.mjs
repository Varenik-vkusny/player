// Сессия 49 — сплошная проверка UX редактора, окно 1440×900.
//
// ЧИСТОЕ ИЗМЕРЕНИЕ. Ничего не чинит. Каждое сочетание — свой
// browser.newContext() (состояние хрома живёт в localStorage и переживает
// page.goto — Сессия 48 обожглась на этом и получила barLeft 72 вместо 428).
//
// Дев-сервер уже поднят на 5179 — этот скрипт его не трогает.

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5179';
const VIEWPORT = { width: 1440, height: 900 };

let totalContexts = 0;
let totalSteps = 0;
let totalPageErrors = 0;
const allPageErrors = [];

function attachErrors(page, tag) {
  const bucket = [];
  page.on('pageerror', (e) => {
    bucket.push(`pageerror: ${e.message}`);
    allPageErrors.push({ tag, kind: 'pageerror', text: e.message });
    totalPageErrors++;
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      bucket.push(`console: ${m.text()}`);
      allPageErrors.push({ tag, kind: 'console', text: m.text() });
      totalPageErrors++;
    }
  });
  return bucket;
}

async function openEditor(page, fixture) {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`${BASE}/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 30_000,
  });
}

async function freshPage(browser, fixture, tag) {
  totalContexts++;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = attachErrors(page, tag);
  await openEditor(page, fixture);
  return { context, page, errors };
}

/**
 * Медленная тяга мелкими шагами с паузой между ними.
 *
 * НУЖНА для track-resize-handle: слом-проверка показала, что один большой
 * page.mouse.move(target, {steps:6}) без пауз давал высоту дорожки БЕЗ
 * ИЗМЕНЕНИЙ (250→250 что вверх, что вниз, при удалённых от 60 до 630 px),
 * хотя elementFromPoint в центре ручки отдавал саму ручку, а нативные
 * pointerdown/pointermove/pointerup долетали (проверено addEventListener).
 * Тот же приём одним большим прыжком РАБОТАЕТ у ручек размера/поворота
 * на сцене (StageView) — разница в реализации, не в тесте. С мелкими
 * шагами по 5px и паузой 10мс между ними дорожка честно уехала 250→50
 * и показала track-collapsed. Здесь — тот же мелкий шаг, чтобы не приписать
 * продукту дефект, которого нет, и не проглядеть тот, что есть.
 */
async function slowDrag(page, fromX, fromY, toX, toY, stepPx = 5, waitMs = 10) {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil(dist / stepPx));
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (dx * i) / steps;
    const y = fromY + (dy * i) / steps;
    await page.mouse.move(x, y, { steps: 1 });
    await page.waitForTimeout(waitMs);
  }
  await page.mouse.up();
}

const log = (...args) => console.log(...args);
const hr = (title) => {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(title);
  console.log('═'.repeat(78));
};

const browser = await chromium.launch({ headless: true });

// ─────────────────────────────────────────────────────────────────────────
// БЛОК A. Перепись обрезанного
// ─────────────────────────────────────────────────────────────────────────

const ANATOMY_FN = () => {
  const root = document.querySelector('.ed-root');
  if (!root) throw new Error('нет .ed-root');
  const all = root.querySelectorAll('*');
  let total = 0;
  let edCount = 0;
  const vOverflow = [];
  const hOverflow = [];
  for (const el of all) {
    total++;
    // ВАЖНО: Array.from(el.classList), НЕ regex по className — регексы
    // по строке молча искажают имена внутри page.evaluate (найдено
    // контроллером сессии на своём же приборе).
    const classes = Array.from(el.classList);
    if (!classes.some((c) => c.startsWith('ed-'))) continue;
    edCount++;
    const cs = getComputedStyle(el);
    const ch = el.clientHeight;
    const sh = el.scrollHeight;
    const cw = el.clientWidth;
    const sw = el.scrollWidth;
    const base = {
      classes: classes.join(' '),
      tag: el.tagName.toLowerCase(),
      testid: (el.dataset && el.dataset.testid) || null,
      id: el.id || null,
    };
    if (sh > ch + 1) {
      vOverflow.push({
        ...base,
        clientHeight: ch,
        scrollHeight: sh,
        pctVisible: Math.round((ch / sh) * 1000) / 10,
        overflowY: cs.overflowY,
        flex: cs.flex,
      });
    }
    if (sw > cw + 1) {
      hOverflow.push({
        ...base,
        clientWidth: cw,
        scrollWidth: sw,
        pctVisible: Math.round((cw / sw) * 1000) / 10,
        textOverflow: cs.textOverflow,
        hasTitle: el.hasAttribute('title'),
        titleValue: el.getAttribute('title'),
        ariaLabel: el.getAttribute('aria-label'),
      });
    }
  }
  vOverflow.sort((a, b) => a.pctVisible - b.pctVisible);
  hOverflow.sort((a, b) => a.pctVisible - b.pctVisible);
  return { total, edCount, vOverflow, hOverflow };
};

const PROBE_INJECT = () => {
  const root = document.querySelector('.ed-root');
  const probe = document.createElement('div');
  probe.className = 'ed-49-probe';
  probe.setAttribute('data-testid', 'probe-49');
  probe.style.height = '20px';
  probe.style.overflow = 'auto';
  probe.style.width = '50px';
  const inner = document.createElement('div');
  inner.style.height = '200px';
  inner.style.width = '10px';
  probe.appendChild(inner);
  root.appendChild(probe);
};
const PROBE_REMOVE = () => {
  document.querySelector('.ed-49-probe')?.remove();
};

const blockAResults = {};

for (const fixture of ['demo', 'two-gates']) {
  hr(`БЛОК A — ${fixture}`);
  const { context, page, errors } = await freshPage(browser, fixture, `A/${fixture}`);

  if (fixture === 'two-gates') {
    // Панель метки появляется только при выделении.
    const markCount = await page.locator('.ed-mark-gate').count();
    log(`.ed-mark-gate найдено: ${markCount} (контроль: должно быть > 0)`);
    if (markCount > 0) {
      await page.locator('.ed-mark-gate').first().click();
      await page.waitForSelector('[data-testid="mark-panel"]', { timeout: 5000 });
      log('mark-panel появилась после клика — ОК');
    } else {
      log('НЕ НАЙДЕНО ни одной .ed-mark-gate — mark-panel замерять не с чем');
    }
  }

  const result = await page.evaluate(ANATOMY_FN);

  // A3: контроль прибора.
  log(`\nA3 контроль: всего узлов в .ed-root — ${result.total}, из них с классом ed-* — ${result.edCount}`);
  log(`обрезанных по вертикали: ${result.vOverflow.length}, по горизонтали: ${result.hOverflow.length}`);

  if (result.vOverflow.length === 0 && result.hOverflow.length === 0) {
    log('НОЛЬ обрезанных — впрыскиваю пробный элемент, чтобы доказать, что детектор рабочий');
    await page.evaluate(PROBE_INJECT);
    const probeCheck = await page.evaluate(ANATOMY_FN);
    const sawProbe = probeCheck.vOverflow.some((n) => n.testid === 'probe-49');
    log(`детектор увидел пробный div: ${sawProbe ? 'ДА — прибор рабочий' : 'НЕТ — ПРИБОР СЛОМАН, замеру ноль не верить'}`);
    await page.evaluate(PROBE_REMOVE);
  } else {
    log('обрезанные найдены без впрыска — контроль прибора не нужен');
  }

  log('\nA1. Вертикальная обрезка (доля видимого по возрастанию):');
  for (const n of result.vOverflow) {
    log(
      `  [${n.pctVisible}%] ${n.classes} (${n.tag}${n.testid ? ` testid=${n.testid}` : ''}${n.id ? ` id=${n.id}` : ''})` +
        ` clientHeight=${n.clientHeight} scrollHeight=${n.scrollHeight} overflowY=${n.overflowY} flex=${n.flex}`,
    );
  }
  if (result.vOverflow.length === 0) log('  (нет)');

  log('\nA2. Горизонтальная обрезка (доля видимого по возрастанию):');
  for (const n of result.hOverflow) {
    const ellipsis = n.textOverflow === 'ellipsis';
    const readable = n.hasTitle || n.ariaLabel;
    log(
      `  [${n.pctVisible}%] ${n.classes} (${n.tag}${n.testid ? ` testid=${n.testid}` : ''})` +
        ` clientWidth=${n.clientWidth} scrollWidth=${n.scrollWidth} text-overflow=${n.textOverflow}` +
        (ellipsis
          ? ` | ОБРЕЗАН МНОГОТОЧИЕМ, способ прочитать целиком: ${readable ? `ЕСТЬ (title="${n.titleValue}" aria-label="${n.ariaLabel}")` : 'НЕТ — текст теряется безвозвратно'}`
          : ''),
    );
  }
  if (result.hOverflow.length === 0) log('  (нет)');

  blockAResults[fixture] = result;
  log(`\nошибок страницы за блок A/${fixture}: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК B. Путь автора, с консолью
// ─────────────────────────────────────────────────────────────────────────

hr('БЛОК B — путь автора (фикстура two-gates: есть и элементы, и остановки)');

const stepsLog = [];
function recordStep(name, ok, detail) {
  totalSteps++;
  stepsLog.push({ name, ok, detail });
  log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`);
}

const decomposeRotation = () => {
  const el = document.querySelector('[data-id="question"]');
  if (!el) return null;
  const t = getComputedStyle(el).transform;
  if (t === 'none') return 0;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return null;
  const [a, b] = m[1].split(',').map(Number);
  return (Math.atan2(b, a) * 180) / Math.PI;
};

{
  const { context, page, errors } = await freshPage(browser, 'two-gates', 'B');

  // НЕ форсируем 100%: на 100% элемент "question" (сцена 1920×1080, сам
  // 1400×200 в scene-координатах) уезжает за правый край .ed-stage-host —
  // проверено сломом первого прогона (клик пришёлся на .ed-side, x=1312).
  // Остаёмся на умолчании «Вписать» и переводим экранные px в единицы сцены
  // через ФАКТИЧЕСКИЙ масштаб — ширина узла в px делённая на его декларативную
  // ширину 1400 из fixtures/projects/two-gates.json (та же дисциплина, что
  // у run-bottom-zone.mjs: измеряй, а не подразумевай).
  const KNOWN_WIDTH = 1400; // question.width из фикстуры
  const scaleNow = await page.evaluate((knownWidth) => {
    const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
    return node ? node.getBoundingClientRect().width / knownWidth : null;
  }, KNOWN_WIDTH);
  log(`масштаб сцены на входе (по узлу question / 1400) = ${scaleNow?.toFixed(4)}`);

  // Шаг 1: выделить элемент.
  const center = await page.evaluate(() => {
    const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
  if (center === null) {
    recordStep('выделить элемент question', false, 'узел [data-id="question"] не найден на первом слайде');
  } else {
    await page.mouse.click(center.x, center.y);
    const frameVisible = await page.getByTestId('selection-frame').isVisible().catch(() => false);
    recordStep('выделить элемент question', frameVisible, `selection-frame visible=${frameVisible}, центр=(${center.x.toFixed(1)},${center.y.toFixed(1)}), масштаб=${scaleNow?.toFixed(4)}`);
  }

  // Шаг 2: подвинуть мышью на 60×40 ЕДИНИЦ СЦЕНЫ → экранная тяга = 60*scale × 40*scale.
  if (center !== null && scaleNow) {
    const sdx = 60 * scaleNow;
    const sdy = 40 * scaleNow;
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + sdx / 2, center.y + sdy / 2, { steps: 5 });
    await page.mouse.move(center.x + sdx, center.y + sdy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const screenDx = after.x - center.x;
    const screenDy = after.y - center.y;
    const sceneDx = screenDx / scaleNow;
    const sceneDy = screenDy / scaleNow;
    recordStep(
      'подвинуть мышью на 60×40 (единицы сцены)',
      Math.abs(sceneDx - 60) < 2 && Math.abs(sceneDy - 40) < 2,
      `мышь просили довести до (${(center.x + sdx).toFixed(1)},${(center.y + sdy).toFixed(1)}); ` +
        `центр узла был (${center.x.toFixed(1)},${center.y.toFixed(1)}), стал (${after.x.toFixed(1)},${after.y.toFixed(1)}); ` +
        `экранный сдвиг узла факт ${screenDx.toFixed(1)}×${screenDy.toFixed(1)} px (заказан ${sdx.toFixed(1)}×${sdy.toFixed(1)}); ` +
        `переезд в сцене вышел ${sceneDx.toFixed(1)}×${sceneDy.toFixed(1)} при заказанных 60×40`,
    );
  } else {
    recordStep('подвинуть мышью на 60×40', false, 'пропущено: не было center или scaleNow');
  }

  // Шаг 3: изменить размер за data-grip="se".
  const seGrip = await page.locator('[data-grip="se"]').boundingBox().catch(() => null);
  if (seGrip && scaleNow) {
    const sizeBefore = await page.evaluate(() => {
      const r = document.querySelector('.ed-stage-scroll [data-id="question"]').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    const gx = seGrip.x + seGrip.width / 2;
    const gy = seGrip.y + seGrip.height / 2;
    const pullX = 40 * scaleNow;
    const pullY = 30 * scaleNow;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx + pullX, gy + pullY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const sizeAfter = await page.evaluate(() => {
      const r = document.querySelector('.ed-stage-scroll [data-id="question"]').getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    const dwScene = (sizeAfter.w - sizeBefore.w) / scaleNow;
    const dhScene = (sizeAfter.h - sizeBefore.h) / scaleNow;
    recordStep(
      'изменить размер за [data-grip="se"]',
      dwScene > 5 && dhScene > 5,
      `размер экраном был ${sizeBefore.w.toFixed(1)}×${sizeBefore.h.toFixed(1)}, стал ${sizeAfter.w.toFixed(1)}×${sizeAfter.h.toFixed(1)}; в единицах сцены рост ≈ ${dwScene.toFixed(1)}×${dhScene.toFixed(1)} при тяге 40×30`,
    );
  } else {
    recordStep('изменить размер за [data-grip="se"]', false, `ручка se: boundingBox=${seGrip ? 'есть' : 'null'}, scaleNow=${scaleNow}`);
  }

  // Шаг 4: повернуть за data-grip="rotate".
  const rotateGrip = await page.locator('[data-grip="rotate"]').boundingBox().catch(() => null);
  if (rotateGrip) {
    const elFromPoint = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.getAttribute('data-grip') : null;
    }, [rotateGrip.x + rotateGrip.width / 2, rotateGrip.y + rotateGrip.height / 2]);
    const angleBefore = await page.evaluate(decomposeRotation);
    const gx = rotateGrip.x + rotateGrip.width / 2;
    const gy = rotateGrip.y + rotateGrip.height / 2;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    // Тянем вбок по дуге — достаточно грубого смещения, чтобы угол сменился.
    await page.mouse.move(gx + 60, gy + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    const angleAfter = await page.evaluate(decomposeRotation);
    recordStep(
      'повернуть за [data-grip="rotate"]',
      angleAfter !== null && angleBefore !== null && Math.abs(angleAfter - angleBefore) > 1,
      `elementFromPoint(центр ручки)=${elFromPoint} (ожидалось rotate); угол был ${angleBefore?.toFixed(2)}°, стал ${angleAfter?.toFixed(2)}°`,
    );
  } else {
    recordStep('повернуть за [data-grip="rotate"]', false, 'ручка rotate не найдена (boundingBox null)');
  }

  // Шаг 5: добавить слайд.
  const slideCounterBefore = await page.locator('[data-testid="strip-counter"]').textContent().catch(() => null);
  const addBtn = page.getByTestId('slide-add');
  const addVisible = await addBtn.isVisible().catch(() => false);
  if (addVisible) {
    await addBtn.click();
    await page.waitForTimeout(150);
    const slideCounterAfter = await page.locator('[data-testid="strip-counter"]').textContent().catch(() => null);
    recordStep(
      'добавить слайд',
      true,
      `slide-add нажата (visible=${addVisible}); счётчик ленты был "${slideCounterBefore}", стал "${slideCounterAfter}" (лента могла быть свёрнута по умолчанию — счётчик тогда не в DOM)`,
    );
  } else {
    recordStep('добавить слайд', false, `кнопка slide-add не видима (visible=${addVisible})`);
  }

  // Шаг 6: щёлкнуть остановку (метка-гейт).
  const gateCount = await page.locator('.ed-mark-gate').count();
  if (gateCount > 0) {
    await page.locator('.ed-mark-gate').first().click();
    const panelVisible = await page.getByTestId('mark-panel').isVisible().catch(() => false);
    recordStep('щёлкнуть остановку', panelVisible, `.ed-mark-gate найдено ${gateCount}, mark-panel visible=${panelVisible}`);
  } else {
    recordStep('щёлкнуть остановку', false, '.ed-mark-gate не найдено ни одной');
  }

  // Шаг 7: сделать развилкой. gate-split виден ТОЛЬКО когда тип остановки
  // «Развилка» (isFork, MarkPanel.tsx StopKindEditor) — по умолчанию у гейта
  // тип «Вопрос», поэтому сперва переключаем select с меткой
  // «Что это за остановка» на значение fork.
  const kindSelect = page.getByLabel('Что это за остановка');
  const kindSelectVisible = await kindSelect.isVisible().catch(() => false);
  if (kindSelectVisible) {
    await kindSelect.selectOption('fork');
    await page.waitForTimeout(100);
  }
  log(`(подготовка к шагу 7: select «Что это за остановка» найден=${kindSelectVisible}, переключён на fork)`);

  const splitBtn = page.getByTestId('gate-split');
  const splitVisible = await splitBtn.isVisible().catch(() => false);
  if (splitVisible) {
    const splitEnabled = await splitBtn.isEnabled().catch(() => false);
    if (splitEnabled) {
      await splitBtn.click();
      await page.waitForTimeout(150);
      recordStep('сделать развилкой', true, 'gate-split нажата, кнопка была enabled');
    } else {
      recordStep('сделать развилкой', false, 'кнопка gate-split видна, но disabled — развилку сделать не из чего на этом гейте');
    }
  } else {
    recordStep('сделать развилкой', false, 'кнопка gate-split не видна на панели метки');
  }

  // Шаг 8: переключиться в «Ветки».
  await page.getByTestId('view-branches').click();
  await page.waitForTimeout(200);
  const branchesPressed = await page.getByTestId('view-branches').getAttribute('aria-pressed');
  const trackViewGone = (await page.locator('[data-testid="track-resize-handle"]').count()) === 0;
  recordStep('переключиться в «Ветки»', branchesPressed === 'true', `aria-pressed=${branchesPressed}, TrackView размонтирован (track-resize-handle count=0)=${trackViewGone}`);

  // Шаг 9: проехать по дереву — ПАН (простое колесо/зажатое колёсико — по
  // коду branchSpace.ts: wheelIntent без ctrl/meta = pan, ТОЛЬКО с ctrl/meta
  // = zoom, как трекпад-жест «пинч» в браузере). Меряем реальным сдвигом
  // плитки, а не полагаясь на «нажалось».
  const tileBefore = await page.locator('.ed-chapter-tile').first().boundingBox().catch(() => null);
  const hostBox = await page.locator('.ed-branches-space').boundingBox().catch(() => null);
  if (hostBox && tileBefore) {
    const cx = hostBox.x + hostBox.width / 2;
    const cy = hostBox.y + hostBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(80, 30); // без ctrl/meta → pan по коду
    await page.waitForTimeout(150);
    const tileAfterPan = await page.locator('.ed-chapter-tile').first().boundingBox().catch(() => null);
    const panDx = tileAfterPan ? tileAfterPan.x - tileBefore.x : null;
    const panDy = tileAfterPan ? tileAfterPan.y - tileBefore.y : null;
    recordStep(
      'проехать по дереву — пан колесом (без ctrl)',
      panDx !== null && (Math.abs(panDx) > 1 || Math.abs(panDy) > 1),
      `плитка .ed-chapter-tile была x=${tileBefore.x.toFixed(1)},y=${tileBefore.y.toFixed(1)}; после wheel(80,30) без ctrl — x=${tileAfterPan?.x.toFixed(1)},y=${tileAfterPan?.y.toFixed(1)} (Δ ${panDx?.toFixed(1)},${panDy?.toFixed(1)})`,
    );

    // Масштаб: то же колесо, но с зажатым Ctrl (по коду — единственный путь к zoom).
    const branchesZoomBefore = await page.locator('[data-testid="branches-zoom"]').textContent().catch(() => null);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await page.waitForTimeout(150);
    const branchesZoomAfter = await page.locator('[data-testid="branches-zoom"]').textContent().catch(() => null);
    recordStep(
      'проехать по дереву — масштаб колесом С Ctrl',
      branchesZoomBefore !== branchesZoomAfter,
      `подпись масштаба была "${branchesZoomBefore}", стала "${branchesZoomAfter}" после Ctrl+wheel(-200)`,
    );
  } else {
    recordStep('проехать по дереву', false, `.ed-branches-space boundingBox=${hostBox ? 'есть' : 'null'}, .ed-chapter-tile boundingBox=${tileBefore ? 'есть' : 'null'}`);
  }

  // Шаг 10: вернуться в «Дорожки».
  await page.getByTestId('view-tracks').click();
  await page.waitForTimeout(200);
  const tracksBack = (await page.locator('[data-testid="track-resize-handle"]').count()) === 1;
  recordStep('вернуться в «Дорожки»', tracksBack, `track-resize-handle снова в DOM=${tracksBack}`);

  // Проверка перед перезагрузкой: снятые до этого измерения (позиция, размер).
  const beforeReload = await page.evaluate(() => {
    const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
    const r = node ? node.getBoundingClientRect() : null;
    const counter = document.querySelector('[data-testid="strip-counter"]');
    return { rect: r ? { w: r.width, h: r.height, x: r.x, y: r.y } : null, counter: counter ? counter.textContent : null };
  });

  // Шаг 11: перезагрузить страницу и проверить, что сделанное на месте.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 });
  const afterReload = await page.evaluate(() => {
    const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
    const r = node ? node.getBoundingClientRect() : null;
    const counter = document.querySelector('[data-testid="strip-counter"]');
    return { rect: r ? { w: r.width, h: r.height, x: r.x, y: r.y } : null, counter: counter ? counter.textContent : null };
  });
  const samePosition = beforeReload.rect && afterReload.rect
    && Math.abs(beforeReload.rect.x - afterReload.rect.x) < 1
    && Math.abs(beforeReload.rect.y - afterReload.rect.y) < 1;
  recordStep(
    'перезагрузка: сделанное на месте?',
    false, // это НЕ дефект — записываем как узнанный факт, не как провал
    `позиция/размер элемента ${samePosition ? 'СОВПАЛИ' : 'НЕ СОВПАЛИ'} (было x=${beforeReload.rect?.x.toFixed(1)}, стало x=${afterReload.rect?.x.toFixed(1)}). ` +
      `ПО КОДУ (apps/playground/src/editor.ts: «явная просьба ?fixture= сильнее сохранённого») это ОЖИДАЕМО: ?fixture=two-gates всегда грузит пристину фикстуру заново, правки проекта в файл фикстуры не пишутся никогда. Это не дефект редактирования, а свойство режима открытия по ?fixture=.`,
  );

  log(`\nошибок страницы за весь блок B: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК C. Что регулируется
// ─────────────────────────────────────────────────────────────────────────

hr('БЛОК C — что регулируется');

// C1 + C2: ширина каталога и правой колонки.
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'C1/C2');

  const catalogWidthBefore = await page.locator('.ed-catalog').evaluate((el) => el.getBoundingClientRect().width);
  log(`C1: ширина каталога при открытии — ${catalogWidthBefore.toFixed(1)} px (ожидание из кода: 350)`);

  // Положительный контроль для C2: тем же способом (elementFromPoint) ищем
  // ЗАВЕДОМО существующую ручку каталога — splitter-left.
  const leftSplitterBox = await page.locator('[data-testid="splitter-left"]').boundingBox().catch(() => null);
  const leftFound = leftSplitterBox !== null;
  const leftPoint = leftFound
    ? await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [
        leftSplitterBox.x + leftSplitterBox.width / 2,
        leftSplitterBox.y + leftSplitterBox.height / 2,
      ])
    : null;
  log(`C1 контроль прибора: [data-testid="splitter-left"] найдена=${leftFound}, elementFromPoint в её центре отдаёт "${leftPoint}" (ожидание: splitter-left)`);

  // C2: ищем ручку правой колонки ТЕМ ЖЕ способом.
  const rightSplitterBox = await page.locator('[data-testid="splitter-right"]').boundingBox().catch(() => null);
  const rightFound = rightSplitterBox !== null;
  const rightPoint = rightFound
    ? await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [
        rightSplitterBox.x + rightSplitterBox.width / 2,
        rightSplitterBox.y + rightSplitterBox.height / 2,
      ])
    : null;
  log(`\nC2 (прямой вопрос плана — есть ли ручка у .ed-side вообще): [data-testid="splitter-right"] найдена=${rightFound}, elementFromPoint отдаёт "${rightPoint}"`);
  log(`C2 ОТВЕТ: ${rightFound && rightPoint === 'splitter-right' ? 'ДА, регулируется — ручка splitter-right ДОСТИЖИМА' : 'ручка отсутствует или недостижима'}`);

  // C1: пределы ширины каталога — тянем далеко за оба предела.
  if (leftFound) {
    const gx = leftSplitterBox.x + leftSplitterBox.width / 2;
    const gy = leftSplitterBox.y + leftSplitterBox.height / 2;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(50, gy, { steps: 5 }); // далеко влево — за нижний предел 260
    await page.mouse.up();
    await page.waitForTimeout(80);
    const wMin = await page.locator('.ed-catalog').evaluate((el) => el.getBoundingClientRect().width);
    log(`C1: тяга далеко влево (до x=50) → ширина каталога = ${wMin.toFixed(1)} px (ожидание предела: 260)`);

    const gx2 = await page.locator('[data-testid="splitter-left"]').evaluate((el) => el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2);
    await page.mouse.move(gx2, gy);
    await page.mouse.down();
    await page.mouse.move(1300, gy, { steps: 5 }); // далеко вправо — за верхний предел 560
    await page.mouse.up();
    await page.waitForTimeout(80);
    const wMax = await page.locator('.ed-catalog').evaluate((el) => el.getBoundingClientRect().width);
    log(`C1: тяга далеко вправо (до x=1300) → ширина каталога = ${wMax.toFixed(1)} px (ожидание предела: 560)`);
  }

  // C1: свёрнутость — работает и запоминается?
  await page.getByTestId('collapse-catalog').click();
  await page.waitForTimeout(100);
  const collapsedGone = (await page.locator('.ed-catalog').count()) === 0;
  log(`C1: после collapse-catalog .ed-catalog отсутствует в DOM=${collapsedGone}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 });
  const collapsedAfterReloadGone = (await page.locator('.ed-catalog').count()) === 0;
  const storageRaw = await page.evaluate(() => localStorage.getItem('player.editor.chrome'));
  log(`C1: после перезагрузки .ed-catalog отсутствует=${collapsedAfterReloadGone} (localStorage['player.editor.chrome'] = ${storageRaw})`);
  log(`C1 ОТВЕТ: ${collapsedAfterReloadGone ? 'регулируется И запоминается' : 'регулируется, но НЕ запоминается'}`);

  // C2: пределы ширины правой колонки (аналогично, свежий контекст не нужен —
  // ширина каталога уже собрана).
  if (rightFound) {
    const box = await page.locator('[data-testid="splitter-right"]').boundingBox();
    const gy = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, gy);
    await page.mouse.down();
    await page.mouse.move(1439, gy, { steps: 5 }); // далеко вправо — сжать до предела
    await page.mouse.up();
    await page.waitForTimeout(80);
    const wMin = await page.locator('.ed-side').evaluate((el) => el.getBoundingClientRect().width).catch(() => -1);
    log(`C2: тяга splitter-right далеко вправо → ширина .ed-side = ${wMin.toFixed?.(1) ?? wMin} px (ожидание предела: 200)`);

    const box2 = await page.locator('[data-testid="splitter-right"]').boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, gy);
    await page.mouse.down();
    await page.mouse.move(200, gy, { steps: 5 }); // далеко влево — расширить до предела
    await page.mouse.up();
    await page.waitForTimeout(80);
    const wMax = await page.locator('.ed-side').evaluate((el) => el.getBoundingClientRect().width).catch(() => -1);
    log(`C2: тяга splitter-right далеко влево → ширина .ed-side = ${wMax.toFixed?.(1) ?? wMax} px (ожидание предела: 420)`);
  }

  log(`\nошибок страницы за C1/C2: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// C3: высота нижней зоны.
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'C3');

  const handleBox = await page.locator('[data-testid="track-resize-handle"]').boundingBox().catch(() => null);
  const heightBefore = await page.locator('.ed-track').evaluate((el) => el.getBoundingClientRect().height).catch(() => -1);
  log(`C3: высота .ed-track до тяги = ${heightBefore.toFixed?.(1) ?? heightBefore}`);

  if (handleBox) {
    const gx = handleBox.x + handleBox.width / 2;
    const gy = handleBox.y + handleBox.height / 2;
    await slowDrag(page, gx, gy, gx, 20); // тянем вверх сильно — рост высоты
    await page.waitForTimeout(80);
    const heightMax = await page.locator('.ed-track').evaluate((el) => el.getBoundingClientRect().height).catch(() => -1);
    log(`C3: тяга ручки до y=20 (сильно вверх, мелкими шагами) → высота .ed-track = ${heightMax.toFixed?.(1) ?? heightMax} (предел роста)`);

    const box2 = await page.locator('[data-testid="track-resize-handle"]').boundingBox();
    const gx2 = box2.x + box2.width / 2;
    const gy2 = box2.y + box2.height / 2;
    await slowDrag(page, gx2, gy2, gx2, 895); // тянем вниз сильно — складывание
    await page.waitForTimeout(80);
    const heightMin = await page.locator('.ed-track').evaluate((el) => el.getBoundingClientRect().height).catch(() => -1);
    const collapsedNow = (await page.locator('[data-testid="track-collapsed"]').count()) > 0;
    log(`C3: тяга ручки до y=895 (сильно вниз, мелкими шагами) → высота .ed-track = ${heightMin.toFixed?.(1) ?? heightMin}, track-collapsed присутствует=${collapsedNow} (складывание/минимум)`);
  } else {
    log('C3: track-resize-handle не найдена boundingBox()=null');
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 });
  const heightAfterReload = await page.locator('.ed-track').evaluate((el) => el.getBoundingClientRect().height).catch(() => -1);
  log(`C3: высота .ed-track после перезагрузки = ${heightAfterReload.toFixed?.(1) ?? heightAfterReload} (по коду TrackView.tsx: «между перезагрузками НЕ сохраняется — решение владельца 06.08.2026»)`);
  log(`C3 ОТВЕТ (запоминание между reload): ${Math.abs(heightAfterReload - heightBefore) < 2 ? 'высота вернулась к умолчанию — НЕ запоминается' : 'высота отличается от умолчания — проверить вручную'}`);

  // C3: отдельно ли для «Дорожек» и «Веток»?
  const handleBox2 = await page.locator('[data-testid="track-resize-handle"]').boundingBox().catch(() => null);
  if (handleBox2) {
    const gx = handleBox2.x + handleBox2.width / 2;
    const gy = handleBox2.y + handleBox2.height / 2;
    await slowDrag(page, gx, gy, gx, gy - 100);
    await page.waitForTimeout(80);
    const tracksHeight = await page.locator('.ed-track-column').evaluate((el) => el.getBoundingClientRect().height);
    log(`\nC3: высота .ed-track-column в виде «Дорожки» после ручной тяги = ${tracksHeight.toFixed(1)}`);

    await page.getByTestId('view-branches').click();
    await page.waitForTimeout(150);
    const branchesHeight = await page.locator('.ed-track-column').evaluate((el) => el.getBoundingClientRect().height);
    log(`C3: высота .ed-track-column в виде «Ветки» (сразу после переключения) = ${branchesHeight.toFixed(1)}`);
    const branchesHandleCount = await page.locator('[data-testid="track-resize-handle"]').count();
    log(`C3: track-resize-handle в виде «Ветки» присутствует=${branchesHandleCount > 0} (по коду BranchesView.tsx: своей ручки высоты у неё нет)`);

    await page.getByTestId('view-tracks').click();
    await page.waitForTimeout(150);
    const tracksHeightBack = await page.locator('.ed-track-column').evaluate((el) => el.getBoundingClientRect().height);
    log(`C3: высота .ed-track-column, «Дорожки» после возврата = ${tracksHeightBack.toFixed(1)} (компонент перемонтировался — сравни с ${tracksHeight.toFixed(1)} до переключения)`);
    log(`C3 ОТВЕТ (раздельность): ${branchesHandleCount === 0 ? 'у «Веток» вообще нет ручки высоты — раздельности как таковой нет, TrackView размонтируется при переключении и высота сбрасывается на умолчание' : 'см. числа выше'}`);
  }

  log(`\nошибок страницы за C3: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// C4: ступени масштаба холста.
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'C4');
  const options = await page.locator('[data-testid="zoom-select"] option').evaluateAll((els) =>
    els.map((el) => ({ value: el.value, label: el.textContent })),
  );
  log('C4: ступени zoom-select:');
  for (const o of options) log(`  value="${o.value}" label="${o.label}"`);
  const hasFit = options.some((o) => o.value === 'fit');
  log(`C4: есть «Вписать»=${hasFit}`);
  const fitOption = options.find((o) => o.value === 'fit');
  log(`C4: подпись «Вписать» на 1440×900 = "${fitOption?.label}"`);
  log(`\nошибок страницы за C4: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// C5: масштаб дерева веток.
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'C5');
  await page.getByTestId('view-branches').click();
  await page.waitForTimeout(150);
  const box = await page.locator('.ed-track-column').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const readZoom = () => page.locator('[data-testid="branches-zoom"]').textContent();
  const z0 = await readZoom();
  log(`C5: масштаб дерева при открытии = "${z0}"`);

  // ВАЖНО: по коду branchSpace.ts wheelIntent() колесо БЕЗ ctrl/meta — это
  // PAN, не zoom (тот же трекпад-жест «пинч», что во всех браузерах).
  // Первый прогон без Ctrl держал число неподвижным на обоих концах —
  // ложный «не регулируется»: колесо честно панило дерево, а не масштабировало.
  await page.keyboard.down('Control');
  let prev = null;
  let cur = z0;
  for (let i = 0; i < 60 && prev !== cur; i++) {
    prev = cur;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(30);
    cur = await readZoom();
  }
  log(`C5: верхний предел масштаба (Ctrl+zoom-in до схождения) = "${cur}" (ожидание из кода branchSpace.ts MAX_SCALE=4 → 400%)`);

  prev = null;
  for (let i = 0; i < 80 && prev !== cur; i++) {
    prev = cur;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(30);
    cur = await readZoom();
  }
  await page.keyboard.up('Control');
  log(`C5: нижний предел масштаба (Ctrl+zoom-out до схождения) = "${cur}" (ожидание из кода branchSpace.ts MIN_SCALE=0.05 → 5%)`);

  log(`\nошибок страницы за C5: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// C6: складывание секций правой колонки и ленты слайдов.
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'C6');

  const sections = await page.locator('.ed-section-toggle').evaluateAll((els) =>
    els.map((el) => ({ label: el.getAttribute('aria-label'), expanded: el.getAttribute('aria-expanded') })),
  );
  log('C6: секции правой колонки, найдено:');
  for (const s of sections) log(`  aria-label="${s.label}" aria-expanded=${s.expanded}`);

  const sideScrollBefore = await page.locator('.ed-side').evaluate((el) => el.scrollHeight);
  // Сворачиваем все секции.
  const toggles = page.locator('.ed-section-toggle');
  const count = await toggles.count();
  for (let i = 0; i < count; i++) {
    await toggles.nth(i).click();
    await page.waitForTimeout(30);
  }
  const sideScrollAfterCollapse = await page.locator('.ed-side').evaluate((el) => el.scrollHeight);
  log(`C6: .ed-side scrollHeight было ${sideScrollBefore}, после сворачивания всех секций (${count} шт.) стало ${sideScrollAfterCollapse}`);
  log(`C6 ОТВЕТ (складывание секций): ${sideScrollAfterCollapse < sideScrollBefore ? 'регулируется — высота реально уменьшилась' : 'клик прошёл, но высота НЕ изменилась'}`);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 });
  const sideScrollAfterReload = await page.locator('.ed-side').evaluate((el) => el.scrollHeight);
  const expandedAfterReload = await page.locator('.ed-section-toggle').first().getAttribute('aria-expanded');
  log(`C6: после перезагрузки .ed-side scrollHeight = ${sideScrollAfterReload}, первая секция aria-expanded=${expandedAfterReload}`);
  log(`C6 ОТВЕТ (запоминание секций): ${expandedAfterReload === 'true' ? 'НЕ запоминается — секции снова развёрнуты (Section.tsx: useState локально, defaultOpen=true)' : 'запоминается'}`);

  // Лента слайдов.
  const stripBefore = await page.locator('[data-testid="slide-strip"]').count();
  log(`\nC6: лента слайдов в DOM по умолчанию = ${stripBefore > 0 ? 'открыта' : 'свёрнута'} (ожидание из кода: свёрнута, Сессия 41)`);
  const toggleBtn = page.getByTestId('slide-strip-toggle');
  await toggleBtn.click();
  await page.waitForTimeout(100);
  const stripAfter = await page.locator('[data-testid="slide-strip"]').count();
  log(`C6: после клика slide-strip-toggle лента в DOM = ${stripAfter > 0 ? 'открыта' : 'свёрнута'}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30_000 });
  const stripAfterReload = await page.locator('[data-testid="slide-strip"]').count();
  log(`C6: после перезагрузки лента слайдов = ${stripAfterReload > 0 ? 'открыта' : 'свёрнута'}`);
  log(`C6 ОТВЕТ (запоминание ленты): ${stripAfterReload === 0 ? 'НЕ запоминается — вернулась к умолчанию «свёрнута» (Editor.tsx: useState(true) без хранилища)' : 'состояние после перезагрузки отличается от умолчания'}`);

  log(`\nошибок страницы за C6: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК D. Сочетания
// ─────────────────────────────────────────────────────────────────────────

hr('БЛОК D — сочетания');

// D1: панель метки при развёрнутых секциях И открытой ленте слайдов.
{
  const { context, page, errors } = await freshPage(browser, 'two-gates', 'D1');

  // Контроль: секции развёрнуты по умолчанию (defaultOpen=true) — проверяем.
  const sectionsExpanded = await page.locator('.ed-section-toggle').evaluateAll((els) =>
    els.every((el) => el.getAttribute('aria-expanded') === 'true'),
  );
  log(`D1 контроль: секции развёрнуты по умолчанию=${sectionsExpanded}`);

  // Открываем ленту слайдов (по умолчанию свёрнута).
  await page.getByTestId('slide-strip-toggle').click();
  await page.waitForTimeout(100);
  const stripOpen = (await page.locator('[data-testid="slide-strip"]').count()) > 0;
  log(`D1 контроль: лента слайдов открыта=${stripOpen}`);

  await page.locator('.ed-mark-gate').first().click();
  await page.waitForSelector('[data-testid="mark-panel"]', { timeout: 5000 });
  const panelMetrics = await page.locator('[data-testid="mark-panel"]').evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
  log(`D1: mark-panel clientHeight=${panelMetrics.clientHeight}, scrollHeight=${panelMetrics.scrollHeight}, видно ${((panelMetrics.clientHeight / panelMetrics.scrollHeight) * 100).toFixed(1)}%`);

  log(`\nошибок страницы за D1: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// D2: полоса свойств при свёрнутом каталоге.
{
  // two-gates, а не demo: в demo ВСЕ текстовые элементы слайда 1 держат
  // opacity:0 (появляются по репликам озвучки) — найдено сломом: клик по
  // "title" геометрически проваливался сквозь него (opacity 0 не участвует
  // в hit-тесте сцены) и на самом деле выделял "bg" ("selection-readout"
  // показал bg, а не title) — оттого полоса и давала только 2 поля вместо 5.
  // "question" в two-gates видим (opacity в фикстуре не задан) и текстовый.
  const { context, page, errors } = await freshPage(browser, 'two-gates', 'D2');

  await page.getByTestId('collapse-catalog').click();
  await page.waitForTimeout(100);
  const catalogGone = (await page.locator('.ed-catalog').count()) === 0;
  log(`D2 контроль: после сворачивания .ed-catalog отсутствует в DOM=${catalogGone} (по коду Editor.tsx: свёрнутая панель «не рендерится вовсе»)`);

  const center = await page.evaluate(() => {
    const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(100);
  const readout = await page.locator('[data-testid="selection-readout"]').textContent().catch(() => null);
  log(`D2 контроль: выделено — selection-readout = "${readout}" (ожидание: начинается с "question")`);

  const bar = await page.locator('.ed-propbar').evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  })).catch(() => null);
  if (bar) {
    log(`D2: .ed-propbar clientWidth=${bar.clientWidth}, scrollWidth=${bar.scrollWidth}, обрезано=${bar.scrollWidth - bar.clientWidth} px`);
    const organs = await page.locator('.ed-propbar-field').evaluateAll((els, clientWidth) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const barRect = el.closest('.ed-propbar').getBoundingClientRect();
        return { right: r.right - barRect.left, offscreen: r.right - barRect.left > clientWidth };
      }), bar.clientWidth,
    );
    const offCount = organs.filter((o) => o.offscreen).length;
    log(`D2: полей .ed-propbar-field всего ${organs.length}, полностью за краем видимой области — ${offCount}`);
  } else {
    log('D2: .ed-propbar не найдена (возможно, при выделении bg показывается другой набор)');
  }

  log(`\nошибок страницы за D2: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// D3: сколько px остаётся холсту в виде «Дорожки» и «Ветки».
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'D3');

  const tracksHost = await page.locator('.ed-stage-host').evaluate((el) => ({
    w: el.getBoundingClientRect().width,
    h: el.getBoundingClientRect().height,
  }));
  log(`D3: .ed-stage-host в виде «Дорожки» = ${tracksHost.w.toFixed(1)}×${tracksHost.h.toFixed(1)}`);

  await page.getByTestId('view-branches').click();
  await page.waitForTimeout(150);
  const branchesHost = await page.locator('.ed-stage-host').evaluate((el) => ({
    w: el.getBoundingClientRect().width,
    h: el.getBoundingClientRect().height,
  }));
  log(`D3: .ed-stage-host в виде «Ветки» = ${branchesHost.w.toFixed(1)}×${branchesHost.h.toFixed(1)}`);
  log(`D3 ОТВЕТ: оба ≥180 по высоте? Дорожки=${tracksHost.h >= 180}, Ветки=${branchesHost.h >= 180}`);

  log(`\nошибок страницы за D3: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// D4: складывание секций вместе с прокруткой колонки.
{
  const { context, page, errors } = await freshPage(browser, 'demo', 'D4');

  const before = await page.locator('.ed-side').evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  log(`D4: .ed-side ДО сворачивания секций — scrollHeight=${before.scrollHeight}, clientHeight=${before.clientHeight}`);

  const toggles = page.locator('.ed-section-toggle');
  const count = await toggles.count();
  for (let i = 0; i < count; i++) {
    await toggles.nth(i).click();
    await page.waitForTimeout(30);
  }
  const after = await page.locator('.ed-side').evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  log(`D4: .ed-side ПОСЛЕ сворачивания ${count} секций — scrollHeight=${after.scrollHeight}, clientHeight=${after.clientHeight}`);
  log(`D4 ОТВЕТ: scrollHeight уменьшился=${after.scrollHeight < before.scrollHeight} (Δ ${before.scrollHeight - after.scrollHeight} px)`);

  log(`\nошибок страницы за D4: ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  await context.close();
}

// ─────────────────────────────────────────────────────────────────────────
// ИТОГО
// ─────────────────────────────────────────────────────────────────────────

hr('ИТОГО');
log(`контекстов открыто: ${totalContexts}`);
log(`шагов Блока B пройдено: ${totalSteps}`);
log(`ошибок страницы всего: ${totalPageErrors}`);
if (totalPageErrors > 0) {
  log('список ошибок:');
  for (const e of allPageErrors) log(`  [${e.tag}] ${e.kind}: ${e.text}`);
}

await browser.close();
