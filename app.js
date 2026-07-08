"use strict";

/* ============================================================
   Données de référence
   ============================================================ */

// Couleurs : R=rouge, G=vert, B=bleu, Y=jaune (joker)
const ID_TO_COLOR = { 1: "R", 2: "G", 3: "B" };
const COLOR_LABEL = { R: "rouge", G: "vert", B: "bleu", Y: "jaune", ANY: "libre" };

// Couleur opti par objet et par rôle (d'après le tableau de référence).
// dos / sansCrit / soins : surcharges quand l'option correspondante est cochée.
// any:true = anneaux : la couleur des châsses n'a pas d'importance.
const ITEMS = [
  { id: "chapeau",    label: "Chapeau",       icon: "🎩", opti: { melee: "R", distance: "R", support: "B" } },
  { id: "cape",       label: "Cape",          icon: "🧣", opti: { melee: "R", distance: "B", support: "B" } },
  { id: "bottes",     label: "Bottes",        icon: "🥾", opti: { melee: "R", distance: "R", support: "R" }, dos: "G" },
  { id: "epaulettes", label: "Épaulettes",    icon: "🎽", opti: { melee: "G", distance: "G", support: "B" }, sansCrit: "R", soins: "B" },
  { id: "ceinture",   label: "Ceinture",      icon: "🥋", opti: { melee: "R", distance: "R", support: "G" }, dos: "G" },
  { id: "cac",        label: "Corps à corps", icon: "⚔️", opti: { melee: "G", distance: "R", support: "B" } },
  { id: "plastron",   label: "Plastron",      icon: "🛡️", opti: { melee: "B", distance: "B", support: "Y" } },
  { id: "amulette",   label: "Amulette",      icon: "📿", opti: { melee: "R", distance: "R", support: "B" }, soins: "B" },
  { id: "anneau1",    label: "Anneau 1",      icon: "💍", any: true },
  { id: "anneau2",    label: "Anneau 2",      icon: "💍", any: true },
];

const MAX_SUBLIS = 10;

/* ============================================================
   État
   ============================================================ */

const state = {
  role: "melee",
  crit: true,
  dos: false,
  soins: false,
  // Support : plastron en châsses libres (résistances doublées quelle que soit la
  // couleur) au lieu du full jaune qui laisse le choix des éléments de résistance.
  plastronLibre: false,
  // Objet en cours d'enchantement (mode enchantement), ou null
  enchanting: null,
  // [{name, qty}]
  chosen: [],
  // itemId -> { override: 'R'|'G'|'B'|'Y'|null, slots: [4 x ('R'|'G'|'B'|'Y'|null)] }
  items: {},
};
for (const it of ITEMS) state.items[it.id] = { override: null, slots: [null, null, null, null], done: false, extraColors: [] };

const SUBLI_BY_NAME = new Map(SUBLIMATIONS.map(s => [s.name, s]));

function normalize(str) {
  return str.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase();
}


/* ============================================================
   Cœur du calcul
   ============================================================ */

// Couleur opti effective d'un objet selon rôle + options + surcharge manuelle.
// Retourne 'R'|'G'|'B'|'Y' ou null pour "peu importe" (anneaux).
function effectiveOpti(item) {
  const cfg = state.items[item.id];
  if (cfg.override) return cfg.override === "ANY" ? null : cfg.override;
  if (item.any) return null;
  if (state.soins && item.soins) return item.soins;
  if (state.dos && item.dos) return item.dos;
  if (!state.crit && item.sansCrit && state.role !== "support") return item.sansCrit;
  const base = item.opti[state.role];
  // Plastron support en châsses libres : couleur indifférente, comme un anneau
  if (base === "Y" && state.plastronLibre) return null;
  return base;
}

