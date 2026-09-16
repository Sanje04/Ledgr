// Fixed categorical color assignment -- each category always maps to the same
// slot regardless of which categories are present or how large they are in a
// given time window, so importing a new dataset never repaints a category
// that's still on screen. Hues are the validated default categorical
// palette (see the dataviz skill / references/palette.md), assigned in a
// fixed order -- never re-sorted by value or rank.
//
// Colors are referenced as CSS custom properties (defined in styles/index.css,
// light and dark values) rather than literal hex, so every consumer -- the
// chart's SVG fill/stroke attributes, the legend swatches, the transaction
// list's category dots -- follows the active theme automatically with no
// theme-detection logic here.
export const CATEGORY_COLOR_VARS: Record<string, string> = {
  Groceries: "var(--cat-groceries)",
  Dining: "var(--cat-dining)",
  Transport: "var(--cat-transport)",
  Entertainment: "var(--cat-entertainment)",
  Shopping: "var(--cat-shopping)",
  Utilities: "var(--cat-utilities)",
  Healthcare: "var(--cat-healthcare)",
  Rent: "var(--cat-rent)",
};

// "Other" is deliberately muted/gray rather than a 9th categorical hue -- it
// represents "everything not individually tracked," not a series competing
// for identity, and placing it at the wrap seam (rendered last, wrapping back
// to the first category) keeps every adjacent pair in the donut CVD-safe
// without needing a 9th validated slot.
export const OTHER_COLOR_VAR = "var(--cat-other)";

export function colorForCategory(category: string): string {
  return CATEGORY_COLOR_VARS[category] ?? OTHER_COLOR_VAR;
}
