#!/usr/bin/env node
const http = require('node:http');
const { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const { URL, URLSearchParams } = require('node:url');
const { join, resolve } = require('node:path');

function memoryDir() {
  return resolve(readEnv().MEMORY_DIR || 'memory');
}

const ENV_PATH = '.env';
const TOKEN_PATH = '.spotify-token.json';
const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';

function readEnv() {
  const env = { ...process.env };
  if (!existsSync(ENV_PATH)) return env;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function upsertEnv(key, value) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  const prefix = `${key}=`;
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, `${next.filter((line, i) => line || i < next.length - 1).join('\n')}\n`);
}

function requireEnv(name) {
  const value = readEnv()[name];
  if (!value) throw new Error(`Missing ${name}. See .env.example.`);
  return value;
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function tokenData() {
  if (!existsSync(TOKEN_PATH)) throw new Error('Not authenticated. Run ./spotify.js auth login');
  return JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
}

function saveToken(data) {
  writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
}

async function token() {
  const data = tokenData();
  if (Date.now() < data.expires_at - 60_000) return data.access_token;
  const client_id = requireEnv('SPOTIFY_CLIENT_ID');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token, client_id });
  const res = await fetch(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  const next = { ...data, ...json, refresh_token: json.refresh_token || data.refresh_token, expires_at: Date.now() + json.expires_in * 1000 };
  saveToken(next);
  return next.access_token;
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseText = await res.text();
  const json = responseText ? JSON.parse(responseText) : null;
  if (!res.ok) {
    const detail = responseText || res.statusText || 'empty response body';
    throw new Error(`Spotify API ${method} ${path} failed: ${res.status} ${detail}`);
  }
  return json;
}

async function login() {
  const client_id = requireEnv('SPOTIFY_CLIENT_ID');
  const redirect_uri = readEnv().SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));
  const scopes = ['playlist-modify-private', 'playlist-read-private', 'user-read-recently-played', 'user-library-read', 'user-top-read', 'user-modify-playback-state', 'user-read-playback-state'];
  const authUrl = new URL(`${ACCOUNTS}/authorize`);
  authUrl.search = new URLSearchParams({ client_id, response_type: 'code', redirect_uri, code_challenge_method: 'S256', code_challenge: challenge, state, scope: scopes.join(' ') });
  console.error(`Open this URL:\n${authUrl.toString()}\n`);
  const callbackUrl = new URL(redirect_uri);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', redirect_uri);
      if (url.pathname !== callbackUrl.pathname) return;
      if (url.searchParams.get('state') !== state) throw new Error('State mismatch');
      const code = url.searchParams.get('code');
      if (!code) throw new Error('Missing code');
      const body = new URLSearchParams({ client_id, grant_type: 'authorization_code', code, redirect_uri, code_verifier: verifier });
      const tokenRes = await fetch(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      const json = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(JSON.stringify(json));
      saveToken({ ...json, expires_at: Date.now() + json.expires_in * 1000 });
      res.end('Spotify DJ authenticated. You can close this tab.');
      server.close();
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error.message || error));
      server.close();
    }
  });
  server.listen(Number(callbackUrl.port || 8888), callbackUrl.hostname);
}

function trackUri(value) {
  if (value.startsWith('spotify:track:')) return value;
  if (/^[A-Za-z0-9]{22}$/.test(value)) return `spotify:track:${value}`;
  throw new Error(`Not a Spotify track id/uri: ${value}`);
}

function print(data) {
  console.log(JSON.stringify(data, null, 2));
}

