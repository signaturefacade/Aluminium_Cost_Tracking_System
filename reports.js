/* ===================== REPORTS =====================
 * 1. Client project report  - per project: details, progress, scope of works (with progress remarks), payments.
 *    Costs, materials and margins are deliberately NOT shown in this report.
 * 2. Management summary     - all projects undertaken, cost and profit/loss analysis.
 * Both can be previewed here, downloaded as PDF, and shared (where the device supports it).
 * PDFs are built in the browser with pdf-lib (lib/pdf-lib.min.js, loaded on first use).
 * Uses globals from app.js: D, calc, prog, tile, money, kes, esc, N, $, today, toast, errMsg, render.
 */
let RPT = { tab: 'client', pid: '', st: 'und', from: '', to: '' };

const INK = [23, 34, 45], RED = [229, 56, 79], BLUE = [31, 127, 176], MUT = [107, 120, 133], OKC = [27, 109, 73], BADC = [195, 30, 55], LINE = [221, 227, 232], SOFT = [242, 245, 247];
const fdate = s => { if (!s) return ''; const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const nowStr = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const qtyS = n => String(Math.round(n * 100) / 100);
const pct1 = n => (Math.round(n * 10) / 10).toFixed(1) + '%';
const ST_LABEL = { und: 'Projects undertaken (excluding quotes)', all: 'All projects', Active: 'Active only', Completed: 'Completed only', 'On Hold': 'On hold only', Quoted: 'Quoted only' };

/* ---------- data ---------- */
function cData(p) {
  const c = calc(p);
  const scope = (D.scope || []).filter(x => x.ProjectID === p.ID);
  const seen = {}, sum = [];
  scope.forEach(x => { const raw = String(x.Type || 'Other').trim() || 'Other', k = raw.toLowerCase(); if (!seen[k]) { seen[k] = { type: raw, qty: 0 }; sum.push(seen[k]); } seen[k].qty += N(x.Qty); });
  const pay = D.payments.filter(x => x.ProjectID === p.ID).slice().sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
  return { p, c, pr: prog(p), scope, sum, pay };
}

function mData() {
  let P = D.projects.filter(p => RPT.st === 'und' ? p.Status !== 'Quoted' : RPT.st === 'all' ? true : p.Status === RPT.st);
  if (RPT.from) P = P.filter(p => p.StartDate && String(p.StartDate) >= RPT.from);
  if (RPT.to) P = P.filter(p => p.StartDate && String(p.StartDate) <= RPT.to);
  const rows = P.map(p => {
    const c = calc(p), done = p.Status === 'Completed', started = p.Status !== 'Quoted';
    const cost = c.fc, profit = c.q - cost;   // actual where recorded (Active or Completed), otherwise planned.
    const basis = started ? (c.act > 0 ? (done ? 'final' : 'actual + planned') : 'planned') : '';
    const out = !started ? 'Not started' : !c.q ? 'No price' : profit > 0 ? 'Profit' : profit < 0 ? 'Loss' : 'Break-even';
    return { p, c, done, started, pr: prog(p), cost, profit, pct: c.q ? profit / c.q * 100 : 0, basis, out, cls: out === 'Profit' ? 'ok' : out === 'Loss' ? 'bad' : 'neu' };
  });
  const R = rows.filter(r => r.started), sum = f => R.reduce((a, r) => a + f(r), 0);
  const C = R.filter(r => r.done), csum = f => C.reduce((a, r) => a + f(r), 0);   // planned vs actual by category is shown for completed projects only
  const cats = D.cats.slice(); C.forEach(r => Object.keys(r.c.by).forEach(k => { if (!cats.includes(k)) cats.push(k); }));
  const catRows = cats.map(k => ({ k, plan: csum(r => r.c.by[k] ? r.c.by[k].plan : 0), act: csum(r => r.c.by[k] ? r.c.by[k].act : 0) })).filter(x => x.plan || x.act);
  const T = { n: R.length, q: sum(r => r.c.q), plan: sum(r => r.c.plan), act: sum(r => r.c.act), cost: sum(r => r.cost), profit: sum(r => r.profit), rec: sum(r => r.c.rec), bal: sum(r => r.c.bal),
    win: R.filter(r => r.out === 'Profit').length, loss: R.filter(r => r.out === 'Loss').length, even: R.filter(r => r.out === 'Break-even').length,
    actC: csum(r => r.c.act) };
  T.pct = T.q ? T.profit / T.q * 100 : 0;
  const desc = ST_LABEL[RPT.st] + (RPT.from || RPT.to ? ' | started ' + (RPT.from ? 'from ' + fdate(RPT.from) : '') + (RPT.from && RPT.to ? ' ' : '') + (RPT.to ? 'to ' + fdate(RPT.to) : '') : '');
  return { rows, T, catRows, desc };
}

/* ---------- on-screen views ---------- */
function vReports() {
  const t = RPT.tab;
  return `<h1>Reports</h1><div class="tabs noprint"><button class="${t === 'client' ? 'on' : ''}" onclick="rSet('tab','client')">Client project report</button><button class="${t === 'mgmt' ? 'on' : ''}" onclick="rSet('tab','mgmt')">Management summary</button></div>` + (t === 'client' ? vClient() : vMgmt());
}
function rSet(k, v) { RPT[k] = v; render(); }

function vClient() {
  if (!D.projects.length) return '<p class="muted">No projects yet. Create a project first.</p>';
  const p = D.projects.find(x => x.ID === RPT.pid);
  return `<div class="rtools noprint"><select onchange="rSet('pid',this.value)"><option value="">Choose a project...</option>${D.projects.map(x => `<option value="${esc(x.ID)}" ${x.ID === RPT.pid ? 'selected' : ''}>${esc(x.Name)} - ${esc(x.Client)}</option>`).join('')}</select>${p ? `<button class="primary" onclick="rPdf('client')">Download PDF</button>${navigator.share ? `<button onclick="rPdf('client',1)">Share</button>` : ''}` : ''}</div>`
    + (p ? `<p class="muted noprint">This is the client-facing version: it shows project details, progress, scope of works and payments. Costs, materials and profit margins are not included.</p>${cHtml(cData(p))}` : '<p class="muted">Choose a project to preview its client report.</p>');
}

function rHead(title, sub) {
  return `<div class="rh"><img src="${D.logo || 'icons/logo-original.png'}" alt="Signature Facade &amp; Windows Ltd"><div><h2>${title}</h2><small>${sub}</small></div></div>`;
}

function cHtml(d) {
  const { p, c } = d, kv = (k, v) => `<span>${k}</span><b>${esc(v) || '-'}</b>`;
  return `<div class="rpt">${rHead('Project Summary Report', 'Prepared ' + nowStr())}
<h3>Project details</h3><div class="kv">${kv('Project', p.Name)}${kv('Client', p.Client)}${kv('Location', p.Location)}${kv('Project type', p.Type)}${kv('Project ID', p.ID)}${kv('Status', p.Status)}${kv('Start date', fdate(p.StartDate))}${kv('Target completion', fdate(p.EndDate))}</div>
<h3>Progress</h3><div class="rprog"><div class="rbar"><i style="width:${d.pr}%"></i></div><b>${d.pr}% complete</b></div>
<h3>Scope of works</h3>${d.scope.length ? `<div class="chips">${d.sum.map(s => `<span class="tile"><small>${esc(s.type)}</small><b>${qtyS(s.qty)}</b></span>`).join('')}</div><div class="wrap"><table><tr><th>Item</th><th>Description</th><th class="n">Qty</th><th>Unit</th><th>Progress remarks</th></tr>${d.scope.map(x => `<tr><td>${esc(x.Type)}</td><td>${esc(x.Description)}</td><td class="n">${qtyS(N(x.Qty))}</td><td>${esc(x.Unit)}</td><td>${esc(x.Remarks) || '-'}</td></tr>`).join('')}</table></div>` : '<p class="muted">No scope items listed yet. Add them on the project page under Scope of works.</p>'}
<h3>Payment summary</h3><div class="kv">${kv('Contract value', kes(c.q))}${kv('Total received', kes(c.rec))}${kv('Balance due', kes(c.bal))}${kv('Paid so far', c.q ? pct1(c.rec / c.q * 100) : '-')}</div>
${d.pay.length ? `<div class="wrap"><table><tr><th>Date</th><th>Reference</th><th class="n">Amount (KES)</th></tr>${d.pay.map(x => `<tr><td>${esc(fdate(x.Date))}</td><td>${esc(x.Reference)}</td><td class="n">${money(N(x.Amount))}</td></tr>`).join('')}<tr class="cat"><td colspan="2">Total received</td><td class="n">${money(c.rec)}</td></tr></table></div>` : '<p class="muted">No payments received yet.</p>'}
<p class="muted" style="margin-top:18px">Figures are taken from Signature Facade & Windows Ltd project records as at ${nowStr()}.</p></div>`;
}

function vMgmt() {
  const m = mData(), T = m.T;
  const stSel = Object.keys(ST_LABEL).map(k => `<option value="${esc(k)}" ${RPT.st === k ? 'selected' : ''}>${esc(ST_LABEL[k])}</option>`).join('');
  const tiles = `<div class="tiles">${tile('Projects undertaken', T.n, T.win + ' profit / ' + T.loss + ' loss' + (T.even ? ' / ' + T.even + ' break-even' : ''))}${tile('Total quoted', kes(T.q))}${tile('Cost (planned / actual)', kes(T.cost), 'Actual recorded: ' + kes(T.act))}${tile('Profit / (loss)', `<span class="${T.profit < 0 ? 'neg' : ''}">${kes(T.profit)}</span>`, T.q ? pct1(T.pct) + ' of quoted' : '')}${tile('Received from clients', kes(T.rec))}${tile('Still owed by clients', kes(T.bal))}</div>`;
  const table = m.rows.length ? `<div class="wrap"><table><tr><th>Project</th><th>Status</th><th class="n">Progress</th><th class="n">Quoted</th><th class="n">Planned cost</th><th class="n">Actual cost</th><th class="n">Profit / (loss)</th><th class="n">Margin</th><th>Outcome</th><th class="n">Received</th><th class="n">Balance</th></tr>${m.rows.map(r => `<tr class="click" onclick="open_('${r.p.ID}')"><td><b>${esc(r.p.Name)}</b><small>${esc(r.p.Client)}</small></td><td>${esc(r.p.Status)}</td><td class="n">${r.pr}%</td><td class="n">${money(r.c.q)}</td><td class="n">${money(r.c.plan)}</td><td class="n">${r.c.act ? money(r.c.act) : '-'}</td><td class="n ${r.started && r.profit < 0 ? 'neg' : ''}">${r.started ? money(r.profit) : '-'}</td><td class="n">${r.started && r.c.q ? pct1(r.pct) : '-'}</td><td><span class="chip ${r.cls}">${r.out}</span>${r.basis ? `<small>${r.basis}</small>` : ''}</td><td class="n">${money(r.c.rec)}</td><td class="n">${money(r.c.bal)}</td></tr>`).join('')}<tr class="cat"><td colspan="3">Total (projects undertaken)</td><td class="n">${money(T.q)}</td><td class="n">${money(T.plan)}</td><td class="n">${money(T.act)}</td><td class="n">${money(T.profit)}</td><td class="n">${T.q ? pct1(T.pct) : '-'}</td><td></td><td class="n">${money(T.rec)}</td><td class="n">${money(T.bal)}</td></tr></table></div>` : '<p class="muted">No projects match these filters.</p>';
  const cats = m.catRows.length ? `<h2>Planned vs actual by category (completed projects)</h2><div class="wrap"><table><tr><th>Category</th><th class="n">Planned</th><th class="n">Actual</th><th class="n">Variance</th><th class="n">Share of actual</th></tr>${m.catRows.map(x => `<tr><td>${esc(x.k)}</td><td class="n">${money(x.plan)}</td><td class="n">${money(x.act)}</td><td class="n ${x.act > x.plan && x.act ? 'neg' : ''}">${x.act ? money(x.act - x.plan) : '-'}</td><td class="n">${T.actC ? pct1(x.act / T.actC * 100) : '-'}</td></tr>`).join('')}</table></div>` : '';
  return `<div class="rtools noprint"><select onchange="rSet('st',this.value)">${stSel}</select><label>Started from <input type="date" value="${esc(RPT.from)}" onchange="rSet('from',this.value)"></label><label>to <input type="date" value="${esc(RPT.to)}" onchange="rSet('to',this.value)"></label><button class="primary" onclick="rPdf('mgmt')">Download PDF</button>${navigator.share ? `<button onclick="rPdf('mgmt',1)">Share</button>` : ''}</div>
${tiles}<h2>Project performance</h2>${table}<p class="muted" style="margin-top:8px">Profit / (loss) = quoted price minus cost. Cost uses the actual figure on every cost line where actuals have been recorded (Active or Completed projects), otherwise the planned figure. On Hold projects use planned cost.</p>${cats}`;
}

/* ---------- PDF toolkit (pdf-lib) ---------- */
let _lib = null;
function pdfLib() {
  if (window.PDFLib) return Promise.resolve();
  return _lib || (_lib = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'lib/pdf-lib.min.js'; s.onload = ok; s.onerror = () => { _lib = null; no(new Error('Could not load the PDF library. Check your connection and try again.')); }; document.head.appendChild(s); }));
}
const rgbc = a => PDFLib.rgb(a[0] / 255, a[1] / 255, a[2] / 255);
const clean = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/\s+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?').trim();

