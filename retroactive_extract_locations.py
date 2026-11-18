#!/usr/bin/env python3
"""
3-25: iOSジャーナル生データ（Entries/*.html & Resources/*.json）から
位置情報・座標データ（visits配列 / placeName）を遡及抽出し、
ライフログ_日記DB の「場所・位置情報」列および「位置情報JSON」列へ統合するスクリプト。
・既存のアプリ編集済み行・座標設定済み行は上書きせず保護する。
・Googleドキュメント（日記アーカイブ_YYYY）の再同期は走らせない。
"""
import json
import os
import re
import subprocess
import unicodedata
import urllib.request

SPREADSHEET_ID = "1_UnbcNhxtEkV7vLagxreIeyELbY3NBLU5bS8pp4YQ1A"
GAS_URL = "https://script.google.com/macros/s/AKfycbxLecFd_9FWeR-2w2ThU5SYS7es-0IVKODoLWYgDJGfsoiQzsSRF9IFMAhtZTPl17CDKw/exec"
BASE_DIR = "/Users/osamuku/Library/CloudStorage/GoogleDrive-kamepapa@gmail.com/マイドライブ/50_ライフログ/90_移行元アーカイブ・バックアップ/日記"
ENTRIES_DIR = os.path.join(BASE_DIR, "Entries")
RESOURCES_DIR = os.path.join(BASE_DIR, "Resources")


def find_html_path(html_name: str) -> str:
    if not html_name:
        return ""
    for norm in (html_name, unicodedata.normalize("NFC", html_name), unicodedata.normalize("NFD", html_name)):
        p = os.path.join(ENTRIES_DIR, norm)
        if os.path.exists(p):
            return p
    return ""


def extract_locations_from_html(html_path: str) -> list:
    txt = open(html_path, encoding="utf-8", errors="ignore").read()
    # HTML内のリソースUUID（multiPinMapのidやResources/UUID.*）を出現順に抽出
    uuids = []
    seen_u = set()
    for m in re.finditer(r'(?:Resources/|id=["\'])([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})', txt):
        u = m.group(1).upper()
        if u not in seen_u:
            seen_u.add(u)
            uuids.append(u)

    pattern_a = []  # visits（詳細座標あり）
    pattern_b = []  # placeNameのみ

    for u in uuids:
        jpath = os.path.join(RESOURCES_DIR, f"{u}.json")
        if not os.path.exists(jpath):
            continue
        try:
            data = json.load(open(jpath, encoding="utf-8"))
        except Exception:
            continue

        if "visits" in data and isinstance(data["visits"], list):
            for v in data["visits"]:
                name = str(v.get("placeName") or "").strip()
                lat = v.get("latitude")
                lng = v.get("longitude")
                if name:
                    pattern_a.append({
                        "name": name,
                        "lat": float(lat) if lat is not None else None,
                        "lng": float(lng) if lng is not None else None,
                    })
        elif "placeName" in data:
            name = str(data.get("placeName") or "").strip()
            if name:
                pattern_b.append({"name": name, "lat": None, "lng": None})

    # パターンA（詳細座標）があればそれを優先し、パターンBは重複しない場合・詳細がない場合のみ補完
    merged = []
    seen_names = set()
    for loc in pattern_a:
        if loc["name"] not in seen_names:
            seen_names.add(loc["name"])
            merged.append(loc)

    if not merged:
        for loc in pattern_b:
            if loc["name"] not in seen_names:
                seen_names.add(loc["name"])
                merged.append(loc)

    return merged


def main():
    raw = subprocess.check_output(
        ["gsheets", "readonly", "read", SPREADSHEET_ID, "日記DB!A1:Q1000", "--json"],
        text=True,
    )
    rows = json.loads(raw)
    headers = [str(h or "").strip() for h in rows[0]]
    loc_json_idx = headers.index("位置情報JSON") if "位置情報JSON" in headers else -1

    updates = []
    protected_skipped = 0
    total_spots = 0
    total_coord_spots = 0
    samples = []

    for i in range(1, len(rows)):
        r = rows[i]
        row_num = i + 1
        date_str = str(r[1] if len(r) > 1 else "")[:10]
        title = str(r[4] if len(r) > 4 else "")
        existing_loc = str(r[6] if len(r) > 6 else "").strip()
        src_html = str(r[12] if len(r) > 12 else "").strip()
        existing_json = str(r[loc_json_idx] if (loc_json_idx >= 0 and len(r) > loc_json_idx) else "").strip()

        # 既存保護：手動編集済み or 既に位置情報JSONあり
        if src_html.startswith("edited") or src_html == "webapp_entry" or existing_json:
            protected_skipped += 1
            continue

        hpath = find_html_path(src_html)
        if not hpath:
            continue

        extracted = extract_locations_from_html(hpath)
        if not extracted:
            continue

        # 既存のG列（場所・位置情報）がある場合は重複除外してマージ（座標付きを優先）
        final_locs = []
        seen = set()
        for loc in extracted:
            if loc["name"] not in seen:
                seen.add(loc["name"])
                final_locs.append(loc)
        if existing_loc:
            for line in [x.strip() for x in existing_loc.splitlines() if x.strip()]:
                # 既に詳細スポット名がある場合の粗い「東京都」等や完全一致は重複除外
                if line not in seen and not any(line in s for s in seen):
                    seen.add(line)
                    final_locs.append({"name": line, "lat": None, "lng": None})

        has_coords = any(l["lat"] is not None and l["lng"] is not None for l in final_locs)
        loc_text = "\n".join(l["name"] for l in final_locs)
        loc_json_str = json.dumps(final_locs, ensure_ascii=False) if has_coords else ""

        if loc_text == existing_loc and not has_coords:
            continue

        total_spots += len(final_locs)
        total_coord_spots += sum(1 for l in final_locs if l["lat"] is not None and l["lng"] is not None)
        updates.append({
            "row": row_num,
            "location": loc_text,
            "locJson": loc_json_str,
        })

        if any(k in loc_text for k in ("上野郵便局", "フレッシュネスバーガー", "玉川カントリークラブ")):
            samples.append((row_num, date_str, title, final_locs))

    print(f"Protected/skipped rows: {protected_skipped}")
    print(f"Rows to update: {len(updates)}")
    print(f"Total spots extracted: {total_spots} (with coordinates: {total_coord_spots})")

    # 100件ずつチャンク送信
    updated_total = 0
    for idx in range(0, len(updates), 100):
        chunk = updates[idx:idx + 100]
        req = urllib.request.Request(
            GAS_URL,
            data=json.dumps({"action": "batchUpdateDiaryLocations", "payload": {"updates": chunk}}).encode(),
            headers={"Content-Type": "text/plain;charset=utf-8"},
        )
        res = json.loads(urllib.request.urlopen(req).read().decode())
        updated_total += res.get("updated", 0)
        print(f"  Chunk {idx // 100 + 1}: {res}")

    print(f"Total DB rows updated: {updated_total}")
    print("Target verification samples:")
    for s in samples[:5]:
        print(" ", s)


if __name__ == "__main__":
    main()
