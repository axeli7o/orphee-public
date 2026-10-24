/* Orphée · Pile « Mis de côté » (PM-34 à PM-36, MODELE E11).
   - Curation E11 : users/{uid}/aside/{album_sur} = {at (ms), star, snooze_until?}
     — éditée par Axel seul ; lue EN DIRECT (ADR-031).
   - Signal de la pile (dérivé, IM-6) : prêt à noter / à découvrir / oublié,
     d'après les jours d'écoute depuis la mise de côté (private/aside, calculé
     à l'actualisation, refresh/aside.js). Ne modifie jamais E11.
   - Noter un album le sort de la pile (geste explicite, annulable).
   L'invité ne voit pas la pile (PM-35) : rien n'est lu pour lui.
   Partie pure en tête, require-able par les tests Node (functions/test). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api.pure;
  } else {
    root.OrpheeAside = api.store();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 86400000;
  const READY_DAYS = 3;     // jours distincts d'écoute depuis la mise de côté
  const FORGOT_DAYS = 91;   // ~3 mois
  const SNOOZE_DAYS = 30;   // « Pas maintenant » : la question attend un mois
  const RANK = { ready: 0, new: 1, old: 2 };

  // Signal d'une mise de côté. dayLasts = dernière écoute (uts) de chaque
  // jour écouté depuis la mise de côté ; seuls ceux après `at` comptent
  // (« Garder » remet `at` au jour sans attendre d'actualisation).
  function signal(entry, dayLasts, now) {
    const at = entry && typeof entry.at === "number" ? entry.at : now;
    const days = (dayLasts || []).filter((u) => u * 1000 > at).length;
    let kind = "new";
    if (days >= READY_DAYS) kind = "ready";
    else if (now - at > FORGOT_DAYS * DAY_MS) kind = "old";
    return { kind, days };
  }

  // Ordre de la pile : envie forte, puis prêts, à découvrir, oubliés ; à
  // signal égal, le plus anciennement mis de côté d'abord.
  function compare(x, y) {
    return (!!y.entry.star - !!x.entry.star) ||
      (RANK[x.sig.kind] - RANK[y.sig.kind]) ||
      ((x.entry.at || 0) - (y.entry.at || 0));
  }

  // La question du jour : la première de la pile qui en mérite une (prêt
  // ou oublié) et qu'Axel n'a pas écartée récemment.
  function question(sorted, now) {
    return sorted.find((x) => (x.sig.kind === "ready" || x.sig.kind === "old") &&
      !(typeof x.entry.snooze_until === "number" && x.entry.snooze_until > now)) || null;
  }

  const pure = { signal, compare, question, READY_DAYS, FORGOT_DAYS, SNOOZE_DAYS, DAY_MS };

  function store() {
    const entries = new Map();   // album_sur → {at, star, snooze_until}
    let days = {};               // album_sur → [uts]
    let loaded = false;
    let unsub = null;

    const fs = () => firebase.firestore();
    const isGuest = () => !!(window.OrpheeSession && window.OrpheeSession.isGuest());
    const uid = () => {
      const u = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
      return u && !u.isAnonymous ? u.uid : null;
    };
    const ref = (key) => fs().doc(`users/${uid()}/aside/${key}`);
    const valid = (key) => typeof key === "string" && key && key.indexOf("/") === -1;
    const changed = () => document.dispatchEvent(new CustomEvent("orphee:aside-changed"));

    async function loadDays() {
      try {
        const s = await fs().doc("private/aside").get();
        days = (s.exists && s.data().items) || {};
      } catch (err) {
        console.error("[aside] jours d'écoute illisibles :", err.message);
        days = {};
      }
    }

    function start() {
      stop();
      if (!uid() || isGuest()) return;
      loadDays().then(changed);
      unsub = fs().collection(`users/${uid()}/aside`).onSnapshot((snap) => {
        entries.clear();
        snap.forEach((d) => entries.set(d.id, d.data()));
        loaded = true;
        changed();
      }, (err) => console.error("[aside] pile illisible :", err.message));
    }
    function stop() {
      if (unsub) unsub();
      unsub = null;
      entries.clear();
      days = {};
      loaded = false;
    }

    async function write(key, fn, okMsg, undoFn) {
      if (!uid() || !valid(key)) return false;
      try {
        await fn(ref(key));
        if (okMsg) toast(okMsg, undoFn);
        return true;
      } catch (err) {
        console.error("[aside] écriture refusée :", err.message);
        if (window.OrpheeToast) window.OrpheeToast("Non enregistré — vérifie ta connexion et réessaie.", "error", 4500);
        return false;
      }
    }

    const api = {
      loaded: () => loaded,
      has: (key) => entries.has(key),
      entry: (key) => entries.get(key) || null,
      count: () => entries.size,
      // Met de côté (date du jour). Sans message : l'appelant raconte.
      put: (key, msg) => write(key, (r) => r.set({ at: Date.now(), star: false }), msg,
          () => api.remove(key)),
      remove: (key, msg) => {
        const prev = entries.get(key);
        return write(key, (r) => r.delete(), msg, prev ? () => api.restore(key, prev) : null);
      },
      restore: (key, prev) => write(key, (r) => r.set(prev)),
      star: (key, on) => write(key, (r) => r.set({ star: !!on }, { merge: true })),
      // « Toujours envie » : la date repart du jour, la question s'efface.
      keep: (key, msg) => write(key, (r) => r.set({ at: Date.now(),
        snooze_until: firebase.firestore.FieldValue.delete() }, { merge: true }), msg),
      snooze: (key, msg) => write(key, (r) => r.set({ snooze_until: Date.now() + SNOOZE_DAYS * DAY_MS },
          { merge: true }), msg),
      // Pile ordonnée, sur les albums connus de la bibliothèque.
      list: (items) => {
        const byKey = new Map((items || []).map((a) => [a.album_sur, a]));
        const now = Date.now();
        const out = [];
        for (const [key, entry] of entries) {
          const a = byKey.get(key);
          if (a) out.push({ a, entry, sig: signal(entry, days[key], now) });
        }
        return out.sort(compare);
      },
      question: (items) => question(api.list(items), Date.now()),
    };

    // ---- Bandeau avec « Annuler » (même style que Qualité) ----
    let toastEl = null, toastTimer = null;
    function toast(msg, undoFn) {
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.className = "q-toast";
        toastEl.setAttribute("role", "status");
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = "";
      const span = document.createElement("span");
      span.textContent = msg;
      toastEl.appendChild(span);
      if (undoFn) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Annuler";
        b.addEventListener("click", () => { toastEl.classList.remove("on"); undoFn(); });
        toastEl.appendChild(b);
      }
      toastEl.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("on"), 3500);
    }
    api.toast = toast;

    // Noter un album le sort de la pile (PM-34) — note posée par la fiche,
    // « À faire » ou Orphée en proxy (gradeSet), jamais un simple genre.
    document.addEventListener("orphee:album-graded", (e) => {
      const d = e.detail || {};
      if (!d.gradeSet || !d.curation || d.curation.grade == null) return;
      if (!entries.has(d.album_sur)) return;
      api.remove(d.album_sur, "Noté · sorti de « Mis de côté »");
    });
    // Nouvelles écoutes : les jours depuis la mise de côté changent.
    document.addEventListener("orphee:refreshed", () => {
      if (uid() && !isGuest()) loadDays().then(changed);
    });

    if (typeof firebase !== "undefined" && firebase.auth) {
      firebase.auth().onAuthStateChanged((u) => {
        if (u && window.OrpheeSession && !window.OrpheeSession.ready(u)) return;
        start();
      });
    }
    return api;
  }

  return { pure, store };
});
