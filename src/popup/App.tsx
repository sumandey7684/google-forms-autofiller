import { useCallback, useEffect, useState } from 'react';
import {
  MessageType,
  sendMessage,
  isErrorResponse,
} from '@/utils/messaging';
import type { ExtensionStatusResponse } from '@/utils/messaging';
import type { AnswerValue } from '@/core/types/answer';
import type { AutofillReviewItem } from '@/core/engine/index';
import {
  createInitialWorkflowState,
  runDetectAndResolve,
  applyWorkflowReview,
  runApprovedFill,
  formatAnswerPreview,
  type WorkflowState,
} from './workflow';

function statusClass(status: AutofillReviewItem['status']): string {
  switch (status) {
    case 'valid':
      return 'review-status review-status--valid';
    case 'missing':
      return 'review-status review-status--missing';
    case 'invalid':
      return 'review-status review-status--invalid';
    case 'ambiguous':
      return 'review-status review-status--ambiguous';
    case 'unsupported':
      return 'review-status review-status--unsupported';
    case 'provider_error':
      return 'review-status review-status--provider';
    default:
      return 'review-status';
  }
}

function parseEditedValue(
  item: AutofillReviewItem,
  raw: string,
): AnswerValue {
  if (item.questionType === 'checkbox') {
    const values = raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return { kind: 'multi', values };
  }
  return { kind: 'single', value: raw };
}

