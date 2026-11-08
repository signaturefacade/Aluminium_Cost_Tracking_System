/* ===================== TASKS & ALERTS =====================
 * Scheduled to-dos (buy materials, labour payments, follow-ups...). Alerts show as:
 *  - a red count on the Tasks menu item and in the browser tab title
 *  - a panel on the Overview
 *  - a pop-up when someone signs in
 *  - a notice the moment a timed task falls due while the app is open
 * Optional daily email reminders are switched on by an administrator (see the Tasks page).
 * Uses globals from app.js / reports.js: D, TOKEN, ME, run, call, form, esc, N, money, kes, toast, fail, errMsg, go, render, today, fdate.
 */
const TASK_TYPES = ['Buy materials', 'Labour payment', 'Supplier payment', 'Client follow-up', 'Site visit', 'Other'];
const TASK_REPEATS = ['None', 'Daily', 'Weekly', 'Every 2 weeks', 'Monthly'];
let TF = { tab: 'open' }, T_TICK = null, T_SYNC = null;
const T_SEEN = new Set();

const p2 = n => String(n).padStart(2, '0');
const tmNorm = v => { const m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})/); return m ? p2(+m[1]) + ':' + m[2] : ''; };
const nowParts = () => { const d = new Date(); return { date: d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()), hm: p2(d.getHours()) + ':' + p2(d.getMinutes()) }; };
const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);

/* k: over (past date) | due (today, time reached) | today | soon (next 7 days) | later */
function tState(t) {
  const n = nowParts(), tm = tmNorm(t.DueTime), d = dayDiff(String(t.DueDate).slice(0, 10), n.date);
  if (d < 0) return { k: 'over', d };
  if (d === 0) return { k: tm && tm <= n.hm ? 'due' : 'today', d };
  return { k: d <= 7 ? 'soon' : 'later', d };
}
function tLabel(t) {
  const s = tState(t), tm = tmNorm(t.DueTime), at = tm ? ' at ' + tm : '';
  if (s.k === 'over') return -s.d + (s.d === -1 ? ' day' : ' days') + ' overdue';
  if (s.k === 'due') return 'Due now (' + tm + ')';
  if (s.k === 'today') return 'Today' + at;
  if (s.d === 1) return 'Tomorrow' + at;
  if (s.k === 'soon') return 'In ' + s.d + ' days' + at;
  return fdate(t.DueDate) + at;
}
const tCmp = (a, b) => (String(a.DueDate) + tmNorm(a.DueTime)).localeCompare(String(b.DueDate) + tmNorm(b.DueTime));
const openTasks = () => (D.tasks || []).filter(t => t.Status !== 'Done').sort(tCmp);
const alertTasks = () => openTasks().filter(t => ['over', 'due', 'today'].includes(tState(t).k));
const projName = id => { const p = D.projects.find(x => x.ID === id); return p ? p.Name : ''; };

