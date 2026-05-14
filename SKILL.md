---
name: spotify-dj
description: Operate a local, code-harness-driven Spotify DJ with markdown zettelkasten memory and one writable playlist. Use when the user asks for music recommendations, Spotify playlist creation, listening-history-aware suggestions, or preference tracking in this repo.
---

# Spotify DJ

## Harness location

Set `SPOTIFY_DJ_HOME` in your shell to the cloned harness repo:

```sh
export SPOTIFY_DJ_HOME=/path/to/dj
```

Run all CLI commands from that directory:

```sh
cd "$SPOTIFY_DJ_HOME"
```

Runtime secrets and local state live in gitignored files in the harness directory (`.env`, `.spotify-token.json`, and `memory/`). Do not copy them into `~/.agents/skills` separately.

## Prime directives

- Before running `./spotify.js`, `./lastfm.js`, `./memory.js`, or `./memory-backup.js`, require `SPOTIFY_DJ_HOME` to be set and `cd "$SPOTIFY_DJ_HOME"`.
- Treat `MEMORY_DIR` (`memory/` by default) as persistent private memory. Read it before recommending.
- Before writing dated notes, get today's date with `date +%F`; do not guess the date.
- Use zettelkasten notes: one idea per markdown file, linked with `[[note-id]]`.
- Never recommend tracks already known from memory or the exposed playlist unless the user asks.
- Use `./lastfm.js` for read-only Last.fm taste/listening-history signals when available.
- Only mutate Spotify through `./spotify.js playlist add ...` or setup commands explicitly requested by the user.
- Never call Spotify write endpoints directly. The CLI restricts writes to `SPOTIFY_DJ_PLAYLIST_ID`.
- Keep notes factual: source, date, track/artist IDs, user sentiment, and why it matters.
- Every memory note except `.gitkeep` should have simple YAML frontmatter for `./memory.js` queries.
- Before creating/updating frontmatter values, check current memory values with `./memory.js values <field> [type]`; prefer existing values over inventing new synonyms. This is required for `type`, `status`, `stance`, `target_type`, `strength`, and `tags`.
- Use `status` only for compact lifecycle/state values already present in memory, such as `known`, `recommended`, or `rejected`. Do not encode recommendation reasons in `status`; use `tags` or the note body for labels like `jumpy-fit` or `lower-priority-for-jumpy`.
- When adding a new frontmatter field globally, use `./memory.js add-field <field> <default> [type]` instead of hand-editing every note.
- Treat user feedback on recommendations as memory-worthy by default; save it unless the user explicitly says not to.

## Setup

1. Copy `.env.example` to `.env` and set `SPOTIFY_CLIENT_ID`.
2. In Spotify Developer Dashboard, add redirect URI `http://127.0.0.1:8888/callback`.
3. Run `./spotify.js auth login`. Re-run this after scope changes.
4. Run `./spotify.js playlist init` once to create/reuse the single writable DJ playlist.
5. Optional Last.fm reads: set `LASTFM_API_KEY` and `LASTFM_USERNAME` in `.env`.

## Read-only Spotify commands

```sh
./spotify.js me
./spotify.js search track "Space Song Beach House" 5
./spotify.js search artist "Beach House" 5
./spotify.js artist releases "Beach House" 10
./spotify.js playlist show
./spotify.js recently-played 50
./spotify.js library find-artist "Maizzle"
```

Spotify search syntax is exactly `./spotify.js search <track|artist|album> "<query>" [limit]`. Do not insert placeholder/group arguments like `x` or `_`.

## Read-only Last.fm commands

```sh
./lastfm.js profile
./lastfm.js recent 50
./lastfm.js loved 50
./lastfm.js top-tracks 1month 50
./lastfm.js top-artists 6month 50
./lastfm.js top-albums overall 50
./lastfm.js find-track "artist or track"
./lastfm.js artist "Burial"
./lastfm.js similar "Burial" 20
```

