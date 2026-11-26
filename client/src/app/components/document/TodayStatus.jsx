import { getTodayStatus } from "./todayStatus.js";

// A small "what's happening right now" banner shown above the calendar
// grid when the current date falls inside an active holiday or event --
// on-screen only (not part of the printed/exported document), and simply
// doesn't render at all on a day nothing is scheduled. Renders one banner
// per status -- there can be more than one when holidays coincide.
export default function TodayStatus({ draft }) {
  const statuses = getTodayStatus(draft);
  if (statuses.length === 0) return null;

  return (
    <>
      {statuses.map((status, i) => (
        <div className="today-status-banner no-print" key={i}>
          <span className="today-status-dot" aria-hidden="true" />
          <span className="today-status-label">
            Right now: <strong>{status.label}</strong>
          </span>
          <span className="today-status-days">{status.daysLeftText}</span>
        </div>
      ))}
    </>
  );
}
