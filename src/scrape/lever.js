export const lever = {
  match(url) {
    return url.hostname === 'jobs.lever.co';
  },
  scrape(doc) {
    const sections = [...doc.querySelectorAll('.section-wrapper .section')];
    const description = sections.map(s => s.innerText.trim()).join('\n\n');

    const titleEl = doc.querySelector('h2') || doc.querySelector('.posting-headline h2');
    const title = titleEl ? titleEl.innerText.trim() : '';

    const companyEl = doc.querySelector('.main-header-logo img');
    const company = companyEl ? (companyEl.alt || '') : '';

    const locationEl = doc.querySelector('.sort-by-location .location') ||
      doc.querySelector('.posting-categories .location');
    const location = locationEl ? locationEl.innerText.trim() : '';

    return { title, company, location, description };
  },
};
