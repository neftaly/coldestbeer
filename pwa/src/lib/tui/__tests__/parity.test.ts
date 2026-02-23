/**
 * Parity tests: verify the new TUI library produces identical character
 * output to the old imperative Panel.tsx / StatusBar.tsx / ConnectDialog.tsx.
 *
 * Each test manually computes the expected string using the same formulas
 * as the original components, then compares against paint() output.
 */
import { describe, it, expect } from "vitest";
import Yoga from "yoga-layout";
import { Grid } from "../grid";
import { computeLayout, computeOverlays } from "../layout";
import { buildTree } from "../reconciler";
import { paint } from "../paint";
import { createElement } from "react";
import { Box, Text, Slider, Radio } from "../components";

const yoga = Yoga;

// Helpers matching original Panel.tsx formulas exactly

function originalTopBorder(cols: number, title: string, headerValue?: string): string {
  const titlePart = `[ ${title} ]`;
  const valuePart = headerValue != null ? ` ${headerValue} ` : "";
  const topFill = Math.max(1, cols - 4 - titlePart.length - valuePart.length);
  return `┌─${titlePart}${"─".repeat(topFill)}${valuePart}─┐`;
}

function originalTextLine(cols: number, label: string, value: string): string {
  const inner = Math.max(1, cols - 4);
  const pad = Math.max(1, inner - label.length - value.length);
  return `│ ${label}${" ".repeat(pad)}${value} │`;
}

function originalSliderLine(cols: number, value: number | null, min: number, max: number, unit: string): string {
  const inner = Math.max(1, cols - 4);
  const digitWidth = Math.max(`${Math.abs(min)}`.length, `${Math.abs(max)}`.length);
  const hasNeg = min < 0;
  let numStr: string;
  if (value === null) {
    numStr = "-".repeat(digitWidth + (hasNeg ? 1 : 0));
  } else {
    const digits = `${Math.abs(value)}`.padStart(digitWidth);
    numStr = value < 0 ? `-${digits}` : `+${digits}`;
  }
  const thumbText = `${numStr}${unit}`;
  const trackLen = Math.max(0, inner - thumbText.length);
  const ratio = value !== null
    ? Math.max(0, Math.min(1, (value - min) / (max - min)))
    : 0.5;
  const left = Math.round(ratio * trackLen);
  const right = trackLen - left;
  return `│ ${"━".repeat(left)}${thumbText}${"━".repeat(right)} │`;
}

function originalRadioLine(cols: number, label: string, options: string[], activeValue: string | null): string {
  const inner = Math.max(1, cols - 4);
  const paddedLabel = label.padEnd(7);
  let content = paddedLabel;
  for (const opt of options) {
    const dot = opt === activeValue ? "●" : "○";
    content += ` ${dot} ${opt}`;
  }
  const pad = Math.max(0, inner - content.length);
  return `│ ${content}${" ".repeat(pad)} │`;
}

function originalBottomBorder(cols: number): string {
  const botFill = Math.max(1, cols - 2);
  return `└${"─".repeat(botFill)}┘`;
}

function originalStatusBar(cols: number, leftText: string, dot: string, rightText: string): string {
  // Original: left + pad + dot + right, where pad = cols - left.length - 1 - right.length
  const pad = Math.max(1, cols - leftText.length - 1 - rightText.length);
  return `${leftText}${" ".repeat(pad)}${dot}${rightText}`;
}

function rendered(children: React.ReactElement[], cols: number): string {
  const nodes = buildTree(children);
  const layouts = computeLayout(yoga, nodes, cols);
  const totalHeight = layouts.reduce((max, l) => Math.max(max, l.top + l.height), 0);
  const grid = new Grid(cols, totalHeight);
  paint(grid, layouts);
  return grid.toString();
}

describe("parity: Battery panel", () => {
  const COLS = 30;
  const title = "Battery";
  const headerValue = "--%";
  const lines = [
    { label: "Current", value: "--.-A" },
    { label: "Remaining", value: "--.-h" },
    { label: "Voltage", value: "--.-V" },
  ] as const;

  it("produces identical character output", () => {
    const expected = [
      originalTopBorder(COLS, title, headerValue),
      ...lines.map((l) => originalTextLine(COLS, l.label, l.value)),
      originalBottomBorder(COLS),
    ].join("\n");

    const actual = rendered(
      [
        createElement(
          Box,
          { border: true, title, headerValue },
          ...lines.map((l) => createElement(Text, { label: l.label, value: l.value, valueColor: "dim" })),
        ),
      ],
      COLS,
    );

    expect(actual).toBe(expected);
  });
});

