#!/usr/bin/env bun
const { existsSync, readFileSync } = require('node:fs');

const ENV_PATH = '.env';
const API = 'https://ws.audioscrobbler.com/2.0/';
const PERIODS = new Set(['overall', '7day', '1month', '3month', '6month', '12month']);

function readEnv() {
  const env = { ...process.env };
  if (!existsSync(ENV_PATH)) return env;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
  return env;
}

function requireEnv(name) {
  const value = readEnv()[name];
  if (!value) throw new Error(`Missing ${name}. See .env.example.`);
  return value;
}

function username() {
  return readEnv().LASTFM_USERNAME || readEnv().LASTFM_USER || requireEnv('LASTFM_USERNAME');
}

function cleanLimit(value, fallback = '20') {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error('Limit must be an integer from 1 to 1000');
  return String(n);
}

function cleanPeriod(value, fallback = 'overall') {
  const period = value || fallback;
  if (!PERIODS.has(period)) throw new Error('Period must be one of: overall, 7day, 1month, 3month, 6month, 12month');
  return period;
}

async function api(params) {
  const search = new URLSearchParams({ api_key: requireEnv('LASTFM_API_KEY'), format: 'json', ...params });
  const res = await fetch(`${API}?${search.toString()}`);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(JSON.stringify(json));
  return json;
}

function text(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value['#text'] === 'string') return value['#text'];
  return '';
}

function trackKey(track) {
  const artist = text(track.artist?.name ? track.artist.name : track.artist);
  return `${artist} ${track.name || ''}`.toLowerCase();
}

async function findTrack(query) {
  const needle = query.toLowerCase();
  const checks = [];
  checks.push(['recent', (await api({ method: 'user.getRecentTracks', user: username(), limit: '200' })).recenttracks?.track || []]);
  for (const period of ['7day', '1month', '3month', '6month', '12month', 'overall']) {
    checks.push([`top-tracks-${period}`, (await api({ method: 'user.getTopTracks', user: username(), period, limit: '200' })).toptracks?.track || []]);
  }
  checks.push(['loved', (await api({ method: 'user.getLovedTracks', user: username(), limit: '200' })).lovedtracks?.track || []]);

  const matches = [];
  for (const [source, tracks] of checks) {
    for (const track of tracks) {
      if (trackKey(track).includes(needle)) matches.push({ source, track });
    }
  }
  return { query, found: matches.length > 0, matches };
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'profile') return console.log(JSON.stringify(await api({ method: 'user.getInfo', user: username() }), null, 2));
  if (cmd === 'recent') return console.log(JSON.stringify(await api({ method: 'user.getRecentTracks', user: username(), limit: cleanLimit(args[0], '50') }), null, 2));
  if (cmd === 'loved') return console.log(JSON.stringify(await api({ method: 'user.getLovedTracks', user: username(), limit: cleanLimit(args[0], '50') }), null, 2));
  if (cmd === 'top-tracks') return console.log(JSON.stringify(await api({ method: 'user.getTopTracks', user: username(), period: cleanPeriod(args[0]), limit: cleanLimit(args[1], '50') }), null, 2));
  if (cmd === 'top-artists') return console.log(JSON.stringify(await api({ method: 'user.getTopArtists', user: username(), period: cleanPeriod(args[0]), limit: cleanLimit(args[1], '50') }), null, 2));
  if (cmd === 'top-albums') return console.log(JSON.stringify(await api({ method: 'user.getTopAlbums', user: username(), period: cleanPeriod(args[0]), limit: cleanLimit(args[1], '50') }), null, 2));
  if (cmd === 'find-track') {
    const query = args.join(' ');
    if (!query) throw new Error('Usage: ./lastfm.js find-track <artist_or_track_query>');
    return console.log(JSON.stringify(await findTrack(query), null, 2));
  }
  if (cmd === 'artist') {
    const artist = args.join(' ');
    if (!artist) throw new Error('Usage: ./lastfm.js artist <artist_name>');
    return console.log(JSON.stringify(await api({ method: 'artist.getInfo', artist, username: username(), autocorrect: '1' }), null, 2));
  }
  if (cmd === 'similar') {
    const artist = args.slice(0, -1).join(' ') || args.join(' ');
    const maybeLimit = args.length > 1 ? args.at(-1) : undefined;
    const limit = /^\d+$/.test(maybeLimit || '') ? maybeLimit : '20';
    const artistName = /^\d+$/.test(maybeLimit || '') ? artist : args.join(' ');
    if (!artistName) throw new Error('Usage: ./lastfm.js similar <artist_name> [limit]');
    return console.log(JSON.stringify(await api({ method: 'artist.getSimilar', artist: artistName, limit: cleanLimit(limit, '20'), autocorrect: '1' }), null, 2));
  }
  throw new Error(`Usage:
  ./lastfm.js profile
  ./lastfm.js recent [limit]
  ./lastfm.js loved [limit]
  ./lastfm.js top-tracks [overall|7day|1month|3month|6month|12month] [limit]
  ./lastfm.js top-artists [overall|7day|1month|3month|6month|12month] [limit]
  ./lastfm.js top-albums [overall|7day|1month|3month|6month|12month] [limit]
  ./lastfm.js find-track <artist_or_track_query>
  ./lastfm.js artist <artist_name>
  ./lastfm.js similar <artist_name> [limit]`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
