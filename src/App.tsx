import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogList, FilterRail } from "./Catalog";
import { DetailPanel } from "./DetailPanel";
import { ScanNews } from "./ScanNews";
import { SettingsDialog } from "./SettingsDialog";
import { aiHasKey, aiLookup } from "./lib/ai";
import {
  advanceSeason,
  applyScan,
  deleteAnime as removeAnime,
  loadLibrary,
  saveAnime as persistAnime,
  type AnimeDraft,
} from "./lib/db";
import { planChange, type ScanReport } from "./lib/scan";
import { statusOf, type Anime, type AnimeFormat, type Filter, type Season } from "./lib/model";

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export default function App() {
  const [library, setLibrary] = useState<Anime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [format, setFormat] = useState<AnimeFormat | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [news, setNews] = useState<ScanReport | null>(null);

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
    aiHasKey()
      .then(setAiReady)
      .catch(() => setAiReady(false));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !settingsOpen) {
        setSelectedId(null);
        setCreating(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (library ?? []).filter((anime) => {
      if (filter !== "all" && statusOf(anime) !== filter) return false;
      if (format !== "all" && anime.format !== format) return false;
      return needle === "" || anime.title.toLowerCase().includes(needle);
    });
  }, [library, filter, format, query]);

  /** The rail counts follow the format, so a shelf count always matches what it opens. */
  const formatScope = useMemo(
    () => (library ?? []).filter((anime) => format === "all" || anime.format === format),
    [library, format],
  );

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

  async function runScan() {
    const targets = library ?? [];
    if (targets.length === 0) return;
    if (!aiReady) {
      setSettingsOpen(true);
      return;
    }
    setScanning(true);
    setScanDone(0);
    setScanTotal(targets.length);
    setNews(null);
    const report: ScanReport = {
      total: targets.length,
      checked: 0,
      requests: 0,
      changes: [],
      errors: [],
    };
    try {
      for (const anime of targets) {
        try {
          const answer = await aiLookup(anime.title);
          report.requests += 1;
          const change = planChange(anime, answer.seasons);
          if (change) {
            await applyScan(anime.id, change.added, change.grown);
            report.changes.push(change);
          }
        } catch (cause) {
          report.errors.push(`${anime.title}: ${describe(cause)}`);
          break;
        }
        report.checked += 1;
        setScanDone(report.checked);
      }
    } finally {
      setScanning(false);
      setNews(report);
      await reload();
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
        <button
          type="button"
          className="btn"
          disabled={scanning || library === null}
          onClick={() => void runScan()}
        >
          {scanning ? `Checking ${scanDone} of ${scanTotal}…` : "Check library"}
        </button>
        <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
          AI settings
        </button>
        <button type="button" className="btn primary" onClick={openNew}>
          Add title
        </button>
      </header>

      {news && <ScanNews report={news} onDismiss={() => setNews(null)} />}

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button type="button" className="quiet" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}

      <div className="workspace">
        <FilterRail library={formatScope} filter={filter} onChange={setFilter} />
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
            format={format}
            query={query}
            selectedId={selectedId}
            busy={busy}
            onSelect={openExisting}
            onAdd={openNew}
            onFormat={setFormat}
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
            aiReady={aiReady}
            library={library ?? []}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenExisting={openExisting}
            onClose={closePanel}
            onSave={save}
            onDelete={remove}
          />
        )}
      </div>

      {settingsOpen && (
        <SettingsDialog
          saved={aiReady}
          onClose={() => setSettingsOpen(false)}
          onSaved={setAiReady}
        />
      )}
    </div>
  );
}
