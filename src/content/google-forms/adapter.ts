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
import {
  inspectNavigation,
  navigateSection,
  runNavigation,
} from './navigation';
import type { NavigationAction, NavigationResult } from '@/core/types/navigation';
import type { DiscoveredQuestion, DiscoveryReport } from './types';
import type { ClassifiedQuestion } from '@/core/types/classification-report';

/**
 * Google Forms adapter boundary.
 * P2 discovery → P3 classification → P4 extraction → P5 fill → P6 navigation.
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
   * Complete a one-pass extraction with metadata from the current page.
   * Used when discovery/classification have already run (for example diagnostics).
   */
  extractCurrentFromDiscovered(
    discovered: readonly DiscoveredQuestion[],
    classified: readonly ClassifiedQuestion[],
    root: ParentNode = document,
  ): ExtractionResult {
    const url = this.resolveUrl(root);
    const formTitle = this.readPageTitle(root);
    return this.extractFromDiscovered(discovered, classified, {
      url,
      ...(formTitle ? { formTitle } : {}),
    });
  }

  /**
   * Discover → classify → extract in one controlled pass.
   */
  extractResult(root: ParentNode = document): ExtractionResult {
    const discovered = this.discoverQuestions(root);
    const classified = this.classifyDiscovered(discovered);
    return this.extractCurrentFromDiscovered(discovered, classified, root);
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

  /** P6: inspect current section navigation chrome (read-only). */
  inspectNavigation(root: ParentNode = document) {
    return inspectNavigation(root);
  }

  /** P6: navigate next/back or inspect; never submits. */
  navigate(action: NavigationAction, root: ParentNode = document): NavigationResult {
    return runNavigation(action, root);
  }

  navigateNext(root: ParentNode = document): NavigationResult {
    return navigateSection('next', root);
  }

  navigateBack(root: ParentNode = document): NavigationResult {
    return navigateSection('back', root);
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
