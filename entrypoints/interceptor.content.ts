// MAIN world content script: patches fetch & XHR at document_start
// Captures API requests from Swagger UI:
// - POST/PUT/PATCH/DELETE: always captured (clearly user-initiated API calls)
// - GET: only captured after Execute button click (to avoid spec/config fetches)

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    if ((window as any).__swaggerFlowIntercepted) return;
    (window as any).__swaggerFlowIntercepted = true;

    const SKIP_EXT = /\.(js|css|html|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|ico|map|wasm)(\?|$)/i;
    const SKIP_SPEC = /(\/api-docs(\.json)?|\/swagger[\-\.\/]|\/openapi\.|\/swagger-resources|\/swagger-config|\/v\d+\/api-docs|\/webjars\/)/i;
    const SKIP_TRACKING = /\/ins\/\d+\/|\/collect\?|\/analytics|\/beacon|\/telemetry|\/log-event|\/track\b|google-analytics\.com|googletagmanager\.com|sentry\.io|hotjar\.com|clarity\.ms|amplitude\.com|mixpanel\.com|segment\.(com|io)|datadoghq\.|newrelic\.com/i;
    const SKIP_ERROR_REPORTING = /\/(?:jserrors|events)\/\d+\/[a-z0-9]+(?:[/?#]|$)/i;

    // Track Execute button clicks for GET request capture
    let executeClicked = false;
    let executeTimer: ReturnType<typeof setTimeout> | null = null;

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('button.execute') ||
          target.closest('.execute-wrapper button') ||
          (target.tagName === 'BUTTON' && target.textContent?.trim() === 'Execute')
        ) {
          executeClicked = true;
          if (executeTimer) clearTimeout(executeTimer);
          executeTimer = setTimeout(() => {
            executeClicked = false;
          }, 5000);
        }
      },
      true,
    );

    function shouldCapture(method: string, url: string): boolean {
      // Skip static resources and extension URLs
      if (SKIP_EXT.test(url) || url.startsWith('chrome-extension://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return false;
      }
      // Skip known spec/swagger URLs for any method
      if (SKIP_SPEC.test(url)) return false;
      // Skip analytics/tracking/telemetry requests
      if (SKIP_TRACKING.test(url)) return false;
      // Skip client-side error/event reporting endpoints that pollute history
      if (SKIP_ERROR_REPORTING.test(url)) return false;
      // POST, PUT, PATCH, DELETE = always capture (user-initiated API calls)
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        return true;
      }
      // GET = only capture if Execute button was just clicked
      return executeClicked;
    }

    function postCapture(
      method: string,
      url: string,
      reqHeaders: Record<string, string>,
      reqBody: string | undefined,
      status: number,
      statusText: string,
      resHeaders: Record<string, string>,
      resBody: any,
      ts: number,
    ) {
      window.postMessage(
        {
          type: '__SWAGGER_FLOW_REQUEST__',
          payload: {
            request: { method: method.toUpperCase(), url, headers: reqHeaders, body: reqBody },
            response: { status, statusText, headers: resHeaders, body: resBody },
            timestamp: ts,
          },
        },
        '*',
      );
    }

    // --- Patch fetch ---
    const _fetch = window.fetch;
    window.fetch = async function (...args: [RequestInfo | URL, RequestInit?]) {
      const input = args[0];
      const init = args[1];
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request)?.url || '';
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

      if (!shouldCapture(method, url)) return _fetch.apply(this, args);

      // Reset execute flag after capturing
      executeClicked = false;
      if (executeTimer) {
        clearTimeout(executeTimer);
        executeTimer = null;
      }

      const reqHeaders: Record<string, string> = {};
      try {
        new Headers(init?.headers || (input instanceof Request ? input.headers : {})).forEach(
          (v, k) => { reqHeaders[k] = v; },
        );
      } catch {}
      const body = init?.body ? String(init.body) : undefined;
      const ts = Date.now();

      try {
        const response = await _fetch.apply(this, args);
        const clone = response.clone();
        clone
          .text()
          .then((text) => {
            let parsed: any;
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            const resHeaders: Record<string, string> = {};
            response.headers.forEach((v, k) => { resHeaders[k] = v; });
            postCapture(method, url, reqHeaders, body, response.status, response.statusText, resHeaders, parsed, ts);
          })
          .catch(() => {});
        return response;
      } catch (err: any) {
        postCapture(method, url, reqHeaders, body, 0, 'Network Error', {}, { error: err.message }, ts);
        throw err;
      }
    };

    // --- Patch XMLHttpRequest ---
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;
    const _setHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
      const urlStr = typeof url === 'string' ? url : url.href;
      (this as any).__sf = {
        method: method.toUpperCase(),
        url: urlStr,
        headers: {} as Record<string, string>,
        ts: Date.now(),
        capture: shouldCapture(method.toUpperCase(), urlStr),
      };
      if ((this as any).__sf.capture) {
        executeClicked = false;
        if (executeTimer) {
          clearTimeout(executeTimer);
          executeTimer = null;
        }
      }
      return _open.apply(this, [method, url, ...rest] as any);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
      if ((this as any).__sf) {
        (this as any).__sf.headers[name] = value;
      }
      return _setHeader.apply(this, [name, value]);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = (this as any).__sf;
      if (!meta?.capture) return _send.apply(this, [body]);

      meta.body = body ? String(body) : undefined;

      this.addEventListener('load', function () {
        const resHeaders: Record<string, string> = {};
        (this.getAllResponseHeaders() || '')
          .trim()
          .split('\r\n')
          .forEach((line) => {
            const idx = line.indexOf(':');
            if (idx > 0) resHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
          });
        let resBody: any;
        try { resBody = JSON.parse(this.responseText); } catch { resBody = this.responseText; }
        postCapture(meta.method, meta.url, meta.headers, meta.body, this.status, this.statusText, resHeaders, resBody, meta.ts);
      });

      return _send.apply(this, [body]);
    };
  },
});
