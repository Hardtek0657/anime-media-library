import { useEffect, useRef, useState, type FormEvent } from "react";
import { aiClearKey, aiSetKey } from "./lib/ai";

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function SettingsDialog({
  saved,
  onClose,
  onSaved,
}: {
  saved: boolean;
  onClose: () => void;
  onSaved: (saved: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) {
      setProblem("Paste the key first.");
      return;
    }
    setBusy(true);
    try {
      await aiSetKey(key);
      setKey("");
      setProblem(null);
      onSaved(true);
    } catch (cause) {
      setProblem(describe(cause));
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    try {
      await aiClearKey();
      setProblem(null);
      onSaved(false);
    } catch (cause) {
      setProblem(describe(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="settings-title">DeepSeek key</h2>
        <p className="dialog-text">
          Filling a title with AI is optional and off until you add a key. The key is kept
          in the Windows Credential Manager, not in the library database. Only the title you
          ask about leaves this machine.
        </p>

        <form onSubmit={save} noValidate>
          <label className="field">
            <span>API key</span>
            <input
              ref={inputRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={saved ? "Saved. Paste a new key to replace it." : "sk-..."}
            />
          </label>

          {problem && (
            <p className="problem" role="alert">
              {problem}
            </p>
          )}

          <p className="hint">
            {saved ? "A key is saved." : "No key saved."}
          </p>

          <div className="panel-foot">
            <button type="submit" className="btn primary" disabled={busy}>
              Save key
            </button>
            {saved && (
              <button type="button" className="btn danger" onClick={forget} disabled={busy}>
                Remove key
              </button>
            )}
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
