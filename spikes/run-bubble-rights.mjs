// S17: ПРАВА ЗРИТЕЛЯ НА КАПЛЮ — два физических утверждения, на которых стоит ADR-032.
//
// Оба сегодня догадки, и обе правдоподобны — то есть ровно тот класс, который
// в этом проекте уже трижды обходился дорого (квота localStorage, плавность
// anime.js, border-radius в процентах).
//
// ЗАМЕР 1. Инвариант №3 гасит указатель ВСЕЙ сцене (`player.ts`,
// `stage.style.pointerEvents = 'none'`). Отрезки «моё» требуют вернуть
// указатель ОДНОМУ элементу и только вне отрезка. Вопрос: возвращает ли
// `pointer-events: auto` на потомке попадания ему одному — и не протекает ли
// при этом интерактив на соседей. Замерено и `elementFromPoint`, и НАСТОЯЩИМИ
// щелчками мыши: проверка «вызвался ли обработчик» в этом проекте уже
// оказывалась зелёной на неработающей кнопке.
//
// Отдельным пунктом — кнопка ВНУТРИ капли. В памяти проекта записано, что
// `setPointerCapture` на сцене съедает последующий `click` у кнопок внутри
// холста, без ошибки и без предупреждения.
//
// ЗАМЕР 2. Голос живёт ВНУТРИ того же mp4, что и картинка (решение Сессии 37).
// Значит «свернуть каплю» обязано быть только про картинку. `bubble.md` §4
// требует проверить замером, а не считать известным, продолжается ли
// воспроизведение у спрятанного видео.
//
// Тихий дефект здесь такой: «свёрнуто» показывает true, всё зелено,
// а зритель сидит в тишине.
//
// ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ ОБЯЗАТЕЛЕН. «Звука нет» и «прибор молчит» выглядят
// одинаково — 16.08.2026 эта же ошибка чуть не дала вывод о Loom, когда
// на самом деле у окна браузера была нулевая область просмотра. Поэтому
// уровень звука меряется СНАЧАЛА на полностью видимом видео, и способ
// «узел вынут из DOM» стоит в списке нарочно: он обязан звук потерять.
//
// Запуск (сервера не нужно, файл фикстуры весит 20 КБ и едет в страницу):
//   node spikes/run-bubble-rights.mjs [--headless]

import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VIDEO = resolve(ROOT, 'apps/playground/public/video/talking-head.mp4');

// headless: false по умолчанию. Меряется ВОСПРОИЗВЕДЕНИЕ, а не раскладка,
// и 16.08.2026 уже измерено, что в скрытой вкладке медиа не грузится вовсе:
// readyState держится на 0 при целой сети и поддержанном кодеке.
const HEADLESS = process.argv.includes('--headless');

// Сколько держим каждый способ сокрытия. 1200 мс — не меньше секунды,
// чтобы прирост currentTime был заметно больше дрожания таймера,
// и не больше, чтобы двадцать замеров не растянулись на минуту.
const HOLD_MS = 1200;

const browser = await chromium.launch({
  headless: HEADLESS,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

// ───────────────────────── ЗАМЕР 1: указатель ─────────────────────────

await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; }
  /* Ровно то, что делает плеер вне гейта: указатель снят со ВСЕЙ сцены. */
  #stage { position: relative; width: 900px; height: 600px; pointer-events: none; }
  #bubble { position: absolute; left: 40px;  top: 40px; width: 200px; height: 200px;
            border-radius: 50%; background: #4c8dff; }
  #plain  { position: absolute; left: 400px; top: 40px; width: 200px; height: 200px;
            background: #888; }
  /* Кнопка зрителя живёт ВНУТРИ капли — так же, как будет в продукте. */
  #collapse { position: absolute; right: 8px; bottom: 8px; width: 44px; height: 44px; }
</style>
<div id="stage">
  <div id="bubble"><button id="collapse">×</button></div>
  <div id="plain"></div>
</div>
<script>
  window.__hits = [];
  for (const id of ['stage', 'bubble', 'plain', 'collapse']) {
    document.getElementById(id).addEventListener('click', () => window.__hits.push(id));
  }
  document.body.addEventListener('click', (e) => {
    if (e.target === document.body) window.__hits.push('body');
  });
  window.__at = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? (el.id || el.tagName.toLowerCase()) : null;
  };
  window.__setBubblePointer = (value) => {
    document.getElementById('bubble').style.pointerEvents = value;
  };