Periods: `overall`, `7day`, `1month`, `3month`, `6month`, `12month`.

Use Last.fm for what the user actually listens to; use Spotify for search, metadata, and playlist mutation.

## Only writable playlist commands

```sh
./spotify.js playlist init          # setup only; creates/reuses the one DJ playlist
./spotify.js playlist add <track_id_or_uri> [more_ids_or_uris...]
```

`playlist add` always targets only `SPOTIFY_DJ_PLAYLIST_ID` from `.env`.

## Memory workflow

Before answering a recommendation request:

1. Query memory first with `./memory.js latest preference 20`, `./memory.js query <field> <value>`, `./memory.js values <field> [type]`, `./memory.js search <text>`, or fuzzy `./memory.js find <text>`.
2. Read the relevant note files returned by `memory.js`.
3. Query read-only Spotify and Last.fm data as needed.
4. Build candidates and filter out known tracks/artists where appropriate.
5. Add selected tracks to the exposed playlist only if the user asked for a playlist.
6. Before creating a new note, run duplicate checks:
   - `./memory.js find "<artist/track/preference/session keywords>"`
   - `./memory.js query spotify_id <id>` when a Spotify ID exists
   - `./memory.js query target "<target>"` for preference targets
7. Prefer updating an existing note when it represents the same artist, track, album, preference target, or session. Create a new dated preference only when the user's current stance has changed or the old note is no longer the same fact.
8. Before writing/updating note frontmatter, run `./memory.js values <field> [type]` for any field whose value you are choosing rather than copying. Reuse current values unless there is a clear reason to introduce a new one.
9. Write/update notes under `MEMORY_DIR`:
   - `index.md` links important notes. This should be the only top-level note.
   - `artists/<artist-slug>.md` for artist-level preference.
   - `tracks/<track-id>.md` for known tracks.
   - `preferences/<YYYY-MM-DD>-<preference-slug>.md` for time-sensitive or durable moods, genre tastes, artist fatigue, voice preferences, and recommendation heuristics.
   - `sessions/<YYYY-MM-DD>-<slug>.md` for interactions and one-off context.
10. After any manual create/update/delete of memory `.md` files, immediately run `./memory-backup.js` so the private memory git repo and bundle are updated. Do this before replying to the user.

## Time-sensitive preferences

Create a new dated preference note when the user says their current taste changed, e.g. "tired of Clairo" or "liking more screamy voices lately". First check for duplicates with `./memory.js find` and `./memory.js query target <target>`. Do not overwrite old taste notes; preserve history and let recency win.

Use the time-sensitive preference template in [references/templates.md](references/templates.md).

Meanings:
- `stance`: `likes`, `avoid`, `curious`, `neutral`, `mood-reference`.
- `strength`: `low`, `medium`, `high`.
- `target_type`: `artist`, `genre`, `track`, `album`, `voice`, `mood`, `production`, `general`.
- `decay_days`: how long this should strongly affect recommendations. Omit for durable preferences.

When recommending, check `./memory.js latest preference 20` first and prioritize recent/high-strength preferences.

## Feedback workflow

When the user reacts to a recommendation, playlist, artist, track, genre, sound, or mood, save it before or alongside the reply. Use `date +%F` for `updated`, `date`, and `valid_from` fields.

Examples of feedback triggers:
- "I like this", "more like this", "this worked" → save/update positive preference and relevant track/artist notes.
- "not this", "skip", "tired of X", "too mellow" → save avoidance or negative preference, usually with `decay_days`.
- "I'm into screamy voices lately", "less indie", "more clubby" → create dated `memory/preferences/<YYYY-MM-DD>-<slug>.md`.
- "I know this already" → mark the track/artist as known so it is not suggested as discovery.

Use session notes for the immediate interaction, and preference/artist/track notes for reusable learning.

## Note templates

See [references/templates.md](references/templates.md) for artist, track, session, and preference templates.
