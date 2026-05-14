# Spotify DJ Harness

Local Node.js CLI tools for Spotify playlist operations and Last.fm taste/history reads. The markdown-based music memory system lives in a separate repo and is consumed here via the [`memo`](#memo-cli) CLI, which is required.

## Components

- `spotify.js` — Spotify OAuth, search, library/playlist reads, write-limited playlist mutation, and optional memory imports.
- `lastfm.js` — read-only Last.fm profile, history, loved, top, and similar-artist queries.
- `SKILL.md` — optional agent integration entrypoint.

## Requirements

- Node.js (the CLIs are plain Node scripts; no `npm install` is needed in this repo).
- The [`memo`](#memo-cli) CLI, installed and on `PATH`. All memory note querying and maintenance now lives there; this repo only writes through `memo` or via `spotify.js memory sync-known`.

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
```

Secrets and local state are gitignored: `.env`, `.spotify-token.json`, and `memory/`.

## Memory storage

`MEMORY_DIR` defaults to `memory/`. It can point at any local path, including a synced folder:

```sh
mkdir -p "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory"
cp -a memory/. "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory/"
# set MEMORY_DIR in .env to that path
```

## memo CLI

Memory notes are markdown files with YAML frontmatter, managed by the external `memo` CLI (separate repo). It is required for this harness — install it and ensure it is on your `PATH`. Use it to query, validate, and maintain notes:

```sh
memo list --limit 20
memo query type artist --limit 20
memo find "chem bros jumpy" --limit 10
memo recall tracks/roads-portishead.md
memo validate
```

Refer to the `memo` repo for the full command reference.

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
./lastfm.js similar-track "Burial - Archangel" 20
./lastfm.js recommend artists 1month 30   # similar artists from your top artists
./lastfm.js recommend tracks 1month 30    # similar tracks from your top tracks
```

Supported periods: `overall`, `7day`, `1month`, `3month`, `6month`, `12month`.

## Spotify CLI

Spotify commands print compact JSON by default to keep agent context small. Search defaults to 5 results; pass an explicit limit when needed.

Read-only commands:

```sh
./spotify.js me
./spotify.js search track "Beach House Space Song" 5
./spotify.js search artist "Beach House" 5
./spotify.js artist releases "Beach House" 10
./spotify.js recently-played 50
./spotify.js library find-artist "Maizzle"
./spotify.js playlist show 50
```

Setup/write-limited commands:

```sh
./spotify.js playlist init
./spotify.js playlist add <track_id_or_uri> [more...]
./spotify.js playlist clear
./spotify.js playlist play [position]       # 1-based playlist position, defaults to 1
./spotify.js playback play-track <track_id_or_uri>
./spotify.js playback pause
./spotify.js playback next
./spotify.js playback previous
```

Optional manual memory import. These commands create missing known-track notes and artist notes using portable filenames such as `tracks/roads-portishead.md` and `artists/portishead.md`; existing notes are deduped by provider IDs in frontmatter and are not overwritten.
When a recommendation or import references an artist, also create `artists/<artist-name-slug>.md` if it is missing, linking the evidence from the relevant track/session notes. Use portable human slugs for artist and track filenames, and keep provider IDs such as Spotify IDs in frontmatter:

```sh
./spotify.js memory sync-known recent    # last 50 recent plays
./spotify.js memory sync-known playlist  # exposed DJ playlist
./spotify.js memory sync-known saved     # saved tracks, can create many files
./spotify.js memory sync-known all       # recent + playlist + saved
```
