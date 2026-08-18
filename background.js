import { MSG } from './src/messages.js';
import {
  saveApplication,
  getApplication,
  getIndex,
  deleteApplication,
  repairIndex,
  getAllApplications,
  wipeAll,
} from './src/storage.js';
import { sha256 } from './src/util/hash.js';
import { toCSV } from './src/util/csv.js';

// Badge state per tab
const tabJobState = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => {
    console.error('[jobtrack] message error:', err);
    sendResponse({ error: err.message });
  });
  return true; // async
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case MSG.SAVE_APPLICATION: {
      const app = msg.app;
      if (!app.id) app.id = crypto.randomUUID();
      if (!app.appliedAt) app.appliedAt = new Date().toISOString().slice(0, 10);
      if (app.description && !app.descriptionHash) {
        app.descriptionHash = await sha256(app.description);
      }
      // Dupe check
      const index = await getIndex();
      const dupe = index.find(e => e.descriptionHash && e.descriptionHash === app.descriptionHash && e.id !== app.id);
      const saved = await saveApplication(app);
      return { ok: true, app: saved, dupe: dupe || null };
    }

    case MSG.UPDATE_APPLICATION: {
      const existing = await getApplication(msg.app.id);
      if (!existing) return { ok: false, error: 'Not found' };
      const updated = { ...existing, ...msg.app };
      if (msg.app.description) {
        updated.descriptionHash = await sha256(msg.app.description);
      }
      const saved = await saveApplication(updated);
      return { ok: true, app: saved };
    }

    case MSG.DELETE_APPLICATION: {
      await deleteApplication(msg.id);
      clearAlarm(msg.id);
      return { ok: true };
    }

    case MSG.GET_INDEX: {
      const index = await getIndex();
      return { ok: true, index };
    }

    case MSG.GET_APPLICATION: {
      const app = await getApplication(msg.id);
      return { ok: true, app };
    }

    case MSG.GET_ALL: {
      const apps = await getAllApplications();
      return { ok: true, apps };
    }

    case MSG.REPAIR_INDEX: {
      const index = await repairIndex();
      return { ok: true, index };
    }

    case MSG.EXPORT_JSON: {
      const apps = await getAllApplications();
      return { ok: true, data: JSON.stringify(apps, null, 2) };
    }

    case MSG.IMPORT_JSON: {
      const apps = JSON.parse(msg.data);
      for (const app of apps) {
        if (!app.id) app.id = crypto.randomUUID();
        if (app.description && !app.descriptionHash) {
          app.descriptionHash = await sha256(app.description);
        }
        await saveApplication(app);
      }
      return { ok: true, count: apps.length };
    }

    case MSG.WIPE_ALL: {
      await wipeAll();
      return { ok: true };
    }

    case MSG.PAGE_DETECTED: {
      const tabId = sender.tab?.id;
      if (tabId) {
        tabJobState.set(tabId, true);
        chrome.action.setBadgeText({ text: 'NEW', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#059669', tabId });
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message type: ${msg.type}` };
  }
}

// Clear badge when tab navigates away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabJobState.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  tabJobState.delete(tabId);
});

// Follow-up alarms
const ALARM_PREFIX = 'followup:';

export function scheduleFollowup(appId, days) {
  chrome.alarms.create(`${ALARM_PREFIX}${appId}`, {
    delayInMinutes: days * 24 * 60,
  });
}

function clearAlarm(appId) {
  chrome.alarms.clear(`${ALARM_PREFIX}${appId}`);
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  const app = await getApplication(id);
  if (!app || app.status !== 'applied') return;
  // Badge the icon to signal a follow-up is due
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  chrome.action.setTitle({ title: `Follow up on: ${app.title} at ${app.company}` });
});
