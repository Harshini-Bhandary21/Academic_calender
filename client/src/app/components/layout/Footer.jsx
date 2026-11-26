// Small persistent credit bar at the bottom of the app shell -- moved out
// of TopNav (which is about identity/navigation: brand, signed-in-as,
// login/logout) since a credit line isn't navigation, it belongs with the
// rest of the page's footer-style chrome instead.
export default function Footer() {
  return (
    <footer className="app-footer no-print">
      <span className="app-footer-credit">Built by Jayesh Jadhav and Team</span>
    </footer>
  );
}
