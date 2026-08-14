// S14: можно ли выразить СТИЛЬ (пресет элемента) правилом класса так,
// чтобы каскад браузера сам дал три обязательных условия из
// docs/design/styles.md §3 — живую связь, отцепление ПО СВОЙСТВУ
// и возврат «как в стиле».
//
// Головной вопрос не «работает ли CSS». Он в том, не придётся ли писать
// ВТОРУЮ машинерию каскада: styles.md §9 это прямо запрещает, а тема уже
// несёт свою. Если инлайн (то, что плеер пишет из `ElementState.style`)
// перекрывает правило класса ПОКОМПОНЕНТНО, то отцепление по свойству —
// не механизм, который надо писать, а поведение браузера.
//
// Отдельно перемеряется ловушка S11. Она была снята на ИНЛАЙНЕ
// (`setProperty` на элементе), а стиль будет жить в ПРАВИЛЕ КЛАССА —
// другое место каскада. Считать перенос очевидным нельзя: ровно такие
// переносы в этом проекте уже врали.
//
// headless: true намеренно, как в S11: меряется разбор значений CSSOM,
// а он от видимости окна не зависит. Сервер спайков НЕ нужен —
// страница задаётся через setContent, порт 5179/5180 не трогается.
//
// Запуск:
//   node spikes/run-styles-cascade.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const N_BULK = 200; // сколько элементов под одним стилем — для замера цены

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">

<!-- БАЗОВЫЕ правила сцены: то, что плеер кладёт сам.
     Специфичность у них ровно такая же, как у правила стиля (один класс),
     поэтому исход решает ПОРЯДОК, а не вес. -->
<style id="base">
  .pl-el { font-size: 16px; color: rgb(10, 10, 10); border-radius: 0px; }
</style>

