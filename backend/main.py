from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, requests, urllib.parse, time, secrets, threading, random, math
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from enum import Enum

load_dotenv()

LASTFM_KEY            = os.getenv("LASTFM_API_KEY")
SPOTIFY_CLIENT_ID     = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI  = os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:3000/callback")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class ObscurityLevel(str, Enum):
    ULTRA_DEEP  = "ultra_deep"
    DEEP_CUT    = "deep_cut"
    UNDERGROUND = "underground"
    EMERGING    = "emerging"
    NICHE       = "niche"

OBSCURITY_CONFIG = {
    ObscurityLevel.ULTRA_DEEP:  {"max_followers": 1_000,    "max_popularity": 15, "target_popularity": 8,  "max_lfm_listeners": 5_000,    "target_lfm_listeners": 2_000,    "description": "ultra-obscure bedroom/basement artists"},
    ObscurityLevel.DEEP_CUT:    {"max_followers": 10_000,   "max_popularity": 30, "target_popularity": 20, "max_lfm_listeners": 50_000,   "target_lfm_listeners": 30_000,   "description": "deep underground artists"},
    ObscurityLevel.UNDERGROUND: {"max_followers": 50_000,   "max_popularity": 45, "target_popularity": 35, "max_lfm_listeners": 200_000,  "target_lfm_listeners": 120_000,  "description": "underground/indie artists"},
    ObscurityLevel.EMERGING:    {"max_followers": 100_000,  "max_popularity": 58, "target_popularity": 50, "max_lfm_listeners": 500_000,  "target_lfm_listeners": 300_000,  "description": "emerging/indie artists"},
    ObscurityLevel.NICHE:       {"max_followers": 500_000,  "max_popularity": 72, "target_popularity": 62, "max_lfm_listeners": 2_000_000,"target_lfm_listeners": 1_000_000,"description": "niche/alternative artists"},
}

REGIONAL_TAG_KEYWORDS: Dict[str, str] = {
    "japanese": "Japanese", "j-pop": "Japanese", "j-rock": "Japanese",
    "city pop": "Japanese", "shibuya-kei": "Japanese", "visual kei": "Japanese",
    "anime": "Japanese", "jpop": "Japanese", "jrock": "Japanese",
    "korean": "Korean", "k-pop": "Korean", "k-indie": "Korean", "kpop": "Korean",
    "mandopop": "Chinese", "c-pop": "Chinese", "chinese": "Chinese",
    "cantopop": "Cantonese", "hong kong": "Cantonese",
    "french": "French", "chanson": "French", "french pop": "French",
    "german": "German", "deutschrock": "German",
    "spanish": "Spanish", "latin": "Spanish", "reggaeton": "Spanish",
    "flamenco": "Spanish", "latin pop": "Spanish",
    "portuguese": "Portuguese", "bossa nova": "Portuguese", "mpb": "Portuguese",
    "brazilian": "Portuguese",
    "italian": "Italian",
    "swedish": "Swedish", "nordic": "Swedish",
    "russian": "Russian",
    "arabic": "Arabic", "khaleeji": "Arabic",
    "turkish": "Turkish",
    "indian": "Indian", "bollywood": "Indian", "hindi": "Indian",
    "afrobeats": "African", "afropop": "African", "highlife": "African",
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

# ---------------------------------------------------------------------------
# Spotify auth
# ---------------------------------------------------------------------------
_client_token: Optional[str] = None
_client_token_expiry: float = 0.0
_client_token_lock = threading.Lock()

def get_token(user_token=None) -> Optional[str]:
    global _client_token, _client_token_expiry
    if user_token:
        return user_token
    with _client_token_lock:
        if _client_token and time.monotonic() < _client_token_expiry:
            return _client_token
        if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
            return None
        try:
            r = requests.post("https://accounts.spotify.com/api/token",
                data={"grant_type": "client_credentials"},
                auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), timeout=10)
            if r.ok:
                d = r.json()
                _client_token = d.get("access_token")
                _client_token_expiry = time.monotonic() + d.get("expires_in", 3600) - 60
                return _client_token
        except Exception as e:
            print(f"[token] error: {e}")
        return None

def refresh_client_token() -> Optional[str]:
    global _client_token, _client_token_expiry
    with _client_token_lock:
        _client_token = None
        _client_token_expiry = 0.0
    return get_token()

