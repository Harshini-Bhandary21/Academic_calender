import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InfoStrip from "./InfoStrip.jsx";

function draftWith(events) {
  return {
    meta: { commencement: "2026-07-27", teaching_end: "2026-11-15", term_end: "2026-12-12" },
    holidays: [],
    events,
  };
}

describe("InfoStrip", () => {
  it("renders an existing event-backed line with its label and range", () => {
    const draft = draftWith([
      { id: "p1", category: "prototyping_phase", cohort: "ALL", start: "2026-07-27", end: "2026-09-12", label: "Prototyping Phase 1" },
    ]);
    render(<InfoStrip draft={draft} onReschedule={vi.fn()} onAddEvent={vi.fn()} onRemoveEvent={vi.fn()} canEdit={false} />);
    expect(screen.getByText("Prototyping Phase 1:")).toBeInTheDocument();
  });

  it("always shows the two computed Total Weeks / Instructional Days lines, with no edit controls", () => {
    render(<InfoStrip draft={draftWith([])} onReschedule={vi.fn()} onAddEvent={vi.fn()} onRemoveEvent={vi.fn()} canEdit={true} />);
    expect(screen.getByText("Total Weeks:")).toBeInTheDocument();
    expect(screen.getByText("Total Instructional Days:")).toBeInTheDocument();
    // Not event-backed -- never editable no matter what canEdit is.
    expect(screen.queryByTitle("Edit this entry")).not.toBeInTheDocument();
  });

  it("removes an existing entry via its × button", () => {
    const onRemoveEvent = vi.fn();
    const draft = draftWith([
      { id: "p1", category: "prototyping_phase", cohort: "ALL", start: "2026-07-27", end: "2026-09-12", label: "Prototyping Phase 1" },
    ]);
    render(<InfoStrip draft={draft} onReschedule={vi.fn()} onAddEvent={vi.fn()} onRemoveEvent={onRemoveEvent} canEdit={true} />);
    fireEvent.click(screen.getByTitle("Remove this entry"));
    expect(onRemoveEvent).toHaveBeenCalledWith("p1");
  });

  it("a single-category cell's + Add form has no category dropdown, and defaults to a single-day save", () => {
    const onAddEvent = vi.fn();
    const { container } = render(
      <InfoStrip draft={draftWith([])} onReschedule={vi.fn()} onAddEvent={onAddEvent} onRemoveEvent={vi.fn()} canEdit={true} />
    );
    // cellDefs[1] is the single-category Prototyping Phase cell.
    fireEvent.click(screen.getAllByText("+ Add")[1]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Label"), { target: { value: "Prototyping Phase 1" } });
    const [startInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2026-07-27" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onAddEvent).toHaveBeenCalledWith("Prototyping Phase 1", "prototyping_phase", "ALL", "2026-07-27", "2026-07-27");
  });

  it("reveals an end-date input and saves a range once Range is checked", () => {
    const onAddEvent = vi.fn();
    const { container } = render(
      <InfoStrip draft={draftWith([])} onReschedule={vi.fn()} onAddEvent={onAddEvent} onRemoveEvent={vi.fn()} canEdit={true} />
    );
    fireEvent.click(screen.getAllByText("+ Add")[1]);
    fireEvent.change(screen.getByPlaceholderText("Label"), { target: { value: "Prototyping Phase 1" } });

    let dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: "2026-07-27" } });
    expect(dateInputs).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Range"));
    dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    fireEvent.change(dateInputs[1], { target: { value: "2026-09-12" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onAddEvent).toHaveBeenCalledWith("Prototyping Phase 1", "prototyping_phase", "ALL", "2026-07-27", "2026-09-12");
  });

  it("the two-category cell (Value Addition / Make-up) still shows a category dropdown", () => {
    render(<InfoStrip draft={draftWith([])} onReschedule={vi.fn()} onAddEvent={vi.fn()} onRemoveEvent={vi.fn()} canEdit={true} />);
    // First "+ Add" belongs to the Value Addition/Make-up cell (cellDefs[0]).
    const addButtons = screen.getAllByText("+ Add");
    fireEvent.click(addButtons[0]);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Value Addition Program")).toBeInTheDocument();
    expect(screen.getByText("Make-up/Remedial Sessions")).toBeInTheDocument();
  });

  it("opens an existing event's edit form pre-filled, and reschedules on save", () => {
    const onReschedule = vi.fn();
    const draft = draftWith([
      { id: "p1", category: "prototyping_phase", cohort: "ALL", start: "2026-07-27", end: "2026-07-27", label: "Prototyping Phase 1" },
    ]);
    const { container } = render(
      <InfoStrip draft={draft} onReschedule={onReschedule} onAddEvent={vi.fn()} onRemoveEvent={vi.fn()} canEdit={true} />
    );
    fireEvent.click(screen.getByTitle("Edit this entry"));
    expect(container.querySelectorAll('input[type="date"]')).toHaveLength(1); // single-day, Range unchecked

    const [startInput] = container.querySelectorAll('input[type="date"]');
    fireEvent.change(startInput, { target: { value: "2026-07-28" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onReschedule).toHaveBeenCalledWith("p1", "2026-07-28", "2026-07-28", "Prototyping Phase 1");
  });
});
