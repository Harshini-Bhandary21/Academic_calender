import { FAMILIES } from "../shared/categoryFamilies.js";

function humanize(category) {
  return category
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

// Only families with a `.categories` list are real event categories a
// coordinator can add (holiday/non_instructional are color families with
// no backing category, used elsewhere for day-coloring only) -- grouped
// by family for an <optgroup>-based picker, or a color-swatch picker (see
// MilestoneColumn's "+ Add Event" form) that needs `familyKey` to look up
// that family's actual color in colorUtils.js's DEFAULT_COLORS/`colors` prop.
export const CATEGORY_OPTIONS = FAMILIES.filter((family) => family.categories).map((family) => ({
  familyKey: family.key,
  familyLabel: family.label,
  categories: family.categories.map((category) => ({ value: category, label: humanize(category) })),
}));
