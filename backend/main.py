from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os, json, requests, urllib.parse
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from enum import Enum
import secrets

load_dotenv()

# --- Configure Gemini ---
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = "models/gemini-2.5-flash"

# --- API Keys ---
LASTFM_KEY = os.getenv("LASTFM_API_KEY")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:3000/callback")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Obscurity Levels ---
class ObscurityLevel(str, Enum):
    ULTRA_DEEP = "ultra_deep"
    DEEP_CUT = "deep_cut"
    UNDERGROUND = "underground"
    EMERGING = "emerging"
    NICHE = "niche"

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
    spotify_token: Optional[str] = None
    spotify_hints: Optional[List[Dict[str, Any]]] = None


class SavePlaylistInput(BaseModel):
    token: str
    artist_ids: List[str]
    name: str

# --- Spotify Token Cache & User Tokens ---
_spotify_client_token = None
_user_tokens = {}  # Store user access tokens by session ID

def get_spotify_client_token():
    """Get client credentials token for app-level access"""
    global _spotify_client_token
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
            _spotify_client_token = r.json().get("access_token")
            return _spotify_client_token
    except Exception:
        pass
    return None

def get_spotify_followers(artist_name: str, user_token: Optional[str] = None) -> tuple[Optional[int], Optional[str], Optional[str], Optional[str]]:
    """
    Get follower count, Spotify URI, embed URL, and verified artist name from Spotify API
    Returns: (follower_count, spotify_uri, embed_url, verified_name)
    """
    token = user_token or _spotify_client_token or get_spotify_client_token()
    if not token:
        return None, None, None, None
    
    try:
        r = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": artist_name, "type": "artist", "limit": 5},  # Get top 5 for better matching
            timeout=8
        )
        
        if r.ok:
            data = r.json()
            artists = data.get("artists", {}).get("items", [])
            if artists:
                # Try to find exact or best match
                best_match = None
                exact_match = None
                
                for artist in artists:
                    artist_spotify_name = artist.get("name", "").lower()
                    search_name = artist_name.lower()
                    
                    # Exact match (case insensitive)
                    if artist_spotify_name == search_name:
                        exact_match = artist
                        break
                    
                    # Best match (contains or very similar)
                    if not best_match or artist_spotify_name.startswith(search_name):
                        best_match = artist
                
                # Use exact match if found, otherwise best match, otherwise first result
                selected_artist = exact_match or best_match or artists[0]
                
                followers = selected_artist.get("followers", {}).get("total", 0)
                artist_id = selected_artist.get("id")
                spotify_uri = selected_artist.get("uri")
                verified_name = selected_artist.get("name")
                embed_url = f"https://open.spotify.com/embed/artist/{artist_id}" if artist_id else None
                
                return followers, spotify_uri, embed_url, verified_name
    except Exception as e:
        print(f"Spotify API error for {artist_name}: {e}")
    return None, None, None, None

def get_spotify_top_tracks(artist_id: str, user_token: Optional[str] = None, market: str = "US") -> List[Dict[str, Any]]:
    """Get artist's top tracks from Spotify"""
    token = user_token or _spotify_client_token or get_spotify_client_token()
    if not token or not artist_id:
        return []
    
    try:
        r = requests.get(
            f"https://api.spotify.com/v1/artists/{artist_id}/top-tracks",
            headers={"Authorization": f"Bearer {token}"},
            params={"market": market},
            timeout=8
        )
        
        if r.ok:
            data = r.json()
            tracks = data.get("tracks", [])
            return [{
                "name": t.get("name"),
                "uri": t.get("uri"),
                "preview_url": t.get("preview_url"),
                "id": t.get("id"),
                "embed_url": f"https://open.spotify.com/embed/track/{t.get('id')}" if t.get('id') else None
            } for t in tracks[:3]]  # Top 3 tracks
    except Exception:
        pass
    return []

