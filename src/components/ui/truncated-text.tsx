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
    const element = ref.current;
    if (!element) return;

    // Read on the way in as well as on every resize: the first paint is where most of these are
    // already clipped, and waiting for a resize that may never come would leave them silent.
    const measure = () => setClipped(element.scrollWidth > element.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
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
