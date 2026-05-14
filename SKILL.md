---
name: spotify-dj
description: Operate a local, code-harness-driven Spotify DJ with persistent markdown taste memory, Spotify/Last.fm lookup, and one writable DJ playlist. Use when the user asks for music recommendations, playlist creation/playback, listening-history-aware suggestions, Spotify catalog checks, or preference/feedback tracking in this repo.
---

# Spotify DJ

## Operating rules

- Do not run every available command. Select the smallest tool set that fits the request.
- Ground recommendations in inspected evidence before proposing tracks: memory first, then Last.fm/Spotify/web as useful.
- Before running `./spotify.js`, `./lastfm.js`, or `memo`, require `SPOTIFY_DJ_HOME` and run from it:
  ```sh
  cd "$SPOTIFY_DJ_HOME"
  ```
- Treat `memory/` (`MEMORY_DIR`) as persistent private memory. Read relevant memory before recommending.
- Prefer `memo recall <path>` over direct file reads for existing notes; it records recall metadata and prints the note contents.
- Before dated notes or fields, get today's date with `date +%F`; do not guess.
- Never recommend tracks already known from memory or the exposed playlist unless the user asks.
- Spotify “Liked Songs” means only `saved-tracks` / `/me/tracks`. Playlist membership, playback, or recommendations do not mean liked/saved.
- Only mutate Spotify when explicitly requested, and only with the allowed CLI commands below.
- Save reusable user feedback to memory by default unless the user says not to.
- After adding or modifying memory notes, run `memo validate` before replying.

## Request workflows

### Recommendations / discovery

1. Read memory first:
   - `memo latest preference --limit 20`
   - `memo find "<request terms>" --limit 10` (add `--type artist|track|preference|session` when scope is known)
   - recall relevant note paths returned by memory with `memo recall <path>`.
2. Add listening signals only as needed:
   - Last.fm for taste/history/similar artists/tracks.
   - Spotify for search, metadata, current DJ playlist, and final IDs.
   - Web search for new-music discovery unless the user already named exact tracks/artists or this is only feedback/memory handling.
3. Build candidates, then check novelty before recommending:
   - `memo find "<artist> <track>" --type track --limit 10`
   - `memo query spotify_id <id> --type track --limit 10` when an ID exists
   - `./spotify.js playlist show 50` when avoiding current playlist repeats
   - `./spotify.js library find-artist "<artist>"` when avoiding known/liked artists.
4. Answer with concise reasons tied to evidence used: memory, Last.fm, Spotify metadata, web search, or user constraints.

### Playlist creation / playback

- First do the recommendation workflow.
- Add tracks only with `./spotify.js playlist add <track_id_or_uri> [...]`.
- Play only if requested, using `./spotify.js playlist play [position]` or allowed playback commands.
- If the user asks for new songs and playback, start the DJ playlist from the first newly added song unless they specify otherwise.

### Feedback / preference tracking

1. Save memory-worthy feedback before or alongside the reply.
2. Specific track/artist reaction → update/create a `tracks/` or `artists/` note.
3. General reusable taste statement → update/create a dated `preferences/` note.
4. One-off request context → use a `sessions/` note.
5. Run duplicate checks before creating notes; prefer updating an existing note for the same target.
6. Run `memo validate` after edits.

Examples:
- “I like this track” → track note with `user-feedback`; no preference note.
- “More like this sound” → track/artist note plus a reusable preference note.
- “Too mellow” about one song → track note/session context only.
- “Less indie in general” → preference note.
- “I know this already” → mark track/artist known.

## Allowed Spotify writes

Never call Spotify write APIs directly. Writes must go through the CLI, which is restricted to `SPOTIFY_DJ_PLAYLIST_ID`.

```sh
./spotify.js playlist init          # setup only; only when requested
./spotify.js playlist add <track_id_or_uri> [more_ids_or_uris...]
./spotify.js playlist clear
./spotify.js playlist play [position]
./spotify.js playback play-track <track_id_or_uri>
./spotify.js playback pause
./spotify.js playback next
./spotify.js playback previous
```

## Common commands

Memory: `memo validate`, `memo list [type]`, `memo latest [type] --limit 20 --offset 0`, `memo find "<text>" --type <type> --limit 10 --offset 0`, `memo query <field> <value> --type <type> --limit 10 --offset 0`, `memo values <field> [type]`, `memo links [note]`, `memo recall <path> [--save-body-to <file>]`, `memo patch <path> [--frontmatter '<json>'] [--body '<text>'|--body-file <file>]`.

Spotify: `search <track|artist|album> "<query>" [limit]`, `playlist show 50`, `recently-played 50`, `library find-artist "<artist>"`.

Last.fm: `recent 50`, `top-tracks 1month 50`, `top-artists 6month 50`, `similar "<artist>" 20`, `similar-track "<artist> - <track>" 20`, `tags artist|track ...`.

## References

- Detailed command catalog: [references/commands.md](references/commands.md)
- Memory schema and note-writing rules: [references/memory.md](references/memory.md)
- Note templates (YAML schemas): [templates/](templates/)
