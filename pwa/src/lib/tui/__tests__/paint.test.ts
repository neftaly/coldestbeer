import { describe, it, expect } from "vitest";
import Yoga from "yoga-layout";
import { Grid } from "../grid";
import { computeLayout } from "../layout";
import { buildTree } from "../reconciler";
import { paint } from "../paint";
import { createElement } from "react";
import { Box, Text, Slider, Radio } from "../components";

const yoga = Yoga;

function rendered(children: React.ReactElement[], cols: number): string {
  const nodes = buildTree(children);
  const layouts = computeLayout(yoga, nodes, cols);
  const totalHeight = layouts.reduce(
    (max, l) => Math.max(max, l.top + l.height),
    0,
  );
  const grid = new Grid(cols, totalHeight);
  paint(grid, layouts);
  return grid.toString();
}

describe("paint", () => {
  it("paints a box with text lines", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true, title: "Battery", headerValue: "85%" },
          createElement(Text, { label: "Current", value: "+3.2A", valueColor: "green" }),
          createElement(Text, { label: "Voltage", value: "26.4V" }),
        ),
      ],
      30,
    );

    const lines = result.split("\n");
    // Top border: ┌─[ Battery ]────── 85% ─┐
    expect(lines[0]).toMatch(/^┌─\[ Battery \].*85%.*─┐$/);
    expect(lines[0]).toHaveLength(30);

    // Content lines: │ label       value │
    expect(lines[1]).toMatch(/^│ Current.*\+3\.2A │$/);
    expect(lines[1]).toHaveLength(30);
    expect(lines[2]).toMatch(/^│ Voltage.*26\.4V │$/);

    // Bottom border: └────────────────────────────┘
    expect(lines[3]).toMatch(/^└─+┘$/);
    expect(lines[3]).toHaveLength(30);
  });

  it("paints a slider line", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true, title: "F" },
          createElement(Slider, { value: 0, min: -20, max: 20, unit: "°", onChange: () => {} }),
        ),
      ],
      20,
    );

    const lines = result.split("\n");
    // Slider line should have track + thumb
    const sliderLine = lines[1]!;
    expect(sliderLine).toMatch(/^│ .*━.*\+.0°.*━.* │$/);
    expect(sliderLine).toHaveLength(20);
  });

  it("paints a slider at min position", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true, title: "F" },
          createElement(Slider, { value: -20, min: -20, max: 20, unit: "°", onChange: () => {} }),
        ),
      ],
      20,
    );

    const lines = result.split("\n");
    const sliderLine = lines[1]!;
    // Thumb at far left — should start with "│ -20°━"
    expect(sliderLine).toMatch(/^│ -20°━/);
  });

  it("paints a null slider", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true, title: "F" },
          createElement(Slider, { value: null, min: -20, max: 20, unit: "°", onChange: () => {} }),
        ),
      ],
      20,
    );

    const lines = result.split("\n");
    const sliderLine = lines[1]!;
    // Null value shows dashes: "---°"
    expect(sliderLine).toContain("---°");
  });

  it("paints a radio line", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true, title: "F" },
          createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange: () => {} }),
        ),
      ],
      30,
    );

    const lines = result.split("\n");
    const radioLine = lines[1]!;
    // "Mode   " (7) + " ○ Max" + " ● Eco" + padding
    expect(radioLine).toMatch(/^│ Mode {3}/);
    expect(radioLine).toContain("○ Max");
    expect(radioLine).toContain("● Eco");
    expect(radioLine).toHaveLength(30);
  });

  it("paints a top-level text (statusbar style)", () => {
    const nodes = buildTree([
      createElement(Text, { left: "Camp Hub", leftColor: "accent", right: "● WiFi", rightColor: "label" }),
    ]);
    const layouts = computeLayout(yoga, nodes, 20);
    const grid = new Grid(20, 1);
    paint(grid, layouts);
    const result = grid.toString();

    expect(result).toMatch(/^Camp Hub.*● WiFi$/);
    expect(result).toHaveLength(20);
  });

  it("paints centered text inside a box", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true },
          createElement(Text, { value: "Camp Hub", centered: true }),
        ),
      ],
      24,
    );

    const lines = result.split("\n");
    const contentLine = lines[1]!;
    expect(contentLine).toMatch(/^│ .*Camp Hub.* │$/);
    // "Camp Hub" (8 chars) centered in inner=20 → 6 spaces left, 6 spaces right
    const inner = contentLine.slice(2, -2); // strip "│ " and " │"
    const trimmed = inner.trim();
    expect(trimmed).toBe("Camp Hub");
  });

  it("box without title has plain top border", () => {
    const result = rendered(
      [
        createElement(
          Box,
          { border: true },
          createElement(Text, { value: "Hi", centered: true }),
        ),
      ],
      20,
    );

    const lines = result.split("\n");
    expect(lines[0]).toBe("┌" + "─".repeat(18) + "┐");
  });

  it("stacked boxes paint at correct positions", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "A" },
        createElement(Text, { label: "X", value: "1" }),
      ),
      createElement(
        Box,
        { border: true, title: "B" },
        createElement(Text, { label: "Y", value: "2" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 20);
    // Total height: box A (3) + gap (1) + box B (3) = 7
    const grid = new Grid(20, 7);
    paint(grid, layouts);
    const lines = grid.toString().split("\n");

    expect(lines).toHaveLength(7);
    expect(lines[0]).toMatch(/^┌─\[ A \]/);
    expect(lines[1]).toMatch(/^│ X/);
    expect(lines[2]).toMatch(/^└─+┘$/);
    expect(lines[3]).toBe(" ".repeat(20)); // gap row
    expect(lines[4]).toMatch(/^┌─\[ B \]/);
    expect(lines[5]).toMatch(/^│ Y/);
    expect(lines[6]).toMatch(/^└─+┘$/);
  });
});
