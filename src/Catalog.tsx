import { useState } from "react";
import {
  FORMATS,
  STATUS_LABEL,
  currentSeason,
  episodeTotal,
  episodeWatched,
  isSeasonDone,
  monogram,
  nextUnfinished,
  spineColor,
  statusOf,
  type Anime,
  type AnimeFormat,
  type Filter,
  type Season,
} from "./lib/model";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All titles" },
  { id: "watching", label: STATUS_LABEL.watching },
  { id: "completed", label: STATUS_LABEL.completed },
  { id: "not-started", label: STATUS_LABEL["not-started"] },
];

export function FilterRail({
  library,
  filter,
  onChange,
}: {
  library: Anime[];
  filter: Filter;
  onChange: (filter: Filter) => void;
}) {
  return (
    <nav className="rail" aria-label="Shelf filters">
      {FILTERS.map((entry) => {
        const count =
          entry.id === "all"
            ? library.length
            : library.filter((anime) => statusOf(anime) === entry.id).length;
        return (
          <button
            key={entry.id}
            type="button"
            className="filter"
            aria-current={filter === entry.id ? "true" : undefined}
            onClick={() => onChange(entry.id)}
          >
            <span>{entry.label}</span>
            <span className="filter-count">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SeasonStrip({ season }: { season: Season }) {
  const share = Math.round((season.episodesWatched / season.episodeCount) * 100);
  const label = `Season ${season.number}: ${season.episodesWatched} of ${season.episodeCount} episodes`;
  return (
    <span className="strip">
      <span className="strip-label">S{season.number}</span>
      <span className="strip-track" aria-hidden="true">
        <span className="strip-fill" style={{ width: `${share}%` }} />
      </span>
      <span className="strip-count">
        {season.episodesWatched}/{season.episodeCount}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function metaLine(anime: Anime): string {
  const parts: string[] = [anime.format];
  if (anime.year) parts.push(String(anime.year));
  if (anime.seasons.length === 1) parts.push("1 season");
  if (anime.seasons.length > 1) parts.push(`${anime.seasons.length} seasons`);
  const total = episodeTotal(anime);
  if (total > 0) parts.push(`${episodeWatched(anime)} of ${total} episodes`);
  return parts.join(" · ");
}

export function CatalogList({
  library,
  visible,
  filter,
  format,
  query,
  expandedId,
  busy,
  onToggle,
  onMenu,
  onEdit,
  onDelete,
  onAdd,
  onAdvance,
  onFormat,
}: {
  library: Anime[];
  visible: Anime[];
  filter: Filter;
  format: AnimeFormat | "all";
  query: string;
  expandedId: number | null;
  busy: boolean;
  onToggle: (id: number) => void;
  onMenu: (anime: Anime, x: number, y: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  onAdd: () => void;
  onAdvance: (anime: Anime, season: Season) => void;
  onFormat: (format: AnimeFormat | "all") => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const formats = FORMATS.filter((format) => library.some((anime) => anime.format === format));

  return (
    <div className="list">
      <div className="list-head">
        <span>
          {visible.length} {visible.length === 1 ? "title" : "titles"}
          {filter !== "all" ? ` · ${STATUS_LABEL[filter]}` : ""}
          {format !== "all" ? ` · ${format}` : ""}
          {query.trim() ? ` · matching “${query.trim()}”` : ""}
        </span>
        {formats.length > 0 && (
          <span className="format-bar" role="group" aria-label="Filter by format">
            <button
              type="button"
              className="chip"
              aria-pressed={format === "all"}
              onClick={() => onFormat("all")}
            >
              All formats
            </button>
            {formats.map((entry) => (
              <button
                key={entry}
                type="button"
                className="chip"
                aria-pressed={format === entry}
                onClick={() => onFormat(entry)}
              >
                {entry}
              </button>
            ))}
          </span>
        )}
      </div>
      {visible.length === 0 && (
        <div className="state">
          <h2 className="state-title">
            {library.length > 0 ? "Nothing matches that filter." : "Nothing on the shelf yet."}
          </h2>
          <p className="state-note">
            {library.length > 0
              ? "Clear the search, pick another shelf, or widen the format."
              : "Add a title, give it a season, and log where you stopped."}
          </p>
          {library.length === 0 && (
            <button type="button" className="btn primary" onClick={onAdd}>
              Add your first title
            </button>
          )}
        </div>
      )}
      {visible.map((anime) => {
        const next = nextUnfinished(anime);
        const shown = currentSeason(anime);
        const open = expandedId === anime.id;
        return (
          <div className="row-wrap" key={anime.id}>
            <div
              className="row"
              data-selected={open ? "true" : undefined}
              onClick={() => onToggle(anime.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                onMenu(anime, event.clientX, event.clientY);
              }}
            >
              <span
                className="spine"
                style={{ background: spineColor(anime.title) }}
                aria-hidden="true"
              />
              {shown?.cover || anime.cover ? (
                <img
                  className="row-art"
                  src={shown?.cover ?? anime.cover ?? ""}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span
                  className="monogram"
                  style={{ color: spineColor(anime.title) }}
                  aria-hidden="true"
                >
                  {monogram(anime.title)}
                </span>
              )}
              <span className="row-main">
                <button
                  type="button"
                  className="row-title"
                  aria-expanded={open}
                  // The row owns the toggle, so a click here would fire it twice. The
                  // button stays for focus and Enter, and the click bubbles up once.
                >
                  {anime.title}
                </button>
                <span className="row-meta">{metaLine(anime)}</span>
              </span>
              <span className="row-seasons">
                {shown ? (
                  <SeasonStrip season={shown} />
                ) : (
                  <span className="more">No seasons yet</span>
                )}
              </span>
              <span className="row-action">
                {next ? (
                  <button
                    type="button"
                    className="advance"
                    disabled={busy}
                    aria-label={`Log episode ${next.episodesWatched + 1} of season ${next.number} for ${anime.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAdvance(anime, next);
                    }}
                  >
                    +1 ep
                  </button>
                ) : (
                  <span className="row-done">
                    {anime.seasons.length > 0 ? "Done" : ""}
                  </span>
                )}
              </span>
            </div>

            {open && (
              <div className="row-expand">
                {anime.seasons.length === 0 && (
                  <p className="expand-note">No seasons logged yet.</p>
                )}
                {anime.seasons.map((season) => {
                  const done = isSeasonDone(season);
                  return (
                    <div className="season-line" key={season.number}>
                      {season.cover || anime.cover ? (
                        <img
                          className="season-art"
                          src={season.cover ?? anime.cover ?? ""}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="season-art empty" aria-hidden="true" />
                      )}
                      <span className="season-tag">S{season.number}</span>
                      <span className="season-count">
                        {season.episodesWatched} of {season.episodeCount} episodes
                      </span>
                      <span className="season-action">
                        {done ? (
                          <span className="row-done">Done</span>
                        ) : (
                          <button
                            type="button"
                            className="advance"
                            disabled={busy}
                            aria-label={`Log episode ${season.episodesWatched + 1} of season ${season.number} for ${anime.title}`}
                            onClick={() => onAdvance(anime, season)}
                          >
                            +1 ep
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                <div className="expand-foot">
                  <button type="button" className="quiet" onClick={() => onEdit(anime.id)}>
                    Edit title
                  </button>
                  {pendingDelete === anime.id ? (
                    <>
                      <button
                        type="button"
                        className="quiet danger"
                        disabled={busy}
                        onClick={() => {
                          setPendingDelete(null);
                          void onDelete(anime.id);
                        }}
                      >
                        Delete “{anime.title}”?
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => setPendingDelete(null)}
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="quiet danger"
                      disabled={busy}
                      onClick={() => setPendingDelete(anime.id)}
                    >
                      Delete title
                    </button>
                  )}
                  {(anime.studio || anime.author || anime.genres) && (
                    <span className="expand-meta">
                      {[anime.studio, anime.author, anime.genres]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
