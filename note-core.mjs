import { characters } from './characters.mjs';

export function toAcronym(text) {
  const counts = new Map();
  const names = [];
  for (const character of text.normalize('NFC')) {
    const upper = character.toUpperCase();
    const key = Object.hasOwn(characters, upper)
      ? upper
      : upper.normalize('NFD').replace(/\p{M}/gu, '');
    if (!Object.hasOwn(characters, key)) continue;
    const list = characters[key];
    const index = counts.get(key) || 0;
    names.push(list[index % list.length]);
    counts.set(key, index + 1);
  }
  return names.join('\n');
}

export function extractText(json) {
  const value = json?.data ?? json;
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// The source baseline is independent of the user's editable draft and of the mode.
export function receiveText(state, incoming) {
  if (incoming === state.lastReceived) return false;
  state.lastReceived = incoming;
  state.body = state.acronymEnabled ? toAcronym(incoming) : incoming;
  if (state.acronymEnabled && state.body) state.acronymEnabled = false;
  return true;
}

export const defaults = Object.freeze({
  userCode: '', title: '', body: '', lastReceived: null, acronymEnabled: false,
  titleX: 5, titleY: 1, bodyX: 5, bodyY: 12, titleSize: 28, bodySize: 20,
});

export const ranges = Object.freeze({
  titleX: [0, 80], titleY: [0, 95], bodyX: [0, 80], bodyY: [0, 95],
  titleSize: [18, 52], bodySize: [14, 36],
});

export function restoreState(saved) {
  const state = { ...defaults };
  if (!saved || typeof saved !== 'object') return state;
  for (const key of ['userCode', 'title', 'body']) {
    if (typeof saved[key] === 'string') state[key] = saved[key];
  }
  state.userCode = state.userCode.toUpperCase().slice(0, 3);
  if (typeof saved.lastReceived === 'string') state.lastReceived = saved.lastReceived;
  state.acronymEnabled = saved.acronymEnabled === true;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) {
      state[key] = Math.min(max, Math.max(min, saved[key]));
    }
  }
  return state;
}
