import { canHandleGoogleFormsPage, detectGoogleFormsPage } from './detect';
import { discoverQuestionContainers, previewText } from './discover';
import type { DiscoveredQuestion, DiscoveryReport } from './types';

/**
 * Build a serializable discovery report.
 * Omits Element references and never includes answer values / checked state.
 */
export function buildDiscoveryReport(
  root: ParentNode = document,
  doc: Document = document,
): DiscoveryReport {
  const detection = detectGoogleFormsPage(doc);
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
  let containersWithControls = 0;
  let containersWithoutControls = 0;
  let totalControls = 0;

  const reports = questions.map((question) => {
    const controlCount = question.candidateControls.length;
    totalControls += controlCount;
    if (question.diagnostics.hasRecognizableControls) {
      containersWithControls += 1;
    } else {
      containersWithoutControls += 1;
    }

    return {
      index: question.index,
      controlCount,
      hasTextCandidate: question.candidateTextElement !== null,
      hasDescriptionCandidate: question.candidateDescriptionElement !== null,
      hasRecognizableControls: question.diagnostics.hasRecognizableControls,
      textPreview: previewText(question.candidateTextElement),
      controls: question.diagnostics.controlEvidence,
      notes: question.diagnostics.notes,
    };
  });

  return {
    url: meta.url,
    canHandle: meta.canHandle || canHandleGoogleFormsPage(),
    strategy: 'role-listitem',
    containerCount: questions.length,
    containersWithControls,
    containersWithoutControls,
    totalControls,
    questions: reports,
  };
}

/** Safe console diagnostics for development — no answer values. */
export function logDiscoveryReport(report: DiscoveryReport): void {
  console.info('[Google Form AutoFiller] Discovery report', {
    url: report.url,
    canHandle: report.canHandle,
    strategy: report.strategy,
    containerCount: report.containerCount,
    containersWithControls: report.containersWithControls,
    containersWithoutControls: report.containersWithoutControls,
    totalControls: report.totalControls,
    questions: report.questions.map((question) => ({
      index: question.index,
      controlCount: question.controlCount,
      hasTextCandidate: question.hasTextCandidate,
      hasDescriptionCandidate: question.hasDescriptionCandidate,
      hasRecognizableControls: question.hasRecognizableControls,
      textPreview: question.textPreview,
      notes: question.notes,
      controls: question.controls.map((control) => ({
        tagName: control.tagName,
        role: control.role,
        inputType: control.inputType,
        ariaLabel: control.ariaLabel,
        name: control.name,
        dataAttributeNames: control.dataAttributeNames,
      })),
    })),
  });
}
