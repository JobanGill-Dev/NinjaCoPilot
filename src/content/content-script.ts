// Content script injected on demand into the active tab. It stays idle until it
// receives a FILL_FIELD message, then fills the target form field and replies
// with a Result. A guard prevents duplicate listeners across re-injections.
import { toAppErrorData } from '../core/errors';
import { rootLogger } from '../core/logger';
import { err, ok } from '../core/result';
import { fillFirstMatch } from './formFiller';
import type { ContentRequest, ContentResponse } from '../shared/types/messages';

declare global {
  interface Window {
    __NINJA_COPILOT_CONTENT__?: boolean;
  }
}

const log = rootLogger.child('content');

if (!window.__NINJA_COPILOT_CONTENT__) {
  window.__NINJA_COPILOT_CONTENT__ = true;

  chrome.runtime.onMessage.addListener(
    (message: ContentRequest, _sender, sendResponse: (response: ContentResponse) => void) => {
      if (message?.type !== 'FILL_FIELD') return undefined;

      try {
        const { selectors, value } = message.payload;
        const result = fillFirstMatch(selectors, value);

        if (!result) {
          log.warn('No matching field found', { selectors });
          sendResponse(
            err({
              code: 'FIELD_NOT_FOUND',
              message: 'No matching form field was found on this page.',
              details: selectors.join(', '),
            }),
          );
          return true;
        }

        log.info('Field filled', { selector: result.matchedSelector, value });
        sendResponse(ok({ matchedSelector: result.matchedSelector, value }));
      } catch (cause) {
        log.error('Fill failed', cause);
        sendResponse(err(toAppErrorData(cause, 'FILL_FAILED')));
      }

      return true; // keep the message channel open for the async response
    },
  );

  log.debug('Content script ready');
}
