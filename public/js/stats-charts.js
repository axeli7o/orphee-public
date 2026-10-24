/* Orphée · « Mes écoutes par… » (graphique de « Moi »).
   Grammaire de « Moi » (v2.12.0) : barres arrondies au vert de l'app, le pic
   en vert clair ; total et pic sur une ligne ; pas de police machine. */
(function () {
  "use strict";

  const U = () => window.OrpheeUtil;
  const SCALES = [
    { key: "ans",     label: "Ans" },
    { key: "mois",    label: "Mois" },
    { key: "semaine", label: "Semaine" },
    { key: "journee", label: "Journée" },
  ];
  // Créneaux de la signature (heures de Paris), alignés sur buildCommuting.
  const DAY_WIN = [
    { key: "matin", label: "le matin", from: 7, to: 9 },
    { key: "soir",  label: "le soir",  from: 18, to: 20 },
    { key: "nuit",  label: "la nuit",  from: 0, to: 5 },
  ];
  const ce = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ── 01 · Écoutes par… ──────────────────────────────────────────────────────
  function buildEcoutes(ecoutes) {
    const sec = document.createElement("section");
    sec.className = "st-section";
    sec.appendChild(U().sectionHead("01", "Global", "Écoutes par…",
      "Le même flux, à cinq focales différentes."));

    // Segmented control
    const seg = document.createElement("div");
    seg.className = "st-seg o-seg";
    seg.setAttribute("role", "tablist");
    const thumb = document.createElement("div");
    thumb.className = "st-seg-thumb";
    seg.appendChild(thumb);
    const btns = SCALES.map((s, i) => {
      const b = document.createElement("button");
      b.className = "st-seg-btn" + (i === 0 ? " on" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === 0 ? "true" : "false");
      b.textContent = s.label;
      seg.appendChild(b);
      return b;
    });
    sec.appendChild(seg);

    // Hero row
    const hero = document.createElement("div");
    hero.className = "st-ecoutes-hero";
    const bignum = document.createElement("div");
    bignum.className = "st-bignum";
    const bigVal = document.createElement("span");
    bigVal.className = "k-stat";
    const bigUnit = document.createElement("span");
    bigUnit.className = "st-bignum-unit";
    bignum.appendChild(bigVal);
    bignum.appendChild(bigUnit);
    const peak = document.createElement("div");
    peak.className = "st-peak";
    const peakLab = document.createElement("span");
    peakLab.className = "st-peak-lab";
    peak.appendChild(peakLab);
    hero.appendChild(bignum);
    hero.appendChild(peak);
    sec.appendChild(hero);

    // Journée : une phrase à la place du héros (pas de total — PM-18).
    const phrase = document.createElement("p");
    phrase.className = "st-phrase";
    phrase.hidden = true;
    sec.appendChild(phrase);

    // Chart container
    const chartWrap = document.createElement("div");
    chartWrap.className = "st-chart";
    sec.appendChild(chartWrap);

    // Sous le graphe : l'album du créneau (Ans/Mois/Semaine) ou les
    // signatures de créneau (Journée, refonte v2.46.0).
    const dayBox = document.createElement("div");
    dayBox.className = "st-day";
    dayBox.hidden = true;
    sec.appendChild(dayBox);
    let pickIdx = null; // ans/mois/semaine : barre choisie (défaut = pic)

    // Sélection par délégation sur le conteneur stable. Pas de survol qui
    // redessine le SVG : au tap, il détachait la barre avant le clic et le
    // navigateur envoyait le clic sur le nœud détaché, qui ne remontait jamais
    // jusqu'à chartWrap (d'où « seule Journée marche » — elle n'a pas de survol).
    chartWrap.addEventListener("click", (e) => {
      if (activeScale.key === "journee") return; // Journée : non interactif.
      const rect = e.target.closest("[data-idx]");
      if (!rect) return;
      const ds = ecoutes[activeScale.key];
      if (!ds) return;
      const i = parseInt(rect.dataset.idx, 10);
      if (window.OrpheeJuice) window.OrpheeJuice.buzz(8);
      pickIdx = i;
      renderChart(activeScale, ds.data, growP);
      renderPick();
    });

    // State
    let activeScale = SCALES[0];
    let growP = 1;
    let growRaf = null;

    function positionThumb(idx) {
      const n = SCALES.length;
      thumb.style.left = `calc(3px + ${idx} * (100% - 6px) / ${n})`;
      thumb.style.width = `calc((100% - 6px) / ${n})`;
    }
    positionThumb(0);

    function renderChart(scale, data, p) {
      const W = chartWrap.clientWidth || 360;
      const H = 168, padB = 22, padT = 10;
      const n = data.length;
      const max = Math.max(1, ...data.map((d) => d.count));
      const maxIdx = data.reduce((mi, d, i) => (d.count > data[mi].count ? i : mi), 0);
      const innerH = H - padB - padT;
      const slot = W / n;
      const bw = Math.max(2, slot * (n > 30 ? 0.7 : 0.58));
      const yBase = padT + innerH;
      const labelEvery = n > 30 ? 12 : n > 16 ? 3 : 1;

      let markup = "";

      const day = scale.key === "journee";
      // Journée : les heures de pic (≥ 80 % du max) ressortent au vert clair,
      // le reste en vert sourd — « deux pics » (PM-18). Pas de sélection.
      const busy = day ? picHours(data) : null;

      // Baseline
      markup += `<line x1="0" y1="${yBase}" x2="${W}" y2="${yBase}" style="stroke:var(--border)" stroke-width="1"/>`;

      // Bars (hit-areas as invisible rects)
      data.forEach((d, i) => {
        const bh = Math.max(0, (d.count / max) * innerH * p);
        const by = yBase - bh;
        const bx = i * slot + (slot - bw) / 2;
        const sel = pickIdx != null ? pickIdx : maxIdx;
        const hot = day ? busy.has(d.hod) : i === sel;
        const fill = hot ? "var(--accent-hi)" : (day ? "var(--green-4)" : "var(--accent)");
        markup += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(3, bw / 2).toFixed(1)}" style="fill:${fill}"/>`;
        markup += `<rect x="${(i * slot).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${innerH}" fill="transparent" ${day ? "" : "style=\"cursor:pointer\" "}data-idx="${i}"/>`;
      });

      // X labels
      data.forEach((d, i) => {
        if (i % labelEvery === 0 || i === n - 1) {
          markup += `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="st-axis-x">${d.label}</text>`;
        }
      });

      chartWrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${markup}</svg>`;
      // Clic/tap : géré par délégation sur chartWrap (voir plus haut).
    }

    // Heures de pic : ≥ 80 % du max (les « bosses » de la journée).
    function picHours(data) {
      const max = Math.max(1, ...data.map((d) => d.count));
      return new Set(data.filter((d) => d.count >= 0.8 * max).map((d) => d.hod));
    }

    // Phrase d'accroche de la Journée : nomme les créneaux qui portent un pic.
    function picPhrase(data) {
      const busy = picHours(data);
      const hit = DAY_WIN.filter((w) => data.some((d) =>
        busy.has(d.hod) && d.hod >= w.from && d.hod <= w.to));
      phrase.textContent = "";
      if (hit.length >= 2) {
        phrase.append("Ta journée a deux pics : ");
        phrase.appendChild(ce("b", null, hit[0].label));
        phrase.append(" et ");
        phrase.appendChild(ce("b", null, hit[1].label));
        phrase.append(".");
      } else if (hit.length === 1) {
        phrase.append("Ton pic, c’est ");
        phrase.appendChild(ce("b", null, hit[0].label));
        phrase.append(".");
      } else {
        phrase.textContent = "Tes écoutes, heure par heure.";
      }
    }

    // Journée : les signatures de créneau (genres + artistes sur-représentés).
    function renderSignatures() {
      const ds = ecoutes.journee;
      dayBox.innerHTML = "";
      if (!ds || !ds.signatures) return;
      dayBox.appendChild(ce("p", "st-sig-head",
        "Ce que tu écoutes à chaque moment — plus qu’au reste de la journée."));
      const blk = ce("div", "st-sig");
      [["matin", "Matin"], ["soir", "Soir"], ["nuit", "Nuit"]].forEach(
        ([key, label]) => {
          const sig = ds.signatures[key];
          const gen = ((sig && sig.genres) || []).map((x) => x.genre).join(" · ");
          const who = ((sig && sig.artists) || []).map((x) => x.artist)
            .join(" · ");
          if (!gen && !who) return;
          const row = ce("div", "st-sig-row");
          const mo = ce("div", "st-sig-mo");
          mo.appendChild(ce("span", "st-sig-dot d-" + key));
          mo.appendChild(ce("span", null, label));
          const txt = ce("div", "st-sig-who");
          if (gen) txt.appendChild(ce("div", "st-sig-gen", gen));
          if (who) txt.appendChild(ce("div", "st-sig-art", who));
          row.appendChild(mo);
          row.appendChild(txt);
          blk.appendChild(row);
        });
      dayBox.appendChild(blk);
    }

    // Carte de l'album d'un créneau (tappable → fiche). Réutilisée par
    // « Ma journée » (moment/heure) et par Ans/Mois/Semaine (barre touchée).
    function albumCard(when, count, top, ctx) {
      const card = document.createElement(top ? "button" : "div");
      card.className = "st-day-pick";
      if (top) {
        card.type = "button";
        card.setAttribute("aria-label", `${top.album} — ouvrir la fiche`);
        card.addEventListener("click", () => document.dispatchEvent(new CustomEvent("orphee:open-album",
            { detail: { album_sur: top.album_sur } })));
        const cov = document.createElement("div");
        cov.className = "st-day-cover";
        if (typeof window.renderCover === "function") window.renderCover(cov, top);
        card.appendChild(cov);
      }
      const txt = document.createElement("div");
      txt.className = "st-day-txt";
      const small = document.createElement("small");
      small.textContent = `${when} · ${U().fmt(count)} écoutes`;
      txt.appendChild(small);
      const b = document.createElement("b");
      b.textContent = top ? top.album : "Rien d’écouté";
      txt.appendChild(b);
      if (top) {
        const em = document.createElement("span");
        em.textContent = `${top.artist} · ${U().fmt(top.count)} écoutes ${ctx}`.trim();
        txt.appendChild(em);
      }
      card.appendChild(txt);
      return card;
    }

    // Ans/Mois/Semaine : l'album du créneau choisi (défaut = pic).
    function renderPick() {
      dayBox.innerHTML = "";
      const ds = ecoutes[activeScale.key];
      if (!ds) return;
      const data = ds.data;
      const maxIdx = data.reduce((mi, d, i) => (d.count > data[mi].count ? i : mi), 0);
      const d = data[pickIdx != null ? pickIdx : maxIdx];
      if (!d) return;
      dayBox.appendChild(albumCard(d.when || d.label, d.count, d.top || null, d.when || ""));
    }

    function startGrow(scale, data) {
      if (growRaf) cancelAnimationFrame(growRaf);
      const reduced = U().PREFERS_REDUCED;
      if (reduced) { growP = 1; renderChart(scale, data, 1); return; }
      growP = 0;
      let start;
      const dur = 820;
      const step = (ts) => {
        start = start || ts;
        growP = U().easeOut(U().clamp((ts - start) / dur, 0, 1));
        renderChart(scale, data, growP);
        if (growP < 1) growRaf = requestAnimationFrame(step); else growP = 1;
      };
      growRaf = requestAnimationFrame(step);
    }

    function switchScale(idx) {
      const scale = SCALES[idx];
      activeScale = scale;
      positionThumb(idx);
      btns.forEach((b, i) => {
        b.classList.toggle("on", i === idx);
        b.setAttribute("aria-selected", i === idx ? "true" : "false");
      });

      const ds = ecoutes[scale.key];
      const day = scale.key === "journee";
      // Le héros (total + pic) : masqué en Journée (pas de total — PM-18) ;
      // `hidden` ne suffit pas (CSS force display), on force le display.
      hero.style.display = day ? "none" : "";
      if (!ds) {
        dayBox.hidden = true;
        phrase.hidden = true;
        chartWrap.innerHTML = `<p class="st-unavail">Données bientôt disponibles pour cette focale.</p>`;
        bigVal.textContent = "—";
        bigUnit.textContent = scale.label;
        peakLab.textContent = "";
        return;
      }
      const data = ds.data;
      pickIdx = null;
      dayBox.hidden = false;
      // Journée : pas de total ni de pic chiffré — une phrase + les signatures.
      phrase.hidden = !day;
      if (day) {
        picPhrase(data);
        renderSignatures();
      } else {
        renderPick();
        const total = data.reduce((s, d) => s + d.count, 0);
        const peakD = data.reduce((a, b) => (b.count > a.count ? b : a));
        U().countUp(bigVal, total, "rich");
        bigUnit.textContent = " écoutes";
        peakLab.textContent = `pic : ${peakD.label} · ${U().fmt(peakD.count)}`;
      }
      startGrow(scale, data);
    }

    btns.forEach((b, i) => b.addEventListener("click", () => switchScale(i)));

    // Initialise with "ans" scale
    return { sec, init(data) { switchScale(0); } };
  }

  window.OrpheeStatsCharts = { buildEcoutes };
})();
