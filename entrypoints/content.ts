// Content script: detects Swagger UI pages, notifies background, relays captured requests

import { detectSwaggerPage } from '../src/detection/detector';
import { sendMessage } from '../src/utils/messaging';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Attach the captured-request relay exactly once, regardless of how many
    // times detection fires (SPA navigation + retry loop would otherwise
    // register duplicate listeners and store N history rows per request).
    listenForCapturedRequests();

    // Retry detection with increasing delays for slow-rendering pages
    const delays = [500, 1500, 3000, 6000];
    let detected = false;

    function tryDetect() {
      if (detected) return;
      const result = detectSwaggerPage();
      if (result.detected) {
        detected = true;
        sendMessage({
          type: 'SWAGGER_DETECTED',
          payload: {
            url: window.location.href,
            specUrl: result.specUrl,
            specUrls: result.specUrls,
            configUrl: result.configUrl,
            title: result.title,
            version: result.version,
            spec: null,
          },
        });
      }
    }

    for (const delay of delays) {
      setTimeout(tryDetect, delay);
    }

    // Also watch for SPA navigation
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        detected = false;
        for (const delay of delays) {
          setTimeout(tryDetect, delay);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },
});

/**
 * Listen for intercepted requests from the MAIN world and relay to background.
 */
let captureListenerAttached = false;
function listenForCapturedRequests() {
  if (captureListenerAttached) return;
  captureListenerAttached = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== '__SWAGGER_FLOW_REQUEST__') return;
    sendMessage({
      type: 'SWAGGER_REQUEST_CAPTURED',
      payload: event.data.payload,
    }).catch(() => {});
  });
}
