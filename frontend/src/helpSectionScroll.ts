const bottomClearance = 24;
const minimumBottomClearance = 20;

function scrollWithBottomClearance(overflow: number, maximum: number): number {
  const desired = overflow <= -minimumBottomClearance ? 0 : Math.ceil(overflow + bottomClearance);
  return Math.min(desired, maximum);
}

// How far to scroll so that a section that has just been opened is shown from its
// heading downwards, moving the content as little as possible. All values are in
// pixels in the same coordinate space, so the same calculation serves a scrolling
// panel and a scrolling dialog.
export function scrollDeltaToReveal({
  areaTop, areaHeight, sectionTop, sectionHeight, margin, followingHeading, preferBottomClearance = true,
}: {
  areaTop: number;
  areaHeight: number;
  sectionTop: number;
  sectionHeight: number;
  margin: number;
  followingHeading?: { bottom: number; openHeadingOutline: number };
  preferBottomClearance?: boolean;
}): number {
  const areaBottom = areaTop + areaHeight;
  if (followingHeading !== undefined) {
    // Leave space below the next heading when both headings fit. Give the open
    // heading and its focus outline priority when there is only room for the headings.
    const overflow = followingHeading.bottom - areaBottom;
    const maximum = Math.floor(sectionTop - areaTop - followingHeading.openHeadingOutline);
    if (Math.ceil(overflow) <= maximum) return scrollWithBottomClearance(overflow, maximum);
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
  const overflow = sectionTop + shown - areaBottom;
  const minimum = Math.max(0, Math.ceil(overflow + edge));
  if (!preferBottomClearance || shown < sectionHeight) return minimum;
  return Math.max(minimum, scrollWithBottomClearance(overflow, Math.floor(above)));
}
