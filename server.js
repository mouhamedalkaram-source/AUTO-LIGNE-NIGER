const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const IS_VERCEL = Boolean(process.env.VERCEL);
const STATE_ROOT = IS_VERCEL ? path.join("/tmp", "auto-ligne-niger") : ROOT;
const DATA_FILE = path.join(STATE_ROOT, "data.json");
const UPLOADS_DIR = path.join(STATE_ROOT, "uploads");
const SOURCE_DATA_FILE = path.join(ROOT, "data.json");
const SOURCE_UPLOADS_DIR = path.join(ROOT, "uploads");
const ADMIN_EMAILS = new Set(["alkaram.ichirif@gmail.com"]);
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-before-production";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_USER = {
  email: "auto-ligne-niger@local",
  firstName: "Auto",
  lastName: "Ligne Niger",
  fullName: "Auto Ligne Niger",
  password: "",
  role: "system"
};

const SAMPLE_CARS = [
  {
    id: "sample-1",
    brand: "Toyota",
    model: "Corolla",
    year: 2017,
    price: 5200000,
    city: "Niamey",
    mileage: 91000,
    fuel: "Essence",
    gearbox: "Automatique",
    phone: "+227 90 12 34 56",
    description: "Voiture propre, climatisation, papiers à jour, prête à rouler.",
    sellerId: "demo@autoligne.ne",
    sellerName: "Auto Ligne Niger",
    photo: ""
  },
  {
    id: "sample-2",
    brand: "Mercedes-Benz",
    model: "C 200",
    year: 2015,
    price: 8500000,
    city: "Maradi",
    mileage: 126000,
    fuel: "Essence",
    gearbox: "Automatique",
    phone: "+227 96 40 20 10",
    description: "Bon état général, intérieur cuir, moteur très propre.",
    sellerId: "demo@autoligne.ne",
    sellerName: "Auto Ligne Niger",
    photo: ""
  },
  {
    id: "sample-3",
    brand: "Hyundai",
    model: "Tucson",
    year: 2019,
    price: 11200000,
    city: "Zinder",
    mileage: 74000,
    fuel: "Diesel",
    gearbox: "Manuelle",
    phone: "+227 91 55 66 77",
    description: "SUV familial, entretien régulier, idéal pour route et ville.",
    sellerId: "demo@autoligne.ne",
    sellerName: "Auto Ligne Niger",
    photo: ""
  }
];

function ensureRuntimeState() {
  fs.mkdirSync(STATE_ROOT, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    if (fs.existsSync(SOURCE_DATA_FILE)) {
      fs.copyFileSync(SOURCE_DATA_FILE, DATA_FILE);
    } else {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], cars: SAMPLE_CARS }, null, 2), "utf8");
    }
  }
}

function normalizeCarStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["active", "pending", "hidden"].includes(status) ? status : "active";
}

function hashPassword(password, salt) {
  const passwordBuffer = Buffer.from(String(password || ""), "utf8");
  const saltBuffer = salt || crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(passwordBuffer, saltBuffer, 210000, 32, "sha256");
  return {
    passwordHash: hash.toString("base64"),
    passwordSalt: saltBuffer.toString("base64")
  };
}

function migratePasswordRecord(user) {
  if (user.passwordHash && user.passwordSalt) return;
  if (!user.password) return;

  const hashed = hashPassword(user.password);
  user.passwordHash = hashed.passwordHash;
  user.passwordSalt = hashed.passwordSalt;
  user.password = "";
}

function verifyPassword(user, password) {
  migratePasswordRecord(user);
  if (user.passwordHash && user.passwordSalt) {
    const hashed = hashPassword(password, Buffer.from(user.passwordSalt, "base64"));
    return crypto.timingSafeEqual(
      Buffer.from(user.passwordHash, "base64"),
      Buffer.from(hashed.passwordHash, "base64")
    );
  }

  return String(user.password || "") === String(password || "");
}

function isStrongPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 10 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function resolveRole(user) {
  const email = String(user.email || "").trim().toLowerCase();
  if (email === DEFAULT_USER.email) return "system";
  if (ADMIN_EMAILS.has(email)) return "admin";
  if (["admin", "seller", "system"].includes(String(user.role || "").trim().toLowerCase())) {
    return String(user.role).trim().toLowerCase();
  }
  return "seller";
}

function cleanPhotos(value, fallback = "") {
  if (Array.isArray(value)) {
    return value.map((photo) => String(photo || "").trim()).filter(Boolean);
  }
  if (fallback) return [String(fallback).trim()];
  return [];
}

