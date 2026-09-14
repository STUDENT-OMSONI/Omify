// data/songs.js
// -----------------------------------------------------------------------------
// OMIFY MUSIC CATALOG
// -----------------------------------------------------------------------------
// This file is the single source of truth for the song catalog. Each entry
// is metadata-complete and ready for a real, licensed audio URL.
//
// IMPORTANT — AUDIO SOURCES:
// The `audioUrl` fields below point to a small set of short, original,
// procedurally-generated tone clips (assets/audio/demo-1.wav ... demo-8.wav)
// created for this project so the player has something legal to actually
// play during development. They are NOT the real songs.
//
// To ship real audio, replace `audioUrl` per track with a URL from a
// licensed source: your own uploaded/purchased files, a royalty-free
// library (e.g. Epidemic Sound, Artlist), public-domain recordings, or a
// licensed streaming API. Do not scrape audio from Spotify or any other
// platform — see README.md "Licensing" section.
//
// SCALING TO 1000+:
// This file currently ships 100 curated international tracks as a real,
// fully-shaped example set. See README.md "Adding more songs" for the
// generator script pattern to extend this array to 1000+ without hand
// writing repeated objects.
// -----------------------------------------------------------------------------

const DEMO_CLIPS = [
  "assets/audio/demo-1.wav",
  "assets/audio/demo-2.wav",
  "assets/audio/demo-3.wav",
  "assets/audio/demo-4.wav",
  "assets/audio/demo-5.wav",
  "assets/audio/demo-6.wav",
  "assets/audio/demo-7.wav",
  "assets/audio/demo-8.wav",
];

function demoAudio(seed) {
  return DEMO_CLIPS[seed % DEMO_CLIPS.length];
}

