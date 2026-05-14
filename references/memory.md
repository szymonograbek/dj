# Spotify DJ Memory Rules

Memory lives in `MEMORY_DIR` (`memory/` by default). Treat it as persistent private memory.

## Reading notes

Prefer `memo recall <path>` over direct file reads for existing notes. It prints the note contents and updates recall metadata.

To save the body to a file for later editing, use `--save-body-to`:
```sh
memo recall <path> --save-body-to /tmp/body.md
```

## Read before writing

Before creating or updating notes:

1. Check duplicates:
   ```sh
   memo find "<artist/track/preference/session keywords>" --type <type> --limit 10
   memo query spotify_id <id> --type track --limit 10
   memo query target "<target>" --type preference --limit 10
   ```
2. Prefer updating an existing note for the same artist, track, album, preference target, or session.
3. Before choosing controlled frontmatter values, inspect existing values:
   ```sh
   memo values <field> [type]
   ```
   Required for `type`, `status`, `stance`, `target_type`, `strength`, and `tags`.
4. To update an existing note, use `patch` — never edit `.md` files directly:
   ```sh
   # update frontmatter fields (shallow merge, bumps updatedAt)
   memo patch <path> --frontmatter '{"status":"known","tags":["electronic"]}"

   # update body (multiline: dump first, edit file, patch back)
   memo recall <path> --save-body-to /tmp/body.md
   # ... edit /tmp/body.md ...
   memo patch <path> --body-file /tmp/body.md

   # both at once
   memo patch <path> --frontmatter '{"stance":"avoid"}' --body-file /tmp/body.md
   ```
   Frontmatter is validated against the note's template before writing.
5. After any create/update/delete of memory notes, run:
   ```sh
   memo validate
   ```

## Note locations

- `index.md`: links important notes. This should be the only top-level note.
- `artists/<artist-name-slug>.md`: artist-level preference/evidence.
- `tracks/<track-title>-<primary-artist>.md`: known/recommended/rejected tracks.
- `preferences/<YYYY-MM-DD>-<preference-slug>.md`: reusable tastes, moods, fatigue, heuristics.
- `sessions/<YYYY-MM-DD>-<slug>.md`: one-off interaction context.

Use portable human slugs for filenames. Keep provider IDs (`spotify_id`, Tidal IDs, MusicBrainz IDs, ISRCs) in frontmatter/body, not as primary filenames.

## Frontmatter basics

- Every memory note except `.gitkeep` needs simple YAML frontmatter.
- Track and artist notes should include `sources`.
- For agent-made recommendations, include `recommendation`; add `user-feedback` or `explicit-preference` when applicable.
- Spotify sync sources are `recently-played`, `saved-tracks`, and `dj-playlist`.
- `saved-tracks` means Spotify Liked/Saved Songs. `dj-playlist` only means the DJ playlist.
- Use `status` only for compact lifecycle values already present in memory, such as `known`, `recommended`, or `rejected`.
- Do not encode recommendation reasons in `status`; use `tags` or the note body.

## Links

Express connections as wikilinks in the body, using the note path without `.md`:

```md
Related: [[artists/beach-house]], [[tracks/space-song-beach-house]], [[preferences/2026-05-14-dream-pop]]
```

Do not duplicate links into `related_*` frontmatter fields. Use `memo links [note]` to traverse the graph.

If a recommended/known track references an artist and the artist note is missing, create the artist note with known stance/evidence instead of leaving the artist only embedded in track/session notes.

## Tags

Tags describe the note target itself, not the request/session context.

- Good track tags: `electronic`, `big-beat`, `distorted`.
- Use mood/fit tags such as `jumpy` only when the user or evidence says the track actually fits that mood.
- If feedback says a track was *not* jumpy, do not tag the track `jumpy`; write the mismatch in the body or a preference note.
- `feedback` is usually a session/body concept; avoid using it as a track tag unless existing memory clearly uses it that way.

## Feedback routing

| User signal | Save as |
| --- | --- |
| “I like this track”, “this is great” | Track note (`stance: likes`, `sources: [user-feedback]`) + session mention |
| “Not this”, “skip”, “too mellow” about one track | Track note/session context |
| “I know this already” | Track or artist note with known status |
| “More like this sound/vibe/genre” | Track/artist note + preference note |
| “Tired of X”, “less indie”, “I don't like falsetto” | Dated preference note |
| “I'm into screamy voices lately”, “more clubby” | Dated preference note |

When in doubt: if feedback names a specific track and does not contain a broader generalization, store it as a track note update, not a preference.

## Preference notes

Create a new dated preference note only when the user makes an explicit, reusable taste statement that should influence future recommendations across many tracks/artists.

Do create one for:
- durable or time-sensitive genre/mood/voice/production tastes
- artist fatigue
- explicit recommendation heuristics

Do not create one for:
- positive/negative reactions to one specific track
- ambiguous one-off skips/comments
- inferred vocal/production dislikes from a single track unless the user generalizes

Meanings:
- `stance`: `likes`, `avoid`, `curious`, `neutral`, `mood-reference`.
- `strength`: `low`, `medium`, `high`.
- `target_type`: `artist`, `genre`, `track`, `album`, `voice`, `mood`, `production`, `general`.
- `decay_days`: how long this should strongly affect recommendations. Omit for durable preferences.

When recommending, check `memo latest preference --limit 20` first and prioritize recent/high-strength preferences.

See [templates.md](templates.md) for note templates.