async function pdfNew(land) {
  await pdfLib();
  const { PDFDocument, StandardFonts } = PDFLib, pdf = await PDFDocument.create();
  const g = { pdf, F: await pdf.embedFont(StandardFonts.Helvetica), B: await pdf.embedFont(StandardFonts.HelveticaBold), W: land ? 841.89 : 595.28, H: land ? 595.28 : 841.89, M: 40, y: 0, pg: null };
  g.cw = g.W - 2 * g.M; g.bottom = g.H - g.M - 8;
  g.page = () => { g.pg = pdf.addPage([g.W, g.H]); g.y = g.M; };
  g.page();
  return g;
}
function T(g, s, x, y, o) {
  o = o || {}; const f = o.b ? g.B : g.F, sz = o.sz || 9; s = clean(s);
  const w = f.widthOfTextAtSize(s, sz); if (o.al === 'r') x -= w; else if (o.al === 'c') x -= w / 2;
  if (s) g.pg.drawText(s, { x, y: g.H - y, size: sz, font: f, color: rgbc(o.c || INK) });
  return w;
}
function wrapTxt(g, s, w, sz, b) {
  const f = b ? g.B : g.F, out = []; let line = '';
  const wd = x => f.widthOfTextAtSize(x, sz);
  clean(s).split(' ').forEach(word => {
    while (wd(word) > w && word.length > 1) { let k = word.length - 1; while (k > 1 && wd(word.slice(0, k)) > w) k--; if (line) { out.push(line); line = ''; } out.push(word.slice(0, k)); word = word.slice(k); }
    const t = line ? line + ' ' + word : word;
    if (wd(t) <= w || !line) line = t; else { out.push(line); line = word; }
  });
  out.push(line); return out;
}
function rect(g, x, top, w, h, fill, stroke) {
  g.pg.drawRectangle({ x, y: g.H - top - h, width: w, height: h, color: fill ? rgbc(fill) : undefined, borderColor: stroke ? rgbc(stroke) : undefined, borderWidth: stroke ? 0.8 : 0 });
}
function hline(g, x1, x2, y, c, th) { g.pg.drawLine({ start: { x: x1, y: g.H - y }, end: { x: x2, y: g.H - y }, thickness: th || 0.5, color: rgbc(c || LINE) }); }
function H2(g, t) { if (g.y + 70 > g.bottom) g.page(); g.y += 16; T(g, t, g.M, g.y, { b: 1, sz: 12, c: BLUE }); g.y += 8; }
function note(g, t, c) { g.y += 12; const L = wrapTxt(g, t, g.cw, 9, 0); L.forEach(l => { if (g.y > g.bottom) g.page(); T(g, l, g.M, g.y, { sz: 9, c: c || MUT }); g.y += 12; }); }