# ---------------------------------------------------------------------------
# Tag / language helpers
# ---------------------------------------------------------------------------
_TAG_BLOCKLIST = {
    "pop", "rock", "alternative", "indie", "electronic", "dance",
    "hip hop", "hip-hop", "rap", "r&b", "rnb", "soul", "metal",
    "country", "folk", "classical", "jazz", "blues", "punk",
    "new wave", "80s", "90s", "00s",
}

def _norm(s: str) -> str:
    return s.lower().strip()

def derive_search_tags(user_input: List[str], top_artists: List[str], top_genres: List[str]) -> List[str]:
    seen: Dict[str, None] = {}
    for g in top_genres:
        t = _norm(g)
        if t and t not in _TAG_BLOCKLIST:
            seen[t] = None
    if len(seen) < 4:
        for a in top_artists[:4]:
            t = _norm(a)
            if t not in seen:
                seen[t] = None
    if len(seen) < 3:
        for u in user_input:
            t = _norm(u)
            if t and t not in _TAG_BLOCKLIST:
                seen[t] = None
    tags = list(seen.keys())[:8]
    print(f"[derive_tags] {tags}")
    return tags

def detect_seed_language(top_artists: List[str], top_genres: List[str]) -> Optional[str]:
    for g in top_genres:
        gl = _norm(g)
        for kw, region in REGIONAL_TAG_KEYWORDS.items():
            if kw in gl:
                print(f"[language] '{region}' from Spotify genre '{g}'")
                return region
    # FIX: use cached _lfm_tags from verify_candidate results where possible;
    # only do extra Last.fm calls here as a fallback for seed artists
    if LASTFM_KEY:
        for artist in top_artists[:3]:
            for tag in lastfm_get_artist_tags(artist):
                tl = _norm(tag)
                for kw, region in REGIONAL_TAG_KEYWORDS.items():
                    if kw in tl:
                        print(f"[language] '{region}' from Last.fm tag '{tag}' on '{artist}'")
                        return region
    return None

def filter_by_language(candidates: List[Dict], region: str) -> List[Dict]:
    """
    FIX: Now uses cached _lfm_tags from verify_candidate instead of making
    extra Last.fm API calls per artist. Only falls back to a live call if the
    cached tag list is empty.
    """
    mb_areas = REGION_TO_MB_AREAS.get(region, [])
    keywords = [kw for kw, v in REGIONAL_TAG_KEYWORDS.items() if v == region]

    def matches(rec):
        area = rec.get("_mb_area", "")
        if area and mb_areas and any(a in area for a in mb_areas):
            return True
        # Use pre-fetched _lfm_tags from verify_candidate (no extra API call)
        cached_tags = rec.get("_lfm_tags", [])
        if cached_tags:
            lfm = " ".join(_norm(t) for t in cached_tags)
            return any(kw in lfm for kw in keywords)
        # Only fall back to a live Last.fm call if we have no cached tags at all
        if LASTFM_KEY:
            lfm = " ".join(_norm(t) for t in lastfm_get_artist_tags(rec["name"]))
            return any(kw in lfm for kw in keywords)
        return False

    kept = [r for r in candidates if matches(r)]
    print(f"[language] filter: {len(candidates)} checked -> {len(kept)} ({region} only)")
    return kept if len(kept) >= 2 else candidates

def build_explanation(artist_name: str, tags: List[str], seed_artists: List[str]) -> str:
    seed = seed_artists[0] if seed_artists else None
    tag_str = ", ".join(tags[:2]) if tags else "their own lane"
    if seed:
        templates = [
            f"Fans of {seed} tend to end up here — {tag_str}.",
            f"Similar territory to {seed}, but further off the map.",
            f"Same DNA as {seed}: {tag_str}.",
        ]
        return templates[len(artist_name) % len(templates)]
    templates = [
        f"Deep in the {tag_str} world.",
        f"One of the more interesting names in {tag_str}.",
    ]
    return templates[len(artist_name) % len(templates)]

# ---------------------------------------------------------------------------
# Last.fm
# ---------------------------------------------------------------------------
def lastfm_tag_artists(tag: str, limit: int = 50) -> List[str]:
    if not LASTFM_KEY: return []
    try:
        r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
            "method": "tag.gettopartists", "tag": tag,
            "api_key": LASTFM_KEY, "format": "json", "limit": limit,
        }, timeout=8)
        if r.ok:
            names = [a.get("name") for a in r.json().get("topartists", {}).get("artist", []) if a.get("name")]
            print(f"[lastfm] tag='{tag}' -> {len(names)} artists")
            return names
    except Exception as e:
        print(f"[lastfm] error for tag '{tag}': {e}")
    return []

