// Приёмка за исполнителем 1280x720: перемеряю несущие числа СВОИМИ руками.
import { chromium } from '@playwright/test';
const BASE='http://localhost:5179';
const b = await chromium.launch({headless:true});
const errs=[];
const open = async (fixture) => {
  const ctx = await b.newContext({ viewport:{width:1280,height:720} });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errs.push(fixture+': '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push(fixture+' console: '+m.text()); });
  await p.goto(`${BASE}/editor.html?fixture=${fixture}`,{waitUntil:'load'});
  await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
  return {ctx,p};
};
const box = (p,sel) => p.evaluate((s)=>{
  const el=document.querySelector(s);
  if(!el) return null;
  const r=el.getBoundingClientRect();
  return {w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10,
          client:el.clientHeight,scroll:el.scrollHeight,
          cw:el.clientWidth,sw:el.scrollWidth};
}, sel);

// 1. .ed-side при выделенной остановке
{
  const {ctx,p} = await open('two-gates');
  await p.locator('.ed-mark-gate').first().click();
  await p.waitForSelector('[data-testid="mark-panel"]');
  const side = await box(p,'.ed-side');
  console.log(`1) .ed-side (two-gates, выделена остановка): видно ${side.client} из ${side.scroll} = ${(side.client/side.scroll*100).toFixed(1)} %`);
  const mp = await box(p,'[data-testid="mark-panel"]');
  console.log(`   сама панель метки: client ${mp.client} / scroll ${mp.scroll}`);
  await ctx.close();
}
// 2. холст в двух видах
{
  const {ctx,p} = await open('two-gates');
  const tracks = await box(p,'.ed-stage-host');
  await p.getByTestId('view-branches').click();
  await p.waitForTimeout(400);
  const branches = await box(p,'.ed-stage-host');
  console.log(`2) холст .ed-stage-host: Дорожки ${tracks.h} px, Ветки ${branches.h} px  (порог 180)`);
  await ctx.close();
}
// 3. полоса свойств, каталог открыт vs свёрнут
for (const collapse of [false,true]) {
  const {ctx,p} = await open('demo');
  if (collapse) await p.getByTestId('collapse-catalog').click();
  await p.waitForTimeout(300);
  const cat = await box(p,'.ed-catalog');
  // выделить элемент, чтобы полоса наполнилась
  await p.locator('[data-testid="stage-scene"] [data-id="bg"]').click({force:true});
  await p.waitForTimeout(300);
  const bar = await box(p,'.ed-propbar-row') || await box(p,'.ed-propbar');
  console.log(`3) каталог ${collapse?'СВЁРНУТ':'открыт'} (ширина ${cat?cat.w:'—'}): полоса свойств clientWidth ${bar?bar.cw:'—'} / scrollWidth ${bar?bar.sw:'—'}`);
  await ctx.close();
}
// 4. ручки splitter
{
  const {ctx,p} = await open('demo');
  const r = await p.evaluate(()=>({
    left: !!document.querySelector('[data-testid="splitter-left"]'),
    right: !!document.querySelector('[data-testid="splitter-right"]'),
    sideW: document.querySelector('.ed-side')?.getBoundingClientRect().width,
    catW: document.querySelector('.ed-catalog')?.getBoundingClientRect().width,
  }));
  console.log(`4) ручки: splitter-left ${r.left?'ЕСТЬ':'НЕТ'}, splitter-right ${r.right?'ЕСТЬ':'НЕТ'}; каталог ${Math.round(r.catW)} px, правая колонка ${Math.round(r.sideW)} px`);
  await ctx.close();
}
console.log('\nошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
