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
  e.target.value = '';
});

document.getElementById('btn-repair').addEventListener('click', async () => {
  const res = await send(MSG.REPAIR_INDEX);
  showStatus(`Index repaired. ${res.index.length} records found.`);
  await loadStats();
});

document.getElementById('btn-wipe').addEventListener('click', async () => {
  if (!confirm('This will permanently delete ALL tracked applications. Are you sure?')) return;
  if (!confirm('Really? This cannot be undone.')) return;
  await send(MSG.WIPE_ALL);
  showStatus('All data wiped.');
  await loadStats();
});

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

loadStats();
loadPrefs();
