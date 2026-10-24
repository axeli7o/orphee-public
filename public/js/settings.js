(function () {
  "use strict";

  const GRADES = window.ORPHEE_GRADES || {};
  const COLORS = window.ORPHEE_GRADE_COLORS || {};
  const DEFAULTS = {percentile: 90, eligible: [1, 2]};

  const pctEl = document.getElementById("set-percentile");
  const pctValEl = document.getElementById("set-pct-val");
  const thresholdEl = document.getElementById("set-threshold");
  const gradeableCountEl = document.getElementById("set-gradeable-count");
  const gradesEl = document.getElementById("set-grades");
  const countEl = document.getElementById("set-oddity-count");
  const statusEl = document.getElementById("set-status");

  let eligible = DEFAULTS.eligible.slice();
  let loaded = false;
  let saveTimer = null;
  let statusTimer = null;

  function updateGradeChips() {
    for (const chip of gradesEl.querySelectorAll(".chip")) {
      const on = eligible.indexOf(Number(chip.dataset.grade)) >= 0;
      chip.classList.toggle("is-active", on);
    }
  }

  function preview() {
    pctValEl.textContent = pctEl.value;
    const api = window.orpheeOddity;
    if (!api || !api.ready()) {
      gradeableCountEl.textContent = "…";
      thresholdEl.textContent = "";
      countEl.textContent = "";
      return;
    }
    const res = api.preview(Number(pctEl.value), eligible);
    thresholdEl.textContent = res.threshold > 0 ?
      ("Seuil : ≥ " + res.threshold + " écoutes") : "";
    gradeableCountEl.textContent = res.gradeableCount + " / " + api.totalCount();
    countEl.textContent = res.count + " paradoxe" +
        (res.count > 1 ? "s" : "") + " avec ces réglages.";
  }

  function setStatus(text) {
    clearTimeout(statusTimer);
    statusEl.textContent = text;
    if (text) statusTimer = setTimeout(() => { statusEl.textContent = ""; }, 2000);
  }

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }

  function buildGradeChips() {
    gradesEl.innerHTML = "";
    for (const g of [1, 2, 3, 4, 5]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip cur-note";
      b.dataset.grade = String(g);
      b.textContent = GRADES[g];
      const c = COLORS[g];
      if (c) {
        b.style.backgroundColor = c.bg;
        b.style.color = c.fg;
      }
      b.addEventListener("click", () => {
        const i = eligible.indexOf(g);
        if (i >= 0) eligible.splice(i, 1);
        else eligible.push(g);
        updateGradeChips();
        preview();
        debouncedSave();
      });
      gradesEl.appendChild(b);
    }
  }

  async function load() {
    const user = firebase.auth().currentUser;
    const s = Object.assign({}, DEFAULTS);
    if (user) {
      try {
        const snap = await firebase.firestore()
            .doc("users/" + user.uid + "/settings/oddity").get();
        if (snap.exists) {
          const d = snap.data();
          if (typeof d.percentile === "number") s.percentile = d.percentile;
          if (Array.isArray(d.eligible)) s.eligible = d.eligible;
        }
      } catch (err) {
        console.error("Settings load failed:", err);
      }
    }
    pctEl.value = s.percentile;
    eligible = s.eligible.slice();
    updateGradeChips();
    preview();
    loaded = true;
  }

  async function save() {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const data = {
      percentile: Number(pctEl.value),
      eligible: eligible.slice().sort((a, b) => a - b),
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
      await firebase.firestore()
          .doc("users/" + user.uid + "/settings/oddity")
          .set(data, {merge: true});
      document.dispatchEvent(new CustomEvent("orphee:settings-saved", {
        detail: {percentile: data.percentile, eligible: data.eligible},
      }));
      setStatus("✓");
    } catch (err) {
      console.error("Settings save failed:", err);
      setStatus("Échec");
    }
  }

  // ── Nom Last.fm (en-tête de « Moi ») : users/{uid}/settings/profile ──────
  // Un nom d'utilisateur Last.fm : lettres, chiffres, « _ » et « - ».
  const lfmEl = document.getElementById("set-lastfm");
  const LFM_RE = /^[A-Za-z0-9_-]{0,40}$/;
  async function loadProfile() {
    const user = firebase.auth().currentUser;
    if (!user || !lfmEl) return;
    try {
      const snap = await firebase.firestore().doc("users/" + user.uid + "/settings/profile").get();
      lfmEl.value = (snap.exists && snap.data().lastfm_user) || "";
      if (artistEl) artistEl.value = (snap.exists && snap.data().artist_name) || "";
    } catch (err) {
      console.error("Profil non chargé :", err);
    }
  }
  async function saveProfile() {
    const user = firebase.auth().currentUser;
    if (!user || !lfmEl) return;
    const v = lfmEl.value.trim();
    if (!LFM_RE.test(v)) {
      if (window.OrpheeToast) window.OrpheeToast("Nom Last.fm : lettres, chiffres, « _ » ou « - » seulement.", "error", 4000);
      return;
    }
    try {
      await firebase.firestore().doc("users/" + user.uid + "/settings/profile").set({
        lastfm_user: v,
        updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      document.dispatchEvent(new CustomEvent("orphee:profile-saved", {detail: {lastfm_user: v}}));
      if (window.OrpheeToast) window.OrpheeToast(v ? "Enregistré · " + v : "Nom Last.fm retiré");
    } catch (err) {
      console.error("Profil non enregistré :", err);
      if (window.OrpheeToast) window.OrpheeToast("Non enregistré — vérifie ta connexion et réessaie.", "error", 4000);
    }
  }

  // Ton nom d'artiste (v2.42.0, PM-37) : ta musique sort des récits de la vue
  // Artistes et y a son bloc. Texte libre, sans caractères de contrôle.
  const artistEl = document.getElementById("set-artist");
  async function saveArtist() {
    const user = firebase.auth().currentUser;
    if (!user || !artistEl) return;
    const v = artistEl.value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
    artistEl.value = v;
    try {
      await firebase.firestore().doc("users/" + user.uid + "/settings/profile").set({
        artist_name: v,
        updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      if (window.OrpheeToast) window.OrpheeToast(v ? `Enregistré · effet au prochain « Actualiser »` : "Nom d'artiste retiré");
    } catch (err) {
      console.error("Nom d'artiste non enregistré :", err);
      if (window.OrpheeToast) window.OrpheeToast("Non enregistré — vérifie ta connexion et réessaie.", "error", 4000);
    }
  }

  function init() {
    if (artistEl) {
      artistEl.addEventListener("change", saveArtist);
      artistEl.addEventListener("keydown", (e) => { if (e.key === "Enter") artistEl.blur(); });
    }
    if (lfmEl) {
      lfmEl.addEventListener("change", saveProfile);
      lfmEl.addEventListener("keydown", (e) => { if (e.key === "Enter") lfmEl.blur(); });
      document.addEventListener("orphee:tab", (e) => {
        if (e.detail.tab === "settings") loadProfile();
      });
    }
    if (!pctEl) return;
    buildGradeChips();
    pctEl.addEventListener("input", () => { preview(); debouncedSave(); });
    document.addEventListener("orphee:tab", (e) => {
      if (e.detail.tab === "settings") load();
    });
    document.addEventListener("orphee:refreshed", () => {
      if (loaded) preview();
    });
  }

  init();
})();
