import { MSG, send } from '../src/messages.js';
import { toCSV } from '../src/util/csv.js';

// ── Status / season config ──────────────────────────────────────────────────
const STATUS_ORDER = ['applied', 'oa', 'interview', 'offer', 'rejected', 'ghosted'];
const STATUS_LABEL = {
  applied: 'Applied', oa: 'OA', interview: 'Interview',
  offer: 'Offer', rejected: 'Rejected', ghosted: 'Ghosted',
};
const ACTIVE_STATUSES = ['applied', 'oa', 'interview'];

const SEASON_TERMS = ['Winter', 'Spring', 'Summer', 'Fall'];
const SEASON_YEARS = [2026, 2027, 2028];
const SEASONS = SEASON_YEARS.flatMap(y => SEASON_TERMS.map(t => `${t} ${y}`));
const UNASSIGNED = 'Unassigned';

// Palette for company avatars (Outlook-ish varied circles, green-leaning).
const AVATAR_COLORS = ['#059669', '#0f766e', '#2563eb', '#7c3aed', '#c2410c', '#be123c', '#0891b2', '#4d7c0f', '#9333ea', '#b45309'];

let allApps = [];
let selectedId = null;

// ── Status feedback ─────────────────────────────────────────────────────────
const statusMsg = document.getElementById('status-msg');
function showStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? '#dc2626' : '#059669';
  statusMsg.style.display = 'block';
  setTimeout(() => { statusMsg.style.display = 'none'; }, 3000);
}

// ── Stats ───────────────────────────────────────────────────────────────────
async function loadStats() {
  const res = await send(MSG.GET_INDEX);
  const index = res.index || [];
  document.getElementById('stat-total').textContent = index.length;
  document.getElementById('stat-active').textContent =
    index.filter(a => ACTIVE_STATUSES.includes(a.status)).length;
  document.getElementById('stat-offers').textContent =
    index.filter(a => a.status === 'offer').length;
}

// ── Preferences ─────────────────────────────────────────────────────────────
async function loadPrefs() {
  const res = await chrome.storage.local.get('prefs');
  const prefs = res.prefs || {};
  document.getElementById('followup-enabled').checked = prefs.followupEnabled ?? false;
  document.getElementById('followup-days').value = prefs.followupDays ?? 10;
}

document.getElementById('btn-save-prefs').addEventListener('click', async () => {
  const prefs = {
    followupEnabled: document.getElementById('followup-enabled').checked,
    followupDays: parseInt(document.getElementById('followup-days').value, 10) || 10,
  };
  await chrome.storage.local.set({ prefs });
  showStatus('Preferences saved.');
});

// ── Export / import / repair / wipe ─────────────────────────────────────────
document.getElementById('btn-export-json').addEventListener('click', async () => {
  const res = await send(MSG.EXPORT_JSON);
  download('job-applications.json', res.data, 'application/json');
  showStatus('Exported JSON.');
});

document.getElementById('btn-export-csv').addEventListener('click', async () => {
  const res = await send(MSG.GET_INDEX);
  const index = res.index || [];
  const full = await Promise.all(
    index.map(e => send(MSG.GET_APPLICATION, { id: e.id }).then(r => r.app))
  );
  download('job-applications.csv', toCSV(full.filter(Boolean)), 'text/csv');
  showStatus('Exported CSV.');
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const res = await send(MSG.IMPORT_JSON, { data: text });
  showStatus(`Imported ${res.count} applications.`);
  await refresh();
  e.target.value = '';
});

document.getElementById('btn-repair').addEventListener('click', async () => {
  await send(MSG.REPAIR_INDEX);
  await refresh();
  showStatus('Refreshed from Supabase.');
});

document.getElementById('btn-wipe').addEventListener('click', async () => {
  if (!confirm('This will permanently delete ALL tracked applications. Are you sure?')) return;
  if (!confirm('Really? This cannot be undone.')) return;
  await send(MSG.WIPE_ALL);
  selectedId = null;
  await refresh();
  showStatus('All data wiped.');
});

// ── Filters ─────────────────────────────────────────────────────────────────
function initSeasonFilter() {
  const sel = document.getElementById('season-filter');
  sel.appendChild(new Option('All seasons', 'all'));
  SEASONS.forEach(s => sel.appendChild(new Option(s, s)));
  sel.appendChild(new Option(UNASSIGNED, UNASSIGNED));
  sel.value = 'all';
  sel.addEventListener('change', renderList);
}

document.getElementById('search').addEventListener('input', renderList);

