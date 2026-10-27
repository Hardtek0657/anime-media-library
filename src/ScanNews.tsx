import { useEffect, useState } from "react";
import { scanLogText, type ScanReport } from "./lib/scan";

/** WebView2 can refuse the async clipboard API, so the hidden textarea is the fallback. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

export function ScanNews({
  report,
  onRename,
  onDismiss,
}: {
  report: ScanReport;
  onRename: (id: number, title: string) => void;
  onDismiss: () => void;
}) {
  const found = report.changes.length + report.details.length + report.renames.length;
  const [copied, setCopied] = useState<"idle" | "yes" | "no">("idle");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLog() {
    setCopied((await copyText(scanLogText(report))) ? "yes" : "no");
  }

  return (
    <div className="news-scrim" onClick={onDismiss}>
      <section
        className="news"
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="news-head">
          <h2 className="news-title" id="news-title">
            {report.errors.length > 0
              ? "Library check finished with problems"
              : found > 0
                ? "Library check found updates"
                : "Library check found nothing new"}
          </h2>
          <div className="news-actions">
            <button type="button" className="quiet" onClick={() => void copyLog()}>
              {copied === "yes" ? "Copied" : copied === "no" ? "Copy failed" : "Copy log"}
            </button>
            <button type="button" className="quiet" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </div>
        <p className="sr-only" role="status">
          {copied === "yes"
            ? "Log copied to the clipboard."
            : copied === "no"
              ? "Could not copy. Select the log text and copy it yourself."
              : ""}
        </p>
        <div className="news-body">
          <p className="news-summary">
            Checked {report.checked} of {report.total}{" "}
            {report.total === 1 ? "title" : "titles"} with {report.requests}{" "}
            {report.requests === 1 ? "request" : "requests"}.
            {found === 0 && report.errors.length === 0
              ? " No new seasons, no higher episode counts, no name differences and no missing details."
              : ""}
          </p>
          {report.renames.length > 0 && (
            <ul className="news-list">
              {report.renames.map((rename) => (
                <li key={`rename-${rename.id}`}>
                  <span className="news-name">{rename.from}</span> →{" "}
                  <span className="news-name">{rename.to}</span>, AniList&rsquo;s spelling.{" "}
                  <button
                    type="button"
                    className="link"
                    onClick={() => onRename(rename.id, rename.to)}
                  >
                    Rename it
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found > 0 && (
            <ul className="news-list">
              {report.changes.map((change) => (
                <li key={`season-${change.title}`}>
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
              {report.details.map((entry) => (
                <li key={`details-${entry.title}`}>
                  <span className="news-name">{entry.title}</span> filled{" "}
                  {entry.fields.join(", ")}.
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
            Seasons and episode counts only. A new movie or spin-off is its own title, so it
            is not added here.
          </p>
        </div>
      </section>
    </div>
  );
}
