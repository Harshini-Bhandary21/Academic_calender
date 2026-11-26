import { Link } from "react-router-dom";
import { useDocumentTitle } from "../app/useDocumentTitle.js";

// Catch-all for any URL that doesn't match a real route (a typo'd link, a
// stale bookmark to a deleted calendar, etc.) -- a real page instead of a
// blank screen.
export default function NotFoundPage() {
  useDocumentTitle("Page Not Found | MIT Academy of Engineering");

  return (
    <div className="page-frame">
      <div className="container">
        <div className="card not-found-page">
          <span className="not-found-code">404</span>
          <h1 className="not-found-title">Page Not Found</h1>
          <p className="not-found-text">
            The page you're looking for doesn't exist, or may have been moved.
          </p>
          <Link to="/" className="btn btn-primary">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
