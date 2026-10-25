import {
  STATUS_LABEL,
  episodeTotal,
  episodeWatched,
  isSeasonDone,
  monogram,
  nextUnfinished,
  spineColor,
  statusOf,
  type Anime,
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

/** Beyond a handful of seasons, one aggregate bar keeps every row the same height. */
function SeasonSummary({ anime }: { anime: Anime }) {
  const done = anime.seasons.filter(isSeasonDone).length;
  const watched = episodeWatched(anime);
  const total = episodeTotal(anime);
  const share = total === 0 ? 0 : Math.round((watched / total) * 100);
  return (
    <span className="season-summary">
      <span className="strip-track" aria-hidden="true">
        <span className="strip-fill" style={{ width: `${share}%` }} />
      </span>
      <span className="season-summary-text">
        {done} of {anime.seasons.length} seasons complete
      </span>
    </span>
  );
}

export function CatalogList({
  library,
  visible,
  filter,
  query,
  selectedId,
  busy,
  onSelect,
  onAdd,
  onAdvance,
}: {
  library: Anime[];
  visible: Anime[];
  filter: Filter;
  query: string;
  selectedId: number | null;
  busy: boolean;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onAdvance: (anime: Anime, season: Season) => void;
}) {
  if (visible.length === 0) {
    const narrowed = library.length > 0;
    return (
      <div className="list">
        <div className="state">
          <h2 className="state-title">
            {narrowed ? "Nothing matches that filter." : "Nothing on the shelf yet."}
          </h2>
          <p className="state-note">
            {narrowed
              ? "Clear the search or pick another shelf to see the rest of the library."
              : "Add a title, give it a season, and log where you stopped."}
          </p>
          {!narrowed && (
            <button type="button" className="btn primary" onClick={onAdd}>
              Add your first title
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="list">
      <div className="list-head">
        <span>
          {visible.length} {visible.length === 1 ? "title" : "titles"}
          {filter !== "all" ? ` · ${STATUS_LABEL[filter]}` : ""}
          {query.trim() ? ` · matching “${query.trim()}”` : ""}
        </span>
      </div>
      {visible.map((anime) => {
        const next = nextUnfinished(anime);
        const detailed = anime.seasons.length > 0 && anime.seasons.length <= 4;
        return (
          <div
            key={anime.id}
            className="row"
            data-selected={selectedId === anime.id ? "true" : undefined}
            onClick={() => onSelect(anime.id)}
          >
            <span
              className="spine"
              style={{ background: spineColor(anime.title) }}
              aria-hidden="true"
            />
            <span
              className="monogram"
              style={{ color: spineColor(anime.title) }}
              aria-hidden="true"
            >
              {monogram(anime.title)}
            </span>
            <span className="row-main">
              <button
                type="button"
                className="row-title"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(anime.id);
                }}
              >
                {anime.title}
              </button>
              <span className="row-meta">{metaLine(anime)}</span>
            </span>
            <span className="row-seasons">
              {anime.seasons.length === 0 && (
                <span className="more">No seasons yet</span>
              )}
              {detailed &&
                anime.seasons.map((season) => (
                  <SeasonStrip key={season.number} season={season} />
                ))}
              {anime.seasons.length > 4 && <SeasonSummary anime={anime} />}
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
        );
      })}
    </div>
  );
}
