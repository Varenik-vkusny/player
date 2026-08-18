// Лестница высот нижней зоны: тянем ручку ВНИЗ мелким шагом и записываем
// КАЖДУЮ смену высоты. Отдельно — попытка растянуть ВВЕРХ от умолчания.
import { chromium } from '@playwright/test';
const b = await chromium.launch({headless:true});
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
await p.goto('http://localhost:5179/editor.html?fixture=demo',{waitUntil:'load'});
await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});

const H = () => p.evaluate(()=>{const e=document.querySelector('.ed-track-column');return e?Math.round(e.getBoundingClientRect().height):-1;});
const tier = () => p.evaluate(()=>{const e=document.querySelector('.ed-track-column');return e?Array.from(e.classList).join('.'):'';});

// Одна непрерывная тяга сверху вниз: зажали и ведём, записывая высоту.
const grip = p.getByTestId('track-resize-handle');
const bb = await grip.boundingBox();
const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;

console.log(`умолчание: ${await H()} px, классы: ${await tier()}`);

// ВВЕРХ до самого верха окна
await p.mouse.move(cx,cy); await p.mouse.down();
await p.mouse.move(cx, 40, {steps:25}); await p.mouse.up(); await p.waitForTimeout(300);
console.log(`после тяги ВВЕРХ до y=40 (насколько можно вырасти): ${await H()} px`);

// вернуть и вести ВНИЗ мелко, записывая каждую смену
await p.reload({waitUntil:'load'});
await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
const bb2 = await p.getByTestId('track-resize-handle').boundingBox();
const x2=bb2.x+bb2.width/2, y2=bb2.y+bb2.height/2;
await p.mouse.move(x2,y2); await p.mouse.down();
let last = await H();
const ladder=[{y:0,h:last,cls:await tier()}];
for (let dy=10; dy<=520; dy+=10) {
  await p.mouse.move(x2, y2+dy, {steps:2});
  await p.waitForTimeout(60);
  const h = await H();
  if (h !== last) { ladder.push({y:dy,h,cls:await tier()}); last=h; }
}
await p.mouse.up();
console.log('\nлестница высот при тяге ВНИЗ (меняется только на ступенях):');
for (const s of ladder) console.log(`   тяга ${String(s.y).padStart(3)} px -> высота ${String(s.h).padStart(3)}   ${s.cls}`);
console.log(`\nвсего различных высот: ${new Set(ladder.map(s=>s.h)).size}`);
console.log('ошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
