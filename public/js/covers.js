/* Orphée — generative cover-art engine (vanilla JS port of design handoff covers.jsx).
   Deterministic: same album → same art, always.
   Exports: window.coverPalette, window.coverInitials, window.renderCover */
(function () {
  "use strict";

  // ---- deterministic hash + PRNG ----------------------------------------
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- per-genre art direction ------------------------------------------
  const ART = {
    Classical: { motif: "arcs",    sat: 30, light: 44, shift: 22,  ink: 88 },
    Electro:   { motif: "bars",    sat: 68, light: 50, shift: 46,  ink: 90 },
    Rap:       { motif: "split",   sat: 52, light: 46, shift: -28, ink: 92 },
    Rock:      { motif: "horizon", sat: 34, light: 40, shift: 14,  ink: 84 },
    Pop:       { motif: "orbit",   sat: 64, light: 56, shift: 38,  ink: 94 },
    Jazz:      { motif: "spot",    sat: 40, light: 42, shift: 18,  ink: 86 },
    Blues:     { motif: "spot",    sat: 46, light: 38, shift: 20,  ink: 84 },
    Reggae:    { motif: "tri",     sat: 58, light: 46, shift: 60,  ink: 90 },
    Podcast:   { motif: "layers",  sat: 24, light: 42, shift: 16,  ink: 86 },
    default:   { motif: "layers",  sat: 36, light: 44, shift: 20,  ink: 88 },
  };

  const GRAIN = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='140'%20height='140'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='2'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23n)'/%3E%3C/svg%3E";

  function initials(albumTitle) {
    const clean = (albumTitle || "").replace(/[^0-9A-Za-zÀ-ÿ ]/g, "").trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) return "♪";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  function buildPalette(seed, genre) {
    const cfg = ART[genre] || ART.default;
    const h = seed % 360;
    const s = cfg.sat, l = cfg.light;
    return {
      cfg,
      h,
      c1: `hsl(${h} ${s}% ${l}%)`,
      c2: `hsl(${(h + cfg.shift + 360) % 360} ${Math.round(s * 0.92)}% ${Math.round(l * 0.5)}%)`,
      ink: `hsl(${(h + cfg.shift + 360) % 360} ${Math.round(s * 0.45)}% ${cfg.ink}%)`,
      deep: `hsl(${h} ${Math.round(s * 0.9)}% ${Math.round(l * 0.32)}%)`,
    };
  }

  // ---- motif renderers (SVG, 100×100 viewBox) ---------------------------
  function motifSvg(motif, rand, pal) {
    const ink = pal.ink, deep = pal.deep;
    const parts = [];

    if (motif === "arcs") {
      const cx = 12 + rand() * 30, cy = 90 + rand() * 16;
      for (let i = 6; i >= 1; i--) {
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${16 + i * 13}" fill="none" stroke="${ink}" stroke-width="${0.8 + rand() * 0.7}" opacity="${0.10 + i * 0.035}"/>`);
      }
      parts.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="${ink}" opacity="0.5"/>`);
    } else if (motif === "bars") {
      const n = 7 + Math.floor(rand() * 5);
      const gap = 100 / n;
      for (let i = 0; i < n; i++) {
        const hgt = 18 + rand() * 64;
        parts.push(`<rect x="${i * gap + gap * 0.18}" y="${100 - hgt}" width="${gap * 0.64}" height="${hgt}" rx="1.5" fill="${ink}" opacity="${0.28 + rand() * 0.45}"/>`);
      }
    } else if (motif === "split") {
      const ang = -22 + rand() * 44;
      parts.push(`<g transform="rotate(${ang} 50 50)"><rect x="-30" y="${36 + rand() * 16}" width="160" height="${14 + rand() * 12}" fill="${ink}" opacity="0.85"/></g>`);
      const r = 26 + rand() * 16;
      parts.push(`<circle cx="${72 + rand() * 22}" cy="${18 + rand() * 18}" r="${r}" fill="${deep}" opacity="0.55"/>`);
    } else if (motif === "horizon") {
      const base = 56 + rand() * 18;
      parts.push(`<circle cx="${64 + rand() * 24}" cy="${base - 28 - rand() * 14}" r="${10 + rand() * 9}" fill="${ink}" opacity="0.6"/>`);
      parts.push(`<rect x="0" y="${base}" width="100" height="${100 - base}" fill="${deep}" opacity="0.5"/>`);
      parts.push(`<rect x="0" y="${base + 6 + rand() * 8}" width="100" height="40" fill="${deep}" opacity="0.4"/>`);
      parts.push(`<line x1="0" y1="${base}" x2="100" y2="${base}" stroke="${ink}" stroke-width="1" opacity="0.55"/>`);
    } else if (motif === "orbit") {
      const cx = 70 + rand() * 18, cy = 30 + rand() * 14;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${22 + rand() * 14}" fill="${ink}" opacity="0.85"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${40 + rand() * 8}" fill="none" stroke="${ink}" stroke-width="1.1" opacity="0.4"/>`);
      parts.push(`<circle cx="${20 + rand() * 16}" cy="${74 + rand() * 14}" r="${5 + rand() * 4}" fill="${deep}" opacity="0.7"/>`);
    } else if (motif === "spot") {
      parts.push(`<rect x="6" y="6" width="88" height="88" fill="none" stroke="${ink}" stroke-width="0.9" opacity="0.4"/>`);
      parts.push(`<circle cx="${44 + rand() * 14}" cy="${44 + rand() * 14}" r="${5 + rand() * 5}" fill="${ink}" opacity="0.7"/>`);
    } else if (motif === "tri") {
      for (let i = 0; i < 3; i++) {
        parts.push(`<g transform="rotate(-32 50 50)"><rect x="${-20 + i * 40}" y="-40" width="22" height="180" fill="${i === 1 ? deep : ink}" opacity="${0.4 + i * 0.18}"/></g>`);
      }
    } else { // layers
      for (let i = 0; i < 3; i++) {
        parts.push(`<rect x="${8 + rand() * 30}" y="${8 + rand() * 30}" width="${34 + rand() * 30}" height="${34 + rand() * 30}" rx="4" fill="${i % 2 ? deep : ink}" opacity="${0.22 + rand() * 0.2}"/>`);
      }
    }
    return parts.join("");
  }

  // ---- public API -------------------------------------------------------

  /** Returns the two-tone palette for an album (used by the detail hero wash). */
  function coverPalette(album) {
    const a = album || {};
    const seed = hashStr((a.artist || "") + "::" + (a.album || ""));
    return buildPalette(seed, a.genre || a.sousgenre || "");
  }

  /** Returns the 1-2 letter monogram for an album title. */
  function coverInitials(albumTitle) {
    return initials(albumTitle);
  }

  /**
   * Renders a cover into `el` (any block container).
   * `el` must have explicit width/height set via CSS.
   *
   * If the album carries a real cover image URL (`cover_url`, see roadmap v0.2),
   * that image is shown — with the generative art as the automatic fallback if
   * the URL is missing or fails to load. Otherwise the deterministic generative
   * art is rendered.
   *
   * Pass `showMono: false` to suppress the letter overlay (e.g. small echo covers).
   */
  function coverUrl(album) {
    const a = album || {};
    return a.cover_url || a.coverUrl || a.cover || a.image_url || null;
  }

  function renderCover(el, album, opts) {
    const a = album || {};
    const url = coverUrl(a);
    if (url) {
      // Real cover: cheap palette gradient as the load placeholder, image on
      // top, generative art as the fallback if the image errors.
      const pal = buildPalette(hashStr((a.artist || "") + "::" + (a.album || "")),
        a.genre || a.sousgenre || "");
      el.style.background = `linear-gradient(135deg, ${pal.c1}, ${pal.c2})`;
      el.style.position = "relative";
      el.style.overflow = "hidden";
      el.innerHTML = "";
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block";
      img.addEventListener("error", () => {
        renderGenerative(el, a, opts);
      });
      img.src = url;
      el.appendChild(img);
      return;
    }
    renderGenerative(el, a, opts);
  }

  function renderGenerative(el, album, opts) {
    const a = album || {};
    const options = opts || {};
    const showMono = options.showMono !== false;

    const seed = hashStr((a.artist || "") + "::" + (a.album || ""));
    const rand = mulberry32(seed);
    const pal = buildPalette(seed, a.genre || a.sousgenre || "");
    const angle = 116 + (seed % 90);
    const mono = initials(a.album);

    el.style.background = `linear-gradient(${angle}deg, ${pal.c1}, ${pal.c2})`;
    el.style.position = "relative";
    el.style.overflow = "hidden";

    // SVG motif layer
    const svgLayer = document.createElement("div");
    svgLayer.style.cssText = "position:absolute;inset:0;pointer-events:none";
    svgLayer.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style="display:block">${motifSvg(pal.cfg.motif, rand, pal)}</svg>`;

    // grain overlay
    const grainLayer = document.createElement("div");
    grainLayer.style.cssText = `position:absolute;inset:0;background-image:url("${GRAIN}");background-size:140px 140px;opacity:0.10;mix-blend-mode:overlay;pointer-events:none`;

    // vignette + sheen
    const vignetteLayer = document.createElement("div");
    vignetteLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 40px rgba(0,0,0,0.28);background:linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0) 28%,rgba(0,0,0,0.10) 100%)";

    el.innerHTML = "";
    el.appendChild(svgLayer);
    // Sobre (v2.18.0) : un voile sombre calme couleurs et motif, pour ne pas
    // détonner à côté des vraies pochettes ; les initiales restent lisibles.
    const veil = document.createElement("div");
    veil.style.cssText = "position:absolute;inset:0;pointer-events:none;background:rgba(10,12,11,0.55)";
    el.appendChild(veil);

    if (showMono) {
      const monoEl = document.createElement("div");
      monoEl.style.cssText = `position:absolute;left:7%;bottom:4%;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:clamp(18px,34cqw,80px);line-height:0.9;letter-spacing:-0.03em;color:#e8eae9;opacity:0.82;text-shadow:0 1px 8px rgba(0,0,0,0.35);container-type:size`;
      monoEl.textContent = mono;
      el.appendChild(monoEl);
    }

    el.appendChild(grainLayer);
    el.appendChild(vignetteLayer);
  }

  Object.assign(window, { coverPalette, coverInitials, renderCover });
})();
