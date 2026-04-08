"""
Import a *saved* Fragrantica perfume HTML file into FragranceCatalog (SQLite).

BeautifulSoup only parses HTML — it does not defeat Cloudflare. Free workflow:
  1) Open the perfume page in your browser (while logged in if needed).
  2) Save as: Web Page, HTML only (or Complete).
  3) Run:
       pip install -r requirements-scrape.txt
       python scripts/scrape_fragrantica_bs4.py --file path/to/page.html

Optional: --url https://... if the file has no <link rel="canonical"> or og:url.

Database: uses DATABASE_URL from .env (see env.example; shared DB is file:../data/shared.db).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Install dependencies: pip install -r requirements-scrape.txt", file=sys.stderr)
    raise SystemExit(1)


def load_dotenv() -> None:
    env_path = Path.cwd() / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "=" not in s:
            continue
        k, _, v = s.partition("=")
        k = k.strip()
        v = v.strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        if k and k not in os.environ:
            os.environ[k] = v


def db_path_from_env() -> Path:
    raw = os.environ.get("DATABASE_URL", "file:../data/shared.db").strip()
    if raw.startswith("file:"):
        p = raw[5:].lstrip("/")
        if os.name == "nt" and re.match(r"^[A-Za-z]:", p):
            return Path(p).resolve()
        # Paths like ../data/shared.db are relative to repo root (cwd when script is run from project root)
        return (Path.cwd() / p).resolve()
    raise SystemExit("Only sqlite file: URLs are supported for this script.")


def extract_json_ld(soup: BeautifulSoup) -> list[dict]:
    out: list[dict] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        out.append(item)
            elif isinstance(data, dict):
                out.append(data)
        except json.JSONDecodeError:
            continue
    return out


def from_json_ld(blocks: list[dict]) -> tuple[str, str, str]:
    for obj in blocks:
        t = obj.get("@type")
        typ = t if isinstance(t, str) else (str(t[0]) if isinstance(t, list) and t else "")
        if typ.lower() != "product":
            continue
        name = obj.get("name", "")
        name = name.strip() if isinstance(name, str) else ""
        brand = ""
        br = obj.get("brand")
        if isinstance(br, str):
            brand = br.strip()
        elif isinstance(br, dict) and isinstance(br.get("name"), str):
            brand = br["name"].strip()
        img = obj.get("image")
        image_url = ""
        if isinstance(img, str):
            image_url = img.strip()
        elif isinstance(img, list) and img and isinstance(img[0], str):
            image_url = img[0].strip()
        return name, brand, image_url
    return "", "", ""


def extract_canonical(soup: BeautifulSoup) -> str | None:
    link = soup.select_one('link[rel="canonical"]')
    if link and link.get("href"):
        h = link["href"].strip()
        if h.startswith("http"):
            return h
    og = soup.find("meta", property="og:url")
    if og and og.get("content"):
        c = og["content"].strip()
        if c.startswith("http"):
            return c
    return None


def normalize_fragrantica_url(url: str) -> str:
    u = url.strip()
    if "fragrantica." not in u.lower():
        raise ValueError("NOT_FRAGRANTICA")
    if "/perfume/" not in u:
        raise ValueError("NOT_PERFUME_URL")
    return u.split("#", 1)[0].rstrip("/")


def scrape(html: str, fragrantica_url: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    name, brand, image_url = from_json_ld(extract_json_ld(soup))

    og_title = ""
    og_img = ""
    ot = soup.find("meta", property="og:title")
    if ot and ot.get("content"):
        og_title = ot["content"].strip()
    oi = soup.find("meta", property="og:image")
    if oi and oi.get("content"):
        og_img = oi["content"].strip()

    title_tag = soup.title
    doc_title = title_tag.get_text(strip=True) if title_tag else ""

    if not image_url and og_img:
        image_url = og_img

    if (not name or not brand) and (og_title or doc_title):
        t = (og_title or doc_title).replace("\n", " ")
        t = re.sub(r"\s+", " ", t).strip()
        low = t.lower()
        idx = low.rfind(" by ")
        if idx > 0:
            left = t[:idx].strip()
            right = t[idx + 4 :].strip()
            if not name:
                name = left
            if not brand:
                brand = right
        elif not name:
            name = t

    notes = ""
    cell = soup.select_one(".cell.text-left")
    if cell:
        notes = re.sub(r"\s+", " ", cell.get_text(" ", strip=True))[:2000]

    name = name.strip()
    brand = brand.strip()
    if not name or not brand:
        raise ValueError("SCRAPE_FAILED_MISSING_NAME_OR_BRAND")

    return {
        "name": name,
        "brand": brand,
        "notes": notes,
        "fragranticaUrl": fragrantica_url,
        "imageUrl": image_url.strip(),
        "tags": "[]",
    }


def upsert_fragrance_catalog(conn: sqlite3.Connection, row: dict[str, str]) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    cur = conn.execute(
        'SELECT id FROM FragranceCatalog WHERE "fragranticaUrl" = ?',
        (row["fragranticaUrl"],),
    )
    existing = cur.fetchone()
    if existing:
        conn.execute(
            """UPDATE FragranceCatalog SET "name"=?, "brand"=?, "notes"=?, "tags"=?, "imageUrl"=?, "updatedAt"=?
               WHERE "fragranticaUrl"=?""",
            (
                row["name"],
                row["brand"],
                row["notes"],
                row["tags"],
                row["imageUrl"],
                now,
                row["fragranticaUrl"],
            ),
        )
    else:
        rid = "py_" + secrets.token_hex(12)
        conn.execute(
            """INSERT INTO FragranceCatalog ("id","name","brand","tags","notes","fragranticaUrl","imageUrl","createdAt","updatedAt")
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                rid,
                row["name"],
                row["brand"],
                row["tags"],
                row["notes"],
                row["fragranticaUrl"],
                row["imageUrl"],
                now,
                now,
            ),
        )


def main() -> None:
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="Path to saved HTML")
    ap.add_argument("--url", help="Canonical Fragrantica perfume URL if missing from HTML")
    ap.add_argument("--db", help="Override path to SQLite file (default: DATABASE_URL)")
    args = ap.parse_args()

    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        print("File not found:", path, file=sys.stderr)
        raise SystemExit(1)

    html = path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    url_raw = args.url or extract_canonical(soup)
    if not url_raw:
        print(
            "No URL in HTML (canonical/og:url). Pass --url https://www.fragrantica.com/perfume/...",
            file=sys.stderr,
        )
        raise SystemExit(1)

    try:
        canonical = normalize_fragrantica_url(url_raw)
    except ValueError as e:
        print("Invalid perfume URL:", e, file=sys.stderr)
        raise SystemExit(1)

    row = scrape(html, canonical)

    dbp = Path(args.db).resolve() if args.db else db_path_from_env()
    if not dbp.is_file():
        print("Database not found:", dbp, "(run: npx prisma db push)", file=sys.stderr)
        raise SystemExit(1)

    conn = sqlite3.connect(str(dbp))
    try:
        upsert_fragrance_catalog(conn, row)
        conn.commit()
    finally:
        conn.close()

    print("Upserted FragranceCatalog:", row["name"], "|", row["brand"], "|", row["fragranticaUrl"])


if __name__ == "__main__":
    main()
