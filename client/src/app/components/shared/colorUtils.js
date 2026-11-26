// Color values for each family in categoryFamilies.js, plus a
// readable-text-color helper -- kept separate from the family/category data
// so palette changes never need to touch the category-grouping logic.

// Pastel palette -- one light, low-saturation shade per family, keeping the
// same hue association as the original dark/saturated defaults (green for
// non_instructional, red for holiday, blue for mid_sem, etc.). No `start`
// or `custom` entry -- commencement is a de-emphasized grey/underline
// marker now (like Term End), and a coordinator-typed Custom-category
// label never got a fill either -- see categoryFamilies.js's
// COLORED_GRID_FAMILIES for which families still get a background at all.
export const DEFAULT_COLORS = {
  holiday: "#C0392B",
  non_instructional: "#CDE7D4",
  mid_sem: "#BBD8F0",
  practical: "#D9CBEC",
  end_sem: "#F5D9A8",
  project_exam: "#F0C9DD",
  review: "#E4E4E4",
  programs: "#C8E6DD",
  summer: "#EFD0DC",
};

// Picks readable text color for a given background so a coordinator can't
// choose a light color and end up with invisible white-on-white text.
export function contrastText(hexColor) {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}
