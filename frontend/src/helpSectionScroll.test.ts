import { describe, expect, it } from "vitest";

import { scrollDeltaToReveal } from "./helpSectionScroll";

// A visible area from y=100 to y=500 with an 8px margin.
const area = { areaTop: 100, areaHeight: 400, margin: 8 };

describe("scrollDeltaToReveal", () => {
  it("does not scroll when the whole section is already visible", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 200, sectionHeight: 150 })).toBe(0);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 108, sectionHeight: 384 })).toBe(0);
  });

  it("scrolls a section that fits just far enough to show its end", () => {
    // The section ends at 560; the visible area ends at 492 after the margin.
    expect(scrollDeltaToReveal({ ...area, sectionTop: 410, sectionHeight: 150 })).toBe(68);
  });

  it("shows a longer section from its heading instead of scrolling to its end", () => {
    // 900px does not fit in 384px of usable space: the heading goes to the top margin.
    expect(scrollDeltaToReveal({ ...area, sectionTop: 300, sectionHeight: 900 })).toBe(192);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 450, sectionHeight: 900 })).toBe(342);
  });

  it("leaves a long section alone when its heading is already at the top margin", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 108, sectionHeight: 900 })).toBe(0);
  });

  it("brings a heading back down when it lies above the visible area", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 40, sectionHeight: 200 })).toBe(-68);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 40, sectionHeight: 900 })).toBe(-68);
  });

  it("rounds outwards for fractional positions", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 410.2, sectionHeight: 150.2 })).toBe(69);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 107.4, sectionHeight: 100 })).toBe(-1);
  });

  it("copes with an area smaller than its margins by aligning the heading to the top", () => {
    expect(scrollDeltaToReveal({ areaTop: 0, areaHeight: 10, margin: 8, sectionTop: 30, sectionHeight: 100 })).toBe(25);
  });
});