def lastfm_similar_artists(artist_name: str, limit: int = 30) -> List[str]:
    if not LASTFM_KEY: return []
    try:
        r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
            "method": "artist.getsimilar", "artist": artist_name,
            "api_key": LASTFM_KEY, "format": "json", "limit": limit,
        }, timeout=8)
        if r.ok:
            names = [a.get("name") for a in r.json().get("similarartists", {}).get("artist", []) if a.get("name")]
            print(f"[lastfm] similar to '{artist_name}' -> {len(names)} artists")
            return names
    except Exception as e:
        print(f"[lastfm] error similar '{artist_name}': {e}")
    return []

def lastfm_get_artist_tags(artist_name: str) -> List[str]:
    if not LASTFM_KEY: return []
    try:
        r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
            "method": "artist.gettoptags", "artist": artist_name,
            "api_key": LASTFM_KEY, "format": "json",
        }, timeout=6)
        if r.ok:
            return [t["name"] for t in r.json().get("toptags", {}).get("tag", []) if t.get("name")][:10]
    except: pass
    return []

def lastfm_get_info(artist_name: str) -> Dict:
    if not LASTFM_KEY: return {}
    try:
        r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
            "method": "artist.getinfo", "artist": artist_name,
            "api_key": LASTFM_KEY, "format": "json",
        }, timeout=6)
        if r.ok:
            data = r.json().get("artist", {})
            listeners = data.get("stats", {}).get("listeners")
            tags = [t["name"] for t in data.get("tags", {}).get("tag", []) if t.get("name")][:5]
            return {
                "listeners": int(listeners) if listeners else None,
                "tags": tags,
            }
    except: pass
    return {}

# FIX: Helper to build Last.fm artist URL — used to populate lastfmUrl in results
def lastfm_artist_url(artist_name: str) -> str:
    encoded = urllib.parse.quote(artist_name.replace(" ", "+"))
    return f"https://www.last.fm/music/{encoded}"

# ---------------------------------------------------------------------------
# Spotify helpers
# ---------------------------------------------------------------------------
_spotify_request_lock = threading.Lock()
_spotify_pause_until: float = 0.0
_spotify_last_request: float = 0.0
_SPOTIFY_MIN_INTERVAL = 0.25

def _spotify_wait():
    global _spotify_last_request
    with _spotify_request_lock:
        now = time.monotonic()
        if now < _spotify_pause_until:
            wait = _spotify_pause_until - now
            print(f"[spotify] circuit breaker active, waiting {wait:.1f}s...")
            time.sleep(wait)
        since_last = time.monotonic() - _spotify_last_request
        if since_last < _SPOTIFY_MIN_INTERVAL:
            time.sleep(_SPOTIFY_MIN_INTERVAL - since_last + random.uniform(0, 0.05))
        _spotify_last_request = time.monotonic()

def _spotify_trigger_backoff(retry_after: int):
    global _spotify_pause_until
    safe_wait = min(retry_after, 60) if retry_after > 0 else 10
    resume_at = time.monotonic() + safe_wait
    with _spotify_request_lock:
        if resume_at > _spotify_pause_until:
            _spotify_pause_until = resume_at
    print(f"[spotify] 429 — circuit breaker set for {safe_wait}s")

def spotify_find_artist(name: str, token: str) -> Optional[Dict]:
    def _search(t):
        _spotify_wait()
        return requests.get("https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {t}"},
            params={"q": f'artist:"{name}"', "type": "artist", "limit": 5},
            timeout=8)
    try:
        r = _search(token)
        if r.status_code == 401:
            fresh = refresh_client_token()
            if fresh: r = _search(fresh)
        if r.status_code == 429:
            _spotify_trigger_backoff(int(r.headers.get("Retry-After", 10)))
            r = _search(token)
        if r.ok:
            for item in r.json().get("artists", {}).get("items", []):
                if item.get("name", "").lower() == name.lower():
                    return item
        elif r.status_code not in (404,):
            print(f"[spotify_find] {r.status_code} for '{name}'")
    except Exception as e:
        print(f"[spotify_find] error for '{name}': {e}")
    return None

