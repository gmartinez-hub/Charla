import { createPresentationController } from './controller.mjs';
import { SUPABASE_CONFIG } from './config.mjs';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js';
const SDK_INTEGRITY = 'sha384-qafw21c/iciq0VXsi9FzkfoQv5I/V0iqE4lSNcKXPnW9/UTJLnv5CcN4FHxVLnKg';
let sdkPromise;
let client;

// Loaded only after an explicit request to start publishing. Local slides work offline.
function loadSupabase() {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => globalThis.supabase?.createClient ? resolve(globalThis.supabase) : fail();
    script.onerror = fail;
    function fail() { script.remove(); sdkPromise = undefined; reject(new Error('No se pudo cargar la conexión')); }
    document.head.append(script);
  });
  return sdkPromise;
}

const transport = {
  async write(payload) {
    if (!client) {
      const { createClient } = await loadSupabase();
      client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    return client.from('charla_state').upsert(payload);
  },
};

const slides = Array.from(document.querySelectorAll('#deck > .slide'));
const previousButton = document.getElementById('previous-slide');
const nextButton = document.getElementById('next-slide');
const startButton = document.getElementById('start-sync');
const stopButton = document.getElementById('stop-sync');
const retryButton = document.getElementById('retry-sync');
const statusLabel = document.getElementById('sync-status');
const liveIndicator = document.getElementById('live');
const themeSelect = document.getElementById('theme');
let renderedIndex = -1;
let selectedTheme = 'auto';

function applyTheme(index) {
  const theme = selectedTheme === 'auto' ? (index === 19 ? 'USD' : 'ARS') : selectedTheme;
  document.documentElement.dataset.currency = theme;
}

const statusText = {
  idle: 'Modo local',
  starting: 'Iniciando…',
  syncing: 'Sincronizando…',
  connected: 'Conectado',
  stopping: 'Deteniendo…',
  stopped: 'Sincronización detenida',
  error: 'Sin confirmar',
};

function render(state) {
  if (renderedIndex !== state.index) {
    for (const [index, slide] of slides.entries()) {
      const active = index === state.index;
      slide.classList.toggle('active', active);
      slide.inert = !active;
      slide.setAttribute('aria-hidden', String(!active));
      if (active) slide.scrollTop = 0;
    }
    renderedIndex = state.index;
    applyTheme(state.index);
    document.title = `Mangos · ${state.index + 1}/${state.total} · Finanzas personales`;
  }
  document.getElementById('prog').style.width = `${state.index / Math.max(1, state.total - 1) * 100}%`;
  document.getElementById('ct').textContent = `${String(state.index + 1).padStart(2, '0')} / ${String(state.total).padStart(2, '0')}`;
  previousButton.disabled = state.index === 0;
  nextButton.disabled = state.index === state.total - 1;
  startButton.hidden = state.syncRequested || state.status === 'stopping';
  stopButton.hidden = !state.syncRequested && !state.mayBeLive;
  stopButton.disabled = state.status === 'stopping';
  retryButton.hidden = state.status !== 'error';
  liveIndicator.dataset.status = state.status;
  statusLabel.textContent = statusText[state.status];
  const message = document.getElementById('sync-message');
  message.textContent = state.error || (state.syncRequested ? 'Sólo siguen la charla quienes activaron la guía en Mangos.' : 'Las flechas funcionan sin conexión.');
}

const deck = createPresentationController({ total: slides.length, transport, onChange: render });
previousButton.addEventListener('click', deck.previous);
nextButton.addEventListener('click', deck.next);
startButton.addEventListener('click', deck.start);
stopButton.addEventListener('click', deck.stop);
retryButton.addEventListener('click', deck.retry);
themeSelect.addEventListener('change', () => { selectedTheme = themeSelect.value; applyTheme(deck.getState().index); });

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('button,select,input,textarea,a,[contenteditable="true"]')) return;
  if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(event.key)) { event.preventDefault(); deck.next(); }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); deck.previous(); }
  if (event.key === 'Home' || event.key === 'Escape') { event.preventDefault(); deck.goTo(0); }
  if (event.key === 'End') { event.preventDefault(); deck.goTo(slides.length - 1); }
});

let touchStart;
const deckElement = document.getElementById('deck');
deckElement.addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || event.target.closest('button,select,input,textarea,a')) { touchStart = null; return; }
  touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
deckElement.addEventListener('touchend', event => {
  if (!touchStart || !event.changedTouches[0]) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) dx < 0 ? deck.next() : deck.previous();
}, { passive: true });

// No unload write: its delivery cannot be confirmed. The presenter stops explicitly.
window.addEventListener('beforeunload', event => {
  if (!deck.getState().mayBeLive && !deck.getState().syncRequested) return;
  event.preventDefault();
  event.returnValue = '';
});

render(deck.getState());
