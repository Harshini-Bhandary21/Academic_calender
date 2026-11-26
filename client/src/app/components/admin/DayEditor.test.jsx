import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DayEditor from "./DayEditor.jsx";
import { DEFAULT_COLORS } from "../shared/colorUtils.js";

function baseProps(overrides = {}) {
  return {
    date: "2026-11-07",
    holidays: [],
    scheduledEvents: [],
    colorCandidates: [],
    colors: DEFAULT_COLORS,
    onMarkHoliday: vi.fn(),
    onRemoveHoliday: vi.fn(),
    onSetDayColor: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("DayEditor", () => {
  it("lists scheduled events and existing holidays for the date", () => {
    render(
      <DayEditor
        {...baseProps({
          scheduledEvents: [{ label: "Mid-Sem Exams", cohort: "ALL" }],
          holidays: [{ id: "h1", name: "Diwali" }],
        })}
      />
    );
    expect(screen.getByText("Mid-Sem Exams")).toBeInTheDocument();
    expect(screen.getByText("Diwali")).toBeInTheDocument();
  });

  it("removes a holiday by id via its × button", () => {
    const onRemoveHoliday = vi.fn();
    render(<DayEditor {...baseProps({ holidays: [{ id: "h1", name: "Diwali" }], onRemoveHoliday })} />);
    fireEvent.click(screen.getByTitle("Remove this holiday"));
    expect(onRemoveHoliday).toHaveBeenCalledWith("h1");
  });

  it("hides the color-clash picker when fewer than 2 distinct colors are present", () => {
    render(<DayEditor {...baseProps({ colorCandidates: [{ label: "Diwali", color: "#F6C6C7" }] })} />);
    expect(screen.queryByText(/more than one color/)).not.toBeInTheDocument();
  });

  it("shows the color-clash picker once 2+ distinct colors are present, and reports the chosen one", () => {
    const onSetDayColor = vi.fn();
    render(
      <DayEditor
        {...baseProps({
          colorCandidates: [
            { label: "Diwali", color: "#F6C6C7" },
            { label: "Mid-Sem Exams", color: "#BBD8F0" },
          ],
          onSetDayColor,
        })}
      />
    );
    expect(screen.getByText(/more than one color/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Mid-Sem Exams"));
    expect(onSetDayColor).toHaveBeenCalledWith("#BBD8F0");
  });

  it("disables Create Event until a holiday name is entered, and defaults to a single day with no color override", () => {
    const onMarkHoliday = vi.fn();
    render(<DayEditor {...baseProps({ onMarkHoliday })} />);
    expect(screen.getByText("Create Event")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Diwali"), { target: { value: "Republic Day" } });
    expect(screen.getByText("Create Event")).not.toBeDisabled();
    fireEvent.click(screen.getByText("Create Event"));

    expect(onMarkHoliday).toHaveBeenCalledWith("Republic Day", null, "holiday", undefined);
  });

  it("reveals and requires an end date once 'Extend through a range' is checked", () => {
    const onMarkHoliday = vi.fn();
    render(<DayEditor {...baseProps({ onMarkHoliday })} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Diwali"), { target: { value: "Diwali" } });
    fireEvent.click(screen.getByLabelText("Extend through a range (e.g. Diwali week)"));

    expect(screen.getByText("Create Event")).toBeDisabled(); // range checked but no end date yet
    fireEvent.change(screen.getByLabelText("Through (end date)"), { target: { value: "2026-11-09" } });
    fireEvent.click(screen.getByText("Create Event"));

    expect(onMarkHoliday).toHaveBeenCalledWith("Diwali", "2026-11-09", "holiday", undefined);
  });

  it("seeds the custom color from the selected family and passes it on save", () => {
    const onMarkHoliday = vi.fn();
    const { container } = render(<DayEditor {...baseProps({ onMarkHoliday })} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Diwali"), { target: { value: "Founders Day" } });
    fireEvent.click(screen.getByLabelText("Custom color"));

    const colorInput = container.querySelector('input[type="color"]');
    expect(colorInput).toHaveValue(DEFAULT_COLORS.holiday.toLowerCase());
    fireEvent.change(colorInput, { target: { value: "#123456" } });
    fireEvent.click(screen.getByText("Create Event"));

    expect(onMarkHoliday).toHaveBeenCalledWith("Founders Day", null, "holiday", "#123456");
  });

  it("uses the typed custom label as the family when Custom is selected", () => {
    const onMarkHoliday = vi.fn();
    render(<DayEditor {...baseProps({ onMarkHoliday })} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Diwali"), { target: { value: "Sports Day" } });
    fireEvent.change(screen.getByDisplayValue("Holiday"), { target: { value: "custom" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Sports Day"), { target: { value: "Sports Day" } });
    fireEvent.click(screen.getByText("Create Event"));

    expect(onMarkHoliday).toHaveBeenCalledWith("Sports Day", null, "Sports Day", undefined);
  });

  it("closes when the overlay is clicked but not when the dialog content is clicked", () => {
    const onClose = vi.fn();
    render(<DayEditor {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close").closest(".modal-overlay"));
    expect(onClose).toHaveBeenCalled();
  });
});
