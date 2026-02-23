import { describe, it, expect } from "vitest";
import Yoga from "yoga-layout";
import { computeLayout, computeOverlays } from "../layout";
import { buildTree } from "../reconciler";
import { createElement } from "react";
import { Box, Text, Slider, Radio } from "../components";
import type { LayoutBox, LayoutText } from "../types";

const yoga = Yoga;

describe("buildTree", () => {
  it("extracts a Box with Text children", () => {
    const el = createElement(
      Box,
      { border: true, title: "Battery", headerValue: "85%" },
      createElement(Text, { label: "Current", value: "+3.2A", valueColor: "green" }),
      createElement(Text, { label: "Voltage", value: "26.4V" }),
    );
    const nodes = buildTree([el]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.type).toBe("box");

    const box = nodes[0]! as { type: "box"; border: boolean; title: string; headerValue: string; children: unknown[] };
    expect(box.border).toBe(true);
    expect(box.title).toBe("Battery");
    expect(box.headerValue).toBe("85%");
    expect(box.children).toHaveLength(2);
    expect(box.children[0]).toMatchObject({ type: "text", label: "Current", value: "+3.2A", valueColor: "green" });
    expect(box.children[1]).toMatchObject({ type: "text", label: "Voltage", value: "26.4V" });
  });

  it("extracts a top-level Text (statusbar style)", () => {
    const el = createElement(Text, { left: "Camp Hub", leftColor: "accent", right: "● WiFi", rightColor: "label" });
    const nodes = buildTree([el]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: "text",
      left: "Camp Hub",
      leftColor: "accent",
      right: "● WiFi",
      rightColor: "label",
    });
  });

  it("extracts Slider and Radio children from a Box", () => {
    const el = createElement(
      Box,
      { border: true, title: "Fridge", headerValue: "-4°C" },
      createElement(Slider, { value: -5, min: -20, max: 20, unit: "°", onChange: () => {} }),
      createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange: () => {} }),
    );
    const nodes = buildTree([el]);
    const box = nodes[0]! as { children: Array<{ type: string }> };
    expect(box.children).toHaveLength(2);
    expect(box.children[0]!.type).toBe("slider");
    expect(box.children[1]!.type).toBe("radio");
  });
});

describe("computeLayout", () => {
  it("lays out a single bordered box", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "Test" },
        createElement(Text, { label: "A", value: "B" }),
        createElement(Text, { label: "C", value: "D" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 30);

    expect(layouts).toHaveLength(1);
    const box = layouts[0]! as LayoutBox;
    expect(box.type).toBe("box");
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
    expect(box.width).toBe(30);
    // 2 children + 2 border rows (top + bottom) = 4
    expect(box.height).toBe(4);
    // Inner area: left=2, top=1, width=cols-4
    expect(box.innerLeft).toBe(2);
    expect(box.innerTop).toBe(1);
    expect(box.innerWidth).toBe(26);
    expect(box.children).toHaveLength(2);
  });

  it("stacks multiple boxes with gap", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "A" },
        createElement(Text, { label: "X", value: "Y" }),
      ),
      createElement(
        Box,
        { border: true, title: "B" },
        createElement(Text, { label: "X", value: "Y" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 20);
    expect(layouts).toHaveLength(2);

    const boxA = layouts[0]! as LayoutBox;
    const boxB = layouts[1]! as LayoutBox;

    // Box A: top=0, height=3 (1 child + 2 border)
    expect(boxA.top).toBe(0);
    expect(boxA.height).toBe(3);

    // Box B: top = boxA.height + 1 gap = 4
    expect(boxB.top).toBe(4);
    expect(boxB.height).toBe(3);
  });

  it("lays out top-level text (statusbar) with height 2 (line + gap)", () => {
    const nodes = buildTree([
      createElement(Text, { left: "Camp Hub", right: "● WiFi" }),
    ]);
    const layouts = computeLayout(yoga, nodes, 20);
    expect(layouts).toHaveLength(1);

    const text = layouts[0]! as LayoutText;
    expect(text.type).toBe("text");
    expect(text.top).toBe(0);
    expect(text.height).toBe(1);
    expect(text.width).toBe(20);
  });

  it("positions children at correct inner coordinates", () => {
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "T" },
        createElement(Text, { label: "A", value: "1" }),
        createElement(Text, { label: "B", value: "2" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 24);
    const box = layouts[0]! as LayoutBox;

    expect(box.children[0]!.left).toBe(2);
    expect(box.children[0]!.top).toBe(1);
    expect(box.children[0]!.width).toBe(20);

    expect(box.children[1]!.left).toBe(2);
    expect(box.children[1]!.top).toBe(2);
    expect(box.children[1]!.width).toBe(20);
  });
});

describe("computeOverlays", () => {
  it("generates slider overlay", () => {
    const onChange = () => {};
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "F" },
        createElement(Slider, { value: 0, min: -20, max: 20, unit: "°", onChange }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 30);
    const overlays = computeOverlays(layouts);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]!.type).toBe("slider");
    expect(overlays[0]!).toMatchObject({
      type: "slider",
      top: 1, // inner row 0 of box that starts at top=0
      left: 2,
      width: 26,
      min: -20,
      max: 20,
      onChange,
    });
  });

  it("generates radio overlays per option", () => {
    const onChange = () => {};
    const nodes = buildTree([
      createElement(
        Box,
        { border: true, title: "F" },
        createElement(Radio, { label: "Mode", options: ["Max", "Eco"], value: "Eco", onChange }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 30);
    const overlays = computeOverlays(layouts);

    expect(overlays).toHaveLength(2);
    // "Mode   " = 7 chars, then " ● Max" = 6 chars, then " ● Eco" = 6 chars
    expect(overlays[0]).toMatchObject({ type: "radio-option", option: "Max", left: 9, width: 6 });
    expect(overlays[1]).toMatchObject({ type: "radio-option", option: "Eco", left: 15, width: 6 });
  });

  it("generates button overlay for centered Text with onClick", () => {
    const onClick = () => {};
    const nodes = buildTree([
      createElement(
        Box,
        { border: true },
        createElement(Text, { value: " Connect ", valueColor: "thumb", centered: true, onClick, cursor: "pointer" }),
      ),
    ]);
    const layouts = computeLayout(yoga, nodes, 28);
    const overlays = computeOverlays(layouts);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ type: "button", top: 1, left: 2, width: 24, cursor: "pointer" });
  });
});
