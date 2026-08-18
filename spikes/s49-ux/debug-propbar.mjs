import { chromium } from '@playwright/test';
const b = await chromium.launch({headless:true});
const ctx = await b.newContext({ viewport:{width:1280,height:720} });
const p = await ctx.newPage();
await p.goto('http://localhost:5179/editor.html?fixture=demo',{waitUntil:'load'});
await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
const dump = async (label) => {
  const r = await p.evaluate(()=>{
    const out={};
    const readout=document.querySelector('[data-testid="selection-readout"]');
    out.readout = readout ? readout.textContent.trim() : '(нет selection-readout)';
    for (const sel of ['.ed-propbar','.ed-propbar-row']) {
      const el=document.querySelector(sel);
      out[sel] = el ? {cw:el.clientWidth, sw:el.scrollWidth, children:Array.from(el.children).map(c=>({
        cls:Array.from(c.classList).join('.'), w:Math.round(c.getBoundingClientRect().width),
        testid:c.getAttribute('data-testid')})) } : null;
    }
    return out;
  });
  console.log('\n--- '+label+' ---');
  console.log('  выделено:', r.readout);
  for (const k of ['.ed-propbar','.ed-propbar-row']) {
    const v=r[k];
    if(!v){console.log('  '+k+': НЕТ');continue;}
    console.log(`  ${k}: client ${v.cw} / scroll ${v.sw}, детей ${v.children.length}`);
    for(const c of v.children) console.log(`      .${c.cls} w=${c.w}${c.testid?' ['+c.testid+']':''}`);
  }
};
await dump('стартовое состояние');
await p.getByTestId('element-row-title').click();
await p.waitForTimeout(400);
await dump('после клика по строке title в списке');
await b.close();
