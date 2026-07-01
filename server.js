const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.json");

const sampleCars = [
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

function createEmptyData() {
  return { users: [], cars: sampleCars };
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const data = createEmptyData();
    writeData(data);
    return data;
  }

  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      users: Array.isArray(data.users) ? data.users : [],
      cars: Array.isArray(data.cars) ? data.cars : sampleCars
    };
  } catch {
    return createEmptyData();
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sanitizeUser(user) {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15_000_000) {
        reject(new Error("Payload trop grand"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
  });
}

function isSafeStaticPath(filePath) {
  return filePath.startsWith(ROOT);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.join(ROOT, pathname);

  if (!isSafeStaticPath(filePath)) {
    res.writeHead(403);
    res.end("Accès refusé");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Fichier introuvable");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".css" ? "text/css; charset=utf-8" :
      ext === ".js" ? "application/javascript; charset=utf-8" :
      ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
      ext === ".png" ? "image/png" :
      "application/octet-stream";

    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const data = readData();
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, { cars: data.cars });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const password = String(body.password || "");
    const fullName = `${firstName} ${lastName}`.trim();

    if (!email || !firstName || !lastName || !password) {
      sendJson(res, 400, { error: "Nom, prénom, email et mot de passe sont obligatoires." });
      return;
    }

    if (data.users.some((user) => user.email === email)) {
      sendJson(res, 409, { error: "Cet email existe déjà. Connectez-vous avec ce compte." });
      return;
    }

    const user = { email, firstName, lastName, fullName, password };
    data.users.push(user);
    writeData(data);
    sendJson(res, 200, { user: sanitizeUser(user), cars: data.cars });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = data.users.find((item) => item.email === email && item.password === password);

    if (!user) {
      sendJson(res, 401, { error: "Email ou mot de passe incorrect." });
      return;
    }

    sendJson(res, 200, { user: sanitizeUser(user), cars: data.cars });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cars") {
    const body = await readBody(req);
    const sellerId = String(body.sellerId || "").trim().toLowerCase();
    const user = data.users.find((item) => item.email === sellerId);

    if (!user) {
      sendJson(res, 401, { error: "Utilisateur non connecté." });
      return;
    }

    const car = {
      id: crypto.randomUUID(),
      brand: body.brand,
      model: body.model,
      year: Number(body.year),
      price: Number(body.price),
      city: body.city,
      mileage: Number(body.mileage),
      fuel: body.fuel,
      gearbox: body.gearbox,
      phone: body.phone,
      description: body.description,
      photo: body.photo || "",
      sellerId: user.email,
      sellerName: user.fullName || user.email
    };

    data.cars.unshift(car);
    writeData(data);
    sendJson(res, 200, { cars: data.cars, car });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/cars/")) {
    const carId = decodeURIComponent(url.pathname.replace("/api/cars/", ""));
    const body = await readBody(req);
    const sellerId = String(body.sellerId || "").trim().toLowerCase();
    const index = data.cars.findIndex((car) => car.id === carId && car.sellerId === sellerId);

    if (index === -1) {
      sendJson(res, 404, { error: "Annonce introuvable pour cet utilisateur." });
      return;
    }

    data.cars[index] = {
      ...data.cars[index],
      brand: body.brand,
      model: body.model,
      year: Number(body.year),
      price: Number(body.price),
      city: body.city,
      mileage: Number(body.mileage),
      fuel: body.fuel,
      gearbox: body.gearbox,
      phone: body.phone,
      description: body.description,
      photo: body.photo || data.cars[index].photo || ""
    };

    writeData(data);
    sendJson(res, 200, { cars: data.cars, car: data.cars[index] });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/cars/")) {
    const carId = decodeURIComponent(url.pathname.replace("/api/cars/", ""));
    const sellerId = String(url.searchParams.get("sellerId") || "").trim().toLowerCase();
    const before = data.cars.length;
    data.cars = data.cars.filter((car) => !(car.id === carId && car.sellerId === sellerId));

    if (data.cars.length === before) {
      sendJson(res, 404, { error: "Annonce introuvable pour cet utilisateur." });
      return;
    }

    writeData(data);
    sendJson(res, 200, { cars: data.cars });
    return;
  }

  sendJson(res, 404, { error: "API introuvable." });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur serveur." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Auto Ligne Niger: http://0.0.0.0:${PORT}`);
});
