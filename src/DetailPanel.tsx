import { useEffect, useRef, useState, type FormEvent } from "react";
import { aiLookup } from "./lib/ai";
import { anilistById, anilistCandidates, anilistLookup, type AniListCandidate } from "./lib/anilist";
import type { AnimeDraft } from "./lib/db";
import { findSimilarTitle } from "./lib/similar";
import {
  FORMATS,
  episodeTotal,
  episodeWatched,
  type Anime,
  type AnimeFormat,
  type Season,
} from "./lib/model";

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function seasonCount(count: number): string {
  return count === 1 ? "1 season" : `${count} seasons`;
}

function seasonList(numbers: number[]): string {
  const labels = numbers.map((number) => `season ${number}`);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

let nextRowKey = 0;

type SeasonRow = {
  key: string;
  number: string;
  count: string;
  watched: string;
  cover: string | null;
};

function rowsFrom(anime: Anime | null): SeasonRow[] {
  if (!anime || anime.seasons.length === 0) {
    return [
      { key: `new-${nextRowKey++}`, number: "1", count: "12", watched: "0", cover: null },
    ];
  }
  return anime.seasons.map((season) => ({
    key: `saved-${season.number}`,
    number: String(season.number),
    count: String(season.episodeCount),
    watched: String(season.episodesWatched),
    cover: season.cover,
  }));
}

export function DetailPanel({
  anime,
  busy,
  aiReady,
  library,
  onOpenSettings,
  onOpenExisting,
  onClose,
  onSave,
  onDelete,
}: {
  anime: Anime | null;
  busy: boolean;
  aiReady: boolean;
  library: Anime[];
  onOpenSettings: () => void;
  onOpenExisting: (id: number) => void;
  onClose: () => void;
  onSave: (
    id: number | null,
    draft: AnimeDraft,
    seasons: Season[],
    removed: number[],
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState(anime?.title ?? "");
  const [year, setYear] = useState(anime?.year ? String(anime.year) : "");
  const [format, setFormat] = useState<AnimeFormat>(anime?.format ?? "TV");
  const [notes, setNotes] = useState(anime?.notes ?? "");
  const [description, setDescription] = useState(anime?.description ?? "");
  const [author, setAuthor] = useState(anime?.author ?? "");
  const [studio, setStudio] = useState(anime?.studio ?? "");
  const [genres, setGenres] = useState(anime?.genres ?? "");
  const [cover, setCover] = useState(anime?.cover ?? null);
  const [rows, setRows] = useState<SeasonRow[]>(() => rowsFrom(anime));
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [aiBusy, setAiBusy] = useState<"deepseek" | "anilist" | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiProblem, setAiProblem] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Anime | null>(null);
  const [candidates, setCandidates] = useState<AniListCandidate[] | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function fillFromAi(force = false) {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setAiProblem("Type the title first.");
      titleRef.current?.focus();
      return;
    }
    if (!force) {
      const match = findSimilarTitle(cleanTitle, library, anime?.id ?? null);
      if (match) {
        setSimilar(match);
        setAiNote(null);
        setAiProblem(null);
        return;
      }
    }
    setSimilar(null);
    setAiBusy("deepseek");
    setAiProblem(null);
    setAiNote(null);
    try {
      const answer = await aiLookup(cleanTitle);
      const filled: string[] = [];
      if (!year && answer.year) {
        setYear(String(answer.year));
        filled.push("year");
      }
      if (!anime && answer.format !== format) {
        setFormat(answer.format);
        filled.push("format");
      }
      if (!description.trim() && answer.description) {
        setDescription(answer.description);
        filled.push("description");
      }

      let seasonsNote = "";
      if (answer.seasons.length > 0) {
        if (!anime) {
          setRows(
            answer.seasons.map((season) => ({
              key: `ai-${nextRowKey++}`,
              number: String(season.number),
              count: String(season.episodes),
              watched: "0",
              cover: null,
            })),
          );
          filled.push(seasonCount(answer.seasons.length));
        } else {
          // A saved title keeps its watch progress: counts follow the suggestion, watched
          // values are preserved (clamped), missing seasons are added, unknown rows stay.
          const suggested = new Map(answer.seasons.map((season) => [season.number, season]));
          let countsChanged = 0;
          const merged = rows.map((row) => {
            const season = suggested.get(Number(row.number));
            if (!season) return row;
            const watched = Math.min(Number(row.watched) || 0, season.episodes);
            const next = {
              ...row,
              count: String(season.episodes),
              watched: String(watched),
            };
            if (Number(row.count) !== season.episodes) countsChanged += 1;
            return next;
          });
          const missing = answer.seasons.filter(
            (season) => !rows.some((row) => Number(row.number) === season.number),
          );
          merged.push(
            ...missing.map((season) => ({
              key: `ai-${nextRowKey++}`,
              number: String(season.number),
              count: String(season.episodes),
              watched: "0",
              cover: null,
            })),
          );
          setRows(merged);

          const parts: string[] = [];
          if (missing.length > 0) parts.push(`added ${seasonList(missing.map((s) => s.number))}`);
          if (countsChanged > 0) {
            parts.push(
              countsChanged === 1 ? "updated 1 episode count" : `updated ${countsChanged} episode counts`,
            );
          }
          seasonsNote =
            parts.length > 0
              ? `${sentenceCase(parts.join(", and "))}. Watch progress kept.`
              : "Seasons already match DeepSeek's list; watch progress kept.";
        }
      }

      setAiNote(
        [filled.length > 0 ? `${sentenceCase(filled.join(", "))} filled from DeepSeek.` : "", seasonsNote]
          .filter(Boolean)
          .join(" ") || "Nothing new to fill; those fields already have values.",
      );
    } catch (cause) {
      setAiProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAiBusy(null);
    }
  }

  async function showCandidates() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setAiProblem("Type the title first.");
      titleRef.current?.focus();
      return;
    }
    setAiBusy("anilist");
    setAiProblem(null);
    setAiNote(null);
    try {
      const list = await anilistCandidates(cleanTitle);
      if (list.length === 0) setAiProblem("AniList has no matches for that title.");
      else setCandidates(list);
    } catch (cause) {
      setAiProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAiBusy(null);
    }
  }

  async function fetchDetails(candidateId?: number) {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setAiProblem("Type the title first.");
      titleRef.current?.focus();
      return;
    }
    setAiBusy("anilist");
    setAiProblem(null);
    setAiNote(null);
    try {
      const found =
        candidateId === undefined
          ? await anilistLookup(cleanTitle)
          : await anilistById(candidateId);
      if (!found) {
        setAiProblem("AniList has no match for that title.");
        return;
      }
      // Choosing an entry is a decision: it replaces the metadata that came from the
      // other one. A plain fetch still only fills what is empty.
      const overwrite = candidateId !== undefined;
      const filled: string[] = [];
      if (found.year && (overwrite || !year)) {
        setYear(String(found.year));
        filled.push("year");
      }
      if (found.format !== format && (overwrite || !anime)) {
        setFormat(found.format as AnimeFormat);
        filled.push("format");
      }
      if (found.description && (overwrite || !description.trim())) {
        setDescription(found.description);
        filled.push("description");
      }
      if (found.author && (overwrite || !author.trim())) {
        setAuthor(found.author);
        filled.push("author");
      }
      if (found.studio && (overwrite || !studio.trim())) {
        setStudio(found.studio);
        filled.push("studio");
      }
      if (found.genres && (overwrite || !genres.trim())) {
        setGenres(found.genres);
        filled.push("genres");
      }
      if (found.cover && (overwrite || !cover)) {
        setCover(found.cover);
        filled.push("artwork");
      }

      const byNumber = new Map(found.seasons.map((season) => [season.number, season.cover]));
      let seasonArt = 0;
      // The chain has to match the rows, or art lands on the wrong season. When it does
      // not, the series cover is used instead of nothing.
      const matched = found.seasons.length === rows.length;
      const next = rows.map((row) => {
        if (row.cover && !overwrite) return row;
        const url = matched ? byNumber.get(Number(row.number)) ?? null : found.cover;
        if (!url) return row;
        seasonArt += 1;
        return { ...row, cover: url };
      });
      if (seasonArt > 0) setRows(next);

      const parts = [...filled];
      if (seasonArt > 0) parts.push(`${seasonArt} season ${seasonArt === 1 ? "cover" : "covers"}`);
      setAiNote(
        parts.length > 0
          ? `${sentenceCase(parts.join(", "))} ${
              overwrite ? "replaced from" : "filled from"
            } AniList. Review before saving.`
          : "Those fields already have values; AniList added nothing.",
      );
    } catch (cause) {
      setAiProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAiBusy(null);
    }
  }

  function updateRow(key: string, patch: Partial<SeasonRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addSeason() {
    setRows((prev) => {
      const highest = Math.max(0, ...prev.map((row) => Number(row.number) || 0));
      return [
        ...prev,
        {
          key: `new-${nextRowKey++}`,
          number: String(Math.floor(highest) + 1),
          count: "12",
          watched: "0",
          cover: null,
        },
      ];
    });
  }

  function removeSeason(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setProblem("A title is required.");
      titleRef.current?.focus();
      return;
    }

    const seasons: Season[] = [];
    const claimed = new Set<number>();
    for (const row of rows) {
      const number = Number(row.number);
      if (!Number.isFinite(number) || number <= 0) {
        setProblem("Every season needs a number above zero, like 2 or 2.5.");
        return;
      }
      if (claimed.has(number)) {
        setProblem(`Season ${number} is listed twice.`);
        return;
      }
      claimed.add(number);

      const count = Number.parseInt(row.count, 10);
      if (!Number.isFinite(count) || count < 1) {
        setProblem(`Season ${number} needs at least one episode.`);
        return;
      }
      const watched = Math.min(
        Math.max(Number.parseInt(row.watched, 10) || 0, 0),
        count,
      );
      seasons.push({
        number,
        episodeCount: count,
        episodesWatched: watched,
        cover: row.cover,
      });
    }

    // Any saved season whose number no longer appears was either removed or renumbered.
    const removed = (anime?.seasons ?? [])
      .map((season) => season.number)
      .filter((number) => !claimed.has(number));

    const parsedYear = Number.parseInt(year, 10);
    setProblem(null);
    try {
      await onSave(
        anime?.id ?? null,
        {
          title: cleanTitle,
          year: Number.isFinite(parsedYear) && parsedYear >= 1900 ? parsedYear : null,
          format,
          notes: notes.trim() ? notes.trim() : null,
          description: description.trim() ? description.trim() : null,
          author: author.trim() ? author.trim() : null,
          studio: studio.trim() ? studio.trim() : null,
          genres: genres.trim() ? genres.trim() : null,
          cover,
        },
        seasons,
        removed,
      );
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function remove() {
    if (!anime) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await onDelete(anime.id);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const summary = anime
    ? `${episodeWatched(anime)} of ${episodeTotal(anime)} episodes logged`
    : null;

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="panel-head">
        <h2 className="panel-title">{anime ? "Edit title" : "New title"}</h2>
        <button type="button" className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      {summary && <p className="summary">{summary}</p>}

      <label className="field">
        <span>Title</span>
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setSimilar(null);
          }}
          placeholder="e.g. Frieren: Beyond Journey's End"
          aria-invalid={problem === "A title is required." ? true : undefined}
        />
      </label>

      <div className="ai-row">
        <div className="ai-actions">
          {aiReady ? (
            <button
              type="button"
              className="quiet"
              onClick={() => void fillFromAi()}
              disabled={aiBusy !== null || busy}
            >
              {aiBusy === "deepseek" ? "Asking DeepSeek" : "Fill from AI"}
            </button>
          ) : (
            <span className="hint">
              AI fill needs a DeepSeek key.{" "}
              <button type="button" className="link" onClick={onOpenSettings}>
                Add one
              </button>
            </span>
          )}
          <button
            type="button"
            className="quiet"
            onClick={() => void fetchDetails()}
            disabled={aiBusy !== null || busy}
          >
            {aiBusy === "anilist" ? "Asking AniList" : "Fetch artwork and details"}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => void showCandidates()}
            disabled={aiBusy !== null || busy}
          >
            Pick a different match
          </button>
        </div>
        {aiProblem && (
          <p className="problem" role="alert">
            {aiProblem}
          </p>
        )}
        {aiNote && <p className="hint">{aiNote}</p>}
        {similar && (
          <div className="notice" role="alert">
            <p>
              You already have “{similar.title}”. Is this the same show?
            </p>
            <div className="notice-actions">
              <button
                type="button"
                className="btn"
                onClick={() => onOpenExisting(similar.id)}
              >
                Open that entry
              </button>
              <button type="button" className="link" onClick={() => void fillFromAi(true)}>
                Different title, fill anyway
              </button>
            </div>
          </div>
        )}
      </div>

      {candidates && (
        <div className="notice" role="group" aria-label="AniList matches">
          <p>Which one do you mean?</p>
          <div className="notice-actions">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="btn"
                onClick={() => {
                  setCandidates(null);
                  void fetchDetails(candidate.id);
                }}
              >
                {candidate.title}
                {candidate.year && !candidate.title.includes(String(candidate.year))
                  ? ` (${candidate.year})`
                  : ""}{" "}
                · {candidate.format}
              </button>
            ))}
            <button type="button" className="link" onClick={() => setCandidates(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="field-pair">
        <label className="field">
          <span>Year</span>
          <input
            type="number"
            min={1900}
            max={2100}
            value={year}
            onChange={(event) => setYear(event.target.value)}
            placeholder="2023"
          />
        </label>
        <label className="field">
          <span>Format</span>
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as AnimeFormat)}
          >
            {FORMATS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Seasons</span>
        <div className="seasons-editor">
          {rows.length === 0 && (
            <p className="hint">No seasons logged. Add one to start tracking episodes.</p>
          )}
          {rows.map((row) => (
            <div className="season-edit" key={row.key}>
              {row.cover ? (
                <img className="season-art" src={row.cover} alt="" />
              ) : (
                <span className="season-art empty" aria-hidden="true" />
              )}
              <label className="inline-field">
                <span>Season</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={row.number}
                  onChange={(event) => updateRow(row.key, { number: event.target.value })}
                />
              </label>
              <label className="inline-field">
                <span>Episodes</span>
                <input
                  type="number"
                  min={1}
                  value={row.count}
                  onChange={(event) => updateRow(row.key, { count: event.target.value })}
                />
              </label>
              <label className="inline-field">
                <span>Watched</span>
                <input
                  type="number"
                  min={0}
                  value={row.watched}
                  onChange={(event) => updateRow(row.key, { watched: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="quiet"
                onClick={() => removeSeason(row.key)}
                aria-label={`Remove season ${row.number}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="quiet add-season" onClick={addSeason}>
          Add season
        </button>
      </div>

      <div className="field-pair">
        <label className="field">
          <span>Author / creator</span>
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Original creator"
          />
        </label>
        <label className="field">
          <span>Studio</span>
          <input
            value={studio}
            onChange={(event) => setStudio(event.target.value)}
            placeholder="Animation studio"
          />
        </label>
      </div>

      <label className="field">
        <span>Genres</span>
        <input
          value={genres}
          onChange={(event) => setGenres(event.target.value)}
          placeholder="Action, Fantasy"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What the show is about"
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Where you left off, or what to remember"
        />
      </label>

      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}

      {confirmingDelete && anime && (
        <p className="problem" role="alert">
          Deleting {anime.title} also deletes its seasons.
        </p>
      )}

      <div className="panel-foot">
        <button type="submit" className="btn primary" disabled={busy}>
          {anime ? "Save changes" : "Add to shelf"}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {anime && (
          <button
            type="button"
            className="btn danger"
            onClick={remove}
            disabled={busy}
          >
            {confirmingDelete ? "Confirm delete" : "Delete"}
          </button>
        )}
      </div>
    </form>
  );
}