def get_top_tracks(artist_id: str, token: str, market: str = "US") -> List[Dict]:
    try:
        r = requests.get(f"https://api.spotify.com/v1/artists/{artist_id}/top-tracks",
            headers={"Authorization": f"Bearer {token}"},
            params={"market": market}, timeout=8)
        if r.ok:
            return [{"name": t.get("name"), "uri": t.get("uri"), "id": t.get("id"),
                     "preview_url": t.get("preview_url"),
                     "embed_url": f"https://open.spotify.com/embed/track/{t['id']}" if t.get("id") else None}
                    for t in r.json().get("tracks", [])[:3]]
    except: pass
    return []

def get_itunes_meta(name: str) -> Dict:
    try:
        r = requests.get("https://itunes.apple.com/search",
            params={"term": name, "entity": "musicTrack", "limit": 1}, timeout=6)
        if r.ok and r.json().get("resultCount", 0) > 0:
            item = r.json()["results"][0]
            return {
                "sampleUrl":   item.get("previewUrl"),
                "sampleTrack": item.get("trackName"),
                "image":       (item.get("artworkUrl100") or "").replace("100x100bb", "400x400bb") or None,
            }
    except: pass
    return {"sampleUrl": None, "sampleTrack": None, "image": None}

REGION_TO_MB_AREAS = {
    "Japanese":   ["japan", "tokyo", "osaka"],
    "Korean":     ["south korea", "korea", "seoul"],
    "Chinese":    ["china", "beijing", "shanghai"],
    "Cantonese":  ["hong kong"],
    "French":     ["france", "paris"],
    "German":     ["germany", "berlin"],
    "Spanish":    ["spain", "madrid", "mexico"],
    "Portuguese": ["brazil", "portugal"],
    "Italian":    ["italy", "rome"],
    "Swedish":    ["sweden", "stockholm"],
    "Russian":    ["russia", "moscow"],
    "Arabic":     ["egypt", "saudi arabia", "lebanon", "uae"],
    "Turkish":    ["turkey", "istanbul"],
    "Indian":     ["india", "mumbai", "delhi"],
    "African":    ["nigeria", "ghana", "kenya", "south africa"],
}

def obscurity_score(lfm_listeners: Optional[int], target: int, max_val: int,
                    popularity: Optional[int] = None, target_pop: int = 20, max_pop: int = 30) -> Optional[int]:
    def _bell(value: int, tgt: int, ceiling: int) -> int:
        if value > ceiling: return 0
        ratio     = value / ceiling if ceiling > 0 else 0
        tgt_ratio = tgt   / ceiling if ceiling > 0 else 0.7
        return round(math.exp(-((ratio - tgt_ratio) / 0.3) ** 2) * 100)

    lfm_score = _bell(lfm_listeners, target, max_val) if lfm_listeners is not None else None
    pop_score = _bell(popularity, target_pop, max_pop) if popularity is not None else None

    if lfm_score is not None and pop_score is not None:
        return min(lfm_score, pop_score)
    return lfm_score if lfm_score is not None else pop_score

# ---------------------------------------------------------------------------
# Parallel helpers
# ---------------------------------------------------------------------------
def _names_match(a: str, b: str) -> bool:
    import re
    def clean(s):
        return re.sub(r"[^a-z0-9]", "", s.lower())
    ca, cb = clean(a), clean(b)
    return ca == cb or ca in cb or cb in ca

def verify_candidate(name: str, _token_unused: Optional[str] = None) -> Dict:
    """Score candidate using Last.fm only. Single API call per artist."""
    listeners, tags, image = None, [], None

    if LASTFM_KEY:
        try:
            r = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "artist.getinfo", "artist": name,
                "api_key": LASTFM_KEY, "format": "json",
            }, timeout=6)
            if r.ok:
                data = r.json().get("artist", {})
                raw_listeners = data.get("stats", {}).get("listeners")
                try:
                    listeners = int(raw_listeners) if raw_listeners is not None else None
                except (ValueError, TypeError):
                    listeners = None
                tags = [t["name"] for t in data.get("tags", {}).get("tag", []) if t.get("name")][:5]
                # FIX: filter out the Last.fm placeholder image hash
                LASTFM_PLACEHOLDER = "2a96cbd8b46e442f"
                for img in reversed(data.get("image", [])):
                    url = img.get("#text", "")
                    if url and LASTFM_PLACEHOLDER not in url:
                        image = url
                        break
                print(f"[verify] '{name}' listeners={listeners}")
        except Exception as e:
            print(f"[verify] error for '{name}': {e}")

    return {
        "name":          name,
        "spotify_id":    None,
        "spotify_uri":   None,
        "spotify_url":   None,
        "spotify_embed": None,
        "tags":          tags[:3],
        "followers":     None,
        "lfm_listeners": listeners,
        "popularity":    None,
        "spotify_image": image,
        "_lfm_tags":     tags,   # cached — used by filter_by_language to avoid extra calls
        "_mb_area":      "",
        "_mb_tags":      [],
    }

