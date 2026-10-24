/* Orphée · Session : à qui sont les données affichées (ADR-042).
   - Axel (propriétaire) : ses données, users/{son uid}.
   - Invité (compte anonyme, PM-28) : celles d'Axel, en lecture, le temps de
     l'accès. Le lien d'invitation porte le jeton dans le fragment
     (#invite=…), jamais envoyé au serveur d'hébergement ; joinShare
     l'échange contre un accès, puis la page se recharge proprement.
   La session invitée ne vit que dans cet onglet (persistance SESSION) : rien
   ne reste sur le téléphone de l'ami. L'interface ne protège rien : ce sont
   les règles Firestore qui bornent l'invité (IM-8). */
(function () {
  "use strict";

  const KEY = "orphee.guest";
  const REGION = "europe-west1";

  function readGuest() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; }
  }
  function clearGuest() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* rien */ }
  }

  function user() {
    return typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
  }

  // Accès invité valide pour l'utilisateur anonyme courant, sinon null.
  function guest() {
    const u = user();
    const g = readGuest();
    return u && u.isAnonymous && g && g.anon === u.uid && g.until > Date.now() ? g : null;
  }

  function isGuest() {
    const u = user();
    return !!(u && u.isAnonymous);
  }

  // Propriétaire des données à lire : soi-même, ou celui qu'on visite.
  function dataUid() {
    const u = user();
    if (!u) return null;
    if (!u.isAnonymous) return u.uid;
    const g = guest();
    return g ? g.owner : null;
  }

  // Session prête à lire des données : le propriétaire, ou un invité dont
  // l'accès est déjà enregistré. Pendant l'échange du jeton (compte anonyme
  // tout neuf, page sur le point de se recharger), rien ne doit être lu :
  // les règles le refuseraient (v2.24.2).
  function ready(u) {
    const x = u === undefined ? user() : u;
    return !!x && (!x.isAnonymous || !!guest());
  }

  let joining = false;

  function firstAuthState(auth) {
    return new Promise((resolve) => {
      const off = auth.onAuthStateChanged((u) => { off(); resolve(u); });
    });
  }

  async function join(token) {
    joining = true;
    document.documentElement.classList.add("is-joining");
    const auth = firebase.auth();
    try {
      const current = await firstAuthState(auth);
      // Axel qui scanne son propre QR : on ne le déconnecte pas.
      if (current && !current.isAnonymous) {
        joining = false;
        document.documentElement.classList.remove("is-joining");
        return;
      }
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const anon = current || (await auth.signInAnonymously()).user;
      const res = await firebase.app().functions(REGION)
          .httpsCallable("joinShare")({ token });
      sessionStorage.setItem(KEY, JSON.stringify({
        anon: anon.uid, owner: res.data.owner, until: res.data.until,
      }));
      location.reload();
    } catch (err) {
      console.error("[session] invitation refusée :", err && err.message);
      clearGuest();
      joining = false;
      document.documentElement.classList.remove("is-joining");
      document.documentElement.classList.add("guest-ended");
      try { await auth.signOut(); } catch (e) { /* rien */ }
      const msg = document.getElementById("login-error");
      if (msg) {
        msg.textContent = "Ce lien n’est plus valable. Demande un nouveau QR.";
        msg.hidden = false;
      }
    }
  }

  // Fin de visite (échéance atteinte ou accès coupé) : on referme tout.
  async function end(message) {
    clearGuest();
    const banner = document.getElementById("guest-banner");
    if (banner) banner.hidden = true;
    document.documentElement.classList.add("guest-ended");
    try { await firebase.auth().signOut(); } catch (e) { /* rien */ }
    const msg = document.getElementById("login-error");
    if (msg) {
      msg.textContent = message || "La visite est terminée. Demande un nouveau QR pour revenir.";
      msg.hidden = false;
    }
  }

  // Pendant la visite : bandeau (à qui, temps restant), fin à l'échéance,
  // et un contrôle régulier côté serveur (un accès coupé ferme la visite).
  let visitTimer = 0;
  async function startVisit() {
    const g = guest();
    const banner = document.getElementById("guest-banner");
    if (!g || !banner) return;
    banner.hidden = false;
    try {
      const snap = await firebase.firestore().doc(`users/${g.owner}/settings/profile`).get();
      const name = snap.exists && snap.data().lastfm_user;
      if (name) document.getElementById("guest-owner").textContent = name;
    } catch (e) { /* le nom par défaut suffit */ }
    let ticks = 0;
    const tick = async () => {
      const left = g.until - Date.now();
      if (left <= 0) { clearInterval(visitTimer); end(); return; }
      document.getElementById("guest-left").textContent =
        `encore ${Math.max(1, Math.ceil(left / 60000))} min`;
      if (++ticks % 4 === 0) {
        try {
          await firebase.firestore().doc("cache/agg_global").get({ source: "server" });
        } catch (err) {
          if (err && err.code === "permission-denied") {
            clearInterval(visitTimer);
            end("Axel a fermé l’accès. La visite est terminée.");
          }
        }
      }
    };
    clearInterval(visitTimer);
    tick();
    visitTimer = setInterval(tick, 15000);
  }

  window.OrpheeSession = {
    dataUid, isGuest, guest, ready, end, clearGuest, startVisit,
    joining: () => joining,
  };

  // Lien d'invitation : on retire tout de suite le jeton de l'adresse
  // (historique, captures d'écran), puis on l'échange.
  const m = location.hash.match(/^#invite=([A-Za-z0-9_-]{43})$/);
  if (m) {
    history.replaceState(null, "", location.pathname + location.search);
    if (typeof firebase !== "undefined" && firebase.auth) join(m[1]);
  }
})();
