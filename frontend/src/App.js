import { useState, useRef, useEffect } from "react";
import "./App.css";

// --- Custom Player ---
const CustomPlayer = ({ src }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="custom-player">
      <audio 
        ref={audioRef} 
        src={src} 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)}
      />
      <button className="play-btn" onClick={togglePlay}>
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <span className="player-label">{isPlaying ? "Playing Snippet" : "Play Preview"}</span>
    </div>
  );
};

// --- Color Theme Generator ---
const generateTheme = (r, g, b) => {
  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
        default: h = 0;
      }
    }
    return [h * 360, s * 100, l * 100];
  };

  const hslToRgb = (h, s, l) => {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  const [h, s, l] = rgbToHsl(r, g, b);
  
  const accent = `rgb(${r}, ${g}, ${b})`;
  const [hr, hg, hb] = hslToRgb(h, Math.min(s + 10, 100), Math.min(l + 10, 90));
  const accentHover = `rgb(${hr}, ${hg}, ${hb})`;
  
  const [bgr, bgg, bgb] = hslToRgb(h, Math.max(s - 10, 20), Math.max(l - 55, 5));
  const bg = `rgb(${bgr}, ${bgg}, ${bgb})`;
  
  const [cbr, cbg, cbb] = hslToRgb(h, Math.max(s - 15, 15), Math.max(l - 40, 10));
  const cardBg = `rgb(${cbr}, ${cbg}, ${cbb})`;
  
  const [bdr, bdg, bdb] = hslToRgb(h, Math.max(s - 12, 18), Math.max(l - 45, 12));
  const border = `rgb(${bdr}, ${bdg}, ${bdb})`;
  
  const [fgr, fgg, fgb] = hslToRgb(h, Math.max(s - 40, 10), Math.min(l + 60, 92));
  const fg = `rgb(${fgr}, ${fgg}, ${fgb})`;
  
  return { accent, accentHover, bg, cardBg, border, fg };
};

const OBSCURITY_LEVELS = [
  { value: "ultra_deep", label: "Ultra Deep", followers: "1K", emoji: "🔬" },
  { value: "deep_cut", label: "Deep Cut", followers: "10K", emoji: "💎" },
  { value: "underground", label: "Underground", followers: "50K", emoji: "🌑" },
  { value: "emerging", label: "Emerging", followers: "100K", emoji: "🌱" },
  { value: "niche", label: "Niche", followers: "500K", emoji: "🎯" }
];

