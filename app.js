const SESSION_KEY = "auto-ligne-niger-session-shared-v1";
const LOCAL_CARS_KEY = "auto-ligne-niger-local-cars-v1";
const DEFAULT_USER = {
  email: "auto-ligne-niger@local",
  firstName: "Auto",
  lastName: "Ligne Niger",
  fullName: "Auto Ligne Niger"
};

const carsGrid = document.querySelector("#carsGrid");
const dashboardGrid = document.querySelector("#dashboardGrid");
const emptyState = document.querySelector("#emptyState");
const dashboardEmpty = document.querySelector("#dashboardEmpty");
const totalCars = document.querySelector("#totalCars");
const heroTotalCars = document.querySelector("#heroTotalCars");
const myCarsCount = document.querySelector("#myCarsCount");
const carForm = document.querySelector("#carForm");
const formTitle = document.querySelector("#formTitle");
const submitCarButton = document.querySelector("#submitCarButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const formMessage = document.querySelector("#formMessage");
const publishNote = document.querySelector("#publishNote");
const dashboardNote = document.querySelector("#dashboardNote");
const filtersForm = document.querySelector("#filtersForm");
const resetFilters = document.querySelector("#resetFilters");
const authShell = document.querySelector("#connexion");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authText = document.querySelector("#authText");
const authRole = document.querySelector("#authRole");
const authMessage = document.querySelector("#authMessage");
const logoutButton = document.querySelector("#logoutButton");
const siteNav = document.querySelector("#siteNav");
const adminNavLink = document.querySelector("#adminNavLink");
const siteContent = document.querySelector("#siteContent");
const siteFooter = document.querySelector("#siteFooter");
const passwordToggles = document.querySelectorAll("[data-password-toggle]");
const carModal = document.querySelector("#carModal");
const modalPhoto = document.querySelector("#modalPhoto");
const modalCity = document.querySelector("#modalCity");
const modalTitle = document.querySelector("#modalTitle");
const modalPrice = document.querySelector("#modalPrice");
const modalMeta = document.querySelector("#modalMeta");
const modalDescription = document.querySelector("#modalDescription");
const modalWhatsapp = document.querySelector("#modalWhatsapp");
const modalCall = document.querySelector("#modalCall");

const filterBrand = document.querySelector("#filterBrand");
const filterCity = document.querySelector("#filterCity");
const filterPrice = document.querySelector("#filterPrice");
const adminSection = document.querySelector("#admin");
const adminStats = document.querySelector("#adminStats");
const adminUsers = document.querySelector("#adminUsers");
const adminCars = document.querySelector("#adminCars");
const adminPasswordForm = document.querySelector("#adminPasswordForm");
const adminPasswordMessage = document.querySelector("#adminPasswordMessage");

let cars = [];
let adminUsersState = [];
let adminStatsState = null;
let currentUser = loadSession();

function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session || session.email === DEFAULT_USER.email) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(user) {
  currentUser = user;

  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return;
  }

  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
}

function loadLocalCars() {
  try {
    const savedCars = JSON.parse(localStorage.getItem(LOCAL_CARS_KEY) || "[]");
    return Array.isArray(savedCars) ? savedCars : [];
  } catch {
    return [];
  }
}

function saveLocalCars(localCars) {
  localStorage.setItem(LOCAL_CARS_KEY, JSON.stringify(localCars));
}

function mergeCars(serverCars, localCars) {
  const knownIds = new Set(serverCars.map((car) => car.id));
  return [...localCars.filter((car) => !knownIds.has(car.id)), ...serverCars];
}

function saveCarLocally(carData, carId = "") {
  const localCars = loadLocalCars();
  const existingIndex = localCars.findIndex((car) => car.id === carId);
  const localCar = {
    ...carData,
    id: carId || `local-${Date.now()}`,
    sellerId: carData.sellerId || currentUser?.email || "",
    sellerName: carData.sellerName || currentUser?.fullName || currentUser?.email || ""
  };

  if (existingIndex >= 0) {
    localCars[existingIndex] = localCar;
  } else {
    localCars.unshift(localCar);
  }

  saveLocalCars(localCars);
  cars = mergeCars(cars.filter((car) => !car.id.startsWith("local-")), localCars);
  renderCars();
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Erreur serveur.");
    }

    return payload;
  } catch (error) {
    if (error.message === "Load failed" || error instanceof TypeError) {
      throw new Error("Impossible d’envoyer l’annonce. Vérifiez que le serveur est lancé et que la photo n’est pas trop lourde.");
    }

    throw error;
  }
}

