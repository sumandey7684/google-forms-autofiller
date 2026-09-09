import type { FormAdapter } from '@/core/types/adapter';
import type { Form } from '@/core/types/form';
import type { FillPlan, FillResult } from '@/core/types/fill';
import { ErrorCode, createAppError } from '@/core/types/errors';
import { canHandleGoogleFormsPage } from './detect';
import { buildDiscoveryReport } from './diagnostics';
import type { DiscoveryReport } from './types';

/**
 * Google Forms adapter boundary.
 * P2 implements canHandle + discovery helpers only.
 * extract/fill remain unimplemented.
 */
export class GoogleFormsAdapter implements FormAdapter {
  readonly id = 'google-forms';

  canHandle(): boolean {
    return canHandleGoogleFormsPage();
  }

  /** Read-only DOM candidate scan. Not part of FormAdapter yet. */
  discover(): DiscoveryReport {
    return buildDiscoveryReport();
  }

  async extract(): Promise<Form> {
    throw createAppError(
      ErrorCode.EXTRACTION_FAILED,
      'Google Forms extract() is not implemented in P2. Discovery only.',
    );
  }

  async fill(_plan: FillPlan): Promise<FillResult> {
    throw createAppError(
      ErrorCode.FILL_FAILED,
      'Google Forms fill() is not implemented in P2. Discovery only.',
    );
  }
}

export function createGoogleFormsAdapter(): GoogleFormsAdapter {
  return new GoogleFormsAdapter();
}
