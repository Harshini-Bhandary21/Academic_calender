import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest doesn't expose `globals: true` here, so React Testing Library's
// own auto-cleanup (which detects a global `afterEach`) never registers --
// without this, each test's rendered DOM leaks into the next one in the
// same file, so a query like getByTitle("Move this event") starts matching
// more than one element as soon as more than one test in a file calls render().
afterEach(cleanup);
