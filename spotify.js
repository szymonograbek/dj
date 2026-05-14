#!/usr/bin/env node
const http = require('node:http');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const { URL, URLSearchParams } = require('node:url');
const { join } = require('node:path');
const { backupMemory, memoryDir } = require('./memory-config');

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
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function login() {
  const client_id = requireEnv('SPOTIFY_CLIENT_ID');
  const redirect_uri = readEnv().SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));
  const scopes = ['playlist-modify-private', 'playlist-read-private', 'user-read-recently-played', 'user-library-read', 'user-top-read'];
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
      release_date: album.release_date,
      total_tracks: album.total_tracks,
      artists: album.artists.map((item) => item.name),
      url: album.external_urls.spotify,
    });
  }
  releases.sort((left, right) => right.release_date.localeCompare(left.release_date));
  return { query, found: true, artist: { name: artist.name, id: artist.id, url: artist.external_urls.spotify }, releases: releases.slice(0, Number.parseInt(limit, 10) || 10) };
}

async function findArtistInLibrary(query) {
  const matches = [];
  const recent = await api('GET', '/me/player/recently-played?limit=50');
  for (const item of recent.items || []) {
    if (item.track && artistMatches(item.track.artists || [], query)) matches.push({ source: 'recently-played', track: item.track.name, artists: item.track.artists.map((artist) => artist.name), id: item.track.id });
  }

  const topArtists = await api('GET', '/me/top/artists?limit=50&time_range=long_term');
  for (const artist of topArtists.items || []) {
    if (artist.name.toLowerCase().includes(query.toLowerCase())) matches.push({ source: 'top-artists-long-term', artist: artist.name, id: artist.id });
  }

  for (const item of await savedTracks()) {
    const track = item.track;
    if (artistMatches(track.artists || [], query)) matches.push({ source: item.source, track: track.name, artists: track.artists.map((artist) => artist.name), id: track.id });
  }

  for (const item of await djPlaylistTracks()) {
    const track = item.track;
    if (artistMatches(track.artists || [], query)) matches.push({ source: item.source, track: track.name, artists: track.artists.map((artist) => artist.name), id: track.id });
  }

  return { query, found: matches.length > 0, matches };
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
  const byId = new Map();
  for (const item of groups) {
    if (!item.track.id) continue;
    const existing = byId.get(item.track.id) || { track: item.track, sources: new Set() };
    existing.sources.add(item.source);
    byId.set(item.track.id, existing);
  }

  const created = [];
  const skipped = [];
  for (const [id, item] of byId.entries()) {
    const path = join(root, 'tracks', `${id}.md`);
    if (existsSync(path)) {
      skipped.push(path);
      continue;
    }
    writeFileSync(path, trackNote(item.track, item.sources));
    created.push(path);
  }
  const backup = created.length === 0 ? { backedUp: false, reason: 'no changes' } : backupMemory('Spotify memory sync backup');
  return { scope, created, skipped, backup };
}

async function main() {
  const [group, cmd, ...args] = process.argv.slice(2);
  if (group === 'auth' && cmd === 'login') return login();
  if (group === 'me') return console.log(JSON.stringify(await api('GET', '/me'), null, 2));
  if (group === 'recently-played') return console.log(JSON.stringify(await api('GET', `/me/player/recently-played?limit=${encodeURIComponent(cmd || '20')}`), null, 2));
  if (group === 'search') {
    const type = cmd;
    const [query, limit = '10'] = args;
    if (!['track', 'artist', 'album'].includes(type) || !query) throw new Error('Usage: ./spotify.js search <track|artist|album> <query> [limit]');
    return console.log(JSON.stringify(await api('GET', `/search?type=${type}&q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}`), null, 2));
  }
  if (group === 'artist' && cmd === 'releases') {
    const limit = args.at(-1) && /^\d+$/.test(args.at(-1)) ? args.pop() : '10';
    const query = args.join(' ');
    if (!query) throw new Error('Usage: ./spotify.js artist releases <artist_name> [limit]');
    return console.log(JSON.stringify(await artistReleases(query, limit), null, 2));
  }
  if (group === 'library' && cmd === 'find-artist') {
    const query = args.join(' ');
    if (!query) throw new Error('Usage: ./spotify.js library find-artist <artist_name>');
    return console.log(JSON.stringify(await findArtistInLibrary(query), null, 2));
  }
  if (group === 'memory' && cmd === 'sync-known') {
    return console.log(JSON.stringify(await syncKnownTracks(args[0] || 'recent'), null, 2));
  }
  if (group === 'playlist' && cmd === 'show') {
    const id = requireEnv('SPOTIFY_DJ_PLAYLIST_ID');
    return console.log(JSON.stringify(await api('GET', `/playlists/${encodeURIComponent(id)}?fields=id,name,external_urls,tracks.items(track(id,name,artists(name,id),uri))`), null, 2));
  }
  if (group === 'playlist' && cmd === 'init') {
    const name = readEnv().SPOTIFY_DJ_PLAYLIST_NAME || 'Personal DJ';
    const me = await api('GET', '/me');
    const created = await api('POST', `/users/${encodeURIComponent(me.id)}/playlists`, { name, public: false, description: '' });
    upsertEnv('SPOTIFY_DJ_PLAYLIST_ID', created.id);
    return console.log(JSON.stringify({ id: created.id, name: created.name, url: created.external_urls.spotify }, null, 2));
  }
  if (group === 'playlist' && cmd === 'add') {
    if (args.length === 0) throw new Error('Usage: ./spotify.js playlist add <track_id_or_uri> [more...]');
    const id = requireEnv('SPOTIFY_DJ_PLAYLIST_ID');
    return console.log(JSON.stringify(await api('POST', `/playlists/${encodeURIComponent(id)}/items`, { uris: args.map(trackUri) }), null, 2));
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
  ./spotify.js playlist show
  ./spotify.js playlist add <track_id_or_uri> [more...]`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
