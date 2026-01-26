# 🎧 Uncover

An AI-powered music discovery tool designed to dig deep and find **underground, obscure, and niche** artists based on your personal taste. 

Built with a sleek, fully customizable themed interface, this app uses Google Gemini AI to analyze your vibe and combines Spotify, Last.fm, and iTunes APIs to verify artist obscurity and let you preview the music instantly.

## ✨ Features

### 🎯 Smart Obscurity Filtering
* **5-Tier Follower Filter:** Control how underground you want to go with precise follower thresholds:
  - **Ultra Deep** (< 1K followers) - Bedroom/basement artists 🔬
  - **Deep Cut** (1K-10K) - Very underground cult favorites 💎
  - **Underground** (10K-50K) - Independent indie artists 🌑
  - **Emerging** (50K-100K) - Up-and-coming acts 🌱
  - **Niche** (100K-500K) - Established alternative artists 🎯

* **AI-Powered Recommendations:** Each obscurity level uses tailored prompts to guide Gemini toward artists at your desired popularity level
* **Real-Time Verification:** Uses Spotify API (primary) and Last.fm API (fallback) to verify actual follower counts
* **Obscurity Score:** Each artist gets a 0-100 score showing exactly how obscure they are

### 🎨 Fully Customizable Theme
* **RGB Color Picker:** Customize every aspect of the UI with intuitive RGB sliders
* **Live Preview:** See your color changes in real-time across the entire app
* **8 Preset Themes:** Quick-switch between curated color schemes (Purple, Pink, Blue, Green, Orange, Red, Teal, Violet)
* **Smart Color Generation:** Automatically creates harmonious variations (backgrounds, borders, accents) from your selected color
* **Persistent Design:** All UI elements—from backgrounds to tags to sliders—adapt to your chosen theme

### 🔍 Deep Discovery Features
* **Vibe Analysis:** Generates 5-8 descriptive tags (e.g., "lo-fi jazz", "dream pop", "melancholic") to describe your specific taste profile
* **Interactive Tag Navigation:** Click any tag to explore that specific vibe and discover related artists
* **Clickable Artist Tags:** Each recommendation includes 3 specific tags you can explore
* **Smart Input:** Enter artists, genres, or even abstract vibes (e.g., "rainy Sunday mornings")

### 🎵 Rich Media Integration
* **Custom Audio Player:** Clean, minimalist player for 30-second preview clips
* **Multi-API Enrichment:** Combines iTunes (previews), Spotify (follower data), and Last.fm (metadata & images)
* **Artist Artwork:** High-quality images with smart fallbacks
* **Last.fm Integration:** Direct links to artist pages for deep diving into discographies
* **Follower Display:** See actual follower counts for each recommended artist

### 🎭 Beautiful UI/UX
* **Hero Landing Page:** Welcoming initial screen with suggested starting points
* **Smooth Animations:** Loading indicators, hover effects, and transitions throughout
* **Responsive Design:** Fully mobile-optimized interface
* **Dark Mode Design:** Immersive, eye-friendly interface focused on content
* **Progressive Loading:** Data loads smoothly without blocking the entire UI

## 🛠️ Tech Stack

**Frontend:**
* React.js (with Hooks)
* Custom CSS with CSS Variables
* Dynamic Theming System
* Responsive Design

**Backend:**
* Python 3.x
* FastAPI (Modern async web framework)
* Google Gemini AI 2.5 Flash (Text Generation)
* Spotify Web API (Follower verification)
* iTunes Search API (Audio previews & artwork)
* Last.fm API (Additional metadata & images)

## 🚀 Getting Started

### Prerequisites
* Python 3.8+
* Node.js 14+
* API Keys for:
  - Google Gemini AI
  - Spotify (Client ID & Secret)
  - Last.fm (Optional, for better images)

### 1. Backend Setup

Navigate to the backend directory and set up the Python environment.

1.  **Navigate to the folder:**
    ```bash
    cd backend
    ```

