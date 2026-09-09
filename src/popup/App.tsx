import { useEffect, useState } from 'react';
import {
  MessageType,
  sendMessage,
  isErrorResponse,
} from '@/utils/messaging';
import type { ExtensionStatusResponse } from '@/utils/messaging';

export function App() {
  const [status, setStatus] = useState<ExtensionStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setError(`${response.error.code}: ${response.error.message}`);
          return;
        }
        if (!('version' in response) || !('ready' in response)) {
          setError('Unexpected status response from service worker');
          return;
        }
        setStatus(response);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to reach service worker');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="popup">
      <header className="popup__header">
        <h1 className="popup__title">Google Form AutoFiller</h1>
        <p className="popup__subtitle">P2 discovery</p>
      </header>

      <section className="popup__section" aria-live="polite">
        {error ? (
          <p className="popup__error">{error}</p>
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

      <p className="popup__note">
        Domain model and Google Forms discovery are in place. Classification,
        matching, AI answers, and autofill are not implemented yet.
      </p>
    </main>
  );
}
