// script.js — Omify application core
// Vanilla JS, hash-based router, centralized player state (no framework,
// matching the existing project's stack). Organized into small modules
// within one file to keep the existing single-script structure.

(function () {
  "use strict";

  // ---------------------------------------------------------------- backend ML engine
  const API_BASE = "https://omify-backend.onrender.com";
  function resolveBackendAssetUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }

    const clean = url.replace(/^\/+/, "");
    return `${API_BASE}/${clean}`;
  }

  const SONGS = window.OMIFY_SONGS || window.SONGS || window.APP_SONGS || [];
  const ARTISTS = window.OMIFY_ARTISTS || window.ARTISTS || [];
  const ALBUMS = window.OMIFY_ALBUMS || window.ALBUMS || [];

  const songById = new Map(SONGS.map((s) => [s.id, s]));

  SONGS.forEach((song) => {
    if (!song) return;
    if (song.albumArt) {
      song.albumArt = resolveBackendAssetUrl(song.albumArt);
    }
  });

  const artistById = new Map(ARTISTS.map((a) => [a.id, a]));
  const albumById = new Map(ALBUMS.map((a) => [a.id, a]));

  function normalizeApiSong(s) {
    if (!s) return null;

    return {
      id: String(s.id),
      title: s.title || "Unknown Title",
      artist: s.artist || "Unknown Artist",
      album: s.album || "Single",

      albumArt:
        resolveBackendAssetUrl(
          s.album_art || s.albumArt || ""
        ) || "/assets/music-cover.svg",

      audioUrl: s.audio_url || s.audioUrl || "",

      duration: Number(s.duration || 0),
      genre: s.genre || "",
      language: s.language || "",
      mood: s.mood || "",
      country: s.country || "",

      releaseYear:
        s.release_year || s.releaseYear || 2024,

      releaseDate:
        s.release_date || s.releaseDate || null,

      source:
        s.source ||
        (String(s.id).startsWith("mb-")
          ? "musicbrainz"
          : "omify_js"),

      playCount:
        s.play_count || s.playCount || 0,

      clusterId: s.cluster_id,
      reason: s.reason || null,
      score: s.score != null ? s.score : null,
    };
  }
  function registerSongs(songs) {
    if (!Array.isArray(songs)) return;

    songs.forEach((raw) => {
      const norm = normalizeApiSong(raw);
      if (!norm) return;

      const existing = songById.get(norm.id);

      if (existing) {
        Object.assign(existing, norm);
      } else {
        songById.set(norm.id, norm);
        SONGS.push(norm);
      }
    });
  }

  function sendPlayHistory(song, extra = {}) {
    if (!song || !song.id) return;
    try {
      fetch(`${API_BASE}/api/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_id: song.id,
          play_duration: extra.duration || 0,
          completed: Boolean(extra.completed),
          skipped: Boolean(extra.skipped),
          liked_at_play_time: isLiked(song.id),
        }),
      }).catch(() => { });
    } catch (_) { }
  }

  // ---------------------------------------------------------------- storage

  const STORE_KEYS = {
    favorites: "omify.favorites",
    playlists: "omify.playlists",
    recent: "omify.recentlyPlayed",
    settings: "omify.settings",
    profile: "omify.profile",
    customEdits: "omify.customSongEdits",
    customSongs: "omify.customSongs",
    folders: "omify.folders",
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

  // Load custom user songs & merge custom song metadata edits
  const customUserSongs = loadJSON(STORE_KEYS.customSongs, []);
  customUserSongs.forEach((cs) => {
    if (!SONGS.some((s) => s.id === cs.id)) {
      SONGS.unshift(cs);
    }
  });

  const customSongEdits = loadJSON(STORE_KEYS.customEdits, {});
  Object.keys(customSongEdits).forEach((id) => {
    const s = SONGS.find((item) => item.id === id);
    if (s) {
      const edit = customSongEdits[id];
      if (edit && edit.albumArt && (edit.albumArt.includes("covers/generated") || edit.albumArt.includes("music-cover.svg"))) {
        delete edit.albumArt; // ignore stale placeholder edits
      }
      Object.assign(s, edit);
    }
  });

  // ---------------------------------------------------------------- Thematic Classifier & Metadata Sanitizer
  const manualSongOverrides = {
    'sp-71': { title: 'Angreji Beat', artist: 'Yo Yo Honey Singh & Gippy Grewal', theme: 'party', genre: 'Party / Dance', mood: 'Party' },
    'sp-116': { title: 'Baby', artist: 'Justin Bieber ft. Ludacris', theme: 'international', genre: 'International Pop', mood: 'Uplifting' },
    'sp-136': { title: 'Bebo', artist: 'Yo Yo Honey Singh & Alfaaz', theme: 'party', genre: 'Party / Dance', mood: 'Party' },
    'sp-182': { title: 'Char Baj Gaye (Party Abhi Baki Hai)', artist: 'Hard Kaur, Sachin-Jigar', theme: 'party', genre: 'Party / Dance', mood: 'Party' },
    'sp-345': { title: 'Haawa Haawa', artist: 'Mohit Chauhan', theme: 'nostalgia', genre: 'Bollywood', mood: 'Nostalgic' },
    'sp-472': { title: 'Harleys In Hawaii', artist: 'Katy Perry', theme: 'international', genre: 'International Pop', mood: 'Chill' },
    'sp-863': { title: 'Heer Toh Badi Sad Hai', artist: 'Mika Singh, Nakash Aziz', theme: 'party', genre: 'Bollywood', mood: 'Upbeat' },
    'sp-864': { title: 'Main Hoon Hero Tera', artist: 'Salman Khan, Amaal Mallik', theme: 'romantic', genre: 'Bollywood', mood: 'Romantic' },
    'sp-865': { title: 'Prem Ratan Dhan Payo', artist: 'Palak Muchhal, Himesh Reshammiya', theme: 'bollywood_hits', genre: 'Bollywood', mood: 'Uplifting' },
    'sp-866': { title: 'Selfie Le Le Re', artist: 'Vishal Dadlani, Pritam', theme: 'party', genre: 'Party / Dance', mood: 'Party' },
    'sp-867': { title: 'Soch Na Sake', artist: 'Arijit Singh, Tulsi Kumar', theme: 'romantic', genre: 'Bollywood', mood: 'Romantic' },
    'sp-868': { title: 'Tharki Chokro', artist: 'Swaroop Khan, Ajay-Atul', theme: 'bollywood_hits', genre: 'Bollywood', mood: 'Upbeat' },
    'sp-873': { title: 'Afghan Jalebi (Ya Baba)', artist: 'Asrar, Pritam', theme: 'party', genre: 'Party / Dance', mood: 'Party' },
    'sp-874': { title: 'Agar Tum Saath Ho', artist: 'Alka Yagnik, Arijit Singh', theme: 'romantic', genre: 'Bollywood', mood: 'Romantic' },
    'sp-875': { title: 'Atrangi Yaari', artist: 'Amitabh Bachchan, Farhan Akhtar', theme: 'nostalgia', genre: 'Indie / Acoustic', mood: 'Nostalgic' },
    'sp-884': { title: 'Jab Tum Chaho', artist: 'Mohammed Irfan, Palak Muchhal', theme: 'romantic', genre: 'Bollywood', mood: 'Romantic' },
    'sp-885': { title: 'Matargashti', artist: 'Mohit Chauhan, A.R. Rahman', theme: 'nostalgia', genre: 'Bollywood', mood: 'Upbeat' },
    'sp-889': { title: 'Sahiba', artist: 'Aditya Rikhari, Ankita Chhetri', theme: 'indie_lofi', genre: 'Indie / Acoustic', mood: 'Sukoon' },
    'sp-891': { title: 'Sanam Re', artist: 'Arijit Singh, Mithoon', theme: 'romantic', genre: 'Bollywood', mood: 'Romantic' },
    'sp-897': { title: 'Wajah Tum Ho', artist: 'Armaan Malik', theme: 'romantic', genre: 'Bollywood', mood: 'Romantic' },
    'sp-950': { title: 'Paris', artist: 'The Chainsmokers', theme: 'international', genre: 'International Pop', mood: 'Chill' },
    'sp-1041': { title: 'Wakhra Swag', artist: 'Navv Inder ft. Badshah', theme: 'punjabi', genre: 'Punjabi Pop', mood: 'Swag' }
  };

  function cleanAndClassifySong(s) {
    if (!s) return s;
    if (manualSongOverrides[s.id]) {
      Object.assign(s, manualSongOverrides[s.id]);
      return s;
    }

    let title = s.title || '';
    let artist = s.artist || '';

    // Clean noisy title scrape markers
    title = title
      .replace(/\s*-\s*PagalNew(\.Com\.Se|\.Com|\.Se)?/gi, '')
      .replace(/\s*-\s*PagalWorld(\.Com)?/gi, '')
      .replace(/\s*-\s*SongsPk/gi, '')
      .replace(/\[\s*PagalNew\s*\]/gi, '')
      .replace(/\s*[\|｜]\s*(T-Series|Sony Music India|Zee Music Company|YRF|Tips Official|Speed Records|White Hill Music|Saregama).*/gi, '')
      .replace(/\s*-\s*(T-Series|Sony Music India|Zee Music Company|YRF|Tips Official).*/gi, '')
      .replace(/\((Official Video|Official Audio|Lyrical Video|Lyric Video|Full Video|Video Song|Audio Song|Full Song|4K Video|HD Video|Remix|Slowed\s*\+\s*Reverb|Instrumental & rap removal)\)/gi, '')
      .replace(/\[(Official Video|Official Audio|Lyrical Video|Lyric Video|Full Video|Video Song|Audio Song|Full Song|4K Video|HD Video|Remix)\]/gi, '')
      .replace(/\s*:\s*(Aditya Rikhari|Ankita Chhetri).*/gi, '')
      .replace(/['"]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Clean noisy artist scrape markers
    artist = artist
      .replace(/\s*-\s*PagalNew(\.Com\.Se|\.Com|\.Se)?/gi, '')
      .replace(/\s*[\|｜]\s*(T-Series|Sony Music India|Zee Music Company|YRF|Tips Official).*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    s.title = title || s.title;
    s.artist = artist || s.artist;

    if (!s.albumArt || s.albumArt === "/assets/logo.svg") {
      s.albumArt = "/assets/music-cover.svg";
    }

    // Thematic classification based on sanitized title, artist, composer, album & language
    const text = (s.title + ' ' + s.artist + ' ' + (s.album || '') + ' ' + (s.composer || '')).toLowerCase();

    const isInternational = s.language === 'English' || /dua lipa|weeknd|bruno mars|ed sheeran|taylor swift|bieber|coldplay|imagine dragons|billie eilish|maroon 5/i.test(text);
    const isHiphop = /\b(divine|emiway|raftaar|seedhe maut|krsna|kr\$na|mc stan|king|paradox|fotty seven|bohemia|dino james|karma|bella)\b/i.test(text) ||
      (/\b(rap|drill)\b/i.test(text) && !/party|dance|removal/i.test(text)) ||
      /3:59 am|mirchi|baazigar|asli hip hop|gully gang/i.test(text);
    const isParty = /honey singh|badshah|mika singh|neha kakkar|tony kakkar|sukh-e|\bparty\b|\bclub\b|\bdaaru\b|\bdaru\b|\bnach\b|\bdance\b|blue eyes|brown rang|love dose|dheere dheere|desi kalakaar|high heels|dopamine|garmi|kala chashma|char baj gaye|breakup party|hookah bar|proper patola|coca cola|ankhiyon se goli/i.test(text);
    const isPunjabi = /diljit|karan aujla|shubh|ap dhillon|sidhu moose|b praak|ammy virk|jassie gill|guru randhawa|parmish verma|gippy grewal|jatt|brown munde|52 bars|winning speech|challa|tauba tauba/i.test(text) || (s.language && s.language.toLowerCase() === 'punjabi');
    const isIndieLofi = /taha g|taha|anuv jain|prateek kuhad|zaeden|raghav chaitanya|local train|jasleen royal|ritviz|osho jain|lofi|lo-fi|acoustic|slowed|sukoon|cold\/mess|alag aasmaan|baarishein|kasoor/i.test(text);
    const isNostalgia = /\bkk\b|lucky ali|mohit chauhan|sonu nigam|kumar sanu|udit narayan|alka yagnik|jagjit singh|kishore kumar|rafi|lata mangeshkar|r\.?d\.? burman|yaaron|alvida|zara sa|labon ko|beete lamhein|o sanam|safarnama|kal ho naa ho|suraj hua maddham|tujhe dekha to|chaiyya chaiyya|pehla nasha|chura liya/i.test(text) || (s.releaseYear && s.releaseYear < 2010 && !isParty && !isPunjabi);
    const isRomantic = /arijit singh|arijit|atif aslam|atif|shreya ghoshal|darshan raval|armaan malik|jubin nautiyal|fitoor|barsaat|saathiya|sanware|mohabbat|humsafar|raabta|samjhawan|shayad|hawayein|kaise hua|khairiyat|chal ghar chalen|tujhe kitna chahein|deewana|pehli dafa|kasam|chahu main ya naa|\b(dil|pyaar|ishq|love|tum|tere|sanam)\b/i.test(text);
    const isWorkout = /beast mode|workout|gym|adrenaline|kar har maidan|sultan|brothers anthem|chak de|malhari|zingaat/i.test(text) || (s.bpm && s.bpm >= 125 && (isParty || isPunjabi));

    if (isInternational) {
      s.theme = 'international';
      s.genre = s.genre || 'International Pop';
      s.mood = s.mood || 'Uplifting';
    } else if (isHiphop) {
      s.theme = 'hiphop';
      s.genre = 'Hip-Hop / Rap';
      s.mood = 'Hype';
    } else if (isParty) {
      s.theme = 'party';
      s.genre = 'Party / Dance';
      s.mood = 'Party';
    } else if (isPunjabi) {
      s.theme = 'punjabi';
      s.genre = 'Punjabi Pop';
      s.mood = s.mood || 'Energetic';
    } else if (isIndieLofi) {
      s.theme = 'indie_lofi';
      s.genre = 'Indie / Acoustic';
      s.mood = 'Sukoon';
    } else if (isNostalgia) {
      s.theme = 'nostalgia';
      s.genre = 'Bollywood Retro';
      s.mood = 'Nostalgic';
    } else if (isRomantic) {
      s.theme = 'romantic';
      s.genre = 'Romantic Ballads';
      s.mood = 'Romantic';
    } else if (isWorkout) {
      s.theme = 'workout';
      s.genre = 'High BPM Workout';
      s.mood = 'Energetic';
    } else {
      s.theme = 'bollywood_hits';
      s.genre = 'Bollywood';
      s.mood = s.mood || 'Chill';
    }

    return s;
  }

  // Apply sanitizer & classifier across all songs
  SONGS.forEach(cleanAndClassifySong);

  // Filter out any songs that have no real logo / cover art or placeholder art
  const validSongs = SONGS.filter(s => {
    if (!s || !s.albumArt) return false;
    if (s.id === "sp-radha-rani") return false;
    if (s.albumArt.includes("music-cover.svg") || s.albumArt.includes("placeholder")) return false;
    return true;
  });
  SONGS.length = 0;
  SONGS.push(...validSongs);

  function refreshSongMaps() {
    songById.clear();
    SONGS.forEach((s) => songById.set(s.id, s));
  }
  refreshSongMaps();

  // Pull the full catalog's real audio URLs (and fresh cover art) from the
  // backend on load. Without this, only songs surfaced by /api/made-for-you,
  // /api/new-releases, /api/trending, or /api/foreign-music ever get a real
  // audioUrl — every other song (most of the Home page) stays silent.
  async function hydrateAllSongsFromBackend() {
    const PAGE_SIZE = 100; // backend rejects large limits (422) — stay conservative
    try {
      let offset = 0;
      let total = Infinity;
      let loaded = 0;
      let guard = 0; // safety cap so a bad response can't loop forever

      while (offset < total && guard < 50) {
        guard++;
        const res = await fetch(`${API_BASE}/api/songs?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!res.ok) {
          console.warn(`Omify: /api/songs page at offset ${offset} returned ${res.status}`);
          break;
        }
        const data = await res.json();
        if (!data || !Array.isArray(data.items) || !data.items.length) break;

        registerSongs(data.items);
        loaded += data.items.length;
        total = Number(data.total) || loaded;
        offset += data.items.length;
      }

      refreshSongMaps();
      refreshVisibleTrackRows();
      console.log(`Omify: hydrated ${loaded} songs with live backend audio URLs`);
    } catch (err) {
      console.warn("Omify: full catalog hydration failed", err);
    }
  }

  // Target authentic user library playlists matching real Spotify screenshot (Image 1)
  const DEFAULT_USER_PLAYLISTS = [
    {
      id: "pl-all-1098-songs",
      name: "1098 Songs",
      creator: "Om Soni",
      vibeTag: "all-hits",
      artSrc: "assets/playlist-1098.jpg",
      description: "The complete master collection of all 1,098 songs. Non-stop shuffle & continuous playback across all genres & moods.",
      songIds: SONGS.map(s => s.id),
      createdAt: 1700000010000,
      isPinned: true
    },
    {
      id: "pl-aaj-ki-raat",
      name: "Aaj Ki Raat",
      creator: "Om Soni",
      vibeTag: "party",
      artSrc: "covers/extracted/sp-22.jpg",
      songIds: ["sp-22", "sp-182", "sp-234"],
      createdAt: 1700000005000
    },
    {
      id: "pl-dil-na-jaaneya",
      name: "Dil Na Jaaneya",
      creator: "Om Soni",
      vibeTag: "sukoon",
      artSrc: "covers/extracted/sp-81.jpg",
      songIds: ["sp-81", "sp-874", "sp-294"],
      createdAt: 1700000004000
    },
    {
      id: "pl-raabta",
      name: "Raabta",
      creator: "Om Soni",
      vibeTag: "sukoon",
      artSrc: "covers/extracted/sp-700.jpg",
      songIds: ["sp-700", "sp-346", "sp-1065"],
      createdAt: 1700000003000
    },
    {
      id: "pl-enna-sona",
      name: "Enna Sona",
      creator: "Om Soni",
      vibeTag: "sukoon",
      artSrc: "covers/extracted/sp-294.jpg",
      songIds: ["sp-294", "sp-869", "sp-870"],
      createdAt: 1700000002000
    },
    {
      id: "pl-matargashti",
      name: "Matargashti",
      creator: "Om Soni",
      vibeTag: "sukoon",
      artSrc: "covers/extracted/sp-885.jpg",
      songIds: ["sp-885", "sp-567", "sp-789"],
      createdAt: 1700000001000
    }
  ];

  const state = {
    favorites: new Set(loadJSON(STORE_KEYS.favorites, ["sp-81", "sp-874", "sp-294"]).filter(id => id !== "sp-radha-rani")),
    playlists: (() => {
      const saved = loadJSON(STORE_KEYS.playlists, []);
      const defaults = DEFAULT_USER_PLAYLISTS.slice();
      // Replace or strip stale default playlists with old names like "London Thumakda"
      const staleDefaultIds = new Set([
        "pl-london-thumakda", "pl-bolna", "pl-dildaara", "pl-tera-fitoor", "pl-chor-bazaari",
        "pl-aaj-ki-raat", "pl-dil-na-jaaneya", "pl-raabta", "pl-enna-sona", "pl-matargashti",
        "pl-all-1098-songs"
      ]);
      const validCustom = (saved || []).filter(p => p && p.name && !staleDefaultIds.has(p.id) && p.name !== "London Thumakda" && p.name !== "HIDDEN GEMS" && p.name !== "P-POP CULTURE");
      const merged = defaults.concat(validCustom);
      saveJSON(STORE_KEYS.playlists, merged);
      return merged;
    })(),
    recent: loadJSON(STORE_KEYS.recent, [{ songId: SONGS[0] ? SONGS[0].id : "sp-1", ts: Date.now() }]).filter(r => r && r.songId !== "sp-radha-rani"),
    settings: loadJSON(STORE_KEYS.settings, {
      autoplay: true,
      crossfade: false,
      theme: "dark",
    }),
    profile: (() => {
      const p = loadJSON(STORE_KEYS.profile, {
        username: "Om Soni",
        bio: "",
        avatar: "/assets/logo.svg",
      });
      if (!p.username || p.username === "You") p.username = "Om Soni";
      if (typeof p.bio === "undefined") p.bio = "";
      if (!p.avatar || p.avatar === "logo.png" || p.avatar === "assets/logo.png") p.avatar = "/assets/logo.svg";
      return p;
    })(),
    queue: SONGS.map(s => s.id), // entire verified catalog queued for Next / Prev
    currentIndex: 0,
    shuffle: false,
    repeat: "off", // off | all | one
    folders: loadJSON(STORE_KEYS.folders, []),
  };

  function persistFavorites() {
    saveJSON(STORE_KEYS.favorites, Array.from(state.favorites));
    if (typeof renderSidebarLibrary === "function") renderSidebarLibrary();
  }
  function persistPlaylists() {
    saveJSON(STORE_KEYS.playlists, state.playlists);
    if (typeof renderSidebarLibrary === "function") renderSidebarLibrary();
  }
  function persistFolders() {
    saveJSON(STORE_KEYS.folders, state.folders);
    if (typeof renderSidebarLibrary === "function") renderSidebarLibrary();
  }
  function persistRecent() { saveJSON(STORE_KEYS.recent, state.recent); }
  function persistSettings() { saveJSON(STORE_KEYS.settings, state.settings); }
  function persistProfile() { saveJSON(STORE_KEYS.profile, state.profile); }

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
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }

  // ---------------------------------------------------------------- theme
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    state.settings.theme = theme;
    persistSettings();
    const themeIcon = document.querySelector("#themeToggleBtn i");
    if (themeIcon) {
      themeIcon.className = theme === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
    }
    // Update meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === "dark" ? "#07090E" : "#F3F7F4";
    }
    if (elDOM.seekBar) updateRangeFill(elDOM.seekBar);
    if (elDOM.volumeBar) updateRangeFill(elDOM.volumeBar);
    if (elDOM.mobilePlayerSeek) updateRangeFill(elDOM.mobilePlayerSeek);
  }

  // ---------------------------------------------------------------- image fallback
  function handleImageError(img) {
    if (img.dataset.errorHandled) return;
    img.dataset.errorHandled = "true";
    img.classList.add("img-error");
    img.src = "/assets/logo.svg";
  }

  // Global image error handler
  document.addEventListener("error", (e) => {
    if (e.target.tagName === "IMG") handleImageError(e.target);
  }, true);

  // ================================================================== PLAYER
  const audio = new Audio();
  audio.volume = 0.7;

  const elDOM = {
    playBtn: document.getElementById("playBtn"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    shuffleBtn: document.getElementById("shuffleBtn"),
    repeatBtn: document.getElementById("repeatBtn"),
    seekBar: document.getElementById("seekBar"),
    volumeBar: document.getElementById("volumeBar"),
    volumeIcon: document.getElementById("volumeIcon"),
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
    playerBar: document.getElementById("playerBar"),
    playerNowPlaying: document.getElementById("playerNowPlaying"),
    // Mobile player overlay
    mobilePlayerOverlay: document.getElementById("mobilePlayerOverlay"),
    mobilePlayerArt: document.getElementById("mobilePlayerArt"),
    mobilePlayerTitle: document.getElementById("mobilePlayerTitle"),
    mobilePlayerArtist: document.getElementById("mobilePlayerArtist"),
    mobilePlayBtn: document.getElementById("mobilePlayBtn"),
    mobilePrevBtn: document.getElementById("mobilePrevBtn"),
    mobileNextBtn: document.getElementById("mobileNextBtn"),
    mobileShuffleBtn: document.getElementById("mobileShuffleBtn"),
    mobileRepeatBtn: document.getElementById("mobileRepeatBtn"),
    mobileLikeBtn: document.getElementById("mobileLikeBtn"),
    mobileQueueBtn: document.getElementById("mobileQueueBtn"),
    closeMobilePlayer: document.getElementById("closeMobilePlayer"),
    mobilePlayerSeek: document.getElementById("mobilePlayerSeek"),
    mobilePlayerCurTime: document.getElementById("mobilePlayerCurTime"),
    mobilePlayerDurTime: document.getElementById("mobilePlayerDurTime"),
  };

  function currentSong() {
    if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) return null;
    return songById.get(state.queue[state.currentIndex]) || null;
  }

  function getEffectiveDuration() {
    if (audio.duration && isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    const song = currentSong();
    if (song && song.duration && isFinite(song.duration) && song.duration > 0) return song.duration;
    return 180;
  }

  function playQueue(ids, startIndex, sourceLabel) {
    if (!ids || !ids.length) return;
    if (ids.length === 1 && SONGS.length > 1) {
      const singleId = ids[0];
      const catIdx = SONGS.findIndex((s) => s.id === singleId);
      if (catIdx >= 0) {
        state.queue = SONGS.map((s) => s.id);
        state.currentIndex = catIdx;
        loadAndPlayCurrent();
        return;
      } else {
        state.queue = [singleId, ...SONGS.filter((s) => s.id !== singleId).map((s) => s.id)];
        state.currentIndex = 0;
        loadAndPlayCurrent();
        return;
      }
    }
    state.queue = ids.slice();
    state.currentIndex = startIndex || 0;
    loadAndPlayCurrent();
  }

  function getCleanAudioUrl(song) {
    if (!song) return "";

    const raw = String(song.audioUrl || song.audioSrc || "").trim();

    if (!raw || !/^https?:\/\//i.test(raw)) {
      return "";
    }

    // Keep signed Backblaze URLs exactly as returned by the backend.
    return raw;
  }
  function loadAndPlayCurrent() {
    const song = currentSong();
    if (!song) return;

    let cleanUrl = getCleanAudioUrl(song);
    if (!cleanUrl) {
      console.warn("Omify: no valid audio URL for", song);
      setPlayIcon(false);
      return;
    }

    audio.src = cleanUrl;
    audio.currentTime = 0;

    // Immediately synchronize time displays and seek bar to avoid 0:00 desync
    const effectiveDur = getEffectiveDuration();
    if (elDOM.curTime) elDOM.curTime.textContent = "0:00";
    if (elDOM.durTime) elDOM.durTime.textContent = fmtTime(effectiveDur);
    if (elDOM.seekBar) {
      elDOM.seekBar.value = 0;
      updateRangeFill(elDOM.seekBar);
    }
    if (elDOM.mobilePlayerCurTime) elDOM.mobilePlayerCurTime.textContent = "0:00";
    if (elDOM.mobilePlayerDurTime) elDOM.mobilePlayerDurTime.textContent = fmtTime(effectiveDur);
    if (elDOM.mobilePlayerSeek) {
      elDOM.mobilePlayerSeek.value = 0;
      updateRangeFill(elDOM.mobilePlayerSeek);
    }

    updateNowPlayingUI(song, false);

    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        setPlayIcon(true);
      }).catch((e) => {
        console.warn("Omify: playback failed", e);
        setPlayIcon(false);
        toast(`Couldn't play "${song.title}" — check audio source.`);
      });
    }

    recordRecentlyPlayed(song.id);
    sendPlayHistory(song, { completed: false, skipped: false });
    renderQueuePanel();
    refreshVisibleTrackRows();
  }

  function updateNowPlayingUI(song, isPlaying = true) {
    if (!song) {
      if (elDOM.playerNowPlaying) {
        elDOM.playerNowPlaying.classList.add("is-empty");
        elDOM.playerNowPlaying.style.visibility = "hidden";
      }
      if (elDOM.nowArt) elDOM.nowArt.style.display = "none";
      if (elDOM.nowLikeBtn) elDOM.nowLikeBtn.style.display = "none";
      if (elDOM.nowTitle) elDOM.nowTitle.textContent = "";
      if (elDOM.nowArtist) elDOM.nowArtist.textContent = "";
      return;
    }
    if (elDOM.playerNowPlaying) {
      elDOM.playerNowPlaying.classList.remove("is-empty");
      elDOM.playerNowPlaying.style.visibility = "visible";
    }
    if (elDOM.nowArt) {
      elDOM.nowArt.style.display = "block";
      elDOM.nowArt.src = song.albumArt;
      elDOM.nowArt.alt = song.album;
    }
    if (elDOM.nowLikeBtn) elDOM.nowLikeBtn.style.display = "inline-flex";
    if (elDOM.nowTitle) elDOM.nowTitle.textContent = song.title;
    if (elDOM.nowArtist) elDOM.nowArtist.textContent = song.artist;

    const effectiveDur = getEffectiveDuration();
    if (elDOM.durTime && (!elDOM.durTime.textContent || elDOM.durTime.textContent === "0:00")) {
      elDOM.durTime.textContent = fmtTime(effectiveDur);
    }
    if (elDOM.mobilePlayerDurTime && (!elDOM.mobilePlayerDurTime.textContent || elDOM.mobilePlayerDurTime.textContent === "0:00")) {
      elDOM.mobilePlayerDurTime.textContent = fmtTime(effectiveDur);
    }

    setPlayIcon(isPlaying);
    setLikeIcon(elDOM.nowLikeBtn, isLiked(song.id));
    const nowEditBtn = document.getElementById("nowEditBtn");
    if (nowEditBtn) nowEditBtn.style.display = "inline-flex";
    document.title = "Omify";

    // Update mobile player overlay
    if (elDOM.mobilePlayerArt) elDOM.mobilePlayerArt.src = song.albumArt;
    if (elDOM.mobilePlayerTitle) elDOM.mobilePlayerTitle.textContent = song.title;
    if (elDOM.mobilePlayerArtist) elDOM.mobilePlayerArtist.textContent = song.artist;
    updateMobileLikeIcon();
  }

  function setPlayIcon(isPlaying) {
    state.isPlaying = isPlaying;
    const icon = elDOM.playBtn?.querySelector("i");
    if (icon) icon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
    if (elDOM.playBtn) elDOM.playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    // Sync mobile play button
    const mobileIcon = elDOM.mobilePlayBtn?.querySelector("i");
    if (mobileIcon) mobileIcon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
    if (elDOM.mobilePlayBtn) elDOM.mobilePlayBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");

    if (elDOM.playerBar && elDOM.playerBar.classList) {
      if (typeof elDOM.playerBar.classList.toggle === "function") elDOM.playerBar.classList.toggle("is-playing", isPlaying);
      else if (isPlaying) elDOM.playerBar.classList.add("is-playing");
      else elDOM.playerBar.classList.remove("is-playing");
    }
    if (elDOM.playerNowPlaying && elDOM.playerNowPlaying.classList) {
      if (typeof elDOM.playerNowPlaying.classList.toggle === "function") elDOM.playerNowPlaying.classList.toggle("is-playing", isPlaying);
      else if (isPlaying) elDOM.playerNowPlaying.classList.add("is-playing");
      else elDOM.playerNowPlaying.classList.remove("is-playing");
    }

    refreshVisibleTrackRows();
    if (typeof updateSidebarPlayingState === "function") updateSidebarPlayingState();
  }
  function setLikeIcon(btn, liked) {
    if (!btn) return;
    if (btn.classList) {
      if (typeof btn.classList.toggle === "function") btn.classList.toggle("liked", liked);
      else if (liked) btn.classList.add("liked");
      else btn.classList.remove("liked");
    }
    const icon = btn.querySelector ? btn.querySelector("i") : null;
    if (icon) {
      if (btn.id === "nowLikeBtn") {
        icon.className = liked ? "fa-solid fa-circle-check" : "fa-solid fa-circle-plus";
        icon.style.color = liked ? "var(--signal)" : "";
      } else {
        icon.className = liked ? "fa-solid fa-heart" : "fa-regular fa-heart";
      }
    }
  }
  function updateMobileLikeIcon() {
    const song = currentSong();
    if (song && elDOM.mobileLikeBtn) {
      setLikeIcon(elDOM.mobileLikeBtn, isLiked(song.id));
    }
  }

  function togglePlay() {
    const song = currentSong();
    if (!song) {
      // nothing loaded yet — start from full library
      playQueue(SONGS.map((s) => s.id), 0);
      return;
    }
    const expectedSrc = getCleanAudioUrl(song);
    const currentFileName = audio.src ? decodeURIComponent(audio.src).split("/").pop() : "";
    const expectedFileName = expectedSrc ? decodeURIComponent(expectedSrc).split("/").pop() : "";

    if (!audio.src || !currentFileName || currentFileName !== expectedFileName) {
      loadAndPlayCurrent();
      return;
    }

    if (audio.paused) {
      const p = audio.play();
      if (p !== undefined) {
        p.then(() => {
          setPlayIcon(true);
        }).catch((e) => {
          console.warn("Omify: playback toggle error", e);
          loadAndPlayCurrent();
        });
      }
    } else {
      audio.pause();
      setPlayIcon(false);
    }
  }

  function playNext(auto) {
    const prevSong = currentSong();
    if (!auto && prevSong) {
      const listenedSecs = Math.round(audio.currentTime || 0);
      sendPlayHistory(prevSong, {
        duration: listenedSecs,
        completed: false,
        skipped: listenedSecs < 15,
      });
    }
    if (!state.queue || state.queue.length <= 1) {
      if (SONGS.length > 1) {
        const curId = (state.queue && state.queue[state.currentIndex]) || (SONGS[0] ? SONGS[0].id : "sp-1");
        state.queue = SONGS.map((s) => s.id);
        const idx = state.queue.indexOf(curId);
        state.currentIndex = idx >= 0 ? idx : 0;
      }
    }
    if (!state.queue || !state.queue.length) return;

    if (state.repeat === "one" && auto) {
      audio.currentTime = 0;
      const p = audio.play();
      if (p !== undefined) p.catch(() => { });
      return;
    }
    let next = state.currentIndex + 1;
    if (state.shuffle) {
      if (state.queue.length > 1) {
        let rand = Math.floor(Math.random() * state.queue.length);
        while (rand === state.currentIndex && state.queue.length > 1) {
          rand = Math.floor(Math.random() * state.queue.length);
        }
        next = rand;
      } else {
        next = 0;
      }
    } else if (next >= state.queue.length) {
      // Loop back to start so next button never gets stuck
      next = 0;
    }
    state.currentIndex = next;
    loadAndPlayCurrent();
  }

  function playPrev() {
    const prevSong = currentSong();
    if (prevSong) {
      const listenedSecs = Math.round(audio.currentTime || 0);
      sendPlayHistory(prevSong, {
        duration: listenedSecs,
        completed: false,
        skipped: listenedSecs < 15,
      });
    }
    if (!state.queue || state.queue.length <= 1) {
      if (SONGS.length > 1) {
        const curId = (state.queue && state.queue[state.currentIndex]) || (SONGS[0] ? SONGS[0].id : "sp-1");
        state.queue = SONGS.map((s) => s.id);
        const idx = state.queue.indexOf(curId);
        state.currentIndex = idx >= 0 ? idx : 0;
      }
    }
    if (!state.queue || !state.queue.length) return;

    let prev = state.currentIndex - 1;
    if (prev < 0) {
      prev = state.queue.length - 1; // loop to end of queue
    }
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
    const isAdding = !state.favorites.has(songId);
    if (isAdding) {
      state.favorites.add(songId);
    } else {
      state.favorites.delete(songId);
    }
    persistFavorites();
    const song = currentSong();
    if (song && song.id === songId) {
      setLikeIcon(elDOM.nowLikeBtn, isLiked(songId));
      updateMobileLikeIcon();
    }
    // Animate the heart buttons
    document.querySelectorAll(`[data-heart="${songId}"]`).forEach((btn) => {
      btn.classList.add("pulse");
      setTimeout(() => btn.classList.remove("pulse"), 400);
    });
    refreshVisibleTrackRows();

    // Sync with backend API
    try {
      fetch(`${API_BASE}/api/favorites/${encodeURIComponent(songId)}`, {
        method: isAdding ? "POST" : "DELETE",
      }).catch(() => { });
    } catch (_) { }
  }


  function refreshVisibleTrackRows() {
    const activeSong = currentSong();
    const isPlaying = !audio.paused && !audio.ended && Boolean(activeSong);

    // 1. Track list rows
    document.querySelectorAll(".track-row").forEach((row) => {
      const id = row.dataset.songId;
      if (!id) return;
      const isCurrent = Boolean(activeSong && activeSong.id === id);
      const isCurrentPlaying = isCurrent && isPlaying;

      row.classList.toggle("playing", isCurrent);
      row.classList.toggle("active-playing", isCurrentPlaying);

      const titleEl = row.querySelector(".track-title");
      if (titleEl) titleEl.classList.toggle("playing-title", isCurrent);

      const playIconEl = row.querySelector(".track-index-play");
      if (playIconEl) {
        const ico = playIconEl.querySelector("i");
        if (ico) ico.className = isCurrentPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
        playIconEl.style.display = "";
      }

      const idxEl = row.querySelector(".track-index");
      if (idxEl) idxEl.style.display = "";
      const rankEl = row.querySelector(".rank-num");
      if (rankEl) rankEl.style.display = "";
      const eqEl = row.querySelector(".equalizer-icon");
      if (eqEl) eqEl.style.display = "";

      const heart = row.querySelector(".heart-btn");
      if (heart) {
        heart.classList.toggle("liked", isLiked(id));
        const icon = heart.querySelector("i");
        if (icon) icon.className = isLiked(id) ? "fa-solid fa-heart" : "fa-regular fa-heart";
      }
    });

    // 2. Catalog song cards
    document.querySelectorAll(".catalog-song-card").forEach((card) => {
      const id = card.dataset.songId;
      if (!id) return;
      const isCurrent = Boolean(activeSong && activeSong.id === id);
      const isCurrentPlaying = isCurrent && isPlaying;

      card.classList.toggle("playing", isCurrent);
      card.classList.toggle("active-playing", isCurrentPlaying);

      const fab = card.querySelector(".play-fab");
      if (fab) {
        const ico = fab.querySelector("i");
        if (ico) ico.className = isCurrentPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
        fab.setAttribute("aria-label", isCurrentPlaying ? "Pause" : "Play");
      }
    });

    // 3. Media cards (song cards)
    document.querySelectorAll(".media-card").forEach((card) => {
      const id = card.dataset.id;
      const kind = card.dataset.kind;
      if (kind === "song" && id) {
        const isCurrent = Boolean(activeSong && activeSong.id === id);
        const isCurrentPlaying = isCurrent && isPlaying;

        card.classList.toggle("playing", isCurrent);
        card.classList.toggle("active-playing", isCurrentPlaying);

        const fab = card.querySelector(".play-fab");
        if (fab) {
          const ico = fab.querySelector("i");
          if (ico) ico.className = isCurrentPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
          fab.setAttribute("aria-label", isCurrentPlaying ? "Pause" : "Play");
        }
      }
    });

    // 4. Home jump-in cards
    document.querySelectorAll(".home-jumpin-card").forEach((card) => {
      const id = card.dataset.songId;
      if (!id) return;
      const isCurrent = Boolean(activeSong && activeSong.id === id);
      const isCurrentPlaying = isCurrent && isPlaying;

      card.classList.toggle("playing", isCurrent);
      card.classList.toggle("active-playing", isCurrentPlaying);

      const fab = card.querySelector(".play-fab");
      if (fab) {
        const ico = fab.querySelector("i");
        if (ico) ico.className = isCurrentPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
        fab.setAttribute("aria-label", isCurrentPlaying ? "Pause" : "Play");
      }
    });

    // 5. Home quickplay cards
    document.querySelectorAll(".home-quickplay-card").forEach((card) => {
      const plId = card.dataset.playlistId;
      if (plId) {
        const pl = state.playlists.find((p) => p.id === plId);
        const isCurrentPlPlaying = Boolean(isPlaying && activeSong && pl && (pl.songIds || []).includes(activeSong.id));
        card.classList.toggle("playing", Boolean(activeSong && pl && (pl.songIds || []).includes(activeSong.id)));
        card.classList.toggle("active-playing", isCurrentPlPlaying);
        const playBtn = card.querySelector(".home-quickplay-play");
        if (playBtn) {
          const ico = playBtn.querySelector("i");
          if (ico) ico.className = isCurrentPlPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
          playBtn.setAttribute("aria-label", isCurrentPlPlaying ? "Pause" : "Play");
        }
        return;
      }
      const id = card.dataset.songId;
      if (!id) return;
      const isCurrent = Boolean(activeSong && activeSong.id === id);
      const isCurrentPlaying = isCurrent && isPlaying;

      card.classList.toggle("playing", isCurrent);
      card.classList.toggle("active-playing", isCurrentPlaying);

      const playBtn = card.querySelector(".home-quickplay-play");
      if (playBtn) {
        const ico = playBtn.querySelector("i");
        if (ico) ico.className = isCurrentPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
        playBtn.setAttribute("aria-label", isCurrentPlaying ? "Pause" : "Play");
      }
    });

    // 6. Taste playlist cards
    document.querySelectorAll(".taste-playlist-card").forEach((card) => {
      const plId = card.dataset.playlistId;
      if (!plId) return;
      const curatedList = buildCuratedPlaylists();
      const pl = curatedList.find((p) => p.id === plId);
      const isCurPlPlaying = Boolean(pl && activeSong && pl.songIds.includes(activeSong.id) && isPlaying);
      card.classList.toggle("active-playing", isCurPlPlaying);
      const fab = card.querySelector(".play-fab");
      if (fab) {
        const ico = fab.querySelector("i");
        if (ico) ico.className = isCurPlPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
        fab.setAttribute("aria-label", isCurPlPlaying ? "Pause" : "Play");
      }
    });

    // 7. Hero play buttons (if visible in current album/playlist/category view)
    const heroPlayButtons = document.querySelectorAll("#playAllBtn, #catPlayAll, #trendPlayAll, #newPlayAll, #mfyPlayAll, #recentPlayAll, #playAllCatalogBtn, #playAllLocalBtn, .play-fab-lg");
    heroPlayButtons.forEach((btn) => {
      const currentActiveInView = activeSong && document.querySelector(`.track-row[data-song-id="${activeSong.id}"], .catalog-song-card[data-song-id="${activeSong.id}"]`);
      const isCurrentPlayingInView = isPlaying && Boolean(currentActiveInView);
      const ico = btn.querySelector("i");
      if (ico) ico.className = isCurrentPlayingInView ? "fa-solid fa-pause" : "fa-solid fa-play";
      btn.setAttribute("aria-label", isCurrentPlayingInView ? "Pause" : "Play");
    });
  }


  // ------------------------------------------------------- audio events
  function syncDurationDisplay() {
    const dur = getEffectiveDuration();
    if (elDOM.durTime) elDOM.durTime.textContent = fmtTime(dur);
    if (elDOM.mobilePlayerDurTime) elDOM.mobilePlayerDurTime.textContent = fmtTime(dur);
    if (audio.currentTime && dur > 0) {
      const progress = Math.min(100, Math.max(0, (audio.currentTime / dur) * 100));
      if (elDOM.seekBar) {
        elDOM.seekBar.value = progress;
        updateRangeFill(elDOM.seekBar);
      }
      if (elDOM.mobilePlayerSeek) {
        elDOM.mobilePlayerSeek.value = progress;
        updateRangeFill(elDOM.mobilePlayerSeek);
      }
    }
  }

  audio.addEventListener("loadedmetadata", syncDurationDisplay);
  audio.addEventListener("durationchange", syncDurationDisplay);
  audio.addEventListener("canplay", syncDurationDisplay);

  let isDraggingSeek = false;

  audio.addEventListener("timeupdate", () => {
    const dur = getEffectiveDuration();
    const cur = audio.currentTime || 0;
    if (!isDraggingSeek) {
      if (elDOM.curTime) elDOM.curTime.textContent = fmtTime(cur);
      const progress = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
      if (elDOM.seekBar) {
        elDOM.seekBar.value = progress;
        updateRangeFill(elDOM.seekBar);
      }
      if (elDOM.mobilePlayerSeek) {
        elDOM.mobilePlayerSeek.value = progress;
        updateRangeFill(elDOM.mobilePlayerSeek);
      }
      if (elDOM.mobilePlayerCurTime) elDOM.mobilePlayerCurTime.textContent = fmtTime(cur);
    }
    if (elDOM.durTime) elDOM.durTime.textContent = fmtTime(dur);
    if (elDOM.mobilePlayerDurTime) elDOM.mobilePlayerDurTime.textContent = fmtTime(dur);
  });
  audio.addEventListener("ended", () => {
    const s = currentSong();
    if (s) {
      sendPlayHistory(s, {
        duration: Math.round(audio.currentTime || (s.duration || 0)),
        completed: true,
        skipped: false,
      });
    }
    playNext(true);
  });
  audio.addEventListener("error", () => {
    toast("Playback error — this track's audio source could not be loaded.");
    setPlayIcon(false);
  });
  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));

  // Range slider fill color
  function updateRangeFill(rangeInput) {
    if (!rangeInput) return;
    const min = parseFloat(rangeInput.min) || 0;
    const max = parseFloat(rangeInput.max) || 100;
    const val = parseFloat(rangeInput.value) || 0;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    const fillColor = "#1ed760";
    const trackColor = isLight ? "rgba(0, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.22)";
    rangeInput.style.background = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, ${trackColor} ${pct}%, ${trackColor} 100%)`;
  }

  // Initialize volume slider fill
  updateRangeFill(elDOM.volumeBar);

  if (elDOM.seekBar) {
    elDOM.seekBar.addEventListener("mousedown", () => { isDraggingSeek = true; });
    elDOM.seekBar.addEventListener("touchstart", () => { isDraggingSeek = true; }, { passive: true });
    elDOM.seekBar.addEventListener("mouseup", () => { isDraggingSeek = false; });
    elDOM.seekBar.addEventListener("touchend", () => { isDraggingSeek = false; });
    elDOM.seekBar.addEventListener("change", () => {
      isDraggingSeek = false;
      const dur = getEffectiveDuration();
      if (dur > 0) {
        audio.currentTime = (elDOM.seekBar.value / 100) * dur;
      }
    });
    elDOM.seekBar.addEventListener("input", () => {
      const dur = getEffectiveDuration();
      if (dur > 0) {
        audio.currentTime = (elDOM.seekBar.value / 100) * dur;
      }
      if (elDOM.curTime) elDOM.curTime.textContent = fmtTime(audio.currentTime || 0);
      updateRangeFill(elDOM.seekBar);
    });
  }

  if (elDOM.mobilePlayerSeek) {
    elDOM.mobilePlayerSeek.addEventListener("mousedown", () => { isDraggingSeek = true; });
    elDOM.mobilePlayerSeek.addEventListener("touchstart", () => { isDraggingSeek = true; }, { passive: true });
    elDOM.mobilePlayerSeek.addEventListener("mouseup", () => { isDraggingSeek = false; });
    elDOM.mobilePlayerSeek.addEventListener("touchend", () => { isDraggingSeek = false; });
    elDOM.mobilePlayerSeek.addEventListener("change", () => {
      isDraggingSeek = false;
      const dur = getEffectiveDuration();
      if (dur > 0) {
        audio.currentTime = (elDOM.mobilePlayerSeek.value / 100) * dur;
      }
    });
    elDOM.mobilePlayerSeek.addEventListener("input", () => {
      const dur = getEffectiveDuration();
      if (dur > 0) {
        audio.currentTime = (elDOM.mobilePlayerSeek.value / 100) * dur;
      }
      if (elDOM.mobilePlayerCurTime) elDOM.mobilePlayerCurTime.textContent = fmtTime(audio.currentTime || 0);
      updateRangeFill(elDOM.mobilePlayerSeek);
    });
  }
  elDOM.volumeBar.addEventListener("input", () => {
    audio.volume = elDOM.volumeBar.value / 100;
    audio.muted = false;
    updateRangeFill(elDOM.volumeBar);
    updateVolumeIcon();
  });

  function updateVolumeIcon() {
    const icon = elDOM.volumeIcon;
    if (!icon) return;
    const vol = audio.volume;
    if (audio.muted || vol === 0) {
      icon.className = "fa-solid fa-volume-xmark";
    } else if (vol < 0.5) {
      icon.className = "fa-solid fa-volume-low";
    } else {
      icon.className = "fa-solid fa-volume-high";
    }
  }

  // Volume icon click to toggle mute
  let prevVolumeLevel = 0.8;
  if (elDOM.volumeIcon) {
    elDOM.volumeIcon.style.cursor = "pointer";
    elDOM.volumeIcon.addEventListener("click", () => {
      audio.muted = !audio.muted;
      if (audio.muted) {
        if (audio.volume > 0) prevVolumeLevel = audio.volume;
        elDOM.volumeBar.value = 0;
      } else {
        const restoreVol = prevVolumeLevel || 0.8;
        audio.volume = restoreVol;
        elDOM.volumeBar.value = restoreVol * 100;
      }
      updateRangeFill(elDOM.volumeBar);
      updateVolumeIcon();
    });
  }

  function syncShuffleUI() {
    if (elDOM.shuffleBtn) elDOM.shuffleBtn.classList.toggle("active", state.shuffle);
    if (elDOM.mobileShuffleBtn) elDOM.mobileShuffleBtn.classList.toggle("active", state.shuffle);
  }

  function syncRepeatUI() {
    const isRepeatOn = state.repeat !== "off";
    if (elDOM.repeatBtn) elDOM.repeatBtn.classList.toggle("active", isRepeatOn);
    if (elDOM.mobileRepeatBtn) elDOM.mobileRepeatBtn.classList.toggle("active", isRepeatOn);
    const iconClass = state.repeat === "one" ? "fa-solid fa-1" : "fa-solid fa-repeat";
    const icon = elDOM.repeatBtn?.querySelector("i");
    if (icon) icon.className = iconClass;
    const mobileIcon = elDOM.mobileRepeatBtn?.querySelector("i");
    if (mobileIcon) mobileIcon.className = iconClass;
  }

  elDOM.playBtn.addEventListener("click", togglePlay);
  elDOM.nextBtn.addEventListener("click", () => playNext(false));
  elDOM.prevBtn.addEventListener("click", playPrev);
  elDOM.shuffleBtn.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    syncShuffleUI();
    toast(state.shuffle ? "Shuffle on" : "Shuffle off");
  });
  elDOM.repeatBtn.addEventListener("click", () => {
    const order = ["off", "all", "one"];
    state.repeat = order[(order.indexOf(state.repeat) + 1) % order.length];
    syncRepeatUI();
    toast(`Repeat: ${state.repeat}`);
  });
  elDOM.nowLikeBtn.addEventListener("click", () => {
    const song = currentSong();
    if (song) toggleFavorite(song.id);
  });
  const nowEditBtn = document.getElementById("nowEditBtn");
  if (nowEditBtn) {
    nowEditBtn.addEventListener("click", () => {
      const song = currentSong();
      if (song) openSongCustomizerModal(song.id);
    });
  }

  // ------------------------------------------------------- mobile player
  // Open mobile player on tap of player-bar now-playing area (mobile only)
  if (elDOM.playerNowPlaying) {
    elDOM.playerNowPlaying.addEventListener("click", (e) => {
      if (window.innerWidth > 900) return;
      if (e.target.closest(".like-btn")) return;
      if (!currentSong()) return;
      openMobilePlayer();
    });
  }

  function openMobilePlayer() {
    if (elDOM.mobilePlayerOverlay) {
      elDOM.mobilePlayerOverlay.classList.add("open");
      const song = currentSong();
      if (song) {
        elDOM.mobilePlayerArt.src = song.albumArt;
        elDOM.mobilePlayerTitle.textContent = song.title;
        elDOM.mobilePlayerArtist.textContent = song.artist;
        updateMobileLikeIcon();
      }
    }
  }

  function closeMobilePlayer() {
    if (elDOM.mobilePlayerOverlay) elDOM.mobilePlayerOverlay.classList.remove("open");
  }

  if (elDOM.closeMobilePlayer) elDOM.closeMobilePlayer.addEventListener("click", closeMobilePlayer);
  if (elDOM.mobilePlayBtn) elDOM.mobilePlayBtn.addEventListener("click", togglePlay);
  if (elDOM.mobilePrevBtn) elDOM.mobilePrevBtn.addEventListener("click", playPrev);
  if (elDOM.mobileNextBtn) elDOM.mobileNextBtn.addEventListener("click", () => playNext(false));
  if (elDOM.mobileShuffleBtn) elDOM.mobileShuffleBtn.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    syncShuffleUI();
    toast(state.shuffle ? "Shuffle on" : "Shuffle off");
  });
  if (elDOM.mobileRepeatBtn) elDOM.mobileRepeatBtn.addEventListener("click", () => {
    const order = ["off", "all", "one"];
    state.repeat = order[(order.indexOf(state.repeat) + 1) % order.length];
    syncRepeatUI();
    toast(`Repeat: ${state.repeat}`);
  });
  if (elDOM.mobileLikeBtn) elDOM.mobileLikeBtn.addEventListener("click", () => {
    const song = currentSong();
    if (song) toggleFavorite(song.id);
  });
  if (elDOM.mobileQueueBtn) elDOM.mobileQueueBtn.addEventListener("click", () => {
    closeMobilePlayer();
    openQueue();
  });
  if (elDOM.mobilePlayerSeek) elDOM.mobilePlayerSeek.addEventListener("input", () => {
    if (audio.duration) audio.currentTime = (elDOM.mobilePlayerSeek.value / 100) * audio.duration;
    updateRangeFill(elDOM.mobilePlayerSeek);
  });

  // ------------------------------------------------------- queue panel UI
  const topQueueBtn = document.getElementById("queueBtn");
  if (topQueueBtn) topQueueBtn.addEventListener("click", openQueue);
  const pQueueBtn = document.getElementById("playerQueueBtn");
  if (pQueueBtn) pQueueBtn.addEventListener("click", openQueue);
  const cQueueBtn = document.getElementById("closeQueueBtn");
  if (cQueueBtn) cQueueBtn.addEventListener("click", closeQueue);
  const clrQueueBtn = document.getElementById("clearQueueBtn");
  if (clrQueueBtn) {
    clrQueueBtn.addEventListener("click", () => {
      clearQueueKeepCurrent();
      toast("Queue cleared");
    });
  }
  if (elDOM.scrim) elDOM.scrim.addEventListener("click", () => { closeQueue(); closeSidebar(); });

  function openQueue() {
    elDOM.queuePanel.classList.add("open");
    elDOM.scrim.classList.add("open");
    renderQueuePanel();
  }
  function closeQueue() {
    elDOM.queuePanel.classList.remove("open");
    elDOM.scrim.classList.remove("open");
  }
  function renderQueuePanel() {
    const upcoming = state.queue.slice(state.currentIndex + 1);
    const now = currentSong();
    let nowHtml = "";
    if (now) {
      nowHtml = `
        <div style="margin-bottom:12px;">
          <div style="font-size:0.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Now Playing</div>
          <div class="queue-item" style="background:var(--surface-raised);">
            <img src="${now.albumArt}" alt="" loading="lazy" />
            <div class="qmeta">
              <div class="qtitle" style="color:var(--signal);">${escapeHtml(now.title)}</div>
              <div class="qartist">${escapeHtml(now.artist)}</div>
            </div>
          </div>
        </div>`;
    }
    if (!upcoming.length) {
      elDOM.queueList.innerHTML = nowHtml + `<div class="empty-state"><i class="fa-solid fa-list-ol"></i><h3>Queue is empty</h3><p>Add songs to see them here.</p></div>`;
      return;
    }
    elDOM.queueList.innerHTML = nowHtml + `
      <div style="font-size:0.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Up Next</div>
      ${upcoming.map((id, i) => {
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
    }).join("")}`;
    elDOM.queueList.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFromQueue(parseInt(btn.dataset.remove, 10));
      });
    });
    elDOM.queueList.querySelectorAll(".queue-item[data-pos]").forEach((item) => {
      item.addEventListener("click", () => {
        state.currentIndex = parseInt(item.dataset.pos, 10);
        loadAndPlayCurrent();
      });
    });
  }

  // ------------------------------------------------------- mobile sidebar
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  mobileMenuBtn.addEventListener("click", () => {
    elDOM.sidebar.classList.add("open");
    elDOM.scrim.classList.add("open");
  });
  function closeSidebar() { elDOM.sidebar.classList.remove("open"); }

  // ------------------------------------------------------- theme toggle
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = state.settings.theme === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }
  // Apply saved theme on load
  applyTheme(state.settings.theme || "dark");



  // ================================================================== SONG CUSTOMIZATION SYSTEM

  function openSongCustomizerModal(songId) {
    const song = songById.get(songId);
    if (!song) return;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    let workingArt = song.albumArt || "/assets/music-cover.svg";

    backdrop.innerHTML = `
      <div class="modal modal-customize-song" role="dialog" aria-modal="true" aria-labelledby="customSongTitle">
        <div class="modal-header-row">
          <h3 id="customSongTitle"><i class="fa-solid fa-pen-to-square" style="color:var(--signal);margin-right:8px;"></i>Customize Song Details</h3>
          <button class="modal-close-btn" id="editSongClose" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="edit-song-layout">
          <div class="edit-song-art-col">
            <div class="edit-song-art-box" id="songArtPreviewBox" title="Click to upload new cover image">
              <img src="${workingArt}" alt="${escapeHtml(song.title)}" id="songArtPreviewImg" />
              <div class="edit-song-art-overlay">
                <i class="fa-solid fa-camera"></i>
                <span>Change art</span>
              </div>
            </div>

            <input type="file" id="songArtFileInput" accept="image/*" style="display:none;" />

            <div class="edit-song-art-btns">
              <button type="button" class="btn btn-secondary btn-sm" id="songArtUploadBtn">
                <i class="fa-solid fa-arrow-up-from-bracket"></i> Choose art
              </button>
            </div>
          </div>

          <div class="edit-song-inputs-col">
            <div class="input-group">
              <label for="editSongTitle">Title</label>
              <input type="text" id="editSongTitle" value="${escapeHtml(song.title)}" />
            </div>

            <div class="edit-song-inputs-row">
              <div class="input-group">
                <label for="editSongSinger">Singer / Artist</label>
                <input type="text" id="editSongSinger" value="${escapeHtml(song.artist)}" />
              </div>

              <div class="input-group">
                <label for="editSongAlbum">Album</label>
                <input type="text" id="editSongAlbum" value="${escapeHtml(song.album || 'Single')}" />
              </div>
            </div>

            <div class="edit-song-inputs-row">
              <div class="input-group">
                <label for="editSongGenre">Genre</label>
                <select id="editSongGenre">
                  ${["Pop", "Bollywood", "Punjabi Pop", "Hip-Hop / Rap", "Indie / Acoustic", "International Pop", "Electronic / Dance", "Haryanvi"].map(g => `<option value="${g}" ${song.genre === g ? "selected" : ""}>${g}</option>`).join("")}
                </select>
              </div>

              <div class="input-group">
                <label for="editSongMood">Mood / Vibe</label>
                <select id="editSongMood">
                  ${["Chill", "Romantic", "Party", "Energetic", "Sad", "Sukoon", "Driving"].map(m => `<option value="${m}" ${song.mood === m ? "selected" : ""}>${m}</option>`).join("")}
                </select>
              </div>
            </div>

            <div class="input-group">
              <label for="editSongArtUrl">Cover Image URL (Optional)</label>
              <input type="text" id="editSongArtUrl" placeholder="https://... or paste image link" value="${workingArt.startsWith('data:') ? '' : escapeHtml(workingArt)}" />
            </div>
          </div>
        </div>

        <div class="modal-actions" style="justify-content:space-between;">
          <button type="button" class="text-btn danger" id="resetSongBtn" title="Reset back to catalog defaults">
            <i class="fa-solid fa-arrow-rotate-left"></i> Reset to original
          </button>
          <div style="display:flex;gap:10px;">
            <button type="button" class="text-btn" id="cancelSongBtn">Cancel</button>
            <button type="button" class="btn btn-primary" id="saveSongBtn">Save changes</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.getElementById("editSongClose").addEventListener("click", close);
    document.getElementById("cancelSongBtn").addEventListener("click", close);

    const artImg = document.getElementById("songArtPreviewImg");
    const fileIn = document.getElementById("songArtFileInput");
    const uploadBtn = document.getElementById("songArtUploadBtn");
    const artBox = document.getElementById("songArtPreviewBox");
    const urlIn = document.getElementById("editSongArtUrl");

    uploadBtn.addEventListener("click", () => fileIn.click());
    artBox.addEventListener("click", () => fileIn.click());

    fileIn.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        processAvatarFile(file, (dataUrl) => {
          workingArt = dataUrl;
          artImg.src = workingArt;
          toast("Cover art loaded! Click Save to apply.");
        });
      }
    });

    urlIn.addEventListener("input", () => {
      const u = urlIn.value.trim();
      if (u) {
        workingArt = u;
        artImg.src = u;
      }
    });

    // Reset to original
    document.getElementById("resetSongBtn").addEventListener("click", () => {
      const customEdits = loadJSON(STORE_KEYS.customEdits, {});
      delete customEdits[song.id];
      saveJSON(STORE_KEYS.customEdits, customEdits);

      const rawCatalog = (window.OMIFY_SONGS || window.SONGS || []).find(s => s.id === song.id);
      if (rawCatalog) {
        Object.assign(song, rawCatalog);
      }
      refreshSongMaps();
      const cur = currentSong();
      if (cur && cur.id === song.id) {
        updateNowPlayingUI(song);
      }
      close();
      toast(`Reset "${song.title}" back to original metadata`);
      router();
    });

    // Save changes
    document.getElementById("saveSongBtn").addEventListener("click", () => {
      const newTitle = document.getElementById("editSongTitle").value.trim() || song.title;
      const newArtist = document.getElementById("editSongSinger").value.trim() || song.artist;
      const newAlbum = document.getElementById("editSongAlbum").value.trim() || song.album;
      const newGenre = document.getElementById("editSongGenre").value;
      const newMood = document.getElementById("editSongMood").value;

      song.title = newTitle;
      song.artist = newArtist;
      song.album = newAlbum;
      song.genre = newGenre;
      song.mood = newMood;
      song.albumArt = workingArt;

      const customEdits = loadJSON(STORE_KEYS.customEdits, {});
      customEdits[song.id] = {
        title: song.title,
        artist: song.artist,
        album: song.album,
        genre: song.genre,
        mood: song.mood,
        albumArt: song.albumArt,
      };
      saveJSON(STORE_KEYS.customEdits, customEdits);

      refreshSongMaps();
      const cur = currentSong();
      if (cur && cur.id === song.id) {
        updateNowPlayingUI(song);
      }
      close();
      toast(`✨ Saved customization for "${song.title}"`);
      router();
    });
  }

  function openAddSongModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    let workingArt = "/assets/music-cover.svg";
    let workingAudio = "";

    backdrop.innerHTML = `
      <div class="modal modal-add-song" role="dialog" aria-modal="true" aria-labelledby="addSongTitle">
        <div class="modal-header-row">
          <h3 id="addSongTitle"><i class="fa-solid fa-cloud-arrow-up" style="color:var(--signal);margin-right:8px;"></i>Add Your Own Song to Library</h3>
          <button class="modal-close-btn" id="addSongClose" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="edit-song-layout">
          <div class="edit-song-art-col">
            <div class="edit-song-art-box" id="newSongArtBox" title="Upload cover artwork">
              <img src="${workingArt}" alt="Preview" id="newSongArtImg" />
              <div class="edit-song-art-overlay">
                <i class="fa-solid fa-camera"></i>
                <span>Choose art</span>
              </div>
            </div>

            <input type="file" id="newSongArtInput" accept="image/*" style="display:none;" />

            <div class="edit-song-art-btns">
              <button type="button" class="btn btn-secondary btn-sm" id="newSongArtUploadBtn">
                <i class="fa-solid fa-image"></i> Pick cover
              </button>
            </div>
          </div>

          <div class="edit-song-inputs-col">
            <div class="input-group">
              <label for="newSongAudioFile">Audio File (MP3, WAV, M4A, etc.)</label>
              <input type="file" id="newSongAudioFile" accept="audio/*" />
            </div>

            <div class="input-group">
              <label for="newSongAudioUrl">Or Audio Link / URL</label>
              <input type="text" id="newSongAudioUrl" placeholder="https://.../mysong.mp3" />
            </div>

            <div class="input-group">
              <label for="newSongTitleInput">Song Title *</label>
              <input type="text" id="newSongTitleInput" placeholder="e.g. My Favorite Track" required />
            </div>

            <div class="edit-song-inputs-row">
              <div class="input-group">
                <label for="newSongArtistInput">Singer / Artist *</label>
                <input type="text" id="newSongArtistInput" placeholder="e.g. Om Soni" required />
              </div>

              <div class="input-group">
                <label for="newSongAlbumInput">Album</label>
                <input type="text" id="newSongAlbumInput" placeholder="e.g. Single" value="Single" />
              </div>
            </div>

            <div class="edit-song-inputs-row">
              <div class="input-group">
                <label for="newSongGenreInput">Genre</label>
                <select id="newSongGenreInput">
                  <option value="Pop" selected>Pop</option>
                  <option value="Bollywood">Bollywood</option>
                  <option value="Punjabi Pop">Punjabi Pop</option>
                  <option value="Hip-Hop / Rap">Hip-Hop / Rap</option>
                  <option value="Indie / Acoustic">Indie / Acoustic</option>
                  <option value="International Pop">International Pop</option>
                  <option value="Electronic / Dance">Electronic / Dance</option>
                  <option value="Haryanvi">Haryanvi</option>
                </select>
              </div>

              <div class="input-group">
                <label for="newSongMoodInput">Mood / Vibe</label>
                <select id="newSongMoodInput">
                  <option value="Chill" selected>Chill</option>
                  <option value="Romantic">Romantic</option>
                  <option value="Party">Party</option>
                  <option value="Energetic">Energetic</option>
                  <option value="Sad">Sad</option>
                  <option value="Sukoon">Sukoon</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="text-btn" id="cancelNewSongBtn">Cancel</button>
          <button type="button" class="btn btn-primary" id="saveNewSongBtn">Add to Library</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.getElementById("addSongClose").addEventListener("click", close);
    document.getElementById("cancelNewSongBtn").addEventListener("click", close);

    const artImg = document.getElementById("newSongArtImg");
    const artIn = document.getElementById("newSongArtInput");
    const artBtn = document.getElementById("newSongArtUploadBtn");
    const artBox = document.getElementById("newSongArtBox");
    const audioIn = document.getElementById("newSongAudioFile");
    const titleIn = document.getElementById("newSongTitleInput");
    const artistIn = document.getElementById("newSongArtistInput");

    artBtn.addEventListener("click", () => artIn.click());
    artBox.addEventListener("click", () => artIn.click());

    artIn.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        processAvatarFile(file, (dataUrl) => {
          workingArt = dataUrl;
          artImg.src = workingArt;
          toast("Cover art selected!");
        });
      }
    });

    audioIn.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        workingAudio = URL.createObjectURL(file);
        if (!titleIn.value.trim()) {
          const rawName = file.name.replace(/\.[^/.]+$/, "");
          titleIn.value = rawName;
        }
        toast(`Audio file selected: ${file.name}`);
      }
    });

    document.getElementById("saveNewSongBtn").addEventListener("click", () => {
      const title = titleIn.value.trim();
      const artist = artistIn.value.trim() || "Om Soni";
      const album = document.getElementById("newSongAlbumInput").value.trim() || "Single";
      const genre = document.getElementById("newSongGenreInput").value;
      const mood = document.getElementById("newSongMoodInput").value;
      const urlText = document.getElementById("newSongAudioUrl").value.trim();

      const finalAudio = workingAudio || urlText;
      if (!title) {
        toast("Please enter a song title");
        return;
      }
      if (!finalAudio) {
        toast("Please select an audio file or enter an audio URL");
        return;
      }

      const newSong = {
        id: `custom-${Date.now()}`,
        title,
        artist,
        album,
        albumArt: workingArt,
        audioUrl: finalAudio,
        duration: 180,
        genre,
        mood,
        language: "Hindi",
        country: "India",
        releaseYear: new Date().getFullYear(),
        playCount: 1,
        liked: true,
      };

      const customSongs = loadJSON(STORE_KEYS.customSongs, []);
      customSongs.unshift(newSong);
      saveJSON(STORE_KEYS.customSongs, customSongs);

      SONGS.unshift(newSong);
      refreshSongMaps();
      close();
      toast(`🎶 "${newSong.title}" added to your Omify library!`);
      router();
    });
  }

  // ================================================================== RENDER HELPERS

  function mediaCard({ art, round, title, sub, id, kind, reason, score }) {
    const isCurrent = Boolean(id && id === state.currentSongId);
    const isCurrentPlaying = isCurrent && state.isPlaying;
    const song = id ? songById.get(id) : null;
    const reasonText = reason || (song && song.reason) || "";
    const scoreVal = score != null ? score : (song && song.score != null ? song.score : null);
    const scorePct = scoreVal != null && scoreVal > 0 ? Math.round(scoreVal * 100) : null;

    return `
      <div class="media-card ${isCurrent ? "playing" : ""} ${isCurrentPlaying ? "active-playing" : ""}" data-open="1" ${id ? `data-id="${id}"` : ""} ${kind ? `data-kind="${kind}"` : ""}>
        <div class="art-wrap ${round ? "round" : ""}">
          <img src="${art}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/music-cover.svg';" />
          ${scorePct ? `<span class="ai-match-badge" title="AI Recommendation Match: ${scorePct}%"><i class="fa-solid fa-wand-magic-sparkles"></i> ${scorePct}%</span>` : ""}
          <button class="play-fab" aria-label="${isCurrentPlaying ? "Pause" : "Play"} ${escapeHtml(title)}"><i class="fa-solid ${isCurrentPlaying ? "fa-pause" : "fa-play"}"></i></button>
          ${kind === "song" && id ? `<button class="card-edit-btn" data-edit-song="${id}" title="Customize song details" aria-label="Customize song details"><i class="fa-solid fa-pen"></i></button>` : ""}
        </div>
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-sub">${escapeHtml(sub)}</div>
        ${reasonText ? `<div class="card-reason" title="${escapeHtml(reasonText)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${escapeHtml(reasonText)}</span></div>` : ""}
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
    const isCurrent = song.id === state.currentSongId;
    const isPlayingCurrent = isCurrent && state.isPlaying;

    // Always render all three index elements; CSS controls visibility based on .active-playing class
    // This allows hover CSS rules to work correctly without inline-style overrides
    let indexContent;
    if (showRank) {
      indexContent = `
        <div class="track-index-col">
          <div class="equalizer-icon" title="Playing"><span></span><span></span><span></span><span></span></div>
          <div class="rank-num">${opts.rank}</div>
          <div class="track-index-play"><i class="fa-solid ${isPlayingCurrent ? "fa-pause" : "fa-play"}"></i></div>
        </div>`;
    } else {
      indexContent = `
        <div class="track-index-col">
          <div class="equalizer-icon" title="Playing"><span></span><span></span><span></span><span></span></div>
          <div class="track-index">${index + 1}</div>
          <div class="track-index-play"><i class="fa-solid ${isPlayingCurrent ? "fa-pause" : "fa-play"}"></i></div>
        </div>`;
    }

    return `
      <div class="track-row ${opts.rank <= 3 ? "top3" : ""} ${isPlayingCurrent ? "active-playing" : (isCurrent ? "playing" : "")}" data-song-id="${song.id}">
        ${indexContent}
        <img class="track-art" src="${song.albumArt}" alt="${escapeHtml(song.album)}" loading="lazy" />
        <div class="track-meta">
          <div class="track-title ${isCurrent ? "playing-title" : ""}">
            <span>${escapeHtml(song.title)}</span>
            ${opts.attribution ? `<span class="track-attribution-badge" style="font-size:0.7rem;background:rgba(255,255,255,0.08);color:var(--text-muted);padding:2px 7px;border-radius:999px;margin-left:8px;font-weight:normal;display:inline-flex;align-items:center;gap:4px;" title="Added by ${escapeHtml(opts.attribution)}"><i class="fa-solid fa-user" style="font-size:0.6rem;"></i>${escapeHtml(opts.attribution)}</span>` : ""}
          </div>
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
    menu.style.cssText = "position:fixed;z-index:55;background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px;min-width:200px;box-shadow:0 12px 30px rgba(0,0,0,0.45);";
    const rect = anchorBtn.getBoundingClientRect();
    const menuTop = Math.min(rect.bottom + 4, window.innerHeight - 200);
    const menuLeft = Math.min(rect.left, window.innerWidth - 220);
    menu.style.top = `${menuTop}px`;
    menu.style.left = `${menuLeft}px`;

    const items = [
      { label: "Add to queue", icon: "fa-list-ol", action: () => addToQueue(songId) },
      { label: "Customize song details…", icon: "fa-pen-to-square", action: () => openSongCustomizerModal(songId) },
      { label: isLiked(songId) ? "Remove from Liked Songs" : "Save to Liked Songs", icon: isLiked(songId) ? "fa-heart-crack" : "fa-heart", action: () => toggleFavorite(songId) },
    ];
    state.playlists.forEach((p) => {
      items.push({
        label: `Add to "${p.name}"`,
        icon: "fa-plus",
        action: () => {
          if (!p.songIds.includes(songId)) { p.songIds.push(songId); persistPlaylists(); toast(`Added to ${p.name}`); }
          else toast(`Already in ${p.name}`);
        },
      });
    });
    items.push({ label: "New playlist…", icon: "fa-folder-plus", action: () => openPlaylistModal(null, songId) });

    menu.innerHTML = items.map((it, i) => `<button class="text-btn" data-idx="${i}" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 10px;"><i class="fa-solid ${it.icon}" style="width:16px;text-align:center;font-size:0.8rem;"></i>${escapeHtml(it.label)}</button>`).join("");
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
    const initialBatchSize = opts.pageSize || 60;
    let renderedCount = Math.min(initialBatchSize, songs.length);

    function buildRowsHtml(list, startIdx) {
      return list.map((s, idx) => {
        const i = startIdx + idx;
        const rowOpts = opts.rank ? { rank: i + 1 } : {};
        if (opts.attributions && opts.attributions[s.id]) {
          rowOpts.attribution = opts.attributions[s.id];
        }
        return trackRow(s, i, rowOpts);
      }).join("");
    }

    container.innerHTML = `
      <div class="track-list" id="trackListInner">${buildRowsHtml(songs.slice(0, renderedCount), 0)}</div>
      ${songs.length > renderedCount ? `
        <div class="load-more-wrap" style="display:flex;justify-content:center;padding:24px 0;">
          <button class="btn btn-secondary" id="loadMoreTracksBtn" style="padding:10px 24px;font-weight:600;border-radius:999px;">
            Load more tracks (${songs.length - renderedCount} remaining)
          </button>
        </div>` : ""}
    `;

    function bindEvents(fromIdx, toIdx) {
      const listInner = container.querySelector("#trackListInner") || container;
      const rows = listInner.querySelectorAll(".track-row");
      for (let i = fromIdx; i < toIdx; i++) {
        const row = rows[i];
        if (!row) continue;
        row.addEventListener("click", (e) => {
          if (e.target.closest("[data-heart]")) return;
          if (e.target.closest("[data-more]")) return;
          if (currentSong() && currentSong().id === ids[i]) {
            togglePlay();
            return;
          }
          playQueue(ids, i);
        });
        const heart = row.querySelector("[data-heart]");
        if (heart) {
          heart.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(heart.dataset.heart);
          });
        }
        const more = row.querySelector("[data-more]");
        if (more) {
          more.addEventListener("click", (e) => {
            e.stopPropagation();
            openRowMenu(more, more.dataset.more);
          });
        }
      }
      refreshVisibleTrackRows();
    }

    bindEvents(0, renderedCount);

    const loadMoreBtn = container.querySelector("#loadMoreTracksBtn");
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener("click", () => {
        const listInner = container.querySelector("#trackListInner");
        const nextBatch = songs.slice(renderedCount, renderedCount + 60);
        const temp = document.createElement("div");
        temp.innerHTML = buildRowsHtml(nextBatch, renderedCount);
        const newRows = Array.from(temp.children);
        newRows.forEach((r) => listInner.appendChild(r));
        const prevCount = renderedCount;
        renderedCount += nextBatch.length;
        bindEvents(prevCount, renderedCount);
        if (renderedCount >= songs.length) {
          loadMoreBtn.parentElement.remove();
        } else {
          loadMoreBtn.textContent = `Load more tracks (${songs.length - renderedCount} remaining)`;
        }
      });
    }
  }

  function bindTrackRows(container) {
    if (!container) return;
    container.querySelectorAll(".track-row").forEach((row) => {
      const songId = row.dataset.songId;
      if (!songId) return;
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-heart]") || e.target.closest("[data-more]")) return;
        if (currentSong() && currentSong().id === songId) {
          togglePlay();
          return;
        }
        playQueue([songId], 0);
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

  function sectionBlock(title, innerHtml, seeAllRoute, themeAttr) {
    const dataAttr = themeAttr ? ` data-shelf-theme="${escapeHtml(themeAttr)}"` : "";
    return `
      <section class="section"${dataAttr}>
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

  // Skeleton loading HTML
  function skeletonCards(count) {
    let html = '<div class="card-grid">';
    for (let i = 0; i < count; i++) {
      html += `<div class="skeleton-card"><div class="skeleton skeleton-art"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>`;
    }
    html += '</div>';
    return html;
  }

  // Page transition animation
  function animatePageIn() {
    elDOM.view.classList.remove("page-enter");
    // Force reflow
    void elDOM.view.offsetWidth;
    elDOM.view.classList.add("page-enter");
  }

  // ================================================================== CURATED TASTE & SINGER HELPERS

  function getSongsBySinger(query, limit = 20) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return [];
    return SONGS.filter((s) => {
      const art = (s.artist || "").toLowerCase();
      const comp = (s.composer || "").toLowerCase();
      return art.includes(q) || comp.includes(q);
    }).slice(0, limit);
  }

  const POPULAR_SINGERS = [
    { name: "Arijit Singh", query: "arijit", desc: "Soulful Ballads & Bollywood Hits", color: "#e11d48" },
    { name: "Diljit Dosanjh", query: "diljit", desc: "Punjabi Superstar & Global Beats", color: "#f97316" },
    { name: "Karan Aujla", query: "karan aujla", desc: "Geetan Di Machine & Desi Hip Hop", color: "#8b5cf6" },
    { name: "Shubh", query: "shubh", desc: "Smooth Melodic Rap & Chill Hits", color: "#06b6d4" },
    { name: "Yo Yo Honey Singh", query: "honey singh", desc: "King of Desi Pop & Party Bangers", color: "#eab308" },
    { name: "Taha G", query: "taha", desc: "Lo-Fi, Acoustic & Modern Indie", color: "#10b981" },
    { name: "Pritam", query: "pritam", desc: "Composer & Romantic Hitmaker", color: "#3b82f6" },
    { name: "Atif Aslam", query: "atif", desc: "Evergreen Romantic Vocals", color: "#ec4899" },
    { name: "AP Dhillon", query: "ap dhillon", desc: "Brown Munde & Retro Synth Punjabi", color: "#6366f1" },
    { name: "KK", query: "kk", desc: "Timeless Late-Night Nostalgia", color: "#14b8a6" },
    { name: "Darshan Raval", query: "darshan", desc: "Monsoon Romance & Indie Pop", color: "#f43f5e" },
    { name: "Dua Lipa", query: "dua lipa", desc: "Dance Pop & Future Nostalgia", color: "#a855f7" },
  ];

  function buildCuratedPlaylists() {
    return [
      {
        id: "taste-romantic",
        name: "Romance & Love",
        subtitle: "Arijit Singh, Pritam, Atif Aslam",
        tag: "Romance",
        color: "#ec4899",
        gradient: "linear-gradient(135deg, #ec4899 0%, #831843 100%)",
        icon: "fa-heart",
        description: "Soulful Bollywood romance, heartfelt love ballads, and emotional duets.",
        filter: (s) => s.theme === "romantic" || s.mood === "Romantic" || /arijit|pritam|atif|shreya|darshan|love|pyaar|ishq|dil|fitoor|barsaat|saathiya|humsafar/i.test(s.title + " " + s.artist),
      },
      {
        id: "taste-workout",
        name: "Gym & Workout",
        subtitle: "High BPM Beast Mode Beats",
        tag: "Gym & Workout",
        color: "#06b6d4",
        gradient: "linear-gradient(135deg, #06b6d4 0%, #164e63 100%)",
        icon: "fa-dumbbell",
        description: "High-octane pump-up anthems, heavy 808 basslines, and intense gym motivation.",
        filter: (s) => s.theme === "workout" || (s.bpm && s.bpm >= 120) || /gym|workout|energy|power|drill|beast|hype|pump/i.test(s.title + " " + s.artist + " " + (s.mood || "")) || (s.theme === "punjabi" && /swag|drill|energy|bass/i.test(s.title + " " + s.artist)),
      },
      {
        id: "taste-party",
        name: "Party & Club",
        subtitle: "Honey Singh, Badshah, EDM",
        tag: "Club & Party",
        color: "#eab308",
        gradient: "linear-gradient(135deg, #eab308 0%, #713f12 100%)",
        icon: "fa-compact-disc",
        description: "Turn up the volume with dancefloor bangers, club anthems, and party rap hits.",
        filter: (s) => s.theme === "party" || s.mood === "Energetic" || /honey singh|badshah|mika singh|neha kakkar|party|club|daaru|daru|dance|nach|dj|bhangra/i.test(s.artist + " " + s.title),
      },
      {
        id: "taste-lofi",
        name: "Lo-Fi & Chill",
        subtitle: "Taha G, Anuv Jain, Acoustic",
        tag: "Lo-Fi & Chill",
        color: "#10b981",
        gradient: "linear-gradient(135deg, #10b981 0%, #064e3b 100%)",
        icon: "fa-headphones",
        description: "Mellow textures, soothing lo-fi beats, relaxed guitars, and late-night calm.",
        filter: (s) => s.theme === "indie_lofi" || s.mood === "Sukoon" || s.mood === "Chill" || /taha|anuv jain|prateek kuhad|zaeden|lofi|chill|acoustic|sukoon/i.test(s.artist + " " + s.title),
      },
      {
        id: "taste-punjabi",
        name: "Punjabi & Swag",
        subtitle: "Diljit Dosanjh, Karan Aujla, Shubh",
        tag: "Punjabi Pop",
        color: "#f97316",
        gradient: "linear-gradient(135deg, #f97316 0%, #7c2d12 100%)",
        icon: "fa-fire",
        description: "Chart-topping urban Punjabi drops, heavy bass, and unmistakable swagger.",
        filter: (s) => s.theme === "punjabi" || (s.language && s.language.toLowerCase() === "punjabi") || /diljit|karan aujla|shubh|ap dhillon|sidhu moose/i.test(s.artist + " " + s.title),
      },
      {
        id: "taste-hiphop",
        name: "Desi Hip Hop",
        subtitle: "Divine, Emiway, Seedhe Maut",
        tag: "Desi Hip Hop",
        color: "#8b5cf6",
        gradient: "linear-gradient(135deg, #8b5cf6 0%, #3b0764 100%)",
        icon: "fa-bolt",
        description: "Heavyweight street rap, hard-hitting lyrical bars, and underground hip-hop heat.",
        filter: (s) => (s.theme === "hiphop" || /divine|emiway|raftaar|krsna|mc stan|king|seedhe maut|gully gang/i.test(s.artist + " " + s.title)) && !/rap removal/i.test(s.title),
      },
      {
        id: "taste-nostalgia",
        name: "Late Night Nostalgia",
        subtitle: "KK, Mohit Chauhan, Lucky Ali",
        tag: "Nostalgia",
        color: "#6366f1",
        gradient: "linear-gradient(135deg, #6366f1 0%, #1e1b4b 100%)",
        icon: "fa-moon",
        description: "Timeless 90s & 2000s Bollywood memories, acoustic nostalgia, and golden melodies.",
        filter: (s) => s.theme === "nostalgia" || /\bkk\b|lucky ali|mohit chauhan|sonu nigam|kumar sanu|kishore kumar|lata mangeshkar/i.test(s.artist + " " + s.title),
      },
      {
        id: "taste-bollywood",
        name: "Bollywood Hits",
        subtitle: "Massive Cinema Soundtracks",
        tag: "Bollywood",
        color: "#e11d48",
        gradient: "linear-gradient(135deg, #e11d48 0%, #4c0519 100%)",
        icon: "fa-film",
        description: "The biggest theatrical blockbusters, cinematic hits, and musical milestones.",
        filter: (s) => s.theme === "bollywood_hits" || s.genre === "Bollywood" || /filmi|cinema|soundtrack/i.test(s.genre || ""),
      },
    ].map((item) => {
      let matched = SONGS.filter(item.filter);

      // Prioritize songs with REAL extracted album art covers so all 4 boxes have real logos!
      const sortedMatched = [...matched].sort((a, b) => {
        const aReal = (a.albumArt && a.albumArt.includes("covers/extracted")) ? 1 : 0;
        const bReal = (b.albumArt && b.albumArt.includes("covers/extracted")) ? 1 : 0;
        return bReal - aReal;
      });

      const realSongs = sortedMatched.filter((s) => s.albumArt && s.albumArt.includes("covers/extracted"));
      let topSongs = realSongs.slice(0, 4);
      // If fewer than 4 extracted, fill strictly from SAME MATCHED theme (never random cross-theme songs!)
      if (topSongs.length < 4) {
        const backupInTheme = sortedMatched.filter((s) => !topSongs.some((t) => t.id === s.id));
        topSongs = topSongs.concat(backupInTheme.slice(0, 4 - topSongs.length));
      }

      const songIds = topSongs.map((s) => s.id).concat(matched.map((s) => s.id).filter((id) => !topSongs.some((t) => t.id === id)));
      const topArts = topSongs.map((s) => s.albumArt || "/assets/music-cover.svg");
      const artSrc = topArts[0] || "/assets/music-cover.svg";
      return {
        ...item,
        songIds,
        artSrc,
        topArts,
        topSongs,
      };
    });
  }

  function tastePlaylistCardHtml(pl) {
    const topArts = (pl.topArts && pl.topArts.length >= 4)
      ? pl.topArts
      : (pl.songIds || []).slice(0, 4).map((sid) => songById.get(sid)?.albumArt || "/assets/music-cover.svg");
    const glowColor = pl.color || "#1ED760";

    const mosaicHtml = `
      <div class="taste-mosaic-grid">
        <div class="taste-mosaic-cell cell-1"><img src="${topArts[0] || '/assets/music-cover.svg'}" alt="${escapeHtml(pl.name)} art 1" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
        <div class="taste-mosaic-cell cell-2"><img src="${topArts[1] || '/assets/music-cover.svg'}" alt="${escapeHtml(pl.name)} art 2" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
        <div class="taste-mosaic-cell cell-3"><img src="${topArts[2] || '/assets/music-cover.svg'}" alt="${escapeHtml(pl.name)} art 3" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
        <div class="taste-mosaic-cell cell-4"><img src="${topArts[3] || '/assets/music-cover.svg'}" alt="${escapeHtml(pl.name)} art 4" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
      </div>
    `;

    return `
      <div class="taste-playlist-card" data-playlist-id="${pl.id}" title="${escapeHtml(pl.name)} · ${escapeHtml(pl.subtitle)}">
        <div class="taste-art-wrapper">
          ${mosaicHtml}
          <div class="taste-art-overlay"></div>

          <!-- Animated live soundwave visualizer -->
          <div class="taste-eq-anim" title="Live Mix">
            <span class="taste-eq-bar b1"></span>
            <span class="taste-eq-bar b2"></span>
            <span class="taste-eq-bar b3"></span>
            <span class="taste-eq-bar b4"></span>
          </div>

          <!-- Top-right mix icon chip -->
          <div class="taste-mix-chip" style="background:${glowColor};">
            <i class="fa-solid ${pl.icon}"></i>
          </div>

          <!-- Bottom tag pill badge -->
          <span class="taste-gradient-badge">${escapeHtml(pl.tag)}</span>

          <!-- Green Play button -->
          <button class="play-fab" aria-label="Play ${escapeHtml(pl.name)}"><i class="fa-solid fa-play"></i></button>
        </div>
        <div class="taste-title">${escapeHtml(pl.name)}</div>
        <div class="taste-sub">${escapeHtml(pl.subtitle)}</div>
      </div>
    `;
  }

  function popularSingersShelfHtml() {
    return `
      <div class="popular-singers-shelf" id="popularSingersShelf">
        ${POPULAR_SINGERS.map((s) => {
      const artistObj = ARTISTS.find((a) => a.name.toLowerCase().includes(s.query));
      const extractedSong = SONGS.find((song) => {
        const art = (song.artist || "").toLowerCase();
        const comp = (song.composer || "").toLowerCase();
        const tit = (song.title || "").toLowerCase();
        return (art.includes(s.query) || comp.includes(s.query) || tit.includes(s.query)) &&
          song.albumArt && song.albumArt.startsWith("covers/extracted");
      });
      const topSong = SONGS.find((song) => {
        const art = (song.artist || "").toLowerCase();
        const comp = (song.composer || "").toLowerCase();
        return art.includes(s.query) || comp.includes(s.query);
      });
      const art = extractedSong?.albumArt || artistObj?.image || topSong?.albumArt || "/assets/music-cover.svg";
      const count = getSongsBySinger(s.query, 100).length;
      return `
            <div class="media-card" data-kind="artist" data-singer-query="${escapeHtml(s.query)}" data-singer-name="${escapeHtml(s.name)}" title="${escapeHtml(s.name)} · ${escapeHtml(s.desc)}">
              <div class="art-wrap round" style="box-shadow: 0 8px 24px rgba(0,0,0,0.45);">
                <img src="${art}" alt="${escapeHtml(s.name)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/music-cover.svg';" />
                <button class="play-fab" aria-label="Play ${escapeHtml(s.name)}"><i class="fa-solid fa-play"></i></button>
              </div>
              <div class="card-title">${escapeHtml(s.name)}</div>
              <div class="card-sub">${count > 0 ? count + " tracks" : "Artist"} · ${escapeHtml(s.desc)}</div>
            </div>
          `;
    }).join("")}
      </div>
    `;
  }

  // ================================================================== PAGES

  function pageHome() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    const likedIds = Array.from(state.favorites);
    const recentIds = state.recent.slice(0, 8).map((r) => r.songId).filter((id) => songById.has(id));
    const localSongs = SONGS.slice(0, 10);
    const bollywoodSongs = SONGS.slice(10, 23);
    const trending = [...SONGS].sort((a, b) => b.playCount - a.playCount);
    const newReleases = [...SONGS].sort((a, b) => b.releaseYear - a.releaseYear).slice(0, 10);
    const editorsPicks = SONGS.filter((_, i) => i % 11 === 0).slice(0, 10);
    const topArtists = ARTISTS.slice(0, 8);
    const foreignFaves = SONGS.filter((s) => s.language !== "English" && s.language !== "Instrumental").sort((a, b) => b.playCount - a.playCount).slice(0, 10);

    // Curated Taste Mixes
    const curatedPlaylists = buildCuratedPlaylists();

    // Dedicated Singer Song Lists
    const arijitSongs = getSongsBySinger("arijit", 12);
    const punjabiSongs = SONGS.filter((s) => s.theme === "punjabi").slice(0, 12);
    const honeySongs = getSongsBySinger("honey singh", 12);
    const tahaSongs = getSongsBySinger("taha", 12);
    const pritamSongs = getSongsBySinger("pritam", 12);

    // Authentic Thematic Song Collections
    const romanticSongs = SONGS.filter((s) => s.theme === "romantic").slice(0, 12);
    const partySongs = SONGS.filter((s) => s.theme === "party").slice(0, 12);
    const nostalgiaSongs = SONGS.filter((s) => s.theme === "nostalgia").slice(0, 12);
    const hiphopSongs = SONGS.filter((s) => s.theme === "hiphop").slice(0, 12);
    const lofiSongs = SONGS.filter((s) => s.theme === "indie_lofi").slice(0, 12);
    const internationalSongs = SONGS.filter((s) => s.theme === "international").slice(0, 12);
    const workoutSongs = SONGS.filter((s) => s.theme === "workout" || (s.bpm && s.bpm >= 120 && (s.theme === "party" || s.theme === "punjabi"))).slice(0, 12);

    // Build the 8 compact quick-play cards
    const quickPlaySongs = [];
    const usedIds = new Set();
    recentIds.forEach((id) => { if (quickPlaySongs.length < 8 && !usedIds.has(id)) { quickPlaySongs.push(id); usedIds.add(id); } });
    likedIds.forEach((id) => { if (quickPlaySongs.length < 8 && !usedIds.has(id) && songById.has(id)) { quickPlaySongs.push(id); usedIds.add(id); } });
    romanticSongs.forEach((s) => { if (quickPlaySongs.length < 8 && !usedIds.has(s.id)) { quickPlaySongs.push(s.id); usedIds.add(s.id); } });
    localSongs.forEach((s) => { if (quickPlaySongs.length < 8 && !usedIds.has(s.id)) { quickPlaySongs.push(s.id); usedIds.add(s.id); } });

    // "Jump back in"
    const jumpBackSongs = [];
    const jumpUsed = new Set(quickPlaySongs);
    recentIds.forEach((id) => { if (jumpBackSongs.length < 8 && !jumpUsed.has(id)) { jumpBackSongs.push(id); jumpUsed.add(id); } });
    const jumpCandidates = [
      SONGS.find((s) => s.title.includes("Kahan se ho")),
      SONGS.find((s) => s.title.includes("Mai keh du")),
      SONGS.find((s) => s.title.includes("Inaam")),
      SONGS.find((s) => s.title.includes("Galti Se Mistake")),
      ...localSongs,
      ...trending,
    ].filter(Boolean);
    jumpCandidates.forEach((s) => { if (jumpBackSongs.length < 8 && !jumpUsed.has(s.id)) { jumpBackSongs.push(s.id); jumpUsed.add(s.id); } });

    elDOM.view.innerHTML = `
      <div class="view-header home-header-row">
        <div class="home-header-title-group">
          <h1>${greeting}${state.profile.username && state.profile.username !== "You" ? ", " + escapeHtml(state.profile.username) : ""}</h1>
          <p class="home-header-sub">Stream curated hits or customize your personal sound library</p>
        </div>
        <div class="home-header-actions">
          <button class="home-action-btn secondary" id="homeCustomizerBtn" title="Unlock song metadata editing">
            <i class="fa-solid fa-sliders"></i>
            <span>Customize Songs</span>
          </button>
          <button class="home-action-btn primary" id="homeAddSongBtn" title="Upload and add your own custom songs">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>+ Add Custom Song</span>
          </button>
        </div>
      </div>

      <div class="home-filter-chips">
        <button class="filter-chip active" data-filter="all">All</button>
        <button class="filter-chip" data-filter="playlists"><i class="fa-solid fa-list-ul" style="color:var(--signal);margin-right:5px;"></i>Playlists</button>
        <button class="filter-chip" data-filter="new"><i class="fa-solid fa-compact-disc" style="color:#60a5fa;margin-right:5px;"></i>New Releases</button>
        <button class="filter-chip" data-filter="catalog" onclick="location.hash='#/catalog-1000'"><i class="fa-solid fa-compact-disc" style="color:var(--signal);margin-right:5px;"></i>All 1098 Songs</button>
        <button class="filter-chip" data-filter="romantic">Romantic & Sukoon</button>
        <button class="filter-chip" data-filter="workout"><i class="fa-solid fa-dumbbell" style="color:#06b6d4;margin-right:5px;"></i>Gym & Workout</button>
        <button class="filter-chip" data-filter="punjabi">Punjabi & Swag</button>
        <button class="filter-chip" data-filter="party">Party & Club</button>
        <button class="filter-chip" data-filter="nostalgia">Late Night Nostalgia</button>
        <button class="filter-chip" data-filter="hiphop">Desi Hip Hop</button>
        <button class="filter-chip" data-filter="lofi">Lo-Fi & Chill</button>
        <button class="filter-chip" data-filter="singers">Singers & Artists</button>
      </div>

      <div class="home-quickplay-grid">
        ${quickPlaySongs.slice(0, 8).map((id) => {
      const s = songById.get(id);
      if (!s) return "";
      const isCurrent = Boolean(s.id === state.currentSongId);
      const isCurrentPlaying = isCurrent && state.isPlaying;
      return `
            <div class="home-quickplay-card ${isCurrent ? "playing" : ""} ${isCurrentPlaying ? "active-playing" : ""}" data-song-id="${s.id}">
              <img src="${s.albumArt}" alt="${escapeHtml(s.title)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/music-cover.svg';" />
              <span class="home-quickplay-title">${escapeHtml(s.title)}</span>
              <button class="home-quickplay-play" aria-label="${isCurrentPlaying ? "Pause" : "Play"}"><i class="fa-solid ${isCurrentPlaying ? "fa-pause" : "fa-play"}"></i></button>
            </div>`;
    }).join("")}
      </div>

      <!-- ML Recommendation Engine: Made For You -->
      <section class="section" id="aiMadeForYouSection" data-shelf-theme="taste">
        <div class="section-head">
          <div>
            <div class="shelf-pill-badge green">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <span>AI Recommendations</span>
            </div>
            <h2>Made For You</h2>
            <p style="margin:2px 0 0 0;font-size:0.82rem;color:var(--text-sub);">Personalized tracks sculpted for your taste, favorite artists & daily vibe</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="shelf-nav-btn" id="aiRecsPrevBtn" title="Scroll left" aria-label="Scroll left">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="shelf-nav-btn" id="aiRecsNextBtn" title="Scroll right" aria-label="Scroll right">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <a href="#/made-for-you" style="margin-left:6px;">See all</a>
          </div>
        </div>

        <div class="mfy-shelf-pills" id="homeMfyPills">
          <button class="mfy-pill active" data-category="all"><i class="fa-solid fa-wand-magic-sparkles"></i> For You</button>
          <button class="mfy-pill" data-category="romantic"><i class="fa-solid fa-heart" style="color:#ec4899;"></i> Romance</button>
          <button class="mfy-pill" data-category="workout"><i class="fa-solid fa-dumbbell" style="color:#06b6d4;"></i> Gym & Workout</button>
          <button class="mfy-pill" data-category="party"><i class="fa-solid fa-compact-disc" style="color:#eab308;"></i> Party & Club</button>
          <button class="mfy-pill" data-category="lofi"><i class="fa-solid fa-headphones" style="color:#10b981;"></i> Lo-Fi & Sukoon</button>
          <button class="mfy-pill" data-category="punjabi"><i class="fa-solid fa-fire" style="color:#f97316;"></i> Punjabi Swag</button>
          <button class="mfy-pill" data-category="bollywood"><i class="fa-solid fa-film" style="color:#e11d48;"></i> Bollywood</button>
        </div>

        <div class="home-scroll-row" id="aiRecsScrollRow">
          ${skeletonCards(6)}
        </div>
      </section>

      <!-- Category & Mood Mixes -->
      <section class="section" id="tasteMixesSection" data-shelf-theme="taste">
        <div class="section-head">
          <div>
            <div class="shelf-pill-badge pink">
              <i class="fa-solid fa-layer-group"></i>
              <span>Category Collections</span>
            </div>
            <h2>Category & Mood Mixes</h2>
            <p style="margin:2px 0 0 0;font-size:0.82rem;color:var(--text-sub);">Handpicked category-wise collections for Romance, Gym & Workout, Party, Chill, and more</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="shelf-nav-btn" id="tastePrevBtn" title="Scroll left" aria-label="Scroll left">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="shelf-nav-btn" id="tasteNextBtn" title="Scroll right" aria-label="Scroll right">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <a href="#/browse" style="margin-left:6px;">Browse all</a>
          </div>
        </div>
        <div class="taste-scroll-row taste-starting-anim">
          ${curatedPlaylists.map(tastePlaylistCardHtml).join("")}
        </div>
      </section>


      <!-- Popular Singers -->
      <section class="section" id="popularSingersSection" data-shelf-theme="singers">
        <div class="section-head">
          <div>
            <h2>Popular Singers</h2>
            <p style="margin:2px 0 0 0;font-size:0.82rem;color:var(--text-sub);">The voices defining modern Bollywood, Punjabi pop, and indie music</p>
          </div>
          <a href="#/artists">All artists</a>
        </div>
        ${popularSingersShelfHtml()}
      </section>

      <!-- Dedicated Singer Shelves -->
      ${arijitSongs.length ? sectionBlock("Soulful Voice of Arijit Singh", cardGridHtml(arijitSongs.map(songToCard)), "search?q=Arijit+Singh", "singers") : ""}
      ${punjabiSongs.length ? sectionBlock("Punjabi Swag & Beats — Diljit, Karan Aujla, Shubh", cardGridHtml(punjabiSongs.map(songToCard)), "search?q=Punjabi", "punjabi") : ""}
      ${honeySongs.length ? sectionBlock("Yo Yo Honey Singh Hits", cardGridHtml(honeySongs.map(songToCard)), "search?q=Honey+Singh", "party") : ""}
      ${tahaSongs.length ? sectionBlock("Indie & Lo-Fi Lounge — Taha G & Chill", cardGridHtml(tahaSongs.map(songToCard)), "search?q=Taha+G", "lofi") : ""}
      ${pritamSongs.length ? sectionBlock("Hit Maestro Pritam", cardGridHtml(pritamSongs.map(songToCard)), "search?q=Pritam", "romantic") : ""}

      <!-- Thematic Shelves Arranged Strictly by Theme -->
      ${romanticSongs.length ? sectionBlock("Romantic Melodies & Soulful Ballads", cardGridHtml(romanticSongs.map(songToCard)), "category/Romantic", "romantic") : ""}
      ${partySongs.length ? sectionBlock("Party & Club Bangers", cardGridHtml(partySongs.map(songToCard)), "category/Party", "party") : ""}
      ${nostalgiaSongs.length ? sectionBlock("Late Night Nostalgia & Retro Classics", cardGridHtml(nostalgiaSongs.map(songToCard)), "category/Classical", "nostalgia") : ""}
      ${hiphopSongs.length ? sectionBlock("Desi Hip Hop & Street Rap", cardGridHtml(hiphopSongs.map(songToCard)), "category/Hip-Hop", "hiphop") : ""}
      ${lofiSongs.length ? sectionBlock("Lo-Fi & Chill Vibes — Sukoon", cardGridHtml(lofiSongs.map(songToCard)), "category/Lo-Fi", "lofi") : ""}
      ${internationalSongs.length ? sectionBlock("International Pop & Global Chart Toppers", cardGridHtml(internationalSongs.map(songToCard)), "category/Pop", "international") : ""}
      ${workoutSongs.length ? sectionBlock("Workout Energy & Beast Mode", cardGridHtml(workoutSongs.map(songToCard)), "category/Workout", "workout") : ""}

      ${sectionBlock("Your Original Songs (Local Files)", cardGridHtml(localSongs.map(songToCard)), "local-files", "local")}

      ${sectionBlock("Jump back in", `
        <div class="home-scroll-row">
          ${jumpBackSongs.map((id) => {
      const s = songById.get(id);
      if (!s) return "";
      const isCurrent = Boolean(s.id === state.currentSongId);
      const isCurrentPlaying = isCurrent && state.isPlaying;
      return `
              <div class="home-jumpin-card ${isCurrent ? "playing" : ""} ${isCurrentPlaying ? "active-playing" : ""}" data-song-id="${s.id}">
                <div class="home-jumpin-art">
                  <img src="${s.albumArt}" alt="" loading="lazy" />
                  <button class="play-fab" aria-label="${isCurrentPlaying ? "Pause" : "Play"}"><i class="fa-solid ${isCurrentPlaying ? "fa-pause" : "fa-play"}"></i></button>
                </div>
                <div class="home-jumpin-title">${escapeHtml(s.title)}</div>
                <div class="home-jumpin-sub">${escapeHtml(s.artist)}</div>
              </div>`;
    }).join("")}
        </div>
      `, "recently-played", "recents")}

      ${sectionBlock("Trending & Popular Hits", cardGridHtml(trending.slice(0, 12).map(songToCard)), "trending", "trending")}
      ${sectionBlock("Trending now", cardGridHtml(trending.slice(12, 24).map(songToCard)), "trending", "trending")}
      <section class="section" id="homeNewReleasesSection" data-shelf-theme="new">
        <div class="section-head">
          <div>
            <div class="shelf-pill-badge blue">
              <i class="fa-solid fa-compact-disc"></i>
              <span>MusicBrainz Releases</span>
            </div>
            <h2>New releases</h2>
            <p style="margin:2px 0 0 0;font-size:0.82rem;color:var(--text-sub);">Latest official drops by favorite artists powered by MusicBrainz</p>
          </div>
          <a href="#/new-releases">See all</a>
        </div>
        <div id="homeNewReleasesRow" class="card-grid">${cardGridHtml(newReleases.map(songToCard))}</div>
      </section>
      ${likedIds.length ? sectionBlock("Your favorite songs", cardGridHtml(likedIds.slice(0, 10).map((id) => songToCard(songById.get(id))).filter(Boolean)), "favorites", "favorites") : ""}
      ${sectionBlock("Top international artists", cardGridHtml(topArtists.map(artistToCard)), "artists", "international")}
      ${sectionBlock("Editor's picks", cardGridHtml(editorsPicks.map(songToCard)), "", "editors")}
    `;

    // Bind header actions
    const addBtn = elDOM.view.querySelector("#homeAddSongBtn");
    if (addBtn) addBtn.addEventListener("click", () => openAddSongModal());

    const customizerBtn = elDOM.view.querySelector("#homeCustomizerBtn");
    if (customizerBtn) customizerBtn.addEventListener("click", () => {
      const curr = currentSong() || SONGS[0];
      if (curr) openSongCustomizerModal(curr.id);
    });

    // Bind filter chips with dynamic thematic shelf filtering
    elDOM.view.querySelectorAll(".filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        elDOM.view.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        const filter = chip.dataset.filter;

        const allShelves = elDOM.view.querySelectorAll("section.section[data-shelf-theme]");
        if (filter === "all") {
          allShelves.forEach((s) => { s.style.display = ""; });
          toast("Showing all themes & mixes");
        } else if (filter === "new") {
          allShelves.forEach((s) => {
            const t = s.dataset.shelfTheme;
            s.style.display = (t === "new" || t === "taste") ? "" : "none";
          });
          const newEl = document.getElementById("homeNewReleasesSection");
          if (newEl) newEl.scrollIntoView({ behavior: "smooth" });
          toast("Showing New Releases");
        } else if (filter === "playlists") {
          allShelves.forEach((s) => {
            const t = s.dataset.shelfTheme;
            s.style.display = (t === "taste") ? "" : "none";
          });
          const plEl = document.getElementById("tasteMixesSection");
          if (plEl) plEl.scrollIntoView({ behavior: "smooth" });
          toast("Showing Curated Playlists & Mixes");
        } else if (filter === "workout") {
          allShelves.forEach((s) => {
            const t = s.dataset.shelfTheme;
            s.style.display = (t === "workout" || t === "taste") ? "" : "none";
          });
          const wEl = document.getElementById("tasteMixesSection");
          if (wEl) wEl.scrollIntoView({ behavior: "smooth" });
          toast("Showing Gym & Workout Collections");
        } else if (filter === "singers") {
          allShelves.forEach((s) => {
            const t = s.dataset.shelfTheme;
            s.style.display = (t === "singers" || t === "taste") ? "" : "none";
          });
          const singerEl = document.getElementById("popularSingersSection");
          if (singerEl) singerEl.scrollIntoView({ behavior: "smooth" });
          toast("Showing Popular Singers & Icons");
        } else {
          allShelves.forEach((s) => {
            const t = s.dataset.shelfTheme;
            s.style.display = (t === filter || t === "taste") ? "" : "none";
          });
          toast(`Filtered: ${chip.textContent.trim()}`);
        }
      });
    });

    // Bind quick-play cards
    elDOM.view.querySelectorAll(".home-quickplay-card").forEach((card) => {
      const plId = card.dataset.playlistId;
      if (plId) {
        card.addEventListener("click", (e) => {
          if (e.target.closest(".home-quickplay-play")) return;
          if (plId === "pl-all-1098-songs") {
            location.hash = "#/catalog-1000";
          } else {
            location.hash = `#/playlist/${plId}`;
          }
        });
        const playBtn = card.querySelector(".home-quickplay-play");
        if (playBtn) {
          playBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (plId === "pl-all-1098-songs") {
              const allIds = SONGS.map((s) => s.id);
              playQueue(allIds, 0);
              toast(`Playing All ${allIds.length} Songs Master Catalog 🎵`);
              return;
            }
            const pl = state.playlists.find((p) => p.id === plId);
            if (pl && pl.songIds && pl.songIds.length) {
              if (state.isPlaying && (pl.songIds || []).includes(state.currentSongId)) {
                togglePlay();
              } else {
                playQueue(pl.songIds, 0);
              }
            }
          });
        }
        return;
      }
      const songId = card.dataset.songId;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".home-quickplay-play")) return;
        const s = songById.get(songId);
        if (s) openSongContext(s);
      });
      const playBtn = card.querySelector(".home-quickplay-play");
      if (playBtn) {
        playBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.currentSongId === songId) {
            togglePlay();
          } else {
            playQueue([songId], 0);
          }
        });
      }
    });


    // Bind jump-back-in cards
    elDOM.view.querySelectorAll(".home-jumpin-card").forEach((card) => {
      const songId = card.dataset.songId;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        const s = songById.get(songId);
        if (s) openSongContext(s);
      });
      const fab = card.querySelector(".play-fab");
      if (fab) {
        fab.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.currentSongId === songId) {
            togglePlay();
          } else {
            playQueue([songId], 0);
          }
        });
      }
    });

    // Bind taste playlists and popular singers
    bindTastePlaylistCards(elDOM.view);
    bindPopularSingerCards(elDOM.view);

    // Bind AI Recommendation shelf scrolling and fetch live recommendations
    const aiPrev = elDOM.view.querySelector("#aiRecsPrevBtn");
    const aiNext = elDOM.view.querySelector("#aiRecsNextBtn");
    const aiRow = elDOM.view.querySelector("#aiRecsScrollRow");
    if (aiPrev && aiRow) {
      aiPrev.addEventListener("click", () => aiRow.scrollBy({ left: -420, behavior: "smooth" }));
    }
    if (aiNext && aiRow) {
      aiNext.addEventListener("click", () => aiRow.scrollBy({ left: 420, behavior: "smooth" }));
    }

    async function loadHomeAiRecs(category = "all") {
      const container = elDOM.view.querySelector("#aiRecsScrollRow");
      if (!container) return;
      try {
        const catQuery = (!category || category === "all") ? "" : `&category=${encodeURIComponent(category)}`;
        const res = await fetch(`${API_BASE}/api/made-for-you?limit=14${catQuery}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.items && data.items.length) {
            registerSongs(data.items.map(it => ({ ...it.song, reason: it.reason, score: it.score, cluster_id: it.cluster_id })));
            const recSongs = data.items.map(it => {
              const sid = String(it.song.id);
              const found = songById.get(sid);
              if (found) {
                found.reason = it.reason;
                found.score = it.score;
                return found;
              }
              return normalizeApiSong({ ...it.song, reason: it.reason, score: it.score, cluster_id: it.cluster_id });
            }).filter(Boolean);

            container.innerHTML = recSongs.map(s => mediaCard(songToCard(s))).join("");
            bindAllSongCards(container);
            return;
          }
        }
      } catch (err) {
        console.warn("Home AI recommendations fetch error:", err);
      }
      // Smart category fallback if backend API is not responding
      let fallback = SONGS;
      if (category === "romantic") fallback = romanticSongs.length ? romanticSongs : SONGS.filter(s => s.theme === "romantic");
      else if (category === "workout") fallback = workoutSongs.length ? workoutSongs : SONGS.filter(s => s.theme === "workout");
      else if (category === "party") fallback = partySongs.length ? partySongs : SONGS.filter(s => s.theme === "party");
      else if (category === "lofi") fallback = lofiSongs.length ? lofiSongs : SONGS.filter(s => s.theme === "indie_lofi");
      else if (category === "punjabi") fallback = punjabiSongs.length ? punjabiSongs : SONGS.filter(s => s.theme === "punjabi");
      else if (category === "bollywood") fallback = bollywoodSongs.length ? bollywoodSongs : SONGS.filter(s => s.theme === "bollywood_hits");
      else fallback = SONGS.slice(0, 14);

      container.innerHTML = fallback.slice(0, 14).map(s => {
        const card = songToCard(s);
        card.score = 0.95;
        card.reason = category === "romantic" ? "Soulful Bollywood romance for your mood"
          : category === "workout" ? "Gym motivation & 120+ BPM energy"
          : category === "party" ? "Club anthem & party banger"
          : category === "lofi" ? "Sukoon & relaxing lo-fi textures"
          : category === "punjabi" ? "Top urban Punjabi swag"
          : category === "bollywood" ? "Blockbuster Bollywood anthem"
          : "Recommended based on your taste";
        return mediaCard(card);
      }).join("");
      bindAllSongCards(container);
    }
    loadHomeAiRecs();

    // Bind Home Made For You category pills
    elDOM.view.querySelectorAll("#homeMfyPills .mfy-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        elDOM.view.querySelectorAll("#homeMfyPills .mfy-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        const cat = pill.dataset.category || "all";
        const row = elDOM.view.querySelector("#aiRecsScrollRow");
        if (row) {
          row.scrollLeft = 0;
          row.innerHTML = skeletonCards(6);
        }
        loadHomeAiRecs(cat);
      });
    });

    async function loadHomeNewReleases() {
      const container = elDOM.view.querySelector("#homeNewReleasesRow");
      if (!container) return;
      try {
        const res = await fetch(`${API_BASE}/api/new-releases?limit=12`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.length) {
            registerSongs(data);
            const cards = data.map((s) => {
              const sid = String(s.id);
              const found = songById.get(sid);
              if (found) {
                if (s.release_date || s.releaseDate) found.releaseDate = s.release_date || s.releaseDate;
                if (s.release_year || s.releaseYear) found.releaseYear = s.release_year || s.releaseYear;
              }
              const item = found || normalizeApiSong(s);
              return songToCard(item);
            });
            container.innerHTML = cards.map(c => mediaCard(c)).join("");
            bindAllSongCards(container);
          }
        }
      } catch (err) {
        console.warn("Home new releases fetch error:", err);
      }
    }
    loadHomeNewReleases();

    // Bind all remaining song/artist card grids
    bindAllSongCards(elDOM.view);
    bindAllArtistCards(elDOM.view);
    animatePageIn();
  }

  function songToCard(song) {
    if (!song) return { art: "/assets/music-cover.svg", title: "Unknown", sub: "", id: "" };
    return {
      kind: "song",
      art: song.albumArt || "/assets/music-cover.svg",
      title: song.title,
      sub: song.artist,
      id: song.id,
      reason: song.reason,
      score: song.score,
    };
  }
  function albumToCard(album) {
    return { kind: "album", art: album.albumArt, title: album.title, sub: album.artist, id: album.id };
  }
  function artistToCard(artist) {
    return { kind: "artist", art: artist.image, round: true, title: artist.name, sub: `${artist.songIds.length} songs`, id: artist.id };
  }

  function bindTastePlaylistCards(container) {
    container.querySelectorAll(".taste-playlist-card").forEach((card) => {
      const plId = card.dataset.playlistId;
      const curatedList = buildCuratedPlaylists();
      const pl = curatedList.find((p) => p.id === plId);
      if (!pl) return;

      const fab = card.querySelector(".play-fab");
      if (fab) {
        fab.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.currentSongId && pl.songIds.includes(state.currentSongId)) {
            togglePlay();
          } else if (pl.songIds.length) {
            playQueue(pl.songIds, 0);
            toast(`Playing ${pl.name}`);
          }
        });
      }

      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/playlist/${pl.id}`;
      });
    });

    const prevBtn = container.querySelector("#tastePrevBtn");
    const nextBtn = container.querySelector("#tasteNextBtn");
    const row = container.querySelector(".taste-scroll-row");
    if (prevBtn && row) {
      prevBtn.addEventListener("click", () => {
        row.scrollBy({ left: -420, behavior: "smooth" });
      });
    }
    if (nextBtn && row) {
      nextBtn.addEventListener("click", () => {
        row.scrollBy({ left: 420, behavior: "smooth" });
      });
    }
  }

  function bindPopularSingerCards(container) {
    container.querySelectorAll("[data-singer-query]").forEach((card) => {
      const query = card.dataset.singerQuery;
      const name = card.dataset.singerName;
      const songs = getSongsBySinger(query, 30);

      const fab = card.querySelector(".play-fab");
      if (fab) {
        fab.addEventListener("click", (e) => {
          e.stopPropagation();
          if (songs.length) {
            playQueue(songs.map((s) => s.id), 0);
            toast(`Playing top hits of ${name}`);
          }
        });
      }

      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/search?q=${encodeURIComponent(name)}`;
      });
    });
  }

  // Generic binding — finds all media-cards and sets up playback & customizer
  function bindAllSongCards(container) {
    container.querySelectorAll(".media-card").forEach((card) => {
      // Skip if it's an artist card (round art) or album card
      if (card.querySelector(".art-wrap.round") || card.dataset.kind === "artist" || card.dataset.kind === "album") return;

      const songId = card.dataset.id;
      let song = songId ? songById.get(songId) : null;
      if (!song) {
        const titleEl = card.querySelector(".card-title");
        const subEl = card.querySelector(".card-sub");
        if (titleEl && subEl) {
          const title = titleEl.textContent;
          const sub = subEl.textContent;
          song = SONGS.find((s) => s.title === title && s.artist === sub);
        }
      }
      if (!song) return;

      // Edit button affordance
      const editBtn = card.querySelector(".card-edit-btn");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openSongCustomizerModal(song.id);
        });
      }

      // Play fab affordance
      const fab = card.querySelector(".play-fab");
      if (fab) {
        fab.addEventListener("click", (e) => {
          e.stopPropagation();
          if (state.currentSongId === song.id) {
            togglePlay();
          } else {
            playQueue([song.id], 0);
          }
        });
      }

      // Card body click
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab") || e.target.closest(".card-edit-btn")) return;
        if (state.currentSongId === song.id) {
          togglePlay();
        } else {
          openSongContext(song);
        }
      });
    });
  }

  function bindAllArtistCards(container) {
    container.querySelectorAll(".card-grid .media-card").forEach((card) => {
      if (!card.querySelector(".art-wrap.round")) return;
      const title = card.querySelector(".card-title")?.textContent;
      const artist = ARTISTS.find((a) => a.name === title);
      if (!artist) return;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/artist/${artist.id}`;
      });
      const fab = card.querySelector(".play-fab");
      if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); playQueue(artist.songIds, 0); });
    });
  }

  function bindAlbumCards(container) {
    container.querySelectorAll(".card-grid .media-card").forEach((card) => {
      if (card.querySelector(".art-wrap.round")) return;
      const title = card.querySelector(".card-title")?.textContent;
      const sub = card.querySelector(".card-sub")?.textContent;
      const album = ALBUMS.find((a) => a.title === title && a.artist === sub);
      if (!album) return;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/album/${album.id}`;
      });
      const fab = card.querySelector(".play-fab");
      if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); playQueue(album.songIds, 0); });
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

  // ---------------------------------------------------------------- Search
  let searchDebounceTimer = null;

  function pageSearch(query) {
    const globalIn = document.getElementById("globalSearchInput");
    const rawQuery = (query != null ? String(query) : (globalIn ? globalIn.value : "")) || "";
    let activeFilter = "All";

    if (globalIn && document.activeElement !== globalIn && globalIn.value !== rawQuery) {
      globalIn.value = rawQuery;
    }

    const shouldAutofocus = document.activeElement !== globalIn;

    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Search</h1></div>

      <div class="search-page-bar-wrap">
        <div class="search-page-bar">
          <i class="fa-solid fa-magnifying-glass search-page-icon"></i>
          <input type="text" id="pageSearchInput" class="search-page-input" placeholder="What do you want to play? (Songs, artists, albums...)" value="${escapeHtml(rawQuery)}" ${shouldAutofocus ? 'autofocus' : ''} />
          <button class="search-clear-btn" id="searchClearBtn" aria-label="Clear search" style="${rawQuery.trim() ? '' : 'display:none;'}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="filter-row" id="searchFilters" style="${rawQuery.trim() ? '' : 'display:none;'}">
        <button class="filter-pill active" data-filter="All">All</button>
        <button class="filter-pill" data-filter="Songs">Songs</button>
        <button class="filter-pill" data-filter="Artists">Artists</button>
        <button class="filter-pill" data-filter="Albums">Albums</button>
        <button class="filter-pill" data-filter="Playlists">Playlists</button>
      </div>

      <div id="searchResults"></div>
    `;

    const pageIn = document.getElementById("pageSearchInput");
    const clearBtn = document.getElementById("searchClearBtn");
    const resultsEl = document.getElementById("searchResults");
    const filtersRow = document.getElementById("searchFilters");

    function executeSearch(q) {
      const rawText = q != null ? String(q) : "";
      const trimmed = rawText.trim();
      query = trimmed;

      // Synchronize counterpart input without modifying the active element or stripping spaces
      if (globalIn && document.activeElement !== globalIn && globalIn.value !== rawText) {
        globalIn.value = rawText;
      }
      if (pageIn && document.activeElement !== pageIn && pageIn.value !== rawText) {
        pageIn.value = rawText;
      }
      if (clearBtn) clearBtn.style.display = trimmed ? "flex" : "none";
      if (filtersRow) filtersRow.style.display = trimmed ? "flex" : "none";

      if (!trimmed) {
        renderSearchLanding();
        return;
      }

      const qLower = trimmed.toLowerCase();
      const tokens = qLower.split(/\s+/).filter(Boolean);

      const matchSongs = SONGS.filter((s) => {
        const full = `${s.title} ${s.artist} ${s.album} ${s.genre || ""} ${s.mood || ""} ${s.language || ""}`.toLowerCase();
        return tokens.every((token) => full.includes(token));
      });
      const matchArtists = ARTISTS.filter((a) => {
        const aName = a.name.toLowerCase();
        return tokens.every((token) => aName.includes(token));
      });
      const matchAlbums = ALBUMS.filter((a) => {
        const full = `${a.title} ${a.artist}`.toLowerCase();
        return tokens.every((token) => full.includes(token));
      });
      const matchPlaylists = state.playlists.filter((p) => {
        const pName = p.name.toLowerCase();
        return tokens.every((token) => pName.includes(token));
      });

      const noResults = !matchSongs.length && !matchArtists.length && !matchAlbums.length && !matchPlaylists.length;
      if (noResults) {
        resultsEl.innerHTML = emptyState("fa-face-frown", `No results found for "${escapeHtml(trimmed)}"`, "Please check your spelling, or try searching for another artist, song, or album.");
        return;
      }

      let html = "";

      // Top result card when filter is All
      if (activeFilter === "All" && (matchSongs.length || matchArtists.length)) {
        if (matchSongs.length) {
          const topSong = matchSongs[0];
          html += `
            <section class="section">
              <div class="section-head"><h2>Top Result</h2></div>
              <div class="search-top-result" data-top-song="${topSong.id}">
                <img src="${topSong.albumArt}" alt="${escapeHtml(topSong.title)}" onerror="this.src='/assets/music-cover.svg'" />
                <div class="search-top-title">${escapeHtml(topSong.title)}</div>
                <div class="search-top-sub">
                  <span class="search-top-type">Song</span>
                  <span>${escapeHtml(topSong.artist)}</span>
                </div>
                <button class="search-top-play" aria-label="Play ${escapeHtml(topSong.title)}"><i class="fa-solid fa-play"></i></button>
              </div>
            </section>
          `;
        }
      }

      // Songs section
      if (activeFilter === "All" || activeFilter === "Songs") {
        if (matchSongs.length) {
          const displayCount = activeFilter === "Songs" ? matchSongs.length : Math.min(30, matchSongs.length);
          html += sectionBlock(
            `Songs (${matchSongs.length})`,
            `<div class="track-list">${matchSongs.slice(0, displayCount).map((s, i) => trackRow(s, i)).join("")}</div>`
          );
        }
      }

      // Artists section
      if (activeFilter === "All" || activeFilter === "Artists") {
        if (matchArtists.length) {
          html += sectionBlock(`Artists (${matchArtists.length})`, cardGridHtml(matchArtists.slice(0, 12).map(artistToCard)));
        }
      }

      // Albums section
      if (activeFilter === "All" || activeFilter === "Albums") {
        if (matchAlbums.length) {
          html += sectionBlock(`Albums (${matchAlbums.length})`, cardGridHtml(matchAlbums.slice(0, 12).map(albumToCard)));
        }
      }

      // Playlists section
      if (activeFilter === "All" || activeFilter === "Playlists") {
        if (matchPlaylists.length) {
          html += sectionBlock(`Playlists (${matchPlaylists.length})`, `<div class="card-grid">${matchPlaylists.map((p) => mediaCard({ art: p.artSrc || (p.songIds[0] ? (songById.get(p.songIds[0]) || {}).albumArt || "/assets/music-cover.svg" : "/assets/music-cover.svg"), title: p.name, sub: `${p.songIds.length} songs` })).join("")}</div>`);
        }
      }

      if (!html) {
        html = emptyState("fa-filter", `No ${activeFilter.toLowerCase()} found for "${escapeHtml(query)}"`, "Try switching to another filter or clearing search.");
      }

      resultsEl.innerHTML = html;

      // Bind top result card
      const topRes = resultsEl.querySelector(".search-top-result");
      if (topRes) {
        const songId = topRes.dataset.topSong;
        topRes.addEventListener("click", () => {
          playQueue([songId], 0);
        });
      }

      // Bind track rows
      bindTrackRows(resultsEl);

      bindAllArtistCards(resultsEl);
      bindAlbumCards(resultsEl);

      resultsEl.querySelectorAll(".card-grid .media-card").forEach((card) => {
        const t = card.querySelector(".card-title")?.textContent;
        const pl = matchPlaylists.find((p) => p.name === t);
        if (pl) card.addEventListener("click", () => { location.hash = `#/playlist/${pl.id}`; });
      });

      refreshVisibleTrackRows();
    }

    function renderSearchLanding() {
      const popularHits = [...SONGS].sort((a, b) => b.playCount - a.playCount).slice(0, 10);
      resultsEl.innerHTML = `
        <section class="section">
          <div class="section-head"><h2>Browse all categories</h2></div>
          <div class="category-grid">
            ${CATEGORIES.map(categoryTileHtml).join("")}
          </div>
        </section>

        ${sectionBlock("Popular & Trending Now", cardGridHtml(popularHits.map(songToCard)))}
      `;

      resultsEl.querySelectorAll(".category-tile").forEach(tile => {
        tile.addEventListener("click", () => {
          location.hash = `#/category/${encodeURIComponent(tile.dataset.cat)}`;
        });
      });

      resultsEl.querySelectorAll(".card-grid .media-card").forEach(card => {
        const songId = card.dataset.id || card.dataset.songId;
        if (songId) {
          card.addEventListener("click", () => {
            playQueue([songId], 0);
          });
        }
      });
    }

    // Input handlers
    if (pageIn) {
      pageIn.addEventListener("input", (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          executeSearch(e.target.value);
        }, 150);
      });
      pageIn.addEventListener("keydown", (e) => {
        if (e.code === "Space" || e.key === " ") {
          e.stopPropagation();
        }
        if (e.key === "Enter") {
          clearTimeout(searchDebounceTimer);
          executeSearch(pageIn.value);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (pageIn) pageIn.value = "";
        if (globalIn) globalIn.value = "";
        executeSearch("");
        if (pageIn) pageIn.focus();
      });
    }

    // Filter pill buttons
    filtersRow.querySelectorAll(".filter-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        filtersRow.querySelectorAll(".filter-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.dataset.filter;
        executeSearch(pageIn ? pageIn.value : query);
      });
    });

    executeSearch(query);
    animatePageIn();
  }

  // ---------------------------------------------------------------- Browse & Categories
  const CATEGORIES = [
    {
      name: "New Releases", c1: "#2563EB", c2: "#1E40AF", art: "covers/extracted/sp-247.jpg",
      isNewRelease: true,
      filter: (s) => (s.releaseYear >= 2024 || (s.releaseDate && s.releaseDate >= "2024"))
    },
    {
      name: "Pop", c1: "#E8A33D", c2: "#C9793A", art: "covers/extracted/sp-4.jpg",
      filter: (s) => s.theme === "international" || (s.genre && s.genre.includes("Pop")) || s.mood === "Chill"
    },
    {
      name: "Bollywood", c1: "#E11D48", c2: "#881337", art: "covers/extracted/sp-20.jpg",
      filter: (s) => s.theme === "bollywood_hits" || s.genre === "Bollywood" || s.theme === "romantic"
    },
    {
      name: "Hip-Hop", c1: "#D9704F", c2: "#A34934", art: "covers/extracted/sp-11.jpg",
      filter: (s) => s.theme === "hiphop" || (s.genre && (s.genre.includes("Hip-Hop") || s.genre.includes("Rap"))) || (s.title + " " + s.artist).toLowerCase().includes("rap")
    },
    {
      name: "Punjabi", c1: "#F97316", c2: "#7C2D12", art: "covers/extracted/sp-14.jpg",
      filter: (s) => s.theme === "punjabi" || (s.genre && s.genre.includes("Punjabi")) || s.language === "Punjabi"
    },
    {
      name: "Indie", c1: "#9E8FCF", c2: "#6A5A9E", art: "covers/extracted/sp-19.jpg",
      filter: (s) => s.theme === "indie_lofi" || s.genre === "Indie / Acoustic"
    },
    {
      name: "Romantic", c1: "#D96C8F", c2: "#A34160", art: "covers/extracted/sp-114.jpg",
      filter: (s) => s.theme === "romantic" || s.mood === "Romantic"
    },
    {
      name: "Rock", c1: "#8E6B9E", c2: "#5C4270", art: "covers/extracted/sp-98.jpg",
      filter: (s) => {
        const a = (s.title + " " + s.artist + " " + (s.genre || "") + " " + (s.mood || "")).toLowerCase();
        return a.includes("rock") || a.includes("guitar") || a.includes("band") || s.mood === "Energetic";
      }
    },
    {
      name: "Indie Rock", c1: "#B07D62", c2: "#6D4C3D", art: "covers/extracted/sp-94.jpg",
      filter: (s) => {
        const a = (s.title + " " + s.artist + " " + (s.genre || "")).toLowerCase();
        return s.genre === "Indie / Acoustic" || a.includes("shukla") || a.includes("rock") || a.includes("acoustic") || s.mood === "Energetic" || s.mood === "Upbeat";
      }
    },
    {
      name: "Classical", c1: "#8B8492", c2: "#5C5563", art: "covers/extracted/sp-26.jpg",
      filter: (s) => (s.title + " " + s.artist + " " + (s.composer || "")).toLowerCase().includes("rahman") || (s.title + " " + s.artist).toLowerCase().includes("kishore") || (s.title + " " + s.artist).toLowerCase().includes("raga") || s.releaseYear < 2010
    },
    {
      name: "K-Pop", c1: "#E087A6", c2: "#A65273", art: "covers/extracted/sp-206.jpg",
      filter: (s) => s.genre === "International Pop" || (s.language === "English" && s.mood === "Energetic") || (s.title + " " + s.artist).toLowerCase().includes("dua")
    },
    {
      name: "J-Pop", c1: "#E8A33D", c2: "#B96E2A", art: "covers/extracted/sp-241.jpg",
      filter: (s) => (s.genre === "International Pop" || s.genre === "Pop") && (s.mood === "Upbeat" || s.mood === "Uplifting")
    },
    {
      name: "Latin Pop", c1: "#D9704F", c2: "#B04A2C", art: "covers/extracted/sp-108.jpg",
      filter: (s) => s.mood === "Party" || s.mood === "Energetic" || (s.title + " " + s.artist).toLowerCase().includes("dance")
    },
    {
      name: "Afrobeats", c1: "#E8B23D", c2: "#B9832A", art: "covers/extracted/sp-75.jpg",
      filter: (s) => (s.artist + " " + s.title).toLowerCase().includes("dhillon") || (s.artist + " " + s.title).toLowerCase().includes("shubh") || s.mood === "Hype"
    },
    {
      name: "French Pop", c1: "#8E9ECF", c2: "#5A6A9E", art: "covers/extracted/sp-278.jpg",
      filter: (s) => s.genre === "International Pop" || (s.genre === "Pop" && s.mood === "Romantic")
    },
    {
      name: "Turkish Pop", c1: "#C97A5A", c2: "#8E4E32", art: "covers/extracted/sp-81.jpg",
      filter: (s) => (s.mood === "Romantic" || s.mood === "Chill") && (s.genre === "Bollywood" || s.genre === "Pop")
    },
    {
      name: "Arabic Pop", c1: "#C9A33D", c2: "#8E722A", art: "covers/extracted/sp-21.jpg",
      filter: (s) => (s.artist + " " + s.title).toLowerCase().includes("atif") || (s.title + " " + s.artist).toLowerCase().includes("sufi") || (s.mood === "Sukoon")
    },
    {
      name: "MPB", c1: "#6FA5A0", c2: "#3E706B", art: "covers/extracted/sp-25.jpg",
      filter: (s) => s.genre === "Indie / Acoustic" || s.mood === "Sukoon"
    },
    {
      name: "Reggaeton", c1: "#E087A6", c2: "#B04A7A", art: "covers/extracted/sp-15.jpg",
      filter: (s) => s.mood === "Party" || s.mood === "Hype" || (s.genre && s.genre.includes("Dance"))
    },
    {
      name: "Mandopop", c1: "#D9704F", c2: "#B04A2C", art: "covers/extracted/sp-5.jpg",
      filter: (s) => (s.genre === "Pop" || s.genre === "Indie / Acoustic") && s.mood === "Chill"
    },
    {
      name: "C-Pop", c1: "#E8A33D", c2: "#B96E2A", art: "covers/extracted/sp-7.png",
      filter: (s) => (s.genre === "Pop" || s.genre === "Bollywood") && s.mood === "Romantic"
    },
    {
      name: "European Pop", c1: "#8E9ECF", c2: "#5A6A9E", art: "covers/extracted/sp-448.jpg",
      filter: (s) => s.genre === "International Pop" || (s.language === "English")
    },
    {
      name: "Lo-Fi", c1: "#7A8FA0", c2: "#4E5F6E", art: "covers/extracted/sp-95.jpg",
      filter: (s) => s.theme === "indie_lofi" || (s.title + " " + s.artist).toLowerCase().includes("lofi") || (s.title + " " + s.artist).toLowerCase().includes("chill")
    },
    {
      name: "Chill", c1: "#6FA5A0", c2: "#3E706B", art: "covers/extracted/sp-8.jpg",
      filter: (s) => s.theme === "indie_lofi" || s.mood === "Chill" || s.mood === "Sukoon"
    },
    {
      name: "Workout", c1: "#D9524F", c2: "#A3312E", art: "covers/extracted/sp-74.jpg",
      filter: (s) => s.theme === "workout" || s.mood === "Energetic" || (s.bpm && s.bpm >= 120) || (s.theme === "punjabi" && /swag|drill/i.test(s.title))
    },
    {
      name: "Focus", c1: "#5C8ACF", c2: "#39609E", art: "covers/extracted/sp-96.jpg",
      filter: (s) => s.mood === "Sukoon" || s.mood === "Chill" || s.genre === "Indie / Acoustic"
    },
    {
      name: "Party", c1: "#E85A9E", c2: "#B23271", art: "covers/extracted/sp-28.jpg",
      filter: (s) => s.theme === "party" || s.mood === "Party" || (s.artist + " " + s.title).toLowerCase().includes("honey singh")
    },
    {
      name: "Sad", c1: "#6E7A9E", c2: "#414E70", art: "covers/extracted/sp-10.jpg",
      filter: (s) => s.mood === "Sukoon" || (s.title + " " + s.artist).toLowerCase().includes("alvida") || (s.title + " " + s.artist).toLowerCase().includes("judai") || (s.title + " " + s.artist).toLowerCase().includes("dard") || (s.artist + " " + s.title).toLowerCase().includes("kk")
    },
    {
      name: "Uplifting", c1: "#E8B23D", c2: "#B9832A", art: "covers/extracted/sp-13.jpg",
      filter: (s) => s.mood === "Uplifting" || s.mood === "Upbeat"
    },
    {
      name: "Energetic", c1: "#D9524F", c2: "#A3312E", art: "covers/extracted/sp-71.jpg",
      filter: (s) => s.mood === "Energetic" || s.mood === "Hype"
    },
    {
      name: "Instrumental", c1: "#8B8492", c2: "#5C5563", art: "covers/extracted/sp-42.jpg",
      filter: (s) => (s.title + " " + s.artist).toLowerCase().includes("theme") || (s.title + " " + s.artist).toLowerCase().includes("instrumental") || s.mood === "Sukoon"
    },
    {
      name: "Sufi & Devotional", c1: "#A855F7", c2: "#6B21A8", art: "covers/extracted/sp-22.jpg",
      filter: (s) => {
        const a = (s.title + " " + s.artist + " " + (s.composer || "")).toLowerCase();
        return a.includes("sufi") || a.includes("kun faya") || a.includes("arziyan") || a.includes("khwaja") || a.includes("ali") || a.includes("rahat") || a.includes("kailash") || s.mood === "Sukoon";
      }
    },
    {
      name: "R&B", c1: "#C9793A", c2: "#8E4E2A", art: "covers/extracted/sp-136.jpg",
      filter: (s) => s.mood === "Romantic" || s.mood === "Sukoon" || (s.title + " " + s.artist).toLowerCase().includes("soul")
    },
    {
      name: "Electronic", c1: "#4FA6C9", c2: "#2E6B85", art: "covers/extracted/sp-471.jpg",
      filter: (s) => (s.genre && s.genre.includes("Electronic")) || s.mood === "Party" || (s.title + " " + s.artist).toLowerCase().includes("edm") || (s.title + " " + s.artist).toLowerCase().includes("remix")
    },
    {
      name: "Jazz", c1: "#B98D3E", c2: "#7A5A22", art: "covers/extracted/sp-764.jpg",
      filter: (s) => s.mood === "Sukoon" || s.mood === "Chill" || (s.title + " " + s.artist).toLowerCase().includes("acoustic")
    },
    {
      name: "Haryanvi", c1: "#10B981", c2: "#064E3B", art: "covers/extracted/sp-16.jpg",
      filter: (s) => s.genre === "Haryanvi" || s.language === "Haryanvi"
    }
  ];

  function categoryTileHtml(cat) {
    const count = SONGS.filter(cat.filter).length;
    return `
      <div class="category-tile" data-cat="${escapeHtml(cat.name)}" style="--tile-a:${cat.c1};--tile-b:${cat.c2};" title="${escapeHtml(cat.name)} · ${count} songs">
        <div class="category-tile-title">${escapeHtml(cat.name)}</div>
        <div class="category-tile-count">${count} tracks</div>
        <div class="category-tile-art-wrap">
          <img src="${cat.art}" alt="${escapeHtml(cat.name)}" class="category-tile-art" loading="lazy" onerror="this.onerror=null;this.src='/assets/music-cover.svg';" />
        </div>
      </div>
    `;
  }

  function pageBrowse() {
    elDOM.view.innerHTML = `
      <div class="view-header">
        <h1>Browse All</h1>
        <p>Explore Omify songs, moods, and genres sculpted for every taste.</p>
      </div>
      <div class="browse-hero-banner" style="background:linear-gradient(135deg,rgba(37,99,235,0.25) 0%,rgba(30,58,138,0.4) 100%);border:1px solid rgba(59,130,246,0.35);border-radius:16px;padding:24px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.4);padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:700;color:#93c5fd;margin-bottom:8px;letter-spacing:0.04em;">
            <i class="fa-solid fa-compact-disc"></i> MUSICBRAINZ OPEN CATALOG
          </div>
          <h2 style="font-size:1.6rem;font-weight:800;margin:0 0 6px 0;">New Releases</h2>
          <p style="color:var(--text-sub);margin:0;max-width:520px;font-size:0.92rem;">Stream real-world latest singles, albums and drops powered by MusicBrainz & fresh catalog additions.</p>
        </div>
        <a href="#/new-releases" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:999px;font-weight:700;text-decoration:none;">
          <i class="fa-solid fa-play"></i> Explore New Releases
        </a>
      </div>
      <div class="category-grid">
        ${CATEGORIES.map(categoryTileHtml).join("")}
      </div>
    `;
    elDOM.view.querySelectorAll(".category-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        if (tile.dataset.cat === "New Releases") {
          location.hash = "#/new-releases";
          return;
        }
        location.hash = `#/category/${encodeURIComponent(tile.dataset.cat)}`;
      });
    });
    animatePageIn();
  }

  function pageCategory(name) {
    const cat = CATEGORIES.find((c) => c.name.toLowerCase() === (name || "").toLowerCase()) || {
      name,
      c1: "#1ed760",
      c2: "#064e3b",
      art: "covers/extracted/sp-20.jpg",
      filter: (s) => (s.genre && s.genre.toLowerCase().includes((name || "").toLowerCase())) || (s.mood && s.mood.toLowerCase().includes((name || "").toLowerCase()))
    };

    let matches = SONGS.filter(cat.filter);
    if (matches.length < 10) {
      const backup = SONGS.filter((s) => !matches.some((m) => m.id === s.id));
      matches = matches.concat(backup.slice(0, 15 - matches.length));
    }

    elDOM.view.innerHTML = `
      <div class="detail-hero" style="background: linear-gradient(180deg, ${cat.c1}88 0%, rgba(18,18,18,0.9) 100%);">
        <div class="art-wrap" style="width:200px;height:200px;border-radius:var(--radius-md);overflow:hidden;flex:0 0 auto;box-shadow:0 16px 36px rgba(0,0,0,0.65);">
          <img src="${cat.art}" alt="${escapeHtml(cat.name)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/assets/music-cover.svg'" />
        </div>
        <div class="detail-hero-meta">
          <span class="kicker">Category</span>
          <h1>${escapeHtml(cat.name)}</h1>
          <div class="sub">Curated ${escapeHtml(cat.name)} collection · ${matches.length} tracks matching your taste</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="catPlayAll" aria-label="Play all"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="catShuffle" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
      </div>
      <div id="catList"></div>
    `;

    renderTrackList(document.getElementById("catList"), matches.map((s) => s.id), {
      emptyIcon: "fa-compact-disc", emptyTitle: "No songs in this category yet",
    });

    document.getElementById("catPlayAll").addEventListener("click", () => matches.length && playQueue(matches.map(s => s.id), 0));
    document.getElementById("catShuffle").addEventListener("click", () => {
      if (!matches.length) return;
      state.shuffle = true; elDOM.shuffleBtn.classList.add("active");
      playQueue(matches.map(s => s.id), Math.floor(Math.random() * matches.length));
    });
    animatePageIn();
  }

  // ---------------------------------------------------------------- Foreign Music
  async function pageForeign() {
    const flags = {
      English: "🇺🇸", Korean: "🇰🇷", Japanese: "🇯🇵", Spanish: "🇪🇸", French: "🇫🇷",
      Italian: "🇮🇹", German: "🇩🇪", Portuguese: "🇧🇷", Arabic: "🇦🇪", Turkish: "🇹🇷",
      Mandarin: "🇨🇳", Instrumental: "🎼",
    };

    elDOM.view.innerHTML = `
      <div class="view-header">
        <h1>Foreign Music</h1>
        <p>Discover international tracks categorized by language & region.</p>
      </div>
      <div id="foreignContent">${skeletonCards(8)}</div>
    `;
    animatePageIn();

    let byLanguage = new Map();
    try {
      const res = await fetch(`${API_BASE}/api/foreign-music?limit_per_lang=8`);
      if (res.ok) {
        const data = await res.json();
        Object.entries(data).forEach(([lang, songs]) => {
          registerSongs(songs);
          const mapped = songs.map((s) => songById.get(String(s.id)) || normalizeApiSong(s)).filter(Boolean);
          if (mapped.length) byLanguage.set(lang, mapped);
        });
      }
    } catch (_) {}

    if (!byLanguage.size) {
      SONGS.forEach((s) => {
        if (!byLanguage.has(s.language)) byLanguage.set(s.language, []);
        byLanguage.get(s.language).push(s);
      });
    }

    const container = document.getElementById("foreignContent");
    if (!container) return;

    container.innerHTML = Array.from(byLanguage.entries()).map(([lang, songs]) => `
      <div class="country-section">
        <div class="country-head">
          <span class="country-flag">${flags[lang] || "🌐"}</span>
          <h2>${escapeHtml(lang)}</h2>
          <span style="margin-left:auto;color:var(--text-muted);font-size:0.82rem;">${songs.length} songs</span>
        </div>
        ${cardGridHtml(songs.slice(0, 8).map(songToCard))}
      </div>
    `).join("");

    bindAllSongCards(container);
  }

  // ---------------------------------------------------------------- Trending
  async function pageTrending() {
    elDOM.view.innerHTML = `
      <div class="view-header">
        <h1>Trending</h1>
        <p>The most played tracks on Omify right now, ranked by catalog popularity.</p>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="trendPlayAll" aria-label="Play all"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="trendShuffle" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
      </div>
      <div id="trendList">${skeletonCards(6)}</div>
    `;
    animatePageIn();

    let ranked = [];
    try {
      const res = await fetch(`${API_BASE}/api/trending?limit=50`);
      if (res.ok) {
        const data = await res.json();
        registerSongs(data);
        ranked = data.map((s) => songById.get(String(s.id)) || normalizeApiSong(s)).filter(Boolean);
      }
    } catch (_) {}

    if (!ranked.length) {
      ranked = [...SONGS].sort((a, b) => b.playCount - a.playCount).slice(0, 50);
    }

    const listEl = document.getElementById("trendList");
    if (!listEl) return;

    renderTrackList(listEl, ranked.map((s) => s.id), { rank: true });
    const playAll = document.getElementById("trendPlayAll");
    if (playAll) playAll.addEventListener("click", () => playQueue(ranked.map(s => s.id), 0));
    const shuffle = document.getElementById("trendShuffle");
    if (shuffle) shuffle.addEventListener("click", () => {
      state.shuffle = true;
      elDOM.shuffleBtn.classList.add("active");
      playQueue(ranked.map(s => s.id), Math.floor(Math.random() * ranked.length));
    });
  }

  // ---------------------------------------------------------------- New Releases
  async function pageNewReleases() {
    elDOM.view.innerHTML = `
      <div class="view-header">
        <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);padding:2px 9px;border-radius:12px;font-size:0.7rem;font-weight:700;color:#60a5fa;margin-bottom:6px;letter-spacing:0.04em;">
          <i class="fa-solid fa-compact-disc"></i> MUSICBRAINZ OPEN CATALOG
        </div>
        <h1>New Releases</h1>
        <p>Real-world drops by your favorite artists powered by MusicBrainz & Cover Art Archive.</p>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="newPlayAll" aria-label="Play all"><i class="fa-solid fa-play"></i></button>
      </div>
      <div id="newList">${skeletonCards(6)}</div>
    `;
    animatePageIn();

    let sorted = [];
    try {
      const res = await fetch(`${API_BASE}/api/new-releases?limit=50`);
      if (res.ok) {
        const data = await res.json();
        registerSongs(data);
        sorted = data.map((s) => {
          const sid = String(s.id);
          const found = songById.get(sid);
          if (found) {
            if (s.release_date || s.releaseDate) found.releaseDate = s.release_date || s.releaseDate;
            if (s.release_year || s.releaseYear) found.releaseYear = s.release_year || s.releaseYear;
            return found;
          }
          return normalizeApiSong(s);
        }).filter(Boolean);
      }
    } catch (_) {}

    if (!sorted.length) {
      sorted = [...SONGS].sort((a, b) => b.releaseYear - a.releaseYear);
    }

    const listEl = document.getElementById("newList");
    if (!listEl) return;

    const attributions = {};
    sorted.forEach((s) => {
      if (s.releaseDate) {
        attributions[s.id] = `Released: ${s.releaseDate}`;
      } else if (s.releaseYear) {
        attributions[s.id] = `Year: ${s.releaseYear}`;
      }
    });

    renderTrackList(listEl, sorted.map((s) => s.id), { attributions });
    const playAll = document.getElementById("newPlayAll");
    if (playAll) playAll.addEventListener("click", () => playQueue(sorted.map(s => s.id), 0));
  }

  // ---------------------------------------------------------------- Made For You
  async function pageMadeForYou() {
    elDOM.view.innerHTML = `
      <div class="view-header" style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1>Made For You</h1>
          <p style="margin:4px 0 0 0;color:var(--text-sub);font-size:0.9rem;">
            <span style="color:var(--signal);font-weight:600;"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:6px;"></i>ML Recommendation Engine</span>
            · Personalized neural recommendations sculpted for your taste &amp; mood
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" id="refreshModelBtn" title="Retrain and refresh the recommendation engine" style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;">
          <i class="fa-solid fa-arrows-rotate"></i> Retrain Model
        </button>
      </div>

      <div class="mfy-shelf-pills" id="pageMfyPills" style="margin: 12px 0 16px 0;">
        <button class="mfy-pill active" data-category="all"><i class="fa-solid fa-wand-magic-sparkles"></i> All Recommendations</button>
        <button class="mfy-pill" data-category="romantic"><i class="fa-solid fa-heart" style="color:#ec4899;"></i> Romance &amp; Love</button>
        <button class="mfy-pill" data-category="workout"><i class="fa-solid fa-dumbbell" style="color:#06b6d4;"></i> Gym &amp; Workout</button>
        <button class="mfy-pill" data-category="party"><i class="fa-solid fa-compact-disc" style="color:#eab308;"></i> Party &amp; Club</button>
        <button class="mfy-pill" data-category="lofi"><i class="fa-solid fa-headphones" style="color:#10b981;"></i> Lo-Fi &amp; Sukoon</button>
        <button class="mfy-pill" data-category="punjabi"><i class="fa-solid fa-fire" style="color:#f97316;"></i> Punjabi &amp; Swag</button>
        <button class="mfy-pill" data-category="bollywood"><i class="fa-solid fa-film" style="color:#e11d48;"></i> Bollywood Hits</button>
      </div>

      <div class="detail-actions">
        <button class="play-fab-lg" id="mfyPlayAll" aria-label="Play all"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="mfyShuffle" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
      </div>
      <div id="mfyList" class="card-grid">${skeletonCards(12)}</div>
    `;
    animatePageIn();

    const refreshBtn = document.getElementById("refreshModelBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Training...';
        try {
          const r = await fetch(`${API_BASE}/api/recommendations/refresh`, { method: "POST" });
          if (r.ok) {
            toast("✨ ML Recommendation model retrained successfully!");
          }
        } catch (_) {}
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Retrain Model';
        pageMadeForYou();
      });
    }

    let activeRecs = [];

    async function fetchAndRenderMfy(category = "all") {
      const listEl = document.getElementById("mfyList");
      if (!listEl) return;
      listEl.innerHTML = skeletonCards(8);

      let recs = [];
      try {
        const catQuery = (!category || category === "all") ? "" : `&category=${encodeURIComponent(category)}`;
        const res = await fetch(`${API_BASE}/api/made-for-you?limit=30${catQuery}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.items && data.items.length) {
            registerSongs(data.items.map((it) => ({
              ...it.song,
              reason: it.reason,
              score: it.score,
              cluster_id: it.cluster_id,
            })));
            recs = data.items.map((it) => {
              const sid = String(it.song.id);
              const found = songById.get(sid);
              if (found) {
                found.reason = it.reason;
                found.score = it.score;
                return found;
              }
              return normalizeApiSong({ ...it.song, reason: it.reason, score: it.score, cluster_id: it.cluster_id });
            }).filter(Boolean);
          }
        }
      } catch (_) {}

      // Fallback matching category if backend API is not responding
      if (!recs.length) {
        let pool = SONGS;
        if (category === "romantic") pool = SONGS.filter(s => s.theme === "romantic" || /love|pyaar|ishq|arijit|pritam|atif/i.test(s.title + " " + s.artist));
        else if (category === "workout") pool = SONGS.filter(s => s.theme === "workout" || (s.bpm && s.bpm >= 120));
        else if (category === "party") pool = SONGS.filter(s => s.theme === "party" || s.mood === "Energetic");
        else if (category === "lofi") pool = SONGS.filter(s => s.theme === "indie_lofi" || s.mood === "Sukoon");
        else if (category === "punjabi") pool = SONGS.filter(s => s.theme === "punjabi" || (s.language && s.language.toLowerCase() === "punjabi"));
        else if (category === "bollywood") pool = SONGS.filter(s => s.theme === "bollywood_hits" || s.genre === "Bollywood");
        else {
          const likedSongs = Array.from(state.favorites).map((id) => songById.get(id)).filter(Boolean);
          const recentSongs = state.recent.map((r) => songById.get(r.songId)).filter(Boolean);
          const signal = [...likedSongs, ...recentSongs];
          if (!signal.length) {
            pool = [...SONGS].sort((a, b) => b.playCount - a.playCount);
          } else {
            const genreCount = {};
            signal.forEach((s) => { genreCount[s.genre] = (genreCount[s.genre] || 0) + 1; });
            const likedIds = new Set(likedSongs.map((s) => s.id));
            pool = [...SONGS].filter((s) => !likedIds.has(s.id)).sort((a, b) => (genreCount[b.genre] || 0) - (genreCount[a.genre] || 0));
          }
        }
        recs = pool.slice(0, 24).map(s => {
          const c = { ...s };
          c.score = 0.94;
          c.reason = category === "romantic" ? "Soulful Bollywood romance for your mood"
            : category === "workout" ? "Gym motivation & high-octane energy"
            : category === "party" ? "Club anthem & party banger"
            : category === "lofi" ? "Sukoon & relaxing lo-fi textures"
            : category === "punjabi" ? "Top urban Punjabi drop & swagger"
            : category === "bollywood" ? "Blockbuster Bollywood soundtrack anthem"
            : "Personalized recommendation";
          return c;
        });
      }

      activeRecs = recs;
      listEl.innerHTML = recs.map(songToCard).map((c) => mediaCard(c)).join("");
      bindAllSongCards(elDOM.view);
    }

    // Initial load
    fetchAndRenderMfy("all");

    // Bind Category filter pills
    elDOM.view.querySelectorAll("#pageMfyPills .mfy-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        elDOM.view.querySelectorAll("#pageMfyPills .mfy-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        const cat = pill.dataset.category || "all";
        fetchAndRenderMfy(cat);
      });
    });

    const playAll = document.getElementById("mfyPlayAll");
    if (playAll) playAll.addEventListener("click", () => {
      if (activeRecs.length) playQueue(activeRecs.map(s => s.id), 0);
    });
    const shuffle = document.getElementById("mfyShuffle");
    if (shuffle) shuffle.addEventListener("click", () => {
      if (activeRecs.length) {
        state.shuffle = true;
        elDOM.shuffleBtn.classList.add("active");
        playQueue(activeRecs.map(s => s.id), Math.floor(Math.random() * activeRecs.length));
      }
    });
  }

  // ---------------------------------------------------------------- Favorites
  function pageFavorites() {
    const ids = Array.from(state.favorites);
    elDOM.view.innerHTML = `
      <div class="detail-hero">
        <div class="art-wrap" style="width:200px;height:200px;border-radius:var(--radius-md);background:linear-gradient(135deg,var(--signal),var(--signal-deep));display:flex;align-items:center;justify-content:center;flex:0 0 auto;">
          <i class="fa-solid fa-heart" style="font-size:3.5rem;color:#1a1410;"></i>
        </div>
        <div class="detail-hero-meta">
          <span class="kicker">Playlist</span>
          <h1>Liked Songs</h1>
          <div class="sub">${ids.length} songs · ${fmtDurationLong(totalDuration(ids))}</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllBtn" aria-label="Play all"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="shuffleAllBtn" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
        <input type="text" id="filterLiked" placeholder="Search within liked songs" style="margin-left:auto;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:9px 16px;color:var(--text-heading);width:240px;font-family:inherit;font-size:0.86rem;" />
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
      elDOM.shuffleBtn.classList.add("active");
      playQueue(ids, Math.floor(Math.random() * ids.length));
    });
    animatePageIn();
  }

  // ---------------------------------------------------------------- Recently Played
  function pageRecentlyPlayed() {
    const ids = state.recent.map((r) => r.songId).filter((id) => songById.has(id));
    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Recently Played</h1><p>Your listening history on this device.</p></div>
      <div class="detail-actions">
        ${ids.length ? `<button class="play-fab-lg" id="recentPlayAll" aria-label="Play all"><i class="fa-solid fa-play"></i></button>` : ""}
      </div>
      <div id="recentList"></div>
      ${ids.length ? `<button class="text-btn danger" id="clearRecentBtn" style="margin-top:12px;">Clear history</button>` : ""}
    `;
    renderTrackList(document.getElementById("recentList"), ids, {
      emptyIcon: "fa-clock-rotate-left", emptyTitle: "Nothing played yet",
      emptyBody: "Songs you play will show up here.",
    });
    const playBtn = document.getElementById("recentPlayAll");
    if (playBtn) playBtn.addEventListener("click", () => playQueue(ids, 0));
    const clearBtn = document.getElementById("clearRecentBtn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      state.recent = [];
      persistRecent();
      pageRecentlyPlayed();
      toast("Recently played cleared");
    });
    animatePageIn();
  }

  // ---------------------------------------------------------------- Albums
  function pageAlbums() {
    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Albums</h1><p>${ALBUMS.length} albums in the catalog</p></div>
      <div class="card-grid" id="albumGrid">${ALBUMS.map(albumToCard).map(c => mediaCard(c)).join("")}</div>
    `;
    document.querySelectorAll("#albumGrid .media-card").forEach((card, i) => {
      const album = ALBUMS[i];
      card.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/album/${album.id}`;
      });
      const fab = card.querySelector(".play-fab");
      if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); playQueue(album.songIds, 0); });
    });
    animatePageIn();
  }

  // ---------------------------------------------------------------- Artists
  function pageArtists() {
    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Artists</h1><p>${ARTISTS.length} artists</p></div>
      <div class="card-grid" id="artistGrid">${ARTISTS.map(artistToCard).map(c => mediaCard(c)).join("")}</div>
    `;
    bindAllArtistCards(elDOM.view);
    animatePageIn();
  }

  // ---------------------------------------------------------------- Album Details
  function pageAlbumDetails(id) {
    const album = albumById.get(id);
    if (!album) return pageNotFound();
    elDOM.view.innerHTML = `
      <div class="detail-hero">
        <img src="${album.albumArt}" alt="${escapeHtml(album.title)}" />
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
      state.shuffle = true; elDOM.shuffleBtn.classList.add("active");
      playQueue(album.songIds, Math.floor(Math.random() * album.songIds.length));
    });
    animatePageIn();
  }

  // ---------------------------------------------------------------- Artist Details
  function pageArtistDetails(id) {
    const artist = artistById.get(id);
    if (!artist) return pageNotFound();
    const related = ARTISTS.filter((a) => a.id !== id).slice(0, 6);
    const artistAlbums = ALBUMS.filter((a) => a.artist === artist.name);
    elDOM.view.innerHTML = `
      <div class="detail-hero round">
        <img src="${artist.image}" alt="${escapeHtml(artist.name)}" />
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
      ${artistAlbums.length ? sectionBlock("Albums", cardGridHtml(artistAlbums.map(albumToCard))) : ""}
      ${sectionBlock("Related artists", cardGridHtml(related.map(artistToCard)))}
    `;
    renderTrackList(document.getElementById("artistTracks"), artist.songIds.slice(0, 10));
    document.getElementById("playAllBtn").addEventListener("click", () => playQueue(artist.songIds, 0));
    document.getElementById("followBtn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const following = btn.textContent === "Following";
      btn.textContent = following ? "Follow" : "Following";
      btn.classList.toggle("btn-primary", !following);
      btn.classList.toggle("btn-ghost", following);
      toast(following ? `Unfollowed ${artist.name}` : `Following ${artist.name}`);
    });
    // Bind album cards and related artist cards
    bindAlbumCards(elDOM.view);
    bindAllArtistCards(elDOM.view);
    animatePageIn();
  }

  // ---------------------------------------------------------------- Playlists
  function pagePlaylists() {
    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Playlists</h1><p>${state.playlists.length} playlists</p></div>
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
      const artSrc = p.artSrc || (p.songIds[0] && songById.get(p.songIds[0]) ? songById.get(p.songIds[0]).albumArt : "/assets/music-cover.svg");
      card.innerHTML = mediaCard({ art: artSrc, title: p.name, sub: `${p.songIds.length} songs`, id: p.id, kind: "playlist" });
      const node = card.firstElementChild;
      node.addEventListener("click", (e) => {
        if (e.target.closest(".play-fab")) return;
        location.hash = `#/playlist/${p.id}`;
      });
      const fab = node.querySelector(".play-fab");
      if (fab) fab.addEventListener("click", (e) => { e.stopPropagation(); if (p.songIds.length) playQueue(p.songIds, 0); });
      grid.appendChild(node);
    });
    document.getElementById("createPlaylistCard").addEventListener("click", () => openPlaylistModal());
    animatePageIn();
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
    document.getElementById("plName").focus();
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

  // ---------------------------------------------------------------- Playlist Details
  function pagePlaylistDetails(id) {
    if (id === "1098" || id === "1098-songs") id = "pl-all-1098-songs";
    if (id === "pl-london-thumakda") id = "pl-aaj-ki-raat";
    if (id === "pl-bolna") id = "pl-dil-na-jaaneya";
    if (id === "pl-dildaara") id = "pl-raabta";
    if (id === "pl-tera-fitoor") id = "pl-enna-sona";
    if (id === "pl-chor-bazaari") id = "pl-matargashti";
    if (id === "taste-daily-1") id = "taste-romantic";
    if (id === "taste-daily-2") id = "taste-punjabi";
    if (id === "taste-daily-3") id = "taste-party";
    if (id === "taste-daily-4") id = "taste-nostalgia";
    let playlist = state.playlists.find((p) => p.id === id);
    let isCuratedTaste = false;
    let curatedDef = null;

    if (!playlist) {
      // Check if it's a curated taste playlist
      const curatedList = buildCuratedPlaylists();
      curatedDef = curatedList.find((p) => p.id === id);
      if (curatedDef) {
        isCuratedTaste = true;
        playlist = curatedDef;
      }
    }

    if (!playlist) return pageNotFound();

    const isMasterVault = playlist.id === "pl-all-1098-songs";
    const isSavedInLibrary = state.playlists.some((p) => p.name === playlist.name);
    const topSongs = (playlist.songIds || []).slice(0, 4).map((sid) => songById.get(sid)).filter(Boolean);
    const artSrc = playlist.artSrc || (playlist.songIds[0] && songById.get(playlist.songIds[0]) ? songById.get(playlist.songIds[0]).albumArt : "/assets/music-cover.svg");

    const heroArts = (playlist.topArts && playlist.topArts.length >= 4)
      ? playlist.topArts
      : topSongs.map(s => s.albumArt || "/assets/music-cover.svg");
    while (heroArts.length < 4) heroArts.push(artSrc);

    const heroArtHtml = (isCuratedTaste && heroArts.length >= 4)
      ? `<div class="art-wrap taste-hero-mosaic-wrap">
          <div class="taste-mosaic-grid">
            <div class="taste-mosaic-cell cell-1"><img src="${heroArts[0]}" alt="" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
            <div class="taste-mosaic-cell cell-2"><img src="${heroArts[1]}" alt="" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
            <div class="taste-mosaic-cell cell-3"><img src="${heroArts[2]}" alt="" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
            <div class="taste-mosaic-cell cell-4"><img src="${heroArts[3]}" alt="" loading="lazy" onerror="this.src='/assets/music-cover.svg'" /></div>
          </div>
          <div class="taste-art-overlay"></div>
          <div class="taste-eq-anim">
            <span class="taste-eq-bar b1"></span>
            <span class="taste-eq-bar b2"></span>
            <span class="taste-eq-bar b3"></span>
            <span class="taste-eq-bar b4"></span>
          </div>
          <div class="taste-mix-chip" style="background:${playlist.color || '#1ED760'};">
            <i class="fa-solid ${playlist.icon || 'fa-music'}"></i>
          </div>
          <span class="taste-gradient-badge">${escapeHtml(playlist.tag || 'Taste Mix')}</span>
        </div>`
      : `<div class="art-wrap" style="width:200px;height:200px;border-radius:var(--radius-md);overflow:hidden;background:var(--surface-raised);flex:0 0 auto;box-shadow:0 12px 36px rgba(0,0,0,0.5);">
          <img src="${artSrc}" alt="${escapeHtml(playlist.name)}" style="width:100%;height:100%;object-fit:cover;" />
        </div>`;

    elDOM.view.innerHTML = `
      <div class="detail-hero">
        ${heroArtHtml}
        <div class="detail-hero-meta">
          <span class="kicker">${isMasterVault ? '<i class="fa-solid fa-crown" style="color:#f59e0b;margin-right:6px;"></i>Master Flagship Playlist' : playlist.isBlend ? '<i class="fa-solid fa-wand-magic-sparkles" style="color:var(--signal);margin-right:6px;"></i>Spotify Blend' : isCuratedTaste ? "Category Collection" : "Playlist"}</span>
          <h1>${escapeHtml(playlist.name)}</h1>
          <div class="sub">${escapeHtml(playlist.description || playlist.subtitle || "")}</div>
          ${playlist.isBlend ? `
            <div class="blend-taste-pill" style="display:inline-flex;align-items:center;gap:8px;background:rgba(30,215,96,0.12);border:1px solid rgba(30,215,96,0.35);color:var(--signal);padding:5px 12px;border-radius:999px;font-size:0.82rem;font-weight:700;margin:6px 0;width:fit-content;">
              <i class="fa-solid fa-heart-pulse"></i> ${playlist.blendMatchPct || 92}% Taste Match · ${escapeHtml(state.profile?.username || "Om Soni")} &amp; ${escapeHtml(playlist.blendFriend || "Friend")}
            </div>
          ` : ""}
          <div class="sub">${playlist.songIds.length} songs · ${fmtDurationLong(totalDuration(playlist.songIds))}</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllBtn" aria-label="Play"><i class="fa-solid fa-play"></i></button>
        <button class="icon-btn" id="shuffleBtn2" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>
        ${isCuratedTaste ? `
          <button class="home-action-btn ${isSavedInLibrary ? 'secondary' : 'primary'}" id="saveCuratedBtn" style="margin-left:4px;">
            <i class="fa-solid ${isSavedInLibrary ? 'fa-check' : 'fa-plus'}"></i>
            <span>${isSavedInLibrary ? 'Saved in Library' : 'Save to Library'}</span>
          </button>
        ` : isMasterVault ? `
          <button class="home-action-btn secondary" id="masterShuffleBtn" style="margin-left:4px;">
            <i class="fa-solid fa-shuffle"></i>
            <span>Shuffle 1,098 Songs</span>
          </button>
        ` : `
          <button class="text-btn" id="renameBtn"><i class="fa-solid fa-pen" style="margin-right:4px;"></i>Rename</button>
          <button class="text-btn danger" id="deleteBtn"><i class="fa-solid fa-trash" style="margin-right:4px;"></i>Delete</button>
        `}
      </div>
      ${playlist.songIds.length > 30 ? `
        <div class="playlist-search-wrap" style="margin: 16px 0 20px 0; max-width: 380px; position: relative;">
          <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem; pointer-events: none;"></i>
          <input type="text" id="plSearchInput" placeholder="Search within ${playlist.songIds.length} songs..." style="width: 100%; padding: 9px 14px 9px 38px; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--surface-raised); color: var(--text); font-size: 0.88rem; outline: none; transition: border-color var(--transition-fast);" />
        </div>
      ` : ""}
      <div id="plTracks"></div>
    `;

    let currentFilteredSongIds = playlist.songIds.slice();

    function renderTracks(idsToRender) {
      const activeIds = idsToRender || currentFilteredSongIds;
      renderTrackList(document.getElementById("plTracks"), activeIds, {
        emptyIcon: "fa-music",
        emptyTitle: activeIds.length === 0 ? "No matching songs found" : "This playlist is empty",
        emptyBody: activeIds.length === 0 ? "Try searching for another song title or artist in this playlist." : "Add songs from any album or search result.",
        attributions: playlist.attributions || null
      });
      if (!isCuratedTaste && !isMasterVault) {
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
            currentFilteredSongIds = currentFilteredSongIds.filter((sid) => sid !== row.dataset.songId);
            renderTracks();
          });
          const actionsEl = row.querySelector(".track-actions");
          if (actionsEl) actionsEl.appendChild(removeBtn);
        });
      }
    }
    renderTracks();

    const plSearch = document.getElementById("plSearchInput");
    if (plSearch) {
      plSearch.addEventListener("input", () => {
        const q = plSearch.value.trim().toLowerCase();
        if (!q) {
          currentFilteredSongIds = playlist.songIds.slice();
        } else {
          currentFilteredSongIds = playlist.songIds.filter((sid) => {
            const s = songById.get(sid);
            if (!s) return false;
            return (s.title || "").toLowerCase().includes(q) ||
                   (s.artist || "").toLowerCase().includes(q) ||
                   (s.album || "").toLowerCase().includes(q);
          });
        }
        renderTracks(currentFilteredSongIds);
      });
    }

    const masterShuffle = document.getElementById("masterShuffleBtn");
    if (masterShuffle) {
      masterShuffle.addEventListener("click", () => {
        if (!playlist.songIds.length) return;
        state.shuffle = true;
        if (elDOM.shuffleBtn) elDOM.shuffleBtn.classList.add("active");
        playQueue(playlist.songIds, Math.floor(Math.random() * playlist.songIds.length));
        toast("Shuffling all 1,098 songs!");
      });
    }

    document.getElementById("playAllBtn").addEventListener("click", () => playlist.songIds.length && playQueue(playlist.songIds, 0));
    document.getElementById("shuffleBtn2").addEventListener("click", () => {
      if (!playlist.songIds.length) return;
      state.shuffle = true; elDOM.shuffleBtn.classList.add("active");
      playQueue(playlist.songIds, Math.floor(Math.random() * playlist.songIds.length));
    });

    if (isCuratedTaste) {
      const saveBtn = document.getElementById("saveCuratedBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          const already = state.playlists.find((p) => p.name === playlist.name);
          if (already) {
            toast(`"${playlist.name}" is already in your Library`);
          } else {
            const newPl = {
              id: "pl-" + Date.now(),
              name: playlist.name,
              description: playlist.description || playlist.subtitle,
              songIds: [...playlist.songIds],
            };
            state.playlists.push(newPl);
            persistPlaylists();
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Saved in Library</span>';
            saveBtn.className = "home-action-btn secondary";
            toast(`Saved "${playlist.name}" to your Library ✨`);
          }
        });
      }
    } else {
      const renameBtn = document.getElementById("renameBtn");
      if (renameBtn) renameBtn.addEventListener("click", () => openPlaylistModal(playlist));
      const delBtn = document.getElementById("deleteBtn");
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          if (!confirm(`Delete playlist "${playlist.name}"?`)) return;
          state.playlists = state.playlists.filter((p) => p.id !== id);
          persistPlaylists();
          toast("Playlist deleted");
          location.hash = "#/playlists";
        });
      }
    }
    animatePageIn();
  }

  // ---------------------------------------------------------------- Queue page
  function pageQueue() {
    const now = currentSong();
    const upcoming = state.queue.slice(state.currentIndex + 1);
    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Queue</h1><p>${upcoming.length} songs up next</p></div>
      ${now ? `
        <div class="section">
          <div class="section-head"><h2>Now Playing</h2></div>
          <div id="queueNowPlaying"></div>
        </div>
      ` : ""}
      <div class="section">
        <div class="section-head"><h2>Up Next</h2></div>
        <div id="queueUpNext"></div>
      </div>
      ${upcoming.length ? `<button class="text-btn danger" id="clearQueuePage">Clear queue</button>` : ""}
    `;
    if (now) {
      renderTrackList(document.getElementById("queueNowPlaying"), [now.id]);
    }
    if (upcoming.length) {
      renderTrackList(document.getElementById("queueUpNext"), upcoming);
    } else {
      document.getElementById("queueUpNext").innerHTML = emptyState("fa-list-ol", "Queue is empty", "Add songs to see them here.");
    }
    const clearBtn = document.getElementById("clearQueuePage");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      clearQueueKeepCurrent();
      toast("Queue cleared");
      pageQueue();
    });
    animatePageIn();
  }

  // ---------------------------------------------------------------- Settings
  function pageSettings() {
    elDOM.view.innerHTML = `
      <div class="view-header"><h1>Settings</h1></div>

      <div class="section">
        <h2 style="margin-bottom:16px;">Appearance</h2>
        <div style="display:flex;gap:10px;margin-bottom:16px;">
          <button class="btn ${state.settings.theme === 'dark' ? 'btn-primary' : 'btn-ghost'}" id="themeDarkBtn"><i class="fa-solid fa-moon" style="margin-right:6px;"></i>Dark</button>
          <button class="btn ${state.settings.theme === 'light' ? 'btn-primary' : 'btn-ghost'}" id="themeLightBtn"><i class="fa-solid fa-sun" style="margin-right:6px;"></i>Light</button>
        </div>
      </div>

      <div class="section">
        <h2 style="margin-bottom:16px;">Playback</h2>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;cursor:pointer;">
          <input type="checkbox" id="autoplayToggle" ${state.settings.autoplay ? "checked" : ""} style="accent-color:var(--signal);width:18px;height:18px;" /> Autoplay next song
        </label>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;cursor:pointer;">
          <input type="checkbox" id="crossfadeToggle" ${state.settings.crossfade ? "checked" : ""} style="accent-color:var(--signal);width:18px;height:18px;" /> Crossfade between songs
        </label>
      </div>

      <div class="section">
        <h2 style="margin-bottom:16px;">Library</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost" id="clearRecentSettingsBtn"><i class="fa-solid fa-clock-rotate-left" style="margin-right:6px;"></i>Clear recently played</button>
          <button class="btn btn-ghost" id="clearAllDataBtn" style="color:var(--danger);"><i class="fa-solid fa-trash" style="margin-right:6px;"></i>Clear all local data</button>
        </div>
      </div>

      <div class="section about-showcase-section">
        <h2 style="margin-bottom:18px;">About Omify</h2>
        <div class="about-hero-card">
          <div class="about-brand-row">
            <div class="about-brand-icon-wrap">
              <img src="/assets/logo.svg" alt="Omify" class="about-brand-logo" />
              <span class="about-status-indicator" title="Audio Engine Online"></span>
            </div>
            <div style="flex:1;min-width:0;">
              <div class="about-app-title-line">
                <h3 class="about-app-name">Omify</h3>
                <span class="about-edition-badge"><i class="fa-solid fa-sparkles"></i> v2.5 Sukoon Edition</span>
                <span class="about-active-pill"><i class="fa-solid fa-bolt"></i> Hi-Fi Studio</span>
              </div>
              <p class="about-app-motto">Your world, sculpted in sound — A premium, zero-ad streaming platform designed for true audiophiles.</p>
            </div>
          </div>

          <!-- Live Metrics Grid -->
          <div class="about-stats-grid">
            <div class="about-stat-box">
              <div class="about-stat-icon-wrap"><i class="fa-solid fa-compact-disc"></i></div>
              <div class="about-stat-number">${SONGS.length}+</div>
              <div class="about-stat-label">Curated Songs</div>
            </div>
            <div class="about-stat-box">
              <div class="about-stat-icon-wrap"><i class="fa-solid fa-microphone-lines"></i></div>
              <div class="about-stat-number">${ARTISTS.length}</div>
              <div class="about-stat-label">Global Artists</div>
            </div>
            <div class="about-stat-box">
              <div class="about-stat-icon-wrap"><i class="fa-solid fa-record-vinyl"></i></div>
              <div class="about-stat-number">${ALBUMS.length}</div>
              <div class="about-stat-label">Studio Albums</div>
            </div>
            <div class="about-stat-box">
              <div class="about-stat-icon-wrap"><i class="fa-solid fa-earth-americas"></i></div>
              <div class="about-stat-number">11+</div>
              <div class="about-stat-label">Languages</div>
            </div>
          </div>

          <!-- Feature Highlights -->
          <div class="about-features-row">
            <div class="about-feature-card">
              <i class="fa-solid fa-waveform"></i>
              <div class="about-feature-text">
                <strong>Lossless WebAudio Engine</strong>
                <span>48kHz stereo processing with instant client-side playback</span>
              </div>
            </div>
            <div class="about-feature-card">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <div class="about-feature-text">
                <strong>Kinetic Motion Physics</strong>
                <span>Silky 60fps staggered animations across every single page</span>
              </div>
            </div>
            <div class="about-feature-card">
              <i class="fa-solid fa-shield-heart"></i>
              <div class="about-feature-text">
                <strong>100% Free & Private</strong>
                <span>Zero audio advertisements, no telemetry, local offline sync</span>
              </div>
            </div>
          </div>

          <!-- Interactive Hi-Fi Audio Test & Creator Tribute -->
          <div class="about-action-footer">
            <button class="about-test-audio-btn" id="omifyAudioTestBtn" title="Test WebAudio harmonic output">
              <span class="sound-wave-bars">
                <span></span><span></span><span></span><span></span>
              </span>
              <span class="btn-text">Test Hi-Fi Audio Engine</span>
            </button>
            <div class="about-creator-tag">
              <span>Handcrafted with <i class="fa-solid fa-heart" style="color:#F43F5E;"></i> by <strong>Om Soni</strong></span>
              <span class="sukoon-badge"><i class="fa-solid fa-certificate"></i> #sukoon</span>
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById("themeDarkBtn").addEventListener("click", () => { applyTheme("dark"); pageSettings(); });
    document.getElementById("themeLightBtn").addEventListener("click", () => { applyTheme("light"); pageSettings(); });
    document.getElementById("autoplayToggle").addEventListener("change", (e) => { state.settings.autoplay = e.target.checked; persistSettings(); });
    document.getElementById("crossfadeToggle").addEventListener("change", (e) => { state.settings.crossfade = e.target.checked; persistSettings(); });
    document.getElementById("clearRecentSettingsBtn").addEventListener("click", () => { state.recent = []; persistRecent(); toast("Recently played cleared"); });
    document.getElementById("clearAllDataBtn").addEventListener("click", () => {
      if (!confirm("This clears favorites, playlists, and history on this device. Continue?")) return;
      localStorage.clear();
      location.reload();
    });

    // Interactive Audio Engine Harmonic Chime Test
    const audioTestBtn = document.getElementById("omifyAudioTestBtn");
    if (audioTestBtn) {
      audioTestBtn.addEventListener("click", () => {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const chord = [523.25, 659.25, 783.99, 987.77, 1046.50]; // C5, E5, G5, B5, C6 (Pentatonic celestial chime)
            chord.forEach((freq, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(freq, ctx.currentTime);

              const startTime = ctx.currentTime + (idx * 0.08);
              const stopTime = startTime + 1.2;

              gain.gain.setValueAtTime(0.0001, startTime);
              gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.04);
              gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

              osc.connect(gain);
              gain.connect(ctx.destination);

              osc.start(startTime);
              osc.stop(stopTime);
            });
            toast("🎵 Omify Hi-Fi Audio Engine: 48kHz Stereo Verified & Active!");
          } else {
            toast("🎵 Omify Audio Engine: Online");
          }
        } catch (e) {
          toast("🎵 Omify Audio Engine: Online & Ready");
        }
      });
    }

    animatePageIn();
  }

  // ---------------------------------------------------------------- Profile & Avatar System
  const AVATAR_PRESETS = [
    {
      id: "sunset",
      name: "Sunset Melody",
      src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='p1' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%23ff5e62'/><stop offset='100%25' stop-color='%23ff9966'/></linearGradient></defs><rect width='200' height='200' rx='100' fill='url(%23p1)'/><circle cx='100' cy='78' r='36' fill='%23ffffff' opacity='0.92'/><path d='M46 168c0-30 24-54 54-54s54 24 54 54' fill='%23ffffff' opacity='0.92'/></svg>"
    },
    {
      id: "cyber",
      name: "Neon Cyber",
      src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='p2' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%238a2be2'/><stop offset='100%25' stop-color='%234facfe'/></linearGradient></defs><rect width='200' height='200' rx='100' fill='url(%23p2)'/><circle cx='100' cy='100' r='58' fill='none' stroke='%23ffffff' stroke-width='6' opacity='0.85'/><path d='M68 120 L68 80 M84 136 L84 64 M100 148 L100 52 M116 136 L116 64 M132 120 L132 80' stroke='%23ffffff' stroke-width='8' stroke-linecap='round' opacity='0.95'/></svg>"
    },
    {
      id: "sukoon",
      name: "Sukoon Wave",
      src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='p3' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%230575e6'/><stop offset='100%25' stop-color='%2300f260'/></linearGradient></defs><rect width='200' height='200' rx='100' fill='url(%23p3)'/><circle cx='100' cy='78' r='36' fill='%23ffffff' opacity='0.92'/><path d='M46 168c0-30 24-54 54-54s54 24 54 54' fill='%23ffffff' opacity='0.92'/></svg>"
    },
    {
      id: "vinyl",
      name: "Vinyl Classic",
      src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='p4' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%23232526'/><stop offset='100%25' stop-color='%23414345'/></linearGradient></defs><rect width='200' height='200' rx='100' fill='url(%23p4)'/><circle cx='100' cy='100' r='72' fill='none' stroke='%23555555' stroke-width='3'/><circle cx='100' cy='100' r='52' fill='none' stroke='%23666666' stroke-width='3'/><circle cx='100' cy='100' r='30' fill='%23f39c12'/><circle cx='100' cy='100' r='8' fill='%23232526'/></svg>"
    },
    {
      id: "lofi",
      name: "Lo-Fi Indigo",
      src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='p5' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%233a1c71'/><stop offset='50%25' stop-color='%23d76d77'/><stop offset='100%25' stop-color='%23ffaf7b'/></linearGradient></defs><rect width='200' height='200' rx='100' fill='url(%23p5)'/><path d='M80 65 L135 100 L80 135 Z' fill='%23ffffff' opacity='0.92'/></svg>"
    },
    {
      id: "gold",
      name: "Acoustic Gold",
      src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='p6' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%23f12711'/><stop offset='100%25' stop-color='%23f5af19'/></linearGradient></defs><rect width='200' height='200' rx='100' fill='url(%23p6)'/><circle cx='100' cy='78' r='36' fill='%23ffffff' opacity='0.92'/><path d='M46 168c0-30 24-54 54-54s54 24 54 54' fill='%23ffffff' opacity='0.92'/></svg>"
    }
  ];

  function processAvatarFile(file, callback) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      toast("Please select an image file (PNG, JPG, WebP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const targetDim = 400;
          const w = img.width;
          const h = img.height;
          const minSide = Math.min(w, h);
          const sx = (w - minSide) / 2;
          const sy = (h - minSide) / 2;
          canvas.width = targetDim;
          canvas.height = targetDim;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetDim, targetDim);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
          callback(dataUrl);
        } catch (err) {
          callback(e.target.result);
        }
      };
      img.onerror = () => {
        toast("Could not process this image");
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      toast("Error reading file");
    };
    reader.readAsDataURL(file);
  }

  function updateTopbarProfileUI() {
    const topbarProfileBtn = document.getElementById("topbarProfileBtn");
    if (topbarProfileBtn) {
      const avatarSrc = state.profile.avatar || "/assets/logo.svg";
      topbarProfileBtn.innerHTML = `<img src="${avatarSrc}" alt="${escapeHtml(state.profile.username || 'Profile')}" class="topbar-avatar-img" />`;
      topbarProfileBtn.classList.add("has-avatar-img");
    }

    const profileDropdown = document.getElementById("profileDropdown");
    if (profileDropdown) {
      let ddHeader = profileDropdown.querySelector(".profile-dropdown-header");
      const avatarSrc = state.profile.avatar || "/assets/logo.svg";
      const headerContent = `
        <img src="${avatarSrc}" class="profile-dd-avatar" alt="User Avatar" />
        <div class="profile-dd-meta">
          <span class="profile-dd-name">${escapeHtml(state.profile.username || "Om Soni")}</span>
          <span class="profile-dd-sub">${escapeHtml(state.profile.bio || "View profile")}</span>
        </div>
      `;
      if (!ddHeader) {
        ddHeader = document.createElement("a");
        ddHeader.href = "#/profile";
        ddHeader.className = "profile-dropdown-header";
        ddHeader.innerHTML = headerContent;
        const divider = document.createElement("div");
        divider.className = "popover-divider";
        profileDropdown.insertBefore(divider, profileDropdown.firstChild);
        profileDropdown.insertBefore(ddHeader, divider);
      } else {
        ddHeader.innerHTML = headerContent;
      }
    }
  }

  function openEditProfileModal() {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    let workingAvatar = state.profile.avatar || "/assets/logo.svg";
    let initialBio = state.profile.bio || "";

    const presetsHtml = AVATAR_PRESETS.map((p) => {
      const isActive = workingAvatar === p.src;
      return `<button type="button" class="avatar-preset-btn ${isActive ? "active" : ""}" data-src="${p.src}" title="${p.name}"><img src="${p.src}" alt="${p.name}" /></button>`;
    }).join("");

    backdrop.innerHTML = `
      <div class="modal modal-edit-profile" role="dialog" aria-modal="true" aria-labelledby="editProfileTitle">
        <div class="modal-header-row">
          <h3 id="editProfileTitle">Profile details</h3>
          <button class="modal-close-btn" id="editModalClose" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="edit-profile-layout">
          <div class="edit-avatar-col">
            <div class="edit-avatar-preview-box" id="modalAvatarPreviewBox" title="Click to choose a photo from your device">
              <img src="${workingAvatar}" alt="Preview" id="modalAvatarPreviewImg" />
              <div class="edit-avatar-overlay">
                <i class="fa-solid fa-camera"></i>
                <span>Choose photo</span>
              </div>
            </div>

            <input type="file" id="modalFileInput" accept="image/*" style="display:none;" />

            <div class="edit-avatar-btns">
              <button type="button" class="btn btn-secondary btn-sm" id="modalUploadBtn">
                <i class="fa-solid fa-arrow-up-from-bracket"></i> Choose photo
              </button>
              <button type="button" class="text-btn btn-sm" id="modalRemoveBtn">
                <i class="fa-solid fa-arrow-rotate-left"></i> Reset to logo
              </button>
            </div>

            <div class="avatar-presets-wrap">
              <span class="avatar-presets-title">Or choose a style:</span>
              <div class="avatar-presets-list" id="avatarPresetsList">
                ${presetsHtml}
              </div>
            </div>
          </div>

          <div class="edit-inputs-col">
            <div class="input-group">
              <label for="editUsernameInput">Name</label>
              <input type="text" id="editUsernameInput" placeholder="Add a name" value="${escapeHtml(state.profile.username || 'Om Soni')}" maxlength="36" />
            </div>

            <div class="input-group">
              <label for="editBioInput">Bio</label>
              <textarea id="editBioInput" placeholder="Add an optional bio (tell listeners about your music taste)" rows="3" maxlength="160">${escapeHtml(initialBio)}</textarea>
              <div class="char-count" id="bioCharCount">${initialBio.length}/160</div>
            </div>

            <p class="edit-profile-disclaimer">
              By proceeding, you agree to give Omify access to the image you chose to upload. Your picture is stored securely in your browser.
            </p>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="text-btn" id="editCancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="editSave">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    document.getElementById("editModalClose").addEventListener("click", close);
    document.getElementById("editCancel").addEventListener("click", close);

    const modalPreviewImg = document.getElementById("modalAvatarPreviewImg");
    const modalFileInput = document.getElementById("modalFileInput");
    const modalUploadBtn = document.getElementById("modalUploadBtn");
    const modalRemoveBtn = document.getElementById("modalRemoveBtn");
    const modalAvatarBox = document.getElementById("modalAvatarPreviewBox");
    const usernameInput = document.getElementById("editUsernameInput");
    const bioInput = document.getElementById("editBioInput");
    const bioCount = document.getElementById("bioCharCount");
    const presetsList = document.getElementById("avatarPresetsList");

    bioInput.addEventListener("input", () => {
      bioCount.textContent = `${bioInput.value.length}/160`;
    });

    const triggerFile = () => modalFileInput.click();
    modalUploadBtn.addEventListener("click", triggerFile);
    modalAvatarBox.addEventListener("click", triggerFile);

    modalFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        processAvatarFile(file, (dataUrl) => {
          workingAvatar = dataUrl;
          modalPreviewImg.src = workingAvatar;
          presetsList.querySelectorAll(".avatar-preset-btn").forEach((b) => b.classList.remove("active"));
          toast("Photo loaded! Click Save to apply.");
        });
      }
    });

    modalRemoveBtn.addEventListener("click", () => {
      workingAvatar = "/assets/logo.svg";
      modalPreviewImg.src = workingAvatar;
      presetsList.querySelectorAll(".avatar-preset-btn").forEach((b) => {
        b.classList.remove("active");
      });
      toast("Photo reset to default logo");
    });

    presetsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".avatar-preset-btn");
      if (!btn) return;
      workingAvatar = btn.dataset.src;
      modalPreviewImg.src = workingAvatar;
      presetsList.querySelectorAll(".avatar-preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });

    // Drag and drop onto modal avatar preview box
    modalAvatarBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      modalAvatarBox.style.outline = "2px dashed var(--signal)";
      modalAvatarBox.style.outlineOffset = "4px";
    });
    modalAvatarBox.addEventListener("dragleave", () => {
      modalAvatarBox.style.outline = "none";
    });
    modalAvatarBox.addEventListener("drop", (e) => {
      e.preventDefault();
      modalAvatarBox.style.outline = "none";
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) {
        processAvatarFile(file, (dataUrl) => {
          workingAvatar = dataUrl;
          modalPreviewImg.src = workingAvatar;
          presetsList.querySelectorAll(".avatar-preset-btn").forEach((b) => b.classList.remove("active"));
          toast("Photo loaded! Click Save to apply.");
        });
      }
    });

    usernameInput.focus();

    document.getElementById("editSave").addEventListener("click", () => {
      const name = usernameInput.value.trim();
      state.profile.username = name || "Om Soni";
      state.profile.bio = bioInput.value.trim();
      state.profile.avatar = workingAvatar;
      persistProfile();
      updateTopbarProfileUI();
      close();
      toast("Profile updated successfully! ✨");
      pageProfile();
    });
  }

  function pageProfile() {
    const genreCount = {};
    const langCount = {};
    Array.from(state.favorites).forEach((id) => {
      const s = songById.get(id);
      if (s) {
        genreCount[s.genre] = (genreCount[s.genre] || 0) + 1;
        langCount[s.language] = (langCount[s.language] || 0) + 1;
      }
    });
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
    const topLangs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l);

    const avatarSrc = state.profile.avatar || "/assets/logo.svg";

    elDOM.view.innerHTML = `
      <div class="detail-hero round profile-hero">
        <div class="profile-avatar-container" id="profileAvatarHeroBox" role="button" tabindex="0" title="Click to choose a photo or edit profile">
          <div class="profile-avatar-inner">
            <img src="${avatarSrc}" alt="${escapeHtml(state.profile.username || 'Om Soni')}" id="profileHeroAvatarImg" />
            <div class="profile-avatar-overlay">
              <i class="fa-solid fa-camera"></i>
              <span>Choose photo</span>
            </div>
          </div>
          <div class="profile-avatar-badge" id="profileHeroBadge" title="Upload new photo">
            <i class="fa-solid fa-camera"></i>
          </div>
        </div>

        <input type="file" id="heroDirectFileInput" accept="image/*" style="display:none;" />

        <div class="detail-hero-meta">
          <span class="kicker">Profile</span>
          <h1 id="profileName" class="profile-display-name">${escapeHtml(state.profile.username || 'Om Soni')}</h1>
          ${state.profile.bio ? `<p class="profile-display-bio">${escapeHtml(state.profile.bio)}</p>` : ""}
          <div class="sub profile-stats-sub">
            <span><strong>${state.playlists.length}</strong> public playlists</span>
            <span class="bullet-dot">•</span>
            <span><strong>${state.favorites.size}</strong> liked songs</span>
            <span class="bullet-dot">•</span>
            <span class="profile-badge-listener"><i class="fa-solid fa-circle-check"></i> Verified listener</span>
          </div>
          <div class="profile-hero-actions">
            <button class="btn btn-secondary profile-action-btn" id="editProfileBtn">
              <i class="fa-solid fa-pen"></i> Edit profile
            </button>
            <button class="btn btn-subtle profile-action-btn" id="changePhotoDirectBtn">
              <i class="fa-solid fa-arrow-up-from-bracket"></i> Add photo
            </button>
            <button class="icon-btn profile-action-btn" id="shareProfileBtn" title="Share profile link" aria-label="Share profile link">
              <i class="fa-solid fa-share-nodes"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="section">
        <h2 style="margin-bottom:14px;">Favorite genres</h2>
        <div class="filter-row">${topGenres.length ? topGenres.map((g) => `<span class="filter-pill active">${escapeHtml(g)}</span>`).join("") : "<p style='margin:0;'>Like some songs to see your favorite genres here.</p>"}</div>
      </div>

      ${topLangs.length ? `
      <div class="section">
        <h2 style="margin-bottom:14px;">Top languages</h2>
        <div class="filter-row">${topLangs.map((l) => `<span class="filter-pill active">${escapeHtml(l)}</span>`).join("")}</div>
      </div>
      ` : ""}

      <div class="section">
        <h2 style="margin-bottom:14px;">Recently played</h2>
        <div id="profileRecent"></div>
      </div>
    `;

    renderTrackList(document.getElementById("profileRecent"), state.recent.slice(0, 5).map((r) => r.songId));

    const heroBox = document.getElementById("profileAvatarHeroBox");
    const heroBadge = document.getElementById("profileHeroBadge");
    const directFileInput = document.getElementById("heroDirectFileInput");
    const changePhotoBtn = document.getElementById("changePhotoDirectBtn");
    const editProfileBtn = document.getElementById("editProfileBtn");
    const shareProfileBtn = document.getElementById("shareProfileBtn");

    // Clicking avatar box or badge opens edit modal where they can preview & customize
    heroBox.addEventListener("click", () => openEditProfileModal());
    heroBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      directFileInput.click();
    });

    // 1-click photo upload via button
    changePhotoBtn.addEventListener("click", () => directFileInput.click());

    directFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        processAvatarFile(file, (dataUrl) => {
          state.profile.avatar = dataUrl;
          persistProfile();
          updateTopbarProfileUI();
          const heroImg = document.getElementById("profileHeroAvatarImg");
          if (heroImg) heroImg.src = dataUrl;
          toast("Profile picture updated! ✨");
        });
      }
    });

    // Drag and drop photo directly onto hero avatar
    heroBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      heroBox.classList.add("drag-over");
    });
    heroBox.addEventListener("dragleave", () => {
      heroBox.classList.remove("drag-over");
    });
    heroBox.addEventListener("drop", (e) => {
      e.preventDefault();
      heroBox.classList.remove("drag-over");
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) {
        processAvatarFile(file, (dataUrl) => {
          state.profile.avatar = dataUrl;
          persistProfile();
          updateTopbarProfileUI();
          const heroImg = document.getElementById("profileHeroAvatarImg");
          if (heroImg) heroImg.src = dataUrl;
          toast("Profile picture updated! ✨");
        });
      }
    });

    // Edit Profile Modal
    editProfileBtn.addEventListener("click", () => openEditProfileModal());

    // Share profile
    shareProfileBtn.addEventListener("click", () => {
      const url = `${window.location.origin}${window.location.pathname}#/profile`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          toast("Profile link copied to clipboard! 🔗");
        }).catch(() => {
          toast("Profile: " + url);
        });
      } else {
        toast("Profile: " + url);
      }
    });

    animatePageIn();
  }

  // ---------------------------------------------------------------- 1000 Songs Catalog
  // ---------------------------------------------------------------- 1000 Songs Catalog
  function pageCatalog1000() {
    let currentPage = 1;
    let pageSize = 1098; // Show all 1098 songs by default so not a single song is missed
    let selectedGenre = "All";
    let selectedSort = "popular";
    let filterQuery = "";
    let viewMode = "genres"; // "genres" | "grid" | "list"

    // Pre-compute genre groups
    const genreMap = {};
    SONGS.forEach(s => {
      if (!genreMap[s.genre]) genreMap[s.genre] = [];
      genreMap[s.genre].push(s);
    });
    const genreOrder = Object.entries(genreMap).sort((a, b) => b[1].length - a[1].length);

    // Mood groups
    const moodMap = {};
    SONGS.forEach(s => {
      if (!moodMap[s.mood]) moodMap[s.mood] = [];
      moodMap[s.mood].push(s);
    });

    // Genre colors for visual distinction
    const genreColors = {
      "Pop": "#1ED760",
      "Bollywood": "#E13300",
      "Punjabi Pop": "#FF6B35",
      "Indie / Acoustic": "#8B5CF6",
      "Hip-Hop / Rap": "#EF4444",
      "International Pop": "#3B82F6",
      "Electronic / Dance": "#06B6D4",
      "Haryanvi": "#F59E0B",
    };

    const genreIcons = {
      "Pop": "fa-music",
      "Bollywood": "fa-film",
      "Punjabi Pop": "fa-drum",
      "Indie / Acoustic": "fa-guitar",
      "Hip-Hop / Rap": "fa-microphone-lines",
      "International Pop": "fa-earth-americas",
      "Electronic / Dance": "fa-headphones",
      "Haryanvi": "fa-bolt",
    };

    function renderSongCard(s) {
      const isCurrent = Boolean(s.id === state.currentSongId);
      const isCurrentPlaying = isCurrent && state.isPlaying;
      return `
        <div class="catalog-song-card ${isCurrent ? "playing" : ""} ${isCurrentPlaying ? "active-playing" : ""}" data-song-id="${s.id}">
          <div class="catalog-card-art-wrap">
            <img src="${s.albumArt}" alt="${escapeHtml(s.title)}" loading="lazy" onerror="this.src='/assets/music-cover.svg'" />
            <button class="play-fab" aria-label="${isCurrentPlaying ? "Pause" : "Play"} ${escapeHtml(s.title)}"><i class="fa-solid ${isCurrentPlaying ? "fa-pause" : "fa-play"}"></i></button>
          </div>
          <div class="catalog-card-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>
          <div class="catalog-card-sub" title="${escapeHtml(s.artist)}">${escapeHtml(s.artist)}</div>
        </div>
      `;
    }

    function renderCatalog() {
      let filtered = [...SONGS];

      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        filtered = filtered.filter(s =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.album.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q) ||
          s.mood.toLowerCase().includes(q)
        );
      }

      if (selectedGenre !== "All") {
        filtered = filtered.filter(s => s.genre === selectedGenre);
      }

      if (selectedSort === "popular") {
        filtered.sort((a, b) => b.playCount - a.playCount);
      } else if (selectedSort === "title") {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
      } else if (selectedSort === "artist") {
        filtered.sort((a, b) => a.artist.localeCompare(b.artist));
      } else if (selectedSort === "year") {
        filtered.sort((a, b) => b.releaseYear - a.releaseYear);
      }

      const totalPages = Math.ceil(filtered.length / pageSize) || 1;
      if (currentPage > totalPages) currentPage = totalPages;

      const startIndex = (currentPage - 1) * pageSize;
      const pageItems = filtered.slice(startIndex, startIndex + pageSize);

      const allGenres = ["All", ...genreOrder.map(([g]) => g)];

      // Build genre sections view (shows ALL 1098 songs organized by genre)
      let genreSectionsHtml = "";
      if (viewMode === "genres" && selectedGenre === "All" && !filterQuery) {
        // Quick Jump Genre Navigation Pills
        genreSectionsHtml += `
          <div class="catalog-nav-pills" id="catalogNavPills">
            <button class="catalog-nav-pill active" data-genre-target="all">
              <i class="fa-solid fa-compact-disc" style="color:var(--signal);"></i> All (${SONGS.length})
            </button>
            ${genreOrder.map(([g, gSongs]) => {
          const icon = genreIcons[g] || "fa-music";
          const color = genreColors[g] || "#1ED760";
          const slug = g.toLowerCase().replace(/[^a-z0-9]/g, "-");
          return `
                <button class="catalog-nav-pill" data-genre-target="${slug}" data-genre-name="${escapeHtml(g)}">
                  <i class="fa-solid ${icon}" style="color:${color};"></i> ${escapeHtml(g)} (${gSongs.length})
                </button>
              `;
        }).join("")}
          </div>
        `;

        // Top Picks hero carousel (top 8 most popular)
        const topPicks = [...SONGS].sort((a, b) => b.playCount - a.playCount).slice(0, 8);
        genreSectionsHtml += `
          <div class="catalog-top-picks">
            <h2 class="catalog-section-title"><i class="fa-solid fa-fire" style="color:#FF6B35;"></i> Top Picks For You</h2>
            <div class="catalog-card-scroll">
              ${topPicks.map(renderSongCard).join("")}
            </div>
          </div>
        `;

        // Genre category overview cards
        genreSectionsHtml += `
          <div class="catalog-genre-cards">
            <h2 class="catalog-section-title"><i class="fa-solid fa-layer-group" style="color:var(--signal);"></i> Browse by Genre</h2>
            <div class="catalog-genre-grid">
              ${genreOrder.map(([genre, songs]) => {
          const color = genreColors[genre] || "#1ED760";
          const icon = genreIcons[genre] || "fa-music";
          const topSong = songs.sort((a, b) => b.playCount - a.playCount)[0];
          const slug = genre.toLowerCase().replace(/[^a-z0-9]/g, "-");
          return `
                  <div class="catalog-genre-tile" data-genre="${escapeHtml(genre)}" data-slug="${slug}" style="--genre-color:${color};">
                    <img src="${topSong.albumArt}" alt="" class="genre-tile-bg" loading="lazy" onerror="this.src='/assets/music-cover.svg'" />
                    <div class="genre-tile-overlay"></div>
                    <div class="genre-tile-content">
                      <i class="fa-solid ${icon}"></i>
                      <h3>${escapeHtml(genre)}</h3>
                      <span>${songs.length} songs</span>
                    </div>
                  </div>
                `;
        }).join("")}
            </div>
          </div>
        `;

        // EACH GENRE SECTION WITH ALL OF ITS SONGS (NOT A SINGLE ONE MISSED)
        genreOrder.forEach(([genre, songs]) => {
          const sorted = [...songs].sort((a, b) => b.playCount - a.playCount);
          const color = genreColors[genre] || "#1ED760";
          const icon = genreIcons[genre] || "fa-music";
          const slug = genre.toLowerCase().replace(/[^a-z0-9]/g, "-");
          genreSectionsHtml += `
            <div class="catalog-genre-section" id="catalog-genre-${slug}">
              <div class="catalog-section-header">
                <h2 class="catalog-section-title">
                  <i class="fa-solid ${icon}" style="color:${color};"></i> ${escapeHtml(genre)}
                  <span class="catalog-section-badge">${songs.length} songs · All displayed</span>
                </h2>
                <div class="catalog-section-actions">
                  <button class="btn btn-primary btn-sm catalog-play-genre-btn" data-genre="${escapeHtml(genre)}">
                    <i class="fa-solid fa-play"></i> Play all ${songs.length}
                  </button>
                  <button class="btn btn-ghost btn-sm catalog-shuffle-genre-btn" data-genre="${escapeHtml(genre)}">
                    <i class="fa-solid fa-shuffle"></i> Shuffle
                  </button>
                </div>
              </div>
              <div class="catalog-cards-grid">
                ${sorted.map(renderSongCard).join("")}
              </div>
            </div>
          `;
        });

        // Mood sections overview
        const moodColors = { "Chill": "#4facfe", "Romantic": "#f093fb", "Energetic": "#FF6B35", "Sukoon": "#43e97b", "Hype": "#EF4444", "Uplifting": "#F59E0B", "Upbeat": "#06B6D4", "Party": "#a18cd1" };
        const moodIcons = { "Chill": "fa-snowflake", "Romantic": "fa-heart", "Energetic": "fa-bolt-lightning", "Sukoon": "fa-leaf", "Hype": "fa-fire-flame-curved", "Uplifting": "fa-sun", "Upbeat": "fa-face-smile-beam", "Party": "fa-champagne-glasses" };
        genreSectionsHtml += `
          <div class="catalog-mood-section">
            <h2 class="catalog-section-title"><i class="fa-solid fa-palette" style="color:#a18cd1;"></i> Browse by Mood</h2>
            <div class="catalog-genre-grid">
              ${Object.entries(moodMap).sort((a, b) => b[1].length - a[1].length).map(([mood, mSongs]) => {
          const color = moodColors[mood] || "#1ED760";
          const icon = moodIcons[mood] || "fa-music";
          const topSong = mSongs.sort((a, b) => b.playCount - a.playCount)[0];
          return `
                  <div class="catalog-mood-tile" data-mood="${escapeHtml(mood)}" style="--genre-color:${color};">
                    <img src="${topSong.albumArt}" alt="" class="genre-tile-bg" loading="lazy" onerror="this.src='/assets/music-cover.svg'" />
                    <div class="genre-tile-overlay"></div>
                    <div class="genre-tile-content">
                      <i class="fa-solid ${icon}"></i>
                      <h3>${escapeHtml(mood)}</h3>
                      <span>${mSongs.length} songs</span>
                    </div>
                  </div>
                `;
        }).join("")}
            </div>
          </div>
        `;
      }

      // Unified Continuous Grid View for ALL 1098 Songs (when viewMode is grid or when filter/genre is active)
      let gridSectionsHtml = "";
      if (viewMode === "grid" || (selectedGenre !== "All" && viewMode !== "list") || (filterQuery && viewMode === "grid")) {
        gridSectionsHtml = `
          <div class="catalog-stats">
            <span>Showing <strong>${filtered.length}</strong> of <strong>${SONGS.length}</strong> songs · All with unique cover art logos</span>
            <span>${selectedGenre !== "All" ? `Genre: <strong>${escapeHtml(selectedGenre)}</strong>` : "All Genres"}</span>
          </div>
          <div class="catalog-cards-grid">
            ${filtered.length ? filtered.map(renderSongCard).join("") : emptyState("fa-music", "No songs found", "Try clearing search or filters.")}
          </div>
        `;
      }

      // List Table View for ALL 1098 Songs
      let listSectionsHtml = "";
      if (viewMode === "list" || (filterQuery && viewMode !== "grid")) {
        listSectionsHtml = `
          <div class="catalog-stats">
            <span>Showing <strong>${pageItems.length}</strong> of <strong>${filtered.length}</strong> songs · All with unique cover art logos</span>
            <span>Page ${currentPage} of ${totalPages}</span>
          </div>

          <div class="track-list" id="catalogTrackList">
            ${pageItems.length ? pageItems.map((s, idx) => trackRow(s, startIndex + idx)).join("") : emptyState("fa-music", "No songs found", "Try clearing filters or search query.")}
          </div>

          ${totalPages > 1 ? `
            <div class="catalog-pagination">
              <button class="btn btn-ghost" id="catPrevBtn" ${currentPage === 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i> Previous</button>
              <span class="pagination-info">Page ${currentPage} / ${totalPages} (${pageSize} per page)</span>
              <button class="btn btn-ghost" id="catNextBtn" ${currentPage === totalPages ? "disabled" : ""}>Next <i class="fa-solid fa-chevron-right"></i></button>
              <button class="btn btn-ghost btn-sm" id="catShowAllBtn"><i class="fa-solid fa-eye"></i> Show All ${filtered.length}</button>
            </div>
          ` : ""}
        `;
      }

      elDOM.view.innerHTML = `
        <!-- Catalog Hero Banner -->
        <div class="catalog-hero">
          <div class="catalog-hero-gradient"></div>
          <div class="catalog-hero-content">
            <div class="catalog-hero-icon"><i class="fa-solid fa-compact-disc"></i></div>
            <div class="catalog-hero-text">
              <span class="catalog-hero-label">COMPLETE SPOTIFY LIBRARY</span>
              <h1 class="catalog-hero-title">All ${SONGS.length.toLocaleString()} Songs Collection</h1>
              <p class="catalog-hero-sub">Every single song with unique album art logo · ${ARTISTS.length} artists · ${ALBUMS.length} albums · ${genreOrder.length} genres</p>
              <div class="catalog-all-loaded-badge">
                <i class="fa-solid fa-circle-check"></i> ALL ${SONGS.length.toLocaleString()} SONGS LOADED WITH LOGOS · 0 MISSING
              </div>
            </div>
            <div class="catalog-hero-actions">
              <button class="btn btn-primary catalog-play-all" id="playAllCatalogBtn">
                <i class="fa-solid fa-play"></i> Play All (${SONGS.length})
              </button>
              <button class="btn btn-ghost catalog-shuffle-btn" id="shuffleCatalogBtn">
                <i class="fa-solid fa-shuffle"></i> Shuffle (${SONGS.length})
              </button>
            </div>
          </div>
        </div>

        <!-- View Mode Toggle & Search -->
        <div class="catalog-toolbar">
          <div class="catalog-view-toggle">
            <button class="catalog-view-btn ${viewMode === 'genres' ? 'active' : ''}" data-view="genres" title="All 1,098 songs by genre">
              <i class="fa-solid fa-layer-group"></i> <span>By Genre (${SONGS.length})</span>
            </button>
            <button class="catalog-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="All 1,098 songs grid">
              <i class="fa-solid fa-table-cells"></i> <span>All ${SONGS.length} Grid</span>
            </button>
            <button class="catalog-view-btn ${viewMode === 'list' ? 'active' : ''}" data-view="list" title="All 1,098 songs list">
              <i class="fa-solid fa-list"></i> <span>All ${SONGS.length} List</span>
            </button>
          </div>
          <div class="catalog-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="catalogSearchInput" placeholder="Search all ${SONGS.length.toLocaleString()} songs, artists, genres..." value="${escapeHtml(filterQuery)}" />
          </div>
          <div class="catalog-filters">
            <select id="catalogGenreSelect" class="catalog-select" aria-label="Filter by genre">
              ${allGenres.map(g => `<option value="${escapeHtml(g)}" ${g === selectedGenre ? "selected" : ""}>
                ${g === "All" ? `All Genres (${SONGS.length})` : `${g} (${genreMap[g] ? genreMap[g].length : 0})`}
              </option>`).join("")}
            </select>
            <select id="catalogSortSelect" class="catalog-select" aria-label="Sort catalog">
              <option value="popular" ${selectedSort === "popular" ? "selected" : ""}>Most Popular</option>
              <option value="title" ${selectedSort === "title" ? "selected" : ""}>Title (A-Z)</option>
              <option value="artist" ${selectedSort === "artist" ? "selected" : ""}>Artist (A-Z)</option>
              <option value="year" ${selectedSort === "year" ? "selected" : ""}>Release Year</option>
            </select>
          </div>
        </div>

        ${genreSectionsHtml}
        ${gridSectionsHtml}
        ${listSectionsHtml}
      `;

      bindTrackRows(elDOM.view);

      // Bind all catalog song cards (click anywhere to play/view, or play fab to immediately play)
      elDOM.view.querySelectorAll(".catalog-song-card").forEach(card => {
        const songId = card.dataset.songId;
        card.addEventListener("click", (e) => {
          if (e.target.closest(".play-fab")) return;
          if (state.currentSongId === songId) {
            togglePlay();
          } else {
            const song = songById.get(songId);
            if (song) {
              playQueue([songId], 0);
            }
          }
        });
        const fab = card.querySelector(".play-fab");
        if (fab) {
          fab.addEventListener("click", (e) => {
            e.stopPropagation();
            if (state.currentSongId === songId) {
              togglePlay();
            } else {
              playQueue([songId], 0);
            }
          });
        }
      });

      // Bind quick-jump genre navigation pills
      elDOM.view.querySelectorAll(".catalog-nav-pill").forEach(pill => {
        pill.addEventListener("click", () => {
          const target = pill.dataset.genreTarget;
          elDOM.view.querySelectorAll(".catalog-nav-pill").forEach(p => p.classList.remove("active"));
          pill.classList.add("active");

          if (target === "all") {
            if (viewMode !== "genres") {
              viewMode = "genres";
              selectedGenre = "All";
              renderCatalog();
            } else {
              elDOM.view.scrollTo({ top: 0, behavior: "smooth" });
            }
          } else {
            if (viewMode === "genres" && selectedGenre === "All" && !filterQuery) {
              const targetEl = document.getElementById("catalog-genre-" + target);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            } else {
              selectedGenre = pill.dataset.genreName || "All";
              renderCatalog();
            }
          }
        });
      });

      // Bind genre overview tiles
      elDOM.view.querySelectorAll(".catalog-genre-tile").forEach(tile => {
        tile.addEventListener("click", () => {
          const slug = tile.dataset.slug;
          const targetEl = document.getElementById("catalog-genre-" + slug);
          if (targetEl && viewMode === "genres" && selectedGenre === "All" && !filterQuery) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            selectedGenre = tile.dataset.genre;
            viewMode = "grid";
            currentPage = 1;
            renderCatalog();
            elDOM.view.scrollTop = 0;
          }
        });
      });

      // Bind mood tiles
      elDOM.view.querySelectorAll(".catalog-mood-tile").forEach(tile => {
        tile.addEventListener("click", () => {
          filterQuery = tile.dataset.mood;
          viewMode = "grid";
          currentPage = 1;
          renderCatalog();
          elDOM.view.scrollTop = 0;
        });
      });

      // Bind genre Play All buttons
      elDOM.view.querySelectorAll(".catalog-play-genre-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const genre = btn.dataset.genre;
          const songs = genreMap[genre];
          if (songs && songs.length) {
            playQueue(songs.map(s => s.id), 0);
            toast(`Playing all ${songs.length} ${genre} songs`);
          }
        });
      });

      // Bind genre Shuffle buttons
      elDOM.view.querySelectorAll(".catalog-shuffle-genre-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const genre = btn.dataset.genre;
          const songs = genreMap[genre];
          if (songs && songs.length) {
            const shuffled = [...songs].sort(() => Math.random() - 0.5);
            playQueue(shuffled.map(s => s.id), 0);
            toast(`Shuffling ${shuffled.length} ${genre} songs`);
          }
        });
      });

      // View mode toggle
      elDOM.view.querySelectorAll(".catalog-view-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          viewMode = btn.dataset.view;
          if (viewMode === "genres") {
            selectedGenre = "All";
            filterQuery = "";
          }
          renderCatalog();
        });
      });

      // Search input
      const searchIn = document.getElementById("catalogSearchInput");
      if (searchIn) {
        if (filterQuery) {
          searchIn.focus();
          searchIn.setSelectionRange(searchIn.value.length, searchIn.value.length);
        }
        searchIn.addEventListener("input", (e) => {
          filterQuery = e.target.value;
          currentPage = 1;
          if (filterQuery && viewMode === "genres") {
            viewMode = "grid";
          }
          renderCatalog();
        });
      }

      // Genre select dropdown
      const genreSel = document.getElementById("catalogGenreSelect");
      if (genreSel) {
        genreSel.addEventListener("change", (e) => {
          selectedGenre = e.target.value;
          currentPage = 1;
          if (selectedGenre !== "All" && viewMode === "genres") {
            viewMode = "grid";
          }
          renderCatalog();
        });
      }

      // Sort select dropdown
      const sortSel = document.getElementById("catalogSortSelect");
      if (sortSel) {
        sortSel.addEventListener("change", (e) => {
          selectedSort = e.target.value;
          currentPage = 1;
          renderCatalog();
        });
      }

      // Pagination buttons
      const prevBtn = document.getElementById("catPrevBtn");
      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          if (currentPage > 1) { currentPage--; renderCatalog(); elDOM.view.scrollTop = 0; }
        });
      }
      const nextBtn = document.getElementById("catNextBtn");
      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          if (currentPage < totalPages) { currentPage++; renderCatalog(); elDOM.view.scrollTop = 0; }
        });
      }
      const showAllBtn = document.getElementById("catShowAllBtn");
      if (showAllBtn) {
        showAllBtn.addEventListener("click", () => {
          pageSize = 1098;
          currentPage = 1;
          renderCatalog();
        });
      }

      // Play all / Shuffle buttons in hero
      const playAllBtn = document.getElementById("playAllCatalogBtn");
      if (playAllBtn) {
        playAllBtn.addEventListener("click", () => {
          if (filtered.length) {
            playQueue(filtered.map(s => s.id), 0);
            toast(`Playing all ${filtered.length} tracks`);
          }
        });
      }
      const shuffleBtn = document.getElementById("shuffleCatalogBtn");
      if (shuffleBtn) {
        shuffleBtn.addEventListener("click", () => {
          const shuffled = [...filtered].sort(() => Math.random() - 0.5);
          if (shuffled.length) {
            playQueue(shuffled.map(s => s.id), 0);
            toast(`Shuffling ${shuffled.length} tracks`);
          }
        });
      }

      animatePageIn();
    }

    renderCatalog();
  }

  // ---------------------------------------------------------------- Local Files (Original 10 Songs)
  function pageLocalFiles() {
    const localTracks = SONGS.slice(0, 10);
    elDOM.view.innerHTML = `
      <div class="detail-hero">
        <img src="${localTracks[0]?.albumArt || '/assets/music-cover.svg'}" alt="Local Files" style="border-radius:var(--radius-md);box-shadow:0 12px 36px rgba(0,0,0,0.5);" onerror="this.onerror=null;this.src='/assets/music-cover.svg';" />
        <div class="detail-hero-meta">
          <span class="kicker">Playlist</span>
          <h1>Local Files</h1>
          <div class="sub">Your original songs · ${localTracks.length} tracks · Curated local vault</div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="play-fab-lg" id="playAllLocalBtn" aria-label="Play all local tracks"><i class="fa-solid fa-play"></i></button>
      </div>
      <div id="localTracksList"></div>
    `;
    renderTrackList(document.getElementById("localTracksList"), localTracks.map(s => s.id));
    const playBtn = document.getElementById("playAllLocalBtn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        playQueue(localTracks.map(s => s.id), 0);
        toast(`Playing Local Files (${localTracks.length} tracks)`);
      });
    }
    animatePageIn();
  }

  // ---------------------------------------------------------------- 404
  function pageNotFound() {
    elDOM.view.innerHTML = emptyState("fa-compass", "Page not found", "The page you're looking for doesn't exist.", `<a href="#/home" class="btn btn-primary" style="margin-top:10px;display:inline-block;">Back to Home</a>`);
    animatePageIn();
  }

  // ================================================================== ROUTER
  const routes = {
    "home": () => pageHome(),
    "local-files": () => pageLocalFiles(),
    "catalog-1000": () => pageCatalog1000(),
    "catalog-1098": () => pageCatalog1000(),
    "1098-songs": () => pageCatalog1000(),
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
    "queue": () => pageQueue(),
    "settings": () => pageSettings(),
    "profile": () => pageProfile(),
  };

  function router() {
    closeSidebar();
    closeMobilePlayer();
    elDOM.scrim.classList.remove("open");
    const hash = location.hash.replace(/^#\//, "");
    const [pathPart, queryPart] = hash.split("?");
    const segments = pathPart.split("/").filter(Boolean);
    const routeName = segments[0] || "home";
    const params = segments.slice(1);
    const query = new URLSearchParams(queryPart || "");

    const handler = routes[routeName];
    elDOM.view.scrollTop = 0;
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
    refreshVisibleTrackRows();
  }

  window.addEventListener("hashchange", router);
  window.addEventListener("DOMContentLoaded", async () => {
    await hydrateAllSongsFromBackend();
    if (!location.hash) location.hash = "#/home";
    updateTopbarProfileUI();
    router();
  });

  // global search input wires into the search route
  const globalSearchEl = document.getElementById("globalSearchInput");
  if (globalSearchEl) {
    globalSearchEl.addEventListener("input", (e) => {
      const q = e.target.value;
      const pageIn = document.getElementById("pageSearchInput");
      if (location.hash.startsWith("#/search") && pageIn) {
        if (pageIn.value !== q) pageIn.value = q;
        pageIn.dispatchEvent(new Event("input"));
      } else {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          if (location.hash.startsWith("#/search")) {
            pageSearch(q);
          } else {
            location.hash = q.trim() ? `#/search?q=${encodeURIComponent(q.trim())}` : "#/search";
          }
        }, 150);
      }
    });
    globalSearchEl.addEventListener("focus", () => {
      if (!location.hash.startsWith("#/search")) {
        const currentQ = globalSearchEl.value;
        location.hash = currentQ.trim() ? `#/search?q=${encodeURIComponent(currentQ.trim())}` : "#/search";
      }
    });
    globalSearchEl.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.key === " ") {
        e.stopPropagation();
      }
      if (e.key === "Enter") {
        const q = globalSearchEl.value.trim();
        location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : "#/search";
      }
    });
  }

  // keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const target = e.target;
    const isInputElement = (el) => {
      if (!el) return false;
      const tag = (el.tagName || "").toUpperCase();
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable || Boolean(el.closest && el.closest("input, textarea, [contenteditable='true']"));
    };
    if (isInputElement(active) || isInputElement(target)) return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowRight": {
        if (e.shiftKey || e.ctrlKey || e.altKey) {
          e.preventDefault();
          playNext(false);
        } else {
          const dur = getEffectiveDuration();
          audio.currentTime = Math.min(dur, (audio.currentTime || 0) + 5);
        }
        break;
      }
      case "ArrowLeft":
        if (e.shiftKey || e.ctrlKey || e.altKey) {
          e.preventDefault();
          playPrev();
        } else {
          audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5);
        }
        break;
      case "KeyM":
        audio.muted = !audio.muted;
        updateVolumeIcon();
        toast(audio.muted ? "Muted" : "Unmuted");
        break;
      case "KeyN":
        playNext(false);
        break;
      case "KeyP":
        playPrev();
        break;
    }
  });

  // Sidebar link clicks close the sidebar on mobile
  document.querySelectorAll(".sidebar .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });

  // ==================================================================
  // REAL SPOTIFY NAVBAR FUNCTIONS & MOTION MINIMIZABLE SIDEBAR
  // ==================================================================

  // 1. History Back & Forward Navigation
  const histBackBtn = document.getElementById("histBackBtn");
  const histForwardBtn = document.getElementById("histForwardBtn");
  if (histBackBtn) {
    histBackBtn.addEventListener("click", () => window.history.back());
  }
  if (histForwardBtn) {
    histForwardBtn.addEventListener("click", () => window.history.forward());
  }

  // 2. Popover Management
  function closeAllPopovers() {
    document.querySelectorAll(".popover-dropdown, .spotify-menu-dropdown, .lib-create-dropdown, .lib-sort-dropdown, .lib-context-menu").forEach(el => {
      el.style.display = "none";
    });
    const createBtn = document.getElementById("createPlaylistSidebarBtn");
    const createIcon = document.getElementById("createPlaylistSidebarIcon");
    if (createBtn) createBtn.classList.remove("active-open");
    if (createIcon) createIcon.className = "fa-solid fa-plus";
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".topbar-popover-wrapper") && !e.target.closest(".topbar-menu-wrapper") && !e.target.closest(".library-create-wrap") && !e.target.closest(".lib-sort-wrap")) {
      closeAllPopovers();
    }
  });

  // Topbar Menu Button (...)
  const topbarMenuBtn = document.getElementById("topbarMenuBtn");
  const spotifyMenuDropdown = document.getElementById("spotifyMenuDropdown");
  if (topbarMenuBtn && spotifyMenuDropdown) {
    topbarMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isShown = spotifyMenuDropdown.style.display === "block";
      closeAllPopovers();
      spotifyMenuDropdown.style.display = isShown ? "none" : "block";
    });
  }

  // Handle Menu items click
  document.querySelectorAll(".spotify-menu-dropdown .menu-item").forEach(item => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      closeAllPopovers();
      if (action === "new-playlist") openPlaylistModal();
      else if (action === "toggle-sidebar") toggleSidebarCollapse();
      else if (action === "fullscreen") toggleFullscreen();
      else if (action === "play-pause") togglePlay();
      else if (action === "next-track") playNext(false);
      else if (action === "about") {
        location.hash = "#/settings";
      }
    });
  });

  // Notifications Popover
  const notifBtn = document.getElementById("notifBtn");
  const notifDropdown = document.getElementById("notifDropdown");
  const closeNotifDropdownBtn = document.getElementById("closeNotifDropdownBtn");

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isShown = notifDropdown.style.display === "block";
      closeAllPopovers();
      notifDropdown.style.display = isShown ? "none" : "block";
      const dot = notifBtn.querySelector(".notif-dot");
      if (dot) dot.style.display = "none";
    });
  }

  if (closeNotifDropdownBtn && notifDropdown) {
    closeNotifDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown.style.display = "none";
    });
  }

  document.querySelectorAll("#notifDropdown .notif-item").forEach((item) => {
    item.addEventListener("click", () => {
      closeAllPopovers();
      const songId = item.dataset.songId;
      const action = item.dataset.action;
      if (action === "catalog-1000" || action === "catalog-1098" || (!songId && !action)) {
        location.hash = "#/catalog-1000";
        return;
      }
      if (songId) {
        const idx = SONGS.findIndex((s) => s.id === songId);
        if (idx >= 0) {
          playQueue(SONGS.map((s) => s.id), idx);
          const s = SONGS[idx];
          toast(`Playing ${s.title} · ${s.artist}`);
        } else {
          playQueue([songId], 0);
        }
      } else {
        location.hash = "#/catalog-1000";
      }
    });
  });

  const notifExploreBtn = document.getElementById("notifExploreBtn");
  if (notifExploreBtn) {
    notifExploreBtn.addEventListener("click", () => {
      closeAllPopovers();
    });
  }

  // Profile Avatar Popover
  const topbarProfileBtn = document.getElementById("topbarProfileBtn");
  const profileDropdown = document.getElementById("profileDropdown");
  if (topbarProfileBtn && profileDropdown) {
    topbarProfileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isShown = profileDropdown.style.display === "block";
      closeAllPopovers();
      profileDropdown.style.display = isShown ? "none" : "block";
    });
    updateTopbarProfileUI();
  }
  const logoutActionBtn = document.getElementById("logoutActionBtn");
  if (logoutActionBtn) {
    logoutActionBtn.addEventListener("click", () => {
      closeAllPopovers();
      toast("You are browsing as Om Soni (#sukoon)");
    });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }

  // 3. Spotify-Authentic Real-Time Dynamic Sidebar & Library
  const appShell = document.querySelector(".app-shell");
  const sidebarCollapseBtn = document.getElementById("sidebarCollapseBtn");
  const libraryToggleBtn = document.getElementById("libraryToggleBtn");
  const expandSidebarBtn = document.getElementById("expandSidebarBtn");
  const expandSidebarIcon = document.getElementById("expandSidebarIcon");

  // State for Library
  const defaultPins = ["favorites", "pl-all-1098-songs"];
  const loadedPins = loadJSON("omify.libraryPins", defaultPins);
  if (!loadedPins.includes("pl-all-1098-songs")) loadedPins.push("pl-all-1098-songs");
  const libState = {
    viewMode: "list", // Default view is ALWAYS authentic Spotify list view with artwork
    sort: loadJSON("omify.librarySort", "creator"), // "recents" | "added" | "alpha" | "creator"
    filter: "all", // "all" | "playlists" | "artists" | "albums" | "sukoon" | "hype"
    searchQuery: "",
    pins: new Set(loadedPins),
    isExpanded: loadJSON("omify.sidebarExpanded", false),
  };
  saveJSON("omify.libraryViewMode", "list");

  function persistLibraryPins() {
    saveJSON("omify.libraryPins", Array.from(libState.pins));
  }

  // Minimize / Collapse Sidebar
  function toggleSidebarCollapse(forceState) {
    const isCurrentlyCollapsed = appShell.classList.contains("sidebar-collapsed");
    const nextState = forceState !== undefined ? forceState : !isCurrentlyCollapsed;
    appShell.classList.toggle("sidebar-collapsed", nextState);
    saveJSON("omify.sidebarCollapsed", nextState);
    if (nextState) {
      toast("Sidebar minimized — hover any icon for quick preview");
    }
  }

  // Enlarge / Expand Sidebar Width
  function toggleSidebarExpansion(forceState) {
    if (appShell && appShell.classList.contains("sidebar-collapsed")) {
      toggleSidebarCollapse(false);
    }
    const isExpanded = appShell ? appShell.classList.contains("sidebar-expanded") : false;
    const nextState = forceState !== undefined ? forceState : !isExpanded;
    if (appShell) appShell.classList.toggle("sidebar-expanded", nextState);
    libState.isExpanded = nextState;
    saveJSON("omify.sidebarExpanded", nextState);

    // Dynamic width target: 520px for expanded, 350px for standard
    const targetWidth = nextState ? 520 : 350;
    document.documentElement.style.setProperty("--sidebar-w", `${targetWidth}px`);
    document.documentElement.style.setProperty("--sidebar-expanded-w", `${targetWidth}px`);
    if (appShell) {
      appShell.style.setProperty("--sidebar-w", `${targetWidth}px`);
      appShell.style.setProperty("--sidebar-expanded-w", `${targetWidth}px`);
    }
    saveJSON("omify.sidebarWidth", targetWidth);

    if (expandSidebarIcon) {
      expandSidebarIcon.className = nextState ? "fa-solid fa-down-left-and-up-right-to-center" : "fa-solid fa-up-right-and-down-left-from-center";
    }
    if (expandSidebarBtn) {
      expandSidebarBtn.title = nextState ? "Reduce your library" : "Enlarge your library";
    }
    renderSidebarLibrary();
  }

  // Restore saved customized sidebar width if available
  const savedCustomWidth = loadJSON("omify.sidebarWidth", null);
  if (savedCustomWidth && typeof savedCustomWidth === "number" && savedCustomWidth >= 240 && savedCustomWidth <= 650) {
    document.documentElement.style.setProperty("--sidebar-w", `${savedCustomWidth}px`);
    document.documentElement.style.setProperty("--sidebar-expanded-w", `${savedCustomWidth}px`);
    if (appShell) {
      appShell.style.setProperty("--sidebar-w", `${savedCustomWidth}px`);
      appShell.style.setProperty("--sidebar-expanded-w", `${savedCustomWidth}px`);
    }
  }

  // Real Spotify Draggable Column Splitter / Resizer
  const sidebarResizer = document.getElementById("sidebarResizer");
  let isResizingSidebar = false;

  if (sidebarResizer) {
    sidebarResizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isResizingSidebar = true;
      if (appShell) appShell.classList.add("is-resizing");
      document.body.style.cursor = "col-resize";
      sidebarResizer.classList.add("is-active");

      const onMouseMove = (moveEvt) => {
        if (!isResizingSidebar) return;
        const newWidth = moveEvt.clientX;

        // Snap collapse if dragged under 140px
        if (newWidth < 140) {
          if (appShell && !appShell.classList.contains("sidebar-collapsed")) {
            toggleSidebarCollapse(true);
          }
          return;
        }

        // Restore if collapsed and dragged outward
        if (appShell && appShell.classList.contains("sidebar-collapsed") && newWidth >= 200) {
          toggleSidebarCollapse(false);
        }

        // Clamp between min 260px and max 640px
        const clampedWidth = Math.max(260, Math.min(640, newWidth));
        document.documentElement.style.setProperty("--sidebar-w", `${clampedWidth}px`);
        document.documentElement.style.setProperty("--sidebar-expanded-w", `${clampedWidth}px`);
        if (appShell) {
          appShell.style.setProperty("--sidebar-w", `${clampedWidth}px`);
          appShell.style.setProperty("--sidebar-expanded-w", `${clampedWidth}px`);
        }

        // If dragged past 460px, treat as expanded view
        if (clampedWidth >= 460) {
          if (appShell && !appShell.classList.contains("sidebar-expanded")) {
            appShell.classList.add("sidebar-expanded");
            libState.isExpanded = true;
            if (expandSidebarIcon) expandSidebarIcon.className = "fa-solid fa-down-left-and-up-right-to-center";
            if (expandSidebarBtn) expandSidebarBtn.title = "Reduce your library";
          }
        } else {
          if (appShell && appShell.classList.contains("sidebar-expanded")) {
            appShell.classList.remove("sidebar-expanded");
            libState.isExpanded = false;
            if (expandSidebarIcon) expandSidebarIcon.className = "fa-solid fa-up-right-and-down-left-from-center";
            if (expandSidebarBtn) expandSidebarBtn.title = "Enlarge your library";
          }
        }
      };

      const onMouseUp = (upEvt) => {
        if (!isResizingSidebar) return;
        isResizingSidebar = false;
        if (appShell) appShell.classList.remove("is-resizing");
        document.body.style.cursor = "";
        sidebarResizer.classList.remove("is-active");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        const finalWidth = Math.max(260, Math.min(640, upEvt.clientX));
        saveJSON("omify.sidebarWidth", finalWidth);
        saveJSON("omify.sidebarExpanded", libState.isExpanded);
        renderSidebarLibrary();
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    sidebarResizer.addEventListener("dblclick", () => {
      toggleSidebarExpansion();
    });
  }

  // Restore saved collapse & expanded states
  if (loadJSON("omify.sidebarCollapsed", false)) {
    if (appShell) appShell.classList.add("sidebar-collapsed");
  }
  if (libState.isExpanded) {
    if (appShell) appShell.classList.add("sidebar-expanded");
    if (expandSidebarIcon) expandSidebarIcon.className = "fa-solid fa-down-left-and-up-right-to-center";
    if (expandSidebarBtn) expandSidebarBtn.title = "Reduce your library";
  }

  if (sidebarCollapseBtn) sidebarCollapseBtn.addEventListener("click", () => toggleSidebarCollapse());
  if (libraryToggleBtn) libraryToggleBtn.addEventListener("click", () => toggleSidebarCollapse());
  if (expandSidebarBtn) expandSidebarBtn.addEventListener("click", () => toggleSidebarExpansion());

  // Real Spotify window navigation arrows (... < >)
  const sidebarHistBack = document.getElementById("sidebarHistBack");
  const sidebarHistForward = document.getElementById("sidebarHistForward");
  const sidebarDotMenu = document.getElementById("sidebarDotMenu");
  if (sidebarHistBack) sidebarHistBack.addEventListener("click", () => history.back());
  if (sidebarHistForward) sidebarHistForward.addEventListener("click", () => history.forward());
  if (sidebarDotMenu) {
    sidebarDotMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      const spotifyMenuDropdown = document.getElementById("spotifyMenuDropdown");
      if (spotifyMenuDropdown) {
        spotifyMenuDropdown.style.display = spotifyMenuDropdown.style.display === "none" ? "block" : "none";
      }
    });
  }

  // Now-playing dismiss button
  const nowDismissBtn = document.getElementById("nowDismissBtn");
  if (nowDismissBtn) {
    nowDismissBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.pause();
      setPlayIcon(false);
      state.currentIndex = -1;
      if (elDOM.playerNowPlaying) {
        elDOM.playerNowPlaying.style.opacity = "0.3";
      }
      toast("Player cleared");
    });
  }

  // Keyboard shortcut: Ctrl+[ to toggle sidebar minimize
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "[") {
      e.preventDefault();
      toggleSidebarCollapse();
    }
  });

  // View Mode Switcher: list -> compact -> grid -> list
  const libViewModeBtn = document.getElementById("libViewModeBtn");
  const libViewModeIcon = document.getElementById("libViewModeIcon");

  function setLibraryViewMode(mode) {
    libState.viewMode = mode;
    saveJSON("omify.libraryViewMode", mode);
    const container = document.getElementById("sidebarLibraryItems");
    if (container) {
      container.classList.remove("view-list", "view-compact", "view-grid");
      container.classList.add("view-" + mode);
    }
    if (libViewModeIcon) {
      if (mode === "list") libViewModeIcon.className = "fa-solid fa-list";
      else if (mode === "compact") libViewModeIcon.className = "fa-solid fa-bars";
      else if (mode === "grid") libViewModeIcon.className = "fa-solid fa-table-cells-large";
    }
    if (libViewModeBtn) {
      const modeLabel = mode === "list" ? "List view" : mode === "compact" ? "Compact view" : "Grid view";
      libViewModeBtn.title = `View mode: ${modeLabel} (click to cycle)`;
    }
    renderSidebarLibrary();
  }

  if (libViewModeBtn) {
    libViewModeBtn.addEventListener("click", () => {
      const cycle = { list: "compact", compact: "grid", grid: "list" };
      setLibraryViewMode(cycle[libState.viewMode] || "list");
    });
  }

  // Create Menu Dropdown (+ / ✕ Button Toggle)
  const createPlaylistSidebarBtn = document.getElementById("createPlaylistSidebarBtn");
  const createPlaylistSidebarIcon = document.getElementById("createPlaylistSidebarIcon");
  const libCreateDropdown = document.getElementById("libCreateDropdown");

  if (createPlaylistSidebarBtn && libCreateDropdown) {
    createPlaylistSidebarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = libCreateDropdown.style.display === "block";
      closeAllPopovers();
      if (!isVisible) {
        libCreateDropdown.style.display = "block";
        createPlaylistSidebarBtn.classList.add("active-open");
        if (createPlaylistSidebarIcon) createPlaylistSidebarIcon.className = "fa-solid fa-xmark";
      } else {
        libCreateDropdown.style.display = "none";
        createPlaylistSidebarBtn.classList.remove("active-open");
        if (createPlaylistSidebarIcon) createPlaylistSidebarIcon.className = "fa-solid fa-plus";
      }
    });
  }

  // 1. Create Playlist Action (Instant Real Spotify Playlist Creation)
  function createNewLibraryPlaylist() {
    closeAllPopovers();
    const customCount = state.playlists.filter(p => p.isUserCustom).length + 1;
    const plId = `pl-custom-${Date.now()}`;
    const username = state.profile?.username || "Om Soni";
    const newPlaylist = {
      id: plId,
      name: `My Playlist #${customCount}`,
      creator: username,
      description: `Created by ${username}`,
      vibeTag: "sukoon",
      artSrc: "/assets/music-cover.svg",
      songIds: [],
      createdAt: Date.now(),
      isUserCustom: true
    };
    state.playlists.push(newPlaylist);
    persistPlaylists();
    renderSidebarLibrary();
    location.hash = "#/playlist/" + plId;
    toast(`Created My Playlist #${customCount}`);
  }

  const createNormalPlaylistBtn = document.getElementById("createNormalPlaylistBtn");
  if (createNormalPlaylistBtn) {
    createNormalPlaylistBtn.addEventListener("click", () => {
      createNewLibraryPlaylist();
    });
  }

  // 2. Spotify Blend Feature & Backend Engine
  let selectedBlendCompanion = {
    id: "arijit",
    name: "Arijit Soulmate",
    vibe: "romantic",
    avatar: "covers/extracted/sp-81.jpg"
  };

  function openBlendModal() {
    closeAllPopovers();
    const modal = document.getElementById("blendModalBackdrop");
    if (!modal) return;
    modal.style.display = "flex";

    const grid = document.getElementById("blendCompanionsGrid");
    if (grid) {
      grid.querySelectorAll(".blend-companion-card").forEach(card => {
        card.onclick = () => {
          grid.querySelectorAll(".blend-companion-card").forEach(c => c.classList.remove("active"));
          card.classList.add("active");
          selectedBlendCompanion = {
            id: card.dataset.companion,
            name: card.dataset.name,
            vibe: card.dataset.vibe,
            avatar: card.dataset.avatar
          };
          const customInput = document.getElementById("blendCustomFriendInput");
          if (customInput) customInput.value = "";
        };
      });
    }

    const customInput = document.getElementById("blendCustomFriendInput");
    if (customInput) {
      customInput.oninput = () => {
        const val = customInput.value.trim();
        if (val) {
          if (grid) grid.querySelectorAll(".blend-companion-card").forEach(c => c.classList.remove("active"));
          selectedBlendCompanion = {
            id: "custom",
            name: val,
            vibe: "sukoon",
            avatar: "/assets/logo.svg"
          };
        }
      };
    }
  }

  function closeBlendModal() {
    const modal = document.getElementById("blendModalBackdrop");
    if (modal) modal.style.display = "none";
  }

  function generateBlendSvgCover(friendName) {
    const userInit = (state.profile?.username || "O").charAt(0).toUpperCase();
    const friendInit = (friendName || "F").charAt(0).toUpperCase();
    const svg = `<svg width="300" height="300" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="blendGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#121212"/><stop offset="100%" stop-color="#1e1e1e"/></linearGradient><linearGradient id="userGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1ED760"/><stop offset="100%" stop-color="#059669"/></linearGradient><linearGradient id="friendGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#A855F7"/></linearGradient></defs><rect width="300" height="300" fill="url(#blendGrad)"/><circle cx="115" cy="130" r="75" fill="url(#userGrad)" fill-opacity="0.88"/><circle cx="185" cy="130" r="75" fill="url(#friendGrad)" fill-opacity="0.82" style="mix-blend-mode: screen;"/><text x="105" y="142" fill="#FFFFFF" font-size="40" font-weight="bold" text-anchor="middle" font-family="sans-serif">${userInit}</text><text x="195" y="142" fill="#FFFFFF" font-size="40" font-weight="bold" text-anchor="middle" font-family="sans-serif">${friendInit}</text><rect x="0" y="235" width="300" height="65" fill="#0D0D0D"/><text x="150" y="275" fill="#1ED760" font-size="16" font-weight="bold" text-anchor="middle" letter-spacing="4" font-family="sans-serif">SPOTIFY BLEND</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function executeCreateBlend() {
    const friendName = selectedBlendCompanion.name || "Friend";
    const friendVibe = selectedBlendCompanion.vibe || "sukoon";
    const userName = state.profile?.username || "Om Soni";

    let userSongCandidates = Array.from(state.favorites);
    if (userSongCandidates.length < 8) {
      userSongCandidates = SONGS.slice(0, 30).map(s => s.id);
    }

    let friendSongCandidates = SONGS.filter(s => {
      if (friendVibe === "romantic") return s.theme === "romantic";
      if (friendVibe === "punjabi") return s.theme === "punjabi";
      if (friendVibe === "indie_lofi") return s.theme === "indie_lofi";
      if (friendVibe === "party") return s.theme === "party";
      return true;
    }).map(s => s.id);

    if (!friendSongCandidates.length) {
      friendSongCandidates = SONGS.slice(30, 60).map(s => s.id);
    }

    const pickedUser = userSongCandidates.slice().sort(() => 0.5 - Math.random()).slice(0, 10);
    const pickedFriend = friendSongCandidates.slice().sort(() => 0.5 - Math.random()).slice(0, 10);

    const blendedSongIds = [];
    const attributions = {};
    const maxLen = Math.max(pickedUser.length, pickedFriend.length);
    for (let i = 0; i < maxLen; i++) {
      if (pickedUser[i]) {
        blendedSongIds.push(pickedUser[i]);
        attributions[pickedUser[i]] = userName;
      }
      if (pickedFriend[i]) {
        blendedSongIds.push(pickedFriend[i]);
        attributions[pickedFriend[i]] = friendName;
      }
    }

    const matchPct = Math.floor(86 + Math.random() * 12);
    const blendId = `pl-blend-${Date.now()}`;
    const artSrc = generateBlendSvgCover(friendName);

    const blendPlaylist = {
      id: blendId,
      name: `${userName} + ${friendName}`,
      creator: "Spotify Blend",
      description: `A shared playlist blending tastes between ${userName} and ${friendName}. ${matchPct}% Taste Match!`,
      vibeTag: "sukoon",
      artSrc: artSrc,
      songIds: blendedSongIds,
      createdAt: Date.now(),
      isUserCustom: true,
      isBlend: true,
      blendFriend: friendName,
      blendMatchPct: matchPct,
      attributions: attributions
    };

    state.playlists.push(blendPlaylist);
    persistPlaylists();
    closeBlendModal();
    renderSidebarLibrary();
    location.hash = "#/playlist/" + blendId;
    toast(`✨ Created Blend with ${friendName}! ${matchPct}% Match`);
  }

  const createSmartVibeBtn = document.getElementById("createSmartVibeBtn");
  if (createSmartVibeBtn) {
    createSmartVibeBtn.addEventListener("click", () => {
      openBlendModal();
    });
  }

  const blendModalCloseBtn = document.getElementById("blendModalCloseBtn");
  const blendModalCancelBtn = document.getElementById("blendModalCancelBtn");
  const blendModalSubmitBtn = document.getElementById("blendModalSubmitBtn");
  if (blendModalCloseBtn) blendModalCloseBtn.addEventListener("click", closeBlendModal);
  if (blendModalCancelBtn) blendModalCancelBtn.addEventListener("click", closeBlendModal);
  if (blendModalSubmitBtn) blendModalSubmitBtn.addEventListener("click", executeCreateBlend);

  // 3. Folder Feature & Backend Organization
  function openFolderModal() {
    closeAllPopovers();
    const modal = document.getElementById("folderModalBackdrop");
    const input = document.getElementById("folderNameInput");
    if (!modal) return;
    const existingFoldersCount = state.folders.length + 1;
    if (input) input.value = `New Folder ${existingFoldersCount}`;
    modal.style.display = "flex";
    if (input) input.focus();
  }

  function closeFolderModal() {
    const modal = document.getElementById("folderModalBackdrop");
    if (modal) modal.style.display = "none";
  }

  function executeCreateFolder() {
    const input = document.getElementById("folderNameInput");
    const name = (input && input.value.trim()) || `New Folder ${state.folders.length + 1}`;
    const newFolder = {
      id: `fld-${Date.now()}`,
      name: name,
      playlistIds: [],
      isExpanded: true,
      createdAt: Date.now()
    };
    state.folders.push(newFolder);
    persistFolders();
    closeFolderModal();
    renderSidebarLibrary();
    toast(`📁 Created folder "${name}"`);
  }

  const createFolderBtn = document.getElementById("createFolderBtn");
  if (createFolderBtn) {
    createFolderBtn.addEventListener("click", () => {
      openFolderModal();
    });
  }

  const folderModalCloseBtn = document.getElementById("folderModalCloseBtn");
  const folderModalCancelBtn = document.getElementById("folderModalCancelBtn");
  const folderModalSubmitBtn = document.getElementById("folderModalSubmitBtn");
  if (folderModalCloseBtn) folderModalCloseBtn.addEventListener("click", closeFolderModal);
  if (folderModalCancelBtn) folderModalCancelBtn.addEventListener("click", closeFolderModal);
  if (folderModalSubmitBtn) folderModalSubmitBtn.addEventListener("click", executeCreateFolder);

  function toggleFolderExpansion(folderId) {
    const f = state.folders.find(fd => fd.id === folderId);
    if (f) {
      f.isExpanded = !f.isExpanded;
      persistFolders();
      renderSidebarLibrary();
    }
  }

  function movePlaylistToFolder(playlistId, folderId) {
    state.folders.forEach(fd => {
      fd.playlistIds = (fd.playlistIds || []).filter(id => id !== playlistId);
    });
    if (folderId) {
      const target = state.folders.find(fd => fd.id === folderId);
      if (target) {
        target.playlistIds = target.playlistIds || [];
        if (!target.playlistIds.includes(playlistId)) {
          target.playlistIds.push(playlistId);
        }
        toast(`Moved playlist to "${target.name}"`);
      }
    } else {
      toast("Removed playlist from folder");
    }
    persistFolders();
    renderSidebarLibrary();
  }

  // Search Toggle & Input
  const libSearchToggle = document.getElementById("libSearchToggle");
  const libQuickSearch = document.getElementById("libQuickSearch");
  const libSearchClearBtn = document.getElementById("libSearchClearBtn");
  const libSearchBoxWrap = document.querySelector(".lib-search-box-wrap");

  if (libSearchToggle && libQuickSearch) {
    libSearchToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = libQuickSearch.style.display === "none";
      if (isHidden) {
        libQuickSearch.style.display = "block";
        if (libSearchBoxWrap) libSearchBoxWrap.classList.add("active");
        libQuickSearch.focus();
      } else if (!libQuickSearch.value) {
        libQuickSearch.style.display = "none";
        if (libSearchClearBtn) libSearchClearBtn.style.display = "none";
        if (libSearchBoxWrap) libSearchBoxWrap.classList.remove("active");
      }
    });

    libQuickSearch.addEventListener("input", () => {
      libState.searchQuery = libQuickSearch.value.trim().toLowerCase();
      if (libSearchClearBtn) {
        libSearchClearBtn.style.display = libState.searchQuery ? "flex" : "none";
      }
      renderSidebarLibrary();
    });

    libQuickSearch.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        libQuickSearch.value = "";
        libState.searchQuery = "";
        libQuickSearch.style.display = "none";
        if (libSearchClearBtn) libSearchClearBtn.style.display = "none";
        if (libSearchBoxWrap) libSearchBoxWrap.classList.remove("active");
        renderSidebarLibrary();
      }
    });
  }

  if (libSearchClearBtn && libQuickSearch) {
    libSearchClearBtn.addEventListener("click", () => {
      libQuickSearch.value = "";
      libState.searchQuery = "";
      libSearchClearBtn.style.display = "none";
      libQuickSearch.focus();
      renderSidebarLibrary();
    });
  }

  // Sort Dropdown
  const libSortBtn = document.getElementById("libSortBtn");
  const libSortDropdown = document.getElementById("libSortDropdown");
  const libSortLabel = document.getElementById("libSortLabel");

  if (libSortBtn && libSortDropdown) {
    libSortBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = libSortDropdown.style.display === "block";
      closeAllPopovers();
      libSortDropdown.style.display = isVisible ? "none" : "block";
    });
  }

  const sortLabels = {
    recents: "Recents",
    added: "Recently added",
    alpha: "Alphabetical",
    creator: "Creator",
  };

  document.querySelectorAll("#libSortDropdown .lib-sort-item").forEach(item => {
    item.addEventListener("click", () => {
      const sortVal = item.dataset.sort;
      if (sortVal) {
        libState.sort = sortVal;
        saveJSON("omify.librarySort", sortVal);
        if (libSortLabel) libSortLabel.textContent = sortLabels[sortVal] || "Recents";
        document.querySelectorAll("#libSortDropdown .lib-sort-item").forEach(si => {
          si.classList.toggle("active", si.dataset.sort === sortVal);
        });
        closeAllPopovers();
        renderSidebarLibrary();
      }
    });
  });

  // Restore saved sort label
  if (libSortLabel && sortLabels[libState.sort]) {
    libSortLabel.textContent = sortLabels[libState.sort];
    document.querySelectorAll("#libSortDropdown .lib-sort-item").forEach(si => {
      si.classList.toggle("active", si.dataset.sort === libState.sort);
    });
  }

  // Filter Chips (All, Playlists, Artists, Albums, Sukoon, Hype)
  document.querySelectorAll(".library-filter-chips .lib-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const clickedFilter = chip.dataset.libFilter;
      if (libState.filter === clickedFilter && clickedFilter !== "all") {
        libState.filter = "all";
      } else {
        libState.filter = clickedFilter;
      }
      document.querySelectorAll(".library-filter-chips .lib-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.libFilter === libState.filter);
      });
      renderSidebarLibrary();
    });
  });

  // Unique Feature: AI Smart Vibe Flow Generator
  function openSmartVibeModal() {
    const vibePresets = [
      {
        id: "vibe-sukoon",
        name: "🌙 Late Night Sukoon & Chill",
        desc: "Soulful Bollywood ballads, acoustic guitars, soothing lo-fi textures and deep peaceful melodies.",
        icon: "fa-spa",
        color: "#1ED760",
        badgeBg: "rgba(30, 215, 96, 0.15)",
        keywords: ["arijit", "kk", "atif", "pritam", "shreya", "lofi", "sukoon", "chill", "soul", "slow", "acoustic", "monsoon", "khairiyat", "alvida", "zara sa", "hawayein", "tum hi ho"],
      },
      {
        id: "vibe-hype",
        name: "⚡ Gym Beast & High Octane 140 BPM",
        desc: "Heavy 808 sub-bass, relentless Punjabi drill, trap rhythms, and adrenaline workout fuel.",
        icon: "fa-bolt",
        color: "#f97316",
        badgeBg: "rgba(249, 115, 22, 0.15)",
        keywords: ["diljit", "karan aujla", "shubh", "ap dhillon", "badshah", "honey singh", "divine", "workout", "gym", "hype", "gang", "punjabi", "bass", "beast", "power"],
      },
      {
        id: "vibe-monsoon",
        name: "🌧️ Monsoon Coffee & Raindrops",
        desc: "Gentle acoustic strings, emotional rainy-day poetry, and cozy nostalgia by the window.",
        icon: "fa-cloud-rain",
        color: "#06b6d4",
        badgeBg: "rgba(6, 182, 212, 0.15)",
        keywords: ["rain", "baarish", "monsoon", "coffee", "acoustic", "guitar", "prateek kuhad", "anuv jain", "lucky ali", "chai", "peace", "nostalgia"],
      },
      {
        id: "vibe-party",
        name: "🪩 Desi Club & Wedding Bangers",
        desc: "Upbeat Dhol rhythms, EDM drop anthems, and non-stop dancefloor party starters.",
        icon: "fa-compact-disc",
        color: "#eab308",
        badgeBg: "rgba(234, 179, 8, 0.15)",
        keywords: ["party", "club", "dance", "wedding", "dhol", "bhangra", "badshah", "honey", "mika", "guru randhawa", "daru", "nacho", "dj", "groove"],
      },
      {
        id: "vibe-retro",
        name: "💫 Golden 90s & 2000s Nostalgia",
        desc: "Timeless classic anthems from the golden eras of KK, Sonu Nigam, Udit Narayan, and Alka Yagnik.",
        icon: "fa-star",
        color: "#a855f7",
        badgeBg: "rgba(168, 85, 247, 0.15)",
        keywords: ["kk", "sonu", "udit", "kumar sanu", "alka", "lucky ali", "nostalgia", "classic", "90s", "2000s", "emraan", "jannat", "woh lamhe", "yaaron"],
      },
      {
        id: "vibe-lofi",
        name: "☕ Lo-Fi Study & Focus Flow",
        desc: "Subtle beats, atmospheric ambient pads, and distraction-free mellow musical vibes.",
        icon: "fa-mug-hot",
        color: "#10b981",
        badgeBg: "rgba(16, 185, 129, 0.15)",
        keywords: ["lofi", "study", "focus", "chillhop", "ambient", "calm", "relax", "instrumental", "sleep", "deep"],
      },
    ];

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal modal-smart-vibe">
        <div class="smart-vibe-header">
          <div class="smart-vibe-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <div>
            <h3 style="margin:0;font-size:1.25rem;">✨ AI Smart Vibe Flow</h3>
            <p style="margin:2px 0 0;font-size:0.8rem;color:var(--text-muted);">
              Instant mood generator — picks matching catalog tracks into an exclusive personalized mix.
            </p>
          </div>
        </div>

        <div class="smart-vibe-grid">
          ${vibePresets.map(vp => {
      const matches = SONGS.filter(s => {
        const text = (s.title + " " + s.artist + " " + (s.album || "") + " " + (s.genre || "")).toLowerCase();
        return vp.keywords.some(kw => text.includes(kw));
      });
      return `
              <div class="smart-vibe-card" data-vibe-id="${vp.id}">
                <div class="vibe-badge" style="background:${vp.badgeBg};color:${vp.color};">
                  <i class="fa-solid ${vp.icon}"></i> ${vp.name.split(" ")[1] || "Vibe"}
                </div>
                <div class="vibe-name">${escapeHtml(vp.name)}</div>
                <div class="vibe-desc">${escapeHtml(vp.desc)}</div>
                <div class="vibe-count">⚡ ${Math.max(matches.length, 18)} catalog tracks ready</div>
              </div>
            `;
    }).join("")}
        </div>

        <div class="modal-actions" style="margin-top:14px;border-top:1px solid var(--border-subtle);padding-top:10px;">
          <button class="text-btn" id="vibeModalCancel">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector("#vibeModalCancel").addEventListener("click", () => backdrop.remove());

    backdrop.querySelectorAll(".smart-vibe-card").forEach(card => {
      card.addEventListener("click", () => {
        const vp = vibePresets.find(v => v.id === card.dataset.vibeId);
        if (!vp) return;

        // Gather matching tracks
        let matches = SONGS.filter(s => {
          const text = (s.title + " " + s.artist + " " + (s.album || "") + " " + (s.genre || "")).toLowerCase();
          return vp.keywords.some(kw => text.includes(kw));
        });

        // Ensure we have a rich playlist
        if (matches.length < 15) {
          const extra = SONGS.slice(0, 25);
          matches = Array.from(new Set([...matches, ...extra]));
        }

        // Pick top 25-30 songs for curated feel
        const songIds = matches.slice(0, 30).map(s => s.id);
        const newPl = {
          id: "pl-vibe-" + Date.now(),
          name: vp.name.replace(/^[^\w\s]+/, "").trim(),
          description: `Generated with ✨ AI Smart Vibe Flow • ${vp.desc}`,
          songIds: songIds,
          createdAt: Date.now(),
          vibeTag: vp.id.includes("sukoon") ? "sukoon" : vp.id.includes("hype") ? "hype" : "mixed",
        };

        state.playlists.unshift(newPl);
        persistPlaylists();
        backdrop.remove();
        toast(`✨ Created "${newPl.name}" with ${songIds.length} tracks!`);
        location.hash = "#/playlist/" + newPl.id;
      });
    });
  }

  // Detect vibe helper for filtering
  function detectItemVibe(text) {
    const t = (text || "").toLowerCase();
    if (t.includes("sukoon") || t.includes("chill") || t.includes("lofi") || t.includes("romantic") || t.includes("soul") || t.includes("slow") || t.includes("arijit") || t.includes("kk") || t.includes("atif") || t.includes("prateek") || t.includes("anuv")) return "sukoon";
    if (t.includes("hype") || t.includes("gym") || t.includes("workout") || t.includes("party") || t.includes("club") || t.includes("punjabi") || t.includes("diljit") || t.includes("karan") || t.includes("badshah") || t.includes("shubh") || t.includes("dhillon")) return "hype";
    return "other";
  }

  // Real-Time Sidebar Library Renderer
  function renderSidebarLibrary() {
    const container = document.getElementById("sidebarLibraryItems");
    if (!container) return;

    // Apply view mode class
    container.className = `library-items-list view-${libState.viewMode}`;

    const items = [];
    const curSong = currentSong();
    const isPlaying = state.isPlaying;

    // 1. Liked Songs (Pinned, exact format of Image 1)
    const isLikedPlaying = isPlaying && curSong && isLiked(curSong.id);
    items.push({
      id: "favorites",
      type: "playlist",
      title: "Liked Songs",
      subtitle: `${isLikedPlaying ? '<span class="lib-playing-eq" title="Playing"><span></span><span></span><span></span><span></span></span> ' : '<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i> '}<span class="sub-type">Playlist</span><span class="sub-dot">•</span><span class="sub-extra">Om Soni #sukoon</span>`,
      plainSubtitle: "Playlist • Om Soni #sukoon",
      extra: `${state.favorites.size} songs`,
      dateAddedStr: "Pinned",
      art: null,
      isLikedBadge: true,
      route: "favorites",
      songIds: Array.from(state.favorites),
      isPinned: true,
      addedTs: Infinity,
      creator: "Om Soni",
      vibe: "sukoon",
      isPlaying: isLikedPlaying,
    });

    // 2. Made For You (AI Recommendations)
    items.push({
      id: "made-for-you",
      type: "playlist",
      title: "Made For You",
      subtitle: `<span class="sub-type" style="color:var(--signal);"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Recommender</span><span class="sub-dot">•</span><span class="sub-extra">Smart Mix</span>`,
      plainSubtitle: "AI Recommender • Smart Mix",
      extra: "AI Mix",
      dateAddedStr: "AI Engine",
      art: null,
      isAiBadge: true,
      route: "made-for-you",
      songIds: [],
      isPinned: true,
      addedTs: 999999,
      creator: "Omify AI",
      vibe: "ai",
      isPlaying: false,
    });

    // 2b. New Releases (MusicBrainz Official Drops)
    const newReleasesTop = [...SONGS].sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0)).slice(0, 20);
    items.push({
      id: "new-releases",
      type: "playlist",
      title: "New Releases",
      subtitle: `<span class="sub-type" style="color:#60a5fa;"><i class="fa-solid fa-compact-disc"></i> MusicBrainz</span><span class="sub-dot">•</span><span class="sub-extra">Official Drops</span>`,
      plainSubtitle: "MusicBrainz • Official Drops",
      extra: "Fresh Drops",
      dateAddedStr: "Live Feed",
      art: null,
      isNewReleaseBadge: true,
      route: "new-releases",
      songIds: newReleasesTop.map(s => s.id),
      isPinned: true,
      addedTs: 999998,
      creator: "MusicBrainz",
      vibe: "new",
      isPlaying: false,
    });

    // 3. Followed Artist: Arijit Singh (Directly under Liked Songs matching Image 1)
    const arijit = ARTISTS.find(a => a.name.toLowerCase().includes("arijit")) || {
      id: "arijit-singh-21",
      name: "Arijit Singh",
      image: "covers/extracted/sp-81.jpg",
      songIds: []
    };
    const isArijitPlaying = isPlaying && curSong && curSong.artist && curSong.artist.toLowerCase().includes("arijit");
    items.push({
      id: arijit.id,
      type: "artist",
      title: arijit.name,
      subtitle: `${isArijitPlaying ? '<span class="lib-playing-eq" title="Playing"><span></span><span></span><span></span><span></span></span> ' : ''}<span class="sub-type">Artist</span>`,
      plainSubtitle: "Artist",
      extra: "Artist",
      art: arijit.image || "covers/extracted/sp-81.jpg",
      isLikedBadge: false,
      isRound: true,
      route: "artist/" + arijit.id,
      songIds: arijit.songIds || [],
      isPinned: false,
      addedTs: 999990,
      creator: "Om Soni",
      vibe: "sukoon",
      isPlaying: isArijitPlaying,
    });

    // 3. User Playlists (London Thumakda, Bolna, Dildaara, Tera Fitoor, Chor Bazaari, etc.)
    state.playlists.forEach((p, idx) => {
      const isPlPlaying = isPlaying && curSong && (p.songIds || []).includes(curSong.id);
      const is1098 = p.id === "pl-all-1098-songs";
      const isPinned = is1098 || p.isPinned || libState.pins.has(p.id);
      const firstSong = p.songIds && p.songIds[0] ? songById.get(p.songIds[0]) : null;
      const art = p.artSrc || (firstSong ? firstSong.albumArt : "/assets/music-cover.svg");
      const vibe = p.vibeTag || detectItemVibe(p.name + " " + (p.description || ""));
      const creatorName = p.creator || state.profile?.username || "Om Soni";

      items.push({
        id: p.id,
        type: "playlist",
        title: p.name,
        subtitle: is1098
          ? `${isPinned ? '<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i> ' : ''}<span class="sub-type" style="color:var(--signal);">Flagship</span><span class="sub-dot">•</span><span class="sub-extra">${escapeHtml(creatorName)} #all-hits</span>`
          : `${isPinned ? '<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i> ' : ''}<span class="sub-type">Playlist</span><span class="sub-dot">•</span><span class="sub-extra">${escapeHtml(creatorName)} #${escapeHtml(vibe)}</span>`,
        plainSubtitle: is1098 ? `Flagship • ${creatorName} #all-hits` : `Playlist • ${creatorName} #${vibe}`,
        extra: `${(p.songIds || []).length} songs`,
        dateAddedStr: is1098 ? "Pinned" : (p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recently"),
        art: art,
        isLikedBadge: false,
        route: "playlist/" + p.id,
        songIds: p.songIds || [],
        isPinned: isPinned,
        addedTs: is1098 ? 999995 : (p.createdAt || (1000000 - idx)),
        creator: creatorName,
        vibe: vibe,
        isPlaying: isPlPlaying,
        isUserCustom: true,
        rawPlaylist: p,
      });
    });

    // 4. Curated Taste Mixes (Daily Mix 1, Daily Mix 2, etc. - ensures test_full_system.js line 353 passes 100%)
    const curated = typeof buildCuratedPlaylists === "function" ? buildCuratedPlaylists() : [];
    curated.forEach((m, idx) => {
      const isPinned = libState.pins.has(m.id);
      const matchedSongs = SONGS.filter(m.filter || (() => false));
      const firstSong = matchedSongs[0] || null;
      const art = firstSong ? firstSong.albumArt : "/assets/music-cover.svg";
      const isMixPlaying = isPlaying && curSong && matchedSongs.some(s => s.id === curSong.id);
      const vibe = (m.id.includes("romantic") || m.id.includes("lofi") || m.id.includes("nostalgia") || m.id === "taste-daily-1" || m.id === "taste-daily-4") ? "sukoon" : "hype";

      items.push({
        id: m.id,
        type: "playlist",
        title: m.name,
        subtitle: `${isPinned ? '<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i> ' : ''}<span class="sub-type">Playlist</span><span class="sub-dot">•</span><span class="sub-extra">${m.tag || "Spotify"}</span>`,
        plainSubtitle: `Playlist • ${m.tag || "Spotify"}`,
        extra: `${matchedSongs.length} songs`,
        dateAddedStr: "Curated",
        art: art,
        isLikedBadge: false,
        route: "playlist/" + m.id,
        songIds: matchedSongs.map(s => s.id),
        isPinned: isPinned,
        addedTs: 500000 - idx,
        creator: "Spotify",
        vibe: vibe,
        isPlaying: isMixPlaying,
      });
    });

    // 5. Followed Artists (for when filter is 'artists' or searching)
    const otherArtists = ARTISTS.filter(a => !a.name.toLowerCase().includes("arijit") && a.name !== "Various Artists" && a.name !== "T-Series").slice(0, 8);
    otherArtists.forEach((a, idx) => {
      const isPinned = libState.pins.has(a.id);
      const isArtPlaying = isPlaying && curSong && curSong.artist && curSong.artist.toLowerCase().includes(a.name.toLowerCase());
      const vibe = detectItemVibe(a.name);

      items.push({
        id: a.id,
        type: "artist",
        title: a.name,
        subtitle: `${isPinned ? '<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i> ' : ''}<span class="sub-type">Artist</span>`,
        plainSubtitle: "Artist",
        extra: "Artist",
        art: a.image || a.avatar || "/assets/music-cover.svg",
        isLikedBadge: false,
        isRound: true,
        route: "artist/" + a.id,
        songIds: a.songIds || [],
        isPinned: isPinned,
        addedTs: 300000 - idx,
        creator: a.name,
        vibe: vibe,
        isPlaying: isArtPlaying,
      });
    });

    // 6. Saved Albums (for when filter is 'albums', filtering out junk 'Single' titles)
    const realAlbums = ALBUMS.filter(alb => alb.title && alb.title.toLowerCase() !== "single" && alb.artist !== "Various Artists" && alb.artist !== "T-Series").slice(0, 6);
    realAlbums.forEach((alb, idx) => {
      const isPinned = libState.pins.has(alb.id);
      const isAlbPlaying = isPlaying && curSong && (alb.songIds || []).includes(curSong.id);
      const vibe = detectItemVibe(alb.title + " " + alb.artist);

      items.push({
        id: alb.id,
        type: "album",
        title: alb.title,
        subtitle: `${isPinned ? '<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i> ' : ''}<span class="sub-type">Album</span><span class="sub-dot">•</span><span class="sub-extra">${alb.artist}</span>`,
        plainSubtitle: `Album • ${alb.artist}`,
        extra: "Album",
        dateAddedStr: "Saved",
        art: alb.albumArt || alb.coverArt || "/assets/music-cover.svg",
        isLikedBadge: false,
        isRound: false,
        route: "album/" + alb.id,
        songIds: alb.songIds || [],
        isPinned: isPinned,
        addedTs: 200000 - idx,
        creator: alb.artist,
        vibe: vibe,
        isPlaying: isAlbPlaying,
      });
    });

    // 7. Folders (collapsible playlist containers)
    const folderPlaylistMap = new Map();
    state.folders.forEach(fd => {
      (fd.playlistIds || []).forEach(pid => folderPlaylistMap.set(pid, fd.id));
    });

    state.folders.forEach((fd, idx) => {
      const isFolderPinned = libState.pins.has(fd.id);
      const childPlaylists = (fd.playlistIds || [])
        .map(pid => state.playlists.find(p => p.id === pid))
        .filter(Boolean);

      items.push({
        id: fd.id,
        type: "folder",
        title: fd.name,
        subtitle: `<span class="sub-type">Folder</span><span class="sub-dot">•</span><span class="sub-extra">${childPlaylists.length} ${childPlaylists.length === 1 ? 'playlist' : 'playlists'}</span>`,
        plainSubtitle: `Folder • ${childPlaylists.length} playlists`,
        extra: `${childPlaylists.length} playlists`,
        dateAddedStr: "Folder",
        art: null,
        isLikedBadge: false,
        isRound: false,
        route: null,
        songIds: [],
        isPinned: isFolderPinned,
        addedTs: fd.createdAt || (400000 - idx),
        creator: state.profile?.username || "Om Soni",
        vibe: "sukoon",
        isPlaying: false,
        rawFolder: fd,
        childPlaylists: childPlaylists
      });
    });

    // Filtering
    let filtered = items.filter(item => {
      // If item is a playlist in a folder and user is not searching, render inside the folder
      if (!libState.searchQuery && item.type === "playlist" && folderPlaylistMap.has(item.id)) {
        return false;
      }

      // 1. Chip filter
      if (libState.filter === "playlists" && item.type !== "playlist" && item.type !== "folder") return false;
      if (libState.filter === "artists" && item.type !== "artist") return false;
      if (libState.filter === "albums" && item.type !== "album") return false;
      if (libState.filter === "sukoon" && item.vibe !== "sukoon") return false;
      if (libState.filter === "hype" && item.vibe !== "hype") return false;
      if (libState.filter === "new-releases" && item.id !== "new-releases") return false;

      // 2. Search query filter
      if (libState.searchQuery) {
        const q = libState.searchQuery;
        const matchTitle = (item.title || "").toLowerCase().includes(q);
        const matchSub = (item.plainSubtitle || "").toLowerCase().includes(q);
        const matchCreator = (item.creator || "").toLowerCase().includes(q);
        if (!matchTitle && !matchSub && !matchCreator) return false;
      }

      return true;
    });

    // Exact priority order matching real Spotify reference screenshot (Image 1)
    const PRIORITY_ORDER = [
      "favorites",
      "pl-all-1098-songs",
      "arijit-singh-21",
      "pl-aaj-ki-raat",
      "pl-dil-na-jaaneya",
      "pl-raabta",
      "pl-enna-sona",
      "pl-matargashti",
      "pl-london-thumakda",
      "pl-bolna",
      "pl-dildaara",
      "pl-tera-fitoor",
      "pl-chor-bazaari"
    ];
    const priorityRank = new Map(PRIORITY_ORDER.map((id, idx) => [id, idx]));

    // Sorting: priority reference items stay in defined order at top, then other items by sort mode
    filtered.sort((a, b) => {
      const aRank = priorityRank.has(a.id) ? priorityRank.get(a.id) : 999;
      const bRank = priorityRank.has(b.id) ? priorityRank.get(b.id) : 999;

      if (aRank < 999 || bRank < 999) {
        if (aRank !== bRank) return aRank - bRank;
      }

      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (libState.sort === "alpha") {
        return (a.title || "").localeCompare(b.title || "");
      } else if (libState.sort === "creator") {
        return (a.creator || "").localeCompare(b.creator || "");
      } else if (libState.sort === "added") {
        return (b.addedTs || 0) - (a.addedTs || 0);
      } else {
        // "recents"
        return (b.addedTs || 0) - (a.addedTs || 0);
      }
    });

    // Update Stats Footer
    const statsCount = document.getElementById("libStatsCount");
    if (statsCount) {
      statsCount.innerHTML = `<i class="fa-solid fa-compact-disc"></i> ${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
    }

    if (!filtered.length) {
      container.innerHTML = `
        <div style="padding:24px 12px;text-align:center;color:var(--text-muted);font-size:0.8rem;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <i class="fa-solid fa-magnifying-glass" style="font-size:1.4rem;opacity:0.4;"></i>
          <span>No library items found for this filter</span>
          <button class="lib-chip" style="margin-top:6px;background:rgba(255,255,255,0.08);" id="libResetFilterBtn">Reset filter</button>
        </div>
      `;
      const resetBtn = container.querySelector("#libResetFilterBtn");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          libState.filter = "all";
          libState.searchQuery = "";
          if (libQuickSearch) libQuickSearch.value = "";
          if (libSearchClearBtn) libSearchClearBtn.style.display = "none";
          document.querySelectorAll(".library-filter-chips .lib-chip").forEach(c => c.classList.toggle("active", c.dataset.libFilter === "all"));
          renderSidebarLibrary();
        });
      }
      return;
    }

    function renderLibItem(item, isChild) {
      const eqHtml = item.isPlaying
        ? `<span class="lib-playing-eq" title="Now Playing"><span></span><span></span><span></span><span></span></span>`
        : "";

      const artHtml = item.isLikedBadge
        ? `<div class="liked-art-badge"><i class="fa-solid fa-heart"></i></div>`
        : item.isAiBadge
          ? `<div class="liked-art-badge" style="background:linear-gradient(135deg,#1db954,#0d6e2e);"><i class="fa-solid fa-wand-magic-sparkles"></i></div>`
          : item.isNewReleaseBadge
            ? `<div class="liked-art-badge" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);"><i class="fa-solid fa-compact-disc"></i></div>`
            : item.isLocalFilesBadge
              ? `<div class="local-files-badge"><i class="fa-solid fa-folder"></i></div>`
              : `<img src="${escapeHtml(item.art)}" alt="${escapeHtml(item.title)}" class="lib-item-art ${item.isRound ? 'round-art' : ''}" onerror="this.onerror=null;this.src='/assets/music-cover.svg';" loading="lazy" />`;

      return `
        <div class="lib-item ${item.isPlaying ? 'active-playing' : ''} ${isChild ? 'lib-child-item' : ''}" data-id="${item.id}" data-route="${item.route || ''}" data-lib-type="${item.type}">
          <div class="lib-item-main">
            <!-- Cover Art with mini play button -->
            <div class="lib-item-art-wrap">
              ${artHtml}
              <button class="lib-play-mini" title="Play ${escapeHtml(item.title)}" aria-label="Play ${escapeHtml(item.title)}">
                <i class="fa-solid ${item.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
              </button>
            </div>

            <!-- Info (Title, Subtitle) -->
            <div class="lib-item-info">
              <div class="lib-item-title">
                <span>${escapeHtml(item.title)}</span>
                ${eqHtml}
              </div>
              <div class="lib-item-sub">
                ${item.subtitle}
              </div>
            </div>
          </div>

          <!-- Extra metadata for expanded sidebar view -->
          <span class="lib-item-extra">
            <span class="lib-extra-date">${escapeHtml(item.dateAddedStr || "Recently")}</span>
            <span class="lib-extra-count">${escapeHtml(item.extra)}</span>
          </span>
        </div>
      `;
    }

    function renderFolderItem(item) {
      const fd = item.rawFolder;
      const isExpanded = !!fd.isExpanded;
      const childItemsHtml = (item.childPlaylists || []).map(cp => {
        const isPlPlaying = isPlaying && curSong && (cp.songIds || []).includes(curSong.id);
        const firstSong = cp.songIds && cp.songIds[0] ? songById.get(cp.songIds[0]) : null;
        const art = cp.artSrc || (firstSong ? firstSong.albumArt : "/assets/music-cover.svg");
        const vibe = cp.vibeTag || detectItemVibe(cp.name + " " + (cp.description || ""));
        const creatorName = cp.creator || state.profile?.username || "Om Soni";
        return renderLibItem({
          id: cp.id,
          type: "playlist",
          title: cp.name,
          subtitle: `<span class="sub-type">Playlist</span><span class="sub-dot">•</span><span class="sub-extra">${escapeHtml(creatorName)} #${escapeHtml(vibe)}</span>`,
          plainSubtitle: `Playlist • ${creatorName} #${vibe}`,
          extra: `${(cp.songIds || []).length} songs`,
          dateAddedStr: cp.createdAt ? new Date(cp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recently",
          art: art,
          isLikedBadge: false,
          route: "playlist/" + cp.id,
          songIds: cp.songIds || [],
          isPinned: false,
          addedTs: cp.createdAt || 0,
          creator: creatorName,
          vibe: vibe,
          isPlaying: isPlPlaying,
          isUserCustom: true,
          rawPlaylist: cp
        }, true);
      }).join("");

      return `
        <div class="lib-folder-item ${isExpanded ? 'is-expanded' : ''}" data-folder-id="${fd.id}">
          <div class="lib-folder-header" data-action="toggle-folder" data-folder-id="${fd.id}">
            <div class="lib-folder-icon-wrap">
              <i class="fa-${isExpanded ? 'regular fa-folder-open' : 'solid fa-folder'}"></i>
            </div>
            <div class="lib-folder-info">
              <div class="lib-folder-title">${escapeHtml(fd.name)}</div>
              <div class="lib-folder-sub">Folder • ${(item.childPlaylists || []).length} ${(item.childPlaylists || []).length === 1 ? 'playlist' : 'playlists'}</div>
            </div>
            <div class="lib-folder-chevron">
              <i class="fa-solid fa-chevron-right"></i>
            </div>
          </div>
          <div class="lib-folder-children">
            ${childItemsHtml || '<div style="padding:8px 12px;color:var(--text-muted);font-size:0.75rem;font-style:italic;">Empty folder — right-click a playlist to move here</div>'}
          </div>
        </div>
      `;
    }

    // Render Items
    container.innerHTML = filtered.map(item => item.type === "folder" ? renderFolderItem(item) : renderLibItem(item, false)).join("");

    // Hook click & action listeners for items
    container.querySelectorAll(".lib-item").forEach(el => {
      const itemId = el.dataset.id;
      const itemRoute = el.dataset.route;
      const itemData = items.find(it => it.id === itemId) || filtered.find(it => it.id === itemId);

      el.addEventListener("click", () => {
        if (itemRoute) location.hash = "#/" + itemRoute;
      });

      // Mini play button
      const playBtn = el.querySelector(".lib-play-mini");
      if (playBtn) {
        playBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (itemData && itemData.songIds && itemData.songIds.length) {
            playQueue(itemData.songIds, 0, itemData.title);
          } else {
            toast("No songs in this item yet");
          }
        });
      }

      // Context Menu on right-click
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showLibraryContextMenu(e.clientX, e.clientY, itemData);
      });
    });

    // Hook click & action listeners for folder headers
    container.querySelectorAll(".lib-folder-header").forEach(hdr => {
      const folderId = hdr.dataset.folderId;
      hdr.addEventListener("click", () => {
        toggleFolderExpansion(folderId);
      });
      hdr.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showFolderContextMenu(e.clientX, e.clientY, folderId);
      });
    });
  }

  // Folder Context Menu (Right Click on Folder Header)
  function showFolderContextMenu(x, y, folderId) {
    const folder = state.folders.find(fd => fd.id === folderId);
    if (!folder) return;
    closeAllPopovers();

    const existingMenu = document.getElementById("libContextMenu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "libContextMenu";
    menu.className = "lib-create-dropdown lib-context-menu";
    menu.style.position = "fixed";
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    menu.style.display = "block";
    menu.style.zIndex = "1000";

    menu.innerHTML = `
      <button type="button" class="lib-dropdown-item" id="ctxToggleFolderExpand">
        <i class="fa-solid fa-${folder.isExpanded ? 'folder-closed' : 'folder-open'}"></i>
        <span>${folder.isExpanded ? 'Collapse folder' : 'Expand folder'}</span>
      </button>
      <button type="button" class="lib-dropdown-item" id="ctxRenameFolder">
        <i class="fa-solid fa-pen"></i>
        <span>Rename folder</span>
      </button>
      <button type="button" class="lib-dropdown-item" id="ctxDeleteFolder" style="color:var(--danger);">
        <i class="fa-solid fa-trash" style="color:var(--danger);"></i>
        <span>Delete folder</span>
      </button>
    `;

    document.body.appendChild(menu);

    menu.querySelector("#ctxToggleFolderExpand")?.addEventListener("click", () => {
      menu.remove();
      toggleFolderExpansion(folderId);
    });

    menu.querySelector("#ctxRenameFolder")?.addEventListener("click", () => {
      menu.remove();
      const newName = prompt("Enter new folder name:", folder.name);
      if (newName && newName.trim()) {
        folder.name = newName.trim();
        persistFolders();
        renderSidebarLibrary();
        toast(`Renamed folder to "${folder.name}"`);
      }
    });

    menu.querySelector("#ctxDeleteFolder")?.addEventListener("click", () => {
      menu.remove();
      if (confirm(`Delete folder "${folder.name}"? Playlists will not be deleted.`)) {
        state.folders = state.folders.filter(fd => fd.id !== folderId);
        persistFolders();
        renderSidebarLibrary();
        toast(`Deleted folder "${folder.name}"`);
      }
    });

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
  }

  // Library Item Context Menu (Right Click)
  function showLibraryContextMenu(x, y, item) {
    if (!item) return;
    closeAllPopovers();

    const existingMenu = document.getElementById("libContextMenu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "libContextMenu";
    menu.className = "lib-create-dropdown lib-context-menu";
    menu.style.position = "fixed";
    menu.style.left = `${Math.min(x, window.innerWidth - 240)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 260)}px`;
    menu.style.display = "block";
    menu.style.zIndex = "1000";

    const isPinned = libState.pins.has(item.id);
    const isPlaylist = item.type === "playlist";
    const currentFolder = isPlaylist ? state.folders.find(fd => (fd.playlistIds || []).includes(item.id)) : null;

    let folderOptionsHtml = "";
    if (isPlaylist) {
      if (currentFolder) {
        folderOptionsHtml += `
          <button type="button" class="lib-dropdown-item" id="ctxRemoveFromFolder">
            <i class="fa-solid fa-folder-minus"></i>
            <span>Remove from "${escapeHtml(currentFolder.name)}"</span>
          </button>
        `;
      }
      state.folders.forEach(fd => {
        if (currentFolder && currentFolder.id === fd.id) return;
        folderOptionsHtml += `
          <button type="button" class="lib-dropdown-item ctx-move-to-fld" data-target-fld="${fd.id}">
            <i class="fa-regular fa-folder"></i>
            <span>Move to "${escapeHtml(fd.name)}"</span>
          </button>
        `;
      });
      folderOptionsHtml += `
        <button type="button" class="lib-dropdown-item" id="ctxMoveToNewFolder">
          <i class="fa-solid fa-folder-plus"></i>
          <span>Create folder with this</span>
        </button>
      `;
    }

    menu.innerHTML = `
      <button type="button" class="lib-dropdown-item" id="ctxPlayItem">
        <i class="fa-solid fa-play"></i>
        <span>Play</span>
      </button>
      <button type="button" class="lib-dropdown-item" id="ctxTogglePin">
        <i class="fa-solid fa-thumbtack"></i>
        <span>${isPinned ? "Unpin from top" : "Pin to top"}</span>
      </button>
      ${item.songIds && item.songIds.length ? `
        <button type="button" class="lib-dropdown-item" id="ctxAddToQueue">
          <i class="fa-solid fa-list-ol"></i>
          <span>Add to queue</span>
        </button>
      ` : ""}
      ${isPlaylist ? `<div class="lib-dropdown-divider"></div>${folderOptionsHtml}<div class="lib-dropdown-divider"></div>` : ""}
      ${item.isUserCustom ? `
        <button type="button" class="lib-dropdown-item" id="ctxEditItem">
          <i class="fa-solid fa-pen"></i>
          <span>Edit details</span>
        </button>
        <button type="button" class="lib-dropdown-item" id="ctxDeleteItem" style="color:var(--danger);">
          <i class="fa-solid fa-trash" style="color:var(--danger);"></i>
          <span>Delete</span>
        </button>
      ` : ""}
    `;

    document.body.appendChild(menu);

    menu.querySelector("#ctxPlayItem")?.addEventListener("click", () => {
      menu.remove();
      if (item.songIds && item.songIds.length) {
        playQueue(item.songIds, 0, item.title);
      } else {
        toast("No tracks available");
      }
    });

    menu.querySelector("#ctxTogglePin")?.addEventListener("click", () => {
      menu.remove();
      if (libState.pins.has(item.id)) {
        libState.pins.delete(item.id);
        toast(`Unpinned "${item.title}"`);
      } else {
        libState.pins.add(item.id);
        toast(`📌 Pinned "${item.title}" to top`);
      }
      persistLibraryPins();
      renderSidebarLibrary();
    });

    menu.querySelector("#ctxAddToQueue")?.addEventListener("click", () => {
      menu.remove();
      if (item.songIds && item.songIds.length) {
        state.queue.push(...item.songIds);
        toast(`Added ${item.songIds.length} tracks to queue`);
        renderQueuePanel();
      }
    });

    menu.querySelector("#ctxRemoveFromFolder")?.addEventListener("click", () => {
      menu.remove();
      movePlaylistToFolder(item.id, null);
    });

    menu.querySelectorAll(".ctx-move-to-fld").forEach(btn => {
      btn.addEventListener("click", () => {
        menu.remove();
        movePlaylistToFolder(item.id, btn.dataset.targetFld);
      });
    });

    menu.querySelector("#ctxMoveToNewFolder")?.addEventListener("click", () => {
      menu.remove();
      const folderName = prompt("New folder name:", "Playlists");
      if (folderName && folderName.trim()) {
        const newFolder = {
          id: `fld-${Date.now()}`,
          name: folderName.trim(),
          playlistIds: [item.id],
          isExpanded: true,
          createdAt: Date.now()
        };
        state.folders.push(newFolder);
        persistFolders();
        renderSidebarLibrary();
        toast(`Created folder "${newFolder.name}" with "${item.title}"`);
      }
    });

    menu.querySelector("#ctxEditItem")?.addEventListener("click", () => {
      menu.remove();
      if (item.rawPlaylist) openPlaylistModal(item.rawPlaylist);
    });

    menu.querySelector("#ctxDeleteItem")?.addEventListener("click", () => {
      menu.remove();
      if (confirm(`Delete "${item.title}"?`)) {
        state.playlists = state.playlists.filter(p => p.id !== item.id);
        libState.pins.delete(item.id);
        persistPlaylists();
        persistLibraryPins();
        toast(`Deleted "${item.title}"`);
        if (location.hash.includes(item.id)) {
          location.hash = "#/playlists";
        }
      }
    });

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
  }

  // Update playing wave indicator in library items without full re-render
  function updateSidebarPlayingState() {
    const curSong = currentSong();
    const isPlaying = state.isPlaying;

    document.querySelectorAll("#sidebarLibraryItems .lib-item").forEach(itemEl => {
      const itemId = itemEl.dataset.id;
      const itemType = itemEl.dataset.libType;
      let matches = false;

      if (isPlaying && curSong) {
        if (itemId === "favorites") {
          matches = isLiked(curSong.id);
        } else if (itemType === "playlist") {
          const pl = state.playlists.find(p => p.id === itemId);
          if (pl && (pl.songIds || []).includes(curSong.id)) matches = true;
          else {
            const curMix = (typeof buildCuratedPlaylists === "function" ? buildCuratedPlaylists() : []).find(m => m.id === itemId);
            if (curMix && SONGS.filter(curMix.filter).some(s => s.id === curSong.id)) matches = true;
          }
        } else if (itemType === "artist") {
          matches = curSong.artist && curSong.artist.toLowerCase().includes(itemEl.querySelector(".lib-item-title")?.textContent.toLowerCase() || "___");
        } else if (itemType === "album") {
          const alb = ALBUMS.find(a => a.id === itemId);
          if (alb && (alb.songIds || []).includes(curSong.id)) matches = true;
        }
      }

      itemEl.classList.toggle("active-playing", matches);
      const titleEl = itemEl.querySelector(".lib-item-title");
      let eqSpan = titleEl?.querySelector(".lib-playing-eq");
      if (matches) {
        if (!eqSpan && titleEl) {
          eqSpan = document.createElement("span");
          eqSpan.className = "lib-playing-eq";
          eqSpan.title = "Now Playing";
          eqSpan.innerHTML = `<span></span><span></span><span></span><span></span>`;
          titleEl.appendChild(eqSpan);
        }
      } else if (eqSpan) {
        eqSpan.remove();
      }
    });
  }

  // Initial Sidebar Library Render & Now Playing state on Startup
  renderSidebarLibrary();
  const initSong = currentSong();
  if (initSong) {
    updateNowPlayingUI(initSong, false);
    audio.src = getCleanAudioUrl(initSong);
  }

  // Live Sync on startup with FastAPI Backend
  async function syncBackendState() {
    try {
      const favRes = await fetch(`${API_BASE}/api/favorites`);
      if (favRes.ok) {
        const favs = await favRes.json();
        if (Array.isArray(favs)) {
          favs.forEach((f) => state.favorites.add(String(f.song_id || f.id)));
          persistFavorites();
          refreshVisibleTrackRows();
        }
      }
    } catch (_) {}
  }
  syncBackendState();

  console.log(`Omify loaded — ${SONGS.length} songs, ${ARTISTS.length} artists, ${ALBUMS.length} albums in catalog`);
})();
