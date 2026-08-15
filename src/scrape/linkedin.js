export const linkedin = {
  match(url) {
    return url.hostname.endsWith('linkedin.com');
  },
  scrape(doc) {
    const descEl =
      doc.querySelector('.jobs-description__content') ||
      doc.querySelector('#job-details');
    const description = descEl ? descEl.innerText.trim() : '';

    let title = '';
    let company = '';

    const titleEl = doc.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
      doc.querySelector('.jobs-unified-top-card__job-title') ||
      doc.querySelector('h1.t-24');
    if (titleEl) title = titleEl.innerText.trim();

    const companyEl = doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
      doc.querySelector('.jobs-unified-top-card__company-name a') ||
      doc.querySelector('.topcard__org-name-link');
    if (companyEl) company = companyEl.innerText.trim();

    const locationEl = doc.querySelector('.job-details-jobs-unified-top-card__primary-description-without-tagline') ||
      doc.querySelector('.jobs-unified-top-card__bullet');
    const location = locationEl ? locationEl.innerText.trim() : '';

    return { title, company, location, description };
  },
};
