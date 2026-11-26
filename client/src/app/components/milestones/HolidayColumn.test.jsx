import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HolidayColumn from "./HolidayColumn.jsx";
import { DEFAULT_COLORS } from "../shared/colorUtils.js";

function baseProps(overrides = {}) {
  return {
    rows: [],
    colors: DEFAULT_COLORS,
    onMarkHoliday: vi.fn(),
    onUnmarkHoliday: vi.fn(),
    canEdit: true,
    ...overrides,
  };
}

describe("HolidayColumn", () => {
  it("renders a grouped holiday range", () => {
    render(<HolidayColumn {...baseProps({ rows: [{ name: "Diwali", start: "2026-11-07", end: "2026-11-09" }] })} />);
    expect(screen.getByText("Diwali")).toBeInTheDocument();
  });

  it("removes every date in a grouped range when × is clicked", async () => {
    const onUnmarkHoliday = vi.fn();
    render(
      <HolidayColumn
        {...baseProps({ rows: [{ name: "Diwali", start: "2026-11-07", end: "2026-11-09" }], onUnmarkHoliday })}
      />
    );
    fireEvent.click(screen.getByTitle("Remove this holiday"));
    await vi.waitFor(() => expect(onUnmarkHoliday).toHaveBeenCalledTimes(3));
    expect(onUnmarkHoliday).toHaveBeenCalledWith("2026-11-07");
    expect(onUnmarkHoliday).toHaveBeenCalledWith("2026-11-08");
    expect(onUnmarkHoliday).toHaveBeenCalledWith("2026-11-09");
  });

  it("saves a new single-day holiday with no Range/Custom color unchecked", () => {
    const onMarkHoliday = vi.fn();
    const { container } = render(<HolidayColumn {...baseProps({ onMarkHoliday })} />);
    fireEvent.click(screen.getByText("+ Add Holiday"));

    fireEvent.change(screen.getByPlaceholderText("Holiday name"), { target: { value: "Republic Day" } });
    const [startInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2027-01-26" } });
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1); // no end-date until Range is checked
    fireEvent.click(screen.getByText("Save"));

    expect(onMarkHoliday).toHaveBeenCalledWith("2027-01-26", "2027-01-26", "Republic Day", "holiday", undefined);
  });

  it("reveals an end date once Range is checked, and saves the range", () => {
    const onMarkHoliday = vi.fn();
    const { container } = render(<HolidayColumn {...baseProps({ onMarkHoliday })} />);
    fireEvent.click(screen.getByText("+ Add Holiday"));

    fireEvent.change(screen.getByPlaceholderText("Holiday name"), { target: { value: "Diwali" } });
    let dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-11-07" } });

    fireEvent.click(screen.getByLabelText("Range"));
    dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[1], { target: { value: "2026-11-09" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onMarkHoliday).toHaveBeenCalledWith("2026-11-07", "2026-11-09", "Diwali", "holiday", undefined);
  });

  it("seeds the color picker from the family's default color once Custom color is checked, and passes it on save", () => {
    const onMarkHoliday = vi.fn();
    const { container } = render(<HolidayColumn {...baseProps({ onMarkHoliday })} />);
    fireEvent.click(screen.getByText("+ Add Holiday"));

    fireEvent.change(screen.getByPlaceholderText("Holiday name"), { target: { value: "Founders Day" } });
    const [startInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2026-10-02" } });

    fireEvent.click(screen.getByLabelText("Custom color"));
    const colorInput = container.querySelector('input[type="color"]');
    // jsdom normalizes <input type="color"> values to lowercase.
    expect(colorInput).toHaveValue(DEFAULT_COLORS.holiday.toLowerCase());

    fireEvent.change(colorInput, { target: { value: "#123456" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onMarkHoliday).toHaveBeenCalledWith("2026-10-02", "2026-10-02", "Founders Day", "holiday", "#123456");
  });
});
