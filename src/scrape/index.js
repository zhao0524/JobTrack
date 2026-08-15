import { linkedin } from './linkedin.js';
import { workday } from './workday.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import { ashby } from './ashby.js';
import { generic } from './generic.js';

const ADAPTERS = [linkedin, workday, greenhouse, lever, ashby];

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

function fromOgTitle(doc) {
  const el = doc.querySelector('meta[property="og:title"]');
  return el ? el.content : '';
}

export function isJobPage(url, doc) {
  try {
    const u = new URL(url);
    if (ADAPTERS.some(a => a.match && a.match(u))) return true;
    if (/\/(jobs?|careers?|apply)\//i.test(u.pathname)) return true;
    if (doc.querySelector('script[type="application/ld+json"]')) {
      const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
      for (const s of scripts) {
        try {
          const d = JSON.parse(s.textContent);
          const items = Array.isArray(d) ? d : [d];
          if (items.some(i => i['@type'] === 'JobPosting')) return true;
        } catch {}
      }
    }
  } catch {}
  return false;
}

export function scrape(url, doc) {
  let urlObj;
  try { urlObj = new URL(url); } catch { urlObj = { hostname: '' }; }

  const jsonLd = fromJsonLd(doc);

  const adapter = ADAPTERS.find(a => a.match(urlObj)) || generic;
  const adapterResult = adapter.scrape(doc);

  const merged = { ...adapterResult };

  if (jsonLd) {
    if (jsonLd.title) merged.title = jsonLd.title;
    if (jsonLd.company) merged.company = jsonLd.company;
    if (jsonLd.location) merged.location = jsonLd.location;
    if (jsonLd.description && !merged.description) merged.description = jsonLd.description;
  }

  if (!merged.title) merged.title = fromOgTitle(doc) || doc.title || '';
  if (!merged.description) {
    merged.description = generic.scrape(doc).description;
  }

  merged.sourceHost = urlObj.hostname;

  return merged;
}
