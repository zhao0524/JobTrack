export const workday = {
  match(url) {
    return url.hostname.endsWith('.myworkdayjobs.com');
  },
  scrape(doc) {
    const descEl = doc.querySelector('[data-automation-id="jobPostingDescription"]');
    const description = descEl ? descEl.innerText.trim() : '';

    const titleEl = doc.querySelector('[data-automation-id="jobPostingHeader"]') ||
      doc.querySelector('h2[data-automation-id]');
    const title = titleEl ? titleEl.innerText.trim() : '';

    const companyEl = doc.querySelector('[data-automation-id="jobPostingCompanyName"]');
    const company = companyEl ? companyEl.innerText.trim() : '';

    const locationEl = doc.querySelector('[data-automation-id="locations"]');
    const location = locationEl ? locationEl.innerText.trim() : '';

    return { title, company, location, description };
  },
};
