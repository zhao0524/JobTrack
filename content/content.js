(function () {
  'use strict';

  if (window.__jobTrackLoaded) return;
  window.__jobTrackLoaded = true;

  // ── Formatted text extraction ───────────────────────────────────────────────
  // .innerText drops list bullets and indentation and leaves noisy blank runs.
  // Walk the DOM ourselves so paragraphs, line breaks, and bullet lists survive.
  const BLOCK_TAGS = new Set([
    'P','DIV','SECTION','ARTICLE','UL','OL','LI','TABLE','TR',
    'H1','H2','H3','H4','H5','H6','HEADER','FOOTER','BLOCKQUOTE','PRE','DD','DT',
  ]);

  function extractFormatted(root) {
    let out = '';
    const walk = (node, depth) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.textContent.replace(/\s+/g, ' ');
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
        if (tag === 'BR') { out += '\n'; return; }
        if (tag === 'LI') {
          // Single newline before each item so bullets stay consecutive.
          out += '\n' + '  '.repeat(Math.max(0, depth - 1)) + '• ';
          walk(child, depth);
          return;
        }
        const isList = tag === 'UL' || tag === 'OL';
        if (BLOCK_TAGS.has(tag)) out += '\n';
        walk(child, depth + (isList ? 1 : 0));
        if (BLOCK_TAGS.has(tag)) out += '\n';
      });
    };
    walk(root, 0);
    return normalizeText(out);
  }

  function normalizeText(s) {
    return (s || '')
      .split('\n')
      .map((line) => {
        const lead = line.match(/^[ \t]*/)[0];        // keep leading indent (bullets)
        const body = line.slice(lead.length)
          .replace(/[ \t]{2,}/g, ' ')                  // collapse internal space runs
          .replace(/[ \t]+$/, '');                     // strip trailing spaces
        return body ? lead + body : '';                // drop whitespace-only lines
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')                       // collapse big blank gaps
      .replace(/^\s+|\s+$/g, '');                       // trim whole string
  }

  // Extract a job description from an element (or return '' if missing).
  function readDesc(el) {
    return el ? extractFormatted(el) : '';
  }

  // ── Scraping ──────────────────────────────────────────────────────────────

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
                ? readDesc(new DOMParser().parseFromString(item.description, 'text/html').body)
                : '',
            };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  const ADAPTERS = {
    'linkedin.com': {
      scrape(doc) {
        const descEl = doc.querySelector('.jobs-description__content') || doc.querySelector('#job-details');
        const titleEl = doc.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
          doc.querySelector('.jobs-unified-top-card__job-title') || doc.querySelector('h1.t-24');
        const companyEl = doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
          doc.querySelector('.jobs-unified-top-card__company-name a');
        const locationEl = doc.querySelector('.job-details-jobs-unified-top-card__primary-description-without-tagline');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: companyEl ? companyEl.innerText.trim() : '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
    'myworkdayjobs.com': {
      scrape(doc) {
        const descEl = doc.querySelector('[data-automation-id="jobPostingDescription"]');
        const titleEl = doc.querySelector('[data-automation-id="jobPostingHeader"]');
        const locationEl = doc.querySelector('[data-automation-id="locations"]');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
    'greenhouse.io': {
      scrape(doc) {
        const descEl = doc.querySelector('#content') || doc.querySelector('.job__description');
        const titleEl = doc.querySelector('h1.app-title') || doc.querySelector('h1');
        const locationEl = doc.querySelector('.location');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
    'lever.co': {
      scrape(doc) {
        const sections = [...doc.querySelectorAll('.section-wrapper .section')];
        const titleEl = doc.querySelector('h2') || doc.querySelector('.posting-headline h2');
        const locationEl = doc.querySelector('.sort-by-location .location') || doc.querySelector('.posting-categories .location');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: sections.map(readDesc).filter(Boolean).join('\n\n'),
        };
      },
    },
    'ashbyhq.com': {
      scrape(doc) {
        const descEl = doc.querySelector('[class*="descriptionText"]') || doc.querySelector('[class*="jobDescription"]');
        const titleEl = doc.querySelector('h1');
        const locationEl = doc.querySelector('[class*="location"]');
        return {
          title: titleEl ? titleEl.innerText.trim() : '',
          company: '',
          location: locationEl ? locationEl.innerText.trim() : '',
          description: readDesc(descEl),
        };
      },
    },
  };

  const IGNORE_TAGS = new Set(['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript']);

  function genericScrape(doc) {
    const sel = window.getSelection ? window.getSelection().toString().trim() : '';
    if (sel.length > 200) return sel;

    const cands = [...doc.querySelectorAll('div, article, section, main')]
      .filter(el => !IGNORE_TAGS.has(el.tagName.toLowerCase()));
    let best = null, bestScore = 0;
    for (const el of cands) {
      const t = el.innerText || '';
      const links = [...el.querySelectorAll('a')].reduce((a, x) => a + (x.innerText || '').length, 0);
      const score = t.length / (1 + links);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (best && best.innerText.length > 300) return readDesc(best);
    return normalizeText(doc.body.innerText.slice(0, 20000));
  }

  function getAdapter() {
    const host = location.hostname;
    for (const [key, adapter] of Object.entries(ADAPTERS)) {
      if (host.endsWith(key)) return adapter;
    }
    return null;
  }

  function scrapeCurrentPage() {
    const jsonLd = fromJsonLd(document);
    const adapter = getAdapter();
    const result = adapter ? adapter.scrape(document) : {};

    if (jsonLd) {
      if (jsonLd.title) result.title = jsonLd.title;
      if (jsonLd.company) result.company = jsonLd.company;
      if (jsonLd.location) result.location = jsonLd.location;
    }

    if (!result.title) {
      const og = document.querySelector('meta[property="og:title"]');
      result.title = og ? og.content : document.title;
    }

    // Description: prefer the site adapter (live DOM). Otherwise pick whichever of
    // the generic live-DOM extraction and the JSON-LD text keeps more structure —
    // the JSON-LD description is sometimes a pre-flattened single-line blob.
    if (!result.description) {
      const generic = genericScrape(document);
      const jd = (jsonLd && jsonLd.description) || '';
      result.description =
        ((generic.match(/\n/g) || []).length >= (jd.match(/\n/g) || []).length)
          ? generic : jd;
    }

    result.sourceHost = location.hostname;
    return result;
  }

  function isJobPage() {
    if (getAdapter()) return true;
    if (/\/(jobs?|careers?|apply)\//i.test(location.pathname)) return true;
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      try {
        const d = JSON.parse(s.textContent);
        const items = Array.isArray(d) ? d : [d];
        if (items.some(i => i['@type'] === 'JobPosting')) return true;
      } catch (_) {}
    }
    return false;
  }

  // ── Pill ──────────────────────────────────────────────────────────────────

  function createPill(onClick) {
    const host = document.createElement('div');
    host.id = 'jobtrack-pill-host';
    host.style.cssText = 'all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647;font-size:0;';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      button {
        display:flex;align-items:center;gap:6px;background:#059669;color:#fff;
        border:none;border-radius:24px;padding:10px 18px;font-size:14px;
        font-family:system-ui,sans-serif;font-weight:600;cursor:pointer;
        box-shadow:0 4px 16px rgba(5,150,105,0.4);transition:background 0.15s,transform 0.1s;
      }
      button:hover{background:#047857;transform:scale(1.04);}
      button:active{transform:scale(0.97);}
      svg{width:16px;height:16px;fill:currentColor;flex-shrink:0;}
    `;
    const btn = document.createElement('button');
    btn.innerHTML = `<svg viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z"/></svg>Track Job`;
    btn.addEventListener('click', onClick);
    shadow.appendChild(style);
    shadow.appendChild(btn);
    document.documentElement.appendChild(host);
    return { remove() { host.remove(); } };
  }

  // ── Panel ─────────────────────────────────────────────────────────────────

  const STATUS_OPTIONS = [
    ['applied','Applied'],['oa','OA'],['interview','Interview'],
    ['offer','Offer'],['rejected','Rejected'],['ghosted','Ghosted'],
  ];

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }

  function createPanel(scraped, onSave, onClose) {
    const host = document.createElement('div');
    host.id = 'jobtrack-panel-host';
    host.style.cssText = 'all:initial;position:fixed;top:0;right:0;width:420px;height:100vh;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      *,*::before,*::after{box-sizing:border-box;}
      .panel{display:flex;flex-direction:column;height:100vh;background:#fff;box-shadow:-4px 0 32px rgba(0,0,0,0.18);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;}
      .hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#059669;color:#fff;flex-shrink:0;}
      .hdr h2{margin:0;font-size:16px;font-weight:700;}
      .cls{background:none;border:none;color:#fff;cursor:pointer;font-size:22px;line-height:1;padding:2px 6px;border-radius:4px;}
      .cls:hover{background:rgba(255,255,255,0.2);}
      .body{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;}
      label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;}
      input,select,textarea{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;font-family:inherit;color:#111827;background:#fff;}
      input:focus,select:focus,textarea:focus{outline:2px solid #059669;outline-offset:1px;border-color:transparent;}
      textarea{resize:vertical;min-height:160px;line-height:1.5;}
      .ftr{padding:14px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;flex-shrink:0;}
      .save{flex:1;padding:10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;}
      .save:hover{background:#047857;}
      .cancel{padding:10px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:14px;cursor:pointer;}
      .cancel:hover{background:#e5e7eb;}
      .dupe{background:#fef3c7;border:1px solid #f59e0b;color:#92400e;border-radius:6px;padding:10px 12px;font-size:13px;display:none;}
    `;

    const today = new Date().toISOString().slice(0, 10);
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="hdr"><h2>Track This Job</h2><button class="cls" id="cls">&#x2715;</button></div>
      <div class="body">
        <div><label>Job Title</label><input id="p-title" type="text" value="${esc(scraped.title||'')}" placeholder="Software Engineer"></div>
        <div><label>Company</label><input id="p-company" type="text" value="${esc(scraped.company||'')}" placeholder="Acme Corp"></div>
        <div><label>Location</label><input id="p-location" type="text" value="${esc(scraped.location||'')}" placeholder="Remote / NYC"></div>
        <div><label>Applied Date</label><input id="p-date" type="date" value="${today}"></div>
        <div><label>Status</label><select id="p-status">${STATUS_OPTIONS.map(([v,l])=>`<option value="${v}"${v==='applied'?' selected':''}>${l}</option>`).join('')}</select></div>
        <div><label>Job Description</label><textarea id="p-desc">${esc(scraped.description||'')}</textarea></div>
        <div><label>Notes</label><textarea id="p-notes" style="min-height:60px"></textarea></div>
        <div class="dupe" id="p-dupe">&#9888; This looks like a duplicate — you may have already saved this posting.</div>
      </div>
      <div class="ftr"><button class="cancel" id="p-cancel">Cancel</button><button class="save" id="p-save">Save Application</button></div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);

    function g(id) { return shadow.getElementById(id); }

    function close() {
      host.remove();
      document.removeEventListener('keydown', onKey);
      onClose?.();
    }

    function showSaveError(g, msg) {
      const el = g('p-dupe');
      el.textContent = msg;
      el.style.display = 'block';
    }

    async function save() {
      const app = {
        id: crypto.randomUUID(),
        title: g('p-title').value.trim(),
        company: g('p-company').value.trim(),
        location: g('p-location').value.trim(),
        appliedAt: g('p-date').value || today,
        status: g('p-status').value,
        description: g('p-desc').value.trim(),
        notes: g('p-notes').value.trim(),
        sourceHost: location.hostname,
      };
      if (!contextValid()) {
        showSaveError(g, 'Extension was updated — please refresh this page, then save again.');
        return;
      }
      const res = await safeSend({ type: 'SAVE_APPLICATION', app });
      if (!res) {
        showSaveError(g, 'Could not save — please refresh this page and try again.');
        return;
      }
      if (res.error) {
        showSaveError(g, `Could not save: ${res.error}`);
        return;
      }
      if (res.dupe) {
        g('p-dupe').style.display = 'block';
        return;
      }
      close();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') save();
    }

    g('cls').addEventListener('click', close);
    g('p-cancel').addEventListener('click', close);
    g('p-save').addEventListener('click', save);
    document.addEventListener('keydown', onKey);
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  let pillInstance = null;
  let panelOpen = false;
  let lastUrl = location.href;

  // chrome.runtime.id becomes undefined once the extension is reloaded/updated
  // while this content script keeps running ("Extension context invalidated").
  function contextValid() {
    return Boolean(chrome.runtime && chrome.runtime.id);
  }

  // Safe wrapper: never throws. Returns the response, or null when the context
  // is gone (in which case we also tear down so we stop firing dead calls).
  async function safeSend(msg) {
    if (!contextValid()) {
      teardown();
      return null;
    }
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (_) {
      teardown();
      return null;
    }
  }

  function teardown() {
    try { navObserver.disconnect(); } catch (_) {}
    pillInstance?.remove();
    pillInstance = null;
  }

  function init() {
    if (!contextValid() || !isJobPage()) return;
    safeSend({ type: 'PAGE_DETECTED' });
    if (!pillInstance && !panelOpen) {
      pillInstance = createPill(openPanel);
    }
  }

  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    pillInstance?.remove();
    pillInstance = null;

    const scraped = scrapeCurrentPage();
    createPanel(scraped, null, () => {
      panelOpen = false;
      if (isJobPage()) pillInstance = createPill(openPanel);
    });
  }

  // SPA navigation
  const navObserver = new MutationObserver(() => {
    if (!contextValid()) { teardown(); return; }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      pillInstance?.remove();
      pillInstance = null;
      panelOpen = false;
      setTimeout(init, 800);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  init();
})();
