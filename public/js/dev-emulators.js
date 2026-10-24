/* Orphée — mode local (émulateurs Firebase).
   Actif UNIQUEMENT quand l'app est servie depuis localhost / 127.0.0.1 sur
   un projet fictif demo-* (`npm run dev` dans tools/dev) : branche Auth, Firestore et Functions sur
   les émulateurs du projet fictif demo-orphee. En production (orphee-e7377
   .web.app) ce fichier ne fait rien — aucune donnée réelle n'est jamais
   touchée en local. Doit être chargé juste après /__/firebase/init.js, avant
   tout usage de firebase.auth()/firestore()/functions(). */
(function () {
  "use strict";

  // Double condition : servi en local ET projet fictif « demo-* » (config
  // injectée par l'émulateur Hosting). `firebase serve` sur le vrai projet
  // reste ainsi branché sur la prod, comme avant.
  const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
  const projectId = typeof firebase !== "undefined" && firebase.apps.length ?
    firebase.app().options.projectId || "" : "";
  window.ORPHEE_EMULATORS = LOCAL_HOSTS.includes(location.hostname) &&
    projectId.startsWith("demo-");
  if (!window.ORPHEE_EMULATORS) return;

  // Ports = bloc "emulators" de firebase.json.
  const HOST = "127.0.0.1";
  // Sans le bandeau de l'émulateur : il recouvre la barre d'onglets.
  firebase.auth().useEmulator(`http://${HOST}:9099`, {disableWarnings: true});
  firebase.firestore().useEmulator(HOST, 8080);
  firebase.app().functions("europe-west1").useEmulator(HOST, 5001);
})();
