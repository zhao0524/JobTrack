import { MSG, send } from '../src/messages.js';

const STATUS_LABELS = {
  applied: 'Applied', oa: 'OA', interview: 'Interview',
  offer: 'Offer', rejected: 'Rejected', ghosted: 'Ghosted',
};

let allApps = [];
let expandedId = null;
let editingId = null;

// DOM refs
const jobList = document.getElementById('job-list');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search');
const filterStatus = document.getElementById('filter-status');
const sortBy = document.getElementById('sort-by');
const appCount = document.getElementById('app-count');
const listView = document.getElementById('list-view');
const formView = document.getElementById('form-view');
const formTitle = document.getElementById('form-title');
const fId = document.getElementById('f-id');
const fTitle = document.getElementById('f-title');
const fCompany = document.getElementById('f-company');
const fLocation = document.getElementById('f-location');
const fDate = document.getElementById('f-date');
const fStatus = document.getElementById('f-status');
const fDesc = document.getElementById('f-desc');
const fNotes = document.getElementById('f-notes');
const fDupe = document.getElementById('f-dupe');
const btnDelete = document.getElementById('btn-delete');

async function loadApps() {
  const res = await send(MSG.GET_INDEX);
  allApps = res.index || [];
  appCount.textContent = allApps.length || '';
  renderList();
}

