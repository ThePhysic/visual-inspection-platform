import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnnotationCanvas from './AnnotationCanvas';
import { asset } from '../test/fixtures';

// Image lifecycle tests do not need a canvas renderer; actual rendering and
// pointer geometry are exercised in the browser suite.
vi.mock('react-konva', () => ({ Stage: () => null, Layer: () => null, Rect: () => null, Transformer: () => null }));
const callbacks = () => ({ onSelect: vi.fn(), onBox: vi.fn(), onDraw: vi.fn(), onCancelDraw: vi.fn() });
describe('editor image lifecycle', () => {
  it('shows image failure, retains editing state, and permits retry', () => {
    const handlers = callbacks();
    render(<AnnotationCanvas asset={asset} annotations={[]} selectedId={undefined} mode="select" {...handlers} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading canonical image');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('alert')).toHaveTextContent('your local draft is retained');
    fireEvent.click(screen.getByRole('button', { name: 'Retry editor image' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading canonical image');
    expect(handlers.onBox).not.toHaveBeenCalled(); expect(handlers.onDraw).not.toHaveBeenCalled();
  });
  it('refuses to edit an image whose decoded dimensions do not match metadata', () => {
    render(<AnnotationCanvas asset={asset} annotations={[]} selectedId={undefined} mode="select" {...callbacks()} />);
    const image = screen.getByRole('img');
    Object.defineProperties(image, { naturalWidth: { value: 10 }, naturalHeight: { value: 10 } });
    fireEvent.load(image);
    expect(screen.getByRole('alert')).toHaveTextContent('dimensions do not match');
  });
  it('disconnects its ResizeObserver on unmount', () => {
    const disconnect = vi.fn(); const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect; });
    const { unmount } = render(<AnnotationCanvas asset={asset} annotations={[]} selectedId={undefined} mode="select" {...callbacks()} />);
    const image = screen.getByRole('img');
    Object.defineProperties(image, { naturalWidth: { value: asset.width }, naturalHeight: { value: asset.height } });
    fireEvent.load(image); expect(observe).toHaveBeenCalledWith(image);
    unmount(); expect(disconnect).toHaveBeenCalledOnce();
  });
});
