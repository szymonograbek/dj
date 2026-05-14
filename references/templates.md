# Spotify DJ Memory Templates

## Artist note

```md
---
type: artist
name: Beach House
spotify_id:
stance: likes
tags: [dream-pop, indie]
updated: 2026-05-14
---

# Artist: Beach House

Spotify artist id:
User stance: likes / dislikes / curious / unknown
Evidence:
- 2026-05-14: User said they like Beach House.

Related: [[preferences/dream-pop]], [[sessions/2026-05-14-beach-house-similar]]
```

## Track note

```md
---
type: track
name: Space Song
artists: [Beach House]
spotify_id:
status: known
tags: [dream-pop]
updated: 2026-05-14
---

# Track: Space Song — Beach House

Spotify track id:
Known because: user history / playlist / recommendation / explicit preference
Status: known / recommended / rejected

Status is only lifecycle/state. Do not write descriptive labels such as `jumpy-fit`, `recommended-for-clubby`, or `lower-priority-for-jumpy` as status; put them in `tags` or `Notes`.

Tags describe the track itself, not the request/session context. If feedback says this track was not jumpy enough, do not tag it `jumpy`; write that mismatch in Notes or a preference note.

Notes:
```

## Session note

```md
---
type: session
name: Beach House similar recommendations
date: 2026-05-14
tags: [dream-pop, recommendations]
updated: 2026-05-14
---

# Session: Beach House similar recommendations

Date: 2026-05-14
Request: "I like Beach House can you propose something similar to me"
Inputs read:
Candidates considered:
Added to playlist:
Follow-up memory:
```

## Time-sensitive preference note

```md
---
type: preference
name: Tired of Clairo
target_type: artist
target: Clairo
stance: avoid
strength: medium
valid_from: 2026-05-14
decay_days: 30
tags: [artist-fatigue, indie-pop]
updated: 2026-05-14
---

# Preference: Tired of Clairo

Evidence:
- 2026-05-14: User said they are kind of tired of Clairo right now.

Recommendation effect:
- Avoid Clairo and close soundalikes while this preference is recent.
```

## Voice/timbre preference note

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

# Preference: Liking screamy voices lately

Evidence:
- 2026-05-14: User said they are liking more screamy voices lately.

Recommendation effect:
- Prefer tracks with intense, strained, screamed, or raw vocal delivery.
```
