(function () {
  "use strict";

  const REGION = "europe-west1";

  let uid = null;
  let db = null;
  let chatFn = null;
  let sending = false;

  const msgList = document.getElementById("chat-messages");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");

  // ===== Actions Firestore (tags machine-readable) =====

  async function executeActions(actions) {
    if (!actions || !actions.length || !uid || !db) return;
    const GRADES = window.ORPHEE_GRADES || {};
    const sts = () => firebase.firestore.FieldValue.serverTimestamp();

    for (const action of actions) {
      const albumSur = action.album_sur;
      // Sécurité : album_sur vide ou contenant "/" (traversal) → on saute, avant
      // toute construction de ref / lecture (SPEC §7.3 ; db.doc throw sinon).
      if (!albumSur || albumSur.includes("/")) continue;
      const ref = db.doc("users/" + uid + "/grades/" + albumSur);

      try {
        // graded_at au premier grade : sait-on s'il existe déjà une curation ?
        let isFirst = false;
        if (action.type === "grade") {
          const before = await ref.get();
          isFirst = !before.exists;
        }

        // Payload via le builder partagé (ADR-027) : valide + sans grade_label.
        const m = window.OrpheeCuration.buildCurationMutation(
            Object.assign({}, action, {isFirst}));
        if (!m.valid) {
          console.warn("Chat: action invalide", m.reason, albumSur);
          continue;
        }

        if (m.op === "delete") {
          await ref.delete();
        } else {
          const payload = Object.assign({}, m.fields);
          for (const f of m.timestamps) payload[f] = sts();
          await ref.set(payload, {merge: m.merge});
        }

        // Event pour la bibliothèque (applyCuration re-dérive grade_label).
        let curation;
        if (m.op === "delete") {
          curation = {grade: null, grade_label: null, personal_fav: false,
            commentaire: "", genre: "", sousgenre: ""};
        } else if (action.type === "grade") {
          curation = {grade: m.fields.grade,
            grade_label: window.OrpheeCuration.gradeLabel(m.fields.grade, GRADES),
            personal_fav: m.fields.personal_fav,
            commentaire: m.fields.commentaire};
        } else {
          // flag / comment : snapshot complet pour ne pas réinit note/genre.
          const snap = await ref.get();
          curation = snap.exists ? snap.data() : {};
        }
        document.dispatchEvent(new CustomEvent("orphee:album-graded", {
          detail: {album_sur: albumSur, curation,
            gradeSet: action.type === "grade" && curation.grade != null},
        }));
      } catch (err) {
        console.error("Chat: action failed", action.type, albumSur, err);
      }
    }
  }

  // ===== Bulles d'erreur de curation (dismissibles) =====
  // Une action de curation rejetée par le serveur n'écrit rien : on la montre
  // en bulle temporaire que l'utilisateur ferme une fois comprise (ADR-027).
  const REJECT_LABEL = {
    grade: "Note non appliquée",
    flag: "Coup de cœur non appliqué",
    comment: "Commentaire non appliqué",
    ungrade: "Retrait de note non appliqué",
  };

  function curationErrorStack() {
    let stack = document.getElementById("curation-errors");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "curation-errors";
      stack.className = "cbubble-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  function showCurationError(rej) {
    if (!rej) return;
    const bubble = document.createElement("div");
    bubble.className = "cbubble";
    bubble.setAttribute("role", "alert");

    const what = REJECT_LABEL[rej.type] || "Action non appliquée";
    const where = rej.album_sur ? ` : « ${rej.album_sur} »` : "";
    const msg = document.createElement("span");
    msg.className = "cbubble-msg";
    msg.textContent = `${what} — ${rej.reason || "rejetée"}${where}`;

    const close = document.createElement("button");
    close.className = "cbubble-close";
    close.type = "button";
    close.setAttribute("aria-label", "Fermer");
    close.textContent = "✕";
    const dismiss = () => { if (bubble.parentNode) bubble.remove(); };
    close.addEventListener("click", dismiss);

    bubble.appendChild(msg);
    bubble.appendChild(close);
    curationErrorStack().appendChild(bubble);
    setTimeout(dismiss, 12000); // garde-fou ; l'utilisateur peut fermer avant
  }

  // ===== Rendu des messages =====

  function renderMessage(role, content) {
    const div = document.createElement("div");
    div.className = "chat-msg chat-msg--" + role;
    // Orphée écrit les titres en *italique* : rendu sûr (text.js) ; le texte
    // d'Axel reste du texte brut.
    if (role === "assistant" && window.OrpheeText) div.innerHTML = window.OrpheeText.rich(content);
    else div.textContent = content;
    msgList.appendChild(div);
    return div;
  }

  /**
   * Rend les chips [SUGGEST] après le dernier message assistant.
   * Remplace les chips précédentes si elles existent.
   * @param {string[]} suggestions
   */
  function renderSuggestions(suggestions) {
    const existing = msgList.querySelector(".suggest-row");
    if (existing) existing.remove();
    if (!suggestions || suggestions.length === 0) return;

    const row = document.createElement("div");
    row.className = "suggest-row";
    for (const s of suggestions) {
      const btn = document.createElement("button");
      btn.className = "suggest-chip";
      btn.type = "button";
      btn.textContent = s;
      btn.dataset.suggest = s;
      row.appendChild(btn);
    }
    msgList.appendChild(row);
  }

  function renderEmpty() {
    const p = document.createElement("p");
    p.className = "chat-empty";
    p.textContent = "Orphée t'écoute.";
    msgList.appendChild(p);
  }

  function scrollToBottom() {
    msgList.scrollTop = msgList.scrollHeight;
  }

  // ===== Invité (PM-28) : le Salon est fermé =====
  // Un exemple écrit à la main, sans aucune donnée d'Axel : l'invité voit à
  // quoi sert Orphée, jamais la vraie conversation (que les règles lui
  // refusent de toute façon).
  const DEMO = [
    ["user", "Qu'est-ce que j'écoute le plus le matin ?"],
    ["assistant", "Le matin, tu reviens souvent aux mêmes albums : des disques " +
      "calmes pour le trajet, puis plus d'énergie en arrivant. Tu veux que je " +
      "te sorte les trois plus fidèles ?"],
    ["user", "Note le dernier album que j'ai découvert : Génial."],
    ["assistant", "C'est noté : *Génial*. Il rejoint tes découvertes du trimestre."],
  ];

  function renderGuest() {
    msgList.innerHTML = "";
    const lock = document.createElement("div");
    lock.className = "chat-guest";
    const h = document.createElement("p");
    h.className = "chat-guest-title";
    h.textContent = "Orphée ne parle qu’à Axel";
    const p = document.createElement("p");
    p.className = "chat-guest-text";
    p.textContent = "Pendant la visite, le Salon est fermé. Voici à quoi ressemble une conversation (exemple, sans ses données) :";
    lock.appendChild(h);
    lock.appendChild(p);
    msgList.appendChild(lock);
    for (const [role, content] of DEMO) renderMessage(role, content).classList.add("chat-msg--demo");
    input.value = "";
    input.disabled = true;
    input.placeholder = "Orphée ne parle qu’à Axel";
    sendBtn.disabled = true;
  }

  // ===== Chargement de l'historique =====

  async function loadHistory() {
    if (!uid || !db) return;
    try {
      const snap = await db
          .collection("users/" + uid + "/chats/main/messages")
          .orderBy("timestamp", "asc")
          .limitToLast(20)
          .get();

      msgList.innerHTML = "";
      if (snap.empty) {
        renderEmpty();
        return;
      }
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data.role === "user" || data.role === "assistant") {
          renderMessage(data.role, data.content || "");
        }
      }
      scrollToBottom();
    } catch (err) {
      console.error("Chat: erreur chargement historique", err);
    }
  }

  // ===== Envoi =====

  async function sendText(text) {
    if (!text || sending || !chatFn || !db || !uid) return;

    sending = true;
    sendBtn.disabled = true;

    // Effacer les chips précédentes et le message vide
    renderSuggestions([]);
    const emptyMsg = msgList.querySelector(".chat-empty");
    if (emptyMsg) emptyMsg.remove();

    renderMessage("user", text);
    scrollToBottom();

    // Écrire le message utilisateur en Firestore
    await db.collection("users/" + uid + "/chats/main/messages").add({
      role: "user",
      content: text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // Indicateur de saisie
    const typingEl = renderMessage("assistant", "…");
    typingEl.classList.add("chat-msg--typing");
    scrollToBottom();

    try {
      const result = await chatFn({message: text});
      typingEl.remove();

      const responseText = result.data.response;
      const suggestions = result.data.suggestions || [];
      const actions = result.data.actions || [];
      const rejections = result.data.rejections || [];

      renderMessage("assistant", responseText);
      renderSuggestions(suggestions);
      scrollToBottom();

      // Exécuter les actions side-effect (grade, flag…) sans bloquer l'affichage
      executeActions(actions).catch((err) =>
        console.error("Chat: executeActions failed", err),
      );

      // Actions rejetées par le serveur : une erreur reste une erreur — rien
      // n'est écrit, on l'affiche en bulle dismissible (ADR-027 révisé).
      rejections.forEach(showCurationError);

      // Écrire la réponse en Firestore (texte nettoyé, sans tags)
      await db.collection("users/" + uid + "/chats/main/messages").add({
        role: "assistant",
        content: responseText,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      typingEl.remove();
      console.error("Chat: erreur appel Function", err);
      const errEl = document.createElement("div");
      errEl.className = "chat-msg chat-msg--error";
      errEl.textContent = "Une erreur est survenue. Réessaie.";
      msgList.appendChild(errEl);
      scrollToBottom();
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function handleSend() {
    if (window.OrpheeSession && window.OrpheeSession.isGuest()) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "";
    sendText(text);
  }

  // ===== Auto-resize du textarea =====

  function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  // ===== Init =====

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth ||
        !firebase.firestore || !firebase.functions) return;

    const fns = firebase.app().functions(REGION);
    chatFn = fns.httpsCallable("chatOrphee");

    sendBtn.addEventListener("click", handleSend);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    input.addEventListener("input", autoResize);

    // Clic sur une chip → envoi du texte de la chip
    msgList.addEventListener("click", (e) => {
      const chip = e.target.closest(".suggest-chip");
      if (chip && chip.dataset.suggest) {
        sendText(chip.dataset.suggest);
      }
    });

    firebase.auth().onAuthStateChanged((user) => {
      if (user && user.isAnonymous) {
        uid = null;
        db = null;
        renderGuest();
        return;
      }
      input.disabled = false;
      sendBtn.disabled = false;
      input.placeholder = "Écris à Orphée…";
      if (user) {
        db = firebase.firestore();
        uid = user.uid;
        if (document.getElementById("view-chat").classList.contains("is-active")) {
          loadHistory().then(() => input.focus());
        }
      } else {
        uid = null;
        db = null;
        msgList.innerHTML = "";
      }
    });

    // Charger l'historique quand on bascule sur l'onglet chat
    document.addEventListener("orphee:tab", (e) => {
      if (e.detail.tab === "chat" && uid && db) {
        loadHistory().then(() => input.focus());
      }
    });
  }

  init();
})();
