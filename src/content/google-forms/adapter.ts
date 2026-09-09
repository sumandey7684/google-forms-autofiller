import type { FormAdapter } from '@/core/types/adapter';
import type { Form } from '@/core/types/form';
import type { FillPlan, FillResult } from '@/core/types/fill';
import type { ClassificationReport } from '@/core/types/classification-report';
import type { ExtractionReport, ExtractionResult } from '@/core/types/extraction-report';
import { ErrorCode, createAppError } from '@/core/types/errors';
import { canHandleGoogleFormsPage } from './detect';
import { discoverQuestionContainers } from './discovery';
import { buildDiscoveryReport } from './diagnostics';
import {
  classifyQuestions,
  summarizeClassification,
} from './classification';
import { extractForm } from './extract';
import { applyFillPlan as applyFillPlanToDom } from './fill';
import type { DiscoveredQuestion, DiscoveryReport } from './types';
import type { ClassifiedQuestion } from '@/core/types/classification-report';

/**
 * Google Forms adapter boundary.
 * P2 discovery → P3 classification → P4 extraction → P5 fill.
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

  classifyDiscovered(
    questions: readonly DiscoveredQuestion[],
  ): ClassifiedQuestion[] {
    return classifyQuestions(questions);
  }

  classifyFromDiscovered(
    questions: readonly DiscoveredQuestion[],
    url: string = location.href,
  ): ClassificationReport {
    return summarizeClassification(this.classifyDiscovered(questions), url);
  }

  classifyReport(root: ParentNode = document): ClassificationReport {
    const discovered = this.discoverQuestions(root);
    return this.classifyFromDiscovered(discovered, this.resolveUrl(root));
  }

  /**
   * P4: normalize previously discovered + classified questions (no extra DOM strategy).
   */
  extractFromDiscovered(
    discovered: readonly DiscoveredQuestion[],
    classified: readonly ClassifiedQuestion[],
    options: {
      url?: string;
      extractedAt?: string;
      formTitle?: string;
      formDescription?: string;
      formId?: string;
    } = {},
  ): ExtractionResult {
    const metadata: Parameters<typeof extractForm>[2] = {
      url: options.url ?? location.href,
      extractedAt: options.extractedAt ?? new Date().toISOString(),
    };
    if (options.formTitle !== undefined) {
      metadata.formTitle = options.formTitle;
    }
    if (options.formDescription !== undefined) {
      metadata.formDescription = options.formDescription;
    }
    if (options.formId !== undefined) {
      metadata.formId = options.formId;
    }
    return extractForm(discovered, classified, metadata);
  }

  /**
   * Discover → classify → extract in one controlled pass.
   */
  extractResult(root: ParentNode = document): ExtractionResult {
    const discovered = this.discoverQuestions(root);
    const classified = this.classifyDiscovered(discovered);
    const url = this.resolveUrl(root);
    const formTitle = this.readPageTitle(root);
    if (formTitle) {
      return this.extractFromDiscovered(discovered, classified, {
        url,
        formTitle,
      });
    }
    return this.extractFromDiscovered(discovered, classified, { url });
  }

  extractReport(root: ParentNode = document): ExtractionReport {
    return this.extractResult(root).report;
  }

  async extract(): Promise<Form> {
    if (!this.canHandle()) {
      throw createAppError(
        ErrorCode.FORM_NOT_FOUND,
        'Google Forms adapter cannot handle this page.',
      );
    }
    return this.extractResult().form;
  }

  async fill(plan: FillPlan): Promise<FillResult> {
    if (!this.canHandle()) {
      throw createAppError(
        ErrorCode.FORM_NOT_FOUND,
        'Google Forms adapter cannot handle this page.',
      );
    }
    return applyFillPlanToDom(plan, document);
  }

  /** Synchronous fill against an optional root (fixtures / tests). */
  fillSync(plan: FillPlan, root: ParentNode = document): FillResult {
    return applyFillPlanToDom(plan, root);
  }

  private resolveUrl(root: ParentNode): string {
    if (root instanceof Document) {
      return root.location?.href ?? location.href;
    }
    if (root instanceof Element) {
      return root.ownerDocument.location?.href ?? location.href;
    }
    return location.href;
  }

  /** Structural page title only — never respondent/account fields. */
  private readPageTitle(root: ParentNode): string {
    const doc =
      root instanceof Document
        ? root
        : root instanceof Element
          ? root.ownerDocument
          : document;
    const title = doc.querySelector('title')?.textContent?.trim() ?? '';
    if (!title) {
      return '';
    }
    // Strip common Google Forms suffix when present.
    return title.replace(/\s*-\s*Google\s+Forms\s*$/i, '').trim();
  }
}

export function createGoogleFormsAdapter(): GoogleFormsAdapter {
  return new GoogleFormsAdapter();
}
