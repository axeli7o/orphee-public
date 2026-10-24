"use strict";

const {onRequest} = require("firebase-functions/v2/https");

// Native YouTube Music package on Android.
const PKG = "com.google.android.apps.youtube.music";
const MAX_Q = 200;

/**
 * Strip control chars (incl. CR/LF) and cap length so the query can't break
 * the redirect header or the intent string.
 * @param {string} raw incoming query
 * @return {string} sanitized query
 */
function sanitize(raw) {
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    out += (code > 31 && code !== 127) ? ch : " ";
  }
  return out.trim().slice(0, MAX_Q);
}

/**
 * Build the intent:// URL that hands an https App Link off to Android.
 * The host, scheme and package are fixed; only the (sanitized, percent-
 * encoded) search query is interpolated — so this can never be coerced into
 * redirecting elsewhere.
 * @param {string} q sanitized search query
 * @return {string} the intent:// URL
 */
function buildIntent(q) {
  const enc = encodeURIComponent(q);
  const https = "https://music.youtube.com/search?q=" + enc;
  return "intent://music.youtube.com/search?q=" + enc +
    "#Intent;scheme=https;package=" + PKG +
    ";S.browser_fallback_url=" + encodeURIComponent(https) + ";end";
}

// Public redirect helper. A client-side intent:// navigation is blocked inside
// a standalone PWA/WebAPK (ERR_UNKNOWN_URL_SCHEME) and a plain https link only
// loads the web page in-app; a *server* 302 to intent:// is the one route
// Chrome dispatches to the native app. No auth: this endpoint reads and writes
// nothing — it only emits a deterministic redirect to a hardcoded destination
// from a sanitized query string, so there is no asset to protect and no open
// redirect surface.
exports.ytmusicLink = onRequest(
    {region: "europe-west1", cors: false},
    (req, res) => {
      if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
      }
      const raw = typeof req.query.q === "string" ? req.query.q : "";
      res.set("Cache-Control", "no-store");
      res.redirect(302, buildIntent(sanitize(raw)));
    },
);
