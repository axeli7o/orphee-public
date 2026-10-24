/* Orphée · Qualité des données (v2.23.0, PM-31 à PM-33, ADR-046).
   Onglet du propriétaire seul (IM-8) : taux de santé, titres à vérifier
   (une carte à la fois, avec sa preuve), corrections proposées, titres
   laissés tels quels, décisions d'Axel ; et la vérification MusicBrainz.
   Les propositions viennent de quality/* (dérivé, Functions seules) ; les
   décisions (arbitrages, curation) de users/{uid}/album_arbitrations, lues
   en direct à leur source (IM-5) et prioritaires (IM-9).
   Rien ne change dans la bibliothèque sans « Appliquer » (v2.30.0, E10). Sous-écrans et
   panneaux sont des couches de l'historique : « retour » les ferme. */
(function () {
  "use strict";

  const homeEl = document.getElementById("view-quality");
  if (!homeEl) return;
  // Écran courant : l'accueil, ou la carte d'un sous-écran (v2.31.0). Les
  // rendus écrivent dans `view`, qui pointe sur l'un ou l'autre.
  let view = homeEl;

  // Sous-écrans (revue, listes, lots) : une carte comme la fiche album —
  // poignée, on la tire vers le bas pour la fermer (ou geste retour). Plus
  // de bouton « ‹ Qualité ».
  const paneScrim = document.createElement("div");
  paneScrim.className = "q-pane-scrim";
  const pane = document.createElement("div");
  pane.className = "q-pane parked";
  pane.setAttribute("role", "dialog");
  pane.innerHTML = `<div class="q-pane-grip" aria-label="Fermer" role="button"><span></span></div><div class="q-pane-body"></div>`;
  document.body.append(paneScrim, pane);
  const paneBody = pane.querySelector(".q-pane-body");
  const paneGrip = pane.querySelector(".q-pane-grip");
  const closeLayerSub = () => (window.OrpheeNav ? window.OrpheeNav.closeLayer("quality-sub") : closeSub());
  paneScrim.addEventListener("click", closeLayerSub);
  paneGrip.addEventListener("click", closeLayerSub);
  // Tirer vers le bas : depuis la poignée, ou depuis le haut du contenu.
  let paneDrag = null;
  pane.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const onGrip = paneGrip.contains(e.target);
    if (!onGrip && paneBody.scrollTop > 0) return;
    paneDrag = { y0: e.touches[0].clientY, dy: 0, grip: onGrip };
  }, { passive: true });
  pane.addEventListener("touchmove", (e) => {
    if (!paneDrag) return;
    paneDrag.dy = e.touches[0].clientY - paneDrag.y0;
    if (paneDrag.dy > 0 && (paneDrag.grip || paneBody.scrollTop <= 0)) {
      e.preventDefault();
      pane.style.transition = "none";
      pane.style.transform = `translateY(${paneDrag.dy}px)`;
    }
  }, { passive: false });
  pane.addEventListener("touchend", () => {
    if (!paneDrag) return;
    const dy = paneDrag.dy;
    paneDrag = null;
    pane.style.transition = "";
    pane.style.transform = "";
    if (dy > 110) closeLayerSub();
  }, { passive: true });

  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n || 0);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const LIST_PAGE = 150;
  const ARM_MS = 400; // carte fraîche : touchers ignorés (anti-rafale)

  const state = {
    loaded: false, loading: false, summary: null, items: [],
    arbs: new Map(), later: new Map(), progress: null,
    applied: new Map(), batches: [],
  };
  let unsubArbs = null;
  let unsubLater = null;
  let unsubApplied = null;
  let unsubProgress = null;
  let sub = null;          // sous-écran ouvert : {kind, shown}
  // Effets (v2.24.0, maquette « délice ») : série en cours, dernières
  // valeurs affichées (pour les faire défiler), carte qui arrive.
  const fx = { streak: 0, shownStreak: 0, lastPct: null, lastCheck: null,
    prevDone: 0, entering: false, partied: false };
  const J = () => window.OrpheeJuice || { buzz() {}, countTo(e, a, b, ms, f) { if (e) e.textContent = (f || String)(b); },
    burst() {}, reduce: () => true };
  const wait = (ms) => new Promise((r) => setTimeout(r, J().reduce() ? 0 : ms));
  const pctFmt = (v) => (Math.round(v * 10) / 10).toLocaleString("fr-FR");
  let reviewIds = null;    // file de la revue en cours (ordre figé)

  // ---- Données ----------------------------------------------------------------
  const uid = () => { const u = firebase.auth().currentUser; return u && !u.isAnonymous ? u.uid : null; };
  // Démo (v2.32.1, PM-28) : l'invité voit la Qualité d'Axel et peut tout
  // y faire — trancher, passer, appliquer, annuler — mais sur une copie
  // locale : rien n'est jamais écrit (IM-8). Les collections ci-dessous
  // deviennent alors des tables en mémoire, avec la même interface.
  const demo = () => !!(window.OrpheeSession && window.OrpheeSession.isGuest());
  const ownerUid = () => uid() || (demo() && window.OrpheeSession.dataUid()) || null;
  const fakeTs = () => { const d = new Date(); return { toDate: () => d, toMillis: () => d.getTime() }; };
  const isSentinel = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.isEqual === "function" && !v.toDate;
  let demoSeq = 0;
  let demoPaint = 0;
  function memCol(get) {
    const doc = (id) => {
      const key = id || `demo-${++demoSeq}`;
      return {
        id: key,
        get: async () => ({ exists: get().has(key), data: () => get().get(key) }),
        set: async (data, opt) => {
          const clean = {};
          for (const [k, v] of Object.entries(data)) clean[k] = isSentinel(v) ? fakeTs() : v;
          get().set(key, Object.assign(opt && opt.merge ? Object.assign({}, get().get(key)) : {}, clean));
          paintSoon();
        },
        delete: async () => { get().delete(key); paintSoon(); },
      };
    };
    return { doc };
  }
  // Lots de corrections : une liste côté écran ; en démo, une Map miroir.
  const demoBatches = new Map();
  function paintSoon() {
    clearTimeout(demoPaint);
    demoPaint = setTimeout(() => {
      state.batches = Array.from(demoBatches.entries()).map(([id, b]) => Object.assign({ id }, b))
          .sort((x, y) => (y.at && y.at.toMillis ? y.at.toMillis() : 0) - (x.at && x.at.toMillis ? x.at.toMillis() : 0));
      if (sub) renderSub(); else render();
    }, 0);
  }
  const memBatch = () => ({ set: (ref, d, o) => ref.set(d, o), delete: (ref) => ref.delete(), commit: async () => {} });
  const newBatch = () => (demo() ? memBatch() : firebase.firestore().batch());
  const userCol = (name) => firebase.firestore().collection(`users/${ownerUid()}/${name}`);
  const arbCol = () => (demo() ? memCol(() => state.arbs) : userCol("album_arbitrations"));
  // Titres passés (« je ne sais pas ») : ni décision ni effet sur le
  // rattachement (IM-9) ; ils reviennent en fin de revue et vont dans
  // l'export pour être regardés ensemble.
  const laterCol = () => (demo() ? memCol(() => state.later) : userCol("quality_later"));
  // Corrections appliquées (E10, v2.30.0) : rien ne bouge dans la
  // bibliothèque sans « Appliquer » ; chaque lot est daté et annulable.
  const appliedCol = () => (demo() ? memCol(() => state.applied) : userCol("applied_corrections"));
  const batchCol = () => (demo() ? memCol(() => demoBatches) : userCol("correction_batches"));

  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      const db = firebase.firestore();
      const s = await db.doc("quality/summary").get();
      state.summary = s.exists ? s.data() : null;
      const n = state.summary ? state.summary.chunks || 0 : 0;
      const docs = await Promise.all(Array.from({ length: n },
          (_, i) => db.doc(`quality/items_${i}`).get()));
      state.items = docs.flatMap((d) => (d.exists ? d.data().items || [] : []));
      state.loaded = true;
    } catch (err) {
      state.summary = null;
      state.items = [];
      state.loaded = true;
    } finally {
      state.loading = false;
    }
    render();
  }

  // Démo : une copie, une fois, de l'état d'Axel ; ensuite tout est local.
  let demoLoaded = false;
  async function demoCopy() {
    if (demoLoaded || !ownerUid()) return;
    demoLoaded = true;
    const read = async (name) => {
      try { return (await userCol(name).get()).docs.map((d) => [d.id, d.data()]); } catch (e) { return []; }
    };
    const [a, l, ap, bt] = await Promise.all(["album_arbitrations", "quality_later",
      "applied_corrections", "correction_batches"].map(read));
    state.arbs = new Map(a);
    state.later = new Map(l);
    state.applied = new Map(ap);
    for (const [id, b] of bt) demoBatches.set(id, b);
    paintSoon();
  }
  function watch() {
    if (demo()) { demoCopy(); return; }
    if (!unsubArbs && uid()) {
      unsubArbs = arbCol().onSnapshot((snap) => {
        state.arbs = new Map(snap.docs.map((d) => [d.id, d.data()]));
        render();
      }, () => {});
    }
    if (!unsubApplied && uid()) {
      unsubApplied = appliedCol().onSnapshot((snap) => {
        state.applied = new Map(snap.docs.map((d) => [d.id, d.data()]));
        if (!sub || sub.kind !== "review") render();
      }, () => {});
      batchCol().orderBy("at", "desc").onSnapshot((snap) => {
        state.batches = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        if (sub && sub.kind === "applied") renderSub();
      }, () => {});
    }
    if (!unsubLater && uid()) {
      unsubLater = laterCol().onSnapshot((snap) => {
        state.later = new Map(snap.docs.map((d) => [d.id, d.data()]));
        if (!sub || sub.kind !== "review") render();
      }, () => {});
    }
    if (!unsubProgress) {
      unsubProgress = firebase.firestore().doc("cache/quality_progress").onSnapshot((snap) => {
        const was = isRunning(state.progress);
        state.progress = snap.exists ? snap.data() : null;
        // Fin d'un lancement : les propositions viennent d'être réécrites.
        if (was && !isRunning(state.progress)) load();
        else renderVerify();
      }, () => {});
    }
  }

  // ---- Classement d'un titre --------------------------------------------------
  // Une décision d'Axel l'emporte toujours (IM-9).
  function bucket(it) {
    if (state.arbs.has(it.id)) return "mine";
    // Rattaché d'office (v2.32.0) : silencieux, revu depuis la fiche album.
    if (it.k === "linked") return "linked";
    // Déjà au bon endroit pour le moteur, montré seulement pour « À revoir ».
    if (it.k === "ok") return "ok";
    if (it.k === "check") return "check";
    if (it.k === "sure") return "sure";
    return "keep";
  }
  const inBucket = (b) => state.items.filter((it) => bucket(it) === b);
  const listens = (arr) => arr.reduce((s, it) => s + (it.n || 0), 0);

  // ② Prêts : corrections sûres et décisions « déplacer » d'Axel, pas
  // encore appliquées. Chacune avec son album d'arrivée.
  function readyItems() {
    const out = [];
    for (const it of state.items) {
      if (state.applied.has(it.id)) continue;
      const a = state.arbs.get(it.id);
      if (a) {
        if (a.decision === "move" && a.to_album) {
          out.push({ it, to: a.to_album, toSur: a.to_album_sur || `${it.a}-${a.to_album}`, source: "axel" });
        }
      } else if (it.k === "sure" && it.to) {
        out.push({ it, to: it.to, toSur: it.ts || `${it.a}-${it.to}`, source: "mb" });
      }
    }
    return out;
  }

  // Taux de santé : part des écoutes rangées sur un album confirmé — hors
  // titres douteux, déjà au bon endroit, laissés tels quels (MusicBrainz l'a
  // confirmé) ou tranchés par Axel. Projeté : avec les corrections sûres.
  function health() {
    const s = state.summary;
    if (!s || !s.total_listens) return null;
    // Les rattachés d'office sont déjà comptés dans base_listens.
    const items = state.items.filter((it) => it.k !== "linked" && it.k !== "ok");
    const keep = listens(items.filter((it) => bucket(it) === "keep" && it.k === "keep"));
    const kept = listens(items.filter((it) => (state.arbs.get(it.id) || {}).decision === "keep"));
    // Appliqués mais pas encore recalculés : déjà rangés.
    const applied = listens(items.filter((it) => state.applied.has(it.id)));
    const now = s.base_listens + keep + kept + applied;
    const then = now + listens(readyItems().map((r) => r.it).filter((it) => it.k !== "linked"));
    return { now: now / s.total_listens, then: then / s.total_listens };
  }

  // ---- Pochettes ----------------------------------------------------------------
  let libCache = null;
  function library() {
    if (!libCache && window.OrpheeLibrary) {
      const items = window.OrpheeLibrary.items();
      if (items.length) libCache = new Map(items.map((a) => [a.album_sur, a]));
    }
    return libCache || new Map();
  }
  function coverHTML(albumSur, release, title, cls) {
    const a = albumSur ? library().get(albumSur) : null;
    const url = (a && a.cover_url) || (release ? `https://coverartarchive.org/release/${release}/front-250` : "");
    const letter = esc((String(title || "?").replace(/[^\p{L}\p{N}]/gu, "")[0] || "?").toUpperCase());
    return `<span class="q-cov ${cls || ""}"><span>${letter}</span>` +
      (url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">` : "") + "</span>";
  }

  // ---- Rendu : accueil ----------------------------------------------------------
  function render() {
    if (!homeEl.classList.contains("is-active") && !sub) return;
    if (sub) return renderSub();
    renderHome();
  }

  function renderHome() {
    view = homeEl;
    if (!state.loaded) {
      view.innerHTML = `<div class="q-wrap"><h1 class="q-h1">Qualité</h1><p class="q-lead">Chargement…</p></div>`;
      return;
    }
    const h = health();
    const check = inBucket("check");
    const ready = readyItems();
    const keep = inBucket("keep");
    const mine = inBucket("mine");
    const pct = h ? Math.round(h.now * 1000) / 10 : 0;
    const thenPct = h ? Math.round(h.then * 1000) / 10 : 0;
    const fromPct = fx.lastPct == null ? pct : fx.lastPct;
    const fromCheck = fx.lastCheck == null ? check.length : fx.lastCheck;
    const C = 276.5;
    view.innerHTML = `<div class="q-wrap">
      <h1 class="q-h1">Qualité</h1>
      ${demo() ? `<p class="q-demo">Démo · essaie tout, rien n’est enregistré.</p>` : ""}
      ${h ? `<div class="q-hero">
        <div class="q-ring"><svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><linearGradient id="q-grad"><stop offset="0" stop-color="var(--green-5)"/><stop offset=".55" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--green-9)"/></linearGradient></defs>
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
          ${thenPct > pct ? `<circle class="q-arc-then" cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" stroke-width="8" pathLength="100" stroke-dasharray="${dashTo(thenPct)}"/>` : ""}
          <circle class="q-arc" cx="50" cy="50" r="44" fill="none" stroke="url(#q-grad)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${fx.lastPct == null ? C : C * (1 - fromPct / 100)}"/></svg>
          <div class="q-num"><div><b id="q-pct">${pctFmt(fromPct)}</b><span> %</span></div></div><div class="q-gain" id="q-gain"></div></div>
        <div class="q-legend"><span><i></i>sur le bon album</span>${thenPct > pct ? `<span><i class="d"></i>${pctFmt(thenPct)} % une fois appliqué</span>` : ""}</div>
      </div>` : `<p class="q-lead">Lance une vérification pour voir l’état de tes albums.</p>`}
      <div class="q-flow">
        <div class="q-step q-s1${check.length ? "" : " empty"}" data-go="${check.length ? "review" : ""}"><span class="q-dot">1</span>
          <span class="q-st"><b class="q-cta-n">${fmt(fromCheck)}</b><span>à trancher</span></span>
          ${check.length ? `<button class="q-st-act o-btn main" data-go="review">Trancher ›</button>` : ""}</div>
        <div class="q-link"></div>
        <div class="q-step q-s2${ready.length ? "" : " empty"}" data-go="${ready.length ? "ready" : ""}"><span class="q-dot">2</span>
          <span class="q-st"><b>${fmt(ready.length)}</b><span>prêts</span></span>
          ${ready.length ? `<button class="q-st-act o-btn main" data-apply>Appliquer ›</button>` : ""}</div>
        <div class="q-link solid"></div>
        <div class="q-step q-s3" data-go="${state.batches.length ? "applied" : ""}"><span class="q-dot">✓</span>
          <span class="q-st"><b>${fmt(state.applied.size)}</b><span>dans ta bibliothèque</span></span>
          ${state.batches.length ? `<span class="q-chev">›</span>` : ""}</div>
      </div>
      <div class="q-tiles q-tiles-sm">
        ${revoirIds().length ? tile("revoir", fmt(revoirIds().length), "à revoir", true) : ""}
        ${tile("keep", fmt(keep.length), "laissés tels quels")}
        ${laterIds().length ? tile("later", fmt(laterIds().length), "passés") : ""}
        ${mine.length ? tile("mine", fmt(mine.length), "tes décisions") : ""}
      </div>
      <div class="q-verify" id="q-verify"></div>
    </div>`;
    const arc = view.querySelector(".q-arc");
    if (arc) requestAnimationFrame(() => { arc.style.strokeDashoffset = C * (1 - pct / 100); });
    // Retour de revue : l'anneau monte, le gain flotte, « à vérifier » décompte.
    if (h && pct !== fromPct) {
      J().countTo(view.querySelector("#q-pct"), fromPct, pct, 1000, pctFmt);
      const g = view.querySelector("#q-gain");
      if (pct > fromPct && g) { g.textContent = `+${pctFmt(pct - fromPct)} %`; g.classList.add("go"); }
    }
    // « À trancher » décompte au retour de revue.
    const tc = view.querySelector(".q-s1 .q-cta-n");
    if (tc && fromCheck !== check.length) J().countTo(tc, fromCheck, check.length, 900, (v) => fmt(Math.round(v)));
    if (h) fx.lastPct = pct;
    fx.lastCheck = check.length;
    view.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (b.dataset.go) openSub(b.dataset.go);
    }));
    const ap = view.querySelector("[data-apply]");
    if (ap) ap.addEventListener("click", (e) => { e.stopPropagation(); confirmApply(); });
    renderVerify();
  }

  // Arc pointillé jusqu'à p % (cercle en pathLength 100) : « une fois
  // appliqué » — le pointillé dit « pas encore réel ».
  function dashTo(p) {
    const a = [];
    for (let x = 0; x + 1.2 <= p; x += 2.6) a.push(1.2, 1.4);
    a.push(0, 100);
    return a.join(" ");
  }

  // Passés encore à trancher (une décision les fait sortir).
  const laterIds = () => inBucket("check").filter((it) => state.later.has(it.id)).map((it) => it.id);

  // À revoir (v2.35.0) : titres déjà rangés que le moteur, corrigé, met en
  // doute (version live sur un album studio, coffret au nom de l'album) —
  // le plus souvent un « Déplacer ici » touché trop vite. Tant qu'Axel n'a
  // pas confirmé (« Garder ici ») ou remis à part.
  function toRevoir(it) {
    if (!it.rv) return false;
    const a = state.arbs.get(it.id);
    if (!a) return true;
    return a.decision === "move" && !a.reviewed && a.to_album_sur !== it.s;
  }
  const revoirIds = () => state.items.filter(toRevoir).map((it) => it.id);

  function tile(kind, n, label, hot) {
    return `<button class="q-tile${hot ? " hot" : ""}" data-go="${kind}"><span class="q-big">${n}</span><span class="q-lab">${label}</span><span class="q-chev">›</span></button>`;
  }

  // ---- Vérification MusicBrainz (PM-33) -----------------------------------------
  function isRunning(q) {
    const t = q && q.updated_at && q.updated_at.toMillis ? q.updated_at.toMillis() : 0;
    return !!(q && q.running && Date.now() - t < 3 * 60 * 1000);
  }
  function verifyText(q) {
    if (!q || typeof q.total !== "number") return "Interroge MusicBrainz pour tes titres douteux, sans rien changer à ta bibliothèque.";
    const done = q.total - q.remaining;
    if (isRunning(q)) return `Vérification en cours… ${fmt(done)} titres sur ${fmt(q.total)}. Tu peux quitter l’app.`;
    if (q.down && q.remaining > 0) return `MusicBrainz ne répond pas pour l’instant (${fmt(done)} sur ${fmt(q.total)}). Réessaie plus tard.`;
    if (q.remaining > 0) return `${fmt(done)} titres vérifiés sur ${fmt(q.total)}. Continue pour les suivants (30 min par lancement).`;
    return `Les ${fmt(q.total)} titres douteux sont vérifiés.`;
  }
  function renderVerify() {
    const box = view.querySelector("#q-verify");
    if (!box) return;
    // Démo : la vérification MusicBrainz (serveur) reste à Axel.
    if (demo()) { box.hidden = true; return; }
    const q = state.progress;
    const running = isRunning(q);
    const left = q && typeof q.total === "number" ? q.remaining : null;
    const label = !q || typeof q.total !== "number" ? "Lancer la vérification" : "Continuer la vérification";
    box.innerHTML = `<p>${esc(verifyText(q))}</p>` +
      (running || left === 0 ? "" : `<button class="q-soft o-btn soft block" id="q-run">${label}</button>`);
    const btn = box.querySelector("#q-run");
    if (btn) btn.addEventListener("click", () => verify(btn));
  }
  async function verify(btn) {
    btn.disabled = true;
    try {
      await firebase.app().functions("europe-west1")
          .httpsCallable("verifyCatalog", { timeout: 1800000 })();
    } catch (err) {
      // Coupure côté téléphone : la vérification continue côté serveur.
      if (!(err && err.code === "already-exists") && !isRunning(state.progress)) {
        toast("La vérification a échoué : " + (err.message || "erreur inconnue"));
      }
    }
  }

  // ---- Sous-écrans (couches de l'historique) --------------------------------------
  function openSub(kind, ids) {
    // « passés » : la revue, sur eux seuls.
    const revisit = kind === "later";
    // « à revoir » : la revue, sur les rangements mis en doute.
    const recheck = kind === "revoir";
    if (revisit || recheck) kind = "review";
    sub = { kind, shown: LIST_PAGE, revisit, recheck, skipped: new Set() };
    if (kind === "review") {
      reviewIds = ids || (recheck ? revoirIds() : revisit ? laterIds() : inBucket("check").map((it) => it.id));
      fx.streak = 0;
      fx.shownStreak = 0;
      fx.prevDone = 0;
      fx.entering = false;
      fx.partied = false;
    }
    if (window.OrpheeNav) window.OrpheeNav.openLayer("quality-sub", closeSub);
    renderSub();
    paneBody.scrollTop = 0;
    pane.classList.remove("parked");
    void pane.offsetWidth;
    pane.classList.add("on");
    paneScrim.classList.add("on");
    document.body.classList.add("q-pane-open");
  }
  function closeSub() {
    clearInterval(sparkT);
    sub = null;
    reviewIds = null;
    closeSheet(true);
    pane.classList.remove("on");
    paneScrim.classList.remove("on");
    document.body.classList.remove("q-pane-open");
    // Une fois descendue : hors de l'écran ET hors du focus clavier.
    setTimeout(() => { if (!pane.classList.contains("on")) pane.classList.add("parked"); }, 320);
    renderHome();
  }
  // Plus de bouton retour (v2.31.0) : la carte se tire vers le bas.
  const backBtn = () => "";
  function bindBack() { /* rien : poignée et geste retour */ }

  function renderSub() {
    if (!sub) return;
    view = paneBody;
    if (sub.kind === "review") renderReview();
    else if (sub.kind === "applied") renderApplied();
    else renderList(sub.kind);
  }

  // Album où le titre est rangé aujourd'hui : un choix à part entière, pas
  // grisé (v2.23.9) ; sa pochette est celle de l'album de la bibliothèque
  // (album_sur canonique, pas le libellé reçu) ; le toucher ouvre sa fiche.
  // v2.23.10 : chaque album porte son action — on touche le bouton de
  // l'album où le titre doit aller. Le reste du bloc sert à vérifier
  // (fiche, MusicBrainz), jamais à décider.
  function currentHTML(it, actions) {
    const sur = it.f ? `${it.a}-${it.f}` : "";
    const known = sur && library().has(sur);
    const tag = known ? "button" : "div";
    return `<div class="q-blk q-cur${actions ? " q-choice" : ""}"><span class="q-eyebrow">Aujourd’hui</span>
      <${tag} class="q-alb"${known ? ` data-open="${esc(sur)}" type="button"` : ""}>${coverHTML(sur, "", it.f || it.r, "lg")}
      <span class="q-pt"><b>${esc(it.f || it.r || "Sans album")}</b><span class="q-by">${esc((known && library().get(sur).artist) || it.a)}</span><span>${fmt(it.n)} écoute${it.n > 1 ? "s" : ""}${known ? " · fiche" : ""}</span></span>${known ? `<span class="q-chev">›</span>` : ""}</${tag}>
      ${actions || ""}</div>`;
  }
  function bindCurrent(root) {
    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () =>
      document.dispatchEvent(new CustomEvent("orphee:open-album", { detail: { album_sur: b.dataset.open } }))));
  }

  // ---- Revue carte par carte (PM-32) -----------------------------------------------
  // Preuve (PM-32) : l'album proposé, et le titre à sa place dans la liste
  // de l'édition MusicBrainz, entre ses voisins, tels que MusicBrainz les
  // écrit. Toucher l'album ouvre cette édition sur MusicBrainz (la source,
  // vérifiable hors d'Orphée) ; « Écouter » l'ouvre sur YouTube Music.
  function proofHTML(it, to, ts, actions) {
    const where = it.p ? `${it.y ? it.y + " · " : ""}piste ${it.p}${it.c ? " sur " + it.c : ""}` : (it.y || "");
    const tag = it.rel ? "a" : "div";
    const href = it.rel ? ` href="https://musicbrainz.org/release/${encodeURIComponent(it.rel)}" target="_blank" rel="noopener noreferrer"` : "";
    // Rattaché d'office : la « proposition » est son libellé reçu.
    const lk = it.k === "linked";
    return `<div class="q-proof${actions ? " q-choice" : ""}">${actions ? `<span class="q-eyebrow q-sug">${lk ? "Tel que reçu de Last.fm" : "Proposé par MusicBrainz"}</span>` : ""}
      <${tag} class="q-ph"${href}>${coverHTML(ts, it.rel, to, "lg")}
        <span class="q-pt"><b>${esc(to)}</b><span class="q-by" data-by="${esc(it.id)}">${esc(it.a)}</span><span>${esc(where)}</span></span>${it.rel ? `<span class="q-mb">MusicBrainz ↗</span>` : ""}</${tag}>
      ${it.rel ? `<div class="q-tl" data-tl="${esc(it.id)}"><div class="q-tr q-wait">Liste des titres…</div></div>` : ""}
      <div class="q-pf">${lk ? `<span class="q-m">Son libellé d’origine, à part</span>` : `<span class="q-m ${it.x ? "ok" : "warn"}">${it.x ? "✓ Même titre sur l’album" : "≈ Autre version sur l’album"}</span>`}
        <a class="q-listen" ${listenAttrs(it.a, to)}>Écouter ↗</a></div>
      ${actions || ""}
    </div>`;
  }
  // Même lien que « Écouter » de la fiche album (detail.js) : sur Android,
  // la redirection serveur /yt ouvre l'appli YouTube Music.
  function listenAttrs(artist, album) {
    const q = [artist, album].filter(Boolean).join(" ").trim();
    if (/Android/i.test(navigator.userAgent)) return `href="/yt?q=${esc(encodeURIComponent(q))}"`;
    return `href="https://music.youtube.com/search?q=${esc(encodeURIComponent(q))}" target="_blank" rel="noopener noreferrer"`;
  }

  // Liste des titres d'une édition, demandée par le téléphone à
  // MusicBrainz à l'affichage (seul l'identifiant de l'édition est
  // envoyé), une requête à la fois et au plus une par seconde, gardée en
  // mémoire le temps de la session.
  const tlCache = new Map();
  let tlChain = Promise.resolve();
  function tracklist(rel) {
    if (tlCache.has(rel)) return tlCache.get(rel);
    const p = tlChain.then(() => fetch(`https://musicbrainz.org/ws/2/release/${encodeURIComponent(rel)}?inc=recordings+artist-credits&fmt=json`,
        { headers: { Accept: "application/json" } }))
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    tlChain = p.then(() => new Promise((r) => setTimeout(r, 1100)));
    tlCache.set(rel, p);
    p.then((j) => { if (!j) tlCache.delete(rel); });
    return p;
  }
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*[([]\s*(feat\.?|ft\.?|featuring|avec|with)\s[^)\]]*[)\]]/g, "")
      .replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const base = (t) => norm(String(t || "").replace(/\s*[([][^)\]]*[)\]]/g, " ").replace(/\s+-\s+.*$/, ""));
  // Le titre dans l'édition : même titre, sinon même titre de base, sinon
  // la place annoncée par la recherche.
  function locate(json, it) {
    const media = (json && json.media) || [];
    for (const how of [(t) => norm(t.title) === norm(it.t), (t) => base(t.title) === base(it.t)]) {
      for (const m of media) {
        const i = (m.tracks || []).findIndex(how);
        if (i >= 0) return { tracks: m.tracks, i };
      }
    }
    const m = media[0];
    if (m && m.tracks && it.p && m.tracks[it.p - 1]) return { tracks: m.tracks, i: it.p - 1, guess: true };
    return null;
  }
  function fillTracklists(root) {
    root.querySelectorAll("[data-tl]").forEach((box) => {
      const it = state.items.find((x) => x.id === box.dataset.tl);
      if (!it || !it.rel) return;
      tracklist(it.rel).then((json) => {
        // Artiste de l'édition tel que MusicBrainz le crédite (v2.23.11).
        const credit = json && json["artist-credit"];
        if (Array.isArray(credit) && credit.length) {
          const name = credit.map((c) => (c.name || "") + (c.joinphrase || "")).join("").trim();
          root.querySelectorAll(`[data-by="${CSS.escape(it.id)}"]`).forEach((n) => { n.textContent = name; });
        }
        if (!box.isConnected) return;
        const loc = locate(json, it);
        if (!loc) {
          box.innerHTML = `<div class="q-tr q-wait">Liste des titres indisponible : vérifie sur MusicBrainz.</div>`;
          return;
        }
        const from = Math.max(0, loc.i - 1);
        const to = Math.min(loc.tracks.length, loc.i + 2);
        box.innerHTML = loc.tracks.slice(from, to).map((t, k) => {
          const j = from + k;
          return `<div class="q-tr${j === loc.i ? " hit" : ""}"><span>${esc(t.number || j + 1)}</span>${esc(t.title)}</div>`;
        }).join("") + (loc.guess ? `<div class="q-tr q-wait">Titre écrit autrement sur cette édition.</div>` : "");
      });
    });
  }
  function bindProof(root) {
    fillTracklists(root);
  }

  function renderReview() {
    const open = (reviewIds || []).map((id) => state.items.find((x) => x.id === id))
        .filter((it) => it && !sub.skipped.has(it.id) &&
          (sub.recheck ? toRevoir(it) : !state.arbs.has(it.id)));
    // Les passés vont en fin de file ; on ne les revoit que si on le choisit.
    const fresh = open.filter((it) => !state.later.has(it.id) || sub.revisit);
    const passed = open.filter((it) => state.later.has(it.id));
    const queue = fresh.length ? fresh : [];
    const done = (reviewIds || []).length - fresh.length;
    if (!queue.length && passed.length) {
      view.innerHTML = `<div class="q-wrap">${backBtn()}<div class="q-done"><div class="q-ic q-ic-later">?</div>
        <h2>Il reste ${fmt(passed.length)} titre${passed.length > 1 ? "s" : ""} passé${passed.length > 1 ? "s" : ""}</h2>
        <p>Ceux dont tu n’étais pas sûr. Revois-les maintenant, ou exporte (Réglages › Synchronisation) pour qu’on les regarde ensemble.</p>
        <button class="o-btn main block" data-later="again">Les revoir</button>
        <button class="o-link" data-later="stop">Plus tard</button></div></div>`;
      bindBack();
      view.querySelector('[data-later="again"]').addEventListener("click", () => {
        sub.revisit = true;
        reviewIds = passed.map((it) => it.id);
        fx.prevDone = 0;
        fx.entering = true;
        renderReview();
      });
      view.querySelector('[data-later="stop"]').addEventListener("click", () =>
        window.OrpheeNav ? window.OrpheeNav.closeLayer("quality-sub") : closeSub());
      return;
    }
    if (!queue.length) {
      view.innerHTML = `<div class="q-wrap">${backBtn()}<div class="q-done"><div class="q-ic">✓</div><h2>C’est tout bon</h2><p>${sub.recheck ? "Plus rien à revoir." : "Plus rien à vérifier pour l’instant."}</p></div></div>`;
      bindBack();
      // Fin de revue : une gerbe émeraude et or, une seule fois.
      const ic = view.querySelector(".q-ic");
      if (ic && !fx.partied && fx.streak > 0) {
        fx.partied = true;
        const r = ic.getBoundingClientRect();
        J().burst(r.left + r.width / 2, r.top + r.height / 2, 46, ["#3fc58e", "#6ce0cf", "#e0a23f", "#45d4ad"]);
        J().buzz(20);
      }
      return;
    }
    const it0 = queue[0];
    // À revoir : l'album d'aujourd'hui (où il a été rangé) face à son
    // libellé d'origine, à part — comme un rattaché d'office.
    const it = sub.recheck ? Object.assign({}, it0, { k: "linked", to: it0.r || "Sans album", ts: it0.s,
      rel: "", p: 0, y: "", c: 0, x: 1 }) : it0;
    const total = reviewIds.length;
    view.innerHTML = `<div class="q-wrap">${backBtn()}
      <div class="q-bar"><i style="width:${fx.prevDone / total * 100}%"></i></div>
      <div class="q-countrow"><div class="q-count"><b>${fmt(done + 1)}</b> sur ${fmt(total)}</div>${streakHTML()}</div>
      <div class="q-card${fx.entering ? " in" : ""}">
        <div class="q-subj"><span class="q-subj-k">${sub.recheck ? "↺ Rangement à revoir" : "♪ Titre à ranger"}</span>
          <div class="q-track">${esc(it.t)}</div>
          <div class="q-artist">${esc(it.a)}</div></div>
        <div class="q-move">
          ${currentHTML(it, `<div class="q-blk-acts${!sub.recheck && sameLabel(it).length > 1 ? " two" : ""}">
            <button class="q-choose" data-a="keep">Garder ici</button>
            ${!sub.recheck && sameLabel(it).length > 1 ? `<button class="q-choose" data-a="all">Garder tout<small>${fmt(sameLabel(it).length)} titres</small></button>` : ""}
          </div>`)}
          <div class="q-down">↓</div>
          ${proofHTML(it, it.to, it.ts, `<div class="q-blk-acts"><button class="q-choose" data-a="move">${it.k === "linked" ? "Remettre à part" : "Déplacer ici"}</button></div>`)}
        </div>
        ${sub.recheck ? `<p class="q-why">${esc(it.rv)}</p>` :
          /^(Sur |Autre version)/.test(it.w || "") ? "" : `<p class="q-why">${esc(it.w)}</p>`}
      </div>
      ${sub.recheck ? "" : `<button class="q-elsewhere o-btn soft block" data-a="pick">Chercher un autre album…</button>`}
      <button class="q-pass o-link" data-a="pass">${sub.recheck ? "Plus tard" : state.later.has(it.id) ? "Toujours pas sûr · passer" : "Je ne sais pas · passer"}</button>
    </div>`;
    bindBack();
    bindProof(view);
    bindCurrent(view);
    fx.entering = false;
    // La barre avance depuis la valeur précédente ; la série s'allume.
    const bar = view.querySelector(".q-bar i");
    requestAnimationFrame(() => { if (bar) bar.style.width = `${done / total * 100}%`; });
    fx.prevDone = done;
    paintStreak();
    // Anti-rafale (v2.35.0) : une carte qui vient d'arriver ignore les
    // touchers pendant ARM_MS — un double toucher, ou un toucher en rythme,
    // ne tranche plus la carte suivante sans l'avoir lue.
    fx.shownAt = performance.now();
    const on = (sel, fn) => {
      const b = view.querySelector(sel);
      if (b) b.addEventListener("click", () => { if (performance.now() - fx.shownAt >= ARM_MS) fn(); });
    };
    if (sub.recheck) {
      on('[data-a="move"]', () => choose("move", () => putBack(it0)));
      on('[data-a="keep"]', () => choose("keep", () => confirmKept(it0)));
      on('[data-a="pass"]', () => { sub.skipped.add(it0.id); fx.entering = true; renderReview(); });
      return;
    }
    on('[data-a="move"]', () =>
      choose("move", () => decide(it, { decision: "move", to: it.to, ts: it.ts })));
    on('[data-a="keep"]', () => choose("keep", () => decide(it, { decision: "keep" })));
    on('[data-a="pick"]', () => picker(it));
    on('[data-a="pass"]', () => pass(it));
    on('[data-a="all"]', () => choose("keep", () => keepAll(it)));
  }

  // Le choix s'allume (contour, reflet, ✓), l'autre album s'efface, puis la
  // carte part tout droit et la suivante arrive : 0,4 s en tout.
  async function choose(kind, write) {
    const card = view.querySelector(".q-card");
    if (!card || card.dataset.busy) return;
    card.dataset.busy = "1";
    card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    const pick = card.querySelector(kind === "move" ? ".q-proof" : ".q-cur");
    const other = card.querySelector(kind === "move" ? ".q-cur" : ".q-proof");
    J().buzz();
    if (pick) {
      pick.classList.add("q-chosen");
      pick.insertAdjacentHTML("beforeend", `<span class="q-sweep"></span><span class="q-ok">✓</span>`);
    }
    if (other) other.classList.add("q-dim");
    await wait(240);
    card.classList.add("out");
    await wait(160);
    fx.streak += 1;
    fx.entering = true;
    if (fx.streak === 5 || fx.streak % 10 === 0) series(fx.streak);
    write();
  }

  // Passer : la carte s'en va sans rien décider ; la série n'est ni comptée
  // ni cassée. En revoyant les passés, « passer » le remet simplement à la fin.
  async function pass(it) {
    const card = view.querySelector(".q-card");
    if (!card || card.dataset.busy) return;
    card.dataset.busy = "1";
    card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    J().buzz();
    card.classList.add("out", "q-skip");
    await wait(220);
    fx.entering = true;
    const had = state.later.has(it.id);
    if (sub && sub.revisit && reviewIds) {
      reviewIds = reviewIds.filter((id) => id !== it.id).concat(it.id);
    }
    try {
      await laterCol().doc(it.id).set({
        artist: it.a, track: it.t, raw_album_sur: it.s, raw_album: it.f || "",
        proposed_album: it.to || "", reason: it.w || "", listens: it.n || 0,
        at: firebase.firestore.FieldValue.serverTimestamp(),
      });
      state.later.set(it.id, {});
      if (!had) {
        toast("Passé · tu le reverras à la fin", async () => {
          try { await laterCol().doc(it.id).delete(); } catch (e) { /* rien */ }
          state.later.delete(it.id);
          if (sub) renderSub();
        });
      }
    } catch (err) {
      toast("Pas enregistré : " + (err.message || "erreur"));
    }
    if (sub) renderSub();
  }

  // ---- Série : un compteur qui chauffe (pas une jauge) --------------------------------
  function streakStyle(n) {
    const h = n >= 15 ? "#ff5a36" : n >= 10 ? "#ff8a3d" : n >= 5 ? "#e0a23f" : "#3fc58e";
    return `--h:${h};--lv:${Math.min(10, n)}`;
  }
  function streakHTML() {
    const n = fx.shownStreak;
    return `<div class="q-streak${n > 0 ? " on" : ""}${n >= 15 ? " boil" : ""}" style="${streakStyle(n)}" aria-label="Série : ${n}"><span class="q-fl">🔥</span><b>${n}</b></div>`;
  }
  let sparkT = null;
  function paintStreak() {
    clearInterval(sparkT);
    const el = view.querySelector(".q-streak");
    if (!el) return;
    const n = fx.streak;
    const grew = n > fx.shownStreak;
    fx.shownStreak = n;
    el.setAttribute("style", streakStyle(n));
    el.classList.toggle("on", n > 0);
    el.classList.toggle("boil", n >= 15);
    const b = el.querySelector("b");
    b.textContent = n;
    if (grew) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    if (n >= 8 && !J().reduce()) {
      const rate = n >= 15 ? 80 : n >= 12 ? 170 : 340;
      sparkT = setInterval(() => {
        const fl = view.querySelector(".q-streak .q-fl");
        if (!fl) { clearInterval(sparkT); return; }
        const r = fl.getBoundingClientRect();
        const s = document.createElement("div");
        s.className = "jc-spark";
        s.style.left = (r.left + r.width / 2 - 2) + "px";
        s.style.top = (r.top + 2) + "px";
        s.style.background = n >= 15 ? "#ff5a36" : "#e0a23f";
        document.body.appendChild(s);
        s.animate([{ transform: "translateY(0) scale(1)", opacity: 0.95 },
          { transform: `translate(${(Math.random() - 0.5) * 22}px,-${18 + Math.random() * 28}px) scale(.2)`, opacity: 0 }],
        { duration: 600 + Math.random() * 400, easing: "ease-out" }).onfinish = () => s.remove();
      }, rate);
    }
  }
  function series(n) {
    const s = document.createElement("div");
    s.className = "q-series";
    s.innerHTML = `<b>${n}</b><span>${n >= 20 ? "en ébullition !" : n >= 10 ? "ça chauffe !" : "de suite !"}</span>`;
    document.body.appendChild(s);
    requestAnimationFrame(() => s.classList.add("go"));
    J().buzz();
    setTimeout(() => J().buzz(), 90);
    J().burst(innerWidth / 2, innerHeight * 0.38, n >= 10 ? 60 : 36, ["#e0a23f", "#3fc58e", "#6ce0cf"]);
    setTimeout(() => s.remove(), 1800);
  }

  // ---- Listes ---------------------------------------------------------------------
  const LISTS = {
    sure: { h: "Seront corrigés", lead: (n) => `${fmt(n)} titres, rangés sur un album de ta bibliothèque. Touche un titre pour l’annuler.` },
    ready: { h: "Prêts", lead: (n) => `${fmt(n)} titres attendent « Appliquer » pour rejoindre leur album. Touche un titre pour le revoir.` },
    keep: { h: "Laissés tels quels", lead: () => "Faces B, bandes originales, remix, live, ou titres inconnus de MusicBrainz." },
    mine: { h: "Tes décisions", lead: () => "Elles passent avant toute source et survivent à toutes les actualisations." },
  };
  function destOf(it) {
    const a = state.arbs.get(it.id);
    // Album actuel : son album_sur canonique (pochette de la bibliothèque).
    const cur = { title: it.f || it.r, sur: it.f ? `${it.a}-${it.f}` : it.s };
    if (a) return a.decision === "move" ? { title: a.to_album, sur: a.to_album_sur || "" } : cur;
    if (it.k === "sure" || it.k === "check") return { title: it.to, sur: it.ts, rel: it.rel };
    return cur;
  }
  function renderList(kind) {
    const conf = LISTS[kind];
    const all = kind === "ready" ? readyItems().map((r) => r.it) : inBucket(kind);
    const shown = all.slice(0, sub.shown);
    const by = new Map();
    for (const it of shown) {
      if (!by.has(it.a)) by.set(it.a, []);
      by.get(it.a).push(it);
    }
    view.innerHTML = `<div class="q-wrap">${backBtn()}<h2 class="q-h2">${conf.h}</h2><p class="q-lead">${esc(conf.lead(all.length))}</p>` +
      (all.length ? "" : `<p class="q-lead">Rien pour l’instant.</p>`) +
      Array.from(by.entries()).map(([a, xs]) => `<div class="q-ah"><span>${esc(a)}</span><span>${xs.length}</span></div>
        <div class="q-list">${xs.map((it) => {
          const d = destOf(it);
          return `<button class="q-li" data-id="${esc(it.id)}">${coverHTML(d.sur, d.rel, d.title)}<span class="q-pt"><b>${esc(it.t)}</b><span>${esc(d.title || "Sans album")}</span></span><span class="q-chev">›</span></button>`;
        }).join("")}</div>`).join("") +
      (all.length > shown.length ? `<button class="q-more o-btn soft block" data-more>Afficher plus (${fmt(all.length - shown.length)})</button>` : "") +
      `</div>`;
    bindBack();
    view.querySelectorAll(".q-li").forEach((b) => b.addEventListener("click", () => {
      const it = state.items.find((x) => x.id === b.dataset.id);
      if (it) detail(it, kind);
    }));
    const more = view.querySelector("[data-more]");
    if (more) more.addEventListener("click", () => { sub.shown += LIST_PAGE; renderList(kind); });
  }

  // ---- Appliquer (PM-31, E10, v2.30.0) -------------------------------------------------
  // Rien ne bouge sans ce geste. On montre d'abord ce qui va changer, dont
  // les albums notés qui se vident (leur note est reportée, jamais perdue),
  // puis on écrit le lot et on actualise.
  let plan = null;
  const gradeLabel = (g) => (window.ORPHEE_GRADES || {})[g] || String(g);
  const gradeColor = (g) => ((window.ORPHEE_GRADE_COLORS || {})[g] || {}).bg || "var(--surface-3)";
  const fromSurOf = (it) => (it.f ? `${it.a}-${it.f}` : it.s);

  function confirmApply() {
    const ready = readyItems();
    if (!ready.length) return;
    const lib = library();
    const moving = new Map();
    for (const r of ready) {
      const from = fromSurOf(r.it);
      let m = moving.get(from);
      if (!m) moving.set(from, m = { n: 0, to: new Map() });
      m.n += r.it.n || 0;
      const t = m.to.get(r.toSur) || { sur: r.toSur, title: r.to, n: 0 };
      t.n += r.it.n || 0;
      m.to.set(r.toSur, t);
    }
    const emptied = [];
    for (const [from, m] of moving) {
      const a = lib.get(from);
      if (!a || a.grade == null || m.n < (a.listen_count || 0)) continue;
      const to = Array.from(m.to.values()).sort((x, y) => y.n - x.n)[0];
      if (!to || to.sur === from || to.sur.includes("/")) continue;
      const t = lib.get(to.sur);
      const toGrade = t && t.grade != null ? t.grade : null;
      emptied.push({ from, title: a.album, artist: a.artist, grade: a.grade,
        toSur: to.sur, toTitle: to.title, toGrade, choice: toGrade == null ? "carry" : "keep" });
    }
    plan = { ready, emptied };
    renderConfirm();
  }

  function renderConfirm() {
    const mb = plan.ready.filter((r) => r.source === "mb").length;
    const mine = plan.ready.length - mb;
    const rows = plan.emptied.map((e, i) => {
      const opts = e.toGrade == null ?
        [["carry", `Reporter sur ${esc(e.toTitle)}`], ["drop", "La laisser"]] :
        [["keep", `Garder ${esc(gradeLabel(e.toGrade))}`], ["carry", `Prendre ${esc(gradeLabel(e.grade))}`]];
      return `<div class="q-emp"><div class="q-emp-t"><b>${esc(e.title)}</b> <span class="q-gpill" style="background:${gradeColor(e.grade)}">${esc(gradeLabel(e.grade))}</span>
        <small>${esc(e.artist)} · se vide → <b>${esc(e.toTitle)}</b>${e.toGrade != null ? ` (déjà noté ${esc(gradeLabel(e.toGrade))})` : ""}</small></div>
        <div class="q-emp-c">${opts.map(([v, l]) => `<button data-emp="${i}" data-v="${v}" class="o-chip${e.choice === v ? " on" : ""}">${l}</button>`).join("")}</div></div>`;
    }).join("");
    openSheet(`<div class="q-sheet-in"><h2 class="q-h2">Ce qui va changer</h2>
      <div class="q-crow"><span>Corrections sûres</span><b>${fmt(mb)}</b></div>
      <div class="q-crow"><span>Tes décisions</span><b>${fmt(mine)}</b></div>
      <div class="q-crow q-ctot"><span>Titres qui rejoignent leur album</span><b>${fmt(plan.ready.length)}</b></div>
      ${plan.emptied.length ? `<p class="q-csub">${plan.emptied.length} album${plan.emptied.length > 1 ? "s" : ""} noté${plan.emptied.length > 1 ? "s" : ""} se vide${plan.emptied.length > 1 ? "nt" : ""}</p>${rows}` : ""}
      <button class="q-apply-go o-btn main block" data-go-apply>Appliquer ${fmt(plan.ready.length)} correction${plan.ready.length > 1 ? "s" : ""}</button>
      <button class="q-apply-later o-link" data-later-apply>Pas maintenant</button></div>`);
    sheet.querySelectorAll("[data-emp]").forEach((b) => b.addEventListener("click", () => {
      plan.emptied[+b.dataset.emp].choice = b.dataset.v;
      J().buzz(8);
      renderConfirm();
    }));
    sheet.querySelector("[data-later-apply]").addEventListener("click", () => closeSheetUi());
    sheet.querySelector("[data-go-apply]").addEventListener("click", (e) => apply(e.currentTarget));
  }

  // Écritures par paquets (limite Firestore : 500 par lot).
  async function commitAll(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = newBatch();
      for (const op of ops.slice(i, i + 400)) op(b);
      await b.commit();
    }
  }
  // Démo : la note reportée n'est pas écrite (table jetable).
  const demoGrades = new Map();
  const gradeRef = (sur) => (demo() ? memCol(() => demoGrades).doc(sur) : firebase.firestore().doc(`users/${uid()}/grades/${sur}`));
  // Après un geste qui change la bibliothèque : actualiser — sauf en démo.
  const refreshAfter = () => { if (!demo() && window.OrpheeRefresh) window.OrpheeRefresh.run(); };

  async function apply(btn) {
    if (!plan || !ownerUid()) return;
    btn.disabled = true;
    btn.textContent = "Rangement…";
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const bRef = batchCol().doc();
    try {
      const carried = [];
      for (const e of plan.emptied) {
        if (e.choice !== "carry") continue;
        const snap = await gradeRef(e.toSur).get();
        carried.push({ from_sur: e.from, to_sur: e.toSur, grade: e.grade,
          prev: snap.exists ? snap.data() : null });
      }
      const ops = plan.ready.map((r) => (b) => b.set(appliedCol().doc(r.it.id), {
        artist: r.it.a, track: r.it.t, raw_album_sur: r.it.s, to_album: r.to,
        to_album_sur: r.toSur, source: r.source, batch: bRef.id, at: ts,
      }));
      for (const c of carried) {
        ops.push((b) => b.set(gradeRef(c.to_sur), Object.assign({ grade: c.grade, updated_at: ts },
            c.prev ? {} : { graded_at: ts }), { merge: true }));
      }
      ops.push((b) => b.set(bRef, { at: ts, count: plan.ready.length, carried }));
      await commitAll(ops);
      for (const c of demo() ? [] : carried) {
        document.dispatchEvent(new CustomEvent("orphee:album-graded", {
          detail: { album_sur: c.to_sur, curation: { grade: c.grade, grade_label: gradeLabel(c.grade) } },
        }));
      }
      const n = plan.ready.length;
      plan = null;
      closeSheetUi();
      J().buzz(20);
      toast(demo() ? `Démo : ${fmt(n)} titre${n > 1 ? "s rangés" : " rangé"} — rien n’est enregistré` :
        `${fmt(n)} titre${n > 1 ? "s ont" : " a"} rejoint leur album · actualisation…`);
      refreshAfter();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Réessayer";
      toast("Pas appliqué : " + (err.message || "erreur"));
    }
  }

  // ✓ Dans ta bibliothèque : les lots, du plus récent au plus ancien.
  function renderApplied() {
    const byBatch = new Map();
    for (const [id, c] of state.applied) {
      if (!byBatch.has(c.batch)) byBatch.set(c.batch, []);
      byBatch.get(c.batch).push(Object.assign({ id }, c));
    }
    const date = (t) => (t && t.toDate ? t.toDate() : new Date())
        .toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    view.innerHTML = `<div class="q-wrap">${backBtn()}<h2 class="q-h2">Dans ta bibliothèque</h2>
      <p class="q-lead">Chaque lot appliqué, annulable en entier ou titre par titre.</p>` +
      (state.batches.length ? "" : `<p class="q-lead">Rien d’appliqué pour l’instant.</p>`) +
      state.batches.map((b) => {
        const xs = (byBatch.get(b.id) || []).sort((x, y) => x.artist.localeCompare(y.artist));
        if (!xs.length && !(b.carried || []).length) return "";
        const open = sub.openBatch === b.id;
        const notes = (b.carried || []).length;
        return `<div class="q-batch"><button class="q-batch-h" data-batch="${esc(b.id)}"><span><b>${esc(date(b.at))}</b>
          <small>${fmt(xs.length)} titre${xs.length > 1 ? "s" : ""}${notes ? ` · ${notes} note${notes > 1 ? "s" : ""} reportée${notes > 1 ? "s" : ""}` : ""}</small></span><span class="q-chev">${open ? "⌃" : "⌄"}</span></button>
          ${open ? `<div class="q-list">${xs.map((c) => `<div class="q-li q-li-ap"><span class="q-pt"><b>${esc(c.track)}</b><span>${esc(c.artist)} → ${esc(c.to_album)}</span></span><button class="q-undo1 o-link" data-undo1="${esc(c.id)}">Annuler</button></div>`).join("")}</div>
          <button class="q-undo-batch o-btn soft block" data-undob="${esc(b.id)}">Annuler tout le lot</button>` : ""}</div>`;
      }).join("") + `</div>`;
    bindBack();
    view.querySelectorAll("[data-batch]").forEach((b) => b.addEventListener("click", () => {
      sub.openBatch = sub.openBatch === b.dataset.batch ? null : b.dataset.batch;
      renderApplied();
    }));
    view.querySelectorAll("[data-undo1]").forEach((b) => b.addEventListener("click", () => undoOne(b.dataset.undo1, b)));
    view.querySelectorAll("[data-undob]").forEach((b) => b.addEventListener("click", () => undoBatch(b.dataset.undob, b)));
  }

  async function undoOne(id, btn) {
    btn.disabled = true;
    try {
      await appliedCol().doc(id).delete();
      toast(demo() ? "Annulé" : "Annulé · actualisation…");
      refreshAfter();
    } catch (err) {
      btn.disabled = false;
      toast("Pas annulé : " + (err.message || "erreur"));
    }
  }

  async function undoBatch(id, btn) {
    const b = state.batches.find((x) => x.id === id);
    if (!b || !window.confirm("Annuler tout ce lot ? Les titres reviennent où ils étaient, notes comprises.")) return;
    btn.disabled = true;
    try {
      const ids = Array.from(state.applied.entries()).filter(([, c]) => c.batch === id).map(([k]) => k);
      const ops = ids.map((k) => (x) => x.delete(appliedCol().doc(k)));
      for (const c of b.carried || []) {
        ops.push((x) => (c.prev ? x.set(gradeRef(c.to_sur), c.prev) : x.delete(gradeRef(c.to_sur))));
      }
      ops.push((x) => x.delete(batchCol().doc(id)));
      await commitAll(ops);
      for (const c of demo() ? [] : b.carried || []) {
        const g = c.prev ? c.prev.grade : null;
        document.dispatchEvent(new CustomEvent("orphee:album-graded", {
          detail: { album_sur: c.to_sur, curation: { grade: g == null ? null : g, grade_label: g == null ? null : gradeLabel(g) } },
        }));
      }
      sub.openBatch = null;
      toast(demo() ? "Lot annulé" : "Lot annulé · actualisation…");
      refreshAfter();
    } catch (err) {
      btn.disabled = false;
      toast("Pas annulé : " + (err.message || "erreur"));
    }
  }

  // ---- Panneau (couche) -------------------------------------------------------------
  const sheet = document.createElement("div");
  sheet.className = "q-sheet";
  const scrim = document.createElement("div");
  scrim.className = "q-scrim";
  document.body.append(scrim, sheet);
  let sheetOpen = false;
  scrim.addEventListener("click", () => closeSheetUi());
  function openSheet(html) {
    sheet.innerHTML = `<div class="q-grab"></div>` + html;
    toastEl.classList.remove("on");
    if (!sheetOpen && window.OrpheeNav) window.OrpheeNav.openLayer("quality-sheet", () => closeSheet(true));
    sheetOpen = true;
    sheet.classList.add("on");
    scrim.classList.add("on");
  }
  function closeSheetUi() {
    if (sheetOpen && window.OrpheeNav) window.OrpheeNav.closeLayer("quality-sheet");
    else closeSheet(true);
  }
  function closeSheet() {
    sheetOpen = false;
    sheet.classList.remove("on");
    scrim.classList.remove("on");
    sheet.style.transform = "";
    scrim.style.opacity = "";
  }

  // Glisser le panneau vers le bas le ferme (comme la fiche album) : depuis
  // n'importe où tant que son contenu est tout en haut, sinon on fait défiler.
  const DRAG_CLOSE_PX = 90;
  let drag = null;
  sheet.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    drag = { y0: e.touches[0].clientY, top: sheet.scrollTop, dy: 0, on: false };
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (!drag) return;
    const dy = e.touches[0].clientY - drag.y0;
    if (!drag.on && (drag.top > 0 || dy <= 4)) return;
    drag.on = true;
    drag.dy = Math.max(0, dy);
    e.preventDefault();
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${drag.dy}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - drag.dy / 400));
  }, { passive: false });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    sheet.style.transition = "";
    if (d.dy > DRAG_CLOSE_PX) {
      sheet.style.transform = "translateY(105%)";
      closeSheetUi();
    } else {
      sheet.style.transform = "";
      scrim.style.opacity = "";
    }
  };
  sheet.addEventListener("touchend", endDrag, { passive: true });
  sheet.addEventListener("touchcancel", endDrag, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheetOpen) closeSheetUi();
  });

  function detail(it, kind) {
    const d = destOf(it);
    const a = state.arbs.get(it.id);
    let btns = "";
    if (kind === "sure") btns = `<button class="q-full o-btn soft block" data-x="keep">Garder « ${esc(it.f || it.r)} »</button>`;
    if ((kind === "sure" || kind === "check") && sameLabel(it).length > 1) {
      btns += `<button class="q-full o-btn soft block" data-x="all">Garder tout l’album (${fmt(sameLabel(it).length)} titres)</button>`;
    }
    if (kind === "mine") btns = `<button class="q-full o-btn soft block" data-x="reset">Annuler ma décision</button>`;
    const proof = (!a || a.decision !== "keep") && (it.k === "sure" || it.k === "check") && (!a || a.to_album === it.to) ?
      proofHTML(it, it.to, it.ts) :
      `<div class="q-alb">${coverHTML(d.sur, d.rel, d.title)}<span class="q-pt"><b>${esc(d.title || "Sans album")}</b><span>${a ? "ton choix" : "tel quel"}</span></span></div>`;
    openSheet(`<h3>${esc(it.t)}</h3><p class="q-sub">${esc(it.a)} · ${esc(it.w)}</p>${proof}${btns}
      <button class="q-full o-btn soft block" data-x="pick">${kind === "keep" ? "Choisir un album" : "Choisir un autre album"}</button>`);
    bindProof(sheet);
    sheet.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => {
      const x = b.dataset.x;
      if (x === "keep") { closeSheetUi(); decide(it, { decision: "keep" }); }
      if (x === "reset") { closeSheetUi(); undo(it, "Décision annulée"); }
      if (x === "pick") picker(it);
      if (x === "all") { closeSheetUi(); keepAll(it); }
    }));
  }

  function picker(it) {
    const albums = Array.from(library().values())
        .filter((a) => a.artist === it.a)
        .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0));
    const row = (a) => `<button class="q-pick" data-sur="${esc(a.album_sur)}">${coverHTML(a.album_sur, "", a.album)}<span class="q-pt"><b>${esc(a.album)}</b><span>${fmt(a.listen_count)} écoutes</span></span></button>`;
    openSheet(`<h3>Où ranger « ${esc(it.t)} » ?</h3><p class="q-sub">Albums de ${esc(it.a)} dans ta bibliothèque</p>
      <input class="q-search" type="search" placeholder="Chercher un album…" aria-label="Chercher un album">
      <div class="q-picks">${albums.map(row).join("") || `<p class="q-sub">Aucun autre album de cet artiste.</p>`}</div>
      <button class="q-pick" data-sur="">${coverHTML(it.f ? `${it.a}-${it.f}` : it.s, "", it.f)}<span class="q-pt"><b>Garder « ${esc(it.f || it.r)} »</b><span>tel quel</span></span></button>`);
    const input = sheet.querySelector(".q-search");
    const box = sheet.querySelector(".q-picks");
    const bind = () => sheet.querySelectorAll("[data-sur]").forEach((b) => b.addEventListener("click", () => {
      const sur = b.dataset.sur;
      closeSheetUi();
      if (!sur) return decide(it, { decision: "keep" });
      const a = library().get(sur);
      decide(it, { decision: "move", to: a ? a.album : sur, ts: sur });
    }));
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      box.innerHTML = albums.filter((a) => a.album.toLowerCase().includes(q)).map(row).join("");
      bind();
    });
    bind();
  }

  // ---- Décisions (curation, IM-9) ------------------------------------------------------
  // Titres rangés aujourd'hui sur le même album (quel que soit le libellé
  // reçu : single, titre seul…), sans décision et que l'app déplacerait (à
  // vérifier ou sûrs) : « Garder tout l'album » (v2.23.6, élargi v2.23.7).
  function sameLabel(it) {
    return state.items.filter((x) => x.a === it.a && x.f === it.f &&
      !state.arbs.has(x.id) && (x.k === "check" || x.k === "sure"));
  }
  // Une décision « garder » par titre (même identité que les autres
  // décisions), écrites ensemble ; « Annuler » les retire ensemble.
  async function keepAll(it) {
    const list = sameLabel(it);
    if (!list.length) return;
    const at = firebase.firestore.FieldValue.serverTimestamp();
    try {
      for (let i = 0; i < list.length; i += 400) {
        const batch = newBatch();
        for (const x of list.slice(i, i + 400)) {
          batch.set(arbCol().doc(x.id), { artist: x.a, track: x.t,
            raw_album_sur: x.s, decision: "keep", scope: "album", at });
        }
        await batch.commit();
      }
      toast(`${fmt(list.length)} titres gardés sur « ${it.f || it.r} »`, async () => {
        try {
          for (let i = 0; i < list.length; i += 400) {
            const batch = newBatch();
            for (const x of list.slice(i, i + 400)) batch.delete(arbCol().doc(x.id));
            await batch.commit();
          }
        } catch (err) {
          toast("Pas annulé : " + (err.message || "erreur"));
        }
      });
    } catch (err) {
      toast("Pas enregistré : " + (err.message || "erreur"));
    }
  }

  async function decide(it, d) {
    const doc = {
      artist: it.a, track: it.t, raw_album_sur: it.s, decision: d.decision,
      at: firebase.firestore.FieldValue.serverTimestamp(),
      // Ce qui était proposé à ce moment (v2.35.0, export) : l'accord avec
      // le moteur se mesure catégorie par catégorie.
      proposed_album: it.to || "", proposed_kind: it.k || "", proposed_reason: it.w || "",
    };
    if (d.decision === "move") {
      doc.to_album = d.to;
      if (d.ts) doc.to_album_sur = d.ts;
    }
    try {
      await arbCol().doc(it.id).set(doc);
      // Tranché : il quitte les passés.
      if (state.later.has(it.id)) laterCol().doc(it.id).delete().catch(() => {});
      toast(d.decision === "keep" ? "Gardé ici" : `Déplacé vers « ${d.to} »`, () => {
        if (sub && sub.kind === "review") fx.streak = Math.max(0, fx.streak - 1);
        undo(it);
      });
    } catch (err) {
      toast("Pas enregistré : " + (err.message || "erreur"));
      if (sub) renderSub();
    }
  }
  async function undo(it, msg) {
    try {
      await arbCol().doc(it.id).delete();
      if (msg) toast(msg);
    } catch (err) {
      toast("Pas annulé : " + (err.message || "erreur"));
    }
  }

  // À revoir · « Remettre à part » : défait le rangement. Appliqué → la
  // correction est retirée (effet immédiat, comme « Annuler » d'un lot) et
  // la décision devient « garder » ; rangé d'office → une décision comme
  // les autres, appliquée au prochain lot. Annulable.
  async function putBack(it) {
    const prevArb = state.arbs.get(it.id) || null;
    const prevAp = state.applied.get(it.id) || null;
    if (!prevArb && !prevAp) return decide(it, { decision: "move", to: it.r || "Sans album", ts: it.s });
    try {
      await arbCol().doc(it.id).set({ artist: it.a, track: it.t, raw_album_sur: it.s,
        decision: "keep", reviewed: true, at: firebase.firestore.FieldValue.serverTimestamp(),
        proposed_album: (prevArb && prevArb.to_album) || (prevAp && prevAp.to_album) || "",
        proposed_kind: "revoir", proposed_reason: it.rv || "" });
      if (prevAp) await appliedCol().doc(it.id).delete();
      toast(prevAp && !demo() ? "Remis à part · actualisation…" : "Remis à part", async () => {
        try {
          if (prevArb) await arbCol().doc(it.id).set(prevArb); else await arbCol().doc(it.id).delete();
          if (prevAp) { await appliedCol().doc(it.id).set(prevAp); refreshAfter(); }
        } catch (err) { toast("Pas annulé : " + (err.message || "erreur")); }
      });
      if (prevAp) refreshAfter();
    } catch (err) {
      toast("Pas enregistré : " + (err.message || "erreur"));
      if (sub) renderSub();
    }
  }
  // À revoir · « Garder ici » : le rangement est confirmé, il ne revient plus.
  async function confirmKept(it) {
    const prevArb = state.arbs.get(it.id) || null;
    const ap = state.applied.get(it.id) || null;
    if (!prevArb && !ap) return decide(it, { decision: "keep" });
    try {
      await arbCol().doc(it.id).set(prevArb ? { reviewed: true } : { artist: it.a, track: it.t,
        raw_album_sur: it.s, decision: "move", to_album: ap.to_album, to_album_sur: ap.to_album_sur || "",
        reviewed: true, at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      toast("Gardé ici", async () => {
        try {
          if (prevArb) await arbCol().doc(it.id).set(prevArb); else await arbCol().doc(it.id).delete();
        } catch (err) { toast("Pas annulé : " + (err.message || "erreur")); }
      });
    } catch (err) {
      toast("Pas enregistré : " + (err.message || "erreur"));
      if (sub) renderSub();
    }
  }

  // ---- Bandeau avec « Annuler » ------------------------------------------------------
  const toastEl = document.createElement("div");
  toastEl.className = "q-toast";
  toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  let toastTimer = null;
  function toast(msg, undoFn) {
    toastEl.innerHTML = `<span>${esc(msg)}</span>` + (undoFn ? `<button type="button">Annuler</button>` : "");
    if (undoFn) toastEl.querySelector("button").addEventListener("click", () => { toastEl.classList.remove("on"); undoFn(); });
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("on"), 3500);
  }

  // Depuis la fiche album (v2.32.0) : revoir les titres rangés d'office
  // sous cet album — « Garder ici » ou « Remettre à part ».
  async function reviewAlbum(albumSur) {
    if (!ownerUid() || !albumSur) return;
    watch();
    if (!state.loaded) await load();
    const ids = state.items.filter((it) => it.k === "linked" && `${it.a}-${it.f}` === albumSur &&
        !state.arbs.has(it.id) && !state.applied.has(it.id)).map((it) => it.id);
    if (!ids.length) { toast("Tous ses titres rattachés sont déjà revus."); return; }
    openSub("review", ids);
  }
  window.OrpheeQuality = { reviewAlbum };

  // ---- Branchement ----------------------------------------------------------------------
  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) return;
    document.addEventListener("orphee:tab", (e) => {
      if (e.detail.tab !== "quality") return;
      if (!ownerUid()) return;
      watch();
      if (window.OrpheeLibrary) window.OrpheeLibrary.ensure().then(() => { libCache = null; render(); }).catch(() => {});
      if (!state.loaded) { renderHome(); load(); } else render();
    });
    document.addEventListener("orphee:refreshed", () => { libCache = null; if (state.loaded) load(); });
  }

  init();
})();
