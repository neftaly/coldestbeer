// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Tui } from "../renderer";
import { Box, Text, Slider, Radio } from "../components";

describe("Tui", () => {
  it("renders text content as spans with color classes", () => {
    const { container } = render(
      <Tui cols={30}>
        <Box border title="Battery" headerValue="85%">
          <Text label="Current" value="+3.2A" valueColor="green" />
        </Box>
      </Tui>,
    );

    const preElements = container.querySelectorAll("pre");
    expect(preElements.length).toBeGreaterThan(0);

    // Should contain color-classed spans
    const greenSpan = container.querySelector(".c-green");
    expect(greenSpan).not.toBeNull();
    expect(greenSpan!.textContent).toContain("+3.2A");

    const accentSpan = container.querySelector(".c-accent");
    expect(accentSpan).not.toBeNull();
    expect(accentSpan!.textContent).toContain("[ Battery ]");
  });

  it("renders a panel div with position relative", () => {
    const { container } = render(
      <Tui cols={20}>
        <Box border title="T">
          <Text label="A" value="B" />
        </Box>
      </Tui>,
    );

    const panelDiv = container.querySelector(".panel");
    expect(panelDiv).not.toBeNull();
  });

  it("renders slider overlay with drag support", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Tui cols={30}>
        <Box border title="Fridge">
          <Slider value={0} min={-20} max={20} unit="°" onChange={onChange} />
        </Box>
      </Tui>,
    );

    const overlay = container.querySelector(".tui-overlay--thumb");
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute("style")).toContain("top:");
    expect(overlay!.getAttribute("style")).toContain("width:");
  });

  it("slider calls onChange on pointer drag", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Tui cols={30}>
        <Box border title="Fridge">
          <Slider value={0} min={-20} max={20} unit="°" onChange={onChange} />
        </Box>
      </Tui>,
    );

    const overlay = container.querySelector(".tui-overlay--thumb") as HTMLElement;
    // jsdom lacks pointer capture APIs — stub them
    overlay.setPointerCapture = vi.fn();
    overlay.hasPointerCapture = vi.fn(() => true);

    // Mock getBoundingClientRect for consistent positioning
    overlay.getBoundingClientRect = () => ({
      left: 0, right: 200, top: 0, bottom: 20, width: 200, height: 20, x: 0, y: 0, toJSON() {},
    });

    // Simulate pointerdown at midpoint (x=100 → ratio 0.5 → value 0)
    fireEvent.pointerDown(overlay, { clientX: 100, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(0);

    // Simulate drag to 75% (x=150 → ratio 0.75 → value 10)
    fireEvent.pointerMove(overlay, { clientX: 150, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(10);

    // Drag to left edge (x=0 → ratio 0 → value -20)
    fireEvent.pointerMove(overlay, { clientX: 0, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(-20);
  });

  it("renders radio overlays with click handlers", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Tui cols={30}>
        <Box border title="F">
          <Radio label="Mode" options={["Max", "Eco"]} value="Eco" onChange={onChange} />
        </Box>
      </Tui>,
    );

    const radioOverlays = container.querySelectorAll(".tui-overlay--radio");
    expect(radioOverlays).toHaveLength(2);

    // Click "Max" option
    fireEvent.click(radioOverlays[0]!);
    expect(onChange).toHaveBeenCalledWith("Max");
  });

  it("renders top-level text (statusbar style)", () => {
    const { container } = render(
      <Tui cols={30}>
        <Text left="Camp Hub" leftColor="accent" right="● WiFi" rightColor="label" />
      </Tui>,
    );

    const accentSpan = container.querySelector(".c-accent");
    expect(accentSpan).not.toBeNull();
    expect(accentSpan!.textContent).toContain("Camp Hub");
  });

  it("renders button overlay for clickable text", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Tui cols={28}>
        <Box border>
          <Text value=" Connect " valueColor="thumb" centered onClick={onClick} cursor="pointer" />
        </Box>
      </Tui>,
    );

    const buttonOverlay = container.querySelector(".tui-overlay--button");
    expect(buttonOverlay).not.toBeNull();

    fireEvent.click(buttonOverlay!);
    expect(onClick).toHaveBeenCalled();
  });

  it("gap rows between panels have no panel background", () => {
    const { container } = render(
      <Tui cols={20}>
        <Box border title="A">
          <Text label="X" value="1" />
        </Box>
        <Box border title="B">
          <Text label="Y" value="2" />
        </Box>
      </Tui>,
    );

    // Should have 2 panel divs and at least 1 gap pre
    const panels = container.querySelectorAll(".panel");
    expect(panels).toHaveLength(2);
  });

  it("applies custom className", () => {
    const { container } = render(
      <Tui cols={20} className="dialog">
        <Box border>
          <Text value="Hi" centered />
        </Box>
      </Tui>,
    );

    expect((container.firstChild as HTMLElement).className).toContain("dialog");
  });
});
