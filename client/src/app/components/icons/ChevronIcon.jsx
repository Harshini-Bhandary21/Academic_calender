// Inline SVG chevron -- same reasoning as EditIcon.jsx: a Unicode arrow
// glyph risks tofu-rendering on a system missing that specific character,
// an SVG never does.
export default function ChevronIcon({ expanded }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`chevron-icon${expanded ? " chevron-icon-expanded" : ""}`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