def enrich_artist(rec: Dict, token: Optional[str], search_tags: List[str],
                  seed_artists: List[str], market: str = "US",
                  cfg: Optional[Dict] = None) -> Optional[Dict]:
    """
    Enrich a verified candidate with Spotify data, then emit a full result dict.

    FIX — two critical changes:
    1. Always returns a result (using Last.fm data as fallback) instead of
       returning None when Spotify lookup fails. This prevents the candidate
       pool from being silently emptied by Spotify misses.
    2. Populates lastfmUrl and lastfmVerified so the frontend can render the
       Last.fm link correctly (was missing entirely in the original).
    """
    name = rec["name"]
    cfg  = cfg or {}

    max_followers  = cfg.get("max_followers",  10_000)
    max_popularity = cfg.get("max_popularity", 30)

    lfm_tags      = rec.get("_lfm_tags", [])
    lfm_listeners = rec.get("lfm_listeners")
    target_lfm    = cfg.get("target_lfm_listeners", 30_000)
    max_lfm       = cfg.get("max_lfm_listeners",    50_000)
    target_pop    = cfg.get("target_popularity",    20)

    # FIX: build Last.fm URL + verified flag regardless of Spotify status
    lfm_url      = lastfm_artist_url(name)
    lfm_verified = lfm_listeners is not None  # True when Last.fm has a real listener count

    # --- Spotify lookup -------------------------------------------------------
    sp = spotify_find_artist(name, token) if token else None
    if sp and not _names_match(name, sp.get("name", "")):
        print(f"[enrich] name mismatch: '{name}' vs '{sp.get('name')}' — discarding Spotify data")
        sp = None

    if sp:
        # --- HARD FOLLOWER / POPULARITY GATE ----------------------------------
        followers_total = (sp.get("followers") or {}).get("total") or 0
        popularity      = sp.get("popularity") or 0

        if followers_total > max_followers:
            print(f"[filter] '{name}' DROPPED — {followers_total:,} followers > max {max_followers:,}")
            return None

        if popularity > max_popularity:
            print(f"[filter] '{name}' DROPPED — popularity {popularity} > max {max_popularity}")
            return None

        aid      = sp.get("id")
        sp_image = (sp.get("images") or [{}])[0].get("url")
        image    = sp_image or rec.get("spotify_image")
        tracks   = get_top_tracks(aid, token, market) if aid and token else []
        tags     = (sp.get("genres", [])[:3] or lfm_tags or search_tags[:2])

        print(f"[enrich] '{name}' ✓ Spotify followers={followers_total:,} popularity={popularity} lfm={lfm_listeners}")

        return {
            "artist":          name,
            "explanation":     build_explanation(name, tags, seed_artists),
            "tags":            tags,
            "image":           image,
            "sampleUrl":       None,  # filled by iTunes below
            "sampleTrack":     None,
            "primaryUrl":      f"https://open.spotify.com/artist/{aid}",
            "primaryUrlLabel": "Spotify",
            "spotifyUrl":      f"https://open.spotify.com/artist/{aid}",
            "spotifyEmbed":    f"https://open.spotify.com/embed/artist/{aid}",
            "spotifyUri":      sp.get("uri"),
            "spotifyId":       aid,
            "topTracks":       tracks,
            "followers":       followers_total,
            "lfmListeners":    lfm_listeners,
            "lfmUrl":          lfm_url,       # FIX: was missing
            "lastfmUrl":       lfm_url,       # FIX: frontend key
            "lastfmVerified":  lfm_verified,  # FIX: was missing
            "popularity":      popularity,
            "obscurityScore":  obscurity_score(lfm_listeners, target_lfm, max_lfm,
                                               popularity, target_pop, max_popularity),
            "verified":        True,
            "spotifyVerified": True,
            **_get_itunes(name),
        }
    else:
        # FIX: Fallback path — artist not on Spotify (or no token). Return a
        # Last.fm-only result rather than None so the pool doesn't collapse.
        # Still apply the lfm_listeners cap so off-radar artists don't sneak
        # through the obscurity filter.
        if lfm_listeners is not None and lfm_listeners > max_lfm:
            print(f"[filter] '{name}' DROPPED (lfm-only) — {lfm_listeners:,} listeners > max {max_lfm:,}")
            return None

        tags  = lfm_tags or search_tags[:2]
        image = rec.get("spotify_image")  # Last.fm image saved in verify_candidate
        print(f"[enrich] '{name}' ✓ Last.fm-only lfm={lfm_listeners}")

        return {
            "artist":          name,
            "explanation":     build_explanation(name, tags, seed_artists),
            "tags":            tags,
            "image":           image,
            "primaryUrl":      lfm_url,
            "primaryUrlLabel": "Last.fm",
            "spotifyUrl":      None,
            "spotifyEmbed":    None,
            "spotifyUri":      None,
            "spotifyId":       None,
            "topTracks":       [],
            "followers":       None,
            "lfmListeners":    lfm_listeners,
            "lfmUrl":          lfm_url,       # FIX: was missing
            "lastfmUrl":       lfm_url,       # FIX: frontend key
            "lastfmVerified":  lfm_verified,  # FIX: was missing
            "popularity":      None,
            "obscurityScore":  obscurity_score(lfm_listeners, target_lfm, max_lfm),
            "verified":        lfm_verified,
            "spotifyVerified": False,
            **_get_itunes(name),
        }