// Meilleur placement d'une subli (ou null) sur un objet.
// Retourne { cost, reused, tolerated, layout: [{color, isNew, inWin, isTolerated}], offset }
//  - cost      : nb de châsses jaunes à obtenir
//  - reused    : nb de jaunes déjà en place et réutilisées
//  - tolerated : nb de châsses posées dans une couleur tolérée (non opti mais acceptée)
// Objet « fait » : châsses figées, la subli doit rentrer telle quelle (jaune déjà
// en place = joker, emplacement vide = châsse normale à poser) → null si impossible.
function bestPlacement(opti, existing, subliColors, done, extras) {
  const acc = !done && extras && extras.length ? new Set(extras) : null;
  const offsets = subliColors ? [0, 1] : [null];
  let best = null;
  for (const off of offsets) {
    const layout = [];
    let cost = 0, reused = 0, tolerated = 0, feasible = true;
    for (let pos = 0; pos < 4; pos++) {
      const inWin = off !== null && pos >= off && pos < off + 3;
      if (done) {
        let color = existing[pos] || "ANY";
        if (inWin) {
          const need = subliColors[pos - off];
          if (existing[pos] === "Y") reused++;
          else if (!existing[pos]) color = need;
          else if (existing[pos] !== need) feasible = false;
        }
        layout.push({ color, isNew: false, inWin, isTolerated: false });
        continue;
      }
      let base, needY = false, tol = false;
      if (opti === null) {
        base = inWin ? subliColors[pos - off] : "ANY";
      } else if (inWin) {
        const need = subliColors[pos - off];
        if (need === opti) base = opti;
        else if (acc && acc.has(need)) { base = need; tol = true; }
        else { base = "Y"; needY = true; }
      } else {
        base = opti;
        if (opti === "Y") needY = true;
      }
      let color = base, isNew = false, isTolerated = false;
      if (needY) {
        color = "Y";
        if (existing[pos] === "Y") reused++;
        else { cost++; isNew = true; }
      } else if (existing[pos] === "Y") {
        color = "Y"; // un jaune déjà en place convient toujours (et évite une tolérance)
      } else if (tol) {
        isTolerated = true; tolerated++;
      }
      layout.push({ color, isNew, inWin, isTolerated });
    }
    if (!feasible) continue;
    const cand = { cost, reused, tolerated, layout, offset: off };
    const better = !best
      || cand.cost < best.cost
      || (cand.cost === best.cost && (cand.tolerated < best.tolerated
      || (cand.tolerated === best.tolerated && cand.reused > best.reused)));
    if (better) best = cand;
  }
  return best;
}

// Affectation optimale sublis -> objets (exacte, DP sur bitmask).
// sublis : liste dépliée (une entrée par exemplaire), longueur <= 10.
// Retourne { total, perItem: [{item, subli|null, placement}] }
function optimize(sublis) {
  const n = sublis.length;
  const FULL = (1 << n) - 1;

  // Coûts précalculés (null = subli impossible sur un objet « fait »)
  const noSubli = ITEMS.map(it =>
    bestPlacement(effectiveOpti(it), state.items[it.id].slots, null,
      state.items[it.id].done, state.items[it.id].extraColors));
  const withSubli = ITEMS.map(it =>
    sublis.map(s =>
      bestPlacement(effectiveOpti(it), state.items[it.id].slots, s.colors.map(c => ID_TO_COLOR[c]),
        state.items[it.id].done, state.items[it.id].extraColors)));

  // Score lexicographique : 1) minimiser les jaunes à obtenir, 2) à coût égal, minimiser
  // les châsses en couleur tolérée (perte de stats), 3) maximiser la réutilisation des
  // jaunes déjà en place (les sublis exigeantes vont sur les objets riches en jaunes).
  // tolerated <= 30 et reused <= 40 au total : les poids 10000/100/1 ne se chevauchent pas.
  const score = p => p.cost * 10000 + p.tolerated * 100 - p.reused;

  const memo = new Map();
  // Meilleur score pour placer les sublis restantes (mask = déjà placées) sur les objets i..fin
  function go(i, mask) {
    if (i === ITEMS.length) return mask === FULL ? { score: 0 } : null;
    const key = i * (FULL + 1) + mask;
    if (memo.has(key)) return memo.get(key);

    let best = null;
    // Option : pas de subli sur cet objet
    const rest = go(i + 1, mask);
    if (rest !== null) best = { score: score(noSubli[i]) + rest.score, pick: -1 };
    // Option : une des sublis restantes
    for (let s = 0; s < n; s++) {
      if (mask & (1 << s)) continue;
      if (withSubli[i][s] === null) continue;
      const r = go(i + 1, mask | (1 << s));
      if (r === null) continue;
      const sc = score(withSubli[i][s]) + r.score;
      if (best === null || sc < best.score) best = { score: sc, pick: s };
    }
    memo.set(key, best);
    return best;
  }

  const root = go(0, 0);
  if (root === null) return null; // plus de sublis que d'objets

  // Reconstruction
  const perItem = [];
  let mask = 0, total = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    const step = memo.get(i * (FULL + 1) + mask);
    if (step.pick === -1) {
      perItem.push({ item: ITEMS[i], subli: null, placement: noSubli[i] });
      total += noSubli[i].cost;
    } else {
      perItem.push({ item: ITEMS[i], subli: sublis[step.pick], placement: withSubli[i][step.pick] });
      total += withSubli[i][step.pick].cost;
      mask |= (1 << step.pick);
    }
  }
  return { total, perItem };
}

