// Reusable in-page popup — the standard surface for any feature that needs to
// prompt the user on a web page. Rendered as a small hovering card in the
// bottom-right corner, isolated in a Shadow DOM so host-page styles can't leak
// in or out. Keep this generic; feature-specific wording lives in the caller.

export interface PopupAction {
  label: string;
  onClick: () => void;
}

export interface PopupContent {
  /** Small header/brand line. Defaults to "NinjaCoPilot". */
  title?: string;
  /** Body message. */
  message: string;
  /** Optional value shown as a monospace chip (e.g. an IP address). */
  highlight?: string;
  /** Optional primary button. */
  action?: PopupAction;
  /** Called when the user dismisses the popup. */
  onClose?: () => void;
}

export type PopupStatus = 'info' | 'busy' | 'success' | 'error';

/** Handle to a shown popup; lets the caller update its status or remove it. */
export interface PopupHandle {
  setStatus(message: string, status: PopupStatus): void;
  setBusy(message: string): void;
  setSuccess(message: string): void;
  setError(message: string): void;
  update(content: Partial<PopupContent>): void;
  /** Removes the popup without invoking its onClose (programmatic close). */
  close(): void;
}

const STYLES = /* css */ `
  :host { all: initial; }
  .stack {
    position: fixed; bottom: 20px; right: 20px; width: 300px;
    max-height: calc(100vh - 40px); overflow-y: auto;
    display: flex; flex-direction: column; gap: 10px;
    font-family: "Segoe UI", system-ui, sans-serif;
  }
  .toolbar {
    order: -1; /* keep the bar pinned above the cards */
    display: flex; align-items: center; justify-content: space-between;
    background: #17181b; border: 1px solid #34363b; border-radius: 8px;
    padding: 6px 10px; color: #9aa0a6; font-size: 12px;
  }
  .toolbar[hidden] { display: none; }
  .clear-all {
    appearance: none; border: none; background: none; color: #4f8cff;
    font-size: 12px; font-weight: 600; cursor: pointer; padding: 2px 4px; border-radius: 6px;
  }
  .clear-all:hover { background: #2b2d31; }

  .card {
    box-sizing: border-box; color: #e8e8ea; background: #1f2023;
    border: 1px solid #34363b; border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); overflow: hidden;
    opacity: 0; transform: translateY(12px);
    transition: opacity 0.18s ease, transform 0.18s ease;
  }
  .card.visible { opacity: 1; transform: none; }

  .head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 0; }
  .logo { font-size: 16px; line-height: 1; }
  .title { font-size: 12px; font-weight: 600; letter-spacing: 0.2px; }
  .spacer { flex: 1; }
  .close {
    appearance: none; border: none; background: none; color: #8a8f98;
    font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; border-radius: 6px;
  }
  .close:hover { color: #e8e8ea; background: #2b2d31; }

  .body { padding: 8px 14px 0; font-size: 13px; line-height: 1.45; color: #c7c9ce; }
  .chip {
    display: inline-block; margin-top: 10px; font-size: 12px;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    background: #2b2d31; border: 1px solid #3a3d43; border-radius: 6px;
    padding: 3px 8px; color: #e8e8ea;
  }
  .chip[hidden] { display: none; }

  .foot { padding: 12px 14px 14px; }
  .action {
    appearance: none; width: 100%; border: none; border-radius: 8px;
    background: #4f8cff; color: #fff; font-size: 13px; font-weight: 600;
    padding: 9px 12px; cursor: pointer; transition: background 0.15s ease;
  }
  .action:hover:not(:disabled) { background: #3f7ae6; }
  .action:disabled { opacity: 0.5; cursor: not-allowed; }
  .action[hidden] { display: none; }

  .status { padding: 0 14px 12px; font-size: 12px; }
  .status:empty { display: none; }
  .status.busy { color: #9aa0a6; }
  .status.success { color: #3fb950; }
  .status.error { color: #f85149; }
`;

const CARD_HTML = /* html */ `
  <div class="card" role="dialog">
    <div class="head">
      <span class="logo">🥷</span>
      <span class="title"></span>
      <span class="spacer"></span>
      <button class="close" title="Dismiss" aria-label="Dismiss">×</button>
    </div>
    <div class="body">
      <span class="message"></span>
      <div class="chip" hidden></div>
    </div>
    <div class="foot">
      <button class="action" hidden></button>
    </div>
    <div class="status" role="status" aria-live="polite"></div>
  </div>
`;

