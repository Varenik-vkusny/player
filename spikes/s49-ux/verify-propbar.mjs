// Полоса свойств = .ed-propbar, и она СУЩЕСТВУЕТ только когда что-то
// выделено. .ed-propbar-row — внешняя обёртка со .ed-scrollstrip внутри,
// она не обрезается НИКОГДА. Мерить обёртку вместо полосы = мерить не то
// и получить «влезает» при обрезанной полосе (поймано на себе 18.08.2026).
import { chromium } from '@playwright/test';
const BASE='http://localhost:5179';
const b = await chromium.launch({headless:true});
const errs=[];
console.log('элемент "title" (текст), фикстура demo\n');
for (const [w,h] of [[1280,720],[1440,900],[1920,1080]]) {
  for (const collapse of [false,true]) {
    const ctx = await b.newContext({ viewport:{width:w,height:h} });
    const p = await ctx.newPage();
    p.on('pageerror',e=>errs.push(e.message));
    p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
    await p.goto(`${BASE}/editor.html?fixture=demo`,{waitUntil:'load'});
    await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
    if (collapse) { await p.getByTestId('collapse-catalog').click(); await p.waitForTimeout(300); }
    await p.getByTestId('element-row-title').click();
    await p.waitForTimeout(400);
    const r = await p.evaluate(()=>{
      const bar=document.querySelector('.ed-propbar');
      const readout=document.querySelector('[data-testid="selection-readout"]');
      if(!bar) return {missing:true, readout:readout?readout.textContent.trim():null};
      const kids=Array.from(bar.children).filter(c=>c.getBoundingClientRect().width>0);
      const barRect=bar.getBoundingClientRect();
      // Органы, целиком уехавшие за правый край видимой части.
      const beyond=kids.filter(c=>{const r=c.getBoundingClientRect();return r.left>=barRect.right;}).length;
      return {cw:bar.clientWidth,sw:bar.scrollWidth,organs:kids.length,beyond,
              readout:readout?readout.textContent.trim():null,
              cat:Math.round(document.querySelector('.ed-catalog')?.getBoundingClientRect().width||0)};
    });
    if(r.missing){console.log(`${w}x${h} ${collapse?'свёрнут':'открыт'}: ПОЛОСЫ НЕТ, выделено: ${r.readout}`);}
    else {
      const hid=r.sw-r.cw;
      console.log(`${w}x${h} каталог ${collapse?'СВЁРНУТ  ':'открыт   '}(${String(r.cat).padStart(3)}px): полоса client ${String(r.cw).padStart(4)} / scroll ${String(r.sw).padStart(4)}  ` +
        (hid>0?`ОБРЕЗАНА на ${String(hid).padStart(3)} px, видно ${(r.cw/r.sw*100).toFixed(1)} %`:'влезает целиком      ') +
        `  органов ${r.organs}, целиком за краем ${r.beyond}`);
    }
    await ctx.close();
  }
}
console.log('\nположительный контроль: выделение состоялось —', 'см. столбец readout в отладке (title: 140 × 130, 1300×180, 0°)');
console.log('ошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
