"use client";

import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One line of text that is clipped to its container, and reveals itself in full on hover or focus
 * when, and only when, it is actually clipped.
 *
 * The factor library is where this became necessary: element names come verbatim from CECODES's
 * workbook and some run to a hundred characters ("Otras tierras (suelo desnudo, desierto o roca)
 * convertidas en humedales o asentamientos"), so the column showed a prefix and an ellipsis, and
 * two different factors could be indistinguishable on screen. Element names and units come from
 * the factor library and nothing is hardcoded, so the app cannot shorten them; it can only show
 * them properly.
 *
 * WHY IT MEASURES rather than always attaching a tooltip. A tooltip that repeats text already
 * fully visible is noise, and on a table of several hundred rows it would also mount several
 * hundred tooltips nobody can use. So the span is measured, and the Tooltip is mounted only for
 * the rows that need one. `scrollWidth > clientWidth` is the check: with `truncate` (which is
 * overflow:hidden + text-overflow:ellipsis + white-space:nowrap) the content keeps its full
 * scrollWidth while the box stays at clientWidth, so the two differ exactly when text is lost.
 *
 * The measurement is re-run on resize, because a table column's width is set by its content and
 * the viewport, so the same string can be clipped at one window size and whole at another. The
 * observer watches the span itself rather than the window, which also covers a column that
 * changes width without the window doing so, such as when a filter changes what the table holds.
 *
 * ACCESSIBILITY: when the text is clipped the span becomes focusable, so a keyboard user can
 * reach the tooltip that a mouse user gets by hovering. When it is not clipped no tooltip and no
 * tab stop is added, because there would be nothing to reveal and every extra tab stop is a cost
 * paid on every row of the table.
 *
 * The rendered element is the same span either way, so nothing shifts when the measurement lands.
 */
export function TruncatedText({
  children,
  className,
  contentClassName,
}: {
  children: string;
  className?: string;
  contentClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let attempts = 0;

    // Every read goes through ref.current rather than a node captured once when the effect ran.
    // That is the whole fix, and it was found by measuring rather than by reasoning: the first
    // version held `const element = ref.current` and reported sw=0 cw=0 forever, on cells that
    // were visibly 222 wide inside a 208 box. An element with no layout, because it is not yet
    // attached or an ancestor is still display:none, reports zero for both, and a node that
    // hydration then replaces is never resized again, so ResizeObserver has nothing to report and
    // the stale reading stands. Reading the ref each time means the measurement always applies to
    // the node currently on screen.
    const measure = () => {
      const element = ref.current;
      if (!alive || !element) return;

      // Zero width is "ask again", not "fits". This is the state the factor table starts in, and
      // treating it as an answer is what silently disabled the tooltip on all 91 clipped cells.
      if (element.clientWidth === 0) {
        // Bounded on purpose. A cell inside a tab panel the user never opens stays at zero width
        // forever, and an unbounded retry would leave one animation-frame loop per row running for
        // the life of the page. About a second of frames is long enough for layout, and cheap
        // enough to be wrong about: ResizeObserver below still catches it when the panel opens.
        if (attempts++ < 60) frame = requestAnimationFrame(measure);
        return;
      }

      setClipped(element.scrollWidth > element.clientWidth);
    };

    measure();

    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);

    // Fonts change glyph widths without changing the box, so ResizeObserver never fires for them.
    // The layout loads Geist and Inter through next/font/google, and text that fits in the
    // fallback face can overflow once the real one arrives. Optional-chained because
    // document.fonts is absent in jsdom.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // The text itself is a dependency: a re-render with a longer string has to be re-measured,
    // and ResizeObserver does not fire when only the content changes at the same box size.
  }, [children]);

  const text = (
    <span
      ref={ref}
      className={cn("block truncate", className)}
      // Only a tab stop when there is something behind it. See the accessibility note above.
      tabIndex={clipped ? 0 : undefined}
    >
      {children}
    </span>
  );

  if (!clipped) return text;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      {/* Wrapping, not nowrap: these are sentences, and a hundred-character tooltip on one line
          would run off the viewport and be clipped a second time. */}
      <TooltipContent className={cn("max-w-sm text-pretty", contentClassName)}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
