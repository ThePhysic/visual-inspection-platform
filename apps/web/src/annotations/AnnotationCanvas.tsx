import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import Konva from 'konva';
import { type AssetResponse } from '@vip/contracts';
import { classColor } from '../presentation';
import { type ReviewAnnotation } from './draft';
import { canvasViewport, clampPoint, constrainResize, dragBox, drawingPixels, finishDrawing, toPixels, transformBox, type Box, type Point, type Size } from './geometry';

export interface AnnotationCanvasProps {
  asset: AssetResponse;
  annotations: readonly ReviewAnnotation[];
  selectedId: string | undefined;
  mode: 'select' | 'draw';
  onSelect: (id: string | undefined) => void;
  onBox: (id: string, box: Box) => void;
  onDraw: (box: Box) => void;
  onCancelDraw: () => void;
}

function AnnotationShape({ annotation, selected, size, minimum, onSelect, onBox }: {
  annotation: ReviewAnnotation; selected: boolean; size: Size; minimum: Size;
  onSelect: AnnotationCanvasProps['onSelect']; onBox: AnnotationCanvasProps['onBox'];
}) {
  const shape = useRef<Konva.Rect>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const pixels = toPixels(annotation.boundingBox, size);
  useEffect(() => {
    if (!selected || !shape.current || !transformer.current) return;
    const handle = transformer.current;
    handle.nodes([shape.current]);
    handle.getLayer()?.batchDraw();
    return () => { handle.nodes([]); };
  }, [selected]);
  return <>
    <Rect ref={shape} {...pixels} name="annotation" draggable={selected}
      stroke={classColor(annotation.classId)} strokeWidth={selected ? 3 : 2} strokeScaleEnabled={false}
      fill={selected ? 'rgba(18,100,163,0.12)' : 'rgba(0,0,0,0.001)'}
      onPointerDown={event => { event.cancelBubble = true; onSelect(annotation.id); }}
      onClick={() => { onSelect(annotation.id); }} onTap={() => { onSelect(annotation.id); }}
      dragBoundFunc={position => { const box = toPixels(dragBox(annotation.boundingBox, position, size), size); return { x: box.x, y: box.y }; }}
      onDragEnd={event => {
        if (!event.evt) return; // destruction/viewport cancellation is not a commit
        const box = dragBox(annotation.boundingBox, event.target.position(), size);
        const position = toPixels(box, size);
        event.target.position({ x: position.x, y: position.y });
        onBox(annotation.id, box);
      }}
      onTransformEnd={event => {
        if (!event.evt) return;
        const node = shape.current;
        if (!node) return;
        const box = transformBox(annotation.boundingBox, { x: node.x(), y: node.y(), width: node.width(), height: node.height(), scaleX: node.scaleX(), scaleY: node.scaleY() }, size, minimum);
        // Konva transforms scales, not domain dimensions. Bake the final size
        // into the node and return scale to one even for rejected/no-op changes.
        node.scale({ x: 1, y: 1 }); node.setAttrs(toPixels(box, size));
        onBox(annotation.id, box);
        transformer.current?.forceUpdate();
      }} />
    {selected && <Transformer ref={transformer} rotateEnabled={false} flipEnabled={false} keepRatio={false}
      shiftBehavior="none" ignoreStroke anchorSize={10} borderStroke="#172b3a" anchorStroke="#172b3a" anchorFill="white"
      boundBoxFunc={(oldBox, newBox) => ({ ...constrainResize(oldBox, newBox, size, minimum), rotation: 0 })} />}
  </>;
}

