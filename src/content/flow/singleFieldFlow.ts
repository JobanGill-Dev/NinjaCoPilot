// Simple single-input fill flow for non-grid forms.
import { AppError } from '../../core/errors';
import type { Logger } from '../../core/logger';
import { err, ok, type Result } from '../../core/result';
import type { SingleFieldStrategy } from '../../features/publicIp/rules';
import type { FlowOutcome } from '../../shared/types/messages';
import { fillElement, findField } from '../formFiller';

export async function runSingleFieldFlow(
  strategy: SingleFieldStrategy,
  value: string,
  log: Logger,
): Promise<Result<FlowOutcome>> {
  log.info('Step 1/2 · Searching for the target field', { selectors: strategy.selectors });
  const field = findField(strategy.selectors);
  if (!field) {
    log.warn('Step 1/2 ✗ No matching field found on this page', { selectors: strategy.selectors });
    return err(
      new AppError('FIELD_NOT_FOUND', 'No matching form field was found on this page.', strategy.selectors.join(', ')).toData(),
    );
  }
  log.info(`Step 1/2 ✓ Field found via "${field.selector}"`, { currentValue: field.currentValue || '(empty)' });

  if (field.currentValue.trim() === value) {
    log.info('Step 2/2 ⏭ IP already in the field — nothing to do');
    return ok({ status: 'already-present', value });
  }

  fillElement(field.element, value);
  log.info(`Step 2/2 ✓ Filled "${value}"`);
  return ok({ status: 'filled', value });
}
