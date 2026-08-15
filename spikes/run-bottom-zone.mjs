// S16: АНАТОМИЯ НИЖНЕЙ ЗОНЫ РЕДАКТОРА — сколько она отъедает и НА ЧТО.
//
// Владелец 13.08.2026: «дорожка сейчас жирная очень». `tracks.md` §3 требует
// мерить живой DOM, а не прикидывать: в Сессии 18 подгонка на глаз отняла
// у сцены 44 px, уронила масштаб с 0.208333 до 0.202778 и повалила e2e —
// не поломкой продукта, а ростом артефакта измерения.
//
// Мерить надо ИЗМЕРЕННОЕ, а не объявленное. В памяти проекта уже записан
// случай, когда константа `TRANSPORT_H` стояла 40 px при настоящей высоте 34.
// Поэтому здесь ни одно число не берётся из кода — всё с `getBoundingClientRect`
// и `getComputedStyle` живой страницы.
//
// Ответ на вопрос «на что» даёт не суммарная высота, а разбор по вкладам:
// у каждого узла отдельно показаны содержимое, паддинги, рамки и зазоры —
// иначе непонятно, резать содержимое или отступы.
//
// headless: true намеренно. Меряется раскладка, а не время и не кадры;
// от видимости окна она не зависит. Ровно по этой причине S0/S6/S9 headless
// не используют, а здесь он законен.
//
// Запуск (дев-сервер стенда должен быть поднят — pnpm dev):
//   node spikes/run-bottom-zone.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:5179';

// Размеры окна. 1280×800 — стенд e2e, и его числа сравнимы с прошлыми
// замерами. 1440×900 и 1920×1080 — рабочие: зона может отъедать долю,
// а может фиксированное число пикселей, и различить это можно только
// на нескольких размерах.
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

// Зазор вокруг сцены (Сессия 36, снят с живой Canva). Вписывание считается
// от области ЗА ВЫЧЕТОМ зазора — иначе ожидаемый масштаб разойдётся
// с настоящим, и разойдётся правдоподобно.
const GAP_X = 24;
const GAP_Y = 16;

/**
 * Разбор высоты одного узла на вклады.
 *
 * Возвращает и `outer` (сколько узел отнимает у родителя, вместе с полями),
 * и `content` (сколько досталось содержимому) — разница между ними и есть
 * то, что можно срезать, не трогая содержимое.
 */
const ANATOMY = `(() => {
  const px = (v) => Math.round(parseFloat(v) * 100) / 100 || 0;

  const box = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const mt = px(cs.marginTop), mb = px(cs.marginBottom);
    const pt = px(cs.paddingTop), pb = px(cs.paddingBottom);
    const bt = px(cs.borderTopWidth), bb = px(cs.borderBottomWidth);
    return {
      cls: (typeof el.className === 'string' && el.className) || el.tagName.toLowerCase(),
      testid: el.dataset ? (el.dataset.testid || null) : null,
      outer: Math.round((r.height + mt + mb) * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      content: Math.round((r.height - pt - pb - bt - bb) * 100) / 100,
      padding: pt + pb,
      border: bt + bb,
      margin: mt + mb,
      rowGap: px(cs.rowGap),
      display: cs.display,
    };
  };

  // Спускаемся вглубь, пока узлы вносят заметный вклад в высоту. Порог 1 px
  // отсекает разделители и нулевые обёртки, ради которых читать нечего.
  const walk = (el, depth, maxDepth) => {
    const node = box(el);
    node.depth = depth;
    if (depth < maxDepth) {
      node.children = Array.from(el.children)
        .filter((c) => c.getBoundingClientRect().height >= 1)
        .map((c) => walk(c, depth + 1, maxDepth));
    }
    return node;
  };

  const q = (s) => document.querySelector(s);
  const root = q('.ed-root');
  const host = q('.ed-stage-host');
  const column = q('.ed-track-column');
  if (!root) throw new Error('нет .ed-root');
  if (!host) throw new Error('нет .ed-stage-host');

  const rootCS = getComputedStyle(root);

  return {
    window: { w: window.innerWidth, h: window.innerHeight },
    // Строки грида ОТДАННЫМИ значениями, а не объявленными: 'auto 1fr auto'
    // ничего не говорит о том, сколько досталось каждой.
    gridRows: rootCS.gridTemplateRows,
    rootChildren: Array.from(root.children).map(box),
    stageHost: box(host),
    // Дерево нижней зоны — то, ради чего замер и затевался.
    column: column ? walk(column, 0, 4) : null,
  };
})()`;

const openEditor = async (page, viewport, fixture) => {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 30_000,
  });
};

/**
 * Масштаб сцены — ФАКТИЧЕСКИЙ, из DOM, и отдельно ОЖИДАЕМЫЙ по нынешнему
 * холсту. Два числа, а не одно: совпадение их и есть проверка, что пересчёт
 * состоялся, а расхождение сразу называет цену высоты в масштабе.
 *
 * Пересчёт живёт в колбэке `ResizeObserver`, то есть приходит кадром позже
 * (Сессия 40, диагноз подтверждён сломом). Поэтому здесь ждут схождения,
 * а не читают сразу — иначе замер будет гоняться с пересчётом и врать.
 */
