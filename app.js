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
  // [{name, qty}]
  chosen: [],
  // itemId -> { override: 'R'|'G'|'B'|'Y'|null, slots: [4 x ('R'|'G'|'B'|'Y'|null)] }
  items: {},
};
for (const it of ITEMS) state.items[it.id] = { override: null, slots: [null, null, null, null] };

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
  return item.opti[state.role];
}

// Meilleur placement d'une subli (ou null) sur un objet.
// Retourne { cost, reused, layout: [{color, isNew, inWin}], offset }
//  - cost   : nb de châsses jaunes à obtenir
//  - reused : nb de jaunes déjà en place et réutilisées
function bestPlacement(opti, existing, subliColors) {
  const offsets = subliColors ? [0, 1] : [null];
  let best = null;
  for (const off of offsets) {
    const layout = [];
    let cost = 0, reused = 0;
    for (let pos = 0; pos < 4; pos++) {
      const inWin = off !== null && pos >= off && pos < off + 3;
      let base, needY = false;
      if (opti === null) {
        base = inWin ? subliColors[pos - off] : "ANY";
      } else if (inWin) {
        const need = subliColors[pos - off];
        if (need === opti) base = opti;
        else { base = "Y"; needY = true; }
      } else {
        base = opti;
        if (opti === "Y") needY = true;
      }
      let color = base, isNew = false;
      if (needY) {
        color = "Y";
        if (existing[pos] === "Y") reused++;
        else { cost++; isNew = true; }
      } else if (existing[pos] === "Y") {
        color = "Y"; // un jaune déjà en place convient toujours
      }
      layout.push({ color, isNew, inWin });
    }
    const cand = { cost, reused, layout, offset: off };
    if (!best || cand.cost < best.cost || (cand.cost === best.cost && cand.reused > best.reused)) {
      best = cand;
    }
  }
  return best;
}

// Affectation optimale sublis -> objets (exacte, DP sur bitmask).
// sublis : liste dépliée (une entrée par exemplaire), longueur <= 10.
// Retourne { total, perItem: [{item, subli|null, placement}] }
function optimize(sublis) {
  const n = sublis.length;
  const FULL = (1 << n) - 1;

  // Coûts précalculés
  const noSubli = ITEMS.map(it =>
    bestPlacement(effectiveOpti(it), state.items[it.id].slots, null));
  const withSubli = ITEMS.map(it =>
    sublis.map(s =>
      bestPlacement(effectiveOpti(it), state.items[it.id].slots, s.colors.map(c => ID_TO_COLOR[c]))));

  // Score lexicographique : d'abord minimiser les jaunes à obtenir, puis, à coût égal,
  // maximiser la réutilisation des jaunes déjà en place (les sublis les plus exigeantes
  // vont ainsi sur les objets riches en jaunes). reused <= 40 au total, donc x100 suffit.
  const score = p => p.cost * 100 - p.reused;

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

    row.innerHTML = `
      <span class="item-name">${it.icon} ${it.label}</span>
      <span class="opti-label">Couleur opti :</span>
      <select data-override>${overrideOpts}</select>
      <span class="opti-label">Châsses actuelles :</span>
      <span class="slots">${slotSelects}</span>`;

    row.querySelector("[data-override]").addEventListener("change", e => {
      cfg.override = e.target.value || null;
      update();
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

function renderResults() {
  const resBox = $("results");
  const sumBox = $("summary");

  // Dépliage des exemplaires
  const sublis = [];
  for (const c of state.chosen) {
    const s = SUBLI_BY_NAME.get(c.name);
    for (let k = 0; k < c.qty; k++) sublis.push({ name: c.name, colors: s.colors });
  }

  if (sublis.length > MAX_SUBLIS) {
    resBox.innerHTML = "";
    sumBox.innerHTML = "Trop de sublimations sélectionnées, retire l'excédent pour lancer le calcul.";
    $("total-yellow").textContent = "–";
    return;
  }

  const result = optimize(sublis);
  if (!result) {
    resBox.innerHTML = "";
    sumBox.innerHTML = "Calcul impossible.";
    return;
  }

  let totalReused = 0;
  resBox.innerHTML = "";
  for (const { item, subli, placement } of result.perItem) {
    totalReused += placement.reused;
    const card = document.createElement("div");
    card.className = "result-card";

    const slots = placement.layout.map((sl, i) => `
      <span class="slot">
        <span class="tag">${sl.isNew ? "à obtenir" : ""}</span>
        <i class="dot big c-${sl.color} ${sl.isNew ? "new" : ""}" title="${COLOR_LABEL[sl.color]}"></i>
        <span class="pos">${sl.inWin ? "●" : ""}&nbsp;</span>
      </span>`).join("");

    const windowTxt = subli
      ? `Sublimation sur les châsses ${placement.offset + 1}-${placement.offset + 3} (●)`
      : "";

    card.innerHTML = `
      <div class="head">
        <span class="item-title">${item.icon} ${item.label}</span>
        <span class="cost ${placement.cost ? "" : "zero"}">${placement.cost ? placement.cost + " jaune(s) à obtenir" : "aucun jaune"}</span>
      </div>
      <div class="subli-name ${subli ? "" : "none"}">${subli ? subli.name : "— aucune sublimation —"}</div>
      <div class="slots">${slots}</div>
      <div class="window">${windowTxt}${placement.reused ? ` · ${placement.reused} jaune(s) déjà en place réutilisée(s)` : ""}</div>`;
    resBox.appendChild(card);
  }

  $("total-yellow").textContent = result.total;
  sumBox.innerHTML = `Total : <b>${result.total}</b> châsse(s) jaune(s) à obtenir` +
    (totalReused ? ` · ${totalReused} jaune(s) déjà possédée(s) réutilisée(s)` : "") +
    ` · ${sublis.length} sublimation(s) placée(s).`;
}

/* ---- Persistance ---- */

function saveState() {
  localStorage.setItem("wakfu-opti", JSON.stringify({
    role: state.role, crit: state.crit, dos: state.dos, soins: state.soins,
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
    state.chosen = (s.chosen || []).filter(c => SUBLI_BY_NAME.has(c.name));
    for (const it of ITEMS) {
      if (s.items && s.items[it.id]) state.items[it.id] = s.items[it.id];
    }
  } catch { /* état corrompu : on repart de zéro */ }
}

/* ---- Mise à jour globale ---- */

function update() {
  renderChosen();
  renderItemsConfig();
  renderResults();
  saveState();
}

/* ---- Init ---- */

document.querySelectorAll('input[name="role"]').forEach(r => {
  r.addEventListener("change", () => { state.role = r.value; update(); });
});
$("opt-crit").addEventListener("change", e => { state.crit = e.target.checked; update(); });
$("opt-dos").addEventListener("change", e => { state.dos = e.target.checked; update(); });
$("opt-soins").addEventListener("change", e => { state.soins = e.target.checked; update(); });

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
update();
