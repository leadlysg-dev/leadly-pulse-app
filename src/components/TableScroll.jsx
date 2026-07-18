import { useCallback, useEffect, useRef, useState } from 'react';

// Horizontal scroll container for wide tables that makes the overflow
// obvious: an always-visible scrollbar, a fade at the edge that still has
// more columns, and a shadow under the sticky name column once scrolled -
// so a cut-off table never looks like the end of the data.
export default function TableScroll({ children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((cur) => (cur.left === left && cur.right === right ? cur : { left, right }));
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // column count changes (metric config, expanded rows) resize the table
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [update, children]);

  return (
    <div className={`table-scroll-wrap${edges.left ? ' can-left' : ''}${edges.right ? ' can-right' : ''}`}>
      <div className="table-scroll" ref={ref} onScroll={update}>
        {children}
      </div>
    </div>
  );
}