const readScale = async (page) => {
  const expected = () =>
    page.evaluate(
      ([gx, gy]) => {
        const host = document.querySelector('.ed-stage-host');
        return Math.min((host.clientWidth - 2 * gx) / 1920, (host.clientHeight - 2 * gy) / 1080);
      },
      [GAP_X, GAP_Y],
    );

  const actual = () =>
    page.evaluate(() => {
      const bg = document.querySelector('[data-id="bg"]');
      if (!bg) return null;
      return bg.getBoundingClientRect().width / 1920;
    });

  const deadline = Date.now() + 5000;
  let a = await actual();
  let e = await expected();
  while (a !== null && Math.abs(a - e) > 1e-4 && Date.now() < deadline) {
    await page.waitForTimeout(50);
    a = await actual();
    e = await expected();
  }
  return { actual: a, expected: e, converged: a === null ? null : Math.abs(a - e) <= 1e-4 };
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
});

const runs = [];
for (const viewport of VIEWPORTS) {
  await openEditor(page, viewport, 'demo');

  const collapsed = await page.evaluate(ANATOMY);
  const collapsedScale = await readScale(page);

  // Развёрнутая озвучка — второй крайний случай. Панель свёрнута
  // по умолчанию (решение владельца 11.08.2026), но автор её открывает,
  // и именно в этом состоянии холсту достаётся меньше всего.
  await page.getByTestId('audio-source-toggle').click();
  await page.waitForTimeout(120);
  const expanded = await page.evaluate(ANATOMY);
  const expandedScale = await readScale(page);

  runs.push({ viewport, collapsed, collapsedScale, expanded, expandedScale });
}

// ─── Разбор вслух ───────────────────────────────────────────────────────────
// Спайк обязан отвечать выводом, а не оставлять числа на толкование.

const flat = (node, out = []) => {
  out.push(node);
  (node.children ?? []).forEach((c) => flat(c, out));
  return out;
};

const line = (n) =>
  `${'  '.repeat(n.depth)}${n.cls.padEnd(38 - n.depth * 2)} ` +
  `внешне ${String(n.outer).padStart(7)}  содержимому ${String(n.content).padStart(7)}` +
  `  поля ${String(n.padding + n.border + n.margin).padStart(6)}` +
  (n.rowGap ? `  зазоры ${n.rowGap}` : '');

for (const run of runs) {
  const { viewport, collapsed, collapsedScale, expanded, expandedScale } = run;
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`ОКНО ${viewport.width}×${viewport.height}   фикстура demo`);
  console.log('═'.repeat(78));

  console.log(`\nстроки грида .ed-root (отданные): ${collapsed.gridRows}`);
  console.log('прямые дети .ed-root:');
  for (const c of collapsed.rootChildren) {
    console.log(`  ${c.cls.padEnd(30)} ${String(c.outer).padStart(8)} px`);
  }

  const zone = collapsed.column;
  const zoneExpanded = expanded.column;
  const host = collapsed.stageHost;

  console.log(`\nхолст .ed-stage-host: ${host.height} px из ${collapsed.window.h} px окна`);
  console.log(`нижняя зона .ed-track-column: ${zone ? zone.outer : '—'} px` +
    (zone ? ` = ${((zone.outer / collapsed.window.h) * 100).toFixed(1)} % окна` : ''));
  console.log(`она же при РАСКРЫТОЙ озвучке: ${zoneExpanded ? zoneExpanded.outer : '—'} px`);

  if (zone) {
    console.log('\nиз чего складывается (свёрнутая озвучка):');
    for (const n of flat(zone)) console.log('  ' + line(n));
  }

  const s = collapsedScale;
  const se = expandedScale;
  console.log(
    `\nмасштаб сцены: ${s.actual === null ? 'нет [data-id="bg"]' : s.actual.toFixed(6)}` +
      `  ожидаемый по холсту ${s.expected.toFixed(6)}` +
      `  ${s.converged === null ? '' : s.converged ? '— сошлись' : '— РАЗОШЛИСЬ'}`,
  );
  console.log(
    `масштаб при раскрытой озвучке: ${se.actual === null ? '—' : se.actual.toFixed(6)}` +
      (s.actual && se.actual ? `  (${((se.actual / s.actual - 1) * 100).toFixed(1)} % от свёрнутой)` : ''),
  );
}

console.log(`\n${'═'.repeat(78)}`);
console.log(pageErrors.length ? `ОШИБКИ СТРАНИЦЫ: ${pageErrors.join(' | ')}` : 'ошибок страницы: 0');

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./results/s16-bottom-zone.json', import.meta.url),
  JSON.stringify({ runs, pageErrors }, null, 2),
);
console.log('Результат записан: spikes/results/s16-bottom-zone.json');

await browser.close();
