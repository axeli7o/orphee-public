/* Orphée · Stats — shared primitives (vanilla JS, no framework). */
(function () {
  "use strict";

  const PREFERS_REDUCED =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(n) {
    return Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function onInView(el, cb, opts) {
    if (typeof IntersectionObserver === "undefined") { cb(); return; }
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { cb(); io.unobserve(el); } });
    }, { threshold: 0.18, ...(opts || {}) });
    io.observe(el);
  }

  function countUp(el, value, motion, dur) {
    dur = dur || 850;
    if (motion === "minimal" || PREFERS_REDUCED) { el.textContent = fmt(value); return; }
    el.textContent = fmt(0);
    let ran = false;
    onInView(el, () => {
      const d = ran ? 380 : (motion === "subtle" ? dur * 0.7 : dur);
      ran = true;
      let raf, start;
      const step = (ts) => {
        start = start || ts;
        const t = clamp((ts - start) / d, 0, 1);
        el.textContent = fmt(value * easeOut(t));
        if (t < 1) raf = requestAnimationFrame(step); else el.textContent = fmt(value);
      };
      raf = requestAnimationFrame(step);
    });
  }

  function revealEl(el, motion, delay) {
    if (motion === "minimal" || PREFERS_REDUCED) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(14px)";
    onInView(el, () => {
      el.style.transition = `opacity .6s var(--ease) ${delay || 0}ms, transform .6s var(--ease) ${delay || 0}ms`;
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  function sectionHead(n, eyebrow, title, sub, apercu) {
    const h = document.createElement("header");
    h.className = "st-head";
    const ew = document.createElement("div");
    ew.className = "st-eyebrow";
    if (n != null) {
      const ns = document.createElement("span");
      ns.className = "st-eyebrow-n";
      ns.textContent = n;
      ew.appendChild(ns);
    }
    const et = document.createElement("span");
    et.textContent = " " + eyebrow;
    ew.appendChild(et);
    if (apercu) {
      const ap = document.createElement("span");
      ap.className = "st-apercu";
      ap.textContent = "Aperçu";
      ew.appendChild(ap);
    }
    h.appendChild(ew);
    const tl = document.createElement("h2");
    tl.className = "st-title";
    tl.textContent = title;
    h.appendChild(tl);
    if (sub) {
      const sb = document.createElement("p");
      sb.className = "st-sub";
      sb.textContent = sub;
      h.appendChild(sb);
    }
    return h;
  }

  function orpheeLine(text) {
    const p = document.createElement("p");
    p.className = "st-orphee";
    const mark = document.createElement("span");
    mark.className = "st-orphee-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.4c.3 3.1 1.6 5.4 4.7 5.7-3.1.3-4.4 2.6-4.7 5.7-.3-3.1-1.6-5.4-4.7-5.7C8.4 7.8 9.7 5.5 10 2.4Z"/><circle cx="15.4" cy="14.4" r="1.7"/></svg>`;
    p.appendChild(mark);
    const body = document.createElement("span");
    text.split(/(\*[^*]+\*)/g).forEach((part) => {
      if (part.startsWith("*") && part.endsWith("*")) {
        const em = document.createElement("em");
        em.textContent = part.slice(1, -1);
        body.appendChild(em);
      } else {
        body.appendChild(document.createTextNode(part));
      }
    });
    p.appendChild(body);
    return p;
  }

  function gradeBadge(g, size) {
    size = size || 18;
    const d = (window.ORPHEE_GRADE_COLORS || {})[g] || { bg: "#6b6b73", fg: "#e8eae9" };
    const s = document.createElement("span");
    s.className = "st-grade-badge";
    s.title = (window.ORPHEE_GRADES || {})[g] || String(g);
    s.textContent = g;
    s.style.cssText = `background:${d.bg};color:${d.fg};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px;`;
    return s;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Référence unique : refdata.js (ORPHEE_GENRE_COLORS).
  const GENRE_COLORS = window.ORPHEE_GENRE_COLORS || {};

  function generativeCover(artist, album, size, radius, genre) {
    size = size || 44; radius = radius || 8;
    const seed = hashStr(artist + "·" + album);
    const base = GENRE_COLORS[genre] || "#3fc58e";
    const b = `hsl(${hashStr(album) % 360} 40% 22%)`;
    const kind = seed % 3;
    const id = "cg" + seed;
    const shapes = [
      `<circle cx="${11 + (seed % 22)}" cy="${11 + ((seed >> 3) % 22)}" r="16" fill="${base}" opacity="0.35"/>`,
      `<rect x="0" y="22" width="44" height="22" fill="#0a0c0b" opacity="0.28" transform="rotate(${(seed % 60) - 30} 22 22)"/>`,
      `<path d="M0 30 L22 14 L44 30 V44 H0 Z" fill="#0a0c0b" opacity="0.30"/>`,
    ];
    const wrap = document.createElement("span");
    wrap.className = "st-cover";
    wrap.style.cssText = `width:${size}px;height:${size}px;border-radius:${radius}px;flex-shrink:0;`;
    wrap.innerHTML = `<svg viewBox="0 0 44 44" width="${size}" height="${size}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${b}"/>
      </linearGradient></defs>
      <rect width="44" height="44" fill="url(#${id})"/>
      ${shapes[kind]}
    </svg><span class="st-cover-init" style="font-size:${Math.round(size * 0.34)}px">${(artist[0] || "?").toUpperCase()}</span>`;
    return wrap;
  }

  function sparklineSvg(data, color, w, h, motion) {
    color = color || "#3fc58e"; w = w || 96; h = h || 26;
    const max = Math.max(1, ...data);
    const pts = data.map((v, i) => [
      (i / Math.max(1, data.length - 1)) * (w - 2) + 1,
      h - 2 - (v / max) * (h - 4),
    ]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const lp = pts[pts.length - 1];
    const animated = motion !== "minimal" && !PREFERS_REDUCED;
    const dashAttr = animated
      ? `style="stroke-dasharray:240;stroke-dashoffset:240;transition:stroke-dashoffset 1s var(--ease)"`
      : "";
    const container = document.createElement("span");
    container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="st-spark" preserveAspectRatio="none">
      <path d="${d} L${w - 1} ${h} L1 ${h}Z" fill="${color}" opacity="0.13"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" ${dashAttr}/>
      <circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="2.1" fill="${color}"/>
    </svg>`;
    const svg = container.firstElementChild;
    if (animated) {
      const pathLine = svg.querySelectorAll("path")[1];
      onInView(svg, () => { pathLine.style.strokeDashoffset = "0"; });
    }
    return svg;
  }

  /**
   * Returns an img if cover_url exists, generative cover otherwise.
   * @param {string|null} coverUrl
   * @param {string} artist
   * @param {string} album
   * @param {number} size
   * @param {number} radius
   * @param {string} [genre]
   * @return {HTMLElement}
   */
  function coverEl(coverUrl, artist, album, size, radius, genre) {
    if (coverUrl) {
      const img = document.createElement("img");
      img.src = coverUrl;
      img.alt = album || "";
      img.draggable = false;
      img.style.cssText =
        `width:${size}px;height:${size}px;border-radius:${radius}px;` +
        "object-fit:cover;display:block;flex-shrink:0;";
      return img;
    }
    return generativeCover(artist, album, size, radius, genre);
  }

  function openAlbum(albumSur) {
    if (!albumSur) return;
    document.dispatchEvent(
        new CustomEvent("orphee:open-album", {detail: {album_sur: albumSur}}),
    );
  }

  function makeClickable(el, albumSur) {
    if (!albumSur) return;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => openAlbum(albumSur));
  }

  window.OrpheeUtil = {
    fmt, clamp, easeOut, PREFERS_REDUCED, onInView,
    countUp, revealEl, sectionHead, orpheeLine,
    gradeBadge, hashStr, generativeCover, coverEl, sparklineSvg, GENRE_COLORS,
    openAlbum, makeClickable,
  };
})();
