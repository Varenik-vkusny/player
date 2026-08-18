// Разведка к §5: КТО СЕГОДНЯ обрезает содержимое по вертикали.
// Нужна затем, чтобы белый список охраны был ИЗМЕРЕН, а не придуман.
//
// Имена классов берутся через el.classList, а НЕ разбором строки className:
// разбор регуляркой внутри строки для page.evaluate молча исказил имена
// (ed-side доложился как ed-), числа при этом остались верными.
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5179';

const DETECT = () => {
  const root = document.querySelector('.ed-root');
  if (!root) throw new Error('нет .ed-root');
  const all = Array.from(root.querySelectorAll('*'));
  const out = [];
  let considered = 0;
  for (const el of all) {
    const cls = Array.from(el.classList).filter((c) => c.startsWith('ed-'));
    if (cls.length === 0) continue;
    considered++;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (el.scrollHeight > el.clientHeight + 1) {
      const cs = getComputedStyle(el);
      out.push({
        cls: cls.join('.'), tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid'),
        client: el.clientHeight, scroll: el.scrollHeight,
        pct: Math.round((el.clientHeight / el.scrollHeight) * 1000) / 10,
        overflowY: cs.overflowY, flex: cs.flex,
      });
    }
  }
  out.sort((a, b) => a.pct - b.pct);
  return { considered, total: all.length, clipping: out };
};

const b = await chromium.launch({ headless: true });
const errs = [];
for (const fixture of ['demo', 'two-gates']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(fixture + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(fixture + ' console: ' + m.text()); });
  await p.goto(`${BASE}/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30000 });
  if (fixture === 'two-gates') { await p.locator('.ed-mark-gate').first().click(); await p.waitForTimeout(300); }
  const r = await p.evaluate(DETECT);
  console.log(`\n=== ${fixture} 1280x800  (узлов ed-*: ${r.considered} из ${r.total}) ===`);
  for (const c of r.clipping) {
    console.log(`  ${String(c.pct).padStart(6)}%  ${String(c.client).padStart(4)}/${String(c.scroll).padEnd(5)} overflowY=${c.overflowY.padEnd(8)} flex=${c.flex.padEnd(10)} <${c.tag}> .${c.cls}${c.testid ? ' [' + c.testid + ']' : ''}`);
  }
  if (r.clipping.length === 0) console.log('  (никто не обрезан по вертикали)');
  const probe = await p.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'ed-probe-clip';
    d.style.cssText = 'height:20px;overflow:auto;';
    d.innerHTML = '<div style="height:200px"></div>';
    document.querySelector('.ed-root').appendChild(d);
    const seen = d.scrollHeight > d.clientHeight + 1 && Array.from(d.classList).some((c) => c.startsWith('ed-'));
    d.remove();
    return seen;
  });
  console.log(`  контроль прибора: заведомо обрезанный узел ${probe ? 'НАЙДЕН' : 'НЕ НАЙДЕН — ДЕТЕКТОР СЛОМАН'}`);
  await ctx.close();
}
console.log('\nошибки страницы:', errs.length ? errs.join(' | ') : 0);
await b.close();