def get_user_top_artists(user_token: str, time_range: str = "medium_term", limit: int = 20) -> List[str]:
    """Get user's top artists from Spotify (requires user auth)"""
    if not user_token:
        return []
    
    try:
        r = requests.get(
            "https://api.spotify.com/v1/me/top/artists",
            headers={"Authorization": f"Bearer {user_token}"},
            params={"time_range": time_range, "limit": limit},
            timeout=8
        )
        
        if r.ok:
            data = r.json()
            return [artist.get("name") for artist in data.get("items", [])]
    except Exception:
        pass
    return []


def get_user_top_artists_details(user_token: str, time_range: str = "medium_term", limit: int = 20) -> List[Dict[str, Any]]:
    """Get detailed top artists payload from Spotify (name, id, genres)."""
    if not user_token:
        return []

    try:
        r = requests.get(
            "https://api.spotify.com/v1/me/top/artists",
            headers={"Authorization": f"Bearer {user_token}"},
            params={"time_range": time_range, "limit": limit},
            timeout=8
        )

        if r.ok:
            data = r.json()
            return [{
                "name": artist.get("name"),
                "id": artist.get("id"),
                "genres": artist.get("genres", [])[:3],
            } for artist in data.get("items", [])]
    except Exception:
        pass
    return []

def get_user_recent_tracks(user_token: str, limit: int = 20) -> List[str]:
    """Get user's recently played tracks' artists (requires user auth)"""
    if not user_token:
        return []
    
    try:
        r = requests.get(
            "https://api.spotify.com/v1/me/player/recently-played",
            headers={"Authorization": f"Bearer {user_token}"},
            params={"limit": limit},
            timeout=8
        )
        
        if r.ok:
            data = r.json()
            artists = []
            for item in data.get("items", []):
                track = item.get("track", {})
                for artist in track.get("artists", []):
                    if artist.get("name") not in artists:
                        artists.append(artist.get("name"))
            return artists[:20]
    except Exception:
        pass
    return []


def get_spotify_recommendations(
    seed_artist_ids: List[str],
    obscurity_level: ObscurityLevel,
    user_token: Optional[str] = None
) -> Dict[str, Any]:
    """Generate recommendations directly from Spotify's recommendation graph."""
    token = user_token or _spotify_client_token or get_spotify_client_token()
    if not token or not seed_artist_ids:
        return {"tags": [], "recommendations": []}

    popularity_ceiling = {
        ObscurityLevel.ULTRA_DEEP: 20,
        ObscurityLevel.DEEP_CUT: 30,
        ObscurityLevel.UNDERGROUND: 40,
        ObscurityLevel.EMERGING: 55,
        ObscurityLevel.NICHE: 70,
    }[obscurity_level]

    unique_ids = list(dict.fromkeys(seed_artist_ids))[:5]

    try:
        r = requests.get(
            "https://api.spotify.com/v1/recommendations",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "seed_artists": ",".join(unique_ids),
                "limit": 80,
                "max_popularity": popularity_ceiling,
                "min_popularity": 5,
            },
            timeout=10,
        )

        if not r.ok:
            return {"tags": [], "recommendations": []}

        track_items = r.json().get("tracks", [])
        artist_bucket: Dict[str, Dict[str, Any]] = {}

        for track in track_items:
            for artist in track.get("artists", []):
                aid = artist.get("id")
                name = artist.get("name")
                if not aid or not name:
                    continue
                if aid not in artist_bucket:
                    artist_bucket[aid] = {
                        "artist": name,
                        "spotify_id": aid,
                        "explanation": "Matched by Spotify's recommendation graph from your seed artists.",
                        "tags": [],
                    }

        tags = []
        for artist_id in unique_ids:
            detail_r = requests.get(
                f"https://api.spotify.com/v1/artists/{artist_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=8,
            )
            if detail_r.ok:
                tags.extend(detail_r.json().get("genres", [])[:2])

        return {
            "tags": list(dict.fromkeys(tags))[:8],
            "recommendations": list(artist_bucket.values())[:20],
        }
    except Exception as e:
        print(f"Spotify recommendation error: {e}")
        return {"tags": [], "recommendations": []}

