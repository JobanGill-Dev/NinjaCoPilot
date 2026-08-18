// Popup controller: shows the detected public IP, whether the current page has a
// configured form, and triggers the fill action.
import { rootLogger } from '../core/logger';
import { sendToBackground } from '../core/messaging';
import { matchRule } from '../features/publicIp/rules';

const log = rootLogger.child('popup');

const ipEl = requireEl('ip');
const pageStatusEl = requireEl('page-status');
const statusEl = requireEl('status');
const fillBtn = requireEl<HTMLButtonElement>('fill-btn');

void init();

async function init(): Promise<void> {
  await Promise.all([loadPublicIp(), loadPageStatus()]);
  fillBtn.addEventListener('click', onFillClick);
}

async function loadPublicIp(): Promise<void> {
  try {
    const result = await sendToBackground({ type: 'GET_PUBLIC_IP' });
    if (result.ok) {
      ipEl.textContent = result.value.ip;
    } else {
      ipEl.textContent = 'Unavailable';
      setStatus(result.error.message, 'error');
    }
  } catch (cause) {
    ipEl.textContent = 'Unavailable';
    log.error('Failed to load public IP', cause);
    setStatus('Could not reach the background worker.', 'error');
  }
}

async function loadPageStatus(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const rule = matchRule(tab?.url);

  if (rule) {
    pageStatusEl.textContent = rule.name;
    pageStatusEl.classList.remove('muted');
    pageStatusEl.classList.add('match');
    fillBtn.disabled = false;
  } else {
    pageStatusEl.textContent = 'No configured form';
    fillBtn.disabled = true;
  }
}

async function onFillClick(): Promise<void> {
  fillBtn.disabled = true;
  setStatus('Filling…');

  try {
    const result = await sendToBackground({ type: 'FILL_ACTIVE_TAB' });
    if (result.ok) {
      setStatus(`Filled ${result.value.value} into ${result.value.ruleName}.`, 'ok');
    } else {
      setStatus(result.error.message, 'error');
    }
  } catch (cause) {
    log.error('Fill request failed', cause);
    setStatus('Something went wrong. Check the console for details.', 'error');
  } finally {
    fillBtn.disabled = false;
  }
}

function setStatus(message: string, kind?: 'ok' | 'error'): void {
  statusEl.textContent = message;
  statusEl.classList.remove('ok', 'error');
  if (kind) statusEl.classList.add(kind);
}

function requireEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}
