import type { Form } from './form';
import type { FillPlan, FillResult } from './fill';

/**
 * Page/form adapter contract.
 * Implementations (e.g. Google Forms content layer) live outside core.
 * Core must never import DOM or adapter implementations.
 */
export interface FormAdapter {
  /** Stable adapter id, e.g. "google-forms". */
  readonly id: string;

  /** Whether this adapter can operate on the current page/document. */
  canHandle(): boolean;

  /** Extract a normalized Form model from the page. */
  extract(): Promise<Form>;

  /** Apply a DOM-independent fill plan; report per-question outcomes. */
  fill(plan: FillPlan): Promise<FillResult>;
}