async function refreshCars() {
  const payload = await apiRequest("/api/state");
  cars = mergeCars(payload.cars || [], loadLocalCars());
  renderCars();
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(price) {
  return new Intl.NumberFormat("fr-FR").format(Number(price || 0)) + " FCFA";
}

function phoneDigits(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("227")) return digits;
  return `227${digits}`;
}

function whatsappLink(car) {
  const message = `Bonjour, je suis intéressé par ${car.brand} ${car.model} à ${formatPrice(car.price)} sur Auto Ligne Niger.`;
  return `https://wa.me/${phoneDigits(car.phone)}?text=${encodeURIComponent(message)}`;
}

function getCarPhotos(car) {
  if (Array.isArray(car.photos) && car.photos.length) {
    return car.photos.filter(Boolean);
  }

  return car.photo ? [car.photo] : [];
}

function firstCarPhoto(car) {
  return getCarPhotos(car)[0] || "";
}

function normalizeCarStatus(car) {
  const status = String(car?.status || "").trim().toLowerCase();
  return ["active", "pending", "hidden"].includes(status) ? status : "active";
}

function statusLabel(status) {
  return {
    active: "Active",
    pending: "En attente",
    hidden: "Masquee"
  }[status] || "Active";
}

function carPhotoTemplate(car) {
  const photo = firstCarPhoto(car);

  if (photo) {
    return `<img src="${escapeHtml(photo)}" alt="${escapeHtml(car.brand)} ${escapeHtml(car.model)}" />`;
  }

  return `<span class="car-placeholder" aria-hidden="true"></span>`;
}

function carCardTemplate(car) {
  const phoneLink = String(car.phone || "").replace(/\s+/g, "");
  const status = normalizeCarStatus(car);

  return `
    <article class="car-card">
      <div class="car-photo">${carPhotoTemplate(car)}</div>
      <div class="car-body">
        <div class="car-title">
          <div>
            <p>${escapeHtml(car.city)}</p>
            <h3>${escapeHtml(car.brand)} ${escapeHtml(car.model)}</h3>
          </div>
          <span class="price">${formatPrice(car.price)}</span>
        </div>
        ${isAdmin() ? `<span class="car-status status-${status}">${statusLabel(status)}</span>` : ""}
        <ul class="meta">
          <li>${escapeHtml(car.gearbox)}</li>
        </ul>
        <p class="description">${escapeHtml(car.description || "Description non précisée.")}</p>
        <div class="seller">
          <span>Vendeur : ${escapeHtml(car.sellerName || "Non précisé")}</span>
          <a href="tel:${escapeHtml(phoneLink)}">${escapeHtml(car.phone)}</a>
        </div>
        <div class="card-actions">
          <button class="button ghost" type="button" data-detail-id="${escapeHtml(car.id)}">Voir détail</button>
          <a class="button whatsapp" href="${escapeHtml(whatsappLink(car))}" target="_blank" rel="noopener">WhatsApp</a>
        </div>
      </div>
    </article>
  `;
}

function dashboardCardTemplate(car) {
  const ownerLine = isAdmin() ? `<span class="seller-owner">${escapeHtml(car.sellerName || car.sellerId || "Non précisé")}</span>` : "";
  const status = normalizeCarStatus(car);

  return `
    <article class="seller-card">
      <div class="seller-thumb">${carPhotoTemplate(car)}</div>
      <div>
        <h3>${escapeHtml(car.brand)} ${escapeHtml(car.model)}</h3>
        <p>${escapeHtml(car.city)} · ${formatPrice(car.price)}</p>
        <span class="car-status status-${status}">${statusLabel(status)}</span>
        ${ownerLine}
      </div>
      <div class="seller-actions">
        <button class="button ghost" type="button" data-action="edit" data-id="${escapeHtml(car.id)}">Modifier</button>
        <button class="button danger" type="button" data-action="delete" data-id="${escapeHtml(car.id)}">Supprimer</button>
      </div>
    </article>
  `;
}

