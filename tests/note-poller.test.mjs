import test from 'node:test';
import assert from 'node:assert/strict';
import { NotePoller } from '../note-poller.mjs';
import { defaults, receiveText } from '../note-core.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const response = data => ({ ok: true, json: async () => ({ data }) });

test('polling the same response preserves edits and does not cache API requests', async () => {
  const state = { ...defaults };
  let value = 'perro';
  const poller = new NotePoller({
    readCode: () => 'ABC',
    onText: text => receiveText(state, text),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://appmaz.vip/api/getdata.php?user=abc');
      assert.equal(options.cache, 'no-store');
      return response(value);
    },
  });
  await poller.poll();
  state.body = 'perros';
  await poller.poll();
  assert.equal(state.body, 'perros');
  value = 'gato';
  await poller.poll();
  assert.equal(state.body, 'gato');
});

test('a response finishing after a code switch cannot overwrite the new source', async () => {
  let code = 'ABC';
  const old = deferred();
  let oldSignal;
  const received = [];
  const poller = new NotePoller({
    readCode: () => code,
    onText: text => received.push(text),
    fetchImpl: async (url, { signal }) => {
      if (url.endsWith('abc')) { oldSignal = signal; return old.promise; }
      return response('new source');
    },
  });
  const first = poller.poll();
  code = 'XYZ';
  poller.cancel();
  await poller.poll();
  old.resolve(response('old source'));
  await first;
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(received, ['new source']);
});

test('slow requests do not overlap, and cancellation permits a new source', async () => {
  const pending = deferred();
  let calls = 0;
  const poller = new NotePoller({ readCode: () => 'ABC', onText: () => {}, fetchImpl: () => { calls++; return pending.promise; } });
  const first = poller.poll();
  await poller.poll();
  await poller.poll();
  assert.equal(calls, 1);
  pending.resolve(response('ready'));
  await first;
  await poller.poll();
  assert.equal(calls, 2);
});

test('invalid and empty user codes make no requests', async () => {
  let code = '';
  const poller = new NotePoller({ readCode: () => code, onText: () => assert.fail(), fetchImpl: () => assert.fail() });
  for (code of ['', 'A', 'AB', '1BC', 'ABCD']) await poller.poll();
});

test('network and JSON errors preserve the draft and allow later recovery', async () => {
  const state = { ...defaults, body: 'my edit', lastReceived: 'perro' };
  let attempt = 0;
  const errors = [];
  const poller = new NotePoller({
    readCode: () => 'ABC', onText: text => receiveText(state, text), onError: (...error) => errors.push(error),
    fetchImpl: async () => {
      attempt++;
      if (attempt === 1) throw new Error('offline');
      if (attempt === 2) return { ok: false, status: 503 };
      if (attempt === 3) return { ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } };
      return response('perro');
    },
  });
  for (let i = 0; i < 4; i++) await poller.poll();
  assert.equal(state.body, 'my edit');
  assert.equal(errors.length, 3);
});

test('default transport calls fetch with the browser global as its receiver', async () => {
  const original = globalThis.fetch;
  const received = [];
  globalThis.fetch = async function () {
    assert.equal(this, globalThis, 'Browser fetch rejects a class instance as this');
    return response('Araña');
  };
  try {
    const poller = new NotePoller({ readCode: () => 'UOG', onText: text => received.push(text), onError: error => { throw error; } });
    await poller.poll();
    assert.deepEqual(received, ['Araña']);
  } finally { globalThis.fetch = original; }
});