def get_youtube_subscribers(artist_name: str) -> tuple[Optional[int], Optional[str]]:
    """
    Get subscriber count and channel URL from YouTube Data API
    Returns: (subscriber_count, channel_url)
    """
    if not YOUTUBE_API_KEY:
        return None, None
    
    try:
        search_r = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": f"{artist_name} official",
                "type": "channel",
                "maxResults": 1,
                "key": YOUTUBE_API_KEY
            },
            timeout=8
        )
        
        if not search_r.ok:
            return None, None
            
        search_data = search_r.json()
        items = search_data.get("items", [])
        
        if not items:
            return None, None
            
        channel_id = items[0].get("id", {}).get("channelId")
        
        if not channel_id:
            return None, None
        
        channel_url = f"https://www.youtube.com/channel/{channel_id}"
        
        channel_r = requests.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={
                "part": "statistics",
                "id": channel_id,
                "key": YOUTUBE_API_KEY
            },
            timeout=8
        )
        
        if channel_r.ok:
            channel_data = channel_r.json()
            items = channel_data.get("items", [])
            if items:
                stats = items[0].get("statistics", {})
                subs = stats.get("subscriberCount")
                if subs:
                    return int(subs), channel_url
        
        return None, channel_url
    except Exception:
        pass
    return None, None

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

def get_artist_followers(artist_name: str, user_token: Optional[str] = None) -> Dict[str, Any]:
    """
    Get follower/subscriber counts and URLs from multiple sources
    Returns dict with counts, URLs, and verified name from each source
    """
    spotify_followers, spotify_uri, spotify_embed, spotify_verified_name = get_spotify_followers(artist_name, user_token)
    youtube_subs, youtube_url = get_youtube_subscribers(artist_name)
    lastfm = get_lastfm_listeners(artist_name)
    
    return {
        "spotify": spotify_followers,
        "spotify_uri": spotify_uri,
        "spotify_embed": spotify_embed,
        "spotify_verified_name": spotify_verified_name,
        "youtube": youtube_subs,
        "youtube_url": youtube_url,
        "lastfm": lastfm
    }

def get_best_follower_count(counts: Dict[str, Any]) -> Optional[int]:
    """
    Choose the best follower count from available sources
    Priority: Spotify > YouTube > Last.fm
    """
    if counts.get("spotify"):
        return counts["spotify"]
    if counts.get("youtube"):
        return counts["youtube"]
    if counts.get("lastfm"):
        return counts["lastfm"]
    return None

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/spotify/auth-url")
def get_spotify_auth_url():
    """Generate Spotify authorization URL"""
    if not SPOTIFY_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Spotify client ID not configured")
    
    scope = "user-top-read user-read-recently-played playlist-modify-public playlist-modify-private"
    state = secrets.token_urlsafe(16)
    
    auth_url = (
        f"https://accounts.spotify.com/authorize?"
        f"client_id={SPOTIFY_CLIENT_ID}&"
        f"response_type=code&"
        f"redirect_uri={urllib.parse.quote(SPOTIFY_REDIRECT_URI)}&"
        f"scope={urllib.parse.quote(scope)}&"
        f"state={state}"
    )
    
    return {"auth_url": auth_url, "state": state}

@app.post("/spotify/token")
def exchange_spotify_code(code: str):
    """Exchange authorization code for access token"""
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Spotify credentials not configured")
    
    try:
        r = requests.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": SPOTIFY_REDIRECT_URI
            },
            auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET),
            timeout=10
        )
        
        if r.ok:
            token_data = r.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in")
            
            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": expires_in
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to exchange code")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/spotify/suggestions")
def get_spotify_suggestions(token: str):
    """Get artist suggestions based on user's Spotify listening history"""
    top_artists = get_user_top_artists_details(token, "short_term", 10)
    recent_artists = get_user_recent_tracks(token, 20)
    
    # Combine and deduplicate
    all_artists = []
    for artist in top_artists:
        if artist.get("name") not in [a.get("name") for a in all_artists if isinstance(a, dict)]:
            all_artists.append(artist)
    for artist in recent_artists:
        if artist not in [a.get("name") for a in all_artists if isinstance(a, dict)]:
            all_artists.append({"name": artist, "id": None, "genres": []})
    
    return {
        "suggestions": all_artists[:10],
        "top_artists": [a.get("name") for a in top_artists[:5]],
        "recent_artists": recent_artists[:5]
    }


