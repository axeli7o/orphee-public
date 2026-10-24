(function () {
  'use strict';

  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const loginError = document.getElementById('login-error');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');

  function showError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.hidden = false;
  }

  function clearError() {
    if (!loginError) return;
    loginError.hidden = true;
    loginError.textContent = '';
  }

  function render(user) {
    if (user) {
      document.body.classList.add('is-authed');
      const displayName = user.displayName || user.email || '';
      const firstName = displayName.split(' ')[0] || '';
      if (userName) userName.textContent = firstName;
      if (userEmail) userEmail.textContent = user.email || '';
      if (userAvatar) {
        if (user.photoURL) {
          userAvatar.src = user.photoURL;
          userAvatar.alt = displayName;
          userAvatar.hidden = false;
        } else {
          userAvatar.removeAttribute('src');
          userAvatar.alt = '';
          userAvatar.hidden = true;
        }
      }
    } else {
      document.body.classList.remove('is-authed');
      document.documentElement.classList.remove('is-guest');
      if (userName) userName.textContent = '';
      if (userEmail) userEmail.textContent = '';
      if (userAvatar) {
        userAvatar.removeAttribute('src');
        userAvatar.alt = '';
        userAvatar.hidden = true;
      }
    }
  }

  function init() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      showError('Firebase ne s\'est pas chargé. Recharge la page.');
      return;
    }

    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    // Mode local (dev-emulators.js) : compte de test créé par tools/dev/seed.js
    // dans l'émulateur Auth — pas de popup Google.
    const DEV_ACCOUNT = {email: 'axel@example.com', password: 'orphee-dev'};
    if (window.ORPHEE_EMULATORS) {
      loginBtn.textContent = 'Continuer (compte de test local)';
    }

    // Orphée n'a qu'un propriétaire (ADR-041) : les règles Firestore refusent
    // tout autre compte. Ici on le dit clairement, puis on déconnecte.
    // L'interface ne protège rien : c'est un message, pas un verrou.
    auth.onAuthStateChanged(async (user) => {
      if (!user) { render(null); return; }
      // Invité (PM-28) : seulement avec un accès valide pour cet onglet ;
      // pendant l'échange du jeton, session.js garde la main.
      const S = window.OrpheeSession;
      if (user.isAnonymous) {
        if (S && S.joining()) return;
        if (!S || !S.guest()) {
          render(null);
          if (S) await S.end();
          return;
        }
      }
      try {
        await firebase.firestore().doc('cache/agg_global').get();
      } catch (err) {
        if (err && err.code === 'permission-denied') {
          render(null);
          if (user.isAnonymous && S) { await S.end(); return; }
          await auth.signOut().catch(() => {});
          showError('Cet espace est privé : ce compte n\'y a pas accès.');
          return;
        }
        // Hors ligne ou autre : on laisse entrer, les écrans gèrent l'erreur.
      }
      clearError();
      document.documentElement.classList.toggle('is-guest', user.isAnonymous);
      render(user);
      if (user.isAnonymous && S) S.startVisit();
    });

    loginBtn.addEventListener('click', async () => {
      clearError();
      try {
        if (window.ORPHEE_EMULATORS) {
          await auth.signInWithEmailAndPassword(DEV_ACCOUNT.email, DEV_ACCOUNT.password);
        } else {
          await auth.signInWithPopup(provider);
        }
      } catch (err) {
        if (err && err.code === 'auth/popup-closed-by-user') {
          return;
        }
        if (err && err.code === 'auth/cancelled-popup-request') {
          return;
        }
        console.error('Login failed:', err);
        showError('Connexion impossible. Réessaie.');
      }
    });

    logoutBtn.addEventListener('click', async () => {
      try {
        await auth.signOut();
      } catch (err) {
        console.error('Logout failed:', err);
      }
    });
  }

  init();
})();
