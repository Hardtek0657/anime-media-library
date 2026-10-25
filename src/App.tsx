import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogList, FilterRail } from "./Catalog";
import { DetailPanel } from "./DetailPanel";
import { ScanNews } from "./ScanNews";
import { SettingsDialog } from "./SettingsDialog";
import { aiHasKey, aiLookup } from "./lib/ai";
import { anilistLookupDeep } from "./lib/anilist";
import {
  advanceSeason,
  applyDetails,
  applyScan,
  deleteAnime as removeAnime,
  loadLibrary,
  renameAnime,
  saveAnime as persistAnime,
  type AnimeDraft,
} from "./lib/db";
import { planChange, type ScanReport } from "./lib/scan";
import { looksLikeTypo, normalizeTitle } from "./lib/similar";
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
  const [expanded, setExpanded] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; anime: Anime } | null>(null);
  const [menuArmed, setMenuArmed] = useState(false);

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
        setMenu(null);
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

  async function applyRename(id: number, title: string) {
    try {
      await renameAnime(id, title);
      setNews((prev) =>
        prev ? { ...prev, renames: prev.renames.filter((entry) => entry.id !== id) } : prev,
      );
      await reload();
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function openMenu(anime: Anime, x: number, y: number) {
    setMenuArmed(false);
    setMenu({ x, y, anime });
  }

  async function runScan(targets?: Anime[]) {
    const queue = targets ?? library ?? [];
    if (queue.length === 0) return;
    if (!aiReady) {
      setSettingsOpen(true);
      return;
    }
    setScanning(true);
    setScanDone(0);
    setScanTotal(queue.length);
    setNews(null);
    const report: ScanReport = {
      total: queue.length,
      checked: 0,
      requests: 0,
      changes: [],
      details: [],
      renames: [],
      errors: [],
    };
    try {
      // A failed title must not abandon the rest of the shelf: one bad request used to
      // stop the whole run, which left later titles without art or details. Three
      // failures in a row is the case where the key or the network is gone.
      let consecutiveFailures = 0;
      for (const anime of queue) {
        try {
          const answer = await aiLookup(anime.title);
          report.requests += 1;
          consecutiveFailures = 0;
          const change = planChange(anime, answer.seasons);
          if (change) {
            await applyScan(anime.id, change.added, change.grown);
            report.changes.push(change);
          }
        } catch (cause) {
          consecutiveFailures += 1;
          report.errors.push(`${anime.title}: ${describe(cause)}`);
        }

        // AniList answers for every title: it is keyless and it is the only source that
        // can say whether a stored title is misspelled.
        try {
          const { details: found, calls } = await anilistLookupDeep(anime.title);
          report.requests += calls;
          if (found) {
            const canonical = found.title;
            const sameWords =
              normalizeTitle(anime.title) === normalizeTitle(canonical ?? "");
            if (
              canonical &&
              canonical !== anime.title &&
              (sameWords || looksLikeTypo(anime.title, canonical))
            ) {
              report.renames.push({ id: anime.id, from: anime.title, to: canonical });
            }

            const applied = await applyDetails(anime.id, {
              author: found.author,
              studio: found.studio,
              genres: found.genres,
              description: found.description,
              cover: found.cover,
              seasons: found.seasons.map((season) => ({
                number: season.number,
                cover: season.cover,
              })),
            });
            const fields = [...applied.fields];
            if (applied.seasonCovers > 0) {
              fields.push(
                `${applied.seasonCovers} season ${applied.seasonCovers === 1 ? "cover" : "covers"}`,
              );
            }
            if (fields.length > 0) {
              report.details.push({ title: anime.title, fields });
            }
          }
        } catch (cause) {
          // Keep going, but say so: a silent failure is how titles ended up with no art.
          report.errors.push(`${anime.title}: ${describe(cause)}`);
        }

        report.checked += 1;
        setScanDone(report.checked);
        if (consecutiveFailures >= 3) {
          report.errors.push("Stopped after three failures in a row. Check the key and run it again.");
          break;
        }
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

      {news && (
        <ScanNews
          report={news}
          onRename={(id, title) => void applyRename(id, title)}
          onDismiss={() => setNews(null)}
        />
      )}

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
            expandedId={expanded}
            busy={busy}
            onToggle={(id) => setExpanded((prev) => (prev === id ? null : id))}
            onMenu={openMenu}
            onEdit={openExisting}
            onDelete={remove}
            onAdd={openNew}
            onFormat={setFormat}
            onAdvance={(anime, season) => {
              void mutate(() => advanceSeason(anime.id, season.number));
            }}
          />
        )}

        {menu && (
          <>
            <div
              className="menu-scrim"
              onClick={() => setMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(null);
              }}
            />
            <div
              className="menu"
              role="menu"
              aria-label={`Actions for ${menu.anime.title}`}
              style={{
                left: Math.min(menu.x, window.innerWidth - 240),
                top: Math.min(menu.y, window.innerHeight - 168),
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  openExisting(menu.anime.id);
                }}
              >
                Edit title
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const target = menu.anime;
                  setMenu(null);
                  void runScan([target]);
                }}
              >
                Check for new seasons
              </button>
              {menuArmed ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      const target = menu.anime;
                      setMenu(null);
                      void remove(target.id);
                    }}
                  >
                    Delete “{menu.anime.title}”?
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setMenuArmed(false)}
                  >
                    Keep it
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  disabled={busy}
                  onClick={() => setMenuArmed(true)}
                >
                  Delete title
                </button>
              )}
            </div>
          </>
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
