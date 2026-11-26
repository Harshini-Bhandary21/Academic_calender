import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MilestoneColumn from "./MilestoneColumn.jsx";
import { DEFAULT_COLORS } from "../shared/colorUtils.js";

// A single-family column (mirrors COLUMN_1_CATEGORIES: student_feedback,
// project_review, detention_list all share the "review" family) -- keeps
// the add-form's swatch row down to one family swatch + the custom swatch,
// same shape MilestoneColumn actually renders for that real column.
const CATEGORY_OPTIONS = [
  {
    familyKey: "review",
    familyLabel: "Reviews / Feedback / Detention",
    categories: [
      { value: "project_review", label: "Project Review" },
      { value: "student_feedback", label: "Student Feedback" },
      { value: "detention_list", label: "Detention List" },
    ],
  },
];

function baseProps(overrides = {}) {
  return {
    rows: [],
    colors: DEFAULT_COLORS,
    onReschedule: vi.fn(),
    onAddEvent: vi.fn(),
    onRemoveEvent: vi.fn(),
    onMarkHoliday: vi.fn(),
    onUnmarkHoliday: vi.fn(),
    categoryOptions: CATEGORY_OPTIONS,
    canEdit: true,
    ...overrides,
  };
}

function singleDayEvent(overrides = {}) {
  return {
    id: "evt-1",
    category: "project_review",
    cohort: "ALL",
    start: "2026-08-25",
    end: "2026-08-25",
    label: "Project Review II",
    color: null,
    ...overrides,
  };
}

describe("MilestoneColumn", () => {
  it("renders an event row with its label and date range", () => {
    const props = baseProps({ rows: [{ type: "event", event: singleDayEvent(), start: "2026-08-25" }] });
    render(<MilestoneColumn {...props} />);
    expect(screen.getByText("Project Review II")).toBeInTheDocument();
  });

  it("hides edit/remove controls when canEdit is false", () => {
    const props = baseProps({
      rows: [{ type: "event", event: singleDayEvent(), start: "2026-08-25" }],
      canEdit: false,
    });
    render(<MilestoneColumn {...props} />);
    expect(screen.queryByTitle("Remove this event")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Move this event")).not.toBeInTheDocument();
    expect(screen.queryByText("+ Add Event")).not.toBeInTheDocument();
  });

  it("calls onRemoveEvent with the event id when × is clicked", () => {
    const onRemoveEvent = vi.fn();
    const props = baseProps({
      rows: [{ type: "event", event: singleDayEvent(), start: "2026-08-25" }],
      onRemoveEvent,
    });
    render(<MilestoneColumn {...props} />);
    fireEvent.click(screen.getByTitle("Remove this event"));
    expect(onRemoveEvent).toHaveBeenCalledWith("evt-1");
  });

  it("opening + Add Event never shows a category or cohort dropdown", () => {
    render(<MilestoneColumn {...baseProps()} />);
    fireEvent.click(screen.getByText("+ Add Event"));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("saves a new single-day event with the first category and cohort ALL when Range is left unchecked", () => {
    const onAddEvent = vi.fn();
    const { container } = render(<MilestoneColumn {...baseProps({ onAddEvent })} />);
    fireEvent.click(screen.getByText("+ Add Event"));

    fireEvent.change(screen.getByPlaceholderText("Event name"), { target: { value: "Sports Day" } });
    const [startInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2026-09-19" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onAddEvent).toHaveBeenCalledWith("Sports Day", "project_review", "ALL", "2026-09-19", "2026-09-19", undefined);
  });

  it("reveals an end-date field and saves a range once the Range checkbox is checked", () => {
    const onAddEvent = vi.fn();
    const { container } = render(<MilestoneColumn {...baseProps({ onAddEvent })} />);
    fireEvent.click(screen.getByText("+ Add Event"));

    fireEvent.change(screen.getByPlaceholderText("Event name"), { target: { value: "Orientation Week" } });
    let dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-07-20" } });
    expect(dateInputs).toHaveLength(1); // no end-date field until Range is checked

    fireEvent.click(screen.getByLabelText("Range"));
    dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[1], { target: { value: "2026-07-24" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onAddEvent).toHaveBeenCalledWith(
      "Orientation Week",
      "project_review",
      "ALL",
      "2026-07-20",
      "2026-07-24",
      undefined
    );
  });

  it("opens a single-day event's edit form with only the start date shown, and reschedules on save", () => {
    const onReschedule = vi.fn();
    const props = baseProps({
      rows: [{ type: "event", event: singleDayEvent(), start: "2026-08-25" }],
      onReschedule,
    });
    const { container } = render(<MilestoneColumn {...props} />);
    fireEvent.click(screen.getByTitle("Move this event"));

    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1);

    const [startInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2026-08-27" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onReschedule).toHaveBeenCalledWith("evt-1", "2026-08-27", "2026-08-27", "Project Review II", null);
  });

  it("opens a multi-day event's edit form with Range pre-checked and the end date pre-filled", () => {
    const event = singleDayEvent({ start: "2026-11-20", end: "2026-12-02", label: "Practical Examination" });
    const props = baseProps({ rows: [{ type: "event", event, start: "2026-11-20" }] });
    const { container } = render(<MilestoneColumn {...props} />);
    fireEvent.click(screen.getByTitle("Move this event"));

    expect(screen.getByLabelText("Range")).toBeChecked();
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    expect(dateInputs[1]).toHaveValue("2026-12-02");
  });

  it("keeps color untouched by default, and passes the chosen color once Custom color is checked", () => {
    const onReschedule = vi.fn();
    const props = baseProps({
      rows: [{ type: "event", event: singleDayEvent(), start: "2026-08-25" }],
      onReschedule,
    });
    const { container } = render(<MilestoneColumn {...props} />);
    fireEvent.click(screen.getByTitle("Move this event"));

    // Left unchecked -> color explicitly cleared (null), not left as some stale value.
    fireEvent.click(screen.getByText("Save"));
    expect(onReschedule).toHaveBeenLastCalledWith("evt-1", "2026-08-25", "2026-08-25", "Project Review II", null);

    fireEvent.click(screen.getByTitle("Move this event"));
    fireEvent.click(screen.getByLabelText("Custom color"));
    const colorInput = container.querySelector('input[type="color"]');
    expect(colorInput).toBeInTheDocument();
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onReschedule).toHaveBeenLastCalledWith("evt-1", "2026-08-25", "2026-08-25", "Project Review II", "#ff0000");
  });
});
