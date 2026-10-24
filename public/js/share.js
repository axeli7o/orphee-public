/* Orphée · Partager ma bibliothèque (PM-28, ADR-042) — côté Axel, Réglages.
   Un accès d'1 h en lecture seule : un QR à faire scanner, ou un lien à
   envoyer. Un seul accès à la fois ; « Couper l'accès » le ferme tout de
   suite, même pour ceux déjà entrés.
   Le jeton n'existe en clair que dans le QR, le lien et ce navigateur
   (localStorage, le temps de l'accès, pour réafficher le QR) ; le serveur
   n'en garde que l'empreinte. */
(function () {
  "use strict";

  const root = document.getElementById("set-share");
  if (!root) return;

  const REGION = "europe-west1";
  const LS = "orphee.share";
  const SVG_NS = "http://www.w3.org/2000/svg";
  let state = { mode: "idle", until: 0, token: null, error: null };
  let timer = 0;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function loadLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(LS) || "null");
      return v && v.until > Date.now() && typeof v.token === "string" ? v : null;
    } catch (e) { return null; }
  }
  function saveLocal(v) {
    try {
      if (v) localStorage.setItem(LS, JSON.stringify(v));
      else localStorage.removeItem(LS);
    } catch (e) { /* le QR ne sera simplement pas réaffiché */ }
  }

  const link = (token) => `${location.origin}/#invite=${token}`;
  const fn = (name) => firebase.app().functions(REGION).httpsCallable(name);

  // QR dessiné en SVG (qrcode-generator, MIT, public/js/vendor) : aucun HTML injecté.
  function qrSvg(text) {
    const q = window.qrcode(0, "M");
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    const pad = 2;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${n + pad * 2} ${n + pad * 2}`);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR code de l'accès invité");
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "#fff");
    svg.appendChild(bg);
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    }
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "#0a0c0b");
    svg.appendChild(path);
    return svg;
  }

  // Un accès en cours, créé ailleurs (autre appareil) ou ici ?
  async function refreshState() {
    const local = loadLocal();
    if (local) { state = { mode: "live", until: local.until, token: local.token, error: null }; return; }
    try {
      const snap = await firebase.firestore().collection("shares")
          .where("until", ">", firebase.firestore.Timestamp.now()).limit(1).get();
      if (!snap.empty) {
        state = { mode: "elsewhere", until: snap.docs[0].data().until.toMillis(), token: null, error: null };
        return;
      }
    } catch (err) {
      console.error("[share] état non lu :", err.message);
    }
    state = { mode: "idle", until: 0, token: null, error: state.error };
  }

  async function create() {
    state = Object.assign({}, state, { mode: "busy", error: null });
    render();
    try {
      const res = await fn("createShare")({});
      saveLocal({ token: res.data.token, until: res.data.until });
      // Réveille joinShare pendant que tu montres le QR : le scan de ton ami
      // ne paiera pas le démarrage à froid. L'appel est refusé (tu n'es pas
      // un compte anonyme) et ne fait rien d'autre.
      fn("joinShare")({}).catch(() => {});
      state = { mode: "live", until: res.data.until, token: res.data.token, error: null };
    } catch (err) {
      console.error("[share] création impossible :", err.message);
      state = { mode: "idle", until: 0, token: null, error: "Impossible de créer l’accès. Réessaie." };
    }
    render();
  }

  async function revoke() {
    state = Object.assign({}, state, { mode: "busy", error: null });
    render();
    try {
      await fn("revokeShare")({});
      saveLocal(null);
      state = { mode: "idle", until: 0, token: null, error: null };
      if (window.OrpheeToast) window.OrpheeToast("Accès coupé", "ok", 1800);
    } catch (err) {
      console.error("[share] coupure impossible :", err.message);
      await refreshState();
      state.error = "Impossible de couper l’accès. Réessaie.";
    }
    render();
  }

  async function send(token) {
    const url = link(token);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Ma bibliothèque Orphée", text: "Ma bibliothèque, pendant 1 h :", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      if (window.OrpheeToast) window.OrpheeToast("Lien copié", "ok", 1600);
    } catch (err) {
      if (err && err.name === "AbortError") return; // partage annulé
      if (window.OrpheeToast) window.OrpheeToast("Copie impossible.", "error", 3000);
    }
  }

  const minutesLeft = () => Math.max(0, Math.ceil((state.until - Date.now()) / 60000));
  const hhmm = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  function render() {
    clearInterval(timer);
    root.innerHTML = "";
    root.appendChild(el("h3", "stat-title", "Partager ma bibliothèque"));
    root.appendChild(el("p", "settings-help",
        "1 h, en lecture seule. Ni Orphée, ni tes conversations."));

    if (state.mode === "live" || state.mode === "elsewhere") {
      const card = el("div", "share-card");
      if (state.token) {
        const qr = el("div", "share-qr");
        qr.appendChild(qrSvg(link(state.token)));
        card.appendChild(qr);
      } else {
        card.appendChild(el("p", "settings-help", "Le QR est affiché sur l’appareil qui l’a créé."));
      }
      const left = el("p", "share-left");
      const meter = el("div", "share-meter");
      const fill = el("i");
      meter.appendChild(fill);
      const tick = () => {
        const m = minutesLeft();
        if (m <= 0) { saveLocal(null); state = { mode: "idle", until: 0, token: null, error: null }; render(); return; }
        left.textContent = `Encore ${m} min · jusqu’à ${hhmm(state.until)}`;
        fill.style.width = Math.min(100, m / 60 * 100) + "%";
      };
      card.appendChild(left);
      card.appendChild(meter);
      const row = el("div", "share-actions");
      if (state.token) {
        const sendBtn = el("button", "share-btn o-btn soft block", navigator.share ? "Envoyer le lien" : "Copier le lien");
        sendBtn.type = "button";
        sendBtn.addEventListener("click", () => send(state.token));
        row.appendChild(sendBtn);
      }
      const cut = el("button", "share-btn share-cut o-btn soft block", "Couper l’accès");
      cut.type = "button";
      cut.addEventListener("click", revoke);
      row.appendChild(cut);
      card.appendChild(row);
      root.appendChild(card);
      tick();
      timer = setInterval(tick, 20000);
    } else {
      const go = el("button", "btn-primary share-go o-btn main block",
          state.mode === "busy" ? "Création…" : "Créer un accès d’1 h");
      go.type = "button";
      go.disabled = state.mode === "busy";
      go.addEventListener("click", create);
      root.appendChild(go);
    }
    if (state.error) root.appendChild(el("p", "settings-help share-error", state.error));
  }

  async function activate() {
    if (!firebase.auth().currentUser || firebase.auth().currentUser.isAnonymous) return;
    await refreshState();
    render();
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) return;
    render();
    document.addEventListener("orphee:tab", (e) => {
      if (e.detail.tab === "settings") activate();
      else clearInterval(timer);
    });
    firebase.auth().onAuthStateChanged((u) => {
      if (!u) { saveLocal(null); state = { mode: "idle", until: 0, token: null, error: null }; render(); }
    });
  }

  init();
})();