@app.post("/spotify/save-playlist")
def save_spotify_playlist(data: SavePlaylistInput):
    """Create a Spotify playlist from recommended artist IDs."""
    token = data.token
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    me_r = requests.get("https://api.spotify.com/v1/me", headers=headers, timeout=8)
    if not me_r.ok:
        raise HTTPException(status_code=401, detail="Invalid Spotify token")

    user_id = me_r.json().get("id")
    if not user_id:
        raise HTTPException(status_code=500, detail="Could not resolve Spotify user")

    track_uris: List[str] = []
    for artist_id in list(dict.fromkeys(data.artist_ids))[:25]:
        top_r = requests.get(
            f"https://api.spotify.com/v1/artists/{artist_id}/top-tracks",
            headers=headers,
            params={"market": "US"},
            timeout=8,
        )
        if top_r.ok:
            tracks = top_r.json().get("tracks", [])
            if tracks:
                uri = tracks[0].get("uri")
                if uri and uri not in track_uris:
                    track_uris.append(uri)
        if len(track_uris) >= 50:
            break

    if not track_uris:
        raise HTTPException(status_code=400, detail="No playable tracks found for selected artists")

    create_r = requests.post(
        f"https://api.spotify.com/v1/users/{user_id}/playlists",
        headers=headers,
        json={
            "name": data.name[:100],
            "public": False,
            "description": "Generated by Uncover from your Spotify-driven discoveries",
        },
        timeout=8,
    )

    if not create_r.ok:
        raise HTTPException(status_code=400, detail="Failed to create playlist")

    playlist = create_r.json()
    playlist_id = playlist.get("id")
    if not playlist_id:
        raise HTTPException(status_code=500, detail="Playlist created but missing ID")

    add_r = requests.post(
        f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
        headers=headers,
        json={"uris": track_uris[:50]},
        timeout=8,
    )
    if not add_r.ok:
        raise HTTPException(status_code=400, detail="Playlist created but adding tracks failed")

    return {
        "playlist_url": playlist.get("external_urls", {}).get("spotify") or playlist.get("uri"),
        "tracks_added": len(track_uris[:50]),
    }

