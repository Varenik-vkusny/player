/**
 * S15. Что pptx-выгрузка Canva реально отдаёт — и что из этого доезжает.
 *
 * Спайк воспроизводит числа, на которых стоит ADR-031. Он НЕ входит
 * в `pnpm check`: одноразовая оснастка, запускается руками.
 *
 *     node spikes/run-pptx-import.mjs
 *
 * Материал — две фикстуры из репозитория, обе выгружены из настоящего
 * аккаунта Canva 15.08.2026:
 *
 *   canva-page-text.pptx   страница с текстом, шрифтами, группой и линиями
 *   canva-page-notes.pptx  страница с заметкой докладчика
 *
 * Эталон для сверки — сырой XML, прочитанный глазами, а не выдача самой
 * библиотеки: своим парсером свой формат не проверяется.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PptxHandler, EMU_PER_PX } from 'pptx-viewer-core';

const DIR = fileURLToPath(new URL('../fixtures/import/', import.meta.url));

/** Что прочитано в сыром XML глазами, до всякой библиотеки. */
const FROM_XML = {
  sldSz: { cx: 18288000, cy: 10287000 },
  background: 'F2F2F3',
  textBox2: { offX: 977903, offY: 758828, extCx: 17970503, extCy: 408184, sz: 1800, color: '416180', font: 'Barlow Condensed' },
  textBox3: { offX: 4438877, offY: 2320820, sz: 11909, color: '1D1F20', font: 'Barlow Condensed Bold' },
  group4: { offX: 952500, offY: 9477375 },
  note: 'КОНТРОЛЬ-ЗАМЕТКИ-40 проверка доезда в pptx',
};

async function load(name) {
  const bytes = readFileSync(DIR + name);
  const handler = new PptxHandler();
  const started = performance.now();
  const data = await handler.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return { data, handler, ms: performance.now() - started, bytes: bytes.byteLength };
}

const ok = (label, actual, expected) => {
  const good = actual === expected;
  console.log(`${good ? '  OK ' : '  ХХ '} ${label}: ${actual}${good ? '' : ` ≠ ${expected}`}`);
  return good;
};

let failures = 0;
const check = (label, actual, expected) => { if (!ok(label, actual, expected)) failures += 1; };

console.log('S15. Разбор pptx: сверка с сырым XML\n');

// --- 1. Единицы -------------------------------------------------------------
const text = await load('canva-page-text.pptx');
console.log(`1. ЕДИНИЦЫ (файл ${text.bytes} байт, разбор ${Math.round(text.ms)} мс)`);
check('EMU на пиксель', EMU_PER_PX, 9525);
check('ширина сцены', text.data.width, FROM_XML.sldSz.cx / 9525);
check('высота сцены', text.data.height, FROM_XML.sldSz.cy / 9525);
console.log(`  ${FROM_XML.sldSz.cx} EMU / 9525 = ${FROM_XML.sldSz.cx / 9525} px — множитель целый\n`);

// --- 2. Геометрия против XML ------------------------------------------------
const page = text.data.slides[0];
const el = (i) => page.elements[i];
console.log('2. ГЕОМЕТРИЯ (эталон — <a:off>/<a:ext> из сырого XML, делённые на 9525)');
const px = (emu) => Math.round(emu / 9525);
check('TextBox 2 x', el(0).x, px(FROM_XML.textBox2.offX));
check('TextBox 2 y', el(0).y, px(FROM_XML.textBox2.offY));
check('TextBox 2 ширина', el(0).width, px(FROM_XML.textBox2.extCx));
check('TextBox 2 высота', el(0).height, px(FROM_XML.textBox2.extCy));
check('TextBox 3 x', el(1).x, px(FROM_XML.textBox3.offX));
check('Group 4 x', el(2).x, px(FROM_XML.group4.offX));
check('Group 4 y', el(2).y, px(FROM_XML.group4.offY));
console.log('  Округление до целого пикселя: 977903/9525 = 102.667 → 103, потеря ≤ 0.5 px\n');

// --- 3. Оформление ----------------------------------------------------------
console.log('3. ОФОРМЛЕНИЕ');
check('фон страницы', page.backgroundColor, `#${FROM_XML.background}`);
check('цвет TextBox 2', el(0).textStyle.color, `#${FROM_XML.textBox2.color}`);
check('шрифт TextBox 2', el(0).textStyle.fontFamily, FROM_XML.textBox2.font);
// sz в OOXML — сотые доли пункта; библиотека отдаёт ПИКСЕЛИ (pt × 4/3).
check('кегль TextBox 2, px', el(0).textStyle.fontSize, (FROM_XML.textBox2.sz / 100) * (4 / 3));
check('жирность TextBox 3', el(1).textStyle.bold, true);
check('шрифт TextBox 3', el(1).textStyle.fontFamily, FROM_XML.textBox3.font);
console.log(`  Встроенные шрифты в файле: ${(text.data.embeddedFonts ?? []).length}`);
console.log(`  Предупреждений совместимости: ${text.handler.getCompatibilityWarnings().length}\n`);

// --- 4. Группы --------------------------------------------------------------
console.log('4. ГРУППЫ');
const kid = el(2).children?.[0];
check('детей у Group 4', el(2).children?.length ?? 0, 1);
check('координата ребёнка ЛОКАЛЬНАЯ, x', kid?.x, 0);
check('координата ребёнка ЛОКАЛЬНАЯ, y', kid?.y, 0);
console.log('  chOff/chExt разрешает сама библиотека — как наша модель групп (v11)\n');

// --- 5. Заметки докладчика --------------------------------------------------
console.log('5. ЗАМЕТКИ ДОКЛАДЧИКА');
const notes = await load('canva-page-notes.pptx');
check('заметок на странице без них', (page.notes ?? '').length, 0);
check('заметка доезжает дословно', notes.data.slides[0].notes?.trim(), FROM_XML.note);
console.log('  Положительный контроль: заметка вписана в Canva рукой 15.08.2026\n');

// --- Итог -------------------------------------------------------------------
console.log(failures === 0
  ? 'ВСЁ СОШЛОСЬ. Ни одно утверждение ADR-031 не разошлось с прогоном.'
  : `РАСХОЖДЕНИЙ: ${failures}. Числа ADR-031 больше не описывают реальность.`);
process.exit(failures === 0 ? 0 : 1);
