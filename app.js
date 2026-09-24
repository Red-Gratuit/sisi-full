/* ============================================================
   MINI APP TELEGRAM - VITRINE
   ============================================================ */

const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor("#0f0f12"); } catch (e) {}
  try { tg.setBackgroundColor("#0f0f12"); } catch (e) {}
  try { tg.disableVerticalSwipes(); } catch (e) {}
}

const STORAGE_KEY = "mini-app-vitine-avis";
const PRODUCTS_KEY = "mini-app-vitine-produits";
const PRODUCTS_API_URL = "/api/products";
const CATEGORY_OPTIONS = ["hash", "weed", "dur", "autres"];

const DEFAULT_PRODUITS = [
  { id: 1, nom: "Maillot Domicile", prix: 39.90, qte: 12, cat: "hash", icon: "👕", image: "", mediaType: "image" },
  { id: 2, nom: "Écharpe Supporter", prix: 14.90, qte: 18, cat: "weed", icon: "🧣", image: "", mediaType: "image" },
  { id: 3, nom: "Casquette Club", prix: 19.90, qte: 9, cat: "dur", icon: "🧢", image: "", mediaType: "image" },
  { id: 4, nom: "Coussin Logo", prix: 22.00, qte: 7, cat: "weed", icon: "🛋️", image: "", mediaType: "image" },
  { id: 5, nom: "Porte-clés", prix: 6.50, qte: 25, cat: "autres", icon: "🔑", image: "", mediaType: "image" },
  { id: 6, nom: "Sac de Sport", prix: 29.90, qte: 11, cat: "hash", icon: "🎒", image: "", mediaType: "image" },
  { id: 7, nom: "Bonnet Chaud", prix: 16.90, qte: 14, cat: "dur", icon: "🧢", image: "", mediaType: "image" },
  { id: 8, nom: "Mug Collector", prix: 11.00, qte: 20, cat: "autres", icon: "☕", image: "", mediaType: "image" },
];

const AVIS_DEFAUT = [
  { nom: "Lucas M.", stars: 5, text: "Super qualité, livraison rapide, je recommande !" },
  { nom: "Sarah D.", stars: 4, text: "Très content de ma commande, produit conforme." },
  { nom: "Karim B.", stars: 5, text: "Service client au top, réponse très rapide sur Telegram." },
  { nom: "Emma L.", stars: 4, text: "Bon rapport qualité prix, je reviendrai." },
  { nom: "Test Client", stars: 5, text: "Très bien, le produit est top et c'est simple à utiliser sur mobile." }
];

const DEMO_REVIEW_TEXTS = new Set(
  AVIS_DEFAUT.map(review => (review.text || "").trim().toLowerCase())
);
const DEMO_REVIEW_NAMES = new Set(
  AVIS_DEFAUT.map(review => (review.nom || "").trim().toLowerCase())
);

let selectedMediaData = null;
let selectedMediaType = "image";
let currentProductId = null;
let selectedFilter = "tous";

function formatPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} €`;
  return `${numeric.toFixed(2).replace(".", ",")} €`;
}

function getProductPriceTiers(product) {
  if (Array.isArray(product?.prixParQuantite) && product.prixParQuantite.length) {
    return product.prixParQuantite
      .map(tier => ({
        qte: Number(tier?.qte ?? 0),
        prix: Number(tier?.prix ?? 0)
      }))
      .filter(tier => Number.isFinite(tier.qte) && tier.qte > 0 && Number.isFinite(tier.prix) && tier.prix >= 0)
      .sort((a, b) => a.qte - b.qte);
  }

  const legacyPrix = Number(product?.prix ?? 0);
  const legacyQte = Number(product?.qte ?? 0);
  if (Number.isFinite(legacyPrix) || Number.isFinite(legacyQte)) {
    return [{ qte: legacyQte > 0 ? legacyQte : 1, prix: legacyPrix }].filter(tier => tier.prix >= 0 && tier.qte > 0);
  }

  return [];
}

function formatTierPriceLabel(tier) {
  return `${formatPrice(tier.prix)} · ${tier.qte}G`;
}

function getProductPriceLabel(product) {
  const tiers = getProductPriceTiers(product);
  if (!tiers.length) return formatPrice(Number(product?.prix ?? 0));
  if (tiers.length === 1) return formatTierPriceLabel(tiers[0]);
  return `${formatTierPriceLabel(tiers[0])} • ${tiers.length} tarifs`;
}

function getProductTiersMarkup(product) {
  const tiers = getProductPriceTiers(product);
  if (!tiers.length) return "";
  return tiers.map(tier => `<div class="tier-line">${formatTierPriceLabel(tier)}</div>`).join("");
}

function normalizeProduct(product, fallbackIndex = 0) {
  const tiers = getProductPriceTiers(product);
  const primaryTier = tiers[0] || { qte: Number(product?.qte ?? 1), prix: Number(product?.prix ?? 0) };

  return {
    id: Number(product?.id ?? Date.now() + fallbackIndex),
    nom: product?.nom || `Produit ${fallbackIndex + 1}`,
    description: typeof product?.description === "string" ? product.description.trim() : "",
    prix: Number(primaryTier.prix ?? 0),
    qte: Number(primaryTier.qte ?? 0),
    cat: CATEGORY_OPTIONS.includes(product?.cat) ? product.cat : "autres",
    icon: product?.icon || "🛍️",
    image: product?.image || "",
    mediaType: product?.mediaType === "video" ? "video" : "image",
    prixParQuantite: tiers.length ? tiers : [{ qte: Number(primaryTier.qte ?? 1), prix: Number(primaryTier.prix ?? 0) }]
  };
}

function loadProduits() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((product, index) => normalizeProduct(product, index));
  } catch (error) {
    return [];
  }
}

function saveProduits(list) {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list));
  } catch (error) {
    // Storage inaccessible, on ignore.
  }
}

async function loadSharedProduits() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(PRODUCTS_API_URL, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Impossible de charger les produits");
    const products = await response.json();
    if (!Array.isArray(products)) throw new Error("Réponse invalide");
    return products.map((product, index) => normalizeProduct(product, index));
  } catch (error) {
    return loadProduits();
  } finally {
    clearTimeout(timeout);
  }
}

async function saveSharedProduct(product) {
  const response = await fetch(PRODUCTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product)
  });
  if (!response.ok) throw new Error("Impossible d'enregistrer le produit");
  return normalizeProduct(await response.json());
}

async function deleteSharedProduct(productId) {
  const response = await fetch(`${PRODUCTS_API_URL}/${productId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Impossible de supprimer le produit");
}

function normalizeProductSignature(product) {
  const safe = product || {};
  return `${(safe.nom || "").trim()}|${Number(safe.prix ?? 0)}|${Number(safe.qte ?? 0)}|${safe.cat || ""}`;
}

function normalizeReviewSignature(review) {
  const safe = review || {};
  return `${(safe.nom || "").trim()}|${Number(safe.stars ?? 0)}|${(safe.text || "").trim()}`;
}

function clearLegacyDemoData() {
  try {
    const storedProducts = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
    const storedAvis = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    const demoProductNames = new Set(DEFAULT_PRODUITS.map(item => (item.nom || "").trim().toLowerCase()));

    const sanitizedProducts = Array.isArray(storedProducts)
      ? storedProducts.filter(product => !demoProductNames.has((product?.nom || "").trim().toLowerCase()))
      : [];

    const sanitizedAvis = Array.isArray(storedAvis)
      ? storedAvis.filter(review => {
          const name = ((review?.nom || "").trim().toLowerCase());
          const text = ((review?.text || "").trim().toLowerCase());
          return !DEMO_REVIEW_NAMES.has(name) && !DEMO_REVIEW_TEXTS.has(text);
        })
      : [];

    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(sanitizedProducts));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedAvis));
  } catch (error) {
    // ignore.
  }
}

let PRODUITS = loadProduits();
clearLegacyDemoData();
PRODUITS = loadProduits();

function getAvis() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveAvis(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    // Ignoré si stockage indisponible.
  }
}

function getMediaMarkup(product) {
  if (product.image) {
    if (product.mediaType === "video") {
      return `<video class="media-preview-video" muted playsinline autoplay loop preload="auto" src="${product.image}"></video>`;
    }
    return `<img src="${product.image}" alt="${product.nom}" />`;
  }
  return `<div class="product-placeholder">${product.icon}</div>`;
}

