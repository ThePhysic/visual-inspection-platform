import { useContext, useEffect } from 'react';
import { DraftNavigationContext } from './draftNavigationContext';

export function useDraftWarning(dirty: boolean) {
  const register = useContext(DraftNavigationContext);
  useEffect(() => { register?.(dirty); return () => { register?.(false); }; }, [dirty, register]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty]);
}