/* Table. cols: [{h:'Head', w:weight, al:'l'|'r'}]. rows: array | {cells, b, fill, c} | {g:'Group heading'} */
function ptbl(g, o) {
  const sz = o.sz || 8.5, pad = 4.5, lh = sz * 1.28, tw = o.width || g.cw, x0 = o.x || g.M, tot = o.cols.reduce((a, c) => a + c.w, 0);
  const ws = o.cols.map(c => c.w / tot * tw), xs = ws.map((w, i) => x0 + ws.slice(0, i).reduce((a, b) => a + b, 0));
  const cell = (c, i) => (c && typeof c === 'object') ? c : { t: c };
  const draw = r => {
    const span = r.g != null, cells = span ? [{ t: r.g, b: 1 }] : r.cells.map(cell);
    const lines = span ? [wrapTxt(g, r.g, tw - 2 * pad, sz, 1)] : cells.map((c, i) => wrapTxt(g, c.t, ws[i] - 2 * pad, sz, c.b || r.b));
    const h = Math.max(...lines.map(l => l.length)) * lh + 2 * pad - (lh - sz) + 1;
    if (g.y + h > g.bottom) { g.page(); if (o.cols.some(c => c.h) && !r.hdr) draw(headRow); }
    const fill = r.fill || (span ? SOFT : null);
    if (fill) rect(g, x0, g.y, tw, h, fill);
    lines.forEach((ls, i) => {
      const c = cells[i], al = span ? 'l' : (o.cols[i].al || 'l'), colr = c.c || r.c, bold = c.b || r.b || span;
      ls.forEach((ln, j) => { const bx = span ? x0 + pad : al === 'r' ? xs[i] + ws[i] - pad : xs[i] + pad; T(g, ln, bx, g.y + pad + sz * 0.82 + j * lh, { sz, b: bold, al: al === 'r' ? 'r' : 'l', c: colr }); });
    });
    hline(g, x0, x0 + tw, g.y + h, LINE); g.y += h;
  };
  const headRow = { hdr: 1, cells: o.cols.map(c => ({ t: c.h || '' })), b: 1, fill: INK, c: [255, 255, 255] };
  if (o.cols.some(c => c.h)) { if (g.y + 40 > g.bottom) g.page(); draw(headRow); }
  o.rows.forEach(r => draw(Array.isArray(r) ? { cells: r } : r));
}
function kvTable(g, pairs) {
  const rows = []; for (let i = 0; i < pairs.length; i += 2) { const a = pairs[i], b = pairs[i + 1] || ['', '']; rows.push([{ t: a[0], b: 1, c: MUT }, a[1] || '-', { t: b[0], b: 1, c: MUT }, b[0] ? (b[1] || '-') : '']); }
  ptbl(g, { cols: [{ w: 17 }, { w: 33 }, { w: 17 }, { w: 33 }], rows });
}

