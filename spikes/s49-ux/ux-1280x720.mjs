// S49: СПЛОШНАЯ ПРОВЕРКА UX РЕДАКТОРА, ОКНО 1280×720.
//
// Продукт задачи — ЧИСЛА, не правки. Ничего в packages/, e2e/, docs/ не
// трогается. Дев-сервер уже поднят на 5179, свой не поднимаем.
//
// Ловушки, купленные этой программой (см. системный промпт задачи):
//  1. Состояние (свёрнутость каталога, высота нижней зоны) живёт в
//     localStorage и переживает page.goto — поэтому КАЖДОЕ сочетание
//     получает свой свежий browser.newContext(), и к каждому замеру —
//     положительный контроль на состояние прибора.
//  2. «Нажимается ли» ничего не доказывает — меряем clientHeight/scrollWidth
//     и координаты, а не факт клика.
//  3. Отрицательный результат («обрезанных нет») требует контроля: пробный
//     заведомо обрезанный div внутри .ed-root.
//  4. Классы читаем через Array.from(el.classList), а НЕ регуляркой по
//     el.className (поправка контроллера: /\s+/ по ошибке превращалась
//     в /s+/ внутри page.evaluate-строки и портила имена молча).
//
// Запуск (дев-сервер должен уже быть поднят):
//   node spikes/s49-ux/ux-1280x720.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:5179';
const VIEWPORT = { width: 1280, height: 720 };

let contextCount = 0;
let stepCount = 0;
const allErrors = [];

const log = (...args) => console.log(...args);

/** Свежий контекст+страница, с ловлей ошибок страницы. Контекст ЗАКРЫВАЕТСЯ вызывающим. */
async function freshPage(browser, label) {
  contextCount += 1;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(`[${label}] pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`);
  });
  await page.setViewportSize(VIEWPORT);
  return { context, page, errors };
}

