// Шапка на трёх размерах: кто в ней раздавлен и с какого окна.
// .ed-muted (сводка сегмента) и .ed-selection (ЧТО ВЫДЕЛЕНО) — единственные
// текстовые сообщения шапки, и оба сжимаемы.
import { chromium } from '@playwright/test';
const BASE='http://localhost:5179';
const b = await chromium.launch({headless:true});
const errs=[];
console.log('фикстура demo, элемент title выделен через список\n');
console.log('окно        .ed-title      .ed-muted        .ed-selection (что выделено)');
for (const [w,h] of [[1280,720],[1440,900],[1920,1080]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  await p.goto(`${BASE}/editor.html?fixture=demo`,{waitUntil:'load'});
  await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
  await p.getByTestId('element-row-title').click();
  await p.waitForTimeout(300);
  const r = await p.evaluate(()=>{
    const g=(s)=>{const e=document.querySelector(s);return e?{cw:e.clientWidth,sw:e.scrollWidth,t:(e.textContent||'').trim()}:null;};
    return {title:g('.ed-title'), muted:g('.ed-muted'), sel:g('.ed-selection')};
  });
  const f=(x)=> x? `${String(x.cw).padStart(4)}/${String(x.sw).padEnd(4)} ${x.sw>x.cw?(x.cw/x.sw*100).toFixed(0).padStart(3)+'%':' ok '}`:'   —   ';
  console.log(`${w}x${h}  ${f(r.title)}  ${f(r.muted)}  ${f(r.sel)}   "${r.sel?r.sel.t:''}"`);
  await ctx.close();
}
console.log('\n(client/scroll, процент = сколько видно)');
console.log('ошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