function getFilteredCars() {
  const brand = normalize(filterBrand.value);
  const city = normalize(filterCity.value);
  const maxPrice = Number(filterPrice.value || 0);

  return cars.filter((car) => {
    if (!isAdmin() && normalizeCarStatus(car) !== "active") return false;
    const matchesBrand = !brand || normalize(car.brand).includes(brand) || normalize(car.model).includes(brand);
    const matchesCity = !city || normalize(car.city).includes(city);
    const matchesPrice = !maxPrice || Number(car.price) <= maxPrice;

    return matchesBrand && matchesCity && matchesPrice;
  });
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function canManageCar(car) {
  if (!currentUser) return false;
  return isAdmin() || car.sellerId === currentUser.email;
}

function getMyCars() {
  if (!currentUser) return [];
  if (isAdmin()) return cars;
  return cars.filter((car) => car.sellerId === currentUser.email);
}

function setPublishDisabled(disabled) {
  Array.from(carForm.elements).forEach((element) => {
    if (!element.name || element.type === "hidden") return;
    element.disabled = disabled;
  });
  submitCarButton.disabled = disabled;
  cancelEditButton.disabled = disabled;
}

function adminStatTemplate(label, value) {
  return `<article class="admin-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`;
}

function adminUserTemplate(user) {
  const isBlocked = Boolean(user.blocked);
  const isSelf = currentUser && user.email === currentUser.email;
  const roleAction = user.role === "admin" ? "make-seller" : "make-admin";
  const roleLabel = user.role === "admin" ? "Rendre vendeur" : "Rendre admin";

  return `
    <article class="admin-item">
      <div>
        <h3>${escapeHtml(user.fullName || user.email)}</h3>
        <p>${escapeHtml(user.email)}</p>
        <div class="admin-tags">
          <span class="role-badge">${escapeHtml(user.role === "admin" ? "Administrateur" : "Vendeur")}</span>
          ${isBlocked ? `<span class="role-badge blocked">Bloque</span>` : ""}
        </div>
      </div>
      <div class="admin-actions">
        <button class="button ghost" type="button" data-admin-user-action="${isBlocked ? "unblock" : "block"}" data-user-email="${escapeHtml(user.email)}" ${isSelf ? "disabled" : ""}>${isBlocked ? "Debloquer" : "Bloquer"}</button>
        <button class="button secondary" type="button" data-admin-user-action="${roleAction}" data-user-email="${escapeHtml(user.email)}" ${isSelf ? "disabled" : ""}>${roleLabel}</button>
        <button class="button danger" type="button" data-admin-user-action="delete" data-user-email="${escapeHtml(user.email)}" ${isSelf ? "disabled" : ""}>Supprimer</button>
      </div>
    </article>
  `;
}

function adminCarTemplate(car) {
  const status = normalizeCarStatus(car);
  return `
    <article class="admin-item">
      <div>
        <h3>${escapeHtml(car.brand)} ${escapeHtml(car.model)}</h3>
        <p>${escapeHtml(car.sellerName || car.sellerId || "Non precise")} · ${escapeHtml(car.city || "")}</p>
        <div class="admin-tags">
          <span class="car-status status-${status}">${statusLabel(status)}</span>
          <span class="role-badge">${formatPrice(car.price)}</span>
        </div>
      </div>
      <div class="admin-actions">
        <button class="button ghost" type="button" data-admin-car-status="active" data-car-id="${escapeHtml(car.id)}">Activer</button>
        <button class="button secondary" type="button" data-admin-car-status="pending" data-car-id="${escapeHtml(car.id)}">En attente</button>
        <button class="button danger" type="button" data-admin-car-status="hidden" data-car-id="${escapeHtml(car.id)}">Masquer</button>
      </div>
    </article>
  `;
}

function renderAdminPanel() {
  adminNavLink.hidden = !isAdmin();
  adminSection.hidden = !isAdmin();
  if (!isAdmin()) return;

  const stats = adminStatsState || {
    totalUsers: 0,
    blockedUsers: 0,
    activeCars: cars.filter((car) => normalizeCarStatus(car) === "active").length,
    pendingCars: cars.filter((car) => normalizeCarStatus(car) === "pending").length,
    hiddenCars: cars.filter((car) => normalizeCarStatus(car) === "hidden").length
  };

  adminStats.innerHTML = [
    adminStatTemplate("Utilisateurs", stats.totalUsers),
    adminStatTemplate("Comptes bloques", stats.blockedUsers),
    adminStatTemplate("Annonces actives", stats.activeCars),
    adminStatTemplate("En attente", stats.pendingCars),
    adminStatTemplate("Masquees", stats.hiddenCars)
  ].join("");

  adminUsers.innerHTML = adminUsersState.map(adminUserTemplate).join("");
  adminCars.innerHTML = cars.map(adminCarTemplate).join("");
}

async function refreshAdminState() {
  if (!isAdmin()) {
    adminUsersState = [];
    adminStatsState = null;
    renderAdminPanel();
    return;
  }

  const payload = await apiRequest(`/api/admin/state?requesterId=${encodeURIComponent(currentUser.email)}`);
  adminUsersState = payload.users || [];
  adminStatsState = payload.stats || null;
  cars = payload.cars || cars;
  renderCars();
}

function renderCars() {
  const filteredCars = getFilteredCars();
  const myCars = getMyCars();

  carsGrid.innerHTML = filteredCars.map(carCardTemplate).join("");
  dashboardGrid.innerHTML = myCars.map(dashboardCardTemplate).join("");

  emptyState.hidden = filteredCars.length > 0;
  dashboardEmpty.hidden = myCars.length > 0;
  totalCars.textContent = cars.length;
  heroTotalCars.textContent = cars.length;
  myCarsCount.textContent = myCars.length;
  renderAdminPanel();
}

function renderAuth() {
  const isConnected = Boolean(currentUser);

  authShell.classList.toggle("connected", isConnected);
  logoutButton.hidden = !isConnected;
  authForm.hidden = isConnected;
  siteNav.hidden = false;
  siteContent.hidden = false;
  siteFooter.hidden = false;

  if (isConnected) {
    authTitle.textContent = isAdmin()
      ? `Administrateur : ${currentUser.fullName || currentUser.email}`
      : `Connecté : ${currentUser.fullName || currentUser.email}`;
    authText.textContent = isAdmin()
      ? "Vous pouvez voir, modifier et supprimer toutes les annonces."
      : "Vous pouvez publier et gérer seulement vos propres annonces.";
    authRole.textContent = isAdmin() ? "Administrateur" : "Compte vendeur";
    dashboardNote.textContent = isAdmin()
      ? "Mode administrateur : toutes les annonces sont visibles ici."
      : "Ici vous retrouvez uniquement vos propres annonces.";
    publishNote.textContent = isAdmin()
      ? "Mode administrateur : vos annonces sont publiées immédiatement."
      : "Vos nouvelles annonces seront envoyées en attente de validation.";
    authMessage.textContent = "";
    formMessage.textContent = "";
    adminPasswordMessage.textContent = "";
    setPublishDisabled(false);
    renderCars();
    refreshAdminState().catch(() => {});
    return;
  }

  authTitle.textContent = "Mode visiteur";
  authText.textContent = "Vous pouvez consulter les annonces. Connectez-vous pour publier ou gérer.";
  authRole.textContent = "Visiteur";
  dashboardNote.textContent = "Connectez-vous pour voir votre espace vendeur ou administrateur.";
  publishNote.textContent = "Connexion obligatoire pour publier une voiture.";
  setPublishDisabled(true);
  formMessage.textContent = "Publication réservée aux comptes connectés.";
  adminPasswordMessage.textContent = "";
  adminUsersState = [];
  adminStatsState = null;
  renderCars();
}

function imageToCanvas(image, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToSmallDataUrl(image, maxSize = 1200, quality = 0.78) {
  const canvas = imageToCanvas(image, maxSize);
  return canvas.toDataURL("image/jpeg", quality);
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function compressImage(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const attempts = [
          [1200, 0.78],
          [950, 0.68],
          [750, 0.58],
          [600, 0.5]
        ];
        let compressed = "";

        for (const [size, quality] of attempts) {
          compressed = canvasToSmallDataUrl(image, size, quality);
          if (compressed.length < 700000) break;
        }

        resolve(compressed);
      };
      image.onerror = () => resolve("");
      image.src = reader.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function imageFileToBlob(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = async () => {
        const attempts = [
          [1400, 0.78],
          [1100, 0.68],
          [900, 0.58],
          [700, 0.5]
        ];
        let bestBlob = null;

        for (const [size, quality] of attempts) {
          const canvas = imageToCanvas(image, size);
          bestBlob = await canvasToBlob(canvas, quality);
          if (bestBlob && bestBlob.size < 900000) break;
        }

        resolve(bestBlob);
      };
      image.onerror = () => resolve(file);
      image.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function uploadPhoto(file) {
  if (!file || !file.size || !file.type.startsWith("image/")) {
    return "";
  }

  const imageBlob = await imageFileToBlob(file);
  if (!imageBlob) return "";

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: imageBlob
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Photo non envoyée.");
  }

  return payload.url || "";
}

async function uploadPhotos(fileList) {
  const files = Array.from(fileList || []).filter((file) => file && file.size && file.type.startsWith("image/"));
  const urls = [];

  for (const file of files.slice(0, 8)) {
    const url = await uploadPhoto(file);
    if (url) urls.push(url);
  }

  return urls;
}

async function fileToDataUrl(file) {
  if (!file || !file.size) {
    return "";
  }

  if (file.type.startsWith("image/")) {
    return compressImage(file);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function resetCarForm() {
  carForm.reset();
  carForm.elements.carId.value = "";
  formTitle.textContent = "Ajouter une voiture";
  submitCarButton.textContent = "Publier l’annonce";
  cancelEditButton.hidden = true;
}

function fillCarForm(car) {
  carForm.elements.carId.value = car.id;
  carForm.elements.brand.value = car.brand || "";
  carForm.elements.model.value = car.model || "";
  carForm.elements.price.value = car.price || "";
  carForm.elements.city.value = car.city || "";
  carForm.elements.gearbox.value = car.gearbox || "Automatique";
  carForm.elements.phone.value = car.phone || "";
  carForm.elements.description.value = car.description || "";
  formTitle.textContent = "Modifier l’annonce";
  submitCarButton.textContent = "Enregistrer les modifications";
  cancelEditButton.hidden = false;
  document.querySelector("#publier").scrollIntoView({ behavior: "smooth" });
}

function openCarModal(car) {
  const photos = getCarPhotos(car);
  const title = `${escapeHtml(car.brand)} ${escapeHtml(car.model)}`;
  modalPhoto.innerHTML = photos.length
    ? `
      <img class="modal-main-photo" src="${escapeHtml(photos[0])}" alt="${title}" />
      ${
        photos.length > 1
          ? `<div class="modal-thumbs" aria-label="Photos de la voiture">
              ${photos
                .map(
                  (photo, index) => `
                    <button class="modal-thumb${index === 0 ? " active" : ""}" type="button" data-modal-photo="${escapeHtml(photo)}" aria-label="Voir photo ${index + 1}">
                      <img src="${escapeHtml(photo)}" alt="" />
                    </button>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
    `
    : carPhotoTemplate(car);
  modalCity.textContent = car.city || "";
  modalTitle.textContent = `${car.brand} ${car.model}`;
  modalPrice.textContent = formatPrice(car.price);
  modalMeta.innerHTML = [car.gearbox]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  modalDescription.textContent = car.description || "Description non précisée.";
  modalWhatsapp.href = whatsappLink(car);
  modalCall.href = `tel:${String(car.phone || "").replace(/\s+/g, "")}`;
  carModal.hidden = false;
}

function closeCarModal() {
  carModal.hidden = true;
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const action = event.submitter?.dataset.authAction;
  const formData = new FormData(authForm);
  const lastName = String(formData.get("lastName") || "").trim();
  const firstName = String(formData.get("firstName") || "").trim();
  const email = normalize(formData.get("email"));
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!email || !password) {
    authMessage.textContent = "Entrez votre email et votre mot de passe.";
    return;
  }

  try {
    if (action === "register") {
      if (!lastName || !firstName) {
        authMessage.textContent = "Entrez votre nom et votre prénom.";
        return;
      }

      if (password !== confirmPassword) {
        authMessage.textContent = "Les deux mots de passe ne sont pas identiques.";
        return;
      }

      const payload = await apiRequest("/api/register", {
        method: "POST",
        body: JSON.stringify({ email, password, firstName, lastName })
      });
      cars = mergeCars(payload.cars || [], loadLocalCars());
      saveSession(payload.user);
      authForm.reset();
      renderAuth();
      return;
    }

    const payload = await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    cars = mergeCars(payload.cars || [], loadLocalCars());
    saveSession(payload.user);
    authForm.reset();
    renderAuth();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => {
  saveSession(null);
  resetCarForm();
  renderAuth();
});

carForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    formMessage.textContent = "Connectez-vous avant de publier une annonce.";
    document.querySelector("#connexion").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const formData = new FormData(carForm);
  const carId = String(formData.get("carId") || "");
  const existingCar = cars.find((car) => car.id === carId && canManageCar(car));
  submitCarButton.disabled = true;
  formMessage.textContent = "Publication en cours...";
  const photoFiles = carForm.elements.photos?.files || [];
  const existingPhotos = existingCar ? getCarPhotos(existingCar) : [];
  let uploadedPhotos = [];

  try {
    uploadedPhotos = await uploadPhotos(photoFiles);
  } catch (error) {
    formMessage.textContent = "Photos non envoyées, publication sans nouvelle photo...";
    uploadedPhotos = [];
  }

  const photos = uploadedPhotos.length ? uploadedPhotos : existingPhotos;

  const carData = {
    brand: formData.get("brand"),
    model: formData.get("model"),
    price: Number(formData.get("price")),
    city: formData.get("city"),
    gearbox: formData.get("gearbox"),
    phone: formData.get("phone"),
    description: formData.get("description"),
    requesterId: currentUser.email,
    sellerId: existingCar?.sellerId || currentUser.email,
    sellerName: existingCar?.sellerName || currentUser.fullName || currentUser.email,
    status: existingCar?.status || (isAdmin() ? "active" : "pending"),
    photos,
    photo: photos[0] || ""
  };

  try {
    const payload = await apiRequest(carId ? `/api/cars/${encodeURIComponent(carId)}` : "/api/cars", {
      method: carId ? "PUT" : "POST",
      body: JSON.stringify(carData)
    });
    cars = mergeCars(payload.cars || [], loadLocalCars());
    formMessage.textContent = carId
      ? "Annonce modifiée avec succès."
      : (isAdmin() ? "Annonce publiée avec succès." : "Annonce envoyée en attente de validation.");
    renderCars();
    resetCarForm();
    document.querySelector("#dashboard").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    if (carData.photos.length) {
      try {
        const fallbackPayload = await apiRequest(carId ? `/api/cars/${encodeURIComponent(carId)}` : "/api/cars", {
          method: carId ? "PUT" : "POST",
          body: JSON.stringify({ ...carData, photos: [], photo: "" })
        });
        cars = mergeCars(fallbackPayload.cars || [], loadLocalCars());
        formMessage.textContent = carId
          ? "Annonce modifiée. Les photos n’ont pas été ajoutées."
          : (isAdmin() ? "Annonce publiée. Les photos n’ont pas été ajoutées." : "Annonce envoyée en attente de validation. Les photos n’ont pas été ajoutées.");
        renderCars();
        resetCarForm();
        document.querySelector("#dashboard").scrollIntoView({ behavior: "smooth" });
        return;
      } catch {
        saveCarLocally({ ...carData, photos: [], photo: "" }, carId);
        formMessage.textContent = "Annonce enregistrée sur cet appareil. Les photos n’ont pas été ajoutées.";
        resetCarForm();
        document.querySelector("#dashboard").scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    saveCarLocally(carData, carId);
    formMessage.textContent = isAdmin()
      ? "Annonce enregistrée sur cet appareil."
      : "Annonce en attente enregistrée sur cet appareil.";
    resetCarForm();
    document.querySelector("#dashboard").scrollIntoView({ behavior: "smooth" });
  } finally {
    submitCarButton.disabled = false;
  }
});

dashboardGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !currentUser) return;

  const carId = button.dataset.id;
  const car = cars.find((item) => item.id === carId && canManageCar(item));
  if (!car) return;

  if (button.dataset.action === "edit") {
    fillCarForm(car);
    return;
  }

  try {
    const payload = await apiRequest(`/api/cars/${encodeURIComponent(car.id)}?requesterId=${encodeURIComponent(currentUser.email)}`, {
      method: "DELETE"
    });
    cars = mergeCars(payload.cars || [], loadLocalCars());
    renderCars();
    formMessage.textContent = "Annonce supprimée.";
  } catch (error) {
    const localCars = loadLocalCars().filter((item) => item.id !== car.id);
    saveLocalCars(localCars);
    cars = cars.filter((item) => item.id !== car.id);
    renderCars();
    formMessage.textContent = "Annonce supprimée.";
  }
});

adminUsers.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-admin-user-action]");
  if (!button || !isAdmin()) return;

  const action = button.dataset.adminUserAction;
  const email = button.dataset.userEmail;

  try {
    if (action === "delete") {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(email)}?requesterId=${encodeURIComponent(currentUser.email)}`, {
        method: "DELETE"
      });
      adminUsersState = payload.users || [];
      adminStatsState = payload.stats || null;
      cars = payload.cars || cars;
      renderCars();
      return;
    }

    const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ requesterId: currentUser.email, action })
    });
    adminUsersState = payload.users || [];
    adminStatsState = payload.stats || null;
    renderAdminPanel();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

adminCars.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-admin-car-status]");
  if (!button || !isAdmin()) return;

  try {
    const payload = await apiRequest(`/api/admin/cars/${encodeURIComponent(button.dataset.carId)}/status`, {
      method: "POST",
      body: JSON.stringify({ requesterId: currentUser.email, status: button.dataset.adminCarStatus })
    });
    cars = payload.cars || cars;
    adminStatsState = payload.stats || null;
    renderCars();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

adminPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin()) return;

  const formData = new FormData(adminPasswordForm);
  adminPasswordMessage.textContent = "Mise à jour en cours...";

  try {
    const payload = await apiRequest("/api/admin/password", {
      method: "PATCH",
      body: JSON.stringify({
        requesterId: currentUser.email,
        currentPassword: String(formData.get("currentPassword") || ""),
        newPassword: String(formData.get("newPassword") || ""),
        confirmPassword: String(formData.get("confirmPassword") || "")
      })
    });

    adminPasswordMessage.textContent = payload.message || "Mot de passe mis à jour.";
    adminPasswordForm.reset();
  } catch (error) {
    adminPasswordMessage.textContent = error.message;
  }
});

carsGrid.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-detail-id]");
  if (!detailButton) return;

  const car = cars.find((item) => item.id === detailButton.dataset.detailId);
  if (car) openCarModal(car);
});

carModal.addEventListener("click", (event) => {
  const photoButton = event.target.closest("[data-modal-photo]");
  if (photoButton) {
    const mainPhoto = modalPhoto.querySelector(".modal-main-photo");
    if (mainPhoto) {
      mainPhoto.src = photoButton.dataset.modalPhoto;
      modalPhoto.querySelectorAll(".modal-thumb").forEach((button) => button.classList.remove("active"));
      photoButton.classList.add("active");
    }
    return;
  }

  if (event.target.closest("[data-close-modal]")) {
    closeCarModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !carModal.hidden) {
    closeCarModal();
  }
});

cancelEditButton.addEventListener("click", () => {
  resetCarForm();
  formMessage.textContent = "";
});

filtersForm.addEventListener("input", renderCars);

resetFilters.addEventListener("click", () => {
  filtersForm.reset();
  renderCars();
});

passwordToggles.forEach((button) => {
  button.addEventListener("click", () => {
    const input = authForm.elements[button.dataset.passwordToggle];
    const isVisible = input.type === "text";

    input.type = isVisible ? "password" : "text";
    button.textContent = isVisible ? "👁" : "🙈";
    button.setAttribute("aria-label", isVisible ? "Afficher le mot de passe" : "Cacher le mot de passe");
  });
});

refreshCars()
  .catch((error) => {
    authMessage.textContent = "Démarrez le serveur partagé pour synchroniser les comptes et les annonces.";
    console.error(error);
  })
  .finally(renderAuth);
