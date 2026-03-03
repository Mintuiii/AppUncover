import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

// ─── Waveform Player ─────────────────────────────────────────────────────────
const WaveformPlayer = ({ src, isGlobalPlaying, onPlay }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = 28;

  useEffect(() => {
    if (!isGlobalPlaying && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isGlobalPlaying]); // eslint-disable-line

  const toggle = () => {
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      onPlay();
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (el?.duration) setProgress(el.currentTime / el.duration);
  };

  return (
    <div className="waveform-player">
      <audio ref={audioRef} src={src}
        onEnded={() => { setIsPlaying(false); setProgress(0); }}
        onTimeUpdate={onTimeUpdate}
      />
      <button className="play-btn" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying
          ? <svg width="10" height="12" viewBox="0 0 10 12"><rect x="0" y="0" width="3.5" height="12" fill="currentColor" rx="1"/><rect x="6.5" y="0" width="3.5" height="12" fill="currentColor" rx="1"/></svg>
          : <svg width="10" height="12" viewBox="0 0 10 12"><polygon points="0,0 10,6 0,12" fill="currentColor"/></svg>
        }
      </button>
      <div className="waveform-bars">
        {Array.from({ length: bars }).map((_, i) => {
          const height = 30 + Math.sin(i * 0.8) * 20 + Math.cos(i * 1.3) * 15;
          const filled = (i / bars) < progress;
          return (
            <div key={i} className={`waveform-bar ${filled ? "filled" : ""} ${isPlaying ? "animating" : ""}`}
              style={{
                height: `${height}%`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          );
        })}
      </div>
      <span className="waveform-label">{isPlaying ? "playing" : "preview"}</span>
    </div>
  );
};

// ─── Obscurity Ring ──────────────────────────────────────────────────────────
const ObscurityRing = ({ score }) => {
  const r = 20, circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div className="obscurity-ring" title={`Obscurity: ${score}/100`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5"/>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--accent)"
          strokeWidth="2.5" strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round" transform="rotate(-90 26 26)"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <text x="26" y="26" textAnchor="middle" dominantBaseline="central"
          fill="var(--fg)" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700">
          {score}
        </text>
      </svg>
      <span className="ring-label">obscurity</span>
    </div>
  );
};

// ─── Signal Strength Bars ────────────────────────────────────────────────────
const SignalBars = ({ score }) => {
  // 4 bars, filled based on how obscure (higher score = more filled)
  const filled = Math.ceil((score / 100) * 4);
  return (
    <div className="signal-bars" title={`Signal strength: ${score}/100`}>
      {[1,2,3,4].map(i => (
        <div key={i} className={`signal-bar ${i <= filled ? "active" : ""}`}
          style={{ height: `${i * 25}%` }} />
      ))}
    </div>
  );
};

// ─── Artist Image ────────────────────────────────────────────────────────────
const LASTFM_PLACEHOLDER = "2a96cbd8b46e442f";
const ArtistImage = ({ src, name }) => {
  const [failed, setFailed] = useState(false);
  const bad = !src || src.includes(LASTFM_PLACEHOLDER);
  if (failed || bad) {
    const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <div className="artist-img artist-img-fallback">
        <span className="artist-initials">{initials}</span>
      </div>
    );
  }
  return <img src={src} alt={name} className="artist-img" onError={() => setFailed(true)} loading="lazy" />;
};

// ─── Confidence Badge ────────────────────────────────────────────────────────
const ConfidenceBadge = ({ confidence, spotifyVerified }) => {
  if (confidence === "high") return (
    <span className="conf-badge conf-high" title="Verified on Spotify + Last.fm">
      <CheckIcon /> verified
    </span>
  );
  if (confidence === "medium") return (
    <span className="conf-badge conf-medium" title={`Verified on ${spotifyVerified ? "Spotify" : "Last.fm"}`}>
      <CheckIcon /> {spotifyVerified ? "spotify" : "last.fm"}
    </span>
  );
  return <span className="conf-badge conf-low">unverified</span>;
};

// ─── Theme Generator ─────────────────────────────────────────────────────────
const generateTheme = (r, g, b) => {
  const toHsl = (r,g,b) => {
    r/=255;g/=255;b/=255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    let h,s,l=(max+min)/2;
    if(max===min){h=s=0;}else{
      const d=max-min;s=l>0.5?d/(2-max-min):d/(max+min);
      switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;default:h=((r-g)/d+4)/6;}
    }
    return[h*360,s*100,l*100];
  };
  const toRgb=(h,s,l)=>{
    h/=360;s/=100;l/=100;
    if(s===0){const v=Math.round(l*255);return[v,v,v];}
    const hue2=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
    return[hue2(p,q,h+1/3),hue2(p,q,h),hue2(p,q,h-1/3)].map(v=>Math.round(v*255));
  };
  const[h,s,l]=toHsl(r,g,b);
  const[hr,hg,hb]=toRgb(h,Math.min(s+10,100),Math.min(l+12,88));
  const[bgr,bgg,bgb]=toRgb(h,Math.max(s-10,15),Math.max(l-58,4));
  const[cbr,cbg,cbb]=toRgb(h,Math.max(s-15,12),Math.max(l-42,9));
  const[bdr,bdg,bdb]=toRgb(h,Math.max(s-12,16),Math.max(l-48,11));
  const[fgr,fgg,fgb]=toRgb(h,Math.max(s-40,8),Math.min(l+62,93));
  return{
    accent:`rgb(${r},${g},${b})`,
    accentHover:`rgb(${hr},${hg},${hb})`,
    bg:`rgb(${bgr},${bgg},${bgb})`,
    cardBg:`rgb(${cbr},${cbg},${cbb})`,
    border:`rgb(${bdr},${bdg},${bdb})`,
    fg:`rgb(${fgr},${fgg},${fgb})`,
    accentRgb:`${r},${g},${b}`,
  };
};