def _get_itunes(name: str) -> Dict:
    """Thin wrapper so both code paths above can include iTunes data cleanly."""
    meta = get_itunes_meta(name)
    return {"sampleUrl": meta.get("sampleUrl"), "sampleTrack": meta.get("sampleTrack"),
            "image_itunes": meta.get("image")}

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/analyze")
def analyze_artists(data: ArtistInput):
    level   = data.obscurity_level or ObscurityLevel.DEEP_CUT
    cfg     = OBSCURITY_CONFIG[level]
    max_fol = cfg["max_followers"]

    print(f"\n=== /analyze level={level} max_followers={max_fol} ===")

    token = get_token(data.spotify_token)

    user_market = "US"
    if data.spotify_token:
        try:
            me_r = requests.get("https://api.spotify.com/v1/me",
                headers={"Authorization": f"Bearer {data.spotify_token}"}, timeout=6)
            if me_r.ok:
                user_market = me_r.json().get("country", "US")
                print(f"[market] user country={user_market}")
        except Exception as e:
            print(f"[market] error: {e}")

    input_artists = [a.strip() for a in (data.artists or []) if a and a.strip()]
    top_artists: List[str] = list(dict.fromkeys(
        input_artists + [h["name"] for h in (data.spotify_hints or []) if h.get("name")]
    ))
    top_genres: List[str] = []

    for hint in (data.spotify_hints or []):
        top_genres.extend((hint.get("genres") or [])[:2])

    if data.spotify_token and not input_artists:
        def fetch_range(time_range):
            r = requests.get("https://api.spotify.com/v1/me/top/artists",
                headers={"Authorization": f"Bearer {data.spotify_token}"},
                params={"time_range": time_range, "limit": 10}, timeout=8)
            return r.json().get("items", []) if r.ok else []
        try:
            with ThreadPoolExecutor(max_workers=2) as ex:
                for items in ex.map(fetch_range, ["medium_term", "short_term"]):
                    for a in items:
                        n = a.get("name")
                        if n and n not in top_artists:
                            top_artists.append(n)
                        top_genres.extend(a.get("genres", [])[:2])
        except Exception as e:
            print(f"[top_artists] error: {e}")

    top_genres  = list(dict.fromkeys(top_genres))

    # FIX: treat each input term as both a potential artist name AND a genre/tag.
    # Previously, non-artist genre queries (e.g. "Japanese Jazz") were only used
    # as artist lookup seeds and then found nothing via lastfm_similar_artists.
    # Now we always also seed from lastfm_tag_artists using the raw input terms.
    search_tags = derive_search_tags(data.artists or [], top_artists[:8], top_genres[:8])
    if len(search_tags) < 2:
        for a in (data.artists or []):
            t = _norm(a)
            if t and t not in search_tags:
                search_tags.append(t)
        search_tags = search_tags[:8]

    candidate_names: Dict[str, None] = {}
    discovery_seeds = top_artists[:5]
    seed_lower = {n.lower() for n in discovery_seeds}

    # Similar-artist seeds (works well when input is artist names)
    with ThreadPoolExecutor(max_workers=5) as ex:
        for names in ex.map(lambda a: lastfm_similar_artists(a, 50), discovery_seeds):
            for name in names:
                if name.lower() not in seed_lower:
                    candidate_names[name] = None

    # FIX: ALWAYS also seed from tags — this is the primary path when the user
    # typed a genre/vibe instead of an artist name (e.g. "Japanese Jazz",
    # "Darkwave", "Ethiopian Funk"). Previously tag seeding only ran as a
    # fallback when candidate_names had < 15 entries.
    all_tag_seeds = list(dict.fromkeys(search_tags + [_norm(a) for a in (data.artists or [])]))
    with ThreadPoolExecutor(max_workers=5) as ex:
        for names in ex.map(lambda t: lastfm_tag_artists(t, 40), all_tag_seeds[:6]):
            for name in names:
                if name.lower() not in seed_lower:
                    candidate_names[name] = None

    if not candidate_names:
        return {"tags": search_tags, "recommendations": [],
                "obscurity_level": level, "max_followers": max_fol,
                "description": cfg["description"]}

    seed_language = detect_seed_language(discovery_seeds, top_genres[:10]) if discovery_seeds else None

    names_list = list(candidate_names.keys())
    front = names_list[:20]
    back  = names_list[20:]
    random.shuffle(back)
    names_list = (front + back)[:80]

    print(f"[3/6] fetching Last.fm info for {len(names_list)} candidates...")
    verified: List[Dict] = []

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(verify_candidate, name): name for name in names_list}
        for future in as_completed(futures):
            try:
                verified.append(future.result())
            except Exception as e:
                print(f"[verify] error: {e}")

    if seed_language:
        verified = filter_by_language(verified, seed_language)

    max_lfm    = cfg["max_lfm_listeners"]
    target_lfm = cfg["target_lfm_listeners"]

    in_range = [
        x for x in verified
        if x.get("lfm_listeners") is not None and 0 < x["lfm_listeners"] <= max_lfm
    ]
    in_range.sort(key=lambda x: abs(x["lfm_listeners"] - target_lfm))

    if len(in_range) < 5:
        unknown = [x for x in verified if x.get("lfm_listeners") is None and x not in in_range]
        random.shuffle(unknown)
        in_range += unknown

    selected_for_enrich = in_range[:12]
    print(f"[4/6] {len(in_range)} in listener range, enriching top {len(selected_for_enrich)}...")

    if not selected_for_enrich:
        return {"tags": search_tags, "recommendations": [],
                "obscurity_level": level, "max_followers": max_fol,
                "description": cfg["description"]}

    seed_artists = data.artists or top_artists[:3]
    enriched_map: Dict[str, Dict] = {}

    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {
            ex.submit(enrich_artist, rec, token, search_tags, seed_artists, user_market, cfg): rec["name"]
            for rec in selected_for_enrich
        }
        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
                enriched_map[name] = result
            except Exception as e:
                print(f"[enrich] {name}: {e}")

    # FIX: image fallback — prefer iTunes image when Spotify/Last.fm has none
    for rec in enriched_map.values():
        if rec and not rec.get("image") and rec.get("image_itunes"):
            rec["image"] = rec["image_itunes"]

    enriched = sorted(
        [v for v in (enriched_map.get(r["name"]) for r in selected_for_enrich) if v is not None],
        key=lambda x: x.get("obscurityScore") or 0,
        reverse=True
    )[:5]

    passed_spotify = len([v for v in enriched_map.values() if v is not None])
    dropped_count  = len(selected_for_enrich) - passed_spotify

    print(f"[5/6] done — {len(enriched)} recommendations ({dropped_count} dropped by follower/popularity gate)")

    return {
        "tags":            search_tags,
        "recommendations": enriched,
        "obscurity_level": level,
        "max_followers":   max_fol,
        "description":     cfg["description"],
        "dropped_count":   dropped_count,
    }

