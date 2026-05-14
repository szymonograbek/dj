# Spotify DJ Harness

Local agent skill + CLI for a Spotify/Last.fm-connected DJ with private markdown memory.

## Setup

Get a Spotify Client ID:

1. Open <https://developer.spotify.com/dashboard>.
2. Log in and click **Create app**.
3. Use any app name/description, e.g. `Local Spotify DJ`.
4. Add this Redirect URI exactly:

```text
http://127.0.0.1:8888/callback
```

5. Save the app, then copy **Client ID** from the app settings.

Then configure and authenticate:

```sh
cp .env.example .env
# paste the Client ID into SPOTIFY_CLIENT_ID in .env
./spotify.js auth login
./spotify.js playlist init
```

Optional Last.fm setup for listening-history/taste reads:

1. Create an API account at <https://www.last.fm/api/account/create>.
2. Paste the API key and username into `.env`:

```env
LASTFM_API_KEY=...
LASTFM_USERNAME=...
```

## Agent usage

Install the skill globally by symlinking this repo into the agent skills directory, and point `SPOTIFY_DJ_HOME` at the harness repo:

```sh
mkdir -p ~/.agents/skills
ln -sfn "$(pwd)" ~/.agents/skills/spotify-dj
export SPOTIFY_DJ_HOME="$(pwd)"
```

Persist `SPOTIFY_DJ_HOME` in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.). The symlink keeps the canonical source in this repo so `SKILL.md`, scripts, and references stay syncable with GitHub. Agents use `SPOTIFY_DJ_HOME` as the script working directory.

The agent keeps private zettelkasten notes in `MEMORY_DIR` (`memory/` by default) and only mutates Spotify through:

```sh
./spotify.js playlist add <track_id_or_uri> [more...]
```

## Private memory location and backup

Memory is configured with `.env`:

```env
MEMORY_DIR=memory
# Example iCloud path:
# MEMORY_DIR=/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory
# Optional; defaults to memory-backup.bundle next to MEMORY_DIR.
MEMORY_BACKUP_BUNDLE=
```

To move memory to iCloud while keeping this repo publishable:

```sh
mkdir -p "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory"
cp -a memory/. "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory/"
# set MEMORY_DIR in .env to that iCloud path
cd "/Users/you/Library/Mobile Documents/com~apple~CloudDocs/spotify-dj-memory"
git init
git add .
git commit -m "Initial memory backup"
```

Mutating memory commands automatically commit changes when `MEMORY_DIR` is a git repo and update a single-file git bundle backup. You can also run:

```sh
./memory-backup.js
```

## Memory query CLI

Memory notes use simple YAML frontmatter so agents can query before reading full files:

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

Time-sensitive preferences should be dated notes in `memory/preferences/`, not overwrites:

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

Agents should check latest preferences first and use the real current date:

```sh
date +%F
./memory.js latest preference 20
```

Before creating/updating frontmatter, agents should check current memory values and reuse them instead of inventing synonyms:

```sh
./memory.js values type
./memory.js values status
./memory.js values stance
./memory.js values tags
```

Use `status` only for a small lifecycle/state enum already present in memory, not descriptive recommendation labels. If a value reads like `recommended-for-jumpy`, `lower-priority-for-jumpy`, or similar, put that information in `tags` or the note body instead.

Before creating a new note, agents should dedupe:

```sh
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

Read-only:

Spotify search syntax is exactly `./spotify.js search <track|artist|album> "<query>" [limit]`.

```sh
./spotify.js me
./spotify.js search track "Beach House Space Song" 5
./spotify.js search artist "Beach House" 5
./spotify.js artist releases "Beach House" 10
./spotify.js recently-played 50
./spotify.js library find-artist "Maizzle"
./spotify.js playlist show
```

Setup/write-limited:

```sh
./spotify.js playlist init
./spotify.js playlist add <track_id_or_uri>
```

Optional manual memory import. This creates missing known-track notes and never overwrites existing files:

```sh
./spotify.js memory sync-known recent    # last 50 recent plays
./spotify.js memory sync-known playlist  # exposed DJ playlist
./spotify.js memory sync-known saved     # saved tracks, can create many files
./spotify.js memory sync-known all       # recent + playlist + saved
```

Secrets and local memory are gitignored: `.env`, `.spotify-token.json`, `memory/`.
