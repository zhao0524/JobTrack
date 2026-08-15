export const greenhouse = {
  match(url) {
    return url.hostname === 'boards.greenhouse.io' ||
      url.hostname === 'job-boards.greenhouse.io';
  },
  scrape(doc) {
    const descEl = doc.querySelector('#content') ||
      doc.querySelector('.job__description') ||
      doc.querySelector('.job-post');
    const description = descEl ? descEl.innerText.trim() : '';

    const titleEl = doc.querySelector('h1.app-title') ||
      doc.querySelector('h1');
    const title = titleEl ? titleEl.innerText.trim() : '';

    const companyEl = doc.querySelector('.company-name') ||
      doc.querySelector('.header--cobranded .company');
    const company = companyEl ? companyEl.innerText.trim() : '';

    const locationEl = doc.querySelector('.location');
    const location = locationEl ? locationEl.innerText.trim() : '';

    return { title, company, location, description };
  },
};