/* ---------- alerts ---------- */
function taskBadge() {
  const n = alertTasks().length, el = $('#tbadge');
  if (el) { el.textContent = n; el.style.display = n ? 'inline-block' : 'none'; }
  const base = 'Aluminium Project Cost Tracking System';
  document.title = (n ? '(' + n + ') ' : '') + base;
}
function trow(t) {
  const s = tState(t);
  return `<div class="trow ${s.k === 'over' || s.k === 'due' ? 'late' : ''}"><div><b>${esc(t.Title)}</b><small>${esc(tLabel(t))}${t.Amount !== '' && N(t.Amount) ? ' / ' + kes(N(t.Amount)) : ''}${projName(t.ProjectID) ? ' / ' + esc(projName(t.ProjectID)) : ''}</small></div><button onclick="doneTask('${t.ID}')">Done</button></div>`;
}
function taskPanel() {
  const a = alertTasks(); if (!a.length) return '';
  return `<div class="tpanel"><div class="head"><h2>Tasks needing attention (${a.length})</h2><button onclick="go('tasks')">Open tasks</button></div>${a.slice(0, 5).map(trow).join('')}${a.length > 5 ? `<p class="muted">and ${a.length - 5} more...</p>` : ''}</div>`;
}
function showDue(a) {
  const d = $('#dlg'); if (d.open) return;
  d.innerHTML = `<h3>Tasks needing attention</h3><p class="muted">These tasks are overdue or due today.</p><div class="tlist">${a.slice(0, 8).map(trow).join('')}${a.length > 8 ? `<p class="muted">and ${a.length - 8} more on the Tasks page.</p>` : ''}</div><div class="act"><button class="ghost" onclick="dlg.close()">Dismiss</button><button class="primary" onclick="dlg.close();go('tasks')">View tasks</button></div>`;
  d.showModal();
}
function taskStartup() {
  taskStop(); taskBadge(); const a = alertTasks(); a.forEach(t => T_SEEN.add(t.ID)); if (a.length) showDue(a);
  T_TICK = setInterval(taskTick, 60000); T_SYNC = setInterval(taskSync, 300000);
}
function taskStop() { clearInterval(T_TICK); clearInterval(T_SYNC); T_TICK = T_SYNC = null; T_SEEN.clear(); document.title = 'Aluminium Project Cost Tracking System'; }
function taskTick() {
  if (!TOKEN) return;
  const fresh = alertTasks().filter(t => !T_SEEN.has(t.ID)); fresh.forEach(t => T_SEEN.add(t.ID));
  if (fresh.length) toast('Task due: ' + fresh[0].Title + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : ''));
  const busy = $('#dlg').open || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '');
  if (!busy && (view === 'dash' || view === 'tasks')) render(); else taskBadge();
}
async function taskSync() {   // quietly pick up tasks added by colleagues
  if (!TOKEN) return;
  try { D = await run('api', TOKEN, 'getData', []); taskTick(); } catch (e) { if (errMsg(e).includes('SESSION_EXPIRED')) fail(e); }
}

/* ---------- actions ---------- */
async function doneTask(id) {
  const t = D.tasks.find(x => x.ID === id), d = $('#dlg'); if (d.open) d.close();
  if (await call('completeTask', id)) toast(t && t.Repeat !== 'None' ? 'Done. Next ' + t.Repeat.toLowerCase() + ' reminder created.' : 'Task marked done');
}
async function reopenTask(id) {
  const t = D.tasks.find(x => x.ID === id); if (t && await call('save', 'Tasks', Object.assign({}, t, { DueTime: tmNorm(t.DueTime), Status: 'Open', DoneDate: '' }))) toast('Task reopened');
}
function editTask(id) {
  const t = D.tasks.find(x => x.ID === id), v = t ? Object.assign({}, t, { DueTime: tmNorm(t.DueTime) }) : { Category: TASK_TYPES[0], DueDate: today(), Repeat: 'None' };
  form(id ? 'Edit task' : 'New task', [
    { k: 'Title', n: 'Task', r: 1, w: 1 }, { k: 'Category', n: 'Type', t: 'select', o: TASK_TYPES },
    { k: 'ProjectID', n: 'Project (optional)', t: 'select', o: [{ v: '', l: 'None' }].concat(D.projects.map(p => ({ v: p.ID, l: p.Name }))) },
    { k: 'DueDate', n: 'Due date', t: 'date', r: 1 }, { k: 'DueTime', n: 'Time (optional)', t: 'time' },
    { k: 'Amount', n: 'Amount in KES (optional)', t: 'number' }, { k: 'Repeat', n: 'Repeat', t: 'select', o: TASK_REPEATS },
    { k: 'Notes', n: 'Notes', t: 'area', w: 1 }], v, 'Tasks');
}

