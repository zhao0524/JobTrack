export function createPill(onClick) {
  const host = document.createElement('div');
  host.id = 'jobtrack-pill-host';
  host.style.cssText = 'all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    button {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 24px;
      padding: 10px 18px;
      font-size: 14px;
      font-family: system-ui, sans-serif;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(79,70,229,0.4);
      transition: background 0.15s, transform 0.1s;
    }
    button:hover { background: #4338ca; transform: scale(1.04); }
    button:active { transform: scale(0.97); }
    svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }
  `;

  const btn = document.createElement('button');
  btn.innerHTML = `<svg viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v6h6a1 1 0 110 2h-6v6a1 1 0 11-2 0v-6H3a1 1 0 110-2h6V3a1 1 0 011-1z"/></svg>Track Job`;
  btn.addEventListener('click', onClick);

  shadow.appendChild(style);
  shadow.appendChild(btn);
  document.documentElement.appendChild(host);

  return {
    remove() { host.remove(); },
    host,
  };
}
