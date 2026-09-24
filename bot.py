#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mini app boutique + bot Telegram pour Railway."""

import json
import os
from threading import Lock

import requests
from flask import Flask, jsonify, request, send_from_directory

BOT_TOKEN = os.environ.get("BOT_TOKEN")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else ""
CANAL_URL = "https://t.me/+AoIVMLnchiODFk"
CONTACT_URL = "https://snapchat.com/add/Uzi5959"
PRODUCTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "products.json")
products_lock = Lock()


def build_mini_app_url():
    mini_app_url = os.environ.get("MINI_APP_URL") or os.environ.get("RAILWAY_PUBLIC_DOMAIN") or ""
    if not mini_app_url:
        return "https://web-producon-fa8677.up.railway.app"
    if not mini_app_url.startswith("http://") and not mini_app_url.startswith("https://"):
        return "https://" + mini_app_url
    return mini_app_url.rstrip("/")


MINI_APP_URL = build_mini_app_url()
app = Flask(__name__, static_url_path="", static_folder=".")


def send_message(chat_id, text, reply_markup=None):
    if not BOT_TOKEN:
        return None
    data = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if reply_markup:
        data["reply_markup"] = reply_markup
    try:
        response = requests.post(f"{TELEGRAM_API_URL}/sendMessage", json=data, timeout=15)
        return response.json()
    except Exception as exc:
        print(f"Erreur envoi message: {exc}")
        return None


def send_photo(chat_id, caption, reply_markup=None):
    if not BOT_TOKEN:
        return None
    data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
    if reply_markup:
        data["reply_markup"] = reply_markup

    logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo.png")

    try:
        with open(logo_path, "rb") as photo:
            files = {"photo": photo}
            response = requests.post(f"{TELEGRAM_API_URL}/sendPhoto", files=files, data=data, timeout=15)
            return response.json()
    except FileNotFoundError:
        return send_message(chat_id, caption, reply_markup)
    except Exception as exc:
        print(f"Erreur envoi photo: {exc}")
        return send_message(chat_id, caption, reply_markup)


def handle_start(chat_id):
    caption = """🌟 BIENVENUE CHEZ Uzi5959 🌟
NOUS TE LAISSONS NAVIGUER SUR NOTRE MINI-APP 📱
🔥 Produits Premium - 59-62 🔥"""

    reply_markup = {
        "inline_keyboard": [
            [{"text": "📢 CANAL TELEGRAM ↗", "url": CANAL_URL}],
            [{"text": "📸 SNAPCHAT ↗", "url": CONTACT_URL}],
            [{"text": "📱 MENU MINI-APP", "web_app": {"url": MINI_APP_URL}}],
        ]
    }

    result = send_photo(chat_id, caption, json.dumps(reply_markup))
    if not result or not result.get("ok"):
        send_message(chat_id, f"🌟 **BIENVENUE CHEZ Uzi5959** 🌟\n\n{caption}", json.dumps(reply_markup))


def handle_message(update):
    message = update.get("message", {})
    chat_id = message.get("chat", {}).get("id")
    text = message.get("text", "")

    if not chat_id or not text:
        return

    if text == "/start":
        handle_start(chat_id)
    else:
        send_message(chat_id, "Utilisez /start pour accéder à la mini-app Uzi5959 🌿")


def set_webhook(webhook_url):
    if not BOT_TOKEN:
        print("BOT_TOKEN non défini, webhook non configuré.")
        return False
    try:
        response = requests.post(f"{TELEGRAM_API_URL}/setWebhook", json={"url": webhook_url}, timeout=15)
        result = response.json()
        if result.get("ok"):
            print(f"✅ Webhook configuré: {webhook_url}")
            return True
        print(f"❌ Erreur webhook: {result}")
        return False
    except Exception as exc:
        print(f"Erreur configuration webhook: {exc}")
        return False


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "mini-app-shop"})


def read_products():
    try:
        with open(PRODUCTS_FILE, "r", encoding="utf-8") as products_file:
            products = json.load(products_file)
        return products if isinstance(products, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_products(products):
    temporary_file = f"{PRODUCTS_FILE}.tmp"
    with open(temporary_file, "w", encoding="utf-8") as products_file:
        json.dump(products, products_file, ensure_ascii=False)
    os.replace(temporary_file, PRODUCTS_FILE)


@app.get("/api/products")
def products():
    with products_lock:
        return jsonify(read_products())


@app.post("/api/products")
def save_product():
    product = request.get_json(silent=True)
    if not isinstance(product, dict) or not product.get("nom"):
        return jsonify({"error": "Produit invalide"}), 400

    with products_lock:
        stored_products = read_products()
        product_id = product.get("id")
        matching_index = next(
            (index for index, item in enumerate(stored_products) if item.get("id") == product_id),
            None,
        )
        if matching_index is None:
            stored_products.insert(0, product)
        else:
            stored_products[matching_index] = product
        write_products(stored_products)
    return jsonify(product)


@app.delete("/api/products/<int:product_id>")
def delete_product(product_id):
    with products_lock:
        stored_products = read_products()
        updated_products = [item for item in stored_products if item.get("id") != product_id]
        write_products(updated_products)
    return jsonify({"ok": True})


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/<path:path>")
def static_files(path):
    safe_path = os.path.join(app.static_folder, path)
    if os.path.exists(safe_path) and not os.path.isdir(safe_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


@app.post("/webhook")
def webhook():
    payload = request.get_json(silent=True) or {}
    handle_message(payload)
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    webhook_url = os.environ.get("WEBHOOK_URL") or os.environ.get("RAILWAY_PUBLIC_DOMAIN")
    if webhook_url and not webhook_url.startswith("http"):
        webhook_url = "https://" + webhook_url
    if webhook_url:
        set_webhook(f"{webhook_url.rstrip('/')}/webhook")
    app.run(host="0.0.0.0", port=port, debug=False)