// Ordre d'enchantement conseillé : pour chaque objet restant, « levier de chance » =
// économie de jaunes si l'objet sortait full jaune (les objets où la chance rapporte
// le plus sont à enchanter en premier).
function computeOrdre(sublis) {
  const base = optimize(sublis);
  if (!base) return null;
  const rows = [];
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const cfg = state.items[it.id];
    if (cfg.done) continue;
    const plannedCost = base.perItem[i].placement.cost;
    const savedSlots = cfg.slots;
    cfg.slots = ["Y", "Y", "Y", "Y"];
    const lucky = optimize(sublis);
    cfg.slots = savedSlots;
    rows.push({ item: it, levier: lucky ? base.total - lucky.total : 0, plannedCost });
  }
  rows.sort((a, b) => b.levier - a.levier || b.plannedCost - a.plannedCost);
  return { base, rows };
}

/* ============================================================
   Interface
   ============================================================ */

const $ = id => document.getElementById(id);

function colorDots(colorIds, big) {
  return colorIds.map(c =>
    `<i class="dot ${big ? "big " : ""}c-${ID_TO_COLOR[c]}" title="${COLOR_LABEL[ID_TO_COLOR[c]]}"></i>`
  ).join("");
}

/* ---- Recherche ---- */

let searchActive = -1;

function renderSearch() {
  const q = normalize($("subli-search").value.trim());
  const box = $("search-results");
  if (!q) { box.classList.remove("open"); box.innerHTML = ""; searchActive = -1; return; }
  const matches = SUBLIMATIONS.filter(s => normalize(s.name).includes(q)).slice(0, 12);
  box.innerHTML = matches.map((s, i) => `
    <div class="item ${i === searchActive ? "active" : ""}" data-name="${s.name}">
      <span>${s.name}</span>
      <span class="colors">${colorDots(s.colors)}</span>
    </div>`).join("") || `<div class="item"><span class="hint">Aucun résultat</span></div>`;
  box.classList.toggle("open", matches.length > 0 || q.length > 0);
  box.querySelectorAll(".item[data-name]").forEach(el => {
    el.addEventListener("mousedown", e => { e.preventDefault(); addSubli(el.dataset.name); });
  });
}

function addSubli(name) {
  const existing = state.chosen.find(c => c.name === name);
  if (existing) existing.qty++;
  else state.chosen.push({ name, qty: 1 });
  $("subli-search").value = "";
  renderSearch();
  update();
}

/* ---- Liste des sublis choisies ---- */

