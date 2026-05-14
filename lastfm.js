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

function trackArtist(track) {
  return text(track.artist?.name ? track.artist.name : track.artist);
}

function compactSimilarArtist(item, source) {
  return {
    source,
    name: item.name,
    match: item.match,
    url: item.url,
  };
}

function compactSimilarTrack(item, source) {
  return {
    source,
    name: item.name,
    artist: trackArtist(item),
    match: item.match,
    url: item.url,
  };
}

async function recommendFromTopArtists(periodValue, limitValue) {
  const period = cleanPeriod(periodValue, '1month');
  const limit = Number(cleanLimit(limitValue, '30'));
  const seedLimit = String(Math.min(10, limit));
  const top = await api({ method: 'user.getTopArtists', user: username(), period, limit: seedLimit });
  const results = [];
  for (const artist of top.topartists?.artist || []) {
    const similar = await api({ method: 'artist.getSimilar', artist: artist.name, limit: '5', autocorrect: '1' });
    for (const item of similar.similarartists?.artist || []) results.push(compactSimilarArtist(item, `top-artist:${artist.name}`));
  }
  return { basis: 'lastfm-top-artists', period, recommendations: results.slice(0, limit) };
}

async function recommendFromTopTracks(periodValue, limitValue) {
  const period = cleanPeriod(periodValue, '1month');
  const limit = Number(cleanLimit(limitValue, '30'));
  const seedLimit = String(Math.min(10, limit));
  const top = await api({ method: 'user.getTopTracks', user: username(), period, limit: seedLimit });
  const results = [];
  for (const track of top.toptracks?.track || []) {
    const artist = trackArtist(track);
    if (!artist || !track.name) continue;
    const similar = await api({ method: 'track.getSimilar', artist, track: track.name, limit: '5', autocorrect: '1' });
    for (const item of similar.similartracks?.track || []) results.push(compactSimilarTrack(item, `top-track:${artist} - ${track.name}`));
  }
  return { basis: 'lastfm-top-tracks', period, recommendations: results.slice(0, limit) };
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
  if (cmd === 'similar-track') {
    const limit = args.at(-1) && /^\d+$/.test(args.at(-1)) ? args.pop() : '20';
    const query = args.join(' ');
    const separator = query.includes(' - ') ? ' - ' : '|';
    const [artist, track] = query.split(separator).map((part) => part.trim());
    if (!artist || !track) throw new Error('Usage: ./lastfm.js similar-track "<artist> - <track>" [limit]');
    return console.log(JSON.stringify(await api({ method: 'track.getSimilar', artist, track, limit: cleanLimit(limit, '20'), autocorrect: '1' }), null, 2));
  }
  if (cmd === 'recommend') {
    const basis = args[0] || 'artists';
    const period = args[1] || '1month';
    const limit = args[2] || '30';
    if (basis === 'artists') return console.log(JSON.stringify(await recommendFromTopArtists(period, limit), null, 2));
    if (basis === 'tracks') return console.log(JSON.stringify(await recommendFromTopTracks(period, limit), null, 2));
    throw new Error('Usage: ./lastfm.js recommend <artists|tracks> [period] [limit]');
  }
  if (cmd === 'similar') {
    const artist = args.slice(0, -1).join(' ') || args.join(' ');
    const maybeLimit = args.length > 1 ? args.at(-1) : undefined;
    const limit = /^\d+$/.test(maybeLimit || '') ? maybeLimit : '20';
    const artistName = /^\d+$/.test(maybeLimit || '') ? artist : args.join(' ');
    if (!artistName) throw new Error('Usage: ./lastfm.js similar <artist_name> [limit]');
    return console.log(JSON.stringify(await api({ method: 'artist.getSimilar', artist: artistName, limit: cleanLimit(limit, '20'), autocorrect: '1' }), null, 2));
  }
  if (cmd === 'tags') {
    const subCmd = args[0];
    const minCountFlag = args.indexOf('--min-count');
    const minCount = minCountFlag !== -1 ? Number(args[minCountFlag + 1] || '2') : 2;
    const limitFlag = args.indexOf('--limit');
    const limit = limitFlag !== -1 ? Number(args[limitFlag + 1] || '10') : 10;
    const positional = args.slice(1).filter((a, i, arr) => {
      if (a === '--min-count' || a === '--limit') return false;
      if (arr[i - 1] === '--min-count' || arr[i - 1] === '--limit') return false;
      return true;
    });
    function compactTags(raw) {
      return (raw || [])
        .map((t) => ({ name: t.name, count: Number(t.count) }))
        .filter((t) => t.count >= minCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    }
    if (subCmd === 'artist') {
      const artistName = positional.join(' ');
      if (!artistName) throw new Error('Usage: ./lastfm.js tags artist <artist_name> [--limit N] [--min-count N]');
      const data = await api({ method: 'artist.getTopTags', artist: artistName, autocorrect: '1' });
      return console.log(JSON.stringify({ artist: artistName, tags: compactTags(data.toptags?.tag) }, null, 2));
    }
    if (subCmd === 'track') {
      const query = positional.join(' ');
      const separator = query.includes(' - ') ? ' - ' : '|';
      const [artistName, trackName] = query.split(separator).map((p) => p.trim());
      if (!artistName || !trackName) throw new Error('Usage: ./lastfm.js tags track "<artist> - <track>" [--limit N] [--min-count N]');
      const data = await api({ method: 'track.getTopTags', artist: artistName, track: trackName, autocorrect: '1' });
      const tags = compactTags(data.toptags?.tag);
      if (tags.length === 0) {
        const artistData = await api({ method: 'artist.getTopTags', artist: artistName, autocorrect: '1' });
        return console.log(JSON.stringify({ artist: artistName, track: trackName, tags: compactTags(artistData.toptags?.tag), fallback: 'artist-tags' }, null, 2));
      }
      return console.log(JSON.stringify({ artist: artistName, track: trackName, tags }, null, 2));
    }
    throw new Error('Usage: ./lastfm.js tags <artist|track> ...');
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
  ./lastfm.js similar <artist_name> [limit]
  ./lastfm.js similar-track "<artist> - <track>" [limit]
  ./lastfm.js recommend <artists|tracks> [period] [limit]
  ./lastfm.js tags artist <artist_name> [--limit N] [--min-count N]
  ./lastfm.js tags track "<artist> - <track>" [--limit N] [--min-count N]`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