describe("parity: Fridge panel", () => {
  const COLS = 30;
  const title = "Fridge";
  const headerValue = "--°C";

  it("produces identical character output", () => {
    const expected = [
      originalTopBorder(COLS, title, headerValue),
      originalSliderLine(COLS, null, -20, 20, "°"),
      originalRadioLine(COLS, "Mode", ["Max", "Eco"], "Eco"),
      originalRadioLine(COLS, "Cutoff", ["High", "Mid", "Low"], "High"),
      originalBottomBorder(COLS),
    ].join("\n");

    const actual = rendered(
      [
        createElement(
          Box,
          { border: true, title, headerValue },
          createElement(Slider, { value: null, min: -20, max: 20, unit: "°", onChange: () => {} }),
          createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange: () => {} }),
          createElement(Radio, { label: "Cutoff", options: ["High", "Mid", "Low"], value: "High", onChange: () => {} }),
        ),
      ],
      COLS,
    );

    expect(actual).toBe(expected);
  });
});

describe("parity: slider at various positions", () => {
  const COLS = 24;

  it.each([
    { value: -20, label: "min" },
    { value: 0, label: "zero" },
    { value: 20, label: "max" },
    { value: -5, label: "negative" },
    { value: 10, label: "positive" },
    { value: null, label: "null" },
  ])("slider at $label ($value)", ({ value }) => {
    const expected = originalSliderLine(COLS, value, -20, 20, "°");

    const actual = rendered(
      [
        createElement(
          Box,
          { border: true, title: "T" },
          createElement(Slider, { value, min: -20, max: 20, unit: "°", onChange: () => {} }),
        ),
      ],
      COLS,
    );

    const sliderLine = actual.split("\n")[1]!;
    expect(sliderLine).toBe(expected);
  });
});

describe("parity: StatusBar", () => {
  it("matches original layout", () => {
    const COLS = 30;
    const expected = originalStatusBar(COLS, "Camp Hub", "●", " WiFi");

    const nodes = buildTree([
      createElement(Text, { left: "Camp Hub", leftColor: "accent", rightPrefix: "●", rightPrefixColor: "red", right: " WiFi", rightColor: "label" }),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const grid = new Grid(COLS, 1);
    paint(grid, layouts);

    expect(grid.toString()).toBe(expected);
  });
});

describe("parity: ConnectDialog", () => {
  const COLS = 28;

  it("matches original dialog layout", () => {
    const inner = Math.max(1, COLS - 4);
    const botFill = Math.max(1, COLS - 2);
    const emptyLine = " ".repeat(inner);

    const padLR = (text: string) => {
      const pad = Math.max(0, inner - text.length);
      const l = Math.floor(pad / 2);
      return [" ".repeat(l), " ".repeat(pad - l)] as const;
    };

    const titleText = "Camp Hub";
    const buttonText = " Connect ";

    const expected = [
      "┌" + "─".repeat(botFill) + "┐",
      `│ ${emptyLine} │`,
      `│ ${padLR(titleText)[0]}${titleText}${padLR(titleText)[1]} │`,
      `│ ${emptyLine} │`,
      `│ ${padLR(buttonText)[0]}${buttonText}${padLR(buttonText)[1]} │`,
      `│ ${emptyLine} │`,
      "└" + "─".repeat(botFill) + "┘",
    ].join("\n");

    const actual = rendered(
      [
        createElement(
          Box,
          { border: true, borderColor: "border-bright" },
          createElement(Text, { value: "", centered: true }),
          createElement(Text, { value: "Camp Hub", centered: true }),
          createElement(Text, { value: "", centered: true }),
          createElement(Text, { value: " Connect ", valueColor: "thumb", centered: true }),
          createElement(Text, { value: "", centered: true }),
        ),
      ],
      COLS,
    );

    expect(actual).toBe(expected);
  });
});

describe("parity: overlay positions", () => {
  const COLS = 30;

  it("slider overlay matches original positioning", () => {
    const onChange = () => {};
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "Fridge", headerValue: "--°C" },
        createElement(Slider, { value: null, min: -20, max: 20, unit: "°", onChange }),
        createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange: () => {} }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const overlays = computeOverlays(layouts);

    const sliderOverlay = overlays.find((o) => o.type === "slider")!;
    const inner = Math.max(1, COLS - 4);

    // Original: top = lineIndex + 1, left = 2, width = inner
    // Slider is lineIndex=0 within the box, box starts at row 0
    // So absolute top = 0 + 1 (border) + 0 (lineIndex) = 1
    expect(sliderOverlay.top).toBe(1);
    expect(sliderOverlay.left).toBe(2);
    expect(sliderOverlay.width).toBe(inner);
  });

  it("radio overlay offsets match original RadioOverlay positioning", () => {
    const onChange = () => {};
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "Fridge" },
        createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const overlays = computeOverlays(layouts);

    // Original RadioOverlay: offset starts at 7 (padded label width)
    // "Max" → left=2+7=9, width=3+3=6
    // "Eco" → left=2+7+6=15, width=3+3=6
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({ type: "radio-option", left: 9, width: 6, option: "Max" });
    expect(overlays[1]).toMatchObject({ type: "radio-option", left: 15, width: 6, option: "Eco" });
  });

  it("dialog button overlay matches original ConnectDialog positioning", () => {
    const onClick = () => {};
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, borderColor: "border-bright" },
        createElement(Text, { value: "", centered: true }),
        createElement(Text, { value: "Camp Hub", centered: true }),
        createElement(Text, { value: "", centered: true }),
        createElement(Text, { value: " Connect ", valueColor: "thumb", centered: true, onClick, cursor: "pointer" }),
        createElement(Text, { value: "", centered: true }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 28);
    const overlays = computeOverlays(layouts);
    const inner = Math.max(1, 28 - 4);

    // Original: buttonLineIndex=3 (empty, title, empty, button), top = lineIndex + 1 = 4
    // In our layout: button is child index 3, top = 0 (box) + 1 (border) + 3 = 4
    const button = overlays.find((o) => o.type === "button")!;
    expect(button.top).toBe(4);
    expect(button.left).toBe(2);
    expect(button.width).toBe(inner);
  });
});