</script>`);

/** Точки, по которым бьём: центр капли, центр соседа, центр кнопки внутри капли. */
const POINTS = await page.evaluate(() => {
  const c = (id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  };
  return { bubble: c('bubble'), plain: c('plain'), collapse: c('collapse') };
});

/**
 * Один случай: выставили каплю в заданный режим и постучали по трём точкам.
 *
 * Меряется ДВУМЯ независимыми приборами, и это не перестраховка: в проекте
 * записан случай, когда `elementFromPoint` соврал в обе стороны, и случай,
 * когда обработчик вызывался, а кнопка не работала.
 */
async function pointerCase(mode) {
  await page.evaluate((m) => window.__setBubblePointer(m), mode);

  const seen = {};
  for (const [name, pt] of Object.entries(POINTS)) {
    seen[name] = await page.evaluate(({ x, y }) => window.__at(x, y), pt);
  }

  await page.evaluate(() => { window.__hits = []; });
  for (const pt of Object.values(POINTS)) await page.mouse.click(pt.x, pt.y);
  const hits = await page.evaluate(() => window.__hits.slice());

  return { mode, elementFromPoint: seen, clickHits: hits };
}

const pointer = {
  // Контроль: капля наследует мёртвый указатель сцены. Обязана быть недостижима.
  inherited: await pointerCase(''),
  // Предмет: указатель возвращён ОДНОЙ капле.
  auto: await pointerCase('auto'),
};

// ───────────────────────── ЗАМЕР 2: звук при сокрытии ─────────────────────────

const videoBytes = await readFile(VIDEO);
const videoB64 = videoBytes.toString('base64');

/**
 * Поднять видео на пустой странице. `tap` — вешать ли отвод на аудиограф.
 *
 * Отвод ставится под вопрос нарочно. `createMediaElementSource` не
 * подслушивает выход элемента, а ПЕРЕХВАТЫВАЕТ его: звук уходит в граф вместо
 * устройства. Если выводить некуда, браузер вправе перестать декодировать —
 * и тогда «звука нет» означало бы «я сломал звук измерением».
 */
async function setUpVideo(b64, tap) {
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.evaluate(async ({ b64, tap }) => {
  const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bin], { type: 'video/mp4' }));

  const video = document.createElement('video');
  video.src = url;
  video.loop = true;          // чтобы двадцать замеров не упёрлись в конец файла
  video.playsInline = true;
  video.muted = false;        // ГЛАВНОЕ: звук не глушим, его и меряем
  video.style.width = '320px';
  document.body.appendChild(video);
  window.__video = video;

  await new Promise((res, rej) => {
    video.onloadedmetadata = res;
    video.onerror = () => rej(new Error('видео не загрузилось, код ' + (video.error && video.error.code)));
    setTimeout(() => rej(new Error('видео не загрузилось за 10 с')), 10000);
  });

    window.__rms = () => null;
    window.__ctx = null;

    if (tap) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(video);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      await ctx.resume();
      window.__ctx = ctx;

      // Среднеквадратичный уровень за окно опроса — «звук идёт», а не «флаг стоит».
      const buf = new Float32Array(analyser.fftSize);
      window.__rms = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const s of buf) sum += s * s;
        return Math.sqrt(sum / buf.length);
      };
    }

    await video.play();
  }, { b64, tap });

  return page.evaluate(() => {
    const v = window.__video;
    return {
      duration: +(v.duration || 0).toFixed(3),
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      // Ни один браузер не отдаёт список дорожек надёжно; счётчик
      // декодированных байт — отдаёт, и растёт он только когда звук ИДЁТ.
      audioDecodedBytes: v.webkitAudioDecodedByteCount ?? null,
      ctxState: window.__ctx ? window.__ctx.state : 'без отвода',
    };
  });
}

/**
 * Один способ спрятать: применили, подержали, посмотрели, что стало
 * со временем дорожки и с уровнем звука.
 *
 * Уровень берётся МЕДИАНОЙ нескольких опросов, а не одним: у речи есть паузы,
 * и один опрос, попавший в паузу, дал бы ноль на исправном звуке.
 */
async function hideCase(name, style) {
  const result = await page.evaluate(async ({ name, style, hold }) => {
    const v = window.__video;
    const detach = style === null;

    // Способ описан ДАННЫМИ, а не кодом: строка кода, влетающая в страницу,
    // это лишний способ ошибиться и лишняя дыра, а ничего сверх присваивания
    // стиля здесь не требуется.
    const before = {};
    if (detach) {
      window.__parent = v.parentNode;
      v.remove();
    } else {
      for (const [prop, value] of Object.entries(style)) {
        before[prop] = v.style[prop];
        v.style[prop] = value;
      }
    }

    const t0 = v.currentTime;
    const bytes0 = v.webkitAudioDecodedByteCount ?? null;
    const levels = [];
    const started = performance.now();
    while (performance.now() - started < hold) {
      const level = window.__rms();
      if (level !== null) levels.push(level);
      await new Promise((r) => setTimeout(r, 60));
    }
    const t1 = v.currentTime;
    const bytes1 = v.webkitAudioDecodedByteCount ?? null;
    const paused = v.paused;

    if (detach) {
      window.__parent.appendChild(v);
      await v.play().catch(() => {});
    } else {
      for (const [prop, value] of Object.entries(before)) v.style[prop] = value;
    }

    // Дорожка зациклена, поэтому разность времён на витке отрицательна.
    // Приводим к длине файла — иначе исправное воспроизведение выглядит
    // как откат назад (в первом прогоне это дало −6.762 на живом звуке).
    const span = v.duration || 0;
    let advanced = t1 - t0;
    if (advanced < 0 && span > 0) advanced += span;

    levels.sort((a, b) => a - b);
    return {
      name,
      timeAdvanced: +advanced.toFixed(3),
      wrapped: t1 < t0,
      paused,
      audioBytes: bytes0 === null || bytes1 === null ? null : bytes1 - bytes0,
      rmsMedian: levels.length ? +levels[Math.floor(levels.length / 2)].toFixed(5) : null,
      rmsMax: levels.length ? +levels[levels.length - 1].toFixed(5) : null,
      samples: levels.length,
    };
  }, { name, style, hold: HOLD_MS });

  // Между случаями даём звуку заново установиться — иначе следующий замер
  // унаследует хвост предыдущего.
  await page.waitForTimeout(200);
  return result;
}

/** Все способы сокрытия по одному разу. Первый и последний — контроли. */
async function runHiding() {
  const rows = [];
  // ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ — видео полностью видимо. Если здесь тихо,
  // сломан прибор, и остальные строки читать нельзя.
  rows.push(await hideCase('КОНТРОЛЬ: ничего не прячем', {}));
  rows.push(await hideCase('display: none', { display: 'none' }));
  rows.push(await hideCase('visibility: hidden', { visibility: 'hidden' }));
  rows.push(await hideCase('opacity: 0', { opacity: '0' }));
  rows.push(await hideCase('transform: scale(0)', { transform: 'scale(0)' }));
  rows.push(await hideCase('размер 0 × 0', { width: '0px', height: '0px' }));
  rows.push(await hideCase('увезли за край окна', { position: 'fixed', left: '-9999px' }));
  // ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ — узел вынут из документа. По спецификации HTML
  // воспроизведение обязано встать. Если не встанет, значит прибор не различает
  // состояния вовсе, и зелень остальных строк ничего не стоит.
  rows.push(await hideCase('КОНТРОЛЬ: узел вынут из DOM', null));
  return rows;
}

// Два прогона отличаются ТОЛЬКО отводом на аудиограф. Расхождение между ними
// и есть ответ на вопрос, не прибор ли глушит звук.
const withTap = { video: await setUpVideo(videoB64, true), hiding: await runHiding() };
const noTap = { video: await setUpVideo(videoB64, false), hiding: await runHiding() };

await browser.close();

// ───────────────────────── отчёт ─────────────────────────

const report = { measuredAt: new Date().toISOString(), headless: HEADLESS, pointer, withTap, noTap };

const outDir = resolve(HERE, 'results');
await mkdir(outDir, { recursive: true });
const outFile = resolve(outDir, 's17-bubble-rights.json');
await writeFile(outFile, JSON.stringify(report, null, 2), 'utf-8');

const line = (s) => console.log(s);

line('');
line('S17 · ЗАМЕР 1 — указатель одному элементу внутри мёртвой сцены');
line('');
for (const c of [pointer.inherited, pointer.auto]) {
  line(`  капля pointer-events: ${c.mode === '' ? '(наследует none)' : c.mode}`);
  line(`    elementFromPoint  капля=${c.elementFromPoint.bubble}  сосед=${c.elementFromPoint.plain}  кнопка=${c.elementFromPoint.collapse}`);
  line(`    щелчки дошли до   [${c.clickHits.join(', ') || '—'}]`);
}

for (const [title, run] of [['С ОТВОДОМ на аудиограф', withTap], ['БЕЗ ОТВОДА', noTap]]) {
  line('');
  line(`S17 · ЗАМЕР 2 — переживает ли звук сворачивание картинки · ${title}`);
  line('');
  line(`  файл: ${run.video.videoWidth}×${run.video.videoHeight}, ${run.video.duration} с, `
    + `звуковых байт на старте ${run.video.audioDecodedBytes}, контекст ${run.video.ctxState}`);
  line('');
  line('  способ                        Δ времени   пауза   Δ байт звука   RMS медиана');
  for (const h of run.hiding) {
    line(`  ${h.name.padEnd(28)}  ${String(h.timeAdvanced).padStart(8)}   `
      + `${String(h.paused).padStart(5)}   ${String(h.audioBytes).padStart(12)}   ${String(h.rmsMedian).padStart(11)}`);
  }
}
line('');
line(`Полный отчёт: ${outFile}`);
line('');