function cleanSpotifyLimit(value, fallback, max = 50) {
  const raw = value || fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Limit must be an integer from 1 to ${max}`);
  const limit = Number.parseInt(raw, 10);
  if (limit < 1 || limit > max) throw new Error(`Limit must be an integer from 1 to ${max}`);
  return String(limit);
}

function queryAndLimit(args, fallbackLimit) {
  if (args.length === 0) return { query: '', limit: fallbackLimit };
  const maybeLimit = args.length > 1 ? args.at(-1) : undefined;
  const parsedLimit = Number.parseInt(maybeLimit || '', 10);
  if (/^\d+$/.test(maybeLimit || '') && parsedLimit >= 1 && parsedLimit <= 50) return { query: args.slice(0, -1).join(' '), limit: maybeLimit };
  return { query: args.join(' '), limit: fallbackLimit };
}

function artistNames(artists) {
  return (artists || []).map((artist) => artist.name).filter(Boolean);
}

function artistLabel(artists) {
  return artistNames(artists).join(', ');
}

function compactTrack(track) {
  return {
    name: track.name,
    artists: artistLabel(track.artists),
    album: track.album?.name,
    release: track.album?.release_date,
    id: track.id,
    popularity: track.popularity,
  };
}

function compactArtist(artist) {
  return {
    name: artist.name,
    id: artist.id,
    genres: (artist.genres || []).slice(0, 5).join(', '),
    popularity: artist.popularity,
    followers: artist.followers?.total,
  };
}

function compactAlbum(album) {
  return {
    name: album.name,
    artists: artistLabel(album.artists),
    type: album.album_type,
    release: album.release_date,
    total_tracks: album.total_tracks,
    id: album.id,
  };
}

function compactSearch(type, query, result) {
  const key = `${type}s`;
  const items = result[key]?.items || [];
  const compact = { track: compactTrack, artist: compactArtist, album: compactAlbum }[type];
  return { query, type, total: result[key]?.total || 0, results: items.map(compact) };
}

function compactPlayedItem(item) {
  return { played_at: item.played_at, ...compactTrack(item.track) };
}

function compactMe(user) {
  return {
    id: user.id,
    display_name: user.display_name,
    country: user.country,
    product: user.product,
    followers: user.followers?.total,
  };
}

function compactPlaylist(playlist) {
  const items = (playlist.tracks?.items || []).filter((item) => item.track);
  return {
    id: playlist.id,
    name: playlist.name,
    total: playlist.tracks?.total || items.length,
    shown: items.length,
    tracks: items.map((item, index) => ({ position: index + 1, ...compactTrack(item.track) })),
  };
}

function compactSyncResult(result) {
  return {
    scope: result.scope,
    created_count: result.created.length,
    skipped_count: result.skipped.length,
    created_sample: result.created.slice(0, 20),
    backup: result.backup,
  };
}

function mergeLibraryMatches(matches) {
  const byKey = new Map();
  for (const match of matches) {
    const key = `${match.album ? 'track' : 'artist'}:${match.id || match.name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.source = `${existing.source}, ${match.source}`;
    } else {
      byKey.set(key, { ...match });
    }
  }
  return Array.from(byKey.values());
}

function artistMatches(artists, query) {
  const needle = query.toLowerCase();
  return artists.some((artist) => artist.name.toLowerCase().includes(needle));
}

async function paged(path, itemLimit = 1000) {
  const items = [];
  let next = path;
  while (next && items.length < itemLimit) {
    const page = await api('GET', next.startsWith(API) ? next.slice(API.length) : next);
    items.push(...(page.items || []));
    next = page.next;
  }
  return items.slice(0, itemLimit);
}

async function recentTracks() {
  const recent = await api('GET', '/me/player/recently-played?limit=50');
  return (recent.items || []).map((item) => ({ track: item.track, source: 'recently-played' })).filter((item) => item.track);
}

async function djPlaylistTracks() {
  const env = readEnv();
  if (!env.SPOTIFY_DJ_PLAYLIST_ID) return [];
  const playlist = await paged(`/playlists/${encodeURIComponent(env.SPOTIFY_DJ_PLAYLIST_ID)}/tracks?limit=50`, 1000);
  return playlist.map((item) => ({ track: item.track, source: 'dj-playlist' })).filter((item) => item.track);
}

async function clearDjPlaylist() {
  const id = requireEnv('SPOTIFY_DJ_PLAYLIST_ID');
  return api('PUT', `/playlists/${encodeURIComponent(id)}/tracks`, { uris: [] });
}

