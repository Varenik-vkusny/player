import { chromium } from '@playwright/test';
const b = await chromium.launch({headless:true});
const ctx = await b.newContext({ viewport:{width:1280,height:800} });
const p = await ctx.newPage();
await p.goto('http://localhost:5179/editor.html?fixture=two-gates',{waitUntil:'load'});
await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
await p.locator('.ed-mark-gate').first().click();
await p.waitForTimeout(300);
const r = await p.evaluate(() => {
  const root = document.querySelector('.ed-root');
  const out = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) {
      out.push({
        tag: el.tagName.toLowerCase(),
        rawClassName: String(el.className),
        classListArr: Array.from(el.classList),
        id: el.id || null,
        testid: el.getAttribute('data-testid'),
        client: el.clientHeight, scroll: el.scrollHeight,
      });
    }
  }
  return out;
});
for (const x of r) console.log(JSON.stringify(x));
await b.close();
