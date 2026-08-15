const STATUSES = ['applied', 'oa', 'interview', 'offer', 'rejected', 'ghosted'];

export function createPanel(scraped, onSave, onClose) {
  const host = document.createElement('div');
  host.id = 'jobtrack-panel-host';
  host.style.cssText = 'all:initial;position:fixed;top:0;right:0;width:420px;height:100vh;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    :host { font-family: system-ui, -apple-system, sans-serif; }
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      box-shadow: -4px 0 32px rgba(0,0,0,0.18);
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: #4f46e5;
      color: #fff;
      flex-shrink: 0;
    }
    .header h2 { margin: 0; font-size: 16px; font-weight: 700; }
    .close-btn {
      background: none; border: none; color: #fff; cursor: pointer;
      font-size: 22px; line-height: 1; padding: 2px 6px; border-radius: 4px;
    }
    .close-btn:hover { background: rgba(255,255,255,0.2); }
    .body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 4px; }
    input, select, textarea {
      width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
      border-radius: 6px; font-size: 14px; font-family: inherit; color: #111827;
      background: #fff;
    }
    input:focus, select:focus, textarea:focus {
      outline: 2px solid #4f46e5; outline-offset: 1px; border-color: transparent;
    }
    textarea { resize: vertical; min-height: 180px; line-height: 1.5; }
    .footer {
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }
    .btn-save {
      flex: 1; padding: 10px; background: #4f46e5; color: #fff; border: none;
      border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .btn-save:hover { background: #4338ca; }
    .btn-cancel {
      padding: 10px 16px; background: #f3f4f6; color: #374151; border: none;
      border-radius: 6px; font-size: 14px; cursor: pointer;
    }
    .btn-cancel:hover { background: #e5e7eb; }
    .dupe-warning {
      background: #fef3c7; border: 1px solid #f59e0b; color: #92400e;
      border-radius: 6px; padding: 10px 12px; font-size: 13px;
    }
  `;

  const today = new Date().toISOString().slice(0, 10);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="header">
      <h2>Track This Job</h2>
      <button class="close-btn" id="close">&#x2715;</button>
    </div>
    <div class="body">
      <div>
        <label>Job Title</label>
        <input id="title" type="text" value="${esc(scraped.title || '')}" placeholder="e.g. Software Engineer">
      </div>
      <div>
        <label>Company</label>
        <input id="company" type="text" value="${esc(scraped.company || '')}" placeholder="e.g. Acme Corp">
      </div>
      <div>
        <label>Location</label>
        <input id="location" type="text" value="${esc(scraped.location || '')}" placeholder="e.g. Remote / San Francisco">
      </div>
      <div>
        <label>Applied Date</label>
        <input id="appliedAt" type="date" value="${today}">
      </div>
      <div>
        <label>Status</label>
        <select id="status">
          ${STATUSES.map(s => `<option value="${s}"${s === 'applied' ? ' selected' : ''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Job Description (edit freely)</label>
        <textarea id="description">${esc(scraped.description || '')}</textarea>
      </div>
      <div>
        <label>Notes</label>
        <textarea id="notes" style="min-height:60px"></textarea>
      </div>
      <div id="dupe-banner" style="display:none" class="dupe-warning">
        &#9888; This looks like a duplicate — you may have already saved this posting.
      </div>
    </div>
    <div class="footer">
      <button class="btn-cancel" id="cancel">Cancel</button>
      <button class="btn-save" id="save">Save Application</button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);

  shadow.getElementById('close').addEventListener('click', close);
  shadow.getElementById('cancel').addEventListener('click', close);
  shadow.getElementById('save').addEventListener('click', save);

  document.addEventListener('keydown', onKey);

  function onKey(e) {
    if (e.key === 'Escape') close();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
  }

  function close() {
    host.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }

  function getData() {
    const g = id => shadow.getElementById(id);
    return {
      id: crypto.randomUUID(),
      title: g('title').value.trim(),
      company: g('company').value.trim(),
      location: g('location').value.trim(),
      appliedAt: g('appliedAt').value,
      status: g('status').value,
      description: g('description').value.trim(),
      notes: g('notes').value.trim(),
      sourceHost: location.hostname,
    };
  }

  async function save() {
    const data = getData();
    const result = await onSave(data);
    if (result?.dupe) {
      shadow.getElementById('dupe-banner').style.display = 'block';
      return;
    }
    close();
  }

  return {
    showDupe() {
      shadow.getElementById('dupe-banner').style.display = 'block';
    },
    remove: close,
  };
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function statusLabel(s) {
  return { applied: 'Applied', oa: 'OA', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', ghosted: 'Ghosted' }[s] || s;
}
