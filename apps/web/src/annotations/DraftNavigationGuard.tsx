import { useEffect, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { DraftNavigationContext } from './draftNavigationContext';

export default function DraftNavigationGuard({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Leave this inspection and discard the unsaved local draft?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  return <DraftNavigationContext value={setDirty}>{children}</DraftNavigationContext>;
}
