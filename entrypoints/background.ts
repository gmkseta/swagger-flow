// Background service worker
// Handles: Swagger detection relay, side panel control, cross-origin fetch proxy, request capture, SSO auth

import { onMessage, type Message, type ExecuteRequestPayload } from '../src/utils/messaging';
import { encDb, type ExecutionHistory } from '../src/db';
import { provider as authProvider } from '#auth-provider';
import {
  restoreEncryptionOnStartup,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthGetStatus,
} from '../src/auth/handlers';
import { initEncryptionKey, clearEncryptionKey, isEncryptionReady } from '../src/utils/crypto';
import { checkForUpdate, type UpdateState } from '../src/utils/version-check';
import { provider as updateProvider } from '#update-provider';

const UPDATE_ALARM_NAME = 'sf-version-check';
const UPDATE_CHECK_INTERVAL_MIN = 360; // 6 hours
const UPDATE_STATE_KEY = '_update_state';

async function readUpdateState(): Promise<UpdateState | null> {
  const res = await chrome.storage.local.get(UPDATE_STATE_KEY);
  return (res[UPDATE_STATE_KEY] as UpdateState | undefined) ?? null;
}

async function writeUpdateState(state: UpdateState): Promise<void> {
  await chrome.storage.local.set({ [UPDATE_STATE_KEY]: state });
}

async function runUpdateCheck(): Promise<UpdateState> {
  const current = chrome.runtime.getManifest().version;
  const next = await checkForUpdate(current, updateProvider);
  const prev = await readUpdateState();
  // Preserve dismissal across checks unless a newer version arrived.
  if (prev?.dismissedVersion && next.latest && next.latest.version === prev.dismissedVersion) {
    next.dismissedVersion = prev.dismissedVersion;
  }
  await writeUpdateState(next);
  return next;
}

const cryptoDeps = { initEncryptionKey, clearEncryptionKey, isEncryptionReady };