function InteractiveStage(props: Omit<AnnotationCanvasProps, 'asset'> & { viewport: ReturnType<typeof canvasViewport> }) {
  const { viewport: { size, scale, minimum }, mode, annotations, selectedId, onSelect, onBox, onDraw, onCancelDraw } = props;
  const stage = useRef<Konva.Stage>(null);
  const start = useRef<Point | undefined>(undefined);
  const [drawing, setDrawing] = useState<ReturnType<typeof drawingPixels>>();
  useEffect(() => {
    const cancel = () => { start.current = undefined; setDrawing(undefined); };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); };
  }, []);
  // Remount on mode/viewport changes so in-progress gestures cannot commit
  // pixels measured against a previous image rectangle.
  return <div className={`interactive-canvas ${mode === 'draw' ? 'drawing' : ''}`} role="group" aria-label="Annotation canvas" aria-describedby="canvas-help" tabIndex={0}
    onKeyDown={event => { if (event.key === 'Escape') { start.current = undefined; setDrawing(undefined); onCancelDraw(); } }}>
    <div style={{ width: size.width, height: size.height, transform: `scale(${scale.x}, ${scale.y})`, transformOrigin: 'top left' }}>
    <Stage ref={stage} width={size.width} height={size.height}
      onPointerDown={event => {
        if (event.evt.button !== 0 && event.evt.pointerType !== 'touch') return;
        const pointer = stage.current?.getPointerPosition();
        if (!pointer) return;
        if (mode === 'draw') {
          start.current = clampPoint(pointer, size); setDrawing(undefined);
          const target = event.evt.target;
          if (target instanceof Element && 'setPointerCapture' in target) target.setPointerCapture(event.evt.pointerId);
        } else if (event.target === stage.current) onSelect(undefined);
      }}
      onPointerMove={() => { const pointer = stage.current?.getPointerPosition(); if (mode === 'draw' && start.current && pointer) setDrawing(drawingPixels(start.current, pointer, size)); }}
      onPointerUp={() => {
        const pointer = stage.current?.getPointerPosition();
        if (mode !== 'draw' || !start.current || !pointer) return;
        const box = finishDrawing(start.current, pointer, size, minimum);
        start.current = undefined; setDrawing(undefined);
        if (box) onDraw(box);
      }}
      onPointerCancel={() => { start.current = undefined; setDrawing(undefined); }}>
      <Layer>
        {annotations.filter(annotation => annotation.origin === 'manual' || annotation.disposition !== 'rejected').map(annotation => mode === 'draw'
          ? <Rect key={annotation.id} {...toPixels(annotation.boundingBox, size)} stroke={classColor(annotation.classId)} strokeWidth={2} listening={false} />
          : <AnnotationShape key={annotation.id} annotation={annotation} selected={annotation.id === selectedId} size={size} minimum={minimum} onSelect={onSelect} onBox={onBox} />)}
        {drawing && <Rect {...drawing} stroke="#172b3a" strokeWidth={2} dash={[5, 4]} fill="rgba(18,100,163,0.12)" listening={false} />}
      </Layer>
    </Stage>
    </div>
  </div>;
}

export default function AnnotationCanvas(props: AnnotationCanvasProps) {
  const { asset } = props;
  const image = useRef<HTMLImageElement>(null);
  const [load, setLoad] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    if (load !== 'loaded' || !image.current) return;
    let active = true;
    const node = image.current;
    const observer = new ResizeObserver(entries => {
      const entry = entries.find(item => item.target === node);
      if (!entry || !active) return;
      const { width, height } = entry.contentRect;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(node);
    return () => { active = false; observer.disconnect(); };
  }, [load]);
  return <figure>
    {load === 'loading' && <p role="status">Loading canonical image for editing…</p>}
    {load === 'error' && <div role="alert"><p>The canonical image could not be loaded or its dimensions do not match. Geometry editing is unavailable; your local draft is retained.</p>
      <button type="button" onClick={() => { setLoad('loading'); setSize({ width: 0, height: 0 }); setAttempt(value => value + 1); }}>Retry editor image</button></div>}
    <div className="image-frame editor-frame" hidden={load === 'error'} style={{ aspectRatio: `${asset.width} / ${asset.height}`, maxWidth: `min(100%, ${65 * asset.width / asset.height}vh)` }}>
      <img key={attempt} ref={image} src={asset.contentUrl} width={asset.width} height={asset.height} alt="Canonical image for annotation editing" draggable={false}
        onLoad={event => {
          if (event.currentTarget.naturalWidth !== asset.width || event.currentTarget.naturalHeight !== asset.height) { setLoad('error'); return; }
          const rectangle = event.currentTarget.getBoundingClientRect();
          setSize({ width: rectangle.width, height: rectangle.height }); setLoad('loaded');
        }} onError={() => { setLoad('error'); }} />
      {load === 'loaded' && size.width > 0 && size.height > 0 && <InteractiveStage key={`${props.mode}:${size.width}:${size.height}`} {...props} viewport={canvasViewport(size)} />}
    </div>
    <figcaption>Canonical image · {asset.width} × {asset.height} pixels. Geometry is stored in normalized image coordinates.</figcaption>
  </figure>;
}
