// Approval block matching the published calendar document -- names and
// roles as printed on the real 2026-27 Term I calendar (Format No.
// ACAD/DI/02). Update here when the postholders change.
export default function SignatureBlock() {
  return (
    <div className="sig-block">
      <div className="sig-col">
        <div className="sig-label">Proposed By,</div>
        <div className="sig-name">Mr. Nilesh Baglekar</div>
        <div className="sig-role">Institutional Time table coordinator</div>
      </div>
      <div className="sig-col">
        <div className="sig-label">Recommended By,</div>
        <div className="sig-name">Dr. Sunita Barve, Dr. Ranjana Badre</div>
        <div className="sig-role">Deputy Director Academics and Research, Controller of Examination</div>
      </div>
      <div className="sig-col">
        <div className="sig-label">Approved By,</div>
        <div className="sig-name">&nbsp;</div>
        <div className="sig-role">Director</div>
      </div>
    </div>
  );
}
