// НАСТОЯЩИЙ путь автора: /editor.html БЕЗ ?fixture= — слот работы.
// Сравнивать надо ЧИСЛО СЛАЙДОВ, а не всю подпись счётчика: подпись
// несёт ещё и текущий слайд, и время, и они сбрасываются законно.
// Сравнение всей строки дало ложный вывод «работа потеряна» (поймано на себе).
import { chromium } from '@playwright/test';
const BASE='http://localhost:5179';
const b = await chromium.launch({headless:true});
const errs=[];
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });

const readout = () => p.evaluate(()=>{
  const c=document.querySelector('.ed-slide-strip-counter');
  const t=c?c.textContent.trim():'';
  const m=t.match(/(\d+)\s*\/\s*(\d+)/);
  return {text:t, current:m?+m[1]:null, total:m?+m[2]:null};
});

await p.goto(`${BASE}/editor.html`,{waitUntil:'load'});
await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
const a = await readout();
console.log(`открыт БЕЗ ?fixture=  : слайдов ${a.total}, текущий ${a.current}   "${a.text}"`);

await p.getByTestId('slide-add').click();
await p.waitForTimeout(600);
const c = await readout();
console.log(`после «Добавить слайд»: слайдов ${c.total}, текущий ${c.current}   "${c.text}"`);
// Контроль: правка ДОЛЖНА была состояться, иначе проверять нечего.
console.log(c.total === a.total + 1 ? '   контроль: правка состоялась (+1 слайд)' : '   ⚠ КОНТРОЛЬ ПРОВАЛЕН: слайд не добавился');

await p.reload({waitUntil:'load'});
await p.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
const d = await readout();
console.log(`после перезагрузки     : слайдов ${d.total}, текущий ${d.current}   "${d.text}"`);
console.log(d.total === c.total
  ? `   РАБОТА НА МЕСТЕ: ${a.total} -> ${c.total} -> ${d.total} слайдов`
  : `   РАБОТА ПОТЕРЯНА: было ${c.total}, стало ${d.total}`);
console.log(d.current === c.current
  ? `   текущий слайд сохранился (${d.current})`
  : `   текущий слайд СБРОШЕН: был ${c.current}, стал ${d.current}`);

await ctx.close();
// Свежий контекст = свежее хранилище: слот обязан быть пуст.
const ctx2 = await b.newContext({ viewport:{width:1440,height:900} });
const q = await ctx2.newPage();
await q.goto(`${BASE}/editor.html`,{waitUntil:'load'});
await q.waitForFunction(()=>document.documentElement.dataset.ready==='1',null,{timeout:30000});
const e = await q.evaluate(()=>{
  const c=document.querySelector('.ed-slide-strip-counter');
  const m=c?c.textContent.trim().match(/(\d+)\s*\/\s*(\d+)/):null;
  return m?+m[2]:null;
});
console.log(`\nсвежий контекст (чистое хранилище): слайдов ${e}  — ${e===a.total?'умолчание, слот не протёк':'ВНИМАНИЕ: состояние протекло'}`);
await ctx2.close();
console.log('ошибки страницы:', errs.length?errs.join(' | '):0);
await b.close();
