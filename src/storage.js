const INDEX_KEY = 'apps:index';

function appKey(id) {
  return `app:${id}`;
}

export async function getIndex() {
  const result = await chrome.storage.local.get(INDEX_KEY);
  return result[INDEX_KEY] ?? [];
}

export async function getApplication(id) {
  const result = await chrome.storage.local.get(appKey(id));
  return result[appKey(id)] ?? null;
}

export async function saveApplication(app) {
  const now = new Date().toISOString();
  const record = {
    ...app,
    createdAt: app.createdAt ?? now,
    updatedAt: now,
  };

  const index = await getIndex();
  const existingIdx = index.findIndex(e => e.id === record.id);
  const indexEntry = {
    id: record.id,
    title: record.title,
    company: record.company,
    appliedAt: record.appliedAt,
    status: record.status,
    sourceHost: record.sourceHost,
    descriptionHash: record.descriptionHash,
  };

  if (existingIdx >= 0) {
    index[existingIdx] = indexEntry;
  } else {
    index.unshift(indexEntry);
  }

  await chrome.storage.local.set({
    [appKey(record.id)]: record,
    [INDEX_KEY]: index,
  });

  return record;
}

export async function deleteApplication(id) {
  const index = await getIndex();
  const newIndex = index.filter(e => e.id !== id);
  await chrome.storage.local.remove(appKey(id));
  await chrome.storage.local.set({ [INDEX_KEY]: newIndex });
}

export async function repairIndex() {
  const all = await chrome.storage.local.get(null);
  const entries = [];
  for (const [key, val] of Object.entries(all)) {
    if (!key.startsWith('app:')) continue;
    entries.push({
      id: val.id,
      title: val.title,
      company: val.company,
      appliedAt: val.appliedAt,
      status: val.status,
      sourceHost: val.sourceHost,
      descriptionHash: val.descriptionHash,
    });
  }
  entries.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  await chrome.storage.local.set({ [INDEX_KEY]: entries });
  return entries;
}

export async function getAllApplications() {
  const index = await getIndex();
  const keys = index.map(e => appKey(e.id));
  if (!keys.length) return [];
  const result = await chrome.storage.local.get(keys);
  return keys.map(k => result[k]).filter(Boolean);
}