// ─── Constants ───────────────────────────────────────────────────────────────
const OBSCURITY_LEVELS = [
  {value:"ultra_deep", label:"Ultra Deep", followers:"< 1K",   emoji:"🔬"},
  {value:"deep_cut",   label:"Deep Cut",   followers:"< 10K",  emoji:"💎"},
  {value:"underground",label:"Underground",followers:"< 50K",  emoji:"🌑"},
  {value:"emerging",   label:"Emerging",   followers:"< 100K", emoji:"🌱"},
  {value:"niche",      label:"Niche",      followers:"< 500K", emoji:"🎯"},
];

const LOADING_STEPS = [
  "Asking Gemini for obscure frequencies…",
  "Verifying identities on Spotify…",
  "Cross-checking Last.fm…",
  "Filtering ghost artists…",
  "Calculating obscurity scores…",
  "Ranking by depth…",
];

const PRESETS = [
  {r:118,g:75, b:162,label:"Purple"},
  {r:220,g:38, b:127,label:"Pink"},
  {r:37, g:99, b:235,label:"Blue"},
  {r:16, g:185,b:129,label:"Emerald"},
  {r:245,g:158,b:11, label:"Amber"},
  {r:239,g:68, b:68, label:"Red"},
  {r:20, g:184,b:166,label:"Teal"},
  {r:168,g:85, b:247,label:"Violet"},
];

const PLACEHOLDER_VIBES = [
  "Artists, genres, moods, vibes…",
  "Japanese Jazz, melancholic…",
  "90s Memphis Rap…",
  "Dreampop, shoegaze adjacent…",
  "Ethiopian Funk, Afrobeat…",
  "Footwork, juke, Chicago…",
  "Emo Rap, bedroom pop…",
  "Darkwave, post-punk…",
  "Lo-fi Country, Americana…",
  "Balearic, Ibiza, chillout…",
];

