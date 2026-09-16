import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationController } from '../controller.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
const now = () => new Date('2026-09-16T18:00:00.000Z');
function writer() {
  const requests = [];
  return { requests, write(payload) { return new Promise((resolve, reject) => requests.push({ payload, resolve, reject })); } };
}

test('loading and local previous/next never publish', async () => {
  const transport = writer();
  const deck = createPresentationController({ total: 24, transport, now });
  assert.equal(deck.getState().index, 0);
  assert.equal(deck.getState().status, 'idle');
  deck.next(); deck.next(); deck.previous();
  assert.equal(deck.getState().index, 1);
  deck.goTo(-1); deck.goTo(24); deck.goTo('4');
  assert.equal(deck.getState().index, 1);
  deck.goTo(23); deck.next();
  assert.equal(deck.getState().index, 23);
  await turn();
  assert.equal(transport.requests.length, 0);
});

test('explicit start publishes the current slide; connected waits for a successful response', async () => {
  const transport = writer();
  const deck = createPresentationController({ total: 24, transport, now });
  deck.goTo(4);
  deck.start();
  assert.equal(deck.getState().status, 'starting');
  await turn();
  assert.deepEqual(transport.requests[0].payload, { id: 'live', slide: 4, active: true, updated_at: '2026-09-16T18:00:00.000Z' });
  assert.notEqual(deck.getState().status, 'connected');
  transport.requests[0].resolve({ error: null });
  await turn();
  assert.equal(deck.getState().status, 'connected');
  assert.equal(deck.getState().confirmedSlide, 4);
});

test('Supabase returned errors and network rejections never claim connection or retry automatically', async () => {
  for (const reject of [false, true]) {
    const transport = writer();
    const deck = createPresentationController({ total: 24, transport, now });
    deck.start();
    await turn();
    const failure = new Error('offline');
    if (reject) transport.requests[0].reject(failure);
    else transport.requests[0].resolve({ error: failure });
    await turn();
    assert.equal(deck.getState().status, 'error');
    assert.equal(deck.getState().confirmedSlide, null);
    assert.equal(transport.requests.length, 1);
    deck.retry();
    await turn();
    assert.equal(transport.requests.length, 2);
    transport.requests[1].resolve({ error: null });
    await turn();
    assert.equal(deck.getState().status, 'connected');
  }
});

test('rapid navigation serializes requests and writes the latest slide last, including backward navigation', async () => {
  const transport = writer();
  const deck = createPresentationController({ total: 24, transport, now });
  deck.start();
  await turn();
  deck.goTo(10); deck.goTo(11); deck.goTo(12); deck.previous();
  assert.equal(transport.requests.length, 1, 'no concurrent writes');
  assert.equal(deck.getState().index, 11);
  transport.requests[0].resolve({ error: null });
  await turn();
  assert.equal(transport.requests.length, 2);
  assert.equal(transport.requests[1].payload.slide, 11);
  assert.notEqual(deck.getState().status, 'connected', 'older confirmation is not current');
  transport.requests[1].resolve({ error: null });
  await turn();
  assert.equal(deck.getState().confirmedSlide, 11);
  assert.equal(deck.getState().status, 'connected');
});

test('stop follows an in-flight write and prevents subsequent local navigation from reactivating', async () => {
  const transport = writer();
  const deck = createPresentationController({ total: 24, transport, now });
  deck.start();
  await turn();
  deck.goTo(19);
  deck.stop();
  deck.goTo(20);
  assert.equal(deck.getState().status, 'stopping');
  transport.requests[0].resolve({ error: null });
  await turn();
  assert.deepEqual(transport.requests[1].payload, { id: 'live', slide: 19, active: false, updated_at: '2026-09-16T18:00:00.000Z' });
  transport.requests[1].resolve({ error: null });
  await turn();
  assert.equal(deck.getState().status, 'stopped');
  deck.next(); deck.previous();
  await turn();
  assert.equal(transport.requests.length, 2);
});

test('a failed stop remains visible and can be explicitly retried without reactivating', async () => {
  const transport = writer();
  const deck = createPresentationController({ total: 24, transport, now });
  deck.start();
  await turn(); transport.requests[0].resolve({ error: null }); await turn();
  deck.stop();
  await turn(); transport.requests[1].resolve({ error: new Error('unavailable') }); await turn();
  assert.equal(deck.getState().status, 'error');
  assert.equal(deck.getState().syncRequested, false);
  assert.equal(deck.getState().mayBeLive, true);
  deck.retry();
  await turn();
  assert.equal(transport.requests[2].payload.active, false);
  transport.requests[2].resolve({ error: null }); await turn();
  assert.equal(deck.getState().mayBeLive, false);
  assert.equal(deck.getState().status, 'stopped');
});

test('stop before starting makes no remote request; repeated start while publishing is idempotent', async () => {
  const transport = writer();
  const deck = createPresentationController({ total: 24, transport, now });
  deck.stop();
  assert.equal(transport.requests.length, 0);
  deck.start(); deck.start(); deck.start();
  await turn();
  assert.equal(transport.requests.length, 1);
  transport.requests[0].resolve({ error: null }); await turn();
  assert.equal(deck.getState().status, 'connected');
});