// ── Data + helpers ──────────────────────────────────────────────────────────
async function loadData() {
  const res = await send(MSG.GET_ALL);
  allApps = res.apps || [];
  renderList();
  renderReader();
}

function filteredApps() {
  const season = document.getElementById('season-filter').value;
  const query = document.getElementById('search').value.toLowerCase().trim();
  return allApps.filter(app => {
    if (season !== 'all') {
      const s = app.season || UNASSIGNED;
      if (s !== season) return false;
    }
    if (query) {
      const hay = `${app.title || ''} ${app.company || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function initials(company) {
  const words = (company || '?').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function avatarColor(company) {
  const s = company || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function makeAvatar(company) {
  const el = document.createElement('div');
  el.className = 'avatar';
  el.style.background = avatarColor(company);
  el.textContent = initials(company);
  return el;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── List pane ───────────────────────────────────────────────────────────────
function renderList() {
  const list = document.getElementById('list');
  const countEl = document.getElementById('list-count');
  list.textContent = '';

  const apps = filteredApps();
  countEl.textContent = apps.length ? `${apps.length} item${apps.length === 1 ? '' : 's'}` : '';

  if (!allApps.length) {
    list.appendChild(emptyList('No applications yet. Track a job from a posting to see it here.'));
    return;
  }
  if (!apps.length) {
    list.appendChild(emptyList('No applications match your filters.'));
    return;
  }

  // Group by season, ordered SEASONS then Unassigned; newest applied first within.
  const groups = new Map();
  for (const app of apps) {
    const s = app.season || UNASSIGNED;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(app);
  }
  const order = [...SEASONS, UNASSIGNED].filter(s => groups.has(s));

  for (const season of order) {
    const head = document.createElement('div');
    head.className = 'group-head';
    head.textContent = season;
    list.appendChild(head);

    const jobs = groups.get(season).sort(
      (a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0)
    );
    jobs.forEach(job => list.appendChild(renderRow(job)));
  }
}

function emptyList(text) {
  const el = document.createElement('div');
  el.className = 'list-empty';
  el.textContent = text;
  return el;
}

function renderRow(job) {
  const row = document.createElement('div');
  row.className = 'row' + (job.id === selectedId ? ' selected' : '');
  row.dataset.id = job.id;

  row.appendChild(makeAvatar(job.company));

  const main = document.createElement('div');
  main.className = 'row-main';

  const top = document.createElement('div');
  top.className = 'row-top';
  const company = document.createElement('span');
  company.className = 'row-company';
  company.textContent = job.company || '(no company)';
  const date = document.createElement('span');
  date.className = 'row-date';
  date.textContent = fmtDate(job.appliedAt);
  top.append(company, date);

  const title = document.createElement('div');
  title.className = 'row-title';
  title.textContent = job.title || '(untitled)';

  const meta = document.createElement('div');
  meta.className = 'row-meta';
  meta.appendChild(statusChip(job.status));
  const preview = document.createElement('span');
  preview.className = 'row-preview';
  preview.textContent = (job.description || '').replace(/\s+/g, ' ').trim();
  meta.appendChild(preview);

  main.append(top, title, meta);
  row.appendChild(main);
  row.appendChild(deleteButton(job));

  row.addEventListener('click', () => {
    selectedId = job.id;
    renderList();
    renderReader();
  });

  return row;
}

function deleteButton(job) {
  const btn = document.createElement('button');
  btn.className = 'row-del';
  btn.title = 'Delete application';
  btn.setAttribute('aria-label', `Delete ${job.title || 'application'}`);
  btn.innerHTML = `<svg viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${job.title || 'this application'}"${job.company ? ` at ${job.company}` : ''}? This cannot be undone.`)) return;
    await send(MSG.DELETE_APPLICATION, { id: job.id });
    if (selectedId === job.id) selectedId = null;
    await refresh();
  });
  return btn;
}

function statusChip(status) {
  const chip = document.createElement('span');
  const s = STATUS_ORDER.includes(status) ? status : 'applied';
  chip.className = `chip chip-${s}`;
  chip.textContent = STATUS_LABEL[s];
  return chip;
}

// ── Reading pane ────────────────────────────────────────────────────────────
function renderReader() {
  const pane = document.getElementById('read-pane');
  pane.textContent = '';

  const job = allApps.find(a => a.id === selectedId);
  if (!job) {
    pane.appendChild(readerEmpty());
    return;
  }

  const reader = document.createElement('div');
  reader.className = 'reader';

  // Header
  const head = document.createElement('div');
  head.className = 'reader-head';
  head.appendChild(makeAvatar(job.company));
  const titles = document.createElement('div');
  titles.className = 'reader-titles';
  const t = document.createElement('div');
  t.className = 'reader-title';
  t.textContent = job.title || '(untitled)';
  const c = document.createElement('div');
  c.className = 'reader-company';
  c.textContent = job.company || '';
  titles.append(t, c);
  head.appendChild(titles);
  reader.appendChild(head);

  // Meta row
  const metarow = document.createElement('div');
  metarow.className = 'reader-metarow';
  metarow.appendChild(statusChip(job.status));
  const metaBits = [];
  if (job.appliedAt) metaBits.push(`Applied ${fmtDate(job.appliedAt)}`);
  if (job.season) metaBits.push(job.season);
  if (job.sourceHost) metaBits.push(job.sourceHost);
  metaBits.forEach((text) => {
    const sep = document.createElement('span');
    sep.className = 'dot-sep';
    sep.textContent = '·';
    metarow.appendChild(sep);
    const item = document.createElement('span');
    item.className = 'reader-meta-item';
    item.textContent = text;
    metarow.appendChild(item);
  });
  reader.appendChild(metarow);

  // Actions (status + season)
  const actions = document.createElement('div');
  actions.className = 'reader-actions';
  actions.appendChild(action('Status', buildStatusSelect(job)));
  actions.appendChild(action('Recruiting season', buildSeasonSelect(job)));
  reader.appendChild(actions);

  // Body
  const body = document.createElement('div');
  body.className = 'reader-body';
  const h3 = document.createElement('h3');
  h3.textContent = 'Job description';
  body.appendChild(h3);
  if (job.description) {
    const desc = document.createElement('div');
    desc.className = 'reader-desc';
    desc.textContent = job.description;
    body.appendChild(desc);
  } else {
    const nd = document.createElement('div');
    nd.className = 'reader-nodesc';
    nd.textContent = 'No description saved for this job.';
    body.appendChild(nd);
  }
  if (job.notes) {
    const nh = document.createElement('h3');
    nh.textContent = 'Notes';
    nh.style.marginTop = '20px';
    const notes = document.createElement('div');
    notes.className = 'reader-desc';
    notes.textContent = job.notes;
    body.append(nh, notes);
  }
  reader.appendChild(body);

  pane.appendChild(reader);
}

function readerEmpty() {
  const wrap = document.createElement('div');
  wrap.className = 'read-empty';
  wrap.innerHTML = `
    <svg viewBox="0 0 120 120" fill="none">
      <rect x="18" y="34" width="84" height="60" rx="6" fill="#d1fae5"/>
      <path d="M18 40l42 30 42-30" stroke="#059669" stroke-width="4" fill="none" stroke-linejoin="round"/>
      <path d="M60 20l26 20H34l26-20z" fill="#a7f3d0"/>
    </svg>
    <div class="t">Select a job to read</div>
    <div class="s">Nothing is selected</div>
  `;
  return wrap;
}

function action(labelText, control) {
  const wrap = document.createElement('div');
  wrap.className = 'action';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function buildStatusSelect(job) {
  const sel = document.createElement('select');
  STATUS_ORDER.forEach(s => sel.appendChild(new Option(STATUS_LABEL[s], s)));
  sel.value = STATUS_ORDER.includes(job.status) ? job.status : 'applied';
  sel.addEventListener('change', async () => {
    const status = sel.value;
    await send(MSG.UPDATE_APPLICATION, { app: { id: job.id, status } });
    job.status = status;
    await loadStats();
    renderList();
    renderReader();
  });
  return sel;
}

function buildSeasonSelect(job) {
  const sel = document.createElement('select');
  sel.appendChild(new Option('— season —', ''));
  SEASONS.forEach(s => sel.appendChild(new Option(s, s)));
  sel.value = job.season || '';
  sel.addEventListener('change', async () => {
    const season = sel.value || null;
    await send(MSG.UPDATE_APPLICATION, { app: { id: job.id, season } });
    job.season = season;
    renderList();
    renderReader();
  });
  return sel;
}

// ── Settings drawer ─────────────────────────────────────────────────────────
const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('drawer-backdrop');
function openDrawer() {
  drawer.classList.add('open');
  backdrop.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
}
document.getElementById('btn-settings').addEventListener('click', openDrawer);
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
});

// ── Helpers / boot ──────────────────────────────────────────────────────────
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function refresh() {
  await Promise.all([loadStats(), loadData()]);
}

initSeasonFilter();
loadPrefs();
refresh();