async function openEditor(page, fixture) {
  await page.goto(`${BASE}/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 30_000,
  });
}

function recordErrors(errors) {
  for (const e of errors) allErrors.push(e);
}

function step(desc, ok, detail) {
  stepCount += 1;
  log(`  [шаг ${stepCount}] ${ok ? 'OK  ' : 'FAIL'} ${desc}${detail ? ' — ' + detail : ''}`);
  return { desc, ok, detail };
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК A: перепись обрезанного
// ─────────────────────────────────────────────────────────────────────────

/** Обход .ed-root: узлы с классом ed-*, у которых scroll> client по любой оси. */
function censusPage() {
  const toClasses = (el) => Array.from(el.classList);
  const root = document.querySelector('.ed-root');
  if (!root) return { error: 'нет .ed-root' };

  const all = root.querySelectorAll('*');
  let totalNodes = 0;
  let edNodes = 0;
  const vertical = [];
  const horizontal = [];

  for (const el of all) {
    totalNodes += 1;
    const classes = toClasses(el);
    const isEd = classes.some((c) => c.startsWith('ed-'));
    if (!isEd) continue;
    edNodes += 1;

    const cs = getComputedStyle(el);
    const ch = el.clientHeight;
    const sh = el.scrollHeight;
    const cw = el.clientWidth;
    const sw = el.scrollWidth;
    const testid = el.dataset ? el.dataset.testid || null : null;
    const tag = el.tagName;
    const id = el.id || null;

    if (sh > ch + 1) {
      vertical.push({
        classes,
        tag,
        testid,
        id,
        clientHeight: ch,
        scrollHeight: sh,
        visiblePct: Math.round((ch / sh) * 1000) / 10,
        overflowY: cs.overflowY,
        flex: cs.flex,
      });
    }
    if (sw > cw + 1) {
      vertical; // no-op, keep lint happy in inline eval context
      horizontal.push({
        classes,
        tag,
        testid,
        id,
        clientWidth: cw,
        scrollWidth: sw,
        visiblePct: Math.round((cw / sw) * 1000) / 10,
        textOverflow: cs.textOverflow,
        hasTitle: el.hasAttribute('title') && el.getAttribute('title') !== '',
        hasAriaLabel: el.hasAttribute('aria-label') && el.getAttribute('aria-label') !== '',
        titleText: el.getAttribute('title'),
        ariaLabelText: el.getAttribute('aria-label'),
        text: (el.textContent || '').trim().slice(0, 60),
      });
    }
  }

  vertical.sort((a, b) => a.visiblePct - b.visiblePct);
  horizontal.sort((a, b) => a.visiblePct - b.visiblePct);

  return { totalNodes, edNodes, vertical, horizontal };
}

function injectProbe() {
  const root = document.querySelector('.ed-root');
  if (!root) return false;
  const probe = document.createElement('div');
  probe.className = 'ed-s49-probe';
  probe.setAttribute('data-testid', 's49-probe');
  probe.style.height = '20px';
  probe.style.overflow = 'auto';
  const inner = document.createElement('div');
  inner.style.height = '200px';
  inner.textContent = 'проба';
  probe.appendChild(inner);
  root.appendChild(probe);
  return true;
}

function removeProbe() {
  document.querySelector('.ed-s49-probe')?.remove();
}

function fmtNode(n) {
  return `${n.classes.join('.')} <${n.tag.toLowerCase()}${n.testid ? ` testid=${n.testid}` : ''}${n.id ? ` id=${n.id}` : ''}>`;
}

async function runBlockA(browser) {
  log('\n' + '═'.repeat(78));
  log('БЛОК A — перепись обрезанного');
  log('═'.repeat(78));

  const results = {};

  for (const fixture of ['demo', 'two-gates']) {
    const { context, page, errors } = await freshPage(browser, `A/${fixture}`);
    await openEditor(page, fixture);

    if (fixture === 'two-gates') {
      const gateCount = await page.locator('.ed-mark-gate').count();
      if (gateCount === 0) {
        log(`  фикстура two-gates: НЕТ узлов .ed-mark-gate — контроль не пройден`);
      } else {
        await page.locator('.ed-mark-gate').first().click();
        await page.waitForSelector('[data-testid="mark-panel"]', { timeout: 5000 });
        log(`  two-gates: .ed-mark-gate найдено ${gateCount}, mark-panel открыта`);
      }
    }

    const census = await page.evaluate(censusPage);
    results[fixture] = census;

    log(`\n— ${fixture} —`);
    log(`узлов в .ed-root всего: ${census.totalNodes}, из них с классом ed-*: ${census.edNodes}`);
    log(`вертикально обрезанных (scrollHeight > clientHeight): ${census.vertical.length}`);
    for (const n of census.vertical) {
      log(`  ${fmtNode(n)} — client ${n.clientHeight} / scroll ${n.scrollHeight} = ${n.visiblePct}% видно, overflowY=${n.overflowY}, flex=${n.flex}`);
    }
    log(`горизонтально обрезанных (scrollWidth > clientWidth): ${census.horizontal.length}`);
    for (const n of census.horizontal) {
      const readable = n.hasTitle || n.hasAriaLabel;
      log(
        `  ${fmtNode(n)} — client ${n.clientWidth} / scroll ${n.scrollWidth} = ${n.visiblePct}% видно, ` +
          `text-overflow=${n.textOverflow}, title="${n.titleText ?? ''}", aria-label="${n.ariaLabelText ?? ''}", ` +
          `ЧИТАЕМО ЦЕЛИКОМ: ${readable ? 'да' : 'НЕТ'}, текст="${n.text}"`,
      );
    }

    // A3: контроль прибора — только один раз, на demo.
    if (fixture === 'demo') {
      const injected = await page.evaluate(injectProbe);
      const censusWithProbe = await page.evaluate(censusPage);
      const probeSeen = censusWithProbe.vertical.some((n) => n.testid === 's49-probe');
      await page.evaluate(removeProbe);
      const censusAfterRemove = await page.evaluate(censusPage);
      const probeGoneNow = !censusAfterRemove.vertical.some((n) => n.testid === 's49-probe');
      log(
        `\nA3 контроль прибора: инъекция удалась=${injected}, детектор увидел пробу=${probeSeen}, ` +
          `после удаления пробы её нет=${probeGoneNow}`,
      );
      results.probeControl = { injected, probeSeen, probeGoneNow };
    }

    recordErrors(errors);
    await context.close();
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК B: путь автора, с консолью
// ─────────────────────────────────────────────────────────────────────────

async function screenCenterOf(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, left: r.left };
  }, selector);
}

async function stateOf(page, id, slideId) {
  return page.evaluate(
    ({ elementId, sid }) => {
      const project = window.__project;
      if (!project) return null;
      const slides = project.segments?.[0]?.slides ?? [];
      const slide = sid ? slides.find((sl) => sl.id === sid) : slides[0];
      return slide?.states?.[elementId] ?? null;
    },
    { elementId: id, sid: slideId ?? null },
  );
}

/** Выбор через `getByTestId('selection-readout')` — надёжный способ узнать,
 * КТО ИМЕННО выделен, а не только «рамка появилась» (рамка появляется и при
 * выделении СОСЕДА, если клик по экранным координатам мимо hit-теста
 * попадает на элемент под курсором с opacity/visible=false). */
async function selectionIdOf(page) {
  const text = await page.getByTestId('selection-readout').textContent().catch(() => null);
  if (!text) return null;
  const m = text.match(/^([\w-]+):/);
  return m ? m[1] : text;
}

async function dragMouse(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let s = 1; s <= 6; s += 1) {
    await page.mouse.move(from.x + (dx * s) / 6, from.y + (dy * s) / 6);
  }
  await page.mouse.up();
}

async function runBlockBDemo(browser) {
  const out = [];
  const { context, page, errors } = await freshPage(browser, 'B/demo');
  await openEditor(page, 'demo');

  // ГРАБЛЯ, ПОЙМАННАЯ ПРИ ПЕРВОМ ПРОГОНЕ: на слайде node-1-slide-1 (первом,
  // куда открывается редактор) элемент 'title' имеет state.visible=false
  // (ещё не появился по сюжету) — hit-тест сцены (`isVisible` в StageView.tsx)
  // исключает невидимые элементы из `visibleLayers`, поэтому клик по ЭКРАННЫМ
  // координатам title на самом деле выделяет 'bg' (полноэкранный, всегда
  // видимый, лежит под всем). Проверено `selection-readout` вживую.
  // На node-1-slide-3 title уже visible=true (замерено live: __project
  // .segments[0].slides[2].states.title.visible === true) — переключаемся
  // туда, иначе шаги 2–4 молча двигали бы 'bg', а отчёт врал бы про 'title'.
  const SLIDE_ID = 'node-1-slide-3';
  const slideBtn = page.getByTestId(`slide-${SLIDE_ID}`);
  const slideBtnExists = (await slideBtn.count()) > 0;
  if (slideBtnExists) {
    await slideBtn.click();
    await page.waitForTimeout(50);
  }
  out.push(step(`перейти на слайд ${SLIDE_ID} (там title видим)`, slideBtnExists, `кнопка найдена=${slideBtnExists}`));

  // Шаг 1: выделить элемент 'title'. Контроль — НЕ факт появления рамки,
  // а КОНКРЕТНЫЙ id в selection-readout (см. грабля выше).
  const beforeSel = await screenCenterOf(page, '.ed-stage-scroll [data-id="title"]');
  if (!beforeSel) {
    out.push(step('выделить элемент title', false, 'узел не найден на сцене'));
  } else {
    await page.mouse.click(beforeSel.x, beforeSel.y);
    await page.waitForTimeout(30);
    const selId = await selectionIdOf(page);
    out.push(step('выделить элемент title', selId === 'title', `selection-readout называет id="${selId}"`));
  }

  // Шаг 2: подвинуть мышью на 60×40 (экранные px), меряем и экран, и проект.
  {
    const beforeState = await stateOf(page, 'title', SLIDE_ID);
    const beforeScreen = await screenCenterOf(page, '.ed-stage-scroll [data-id="title"]');
    await dragMouse(page, beforeScreen, 60, 40);
    await page.waitForTimeout(50);
    const afterScreen = await screenCenterOf(page, '.ed-stage-scroll [data-id="title"]');
    const afterState = await stateOf(page, 'title', SLIDE_ID);
    const dxScreen = afterScreen.x - beforeScreen.x;
    const dyScreen = afterScreen.y - beforeScreen.y;
    const dxProj = afterState && beforeState ? afterState.x - beforeState.x : null;
    const dyProj = afterState && beforeState ? afterState.y - beforeState.y : null;
    out.push(
      step(
        'подвинуть мышью на 60×40',
        Math.abs(dxScreen - 60) < 15 && Math.abs(dyScreen - 40) < 15,
        `экран Δ${dxScreen.toFixed(1)}×${dyScreen.toFixed(1)} при заказанных 60×40; проект Δ${dxProj}×${dyProj}`,
      ),
    );
  }

  // Шаг 3: изменить размер за se.
  {
    const beforeState = await stateOf(page, 'title', SLIDE_ID);
    const grip = await screenCenterOf(page, '[data-grip="se"]');
    if (!grip) {
      out.push(step('ресайз за se', false, 'ручка se не найдена'));
    } else {
      await dragMouse(page, grip, 40, 30);
      await page.waitForTimeout(50);
      const afterState = await stateOf(page, 'title', SLIDE_ID);
      const dw = afterState && beforeState ? afterState.width - beforeState.width : null;
      const dh = afterState && beforeState ? afterState.height - beforeState.height : null;
      out.push(step('ресайз за se на 40×30 экранных px', dw !== null && dw !== 0, `Δwidth=${dw}, Δheight=${dh} в единицах проекта`));
    }
  }

  // Шаг 4: повернуть за rotate.
  {
    const beforeState = await stateOf(page, 'title', SLIDE_ID);
    const grip = await screenCenterOf(page, '[data-grip="rotate"]');
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? Array.from(el.classList).join('.') || el.tagName : 'null';
    }, grip ? [grip.x, grip.y] : [0, 0]);
    if (!grip) {
      out.push(step('поворот за rotate', false, 'ручка rotate не найдена'));
    } else {
      await dragMouse(page, grip, 60, 0);
      await page.waitForTimeout(50);
      const afterState = await stateOf(page, 'title', SLIDE_ID);
      const dRot = afterState && beforeState ? afterState.rotation - beforeState.rotation : null;
      out.push(
        step(
          'поворот за rotate',
          dRot !== null && dRot !== 0,
          `elementFromPoint(центр ручки)="${hit}", Δrotation=${dRot}°`,
        ),
      );
    }
  }

  // Шаг 5: добавить слайд.
  {
    const before = await page.evaluate(() => window.__project?.segments?.[0]?.slides?.length ?? null);
    await page.getByTestId('slide-add').click();
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__project?.segments?.[0]?.slides?.length ?? null);
    out.push(step('добавить слайд', before !== null && after === before + 1, `слайдов было ${before}, стало ${after}`));
  }

  // Шаг 6: перезагрузка.
  //
  // НАЙДЕНО ПРИ ПЕРВОМ ПРОГОНЕ (grep-подтверждено в apps/playground/src/editor.ts,
  // chooseProject): при явном `?fixture=X` в адресе КАЖДАЯ загрузка страницы
  // перечитывает пристинный fixtures/X.json заново — «явная просьба сильнее
  // сохранённого». Это НЕ дефект персистентности, а особенность стенда фикстур
  // (так и e2e получают чистый проект на каждый прогон). Поэтому здесь не
  // «прошёл/не прошёл», а замер: что именно остаётся после reload при ?fixture=.
  {
    const slidesBeforeReload = await page.evaluate(() => window.__project?.segments?.[0]?.slides?.length ?? null);
    await page.evaluate(() => {
      window.__old = true;
    });
    await page.waitForTimeout(800); // debounce автосохранения — 500ms, берём запас
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => window.__old === undefined && document.documentElement.dataset.ready === '1',
      null,
      { timeout: 30_000 },
    );
    const afterReload = await stateOf(page, 'title', SLIDE_ID);
    const slidesAfterReload = await page.evaluate(() => window.__project?.segments?.[0]?.slides?.length ?? null);
    const preserved = slidesAfterReload === slidesBeforeReload;
    out.push(
      step(
        'перезагрузка (?fixture=demo): содержимое сохранилось или откатилось к пристинной фикстуре?',
        true, // не дефект — фиксируем факт, не ждём конкретного исхода
        `слайдов до reload=${slidesBeforeReload}, после=${slidesAfterReload} ` +
          `(${preserved ? 'СОХРАНИЛОСЬ — неожиданно для ?fixture=' : 'ОТКАТИЛОСЬ к пристинной фикстуре — ожидаемо по коду editor.ts: «явная просьба сильнее сохранённого»'}); ` +
          `title на ${SLIDE_ID} после reload: x=${afterReload?.x}, y=${afterReload?.y}, width=${afterReload?.width}, height=${afterReload?.height}, rotation=${afterReload?.rotation}`,
      ),
    );
  }

  recordErrors(errors);
  await context.close();
  return out;
}

async function runBlockBTwoGates(browser) {
  const out = [];
  const { context, page, errors } = await freshPage(browser, 'B/two-gates');
  await openEditor(page, 'two-gates');

  // Шаг: щёлкнуть остановку.
  const gateCount = await page.locator('.ed-mark-gate').count();
  if (gateCount === 0) {
    out.push(step('щёлкнуть остановку', false, 'нет .ed-mark-gate на two-gates'));
    recordErrors(errors);
    await context.close();
    return out;
  }
  await page.locator('.ed-mark-gate').first().click();
  const panelVisible = await page.getByTestId('mark-panel').isVisible().catch(() => false);
  out.push(step('щёлкнуть остановку', panelVisible, `mark-panel visible=${panelVisible}, .ed-mark-gate найдено ${gateCount}`));

  // Убедиться, что тип "развилка" (fork) — иначе gate-split не появится.
  const kindSelect = page.getByLabel('Что это за остановка', { exact: true });
  const kindExists = await kindSelect.count();
  if (kindExists > 0) {
    const currentValue = await kindSelect.inputValue();
    if (currentValue !== 'fork') {
      await kindSelect.selectOption('fork');
      await page.waitForTimeout(50);
    }
  }

  // Шаг: сделать развилкой (кнопка «Разделить повествование здесь»).
  const splitBtn = page.getByTestId('gate-split');
  const splitCount = await splitBtn.count();
  if (splitCount === 0) {
    out.push(step('сделать развилкой (gate-split)', false, 'кнопки gate-split нет в DOM — тип не развилка?'));
  } else {
    const disabled = await splitBtn.isDisabled();
    if (disabled) {
      const reason = await page.getByTestId('split-blocked').textContent().catch(() => null);
      out.push(step('сделать развилкой (gate-split)', false, `кнопка задизаблена: ${reason ?? 'причина не показана'}`));
    } else {
      const beforeSegs = await page.evaluate(() => window.__project?.segments?.length ?? null);
      await splitBtn.click();
      await page.waitForTimeout(150);
      const afterSegs = await page.evaluate(() => window.__project?.segments?.length ?? null);
      out.push(step('сделать развилкой (gate-split)', afterSegs !== null && afterSegs > (beforeSegs ?? 0), `сегментов было ${beforeSegs}, стало ${afterSegs}`));
    }
  }

  // Шаг: переключиться в «Ветки».
  await page.getByTestId('view-branches').click();
  const branchesVisible = await page.getByTestId('branches-view').isVisible().catch(() => false);
  out.push(step('переключиться в «Ветки»', branchesVisible, `branches-view visible=${branchesVisible}`));

  // Шаг: проехать по дереву (drag средней кнопкой по branches-space).
  {
    const space = await page.getByTestId('branches-space').boundingBox();
    if (!space) {
      out.push(step('проехать по дереву', false, 'branches-space не найден'));
    } else {
      const canvasBefore = await page.getByTestId('branches-canvas').evaluate((n) => n.style.transform).catch(() => null);
      await page.mouse.move(space.x + space.width / 2, space.y + space.height / 2);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(space.x + space.width / 2 - 60, space.y + space.height / 2 - 30, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
      const canvasAfter = await page.getByTestId('branches-canvas').evaluate((n) => n.style.transform).catch(() => null);
      out.push(step('проехать по дереву (drag средней кнопкой)', canvasAfter !== canvasBefore, `transform было "${canvasBefore}", стало "${canvasAfter}"`));
    }
  }

  // Шаг: вернуться в «Дорожки».
  await page.getByTestId('view-tracks').click();
  const tracksVisible = await page.locator('.ed-transport').isVisible().catch(() => false);
  out.push(step('вернуться в «Дорожки»', tracksVisible, `.ed-transport visible=${tracksVisible}`));

  // Шаг: перезагрузка. Тот же эффект `?fixture=`, что и в demo-блоке (см.
  // комментарий там): страница переоткрывает пристинную фикстуру заново,
  // это не дефект персистентности стенда. Фиксируем факт, не судим его.
  {
    const segsBeforeReload = await page.evaluate(() => window.__project?.segments?.length ?? null);
    await page.evaluate(() => {
      window.__old = true;
    });
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => window.__old === undefined && document.documentElement.dataset.ready === '1',
      null,
      { timeout: 30_000 },
    );
    const segsAfterReload = await page.evaluate(() => window.__project?.segments?.length ?? null);
    const preserved = segsAfterReload === segsBeforeReload;
    out.push(
      step(
        'перезагрузка (?fixture=two-gates): развилка сохранилась или откатилась?',
        true,
        `сегментов до reload=${segsBeforeReload}, после=${segsAfterReload} ` +
          `(${preserved ? 'СОХРАНИЛОСЬ — неожиданно для ?fixture=' : 'ОТКАТИЛОСЬ к пристинной фикстуре — ожидаемо, «явная просьба сильнее сохранённого»'})`,
      ),
    );
  }

  recordErrors(errors);
  await context.close();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК C: что регулируется
// ─────────────────────────────────────────────────────────────────────────

async function dragHandle(page, testId, dx, dy) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
  return box;
}

async function runBlockC(browser) {
  const results = {};
  log('\n' + '═'.repeat(78));
  log('БЛОК C — что регулируется');
  log('═'.repeat(78));

  // C1: ширина каталога — ручка splitter-left, пределы, сворачивание, память.
  {
    const { context, page, errors } = await freshPage(browser, 'C1');
    await openEditor(page, 'demo');

    const handleExists = (await page.getByTestId('splitter-left').count()) > 0;
    let widthAfterMin = null;
    let widthAfterMax = null;
    if (handleExists) {
      // Тянем далеко влево — за нижний предел (260).
      await dragHandle(page, 'splitter-left', -500, 0);
      widthAfterMin = await page.locator('.ed-catalog').evaluate((n) => n.getBoundingClientRect().width);
      // Тянем далеко вправо — за верхний предел (560).
      await dragHandle(page, 'splitter-left', 900, 0);
      widthAfterMax = await page.locator('.ed-catalog').evaluate((n) => n.getBoundingClientRect().width);
    }

    // Сворачивание.
    const stageWidthBefore = await page.locator('.ed-stage-host').evaluate((n) => n.getBoundingClientRect().width);
    await page.getByTestId('collapse-catalog').click();
    await page.waitForTimeout(50);
    const stageWidthAfterCollapse = await page.locator('.ed-stage-host').evaluate((n) => n.getBoundingClientRect().width);
    const catalogGoneAfterCollapse = (await page.locator('.ed-catalog').count()) === 0;

    // Память после перезагрузки.
    await page.evaluate(() => { window.__old = true; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => window.__old === undefined && document.documentElement.dataset.ready === '1',
      null, { timeout: 30_000 },
    );
    const catalogGoneAfterReload = (await page.locator('.ed-catalog').count()) === 0;
    const localStorageRaw = await page.evaluate(() => localStorage.getItem('player.editor.chrome'));

    results.C1 = {
      handleExists, widthAfterMin, widthAfterMax,
      stageWidthBefore, stageWidthAfterCollapse, catalogGoneAfterCollapse,
      catalogGoneAfterReload, localStorageRaw,
    };
    log(`\nC1 каталог: ручка splitter-left есть=${handleExists}; ширина после тяги до упора влево=${widthAfterMin}, вправо=${widthAfterMax}`);
    log(`  сворачивание: холст ${stageWidthBefore}→${stageWidthAfterCollapse}px, каталог исчез из DOM=${catalogGoneAfterCollapse}`);
    log(`  после reload: каталог по-прежнему свёрнут=${catalogGoneAfterReload}, localStorage='player.editor.chrome'=${localStorageRaw}`);

    recordErrors(errors);
    await context.close();
  }

  // C2: правая колонка — есть ли ручка вообще? Контроль прибора — тем же
  // способом ищем splitter-left (заведомо существующую).
  {
    const { context, page, errors } = await freshPage(browser, 'C2');
    await openEditor(page, 'demo');

    const controlHandleExists = (await page.getByTestId('splitter-left').count()) > 0; // контроль прибора
    const rightHandleExists = (await page.getByTestId('splitter-right').count()) > 0;
    let widthAfterMin = null;
    let widthAfterMax = null;
    if (rightHandleExists) {
      await dragHandle(page, 'splitter-right', 500, 0); // вправо у side-ручки = сужение (side="right")
      widthAfterMin = await page.locator('.ed-side').evaluate((n) => n.getBoundingClientRect().width).catch(() => null);
      await dragHandle(page, 'splitter-right', -500, 0);
      widthAfterMax = await page.locator('.ed-side').evaluate((n) => n.getBoundingClientRect().width).catch(() => null);
    }
    results.C2 = { controlHandleExists, rightHandleExists, widthAfterMin, widthAfterMax };
    log(`\nC2 правая колонка (.ed-side): ручка splitter-right есть=${rightHandleExists} (контроль прибора: splitter-left найден=${controlHandleExists})`);
    if (rightHandleExists) log(`  ширина после тяги к максимальному сужению=${widthAfterMin}, к максимальному расширению=${widthAfterMax}`);

    recordErrors(errors);
    await context.close();
  }

  // C3: высота нижней зоны — тяга, пределы, раздельность Дорожки/Ветки.
  // ДВА НЕЗАВИСИМЫХ контекста: тест «складывания» и тест «раздельности
  // Дорожки/Ветки» иначе цепляются друг за друга через resolveDrag (после
  // складывания высота молча падает до TRACK_MIN_H, и следующая тяга вниз
  // на «заметно другое число» на самом деле опять сворачивает дорожку —
  // поймано на первом прогоне: «выставленная» высота 106px совпала с уже
  // свёрнутым корешком, а не с осмысленной раскрытой высотой).
  {
    const heightOf = (page, sel) => page.locator(sel).evaluate((n) => n.getBoundingClientRect().height).catch(() => null);

    // C3a: тяга вверх/вниз, складывание.
    const { context: ctxA, page: pageA, errors: errorsA } = await freshPage(browser, 'C3a');
    await openEditor(pageA, 'demo');
    const heightDefault = await heightOf(pageA, '.ed-track-column');
    await dragHandle(pageA, 'track-resize-handle', 0, -150); // тянем вверх — увеличиваем
    const heightAfterUp = await heightOf(pageA, '.ed-track-column');
    await dragHandle(pageA, 'track-resize-handle', 0, 400); // далеко вниз — за нижний предел / складывание
    const heightAfterDown = await heightOf(pageA, '.ed-track-column');
    const collapsedVisible = await pageA.getByTestId('track-collapsed').isVisible().catch(() => false);
    recordErrors(errorsA);
    await ctxA.close();

    log(`\nC3 нижняя зона: по умолчанию ${heightDefault}px; после тяги вверх на 150 → ${heightAfterUp}px` +
      `${heightAfterUp === heightDefault ? ' (БЕЗ ИЗМЕНЕНИЙ — «full» уже верхняя ступень, расти дальше некуда: событие pointermove с корректной дельтой доходит до ручки, проверено логом слушателей, но рендер лент не растёт сверх содержимого)' : ''}` +
      `; далеко вниз (400) → ${heightAfterDown}px, свёрнута=${collapsedVisible}`);

    // C3b: заметно отличная от умолчания высота (тяга вниз на 60, БЕЗ
    // предварительного складывания) → переключение в «Ветки» и назад →
    // память после перезагрузки.
    const { context: ctxB, page: pageB, errors: errorsB } = await freshPage(browser, 'C3b');
    await openEditor(pageB, 'demo');
    await dragHandle(pageB, 'track-resize-handle', 0, 60); // вниз на 60 — заведомо отличная высота, не складывание
    const heightSetInTracks = await heightOf(pageB, '.ed-track-column');
    const setCollapsed = await pageB.getByTestId('track-collapsed').isVisible().catch(() => false);

    await pageB.getByTestId('view-branches').click();
    await pageB.waitForTimeout(50);
    const heightInBranches = await heightOf(pageB, '.ed-track-column');

    await pageB.getByTestId('view-tracks').click();
    await pageB.waitForTimeout(50);
    const heightBackInTracks = await heightOf(pageB, '.ed-track-column');

    await pageB.evaluate(() => { window.__old = true; });
    await pageB.reload({ waitUntil: 'load' });
    await pageB.waitForFunction(
      () => window.__old === undefined && document.documentElement.dataset.ready === '1',
      null, { timeout: 30_000 },
    );
    const heightAfterReload = await heightOf(pageB, '.ed-track-column');
    recordErrors(errorsB);
    await ctxB.close();

    results.C3 = {
      heightDefault, heightAfterUp, heightAfterDown, collapsedVisible,
      heightSetInTracks, setCollapsed, heightInBranches, heightBackInTracks, heightAfterReload,
    };
    log(`  поставили в «Дорожках» ${heightSetInTracks}px (свёрнута=${setCollapsed}, заведомо отлично от умолчания ${heightDefault}px) → ` +
      `переключились в «Ветки»: ${heightInBranches}px → вернулись в «Дорожки»: ${heightBackInTracks}px ` +
      `(${heightBackInTracks === heightSetInTracks ? 'СОХРАНИЛАСЬ' : 'СБРОСИЛАСЬ К УМОЛЧАНИЮ — TrackView размонтируется при уходе в «Ветки» (условный рендер в Editor.tsx), его useState высоты слетает'})`);
    log(`  после reload (?fixture=demo, полная перезагрузка страницы): ${heightAfterReload}px (${heightAfterReload === heightSetInTracks ? 'запомнилась' : 'НЕ запомнилась, вернулась к умолчанию'})`);
  }

  // C4: масштаб холста — все ступени zoom-select, вписывание.
  {
    const { context, page, errors } = await freshPage(browser, 'C4');
    await openEditor(page, 'demo');
    const options = await page.getByTestId('zoom-select').evaluate((sel) =>
      Array.from(sel.options).map((o) => ({ value: o.value, label: o.text })),
    );
    results.C4 = { options };
    log(`\nC4 масштаб холста, ступени zoom-select:`);
    for (const o of options) log(`  value="${o.value}" label="${o.label}"`);
    recordErrors(errors);
    await context.close();
  }

  // C5: масштаб дерева веток — Ctrl+wheel до упора в обе стороны.
  {
    const { context, page, errors } = await freshPage(browser, 'C5');
    await openEditor(page, 'demo');
    await page.getByTestId('view-branches').click();
    const space = await page.getByTestId('branches-space').boundingBox();
    const zoomStart = await page.getByTestId('branches-zoom').textContent();

    await page.mouse.move(space.x + space.width / 2, space.y + space.height / 2);
    await page.keyboard.down('Control');
    for (let i = 0; i < 15; i += 1) await page.mouse.wheel(0, -600); // приблизить до упора
    await page.keyboard.up('Control');
    const zoomMax = await page.getByTestId('branches-zoom').textContent();

    await page.keyboard.down('Control');
    for (let i = 0; i < 25; i += 1) await page.mouse.wheel(0, 600); // отдалить до упора
    await page.keyboard.up('Control');
    const zoomMin = await page.getByTestId('branches-zoom').textContent();
    await page.keyboard.up('Control');

    results.C5 = { zoomStart, zoomMax, zoomMin };
    log(`\nC5 масштаб дерева веток: старт=${zoomStart}, после разгона вверх (15×Ctrl+wheel)=${zoomMax}, после разгона вниз (25×Ctrl+wheel)=${zoomMin}`);

    recordErrors(errors);
    await context.close();
  }

  // C6: складывание секций правой колонки и ленты слайдов, память.
  {
    const { context, page, errors } = await freshPage(browser, 'C6');
    await openEditor(page, 'demo');

    const sectionState = async (title) => {
      const btn = page.getByRole('button', { name: new RegExp(`(Свернуть|Развернуть) «${title}»`) });
      const count = await btn.count();
      if (count === 0) return null;
      return btn.getAttribute('aria-expanded');
    };

    const elementsBefore = await sectionState('Элементы');
    const slidesBefore = await sectionState('Слайды');
    const chaptersBefore = await sectionState('Главы');

    await page.getByRole('button', { name: /(Свернуть|Развернуть) «Элементы»/ }).click();
    await page.getByRole('button', { name: /(Свернуть|Развернуть) «Слайды»/ }).click();
    await page.getByRole('button', { name: /(Свернуть|Развернуть) «Главы»/ }).click();
    const elementsAfter = await sectionState('Элементы');
    const slidesAfter = await sectionState('Слайды');
    const chaptersAfter = await sectionState('Главы');

    const stripToggleBefore = await page.getByTestId('slide-strip-toggle').getAttribute('aria-expanded').catch(() => null);
    await page.getByTestId('slide-strip-toggle').click();
    const stripToggleAfter = await page.getByTestId('slide-strip-toggle').getAttribute('aria-expanded').catch(() => null);

    // Память после перезагрузки.
    await page.evaluate(() => { window.__old = true; });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => window.__old === undefined && document.documentElement.dataset.ready === '1',
      null, { timeout: 30_000 },
    );
    const elementsAfterReload = await sectionState('Элементы');
    const stripAfterReload = await page.getByTestId('slide-strip-toggle').getAttribute('aria-expanded').catch(() => null);

    results.C6 = {
      elementsBefore, slidesBefore, chaptersBefore,
      elementsAfter, slidesAfter, chaptersAfter,
      stripToggleBefore, stripToggleAfter,
      elementsAfterReload, stripAfterReload,
    };
    log(`\nC6 секции правой колонки: Элементы ${elementsBefore}→${elementsAfter}, Слайды ${slidesBefore}→${slidesAfter}, Главы ${chaptersBefore}→${chaptersAfter}`);
    log(`  лента слайдов (slide-strip-toggle): aria-expanded ${stripToggleBefore}→${stripToggleAfter}`);
    log(`  после reload: Элементы=${elementsAfterReload} (было ${elementsAfter} до reload), лента=${stripAfterReload} (было ${stripToggleAfter})`);

    recordErrors(errors);
    await context.close();
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// БЛОК D: сочетания
// ─────────────────────────────────────────────────────────────────────────

async function runBlockD(browser) {
  const results = {};
  log('\n' + '═'.repeat(78));
  log('БЛОК D — сочетания');
  log('═'.repeat(78));

  // D1: панель метки при развёрнутых секциях И открытой ленте слайдов.
  {
    const { context, page, errors } = await freshPage(browser, 'D1');
    await openEditor(page, 'two-gates');

    // Открыть ленту слайдов (по умолчанию свёрнута).
    await page.getByTestId('slide-strip-toggle').click();
    await page.waitForTimeout(50);
    const stripOpenControl = await page.getByTestId('slide-strip-toggle').getAttribute('aria-expanded');

    const gateCount = await page.locator('.ed-mark-gate').count();
    let markPanelMetrics = null;
    if (gateCount > 0) {
      await page.locator('.ed-mark-gate').first().click();
      await page.waitForSelector('[data-testid="mark-panel"]', { timeout: 5000 });
      markPanelMetrics = await page.getByTestId('mark-panel').evaluate((n) => ({
        clientHeight: n.clientHeight,
        scrollHeight: n.scrollHeight,
      }));
    }
    results.D1 = { stripOpenControl, gateCount, markPanelMetrics };
    log(`\nD1: лента слайдов открыта (aria-expanded=${stripOpenControl}), секции по умолчанию развёрнуты (не трогали).`);
    log(`  mark-panel: ${markPanelMetrics ? `client ${markPanelMetrics.clientHeight} / scroll ${markPanelMetrics.scrollHeight} px` : 'НЕ ОТКРЫЛАСЬ (gateCount=' + gateCount + ')'}`);

    recordErrors(errors);
    await context.close();
  }

  // D2: полоса свойств .ed-propbar при свёрнутом каталоге.
  {
    const { context, page, errors } = await freshPage(browser, 'D2');
    await openEditor(page, 'demo');

    await page.getByTestId('collapse-catalog').click();
    const collapsedControl = (await page.locator('.ed-catalog').count()) === 0; // положительный контроль
    await page.waitForTimeout(50);

    // Выделяем через ПАНЕЛЬ «Элементы» (`element-row-title`), а не кликом
    // по холсту: на первом слайде демо-фикстуры title невидим (state.visible
    // =false, элемент ещё не появился по сюжету — найдено в Блоке B), и клик
    // по его экранным координатам достаётся фоновому 'bg'. Выбор из панели
    // не хит-тестит сцену и не подвержен этой ловушке.
    await page.getByTestId('element-row-title').click();
    await page.waitForTimeout(50);

    const propbarMetrics = await page.getByTestId('propbar').evaluate((n) => {
      const rect = n.getBoundingClientRect();
      const fields = Array.from(n.querySelectorAll('.ed-propbar-field'));
      const beyond = fields.filter((f) => f.getBoundingClientRect().left >= rect.right - 1).length;
      return {
        clientWidth: n.clientWidth,
        scrollWidth: n.scrollWidth,
        fieldCount: fields.length,
        fieldsFullyBeyondEdge: beyond,
      };
    }).catch(() => null);

    results.D2 = { collapsedControl, propbarMetrics };
    log(`\nD2: каталог свёрнут (контроль=${collapsedControl}). propbar: ${propbarMetrics ? `client ${propbarMetrics.clientWidth} / scroll ${propbarMetrics.scrollWidth} px, полей всего ${propbarMetrics.fieldCount}, целиком за краем ${propbarMetrics.fieldsFullyBeyondEdge}` : 'не удалось выделить title / прочитать propbar'}`);

    recordErrors(errors);
    await context.close();
  }

  // D3: сколько px остаётся холсту в виде Дорожки и в виде Ветки.
  {
    const { context, page, errors } = await freshPage(browser, 'D3');
    await openEditor(page, 'demo');

    const stageHeight = () => page.locator('.ed-stage-host').evaluate((n) => n.getBoundingClientRect().height);

    const tracksControl = await page.getByTestId('view-tracks').getAttribute('aria-pressed');
    const heightTracks = await stageHeight();

    await page.getByTestId('view-branches').click();
    await page.waitForTimeout(50);
    const branchesControl = await page.getByTestId('view-branches').getAttribute('aria-pressed');
    const heightBranches = await stageHeight();

    results.D3 = { tracksControl, heightTracks, branchesControl, heightBranches };
    log(`\nD3: холст .ed-stage-host в «Дорожках» (aria-pressed=${tracksControl}) = ${heightTracks}px; в «Ветках» (aria-pressed=${branchesControl}) = ${heightBranches}px`);
    log(`  оба ≥180: Дорожки=${heightTracks >= 180}, Ветки=${heightBranches >= 180}`);

    recordErrors(errors);
    await context.close();
  }

  // D4: складывание секций вместе с прокруткой колонки.
  {
    const { context, page, errors } = await freshPage(browser, 'D4');
    await openEditor(page, 'demo');

    const scrollHeightOf = () => page.locator('.ed-side').evaluate((n) => n.scrollHeight);
    const before = await scrollHeightOf();

    await page.getByRole('button', { name: /(Свернуть|Развернуть) «Элементы»/ }).click();
    await page.getByRole('button', { name: /(Свернуть|Развернуть) «Слайды»/ }).click();
    await page.getByRole('button', { name: /(Свернуть|Развернуть) «Главы»/ }).click();
    await page.waitForTimeout(50);
    const after = await scrollHeightOf();

    results.D4 = { before, after };
    log(`\nD4: .ed-side scrollHeight до сворачивания секций=${before}px, после=${after}px (${after < before ? 'уменьшился' : 'НЕ уменьшился'})`);

    recordErrors(errors);
    await context.close();
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────
// ЗАПУСК
// ─────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

const blockA = await runBlockA(browser);

log('\n' + '═'.repeat(78));
log('БЛОК B — путь автора, с консолью');
log('═'.repeat(78));
log('\n— demo (элементы/слайды) —');
const blockBDemo = await runBlockBDemo(browser);
log('\n— two-gates (остановки) —');
const blockBTwoGates = await runBlockBTwoGates(browser);

const blockC = await runBlockC(browser);
const blockD = await runBlockD(browser);

await browser.close();

log('\n' + '═'.repeat(78));
log('ИТОГ');
log('═'.repeat(78));
log(`контекстов открыто: ${contextCount}`);
log(`шагов пройдено (блок B): ${stepCount}`);
log(`ошибок страницы всего: ${allErrors.length}`);
for (const e of allErrors) log(`  ${e}`);

await mkdir(new URL('../results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../results/s49-ux-1280x720.json', import.meta.url),
  JSON.stringify(
    { blockA, blockBDemo, blockBTwoGates, blockC, blockD, contextCount, stepCount, errors: allErrors },
    null,
    2,
  ),
);
log('\nРезультат записан: spikes/results/s49-ux-1280x720.json');