function renderChosen() {
  const ul = $("subli-list");
  ul.innerHTML = "";
  let total = 0;
  const warnings = [];
  for (const c of state.chosen) {
    const s = SUBLI_BY_NAME.get(c.name);
    total += c.qty;
    if (s.max != null && c.qty > s.max) {
      warnings.push(`« ${c.name} » est limitée à ${s.max} exemplaire(s).`);
    }
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="colors">${colorDots(s.colors)}</span>
      <span class="name">${c.name}</span>
      <span class="qty">
        <button data-act="minus">−</button>
        <b>x${c.qty}</b>
        <button data-act="plus">+</button>
      </span>
      <button class="remove" title="Retirer">✕</button>`;
    li.querySelector('[data-act="minus"]').addEventListener("click", () => {
      c.qty--;
      if (c.qty <= 0) state.chosen = state.chosen.filter(x => x !== c);
      update();
    });
    li.querySelector('[data-act="plus"]').addEventListener("click", () => { c.qty++; update(); });
    li.querySelector(".remove").addEventListener("click", () => {
      state.chosen = state.chosen.filter(x => x !== c);
      update();
    });
    ul.appendChild(li);
  }
  $("subli-counter").textContent = `${total} / ${MAX_SUBLIS}`;
  if (total > MAX_SUBLIS) warnings.unshift(`Tu as ${total} sublimations : maximum ${MAX_SUBLIS} (10 objets).`);
  $("subli-warn").textContent = warnings.join(" ");
  return total;
}

/* ---- Config des objets ---- */

const COLOR_OPTIONS = [
  ["", "—"], ["R", "Rouge"], ["G", "Vert"], ["B", "Bleu"], ["Y", "Jaune"],
];

function renderItemsConfig() {
  const wrap = $("items-config-list");
  wrap.innerHTML = "";
  for (const it of ITEMS) {
    const cfg = state.items[it.id];
    const row = document.createElement("div");
    row.className = "item-cfg";

    const opti = effectiveOpti(it);
    const optiTxt = opti === null ? "libre" : COLOR_LABEL[opti];

    const overrideOpts = [["", `Auto (${optiTxt})`], ...COLOR_OPTIONS.slice(1), ["ANY", "Libre"]]
      .map(([v, l]) => `<option value="${v}" ${cfg.override === (v || null) ? "selected" : ""}>${l}</option>`).join("");

    const slotSelects = cfg.slots.map((v, i) =>
      `<select data-slot="${i}">` +
      COLOR_OPTIONS.map(([val, l]) => `<option value="${val}" ${v === (val || null) ? "selected" : ""}>${l}</option>`).join("") +
      `</select>`).join("");

    const extrasHtml = opti === null ? "" : `
      <span class="opti-label" title="Couleurs non opti mais acceptables (petite perte de stats assumée) : une exigence de la subli dans une de ces couleurs ne coûte pas de jaune">Tolère aussi :</span>
      <span class="extras">${["R", "G", "B"].filter(c => c !== opti).map(c => `
        <label class="extra-c" title="${COLOR_LABEL[c]}"><input type="checkbox" data-extra="${c}"
          ${(cfg.extraColors || []).includes(c) ? "checked" : ""}><i class="dot c-${c}"></i></label>`).join("")}
      </span>`;

    row.innerHTML = `
      <span class="item-name">${it.icon} ${it.label}</span>
      <span class="opti-label">Couleur opti :</span>
      <select data-override>${overrideOpts}</select>
      <span class="opti-label">Châsses actuelles :</span>
      <span class="slots">${slotSelects}</span>
      ${extrasHtml}
      <label class="done-label" title="Châsses figées telles que déclarées : le plan ne proposera plus de nouvelles jaunes ici, et une sublimation n'y sera placée que si les couleurs correspondent déjà">
        <input type="checkbox" data-done ${cfg.done ? "checked" : ""}> fait
      </label>`;

    row.querySelector("[data-override]").addEventListener("change", e => {
      cfg.override = e.target.value || null;
      update();
    });
    row.querySelector("[data-done]").addEventListener("change", e => {
      cfg.done = e.target.checked;
      update();
    });
    row.querySelectorAll("[data-extra]").forEach(cb => {
      cb.addEventListener("change", () => {
        cfg.extraColors = [...row.querySelectorAll("[data-extra]:checked")].map(x => x.dataset.extra);
        update();
      });
    });
    row.querySelectorAll("[data-slot]").forEach(sel => {
      sel.addEventListener("change", e => {
        cfg.slots[+e.target.dataset.slot] = e.target.value || null;
        update();
      });
    });
    wrap.appendChild(row);
  }
}

/* ---- Résultats ---- */

// Dépliage des exemplaires choisis (Carnage x2 => deux entrées)
function expandedSublis() {
  const sublis = [];
  for (const c of state.chosen) {
    const s = SUBLI_BY_NAME.get(c.name);
    for (let k = 0; k < c.qty; k++) sublis.push({ name: c.name, colors: s.colors });
  }
  return sublis;
}

function renderResults() {
  const resBox = $("results");
  const sumBox = $("summary");
  const sublis = expandedSublis();

  if (sublis.length > MAX_SUBLIS) {
    resBox.innerHTML = "";
    sumBox.innerHTML = "Trop de sublimations sélectionnées, retire l'excédent pour lancer le calcul.";
    $("total-yellow").textContent = "–";
    return;
  }

  const result = optimize(sublis);
  if (!result) {
    resBox.innerHTML = "";
    sumBox.innerHTML = "Impossible de tout placer : les objets « faits » n'acceptent une sublimation " +
      "que si leurs châsses correspondent déjà. Décoche « fait » quelque part ou retire une sublimation.";
    $("total-yellow").textContent = "–";
    return;
  }

  let totalReused = 0;
  resBox.innerHTML = "";
  for (const { item, subli, placement } of result.perItem) {
    totalReused += placement.reused;
    const done = state.items[item.id].done;
    const card = document.createElement("div");
    card.className = "result-card" + (done ? " done" : "");

    const slots = placement.layout.map((sl, i) => `
      <span class="slot">
        <span class="tag">${sl.isNew ? "à obtenir" : sl.isTolerated ? "tolérée" : ""}</span>
        <i class="dot big c-${sl.color} ${sl.isNew ? "new" : ""}${sl.isTolerated ? " tolerated" : ""}" title="${COLOR_LABEL[sl.color]}${sl.isTolerated ? " (tolérée, non opti)" : ""}"></i>
        <span class="pos">${sl.inWin ? "●" : ""}&nbsp;</span>
      </span>`).join("");

    const windowTxt = subli
      ? `Sublimation sur les châsses ${placement.offset + 1}-${placement.offset + 3} (●)`
      : "";

    card.innerHTML = `
      <div class="head">
        <span class="item-title">${item.icon} ${item.label}</span>
        <span class="cost ${placement.cost ? "" : "zero"}">${done ? "✓ fait" : placement.cost ? placement.cost + " jaune(s) à obtenir" : "aucun jaune"}</span>
      </div>
      <div class="subli-name ${subli ? "" : "none"}">${subli ? subli.name : "— aucune sublimation —"}</div>
      <div class="slots">${slots}</div>
      <div class="window">${windowTxt}${placement.reused ? ` · ${placement.reused} jaune(s) déjà en place réutilisée(s)` : ""}${placement.tolerated ? ` · ${placement.tolerated} châsse(s) en couleur tolérée` : ""}</div>`;
    resBox.appendChild(card);
  }

  $("total-yellow").textContent = result.total;
  sumBox.innerHTML = `Total : <b>${result.total}</b> châsse(s) jaune(s) à obtenir` +
    (totalReused ? ` · ${totalReused} jaune(s) déjà possédée(s) réutilisée(s)` : "") +
    ` · ${sublis.length} sublimation(s) placée(s).`;
}

/* ---- Ordre d'enchantement conseillé ---- */

function renderOrdre() {
  const box = $("ordre-list");
  const sublis = expandedSublis();
  if (sublis.length > MAX_SUBLIS) { box.innerHTML = ""; return; }
  const data = computeOrdre(sublis);
  if (!data) { box.innerHTML = ""; return; }

  box.innerHTML = "";
  for (const r of data.rows) {
    const li = document.createElement("li");
    li.className = "ordre-item" + (r.levier ? "" : " no-levier");
    li.innerHTML = `
      <span class="ordre-name">${r.item.icon} ${r.item.label}</span>
      <span class="ordre-info">prévu : ${r.plannedCost} jaune(s)</span>
      <span class="ordre-levier">${r.levier ? `si chance : jusqu'à −${r.levier} jaune(s)` : "aucun levier — à faire en dernier"}</span>`;
    box.appendChild(li);
  }
  for (const it of ITEMS) {
    if (!state.items[it.id].done) continue;
    const li = document.createElement("li");
    li.className = "ordre-item done";
    li.innerHTML = `
      <span class="ordre-name">${it.icon} ${it.label}</span>
      <span class="ordre-info">✓ fait</span><span class="ordre-levier"></span>`;
    box.appendChild(li);
  }
}

/* ---- Mode enchantement (objet en cours) ---- */

// Aperçu actif : { itemId, saved: copie de la config avant aperçu, row }
let enchPreview = null;

function dotL(c, cls = "", title = "") {
  return `<i class="dot ${cls} c-${c}" title="${title || COLOR_LABEL[c]}"></i>`;
}

function renderEnchant() {
  const sel = $("ench-select");
  const list = $("ench-list");

  const opts = ['<option value="">— choisir un objet —</option>'];
  for (const it of ITEMS) {
    if (state.items[it.id].done) continue;
    opts.push(`<option value="${it.id}" ${state.enchanting === it.id ? "selected" : ""}>${it.label}</option>`);
  }
  sel.innerHTML = opts.join("");
  sel.disabled = !!enchPreview;

  if (enchPreview) {
    const it = ITEMS.find(i => i.id === enchPreview.itemId);
    const r = enchPreview.row;
    list.innerHTML = `
      <div class="ench-banner">
        <span>Aperçu : <b>${it.icon} ${it.label}</b> marqué « fait » en</span>
        <span class="pattern">${r.cols.map(c => dotL(c)).join("")}${dotL(r.freeColor, "free-slot", "châsse restante : couleur opti")}</span>
        <span>→ total <b>${r.total}</b> jaune(s)${r.delta ? ` (−${r.delta})` : ""}</span>
        <button id="ench-keep">✓ Je garde</button>
        <button id="ench-cancel">✕ Annuler</button>
      </div>`;
    $("ench-keep").addEventListener("click", () => {
      enchPreview = null;
      state.enchanting = null;
      update();
    });
    $("ench-cancel").addEventListener("click", () => {
      state.items[enchPreview.itemId] = enchPreview.saved;
      enchPreview = null;
      update();
    });
    return;
  }

  if (state.enchanting && (!state.items[state.enchanting] || state.items[state.enchanting].done)) {
    state.enchanting = null;
  }
  if (!state.enchanting) { list.innerHTML = ""; return; }

  const it = ITEMS.find(i => i.id === state.enchanting);
  const sublis = expandedSublis();
  if (!sublis.length) {
    list.innerHTML = `<div class="ench-empty">Ajoute d'abord des sublimations (section 2).</div>`;
    return;
  }
  if (sublis.length > MAX_SUBLIS) { list.innerHTML = ""; return; }
  const base = optimize(sublis);
  if (!base) { list.innerHTML = ""; return; }

  const primary = effectiveOpti(it);
  if (primary === null) {
    list.innerHTML = `<div class="ench-empty">${it.icon} ${it.label} : châsses libres —
      n'importe quelles couleurs conviennent, pose simplement celles de la sublimation prévue (section 4).</div>`;
    return;
  }

  // Un motif par subli choisie : ses 3 couleurs + la couleur opti sur la châsse restante.
  // On simule « objet fait avec ce motif » et on garde ceux qui égalent ou battent le plan.
  const cfg = state.items[it.id];
  const savedSlots = cfg.slots, savedDone = cfg.done;
  const seen = new Set();
  const rows = [];
  for (const c of state.chosen) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    const s = SUBLI_BY_NAME.get(c.name);
    const cols = s.colors.map(x => ID_TO_COLOR[x]);
    cfg.slots = [cols[0], cols[1], cols[2], primary];
    cfg.done = true;
    const sim = optimize(sublis);
    cfg.slots = savedSlots; cfg.done = savedDone;
    if (!sim || sim.total > base.total) continue;
    rows.push({ name: c.name, cols, freeColor: primary, total: sim.total, delta: base.total - sim.total });
  }
  rows.sort((a, b) => a.total - b.total || b.delta - a.delta);

  if (!rows.length) {
    list.innerHTML = `<div class="ench-empty">Aucune combinaison sans jaune ne fait mieux que le plan
      sur cet objet — suis le plan (section 4) et déclare les jaunes bonus dans la section 3.</div>`;
    return;
  }

  list.innerHTML = `<div class="hint">Combinaisons qui valent le coup de s'arrêter sur ${it.icon}
    <b>${it.label}</b> — la subli peut aussi glisser d'un cran (châsses 2-4), et une jaune roulée
    remplace n'importe laquelle de ces couleurs :</div>` +
    rows.map((r, i) => `
      <div class="ench-row">
        <span class="pattern">${r.cols.map(c => dotL(c)).join("")}${dotL(r.freeColor, "free-slot", "châsse restante : couleur opti (" + COLOR_LABEL[r.freeColor] + ")")}</span>
        <span class="ench-name">${r.name}</span>
        <span class="ench-total ${r.delta ? "" : "equal"}">${r.delta ? `−${r.delta} jaune(s) → total ${r.total}` : `= plan actuel (${r.total} jaune(s))`}</span>
        <button data-ench="${i}">Prévisualiser</button>
      </div>`).join("");

  list.querySelectorAll("[data-ench]").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = rows[+btn.dataset.ench];
      const cur = state.items[state.enchanting];
      enchPreview = { itemId: state.enchanting, saved: JSON.parse(JSON.stringify(cur)), row: r };
      cur.slots = [r.cols[0], r.cols[1], r.cols[2], r.freeColor];
      cur.done = true;
      update();
    });
  });
}