@app.get("/spotify/auth-url")
def get_spotify_auth_url():
    if not SPOTIFY_CLIENT_ID:
        return {"error": "No client ID"}
    scope = "user-top-read user-read-recently-played playlist-modify-public playlist-modify-private"
    state = secrets.token_urlsafe(16)
    url = (f"https://accounts.spotify.com/authorize?client_id={SPOTIFY_CLIENT_ID}"
           f"&response_type=code&redirect_uri={urllib.parse.quote(SPOTIFY_REDIRECT_URI)}"
           f"&scope={urllib.parse.quote(scope)}&state={state}")
    return {"auth_url": url, "state": state}

@app.post("/spotify/token")
def exchange_spotify_code(code: str):
    r = requests.post("https://accounts.spotify.com/api/token",
        data={"grant_type": "authorization_code", "code": code, "redirect_uri": SPOTIFY_REDIRECT_URI},
        auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), timeout=10)
    if r.ok:
        d = r.json()
        return {"access_token": d.get("access_token"), "refresh_token": d.get("refresh_token"),
                "expires_in": d.get("expires_in")}
    return {"error": "failed"}

@app.post("/spotify/refresh")
def refresh_spotify_token(refresh_token: str):
    r = requests.post("https://accounts.spotify.com/api/token",
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), timeout=10)
    if r.ok:
        d = r.json()
        return {"access_token": d.get("access_token"), "expires_in": d.get("expires_in")}
    return {"error": "failed to refresh token"}

