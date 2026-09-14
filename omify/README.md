# Omify

A dark, original, Spotify-inspired music streaming web app — vanilla HTML/CSS/JS,
no build step required.

## Running it

Because the app uses `fetch`-like relative paths for audio/images, open it through
a local server rather than double-clicking the HTML file:

```bash
# from the omify/ folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, VS Code's Live Server, etc.).

## What changed from the original project

Your original project (`index.html`, `style.css`, `script.js`) was a single-page,
10-song demo player with a static track list and no routing, favorites,
playlists, search, or multiple pages. It's been rebuilt into a full
multi-page app while keeping the same stack (plain HTML/CSS/JS, Font Awesome
icons, no framework/build step) so it drops into your existing repo cleanly.

### Files created
- `data/songs.js` — the song/artist/album catalog and data model
- `assets/logo.svg` — original Omify logo (soundwave mark, not Spotify's)
- `assets/audio/demo-1.wav` … `demo-8.wav` — original, procedurally generated
  placeholder tone clips (see **Licensing** below)
- `README.md` — this file

### Files rewritten
- `index.html` — new app shell: sidebar, top bar with search, a single view
  container that the router swaps content into, persistent player bar, queue
  slide-over panel, mobile bottom navigation
- `style.css` — new design system (see Design tokens below); old Spotify-style
  pill rows and layout replaced with an original visual identity
- `script.js` — full application logic: hash router, centralized player
  engine, favorites, playlists, queue, recently played, search, and every
  page listed below

### Dependencies added
None — no npm packages, no build tooling. Font Awesome and Google Fonts are
loaded from CDN links in `index.html`, same pattern as your original project.

## Pages implemented

Home, Search, Browse, Foreign Music, Trending, New Releases, Made For You,
Favorites (Liked Songs), Recently Played, Albums, Artists, Playlists,
Album details, Artist details, Playlist details, Settings, Profile, 404 —
all client-side routed via `location.hash` (e.g. `#/album/afterglow-nova-reyes`),
so navigation never reloads the page.

## How the music data is structured

`data/songs.js` exports a flat array of track objects:

```js
{
  id, title, artist, album, albumArt, audioUrl, duration,
  genre, language, country, releaseYear, liked, playCount,
  explicit, mood
}
```

Artists and albums are *derived* automatically from the track list (grouped
by `artist` and by `album + artist`), so you never maintain them separately.

The catalog currently ships **119 tracks** across English, Korean, Japanese,
Spanish, French, Italian, German, Portuguese, Arabic, Turkish, and Mandarin
music, spanning Pop, K-Pop, J-Pop, Afrobeats, Reggaeton, Hip-Hop, Electronic,
R&B, Rock, Indie, Lo-Fi, and Classical.

### Adding more songs (scaling to 1000+)

Don't hand-write 1000 objects. Add rows to the `RAW_TRACKS` array in
`data/songs.js` — each row is a compact tuple:

```js
["Song Title", "Artist Name", "Album Name", "Language", "Genre", "Country", year, "Mood", playCount, durationSeed]
```

The `SONGS` array below it maps every row into a full track object
automatically (IDs, slugs, artist/album linking, art placeholder, etc). To
generate hundreds of rows programmatically, write a small script that reads
from a spreadsheet/CSV/API of your licensed catalog and appends rows in this
same tuple shape — the mapping step needs no changes.

## Licensing — audio and artwork (read this before shipping)

- **Audio**: every `audioUrl` currently points to one of 8 short, original,
  procedurally generated tone clips in `assets/audio/`, created for this
  project specifically so playback works during development. They are not
  real songs and aren't meant to be the final product. **Do not scrape or
  download audio from Spotify or any other streaming service** — that's
  copyright infringement regardless of intent. To ship real audio, replace
  `audioUrl` per track with a licensed source: files you own or purchased,
  a royalty-free/production-music library (Epidemic Sound, Artlist, etc.),
  public-domain recordings, or a licensed streaming API.
- **Album art**: currently placeholder images from `picsum.photos`, seeded
  per album so each one is visually consistent across the app. Swap in real,
  licensed cover art before shipping.
- **Logo**: `assets/logo.svg` is an original mark (an abstract soundwave
  forming an "o"). It intentionally does not reuse Spotify's icon, wordmark,
  or color signature.

## How favorites work

Clicking any heart icon toggles that song's ID in a `Set`, persisted to
`localStorage` under `omify.favorites`. The Liked Songs page reads directly
from that set, so it survives refreshes and needs no other syncing.

## How playlists work

Playlists are `{ id, name, description, songIds: [] }` objects stored under
`omify.playlists` in `localStorage`. You can create, rename, and delete them
from the Playlists page, and add any song to a playlist (or create a new one
on the fly) from the "⋮" menu on any track row anywhere in the app.

## How the player works

A single `<audio>` element and a small state object (`queue`, `currentIndex`,
`shuffle`, `repeat`) live at the top of `script.js` and are never recreated
on navigation — only the visible page content changes, so playback continues
uninterrupted while you browse. Play/pause, seek, volume, shuffle, repeat,
next/previous, and the queue panel all operate on that one shared instance.

## Recently played

Every time a track starts, it's pushed to the front of `omify.recentlyPlayed`
in `localStorage` (deduplicated, capped at 60 entries).

## Made For You (recommendations)

A simple client-side scoring pass: it counts genres/languages across your
liked + recently played songs, then ranks the rest of the catalog by how
often each song's genre/language matches those counts, plus a small global
popularity boost. This is intentionally simple and meant to be swapped for a
real backend-driven recommendation service later — the scoring function is
isolated in `pageMadeForYou()` in `script.js`.

## Performance notes

With ~100 songs, no special optimization was needed for smoothness. If you
scale into the thousands, the two things to add first are: (1) pagination or
virtualization on `renderTrackList()` for any list over a few hundred rows,
and (2) lazy-loading album art in batches — `loading="lazy"` is already set
on all `<img>` tags as a first pass.

## Remaining limitations

- Search, browse, and recommendations run entirely client-side against the
  in-memory catalog — fine at hundreds of songs, but a real 1000+ catalog
  with audio hosting will want a backend/API rather than a single JS file.
- Crossfade is exposed as a Settings toggle but not yet wired into the audio
  engine (it's a placeholder for now, noted as such in Settings).
- No authentication — playlists/favorites are per-browser (`localStorage`),
  not per-account. If you already have auth in a larger version of this
  project, playlists/favorites are structured so they can be moved to a
  per-user backend without changing their shape.
- Placeholder audio and album art, as described above.

## Pushing this to GitHub

I can't push to your GitHub account directly from this environment. To get
these files into your existing repo:

```bash
# from inside your existing Omify repo
cp -r /path/to/these/files/* .
git add .
git commit -m "Rebuild Omify as a multi-page app: routing, player, favorites, playlists, search"
git push
```

If you'd like me to open a pull request or commit directly, connect a GitHub
tool/connector in this chat and I can do that for you instead of you running
the commands manually.
