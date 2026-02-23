import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import Yoga from "yoga-layout";
import { Grid } from "./grid";
import { computeLayout, computeOverlays } from "./layout";
import { paint } from "./paint";
import { createRoot, type Root } from "./reconciler";
import type { SliderOverlay, RadioOverlay, ButtonOverlay, Overlay, ColorRun, LayoutNode } from "./types";

function useCharCols(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let chWidth = 0;

    const measureChar = () => {
      const probe = document.createElement("span");
      probe.style.visibility = "hidden";
      probe.style.position = "absolute";
      probe.style.whiteSpace = "pre";
      probe.textContent = "0000000000";
      el.appendChild(probe);
      chWidth = probe.getBoundingClientRect().width / 10;
      el.removeChild(probe);
    };

    const updateCols = () => {
      if (chWidth > 0) {
        setCols(Math.floor(el.clientWidth / chWidth));
      }
    };

    const init = () => {
      measureChar();
      updateCols();
    };

    init();
    document.fonts.ready.then(init);

    const observer = new ResizeObserver(updateCols);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return [ref, cols];
}

interface TuiProps {
  cols?: number;
  className?: string;
  children?: ReactNode;
}

export function Tui({ cols: fixedCols, className, children }: TuiProps) {
  const [ref, measuredCols] = useCharCols();
  const cols = fixedCols ?? measuredCols;

  const rootRef = useRef<Root>(null!);
  if (!rootRef.current) rootRef.current = createRoot();
  rootRef.current.update(children);

  useEffect(() => () => rootRef.current?.unmount(), []);

  if (cols === 0) {
    // Still measuring — render invisible container for measurement
    return <div ref={fixedCols ? undefined : ref} className={className} />;
  }

  const nodes = rootRef.current.getTree();
  const layouts = computeLayout(Yoga, nodes, cols);
  const overlays = computeOverlays(layouts);

  const totalHeight = layouts.reduce(
    (max, l) => Math.max(max, l.top + l.height),
    0,
  );
  const grid = new Grid(cols, totalHeight);
  paint(grid, layouts);

  const colorRuns = grid.toColorRuns();

  // Group rows into segments: panel rows (inside a box) vs gap rows (between boxes)
  const segments = buildSegments(layouts, colorRuns, totalHeight);

  return (
    <div ref={fixedCols ? undefined : ref} className={className}>
      {segments.map((segment, segIdx) => {
        if (segment.type === "gap") {
          return (
            <pre key={`g${segIdx}`} className="tui-pre">
              {renderRows(segment.rows)}
            </pre>
          );
        }

        const panelOverlays = overlays
          .filter((o) => o.top >= segment.startRow && o.top < segment.startRow + segment.rows.length)
          .map((o) => ({ ...o, top: o.top - segment.startRow }));

        return (
          <div key={`p${segIdx}`} className="panel">
            <pre className="tui-pre">
              {renderRows(segment.rows)}
            </pre>
            {panelOverlays.map((overlay, oIdx) => (
              <OverlayElement key={oIdx} overlay={overlay} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// --- Segments: group rows by panel vs gap ---

type Segment =
  | { type: "gap"; rows: ColorRun[][] }
  | { type: "panel"; startRow: number; rows: ColorRun[][] };

function buildSegments(layouts: LayoutNode[], colorRuns: ColorRun[][], totalHeight: number): Segment[] {
  const rowOwner = new Array<LayoutNode | null>(totalHeight).fill(null);
  for (const layout of layouts) {
    for (let row = layout.top; row < Math.min(layout.top + layout.height, totalHeight); row++) {
      rowOwner[row] = layout;
    }
  }

  const segments: Segment[] = [];
  let i = 0;
  while (i < totalHeight) {
    const owner = rowOwner[i];
    const startRow = i;
    const rows: ColorRun[][] = [];
    while (i < totalHeight && rowOwner[i] === owner) {
      if (colorRuns[i]) rows.push(colorRuns[i]!);
      i++;
    }
    if (rows.length > 0) {
      segments.push(owner ? { type: "panel", startRow, rows } : { type: "gap", rows });
    }
  }
  return segments;
}

// --- Render rows as spans ---

function renderRows(rows: ColorRun[][]): ReactNode {
  return rows.map((runs, rowIdx) => (
    <Fragment key={rowIdx}>
      {rowIdx > 0 && "\n"}
      {runs.map((run, runIdx) => (
        <span key={runIdx} className={`c-${run.color}`}>{run.text}</span>
      ))}
    </Fragment>
  ));
}

// --- Overlay elements ---

function OverlayElement({ overlay }: { overlay: Overlay }) {
  switch (overlay.type) {
    case "slider":
      return <SliderOverlayElement overlay={overlay} />;
    case "radio-option":
      return <RadioOverlayElement overlay={overlay} />;
    case "button":
      return <ButtonOverlayElement overlay={overlay} />;
  }
}

function SliderOverlayElement({ overlay }: { overlay: SliderOverlay }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const getValueFromX = useCallback(
    (x: number) => {
      const el = overlayRef.current;
      if (!el) return overlay.min;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
      return Math.round(overlay.min + ratio * (overlay.max - overlay.min));
    },
    [overlay.min, overlay.max],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = overlayRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      overlay.onChange(getValueFromX(e.clientX));
    },
    [getValueFromX, overlay],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId))
        return;
      overlay.onChange(getValueFromX(e.clientX));
    },
    [getValueFromX, overlay],
  );

  return (
    <div
      ref={overlayRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      className="tui-overlay tui-overlay--thumb"
      style={{
        top: `${overlay.top}em`,
        left: `${overlay.left}ch`,
        width: `${overlay.width}ch`,
        cursor: "grab",
        touchAction: "none",
      }}
    />
  );
}

function RadioOverlayElement({ overlay }: { overlay: RadioOverlay }) {
  return (
    <div
      className="tui-overlay tui-overlay--radio"
      style={{
        top: `${overlay.top}em`,
        left: `${overlay.left}ch`,
        width: `${overlay.width}ch`,
        cursor: "pointer",
      }}
      onClick={() => overlay.onChange(overlay.option)}
    />
  );
}

function ButtonOverlayElement({ overlay }: { overlay: ButtonOverlay }) {
  return (
    <div
      className="tui-overlay tui-overlay--button"
      style={{
        top: `${overlay.top}em`,
        left: `${overlay.left}ch`,
        width: `${overlay.width}ch`,
        cursor: overlay.cursor,
      }}
      onClick={overlay.onClick}
    />
  );
}
