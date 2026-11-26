// Public-facing replacement for the admin/PDF-only SignatureBlock -- the
// live UI shows who to contact instead of the internal approval chain.
// Only the 3 actually-named people are listed (the blank "Approved By /
// Director" row in SignatureBlock has no name attached, so it's dropped
// here rather than shown with nothing to say).
export default function ContactInfo() {
  return (
    <div className="card contact-card no-print">
      <h2>Contact</h2>
      <div className="contact-list">
        <div className="contact-row">
          <span className="contact-name">Nilesh Baglekar</span>
          <span className="contact-role">Institutional Time Table Coordinator</span>
        </div>
        <div className="contact-row">
          <span className="contact-name">Sunita Barve</span>
          <span className="contact-role">Deputy Director, Academics and Research</span>
        </div>
        <div className="contact-row">
          <span className="contact-name">Ranjana Badre</span>
          <span className="contact-role">Controller of Examination</span>
        </div>
      </div>
    </div>
  );
}
