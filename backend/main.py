from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, requests, urllib.parse, time, secrets
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
    ObscurityLevel.ULTRA_DEEP:  {"max_followers": 1000,   "description": "ultra-obscure bedroom/basement artists"},
    ObscurityLevel.DEEP_CUT:    {"max_followers": 10000,  "description": "deep underground artists"},
    ObscurityLevel.UNDERGROUND: {"max_followers": 50000,  "description": "underground/indie artists"},
    ObscurityLevel.EMERGING:    {"max_followers": 100000, "description": "emerging/indie artists"},
    ObscurityLevel.NICHE:       {"max_followers": 500000, "description": "niche/alternative artists"},
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

def get_token(user_token=None) -> Optional[str]:
    global _client_token
    if user_token: return user_token
    if _client_token: return _client_token
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET: return None
    try:
        r = requests.post("https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), timeout=10)
        if r.ok:
            _client_token = r.json().get("access_token")
            return _client_token
    except: pass
    return None

def refresh_client_token() -> Optional[str]:
    global _client_token
    _client_token = None
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
    keywords = [kw for kw, v in REGIONAL_TAG_KEYWORDS.items() if v == region]
    if not keywords or not LASTFM_KEY:
        return candidates

    def check(rec):
        combined = " ".join(_norm(t) for t in lastfm_get_artist_tags(rec["name"]))
        return rec if any(kw in combined for kw in keywords) else None

    kept = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for result in ex.map(check, candidates):
            if result:
                kept.append(result)

    print(f"[language] filter: {len(candidates)} -> {len(kept)} ({region} only)")
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
    """Returns listeners + tags. Last.fm image API is deprecated — not used."""
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

# ---------------------------------------------------------------------------
# Spotify
# ---------------------------------------------------------------------------
def spotify_find_artist(name: str, token: str) -> Optional[Dict]:
    def _search(t):
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
            time.sleep(int(r.headers.get("Retry-After", 2)))
            r = _search(token)
        if r.ok:
            for item in r.json().get("artists", {}).get("items", []):
                if item.get("name", "").lower() == name.lower():
                    return item
    except Exception as e:
        print(f"[spotify_find] error for '{name}': {e}")
    return None

def get_top_tracks(artist_id: str, token: str) -> List[Dict]:
    try:
        r = requests.get(f"https://api.spotify.com/v1/artists/{artist_id}/top-tracks",
            headers={"Authorization": f"Bearer {token}"},
            params={"market": "US"}, timeout=8)
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

def obscurity_score(followers):
    if followers is None: return None
    if followers < 100:    return 100
    if followers < 1000:   return 95
    if followers < 10000:  return 85
    if followers < 50000:  return 70
    if followers < 100000: return 50
    if followers < 500000: return 30
    return 10

# ---------------------------------------------------------------------------
# Parallel helpers
# ---------------------------------------------------------------------------
def verify_candidate(name: str, token: Optional[str]) -> Dict:
    """Look up one candidate on Spotify + Last.fm. Runs concurrently."""
    sp = spotify_find_artist(name, token) if token else None
    followers = sp.get("followers", {}).get("total") if sp else None

    lfm_info = {}
    if followers is None:
        lfm_info = lastfm_get_info(name)
        listeners = lfm_info.get("listeners")
        followers = listeners // 8 if listeners else None

    # Spotify images array is sorted largest first
    spotify_images = sp.get("images", []) if sp else []
    spotify_image = spotify_images[0].get("url") if spotify_images else None

    return {
        "name":          name,
        "spotify_id":    sp.get("id") if sp else None,
        "spotify_uri":   sp.get("uri") if sp else None,
        "spotify_embed": f"https://open.spotify.com/embed/artist/{sp['id']}" if sp and sp.get("id") else None,
        "tags":          (sp.get("genres", []) if sp else [])[:3],
        "followers":     followers,
        "popularity":    sp.get("popularity") or 0 if sp else 0,
        "spotify_image": spotify_image,
        "_lfm_info":     lfm_info,
    }

def check_presence(rec: Dict) -> Optional[Dict]:
    """
    Returns rec if the artist has Spotify OR iTunes presence, else None.
    Caches iTunes meta on rec to avoid fetching it twice.
    """
    if rec.get("spotify_id"):
        rec["_itunes_meta"] = None  # fetched fresh in enrich if needed
        return rec

    # No Spotify — check iTunes
    meta = get_itunes_meta(rec["name"])
    if meta.get("sampleUrl") or meta.get("image"):
        rec["_itunes_meta"] = meta
        return rec

    return None  # no presence anywhere — skip

def enrich_artist(rec: Dict, token: Optional[str], search_tags: List[str], seed_artists: List[str]) -> Dict:
    """Fetch tracks + full metadata for one artist. Runs concurrently."""
    name = rec["name"]
    aid  = rec["spotify_id"]

    tracks = get_top_tracks(aid, token) if aid and token else []

    # Use cached iTunes meta from presence check if available
    meta = rec.get("_itunes_meta") or get_itunes_meta(name)

    lfm_info = rec.get("_lfm_info") or lastfm_get_info(name)

    # Image priority: Spotify (real photos) > iTunes artwork
    # Last.fm image API is deprecated — not used
    image = rec.get("spotify_image") or (meta.get("image") if meta else None)

    tags = rec.get("tags") or lfm_info.get("tags") or search_tags[:2]
    explanation = build_explanation(name, tags, seed_artists)

    enc   = urllib.parse.quote_plus(name)
    p_url = f"https://www.last.fm/music/{enc}" if LASTFM_KEY else (
            f"https://open.spotify.com/artist/{aid}" if aid else
            f"https://www.youtube.com/results?search_query={enc}")
    p_lbl = "Last.fm" if LASTFM_KEY else "Spotify" if aid else "YouTube"

    return {
        "artist":          name,
        "explanation":     explanation,
        "tags":            tags,
        "image":           image,
        "sampleUrl":       meta.get("sampleUrl") if meta else None,
        "sampleTrack":     meta.get("sampleTrack") if meta else None,
        "primaryUrl":      p_url,
        "primaryUrlLabel": p_lbl,
        "spotifyEmbed":    rec.get("spotify_embed"),
        "spotifyUri":      rec.get("spotify_uri"),
        "topTracks":       tracks,
        "followers":       rec.get("followers"),
        "followerSources": {"spotify": rec.get("followers")},
        "obscurityScore":  obscurity_score(rec.get("followers")),
        "verified":        True,
        "spotifyVerified": aid is not None,
    }

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
    print(f"token={'yes' if token else 'NO'}")

    # --- Step 1: seed artists + optional Spotify personalization ---
    input_artists = [a.strip() for a in (data.artists or []) if a and a.strip()]
    top_artists: List[str] = list(dict.fromkeys(input_artists + [h["name"] for h in (data.spotify_hints or []) if h.get("name")]))
    top_genres:  List[str] = []

    for hint in (data.spotify_hints or []):
        top_genres.extend((hint.get("genres") or [])[:2])

    # If the user gave explicit artists, keep discovery anchored to that input.
    # Only pull account-wide top artists when there is no direct input.
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

    top_genres = list(dict.fromkeys(top_genres))
    print(f"seed_artists={top_artists[:5]} top_genres={top_genres[:5]}")

    # --- Step 2: derive search tags ---
    search_tags = derive_search_tags(data.artists or [], top_artists[:8], top_genres[:8])
    if not search_tags and not top_artists:
        search_tags = [_norm(a) for a in (data.artists or [])]
    print(f"search_tags={search_tags}")

    # --- Step 3: discover candidates via Last.fm (parallel) ---
    candidate_names: Dict[str, None] = {}
    discovery_seeds = top_artists[:5]
    seed_lower = {n.lower() for n in discovery_seeds}

    with ThreadPoolExecutor(max_workers=5) as ex:
        for names in ex.map(lambda a: lastfm_similar_artists(a, 50), discovery_seeds):
            for name in names:
                if name.lower() not in seed_lower:
                    candidate_names[name] = None

    print(f"[discovery] {len(candidate_names)} from similar-artist graph")

    if len(candidate_names) < 15:
        print("[discovery] sparse graph, supplementing with tag search")
        with ThreadPoolExecutor(max_workers=4) as ex:
            for names in ex.map(lambda t: lastfm_tag_artists(t, 30), search_tags[:4]):
                for name in names:
                    if name.lower() not in seed_lower:
                        candidate_names[name] = None

    print(f"[discovery] {len(candidate_names)} total candidates")

    if not candidate_names:
        return {"tags": search_tags, "recommendations": [],
                "obscurity_level": level, "max_followers": max_fol, "description": cfg["description"]}

    # --- Step 3b: language detection ---
    seed_language = detect_seed_language(discovery_seeds, top_genres[:10]) if discovery_seeds else None

    # --- Step 4: parallel candidate verification ---
    names_list = list(candidate_names.keys())[:60]
    verified: List[Dict] = []

    with ThreadPoolExecutor(max_workers=12) as ex:
        futures = {ex.submit(verify_candidate, name, token): name for name in names_list}
        for future in as_completed(futures):
            try:
                verified.append(future.result())
            except Exception as e:
                print(f"[verify] error: {e}")
            if len(verified) >= 40:
                for f in futures:
                    f.cancel()
                break

    # --- Language filter ---
    if seed_language:
        verified = filter_by_language(verified, seed_language)

    verified.sort(key=lambda x: x["followers"] if x["followers"] is not None else max_fol)

    selected = [x for x in verified if x["followers"] is not None and x["followers"] <= max_fol]
    if len(selected) < 3:
        selected += [x for x in verified if x not in selected]

    print(f"[filter] {len(selected)} artists within follower cap")

    # --- Step 5: presence filter — drop anyone with no Spotify AND no iTunes ---
    # Check 12 so we still have 5 after filtering
    with ThreadPoolExecutor(max_workers=10) as ex:
        presence_results = list(ex.map(check_presence, selected[:12]))

    selected_with_presence = [r for r in presence_results if r is not None][:5]
    print(f"[presence] {len(selected_with_presence)} artists with Spotify or iTunes presence")

    if not selected_with_presence:
        return {"tags": search_tags, "recommendations": [],
                "obscurity_level": level, "max_followers": max_fol, "description": cfg["description"]}

    # --- Step 6: parallel enrichment ---
    seed_artists = data.artists or top_artists[:3]
    enriched_map: Dict[str, Dict] = {}

    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {
            ex.submit(enrich_artist, rec, token, search_tags, seed_artists): rec["name"]
            for rec in selected_with_presence
        }
        for future in as_completed(futures):
            name = futures[future]
            try:
                enriched_map[name] = future.result()
            except Exception as e:
                print(f"[enrich] {name}: {e}")

    # Preserve ranking order
    enriched = [enriched_map[r["name"]] for r in selected_with_presence if r["name"] in enriched_map]
    print(f"returning {len(enriched)} results")

    return {
        "tags":            search_tags,
        "recommendations": enriched,
        "obscurity_level": level,
        "max_followers":   max_fol,
        "description":     cfg["description"],
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
    combined = list(top) + [{"name": n, "id": None, "genres": []} for n in recent if n not in top_names]
    return {"suggestions": combined[:10], "top_artists": [a["name"] for a in top[:5]], "recent_artists": recent[:5]}

@app.post("/spotify/save-playlist")
def save_spotify_playlist(data: SavePlaylistInput):
    hdrs = {"Authorization": f"Bearer {data.token}", "Content-Type": "application/json"}
    me = requests.get("https://api.spotify.com/v1/me", headers=hdrs, timeout=8)
    if not me.ok:
        return {"error": "invalid token"}
    user_id = me.json().get("id")
    uris = []

    def fetch_track_uri(aid):
        try:
            r = requests.get(f"https://api.spotify.com/v1/artists/{aid}/top-tracks",
                headers=hdrs, params={"market": "US"}, timeout=8)
            if r.ok:
                tracks = r.json().get("tracks", [])
                if tracks:
                    return tracks[0].get("uri")
        except: pass
        return None

    with ThreadPoolExecutor(max_workers=8) as ex:
        for uri in ex.map(fetch_track_uri, list(dict.fromkeys(data.artist_ids))[:25]):
            if uri and uri not in uris:
                uris.append(uri)
            if len(uris) >= 50:
                break

    if not uris:
        return {"error": "no tracks found"}
    c = requests.post(f"https://api.spotify.com/v1/users/{user_id}/playlists", headers=hdrs,
        json={"name": data.name[:100], "public": False, "description": "Generated by Uncover"}, timeout=8)
    if not c.ok:
        return {"error": "failed to create playlist"}
    pid = c.json().get("id")
    requests.post(f"https://api.spotify.com/v1/playlists/{pid}/tracks",
        headers=hdrs, json={"uris": uris[:50]}, timeout=8)
    return {"playlist_url": c.json().get("external_urls", {}).get("spotify"), "tracks_added": len(uris)}
