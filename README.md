
# 🎧 Uncover (v0.8)

**Uncover** is a high-fidelity music discovery engine designed to bypass mainstream algorithms. Unlike standard recommendation tools, Uncover uses a "depth-first" search approach to find underground, obscure, and niche artists based on your specific "vibe".

## ✨ Key Enhancements in 0.8

* **Algorithmic Depth Control:** A new "Obscurity Slider" allows you to toggle between five levels of discovery—from "Niche" (up to 500k followers) down to "Ultra Deep" (less than 1,000 followers).
* **Hybrid Intelligence:** The app now integrates directly with **Spotify** and **Last.fm** to cross-reference listener counts and popularity scores, ensuring recommendations are truly underground.
* **Dynamic UI Personalization:** A built-in theme engine allows you to customize the entire interface's "vibe color" using an RGB picker.
* **Spotify Ecosystem Integration:** Connect your Spotify account to seed recommendations from your library and save your discoveries directly to a generated "Uncover" playlist.

## 🛠️ Tech Stack

**Frontend:**

* **React 19:** Utilizing advanced hooks for waveform audio synchronization and theme generation.
* **Custom CSS Variables:** Dynamic layout that adapts colors based on user input.

**Backend:**

* **FastAPI (Python):** High-performance asynchronous API handling.
* **Multi-API Orchestration:** Parallel processing of data from Spotify (Web API), Last.fm, and iTunes Search.
* **Statistical Ranking:** A custom bell-curve obscurity scoring system based on Last.fm listener data.

## 🚀 Setup & Installation

### 1. Environment Configuration

Create a `.env` file in the `backend/` directory with the following credentials:

```env
LASTFM_API_KEY="your_lastfm_key"
SPOTIFY_CLIENT_ID="your_spotify_id"
SPOTIFY_CLIENT_SECRET="your_spotify_secret"
SPOTIFY_REDIRECT_URI="http://127.0.0.1:3000/callback"

```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload

```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm start

```

## 🎮 How to Discover

1. **Seed the Vibe:** Enter artists, genres, or moods (e.g., "Japanese Jazz, 90s Memphis Rap").
2. **Select Your Depth:** Use the slider to choose how "deep" into the underground you want to go.
3. **Preview & Verify:** * Click the **Play** button to hear a 30-second snippet.
* Check the **Obscurity Ring** to see the artist's underground score (0–100).


4. **Curate:** Heart your favorite finds to add them to your discovery drawer, then save the entire batch to Spotify.

## 📄 License

Open Source.