/* ---- Persistance ---- */

function saveState() {
  localStorage.setItem("wakfu-opti", JSON.stringify({
    role: state.role, crit: state.crit, dos: state.dos, soins: state.soins,
    plastronLibre: state.plastronLibre, enchanting: state.enchanting,
    chosen: state.chosen, items: state.items,
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem("wakfu-opti");
    if (!raw) return;
    const s = JSON.parse(raw);
    state.role = s.role || "melee";
    state.crit = s.crit !== false;
    state.dos = !!s.dos;
    state.soins = !!s.soins;
    state.plastronLibre = !!s.plastronLibre;
    state.enchanting = s.enchanting || null;
    state.chosen = (s.chosen || []).filter(c => SUBLI_BY_NAME.has(c.name));
    for (const it of ITEMS) {
      if (s.items && s.items[it.id]) state.items[it.id] = s.items[it.id];
      if (!state.items[it.id].extraColors) state.items[it.id].extraColors = [];
    }
  } catch { /* état corrompu : on repart de zéro */ }
}

/* ---- Mise à jour globale ---- */

function update() {
  // Le switch plastron n'a de sens qu'en support (seul cas où l'opti est jaune)
  $("plastron-libre-wrap").style.display = state.role === "support" ? "" : "none";
  renderChosen();
  renderItemsConfig();
  renderResults();
  renderOrdre();
  renderEnchant();
  saveState();
}

/* ---- Init ---- */

document.querySelectorAll('input[name="role"]').forEach(r => {
  r.addEventListener("change", () => { state.role = r.value; update(); });
});
$("opt-crit").addEventListener("change", e => { state.crit = e.target.checked; update(); });
$("opt-dos").addEventListener("change", e => { state.dos = e.target.checked; update(); });
$("opt-soins").addEventListener("change", e => { state.soins = e.target.checked; update(); });
$("opt-plastron-libre").addEventListener("change", e => { state.plastronLibre = e.target.checked; update(); });

$("subli-search").addEventListener("input", () => { searchActive = -1; renderSearch(); });
$("subli-search").addEventListener("keydown", e => {
  const items = [...document.querySelectorAll('#search-results .item[data-name]')];
  if (e.key === "ArrowDown") { searchActive = Math.min(searchActive + 1, items.length - 1); renderSearch(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { searchActive = Math.max(searchActive - 1, 0); renderSearch(); e.preventDefault(); }
  else if (e.key === "Enter" && items.length) {
    addSubli(items[Math.max(searchActive, 0)].dataset.name);
    e.preventDefault();
  } else if (e.key === "Escape") {
    $("subli-search").value = ""; renderSearch();
  }
});
$("subli-search").addEventListener("blur", () => {
  setTimeout(() => $("search-results").classList.remove("open"), 150);
});

$("ench-select").addEventListener("change", e => {
  state.enchanting = e.target.value || null;
  update();
});

$("items-toggle").addEventListener("click", () => {
  $("items-toggle").classList.toggle("open");
  $("items-config").classList.toggle("hidden");
});

loadState();
// Resynchronise les contrôles avec l'état chargé
document.querySelector(`input[name="role"][value="${state.role}"]`).checked = true;
$("opt-crit").checked = state.crit;
$("opt-dos").checked = state.dos;
$("opt-soins").checked = state.soins;
$("opt-plastron-libre").checked = state.plastronLibre;
update();