const RANDOM_SEEDS = [
  "Japanese Jazz", "Ethiopian Funk", "Soviet Synth", "Haitian Compas",
  "New Zealand Post-Rock", "Cumbia Villera", "Hong Kong Cantopop",
  "Nordic Folk Metal", "Brazilian Baile Funk", "Afro-Peruvian Jazz",
  "Cassette Culture Punk", "Thai Molam", "Georgian Polyphony",
  "Indonesian Krautrock", "Malian Blues",
];

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [input, setInput]           = useState("");
  const [tags, setTags]             = useState([]);
  const [recs, setRecs]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [loadStep, setLoadStep]     = useState(0);
  const [error, setError]           = useState("");
  const [droppedCount, setDropped]  = useState(0);
  const [obscurityLevel, setObscurityLevel] = useState("deep_cut");
  const [currentLevelInfo, setCurrentLevelInfo] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [totalUncovered, setTotalUncovered] = useState(0);
  const [expandedCard, setExpandedCard] = useState(null);
  const [playingId, setPlayingId]   = useState(null);
  const [scanDone, setScanDone]     = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderText, setPlaceholderText] = useState("");
  const [placeholderTyping, setPlaceholderTyping] = useState(true);

  // Playlist state
  const [playlist, setPlaylist]     = useState([]);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistSaved, setPlaylistSaved] = useState(null);

  // Theme
  const [colorR, setColorR] = useState(118);
  const [colorG, setColorG] = useState(75);
  const [colorB, setColorB] = useState(162);
  const [showPicker, setShowPicker] = useState(false);

  // Spotify
  const [spotifyToken, setSpotifyToken]         = useState(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [suggestions, setSuggestions]           = useState([]); // full {name,id,genres} objects

  // ── Scan line on mount ──
  useEffect(() => {
    const t = setTimeout(() => setScanDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  // ── Typewriter placeholder ──
  useEffect(() => {
    if (input) return;
    const full = PLACEHOLDER_VIBES[placeholderIdx];
    let i = 0;
    setPlaceholderText("");
    setPlaceholderTyping(true);
    const type = setInterval(() => {
      i++;
      setPlaceholderText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(type);
        setPlaceholderTyping(false);
        setTimeout(() => {
          setPlaceholderIdx(p => (p + 1) % PLACEHOLDER_VIBES.length);
        }, 2200);
      }
    }, 55);
    return () => clearInterval(type);
  }, [placeholderIdx, input]); // eslint-disable-line

  // ── Loading step ticker ──
  useEffect(() => {
    if (!loading) { setLoadStep(0); return; }
    const id = setInterval(() => setLoadStep(s => (s + 1) % LOADING_STEPS.length), 1600);
    return () => clearInterval(id);
  }, [loading]);

  // ── Theme apply ──
  useEffect(() => {
    const t = generateTheme(colorR, colorG, colorB);
    const root = document.documentElement;
    Object.entries({
      '--accent': t.accent, '--accent-hover': t.accentHover,
      '--bg': t.bg, '--card-bg': t.cardBg,
      '--border': t.border, '--fg': t.fg, '--accent-rgb': t.accentRgb,
    }).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [colorR, colorG, colorB]);

  // ── Spotify OAuth ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { exchangeSpotifyToken(code); window.history.replaceState({}, document.title, "/"); }
    const saved = localStorage.getItem('spotify_token');
    if (saved) { setSpotifyToken(saved); setSpotifyConnected(true); loadSpotifySuggestions(saved); }
  }, []); // eslint-disable-line

  const connectSpotify = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/spotify/auth-url");
      window.location.href = (await res.json()).auth_url;
    } catch { setError("Failed to connect to Spotify"); }
  };

  const exchangeSpotifyToken = async (code) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/spotify/token?code=${code}`, { method: "POST" });
      const data = await res.json();
      if (data.access_token) {
        setSpotifyToken(data.access_token);
        setSpotifyConnected(true);
        localStorage.setItem('spotify_token', data.access_token);
        loadSpotifySuggestions(data.access_token);
      }
    } catch { setError("Failed to authenticate with Spotify"); }
  };

  const loadSpotifySuggestions = async (token) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/spotify/suggestions?token=${token}`);
      const data = await res.json();
      // suggestions is now an array of {name, id, genres} objects
      setSuggestions(data.suggestions || []);
    } catch {}
  };

  const disconnectSpotify = () => {
    setSpotifyToken(null); setSpotifyConnected(false);
    setSuggestions([]); localStorage.removeItem('spotify_token');
  };

  // ── Save to Spotify Playlist ──
  const savePlaylist = async () => {
    if (!spotifyToken || playlist.length === 0) return;
    setSavingPlaylist(true);
    setPlaylistSaved(null);

    // Extract Spotify artist IDs - try spotifyUri first, then parse spotifyUrl
    const artist_ids = playlist.map(a => {
      if (a.spotifyUri) return a.spotifyUri.split(":").pop();
      if (a.spotifyUrl) return a.spotifyUrl.split("/").pop();
      return null;
    }).filter(Boolean);

    if (artist_ids.length === 0) {
      setPlaylistSaved("no_ids");
      setSavingPlaylist(false);
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/spotify/save-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: spotifyToken,
          artist_ids,
          name: `Uncover: ${input || "discoveries"}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Server error");
      }
      const data = await res.json();
      // Ensure we have a web URL not a spotify: URI
      let url = data.playlist_url;
      if (url && url.startsWith("spotify:playlist:")) {
        const id = url.split(":").pop();
        url = `https://open.spotify.com/playlist/${id}`;
      }
      setPlaylistSaved(url || "no_url");
    } catch (e) {
      console.error("Playlist save error:", e);
      setPlaylistSaved("error");
    } finally {
      setSavingPlaylist(false);
    }
  };

  const togglePlaylist = (artist) => {
    setPlaylist(prev => {
      const exists = prev.find(a => a.artist === artist.artist);
      if (exists) return prev.filter(a => a.artist !== artist.artist);
      return [...prev, artist];
    });
  };

  const inPlaylist = (name) => playlist.some(a => a.artist === name);

  // ── Analyze ──
  const analyze = useCallback(async (searchTerm = null) => {
    const query = typeof searchTerm === "string" ? searchTerm : input;
    if (!query?.trim()) return;
    if (typeof searchTerm === "string") setInput(searchTerm);

    setLoading(true); setError(""); setTags([]); setRecs([]); setDropped(0); setExpandedCard(null);

    // Save to history
    setSearchHistory(h => {
      const cleaned = h.filter(x => x !== query);
      return [query, ...cleaned].slice(0, 6);
    });

    try {
      const artists = query.split(",").map(a => a.trim()).filter(Boolean);

      // If this search came from the Spotify suggestions strip, pass the full
      // artist objects as hints so the backend can look up by ID rather than name
      const spotifyHints = suggestions.filter(s =>
        artists.some(a => a.toLowerCase() === (s.name || "").toLowerCase())
      ).map(s => ({ name: s.name, id: s.id, genres: s.genres || [] }));

      const res = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artists,
          obscurity_level: obscurityLevel,
          spotify_token: spotifyToken,
          spotify_hints: spotifyHints.length > 0 ? spotifyHints : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTags(data.tags || []);
      setRecs(data.recommendations || []);
      setDropped(Math.max(0, 6 - (data.recommendations?.length || 0)));
      setTotalUncovered(n => n + (data.recommendations?.length || 0));
      setCurrentLevelInfo({ level: data.obscurity_level, max_followers: data.max_followers, description: data.description });
    } catch { setError("Could not fetch recommendations. Is the backend running?"); }
    finally { setLoading(false); }
  }, [input, obscurityLevel, spotifyToken]);

  const goDeeper = () => {
    const idx = OBSCURITY_LEVELS.findIndex(l => l.value === obscurityLevel);
    if (idx > 0) {
      setObscurityLevel(OBSCURITY_LEVELS[idx - 1].value);
      setTimeout(() => analyze(input), 50);
    }
  };

  const randomize = () => {
    const seed = RANDOM_SEEDS[Math.floor(Math.random() * RANDOM_SEEDS.length)];
    analyze(seed);
  };

  const handleTagClick = (tag) => {
    if (tag.toLowerCase() !== input.toLowerCase()) analyze(tag);
  };

  const formatFollowers = (n) => {
    if (!n && n !== 0) return null;
    if (n < 1000) return `${n}`;
    if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1000000).toFixed(1)}M`;
  };

  const dedupeArtistTags = (artistTags, globalTags) => {
    const lower = new Set(globalTags.map(t => t.toLowerCase()));
    return artistTags.filter(t => !lower.has(t.toLowerCase()));
  };

  const isInitial = tags.length === 0 && recs.length === 0 && !loading;

  return (
    <div className="app-container">

      {/* ── Scan line ─────────────────────────────────────────────────── */}
      {!scanDone && <div className="scan-line" />}

      {/* ── Ambient pulse ─────────────────────────────────────────────── */}
      <div className="ambient-pulse" />

      {/* ── Fixed controls ────────────────────────────────────────────── */}
      <div className="fixed-controls">
        {totalUncovered > 0 && (
          <div className="session-counter" title="Artists uncovered this session">
            {totalUncovered}
          </div>
        )}
        {playlist.length > 0 && (
          <button className="ctrl-btn playlist-ctrl" onClick={() => setShowPlaylist(p => !p)}
            title={`Playlist (${playlist.length})`}>
            <PlaylistIcon />
            <span className="ctrl-badge">{playlist.length}</span>
          </button>
        )}
        <button className="ctrl-btn spotify-ctrl"
          onClick={spotifyConnected ? disconnectSpotify : connectSpotify}
          title={spotifyConnected ? "Disconnect Spotify" : "Connect Spotify"}>
          <SpotifyIcon connected={spotifyConnected} />
        </button>
        <button className="ctrl-btn theme-ctrl" onClick={() => setShowPicker(p => !p)} title="Customize theme">
          <PaletteIcon />
        </button>
      </div>

      {/* ── Playlist drawer ───────────────────────────────────────────── */}
      {showPlaylist && (
        <div className="playlist-drawer">
          <div className="drawer-header">
            <span className="drawer-title">My Discoveries</span>
            <button className="picker-close" onClick={() => setShowPlaylist(false)}>✕</button>
          </div>
          <div className="playlist-items">
            {playlist.map((a, i) => (
              <div key={i} className="playlist-item">
                <span className="playlist-num">{String(i+1).padStart(2,"0")}</span>
                <span className="playlist-name">{a.artist}</span>
                <button className="playlist-remove" onClick={() => togglePlaylist(a)}>✕</button>
              </div>
            ))}
          </div>
          {spotifyConnected && (
            <button className="save-playlist-btn" onClick={savePlaylist} disabled={savingPlaylist}>
              {savingPlaylist ? <Spinner /> : <SpotifyIcon size={14} />}
              {savingPlaylist ? "Saving…" : "Save to Spotify"}
            </button>
          )}
          {playlistSaved && playlistSaved !== "error" && playlistSaved !== "no_ids" && playlistSaved !== "no_url" && (
            <a href={playlistSaved} target="_blank" rel="noreferrer"
              className="playlist-saved-link"
              onClick={e => { if (!playlistSaved?.startsWith("http")) e.preventDefault(); }}>
              ✓ Saved! Open in Spotify ↗
            </a>
          )}
          {playlistSaved === "no_url" && (
            <p className="playlist-saved-link" style={{cursor:"default"}}>✓ Playlist created in Spotify</p>
          )}
          {playlistSaved === "no_ids" && (
            <p className="playlist-error">None of these artists have a verified Spotify profile — can't create playlist.</p>
          )}
          {playlistSaved === "error" && (
            <p className="playlist-error">Failed to save. Try disconnecting and reconnecting Spotify.</p>
          )}
          {!spotifyConnected && (
            <p className="playlist-note">Connect Spotify to save this as a playlist</p>
          )}
        </div>
      )}

      {/* ── Color Picker ──────────────────────────────────────────────── */}
      {showPicker && (
        <div className="color-picker-panel">
          <div className="picker-header">
            <span className="picker-title">Accent Colour</span>
            <button className="picker-close" onClick={() => setShowPicker(false)}>✕</button>
          </div>
          <div className="color-swatch" style={{ background: `rgb(${colorR},${colorG},${colorB})` }}>
            <code>rgb({colorR}, {colorG}, {colorB})</code>
          </div>
          {[{label:"R",val:colorR,set:setColorR,cls:"red-slider"},
            {label:"G",val:colorG,set:setColorG,cls:"green-slider"},
            {label:"B",val:colorB,set:setColorB,cls:"blue-slider"}].map(({label,val,set,cls}) => (
            <div className="slider-row" key={label}>
              <span className="slider-ch">{label}</span>
              <input type="range" min="0" max="255" value={val}
                onChange={e => set(parseInt(e.target.value))}
                className={`color-slider ${cls}`} />
              <span className="slider-num">{val}</span>
            </div>
          ))}
          <div className="preset-grid">
            {PRESETS.map(p => (
              <button key={p.label} className="preset-dot"
                style={{ background: `rgb(${p.r},${p.g},${p.b})` }}
                title={p.label}
                onClick={() => { setColorR(p.r); setColorG(p.g); setColorB(p.b); }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={`header ${isInitial ? "hero" : "compact"}`}>
        <div className="wordmark">
          <span className="wordmark-un">un</span><span className="wordmark-cover">cover</span>
        </div>
        {isInitial && <p className="tagline">Signals from the underground.</p>}
        {spotifyConnected && (
          <div className="spotify-connected-pill">
            <SpotifyIcon connected size={11} /> Spotify connected
          </div>
        )}
      </header>

      {/* ── Spotify suggestions ───────────────────────────────────────── */}
      {spotifyConnected && suggestions.length > 0 && isInitial && (
        <div className="suggestions-strip">
          <span className="strip-label">from your library</span>
          <div className="strip-tags">
            {suggestions.slice(0, 8).map((a, i) => (
              <button key={i} className="strip-tag" onClick={() => analyze(a.name || a)}>{a.name || a}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Obscurity panel ───────────────────────────────────────────── */}
      <div className="obscurity-panel">
        <div className="obscurity-header">
          <span className="obscurity-heading">Depth</span>
          <span className="obscurity-current">
            {OBSCURITY_LEVELS.find(l => l.value === obscurityLevel)?.followers} followers
          </span>
        </div>
        <input type="range" min="0" max="4"
          value={OBSCURITY_LEVELS.findIndex(l => l.value === obscurityLevel)}
          onChange={e => setObscurityLevel(OBSCURITY_LEVELS[+e.target.value].value)}
          className="depth-slider"
          style={{'--pct': `${OBSCURITY_LEVELS.findIndex(l => l.value === obscurityLevel) * 25}%`}}
        />
        <div className="depth-labels">
          {OBSCURITY_LEVELS.map(lvl => (
            <button key={lvl.value}
              className={`depth-label ${obscurityLevel === lvl.value ? "active" : ""}`}
              onClick={() => setObscurityLevel(lvl.value)}>
              <span className="depth-emoji">{lvl.emoji}</span>
              <span className="depth-name">{lvl.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Search bar ────────────────────────────────────────────────── */}
      <div className="search-bar">
        <textarea rows={1} className="search-input"
          placeholder={input ? "" : placeholderText + (placeholderTyping ? "▌" : "")}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); analyze(); } }}
        />
        <div className="search-actions">
          <button className="randomize-btn" onClick={randomize} title="Random seed" disabled={loading}>
            <RandomIcon />
          </button>
          <button className="search-btn" onClick={() => analyze()} disabled={loading}>
            {loading ? <Spinner /> : <ArrowIcon />}
          </button>
        </div>
      </div>

      {/* ── Search history ────────────────────────────────────────────── */}
      {searchHistory.length > 0 && (
        <div className="history-strip">
          {searchHistory.map((h, i) => (
            <button key={i} className="history-chip" onClick={() => analyze(h)}>{h}</button>
          ))}
        </div>
      )}

      {error && <div className="error-bar">{error}</div>}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="loading-block">
          <div className="loading-track"><div className="loading-fill" /></div>
          <p className="loading-step">{LOADING_STEPS[loadStep]}</p>
        </div>
      )}

      {/* ── Landing ───────────────────────────────────────────────────── */}
      {isInitial && !spotifyConnected && (
        <div className="landing-seeds">
          <span className="seeds-label">Start with a signal</span>
          <div className="seeds-cloud">
            {["Japanese Jazz","90s Memphis Rap","Dreampop","Darkwave","Ethiopian Funk",
              "Footwork","Emo Rap","Balearic","Lo-fi Country","Soviet Synth"].map(t => (
              <button key={t} className="seed-tag" onClick={() => handleTagClick(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Vibe tags ─────────────────────────────────────────────────── */}
      {tags.length > 0 && (
        <div className="vibe-section">
          <span className="section-label">Current coordinates</span>
          <div className="tag-cloud">
            {tags.map((t, i) => (
              <button key={i} className="vibe-tag" onClick={() => handleTagClick(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Results header ────────────────────────────────────────────── */}
      {currentLevelInfo && !loading && recs.length > 0 && (
        <div className="results-header">
          <div className="level-banner">
            <span className="level-dot" />
            {recs.length} artists · {currentLevelInfo.description}
            {droppedCount > 0 && <span className="dropped-note"> · {droppedCount} unverified dropped</span>}
          </div>
          <button className="go-deeper-btn" onClick={goDeeper}
            disabled={obscurityLevel === "ultra_deep"}
            title="Search one level more obscure">
            go deeper ↓
          </button>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!loading && !isInitial && recs.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">◉</div>
          <p className="empty-title">No signals found</p>
          <p className="empty-sub">Try loosening the depth filter or a broader input.</p>
          <button className="empty-action" onClick={() => { setObscurityLevel("underground"); if (input) analyze(input); }}>
            Try Underground instead
          </button>
        </div>
      )}

      {/* ── Artist cards ──────────────────────────────────────────────── */}
      <div className="artist-list">
        {recs.map((r, i) => {
          const uniqueTags = dedupeArtistTags(r.tags || [], tags);
          const followersStr = formatFollowers(r.followers);
          const showEmbed = r.spotifyEmbed && r.spotifyVerified;
          const imageSource = r.image || r.spotifyImage || null;
          const expanded = expandedCard === i;
          const saved = inPlaylist(r.artist);

          return (
            <article key={i} className={`artist-card ${expanded ? "expanded" : ""}`}
              style={{ animationDelay: `${i * 70}ms` }}>

              {/* Rank number */}
              <div className="card-rank">{String(i + 1).padStart(2, "0")}</div>

              {/* Image */}
              <ArtistImage src={imageSource} name={r.artist} />

              {/* Body */}
              <div className="card-body">
                <div className="card-header">
                  <h3 className="card-name">{r.artist}</h3>
                  <div className="card-header-right">
                    <ConfidenceBadge confidence={r.confidence} spotifyVerified={r.spotifyVerified} />
                    <button
                      className={`save-btn ${saved ? "saved" : ""}`}
                      onClick={() => togglePlaylist(r)}
                      title={saved ? "Remove from playlist" : "Add to playlist"}>
                      {saved ? "♥" : "♡"}
                    </button>
                  </div>
                </div>

                {uniqueTags.length > 0 && (
                  <div className="card-tags">
                    {uniqueTags.map((tag, ti) => (
                      <button key={ti} className="card-tag" onClick={() => handleTagClick(tag)}>{tag}</button>
                    ))}
                  </div>
                )}

                <p className="card-desc">{r.explanation}</p>

                <div className="card-stats">
                  {r.obscurityScore != null && (
                    <>
                      <ObscurityRing score={r.obscurityScore} />
                      <SignalBars score={r.obscurityScore} />
                    </>
                  )}
                  <div className="card-links">
                    {followersStr && (
                      <span className="follower-chip">
                        <PeopleIcon /> {followersStr}
                      </span>
                    )}
                    {r.spotifyUrl && r.spotifyVerified && !showEmbed && (
                      <a href={r.spotifyUrl} target="_blank" rel="noreferrer" className="link-pill link-spotify">
                        <SpotifyIcon size={10} /> Spotify
                      </a>
                    )}
                    {r.lastfmUrl && r.lastfmVerified && (
                      <a href={r.lastfmUrl} target="_blank" rel="noreferrer" className="link-pill link-lastfm">Last.fm</a>
                    )}

                  </div>
                  <button className="expand-btn" onClick={() => setExpandedCard(expanded ? null : i)}
                    title={expanded ? "Collapse" : "Expand"}>
                    {expanded ? "↑" : "↓"}
                  </button>
                </div>

                {/* Expanded content */}
                {expanded && (
                  <div className="card-expanded">
                    {showEmbed && (
                      <div className="spotify-embed">
                        <iframe src={r.spotifyEmbed} width="100%" height="80"
                          frameBorder="0" allow="encrypted-media"
                          title={`Spotify – ${r.artist}`} />
                      </div>
                    )}
                    {r.sampleUrl && !showEmbed && (
                      <WaveformPlayer
                        src={r.sampleUrl}
                        isGlobalPlaying={playingId === i}
                        onPlay={() => setPlayingId(i)}
                      />
                    )}
                    {r.topTracks?.length > 0 && (
                      <div className="top-tracks">
                        <span className="tracks-label">top tracks</span>
                        {r.topTracks.map((t, ti) => (
                          <div key={ti} className="track-row">
                            <span className="track-num">{ti + 1}</span>
                            <span className="track-name">{t.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Preview always visible even when not expanded (no embed) */}
                {!expanded && r.sampleUrl && !showEmbed && (
                  <WaveformPlayer
                    src={r.sampleUrl}
                    isGlobalPlaying={playingId === i}
                    onPlay={() => setPlayingId(i)}
                  />
                )}
                {!expanded && showEmbed && (
                  <div className="spotify-embed">
                    <iframe src={r.spotifyEmbed} width="100%" height="80"
                      frameBorder="0" allow="encrypted-media"
                      title={`Spotify – ${r.artist}`} />
                  </div>
                )}

              </div>
            </article>
          );
        })}
      </div>

    </div>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const SpotifyIcon = ({ connected, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill={connected ? "#1DB954" : "currentColor"} opacity="0.15"/>
    <path d="M17.9 10.9C14.7 9 9.35 8.8 6.3 9.75c-.5.15-1-.15-1.15-.6-.15-.5.15-1 .6-1.15 3.55-1.05 9.4-.85 13.1 1.35.45.25.6.85.35 1.3-.25.35-.85.5-1.3.25zm-.1 2.8c-.25.4-.75.5-1.15.25-2.65-1.65-6.7-2.1-9.85-1.15-.4.1-.85-.1-.95-.5-.1-.4.1-.85.5-.95 3.6-1.1 8.1-.55 11.15 1.3.4.25.5.75.3 1.05zm-1.3 2.7c-.2.3-.6.4-.9.2-2.3-1.4-5.2-1.75-8.6-.95-.35.1-.65-.15-.75-.45-.1-.35.15-.65.45-.75 3.75-.85 6.95-.45 9.5 1.1.35.2.4.6.3.85z"
      fill={connected ? "#1DB954" : "currentColor"} opacity={connected ? 1 : 0.8}/>
  </svg>
);

const CheckIcon = () => (
  <svg width="9" height="9" viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);

const Spinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="spin">
    <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
  </svg>
);

const RandomIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16,3 21,3 21,8"/><line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21,16 21,21 16,21"/><line x1="15" y1="15" x2="21" y2="21"/>
  </svg>
);

const PaletteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2v-1.5c0-.83.67-1.5 1.5-1.5H17c2.76 0 5-2.24 5-5 0-5.52-4.48-10-10-10z"/>
  </svg>
);

const PlaylistIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
    <line x1="8" y1="18" x2="21" y2="18"/>
    <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/>
  </svg>
);

const PeopleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
