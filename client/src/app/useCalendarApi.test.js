import { describe, expect, it } from "vitest";
import { parseErrorMessage } from "./useCalendarApi.js";

// A fetch Response is one-shot (its body can only be read once), so these
// build a minimal stand-in with just the `.text()`/`.status` shape
// parseErrorMessage actually reads.
function fakeResponse(text, status = 400) {
  return { text: () => Promise.resolve(text), status };
}

describe("parseErrorMessage", () => {
  it("extracts FastAPI's {detail} field from a JSON error body", async () => {
    const res = fakeResponse(JSON.stringify({ detail: "Incorrect password" }), 401);
    expect(await parseErrorMessage(res)).toBe("Incorrect password");
  });

  it("falls back to the raw text when the body isn't JSON", async () => {
    const res = fakeResponse("Internal Server Error", 500);
    expect(await parseErrorMessage(res)).toBe("Internal Server Error");
  });

  it("falls back to the raw text when the JSON body has no string detail", async () => {
    const res = fakeResponse(JSON.stringify({ code: "NOT_FOUND" }), 404);
    expect(await parseErrorMessage(res)).toBe(JSON.stringify({ code: "NOT_FOUND" }));
  });

  it("falls back to a generic message when the body is empty", async () => {
    const res = fakeResponse("", 503);
    expect(await parseErrorMessage(res)).toBe("Request failed (503)");
  });
});