# ---------- Helpers ----------
def ai_recommend(artists: List[str], obscurity_level: ObscurityLevel) -> Dict[str, Any]:
    artist_list = ", ".join(artists)
    level_info = OBSCURITY_PROMPTS[obscurity_level]
    
    prompt = f"""
    The user is interested in these artists, genres, or vibes: {artist_list}.
    
    CRITICAL INSTRUCTIONS:
    - Recommend ONLY {level_info['prompt_modifier']}.
    - Maximum follower count target: {level_info['max_followers']:,} on Spotify
    - Artists must be REAL and VERIFIABLE on Spotify, Apple Music, or other major platforms
    - AVOID completely unknown/fictional artists
    - Use the artist's exact official name as it appears on Spotify
    
    1) Return 5–8 descriptive global tags (genres, moods, themes, style) for this specific taste.
    2) Recommend 10-12 {level_info['description']} that fit this specific vibe.
       - AVOID any mainstream or well-known artists
       - Focus on {level_info['prompt_modifier']}
       - Prioritize artists with very small followings
       - Artists should be real and verifiable
    3) For each artist, give one-sentence why it fits AND 3 specific tags for that artist.

    Respond as strict JSON:
    {{
      "tags": ["tag1", "..."],
      "recommendations": [
        {{"artist": "Exact Artist Name", "explanation": "one sentence", "tags": ["tag1", "tag2", "tag3"]}}
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

def enrich_recommendations(recs: List[Dict[str, Any]], max_followers: int, user_token: Optional[str] = None) -> List[Dict[str, Any]]:
    enriched = []
    skipped_artists = []  # Track artists that were filtered out
    
    for r in recs:
        name = r.get("artist", "")
        
        # Get follower/listener counts from all sources
        counts = get_artist_followers(name, user_token)
        follower_count = get_best_follower_count(counts)
        
        # Use Spotify verified name if available, otherwise use AI suggested name
        verified_name = counts.get("spotify_verified_name") or name
        
        # Skip if over the limit (with some logging)
        if follower_count and follower_count > max_followers:
            skipped_artists.append({
                "ai_name": name,
                "verified_name": verified_name,
                "followers": follower_count
            })
            print(f"Filtered out: {name} (verified as {verified_name}) with {follower_count:,} followers (max: {max_followers:,})")
            continue
        
        # Skip if artist not found on any platform
        if not follower_count and not counts.get("spotify_uri"):
            print(f"Warning: Could not verify artist '{name}' on any platform")
            continue
        
        # Get top tracks if we have Spotify data
        top_tracks = []
        if counts.get("spotify_uri"):
            artist_id = counts["spotify_uri"].split(":")[-1] if counts["spotify_uri"] else None
            if artist_id:
                top_tracks = get_spotify_top_tracks(artist_id, user_token)
        
        meta = enrich_with_itunes(verified_name)
        if not meta.get("image"):
            lf_img = fallback_lastfm_image(verified_name)
            if lf_img:
                meta["image"] = lf_img
        
        encoded_name = urllib.parse.quote_plus(verified_name)
        
        # Determine which link to use: Last.fm or YouTube
        if LASTFM_KEY:
            primary_url = f"https://www.last.fm/music/{encoded_name}"
            primary_url_label = "Last.fm"
        elif counts.get("youtube_url"):
            primary_url = counts["youtube_url"]
            primary_url_label = "YouTube"
        else:
            primary_url = f"https://www.youtube.com/results?search_query={encoded_name}"
            primary_url_label = "YouTube"

        enriched.append({
            "artist": verified_name,  # Use verified name from Spotify
            "ai_suggested_name": name,  # Keep original AI suggestion for reference
            "explanation": r.get("explanation", ""),
            "tags": r.get("tags", []),
            "image": meta.get("image"),
            "sampleUrl": meta.get("sampleUrl"),
            "sampleTrack": meta.get("sampleTrack"),
            "primaryUrl": primary_url,
            "primaryUrlLabel": primary_url_label,
            "youtubeUrl": counts.get("youtube_url"),
            "spotifyEmbed": counts.get("spotify_embed"),
            "spotifyUri": counts.get("spotify_uri"),
            "topTracks": top_tracks,
            "followers": follower_count,
            "followerSources": {
                "spotify": counts.get("spotify"),
                "youtube": counts.get("youtube"),
                "lastfm": counts.get("lastfm")
            },
            "obscurityScore": calculate_obscurity_score(follower_count) if follower_count else None,
            "verified": bool(counts.get("spotify_uri"))  # Flag if we found them on Spotify
        })
    
    # Sort by obscurity (fewer followers first)
    enriched.sort(key=lambda x: x.get("followers") or 0)
    
    # Log summary
    print(f"\n=== Filtering Summary ===")
    print(f"Total AI recommendations: {len(recs)}")
    print(f"Passed filter: {len(enriched)}")
    print(f"Filtered out (too popular): {len(skipped_artists)}")
    print(f"Returning top {min(5, len(enriched))} artists")
    
    return enriched[:5]

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
    
    seed_ids = [hint.get("id") for hint in (data.spotify_hints or []) if hint.get("id")]

    # Spotify-first: only call Gemini when Spotify recommendations are unavailable.
    base = get_spotify_recommendations(seed_ids, level, data.spotify_token) if seed_ids else {"tags": [], "recommendations": []}
    if not base.get("recommendations"):
        base = ai_recommend(data.artists or [], level)
    tags = base.get("tags", [])
    recs = base.get("recommendations", [])
    
    enriched = enrich_recommendations(recs, level_info["max_followers"], data.spotify_token)
    
    return {
        "tags": tags,
        "recommendations": enriched,
        "obscurity_level": level,
        "max_followers": level_info["max_followers"],
        "description": level_info["description"]
    }
