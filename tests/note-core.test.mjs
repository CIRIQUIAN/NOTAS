import test from 'node:test';
import assert from 'node:assert/strict';
import { toAcronym, receiveText, restoreState, defaults, extractText } from '../note-core.mjs';
import { characters } from '../characters.mjs';

test('repeated API responses preserve all edits, including deletion', () => {
  const state = { ...defaults };
  assert.equal(receiveText(state, 'perro'), true);
  state.body = 'perros';
  assert.equal(receiveText(state, 'perro'), false);
  assert.equal(state.body, 'perros');
  state.body = '';
  receiveText(state, 'perro');
  assert.equal(state.body, '');
  receiveText(state, 'gato');
  assert.equal(state.body, 'gato');
  receiveText(state, 'perro');
  assert.equal(state.body, 'perro');
});

test('mode switches only affect a different incoming message', () => {
  const state = { ...defaults };
  receiveText(state, 'perro');
  state.acronymEnabled = true;
  receiveText(state, 'perro');
  assert.equal(state.body, 'perro');
  receiveText(state, 'gato');
  assert.equal(state.body, toAcronym('gato'));
  state.body += '\nMy own note';
  state.acronymEnabled = false;
  const draft = state.body;
  receiveText(state, 'gato');
  assert.equal(state.body, draft);
  receiveText(state, 'otro');
  assert.equal(state.body, 'otro');
});

test('perro uses a different person for each repeated R', () => {
  assert.equal(toAcronym('perro'), 'Pablo Picasso\nErnest Hemingway\nRosa Parks\nRichard Feynman\nOprah Winfrey');
});

test('words, punctuation and accents share one sequence without blank lines', () => {
  assert.equal(toAcronym('  PÉR RO! 123\n'), toAcronym('perro'));
  assert.equal(toAcronym('éèêë'), characters.E.slice(0, 4).join('\n'));
  assert.equal(toAcronym('pe\u0301rro'), toAcronym('perro'));
  assert.equal(toAcronym(' 123!?'), '');
});

test('explicit special letters keep their own lists, including decomposed input', () => {
  for (const key of ['Ñ', 'Ç', 'Ø', 'Å', 'Æ', 'Ł', 'Þ', 'Š', 'Č', 'Ž', 'İ']) {
    assert.equal(toAcronym(key), characters[key][0]);
    assert.equal(toAcronym(key.normalize('NFD')), characters[key][0]);
  }
  assert.equal(toAcronym('ñññ'), 'Ñuflo Chaves\nÑuño Rasura\nÑuflo Chaves');
});

test('exhausted lists cycle, and counters reset for each message', () => {
  assert.equal(toAcronym('a'.repeat(9)), [...characters.A, characters.A[0]].join('\n'));
  assert.equal(toAcronym('a'), characters.A[0]);
});

test('reload retains draft, source baseline and mode together', () => {
  const state = restoreState({ ...defaults, body: 'perros', lastReceived: 'perro', acronymEnabled: true });
  receiveText(state, 'perro');
  assert.equal(state.body, 'perros');
  assert.equal(state.acronymEnabled, true);
});

test('migration preserves supported settings without retaining custom images', () => {
  const state = restoreState({ userCode: 'abc', title: 'My title', titleX: 95, titleSize: 32, bgData: 'data:image/png,old', fontPreset: 'georgia' });
  assert.equal(state.userCode, 'ABC');
  assert.equal(state.title, 'My title');
  assert.equal(state.titleX, 80);
  assert.equal(state.titleSize, 32);
  assert.equal(Object.hasOwn(state, 'bgData'), false);
  assert.deepEqual(restoreState(null), defaults);
});

test('API values are normalized before comparison, empty results clear once', () => {
  assert.equal(extractText({ data: 'perro' }), 'perro');
  assert.equal(extractText('perro'), 'perro');
  assert.equal(extractText({ data: 0 }), '0');
  assert.equal(extractText({ data: '' }), '');
  const state = { ...defaults, body: 'old', lastReceived: 'old' };
  receiveText(state, '');
  assert.equal(state.body, '');
  state.body = 'manual';
  receiveText(state, '');
  assert.equal(state.body, 'manual');
});

test('acronym is one-shot and stays armed across repeated responses', () => {
  const state = { ...defaults };
  receiveText(state, 'perro');
  state.body = 'perros';
  state.acronymEnabled = true;
  receiveText(state, 'perro');
  assert.equal(state.acronymEnabled, true);
  assert.equal(state.body, 'perros');
  receiveText(state, 'gato');
  assert.equal(state.body, toAcronym('gato'));
  assert.equal(state.acronymEnabled, false);
  state.body += '\nMy edit';
  const draft = state.body;
  receiveText(state, 'gato');
  assert.equal(state.body, draft);
  receiveText(state, 'hola');
  assert.equal(state.body, 'hola');
  state.acronymEnabled = true;
  receiveText(state, 'otra');
  assert.equal(state.body, toAcronym('otra'));
  assert.equal(state.acronymEnabled, false);
});

test('an empty acronym does not consume the armed state', () => {
  const state = { ...defaults, acronymEnabled: true };
  receiveText(state, '123!?');
  assert.equal(state.acronymEnabled, true);
  receiveText(state, 'hola');
  assert.equal(state.acronymEnabled, false);
  assert.equal(state.body, toAcronym('hola'));
});

test('a received character never appears in their own acronym', () => {
  for (const name of Object.values(characters).flat()) {
    assert.ok(!toAcronym(name).split('\n').includes(name), name);
  }
  const result = toAcronym('Albert Einstein').split('\n');
  assert.equal(result[0], 'Alfred Hitchcock');
  assert.equal(result.length, 14);
});

test('character exclusion ignores case, accents, whitespace and punctuation', () => {
  for (const input of ['albert einstein', '  ALBERT   EINSTEIN  ', 'Álbert Éinstein', 'Albert\nEinstein', 'Albert-Einstein']) {
    assert.equal(toAcronym(input).split('\n')[0], 'Alfred Hitchcock');
    assert.ok(!toAcronym(input).split('\n').includes('Albert Einstein'));
  }
});

test('repeated letters rotate over the remaining candidates without blank lines', () => {
  const result = toAcronym('Amelia Earhart').split('\n');
  const aNames = result.filter(name => name.startsWith('A'));
  assert.deepEqual(aNames, ['Albert Einstein', 'Alfred Hitchcock', 'Anne Frank', 'Angela Merkel']);
  assert.equal(result.length, 13);
  assert.ok(!result.includes(''));
  assert.equal(toAcronym('Albert').split('\n')[0], 'Albert Einstein');
});

test('excluding a name preserves one-shot mode and API repetition rules', () => {
  const state = { ...defaults, acronymEnabled: true };
  receiveText(state, 'Albert Einstein');
  assert.ok(!state.body.includes('Albert Einstein'));
  assert.equal(state.acronymEnabled, false);
  state.body = 'My edit';
  receiveText(state, 'Albert Einstein');
  assert.equal(state.body, 'My edit');
  receiveText(state, 'Marie Curie');
  assert.equal(state.body, 'Marie Curie');
});
