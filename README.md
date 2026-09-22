# 🎵 Omify — Music Streaming Platform

Omify is a Spotify-inspired music streaming platform with a modern music player, playlists, favorites, listening history, and a machine-learning recommendation system.

> ⚠️ **Important:** This repository does not include music/audio files.  
> You can add your own songs and use the platform locally.

---

## ✨ Features

- 🎵 Music streaming and playback
- 🔍 Search songs
- ❤️ Favorite songs
- 📂 Playlists
- 🕒 Listening history
- 🤖 Personalized music recommendations
- 🎧 Song categorization
- 👤 User listening profiles
- ⚡ FastAPI backend
- 🗄️ Database support
- 🌐 Modern web-based music player

---

# 🚀 Quick Start

## 1. Clone the Repository

```bash
git clone https://github.com/STUDENT-OMSONI/-spotify-clone-.git

Then enter the project folder:

cd -spotify-clone-
🎵 2. Add Your Own Songs

Songs are not included in this repository.

To use Omify, simply add your own music files.

📌 Main song configuration file

All song information is managed through:

data/songs.js

You can add or edit your songs from this single file.

📁 Recommended Folder Structure
spotify-clone/
│
├── songs/
│   ├── song1.mp3
│   ├── song2.mp3
│   └── song3.mp3
│
├── covers/
│   ├── song1.jpg
│   ├── song2.jpg
│   └── song3.jpg
│
└── data/
    └── songs.js
📝 3. Add Your Songs to data/songs.js

Open:

data/songs.js

Add your songs using the same structure already used in the file.

Example:

const songs = [
    {
        id: 1,
        title: "My First Song",
        artist: "My Artist",
        album: "My Album",
        cover: "covers/song1.jpg",
        audio: "songs/song1.mp3"
    },

    {
        id: 2,
        title: "My Second Song",
        artist: "Another Artist",
        album: "Another Album",
        cover: "covers/song2.jpg",
        audio: "songs/song2.mp3"
    }
];
For every new song:
Put the .mp3 file inside songs/
Put the cover image inside covers/
Add the song information to data/songs.js
Make sure the file names and paths are correct
🎧 Example

If you have:

songs/
    perfect.mp3
    believer.mp3

covers/
    perfect.jpg
    believer.jpg

Add:

{
    id: 1,
    title: "Perfect",
    artist: "Ed Sheeran",
    album: "Divide",
    cover: "covers/perfect.jpg",
    audio: "songs/perfect.mp3"
},
{
    id: 2,
    title: "Believer",
    artist: "Imagine Dragons",
    album: "Evolve",
    cover: "covers/believer.jpg",
    audio: "songs/believer.mp3"
}

💡 You can add as many songs as you want. Just make sure every song has a unique id.

🖼️ Adding Cover Images

Place your album/song cover images inside:

covers/

Then reference them in data/songs.js:

cover: "covers/my-song.jpg"

Supported image formats may include:

.jpg
.jpeg
.png
.webp
🧠 4. Start the Machine Learning Backend

Open a terminal inside the project folder.

Go to the backend:

cd Backend

Activate the virtual environment:

Windows
.\venv\Scripts\activate

Install the required Python packages:

pip install -r requirements.txt

Start the FastAPI backend:

uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

The backend will run at:

http://127.0.0.1:8000
API Documentation

Open:

http://127.0.0.1:8000/docs
Health Check

Open:

http://127.0.0.1:8000/api/health

Keep this terminal running.

🌐 5. Start the Frontend

Open a new terminal.

Go back to the project root:

cd ..

Start the frontend server:

node server.js

The frontend will run at:

http://localhost:8080

Open the URL in your browser.

🤖 Recommendation System

Omify includes a machine-learning recommendation backend designed to provide personalized song recommendations.

The backend includes components for:

🎵 Song categorization
🎧 Audio features
📝 Metadata features
👤 User profiles
❤️ Favorites
🕒 Listening history
📂 Playlists
🤖 Recommendation engine

The recommendation system can use user listening activity and song information to generate personalized recommendations.

🏗️ Project Structure
spotify-clone/
│
├── assets/
│
├── Backend/
│   ├── app/
│   │   ├── models/
│   │   ├── routers/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── database.py
│   │   └── main.py
│   │
│   ├── scripts/
│   └── tests/
│
├── covers/
│   └── Your song covers
│
├── songs/
│   └── Your music files
│
├── data/
│   └── songs.js
│
├── index.html
├── script.js
├── style.css
├── server.js
├── requirements.txt
└── README.md
💻 Requirements

Before running Omify, install:

Python 3.10+
Node.js
Git
🔧 Troubleshooting
Songs are not playing

Check the audio path in:

data/songs.js

For example:

audio: "songs/song1.mp3"

Make sure the actual file exists:

songs/song1.mp3
Cover image is not showing

Check:

cover: "covers/song1.jpg"

and make sure the file exists:

covers/song1.jpg
Backend is not working

Make sure the backend is running:

cd Backend
.\venv\Scripts\activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

Then open:

http://127.0.0.1:8000/api/health
Frontend is not opening

Make sure Node.js is installed.

Run:

node server.js

Then open:

http://localhost:8080
⚠️ Music & Copyright

This repository does not distribute copyrighted music.

Users are responsible for adding audio files that they own or have permission to use.

Please do not upload copyrighted music to the repository without the appropriate rights.

🎯 How to Use Omify

The basic workflow is:

Clone Repository
       ↓
Add Your Own Songs
       ↓
Add Song Information
to data/songs.js
       ↓
Add Cover Images
       ↓
Start Backend
       ↓
Start Frontend
       ↓
Open Omify
       ↓
Enjoy Your Music 🎵
👨‍💻 Developer

Om Soni

GitHub:
https://github.com/STUDENT-OMSONI

LinkedIn:
https://linkedin.com/in/om-soni-407789317

⭐ If you like this project, consider giving the repository a star!

🎵 Build your own music library with Omify.


After replacing the README, save it and run:

```bash
git add README.md
git commit -m "Updated README with song setup instructions"
git push origin main
