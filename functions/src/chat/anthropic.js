"use strict";

// Client Anthropic partagé par les Functions d'Orphée (chat, récits) :
// une seule clé, un seul modèle — la voix d'Orphée reste la même partout.
const {defineSecret} = require("firebase-functions/params");

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const MODEL = "claude-sonnet-4-6";

let client = null;

/**
 * Initialise le client au premier appel (le secret n'est disponible qu'à
 * l'intérieur d'une invocation, pas au chargement du module).
 * @return {Object} client Anthropic
 */
function getAnthropicClient() {
  if (!client) {
    const {default: Anthropic} = require("@anthropic-ai/sdk");
    client = new Anthropic({apiKey: anthropicKey.value()});
  }
  return client;
}

exports.anthropicKey = anthropicKey;
exports.MODEL = MODEL;
exports.getAnthropicClient = getAnthropicClient;
