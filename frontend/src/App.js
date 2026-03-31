import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
              style={{ height: `${height}%`, animationDelay: `${i * 40}ms` }}
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

// ─── Spotify Corner Link ─────────────────────────────────────────────────────
const SpotifyCornerLink = ({ spotifyId, spotifyUrl }) => {
  const href = spotifyUrl || (spotifyId ? `https://open.spotify.com/artist/${spotifyId}` : null);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="spotify-corner-link" title="Open on Spotify">
      <SpotifyIcon size={13} />
    </a>
  );
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
  "✨ sniffing out hidden gems…",
  "🔍 diving into the rabbit hole…",
  "🎤 checking the underground…",
  "👾 filtering the too-famous ones…",
  "🎵 grabbing previews & top tracks…",
  "💎 almost there, ranking the finds…",
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

const TAG_COLORS = [
  { bg: "rgba(118,75,162,0.18)", border: "rgba(118,75,162,0.55)", text: "#c49dff" },
  { bg: "rgba(220,38,127,0.15)", border: "rgba(220,38,127,0.5)",  text: "#f472b6" },
  { bg: "rgba(37,99,235,0.18)",  border: "rgba(37,99,235,0.5)",   text: "#93c5fd" },
  { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.5)",  text: "#6ee7b7" },
  { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.5)",  text: "#fcd34d" },
  { bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.5)",   text: "#fca5a5" },
  { bg: "rgba(20,184,166,0.15)", border: "rgba(20,184,166,0.5)",  text: "#5eead4" },
  { bg: "rgba(168,85,247,0.15)", border: "rgba(168,85,247,0.5)",  text: "#d8b4fe" },
];

const STAR_RATINGS = ["", "★", "★★", "★★★", "★★★★", "★★★★★"];

