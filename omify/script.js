// script.js — Omify application core
// Vanilla JS, hash-based router, centralized player state (no framework,
// matching the existing project's stack). Organized into small modules
// within one file to keep the existing single-script structure.

(function () {
  "use strict";

  const SONGS = window.OMIFY_SONGS || [];
  const ARTISTS = window.OMIFY_ARTISTS || [];
  const ALBUMS = window.OMIFY_ALBUMS || [];

  const songById = new Map(SONGS.map((s) => [s.id, s]));
  const artistById = new Map(ARTISTS.map((a) => [a.id, a]));
  const albumById = new Map(ALBUMS.map((a) => [a.id, a]));

  // ---------------------------------------------------------------- storage
  const STORE_KEYS = {
    favorites: "omify.favorites",
    playlists: "omify.playlists",
    recent: "omify.recentlyPlayed",
    settings: "omify.settings",
    profile: "omify.profile",
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("Omify: failed to read", key, e);
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Omify: failed to save", key, e);
    }
  }

  const state = {
    favorites: new Set(loadJSON(STORE_KEYS.favorites, [])),
    playlists: loadJSON(STORE_KEYS.playlists, []), // [{id,name,description,songIds:[]}]
    recent: loadJSON(STORE_KEYS.recent, []), // [{songId, ts}]
    settings: loadJSON(STORE_KEYS.settings, {
      autoplay: true,
      crossfade: false,
      theme: "dark",
    }),
    profile: loadJSON(STORE_KEYS.profile, {
      username: "You",
      avatar: "assets/logo.svg",
    }),
    queue: [], // array of song ids, upcoming
    currentIndex: -1,
    shuffle: false,
    repeat: "off", // off | all | one
  };

  function persistFavorites() { saveJSON(STORE_KEYS.favorites, Array.from(state.favorites)); }
  function persistPlaylists() { saveJSON(STORE_KEYS.playlists, state.playlists); }
  function persistRecent() { saveJSON(STORE_KEYS.recent, state.recent); }
  function persistSettings() { saveJSON(STORE_KEYS.settings, state.settings); }

  // ---------------------------------------------------------------- helpers
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function fmtCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function isLiked(id) { return state.favorites.has(id); }
  function totalDuration(ids) {
    return ids.reduce((sum, id) => sum + ((songById.get(id) || {}).duration || 0), 0);
  }
  function fmtDurationLong(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} hr ${m} min`;
    return `${m} min`;
  }

  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ================================================================== PLAYER
  const audio = new Audio();
  audio.volume = 0.7;

  const el = {
    playBtn: document.getElementById("playBtn"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    repeatBtn: document.getElementById("repeatBtn"),
    seekBar: document.getElementById("seekBar"),
    volumeBar: document.getElementById("volumeBar"),
    curTime: document.getElementById("curTime"),
    durTime: document.getElementById("durTime"),
    nowArt: document.getElementById("nowArt"),
    nowTitle: document.getElementById("nowTitle"),
    nowArtist: document.getElementById("nowArtist"),
    nowLikeBtn: document.getElementById("nowLikeBtn"),
    queuePanel: document.getElementById("queuePanel"),
    queueList: document.getElementById("queueList"),
    scrim: document.getElementById("scrim"),
    sidebar: document.getElementById("sidebar"),
    view: document.getElementById("view"),
  };

  function currentSong() {
    if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) return null;
    return songById.get(state.queue[state.currentIndex]) || null;
  }

  function playQueue(ids, startIndex, sourceLabel) {
    if (!ids || !ids.length) return;
    state.queue = ids.slice();
    state.currentIndex = startIndex || 0;
    loadAndPlayCurrent();
  }

  function loadAndPlayCurrent() {
    const song = currentSong();
    if (!song) return;
    audio.src = song.audioUrl;
    audio.currentTime = 0;
    audio.play().catch((e) => {
      console.warn("Omify: playback failed", e);
      toast(`Couldn't play "${song.title}" — the audio source may be unavailable.`);
    });
    updateNowPlayingUI(song);
    recordRecentlyPlayed(song.id);
    renderQueuePanel();
    refreshVisibleTrackRows();
  }

  function updateNowPlayingUI(song) {
    el.nowArt.src = song.albumArt;
    el.nowArt.alt = song.album;
    el.nowTitle.textContent = song.title;
    el.nowArtist.textContent = song.artist;
    setPlayIcon(true);
    setLikeIcon(el.nowLikeBtn, isLiked(song.id));
    document.title = "Omify";
  }

  function setPlayIcon(isPlaying) {
    const icon = el.playBtn.querySelector("i");
    icon.className = isPlaying ? "fa-solid fa-circle-pause" : "fa-solid fa-circle-play";
  }
  function setLikeIcon(btn, liked) {
    btn.classList.toggle("liked", liked);
    const icon = btn.querySelector("i");
    icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
  }

  function togglePlay() {
    if (!currentSong()) {
      // nothing loaded yet — start from full library
      playQueue(SONGS.map((s) => s.id), 0);
      return;
    }
    if (audio.paused) {
      audio.play();
      setPlayIcon(true);
    } else {
      audio.pause();
      setPlayIcon(false);
    }
  }

  function playNext(auto) {
    if (!state.queue.length) return;
    if (state.repeat === "one" && auto) {
      audio.currentTime = 0;
      audio.play();
      return;
    }
    let next = state.currentIndex + 1;
    if (state.shuffle) {
      next = Math.floor(Math.random() * state.queue.length);
    }
    if (next >= state.queue.length) {
      if (state.repeat === "all") {
        next = 0;
      } else {
        setPlayIcon(false);
        return;
      }
    }
    state.currentIndex = next;
    loadAndPlayCurrent();
  }

  function playPrev() {
    if (!state.queue.length) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    let prev = state.currentIndex - 1;
    if (prev < 0) prev = state.repeat === "all" ? state.queue.length - 1 : 0;
    state.currentIndex = prev;
    loadAndPlayCurrent();
  }

  function addToQueue(songId) {
    state.queue.push(songId);
    if (state.currentIndex < 0) state.currentIndex = 0;
    renderQueuePanel();
    toast(`Added "${songById.get(songId).title}" to queue`);
  }
  function removeFromQueue(pos) {
    if (pos === state.currentIndex) return; // don't remove now-playing this way
    state.queue.splice(pos, 1);
    if (pos < state.currentIndex) state.currentIndex -= 1;
    renderQueuePanel();
  }
  function clearQueueKeepCurrent() {
    const cur = state.queue[state.currentIndex];
    state.queue = cur ? [cur] : [];
    state.currentIndex = cur ? 0 : -1;
    renderQueuePanel();
  }

  function recordRecentlyPlayed(songId) {
    state.recent = state.recent.filter((r) => r.songId !== songId);
    state.recent.unshift({ songId, ts: Date.now() });
    state.recent = state.recent.slice(0, 60);
    persistRecent();
  }

  function toggleFavorite(songId) {
    if (state.favorites.has(songId)) {
      state.favorites.delete(songId);
    } else {
      state.favorites.add(songId);
    }
    persistFavorites();
    const song = currentSong();
    if (song && song.id === songId) setLikeIcon(el.nowLikeBtn, isLiked(songId));
    refreshVisibleTrackRows();
  }

  function refreshVisibleTrackRows() {
    document.querySelectorAll(".track-row").forEach((row) => {
      const id = row.dataset.songId;
      if (!id) return;
      row.classList.toggle("playing", currentSong() && currentSong().id === id);
      const heart = row.querySelector(".heart-btn");
      if (heart) heart.classList.toggle("liked", isLiked(id));
    });
  }

  // ------------------------------------------------------- audio events
  audio.addEventListener("timeupdate", () => {
    if (!audio.duration || isNaN(audio.duration)) return;
    el.seekBar.value = (audio.currentTime / audio.duration) * 100;
    el.curTime.textContent = fmtTime(audio.currentTime);
    el.durTime.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener("ended", () => playNext(true));
  audio.addEventListener("error", () => {
    toast("Playback error — this track's audio source could not be loaded.");
    setPlayIcon(false);
  });
  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));

  el.seekBar.addEventListener("input", () => {
    if (audio.duration) audio.currentTime = (el.seekBar.value / 100) * audio.duration;
  });
  el.volumeBar.addEventListener("input", () => {
    audio.volume = el.volumeBar.value / 100;
    audio.muted = false;
  });
  el.playBtn.addEventListener("click", togglePlay);
  el.nextBtn.addEventListener("click", () => playNext(false));
  el.prevBtn.addEventListener("click", playPrev);
  el.shuffleBtn.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    el.shuffleBtn.classList.toggle("active", state.shuffle);
    toast(state.shuffle ? "Shuffle on" : "Shuffle off");
  });
  el.repeatBtn.addEventListener("click", () => {
    const order = ["off", "all", "one"];
    state.repeat = order[(order.indexOf(state.repeat) + 1) % order.length];
    el.repeatBtn.classList.toggle("active", state.repeat !== "off");
    const icon = el.repeatBtn.querySelector("i");
    icon.className = state.repeat === "one" ? "fa-solid fa-1" : "fa-solid fa-repeat";
    toast(`Repeat: ${state.repeat}`);
  });
  el.nowLikeBtn.addEventListener("click", () => {
    const song = currentSong();
    if (song) toggleFavorite(song.id);
  });

  // ------------------------------------------------------- queue panel UI
  document.getElementById("queueBtn").addEventListener("click", openQueue);
  document.getElementById("playerQueueBtn").addEventListener("click", openQueue);
  document.getElementById("closeQueueBtn").addEventListener("click", closeQueue);
  document.getElementById("clearQueueBtn").addEventListener("click", () => {
    clearQueueKeepCurrent();
    toast("Queue cleared");
  });
  el.scrim.addEventListener("click", () => { closeQueue(); closeSidebar(); });

  function openQueue() {
    el.queuePanel.classList.add("open");
    el.scrim.classList.add("open");
    renderQueuePanel();
  }
  function closeQueue() {
    el.queuePanel.classList.remove("open");
    el.scrim.classList.remove("open");
  }
  function renderQueuePanel() {
    const upcoming = state.queue.slice(state.currentIndex + 1);
    if (!upcoming.length) {
      el.queueList.innerHTML = `<div class="empty-state"><i class="fa-solid fa-list-ol"></i><h3>Queue is empty</h3><p>Add songs to see them here.</p></div>`;
      return;
    }
    el.queueList.innerHTML = upcoming.map((id, i) => {
      const s = songById.get(id);
      if (!s) return "";
      const pos = state.currentIndex + 1 + i;
      return `
        <div class="queue-item" data-pos="${pos}">
          <img src="${s.albumArt}" alt="" loading="lazy" />
          <div class="qmeta">
            <div class="qtitle">${escapeHtml(s.title)}</div>
            <div class="qartist">${escapeHtml(s.artist)}</div>
          </div>
          <button aria-label="Remove from queue" data-remove="${pos}"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    }).join("");
    el.queueList.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromQueue(parseInt(btn.dataset.remove, 10));
      });
    });
    el.queueList.querySelectorAll(".queue-item").forEach((item) => {
      item.addEventListener("click", () => {
        state.currentIndex = parseInt(item.dataset.pos, 10);
        loadAndPlayCurrent();
      });
    });
  }

  // ------------------------------------------------------- mobile sidebar
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  mobileMenuBtn.addEventListener("click", () => {
    el.sidebar.classList.add("open");
    el.scrim.classList.add("open");
  });
  function closeSidebar() { el.sidebar.classList.remove("open"); }

  // ================================================================== RENDER HELPERS

  function mediaCard({ art, round, title, sub, onPlay, onOpen }) {
    return `
      <div class="media-card" data-open="1">
        <div class="art-wrap ${round ? "round" : ""}">
          <img src="${art}" alt="" loading="lazy" />
          <button class="play-fab" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        </div>
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-sub">${escapeHtml(sub)}</div>
      </div>`;
  }

  function bindMediaCards(container, items, { onOpen, onPlay }) {
    const cards = container.querySelectorAll(".media-card");
    cards.forEach((card, i) => {
      const item = items[i];
      if (!item) return;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        onOpen(item);
      });
      const fab = card.querySelector(".play-fab");
      if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); onPlay(item); });
    });
  }

  function trackRow(song, index, opts) {
    opts = opts || {};
    const liked = isLiked(song.id);
    const showRank = opts.rank != null;
    return `
      <div class="track-row ${opts.rank <= 3 ? "top3" : ""}" data-song-id="${song.id}">
        ${showRank
          ? `<div class="rank-num">${opts.rank}</div>`
          : `<div class="track-index">${index + 1}</div><div class="track-index-play"><i class="fa-solid fa-play"></i></div>`}
        <img class="track-art" src="${song.albumArt}" alt="" loading="lazy" />
        <div class="track-meta">
          <div class="track-title">${escapeHtml(song.title)}</div>
          <div class="track-artist">${escapeHtml(song.artist)}</div>
        </div>
        <div class="track-album">${escapeHtml(song.album)}</div>
        <div class="track-actions">
          <button class="heart-btn ${liked ? "liked" : ""}" aria-label="Toggle like" data-heart="${song.id}">
            <i class="fa-${liked ? "solid" : "regular"} fa-heart"></i>
          </button>
          <button class="heart-btn" aria-label="More options" data-more="${song.id}">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
        <div class="track-duration">${fmtTime(song.duration)}</div>
      </div>`;
  }

  function closeAnyOpenMenu() {
    const existing = document.querySelector(".row-menu");
    if (existing) existing.remove();
  }
  document.addEventListener("click", closeAnyOpenMenu);

  function openRowMenu(anchorBtn, songId) {
    closeAnyOpenMenu();
    const song = songById.get(songId);
    if (!song) return;
    const menu = document.createElement("div");
    menu.className = "row-menu";
    menu.style.cssText = "position:absolute;z-index:55;background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px;min-width:190px;box-shadow:0 12px 30px rgba(0,0,0,0.45);";
    const rect = anchorBtn.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 210)}px`;

    const items = [
      { label: "Add to queue", action: () => addToQueue(songId) },
    ];
    state.playlists.forEach((p) => {
      items.push({
        label: `Add to “${p.name}”`,
        action: () => {
          if (!p.songIds.includes(songId)) { p.songIds.push(songId); persistPlaylists(); toast(`Added to ${p.name}`); }
          else toast(`Already in ${p.name}`);
        },
      });
    });
    items.push({ label: "New playlist…", action: () => openPlaylistModal(null, songId) });

    menu.innerHTML = items.map((it, i) => `<button class="text-btn" data-idx="${i}" style="display:block;width:100%;text-align:left;">${escapeHtml(it.label)}</button>`).join("");
    document.body.appendChild(menu);
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = e.target.closest("[data-idx]");
      if (!btn) return;
      items[parseInt(btn.dataset.idx, 10)].action();
      closeAnyOpenMenu();
    });
  }

  function renderTrackList(container, ids, opts) {
    opts = opts || {};
    if (!ids.length) {
      container.innerHTML = emptyState(opts.emptyIcon || "fa-music", opts.emptyTitle || "Nothing here yet", opts.emptyBody || "");
      return;
    }
    const songs = ids.map((id) => songById.get(id)).filter(Boolean);
    container.innerHTML = `<div class="track-list">${
      songs.map((s, i) => trackRow(s, i, opts.rank ? { rank: i + 1 } : {})).join("")
    }</div>`;
    container.querySelectorAll(".track-row").forEach((row, i) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-heart]")) return;
        playQueue(ids, i);
      });
    });
    container.querySelectorAll("[data-heart]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.heart);
      });
    });
    container.querySelectorAll("[data-more]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openRowMenu(btn, btn.dataset.more);
      });
    });
    refreshVisibleTrackRows();
  }

  function emptyState(icon, title, body, actionHtml) {
    return `
      <div class="empty-state">
        <i class="fa-solid ${icon}"></i>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body || "")}</p>
        ${actionHtml || ""}
      </div>`;
  }

  function sectionBlock(title, innerHtml, seeAllRoute) {
    return `
      <section class="section">
        <div class="section-head">
          <h2>${escapeHtml(title)}</h2>
          ${seeAllRoute ? `<a href="#/${seeAllRoute}">See all</a>` : ""}
        </div>
        ${innerHtml}
      </section>`;
  }

  function cardGridHtml(items) {
    return `<div class="card-grid">${items.map((it) => mediaCard(it)).join("")}</div>`;
  }

  // ================================================================== PAGES

  function pageHome() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const likedIds = Array.from(state.favorites);
    const recentIds = state.recent.slice(0, 6).map((r) => r.songId);
    const trending = [...SONGS].sort((a, b) => b.playCount - a.playCount).slice(0, 10);
    const newReleases = [...SONGS].sort((a, b) => b.releaseYear - a.releaseYear).slice(0, 10);
    const editorsPicks = SONGS.filter((_, i) => i % 11 === 0).slice(0, 10);
    const topArtists = ARTISTS.slice(0, 8);

    const quickItems = [
      { label: "Liked Songs", icon: "fa-heart", route: "favorites", art: "assets/logo.svg" },
      { label: "Recently Played", icon: "fa-clock-rotate-left", route: "recently-played" },
      { label: "Made For You", icon: "fa-wand-magic-sparkles", route: "made-for-you" },
      { label: "Foreign Music", icon: "fa-earth-americas", route: "foreign" },
    ];

    el.view.innerHTML = `
      <div class="view-header">
        <h1>${greeting}${state.profile.username ? ", " + escapeHtml(state.profile.username) : ""}</h1>
        <p>Here's what's playing across Omify right now.</p>
      </div>

      ${sectionBlock("Quick access", `
        <div class="quick-grid">
          ${quickItems.map((q) => `
            <a class="quick-card" href="#/${q.route}">
              <img src="${q.art || "assets/logo.svg"}" alt="" />
              <span>${q.label}</span>
            </a>`).join("")}
        </div>`)}

      ${sectionBlock("Trending now", cardGridHtml(trending.map(songToCard)), "trending")}
      ${sectionBlock("New releases", cardGridHtml(newReleases.map(songToCard)), "new-releases")}
      ${likedIds.length ? sectionBlock("Your favorite songs", cardGridHtml(likedIds.slice(0, 10).map((id) => songToCard(songById.get(id)))), "favorites") : ""}
      ${recentIds.length ? sectionBlock("Recently played", cardGridHtml(recentIds.map((id) => songToCard(songById.get(id)))), "recently-played") : ""}
      ${sectionBlock("Top international artists", `<div class="card-grid">${topArtists.map(artistToCard).join("")}</div>`, "artists")}
      ${sectionBlock("Editor's picks", cardGridHtml(editorsPicks.map(songToCard)))}
    `;

    bindSongCardGrids(el.view, [...trending, ...newReleases, ...likedIds.map((id)=>songById.get(id)), ...recentIds.map((id)=>songById.get(id)), ...editorsPicks]);
    bindArtistCards(el.view, topArtists);
  }

  function songToCard(song) {
    return {
      kind: "song",
      art: song.albumArt,
      title: song.title,
      sub: song.artist,
      id: song.id,
    };
  }
  function albumToCard(album) {
    return { kind: "album", art: album.albumArt, title: album.title, sub: album.artist, id: album.id };
  }
  function artistToCard(artist) {
    return { kind: "artist", art: artist.image, round: true, title: artist.name, sub: `${artist.songIds.length} songs`, id: artist.id };
  }

  function bindSongCardGrids(container, orderedSongs) {
    // song cards are bound generically: query all media-cards inside .card-grid blocks
    // sequentially and match against the provided song arrays per grid.
    const grids = container.querySelectorAll(".card-grid");
    grids.forEach((grid) => {
      const cards = grid.querySelectorAll(".media-card");
      cards.forEach((card) => {
        // identify by title+sub text to find the right song (grids are small, this is fine)
        const title = card.querySelector(".card-title").textContent;
        const sub = card.querySelector(".card-sub").textContent;
        const song = SONGS.find((s) => s.title === title && s.artist === sub);
        if (!song) return;
        card.addEventListener("click", (e) => {
          if (e.target.closest(".play-fab")) return;
          openSongContext(song);
        });
        const fab = card.querySelector(".play-fab");
        if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); playQueue([song.id], 0); });
      });
    });
  }

  function bindArtistCards(container, artists) {
    const cards = container.querySelectorAll(".card-grid .media-card");
    // handled together with song cards above in pageHome; for artist-only grids use this:
    cards.forEach((card) => {
      const title = card.querySelector(".card-title").textContent;
      const artist = artists.find((a) => a.name === title);
      if (!artist) return;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/artist/${artist.id}`;
      });
      const fab = card.querySelector(".play-fab");
      if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); playQueue(artist.songIds, 0); });
    });
  }

  function openSongContext(song) {
    // default click behaviour: play the song immediately in context of its album
    const album = ALBUMS.find((a) => a.title === song.album && a.artist === song.artist);
    if (album) {
      const idx = album.songIds.indexOf(song.id);
      playQueue(album.songIds, idx >= 0 ? idx : 0);
    } else {
      playQueue([song.id], 0);
    }
  }

  function pageSearch(query) {
    query = (query || "").trim().toLowerCase();
    el.view.innerHTML = `
      <div class="view-header"><h1>Search</h1></div>
      <div class="filter-row" id="searchFilters">
        ${["All", "Songs", "Artists", "Albums", "Playlists"].map((f, i) =>
          `<button class="filter-pill ${i === 0 ? "active" : ""}" data-filter="${f}">${f}</button>`
        ).join("")}
      </div>
      <div id="searchResults"></div>
    `;
    let activeFilter = "All";
    const resultsEl = document.getElementById("searchResults");

    function runSearch() {
      if (!query) {
        resultsEl.innerHTML = emptyState("fa-magnifying-glass", "Search Omify", "Find songs, artists, albums, and playlists.");
        return;
      }
      const matchSongs = SONGS.filter((s) => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query) || s.album.toLowerCase().includes(query));
      const matchArtists = ARTISTS.filter((a) => a.name.toLowerCase().includes(query));
      const matchAlbums = ALBUMS.filter((a) => a.title.toLowerCase().includes(query));
      const matchPlaylists = state.playlists.filter((p) => p.name.toLowerCase().includes(query));

      const noResults = !matchSongs.length && !matchArtists.length && !matchAlbums.length && !matchPlaylists.length;
      if (noResults) {
        resultsEl.innerHTML = emptyState("fa-face-frown", `No results found for "${query}"`, "Try a different spelling or search for an artist, song, or album.");
        return;
      }

      let html = "";
      if (activeFilter === "All" || activeFilter === "Songs") {
        if (matchSongs.length) html += sectionBlock("Songs", `<div class="track-list">${matchSongs.slice(0, 30).map((s, i) => trackRow(s, i)).join("")}</div>`);
      }
      if (activeFilter === "All" || activeFilter === "Artists") {
        if (matchArtists.length) html += sectionBlock("Artists", `<div class="card-grid">${matchArtists.map(artistToCard).join("")}</div>`);
      }
      if (activeFilter === "All" || activeFilter === "Albums") {
        if (matchAlbums.length) html += sectionBlock("Albums", `<div class="card-grid">${matchAlbums.map(albumToCard).join("")}</div>`);
      }
      if (activeFilter === "All" || activeFilter === "Playlists") {
        if (matchPlaylists.length) html += sectionBlock("Playlists", `<div class="card-grid">${matchPlaylists.map((p) => mediaCard({ art: p.art || "assets/logo.svg", title: p.name, sub: `${p.songIds.length} songs` })).join("")}</div>`);
      }
      if (!html) html = emptyState("fa-filter", `No ${activeFilter.toLowerCase()} found for "${query}"`, "Try switching filters.");
      resultsEl.innerHTML = html;

      resultsEl.querySelectorAll(".track-row").forEach((row, i) => {
        row.addEventListener("click", (e) => {
          if (e.target.closest("[data-heart]")) return;
          playQueue(matchSongs.map((s) => s.id), i);
        });
      });
      resultsEl.querySelectorAll("[data-heart]").forEach((btn) => {
        btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(btn.dataset.heart); });
      });
      resultsEl.querySelectorAll("[data-more]").forEach((btn) => {
        btn.addEventListener("click", (e) => { e.stopPropagation(); openRowMenu(btn, btn.dataset.more); });
      });
      if (matchArtists.length) bindArtistCards(resultsEl, matchArtists);
      resultsEl.querySelectorAll(".card-grid .media-card").forEach((card) => {
        const t = card.querySelector(".card-title").textContent;
        const album = matchAlbums.find((a) => a.title === t);
        if (album) card.addEventListener("click", () => { location.hash = `#/album/${album.id}`; });
        const pl = matchPlaylists.find((p) => p.name === t);
        if (pl) card.addEventListener("click", () => { location.hash = `#/playlist/${pl.id}`; });
      });
      refreshVisibleTrackRows();
    }

    document.querySelectorAll("#searchFilters .filter-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#searchFilters .filter-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.dataset.filter;
        runSearch();
      });
    });

    runSearch();
    document.getElementById("globalSearchInput").focus();
  }

  const CATEGORIES = [
    ["Pop", "#E8A33D", "#C9793A"], ["Rock", "#8E6B9E", "#5C4270"], ["Hip-Hop", "#D9704F", "#A34934"],
    ["R&B", "#C9793A", "#8E4E2A"], ["Electronic", "#4FA6C9", "#2E6B85"], ["Jazz", "#B98D3E", "#7A5A22"],
    ["Classical", "#8B8492", "#5C5563"], ["K-Pop", "#E087A6", "#A65273"], ["J-Pop", "#E8A33D", "#B96E2A"],
    ["Latin", "#D9704F", "#B04A2C"], ["Afrobeats", "#E8B23D", "#B9832A"], ["French Pop", "#8E9ECF", "#5A6A9E"],
    ["Turkish Pop", "#C97A5A", "#8E4E32"], ["Indie", "#9E8FCF", "#6A5A9E"], ["Lo-Fi", "#7A8FA0", "#4E5F6E"],
    ["Chill", "#6FA5A0", "#3E706B"], ["Workout", "#D9524F", "#A3312E"], ["Focus", "#5C8ACF", "#39609E"],
    ["Party", "#E85A9E", "#B23271"], ["Romantic", "#D96C8F", "#A34160"], ["Sad", "#6E7A9E", "#414E70"],
    ["Instrumental", "#8B8492", "#5C5563"],
  ];

  function pageBrowse() {
    el.view.innerHTML = `
      <div class="view-header"><h1>Browse</h1><p>Explore Omify by genre and mood.</p></div>
      <div class="category-grid">
        ${CATEGORIES.map(([name, a, b]) => `
          <div class="category-tile" style="--tile-a:${a};--tile-b:${b}" data-cat="${escapeHtml(name)}">${name}</div>
        `).join("")}
      </div>
    `;
    el.view.querySelectorAll(".category-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        location.hash = `#/category/${encodeURIComponent(tile.dataset.cat)}`;
      });
    });
  }

  function pageCategory(name) {
    const matches = SONGS.filter((s) => s.genre === name || s.mood === name);
    el.view.innerHTML = `
      <div class="view-header"><h1>${escapeHtml(name)}</h1><p>${matches.length} songs</p></div>
      <div id="catList"></div>
    `;
    renderTrackList(document.getElementById("catList"), matches.map((s) => s.id), {
      emptyIcon: "fa-compact-disc", emptyTitle: "No songs in this category yet",
    });
  }

  function pageForeign() {
    const byLanguage = new Map();
    SONGS.forEach((s) => {
      if (!byLanguage.has(s.language)) byLanguage.set(s.language, []);
      byLanguage.get(s.language).push(s);
    });
    const flags = {
      English: "🇺🇸", Korean: "🇰🇷", Japanese: "🇯🇵", Spanish: "🇪🇸", French: "🇫🇷",
      Italian: "🇮🇹", German: "🇩🇪", Portuguese: "🇧🇷", Arabic: "🇦🇪", Turkish: "🇹🇷", Mandarin: "🇨🇳",
    };
    el.view.innerHTML = `
      <div class="view-header"><h1>Foreign Music</h1><p>Discover songs from around the world.</p></div>
      ${Array.from(byLanguage.entries()).map(([lang, songs]) => `
        <div class="country-section">
          <div class="country-head"><span class="country-flag">${flags[lang] || "🌐"}</span><h2>${escapeHtml(lang)}</h2></div>
          <div class="card-grid">${songs.slice(0, 8).map(songToCard).join("")}</div>
        </div>
      `).join("")}
    `;
    Array.from(byLanguage.values()).forEach((songs) => bindSongCardGrids(el.view, songs));
  }

  function pageTrending() {
    const ranked = [...SONGS].sort((a, b) => b.playCount - a.playCount).slice(0, 50);
    el.view.innerHTML = `
      <div class="view-header"><h1>Trending</h1><p>The most played songs on Omify right now.</p></div>
      <div id="trendList"></div>
    `;
    renderTrackList(document.getElementById("trendList"), ranked.map((s) => s.id), { rank: true });
  }

  function pageNewReleases() {
    const sorted = [...SONGS].sort((a, b) => b.releaseYear - a.releaseYear);
    el.view.innerHTML = `
      <div class="view-header"><h1>New Releases</h1><p>Freshest additions to the Omify catalog.</p></div>
      <div id="newList"></div>
    `;
    renderTrackList(document.getElementById("newList"), sorted.map((s) => s.id));
  }

  function pageMadeForYou() {
    // simple client-side recommendation: weight by liked genres/languages, then recent plays
    const likedSongs = Array.from(state.favorites).map((id) => songById.get(id)).filter(Boolean);
    const recentSongs = state.recent.map((r) => songById.get(r.songId)).filter(Boolean);
    const signal = [...likedSongs, ...recentSongs];

    let recs;
    if (!signal.length) {
      recs = [...SONGS].sort((a, b) => b.playCount - a.playCount).slice(0, 20);
    } else {
      const genreCount = {}, langCount = {};
      signal.forEach((s) => {
        genreCount[s.genre] = (genreCount[s.genre] || 0) + 1;
        langCount[s.language] = (langCount[s.language] || 0) + 1;
      });
      const likedIds = new Set(likedSongs.map((s) => s.id));
      recs = [...SONGS]
        .filter((s) => !likedIds.has(s.id))
        .map((s) => ({ s, score: (genreCount[s.genre] || 0) * 2 + (langCount[s.language] || 0) + s.playCount / 1000000 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 24)
        .map((x) => x.s);
    }

    el.view.innerHTML = `
      <div class="view-header"><h1>Made For You</h1><p>Recommendations based on what you play and like.</p></div>
      <div id="mfyList" class="card-grid"></div>
    `;
    document.getElementById("mfyList").innerHTML = recs.map(songToCard).join("");
    bindSongCardGrids(el.view, recs);
  }

  function pageFavorites() {
    const ids = Array.from(state.favorites);
    el.view.innerHTML = `
      <div class="detail-hero">
        <div class="art-wrap" style="width:190px;height:190px;border-radius:12px;background:linear-gradient(135deg,var(--signal),var(--signal-deep));display:flex;align-items:center;justify-content:center;">
          <i class="fa-solid fa-heart" style="font-size:3.5rem;color:#1a1410;"></i>
        </div>
        <div class="detail-hero-meta">
          <span class="kicker">Playlist</span>
          <h1>Liked Songs</h1>
          <div class="sub">${ids.length} songs</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllBtn" aria-label="Play all"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="shuffleAllBtn" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
        <input type="text" id="filterLiked" placeholder="Search within liked songs" style="margin-left:auto;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:9px 16px;color:var(--text-heading);width:240px;" />
      </div>
      <div id="favList"></div>
    `;
    function render(filterQ) {
      let list = ids;
      if (filterQ) {
        const q = filterQ.toLowerCase();
        list = ids.filter((id) => {
          const s = songById.get(id);
          return s && (s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
        });
      }
      renderTrackList(document.getElementById("favList"), list, {
        emptyIcon: "fa-heart-crack", emptyTitle: "Songs you like will appear here",
        emptyBody: "Tap the heart on any song to save it.",
      });
    }
    render();
    document.getElementById("filterLiked").addEventListener("input", (e) => render(e.target.value));
    document.getElementById("playAllBtn").addEventListener("click", () => ids.length && playQueue(ids, 0));
    document.getElementById("shuffleAllBtn").addEventListener("click", () => {
      if (!ids.length) return;
      state.shuffle = true;
      el.shuffleBtn.classList.add("active");
      playQueue(ids, Math.floor(Math.random() * ids.length));
    });
  }

  function pageRecentlyPlayed() {
    const ids = state.recent.map((r) => r.songId).filter((id) => songById.has(id));
    el.view.innerHTML = `
      <div class="view-header"><h1>Recently Played</h1><p>Your listening history on this device.</p></div>
      <div id="recentList"></div>
      ${ids.length ? `<button class="text-btn danger" id="clearRecentBtn" style="margin-top:12px;">Clear history</button>` : ""}
    `;
    renderTrackList(document.getElementById("recentList"), ids, {
      emptyIcon: "fa-clock-rotate-left", emptyTitle: "Nothing played yet",
      emptyBody: "Songs you play will show up here.",
    });
    const clearBtn = document.getElementById("clearRecentBtn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      state.recent = [];
      persistRecent();
      pageRecentlyPlayed();
      toast("Recently played cleared");
    });
  }

  function pageAlbums() {
    el.view.innerHTML = `
      <div class="view-header"><h1>Albums</h1></div>
      <div class="card-grid" id="albumGrid">${ALBUMS.map(albumToCard).join("")}</div>
    `;
    document.querySelectorAll("#albumGrid .media-card").forEach((card, i) => {
      const album = ALBUMS[i];
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/album/${album.id}`;
      });
      card.querySelector(".play-fab").addEventListener("click", (e) => { e.stopPropagation(); playQueue(album.songIds, 0); });
    });
  }

  function pageArtists() {
    el.view.innerHTML = `
      <div class="view-header"><h1>Artists</h1></div>
      <div class="card-grid" id="artistGrid">${ARTISTS.map(artistToCard).join("")}</div>
    `;
    bindArtistCards(el.view, ARTISTS);
  }

  function pageAlbumDetails(id) {
    const album = albumById.get(id);
    if (!album) return pageNotFound();
    el.view.innerHTML = `
      <div class="detail-hero">
        <img src="${album.albumArt}" alt="" />
        <div class="detail-hero-meta">
          <span class="kicker">Album</span>
          <h1>${escapeHtml(album.title)}</h1>
          <div class="sub">${escapeHtml(album.artist)} · ${album.releaseYear} · ${album.songIds.length} songs · ${fmtDurationLong(totalDuration(album.songIds))}</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllBtn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="shuffleBtn2" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
      </div>
      <div id="albumTracks"></div>
    `;
    renderTrackList(document.getElementById("albumTracks"), album.songIds);
    document.getElementById("playAllBtn").addEventListener("click", () => playQueue(album.songIds, 0));
    document.getElementById("shuffleBtn2").addEventListener("click", () => {
      state.shuffle = true; el.shuffleBtn.classList.add("active");
      playQueue(album.songIds, Math.floor(Math.random() * album.songIds.length));
    });
  }

  function pageArtistDetails(id) {
    const artist = artistById.get(id);
    if (!artist) return pageNotFound();
    const related = ARTISTS.filter((a) => a.id !== id).slice(0, 6);
    const artistAlbums = ALBUMS.filter((a) => a.artist === artist.name);
    el.view.innerHTML = `
      <div class="detail-hero round">
        <img src="${artist.image}" alt="" />
        <div class="detail-hero-meta">
          <span class="kicker">Artist</span>
          <h1>${escapeHtml(artist.name)}</h1>
          <div class="sub">${artist.country} · ${artist.songIds.length} songs</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllBtn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        <button class="btn btn-ghost" id="followBtn">Follow</button>
      </div>
      ${sectionBlock("Popular", "", null)}
      <div id="artistTracks"></div>
      ${artistAlbums.length ? sectionBlock("Albums", `<div class="card-grid">${artistAlbums.map(albumToCard).join("")}</div>`) : ""}
      ${sectionBlock("Related artists", `<div class="card-grid">${related.map(artistToCard).join("")}</div>`)}
    `;
    renderTrackList(document.getElementById("artistTracks"), artist.songIds.slice(0, 10));
    document.getElementById("playAllBtn").addEventListener("click", () => playQueue(artist.songIds, 0));
    document.getElementById("followBtn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const following = btn.textContent === "Following";
      btn.textContent = following ? "Follow" : "Following";
      btn.classList.toggle("btn-primary", !following);
    });
    const albumGrid = el.view.querySelector(".card-grid + .section .card-grid, #artistTracks ~ .section .card-grid");
    el.view.querySelectorAll(".section .card-grid").forEach((grid) => {
      const cards = grid.querySelectorAll(".media-card");
      cards.forEach((card) => {
        const title = card.querySelector(".card-title").textContent;
        const al = artistAlbums.find((a) => a.title === title);
        if (al) { card.addEventListener("click", () => location.hash = `#/album/${al.id}`); }
        const ar = related.find((a) => a.name === title);
        if (ar) { card.addEventListener("click", () => location.hash = `#/artist/${ar.id}`); card.querySelector(".play-fab").addEventListener("click", (e2) => { e2.stopPropagation(); playQueue(ar.songIds, 0); }); }
      });
    });
  }

  function pagePlaylists() {
    el.view.innerHTML = `
      <div class="view-header"><h1>Playlists</h1></div>
      <div class="card-grid" id="playlistGrid">
        <div class="playlist-create-card" id="createPlaylistCard" style="grid-column: span 1;">
          <div class="plus-circle"><i class="fa-solid fa-plus"></i></div>
          <div><div class="card-title" style="margin:0;">Create playlist</div><div class="card-sub">New collection</div></div>
        </div>
      </div>
      ${!state.playlists.length ? emptyState("fa-list-ul", "No playlists yet", "Create your first playlist to start organizing songs.") : ""}
    `;
    const grid = document.getElementById("playlistGrid");
    state.playlists.forEach((p) => {
      const card = document.createElement("div");
      card.innerHTML = mediaCard({ art: p.songIds[0] ? songById.get(p.songIds[0]).albumArt : "assets/logo.svg", title: p.name, sub: `${p.songIds.length} songs` });
      const node = card.firstElementChild;
      node.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/playlist/${p.id}`;
      });
      node.querySelector(".play-fab").addEventListener("click", (e) => { e.stopPropagation(); if (p.songIds.length) playQueue(p.songIds, 0); });
      grid.appendChild(node);
    });
    document.getElementById("createPlaylistCard").addEventListener("click", () => openPlaylistModal());
  }

  function openPlaylistModal(editPlaylist, songIdToAdd) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <h3>${editPlaylist ? "Rename playlist" : "Create playlist"}</h3>
        <input type="text" id="plName" placeholder="Playlist name" value="${editPlaylist ? escapeHtml(editPlaylist.name) : ""}" />
        <textarea id="plDesc" placeholder="Description (optional)" rows="2">${editPlaylist ? escapeHtml(editPlaylist.description || "") : ""}</textarea>
        <div class="modal-actions">
          <button class="text-btn" id="plCancel">Cancel</button>
          <button class="btn btn-primary" id="plSave">${editPlaylist ? "Save" : "Create"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.getElementById("plCancel").addEventListener("click", () => backdrop.remove());
    document.getElementById("plSave").addEventListener("click", () => {
      const name = document.getElementById("plName").value.trim();
      const desc = document.getElementById("plDesc").value.trim();
      if (!name) { toast("Give your playlist a name"); return; }
      if (editPlaylist) {
        editPlaylist.name = name;
        editPlaylist.description = desc;
      } else {
        const newPlaylist = { id: "pl-" + Date.now(), name, description: desc, songIds: songIdToAdd ? [songIdToAdd] : [] };
        state.playlists.push(newPlaylist);
        if (songIdToAdd) toast(`Added to ${name}`);
      }
      persistPlaylists();
      backdrop.remove();
      router();
    });
  }

  function pagePlaylistDetails(id) {
    const playlist = state.playlists.find((p) => p.id === id);
    if (!playlist) return pageNotFound();
    el.view.innerHTML = `
      <div class="detail-hero">
        <div class="art-wrap" style="width:190px;height:190px;border-radius:12px;overflow:hidden;background:var(--surface-raised);">
          <img src="${playlist.songIds[0] ? songById.get(playlist.songIds[0]).albumArt : "assets/logo.svg"}" alt="" />
        </div>
        <div class="detail-hero-meta">
          <span class="kicker">Playlist</span>
          <h1>${escapeHtml(playlist.name)}</h1>
          <div class="sub">${escapeHtml(playlist.description || "")}</div>
          <div class="sub">${playlist.songIds.length} songs · ${fmtDurationLong(totalDuration(playlist.songIds))}</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllBtn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="shuffleBtn2" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
        <button class="text-btn" id="renameBtn">Rename</button>
        <button class="text-btn danger" id="deleteBtn">Delete</button>
      </div>
      <div id="plTracks"></div>
    `;
    function renderTracks() {
      renderTrackList(document.getElementById("plTracks"), playlist.songIds, {
        emptyIcon: "fa-music", emptyTitle: "This playlist is empty", emptyBody: "Add songs from any album or search result.",
      });
      // add remove-from-playlist affordance
      document.querySelectorAll("#plTracks .track-row").forEach((row) => {
        const removeBtn = document.createElement("button");
        removeBtn.className = "heart-btn";
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.setAttribute("aria-label", "Remove from playlist");
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          playlist.songIds = playlist.songIds.filter((sid) => sid !== row.dataset.songId);
          persistPlaylists();
          renderTracks();
        });
        row.querySelector(".track-actions").appendChild(removeBtn);
      });
    }
    renderTracks();
    document.getElementById("playAllBtn").addEventListener("click", () => playlist.songIds.length && playQueue(playlist.songIds, 0));
    document.getElementById("shuffleBtn2").addEventListener("click", () => {
      if (!playlist.songIds.length) return;
      state.shuffle = true; el.shuffleBtn.classList.add("active");
      playQueue(playlist.songIds, Math.floor(Math.random() * playlist.songIds.length));
    });
    document.getElementById("renameBtn").addEventListener("click", () => openPlaylistModal(playlist));
    document.getElementById("deleteBtn").addEventListener("click", () => {
      state.playlists = state.playlists.filter((p) => p.id !== id);
      persistPlaylists();
      toast("Playlist deleted");
      location.hash = "#/playlists";
    });
  }

  function pageSettings() {
    el.view.innerHTML = `
      <div class="view-header"><h1>Settings</h1></div>
      <div class="section">
        <h2 style="margin-bottom:14px;">Playback</h2>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <input type="checkbox" id="autoplayToggle" ${state.settings.autoplay ? "checked" : ""} /> Autoplay next song
        </label>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <input type="checkbox" id="crossfadeToggle" ${state.settings.crossfade ? "checked" : ""} /> Crossfade between songs (not yet applied to audio engine)
        </label>
      </div>
      <div class="section">
        <h2 style="margin-bottom:14px;">Library</h2>
        <button class="btn btn-ghost" id="clearRecentSettingsBtn">Clear recently played</button>
        <button class="btn btn-ghost" id="clearAllDataBtn" style="margin-left:10px;">Clear all local data</button>
      </div>
      <div class="section">
        <h2 style="margin-bottom:14px;">About</h2>
        <p>Omify v1.0.0 — an original, Spotify-inspired music experience.</p>
        <p style="font-size:0.82rem;">Demo audio clips are original procedurally generated tones used only as playback placeholders. Replace <code>audioUrl</code> in <code>data/songs.js</code> with licensed audio to ship real playback.</p>
      </div>
    `;
    document.getElementById("autoplayToggle").addEventListener("change", (e) => { state.settings.autoplay = e.target.checked; persistSettings(); });
    document.getElementById("crossfadeToggle").addEventListener("change", (e) => { state.settings.crossfade = e.target.checked; persistSettings(); });
    document.getElementById("clearRecentSettingsBtn").addEventListener("click", () => { state.recent = []; persistRecent(); toast("Recently played cleared"); });
    document.getElementById("clearAllDataBtn").addEventListener("click", () => {
      if (!confirm("This clears favorites, playlists, and history on this device. Continue?")) return;
      localStorage.clear();
      location.reload();
    });
  }

  function pageProfile() {
    const genreCount = {};
    Array.from(state.favorites).forEach((id) => {
      const s = songById.get(id);
      if (s) genreCount[s.genre] = (genreCount[s.genre] || 0) + 1;
    });
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
    el.view.innerHTML = `
      <div class="detail-hero round">
        <img src="${state.profile.avatar}" alt="" />
        <div class="detail-hero-meta">
          <span class="kicker">Profile</span>
          <h1>${escapeHtml(state.profile.username)}</h1>
          <div class="sub">${state.favorites.size} liked songs · ${state.playlists.length} playlists</div>
        </div>
      </div>
      <div class="section">
        <h2 style="margin-bottom:14px;">Favorite genres</h2>
        <div class="filter-row">${topGenres.length ? topGenres.map((g) => `<span class="filter-pill active">${escapeHtml(g)}</span>`).join("") : "<p>Like some songs to see your favorite genres here.</p>"}</div>
      </div>
      <div class="section">
        <h2 style="margin-bottom:14px;">Recently played</h2>
        <div id="profileRecent"></div>
      </div>
    `;
    renderTrackList(document.getElementById("profileRecent"), state.recent.slice(0, 5).map((r) => r.songId));
  }

  function pageNotFound() {
    el.view.innerHTML = emptyState("fa-compass", "Page not found", "The page you're looking for doesn't exist.", `<a href="#/home" class="btn btn-primary">Back to Home</a>`);
  }

  // ================================================================== ROUTER
  const routes = {
    "home": () => pageHome(),
    "search": (params, query) => pageSearch(query.get("q")),
    "browse": () => pageBrowse(),
    "category": (params) => pageCategory(decodeURIComponent(params[0] || "")),
    "foreign": () => pageForeign(),
    "trending": () => pageTrending(),
    "new-releases": () => pageNewReleases(),
    "made-for-you": () => pageMadeForYou(),
    "favorites": () => pageFavorites(),
    "recently-played": () => pageRecentlyPlayed(),
    "albums": () => pageAlbums(),
    "artists": () => pageArtists(),
    "album": (params) => pageAlbumDetails(params[0]),
    "artist": (params) => pageArtistDetails(params[0]),
    "playlists": () => pagePlaylists(),
    "playlist": (params) => pagePlaylistDetails(params[0]),
    "settings": () => pageSettings(),
    "profile": () => pageProfile(),
  };

  function router() {
    closeSidebar();
    el.scrim.classList.remove("open");
    const hash = location.hash.replace(/^#\//, "");
    const [pathPart, queryPart] = hash.split("?");
    const segments = pathPart.split("/").filter(Boolean);
    const routeName = segments[0] || "home";
    const params = segments.slice(1);
    const query = new URLSearchParams(queryPart || "");

    const handler = routes[routeName];
    el.view.scrollTop = 0;
    if (handler) {
      try {
        handler(params, query);
      } catch (e) {
        console.error("Omify route error:", e);
        pageNotFound();
      }
    } else {
      pageNotFound();
    }

    document.querySelectorAll(".nav-link, .mnav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.route === routeName);
    });
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", () => {
    if (!location.hash) location.hash = "#/home";
    router();
  });

  // global search input wires into the search route
  document.getElementById("globalSearchInput").addEventListener("input", (e) => {
    const q = e.target.value;
    if (location.hash.startsWith("#/search")) {
      pageSearch(q);
    } else if (q.trim()) {
      location.hash = `#/search?q=${encodeURIComponent(q)}`;
    }
  });
  document.getElementById("globalSearchInput").addEventListener("focus", () => {
    if (!location.hash.startsWith("#/search")) location.hash = "#/search";
  });

  // keyboard shortcut: space toggles play when not typing in an input
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      togglePlay();
    }
  });

  console.log("Omify loaded —", SONGS.length, "songs in catalog");
})();