<!-- Лист СТИЛЕЙ: сюда пишутся пресеты элемента. Вставлен ПОСЛЕ базового. -->
<style id="styles">
  .st-heading { font-size: 40px; color: rgb(200, 30, 30); border-radius: 8px; }
  .st-token   { color: var(--scene-accent, #4c8dff); }
  .st-notoken { color: var(--scene-nonexistent); }
</style>

</head><body>
  <!-- А: под стилем, без единой ручной правки -->
  <div id="a" class="pl-el st-heading">А</div>

  <!-- Б: под тем же стилем, но кегль правлен рукой (инлайн) -->
  <div id="b" class="pl-el st-heading" style="font-size: 72px">Б</div>

  <!-- В: ссылка на роль С запасом, роль на предке НЕ объявлена -->
  <div id="v" class="pl-el st-token">В</div>

  <!-- Г: ссылка на роль БЕЗ запаса, роль на предке НЕ объявлена -->
  <div id="g" class="pl-el st-notoken">Г</div>

  <!-- Д: только базовое правило сцены, без стиля — эталон сравнения -->
  <div id="d" class="pl-el">Д</div>

  <div id="bulk"></div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => { console.error('ОШИБКА СТРАНИЦЫ:', e.message); throw e; });
page.on('console', (m) => { if (m.type() === 'error') console.error(`[страница] ${m.text()}`); });

await page.setContent(PAGE, { waitUntil: 'load' });

const result = await page.evaluate((nBulk) => {
  const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop);
  const $ = (id) => document.getElementById(id);
  const styleSheet = () => [...document.styleSheets].find((s) => s.ownerNode.id === 'styles');
  const ruleOf = (selector) =>
    [...styleSheet().cssRules].find((r) => r.selectorText === selector);

  const out = {};

  // ── 1. Инлайн против правила класса: покомпонентно или целиком?
  out.override = {
    aFont: css($('a'), 'font-size'),        // ждём 40px — стиль
    bFont: css($('b'), 'font-size'),        // ждём 72px — рука сильнее
    bColor: css($('b'), 'color'),           // ждём цвет СТИЛЯ: правка кегля
    bRadius: css($('b'), 'border-radius'),  // не должна отцепить остальное
    aColor: css($('a'), 'color'),
  };

  // ── 2. Живая связь: ОДНА запись в правило — и меняются все, кто не отцеплен
  const rule = ruleOf('.st-heading');
  rule.style.setProperty('font-size', '90px');
  rule.style.setProperty('color', 'rgb(0, 128, 0)');
  out.live = {
    aFontAfter: css($('a'), 'font-size'),   // ждём 90px — поехал за стилем
    bFontAfter: css($('b'), 'font-size'),   // ждём 72px — отцеплен, устоял
    aColorAfter: css($('a'), 'color'),
    bColorAfter: css($('b'), 'color'),      // ждём зелёный: цвет НЕ отцеплялся
    writes: 1,
  };

  // ── 3. «Вернуть как в стиле» = снять ключ, а не вписать значение стиля
  $('b').style.removeProperty('font-size');
  out.revert = {
    bFontAfterRevert: css($('b'), 'font-size'),           // ждём 90px
    bInlineLeftover: $('b').getAttribute('style') || '',  // ждём пусто
  };

  // ── 4. Ловушка S11 в НОВОМ месте — не в инлайне, а в правиле класса
  // ВНИМАНИЕ, поправка первого прогона: неудачная подстановка var() НЕ выбрасывает
  // объявление из каскада. Объявление ВЫИГРЫВАЕТ и вычисляется в «унаследованное»,
  // поэтому базовое правило `.pl-el` элемент не спасает. Меряем оба числа сразу.
  out.token = {
    withFallback: css($('v'), 'color'),      // ждём rgb(76, 141, 255)
    withoutFallback: css($('g'), 'color'),   // ждём УНАСЛЕДОВАННОЕ от body, а не базовое
    baseColor: css($('d'), 'color'),         // что даёт базовое правило само по себе
    inheritedByDefault: css(document.body, 'color'),
  };
  // и с объявленной ролью на предке — та же ссылка обязана взять её
  document.documentElement.style.setProperty('--scene-accent', 'rgb(255, 0, 0)');
  out.token.afterRoleDeclared = css($('v'), 'color');     // ждём rgb(255, 0, 0)
  document.documentElement.style.removeProperty('--scene-accent');

  // ── 5. ПОРЯДОК ЛИСТОВ: при равной специфичности решает последний.
  // Это тихий слом: лист стилей, вставленный раньше базовых правил плеера,
  // перестаёт действовать, и ни ошибки, ни предупреждения не будет.
  // Проверка ДВУСТОРОННЯЯ. Односторонняя тут ничего не значила бы: если лист
  // проигрывает и стоя раньше, и стоя позже, дело не в порядке, а в чём-то ещё.
  const mkSheet = (id, text, where) => {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = text;
    if (where === 'first') document.head.insertBefore(el, document.head.firstChild);
    else document.head.appendChild(el);
    return el;
  };
  const early = mkSheet('probe-early', '.st-heading { font-size: 11px; }', 'first');
  out.order = { withEarlySheet: css($('a'), 'font-size') };   // ждём 90px — ранний проиграл
  const late = mkSheet('probe-late', '.st-heading { font-size: 12px; }', 'last');
  out.order.withLateSheet = css($('a'), 'font-size');         // ждём 12px — поздний выиграл
  early.remove();
  late.remove();
  out.order.restored = css($('a'), 'font-size');              // ждём 90px обратно
  out.order.earlySays = '11px';
  out.order.lateSays = '12px';

  // ── 5а. ДВЕ СЦЕНЫ НА ОДНОЙ СТРАНИЦЕ.
  // Лист стилей глобален для документа, где бы ни стоял тег <style>. Значит
  // два разных проекта с одинаковым идентификатором стиля подменят правила
  // друг друга МОЛЧА. Проверяем, лечится ли это приставкой контейнера
  // и не перебивает ли выросшая специфичность ручную правку (инлайн).
  const mkScene = (uid, size) => {
    const host = document.createElement('div');
    host.setAttribute('data-scene', uid);
    const el = document.createElement('div');
    el.className = 'pl-el st-shared';
    host.appendChild(el);
    document.body.appendChild(host);
    const sheet = document.createElement('style');
    sheet.textContent = `[data-scene="${uid}"] .st-shared { font-size: ${size}; }`;
    document.head.appendChild(sheet);
    return el;
  };
  const one = mkScene('scene-1', '21px');
  const two = mkScene('scene-2', '22px');
  out.scope = {
    first: css(one, 'font-size'),   // ждём 21px
    second: css(two, 'font-size'),  // ждём 22px — сцены не смешались
  };
  // ручная правка обязана остаться сильнее приставки контейнера
  two.style.setProperty('font-size', '77px');
  out.scope.secondAfterInline = css(two, 'font-size'); // ждём 77px

  // ── 6. Цена: одна запись против обхода N элементов
  const bulk = $('bulk');
  for (let i = 0; i < nBulk; i++) {
    const d = document.createElement('div');
    d.className = 'pl-el st-heading';
    d.textContent = String(i);
    bulk.appendChild(d);
  }
  bulk.getBoundingClientRect(); // принудительная раскладка до замера

  const t0 = performance.now();
  rule.style.setProperty('font-size', '31px');
  bulk.lastElementChild.getBoundingClientRect(); // дождаться пересчёта
  const tRule = performance.now() - t0;

  const t1 = performance.now();
  for (const d of bulk.children) d.style.setProperty('font-size', '32px');
  bulk.lastElementChild.getBoundingClientRect();
  const tEach = performance.now() - t1;

  out.cost = {
    n: nBulk,
    oneRuleMs: Math.round(tRule * 100) / 100,
    perElementMs: Math.round(tEach * 100) / 100,
    bulkFontAfterRule: css(bulk.firstElementChild, 'font-size'),
  };

  return out;
}, N_BULK);

console.log(JSON.stringify(result, null, 2));

// Разбор вслух: спайк обязан отвечать выводом, а не оставлять числа
// на толкование читателю.
const verdict = [];

