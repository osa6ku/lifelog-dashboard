#!/usr/bin/env python3
"""
ライフログ_日記DB の複数写真（I列・J列・K列）を撮影日時（Resources/*.json の date）
または journal_images の作成日時をキーに新しい順（降順）へ並べ替えて GAS API 経由で一括更新するスクリプト。
"""
import datetime
import json
import os
import re
import subprocess
import urllib.request

SPREADSHEET_ID = "1_UnbcNhxtEkV7vLagxreIeyELbY3NBLU5bS8pp4YQ1A"
GAS_URL = "https://script.google.com/macros/s/AKfycbxLecFd_9FWeR-2w2ThU5SYS7es-0IVKODoLWYgDJGfsoiQzsSRF9IFMAhtZTPl17CDKw/exec"
RESOURCES_DIR = "/Users/osamuku/Library/CloudStorage/GoogleDrive-kamepapa@gmail.com/マイドライブ/50_ライフログ/90_移行元アーカイブ・バックアップ/日記/Resources"
IMAGES_DIR = "/Users/osamuku/Library/CloudStorage/GoogleDrive-kamepapa@gmail.com/マイドライブ/50_ライフログ/journal_images"
APPLE_EPOCH = 978307200


def get_photo_timestamp(date_str: str, jpg_name: str, orig_idx: int) -> tuple:
    m = re.match(r"^\d{4}-\d{2}-\d{2}_([0-9A-Fa-f-]+)\.", jpg_name)
    if m:
        uuid = m.group(1)
        jpath = os.path.join(RESOURCES_DIR, f"{uuid}.json")
        if os.path.exists(jpath):
            try:
                data = json.load(open(jpath))
                if "date" in data and data["date"]:
                    return (float(data["date"]) + APPLE_EPOCH, orig_idx, "exif_json")
            except Exception:
                pass
    ym = date_str[:7]
    ipath = os.path.join(IMAGES_DIR, ym, jpg_name)
    if os.path.exists(ipath):
        st = os.stat(ipath)
        return (float(st.st_mtime), orig_idx, "file_mtime")
    return (0.0, orig_idx, "none")


def main():
    raw = subprocess.check_output(
        ["gsheets", "readonly", "read", SPREADSHEET_ID, "日記DB!A1:K1000", "--json"],
        text=True,
    )
    rows = json.loads(raw)
    updates = []
    sample_20261116 = None

    for i in range(1, len(rows)):
        r = rows[i]
        if len(r) < 10:
            continue
        date_str = str(r[1] or "")[:10]
        names = [x.strip() for x in str(r[8] or "").split("\n") if x.strip()]
        urls = [x.strip() for x in str(r[9] or "").split("\n") if x.strip()]
        if len(names) <= 1 or len(names) != len(urls):
            continue

        items = []
        for idx, (nm, url) in enumerate(zip(names, urls)):
            ts, oi, src = get_photo_timestamp(date_str, nm, idx)
            items.append((ts, oi, src, nm, url))

        sorted_items = sorted(items, key=lambda x: (x[0], x[1]), reverse=True)
        new_names = [x[3] for x in sorted_items]
        new_urls = [x[4] for x in sorted_items]

        if date_str == "2026-11-16":
            sample_20261116 = [
                (datetime.datetime.fromtimestamp(x[0], datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M:%S"), x[2], x[3])
                for x in sorted_items
            ]

        if new_names == names and new_urls == urls:
            continue

        row_num = i + 1
        first_m = re.search(r"/d/([^/]+)", new_urls[0])
        formula = f'=IMAGE("https://drive.google.com/uc?export=view&id={first_m.group(1)}")' if first_m else ""
        updates.append({
            "row": row_num,
            "names": "\n".join(new_names),
            "urls": "\n".join(new_urls),
            "formula": formula,
        })

    print(f"Rows needing photo sort update: {len(updates)}")
    if updates:
        req = urllib.request.Request(
            GAS_URL,
            data=json.dumps({"action": "batchSortDiaryPhotos", "payload": {"updates": updates}}).encode(),
            headers={"Content-Type": "text/plain;charset=utf-8"},
        )
        res = json.loads(urllib.request.urlopen(req).read().decode())
        print("Batch update result:", res)

    if sample_20261116:
        print("2026-11-16 (15 photos) sorted order (newest -> oldest):")
        for idx, it in enumerate(sample_20261116, 1):
            print(f"  {idx:2d}. {it[0]} [{it[1]}] {it[2]}")


if __name__ == "__main__":
    main()
