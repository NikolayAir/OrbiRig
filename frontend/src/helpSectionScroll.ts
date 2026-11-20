// How far to scroll so that a section that has just been opened is shown from its
// heading downwards, moving the content as little as possible. All values are in
// pixels in the same coordinate space, so the same calculation serves a scrolling
// panel and a scrolling dialog.
export function scrollDeltaToReveal({ areaTop, areaHeight, sectionTop, sectionHeight, margin, followingHeadingBottom }: {
  areaTop: number;
  areaHeight: number;
  sectionTop: number;
  sectionHeight: number;
  margin: number;
  followingHeadingBottom?: number;
}): number {
  // In a very small area the margins must not use up more than the area itself.
  const edge = Math.min(margin, areaHeight / 2);
  // A section that fits in the visible area is shown whole. A longer one is shown
  // from its heading, so opening it never jumps to its end.
  const shown = Math.min(sectionHeight, areaHeight - 2 * edge);
  const above = sectionTop - (areaTop + edge);
  // Some browsers scroll only by whole pixels. Round outwards so the heading and
  // its focus outline are never cut off.
  if (above < 0) return Math.floor(above);
  const areaBottom = areaTop + areaHeight;
  const toSection = Math.max(0, Math.ceil(sectionTop + shown - (areaBottom - edge)));
  if (followingHeadingBottom === undefined) return toSection;

  // At most `above` pixels can be scrolled without losing the open heading's margin.
  const toFollowingHeading = Math.ceil(followingHeadingBottom - areaBottom);
  return toFollowingHeading <= Math.floor(above) ? Math.max(toSection, toFollowingHeading) : toSection;
}
