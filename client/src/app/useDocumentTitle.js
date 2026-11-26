import { useEffect } from "react";

// Keeps the browser tab/history title specific to what's actually on
// screen (a term, a specific calendar) instead of one static title for
// every route -- also the one piece of per-page text a non-JS-executing
// crawler or link-preview bot never sees, unlike everything else in the
// React tree.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