let _logo = null;
async function logoBytes() {
  if (_logo) return _logo;
  return _logo = await new Promise(ok => {
    const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0); cv.toBlob(b => b.arrayBuffer().then(buf => ok({ buf, w: im.naturalWidth, h: im.naturalHeight })), 'image/png'); };
    im.onerror = () => ok(null); im.src = D.logo || 'icons/logo-original.png';
  });
}
async function pdfHead(g, title, sub) {
  let lg = null; try { lg = await logoBytes(); } catch (e) { }
  const h = 48;
  if (lg) { const img = await g.pdf.embedPng(lg.buf); g.pg.drawImage(img, { x: g.M, y: g.H - g.M - h, width: h * lg.w / lg.h, height: h }); }
  else T(g, 'SIGNATURE FACADE', g.M, g.M + 24, { b: 1, sz: 18, c: RED });
  T(g, title, g.W - g.M, g.M + 14, { b: 1, sz: 15, al: 'r' }); T(g, sub, g.W - g.M, g.M + 29, { sz: 9, al: 'r', c: MUT });
  hline(g, g.M, g.W - g.M, g.M + h + 6, RED, 1.6); g.y = g.M + h + 8;
}
function pdfFoot(g, label) {
  const pages = g.pdf.getPages(), n = pages.length;
  pages.forEach((pg, i) => { g.pg = pg; hline(g, g.M, g.W - g.M, g.H - 30, LINE); T(g, label, g.M, g.H - 20, { sz: 7.5, c: MUT }); T(g, 'Page ' + (i + 1) + ' of ' + n, g.W - g.M, g.H - 20, { sz: 7.5, al: 'r', c: MUT }); });
}

