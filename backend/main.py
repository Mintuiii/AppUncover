from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os, json, requests, urllib.parse
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from enum import Enum

load_dotenv()

# --- Configure Gemini ---
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = "models/gemini-2.5-flash"

# --- Optional Last.fm & Spotify ---
LASTFM_KEY = os.getenv("LASTFM_API_KEY")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Obscurity Levels ---
class ObscurityLevel(str, Enum):
    ULTRA_DEEP = "ultra_deep"      # <1K followers
    DEEP_CUT = "deep_cut"           # 1K-10K followers
    UNDERGROUND = "underground"     # 10K-50K followers
    EMERGING = "emerging"           # 50K-100K followers
    NICHE = "niche"                 # 100K-500K followers

OBSCURITY_PROMPTS = {
    ObscurityLevel.ULTRA_DEEP: {
        "max_followers": 1000,
        "description": "ultra-obscure bedroom/basement artists",
        "prompt_modifier": "extremely unknown, virtually undiscovered, bedroom/DIY artists with almost no following"
    },
    ObscurityLevel.DEEP_CUT: {
        "max_followers": 10000,
        "description": "deep underground artists",
        "prompt_modifier": "very underground, cult following, extremely niche artists"
    },
    ObscurityLevel.UNDERGROUND: {
        "max_followers": 50000,
        "description": "underground/indie artists",
        "prompt_modifier": "underground, small but dedicated fanbase, indie/alternative artists"
    },
    ObscurityLevel.EMERGING: {
        "max_followers": 100000,
        "description": "emerging/indie artists",
        "prompt_modifier": "emerging artists, growing indie scene, up-and-coming acts"
    },
    ObscurityLevel.NICHE: {
        "max_followers": 500000,
        "description": "niche/alternative artists",
        "prompt_modifier": "niche alternative artists, established indie acts, cult favorites"
    }
}

class ArtistInput(BaseModel):
    artists: List[str]
    obscurity_level: Optional[ObscurityLevel] = ObscurityLevel.DEEP_CUT

# --- Spotify Token Cache ---
_spotify_token = None

def get_spotify_token():
    global _spotify_token
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None
    
    try:
        r = requests.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET),
            timeout=10
        )
        if r.ok:
            _spotify_token = r.json().get("access_token")
            return _spotify_token
    except Exception:
        pass
    return None

def get_artist_followers(artist_name: str) -> Optional[int]:
    """Get follower count from Spotify API"""
    token = _spotify_token or get_spotify_token()
    if not token:
        return None
    
    try:
        # Search for artist
        r = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": artist_name, "type": "artist", "limit": 1},
            timeout=8
        )
        
        if r.ok:
            data = r.json()
            artists = data.get("artists", {}).get("items", [])
            if artists:
                return artists[0].get("followers", {}).get("total", 0)
    except Exception:
        pass
    return None

def get_lastfm_listeners(artist_name: str) -> Optional[int]:
    """Get listener count from Last.fm API"""
    if not LASTFM_KEY:
        return None
    
    try:
        r = requests.get(
            "http://ws.audioscrobbler.com/2.0/",
            params={
                "method": "artist.getinfo",
                "artist": artist_name,
                "api_key": LASTFM_KEY,
                "format": "json",
            },
            timeout=8,
        )
        if r.ok:
            j = r.json()
            listeners = j.get("artist", {}).get("stats", {}).get("listeners")
            if listeners:
                return int(listeners)
    except Exception:
        pass
    return None

@app.get("/health")
def health():
    return {"ok": True}

# ---------- Helpers ----------
def ai_recommend(artists: List[str], obscurity_level: ObscurityLevel) -> Dict[str, Any]:
    artist_list = ", ".join(artists)
    level_info = OBSCURITY_PROMPTS[obscurity_level]
    
    prompt = f"""
    The user is interested in these artists, genres, or vibes: {artist_list}.
    
    CRITICAL: Recommend ONLY {level_info['prompt_modifier']}.
    Maximum follower count target: {level_info['max_followers']:,}
    
    1) Return 5–8 descriptive global tags (genres, moods, themes, style) for this specific taste.
    2) Recommend 8 {level_info['description']} that fit this specific vibe.
       - AVOID any mainstream or well-known artists
       - Focus on {level_info['prompt_modifier']}
       - Prioritize artists with very small followings
    3) For each artist, give one-sentence why it fits AND 3 specific tags for that artist.

    Respond as strict JSON:
    {{
      "tags": ["tag1", "..."],
      "recommendations": [
        {{"artist": "Name", "explanation": "one sentence", "tags": ["tag1", "tag2", "tag3"]}}
      ]
    }}
    """
    
    model = genai.GenerativeModel(GEMINI_MODEL)
    resp = model.generate_content(prompt)

    try:
        return json.loads(resp.text)
    except Exception:
        txt = resp.text.strip()
        start = txt.find("{")
        end = txt.rfind("}")
        if start != -1 and end != -1:
            return json.loads(txt[start:end+1])
        return {"tags": [], "recommendations": []}

