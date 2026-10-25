import { useEffect, useRef, useState, type FormEvent } from "react";
import { aiLookup } from "./lib/ai";
import type { AnimeDraft } from "./lib/db";
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

type SeasonRow = {
  key: string;
  number: string;
  count: string;
  watched: string;
};

let nextRowKey = 0;

function rowsFrom(anime: Anime | null): SeasonRow[] {
  if (!anime || anime.seasons.length === 0) {
    return [
      { key: `new-${nextRowKey++}`, number: "1", count: "12", watched: "0" },
    ];
  }
  return anime.seasons.map((season) => ({
    key: `saved-${season.number}`,
    number: String(season.number),
    count: String(season.episodeCount),
    watched: String(season.episodesWatched),
  }));
}

export function DetailPanel({
  anime,
  busy,
  aiReady,
  onOpenSettings,
  onClose,
  onSave,
  onDelete,
}: {
  anime: Anime | null;
  busy: boolean;
  aiReady: boolean;
  onOpenSettings: () => void;
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
  const [rows, setRows] = useState<SeasonRow[]>(() => rowsFrom(anime));
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiProblem, setAiProblem] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function fillFromAi() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setAiProblem("Type the title first.");
      titleRef.current?.focus();
      return;
    }
    setAiBusy(true);
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
      setAiBusy(false);
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
      seasons.push({ number, episodeCount: count, episodesWatched: watched });
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
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Frieren: Beyond Journey's End"
          aria-invalid={problem === "A title is required." ? true : undefined}
        />
      </label>

      <div className="ai-row">
        {aiReady ? (
          <button
            type="button"
            className="quiet"
            onClick={() => void fillFromAi()}
            disabled={aiBusy || busy}
          >
            {aiBusy ? "Asking DeepSeek" : "Fill from AI"}
          </button>
        ) : (
          <span className="hint">
            AI fill needs a DeepSeek key.{" "}
            <button type="button" className="link" onClick={onOpenSettings}>
              Add one
            </button>
          </span>
        )}
        {aiProblem && (
          <p className="problem" role="alert">
            {aiProblem}
          </p>
        )}
        {aiNote && <p className="hint">{aiNote}</p>}
      </div>

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