/* ---------- client PDF ---------- */
async function cPdf(d) {
  const g = await pdfNew(false), { p, c } = d;
  await pdfHead(g, 'PROJECT SUMMARY REPORT', 'Prepared ' + nowStr());
  H2(g, 'Project details');
  kvTable(g, [['Project', p.Name], ['Client', p.Client], ['Location', p.Location], ['Project type', p.Type], ['Project ID', p.ID], ['Status', p.Status], ['Start date', fdate(p.StartDate)], ['Target completion', fdate(p.EndDate)]]);

  H2(g, 'Progress');
  g.y += 4; T(g, d.pr + '% complete', g.M, g.y + 9, { b: 1, sz: 11 }); g.y += 16;
  rect(g, g.M, g.y, g.cw, 9, [230, 235, 239]); if (d.pr > 0) rect(g, g.M, g.y, g.cw * d.pr / 100, 9, [46, 158, 107]); g.y += 14;

  H2(g, 'Scope of works');
  if (d.scope.length) {
    ptbl(g, { width: g.cw * 0.5, cols: [{ h: 'Item type', w: 70 }, { h: 'Total quantity', w: 30, al: 'r' }], rows: d.sum.map(s => [s.type, qtyS(s.qty)]) });
    g.y += 8;
    ptbl(g, { cols: [{ h: 'Item', w: 17 }, { h: 'Description', w: 36 }, { h: 'Qty', w: 8, al: 'r' }, { h: 'Unit', w: 8 }, { h: 'Progress remarks', w: 31 }], rows: d.scope.map(x => [x.Type, x.Description, qtyS(N(x.Qty)), x.Unit, x.Remarks || '-']) });
  } else note(g, 'No scope items have been listed yet.');

  H2(g, 'Payment summary');
  ptbl(g, { cols: [{ w: 60 }, { w: 40, al: 'r' }], rows: [
    ['Contract value', 'KES ' + money(c.q)], ['Total received to date', 'KES ' + money(c.rec)],
    { cells: ['Balance due', 'KES ' + money(c.bal)], b: 1, fill: SOFT, c: c.bal > 0 ? BADC : OKC },
    ['Paid so far', c.q ? pct1(c.rec / c.q * 100) : '-']] });
  g.y += 10;
  if (d.pay.length) ptbl(g, { cols: [{ h: 'Date', w: 22 }, { h: 'Reference', w: 52 }, { h: 'Amount (KES)', w: 26, al: 'r' }], rows: d.pay.map(x => [fdate(x.Date), x.Reference, money(N(x.Amount))]).concat([{ cells: ['Total received', '', money(c.rec)], b: 1, fill: SOFT }]) });
  else note(g, 'No payments have been received yet.');

  note(g, 'Figures are taken from Signature Facade & Windows Ltd project records as at ' + nowStr() + '.');
  pdfFoot(g, 'Signature Facade & Windows Ltd  |  ' + clean(p.Name));
  g.pdf.setTitle('Project Summary Report - ' + clean(p.Name)); g.pdf.setAuthor('Signature Facade & Windows Ltd');
  return g.pdf.save();
}