/** A single popup card. Implements PopupHandle for the caller. */
class Card implements PopupHandle {
  readonly element: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly chipEl: HTMLElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly statusEl: HTMLElement;
  private action: PopupAction | null = null;
  private onClose: (() => void) | null;
  private closed = false;

  constructor(content: PopupContent, private readonly onRemove: () => void) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = CARD_HTML;
    this.element = wrapper.firstElementChild as HTMLElement;

    this.titleEl = this.element.querySelector('.title') as HTMLElement;
    this.messageEl = this.element.querySelector('.message') as HTMLElement;
    this.chipEl = this.element.querySelector('.chip') as HTMLElement;
    this.actionBtn = this.element.querySelector('.action') as HTMLButtonElement;
    this.statusEl = this.element.querySelector('.status') as HTMLElement;
    this.onClose = content.onClose ?? null;

    this.actionBtn.addEventListener('click', () => this.action?.onClick());
    (this.element.querySelector('.close') as HTMLElement).addEventListener('click', () => this.dismiss());

    this.titleEl.textContent = content.title ?? 'NinjaCoPilot';
    this.update(content);
  }

  update(content: Partial<PopupContent>): void {
    if (content.title !== undefined) this.titleEl.textContent = content.title;
    if (content.message !== undefined) this.messageEl.textContent = content.message;
    if (content.highlight !== undefined) {
      this.chipEl.textContent = content.highlight;
      this.chipEl.hidden = !content.highlight;
    }
    if (content.action !== undefined) {
      this.action = content.action;
      this.actionBtn.hidden = false;
      this.actionBtn.textContent = content.action.label;
    }
    if (content.onClose !== undefined) this.onClose = content.onClose;
  }

  setStatus(message: string, status: PopupStatus): void {
    this.actionBtn.disabled = status === 'busy';
    this.statusEl.textContent = message;
    this.statusEl.className = message ? `status ${status}` : 'status';
  }

  setBusy(message: string): void {
    this.setStatus(message, 'busy');
  }

  setSuccess(message: string): void {
    this.setStatus(message, 'success');
  }

  setError(message: string): void {
    this.setStatus(message, 'error');
  }

  /** User-initiated dismissal: fires onClose, then removes. */
  dismiss(): void {
    this.onClose?.();
    this.close();
  }

  /** Programmatic removal: no onClose. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.element.classList.remove('visible');
    setTimeout(() => this.element.remove(), 180);
    this.onRemove();
  }
}

/**
 * Manages a stack of popups. Cards stack in the bottom-right corner; each can be
 * dismissed on its own, and a "Clear all" bar appears when more than one is open.
 */
class PopupManager {
  private shadow: ShadowRoot | null = null;
  private stack: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private readonly cards = new Set<Card>();

  show(content: PopupContent): PopupHandle {
    this.ensure();
    const card = new Card(content, () => {
      this.cards.delete(card);
      this.updateToolbar();
    });
    (this.stack as HTMLElement).appendChild(card.element);
    this.cards.add(card);
    requestAnimationFrame(() => card.element.classList.add('visible'));
    this.updateToolbar();
    return card;
  }

  clearAll(): void {
    for (const card of [...this.cards]) card.dismiss();
  }

  private updateToolbar(): void {
    const n = this.cards.size;
    if (this.toolbar) this.toolbar.hidden = n < 2;
    if (this.countEl) this.countEl.textContent = `${n} notifications`;
  }

  private ensure(): void {
    if (this.shadow) return;

    const host = document.createElement('div');
    host.id = 'ninja-copilot-popups';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;

    const stack = document.createElement('div');
    stack.className = 'stack';
    stack.innerHTML = `
      <div class="toolbar" hidden>
        <span class="count"></span>
        <button class="clear-all">Clear all</button>
      </div>
    `;

    shadow.append(style, stack);
    document.documentElement.appendChild(host);

    this.shadow = shadow;
    this.stack = stack;
    this.toolbar = stack.querySelector('.toolbar');
    this.countEl = stack.querySelector('.count');
    (stack.querySelector('.clear-all') as HTMLElement).addEventListener('click', () => this.clearAll());
  }
}

/** Singleton — import and call popups.show(...) from any feature. */
export const popups = new PopupManager();
