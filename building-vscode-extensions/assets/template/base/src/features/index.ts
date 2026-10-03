import type { Feature } from '../platform/featureContext';
import { diagnosticsFeature } from './diagnostics';
import { helloFeature } from './hello';
// @scaffold:imports

/** Registration order is activation order. One entry per feature folder. */
export const FEATURES: readonly Feature[] = [
  diagnosticsFeature,
  helloFeature,
  // @scaffold:features
];
