const IGNORE_TAGS = new Set(['nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript']);

function textDensity(el) {
  const text = el.innerText || '';
  const links = [...el.querySelectorAll('a')].reduce((acc, a) => acc + (a.innerText || '').length, 0);
  return text.length / (1 + links);
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export const generic = {
  match() { return true; },
  scrape(doc) {
    // 1. User selection
    const sel = window.getSelection ? window.getSelection().toString().trim() : '';
    if (sel.length > 200) {
      return { description: sel };
    }

    // 2. Density heuristic
    const candidates = [...doc.querySelectorAll('div, article, section, main')]
      .filter(el => !IGNORE_TAGS.has(el.tagName.toLowerCase()))
      .filter(isVisible);

    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const score = textDensity(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best && best.innerText.length > 300) {
      return { description: best.innerText.trim() };
    }

    // 3. Fallback to body, truncated
    return { description: doc.body.innerText.slice(0, 20000).trim() };
  },
};
