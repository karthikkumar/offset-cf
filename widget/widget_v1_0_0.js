const currentScript = document.currentScript || document.querySelector('script[data-config]');

// ---- Endpoints using data-* attributes ----
const STORE_DOMAIN = (window.Shopify && window.Shopify.shop) || window.location.host;
const API_VERSION = currentScript?.dataset?.apiVersion || 'v1';
const API_BASE = currentScript?.dataset?.apiBase || 'https://api.offsetcf.com';
const ESTIMATE_URL = currentScript?.dataset?.estimateUrl || 'https://estimate.offsetcf.com';
const CONFIG_URL = currentScript?.dataset?.config
  || (API_BASE ? `${API_BASE}/${API_VERSION}/widget-config?store=${encodeURIComponent(STORE_DOMAIN)}` : '')
  || 'https://widget.offsetcf.com/config_v1_0_0.json';

(() => {
  if (window.__offsetCfWidgetLoaded) return;
  window.__offsetCfWidgetLoaded = true;

  const log = (...args) => console.debug('[offset-cf-widget]', ...args);

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  const isInNotification = (el) => !!(el && (el.closest('cart-notification') || el.closest('#cart-notification')));

  const getMain = () => document.querySelector('main#MainContent') || document.querySelector('main') || document.body;

  // Wait for ANY of the selectors to appear under the given root (not in notification)
  const waitForIn = (root, selectors, { timeout = 5000 } = {}) =>
    new Promise((resolve, reject) => {
      const tryFind = () => {
        for (const sel of selectors) {
          const el = root.querySelector(sel);
          if (el && !isInNotification(el)) return el;
        }
        return null;
      };
      const existing = tryFind();
      if (existing) return resolve(existing);

      const obs = new MutationObserver(() => {
        const el = tryFind();
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      obs.observe(root, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        const fallback = tryFind();
        fallback ? resolve(fallback) : reject(new Error(`Timeout waiting for ${selectors.join(', ')}`));
      }, timeout);
    });

  // ---- Helpers: fetch config, estimate, and post opt-in ----
  async function fetchConfig() {
    log('fetching config');
    let cfg = { placement: null, verbiage: 'to offset my carbon footprint', theme: {}, insert_position: 'before', is_enabled: true };
    try {
      if (!CONFIG_URL) { log('CONFIG_URL not set; using defaults'); return cfg; }
      const res = await fetch(CONFIG_URL, { credentials: 'omit' });
      if (res.ok) cfg = await res.json();
      else log('config fetch non-200', res.status);
    } catch (e) { log('config fetch failed', e); }
    return cfg;
  }

  async function fetchEstimate(subtotal, currency) {
    log('fetching estimate');
    // Fallback local estimate if no ESTIMATE_URL
    const local = () => {
      const rate = 0.02;
      const est = Number((subtotal * rate).toFixed(3));
      return { estimated_offset: est, rate, currency, estimator_version: 'local', updated_at: new Date().toISOString() };
    };
    if (!ESTIMATE_URL) return local();
    try {
      const res = await fetch(ESTIMATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ subtotal, currency })
      });
      if (!res.ok) { log('estimate non-200', res.status); return local(); }
      const data = await res.json();
      // expected: { estimated_offset, rate, currency, estimator_version, updated_at }
      if (typeof data.estimated_offset !== 'number') return local();
      return data;
    } catch (e) {
      log('estimate fetch failed', e);
      return local();
    }
  }

  async function postOptIn(payload) {
    if (!API_BASE) { log('API_BASE not set; cannot POST opt-in'); return; }
    try {
      const url = `${API_BASE}/${API_VERSION}/opt-ins`;
      const bodyStr = JSON.stringify(payload);
  
      // Prefer sendBeacon so the POST survives navigation to checkout
      if (navigator.sendBeacon) {
        const blob = new Blob([bodyStr], { type: 'text/plain;charset=UTF-8' });
        const ok = navigator.sendBeacon(url, blob);
        if (ok) return; // done
        log('sendBeacon returned false; falling back to fetch');
      }
  
      // Fallback: keepalive fetch using a CORS-simple request (no preflight)
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: bodyStr,
        keepalive: true,
        credentials: 'omit',
        mode: 'cors'
      }).catch((e) => log('opt-in post failed', e));
    } catch (e) { log('opt-in post threw', e); }
  }

  onReady(async () => {
    try {
      // Only run on full cart page
      const isCartTemplate = document.body.classList.contains('template-cart') || /\/cart(\?|$)/.test(location.pathname);
      if (!isCartTemplate) { log('Not a full cart page; exiting.'); return; }

      const main = getMain();

      // Find a proper cart root inside MAIN (exclude cart-notification/drawer)
      const rootSelectors = [
        '#main-cart-items',
        'cart-items',
        'form[action="/cart"]:not(#cart-notification-form)', // exclude notification form
        '#cart',
        '.cart__items'
      ];

      let cartRoot;
      try { cartRoot = await waitForIn(main, rootSelectors, { timeout: 4000 }); }
      catch { cartRoot = main; }

      // Create widget container + styles
      const mount = document.createElement('div');
      mount.id = 'offset-cf-widget';
      mount.setAttribute('role', 'region');
      mount.setAttribute('aria-label', 'offsetcf.com widget');

      const style = document.createElement('style');
      style.textContent = `
        #offset-cf-widget {
          border: 1px solid #e2e8f0; border-radius: 5px; padding: 12px; margin: 16px 0;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Arial, "Helvetica Neue";
          background: white; transition: border-color 0.2s ease;
        }
        #offset-cf-widget.checked { border-color: #10b981; }
        #offset-cf-widget .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        #offset-cf-widget small { opacity: 0.8; }
        #offset-cf-widget input[type="checkbox"] { appearance: none; width: 18px; height: 18px; border: 2px solid #d1d5db; border-radius: 2px; background: white; cursor: pointer; position: relative; transition: all 0.2s ease; }
        #offset-cf-widget input[type="checkbox"]:checked { border-color: #10b981; background: #10b981; }
        #offset-cf-widget input[type="checkbox"]:checked::after { content: '✓'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 12px; font-weight: bold; }
      `;
      document.head.appendChild(style);

      // Read subtotal from /cart.js (best-effort)
      let subtotalCents = 0, currency = 'USD';
      try {
        const cart = await fetch('/cart.js', { credentials: 'same-origin' }).then(r => r.json());
        subtotalCents = cart?.items_subtotal_price ?? cart?.total_price ?? 0;
        currency = cart?.currency || 'USD';
      } catch {
        log('failed to fetch cart.js');
      }
      const subtotal = subtotalCents / 100;

      // Fetch config + estimate
      const [config, estResp] = await Promise.all([
        fetchConfig(),
        fetchEstimate(subtotal, currency)
      ]);

      // show/hide widget based on config flags
      if (config && config.is_enabled === false) {
        log('widget disabled by config');
        return; 
      }
      const insertPos = (config && config.insert_position) || 'before';

      // Helper: insert relative to a target using config.insert_position
      const insertRelative = (target, node, position) => {
        try {
          switch (position) {
            case 'after':
              if (target.parentNode) target.parentNode.insertBefore(node, target.nextSibling);
              else if (target.insertAdjacentElement) target.insertAdjacentElement('afterend', node);
              else (target.parentNode || document.body).appendChild(node);
              break;
            case 'append':
              target.appendChild(node);
              break;
            case 'before':
            default:
              if (target.parentNode) target.parentNode.insertBefore(node, target);
              else if (target.prepend) target.prepend(node);
              else target.appendChild(node);
          }
        } catch (e) { log('insertRelative failed; fallback append', e); (target.parentNode || target || document.body).appendChild(node); }
      };

      // Render
      const amountStr = subtotal ? `${estResp.estimated_offset.toFixed(2)}` : '--';
      mount.innerHTML = `
        <div class="row">
          <label style="display:flex;align-items:center;gap:8px;">
            <input id="offset-cf-widget-toggle" type="checkbox" aria-label="opt-in to offset my carbon footprint"/>
            <small>$${amountStr} ${config.verbiage || 'to offset my carbon footprint'}</small>
          </label>
        </div>
      `;

      // Mount near totals/checkout
      const findAndMountAtAnchor = (cartRoot, mount) => {
        const anchorSelectors = ['#main-cart-footer', 'cart-footer', '.cart__footer', '.totals'];
        let anchor = null;
        for (const sel of anchorSelectors) {
          const el = cartRoot.querySelector(sel);
          if (el && !isInNotification(el)) { anchor = el; break; }
        }
        if (anchor) {
          insertRelative(anchor, mount, insertPos);
        } else {
          cartRoot.appendChild(mount);
        }
      };

      if (config.placement) {
        const preferred = document.querySelector(config.placement);
        if (preferred && !preferred.closest('cart-notification')) {
          insertRelative(preferred, mount, insertPos);
        } else {
          findAndMountAtAnchor(cartRoot, mount);
        }
      } else {
        findAndMountAtAnchor(cartRoot, mount);
      }

      const toggle = document.getElementById('offset-cf-widget-toggle');
      toggle?.addEventListener('change', (e) => {
        const optedIn = !!e.target.checked;
        const widget = document.getElementById('offset-cf-widget');
        widget?.classList.toggle('checked', optedIn);
        log('opt-in changed (cart page):', { optedIn, estimate: estResp.estimated_offset, currency });
      });

      // On checkout submit, if opted in, POST an opt-in (fire-and-forget)
      const cartForm = cartRoot.closest('form[action="/cart"]') || cartRoot.querySelector('form[action="/cart"]');
      if (cartForm) {
        cartForm.addEventListener('submit', (ev) => {
          const submitter = ev.submitter || document.activeElement;
          const goingToCheckout = submitter && submitter.getAttribute('name') === 'checkout';
          const checked = !!document.getElementById('offset-cf-widget-toggle')?.checked;
          if (goingToCheckout && checked) {
            const payload = {
              store: STORE_DOMAIN,
              cart: { subtotal, currency },
              estimated_offset: Number(estResp.estimated_offset),
              estimator_version: estResp.estimator_version || 'unknown',
              updated_at: estResp.updated_at || new Date().toISOString(),
              session_id: (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || String(Date.now())
            };
            postOptIn(payload);
          }
        }, true);
      }

      // Re-mount if a Shopify section reload wipes our node
      document.addEventListener('shopify:section:load', () => {
        if (!document.getElementById('offset-cf-widget')) {
          const spot = cartRoot.querySelector('#main-cart-footer, cart-footer, .cart__footer, .totals') || cartRoot;
          insertRelative(spot, mount, insertPos);
        }
      });

      log('Mounted in main cart page:', { inNotification: isInNotification(mount) });
    } catch (err) {
      console.error('[offset-cf-widget] failed on cart page', err);
    }
  });
})();
