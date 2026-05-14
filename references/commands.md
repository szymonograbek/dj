# Spotify DJ Command Reference

Run all commands from `$SPOTIFY_DJ_HOME`.

## Setup

Setup commands are not part of normal operation. Run only when the user asks. See `$SPOTIFY_DJ_HOME/README.md` for `.env`, Spotify auth, playlist init, and optional Last.fm setup.

## Memory

```sh
memo validate
memo list [type]
memo latest [type] --limit 20 --offset 0
memo find "<text>" --type <type> --limit 10 --offset 0
memo query <field> <value> --type <type> --limit 10 --offset 0
memo values <field> [type]
memo links [note]
memo recall <path>
```

Notes:
- `query`, `find`, and `latest` default to 20 results and offset 0.
- Use `--offset N` for pagination.
- Omit `--type` to search across all note types.
- Use `links <note>` for one note's incoming/outgoing wikilinks.
- Use bare `links` for the full graph, including unresolved/ambiguous links.
- `validate` checks frontmatter/templates and fails on dead wikilinks.

## Read-only Spotify

Spotify commands print compact JSON by default. Search defaults to 5 results; pass an explicit limit when needed.

```sh
./spotify.js me
./spotify.js search track "Space Song Beach House" 5
./spotify.js search artist "Beach House" 5
./spotify.js search album "Depression Cherry" 5
./spotify.js artist releases "Beach House" 10
./spotify.js playlist show 50
./spotify.js recently-played 50
./spotify.js library find-artist "Maizzle"
```

Spotify search syntax is exactly:

```sh
./spotify.js search <track|artist|album> "<query>" [limit]
```

Do not insert placeholder/group arguments like `x` or `_`.

## Read-only Last.fm

Use Last.fm for what the user actually listens to. Use Spotify for search, metadata, and playlist mutation.

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
./lastfm.js similar-track "Burial - Archangel" 20
./lastfm.js recommend artists 1month 30
./lastfm.js recommend tracks 1month 30
```

Periods: `overall`, `7day`, `1month`, `3month`, `6month`, `12month`.

Use:
- `recommend artists` for similar artists seeded from Last.fm top artists.
- `recommend tracks` for similar tracks seeded from Last.fm top tracks.
- `tags` for crowd-sourced genre/vibe/mood tags.

```sh
./lastfm.js tags artist "Burial"
./lastfm.js tags track "Beach House - Space Song"
./lastfm.js tags artist "Beach House" --limit 5 --min-count 5
```

Track tags fall back to artist tags when track tags are missing; the response sets `"fallback": "artist-tags"`. Default `--min-count 2` filters noise; raise it to tighten signal.

## Allowed Spotify writes

```sh
./spotify.js playlist init          # setup only; creates/reuses the one DJ playlist
./spotify.js playlist add <track_id_or_uri> [more_ids_or_uris...]
./spotify.js playlist clear
./spotify.js playlist play [position]       # 1-based, defaults to 1
./spotify.js playback play-track <track_id_or_uri>
./spotify.js playback pause
./spotify.js playback next
./spotify.js playback previous
```

`playlist add` always targets only `SPOTIFY_DJ_PLAYLIST_ID` from `.env`.
