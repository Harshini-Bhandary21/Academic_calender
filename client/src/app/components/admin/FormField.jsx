// A labeled form field wrapper -- de-duplicates the repeated
// `<div className="field"><label/>...</div>` markup in CoordinatorForm.jsx.
// Takes the input/select as children instead of a config object, since one
// field (Term) is a <select>, not an <input>.
export default function FormField({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
