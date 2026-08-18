// Проверка спорной находки: «вторая тяга ручки высоты зоны не действует».
// Меряю высоту .ed-track-column после КАЖДОГО жеста, в одном контексте,
// плюс положительный контроль, что события доходят до ручки.
import { chromium } from '@playwright/test';
const BASE='http://localhost:5179';
const b = await chromium.launch({headless:true});
const errs=[];

const H = (p) => p.evaluate(()=>{
  const el=document.querySelector('.ed-track-column');
  return el?Math.round(el.getBoundingClientRect().height):-1;
});

const drag = async (p, dy, label) => {
  const grip = p.getByTestId('track-resize-handle');
  const bb = await grip.boundingBox();
  if(!bb){ console.log(`   ${label}: РУЧКИ НЕТ В DOM`); return; }
  const cx = bb.x+bb.width/2, cy = bb.y+bb.height/2;
  // контроль достижимости: кто в центре ручки
  const who = await p.evaluate(([x,y])=>{
    const el=document.elementFromPoint(x,y);
    return el?el.className+'|'+el.tagName:'(никого)';
  },[cx,cy]);
  const before = await H(p);
  await p.mouse.move(cx,cy);
  await p.mouse.down();
  await p.mouse.move(cx,cy+dy,{steps:12});
  await p.mouse.up();
  await p.waitForTimeout(350);
  const after = await H(p);
  console.log(`   ${label}: dy=${dy>0?'+':''}${dy}  высота ${before} -> ${after}  (Δ ${after-before})  [в центре ручки: ${who}]`);
};

for (const [w,h] of [[1280,720],[1440,900]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  await p.goto(`${BASE}/editor.html?fixture=demo`,{waitUntil:'load'});
  await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
  console.log(`\n=== ${w}x${h}, один контекст, четыре жеста подряд ===`);
  console.log(`   высота на входе: ${await H(p)}`);
  await drag(p,-80,'жест 1: ВВЕРХ (увеличить зону)');
  await drag(p, 80,'жест 2: ВНИЗ (уменьшить обратно)');
  await drag(p,-80,'жест 3: ВВЕРХ снова');
  await drag(p,120,'жест 4: ВНИЗ сильно');
  await ctx.close();
}
console.log('\nошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