function renderProduits(filter = "tous") {
  const grid = document.getElementById("produits-grid");
  grid.innerHTML = "";
  const list = filter === "tous" ? PRODUITS : PRODUITS.filter(p => p.cat === filter);

  list.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.id = product.id;
    const categoryLabel = getCategoryLabel(product.cat);
    card.innerHTML = `
      <div class="product-media">${getMediaMarkup(product)}</div>
      <div class="product-body">
        <span class="product-tag tag-${product.cat}">${categoryLabel}</span>
        <span class="product-name">${product.nom}</span>
        <span class="product-price">${getProductPriceLabel(product)}</span>
        <span class="product-stock">${product.prixParQuantite && product.prixParQuantite.length > 1 ? `${product.prixParQuantite.length} tarifs disponibles` : `Stock: ${product.qte}`}</span>
      </div>
    `;
    card.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openProductDetail(product);
    });
    grid.appendChild(card);
  });
}

function renderAvis() {
  const list = document.getElementById("avis-list");
  const avis = getAvis();
  list.innerHTML = "";

  avis.forEach(a => {
    const card = document.createElement("div");
    card.className = "avis-card";
    card.innerHTML = `
      <div class="avis-stars">${"★".repeat(a.stars)}${"☆".repeat(5 - a.stars)}</div>
      <div class="avis-name">${a.nom}</div>
      <div class="avis-text">${a.text}</div>
    `;
    list.appendChild(card);
  });
}

function getCategoryLabel(cat) {
  const map = {
    hash: "Hash",
    weed: "Weed",
    dur: "Dur",
    autres: "Autres"
  };
  return map[cat] || "Autres";
}