def enrich_with_itunes(artist_name: str) -> Dict[str, Any]:
    try:
        r = requests.get(
            "https://itunes.apple.com/search",
            params={
                "term": artist_name,
                "entity": "musicTrack",
                "limit": 1,
            },
            timeout=8,
        )
        data = r.json()
        if data.get("resultCount", 0) > 0:
            item = data["results"][0]
            return {
                "sampleUrl": item.get("previewUrl"),
                "sampleTrack": item.get("trackName"),
                "image": item.get("artworkUrl100", "").replace("100x100bb.jpg", "400x400bb.jpg"),
            }
    except Exception:
        pass
    return {"sampleUrl": None, "sampleTrack": None, "image": None}

def fallback_lastfm_image(artist_name: str) -> str | None:
    if not LASTFM_KEY:
        return None
    try:
        r = requests.get(
            "http://ws.audioscrobbler.com/2.0/",
            params={
                "method": "artist.getinfo",
                "artist": artist_name,
                "api_key": LASTFM_KEY,
                "format": "json",
            },
            timeout=8,
        )
        j = r.json()
        images = j.get("artist", {}).get("image", [])
        if images:
            return images[-1].get("#text") or None
    except Exception:
        pass
    return None

def enrich_recommendations(recs: List[Dict[str, Any]], max_followers: int) -> List[Dict[str, Any]]:
    enriched = []
    for r in recs:
        name = r.get("artist", "")
        
        # Get follower/listener counts
        spotify_followers = get_artist_followers(name)
        lastfm_listeners = get_lastfm_listeners(name)
        
        # Filter based on follower count (prefer Spotify, fallback to Last.fm)
        follower_count = spotify_followers or lastfm_listeners
        
        # Skip if over the limit
        if follower_count and follower_count > max_followers:
            continue
        
        meta = enrich_with_itunes(name)
        if not meta.get("image"):
            lf_img = fallback_lastfm_image(name)
            if lf_img:
                meta["image"] = lf_img
        
        encoded_name = urllib.parse.quote_plus(name)
        last_fm_link = f"https://www.last.fm/music/{encoded_name}"

        enriched.append({
            "artist": name,
            "explanation": r.get("explanation", ""),
            "tags": r.get("tags", []),
            "image": meta.get("image"),
            "sampleUrl": meta.get("sampleUrl"),
            "sampleTrack": meta.get("sampleTrack"),
            "lastFmUrl": last_fm_link,
            "followers": follower_count,
            "obscurityScore": calculate_obscurity_score(follower_count) if follower_count else None
        })
    
    # Sort by obscurity (fewer followers first)
    enriched.sort(key=lambda x: x.get("followers") or 0)
    return enriched[:5]  # Return top 5 most obscure

def calculate_obscurity_score(followers: int) -> int:
    """Calculate obscurity score (0-100, higher = more obscure)"""
    if followers < 100:
        return 100
    elif followers < 1000:
        return 95
    elif followers < 10000:
        return 85
    elif followers < 50000:
        return 70
    elif followers < 100000:
        return 50
    elif followers < 500000:
        return 30
    else:
        return 10

# ---------- Routes ----------
@app.post("/analyze")
def analyze_artists(data: ArtistInput):
    level = data.obscurity_level or ObscurityLevel.DEEP_CUT
    level_info = OBSCURITY_PROMPTS[level]
    
    base = ai_recommend(data.artists or [], level)
    tags = base.get("tags", [])
    recs = base.get("recommendations", [])
    
    enriched = enrich_recommendations(recs, level_info["max_followers"])
    
    return {
        "tags": tags,
        "recommendations": enriched,
        "obscurity_level": level,
        "max_followers": level_info["max_followers"],
        "description": level_info["description"]
    }