@app.get("/spotify/suggestions")
def get_spotify_suggestions(token: str):
    hdrs = {"Authorization": f"Bearer {token}"}
    top, recent = [], []
    try:
        r = requests.get("https://api.spotify.com/v1/me/top/artists", headers=hdrs,
            params={"time_range": "short_term", "limit": 10}, timeout=8)
        if r.ok:
            top = [{"name": a.get("name"), "id": a.get("id"), "genres": a.get("genres", [])[:3]}
                   for a in r.json().get("items", [])]
    except: pass
    try:
        r = requests.get("https://api.spotify.com/v1/me/player/recently-played",
            headers=hdrs, params={"limit": 20}, timeout=8)
        if r.ok:
            seen = set()
            for item in r.json().get("items", []):
                for a in item.get("track", {}).get("artists", []):
                    n = a.get("name")
                    if n and n not in seen:
                        seen.add(n)
                        recent.append(n)
    except: pass
    top_names = {a["name"] for a in top}
    combined  = list(top) + [{"name": n, "id": None, "genres": []} for n in recent if n not in top_names]
    return {"suggestions": combined[:10],
            "top_artists": [a["name"] for a in top[:5]],
            "recent_artists": recent[:5]}

@app.post("/spotify/save-playlist")
def save_spotify_playlist(data: SavePlaylistInput):
    hdrs = {"Authorization": f"Bearer {data.token}", "Content-Type": "application/json"}
    me   = requests.get("https://api.spotify.com/v1/me", headers=hdrs, timeout=8)
    if not me.ok:
        return {"error": "invalid token"}
    me_data = me.json()
    user_id = me_data.get("id")
    market  = me_data.get("country", "US")

    uris       = []
    valid_ids  = [aid for aid in list(dict.fromkeys(data.artist_ids))[:25] if aid]

    def fetch_track_uri(aid):
        try:
            r = requests.get(f"https://api.spotify.com/v1/artists/{aid}/top-tracks",
                headers=hdrs, params={"market": market}, timeout=8)
            if r.ok:
                tracks = r.json().get("tracks", [])
                if tracks:
                    return tracks[0].get("uri")
        except: pass
        return None

    with ThreadPoolExecutor(max_workers=8) as ex:
        for uri in ex.map(fetch_track_uri, valid_ids):
            if uri and uri not in uris:
                uris.append(uri)
            if len(uris) >= 50:
                break

    if not uris:
        return {"error": "no tracks found — artists may not have tracks available in your region"}

    c = requests.post(f"https://api.spotify.com/v1/users/{user_id}/playlists", headers=hdrs,
        json={"name": data.name[:100], "public": False, "description": "Generated by Uncover"}, timeout=8)
    if not c.ok:
        return {"error": "failed to create playlist"}
    pid   = c.json().get("id")
    add_r = requests.post(f"https://api.spotify.com/v1/playlists/{pid}/tracks",
        headers=hdrs, json={"uris": uris[:50]}, timeout=8)
    return {"playlist_url": c.json().get("external_urls", {}).get("spotify"),
            "tracks_added": len(uris)}
