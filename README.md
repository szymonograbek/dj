# Spotify DJ Harness

Local Node.js CLI tools for Spotify playlist operations, Last.fm taste/history reads, and private markdown-based music memory.

## Components

- `spotify.js` — Spotify OAuth, search, library/playlist reads, write-limited playlist mutation, and optional memory imports.
- `lastfm.js` — read-only Last.fm profile, history, loved, top, and similar-artist queries.
- `memory.js` — query and maintain markdown memory notes with YAML frontmatter.
- `memory-config.js` — shared memory path/config resolution.
- `memory-backup.js` — git commit + bundle backup helper for memory directories.
- `SKILL.md` — optional agent integration entrypoint.

## Setup

Create a Spotify app at <https://developer.spotify.com/dashboard> with this redirect URI:

```text
http://127.0.0.1:8888/callback
```

Then configure and authenticate:

```sh
cp .env.example .env
# set SPOTIFY_CLIENT_ID in .env
./spotify.js auth login
./spotify.js playlist init
```

Optional Last.fm configuration:

```env
LASTFM_API_KEY=...
LASTFM_USERNAME=...
```

## Configuration

`.env` supports:

```env
SPOTIFY_CLIENT_ID=...
LASTFM_API_KEY=...
LASTFM_USERNAME=...
MEMORY_DIR=memory
# Optional; defaults to memory-backup.bundle next to MEMORY_DIR.
MEMORY_BACKUP_BUNDLE=
```

Secrets and local state are gitignored: `.env`, `.spotify-token.json`, and `memory/`.

## Memory storage and backup

`MEMORY_DIR` defaults to `memory/`. It can point at any local path, including a synced folder:

```sh
mkdir -p "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory"
cp -a memory/. "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory/"
# set MEMORY_DIR in .env to that path
```

If `MEMORY_DIR` is a git repository, mutating memory commands automatically commit changes and update a single-file git bundle backup. Backup can also be run manually:

```sh
./memory-backup.js
```

## Memory CLI

Memory notes are markdown files with YAML frontmatter. Common commands:

```sh
./memory.js list
./memory.js latest preference 20
./memory.js query type artist
./memory.js query stance likes
./memory.js query tags electronic
./memory.js values tags
./memory.js values status track
./memory.js search "Chemical Brothers"
./memory.js find "chem bros jumpy"

# Add a new frontmatter field everywhere with a default:
./memory.js add-field mood unknown

# Or only for one note type:
./memory.js add-field mood energetic preference
```

Example dated preference note:

```md
---
type: preference
name: Liking screamy voices lately
target_type: voice
target: screamy vocals
stance: likes
strength: medium
valid_from: 2026-05-14
decay_days: 45
tags: [vocals, intense]
updated: 2026-05-14
---
```

Useful schema discovery and dedupe commands:

```sh
./memory.js values type
./memory.js values status
./memory.js values stance
./memory.js values tags
./memory.js find "clairo tired"
./memory.js query target "Clairo"
./memory.js query spotify_id <id>
```

## Last.fm CLI

Read-only taste/history helpers:

```sh
./lastfm.js profile
./lastfm.js recent 50
./lastfm.js loved 50
./lastfm.js top-tracks 1month 50
./lastfm.js top-artists 6month 50
./lastfm.js top-albums overall 50
./lastfm.js find-track "Charli XCX"
./lastfm.js artist "Burial"
./lastfm.js similar "Burial" 20
```

Supported periods: `overall`, `7day`, `1month`, `3month`, `6month`, `12month`.

## Spotify CLI

Read-only commands:

```sh
./spotify.js me
./spotify.js search track "Beach House Space Song" 5
./spotify.js search artist "Beach House" 5
./spotify.js artist releases "Beach House" 10
./spotify.js recently-played 50
./spotify.js library find-artist "Maizzle"
./spotify.js playlist show
```

Setup/write-limited commands:

```sh
./spotify.js playlist init
./spotify.js playlist add <track_id_or_uri> [more...]
```

Optional manual memory import. These commands create missing known-track notes and do not overwrite existing files:

```sh
./spotify.js memory sync-known recent    # last 50 recent plays
./spotify.js memory sync-known playlist  # exposed DJ playlist
./spotify.js memory sync-known saved     # saved tracks, can create many files
./spotify.js memory sync-known all       # recent + playlist + saved
```
