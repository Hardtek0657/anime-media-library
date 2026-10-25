import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogList, FilterRail } from "./Catalog";
import { DetailPanel } from "./DetailPanel";
import {
  advanceSeason,
  deleteAnime as removeAnime,
  loadLibrary,
  saveAnime as persistAnime,
  type AnimeDraft,
} from "./lib/db";
import { statusOf, type Anime, type Filter, type Season } from "./lib/model";

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export default function App() {
  const [library, setLibrary] = useState<Anime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLibrary(await loadLibrary());
      setError(null);
    } catch (cause) {
      setError(describe(cause));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
        setCreating(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (library ?? []).filter((anime) => {
      if (filter !== "all" && statusOf(anime) !== filter) return false;
      return needle === "" || anime.title.toLowerCase().includes(needle);
    });
  }, [library, filter, query]);

  const selected = library?.find((anime) => anime.id === selectedId) ?? null;

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  }

  const openNew = () => {
    setSelectedId(null);
    setCreating(true);
  };

  const openExisting = (id: number) => {
    setCreating(false);
    setSelectedId(id);
  };

  const closePanel = () => {
    setSelectedId(null);
    setCreating(false);
  };

  async function save(
    id: number | null,
    draft: AnimeDraft,
    seasons: Season[],
    removed: number[],
  ) {
    setBusy(true);
    try {
      await persistAnime(id, draft, seasons, removed);
      closePanel();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await removeAnime(id);
      closePanel();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <h1>Shelf</h1>
          <p className="brand-sub">Anime Media Library</p>
        </div>
        <input
          className="search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter titles"
          aria-label="Filter titles"
        />
        <button type="button" className="btn primary" onClick={openNew}>
          Add title
        </button>
      </header>

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button type="button" className="quiet" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}

      <div className="workspace">
        <FilterRail library={library ?? []} filter={filter} onChange={setFilter} />
        {library === null ? (
          <div className="list">
            <div className="state">
              <h2 className="state-title">
                {error ? "The library could not be read." : "Reading the shelf…"}
              </h2>
              <p className="state-note">
                {error
                  ? "Your database file is untouched. Retry, or restart the app."
                  : "Opening the local database."}
              </p>
              {error && (
                <button type="button" className="btn" onClick={() => void reload()}>
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <CatalogList
            library={library}
            visible={visible}
            filter={filter}
            query={query}
            selectedId={selectedId}
            busy={busy}
            onSelect={openExisting}
            onAdd={openNew}
            onAdvance={(anime, season) => {
              void mutate(() => advanceSeason(anime.id, season.number));
            }}
          />
        )}

        {(creating || selected) && (
          <DetailPanel
            key={creating ? "new" : `edit-${selectedId}`}
            anime={creating ? null : selected}
            busy={busy}
            onClose={closePanel}
            onSave={save}
            onDelete={remove}
          />
        )}
      </div>
    </div>
  );
}