export default defineBackground(() => {
  // Open side panel on extension icon click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Track which tabs have Swagger UI detected
  const swaggerTabs = new Map<number, {
    url: string;
    specUrl: string | null;
    specUrls: { url: string; name?: string }[] | null;
    configUrl: string | null;
  }>();

  // Restore encryption key from cached user on startup
  restoreEncryptionOnStartup(authProvider, cryptoDeps);

  // Periodic version check against the wiki-hosted release manifest.
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    periodInMinutes: UPDATE_CHECK_INTERVAL_MIN,
    when: Date.now() + 5_000,
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_ALARM_NAME) {
      runUpdateCheck().catch(() => { /* swallow — surfaced via stored state */ });
    }
  });

  onMessage((msg: Message, sender, sendResponse) => {
    switch (msg.type) {
      case 'SWAGGER_DETECTED': {
        const tabId = sender.tab?.id;
        if (!tabId) return;
        swaggerTabs.set(tabId, {
          url: msg.payload.url,
          specUrl: msg.payload.specUrl,
          specUrls: msg.payload.specUrls || null,
          configUrl: msg.payload.configUrl,
        });
        // Set badge to indicate detection
        chrome.action?.setBadgeText?.({ text: 'API', tabId });
        chrome.action?.setBadgeBackgroundColor?.({ color: '#6366f1', tabId });
        // Enable side panel for this swagger tab
        chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
        return;
      }

      case 'GET_ACTIVE_SPEC': {
        // Side panel asking for current tab's spec info
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          if (tabId && swaggerTabs.has(tabId)) {
            sendResponse(swaggerTabs.get(tabId));
          } else {
            sendResponse(null);
          }
        });
        return true; // async response
      }

      case 'EXECUTE_REQUEST': {
        // Proxy fetch from side panel to avoid CORS
        const req = msg.payload as ExecuteRequestPayload;
        resolveAndFetch(req, swaggerTabs)
          .then((result) => sendResponse(result))
          .catch((err) =>
            sendResponse({
              status: 0,
              statusText: 'Network Error',
              headers: {},
              body: { error: err.message },
            }),
          );
        return true; // async response
      }

      case 'SWAGGER_REQUEST_CAPTURED': {
        // Layer 2: Background-level validation — skip if tab is not a known Swagger tab
        // or if the request host doesn't match the swagger page/spec origin.
        const captureTabId = sender.tab?.id;
        if (!captureTabId || !swaggerTabs.has(captureTabId)) return;
        const tabInfo = swaggerTabs.get(captureTabId)!;
        try {
          const reqOrigin = new URL(msg.payload.request.url).origin;
          const allowedOrigins = new Set<string>();
          try { allowedOrigins.add(new URL(tabInfo.url).origin); } catch { /* ignore */ }
          if (tabInfo.specUrl) {
            try { allowedOrigins.add(new URL(tabInfo.specUrl, tabInfo.url).origin); } catch { /* ignore */ }
          }
          if (tabInfo.specUrls) {
            for (const s of tabInfo.specUrls) {
              try { allowedOrigins.add(new URL(s.url, tabInfo.url).origin); } catch { /* ignore */ }
            }
          }
          if (!allowedOrigins.has(reqOrigin)) return;
        } catch { /* unparseable URL — allow through */ }

        // Save intercepted Swagger UI request to history
        const { request, response, timestamp } = msg.payload;
        let pathname = '';
        try {
          pathname = new URL(request.url).pathname;
        } catch {
          pathname = request.url;
        }
        const history: Omit<ExecutionHistory, 'id'> = {
          shortcutId: 0, // 0 = captured from Swagger UI, not from a shortcut
          shortcutName: `${request.method} ${pathname}`,
          startedAt: timestamp,
          completedAt: Date.now(),
          status: response.status > 0 && response.status < 400 ? 'completed' : 'failed',
          steps: [
            {
              order: 1,
              status: response.status > 0 && response.status < 400 ? 'completed' : 'failed',
              request: {
                method: request.method,
                url: request.url,
                headers: request.headers || {},
                body: request.body,
              },
              response: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers || {},
                body: response.body,
              },
              startedAt: timestamp,
              completedAt: Date.now(),
            },
          ],
          envSnapshot: {},
        };
        encDb.history.add(history as ExecutionHistory).catch(() => {});
        return;
      }

      // --- Authentication ---

      case 'AUTH_LOGIN': {
        handleAuthLogin(authProvider, cryptoDeps).then(sendResponse);
        return true; // async response
      }

      case 'AUTH_LOGOUT': {
        handleAuthLogout(authProvider, cryptoDeps).then(sendResponse);
        return true;
      }

      case 'AUTH_GET_STATUS': {
        handleAuthGetStatus(authProvider, cryptoDeps).then(sendResponse);
        return true;
      }

      // --- Version check ---

      case 'GET_UPDATE_INFO': {
        readUpdateState().then(sendResponse);
        return true;
      }

      case 'TRIGGER_UPDATE_CHECK': {
        runUpdateCheck().then(sendResponse).catch((err) =>
          sendResponse({ status: 'error', current: chrome.runtime.getManifest().version, errorMessage: err?.message ?? 'unknown' }),
        );
        return true;
      }

      case 'DISMISS_UPDATE': {
        const dismissedVersion = (msg.payload as { version?: string } | undefined)?.version;
        readUpdateState().then(async (state) => {
          if (state) {
            await writeUpdateState({ ...state, dismissedVersion });
          }
          sendResponse({ ok: true });
        });
        return true;
      }
    }
  });

  // Close side panel on tab switch (user can reopen via icon click)
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
    }
  });

  // Clean up on tab close
  chrome.tabs.onRemoved.addListener((tabId) => {
    swaggerTabs.delete(tabId);
  });

  // Clean up swagger data on tab navigation (panel stays until tab switch)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      swaggerTabs.delete(tabId);
      chrome.action?.setBadgeText?.({ text: '', tabId });
    }
  });
});

// Resolve relative URLs using active tab's origin, then fetch
async function resolveAndFetch(
  req: ExecuteRequestPayload,
  swaggerTabs: Map<number, {
    url: string;
    specUrl: string | null;
    specUrls: { url: string; name?: string }[] | null;
    configUrl: string | null;
  }>,
): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: any }> {
  let url = req.url;

  // If URL is relative (starts with /), resolve against active tab's origin
  if (!url.startsWith('http')) {
    let origin = '';

    // Try swaggerTabs first (fast path)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId && swaggerTabs.has(tabId)) {
      try { origin = new URL(swaggerTabs.get(tabId)!.url).origin; } catch { /* ignore */ }
    }

    // Fallback: use the active tab's URL directly (works even after SW restart)
    if (!origin && tabs[0]?.url) {
      try { origin = new URL(tabs[0].url).origin; } catch { /* ignore */ }
    }

    if (!origin) {
      throw new Error('Cannot resolve relative URL. Open a Swagger UI page or set BASE_URL in Env.');
    }

    url = origin + url;
  }

  return executeFetch({ ...req, url });
}

async function executeFetch(
  req: ExecuteRequestPayload,
): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: any }> {
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
  };

  if (req.body && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    init.body = req.body;
  }

  const response = await fetch(req.url, init);

  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });

  let body: any;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
  };
}
