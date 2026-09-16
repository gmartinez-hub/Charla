import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const turn = () => new Promise(resolve => setImmediate(resolve));
function element() {
  const handlers = new Map();
  const classes = new Set();
  const attributes = new Map();
  return {
    handlers, classes, attributes, style: {}, dataset: {}, hidden: false, disabled: false, value: 'auto',
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
    setAttribute(name, value) { attributes.set(name, value); },
    addEventListener(name, callback) { handlers.set(name, callback); },
    click() { if (!this.disabled) handlers.get('click')?.(); },
  };
}

test('HTML retains 24 ordered slides and the changed legacy indexes match the app contract', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const slides = html.split(/<div class="slide(?: active| sec)?">/).slice(1);
  assert.equal(slides.length, 24);
  assert.match(slides[4], /Mangos → Metas → Nueva meta/);
  assert.match(slides[11], /Mangos → Importar → CSV/);
  assert.match(slides[12], /Qué cambió/);
  assert.match(slides[19], /tasa ilustrativa fija/);
  assert.match(slides[21], /Indicadores y contexto financiero/);
  assert.match(slides[23], /Volvé a Resumen/);
  assert.doesNotMatch(slides[23], /Scanner IA/);
});

test('browser wiring navigates offline, starts only on click and reports returned write failures', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], element()]));
  const slides = Array.from({ length: 24 }, element);
  const documentEvents = new Map();
  const windowEvents = new Map();
  let clientCalls = 0;
  const writes = [];
  const saved = { document: globalThis.document, window: globalThis.window, supabase: globalThis.supabase };
  globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: id => elements.get(id),
    querySelectorAll: selector => { assert.equal(selector, '#deck > .slide'); return slides; },
    addEventListener: (name, callback) => documentEvents.set(name, callback),
  };
  globalThis.window = { addEventListener: (name, callback) => windowEvents.set(name, callback) };
  globalThis.supabase = {
    createClient() {
      clientCalls++;
      return { from(table) {
        assert.equal(table, 'charla_state');
        return { upsert(payload) { return new Promise(resolve => writes.push({ payload, resolve })); } };
      } };
    },
  };
  try {
    await import('../presentation.mjs');
    assert.equal(clientCalls, 0);
    assert.equal(writes.length, 0);
    assert.equal(elements.get('sync-status').textContent, 'Modo local');
    elements.get('next-slide').click(); elements.get('next-slide').click(); elements.get('previous-slide').click();
    assert.equal(elements.get('ct').textContent, '02 / 24');
    assert.equal(slides[1].inert, false);
    assert.equal(slides[0].inert, true);
    documentEvents.get('keydown')({ key: ' ', target: { closest: () => ({}) }, preventDefault() { throw new Error('Button space must not advance deck'); } });
    assert.equal(elements.get('ct').textContent, '02 / 24');
    elements.get('start-sync').click();
    assert.equal(elements.get('sync-status').textContent, 'Iniciando…');
    await turn();
    assert.equal(clientCalls, 1);
    assert.equal(writes[0].payload.slide, 1);
    writes[0].resolve({ error: { message: 'denied' } }); await turn();
    assert.equal(elements.get('sync-status').textContent, 'Sin confirmar');
    assert.equal(elements.get('retry-sync').hidden, false);
    elements.get('retry-sync').click(); await turn();
    writes[1].resolve({ error: null }); await turn();
    assert.equal(elements.get('sync-status').textContent, 'Conectado');
    elements.get('stop-sync').click(); await turn();
    assert.equal(writes[2].payload.active, false);
    writes[2].resolve({ error: null }); await turn();
    assert.equal(elements.get('sync-status').textContent, 'Sincronización detenida');
    elements.get('theme').value = 'USD'; elements.get('theme').handlers.get('change')();
    assert.equal(document.documentElement.dataset.currency, 'USD');
    assert.equal(writes.length, 3, 'theme never publishes financial data');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  }
});