verdict.push(
  result.override.bFont === '72px' && result.override.bColor === 'rgb(200, 30, 30)'
    ? 'ОТЦЕПЛЕНИЕ ПО СВОЙСТВУ ДАЁТ БРАУЗЕР: правка кегля инлайном перекрыла только кегль '
      + `(${result.override.bFont}), цвет и скругление остались стилевыми `
      + `(${result.override.bColor}, ${result.override.bRadius}). Механизм писать не надо`
    : `НЕТ: кегль ${result.override.bFont}, цвет ${result.override.bColor} — покомпонентного перекрытия нет`,
);

verdict.push(
  result.live.aFontAfter === '90px' && result.live.bFontAfter === '72px'
    ? 'ЖИВАЯ СВЯЗЬ ОДНОЙ ЗАПИСЬЮ: правка правила увела непотревоженный элемент на '
      + `${result.live.aFontAfter}, а отцепленный устоял на ${result.live.bFontAfter}. `
      + `Цвет отцепленного при этом поехал (${result.live.bColorAfter}) — отцепление именно по свойству`
    : `ЖИВАЯ СВЯЗЬ НЕ ТАКАЯ: непотревоженный ${result.live.aFontAfter}, отцепленный ${result.live.bFontAfter}`,
);

verdict.push(
  result.revert.bFontAfterRevert === '90px' && result.revert.bInlineLeftover === ''
    ? '«ВЕРНУТЬ КАК В СТИЛЕ» = СНЯТЬ КЛЮЧ: после удаления инлайна элемент встал на '
      + `${result.revert.bFontAfterRevert} — текущее значение стиля, а не то, что было при отцеплении`
    : `ВОЗВРАТ НЕ РАБОТАЕТ так: ${result.revert.bFontAfterRevert}, остаток инлайна «${result.revert.bInlineLeftover}»`,
);

verdict.push(
  result.token.withFallback === 'rgb(76, 141, 255)'
    && result.token.afterRoleDeclared === 'rgb(255, 0, 0)'
    ? 'ЛОВУШКА S11 ЖИВЁТ И В ПРАВИЛЕ КЛАССА: с запасом '
      + `${result.token.withFallback}, с объявленной ролью ${result.token.afterRoleDeclared}. `
      + `БЕЗ ЗАПАСА элемент даёт ${result.token.withoutFallback} — это УНАСЛЕДОВАННОЕ `
      + `(${result.token.inheritedByDefault}), а НЕ базовое правило сцены `
      + `(${result.token.baseColor}): неудачная подстановка var() не выбрасывает объявление `
      + 'из каскада, а вычисляет его в «унаследованное». Базовое оформление плеера сироту НЕ спасает'
    : `ПОВЕДЕНИЕ ТОКЕНА В ПРАВИЛЕ ИНОЕ: ${JSON.stringify(result.token)}`,
);

verdict.push(
  result.order.withEarlySheet === '90px'
    && result.order.withLateSheet === result.order.lateSays
    && result.order.restored === '90px'
    ? 'ПОРЯДОК ЛИСТОВ РЕШАЕТ, проверено в ОБЕ стороны: тот же селектор из листа, вставленного '
      + `РАНЬШЕ, проиграл (${result.order.withEarlySheet} вместо ${result.order.earlySays}), `
      + `а из вставленного ПОЗЖЕ — выиграл (${result.order.withLateSheet}). `
      + 'Лист стилей ОБЯЗАН стоять после базовых правил сцены, иначе стили молча не действуют'
    : `ПОРЯДОК ВЕДЁТ СЕБЯ ИНАЧЕ: ${JSON.stringify(result.order)}`,
);

verdict.push(
  result.scope.first === '21px'
    && result.scope.second === '22px'
    && result.scope.secondAfterInline === '77px'
    ? 'ДВЕ СЦЕНЫ НА СТРАНИЦЕ РАЗВОДЯТСЯ ПРИСТАВКОЙ КОНТЕЙНЕРА: один и тот же '
      + `идентификатор стиля дал ${result.scope.first} в первой сцене и ${result.scope.second} `
      + `во второй — правила не подменили друг друга. Ручная правка осталась сильнее `
      + `выросшей специфичности (${result.scope.secondAfterInline})`
    : `СЦЕНЫ СМЕШАЛИСЬ ИЛИ ПРИСТАВКА ПЕРЕБИЛА ИНЛАЙН: ${JSON.stringify(result.scope)}`,
);

verdict.push(
  `ЦЕНА на ${result.cost.n} элементах: одна запись в правило ${result.cost.oneRuleMs} мс `
  + `против обхода по элементам ${result.cost.perElementMs} мс`,
);

console.log('\n' + verdict.map((line) => '  · ' + line).join('\n'));

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./results/s14-styles-cascade.json', import.meta.url),
  JSON.stringify({ result, verdict }, null, 2),
);
console.log('\nРезультат записан: spikes/results/s14-styles-cascade.json');

await browser.close();
