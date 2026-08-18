// Multi-step flow for the Azure Key Vault firewall grid. Each step logs its
// progress so the sequence can be followed in the page's DevTools console.
import { AppError, toAppErrorData } from '../../core/errors';
import type { Logger } from '../../core/logger';
import { err, ok, type Result } from '../../core/result';
import type { AzureGridStrategy } from '../../features/publicIp/rules';
import type { FlowOutcome } from '../../shared/types/messages';
import { clickElement, sleep, waitForElement } from '../dom';
import { fillElement, isFillable } from '../formFiller';
import { readGrid } from '../gridReader';

export async function runAzureFirewallFlow(
  strategy: AzureGridStrategy,
  value: string,
  log: Logger,
): Promise<Result<FlowOutcome>> {
  try {
    // Step 1 — read existing entries (text + input values) from the grid.
    log.info('Step 1/5 · Reading existing IP entries', { selector: strategy.existingTableSelector });
    const snapshot = readGrid(strategy.existingTableSelector);
    log.info('Step 1/5 · Existing entries snapshot', {
      containersFound: snapshot.containers,
      existingIps: snapshot.ips,
      textPreview: snapshot.text.slice(0, 300),
    });
    if (snapshot.containers === 0) {
      log.warn(
        `Step 1/5 ⚠ No element matched "${strategy.existingTableSelector}" — the list may be empty or the selector is wrong`,
      );
    }

    // Step 2 — duplicate check (CIDR-aware, e.g. /32).
    const alreadyPresent = snapshot.ips.includes(value);
    log.info('Step 2/5 · Duplicate check', { value, alreadyPresent, existingIps: snapshot.ips });
    if (alreadyPresent) {
      log.info('Step 2/5 ⏭ IP already in the firewall list — nothing to do');
      return ok({ status: 'already-present', value });
    }

    // Step 3 — click the "Add your client IP address" button.
    log.info('Step 3/5 · Locating the "Add client IP" button', { selector: strategy.addButtonSelector });
    const addButton = await waitForElement<HTMLElement>(strategy.addButtonSelector, { timeoutMs: 8000 });
    if (!addButton) {
      return err(new AppError('FIELD_NOT_FOUND', 'Could not find the "Add your client IP address" button.').toData());
    }
    clickElement(addButton);
    log.info('Step 3/5 ✓ Clicked Add — waiting for the new row');

    // Step 4 — fill the freshly added, empty input.
    const field = await waitForNewField(strategy.newFieldSelectors);
    if (!field) {
      return err(new AppError('FIELD_NOT_FOUND', 'The new IP input row did not appear.').toData());
    }
    fillElement(field, value);
    log.info(`Step 4/5 ✓ Filled "${value}" into the new row`);
    await sleep(300); // let the grid register the change before committing

    // Step 5 — wait for the Apply button to become enabled, then click it.
    log.info('Step 5/5 · Waiting for the Apply button to become enabled', { selector: strategy.applyButtonSelector });
    const applyButton = await waitForElement<HTMLElement>(strategy.applyButtonSelector, {
      timeoutMs: 8000,
      enabled: true,
    });
    if (!applyButton) {
      return err(
        new AppError('FILL_FAILED', 'Filled the IP but the Apply button did not become enabled.').toData(),
      );
    }
    clickElement(applyButton);
    log.info('Step 5/5 ✓ Clicked Apply — done');

    return ok({ status: 'filled', value });
  } catch (cause) {
    log.error('Azure firewall flow failed', cause);
    return err(toAppErrorData(cause, 'FILL_FAILED'));
  }
}

/** Waits for a newly added, empty, editable input matching the selectors. */
async function waitForNewField(
  selectors: string[],
  timeoutMs = 8000,
): Promise<HTMLInputElement | HTMLTextAreaElement | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Prefer the input Azure focuses when the row is created.
    const active = document.activeElement;
    if (active && isFillable(active) && selectors.some((s) => active.matches(s))) {
      return active;
    }
    for (const selector of selectors) {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
      const empty = inputs.reverse().find((input) => input.value.trim() === '' && !input.readOnly);
      if (empty) return empty;
    }
    if (Date.now() >= deadline) return null;
    await sleep(150);
  }
}