function openProductDetail(product) {
  const modal = document.getElementById("product-modal");
  const content = document.getElementById("product-detail-content");

  content.innerHTML = `
    <div class="detail-media">${getMediaMarkup(product)}</div>
    <div class="detail-info">
      <span class="product-tag tag-${product.cat}">${getCategoryLabel(product.cat)}</span>
      <h3>${product.nom}</h3>
      ${product.description ? `<p class="detail-description">${product.description}</p>` : ""}
      <div class="detail-prices">${getProductTiersMarkup(product)}</div>
      <p class="detail-stock">Quantité disponible : ${product.qte}</p>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeProductDetail() {
  const modal = document.getElementById("product-modal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function setMediaPreview(src, type = "image") {
  const preview = document.getElementById("media-preview");
  if (!src) {
    preview.innerHTML = "";
    return;
  }

  if (type === "video") {
    preview.innerHTML = `<video class="media-thumb" controls playsinline muted autoplay loop preload="auto" src="${src}"></video>`;
  } else {
    preview.innerHTML = `<img class="media-thumb" src="${src}" alt="Aperçu" />`;
  }
}

function renderPriceTierRows(tiers = [{ qte: 1, prix: "" }]) {
  const container = document.getElementById("price-tiers");
  container.innerHTML = "";

  const rows = tiers.length ? tiers : [{ qte: 1, prix: "" }];
  rows.forEach((tier, index) => {
    const row = document.createElement("div");
    row.className = "price-tier-row";
    row.innerHTML = `
      <label class="tier-field">
        <span>Qté</span>
        <input class="tier-quantity" type="number" min="1" step="1" value="${Number(tier.qte || 1)}" placeholder="3" />
      </label>
      <label class="tier-field">
        <span>Prix</span>
        <input class="tier-price" type="number" min="0" step="0.01" value="${tier.prix === "" ? "" : Number(tier.prix).toFixed(2)}" placeholder="10.00" />
      </label>
      <button type="button" class="tier-remove" aria-label="Supprimer le tarif">×</button>
    `;

    const removeBtn = row.querySelector(".tier-remove");
    removeBtn.addEventListener("click", () => {
      const allRows = Array.from(container.querySelectorAll(".price-tier-row"));
      if (allRows.length <= 1) {
        row.querySelector(".tier-quantity").value = 1;
        row.querySelector(".tier-price").value = "";
        return;
      }
      row.remove();
    });

    container.appendChild(row);
  });
}

function getCurrentPriceTiers() {
  return Array.from(document.querySelectorAll(".price-tier-row")).map((row) => {
    const qte = Number(row.querySelector(".tier-quantity").value);
    const prix = Number(row.querySelector(".tier-price").value);
    return {
      qte: Number.isFinite(qte) && qte > 0 ? qte : 1,
      prix: Number.isFinite(prix) && prix >= 0 ? prix : 0
    };
  }).filter(tier => tier.prix >= 0 && tier.qte > 0);
}

function resetProductForm() {
  document.getElementById("admin-product-form").reset();
  document.getElementById("product-id").value = "";
  currentProductId = null;
  selectedMediaData = null;
  selectedMediaType = "image";
  document.getElementById("product-price").value = "";
  document.getElementById("product-quantity").value = "";
  document.getElementById("product-description").value = "";
  renderPriceTierRows([{ qte: 1, prix: "" }]);
  setMediaPreview("");
}

function populateProductForm(product) {
  currentProductId = product.id;
  document.getElementById("product-id").value = product.id;
  document.getElementById("product-name").value = product.nom;
  document.getElementById("product-category").value = product.cat;
  document.getElementById("product-description").value = product.description || "";

  const tiers = getProductPriceTiers(product);
  const firstTier = tiers[0] || { qte: Number(product.qte || 1), prix: Number(product.prix || 0) };
  document.getElementById("product-price").value = Number(firstTier.prix).toFixed(2);
  document.getElementById("product-quantity").value = firstTier.qte;
  renderPriceTierRows(tiers.length ? tiers : [{ qte: firstTier.qte, prix: firstTier.prix }]);

  selectedMediaData = product.image || "";
  selectedMediaType = product.mediaType === "video" ? "video" : "image";
  setMediaPreview(selectedMediaData, selectedMediaType);
}

function renderAdminProducts() {
  const list = document.getElementById("admin-product-list");
  list.innerHTML = "";

  PRODUITS.forEach(product => {
    const item = document.createElement("div");
    item.className = "admin-product-item";
    item.innerHTML = `
      <div class="admin-media">${getMediaMarkup(product)}</div>
      <div class="admin-product-text">
        <strong>${product.nom}</strong>
        <span>${getProductPriceLabel(product)}</span>
        <small>${getCategoryLabel(product.cat)}</small>
      </div>
      <div class="admin-buttons">
        <button type="button" data-action="edit" data-id="${product.id}">Modifier</button>
        <button type="button" data-action="delete" data-id="${product.id}" class="danger-btn">Supprimer</button>
      </div>
    `;
    list.appendChild(item);
  });
}

function createProductFromForm() {
  const id = currentProductId || Date.now();
  const nom = document.getElementById("product-name").value.trim();
  const description = document.getElementById("product-description").value.trim();
  const cat = document.getElementById("product-category").value;
  const legacyPrix = Number(document.getElementById("product-price").value);
  const legacyQte = Number(document.getElementById("product-quantity").value);
  const tiers = getCurrentPriceTiers().filter(tier => tier.prix > 0);

  if (!nom || !tiers.length) {
    showToast("Ajoute au moins un tarif valide (prix + quantité).");
    return null;
  }

  const sortedTiers = [...tiers].sort((a, b) => a.qte - b.qte);
  const primaryTier = sortedTiers[0];
  const existing = PRODUITS.find(item => item.id === id);
  const product = {
    id,
    nom,
    description,
    prix: Number(primaryTier.prix),
    qte: Number(legacyQte > 0 ? legacyQte : primaryTier.qte),
    cat,
    icon: existing?.icon || "🛍️",
    image: selectedMediaData || existing?.image || "",
    mediaType: selectedMediaType || existing?.mediaType || "image",
    prixParQuantite: sortedTiers.map(tier => ({ qte: Number(tier.qte), prix: Number(tier.prix) }))
  };

  if (legacyPrix > 0 && !sortedTiers.some(tier => tier.prix === legacyPrix && tier.qte === legacyQte)) {
    product.prixParQuantite.unshift({ qte: Number(legacyQte > 0 ? legacyQte : primaryTier.qte), prix: Number(legacyPrix) });
    product.prixParQuantite = [...new Map(product.prixParQuantite.map(tier => [`${tier.qte}-${tier.prix}`, tier])).values()]
      .sort((a, b) => a.qte - b.qte);
  }

  return product;
}

async function saveProductForm(event) {
  event.preventDefault();
  const product = createProductFromForm();
  if (!product) return;

  try {
    const savedProduct = await saveSharedProduct(product);
    const index = PRODUITS.findIndex(item => item.id === savedProduct.id);
    if (index >= 0) PRODUITS[index] = savedProduct;
    else PRODUITS.unshift(savedProduct);
    saveProduits(PRODUITS);
    renderProduits(selectedFilter);
    renderAdminProducts();
    resetProductForm();
    showToast("Produit enregistré avec succès.");
  } catch (error) {
    showToast("Erreur : produit non enregistré.");
    return;
  }

  if (tg && tg.HapticFeedback) {
    tg.HapticFeedback.notificationOccurred("success");
  }
}

async function deleteProduct(productId) {
  try {
    await deleteSharedProduct(productId);
    PRODUITS = PRODUITS.filter(item => item.id !== productId);
    saveProduits(PRODUITS);
    renderProduits(selectedFilter);
    renderAdminProducts();
    if (document.getElementById("product-id").value == productId) resetProductForm();
    showToast("Produit supprimé.");
  } catch (error) {
    showToast("Erreur : produit non supprimé.");
  }
}

function openAdminPanel() {
  document.getElementById("admin-code-modal").classList.remove("hidden");
  document.getElementById("admin-code-modal").setAttribute("aria-hidden", "false");
  setTimeout(() => document.getElementById("admin-code-input").focus(), 50);
}

function closeAdminCodePanel() {
  document.getElementById("admin-code-modal").classList.add("hidden");
  document.getElementById("admin-code-modal").setAttribute("aria-hidden", "true");
  document.getElementById("admin-code-input").value = "";
}

function validateAdminCode() {
  const code = document.getElementById("admin-code-input").value.trim();
  if (code !== "Uzi5962") {
    showToast("Code incorrect.");
    return;
  }

  closeAdminCodePanel();
  document.getElementById("admin-modal").classList.remove("hidden");
  document.getElementById("admin-modal").setAttribute("aria-hidden", "false");
  renderAdminProducts();
}

function closeAdminPanel() {
  document.getElementById("admin-modal").classList.add("hidden");
  document.getElementById("admin-modal").setAttribute("aria-hidden", "true");
  resetProductForm();
}

function handleAdminListClick(event) {
  const button = event.target.closest("button");
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const product = PRODUITS.find(item => item.id === id);

  if (!product) return;

  if (action === "edit") {
    populateProductForm(product);
    document.getElementById("product-name").focus();
  }

  if (action === "delete") {
    deleteProduct(id);
  }
}

function readFileToDataUrl(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const result = event.target.result;
    selectedMediaData = result;
    selectedMediaType = file.type.startsWith("video") ? "video" : "image";
    setMediaPreview(result, selectedMediaType);
  };
  reader.readAsDataURL(file);
}

function setupLogoTripleClick() {
  const targets = [document.getElementById("splash-logo"), document.getElementById("tap-logo"), document.getElementById("topbar-logo")];
  let clicks = 0;
  let lastTime = 0;

  targets.forEach(target => {
    if (!target) return;

    target.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTime < 500) {
        clicks += 1;
      } else {
        clicks = 1;
      }
      lastTime = now;

      if (clicks >= 3) {
        clicks = 0;
        openAdminPanel();
      }
    });
  });
}

/* ---------------- AJOUT AVIS ---------------- */
const avisForm = document.getElementById("avis-form");
if (avisForm) {
  avisForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nomInput = document.getElementById("avis-name");
    const starsInput = document.getElementById("avis-stars");
    const textInput = document.getElementById("avis-text");

    const nom = nomInput.value.trim();
    const text = textInput.value.trim();
    const stars = Number(starsInput.value) || 5;

    if (!nom || !text) {
      showToast("Remplis ton nom et ton avis.");
      return;
    }

    const avis = getAvis();
    avis.unshift({ nom, stars, text });
    saveAvis(avis);
    renderAvis();

    avisForm.reset();
    showToast("Merci ! Votre avis a été ajouté.");

    if (tg && tg.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred("success");
    }
  });
}

/* ---------------- FILTRES CATEGORIES ---------------- */
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedFilter = btn.dataset.cat;
    renderProduits(selectedFilter);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  });
});

/* ---------------- NAVIGATION BAS ---------------- */
const pages = document.querySelectorAll(".page");
const navBtns = document.querySelectorAll(".nav-btn");

navBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.page;
    pages.forEach(p => p.classList.toggle("active", p.id === "page-" + target));
    navBtns.forEach(b => b.classList.toggle("active", b === btn));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
  });
});

/* ---------------- TOAST ---------------- */
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ============================================================
   SEQUENCE D'OUVERTURE :
   1. Splash logo (animation) pendant ~1.8s
   2. Le logo disparaît -> overlay "toucher pour démarrer"
   3. Au premier clic réel -> musique démarre + app vitrine affichée
   ============================================================ */

const splash = document.getElementById("splash");
const tapOverlay = document.getElementById("tap-overlay");
const appEl = document.getElementById("app");
const navbar = document.getElementById("navbar");
const audio = document.getElementById("bg-audio");
const muteBtn = document.getElementById("mute-btn");

window.addEventListener("DOMContentLoaded", async () => {
  clearLegacyDemoData();
  PRODUITS = loadProduits();
  renderPriceTierRows([{ qte: 1, prix: "" }]);
  renderProduits();
  renderAvis();
  resetProductForm();
  renderAdminProducts();
  setupLogoTripleClick();

  const sharedProduits = await loadSharedProduits();
  if (JSON.stringify(sharedProduits) !== JSON.stringify(PRODUITS)) {
    PRODUITS = sharedProduits;
    saveProduits(PRODUITS);
    renderProduits(selectedFilter);
    renderAdminProducts();
  }
});

setTimeout(() => {
  splash.classList.add("fade-out");
  setTimeout(() => {
    splash.style.display = "none";
    tapOverlay.classList.add("visible");
  }, 600);
}, 1800);

function startApp() {
  tapOverlay.classList.remove("visible");
  setTimeout(() => { tapOverlay.classList.add("hidden"); }, 500);

  appEl.classList.remove("hidden");
  navbar.classList.remove("hidden");
  requestAnimationFrame(() => {
    appEl.classList.add("visible");
  });

  audio.volume = 0.6;
  audio.play().catch(() => { /* si bloqué, l'utilisateur pourra activer via le bouton son */ });

  if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
}

tapOverlay.addEventListener("click", startApp, { once: true });

/* ---------------- MUTE / UNMUTE ---------------- */
let muted = false;
muteBtn.addEventListener("click", () => {
  muted = !muted;
  audio.muted = muted;
  muteBtn.textContent = muted ? "🔇" : "🔊";
});

document.getElementById("close-product-modal").addEventListener("click", closeProductDetail);
document.getElementById("product-modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeProductDetail();
});
document.getElementById("close-admin-btn").addEventListener("click", closeAdminPanel);
document.getElementById("close-admin-code-btn").addEventListener("click", closeAdminCodePanel);
document.getElementById("validate-admin-code").addEventListener("click", validateAdminCode);
document.getElementById("admin-code-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") validateAdminCode();
});
document.getElementById("admin-product-form").addEventListener("submit", saveProductForm);
document.getElementById("reset-product-form").addEventListener("click", resetProductForm);
document.getElementById("add-price-tier").addEventListener("click", () => {
  const container = document.getElementById("price-tiers");
  const lastRow = container.querySelector(".price-tier-row:last-child");
  const nextTier = lastRow ? { qte: Number(lastRow.querySelector(".tier-quantity").value || 1) + 1, prix: "" } : { qte: 1, prix: "" };
  const currentTiers = Array.from(container.querySelectorAll(".price-tier-row")).map(row => ({
    qte: Number(row.querySelector(".tier-quantity").value || 1),
    prix: row.querySelector(".tier-price").value
  }));
  renderPriceTierRows([...currentTiers, nextTier]);
});
document.getElementById("admin-product-list").addEventListener("click", handleAdminListClick);
document.getElementById("product-media").addEventListener("change", (event) => {
  readFileToDataUrl(event.target.files && event.target.files[0]);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeProductDetail();
    closeAdminPanel();
    closeAdminCodePanel();
  }
});
