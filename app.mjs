import { defaults, ranges, restoreState, receiveText } from './note-core.mjs';
import { NotePoller } from './note-poller.mjs';

const STORAGE_KEY = 'notes_v4';
const LEGACY_KEY = 'nota_api_fondo_configurable_v3';
const $ = id => document.getElementById(id);
let state;
try {
  state = restoreState(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || 'null'));
} catch {
  state = { ...defaults };
}
const title = $('titleDisplay');
const body = $('bodyDisplay');
const viewport = $('noteViewport');
const content = $('noteContent');
const settings = $('settingsPanel');
let layoutFrame = 0;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Retire the former user-uploaded image only after the new state is durable.
    localStorage.removeItem(LEGACY_KEY);
    $('storageWarning').hidden = true;
  } catch {
    $('storageWarning').hidden = false;
  }
}

function layout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    const height = viewport.clientHeight;
    for (const [element, prefix] of [[title, 'title'], [body, 'body']]) {
      element.style.left = `${state[`${prefix}X`]}%`;
      element.style.width = `${95 - state[`${prefix}X`]}%`;
      element.style.fontSize = `${state[`${prefix}Size`]}px`;
    }
    const titleTop = height * state.titleY / 100;
    const bodyTop = Math.max(height * state.bodyY / 100, titleTop + title.offsetHeight + 14);
    title.style.top = `${titleTop}px`;
    body.style.top = `${bodyTop}px`;
    content.style.height = `${Math.max(height, bodyTop + body.offsetHeight + 28)}px`;
  });
}

function syncControls() {
  $('userCode').value = state.userCode;
  for (const key of Object.keys(ranges)) {
    $(key).value = state[key];
    $(`${key}Label`).value = `${state[key]}${key.endsWith('Size') ? ' px' : '%'}`;
  }
  const invalid = state.userCode !== '' && !/^[A-Z]{3}$/.test(state.userCode);
  $('userCode').setAttribute('aria-invalid', String(invalid));
  $('codeHelp').textContent = invalid
    ? 'The code must contain exactly 3 letters (A–Z).'
    : 'Enter your 3-letter code. Leave empty to disconnect.';
  $('acronymBtn').setAttribute('aria-pressed', String(state.acronymEnabled));
  $('acronymBtn').title = `Acronym mode: ${state.acronymEnabled ? 'on' : 'off'}`;
  layout();
}

function showDraft() {
  title.innerText = state.title;
  body.innerText = state.body;
  layout();
}

const poller = new NotePoller({
  readCode: () => state.userCode,
  onText: incoming => {
    if (receiveText(state, incoming)) {
      body.innerText = state.body;
      viewport.scrollTop = 0;
      save();
      layout();
    }
  },
});
const fetchBody = () => poller.poll();

function changeSource() {
  poller.cancel();
  state.lastReceived = null;
  state.body = '';
  body.innerText = '';
  viewport.scrollTop = 0;
}

for (const [editor, key] of [[title, 'title'], [body, 'body']]) {
  // plaintext-only strips pasted formatting in modern Safari and Chromium.
  // The paste fallback also handles browsers that only support contenteditable=true.
  if (editor.contentEditable !== 'plaintext-only') editor.contentEditable = 'true';
  editor.addEventListener('paste', event => {
    if (!event.clipboardData) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  editor.addEventListener('input', () => {
    state[key] = editor.innerText;
    save();
    layout();
  });
}

for (const key of Object.keys(ranges)) {
  $(key).addEventListener('input', () => {
    state[key] = Number($(key).value);
    save();
    syncControls();
  });
}
$('userCode').addEventListener('input', () => {
  const nextCode = $('userCode').value.trim().toUpperCase();
  if (nextCode !== state.userCode) {
    state.userCode = nextCode;
    changeSource();
    save();
    fetchBody();
  }
  syncControls();
});
$('acronymBtn').addEventListener('click', () => {
  state.acronymEnabled = !state.acronymEnabled;
  save();
  syncControls();
  $('modeAnnouncement').textContent = `Acronym mode ${state.acronymEnabled ? 'on' : 'off'}. Applies to the next different text received.`;
});

function openSettings() {
  if (!settings.open) settings.showModal();
}
$('settingsBtn').addEventListener('click', openSettings);
$('closeBtn').addEventListener('click', () => settings.close());
$('doneBtn').addEventListener('click', () => settings.close());
settings.addEventListener('click', event => {
  if (event.target === settings) {
    const rect = settings.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) settings.close();
  }
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all settings and clear this note?')) return;
  changeSource();
  state = { ...defaults };
  save();
  showDraft();
  syncControls();
  settings.close();
});

let pressTimer;
let pressStart;
const cancelPress = () => clearTimeout(pressTimer);
const footerTrigger = $('footerTrigger');
footerTrigger.addEventListener('pointerdown', event => {
  cancelPress();
  pressStart = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(openSettings, 3000);
});
footerTrigger.addEventListener('pointermove', event => {
  if (pressStart && (Math.abs(event.clientX - pressStart.x) > 12 || Math.abs(event.clientY - pressStart.y) > 12)) cancelPress();
});
for (const event of ['pointerup', 'pointercancel', 'pointerleave']) footerTrigger.addEventListener(event, cancelPress);
window.addEventListener('blur', cancelPress);

const observer = new ResizeObserver(layout);
for (const element of [title, body, viewport]) observer.observe(element);
function resizeViewport() {
  if (window.visualViewport) {
    $('app').style.setProperty('--viewport-height', `${window.visualViewport.height}px`);
    $('app').style.top = `${window.visualViewport.offsetTop}px`;
  }
  layout();
}
window.visualViewport?.addEventListener('resize', resizeViewport);
window.visualViewport?.addEventListener('scroll', resizeViewport);
window.addEventListener('resize', resizeViewport);
window.addEventListener('online', fetchBody);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) fetchBody();
});

showDraft();
syncControls();
resizeViewport();
fetchBody();
setInterval(fetchBody, 2000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => console.error('Offline setup failed:', error));
  });
}