/* ---------- management PDF ---------- */
async function mPdf(m) {
  const g = await pdfNew(true), T_ = m.T;
  await pdfHead(g, 'MANAGEMENT PERFORMANCE REPORT', 'Prepared ' + nowStr() + '  |  ' + m.desc);
  H2(g, 'Summary');
  ptbl(g, { cols: [{ h: 'Projects undertaken', w: 12 }, { h: 'Total quoted (KES)', w: 15, al: 'r' }, { h: 'Cost (KES)', w: 15, al: 'r' }, { h: 'Profit / (loss) (KES)', w: 16, al: 'r' }, { h: 'Margin', w: 9, al: 'r' }, { h: 'Received (KES)', w: 15, al: 'r' }, { h: 'Owed by clients (KES)', w: 18, al: 'r' }],
    rows: [[String(T_.n), money(T_.q), money(T_.cost), { t: money(T_.profit), b: 1, c: T_.profit < 0 ? BADC : OKC }, T_.q ? pct1(T_.pct) : '-', money(T_.rec), money(T_.bal)]] });
  note(g, T_.win + ' project(s) in profit, ' + T_.loss + ' at a loss' + (T_.even ? ', ' + T_.even + ' break-even' : '') + '. Cost used: the actual figure on every cost line where actuals have been recorded (Active or Completed projects), otherwise the planned figure. Actual cost recorded so far: KES ' + money(T_.act) + '.');

  H2(g, 'Project performance');
  if (m.rows.length) {
    const rows = m.rows.map(r => [{ t: r.p.Name, b: 1 }, r.p.Client, r.p.Status, r.pr + '%', money(r.c.q), money(r.c.plan), r.c.act ? money(r.c.act) : '-',
      r.started ? { t: money(r.profit), b: 1, c: r.profit < 0 ? BADC : r.profit > 0 ? OKC : INK } : '-', r.started && r.c.q ? pct1(r.pct) : '-',
      { t: r.out + (r.basis ? ' (' + r.basis + ')' : ''), c: r.out === 'Profit' ? OKC : r.out === 'Loss' ? BADC : MUT, b: 1 }, money(r.c.rec), money(r.c.bal)]);
    rows.push({ cells: ['Total (undertaken)', '', '', '', money(T_.q), money(T_.plan), money(T_.act), money(T_.profit), T_.q ? pct1(T_.pct) : '-', '', money(T_.rec), money(T_.bal)], b: 1, fill: SOFT });
    ptbl(g, { sz: 7.6, cols: [{ h: 'Project', w: 15 }, { h: 'Client', w: 11 }, { h: 'Status', w: 7 }, { h: 'Progress', w: 6.5, al: 'r' }, { h: 'Quoted', w: 9, al: 'r' }, { h: 'Planned cost', w: 9, al: 'r' }, { h: 'Actual cost', w: 9, al: 'r' }, { h: 'Profit / (loss)', w: 9.5, al: 'r' }, { h: 'Margin', w: 6.5, al: 'r' }, { h: 'Outcome', w: 11, al: 'l' }, { h: 'Received', w: 9, al: 'r' }, { h: 'Balance', w: 9, al: 'r' }], rows });
  } else note(g, 'No projects match these filters.');

  if (m.catRows.length) {
    H2(g, 'Planned vs actual by category (completed projects)');
    ptbl(g, { width: g.cw * 0.7, cols: [{ h: 'Category', w: 30 }, { h: 'Planned', w: 18, al: 'r' }, { h: 'Actual', w: 20, al: 'r' }, { h: 'Variance', w: 17, al: 'r' }, { h: 'Share of actual', w: 15, al: 'r' }],
      rows: m.catRows.map(x => [x.k, money(x.plan), money(x.act), { t: x.act ? money(x.act - x.plan) : '-', c: x.act > x.plan && x.act ? BADC : INK }, T_.actC ? pct1(x.act / T_.actC * 100) : '-']) });
  }
  pdfFoot(g, 'Signature Facade & Windows Ltd  |  Management performance report  |  Confidential');
  g.pdf.setTitle('Management Performance Report'); g.pdf.setAuthor('Signature Facade & Windows Ltd');
  return g.pdf.save();
}

/* ---------- download / share ---------- */
async function rPdf(kind, share) {
  const L = $('#load'); L.style.display = 'flex';
  try {
    let bytes, name;
    if (kind === 'client') { const p = D.projects.find(x => x.ID === RPT.pid); bytes = await cPdf(cData(p)); name = 'Project Report - ' + p.Name; }
    else { bytes = await mPdf(mData()); name = 'Management Report'; }
    name = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '_' + today() + '.pdf';
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (share) {
      const f = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; }
      toast('Sharing is not supported on this device, so the file was downloaded instead.');
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { if (!(e && e.name === 'AbortError')) toast('Could not create the PDF: ' + errMsg(e), 1); }
  finally { L.style.display = 'none'; }
}