/* ---------- Tasks page ---------- */
function vTasks() {
  const op = openTasks(), dn = (D.tasks || []).filter(t => t.Status === 'Done').sort((a, b) => String(b.DoneDate).localeCompare(String(a.DoneDate)));
  const tabs = `<div class="tabs noprint"><button class="${TF.tab === 'open' ? 'on' : ''}" onclick="TF.tab='open';render()">Open (${op.length})</button><button class="${TF.tab === 'done' ? 'on' : ''}" onclick="TF.tab='done';render()">Completed (${dn.length})</button></div>`;
  const head = `<div class="head"><h1>Tasks scheduled</h1><button class="primary" onclick="editTask()">New task</button></div>`;
  const rbox = ME && ME.role === 'Admin' ? `<div class="rbox" id="rbox"><span class="muted">Checking email reminders...</span></div>` : '';
  let body;
  if (TF.tab === 'done') {
    body = dn.length ? `<div class="wrap"><table><tr><th>Task</th><th>Type</th><th>Completed</th><th></th></tr>${dn.map(t => `<tr><td>${esc(t.Title)}</td><td>${esc(t.Category)}</td><td>${esc(fdate(t.DoneDate))}</td><td class="r"><button onclick="reopenTask('${t.ID}')">Reopen</button><button onclick="del('Tasks','${t.ID}')">Delete</button></td></tr>`).join('')}</table></div>` : '<p class="muted">No completed tasks yet.</p>';
  } else if (!op.length) {
    body = '<div class="wrap"><p class="muted" style="padding:16px">No open tasks. Use New task to schedule something you do not want to forget, such as buying materials or paying labour.</p></div>';
  } else {
    const G = [['Overdue', t => ['over', 'due'].includes(tState(t).k)], ['Today', t => tState(t).k === 'today'], ['Next 7 days', t => tState(t).k === 'soon'], ['Later', t => tState(t).k === 'later']];
    body = `<div class="wrap"><table><tr><th></th><th>Task</th><th>Due</th><th class="n">Amount</th><th>Project</th><th></th></tr>${G.map(([name, f]) => { const L = op.filter(f); return L.length ? `<tr class="cat"><td colspan="6">${name} (${L.length})</td></tr>` + L.map(t => { const s = tState(t); return `<tr><td style="width:34px"><input type="checkbox" style="width:auto" title="Mark done" onchange="doneTask('${t.ID}')"></td><td><b>${esc(t.Title)}</b><small>${esc(t.Category)}${t.Repeat && t.Repeat !== 'None' ? ' / repeats ' + esc(t.Repeat.toLowerCase()) : ''}${t.Notes ? ' / ' + esc(t.Notes) : ''}</small></td><td class="${s.k === 'over' || s.k === 'due' ? 'neg' : ''}" style="white-space:nowrap">${esc(tLabel(t))}<small>${esc(fdate(t.DueDate))}</small></td><td class="n">${t.Amount !== '' && N(t.Amount) ? money(N(t.Amount)) : ''}</td><td>${esc(projName(t.ProjectID))}</td><td class="r"><button onclick="editTask('${t.ID}')">Edit</button><button onclick="del('Tasks','${t.ID}')">Delete</button></td></tr>`; }).join('') : ''; }).join('')}</table></div>`;
  }
  return head + rbox + tabs + body;
}

/* ---------- admin: daily email reminders ---------- */
async function loadReminderBox() {
  const el = $('#rbox'); if (!el) return;
  try {
    const s = await run('api', TOKEN, 'reminderStatus', []);
    if (!$('#rbox')) return;
    if (s.error) { $('#rbox').innerHTML = `<b>Daily email reminders</b><p class="muted" style="margin:4px 0 0">${esc(s.error)}</p>`; return; }
    $('#rbox').innerHTML = `<div><b>Daily email reminders: ${s.on ? '<span class="chip ok">On</span>' : '<span class="chip neu">Off</span>'}</b><p class="muted" style="margin:4px 0 0">${s.on ? 'Each person is emailed every morning (about ' + s.hour + ' am) about their own tasks that are overdue, due today or due tomorrow.' : 'Turn on to email each person every morning about their own overdue, due-today and due-tomorrow tasks, even when the app is closed.'}</p></div><div class="tools" style="margin:0"><button onclick="setRem(${s.on ? 0 : 1})">${s.on ? 'Turn off' : 'Turn on'}</button><button onclick="testRem()">Email me a test</button></div>`;
  } catch (e) { if (errMsg(e).includes('SESSION_EXPIRED')) fail(e); else if ($('#rbox')) $('#rbox').innerHTML = `<b>Daily email reminders</b><p class="muted" style="margin:4px 0 0">${esc(errMsg(e))}</p>`; }
}
async function setRem(on) { try { await run('api', TOKEN, 'setReminders', [!!on]); toast(on ? 'Daily email reminders are on' : 'Daily email reminders are off'); loadReminderBox(); } catch (e) { fail(e); } }
async function testRem() { try { await run('api', TOKEN, 'testReminder', []); toast('Test email sent to ' + ME.email); } catch (e) { fail(e); } }
