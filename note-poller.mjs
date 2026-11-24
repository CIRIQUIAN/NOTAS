import { extractText } from './note-core.mjs';

export class NotePoller {
  constructor({ readCode, onText, fetchImpl = globalThis.fetch, onError = console.error }) {
    this.readCode = readCode;
    this.onText = onText;
    this.fetchImpl = fetchImpl;
    this.onError = onError;
    this.request = null;
    this.version = 0;
  }

  cancel() {
    this.version += 1;
    this.request?.abort();
    this.request = null;
  }

  async poll() {
    const code = this.readCode();
    if (this.request || !/^[A-Z]{3}$/.test(code)) return;
    const version = this.version;
    const controller = new AbortController();
    this.request = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetchImpl(`https://appmaz.vip/api/getdata.php?user=${encodeURIComponent(code.toLowerCase())}`, {
        cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const incoming = extractText(await response.json());
      if (version !== this.version || controller.signal.aborted) return;
      this.onText(incoming);
    } catch (error) {
      if (error.name !== 'AbortError') this.onError('Could not retrieve note:', error);
    } finally {
      clearTimeout(timeout);
      if (this.request === controller) this.request = null;
    }
  }
}