2.  **Create a virtual environment (optional but recommended):**
    ```bash
    python -m venv venv
    # Windows
    venv\Scripts\activate
    # Mac/Linux
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a file named `.env` in the `backend/` folder and add your API keys:
    ```env
    GEMINI_API_KEY="your_actual_gemini_key_here"
    SPOTIFY_CLIENT_ID="your_spotify_client_id_here"
    SPOTIFY_CLIENT_SECRET="your_spotify_client_secret_here"
    # Optional: Add Last.fm key for better artist images
    LASTFM_API_KEY="your_lastfm_key_here"
    ```

    **Getting Spotify API Credentials:**
    1. Go to [Spotify for Developers](https://developer.spotify.com/dashboard)
    2. Create a new app
    3. Copy your Client ID and Client Secret

5.  **Run the Server:**
    ```bash
    uvicorn main:app --reload
    ```
    The backend will start at `http://127.0.0.1:8000`. You can check `http://127.0.0.1:8000/health` to confirm it is running.

---

### 2. Frontend Setup

1.  Navigate to the frontend:
    ```bash
    cd frontend
    ```
2.  Install Node dependencies:
    ```bash
    npm install
    ```
3.  Start the React app:
    ```bash
    npm start
    ```

The app will open at `http://localhost:3000`.

## 🎮 How It Works

### Discovery Flow
1.  **Customize Your Experience:** 
    - Click the 🎨 button to choose your theme color
    - Adjust the "Max Followers" slider to set your obscurity level

2.  **Enter Your Taste:** 
    - Type artists you like (e.g., "Nujabes, MF DOOM")
    - Or enter genres/vibes (e.g., "Japanese Jazz, melancholic beats")
    - Or use one of the landing page suggestions

3.  **AI Analysis:** 
    - Backend sends your input to Google Gemini with a level-specific prompt
    - AI generates global vibe tags and recommends 8 artists
    - Each recommendation is tailored to your selected obscurity level

4.  **Smart Filtering:**
    - Backend fetches follower counts from Spotify API
    - Artists exceeding your max follower threshold are filtered out
    - Results are sorted by obscurity (fewer followers first)
    - Returns top 5 most obscure matches

5.  **Discover & Explore:**
    - View artist cards with artwork, descriptions, and tags
    - See follower counts and obscurity scores
    - Click tags to explore related vibes
    - Play 30-second preview clips
    - Visit Last.fm for full discographies

### Technical Architecture

```
User Input → FastAPI Backend → Gemini AI (Recommendations)
                ↓
         Spotify API (Follower Count)
                ↓
         Last.fm API (Images/Metadata)
                ↓
         iTunes API (Audio Previews)
                ↓
         React Frontend (Display & Playback)
```

## 🎨 Customization

### Theme Colors
The app includes a powerful theming system that generates all UI colors from a single RGB value:
- **Accent Color:** Your selected RGB color
- **Accent Hover:** Lighter/more saturated version
- **Background:** Very dark, desaturated version
- **Card Background:** Medium darkness variation
- **Borders:** Between card and background
- **Text Color:** Light with subtle tint

### Obscurity Levels
Modify the obscurity thresholds in `backend/main.py`:
```python
OBSCURITY_PROMPTS = {
    ObscurityLevel.ULTRA_DEEP: {
        "max_followers": 1000,  # Adjust as needed
        ...
    }
}
```

## 🐛 Troubleshooting

### Common Issues

**Backend won't start:**
- Verify all dependencies are installed: `pip install -r requirements.txt`
- Check that your `.env` file exists and contains valid API keys
- Ensure port 8000 is not in use

**No recommendations returned:**
- Check backend logs for API errors
- Verify Gemini API key is valid
- Try lowering the obscurity level (increase max followers)

**No audio previews:**
- Not all artists have previews on iTunes
- This is normal for very obscure artists

**Follower counts not showing:**
- Verify Spotify API credentials are correct
- Check that artists exist on Spotify
- Last.fm fallback will be used if Spotify fails

## 📊 API Rate Limits

- **Spotify:** ~100 requests per hour (token-based)
- **Last.fm:** 5 requests per second
- **iTunes:** No strict limit
- **Gemini:** Depends on your plan

## 🔮 Future Enhancements

- [ ] Save/bookmark favorite discoveries
- [ ] Export recommendations to Spotify playlists
- [ ] User accounts with listening history
- [ ] Collaborative filtering based on user preferences
- [ ] Genre/mood-based radio mode
- [ ] Integration with more music platforms (SoundCloud, Bandcamp)
- [ ] Advanced filters (year, country, label)

## 📄 License

Open Source - MIT License

## 🙏 Credits

Built with:
- [Google Gemini AI](https://ai.google.dev/)
- [Spotify Web API](https://developer.spotify.com/)
- [Last.fm API](https://www.last.fm/api)
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)

---

**Discover music that algorithms miss. Go deeper. Uncover the underground.** 🎵
