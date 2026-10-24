"use strict";

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {requireOwner} = require("../lib/owner");
const logger = require("firebase-functions/logger");
const {initializeApp, getApps} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

const {SYSTEM_BLOCKS} = require("./system-prompt");
const {buildContext} = require("./prompt-builder");
const {parseTags} = require("./tags-parser");
const {validateActions} = require("./curation-validation");
const {TOOL_DEFINITIONS, executeTool} = require("./tools");
const {anthropicKey, MODEL, getAnthropicClient} = require("./anthropic");

if (getApps().length === 0) initializeApp();

const SERVICE_ACCOUNT = "orphee-e7377@appspot.gserviceaccount.com";
const MAX_HISTORY = 20;
const MAX_TOKENS = 2048;
// Garde-fou : nombre maximal d'appels de tools par message (ADR-009).
const MAX_TOOL_CALLS = 5;

exports.chatOrphee = onCall(
    {
      region: "europe-west1",
      serviceAccount: SERVICE_ACCOUNT,
      secrets: [anthropicKey],
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async (request) => {
      // Réservé au propriétaire (ADR-041).
      await requireOwner(request, getFirestore());

      const uid = request.auth.uid;
      const {message} = request.data || {};

      if (!message || typeof message !== "string" || !message.trim()) {
        throw new HttpsError("invalid-argument", "Message requis.");
      }

      const db = getFirestore();

      // Lire contexte + historique en parallèle
      const [context, historySnap] = await Promise.all([
        buildContext(db, uid),
        db.collection(`users/${uid}/chats/main/messages`)
            .orderBy("timestamp", "asc")
            .limitToLast(MAX_HISTORY)
            .get(),
      ]);

      // Construire les messages Anthropic depuis l'historique Firestore
      // On exclut les erreurs éventuelles stockées côté client
      const history = historySnap.docs
          .map((d) => d.data())
          .filter((d) => d.role === "user" || d.role === "assistant")
          .map((d) => ({role: d.role, content: d.content || ""}));

      // Injecter le contexte dans le message courant (pas dans le system,
      // pour préserver le prompt caching sur le system prompt invariant)
      const messageWithContext = message.trim() + "\n\n" + context;

      const client = getAnthropicClient();
      const messages = [
        ...history,
        {role: "user", content: messageWithContext},
      ];

      /**
       * Un tour d'appel Anthropic. allowTools=false force une réponse finale.
       * @param {boolean} allowTools
       * @return {Promise<Object>}
       */
      function callModel(allowTools) {
        const params = {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // Bloc system avec point de cache (cache_control ephemeral) : le
          // prompt stable (+ tools) est servi depuis le cache d'un message et
          // d'un tour à l'autre, au lieu d'être refacturé en entier.
          system: SYSTEM_BLOCKS,
          messages,
        };
        if (allowTools) params.tools = TOOL_DEFINITIONS;
        return client.messages.create(params);
      }

      // Boucle multi-turn : tant qu'Orphée demande un tool, on l'exécute sur
      // le cache Firestore et on lui renvoie le résultat (garde-fou ADR-009).
      let response = await callModel(true);
      let toolCalls = 0;

      while (response.stop_reason === "tool_use") {
        const toolUses = response.content.filter((b) => b.type === "tool_use");
        messages.push({role: "assistant", content: response.content});

        if (toolCalls >= MAX_TOOL_CALLS) {
          // Garde-fou atteint : on répond à chaque tool_use puis on force
          // une réponse finale sans tools.
          messages.push({
            role: "user",
            content: toolUses.map((tu) => ({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "Limite de recherches atteinte. " +
                "Réponds à Axel avec ce que tu as déjà.",
            })),
          });
          response = await callModel(false);
          break;
        }

        const results = [];
        for (const tu of toolUses) {
          toolCalls += 1;
          let result;
          try {
            result = await executeTool(db, uid, tu.name, tu.input || {});
          } catch (e) {
            result = {error: e.message};
          }
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          });
        }
        messages.push({role: "user", content: results});
        response = await callModel(true);
      }

      const rawText = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      const parsed = parseTags(rawText);

      // Validation des actions de curation (ADR-027, révisé). Principe : une
      // erreur reste une erreur. Une action invalide n'est JAMAIS appliquée ni
      // « auto-corrigée » par le modèle (pas de tour de correction, pas
      // d'interprétation qui écrirait dans la donnée) ; elle est renvoyée au
      // client comme rejet, affiché en bulle dismissible. La réponse d'Orphée
      // n'est pas altérée. Existence album via un get album_stats/{id}.
      const albumExists = (id) =>
        db.collection("album_stats").doc(id).get().then((s) => s.exists);
      const {valid, invalid} =
        await validateActions(parsed.actions, albumExists);
      const rejections = invalid.map(({action, reason}) => ({
        type: action.type,
        album_sur: action.album_sur || null,
        reason,
      }));

      // Log usage sans données sensibles
      logger.info("chatOrphee", {
        uid,
        tool_calls: toolCalls,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        // Observabilité du prompt caching : read>0 = cache touché ;
        // creation>0 = cache (ré)écrit (premier appel ou après expiration TTL).
        cache_read_input_tokens: response.usage.cache_read_input_tokens,
        cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
        actions: valid.length,
        rejections: rejections.length,
      });

      return {
        response: parsed.cleanText,
        suggestions: parsed.suggestions,
        actions: valid,
        rejections,
      };
    },
);
