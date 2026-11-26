// Purely decorative per-category glyph, matched by keyword in the category
// name. Never gates which categories render -- an unrecognized category
// (some future addition to calendar_categories) just falls back to a plain
// calendar glyph instead of breaking.
export default function CategoryIcon({ category }) {
  const key = (category || "").toLowerCase();

  if (key.includes("ug") || key.includes("undergraduate")) {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2 8l10 5 10-5-10-5z" />
        <path d="M6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
        <path d="M22 8v6" />
      </svg>
    );
  }
  if (key.includes("pg") || key.includes("postgraduate")) {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="6" />
        <path d="M8.7 13.6 7 22l5-3 5 3-1.7-8.4" />
      </svg>
    );
  }
  if (key.includes("fy") || key.includes("first year")) {
    return (
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22V13" />
        <path d="M12 13S5 13 5 6c7 0 7 7 7 7z" />
        <path d="M12 13s7 0 7-7c-7 0-7 7-7 7z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
