from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs
from hashlib import pbkdf2_hmac
import base64
import json
import mimetypes
import secrets
import threading
import uuid


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data.json"
UPLOADS_DIR = ROOT / "uploads"
PORT = 5174
ADMIN_EMAILS = {"alkaram.ichirif@gmail.com"}
DATA_LOCK = threading.Lock()
DEFAULT_USER = {
    "email": "auto-ligne-niger@local",
    "firstName": "Auto",
    "lastName": "Ligne Niger",
    "fullName": "Auto Ligne Niger",
    "password": "",
    "role": "system",
}

SAMPLE_CARS = [
    {
        "id": "sample-1",
        "brand": "Toyota",
        "model": "Corolla",
        "year": 2017,
        "price": 5200000,
        "city": "Niamey",
        "mileage": 91000,
        "fuel": "Essence",
        "gearbox": "Automatique",
        "phone": "+227 90 12 34 56",
        "description": "Voiture propre, climatisation, papiers à jour, prête à rouler.",
        "sellerId": "demo@autoligne.ne",
        "sellerName": "Auto Ligne Niger",
        "photo": "",
    },
    {
        "id": "sample-2",
        "brand": "Mercedes-Benz",
        "model": "C 200",
        "year": 2015,
        "price": 8500000,
        "city": "Maradi",
        "mileage": 126000,
        "fuel": "Essence",
        "gearbox": "Automatique",
        "phone": "+227 96 40 20 10",
        "description": "Bon état général, intérieur cuir, moteur très propre.",
        "sellerId": "demo@autoligne.ne",
        "sellerName": "Auto Ligne Niger",
        "photo": "",
    },
    {
        "id": "sample-3",
        "brand": "Hyundai",
        "model": "Tucson",
        "year": 2019,
        "price": 11200000,
        "city": "Zinder",
        "mileage": 74000,
        "fuel": "Diesel",
        "gearbox": "Manuelle",
        "phone": "+227 91 55 66 77",
        "description": "SUV familial, entretien régulier, idéal pour route et ville.",
        "sellerId": "demo@autoligne.ne",
        "sellerName": "Auto Ligne Niger",
        "photo": "",
    },
]


def ensure_default_user(data):
    users = data.get("users") if isinstance(data.get("users"), list) else []
    if not any(user.get("email") == DEFAULT_USER["email"] for user in users):
      users.insert(0, DEFAULT_USER.copy())

    for user in users:
        migrate_password_record(user)
        user["role"] = resolve_role(user)
        user["blocked"] = bool(user.get("blocked", False))

    data["users"] = users

    for car in data.get("cars", []):
        car["photos"] = clean_photos(car.get("photos"), car.get("photo", ""))
        car["photo"] = car["photos"][0] if car["photos"] else ""
        car["status"] = normalize_car_status(car.get("status"))

    return data


def empty_data():
    return ensure_default_user({"users": [], "cars": SAMPLE_CARS})


def read_data():
    with DATA_LOCK:
        return read_data_unlocked()


def read_data_unlocked():
    if not DATA_FILE.exists():
        data = empty_data()
        write_data_unlocked(data)
        return ensure_default_user(data)

    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        normalized = ensure_default_user(json.loads(json.dumps({
            "users": data.get("users") if isinstance(data.get("users"), list) else [],
            "cars": data.get("cars") if isinstance(data.get("cars"), list) else SAMPLE_CARS,
        })))
        if normalized != data:
            write_data_unlocked(normalized)
        return normalized
    except Exception:
        return empty_data()


def write_data(data):
    with DATA_LOCK:
        write_data_unlocked(data)


def write_data_unlocked(data):
    temp_file = DATA_FILE.with_suffix(".tmp")
    temp_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(DATA_FILE)


def ensure_uploads_dir():
    UPLOADS_DIR.mkdir(exist_ok=True)


def clean_photos(value, fallback=""):
    if isinstance(value, list):
        return [str(photo).strip() for photo in value if str(photo).strip()]

    if fallback:
        return [str(fallback).strip()]

    return []