function relativeDate(iso) {
  if (!iso) return '';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function renderList() {
  const query = searchInput.value.toLowerCase().trim();
  const statusFilter = filterStatus.value;
  const sort = sortBy.value;

  let apps = allApps.slice();

  if (statusFilter) apps = apps.filter(a => a.status === statusFilter);
  if (query) {
    apps = apps.filter(a =>
      (a.title || '').toLowerCase().includes(query) ||
      (a.company || '').toLowerCase().includes(query)
    );
  }

  if (sort === 'appliedAt-asc') apps.sort((a, b) => new Date(a.appliedAt) - new Date(b.appliedAt));
  else if (sort === 'appliedAt-desc') apps.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  else if (sort === 'company-asc') apps.sort((a, b) => (a.company || '').localeCompare(b.company || ''));

  jobList.innerHTML = '';

  if (!apps.length) {
    emptyState.style.display = 'flex';
    jobList.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  jobList.style.display = '';

  for (const app of apps) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.dataset.id = app.id;

    card.innerHTML = `
      <div class="job-card-row">
        <div class="job-title">${esc(app.title || 'Untitled')}</div>
        <span class="status-chip chip-${app.status}">${STATUS_LABELS[app.status] || app.status}</span>
      </div>
      <div class="job-meta">
        <span class="job-company">${esc(app.company || '')}</span>
        ${app.company && app.appliedAt ? '<span class="job-date">·</span>' : ''}
        <span class="job-date">${relativeDate(app.appliedAt)}</span>
        ${app.sourceHost ? `<span class="job-date">· ${esc(app.sourceHost)}</span>` : ''}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (expandedId === app.id) {
        expandedId = null;
        card.querySelector('.job-desc-expanded')?.remove();
      } else {
        // Collapse previously expanded
        document.querySelector('.job-desc-expanded')?.remove();
        expandedId = app.id;
        loadAndExpandCard(card, app.id);
      }
    });

    card.addEventListener('dblclick', () => openEditForm(app.id));

    jobList.appendChild(card);
  }
}

async function loadAndExpandCard(card, id) {
  const res = await send(MSG.GET_APPLICATION, { id });
  if (!res.app) return;
  const div = document.createElement('div');
  div.className = 'job-desc-expanded';
  div.textContent = res.app.description || res.app.notes || '(No description saved)';
  card.appendChild(div);
}

// Keyboard: / to focus search
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput && formView.style.display === 'none') {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape' && formView.style.display !== 'none') {
    closeForm();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && formView.style.display !== 'none') {
    saveForm();
  }
});

// Filter/search events
searchInput.addEventListener('input', renderList);
filterStatus.addEventListener('change', renderList);
sortBy.addEventListener('change', renderList);

// Add button
document.getElementById('btn-add').addEventListener('click', () => openAddForm());

// Grab page button
document.getElementById('btn-grab').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Inline scraper — returns raw fields since we can't import modules here
        function fromJsonLd(doc) {
          const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
          for (const s of scripts) {
            try {
              const data = JSON.parse(s.textContent);
              const items = Array.isArray(data) ? data : [data];
              for (const item of items) {
                if (item['@type'] === 'JobPosting') {
                  return {
                    title: item.title || '',
                    company: item.hiringOrganization?.name || '',
                    location: item.jobLocation?.address?.addressLocality || '',
                    description: item.description
                      ? new DOMParser().parseFromString(item.description, 'text/html').body.innerText.trim()
                      : '',
                  };
                }
              }
            } catch {}
          }
          return null;
        }

        const jsonLd = fromJsonLd(document);
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
        const sel = window.getSelection().toString().trim();

        let desc = '';
        if (sel.length > 200) {
          desc = sel;
        } else {
          // density heuristic
          const IGNORE = new Set(['nav','header','footer','aside','script','style','noscript']);
          const cands = [...document.querySelectorAll('div, article, section, main')]
            .filter(el => !IGNORE.has(el.tagName.toLowerCase()));
          let best = null, bestScore = 0;
          for (const el of cands) {
            const t = el.innerText || '';
            const links = [...el.querySelectorAll('a')].reduce((a,x)=>a+(x.innerText||'').length,0);
            const score = t.length / (1 + links);
            if (score > bestScore) { bestScore = score; best = el; }
          }
          desc = best?.innerText?.trim() || document.body.innerText.slice(0, 20000);
        }

        return {
          title: jsonLd?.title || ogTitle || document.title || '',
          company: jsonLd?.company || '',
          location: jsonLd?.location || '',
          description: jsonLd?.description || desc,
          sourceHost: location.hostname,
        };
      },
    });

    const scraped = results?.[0]?.result || {};
    openAddForm(scraped);
  } catch (err) {
    openAddForm({ title: '', company: '', description: '' });
  }
});

function openAddForm(prefill = {}) {
  editingId = null;
  formTitle.textContent = 'Add Application';
  fId.value = '';
  fTitle.value = prefill.title || '';
  fCompany.value = prefill.company || '';
  fLocation.value = prefill.location || '';
  fDate.value = new Date().toISOString().slice(0, 10);
  fStatus.value = 'applied';
  fDesc.value = prefill.description || '';
  fNotes.value = prefill.notes || '';
  fDupe.style.display = 'none';
  btnDelete.style.display = 'none';
  formView.style.display = 'flex';
}

async function openEditForm(id) {
  const res = await send(MSG.GET_APPLICATION, { id });
  if (!res.app) return;
  const app = res.app;
  editingId = id;
  formTitle.textContent = 'Edit Application';
  fId.value = app.id;
  fTitle.value = app.title || '';
  fCompany.value = app.company || '';
  fLocation.value = app.location || '';
  fDate.value = app.appliedAt ? app.appliedAt.slice(0, 10) : '';
  fStatus.value = app.status || 'applied';
  fDesc.value = app.description || '';
  fNotes.value = app.notes || '';
  fDupe.style.display = 'none';
  btnDelete.style.display = 'inline-flex';
  formView.style.display = 'flex';
}

function closeForm() {
  formView.style.display = 'none';
  editingId = null;
}

async function saveForm() {
  const title = fTitle.value.trim();
  const company = fCompany.value.trim();
  if (!title || !company) {
    fTitle.reportValidity?.();
    fTitle.focus();
    return;
  }

  const app = {
    id: fId.value || crypto.randomUUID(),
    title,
    company,
    location: fLocation.value.trim(),
    appliedAt: fDate.value || new Date().toISOString().slice(0, 10),
    status: fStatus.value,
    description: fDesc.value.trim(),
    notes: fNotes.value.trim(),
  };

  const msgType = editingId ? MSG.UPDATE_APPLICATION : MSG.SAVE_APPLICATION;
  const res = await send(msgType, { app });

  if (res.dupe) {
    fDupe.style.display = 'block';
    return;
  }

  closeForm();
  await loadApps();
}

document.getElementById('btn-back').addEventListener('click', closeForm);
document.getElementById('btn-save').addEventListener('click', saveForm);
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!editingId) return;
  if (!confirm('Delete this application?')) return;
  await send(MSG.DELETE_APPLICATION, { id: editingId });
  closeForm();
  await loadApps();
});

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadApps();
