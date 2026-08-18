// Проверка сильного «нет»: у обрезанных многоточием текстов якобы НИ У ОДНОГО
// нет способа прочитать целиком. Проверяю сам — «нет» за эту программу
// оказывалось неверным четырежды.
import { chromium } from '@playwright/test';
const BASE='http://localhost:5179';
const b = await chromium.launch({headless:true});
const errs=[];
for (const fixture of ['demo','two-gates']) {
  const ctx = await b.newContext({ viewport:{width:1280,height:720} });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  await p.goto(`${BASE}/editor.html?fixture=${fixture}`,{waitUntil:'load'});
  await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
  if (fixture==='two-gates'){ await p.locator('.ed-mark-gate').first().click(); await p.waitForSelector('[data-testid="mark-panel"]'); }
  const r = await p.evaluate(()=>{
    const root=document.querySelector('.ed-root');
    const out=[];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const cls=Array.from(el.classList).filter(c=>c.startsWith('ed-'));
      if(!cls.length) continue;
      const rect=el.getBoundingClientRect();
      if(rect.width===0||rect.height===0) continue;
      if(el.scrollWidth<=el.clientWidth+1) continue;
      const cs=getComputedStyle(el);
      if(cs.textOverflow!=='ellipsis') continue;
      const full=(el.textContent||'').trim();
      out.push({
        cls:cls.join('.'),
        testid:el.getAttribute('data-testid'),
        title:el.getAttribute('title'),
        aria:el.getAttribute('aria-label'),
        parentTitle: el.parentElement?el.parentElement.getAttribute('title'):null,
        cw:el.clientWidth, sw:el.scrollWidth,
        text: full.length>50?full.slice(0,50)+'…':full,
      });
    }
    return out;
  });
  console.log(`\n=== ${fixture} 1280x720 — обрезано многоточием: ${r.length} ===`);
  for(const x of r){
    const way = x.title?`title="${x.title}"`:(x.aria?`aria-label="${x.aria}"`:(x.parentTitle?`title у родителя`:'НЕТ СПОСОБА'));
    console.log(`  .${x.cls}${x.testid?' ['+x.testid+']':''}  видно ${x.cw}/${x.sw}  -> ${way}`);
    console.log(`      текст: "${x.text}"`);
  }
  const noway = r.filter(x=>!x.title&&!x.aria&&!x.parentTitle).length;
  console.log(`  ИТОГ: без способа прочитать целиком ${noway} из ${r.length}`);
  await ctx.close();
}
console.log('\nошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
