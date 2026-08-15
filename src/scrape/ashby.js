export const ashby = {
  match(url) {
    return url.hostname.endsWith('.ashbyhq.com');
  },
  scrape(doc) {
    const descEl = doc.querySelector('[class*="descriptionText"]') ||
      doc.querySelector('[class*="jobDescription"]');
    const description = descEl ? descEl.innerText.trim() : '';

    const titleEl = doc.querySelector('h1');
    const title = titleEl ? titleEl.innerText.trim() : '';

    const companyEl = doc.querySelector('[class*="companyName"]') ||
      doc.querySelector('header [class*="company"]');
    const company = companyEl ? companyEl.innerText.trim() : '';

    const locationEl = doc.querySelector('[class*="location"]');
    const location = locationEl ? locationEl.innerText.trim() : '';

    return { title, company, location, description };
  },
};
