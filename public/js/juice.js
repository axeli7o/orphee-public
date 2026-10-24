/* Orphée · Effets « délice » (v2.24.0) — partagés par Qualité et la fiche
   album (maquette validée par Axel le 2026-10-11). Rien d'indispensable :
   tout est décoratif, coupé si le téléphone demande moins d'animations.
   - buzz() : vibration courte (Android ; iPhone ne l'autorise pas) ;
   - countTo() : un nombre qui défile ;
   - burst() : gerbe de confettis ;
   - gradeParty() : confettis selon la note posée, gradués jusqu'à la pluie
     d'or d'« Adoré » (la plus rare). */
(function () {
  "use strict";

  const reduce = () => window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function buzz(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 10);
    } catch (e) { /* pas de vibration : tant pis */ }
  }

  function countTo(el, from, to, ms, format) {
    const f = format || ((v) => String(Math.round(v)));
    if (!el) return;
    if (reduce() || from === to) { el.textContent = f(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = f(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function piece(color, w, h) {
    const p = document.createElement("div");
    p.className = "jc-piece";
    p.style.background = color;
    p.style.width = w + "px";
    p.style.height = h + "px";
    document.body.appendChild(p);
    return p;
  }

  function burst(x, y, n, colors) {
    if (reduce()) return;
    for (let i = 0; i < n; i++) {
      const p = piece(colors[i % colors.length], 8, 8);
      p.style.left = x + "px";
      p.style.top = y + "px";
      const a = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 120;
      p.animate([
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 80}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.2,.8,.2,1)" })
          .onfinish = () => p.remove();
    }
  }

  const GOLD = ["#e0a23f", "#f5c840", "#ffe08a", "#fff3c4"];

  // Adoré : éclair doré, trois salves, pluie d'or qui entre par le haut de
  // l'écran, scintillements, vibrations.
  function adore(r) {
    [[0.2, -60, 160], [0.8, -90, 300], [0.5, -140, 460]].forEach(([x, dy, t]) =>
      setTimeout(() => { burst(innerWidth * x, r.top + dy, 44, GOLD); buzz(); }, t));
    if (reduce()) return;
    const fl = document.createElement("div");
    fl.className = "jc-flash";
    document.body.appendChild(fl);
    fl.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 900 })
        .onfinish = () => fl.remove();
    for (let i = 0; i < 110; i++) {
      const w = 5 + Math.random() * 6;
      const p = piece(GOLD[i % GOLD.length], w, w * (Math.random() < 0.5 ? 1 : 2.2));
      p.style.left = (Math.random() * innerWidth) + "px";
      p.style.top = "0px";
      const drift = (Math.random() - 0.5) * 120;
      p.animate([
        { transform: "translate(0,-60px) rotate(0)", opacity: 1 },
        { transform: `translate(${drift}px,${innerHeight + 40}px) rotate(${(Math.random() - 0.5) * 900}deg)`, opacity: 0.9 },
      ], { duration: 1600 + Math.random() * 1400, delay: 200 + Math.random() * 700,
        easing: "cubic-bezier(.3,.1,.6,1)", fill: "backwards" }).onfinish = () => p.remove();
    }
    for (let i = 0; i < 14; i++) {
      const sp = document.createElement("div");
      sp.className = "jc-star";
      sp.textContent = "✦";
      sp.style.fontSize = (10 + Math.random() * 14) + "px";
      sp.style.left = (Math.random() * innerWidth) + "px";
      sp.style.top = (r.top - 120 + Math.random() * 260) + "px";
      document.body.appendChild(sp);
      sp.animate([
        { opacity: 0, transform: "scale(.2)" },
        { opacity: 1, transform: "scale(1.2)", offset: 0.4 },
        { opacity: 0, transform: "scale(.4)" },
      ], { duration: 900, delay: Math.random() * 900, fill: "backwards" }).onfinish = () => sp.remove();
    }
  }

  // Confettis à la couleur de la note, de plus en plus généreux.
  function gradeParty(grade, rect, color) {
    if (!grade) return;
    const r = rect;
    const c = [color, "#e8eae9"];
    const n = { 1: 4, 2: 8, 3: 14, 4: 52, 5: 80 }[grade] || 8;
    burst(r.left + r.width / 2, r.top + r.height / 2, n, grade === 5 ? GOLD.concat("#3fc58e") : c);
    if (grade === 4) {
      setTimeout(() => { burst(innerWidth * 0.25, r.top - 40, 28, c); buzz(); }, 160);
      setTimeout(() => { burst(innerWidth * 0.75, r.top - 70, 28, c); buzz(); }, 330);
      setTimeout(() => burst(innerWidth * 0.5, r.top - 120, 34, c.concat("#ff9cc6")), 500);
    }
    if (grade === 5) adore(r);
  }

  window.OrpheeJuice = { buzz, countTo, burst, gradeParty, reduce, GOLD };
})();