def normalize_car_status(value):
    status = str(value or "").strip().lower()
    if status in {"active", "pending", "hidden"}:
        return status

    return "active"


def hash_password(password, salt=None):
    raw_password = str(password or "").encode("utf-8")
    salt_bytes = salt or secrets.token_bytes(16)
    derived = pbkdf2_hmac("sha256", raw_password, salt_bytes, 210000)
    return {
        "passwordHash": base64.b64encode(derived).decode("ascii"),
        "passwordSalt": base64.b64encode(salt_bytes).decode("ascii"),
    }


def migrate_password_record(user):
    if user.get("passwordHash") and user.get("passwordSalt"):
        return

    plain_password = str(user.get("password", ""))
    if not plain_password:
        return

    hashed = hash_password(plain_password)
    user["passwordHash"] = hashed["passwordHash"]
    user["passwordSalt"] = hashed["passwordSalt"]
    user["password"] = ""


def verify_password(user, password):
    migrate_password_record(user)
    stored_hash = str(user.get("passwordHash", ""))
    stored_salt = str(user.get("passwordSalt", ""))
    if stored_hash and stored_salt:
        hashed = hash_password(
            password,
            salt=base64.b64decode(stored_salt.encode("ascii"))
        )
        return secrets.compare_digest(stored_hash, hashed["passwordHash"])

    return str(user.get("password", "")) == str(password or "")


def is_strong_password(password):
    value = str(password or "")
    return (
        len(value) >= 10
        and any(char.islower() for char in value)
        and any(char.isupper() for char in value)
        and any(char.isdigit() for char in value)
    )


def resolve_role(user):
    email = str(user.get("email", "")).strip().lower()
    if email == DEFAULT_USER["email"]:
        return "system"
    if email in ADMIN_EMAILS:
        return "admin"

    role = str(user.get("role", "")).strip().lower()
    if role in {"admin", "seller", "system"}:
        return role

    return "seller"


def find_user(users, email):
    target = str(email or "").strip().lower()
    return next((item for item in users if item.get("email") == target), None)


def public_user(user):
    return {
        "email": user.get("email", ""),
        "firstName": user.get("firstName", ""),
        "lastName": user.get("lastName", ""),
        "fullName": user.get("fullName", ""),
        "role": resolve_role(user),
        "blocked": bool(user.get("blocked", False)),
    }