function parseOneBasedPosition(value) {
  const position = Number.parseInt(value || '1', 10);
  if (!Number.isInteger(position) || position < 1) throw new Error('Position must be a positive number');
  return position - 1;
}

async function playDjPlaylist(positionValue) {
  const id = requireEnv('SPOTIFY_DJ_PLAYLIST_ID');
  return api('PUT', '/me/player/play', { context_uri: `spotify:playlist:${id}`, offset: { position: parseOneBasedPosition(positionValue) } });
}

async function playTrack(value) {
  return api('PUT', '/me/player/play', { uris: [trackUri(value)] });
}

async function savedTracks() {
  const saved = await paged('/me/tracks?limit=50', 5000);
  return saved.map((item) => ({ track: item.track, source: 'saved-tracks' })).filter((item) => item.track);
}

async function searchArtists(query, limit = '1') {
  const result = await api('GET', `/search?type=artist&q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`);
  return result.artists?.items || [];
}


async function artistReleases(query, limit = '10') {
  const artists = await searchArtists(query, '1');
  const artist = artists[0];
  if (!artist) return { query, found: false, releases: [] };
  const albums = await api('GET', `/artists/${encodeURIComponent(artist.id)}/albums?include_groups=album,single&market=from_token&limit=50`);
  const seen = new Set();
  const releases = [];
  for (const album of albums.items || []) {
    const key = `${album.name.toLowerCase()}|${album.release_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    releases.push({
      name: album.name,
      id: album.id,
      type: album.album_type,
      release: album.release_date,
      total_tracks: album.total_tracks,
      artists: artistLabel(album.artists),
    });
  }
  releases.sort((left, right) => (right.release || '').localeCompare(left.release || ''));
  return { query, found: true, artist: { name: artist.name, id: artist.id }, releases: releases.slice(0, Number.parseInt(cleanSpotifyLimit(limit, '10'), 10)) };
}

async function findArtistInLibrary(query) {
  const matches = [];
  const recent = await api('GET', '/me/player/recently-played?limit=50');
  for (const item of recent.items || []) {
    if (item.track && artistMatches(item.track.artists || [], query)) matches.push({ source: 'recently-played', ...compactTrack(item.track) });
  }

  const topArtists = await api('GET', '/me/top/artists?limit=50&time_range=long_term');
  for (const artist of topArtists.items || []) {
    if (artist.name.toLowerCase().includes(query.toLowerCase())) matches.push({ source: 'top-artists-long-term', ...compactArtist(artist) });
  }

  for (const item of await savedTracks()) {
    const track = item.track;
    if (artistMatches(track.artists || [], query)) matches.push({ source: item.source, ...compactTrack(track) });
  }

  for (const item of await djPlaylistTracks()) {
    const track = item.track;
    if (artistMatches(track.artists || [], query)) matches.push({ source: item.source, ...compactTrack(track) });
  }

  const merged = mergeLibraryMatches(matches);
  return { query, found: merged.length > 0, total_matches: merged.length, matches: merged.slice(0, 50) };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugPart(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function portableTrackSlug(track) {
  const primaryArtist = track.artists[0]?.name || 'unknown-artist';
  return `${slugPart(track.name)}-${slugPart(primaryArtist)}`;
}

function portableArtistSlug(artist) {
  return slugPart(artist.name);
}

function uniquePath(dir, basename) {
  let path = join(dir, `${basename}.md`);
  let suffix = 2;
  while (existsSync(path)) {
    path = join(dir, `${basename}-${suffix}.md`);
    suffix += 1;
  }
  return path;
}

function parseSpotifyId(text) {
  const match = text.match(/^spotify_id:\s*(\S+)\s*$/m);
  return match ? match[1] : '';
}

function existingSpotifyIds(dir) {
  if (!existsSync(dir)) return new Map();
  const ids = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const path = join(dir, name);
    const id = parseSpotifyId(readFileSync(path, 'utf8'));
    if (id) ids.set(id, path);
  }
  return ids;
}

function artistNote(artist, source) {
  return `---
type: artist
name: ${artist.name}
spotify_id: ${artist.id || ''}
stance: known
tags: []
updated: ${today()}
---

# Artist: ${artist.name}

Spotify artist id: ${artist.id || ''}
User stance: known
Evidence:
- ${today()}: Referenced by imported Spotify track from ${source}.
`;
}

function trackNote(track, sources) {
  const artists = track.artists.map((artist) => artist.name);
  return `---
type: track
name: ${track.name}
artists: [${artists.join(', ')}]
spotify_id: ${track.id}
status: known
tags: []
sources: [${Array.from(sources).join(', ')}]
updated: ${today()}
---

# Track: ${track.name} — ${artists.join(', ')}

Spotify track id: ${track.id}
Known because: ${Array.from(sources).join(', ')}
Status: known
Notes:
- ${today()}: Imported from Spotify ${Array.from(sources).join(', ')}.
`;
}

async function syncKnownTracks(scope) {
  const allowed = ['recent', 'playlist', 'saved', 'all'];
  if (!allowed.includes(scope)) throw new Error('Usage: ./spotify.js memory sync-known <recent|playlist|saved|all>');
  const groups = [];
  if (scope === 'recent' || scope === 'all') groups.push(...await recentTracks());
  if (scope === 'playlist' || scope === 'all') groups.push(...await djPlaylistTracks());
  if (scope === 'saved' || scope === 'all') groups.push(...await savedTracks());

  const root = memoryDir();
  mkdirSync(join(root, 'tracks'), { recursive: true });
  mkdirSync(join(root, 'artists'), { recursive: true });
  const byId = new Map();
  for (const item of groups) {
    if (!item.track.id) continue;
    const existing = byId.get(item.track.id) || { track: item.track, sources: new Set() };
    existing.sources.add(item.source);
    byId.set(item.track.id, existing);
  }

  const created = [];
  const skipped = [];
  const trackIds = existingSpotifyIds(join(root, 'tracks'));
  const artistIds = existingSpotifyIds(join(root, 'artists'));
  for (const [id, item] of byId.entries()) {
    const existing = trackIds.get(id);
    if (existing) {
      skipped.push(existing);
    } else {
      const path = uniquePath(join(root, 'tracks'), portableTrackSlug(item.track));
      writeFileSync(path, trackNote(item.track, item.sources));
      trackIds.set(id, path);
      created.push(path);
    }

    for (const artist of item.track.artists || []) {
      if (!artist.id || artistIds.has(artist.id)) continue;
      const path = uniquePath(join(root, 'artists'), portableArtistSlug(artist));
      writeFileSync(path, artistNote(artist, Array.from(item.sources).join(', ')));
      artistIds.set(artist.id, path);
      created.push(path);
    }
  }
  return { scope, created, skipped };
}

async function main() {
  const [group, cmd, ...args] = process.argv.slice(2);
  if (group === 'auth' && cmd === 'login') return login();
  if (group === 'me') return print(compactMe(await api('GET', '/me')));
  if (group === 'recently-played') {
    const result = await api('GET', `/me/player/recently-played?limit=${encodeURIComponent(cleanSpotifyLimit(cmd, '20'))}`);
    return print({ total: result.items?.length || 0, tracks: (result.items || []).filter((item) => item.track).map(compactPlayedItem) });
  }
  if (group === 'search') {
    const type = cmd;
    const { query, limit } = queryAndLimit(args, '5');
    if (!['track', 'artist', 'album'].includes(type) || !query) throw new Error('Usage: ./spotify.js search <track|artist|album> <query> [limit]');
    const result = await api('GET', `/search?type=${type}&q=${encodeURIComponent(query)}&limit=${encodeURIComponent(cleanSpotifyLimit(limit, '5'))}`);
    return print(compactSearch(type, query, result));
  }
  if (group === 'artist' && cmd === 'releases') {
    const limit = args.at(-1) && /^\d+$/.test(args.at(-1)) ? args.pop() : '10';
    const query = args.join(' ');
    if (!query) throw new Error('Usage: ./spotify.js artist releases <artist_name> [limit]');
    return print(await artistReleases(query, limit));
  }
  if (group === 'library' && cmd === 'find-artist') {
    const query = args.join(' ');
    if (!query) throw new Error('Usage: ./spotify.js library find-artist <artist_name>');
    return print(await findArtistInLibrary(query));
  }
  if (group === 'memory' && cmd === 'sync-known') {
    return print(compactSyncResult(await syncKnownTracks(args[0] || 'recent')));
  }
  if (group === 'playlist' && cmd === 'show') {
    const id = requireEnv('SPOTIFY_DJ_PLAYLIST_ID');
    const limit = cleanSpotifyLimit(args[0], '50', 100);
    const playlist = await api('GET', `/playlists/${encodeURIComponent(id)}?fields=id,name`);
    const tracks = await api('GET', `/playlists/${encodeURIComponent(id)}/tracks?fields=total,items(track(id,name,artists(name,id),album(name,release_date),popularity))&limit=${encodeURIComponent(limit)}`);
    return print(compactPlaylist({ ...playlist, tracks }));
  }
  if (group === 'playlist' && cmd === 'init') {
    const name = readEnv().SPOTIFY_DJ_PLAYLIST_NAME || 'Personal DJ';
    const me = await api('GET', '/me');
    const created = await api('POST', `/users/${encodeURIComponent(me.id)}/playlists`, { name, public: false, description: '' });
    upsertEnv('SPOTIFY_DJ_PLAYLIST_ID', created.id);
    return print({ id: created.id, name: created.name, url: created.external_urls.spotify });
  }
  if (group === 'playlist' && cmd === 'add') {
    if (args.length === 0) throw new Error('Usage: ./spotify.js playlist add <track_id_or_uri> [more...]');
    const id = requireEnv('SPOTIFY_DJ_PLAYLIST_ID');
    return print(await api('POST', `/playlists/${encodeURIComponent(id)}/items`, { uris: args.map(trackUri) }));
  }
  if (group === 'playlist' && cmd === 'clear') {
    await clearDjPlaylist();
    return print({ ok: true, action: 'playlist clear' });
  }
  if (group === 'playlist' && cmd === 'play') {
    await playDjPlaylist(args[0] || '1');
    return print({ ok: true, action: 'playlist play', position: Number.parseInt(args[0] || '1', 10) });
  }
  if (group === 'playback' && cmd === 'play-track') {
    if (!args[0]) throw new Error('Usage: ./spotify.js playback play-track <track_id_or_uri>');
    await playTrack(args[0]);
    return print({ ok: true, action: 'playback play-track', uri: trackUri(args[0]) });
  }
  if (group === 'playback' && cmd === 'pause') {
    await api('PUT', '/me/player/pause');
    return print({ ok: true, action: 'playback pause' });
  }
  if (group === 'playback' && cmd === 'next') {
    await api('POST', '/me/player/next');
    return print({ ok: true, action: 'playback next' });
  }
  if (group === 'playback' && cmd === 'previous') {
    await api('POST', '/me/player/previous');
    return print({ ok: true, action: 'playback previous' });
  }
  throw new Error(`Usage:
  ./spotify.js auth login
  ./spotify.js me
  ./spotify.js search <track|artist|album> <query> [limit]
  ./spotify.js artist releases <artist_name> [limit]
  ./spotify.js recently-played [limit]
  ./spotify.js library find-artist <artist_name>
  ./spotify.js memory sync-known <recent|playlist|saved|all>
  ./spotify.js playlist init
  ./spotify.js playlist show [limit]
  ./spotify.js playlist add <track_id_or_uri> [more...]
  ./spotify.js playlist clear
  ./spotify.js playlist play [position]
  ./spotify.js playback play-track <track_id_or_uri>
  ./spotify.js playback pause
  ./spotify.js playback next
  ./spotify.js playback previous`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
