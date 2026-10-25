CREATE TABLE anime (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  year       INTEGER CHECK (year BETWEEN 1900 AND 2100),
  format     TEXT    NOT NULL DEFAULT 'TV'
                     CHECK (format IN ('TV', 'Movie', 'OVA', 'ONA', 'Special')),
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE season (
  anime_id         INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  number           INTEGER NOT NULL CHECK (number > 0),
  episode_count    INTEGER NOT NULL CHECK (episode_count > 0),
  episodes_watched INTEGER NOT NULL DEFAULT 0 CHECK (episodes_watched >= 0),
  PRIMARY KEY (anime_id, number),
  CHECK (episodes_watched <= episode_count)
);