describe("parity: color classes", () => {
  const COLS = 24;

  it("text label gets c-label, value gets c-{color}", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "T" },
        createElement(Text, { label: "Current", value: "+3.2A", valueColor: "green" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const grid = new Grid(COLS, layouts[0]!.height);
    paint(grid, layouts);

    // Label "Current" should be label color
    expect(grid.get(2, 1).color).toBe("label"); // "C" of "Current" at col 2, row 1

    // Value "+3.2A" should be green
    const inner = COLS - 4;
    const valueStart = 2 + inner - "+3.2A".length;
    expect(grid.get(valueStart, 1).color).toBe("green");
  });

  it("slider thumb gets c-thumb, track gets c-dim", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "T" },
        createElement(Slider, { value: 0, min: -20, max: 20, unit: "°", onChange: () => {} }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const grid = new Grid(COLS, layouts[0]!.height);
    paint(grid, layouts);

    // Find the thumb (it contains "+") and track (contains "━")
    let foundThumb = false;
    let foundTrack = false;
    for (let col = 2; col < COLS - 2; col++) {
      const cell = grid.get(col, 1);
      if (cell.char === "━") {
        expect(cell.color).toBe("dim");
        foundTrack = true;
      }
      if (cell.char === "+" || cell.char === "°") {
        expect(cell.color).toBe("thumb");
        foundThumb = true;
      }
    }
    expect(foundThumb).toBe(true);
    expect(foundTrack).toBe(true);
  });

  it("active radio option gets c-green, inactive gets c-label", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "T" },
        createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange: () => {} }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const grid = new Grid(COLS, layouts[0]!.height);
    paint(grid, layouts);

    // "Mode   " (7 chars) starts at col 2
    // " ○ Max" (6 chars) starts at col 9 → inactive, should be label
    // " ● Eco" (6 chars) starts at col 15 → active, should be green
    expect(grid.get(9, 1).color).toBe("label"); // " " before ○
    expect(grid.get(15, 1).color).toBe("green"); // " " before ●
  });

  it("border gets c-border, title gets c-accent", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "Bat" },
        createElement(Text, { label: "A", value: "B" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const grid = new Grid(COLS, layouts[0]!.height);
    paint(grid, layouts);

    expect(grid.get(0, 0).color).toBe("border"); // "┌"
    expect(grid.get(2, 0).color).toBe("accent"); // "[" of "[ Bat ]"
  });

  it("statusbar left gets c-accent, dot gets correct color, right gets c-label", () => {
    const COLS = 30;
    const nodes = buildTree([
      createElement(Text, {
        left: "Camp Hub", leftColor: "accent",
        rightPrefix: "●", rightPrefixColor: "red",
        right: " WiFi", rightColor: "label",
      }),
    ]);
    const layouts = computeLayout(yoga, nodes, COLS);
    const grid = new Grid(COLS, 1);
    paint(grid, layouts);

    expect(grid.get(0, 0).color).toBe("accent"); // "C" of "Camp Hub"
    // Find the "●" character
    let dotCol = -1;
    for (let col = 0; col < COLS; col++) {
      if (grid.get(col, 0).char === "●") { dotCol = col; break; }
    }
    expect(dotCol).toBeGreaterThan(0);
    expect(grid.get(dotCol, 0).color).toBe("red");
    expect(grid.get(dotCol + 1, 0).color).toBe("label"); // " " of " WiFi"
  });
});
