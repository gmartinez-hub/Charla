/** Pure presentation and ordered publishing state; no DOM, timers or automatic I/O. */
export function createPresentationController({ total = 24, transport, now = () => new Date(), onChange = () => {} } = {}) {
  if (!Number.isInteger(total) || total < 1) throw new Error('A presentation needs at least one slide');
  let state = { index: 0, total, syncRequested: false, status: 'idle', confirmedSlide: null, mayBeLive: false, error: null };
  let pending = null;
  let lastIntent = null;
  let writing = false;
  let sequence = 0;
  const publish = patch => { state = { ...state, ...patch }; onChange(state); };

  async function flush() {
    if (writing || !pending) return;
    writing = true;
    // There is only one in-flight write. Newer pending slides replace older ones.
    while (pending) {
      const request = pending;
      pending = null;
      if (request.payload.active) publish({ mayBeLive: true });
      try {
        const response = await transport.write(request.payload);
        if (response?.error) throw response.error;
        if (request.sequence === sequence) {
          publish({ status: request.payload.active ? 'connected' : 'stopped', confirmedSlide: request.payload.slide, mayBeLive: request.payload.active, error: null });
        }
      } catch {
        if (request.sequence === sequence) publish({ status: 'error', error: request.payload.active ? 'No se pudo confirmar la sincronización.' : 'No se pudo confirmar la detención. Reintentá antes de cerrar.' });
      }
    }
    writing = false;
  }

  function enqueue(active, slide = state.index) {
    lastIntent = { active, slide };
    pending = { sequence: ++sequence, payload: { id: 'live', slide, active, updated_at: now().toISOString() } };
    publish({ status: active ? (state.confirmedSlide === null ? 'starting' : 'syncing') : 'stopping', error: null });
    void flush();
  }

  function goTo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= total || index === state.index) return;
    publish({ index });
    if (state.syncRequested) enqueue(true, index);
  }

  return {
    getState: () => state,
    goTo,
    next: () => goTo(state.index + 1),
    previous: () => goTo(state.index - 1),
    start() {
      if (state.syncRequested) return;
      publish({ syncRequested: true });
      enqueue(true);
    },
    stop() {
      if ((!state.syncRequested && !state.mayBeLive) || state.status === 'stopping') return;
      publish({ syncRequested: false });
      enqueue(false);
    },
    retry() {
      if (state.status !== 'error' || !lastIntent) return;
      enqueue(lastIntent.active, lastIntent.slide);
    },
  };
}
