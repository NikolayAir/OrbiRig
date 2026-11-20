// How far to scroll so that a section that has just been opened is shown from its
// heading downwards, moving the content as little as possible. All values are in
// pixels in the same coordinate space, so the same calculation serves a scrolling
// panel and a scrolling dialog.
export function scrollDeltaToReveal({ areaTop, areaHeight, sectionTop, sectionHeight, margin, followingHeading }: {
  areaTop: number;
  areaHeight: number;
  sectionTop: number;
  sectionHeight: number;
  margin: number;
  followingHeading?: { bottom: number; openHeadingOutline: number };
}): number {
  const areaBottom = areaTop + areaHeight;
  if (followingHeading !== undefined) {
    // Find the smallest scroll that shows the next heading and keeps the opening outline visible.
    const minimum = Math.ceil(followingHeading.bottom - areaBottom);
    const maximum = Math.floor(sectionTop - areaTop - followingHeading.openHeadingOutline);
    if (minimum <= maximum) return Math.min(Math.max(0, minimum), maximum);
  }

  // In a very small area the margins must not use up more than the area itself.
  const edge = Math.min(margin, areaHeight / 2);
  // A section that fits in the visible area is shown whole. A longer one is shown
  // from its heading, so opening it never jumps to its end.
  const shown = Math.min(sectionHeight, areaHeight - 2 * edge);
  const above = sectionTop - (areaTop + edge);
  // Some browsers scroll only by whole pixels. Round outwards so the heading and
  // its focus outline are never cut off.
  if (above < 0) return Math.floor(above);
  return Math.max(0, Math.ceil(sectionTop + shown - (areaBottom - edge)));
}