export function App() {
  const [status, setStatus] = useState<ExtensionStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowState>(
    createInitialWorkflowState(),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    void sendMessage({
      type: MessageType.GET_EXTENSION_STATUS,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (isErrorResponse(response)) {
          setStatusError(`${response.error.code}: ${response.error.message}`);
          return;
        }
        if (!('version' in response) || !('ready' in response)) {
          setStatusError('Unexpected status response from service worker');
          return;
        }
        setStatus(response);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatusError(
          err instanceof Error ? err.message : 'Failed to reach service worker',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onDetect = useCallback(() => {
    setWorkflow((prev) => ({
      ...prev,
      phase: 'loading',
      message: 'Detecting form and resolving answers…',
      fillResult: null,
      planRejection: null,
    }));
    void runDetectAndResolve().then((result) => {
      setWorkflow(result.state);
      if (result.ok) {
        const nextDrafts: Record<string, string> = {};
        for (const item of result.state.items) {
          nextDrafts[item.questionId] = formatAnswerPreview(item);
          if (nextDrafts[item.questionId] === '—') {
            nextDrafts[item.questionId] = '';
          }
        }
        setDrafts(nextDrafts);
      }
    });
  }, []);

  const onToggleApprove = useCallback(
    (questionId: string, approved: boolean) => {
      setWorkflow((prev) =>
        applyWorkflowReview(prev, { [questionId]: { approved } }),
      );
    },
    [],
  );

  const onApplyEdit = useCallback(
    (item: AutofillReviewItem) => {
      const raw = drafts[item.questionId] ?? '';
      const editedValue = parseEditedValue(item, raw);
      setWorkflow((prev) =>
        applyWorkflowReview(prev, {
          [item.questionId]: { editedValue, approved: true },
        }),
      );
    },
    [drafts],
  );

  const onFill = useCallback(() => {
    setWorkflow((prev) => ({
      ...prev,
      phase: 'filling',
      message: 'Applying approved answers…',
    }));
    void runApprovedFill(workflow).then((next) => {
      setWorkflow(next);
    });
  }, [workflow]);

  const approvedCount = workflow.items.filter(
    (item) => item.approved && item.fillable,
  ).length;

  return (
    <main className="popup">
      <header className="popup__header">
        <h1 className="popup__title">Google Form AutoFiller</h1>
        <p className="popup__subtitle">P11 review & fill</p>
      </header>

      <section className="popup__section" aria-live="polite">
        {statusError ? (
          <p className="popup__error">{statusError}</p>
        ) : status ? (
          <ul className="popup__meta">
            <li>
              <span>Version</span>
              <strong>{status.version}</strong>
            </li>
            <li>
              <span>Service worker</span>
              <strong>{status.ready ? 'Ready' : 'Not ready'}</strong>
            </li>
            <li>
              <span>Scope</span>
              <strong>{status.scope}</strong>
            </li>
          </ul>
        ) : (
          <p className="popup__muted">Connecting to service worker…</p>
        )}
      </section>

      <section className="popup__section popup__actions">
        <button
          type="button"
          className="popup__button"
          onClick={onDetect}
          disabled={
            workflow.phase === 'loading' || workflow.phase === 'filling'
          }
        >
          Detect & resolve
        </button>
        <button
          type="button"
          className="popup__button popup__button--primary"
          onClick={onFill}
          disabled={
            approvedCount === 0 ||
            workflow.phase === 'loading' ||
            workflow.phase === 'filling' ||
            workflow.phase === 'idle' ||
            workflow.phase === 'error'
          }
        >
          Fill approved ({approvedCount})
        </button>
      </section>

      {workflow.message ? (
        <p
          className={
            workflow.phase === 'error' ? 'popup__error' : 'popup__note'
          }
          role="status"
        >
          {workflow.message}
        </p>
      ) : null}

      {workflow.prepare ? (
        <section className="popup__section">
          <p className="popup__form-title">{workflow.prepare.formTitle}</p>
          <ul className="popup__meta">
            <li>
              <span>Questions</span>
              <strong>{workflow.prepare.validation.totals.total}</strong>
            </li>
            <li>
              <span>Fillable</span>
              <strong>{workflow.prepare.fillableCount}</strong>
            </li>
            <li>
              <span>Profile</span>
              <strong>
                {workflow.prepare.profileEmpty ? 'Empty' : 'Loaded'}
              </strong>
            </li>
          </ul>
        </section>
      ) : null}

      {workflow.items.length > 0 ? (
        <section className="popup__review" aria-label="Answer review">
          {workflow.items.map((item) => (
            <article key={item.questionId} className="review-item">
              <div className="review-item__head">
                <h2 className="review-item__title">{item.questionText}</h2>
                <span className={statusClass(item.status)}>{item.status}</span>
              </div>
              <p className="review-item__meta">
                {item.questionType}
                {item.required === true
                  ? ' · required'
                  : item.required === false
                    ? ' · optional'
                    : ' · required?'}
                {item.source ? ` · ${item.source}` : ''}
              </p>
              {item.editable ? (
                <div className="review-item__edit">
                  <label className="review-item__approve">
                    <input
                      type="checkbox"
                      checked={item.approved}
                      disabled={!item.fillable}
                      onChange={(event) =>
                        onToggleApprove(item.questionId, event.target.checked)
                      }
                    />
                    Approve
                  </label>
                  <input
                    className="review-item__input"
                    value={drafts[item.questionId] ?? ''}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [item.questionId]: event.target.value,
                      }))
                    }
                    aria-label={`Edit answer for ${item.questionText}`}
                  />
                  <button
                    type="button"
                    className="popup__button popup__button--small"
                    onClick={() => onApplyEdit(item)}
                  >
                    Apply edit
                  </button>
                </div>
              ) : (
                <p className="review-item__value">
                  {formatAnswerPreview(item)}
                </p>
              )}
              {item.validationErrors.length > 0 ? (
                <ul className="review-item__errors">
                  {item.validationErrors.map((error) => (
                    <li key={`${item.questionId}:${error.code}:${error.message}`}>
                      {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {workflow.fillResult ? (
        <section className="popup__section" aria-live="polite">
          <p className="popup__form-title">Fill result</p>
          <ul className="popup__meta">
            <li>
              <span>Successful</span>
              <strong>{workflow.fillResult.totals.successful}</strong>
            </li>
            <li>
              <span>Failed</span>
              <strong>{workflow.fillResult.totals.failed}</strong>
            </li>
            <li>
              <span>Unsupported</span>
              <strong>{workflow.fillResult.totals.unsupported}</strong>
            </li>
            <li>
              <span>Skipped</span>
              <strong>{workflow.fillResult.totals.skipped}</strong>
            </li>
          </ul>
          <p className="popup__note">
            Submit was never clicked. Review the form and submit manually.
          </p>
        </section>
      ) : null}

      {workflow.planRejection &&
      workflow.planRejection.rejected.length > 0 ? (
        <section className="popup__section">
          <p className="popup__error">Rejected before fill:</p>
          <ul className="review-item__errors">
            {workflow.planRejection.rejected.map((item) => (
              <li key={item.questionId}>
                {item.questionId}: {item.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="popup__note">
        Pipeline: detect → extract → match → resolve → validate → review →
        FillPlan → fill. Mock AI only; never auto-submits.
      </p>
    </main>
  );
}
