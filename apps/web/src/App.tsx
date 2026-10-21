import { useEffect, useState } from 'react';
import { type HealthResponse } from '@vip/contracts';
import { fetchHealth } from './api';

type HealthState =
  | { status: 'loading' }
  | { status: 'success'; health: HealthResponse }
  | { status: 'error' };

export default function App() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal).then(
      (health) => {
        if (!controller.signal.aborted) setState({ status: 'success', health });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );

    return () => { controller.abort(); };
  }, [attempt]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  return (
    <main>
      <h1>Visual Inspection Platform</h1>
      <p>Service status</p>
      <section aria-labelledby="health-heading" aria-busy={state.status === 'loading'}>
        <h2 id="health-heading">API health</h2>
        <div role="status" aria-live="polite">
          {state.status === 'loading' && <p>Checking API health…</p>}
          {state.status === 'success' && (
            <>
              <p className="healthy">API is healthy.</p>
              <dl>
                <dt>Service</dt><dd>{state.health.service}</dd>
                <dt>API version</dt><dd>{state.health.apiVersion}</dd>
              </dl>
            </>
          )}
        </div>
        {state.status === 'error' && (
          <>
            <p role="alert">Unable to check API health. Please try again.</p>
            <button type="button" onClick={retry}>Try again</button>
          </>
        )}
      </section>
    </main>
  );
}
