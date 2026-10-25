import type { ScanReport } from "./lib/scan";

export function ScanNews({
  report,
  onDismiss,
}: {
  report: ScanReport;
  onDismiss: () => void;
}) {
  const found = report.changes.length;
  return (
    <section className="news" aria-labelledby="news-title">
      <div className="news-head">
        <h2 className="news-title" id="news-title">
          {report.errors.length > 0
            ? "Library check stopped"
            : found > 0
              ? "Library check found updates"
              : "Library check found nothing new"}
        </h2>
        <button type="button" className="quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <p className="news-summary">
        Checked {report.checked} of {report.total}{" "}
        {report.total === 1 ? "title" : "titles"} with {report.requests} DeepSeek{" "}
        {report.requests === 1 ? "request" : "requests"}.
        {found === 0 && report.errors.length === 0
          ? " No new seasons and no higher episode counts."
          : ""}
      </p>
      {found > 0 && (
        <ul className="news-list">
          {report.changes.map((change) => (
            <li key={change.title}>
              <span className="news-name">{change.title}</span>
              {change.added.length > 0 &&
                ` added ${change.added
                  .map((season) => `S${season.number} (${season.episodes} eps)`)
                  .join(", ")}.`}
              {change.grown.length > 0 &&
                ` grew ${change.grown
                  .map((season) => `S${season.number} ${season.from} to ${season.to} eps`)
                  .join(", ")}.`}
            </li>
          ))}
        </ul>
      )}
      {report.errors.length > 0 && (
        <ul className="news-list news-errors" role="alert">
          {report.errors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="news-note">
        Seasons and episode counts only. A new movie or spin-off is its own title, so it is
        not added here.
      </p>
    </section>
  );
}
