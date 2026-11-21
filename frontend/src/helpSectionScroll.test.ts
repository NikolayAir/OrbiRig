import { describe, expect, it } from "vitest";

import { scrollDeltaToReveal } from "./helpSectionScroll";

// A visible area from y=100 to y=500 with an 8px margin.
const area = { areaTop: 100, areaHeight: 400, margin: 8 };

describe("scrollDeltaToReveal", () => {
  it("does not scroll when the whole section is already visible", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 200, sectionHeight: 150 })).toBe(0);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 108, sectionHeight: 384 })).toBe(0);
  });

  it("leaves space below a section that fits without moving one with enough space", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 410, sectionHeight: 150 })).toBe(84);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 330, sectionHeight: 150 })).toBe(0);
  });

  it("leaves less room below a section if the full clearance would hide its heading", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 450, sectionHeight: 374 })).toBe(342);
  });

  it("uses the usual section margins when repositioning after a resize", () => {
    expect(scrollDeltaToReveal({ ...area, sectionTop: 410, sectionHeight: 150, preferBottomClearance: false })).toBe(68);
  });

  it("scrolls just far enough to leave space below the following heading", () => {
    const section = { ...area, sectionTop: 410, sectionHeight: 150 };
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 600, openHeadingOutline: 5 } })).toBe(124);
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 495, openHeadingOutline: 5 } })).toBe(19);
  });

  it("limits the gap to keep the open heading's focus outline visible", () => {
    const section = { ...area, sectionTop: 410, sectionHeight: 150 };
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 795, openHeadingOutline: 5 } })).toBe(305);
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 805, openHeadingOutline: 5 } })).toBe(305);
  });

  it("leaves the position alone when both headings and the outline are visible", () => {
    const section = { ...area, sectionTop: 106, sectionHeight: 300 };
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 479, openHeadingOutline: 5 } })).toBe(0);
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 480, openHeadingOutline: 5 } })).toBe(0);
  });

  it("scrolls up just far enough to reveal the open outline when both fit", () => {
    expect(scrollDeltaToReveal({
      ...area,
      sectionTop: 92,
      sectionHeight: 150,
      followingHeading: { bottom: 290, openHeadingOutline: 5 },
    })).toBe(-13);
  });

  it("gives the open section its clearance when the next heading cannot fit", () => {
    // The following heading would take 306px of scroll. The outline allows 305px.
    const section = { ...area, sectionTop: 410, sectionHeight: 150 };
    expect(scrollDeltaToReveal({ ...section, followingHeading: { bottom: 806, openHeadingOutline: 5 } })).toBe(84);
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
    expect(scrollDeltaToReveal({ ...area, sectionTop: 410.2, sectionHeight: 150.2 })).toBe(85);
    expect(scrollDeltaToReveal({ ...area, sectionTop: 107.4, sectionHeight: 100 })).toBe(-1);
  });

  it("copes with an area smaller than its margins by aligning the heading to the top", () => {
    expect(scrollDeltaToReveal({ areaTop: 0, areaHeight: 10, margin: 8, sectionTop: 30, sectionHeight: 100 })).toBe(25);
  });
});
