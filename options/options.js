import { MSG, send } from '../src/messages.js';
import { toCSV } from '../src/util/csv.js';

const statusMsg = document.getElementById('status-msg');
function showStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? '#dc2626' : '#059669';
  statusMsg.style.display = 'block';
  setTimeout(() => { statusMsg.style.display = 'none'; }, 3000);
}

async function loadStats() {
  const res = await send(MSG.GET_INDEX);
  const index = res.index || [];
  document.getElementById('stat-total').textContent = index.length;
  document.getElementById('stat-active').textContent =
    index.filter(a => ['applied','oa','interview'].includes(a.status)).length;
  document.getElementById('stat-offers').textContent =
    index.filter(a => a.status === 'offer').length;
}

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

document.getElementById('btn-export-json').addEventListener('click', async () => {
  const res = await send(MSG.EXPORT_JSON);
  download('job-applications.json', res.data, 'application/json');
  showStatus('Exported JSON.');
});

document.getElementById('btn-export-csv').addEventListener('click', async () => {
  const res = await send(MSG.GET_INDEX);
  const index = res.index || [];
  // Fetch all full records for CSV
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
  await loadStats();
  await loadDashboard();
  e.target.value = '';
});

document.getElementById('btn-repair').addEventListener('click', async () => {
  const res = await send(MSG.REPAIR_INDEX);
  showStatus(`Index repaired. ${res.index.length} records found.`);
  await loadStats();
  await loadDashboard();
});

document.getElementById('btn-wipe').addEventListener('click', async () => {
  if (!confirm('This will permanently delete ALL tracked applications. Are you sure?')) return;
  if (!confirm('Really? This cannot be undone.')) return;
  await send(MSG.WIPE_ALL);
  showStatus('All data wiped.');
  await loadStats();
  await loadDashboard();
});

// ── Dashboard (applications grouped by recruiting season) ───────────────────
const STATUS_LABEL = {
  applied: 'Applied', oa: 'OA', interview: 'Interview',
  offer: 'Offer', rejected: 'Rejected', ghosted: 'Ghosted',
};
const SEASON_TERMS = ['Winter', 'Spring', 'Summer', 'Fall'];
const SEASON_YEARS = [2026, 2027, 2028];
const SEASONS = SEASON_YEARS.flatMap(y => SEASON_TERMS.map(t => `${t} ${y}`));
const UNASSIGNED = 'Unassigned';

let allApps = [];

function initSeasonFilter() {
  const sel = document.getElementById('season-filter');
  sel.appendChild(new Option('All seasons', 'all'));
  SEASONS.forEach(s => sel.appendChild(new Option(s, s)));
  sel.appendChild(new Option(UNASSIGNED, UNASSIGNED));
  sel.value = 'all';
  sel.addEventListener('change', renderDashboard);
}

async function loadDashboard() {
  const res = await send(MSG.GET_ALL);
  allApps = res.apps || [];
  renderDashboard();
}

function renderDashboard() {
  const container = document.getElementById('dashboard-list');
  container.textContent = '';

  if (!allApps.length) {
    return container.appendChild(emptyMsg('No applications yet. Track a job to see it here.'));
  }

  const groups = new Map();
  for (const app of allApps) {
    const s = app.season || UNASSIGNED;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(app);
  }

  const filter = document.getElementById('season-filter').value;
  let seasons = [...SEASONS, UNASSIGNED].filter(s => groups.has(s));
  if (filter !== 'all') seasons = seasons.filter(s => s === filter);

  if (!seasons.length) {
    return container.appendChild(emptyMsg('No applications in this season.'));
  }
  seasons.forEach(s => container.appendChild(renderSeasonGroup(s, groups.get(s))));
}

function emptyMsg(text) {
  const p = document.createElement('div');
  p.className = 'dash-empty';
  p.textContent = text;
  return p;
}

function renderSeasonGroup(season, jobs) {
  const group = document.createElement('div');
  group.className = 'season-group';

  const head = document.createElement('div');
  head.className = 'season-head';
  const h3 = document.createElement('h3');
  h3.textContent = season;
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `${jobs.length} job${jobs.length === 1 ? '' : 's'}`;
  head.append(h3, count);
  group.appendChild(head);

  jobs.forEach(job => group.appendChild(renderJob(job)));
  return group;
}

function renderJob(job) {
  const el = document.createElement('div');
  el.className = 'job';

  const headRow = document.createElement('div');
  headRow.className = 'job-head';

  const left = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'job-title';
  title.textContent = job.title || '(untitled)';
  const sub = document.createElement('div');
  sub.className = 'job-sub';
  sub.textContent = [job.company, job.appliedAt && `Applied ${job.appliedAt}`]
    .filter(Boolean).join(' · ');
  left.append(title, sub);

  const right = document.createElement('div');
  right.className = 'job-right';
  const chip = document.createElement('span');
  chip.className = `chip chip-${job.status || 'applied'}`;
  chip.textContent = STATUS_LABEL[job.status] || job.status || 'Applied';
  right.append(chip, buildSeasonSelect(job));

  headRow.append(left, right);
  el.appendChild(headRow);

  if (job.description) {
    const wrap = document.createElement('div');
    wrap.className = 'job-desc';
    const desc = document.createElement('div');
    desc.className = 'desc-text clamped';
    desc.textContent = job.description;
    const btn = document.createElement('button');
    btn.className = 'expand-btn';
    btn.textContent = 'Expand';
    btn.addEventListener('click', () => {
      const clamped = desc.classList.toggle('clamped');
      btn.textContent = clamped ? 'Expand' : 'Collapse';
    });
    wrap.append(desc, btn);
    el.appendChild(wrap);
  }

  return el;
}

function buildSeasonSelect(job) {
  const sel = document.createElement('select');
  sel.className = 'season-select';
  sel.appendChild(new Option('— season —', ''));
  SEASONS.forEach(s => sel.appendChild(new Option(s, s)));
  sel.value = job.season || '';
  sel.addEventListener('change', async () => {
    const season = sel.value || null;
    await send(MSG.UPDATE_APPLICATION, { app: { id: job.id, season } });
    job.season = season;
    renderDashboard();
  });
  return sel;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

initSeasonFilter();
loadStats();
loadPrefs();
loadDashboard();
