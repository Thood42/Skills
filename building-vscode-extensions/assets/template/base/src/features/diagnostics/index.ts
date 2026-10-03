import { registerCommand } from '../../platform/commands';
import type { Feature } from '../../platform/featureContext';

/** Support affordances every extension keeps: one command to open the log. */
export const diagnosticsFeature: Feature = {
  id: 'diagnostics',
  register(ctx) {
    registerCommand(ctx, '{{ID}}.showLog', () => {
      ctx.log.show(true);
    });
  },
};
