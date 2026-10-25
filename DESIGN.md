# Design direction: dark cinema shelf

Set before any UI code. Every visual decision in this file has a one-line reason, per R-31.

## Reading

Reading this as: a local, single-user watch log for someone who watches season by season,
in a dark shelf language, dial **ENERGY 2 / RHYTHM 2 / MOTION 1**.

- **ENERGY 2**: the app states its presence with type and colour, not decoration. No
  marketing surface exists, so the shelf itself carries identity.
- **RHYTHM 2**: one list rhythm, with a row that varies internally (spine, monogram, season
  strips) instead of sections that all look alike.
- **MOTION 1**: hover and focus transitions only, 120 ms. Nothing enters, floats or bounces,
  because a watch log is read in short visits and movement would only delay it.

## Palette

| Token | Value | Role |
|---|---|---|
| ink | `#0e1013` | page |
| surface | `#14171c` | row hover, inputs |
| surface-2 | `#1b1f26` | selected row, buttons |
| line | `#272c34` | separators |
| bone | `#ede6d8` | primary text |
| muted | `#9aa0aa` | metadata |
| amber | `#d89b4a` | the single accent: progress, primary action, focus |

Reason: a cinema interior is dark with one warm lamp. Amber is that lamp and it appears only
where the eye must land next: the logged share of a season, the primary button, the focus
ring. Two cores plus one accent keeps the palette inside R-29.

Contrast: bone on ink is about 15:1, muted on surface about 6:1, amber on ink about 8:1. All
above the 4.5:1 body threshold.

## Type

- Titles: `Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif`. Serif titles read
  like a printed programme, and the app is a catalogue.
- Interface: `system-ui` stack. Labels, metadata and inputs stay quiet so titles dominate.
- Numerals use `tabular-nums` so episode counts do not jump while changing.
- No webfont is downloaded. The app must work with no network, and a CDN font would break
  that promise.

## Identity motif: the spine

Each row begins with a 3 px vertical rule whose colour is one of five muted tones chosen
deterministically from the title. It echoes a shelf of DVD spines and gives fast visual
recall: the same title keeps the same colour across sessions. It is a hash of real content,
not random decoration.

The monogram tile (first letters of the real title) stands in for cover art. There is no
cover source, and inventing posters would be fabricated content.

## Layout

- Masthead: product name, one filter field, count, and the single primary action.
- Left rail: four shelves with live counts. Active shelf marked by an amber inset rule.
- Centre: rows. Title and metadata left, season strips and the quick `+1` right.
- Right: a 372 px edit panel, full height. It is a form, not a modal, so the shelf stays
  visible while editing.
- Season detail on a row: up to four seasons render as individual strips. Above four, the
  row swaps to one aggregate bar with a count line, so row height never grows with the
  season count. Per-season editing stays in the panel, where a twenty season show is a
  scroll rather than a tall card.

Reason for a side panel over a modal: the task is comparing progress against the shelf, and
a modal would hide the thing being edited. At widths under 1080 px the panel overlays,
because the row content would otherwise be squeezed below a usable width.

## States

- Empty: "Nothing on the shelf yet." plus the add action, not a blank list.
- Filtered empty: names the filter and keeps the shelf reachable.
- Loading: "Reading the shelf…" while the database opens.
- Error: a banner with the message and a retry, and the record is never silently dropped.

## Optional AI

- The key lives in a centered dialog, not a settings page: one field, one status line and
  three actions did not earn a whole screen, and a dialog keeps the shelf visible behind it.
- `Fill from AI` sits under the Title field because that is the only input it needs, and the
  result lands in the form the user was already editing, so nothing is saved without review.
- The no-key state is a sentence with one inline action rather than a disabled button with a
  tooltip; the reason is text the user can read, and the way out is one click.
- Everything the model returns is treated as a draft: impossible values are dropped in Rust
  before they reach the form, and failures print in the same `.problem` style as validation.

## Deliberate omissions

- **No light theme.** The owner chose the dark shelf, and a second theme would need a full
  contrast and state pass to be honest (R-34). One verified theme now, a toggle later only
  if it is asked for.
- **No cover images.** There is no metadata source, so any artwork would be fabricated
  (R-23, R-38).
- **No icon set.** Text labels and the spine motif carry the navigation; a generic icon
  library would add a look without information (R-04).
- **No gradient, glow, glass or shadow on the chrome.** The only depth is one border colour
  step and the overlay shadow on narrow windows, both serving separation.

## Non-goals in this pass

Light theme, drag reordering, keyboard shortcuts beyond Tab, Enter, Space and Escape, bulk
import, statistics. Each would be its own change with its own reasons.
