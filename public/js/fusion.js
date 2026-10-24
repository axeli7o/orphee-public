/* Orphée — Migration « coups de cœur → Adoré » (v3, PM-08 retiré).
   Le coup de cœur est fusionné dans la note 5. Cette carte de Réglages montre
   à Axel la LISTE EXACTE de ses coups de cœur, puis, sur sa confirmation
   seulement, les passe à 5 et efface le drapeau. Axel décide (IM-7) : rien
   n'est migré automatiquement. Écriture via le builder partagé (ADR-027 ;
   genre / sous-genre préservés par le merge, description réécrite telle
   quelle). La carte disparaît quand il ne reste rien à migrer. */
(function () {
  "use strict";

  const card = document.getElementById("set-fusion");
  if (!card) return;
  const GRADES = window.ORPHEE_GRADES || {};
  const BATCH = 400; // < 500 opérations par batch Firestore
  let busy = false;
  let doneCount = 0;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function favs() {
    const items = window.OrpheeLibrary ? window.OrpheeLibrary.items() : [];
    return items.filter((a) => a.personal_fav)
        .sort((x, y) => (y.listen_count || 0) - (x.listen_count || 0));
  }

  async function migrate(list) {
    const user = firebase.auth().currentUser;
    if (!user || !window.OrpheeCuration) return;
    busy = true;
    render();
    const db = firebase.firestore();
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = db.batch();
        for (const a of list.slice(i, i + BATCH)) {
          const m = window.OrpheeCuration.buildCurationMutation({
            type: "grade", album_sur: a.album_sur, grade: 5,
            personal_fav: false, commentaire: a.commentaire || "",
          });
          if (!m.valid) continue;
          const data = Object.assign({}, m.fields);
          for (const f of m.timestamps) data[f] = ts;
          batch.set(db.doc(`users/${user.uid}/grades/${a.album_sur}`), data, { merge: true });
        }
        await batch.commit();
      }
      const label = window.OrpheeCuration.gradeLabel(5, GRADES);
      for (const a of list) {
        document.dispatchEvent(new CustomEvent("orphee:album-graded", {
          detail: { album_sur: a.album_sur,
            curation: { grade: 5, grade_label: label, personal_fav: false } },
        }));
      }
      doneCount = list.length;
    } catch (err) {
      console.error("[fusion] migration interrompue :", err.message);
      card.dataset.error = "La migration a échoué. Rien n’est perdu : réessaie.";
    }
    busy = false;
    render();
  }

  function render() {
    const list = favs();
    card.innerHTML = "";
    if (!list.length && !doneCount) { card.hidden = true; return; }
    card.hidden = false;
    card.appendChild(el("h3", "stat-title", "Coups de cœur → Adoré"));

    if (!list.length) {
      card.appendChild(el("p", "settings-help",
          `C’est fait : ${doneCount} album${doneCount > 1 ? "s" : ""} désormais Adoré${doneCount > 1 ? "s" : ""}.`));
      return;
    }
    const toFive = list.filter((a) => a.grade !== 5);
    card.appendChild(el("p", "settings-help",
        "Le coup de cœur est désormais fusionné dans la note 5 (Adoré). " +
        `Tu as ${list.length} coup${list.length > 1 ? "s" : ""} de cœur : ` +
        (toFive.length ?
          `${toFive.length} passeront à Adoré, les autres le sont déjà.` :
          "tous sont déjà Adoré, seul le drapeau sera retiré.")));

    const ul = el("ul", "fusion-list");
    for (const a of list) {
      const li = el("li", "fusion-item");
      li.appendChild(el("span", "fusion-name", `${a.album} · ${a.artist}`));
      const from = a.grade == null ? "non noté" : (GRADES[a.grade] || a.grade);
      li.appendChild(el("span", "fusion-grade", a.grade === 5 ? "déjà Adoré" : `${from} → Adoré`));
      ul.appendChild(li);
    }
    card.appendChild(ul);

    if (card.dataset.error) {
      card.appendChild(el("p", "settings-help fusion-error", card.dataset.error));
    }
    const btn = el("button", "btn-primary fusion-go o-btn soft block",
        busy ? "Migration…" : `Tout passer à Adoré (${list.length})`);
    btn.type = "button";
    btn.disabled = busy;
    btn.addEventListener("click", () => {
      if (window.confirm(`Passer ces ${list.length} albums à Adoré (5) ?`)) {
        delete card.dataset.error;
        migrate(list);
      }
    });
    card.appendChild(btn);
  }

  async function refresh() {
    if (!firebase.auth().currentUser || !window.OrpheeLibrary) return;
    await window.OrpheeLibrary.ensure();
    if (!busy) render();
  }

  document.addEventListener("orphee:tab", (e) => {
    if (e.detail.tab === "settings") refresh();
  });
  firebase.auth().onAuthStateChanged((user) => {
    doneCount = 0;
    if (!user) { card.hidden = true; card.innerHTML = ""; }
  });
})();