// ─── Genre Mood Board ─────────────────────────────────────────────────────────
const GenreMoodBoard = ({ tags, onTagClick }) => {
  if (!tags || tags.length === 0) return null;

  const shuffled = useMemo(() => {
    const weighted = tags.map((tag, i) => ({
      tag,
      tier: i < 2 ? 3 : i < 5 ? 2 : 1,
      color: TAG_COLORS[i % TAG_COLORS.length],
    }));
    return [...weighted].sort((a, b) => {
      const seed = (a.tag.charCodeAt(0) + b.tag.charCodeAt(0)) % 3;
      return seed - 1;
    });
  }, [tags]); // eslint-disable-line

  return (
    <div className="mood-board">
      <div className="mood-board-header">
        <span className="section-label">🎨 vibe map</span>
        <span className="mood-board-hint">tap to explore</span>
      </div>
      <div className="mood-cloud">
        {shuffled.map(({ tag, tier, color }, i) => (
          <button
            key={tag}
            className={`mood-tag mood-tag-tier${tier}`}
            style={{
              background: color.bg,
              borderColor: color.border,
              color: color.text,
              animationDelay: `${i * 60}ms`,
            }}
            onClick={() => onTagClick(tag)}
            title={`Search for "${tag}"`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Artist Notes Panel ──────────────────────────────────────────────────────
const ArtistNotes = ({ artistName, notes, setNotes, rating, setRating }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes || "");
  const taRef = useRef(null);

  useEffect(() => {
    setDraft(notes || "");
  }, [notes]);

  const save = () => {
    setNotes(draft);
    setEditing(false);
  };

  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus();
  }, [editing]);

  return (
    <div className="artist-notes">
      <div className="notes-header">
        <span className="notes-label">my notes</span>
        <div className="star-rating">
          {[1,2,3,4,5].map(n => (
            <button
              key={n}
              className={`star-btn ${n <= rating ? "filled" : ""}`}
              onClick={() => setRating(rating === n ? 0 : n)}
              title={`Rate ${n} star${n > 1 ? "s" : ""}`}
            >★</button>
          ))}
        </div>
      </div>
      {editing ? (
        <div className="notes-edit">
          <textarea
            ref={taRef}
            className="notes-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="What do you think? First impressions, where you heard them, similar artists…"
            rows={3}
          />
          <div className="notes-actions">
            <button className="notes-btn notes-save" onClick={save}>save</button>
            <button className="notes-btn notes-cancel" onClick={() => { setDraft(notes || ""); setEditing(false); }}>cancel</button>
          </div>
        </div>
      ) : (
        <div className="notes-display" onClick={() => setEditing(true)}>
          {notes
            ? <p className="notes-text">{notes}</p>
            : <p className="notes-placeholder">+ add a note…</p>
          }
        </div>
      )}
    </div>
  );
};

// ─── Share Card (canvas-based image export) ──────────────────────────────────
const polyfillRoundRect = (ctx) => {
  if (ctx.roundRect) return;
  ctx.roundRect = function(x, y, w, h, r) {
    const radius = Array.isArray(r) ? r[0] : (r || 0);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };
};

const useShareCard = () => {
  const generate = useCallback(async (artist, accentRgb) => {
    const W = 800, H = 420;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    polyfillRoundRect(ctx);

    const [r, g, b] = accentRgb.split(",").map(Number);
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `rgb(${Math.max(r-80,0)},${Math.max(g-80,0)},${Math.max(b-80,0)})`);
    grad.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
    ctx.fillRect(0, 0, 6, H);

    let imgLoaded = false;
    if (artist.image) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((res, rej) => {
          img.onload = res; img.onerror = rej;
          img.src = artist.image;
          setTimeout(rej, 3000);
        });
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.drawImage(img, W - 340, 0, 340, H);
        ctx.restore();
        ctx.save();
        const iSize = 160;
        const ix = W - iSize - 48, iy = (H - iSize) / 2;
        ctx.beginPath();
        ctx.roundRect(ix, iy, iSize, iSize, 12);
        ctx.clip();
        ctx.drawImage(img, ix, iy, iSize, iSize);
        ctx.restore();
        imgLoaded = true;
      } catch {}
    }

    ctx.font = "bold 13px monospace";
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
    ctx.fillText("UN", 32, 44);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("COVER", 32 + ctx.measureText("UN").width, 44);

    ctx.font = "bold 52px sans-serif";
    ctx.fillStyle = "#ffffff";
    const maxW = imgLoaded ? W - 260 : W - 80;
    let name = artist.artist;
    while (ctx.measureText(name).width > maxW - 32 && name.length > 3) {
      name = name.slice(0, -1);
    }
    if (name !== artist.artist) name += "…";
    ctx.fillText(name, 32, H / 2 - 20);

    if (artist.tags?.length) {
      ctx.font = "12px monospace";
      let tx = 32;
      const ty = H / 2 + 18;
      artist.tags.slice(0, 4).forEach(tag => {
        const tw = ctx.measureText(tag).width + 24;
        if (tx + tw > maxW) return;
        ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
        ctx.beginPath();
        ctx.roundRect(tx, ty - 14, tw, 22, 11);
        ctx.fill();
        ctx.fillStyle = `rgba(${r},${g},${b},1)`;
        ctx.fillText(tag, tx + 12, ty + 2);
        tx += tw + 8;
      });
    }

    ctx.font = "italic 15px serif";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    const exp = artist.explanation || "";
    const words = exp.split(" ");
    let line = "", lineY = H / 2 + 56;
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxW - 32 && line) {
        ctx.fillText(line.trim(), 32, lineY);
        line = word + " ";
        lineY += 22;
        if (lineY > H - 48) break;
      } else { line = test; }
    }
    if (line) ctx.fillText(line.trim(), 32, lineY);

    if (artist.obscurityScore) {
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
      ctx.fillText(`obscurity ${artist.obscurityScore}/100`, 32, H - 28);
    }

    if (artist.followers) {
      const fStr = artist.followers >= 1000
        ? `${(artist.followers/1000).toFixed(1)}K followers`
        : `${artist.followers} followers`;
      ctx.font = "11px monospace";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      const fw = ctx.measureText(fStr).width;
      ctx.fillText(fStr, W - fw - 32, H - 28);
    }

    return canvas.toDataURL("image/png");
  }, []);

  return { generate };
};

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

  const [playlist, setPlaylist]     = useState([]);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistSaved, setPlaylistSaved] = useState(null);

  const [artistNotes, setArtistNotes]   = useState(() => {
    try { return JSON.parse(localStorage.getItem("uncover_notes") || "{}"); } catch { return {}; }
  });
  const [artistRatings, setArtistRatings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("uncover_ratings") || "{}"); } catch { return {}; }
  });

  const { generate: generateCard } = useShareCard();
  const [sharingId, setSharingId] = useState(null);

  const [colorR, setColorR] = useState(118);
  const [colorG, setColorG] = useState(75);
  const [colorB, setColorB] = useState(162);
  const [showPicker, setShowPicker] = useState(false);

  const [spotifyToken, setSpotifyToken]         = useState(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [suggestions, setSuggestions]           = useState([]);

  // ── Persist notes & ratings ──
  useEffect(() => {
    try { localStorage.setItem("uncover_notes", JSON.stringify(artistNotes)); } catch {}
  }, [artistNotes]);
  useEffect(() => {
    try { localStorage.setItem("uncover_ratings", JSON.stringify(artistRatings)); } catch {}
  }, [artistRatings]);

  const setNoteFor   = useCallback((name, note)   => setArtistNotes(prev   => ({ ...prev, [name]: note })),   []);
  const setRatingFor = useCallback((name, rating) => setArtistRatings(prev => ({ ...prev, [name]: rating })), []);

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
        if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
        loadSpotifySuggestions(data.access_token);
      }
    } catch { setError("Failed to authenticate with Spotify"); }
  };

  const loadSpotifySuggestions = async (token) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/spotify/suggestions?token=${token}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch {}
  };

  const disconnectSpotify = () => {
    setSpotifyToken(null); setSpotifyConnected(false);
    setSuggestions([]); localStorage.removeItem('spotify_token'); localStorage.removeItem('spotify_refresh_token');
  };

  // ── Save to Spotify Playlist ──
  const refreshSpotifyToken = async () => {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    if (!refreshToken) return null;
    try {
      const res = await fetch(`http://127.0.0.1:8000/spotify/refresh?refresh_token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
      const data = await res.json();
      if (data.access_token) {
        setSpotifyToken(data.access_token);
        localStorage.setItem('spotify_token', data.access_token);
        return data.access_token;
      }
    } catch {}
    return null;
  };

  const savePlaylist = async () => {
    if (!spotifyToken || playlist.length === 0) return;
    setSavingPlaylist(true); setPlaylistSaved(null);

    const artist_ids = playlist
      .map(a => a.spotifyId || (a.spotifyUri ? a.spotifyUri.split(":").pop() : null)
                             || (a.spotifyUrl ? a.spotifyUrl.split("/").pop()?.split("?")[0] : null))
      .filter(Boolean);

    if (artist_ids.length === 0) { setPlaylistSaved("no_ids"); setSavingPlaylist(false); return; }

    const trySave = async (tokenToUse) => {
      const res = await fetch("http://127.0.0.1:8000/spotify/save-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenToUse, artist_ids, name: `Uncover: ${input || "discoveries"}` }),
      });
      return res.json();
    };

    try {
      let data = await trySave(spotifyToken);
      if (data?.error === "invalid token") {
        const retryToken = await refreshSpotifyToken();
        if (retryToken) { data = await trySave(retryToken); }
        else { setPlaylistSaved("token_expired"); setSavingPlaylist(false); return; }
      }
      if (data?.error) throw new Error(data.error);
      let url = data?.playlist_url;
      if (url?.startsWith("spotify:playlist:")) url = `https://open.spotify.com/playlist/${url.split(":").pop()}`;
      setPlaylistSaved(url || "no_url");
    } catch { setPlaylistSaved("error"); }
    finally { setSavingPlaylist(false); }
  };

  const togglePlaylist = (artist) => {
    setPlaylist(prev => {
      const exists = prev.find(a => a.artist === artist.artist);
      if (exists) return prev.filter(a => a.artist !== artist.artist);
      return [...prev, artist];
    });
  };

  const inPlaylist = (name) => playlist.some(a => a.artist === name);

  // ── Share card ──
  const handleShare = async (artist, index) => {
    setSharingId(index);
    try {
      const dataUrl = await generateCard(artist, `${colorR},${colorG},${colorB}`);
      const link = document.createElement("a");
      link.download = `uncover-${artist.artist.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Share error:", e);
    } finally {
      setSharingId(null);
    }
  };

  // ── Analyze ──
  // FIX: obscurityLevel is now passed as an explicit argument so callers like
  // goDeeper (which update obscurityLevel in state just before calling analyze)
  // don't hit the stale closure problem. The parameter defaults to the current
  // state value so existing call sites (analyze() / analyze(searchTerm)) work
  // unchanged.
  const analyze = useCallback(async (searchTerm = null, levelOverride = null) => {
    const query = typeof searchTerm === "string" ? searchTerm : input;
    if (!query?.trim()) return;
    if (typeof searchTerm === "string") setInput(searchTerm);

    // FIX: use levelOverride when provided (avoids stale closure from goDeeper)
    const effectiveLevel = levelOverride || obscurityLevel;

    setLoading(true); setError(""); setTags([]); setRecs([]); setDropped(0); setExpandedCard(null);

    setSearchHistory(h => {
      const cleaned = h.filter(x => x !== query);
      return [query, ...cleaned].slice(0, 6);
    });

    try {
      // FIX: treat each comma-separated term as either an artist name OR a
      // genre/vibe tag. The backend now always seeds from both similar-artist
      // and tag lookups, but we send the raw terms as the artists[] array
      // unchanged so the backend can decide how to use them.
      const artists = query.split(",").map(a => a.trim()).filter(Boolean);
      const spotifyHints = suggestions.filter(s =>
        artists.some(a => a.toLowerCase() === (s.name || "").toLowerCase())
      ).map(s => ({ name: s.name, id: s.id, genres: s.genres || [] }));

      const res = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artists,
          obscurity_level: effectiveLevel,   // FIX: use the overridden level
          spotify_token: spotifyToken,
          spotify_hints: spotifyHints.length > 0 ? spotifyHints : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTags(data.tags || []);
      setRecs(data.recommendations || []);
      setDropped(data.dropped_count || 0);
      setTotalUncovered(n => n + (data.recommendations?.length || 0));
      setCurrentLevelInfo({ level: data.obscurity_level, max_followers: data.max_followers, description: data.description });
    } catch { setError("Could not fetch recommendations. Is the backend running?"); }
    finally { setLoading(false); }
  }, [input, obscurityLevel, spotifyToken, suggestions]);

  // FIX: goDeeper computes the next level, updates state, and passes the new
  // level directly to analyze() as levelOverride so the fetch uses the correct
  // value immediately — no more stale closure causing the old level to be sent.
  const goDeeper = useCallback(() => {
    const idx = OBSCURITY_LEVELS.findIndex(l => l.value === obscurityLevel);
    if (idx > 0) {
      const nextLevel = OBSCURITY_LEVELS[idx - 1].value;
      setObscurityLevel(nextLevel);
      analyze(input, nextLevel);  // pass level directly — no setTimeout needed
    }
  }, [obscurityLevel, input, analyze]);

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

  const showToast = playlistSaved && playlistSaved.startsWith("http");

  return (
    <div className="app-container">

      {!scanDone && <div className="scan-line" />}
      <div className="ambient-pulse" />

      {/* ── Fixed controls ─────────────────────────────────────────── */}
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

      {/* ── Playlist drawer ─────────────────────────────────────────── */}
      {showPlaylist && (
        <div className="playlist-drawer">
          <div className="drawer-header">
            <span className="drawer-title">✨ my discoveries</span>
            <button className="picker-close" onClick={() => setShowPlaylist(false)}>✕</button>
          </div>
          <div className="playlist-items">
            {playlist.map((a, i) => (
              <div key={i} className="playlist-item">
                <span className="playlist-num">{String(i+1).padStart(2,"0")}</span>
                <div className="playlist-meta">
                  <span className="playlist-name">{a.artist}</span>
                  {artistRatings[a.artist] > 0 && (
                    <span className="playlist-stars">{STAR_RATINGS[artistRatings[a.artist]]}</span>
                  )}
                  {artistNotes[a.artist] && (
                    <span className="playlist-note-preview">{artistNotes[a.artist].slice(0, 40)}{artistNotes[a.artist].length > 40 ? "…" : ""}</span>
                  )}
                </div>
                <button className="playlist-remove" onClick={() => togglePlaylist(a)}>✕</button>
              </div>
            ))}
          </div>
          {spotifyConnected && (
            <button className="save-playlist-btn" onClick={savePlaylist} disabled={savingPlaylist}>
              {savingPlaylist ? <Spinner /> : <SpotifyIcon size={14} />}
              {savingPlaylist ? "saving…" : "🎚️ save to spotify"}
            </button>
          )}
          {playlistSaved === "no_url" && (
            <p className="playlist-saved-link" style={{cursor:"default"}}>✓ Playlist created in Spotify</p>
          )}
          {playlistSaved && playlistSaved.startsWith("http") && (
            <a href={playlistSaved} target="_blank" rel="noreferrer" className="playlist-saved-link">
              ✓ Saved! Open in Spotify ↗
            </a>
          )}
          {playlistSaved === "no_ids" && (
            <p className="playlist-error">None of these artists have a verified Spotify profile — can't create playlist.</p>
          )}
          {playlistSaved === "token_expired" && (
            <p className="playlist-error">Session expired — please disconnect and reconnect Spotify.</p>
          )}
          {playlistSaved === "error" && (
            <p className="playlist-error">Failed to save. Check your Spotify connection and try again.</p>
          )}
          {!spotifyConnected && <p className="playlist-note">Connect Spotify to save this as a playlist</p>}
        </div>
      )}

      {showToast && (
        <div className="playlist-toast">
          <span>✓ Playlist saved</span>
          <a href={playlistSaved} target="_blank" rel="noreferrer">Open in Spotify ↗</a>
          <button onClick={() => setPlaylistSaved(null)}>✕</button>
        </div>
      )}

      {/* ── Color Picker ────────────────────────────────────────────── */}
      {showPicker && (
        <div className="color-picker-panel">
          <div className="picker-header">
            <span className="picker-title">🎨 pick your vibe colour</span>
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

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className={`header ${isInitial ? "hero" : "compact"}`}>
        <div className="wordmark">
          <span className="wordmark-un">un</span><span className="wordmark-cover">cover</span>
        </div>
        {isInitial && <p className="tagline">your next favourite artist is hiding 🧸</p>}
        {spotifyConnected && (
          <div className="spotify-connected-pill">
            <SpotifyIcon connected size={11} /> Spotify connected
          </div>
        )}
      </header>

      {/* ── Spotify suggestions ─────────────────────────────────────── */}
      {spotifyConnected && suggestions.length > 0 && isInitial && (
        <div className="suggestions-strip">
          <span className="strip-label">🎶 from your library</span>
          <div className="strip-tags">
            {suggestions.slice(0, 8).map((a, i) => (
              <button key={i} className="strip-tag" onClick={() => analyze(a.name || a)}>{a.name || a}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Obscurity panel ─────────────────────────────────────────── */}
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

      {/* ── Discovery insight strip ─────────────────────────────────── */}
      {!isInitial && (
        <div className="insight-strip">
          <div className="insight-item">
            <span className="insight-label">source</span>
            <strong>{spotifyConnected ? "spotify-first" : "hybrid mode"}</strong>
          </div>
          <div className="insight-item">
            <span className="insight-label">results</span>
            <strong>{recs.length}</strong>
          </div>
          <div className="insight-item">
            <span className="insight-label">filtered out</span>
            <strong>{droppedCount > 0 ? `${droppedCount} too-famous` : "—"}</strong>
          </div>
          <div className="insight-item">
            <span className="insight-label">playlist</span>
            <strong>{playlist.length} saved</strong>
          </div>
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────────────────── */}
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

      {/* ── Search history ──────────────────────────────────────────── */}
      {searchHistory.length > 0 && (
        <div className="history-strip">
          {searchHistory.map((h, i) => (
            <button key={i} className="history-chip" onClick={() => analyze(h)}>{h}</button>
          ))}
        </div>
      )}

      {error && <div className="error-bar">{error}</div>}

      {/* ── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="loading-block">
          <div className="loading-track"><div className="loading-fill" /></div>
          <p className="loading-step">{LOADING_STEPS[loadStep]}</p>
        </div>
      )}

      {/* ── Landing seeds ───────────────────────────────────────────── */}
      {isInitial && !spotifyConnected && (
        <div className="landing-seeds">
          <span className="seeds-label">✨ start with a vibe</span>
          <div className="seeds-cloud">
            {["Japanese Jazz","90s Memphis Rap","Dreampop","Darkwave","Ethiopian Funk",
              "Footwork","Emo Rap","Balearic","Lo-fi Country","Soviet Synth"].map(t => (
              <button key={t} className="seed-tag" onClick={() => handleTagClick(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Genre Mood Board ────────────────────────────────────────── */}
      {tags.length > 0 && !loading && (
        <GenreMoodBoard tags={tags} onTagClick={handleTagClick} />
      )}

      {/* ── Results header ──────────────────────────────────────────── */}
      {currentLevelInfo && !loading && recs.length > 0 && (
        <div className="results-header">
          <div className="level-banner">
            <span className="level-dot" />
            {recs.length} artists · {currentLevelInfo.description}
            {droppedCount > 0 && <span className="dropped-note"> · {droppedCount} too-famous filtered 🚫</span>}
          </div>
          <button className="go-deeper-btn" onClick={goDeeper}
            disabled={obscurityLevel === "ultra_deep"}
            title="Search one level more obscure">
            go deeper 🕳️
          </button>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!loading && !isInitial && recs.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">◉</div>
          <p className="empty-title">nothing found 🥺</p>
          <p className="empty-sub">try a broader vibe or loosen the depth slider a lil!</p>
          <button className="empty-action" onClick={() => { setObscurityLevel("underground"); if (input) analyze(input, "underground"); }}>
            try going a lil wider 🌱
          </button>
        </div>
      )}

      {/* ── Artist cards ────────────────────────────────────────────── */}
      <div className="artist-list">
        {recs.map((r, i) => {
          const uniqueTags = dedupeArtistTags(r.tags || [], tags);
          const followersStr = formatFollowers(r.followers);
          // FIX: check image_itunes as additional fallback source
          const imageSource = r.image || r.spotifyImage || r.image_itunes || null;
          const expanded = expandedCard === i;
          const saved = inPlaylist(r.artist);
          const note   = artistNotes[r.artist]   || "";
          const rating = artistRatings[r.artist] || 0;

          return (
            <article key={i} className={`artist-card ${expanded ? "expanded" : ""}`}
              style={{ animationDelay: `${i * 70}ms` }}>

              <div className="card-rank">{String(i + 1).padStart(2, "0")}</div>

              <ArtistImage src={imageSource} name={r.artist} />

              <div className="card-body">
                <div className="card-header">
                  <h3 className="card-name">{r.artist}</h3>
                  <div className="card-header-right">
                    <SpotifyCornerLink spotifyId={r.spotifyId} spotifyUrl={r.spotifyUrl} />
                    <button
                      className={`share-btn ${sharingId === i ? "sharing" : ""}`}
                      onClick={() => handleShare(r, i)}
                      title="Download as image"
                      disabled={sharingId === i}
                    >
                      {sharingId === i ? <Spinner /> : <ShareIcon />}
                    </button>
                    <button
                      className={`save-btn ${saved ? "saved" : ""}`}
                      onClick={() => togglePlaylist(r)}
                      title={saved ? "Remove from playlist" : "Add to playlist"}>
                      {saved ? "♥" : "♡"}
                    </button>
                  </div>
                </div>

                <div className="card-rating-row">
                  {[1,2,3,4,5].map(n => (
                    <button key={n}
                      className={`star-btn-sm ${n <= rating ? "filled" : ""}`}
                      onClick={() => setRatingFor(r.artist, rating === n ? 0 : n)}
                      title={`Rate ${n} star${n > 1 ? "s" : ""}`}>★</button>
                  ))}
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
                  {(() => {
                    const levelScores = { ultra_deep: 98, deep_cut: 85, underground: 65, emerging: 45, niche: 25 };
                    const displayScore = r.obscurityScore ?? levelScores[obscurityLevel] ?? 70;
                    return (
                      <>
                        <ObscurityRing score={displayScore} />
                        <SignalBars score={displayScore} />
                      </>
                    );
                  })()}
                  <div className="card-links">
                    {followersStr && (
                      <span className="follower-chip">
                        <PeopleIcon /> {followersStr}
                      </span>
                    )}
                    {/* FIX: backend now always sends lastfmUrl + lastfmVerified;
                        show link whenever lastfmVerified is true (listener count confirmed) */}
                    {r.lastfmUrl && r.lastfmVerified && (
                      <a href={r.lastfmUrl} target="_blank" rel="noreferrer" className="link-pill link-lastfm">Last.fm</a>
                    )}
                  </div>
                  <button className="expand-btn" onClick={() => setExpandedCard(expanded ? null : i)}
                    title={expanded ? "Collapse" : "Expand"}>
                    {expanded ? "↑" : "↓"}
                  </button>
                </div>

                {r.sampleUrl && (
                  <WaveformPlayer
                    src={r.sampleUrl}
                    isGlobalPlaying={playingId === i}
                    onPlay={() => setPlayingId(i)}
                  />
                )}

                {expanded && (
                  <div className="card-expanded">
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

                    <ArtistNotes
                      artistName={r.artist}
                      notes={note}
                      setNotes={(n) => setNoteFor(r.artist, n)}
                      rating={rating}
                      setRating={(rt) => setRatingFor(r.artist, rt)}
                    />
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

const ShareIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
