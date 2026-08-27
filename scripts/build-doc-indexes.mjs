/**
 * Собирает указатели документации ИЗ САМИХ ФАЙЛОВ: docs/adr, docs/journal,
 * docs/plans, docs/specs.
 *
 * Зачем скриптом, а не руками. Указатель, написанный руками, расходится
 * с каталогом на первом же добавлении и делает это МОЛЧА: файл на месте,
 * ссылка на месте, просто одной строки не хватает. В этом проекте так уже
 * было — таблица решений в docs/README.md оборвалась на ADR-031, когда
 * на диске лежало 36 штук, и это прожило несколько сессий.
 *
 * Запуск:  node scripts/build-doc-indexes.mjs
 * Проверка (ничего не пишет, падает при расхождении):
 *          node scripts/build-doc-indexes.mjs --check
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CHECK = process.argv.includes('--check');

const gitDate = (f) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', f], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
};

/** Заголовок и дата из шапки файла; дата коммита — только если своей нет. */
function meta(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const title = (lines.find((l) => l.startsWith('# ')) ?? '')
    .replace(/^#\s*(ADR-\d+[.:]?\s*)?/, '')
    .trim();
  let date = '';
  let status = '';
  for (const l of lines.slice(0, 25)) {
    if (!date) {
      const ru = l.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      const iso = l.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (ru) date = `${ru[3]}-${ru[2]}-${ru[1]}`;
      else if (iso) date = iso[0];
    }
    if (!status) {
      const m = l.match(/^\**\s*Статус\**\s*[:—-]\s*(.+)$/i);
      if (m) status = m[1].replace(/\*/g, '').trim();
    }
  }
  return { title, date: date || gitDate(file), status };
}

const listMd = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();

const cell = (s) => (s || '').replace(/\|/g, '/').replace(/`/g, '');

function rowsFor(dir) {
  return listMd(dir).map((f) => ({ f, ...meta(join(dir, f)) }));
}

/** Номер сессии из имени: session-58-journal.md -> 58. */
const sessionNo = (f) => {
  const m = f.match(/session-?(\d+)/);
  return m ? Number(m[1]) : null;
};

const build = {
  'docs/journal': () => {
    const rows = rowsFor('docs/journal')
      .map((r) => ({ ...r, num: sessionNo(r.f) }))
      .sort((a, b) => (a.num ?? 9999) - (b.num ?? 9999) || a.f.localeCompare(b.f));
    let out = `# Журналы сессий

Журнал сессии — файл, куда находка попадает **в момент находки**: что нашли,
почему это важно, чем доказано. Он пишется по ходу работы, а не после неё,
и потому переживает то, что память теряет первым.

Это **летопись**: каждая запись верна на свою дату и не переписывается
задним числом. Текущее устройство проекта смотрят не здесь, а в
[../architecture.md](../architecture.md); что не доделано — в
[../debt.md](../debt.md).

Всего записей: **${rows.length}**. Ряд неполный — журнал вели не каждую
сессию, и пропуски в нумерации это показывают честно.

Указатель собран скриптом \`scripts/build-doc-indexes.mjs\` из самих файлов.
Руками не править: правка потеряется при следующей сборке.

| сессия | дата | о чём |
|---|---|---|
`;
    for (const r of rows) {
      out += `| ${r.num ?? '—'} | ${r.date || '—'} | [${cell(r.title) || r.f}](${r.f}) |\n`;
    }
    return out;
  },

  'docs/plans': () => {
    const rows = rowsFor('docs/plans').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    let out = `# Планы работ

План пишется ДО кода: что делаем, в каком порядке, чем докажем, что сделано.
После работы план не переписывают — что получилось на самом деле, пишут
в [журнал сессии](../journal/).

Поэтому здесь **исторические документы**: их читают, чтобы понять, почему
сделано именно так, а не чтобы узнать текущее состояние.

Всего планов: **${rows.length}**. Собраны 28.08.2026 из четырёх мест сразу:
корневого \`plans/\`, \`docs/plans/\`, \`docs/superpowers/plans/\` и россыпи
\`docs/session-N-plan.md\` в корне документации.

Указатель собран скриптом \`scripts/build-doc-indexes.mjs\`. Руками не править.

| дата | план |
|---|---|
`;
    for (const r of rows) out += `| ${r.date || '—'} | [${cell(r.title) || r.f}](${r.f}) |\n`;
    return out;
  },

  'docs/specs': () => {
    const rows = rowsFor('docs/specs').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    let out = `# Спецификации

Спецификация — подробное описание устройства куска работы, к которому потом
писали код. План отвечает «в каком порядке», спецификация — «как именно
устроено».

Документы исторические: верны на свою дату. Сегодняшнее устройство —
[../architecture.md](../architecture.md).

Указатель собран скриптом \`scripts/build-doc-indexes.mjs\`. Руками не править.

| дата | спецификация |
|---|---|
`;
    for (const r of rows) out += `| ${r.date || '—'} | [${cell(r.title) || r.f}](${r.f}) |\n`;
    return out;
  },

  'docs/adr': () => {
    const rows = rowsFor('docs/adr').filter((r) => /^ADR-\d+/.test(r.f));
    const last = rows[rows.length - 1].f.match(/ADR-(\d+)/)[1];
    let out = `# Решения (ADR)

ADR — записанное решение: что выбрали, из чего выбирали и **почему**.
Решение не отменяют молча: его отменяет или уточняет другой ADR, и тогда
это сказано в обоих.

Всего решений: **${rows.length}** (ADR-001 … ADR-${last}).

Указатель собран скриптом \`scripts/build-doc-indexes.mjs\` из самих файлов —
значит он не разойдётся с каталогом при следующем добавлении. Руками не править.

| № | решение | дата | статус |
|---|---|---|---|
`;
    for (const r of rows) {
      const num = r.f.match(/ADR-(\d+)/)[1];
      const st = r.status
        ? cell(r.status.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')).slice(0, 70)
        : '—';
      out += `| [${num}](${r.f}) | ${cell(r.title)} | ${r.date} | ${st} |\n`;
    }
    const noStatus = rows.filter((r) => !r.status).map((r) => r.f.match(/ADR-(\d+)/)[1]);
    out += `
## Что стоит знать про этот список

**У ${noStatus.length} ADR нет строки статуса в шапке** — ${noStatus.join(', ')}.
Все они действуют; строка просто не проставлена. Сегодня это безвредно,
а завтра станет опасно: отменённый ADR без строки статуса выглядит точно
так же, как действующий.

**ADR-016 частично отменён ADR-020** — раздел «Длительность». Оба файла
говорят об этом честно, каждый со своей стороны.

**ADR-031 (импорт pptx) описывает последствия, которые изменились.**
Само решение — брать \`pptx-viewer-core\` — осталось верным, но раздел
«Что срезано вслух» устарел: с Сессии 58 картинки приезжают байтами,
а не пустой рамкой. В файле стоит датированная поправка.
`;
    return out;
  },
};

let bad = 0;
for (const [dir, make] of Object.entries(build)) {
  const target = join(dir, 'README.md');
  const next = make();
  const prev = (() => {
    try {
      return readFileSync(target, 'utf8');
    } catch {
      return null;
    }
  })();
  if (CHECK) {
    if (prev !== next) {
      console.error(`РАСХОЖДЕНИЕ: ${target} не совпадает с каталогом`);
      bad += 1;
    }
  } else if (prev !== next) {
    writeFileSync(target, next);
    console.log(`обновлён ${target}`);
  } else {
    console.log(`без изменений ${target}`);
  }
}
if (CHECK && bad > 0) {
  console.error(`\nУказатели отстали от каталогов: ${bad}. Запусти без --check.`);
  process.exit(1);
}
if (CHECK) console.log('указатели совпадают с каталогами');
