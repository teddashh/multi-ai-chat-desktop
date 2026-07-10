import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModalDialog } from '../ui/ModalDialog';
import { Resizer } from '../ui/Resizer';

describe('accessible interaction primitives', () => {
  it('exposes modal semantics and its accessible title', () => {
    const html = renderToStaticMarkup(
      <ModalDialog titleId="dialog-title" panelClassName="panel">
        <h2 id="dialog-title">Settings</h2>
        <button type="button">Close</button>
      </ModalDialog>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="dialog-title"');
  });

  it('lets keyboard users resize the focus pane', () => {
    const onDrag = vi.fn();
    const tree = Resizer({ label: 'Resize', onDrag, value: 620, min: 420, max: 800 });
    const preventDefault = vi.fn();

    tree.props.onKeyDown({ key: 'ArrowRight', shiftKey: false, preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(onDrag).toHaveBeenNthCalledWith(1, 0, 'start');
    expect(onDrag).toHaveBeenNthCalledWith(2, 16, 'end');
    expect(tree.props['aria-valuenow']).toBe(620);
  });
});
