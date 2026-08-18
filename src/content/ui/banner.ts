// In-page banner shown at the top of matched pages. Rendered inside a Shadow DOM
// so the host page's styles can't leak in or out. Exposes a single "fill"
// action button plus transient status text.

export interface BannerHandlers {
  onFill: () => void;
  onClose: () => void;
}

type StatusKind = '' | 'busy' | 'ok' | 'error';

const TEMPLATE = /* html */ `
  <style>
    .bar {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: #1e1f22;
      color: #e6e6e6;
      border-bottom: 1px solid #3a3d43;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      padding: 8px 14px;
    }
    .logo { font-size: 18px; }
    .title { font-weight: 600; font-size: 13px; }
    .spacer { flex: 1; }
    button.fill {
      appearance: none;
      border: none;
      border-radius: 6px;
      background: #4f8cff;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 12px;
      cursor: pointer;
    }
    button.fill:hover:not(:disabled) { background: #3f7ae6; }
    button.fill:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { font-size: 12px; }
    .status.ok { color: #3fb950; }
    .status.error { color: #f85149; }
    .status.busy { color: #9aa0a6; }
    button.close {
      appearance: none;
      border: none;
      background: none;
      color: #9aa0a6;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
    }
    button.close:hover { color: #e6e6e6; }
  </style>
  <div class="bar">
    <span class="logo">🥷</span>
    <span class="title">NinjaCoPilot</span>
    <button id="fill" class="fill">Fill your public IP</button>
    <span id="status" class="status"></span>
    <span class="spacer"></span>
    <button id="close" class="close" title="Dismiss">×</button>
  </div>
`;

export class PageBanner {
  private host: HTMLElement | null = null;
  private button: HTMLButtonElement | null = null;
  private status: HTMLElement | null = null;
  private handlers: BannerHandlers | null = null;
  private currentIp = '';

  show(ip: string, handlers: BannerHandlers): void {
    this.handlers = handlers;
    this.ensure();
    if (ip !== this.currentIp) {
      this.currentIp = ip;
      if (this.button) this.button.textContent = `Fill your public IP (${ip})`;
    }
    this.setStatus('');
    if (this.button) this.button.disabled = false;
    if (this.host) this.host.style.display = 'block';
  }

  setBusy(message: string): void {
    if (this.button) this.button.disabled = true;
    this.setStatus(message, 'busy');
  }

  setSuccess(message: string): void {
    this.setStatus(message, 'ok');
  }

  setError(message: string): void {
    if (this.button) this.button.disabled = false;
    this.setStatus(message, 'error');
  }

  hide(): void {
    if (this.host) this.host.style.display = 'none';
  }

  private setStatus(message: string, kind: StatusKind = ''): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.className = kind ? `status ${kind}` : 'status';
  }

  private ensure(): void {
    if (this.host) return;

    const host = document.createElement('div');
    host.id = 'ninja-copilot-banner-host';
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = TEMPLATE;
    document.documentElement.appendChild(host);

    this.host = host;
    this.button = shadow.querySelector<HTMLButtonElement>('#fill');
    this.status = shadow.querySelector<HTMLElement>('#status');

    this.button?.addEventListener('click', () => this.handlers?.onFill());
    shadow.querySelector<HTMLElement>('#close')?.addEventListener('click', () => this.handlers?.onClose());
  }
}