function ensureDefaultUser(data) {
  const users = Array.isArray(data.users) ? data.users : [];
  if (!users.some((user) => user.email === DEFAULT_USER.email)) {
    users.unshift({ ...DEFAULT_USER });
  }

  users.forEach((user) => {
    migratePasswordRecord(user);
    user.role = resolveRole(user);
    user.blocked = Boolean(user.blocked);
  });

  data.users = users;
  data.cars = (Array.isArray(data.cars) ? data.cars : SAMPLE_CARS).map((car) => {
    const photos = cleanPhotos(car.photos, car.photo);
    return {
      ...car,
      photos,
      photo: photos[0] || "",
      status: normalizeCarStatus(car.status)
    };
  });

  return data;
}

function readData() {
  ensureRuntimeState();
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    parsed = { users: [], cars: SAMPLE_CARS };
  }

  const normalized = ensureDefaultUser({
    users: Array.isArray(parsed.users) ? parsed.users : [],
    cars: Array.isArray(parsed.cars) ? parsed.cars : SAMPLE_CARS
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function writeData(data) {
  ensureRuntimeState();
  fs.writeFileSync(DATA_FILE, JSON.stringify(ensureDefaultUser(data), null, 2), "utf8");
}

function findUser(users, email) {
  const target = String(email || "").trim().toLowerCase();
  return users.find((user) => String(user.email || "").trim().toLowerCase() === target);
}

function publicUser(user) {
  return {
    email: user.email || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    fullName: user.fullName || "",
    role: resolveRole(user),
    blocked: Boolean(user.blocked)
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signTokenPayload(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createSessionToken(user) {
  const payload = JSON.stringify({
    email: user.email,
    role: resolveRole(user),
    exp: Date.now() + SESSION_TTL_MS,
    key: String(user.passwordHash || "").slice(0, 24)
  });
  const encoded = base64UrlEncode(payload);
  return `${encoded}.${signTokenPayload(encoded)}`;
}

function verifySessionToken(token, data) {
  if (!token || !String(token).includes(".")) return null;
  const [encoded, signature] = String(token).split(".");
  const expected = signTokenPayload(encoded);
  if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return null;
  }

  if (!payload.email || Number(payload.exp || 0) < Date.now()) return null;
  const user = findUser(data.users, payload.email);
  if (!user) return null;
  if (String(user.passwordHash || "").slice(0, 24) !== String(payload.key || "")) return null;
  return user;
}

function getRequester(req, data) {
  const token = req.headers["x-session-token"];
  return verifySessionToken(token, data);
}

function adminStats(data) {
  const users = data.users || [];
  const cars = data.cars || [];
  return {
    totalUsers: users.filter((user) => resolveRole(user) !== "system").length,
    blockedUsers: users.filter((user) => user.blocked).length,
    totalCars: cars.length,
    activeCars: cars.filter((car) => normalizeCarStatus(car.status) === "active").length,
    pendingCars: cars.filter((car) => normalizeCarStatus(car.status) === "pending").length,
    hiddenCars: cars.filter((car) => normalizeCarStatus(car.status) === "hidden").length
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit = 30_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload trop grand"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req);
  try {
    return JSON.parse(body.length ? body.toString("utf8") : "{}");
  } catch {
    throw new Error("Données invalides.");
  }
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function safeRootPath(baseDir, pathname) {
  const target = path.resolve(baseDir, "." + pathname);
  return target.startsWith(baseDir) ? target : null;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);

  let filePath;
  if (pathname.startsWith("/uploads/")) {
    filePath = safeRootPath(UPLOADS_DIR, pathname.replace("/uploads", ""));
  } else {
    filePath = safeRootPath(ROOT, pathname);
  }

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Fichier introuvable");
    return;
  }

  res.writeHead(200, { "Content-Type": guessContentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const data = readData();

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, { cars: data.cars });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/state") {
    const requester = getRequester(req, data) || findUser(data.users, url.searchParams.get("requesterId"));
    if (!requester || resolveRole(requester) !== "admin") {
      sendJson(res, 403, { error: "Accès administrateur requis." });
      return;
    }

    sendJson(res, 200, {
      users: data.users.filter((user) => resolveRole(user) !== "system").map(publicUser),
      cars: data.cars,
      stats: adminStats(data)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/upload") {
    const length = Number(req.headers["content-length"] || 0);
    if (length <= 0) {
      sendJson(res, 400, { error: "Aucune photo reçue." });
      return;
    }
    if (length > 40_000_000) {
      sendJson(res, 413, { error: "Photo trop lourde." });
      return;
    }

    ensureRuntimeState();
    const body = await readBody(req, 40_000_000);
    const contentType = String(req.headers["content-type"] || "image/jpeg").split(";")[0];
    const extension = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif"
    }[contentType] || ".jpg";
    const fileName = `${crypto.randomUUID()}${extension}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, body);
    sendJson(res, 200, { url: `/uploads/${fileName}` });
    return;
  }

  const body = await readJson(req);

  if (req.method === "POST" && url.pathname === "/api/register") {
    const email = String(body.email || "").trim().toLowerCase();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const password = String(body.password || "");
    const fullName = `${firstName} ${lastName}`.trim();

    if (!email || !firstName || !lastName || !password) {
      sendJson(res, 400, { error: "Nom, prénom, email et mot de passe sont obligatoires." });
      return;
    }
    if (!isStrongPassword(password)) {
      sendJson(res, 400, { error: "Le mot de passe doit contenir au moins 10 caractères avec majuscule, minuscule et chiffre." });
      return;
    }
    if (data.users.some((user) => user.email === email)) {
      sendJson(res, 409, { error: "Cet email existe déjà. Connectez-vous avec ce compte." });
      return;
    }

    const user = {
      email,
      firstName,
      lastName,
      fullName,
      password: "",
      role: "seller",
      blocked: false,
      ...hashPassword(password)
    };
    data.users.push(user);
    writeData(data);
    sendJson(res, 200, { user: publicUser(user), token: createSessionToken(user), cars: data.cars });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = data.users.find((item) => item.email === email && verifyPassword(item, password));

    if (!user) {
      sendJson(res, 401, { error: "Email ou mot de passe incorrect." });
      return;
    }
    if (user.blocked) {
      sendJson(res, 403, { error: "Ce compte a été bloqué par l’administrateur." });
      return;
    }

    writeData(data);
    sendJson(res, 200, { user: publicUser(user), token: createSessionToken(user), cars: data.cars });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cars") {
    const user = getRequester(req, data) || findUser(data.users, body.sellerId);
    if (!user) {
      sendJson(res, 401, { error: "Utilisateur non connecté." });
      return;
    }
    if (resolveRole(user) === "system") {
      sendJson(res, 403, { error: "Ce compte ne peut pas publier d’annonce." });
      return;
    }
    if (user.blocked) {
      sendJson(res, 403, { error: "Ce compte est bloqué." });
      return;
    }

    const photos = cleanPhotos(body.photos, body.photo);
    const defaultStatus = resolveRole(user) === "admin" ? "active" : "pending";
    const car = {
      id: crypto.randomUUID(),
      brand: body.brand || "",
      model: body.model || "",
      price: Number(body.price || 0),
      city: body.city || "",
      gearbox: body.gearbox || "",
      phone: body.phone || "",
      description: body.description || "",
      photos,
      photo: photos[0] || "",
      status: normalizeCarStatus(body.status || defaultStatus),
      sellerId: user.email,
      sellerName: user.fullName || user.email
    };
    data.cars.unshift(car);
    writeData(data);
    sendJson(res, 200, { cars: data.cars, car });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/cars/")) {
    const requester = getRequester(req, data) || findUser(data.users, body.requesterId || body.sellerId);
    if (!requester) {
      sendJson(res, 401, { error: "Utilisateur non connecté." });
      return;
    }
    if (requester.blocked) {
      sendJson(res, 403, { error: "Ce compte est bloqué." });
      return;
    }

    const carId = decodeURIComponent(url.pathname.replace("/api/cars/", ""));
    const index = data.cars.findIndex((car) => car.id === carId);
    if (index === -1) {
      sendJson(res, 404, { error: "Annonce introuvable." });
      return;
    }

    const current = data.cars[index];
    if (resolveRole(requester) !== "admin" && current.sellerId !== requester.email) {
      sendJson(res, 403, { error: "Vous ne pouvez pas modifier cette annonce." });
      return;
    }

    const photos = Object.prototype.hasOwnProperty.call(body, "photos")
      ? cleanPhotos(body.photos, body.photo)
      : cleanPhotos(current.photos, current.photo);

    data.cars[index] = {
      ...current,
      brand: body.brand || "",
      model: body.model || "",
      price: Number(body.price || 0),
      city: body.city || "",
      gearbox: body.gearbox || "",
      phone: body.phone || "",
      description: body.description || "",
      photos,
      photo: photos[0] || "",
      status: normalizeCarStatus(body.status || current.status)
    };

    writeData(data);
    sendJson(res, 200, { cars: data.cars, car: data.cars[index] });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/cars/")) {
    const requester = getRequester(req, data) || findUser(data.users, url.searchParams.get("requesterId"));
    if (!requester) {
      sendJson(res, 401, { error: "Utilisateur non connecté." });
      return;
    }
    if (requester.blocked) {
      sendJson(res, 403, { error: "Ce compte est bloqué." });
      return;
    }

    const carId = decodeURIComponent(url.pathname.replace("/api/cars/", ""));
    const target = data.cars.find((car) => car.id === carId);
    if (!target) {
      sendJson(res, 404, { error: "Annonce introuvable." });
      return;
    }
    if (resolveRole(requester) !== "admin" && target.sellerId !== requester.email) {
      sendJson(res, 403, { error: "Vous ne pouvez pas supprimer cette annonce." });
      return;
    }

    data.cars = data.cars.filter((car) => car.id !== carId);
    writeData(data);
    sendJson(res, 200, { cars: data.cars });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/admin/password") {
    const requester = getRequester(req, data) || findUser(data.users, body.requesterId);
    if (!requester || resolveRole(requester) !== "admin") {
      sendJson(res, 403, { error: "Accès administrateur requis." });
      return;
    }
    if (!verifyPassword(requester, body.currentPassword || "")) {
      sendJson(res, 400, { error: "Le mot de passe actuel est incorrect." });
      return;
    }
    if (String(body.newPassword || "") !== String(body.confirmPassword || "")) {
      sendJson(res, 400, { error: "La confirmation du nouveau mot de passe ne correspond pas." });
      return;
    }
    if (!isStrongPassword(body.newPassword || "")) {
      sendJson(res, 400, { error: "Le nouveau mot de passe doit contenir au moins 10 caractères avec majuscule, minuscule et chiffre." });
      return;
    }

    requester.password = "";
    Object.assign(requester, hashPassword(body.newPassword));
    writeData(data);
    sendJson(res, 200, { message: "Mot de passe administrateur mis à jour." });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/admin/users/")) {
    const requester = getRequester(req, data) || findUser(data.users, body.requesterId);
    if (!requester || resolveRole(requester) !== "admin") {
      sendJson(res, 403, { error: "Accès administrateur requis." });
      return;
    }

    const targetEmail = decodeURIComponent(url.pathname.replace("/api/admin/users/", "")).trim().toLowerCase();
    const targetUser = findUser(data.users, targetEmail);
    if (!targetUser || resolveRole(targetUser) === "system") {
      sendJson(res, 404, { error: "Utilisateur introuvable." });
      return;
    }

    const action = String(body.action || "").trim().toLowerCase();
    if (action === "block") targetUser.blocked = true;
    else if (action === "unblock") targetUser.blocked = false;
    else if (action === "make-admin") targetUser.role = "admin";
    else if (action === "make-seller") targetUser.role = "seller";
    else {
      sendJson(res, 400, { error: "Action administrateur inconnue." });
      return;
    }

    writeData(data);
    sendJson(res, 200, {
      users: data.users.filter((user) => resolveRole(user) !== "system").map(publicUser),
      stats: adminStats(data)
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/admin/users/")) {
    const requester = getRequester(req, data) || findUser(data.users, url.searchParams.get("requesterId"));
    if (!requester || resolveRole(requester) !== "admin") {
      sendJson(res, 403, { error: "Accès administrateur requis." });
      return;
    }

    const targetEmail = decodeURIComponent(url.pathname.replace("/api/admin/users/", "")).trim().toLowerCase();
    const targetUser = findUser(data.users, targetEmail);
    if (!targetUser || resolveRole(targetUser) === "system") {
      sendJson(res, 404, { error: "Utilisateur introuvable." });
      return;
    }
    if (targetUser.email === requester.email) {
      sendJson(res, 400, { error: "Vous ne pouvez pas supprimer votre propre compte administrateur." });
      return;
    }

    data.users = data.users.filter((user) => user.email !== targetEmail);
    data.cars = data.cars.filter((car) => car.sellerId !== targetEmail);
    writeData(data);
    sendJson(res, 200, {
      users: data.users.filter((user) => resolveRole(user) !== "system").map(publicUser),
      cars: data.cars,
      stats: adminStats(data)
    });
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/admin/cars/") && url.pathname.endsWith("/status")) {
    const requester = getRequester(req, data) || findUser(data.users, body.requesterId);
    if (!requester || resolveRole(requester) !== "admin") {
      sendJson(res, 403, { error: "Accès administrateur requis." });
      return;
    }

    const carId = decodeURIComponent(url.pathname.replace("/api/admin/cars/", "").replace("/status", ""));
    const car = data.cars.find((item) => item.id === carId);
    if (!car) {
      sendJson(res, 404, { error: "Annonce introuvable." });
      return;
    }

    car.status = normalizeCarStatus(body.status);
    writeData(data);
    sendJson(res, 200, { cars: data.cars, stats: adminStats(data) });
    return;
  }

  sendJson(res, 404, { error: "API introuvable." });
}

async function requestHandler(req, res) {
  try {
    if ((req.url || "").startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur serveur." });
  }
}

module.exports = requestHandler;

if (!IS_VERCEL) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`Auto Ligne Niger: http://0.0.0.0:${PORT}`);
  });
}