def admin_stats(data):
    users = data.get("users", [])
    cars = data.get("cars", [])
    return {
        "totalUsers": len([user for user in users if resolve_role(user) != "system"]),
        "blockedUsers": len([user for user in users if user.get("blocked")]),
        "totalCars": len(cars),
        "activeCars": len([car for car in cars if normalize_car_status(car.get("status")) == "active"]),
        "pendingCars": len([car for car in cars if normalize_car_status(car.get("status")) == "pending"]),
        "hiddenCars": len([car for car in cars if normalize_car_status(car.get("status")) == "hidden"]),
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 30_000_000:
            raise ValueError("Payload trop grand")
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw or "{}")

    def serve_static(self):
        parsed = urlparse(self.path)
        requested = "/index.html" if parsed.path == "/" else parsed.path
        file_path = (ROOT / unquote(requested).lstrip("/")).resolve()

        if not str(file_path).startswith(str(ROOT)) or not file_path.exists() or file_path.is_dir():
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Fichier introuvable")
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            data = read_data()
            self.send_json(200, {"cars": data["cars"]})
            return
        if parsed.path == "/api/admin/state":
            data = read_data()
            requester_id = parse_qs(parsed.query).get("requesterId", [""])[0].strip().lower()
            requester = find_user(data["users"], requester_id)
            if not requester or resolve_role(requester) != "admin":
                self.send_json(403, {"error": "Accès administrateur requis."})
                return

            users = [public_user(user) for user in data["users"] if resolve_role(user) != "system"]
            self.send_json(200, {"users": users, "cars": data["cars"], "stats": admin_stats(data)})
            return
        self.serve_static()

    def do_POST(self):
        parsed = urlparse(self.path)
        data = read_data()

        if parsed.path == "/api/upload":
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                self.send_json(400, {"error": "Aucune photo reçue."})
                return
            if length > 40_000_000:
                self.send_json(413, {"error": "Photo trop lourde."})
                return

            ensure_uploads_dir()
            content_type = self.headers.get("Content-Type", "image/jpeg").split(";")[0]
            extension = {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
                "image/gif": ".gif",
            }.get(content_type, ".jpg")
            file_name = f"{uuid.uuid4()}{extension}"
            file_path = UPLOADS_DIR / file_name
            file_path.write_bytes(self.rfile.read(length))
            self.send_json(200, {"url": f"/uploads/{file_name}"})
            return

        try:
            body = self.read_json()
        except Exception:
            self.send_json(400, {"error": "Données invalides."})
            return

        if parsed.path == "/api/register":
            email = str(body.get("email", "")).strip().lower()
            first_name = str(body.get("firstName", "")).strip()
            last_name = str(body.get("lastName", "")).strip()
            password = str(body.get("password", ""))
            full_name = f"{first_name} {last_name}".strip()

            if not email or not first_name or not last_name or not password:
                self.send_json(400, {"error": "Nom, prénom, email et mot de passe sont obligatoires."})
                return
            if not is_strong_password(password):
                self.send_json(400, {"error": "Le mot de passe doit contenir au moins 10 caractères avec majuscule, minuscule et chiffre."})
                return

            if any(user.get("email") == email for user in data["users"]):
                self.send_json(409, {"error": "Cet email existe déjà. Connectez-vous avec ce compte."})
                return

            user = {
                "email": email,
                "firstName": first_name,
                "lastName": last_name,
                "fullName": full_name,
                "password": "",
                "role": "seller",
            }
            user.update(hash_password(password))
            data["users"].append(user)
            write_data(data)
            self.send_json(200, {"user": public_user(user), "cars": data["cars"]})
            return

        if parsed.path == "/api/login":
            email = str(body.get("email", "")).strip().lower()
            password = str(body.get("password", ""))
            user = next((item for item in data["users"] if item.get("email") == email and verify_password(item, password)), None)

            if not user:
                self.send_json(401, {"error": "Email ou mot de passe incorrect."})
                return
            if user.get("blocked"):
                self.send_json(403, {"error": "Ce compte a été bloqué par l’administrateur."})
                return

            self.send_json(200, {"user": public_user(user), "cars": data["cars"]})
            return

        if parsed.path == "/api/cars":
            seller_id = str(body.get("sellerId", "")).strip().lower()
            user = find_user(data["users"], seller_id)
            if not user:
                self.send_json(401, {"error": "Utilisateur non connecté."})
                return
            if resolve_role(user) == "system":
                self.send_json(403, {"error": "Ce compte ne peut pas publier d’annonce."})
                return
            if user.get("blocked"):
                self.send_json(403, {"error": "Ce compte est bloqué."})
                return

            photos = clean_photos(body.get("photos"), body.get("photo", ""))
            default_status = "active" if resolve_role(user) == "admin" else "pending"
            car = {
                "id": str(uuid.uuid4()),
                "brand": body.get("brand", ""),
                "model": body.get("model", ""),
                "price": int(body.get("price") or 0),
                "city": body.get("city", ""),
                "gearbox": body.get("gearbox", ""),
                "phone": body.get("phone", ""),
                "description": body.get("description", ""),
                "photos": photos,
                "photo": photos[0] if photos else "",
                "status": normalize_car_status(body.get("status") or default_status),
                "sellerId": user["email"],
                "sellerName": user.get("fullName") or user["email"],
            }
            data["cars"].insert(0, car)
            write_data(data)
            self.send_json(200, {"cars": data["cars"], "car": car})
            return

        if parsed.path.startswith("/api/admin/users/"):
            requester_id = str(body.get("requesterId", "")).strip().lower()
            requester = find_user(data["users"], requester_id)
            if not requester or resolve_role(requester) != "admin":
                self.send_json(403, {"error": "Accès administrateur requis."})
                return

            target_email = unquote(parsed.path.replace("/api/admin/users/", "", 1)).strip().lower()
            target_user = find_user(data["users"], target_email)
            if not target_user or resolve_role(target_user) == "system":
                self.send_json(404, {"error": "Utilisateur introuvable."})
                return

            action = str(body.get("action", "")).strip().lower()
            if action == "block":
                target_user["blocked"] = True
            elif action == "unblock":
                target_user["blocked"] = False
            elif action == "make-admin":
                target_user["role"] = "admin"
            elif action == "make-seller":
                target_user["role"] = "seller"
            else:
                self.send_json(400, {"error": "Action administrateur inconnue."})
                return

            write_data(data)
            users = [public_user(user) for user in data["users"] if resolve_role(user) != "system"]
            self.send_json(200, {"users": users, "stats": admin_stats(data)})
            return

        if parsed.path.startswith("/api/admin/cars/") and parsed.path.endswith("/status"):
            requester_id = str(body.get("requesterId", "")).strip().lower()
            requester = find_user(data["users"], requester_id)
            if not requester or resolve_role(requester) != "admin":
                self.send_json(403, {"error": "Accès administrateur requis."})
                return

            car_id = unquote(parsed.path.replace("/api/admin/cars/", "", 1).replace("/status", ""))
            car = next((item for item in data["cars"] if item.get("id") == car_id), None)
            if not car:
                self.send_json(404, {"error": "Annonce introuvable."})
                return

            car["status"] = normalize_car_status(body.get("status"))
            write_data(data)
            self.send_json(200, {"cars": data["cars"], "stats": admin_stats(data)})
            return

        self.send_json(404, {"error": "API introuvable."})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/cars/"):
            self.send_json(404, {"error": "API introuvable."})
            return

        data = read_data()
        body = self.read_json()
        car_id = unquote(parsed.path.replace("/api/cars/", "", 1))
        requester_id = str(body.get("requesterId") or body.get("sellerId") or "").strip().lower()
        requester = find_user(data["users"], requester_id)
        if not requester:
            self.send_json(401, {"error": "Utilisateur non connecté."})
            return
        if requester.get("blocked"):
            self.send_json(403, {"error": "Ce compte est bloqué."})
            return

        index = next((i for i, car in enumerate(data["cars"]) if car.get("id") == car_id), -1)
        if index == -1:
            self.send_json(404, {"error": "Annonce introuvable."})
            return

        current = data["cars"][index]
        if resolve_role(requester) != "admin" and current.get("sellerId") != requester["email"]:
            self.send_json(403, {"error": "Vous ne pouvez pas modifier cette annonce."})
            return

        current_photos = clean_photos(current.get("photos"), current.get("photo", ""))
        photos = clean_photos(body.get("photos"), body.get("photo", "")) if "photos" in body else current_photos
        current.update({
            "brand": body.get("brand", ""),
            "model": body.get("model", ""),
            "price": int(body.get("price") or 0),
            "city": body.get("city", ""),
            "gearbox": body.get("gearbox", ""),
            "phone": body.get("phone", ""),
            "description": body.get("description", ""),
            "photos": photos,
            "photo": photos[0] if photos else "",
            "status": normalize_car_status(body.get("status", current.get("status"))),
        })
        write_data(data)
        self.send_json(200, {"cars": data["cars"], "car": current})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/admin/users/"):
            data = read_data()
            requester_id = parse_qs(parsed.query).get("requesterId", [""])[0].strip().lower()
            requester = find_user(data["users"], requester_id)
            if not requester or resolve_role(requester) != "admin":
                self.send_json(403, {"error": "Accès administrateur requis."})
                return

            target_email = unquote(parsed.path.replace("/api/admin/users/", "", 1)).strip().lower()
            target_user = find_user(data["users"], target_email)
            if not target_user or resolve_role(target_user) == "system":
                self.send_json(404, {"error": "Utilisateur introuvable."})
                return
            if target_user.get("email") == requester.get("email"):
                self.send_json(400, {"error": "Vous ne pouvez pas supprimer votre propre compte administrateur."})
                return

            data["users"] = [user for user in data["users"] if user.get("email") != target_email]
            data["cars"] = [car for car in data["cars"] if car.get("sellerId") != target_email]
            write_data(data)
            users = [public_user(user) for user in data["users"] if resolve_role(user) != "system"]
            self.send_json(200, {"users": users, "cars": data["cars"], "stats": admin_stats(data)})
            return

        if not parsed.path.startswith("/api/cars/"):
            self.send_json(404, {"error": "API introuvable."})
            return

        data = read_data()
        car_id = unquote(parsed.path.replace("/api/cars/", "", 1))
        requester_id = parse_qs(parsed.query).get("requesterId", [""])[0].strip().lower()
        requester = find_user(data["users"], requester_id)
        if not requester:
            self.send_json(401, {"error": "Utilisateur non connecté."})
            return
        if requester.get("blocked"):
            self.send_json(403, {"error": "Ce compte est bloqué."})
            return

        target = next((car for car in data["cars"] if car.get("id") == car_id), None)
        if not target:
            self.send_json(404, {"error": "Annonce introuvable."})
            return
        if resolve_role(requester) != "admin" and target.get("sellerId") != requester["email"]:
            self.send_json(403, {"error": "Vous ne pouvez pas supprimer cette annonce."})
            return

        data["cars"] = [car for car in data["cars"] if car.get("id") != car_id]
        write_data(data)
        self.send_json(200, {"cars": data["cars"]})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/admin/password":
            data = read_data()
            body = self.read_json()
            requester_id = str(body.get("requesterId", "")).strip().lower()
            requester = find_user(data["users"], requester_id)
            if not requester or resolve_role(requester) != "admin":
                self.send_json(403, {"error": "Accès administrateur requis."})
                return

            current_password = str(body.get("currentPassword", ""))
            new_password = str(body.get("newPassword", ""))
            confirm_password = str(body.get("confirmPassword", ""))

            if not verify_password(requester, current_password):
                self.send_json(400, {"error": "Le mot de passe actuel est incorrect."})
                return
            if new_password != confirm_password:
                self.send_json(400, {"error": "La confirmation du nouveau mot de passe ne correspond pas."})
                return
            if not is_strong_password(new_password):
                self.send_json(400, {"error": "Le nouveau mot de passe doit contenir au moins 10 caractères avec majuscule, minuscule et chiffre."})
                return

            requester["password"] = ""
            requester.update(hash_password(new_password))
            write_data(data)
            self.send_json(200, {"message": "Mot de passe administrateur mis à jour."})
            return

        if not parsed.path.startswith("/api/admin/users/"):
            self.send_json(404, {"error": "API introuvable."})
            return

        data = read_data()
        body = self.read_json()
        requester_id = str(body.get("requesterId", "")).strip().lower()
        requester = find_user(data["users"], requester_id)
        if not requester or resolve_role(requester) != "admin":
            self.send_json(403, {"error": "Accès administrateur requis."})
            return

        target_email = unquote(parsed.path.replace("/api/admin/users/", "", 1)).strip().lower()
        target_user = find_user(data["users"], target_email)
        if not target_user or resolve_role(target_user) == "system":
            self.send_json(404, {"error": "Utilisateur introuvable."})
            return

        action = str(body.get("action", "")).strip().lower()
        if action == "block":
            target_user["blocked"] = True
        elif action == "unblock":
            target_user["blocked"] = False
        elif action == "make-admin":
            target_user["role"] = "admin"
        elif action == "make-seller":
            target_user["role"] = "seller"
        else:
            self.send_json(400, {"error": "Action administrateur inconnue."})
            return

        write_data(data)
        users = [public_user(user) for user in data["users"] if resolve_role(user) != "system"]
        self.send_json(200, {"users": users, "stats": admin_stats(data)})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Auto Ligne Niger: http://0.0.0.0:{PORT}")
    server.serve_forever()
