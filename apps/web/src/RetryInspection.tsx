import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, retryInspection } from './api';

export default function RetryInspection({ inspectionId }: { inspectionId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const operation = useRef<string | undefined>(undefined);
  const active = useRef(false);
  const busy = useRef(false);
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);
  const mutation = useMutation({
    retry: false, networkMode: 'always',
    mutationFn: async (key: string) => {
      request.current = new AbortController();
      return retryInspection(inspectionId, key, request.current.signal);
    },
    onSuccess: accepted => {
      if (!active.current) return;
      void client.invalidateQueries({ queryKey: ['inspection-history'], refetchType: 'none' });
      void client.invalidateQueries({ queryKey: ['inspection', inspectionId], refetchType: 'none' });
      navigate(`/inspections/${accepted.id}`, { state: location.state });
    },
    onSettled: () => { busy.current = false; },
  });
  const retryable = !(mutation.error instanceof ApiClientError) || mutation.error.retryable;
  return <section className="retry-panel" aria-label="Inspection recovery">
    <p>Retry creates a separate inspection using the same canonical image. This failure remains available.</p>
    {mutation.error && <div role="alert" className="error-panel">
      <p>The retry could not be confirmed.</p>
      <p>{mutation.error instanceof ApiClientError ? mutation.error.message : 'Please check your connection and try again.'}</p>
      {retryable && <p>Try again to confirm the same retry request; it will not create another attempt if already accepted.</p>}
    </div>}
    {mutation.isPending && <p role="status">Submitting retry…</p>}
    <button type="button" disabled={mutation.isPending || Boolean(mutation.error && !retryable)} onClick={() => {
      if (busy.current) return;
      operation.current ??= crypto.randomUUID(); busy.current = true; mutation.mutate(operation.current);
    }}>{mutation.isPending ? 'Submitting retry…' : mutation.error ? 'Retry submission' : 'Retry inspection'}</button>
    {mutation.data && <p role="status">New attempt accepted. <Link to={`/inspections/${mutation.data.id}`} state={location.state}>Open new attempt</Link></p>}
  </section>;
}
