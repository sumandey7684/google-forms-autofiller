import { canHandleGoogleFormsPage, detectGoogleFormsPage } from './detect';
import { discoverQuestionContainers, previewText } from './discovery';
import type { DiscoveredQuestion, DiscoveryReport } from './types';

/** Development diagnostics toggle — logging is never required for correctness. */
export const DISCOVERY_DEBUG_LOGGING = true;

/**
 * Build a serializable discovery report.
 * Omits Element references and never includes answer values / checked state.
 */
function resolveDocument(root: ParentNode, doc?: Document): Document {
  if (doc) {
    return doc;
  }
  if (root instanceof Document) {
    return root;
  }
  if (root instanceof Element) {
    return root.ownerDocument;
  }
  return document;
}

export function buildDiscoveryReport(
  root: ParentNode = document,
  doc?: Document,
): DiscoveryReport {
  const resolvedDoc = resolveDocument(root, doc);
  const detection = detectGoogleFormsPage(resolvedDoc);
  const questions = discoverQuestionContainers(root);

  return summarizeDiscoveredQuestions(questions, {
    url: detection.url,
    canHandle: detection.canHandle,
  });
}

export function summarizeDiscoveredQuestions(
  questions: readonly DiscoveredQuestion[],
  meta: { url: string; canHandle: boolean },
): DiscoveryReport {
  let recognized = 0;
  let missingControls = 0;
  let missingTitles = 0;
  let missingProviderIds = 0;
  let totalControls = 0;

  const signal = questions[0]?.diagnostics.signal ?? 'none';

  const reports = questions.map((question) => {
    const controlCount = question.controls.length;
    totalControls += controlCount;

    if (question.diagnostics.hasInteractiveControls) {
      recognized += 1;
    } else {
      missingControls += 1;
    }
    if (!question.diagnostics.hasTitleCandidate) {
      missingTitles += 1;
    }
    if (!question.diagnostics.hasProviderId) {
      missingProviderIds += 1;
    }

    return {
      index: question.index,
      discoveryId: question.discoveryId,
      providerId: question.providerId ?? null,
      controlCount,
      hasTextCandidate: question.diagnostics.hasTitleCandidate,
      hasDescriptionCandidate: question.diagnostics.hasDescriptionCandidate,
      hasInteractiveControls: question.diagnostics.hasInteractiveControls,
      required: question.required ?? null,
      textPreview: previewText(question.titleElement),
      controls: question.diagnostics.controlEvidence,
      notes: question.diagnostics.notes,
    };
  });

  return {
    url: meta.url,
    canHandle: meta.canHandle || canHandleGoogleFormsPage(),
    signal,
    containerCount: questions.length,
    recognized,
    missingControls,
    missingTitles,
    missingProviderIds,
    totalControls,
    questions: reports,
  };
}

/** Compact, safe console summary — no answer values. */
export function logDiscoverySummary(report: DiscoveryReport): void {
  if (!DISCOVERY_DEBUG_LOGGING) {
    return;
  }

  console.info(
    [
      '[Google Form AutoFiller] Discovery:',
      `questions=${report.containerCount}`,
      `recognized=${report.recognized}`,
      `missingControls=${report.missingControls}`,
      `missingTitles=${report.missingTitles}`,
      `missingProviderIds=${report.missingProviderIds}`,
      `signal=${report.signal}`,
    ].join('\n'),
  );
}

/** Optional verbose safe dump for deeper debugging (still no answer values). */
export function logDiscoveryReport(report: DiscoveryReport): void {
  if (!DISCOVERY_DEBUG_LOGGING) {
    return;
  }

  logDiscoverySummary(report);
  console.info('[Google Form AutoFiller] Discovery details', {
    url: report.url,
    canHandle: report.canHandle,
    totalControls: report.totalControls,
    questions: report.questions.map((question) => ({
      index: question.index,
      discoveryId: question.discoveryId,
      providerId: question.providerId,
      controlCount: question.controlCount,
      hasTextCandidate: question.hasTextCandidate,
      hasDescriptionCandidate: question.hasDescriptionCandidate,
      hasInteractiveControls: question.hasInteractiveControls,
      required: question.required,
      textPreview: question.textPreview,
      notes: question.notes,
      controls: question.controls.map((control) => ({
        kind: control.kind,
        tagName: control.tagName,
        role: control.role,
        inputType: control.inputType,
        ariaLabel: control.ariaLabel,
        name: control.name,
        hasProviderId: control.hasProviderId,
        dataAttributeNames: control.dataAttributeNames,
      })),
    })),
  });
}