function App() {
  const [input, setInput] = useState("");
  const [tags, setTags] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [obscurityLevel, setObscurityLevel] = useState("deep_cut");
  const [currentLevelInfo, setCurrentLevelInfo] = useState(null);
  
  // Theme colors
  const [colorR, setColorR] = useState(118);
  const [colorG, setColorG] = useState(75);
  const [colorB, setColorB] = useState(162);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Spotify integration
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Apply theme to CSS variables
  useEffect(() => {
    const theme = generateTheme(colorR, colorG, colorB);
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-hover', theme.accentHover);
    document.documentElement.style.setProperty('--bg', theme.bg);
    document.documentElement.style.setProperty('--card-bg', theme.cardBg);
    document.documentElement.style.setProperty('--border', theme.border);
    document.documentElement.style.setProperty('--fg', theme.fg);
  }, [colorR, colorG, colorB]);

  // Handle Spotify OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code) {
      exchangeSpotifyToken(code);
      window.history.replaceState({}, document.title, "/");
    }
    
    // Check for existing token
    const savedToken = localStorage.getItem('spotify_token');
    if (savedToken) {
      setSpotifyToken(savedToken);
      setSpotifyConnected(true);
      loadSpotifySuggestions(savedToken);
    }
  }, []);

  const connectSpotify = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/spotify/auth-url");
      const data = await res.json();
      window.location.href = data.auth_url;
    } catch (e) {
      setError("Failed to connect to Spotify");
    }
  };

  const exchangeSpotifyToken = async (code) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/spotify/token?code=${code}`, {
        method: "POST"
      });
      const data = await res.json();
      
      if (data.access_token) {
        setSpotifyToken(data.access_token);
        setSpotifyConnected(true);
        localStorage.setItem('spotify_token', data.access_token);
        loadSpotifySuggestions(data.access_token);
      }
    } catch (e) {
      setError("Failed to authenticate with Spotify");
    }
  };

  const loadSpotifySuggestions = async (token) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/spotify/suggestions?token=${token}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error("Failed to load suggestions:", e);
    }
  };

  const disconnectSpotify = () => {
    setSpotifyToken(null);
    setSpotifyConnected(false);
    setSuggestions([]);
    localStorage.removeItem('spotify_token');
  };

  const analyze = async (searchTerm = null) => {
    const query = typeof searchTerm === "string" ? searchTerm : input;
    
    if (!query || !query.trim()) return;

    if (typeof searchTerm === "string") {
      setInput(searchTerm);
    }

    setLoading(true);
    setError("");
    setTags([]);
    setRecs([]);

    try {
      const artists = query.split(",").map(a => a.trim()).filter(Boolean);
      const res = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          artists,
          obscurity_level: obscurityLevel,
          spotify_token: spotifyToken
        }),
      });

      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setTags(data.tags || []);
      setRecs(data.recommendations || []);
      setCurrentLevelInfo({
        level: data.obscurity_level,
        max_followers: data.max_followers,
        description: data.description
      });
    } catch (e) {
      setError("Could not fetch recommendations.");
    } finally {
      setLoading(false);
    }
  };

  const handleTagClick = (tag) => {
    analyze(tag);
  };

  const isInitial = tags.length === 0 && recs.length === 0 && !loading;

  const formatFollowers = (count) => {
    if (!count) return "Unknown";
    if (count < 1000) return `${count}`;
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  };

  return (
    <div className="app-container">
      {/* Theme Toggle Button */}
      <button 
        className="theme-toggle"
        onClick={() => setShowColorPicker(!showColorPicker)}
        title="Customize theme"
      >
        🎨
      </button>

      {/* Spotify Connect Button */}
      <button 
        className="spotify-toggle"
        onClick={spotifyConnected ? disconnectSpotify : connectSpotify}
        title={spotifyConnected ? "Disconnect Spotify" : "Connect Spotify"}
      >
        🎵
      </button>

      {showColorPicker && (
        <div className="color-picker-panel">
          <div className="color-picker-header">
            <h3>Theme Color</h3>
            <button className="close-picker" onClick={() => setShowColorPicker(false)}>✕</button>
          </div>
          
          <div className="color-preview" style={{ background: `rgb(${colorR}, ${colorG}, ${colorB})` }}>
            <span className="color-value">rgb({colorR}, {colorG}, {colorB})</span>
          </div>

          <div className="rgb-sliders">
            <div className="slider-group">
              <label>
                <span className="slider-label">Red</span>
                <span className="slider-value">{colorR}</span>
              </label>
              <input
                type="range"
                min="0"
                max="255"
                value={colorR}
                onChange={(e) => setColorR(parseInt(e.target.value))}
                className="color-slider red-slider"
              />
            </div>

            <div className="slider-group">
              <label>
                <span className="slider-label">Green</span>
                <span className="slider-value">{colorG}</span>
              </label>
              <input
                type="range"
                min="0"
                max="255"
                value={colorG}
                onChange={(e) => setColorG(parseInt(e.target.value))}
                className="color-slider green-slider"
              />
            </div>

            <div className="slider-group">
              <label>
                <span className="slider-label">Blue</span>
                <span className="slider-value">{colorB}</span>
              </label>
              <input
                type="range"
                min="0"
                max="255"
                value={colorB}
                onChange={(e) => setColorB(parseInt(e.target.value))}
                className="color-slider blue-slider"
              />
            </div>
          </div>

          <div className="preset-colors">
            <span className="preset-label">Presets:</span>
            <div className="preset-grid">
              <button onClick={() => { setColorR(118); setColorG(75); setColorB(162); }} style={{ background: 'rgb(118, 75, 162)' }} title="Purple (Default)" />
              <button onClick={() => { setColorR(220); setColorG(38); setColorB(127); }} style={{ background: 'rgb(220, 38, 127)' }} title="Pink" />
              <button onClick={() => { setColorR(37); setColorG(99); setColorB(235); }} style={{ background: 'rgb(37, 99, 235)' }} title="Blue" />
              <button onClick={() => { setColorR(16); setColorG(185); setColorB(129); }} style={{ background: 'rgb(16, 185, 129)' }} title="Green" />
              <button onClick={() => { setColorR(245); setColorG(158); setColorB(11); }} style={{ background: 'rgb(245, 158, 11)' }} title="Orange" />
              <button onClick={() => { setColorR(239); setColorG(68); setColorB(68); }} style={{ background: 'rgb(239, 68, 68)' }} title="Red" />
              <button onClick={() => { setColorR(20); setColorG(184); setColorB(166); }} style={{ background: 'rgb(20, 184, 166)' }} title="Teal" />
              <button onClick={() => { setColorR(168); setColorG(85); setColorB(247); }} style={{ background: 'rgb(168, 85, 247)' }} title="Violet" />
            </div>
          </div>
        </div>
      )}

      <header className={`header ${isInitial ? 'hero-mode' : ''}`}>
        <h1>Uncover</h1>
        <p className="subtitle">Navigate the underground.</p>
        {spotifyConnected && (
          <span className="spotify-badge">✓ Spotify Connected</span>
        )}
      </header>

      {/* Spotify Suggestions */}
      {spotifyConnected && suggestions.length > 0 && isInitial && (
        <div className="spotify-suggestions">
          <p className="suggestion-label">📊 Based on your Spotify listening:</p>
          <div className="tag-cloud center">
            {suggestions.slice(0, 8).map((artist, idx) => (
              <span key={idx} className="tag clickable spotify-tag" onClick={() => analyze(artist)}>
                {artist}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Obscurity Filter */}
      <div className="obscurity-filter">
        <label className="filter-label">
          Max Followers: <span className="current-level">{OBSCURITY_LEVELS.find(l => l.value === obscurityLevel)?.followers}</span>
        </label>
        <div className="obscurity-slider-container">
          <input
            type="range"
            min="0"
            max="4"
            value={OBSCURITY_LEVELS.findIndex(l => l.value === obscurityLevel)}
            onChange={(e) => setObscurityLevel(OBSCURITY_LEVELS[parseInt(e.target.value)].value)}
            className="obscurity-slider"
            style={{
              background: `linear-gradient(to right, 
                ${generateTheme(colorR, colorG, colorB).accentHover} 0%, 
                ${generateTheme(colorR, colorG, colorB).accent} 50%, 
                ${generateTheme(colorR, colorG, colorB).cardBg} 100%
              )`
            }}
          />
          <div className="slider-labels">
            {OBSCURITY_LEVELS.map((level, idx) => (
              <div 
                key={level.value} 
                className={`slider-label ${obscurityLevel === level.value ? 'active' : ''}`}
                onClick={() => setObscurityLevel(level.value)}
              >
                <span className="level-emoji">{level.emoji}</span>
                <span className="level-name">{level.label}</span>
                <span className="level-desc">{level.followers}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="search-section">
        <textarea
          rows={1}
          placeholder="Enter artists, genres, or a vibe..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              analyze();
            }
          }}
        />
        <button className="btn-main" onClick={() => analyze()} disabled={loading}>
          {loading ? "SEARCHING" : "ANALYZE"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Show message if no results found */}
      {!loading && !error && tags.length > 0 && recs.length === 0 && (
        <div className="no-results">
          <p>😔 No artists found matching your criteria.</p>
          <p>Try increasing the max followers limit or adjusting your search.</p>
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-bar"></div>
          <p className="loading-text">Triangulating obscure frequencies...</p>
        </div>
      )}

      {currentLevelInfo && !loading && (
        <div className="level-info-banner">
          <span className="info-icon">ℹ️</span>
          Showing {currentLevelInfo.description} (max {currentLevelInfo.max_followers?.toLocaleString()} followers)
        </div>
      )}

      {isInitial && !error && !spotifyConnected && (
        <div className="landing-suggestions">
          <p className="suggestion-label">Or start a journey with:</p>
          <div className="tag-cloud center">
            {["Japanese Jazz", "90s Memphis Rap", "Dreampop", "Darkwave", "Ethiopian Funk"].map((t) => (
              <span key={t} className="tag clickable" onClick={() => handleTagClick(t)}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className="vibe-section">
          <span className="section-label">Current Coordinates</span>
          <div className="tag-cloud">
            {tags.map((t, i) => (
              <span key={i} className="tag clickable" onClick={() => handleTagClick(t)}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="artist-list">
        {recs.map((r, i) => (
          <div key={i} className="artist-item">
            <img 
              src={r.image || "https://via.placeholder.com/150/2a0a38/ffffff?text=?"} 
              alt={r.artist} 
              className="artist-img"
            />
            <div className="artist-info">
              <div className="artist-header">
                <h3 className="artist-name">
                  {r.artist}
                  {r.verified && <span className="verified-badge" title="Verified on Spotify">✓</span>}
                </h3>
                <div className="artist-meta">
                  {r.followers !== null && r.followers !== undefined && (
                    <span className="follower-count" title={`${r.followers?.toLocaleString()} followers on Spotify`}>
                      👥 {formatFollowers(r.followers)}
                    </span>
                  )}
                  {r.spotifyUri && (
                    <a href={r.spotifyUri} target="_blank" rel="noreferrer" className="track-link spotify-link">
                      Spotify ↗
                    </a>
                  )}
                  <a href={r.primaryUrl} target="_blank" rel="noreferrer" className="track-link">
                    {r.primaryUrlLabel} ↗
                  </a>
                  {r.youtubeUrl && r.primaryUrlLabel !== "YouTube" && (
                    <a href={r.youtubeUrl} target="_blank" rel="noreferrer" className="track-link secondary-link">
                      YouTube ↗
                    </a>
                  )}
                </div>
              </div>
              
              {r.tags && (
                <div className="artist-tags">
                  {r.tags.map((tag, idx) => (
                    <span 
                      key={idx} 
                      className="mini-tag clickable" 
                      onClick={() => handleTagClick(tag)}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="artist-desc">{r.explanation}</p>

              {r.obscurityScore !== null && r.obscurityScore !== undefined && (
                <div className="obscurity-badge">
                  Obscurity Score: {r.obscurityScore}/100
                </div>
              )}

              {/* Follower source breakdown */}
              {r.followerSources && (r.followerSources.spotify || r.followerSources.youtube || r.followerSources.lastfm) && (
                <div className="follower-sources">
                  <span className="sources-label">Data sources:</span>
                  {r.followerSources.spotify && (
                    <span className="source-item spotify">
                      Spotify: {formatFollowers(r.followerSources.spotify)}
                    </span>
                  )}
                  {r.followerSources.youtube && (
                    <span className="source-item youtube">
                      YouTube: {formatFollowers(r.followerSources.youtube)}
                    </span>
                  )}
                  {r.followerSources.lastfm && (
                    <span className="source-item lastfm">
                      Last.fm: {formatFollowers(r.followerSources.lastfm)}
                    </span>
                  )}
                </div>
              )}

              {/* Spotify Embed */}
              {r.spotifyEmbed && (
                <div className="spotify-embed-container">
                  <iframe 
                    src={r.spotifyEmbed}
                    width="100%" 
                    height="152" 
                    frameBorder="0" 
                    allow="encrypted-media"
                    title={`Spotify player for ${r.artist}`}
                  ></iframe>
                </div>
              )}

              {r.sampleUrl && !r.spotifyEmbed && (
                <CustomPlayer src={r.sampleUrl} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