// Each track: id, title, artist, album, albumArt, audioUrl, duration (sec),
// genre, language, country, releaseYear, liked (default false), playCount,
// explicit, mood
const RAW_TRACKS = [
  // -- English / Pop --------------------------------------------------------
  ["Glass Horizon", "Nova Reyes", "Afterglow", "English", "Pop", "United States", 2024, "Uplifting", 812000, 214],
  ["Paper Cities", "Nova Reyes", "Afterglow", "English", "Pop", "United States", 2024, "Chill", 640000, 198],
  ["Static Bloom", "Kaid Ellery", "Static Bloom", "English", "Pop", "United Kingdom", 2023, "Energetic", 1120000, 187],
  ["Slow Static", "Kaid Ellery", "Static Bloom", "English", "Indie", "United Kingdom", 2023, "Chill", 455000, 231],
  ["Neon Tideline", "The Faraday Set", "Neon Tideline", "English", "Electronic", "Australia", 2025, "Party", 980000, 176],
  ["Midnight Freight", "The Faraday Set", "Neon Tideline", "English", "Electronic", "Australia", 2025, "Focus", 320000, 203],
  ["Halfway Gone", "Rosalind Cade", "Halfway Gone", "English", "R&B", "Canada", 2022, "Sad", 1340000, 245],
  ["Velvet Static", "Rosalind Cade", "Halfway Gone", "English", "R&B", "Canada", 2022, "Romantic", 890000, 262],
  ["Low Light City", "Dune & Marrow", "Low Light City", "English", "Indie Rock", "United States", 2021, "Chill", 402000, 219],
  ["Copper Skies", "Dune & Marrow", "Low Light City", "English", "Indie Rock", "United States", 2021, "Uplifting", 356000, 226],

  // -- Korean / K-Pop ---------------------------------------------------------
  ["Ribbon", "SOLAH", "Ribbon", "Korean", "K-Pop", "South Korea", 2024, "Energetic", 2100000, 195],
  ["Winter Static", "SOLAH", "Ribbon", "Korean", "K-Pop", "South Korea", 2024, "Chill", 1450000, 210],
  ["Neon Petal", "HYUNIX", "Neon Petal", "Korean", "K-Pop", "South Korea", 2023, "Party", 3200000, 188],
  ["Echo Room", "HYUNIX", "Neon Petal", "Korean", "K-Pop", "South Korea", 2023, "Sad", 1780000, 234],
  ["Glasswave", "TEN:SU", "Glasswave", "Korean", "K-Pop", "South Korea", 2025, "Energetic", 2650000, 172],
  ["Blue Signal", "TEN:SU", "Glasswave", "Korean", "K-Pop", "South Korea", 2025, "Romantic", 1980000, 199],
  ["City Lights Fade", "Jia Woo", "City Lights Fade", "Korean", "R&B", "South Korea", 2022, "Chill", 1120000, 241],
  ["Autumn Frame", "Jia Woo", "City Lights Fade", "Korean", "R&B", "South Korea", 2022, "Sad", 890000, 255],

  // -- Japanese / J-Pop ------------------------------------------------------
  ["Sakura Drift", "Miyabi Ito", "Sakura Drift", "Japanese", "J-Pop", "Japan", 2023, "Uplifting", 1560000, 205],
  ["Neon Rain", "Miyabi Ito", "Sakura Drift", "Japanese", "J-Pop", "Japan", 2023, "Chill", 980000, 222],
  ["Static Lantern", "KUROI WAVE", "Static Lantern", "Japanese", "Rock", "Japan", 2024, "Energetic", 1340000, 180],
  ["Tokyo After Hours", "KUROI WAVE", "Static Lantern", "Japanese", "Rock", "Japan", 2024, "Party", 1120000, 196],
  ["Paper Lantern", "Rin Asahi", "Paper Lantern", "Japanese", "J-Pop", "Japan", 2021, "Romantic", 780000, 249],
  ["Blue Hour", "Rin Asahi", "Paper Lantern", "Japanese", "J-Pop", "Japan", 2021, "Sad", 654000, 263],

  // -- Spanish / Latin ---------------------------------------------------------
  ["Fuego Lento", "Camila Rey", "Fuego Lento", "Spanish", "Latin Pop", "Mexico", 2024, "Party", 2450000, 190],
  ["Corazon de Vidrio", "Camila Rey", "Fuego Lento", "Spanish", "Latin Pop", "Mexico", 2024, "Romantic", 1980000, 208],
  ["Noches de Sal", "Mateo Duarte", "Noches de Sal", "Spanish", "Reggaeton", "Colombia", 2023, "Party", 3100000, 175],
  ["Ola Tras Ola", "Mateo Duarte", "Noches de Sal", "Spanish", "Reggaeton", "Colombia", 2023, "Energetic", 2200000, 192],
  ["Ceniza y Miel", "Luz Marino", "Ceniza y Miel", "Spanish", "Latin Pop", "Argentina", 2022, "Sad", 1120000, 236],
  ["Bajo la Lluvia", "Luz Marino", "Ceniza y Miel", "Spanish", "Latin Pop", "Argentina", 2022, "Chill", 890000, 251],

  // -- French -----------------------------------------------------------------
  ["Lumiere Basse", "Elise Fontaine", "Lumiere Basse", "French", "French Pop", "France", 2024, "Chill", 780000, 213],
  ["Nuit Blanche", "Elise Fontaine", "Lumiere Basse", "French", "French Pop", "France", 2024, "Romantic", 650000, 228],
  ["Cendres Douces", "Theo Vasseur", "Cendres Douces", "French", "Electronic", "France", 2023, "Focus", 540000, 197],
  ["Ville Silencieuse", "Theo Vasseur", "Cendres Douces", "French", "Electronic", "France", 2023, "Chill", 470000, 216],

  // -- Italian ------------------------------------------------------------------
  ["Fiamma Blu", "Serena Conti", "Fiamma Blu", "Italian", "Pop", "Italy", 2023, "Uplifting", 690000, 220],
  ["Cielo di Vetro", "Serena Conti", "Fiamma Blu", "Italian", "Pop", "Italy", 2023, "Romantic", 580000, 233],
  ["Onde Notturne", "Dario Falco", "Onde Notturne", "Italian", "Electronic", "Italy", 2024, "Party", 720000, 201],

  // -- German -------------------------------------------------------------------
  ["Kalter Mond", "Lena Vogt", "Kalter Mond", "German", "Electronic", "Germany", 2022, "Focus", 610000, 224],
  ["Stille Strasse", "Lena Vogt", "Kalter Mond", "German", "Electronic", "Germany", 2022, "Chill", 540000, 239],
  ["Nebel Und Licht", "Jonas Reimer", "Nebel Und Licht", "German", "Indie", "Germany", 2023, "Sad", 480000, 244],

  // -- Portuguese / Brazil --------------------------------------------------------
  ["Maré Alta", "Beatriz Amaral", "Maré Alta", "Portuguese", "MPB", "Brazil", 2024, "Uplifting", 1230000, 206],
  ["Fogo Baixo", "Beatriz Amaral", "Maré Alta", "Portuguese", "MPB", "Brazil", 2024, "Romantic", 980000, 218],
  ["Ritmo do Sol", "Caio Nogueira", "Ritmo do Sol", "Portuguese", "Afrobeat", "Brazil", 2023, "Party", 1560000, 189],
  ["Verão Sem Fim", "Caio Nogueira", "Ritmo do Sol", "Portuguese", "Afrobeat", "Brazil", 2023, "Energetic", 1340000, 204],

  // -- Afrobeats --------------------------------------------------------------------
  ["Lagos Nights", "Chidi Obiora", "Lagos Nights", "English", "Afrobeats", "Nigeria", 2024, "Party", 2780000, 182],
  ["Sunlight Riddim", "Chidi Obiora", "Lagos Nights", "English", "Afrobeats", "Nigeria", 2024, "Uplifting", 2100000, 195],
  ["Golden Hour Accra", "Ama Boateng", "Golden Hour Accra", "English", "Afrobeats", "Ghana", 2023, "Chill", 1450000, 211],
  ["Dust and Drum", "Ama Boateng", "Golden Hour Accra", "English", "Afrobeats", "Ghana", 2023, "Energetic", 1120000, 227],

  // -- Arabic ----------------------------------------------------------------------
  ["Layl Tawil", "Nour Haddad", "Layl Tawil", "Arabic", "Arabic Pop", "Lebanon", 2023, "Romantic", 1670000, 200],
  ["Sahra Zarqa", "Nour Haddad", "Layl Tawil", "Arabic", "Arabic Pop", "Lebanon", 2023, "Chill", 1230000, 217],
  ["Rimal Dhahabia", "Yousef Amin", "Rimal Dhahabia", "Arabic", "Arabic Pop", "Egypt", 2024, "Uplifting", 1980000, 193],

  // -- Turkish ----------------------------------------------------------------------
  ["Gece Yarisi", "Elif Kaya", "Gece Yarisi", "Turkish", "Turkish Pop", "Turkey", 2022, "Sad", 1120000, 235],
  ["Sessiz Sokak", "Elif Kaya", "Gece Yarisi", "Turkish", "Turkish Pop", "Turkey", 2022, "Chill", 890000, 248],
  ["Yildizli Yol", "Baris Demir", "Yildizli Yol", "Turkish", "Turkish Pop", "Turkey", 2023, "Uplifting", 1340000, 210],

  // -- Mandopop / C-Pop -----------------------------------------------------------
  ["Yueguang", "Lin Xue", "Yueguang", "Mandarin", "Mandopop", "Taiwan", 2023, "Romantic", 1450000, 214],
  ["Chenmo De Hai", "Lin Xue", "Yueguang", "Mandarin", "Mandopop", "Taiwan", 2023, "Sad", 1120000, 229],
  ["Xing Guang", "Zhao Yiming", "Xing Guang", "Mandarin", "C-Pop", "China", 2024, "Uplifting", 1980000, 197],
  ["Feng De Fangxiang", "Zhao Yiming", "Xing Guang", "Mandarin", "C-Pop", "China", 2024, "Chill", 1230000, 212],

  // -- European Pop -----------------------------------------------------------------
  ["Silver Static", "Nadia Kowalski", "Silver Static", "English", "European Pop", "Poland", 2024, "Party", 890000, 202],
  ["Frost Parade", "Nadia Kowalski", "Silver Static", "English", "European Pop", "Poland", 2024, "Energetic", 720000, 219],
  ["Copper Sky", "Sanne de Wit", "Copper Sky", "English", "European Pop", "Netherlands", 2023, "Uplifting", 650000, 225],

  // -- International Rock ---------------------------------------------------------
  ["Rust Belt Anthem", "Fault Line", "Rust Belt Anthem", "English", "Rock", "United States", 2021, "Energetic", 1780000, 240],
  ["Iron Horizon", "Fault Line", "Rust Belt Anthem", "English", "Rock", "United States", 2021, "Party", 1450000, 252],
  ["Broken Radio", "Wolfstone Parade", "Broken Radio", "English", "Rock", "Germany", 2022, "Sad", 980000, 246],

  // -- International Hip-Hop -------------------------------------------------------
  ["Concrete Bloom", "Dray Malik", "Concrete Bloom", "English", "Hip-Hop", "United Kingdom", 2024, "Energetic", 2340000, 184],
  ["Corner Store Legend", "Dray Malik", "Concrete Bloom", "English", "Hip-Hop", "United Kingdom", 2024, "Party", 1980000, 199],
  ["Night Bus Freestyle", "Kofi Anan Jr.", "Night Bus Freestyle", "English", "Hip-Hop", "Nigeria", 2023, "Focus", 1560000, 209],

  // -- Electronic ----------------------------------------------------------------------
  ["Circuit Bloom", "Vela Nyx", "Circuit Bloom", "English", "Electronic", "Sweden", 2025, "Focus", 1120000, 191],
  ["Analog Ghosts", "Vela Nyx", "Circuit Bloom", "English", "Electronic", "Sweden", 2025, "Party", 980000, 203],
  ["Deep Static Field", "Rurik Solberg", "Deep Static Field", "English", "Electronic", "Norway", 2024, "Chill", 720000, 216],

  // -- R&B / Soul ----------------------------------------------------------------------
  ["Slow Burn Letters", "Imani Grace", "Slow Burn Letters", "English", "R&B", "United States", 2023, "Romantic", 1980000, 207],
  ["Velvet Rooms", "Imani Grace", "Slow Burn Letters", "English", "R&B", "United States", 2023, "Chill", 1670000, 221],

  // -- Indie / Lo-Fi -----------------------------------------------------------------
  ["Attic Light", "Soft Static", "Attic Light", "English", "Lo-Fi", "Canada", 2022, "Focus", 540000, 230],
  ["Rainy Desk", "Soft Static", "Attic Light", "English", "Lo-Fi", "Canada", 2022, "Chill", 470000, 243],
  ["Window Seat", "Marlowe Finch", "Window Seat", "English", "Indie", "United Kingdom", 2024, "Sad", 610000, 215],

  // -- Classical / Instrumental --------------------------------------------------------
  ["Quiet Atrium", "Ensemble Verre", "Quiet Atrium", "Instrumental", "Classical", "Austria", 2020, "Focus", 340000, 258],
  ["Winter Study No. 4", "Ensemble Verre", "Quiet Atrium", "Instrumental", "Classical", "Austria", 2020, "Sad", 290000, 264],

  // -- Extra rounding tracks across regions to reach 100 -------------------------------
  ["Morning Static", "Nova Reyes", "Afterglow", "English", "Pop", "United States", 2024, "Uplifting", 410000, 233],
  ["Second Wind", "Kaid Ellery", "Static Bloom", "English", "Pop", "United Kingdom", 2023, "Energetic", 380000, 238],
  ["Dune Radio", "The Faraday Set", "Neon Tideline", "English", "Electronic", "Australia", 2025, "Chill", 360000, 241],
  ["Faded Postcard", "Rosalind Cade", "Halfway Gone", "English", "R&B", "Canada", 2022, "Sad", 690000, 250],
  ["Amber Alley", "Dune & Marrow", "Low Light City", "English", "Indie Rock", "United States", 2021, "Party", 320000, 244],
  ["Paper Moonlight", "SOLAH", "Ribbon", "Korean", "K-Pop", "South Korea", 2024, "Romantic", 1120000, 218],
  ["Static Season", "HYUNIX", "Neon Petal", "Korean", "K-Pop", "South Korea", 2023, "Uplifting", 1450000, 205],
  ["Falling Signal", "TEN:SU", "Glasswave", "Korean", "K-Pop", "South Korea", 2025, "Chill", 980000, 213],
  ["Hourglass City", "Jia Woo", "City Lights Fade", "Korean", "R&B", "South Korea", 2022, "Focus", 650000, 227],
  ["Glass Garden", "Miyabi Ito", "Sakura Drift", "Japanese", "J-Pop", "Japan", 2023, "Romantic", 780000, 224],
  ["Static Shrine", "KUROI WAVE", "Static Lantern", "Japanese", "Rock", "Japan", 2024, "Energetic", 890000, 219],
  ["Blue Lantern", "Rin Asahi", "Paper Lantern", "Japanese", "J-Pop", "Japan", 2021, "Chill", 540000, 236],
  ["Sal y Luna", "Camila Rey", "Fuego Lento", "Spanish", "Latin Pop", "Mexico", 2024, "Uplifting", 1230000, 211],
  ["Tormenta Suave", "Mateo Duarte", "Noches de Sal", "Spanish", "Reggaeton", "Colombia", 2023, "Party", 1980000, 198],
  ["Vidrio y Fuego", "Luz Marino", "Ceniza y Miel", "Spanish", "Latin Pop", "Argentina", 2022, "Romantic", 890000, 229],
  ["Reflet Dore", "Elise Fontaine", "Lumiere Basse", "French", "French Pop", "France", 2024, "Focus", 470000, 232],
  ["Metro de Nuit", "Theo Vasseur", "Cendres Douces", "French", "Electronic", "France", 2023, "Party", 410000, 237],
  ["Vento di Marzo", "Serena Conti", "Fiamma Blu", "Italian", "Pop", "Italy", 2023, "Chill", 480000, 234],
  ["Riflesso Blu", "Dario Falco", "Onde Notturne", "Italian", "Electronic", "Italy", 2024, "Focus", 390000, 240],
  ["Grauer Himmel", "Lena Vogt", "Kalter Mond", "German", "Electronic", "Germany", 2022, "Sad", 350000, 247],
  ["Leiser Fluss", "Jonas Reimer", "Nebel Und Licht", "German", "Indie", "Germany", 2023, "Chill", 320000, 253],
  ["Praia Dourada", "Beatriz Amaral", "Maré Alta", "Portuguese", "MPB", "Brazil", 2024, "Party", 780000, 220],
  ["Vento do Norte", "Caio Nogueira", "Ritmo do Sol", "Portuguese", "Afrobeat", "Brazil", 2023, "Uplifting", 650000, 231],
  ["Ibadan Sunrise", "Chidi Obiora", "Lagos Nights", "English", "Afrobeats", "Nigeria", 2024, "Uplifting", 1230000, 208],
  ["Kente Groove", "Ama Boateng", "Golden Hour Accra", "English", "Afrobeats", "Ghana", 2023, "Party", 980000, 222],
  ["Bahr Al Layl", "Nour Haddad", "Layl Tawil", "Arabic", "Arabic Pop", "Lebanon", 2023, "Sad", 780000, 228],
  ["Qamar Fi Al Sahra", "Yousef Amin", "Rimal Dhahabia", "Arabic", "Arabic Pop", "Egypt", 2024, "Chill", 690000, 235],
  ["Ruzgar Gibi", "Baris Demir", "Yildizli Yol", "Turkish", "Turkish Pop", "Turkey", 2023, "Party", 890000, 223],
  ["Zui Hou De Xia Ji", "Zhao Yiming", "Xing Guang", "Mandarin", "C-Pop", "China", 2024, "Sad", 780000, 230],
  ["Ye Kong De Xin", "Lin Xue", "Yueguang", "Mandarin", "Mandopop", "Taiwan", 2023, "Focus", 540000, 242],
  ["Salt Parade", "Sanne de Wit", "Copper Sky", "English", "European Pop", "Netherlands", 2023, "Party", 470000, 226],
  ["Winter Static II", "Nadia Kowalski", "Silver Static", "English", "European Pop", "Poland", 2024, "Chill", 410000, 233],
  ["Chrome Horizon", "Fault Line", "Rust Belt Anthem", "English", "Rock", "United States", 2021, "Energetic", 890000, 249],
  ["Static Choir", "Wolfstone Parade", "Broken Radio", "English", "Rock", "Germany", 2022, "Focus", 610000, 254],
  ["Fireproof Blocks", "Dray Malik", "Concrete Bloom", "English", "Hip-Hop", "United Kingdom", 2024, "Party", 1120000, 200],
  ["Late Train Verse", "Kofi Anan Jr.", "Night Bus Freestyle", "English", "Hip-Hop", "Nigeria", 2023, "Energetic", 890000, 214],
  ["Voltage Bloom", "Vela Nyx", "Circuit Bloom", "English", "Electronic", "Sweden", 2025, "Party", 720000, 205],
  ["Fjord Static", "Rurik Solberg", "Deep Static Field", "English", "Electronic", "Norway", 2024, "Focus", 540000, 218],
  ["Letters Unsent", "Imani Grace", "Slow Burn Letters", "English", "R&B", "United States", 2023, "Sad", 1230000, 211],
  ["Second Attic", "Soft Static", "Attic Light", "English", "Lo-Fi", "Canada", 2022, "Chill", 390000, 236],
  ["Grey Curtains", "Marlowe Finch", "Window Seat", "English", "Indie", "United Kingdom", 2024, "Focus", 350000, 245],
  ["Spring Study No. 2", "Ensemble Verre", "Quiet Atrium", "Instrumental", "Classical", "Austria", 2020, "Focus", 260000, 260],
];

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const SONGS = RAW_TRACKS.map((row, i) => {
  const [title, artist, album, language, genre, country, releaseYear, mood, playCount, durationSeed] = row;
  const id = `omify-${String(i + 1).padStart(4, "0")}`;
  return {
    id,
    title,
    artist,
    album,
    albumArt: `https://picsum.photos/seed/${slugify(album + artist)}/300/300`,
    audioUrl: demoAudio(i),
    duration: 150 + (durationSeed % 120), // seconds, deterministic pseudo-variety
    genre,
    language,
    country,
    releaseYear,
    liked: false,
    playCount,
    explicit: false,
    mood,
  };
});

// Derived collections -------------------------------------------------------
function buildArtists(songs) {
  const map = new Map();
  songs.forEach((s) => {
    if (!map.has(s.artist)) {
      map.set(s.artist, {
        id: slugify(s.artist),
        name: s.artist,
        image: `https://picsum.photos/seed/${slugify(s.artist)}/400/400`,
        country: s.country,
        songIds: [],
      });
    }
    map.get(s.artist).songIds.push(s.id);
  });
  return Array.from(map.values());
}

function buildAlbums(songs) {
  const map = new Map();
  songs.forEach((s) => {
    const key = s.album + "::" + s.artist;
    if (!map.has(key)) {
      map.set(key, {
        id: slugify(key),
        title: s.album,
        artist: s.artist,
        albumArt: s.albumArt,
        releaseYear: s.releaseYear,
        songIds: [],
      });
    }
    map.get(key).songIds.push(s.id);
  });
  return Array.from(map.values());
}

const ARTISTS = buildArtists(SONGS);
const ALBUMS = buildAlbums(SONGS);

// exposed as globals for the plain-script app (no bundler in this project)
window.OMIFY_SONGS = SONGS;
window.OMIFY_ARTISTS = ARTISTS;
window.OMIFY_ALBUMS = ALBUMS;
