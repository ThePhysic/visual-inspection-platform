import { lazy, Suspense, useReducer, useState } from 'react';
import { type AssetResponse, type InferenceResult } from '@vip/contracts';
import DetectionViewer from '../DetectionViewer';
import { canEdit, createReviewState, isDirty, reviewReducer } from './draft';
import { useDraftWarning } from './useDraftWarning';

const AnnotationEditor = lazy(() => import('./AnnotationEditor'));

export default function ReviewWorkspace(props: { inspectionId: string; asset: AssetResponse | undefined; result: InferenceResult }) {
  // The parent keys this boundary by inspection ID. Refetching the same immutable
  // result must not reinitialize a draft; another inspection gets a fresh state.
  const [state, dispatch] = useReducer(reviewReducer, props, createReviewState);
  const [editing, setEditing] = useState(false);
  const dirty = isDirty(state);
  useDraftWarning(dirty);
  return <>
    <div className="review-toolbar">
      <button type="button" className="secondary" disabled={!canEdit(props.result)} onClick={() => { setEditing(value => !value); }}>
        {editing ? 'View original predictions' : dirty ? 'Continue editing local draft' : 'Edit local draft'}
      </button>
      {!editing && dirty && <p role="status">Unsaved local draft retained. Original predictions are shown below.</p>}
    </div>
    {editing ? <Suspense fallback={<p role="status">Loading annotation editor…</p>}>
      <AnnotationEditor asset={props.asset} state={state} dispatch={dispatch} />
    </Suspense> : <DetectionViewer asset={props.asset} result={props.result} />}
  </>;
}
