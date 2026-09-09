import type { FormAdapter } from '@/core/types/adapter';
import type { Form } from '@/core/types/form';
import type { FillPlan, FillResult } from '@/core/types/fill';
import type { ClassificationReport } from '@/core/types/classification-report';
import { ErrorCode, createAppError } from '@/core/types/errors';
import { canHandleGoogleFormsPage } from './detect';
import { discoverQuestionContainers } from './discovery';
import { buildDiscoveryReport } from './diagnostics';
import {
  classifyQuestions,
  summarizeClassification,
} from './classification';
import type { DiscoveredQuestion, DiscoveryReport } from './types';
import type { ClassifiedQuestion } from '@/core/types/classification-report';

/**
 * Google Forms adapter boundary.
 * P2: discovery. P3: classification of discovery output.
 * extract/fill remain unimplemented.
 */
export class GoogleFormsAdapter implements FormAdapter {
  readonly id = 'google-forms';

  canHandle(): boolean {
    return canHandleGoogleFormsPage();
  }

  discoverQuestions(root: ParentNode = document): DiscoveredQuestion[] {
    return discoverQuestionContainers(root);
  }

  discoverReport(root: ParentNode = document): DiscoveryReport {
    return buildDiscoveryReport(root);
  }

  /** @deprecated Prefer discoverReport(). */
  discover(): DiscoveryReport {
    return this.discoverReport();
  }

  /**
   * P3: classify previously discovered questions (does not re-scan unrelated DOM).
   */
  classifyDiscovered(
    questions: readonly DiscoveredQuestion[],
  ): ClassifiedQuestion[] {
    return classifyQuestions(questions);
  }

  /**
   * Classify an already-discovered set (preferred — no second DOM scan).
   */
  classifyFromDiscovered(
    questions: readonly DiscoveredQuestion[],
    url: string = location.href,
  ): ClassificationReport {
    return summarizeClassification(this.classifyDiscovered(questions), url);
  }

  /**
   * Discover then classify in one pass for debug/messaging.
   * Classification still consumes discovery objects — no parallel DOM strategy.
   */
  classifyReport(root: ParentNode = document): ClassificationReport {
    const discovered = this.discoverQuestions(root);
    const url =
      root instanceof Document
        ? root.location.href
        : root instanceof Element
          ? root.ownerDocument.location.href
          : location.href;
    return this.classifyFromDiscovered(discovered, url);
  }

  async extract(): Promise<Form> {
    throw createAppError(
      ErrorCode.EXTRACTION_FAILED,
      'Google Forms extract() is not implemented in P3. Classification only.',
    );
  }

  async fill(_plan: FillPlan): Promise<FillResult> {
    throw createAppError(
      ErrorCode.FILL_FAILED,
      'Google Forms fill() is not implemented in P3. Classification only.',
    );
  }
}

export function createGoogleFormsAdapter(): GoogleFormsAdapter {
  return new GoogleFormsAdapter();
}
