"""
V4 veritabanındaki raporları yeni uygulamanın ilk açılışta yükleyeceği JSON'a çevirir.
Gerçek DB salt okunur açılır. Görseller (image_binary) alınmaz.

Kullanım: V4/.venv/Scripts/python scripts/export_v4.py
"""
import json
import math
import os
import re
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DB = os.path.join(ROOT, "..", "V4", "patron_db.sqlite")
OUT = os.path.join(ROOT, "public", "seed", "v4.json")



US = re.compile(r"^-?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$")
TR_DECIMAL = re.compile(r"^-?\d+,\d+$")
TR_FULL = re.compile(r"^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$")
TR_THOUSANDS = re.compile(r"^-?\d{1,3}(?:\.\d{3})+$")


def num(v, integer=False):
    """Uygulamadaki parseCell ile aynı kural: önce ABD biçimi, okunamazsa açıkça Türkçe olanlar."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        f = float(v)
    else:
        s = str(v).strip().replace("$", "").replace(" ", "")
        if s.endswith("%"):
            s = s[:-1]
        if integer and TR_THOUSANDS.match(s):
            f = float(s.replace(".", ""))
        elif US.match(s) and s not in ("", "-"):
            f = float(s.replace(",", ""))
        elif TR_DECIMAL.match(s) or TR_FULL.match(s):
            f = float(s.replace(".", "").replace(",", "."))
        else:
            return None
    # V4'te bazı hücrelerde "nan" yazıyor; JSON'da geçersiz olduğu için boş sayılır
    return f if math.isfinite(f) else None


def txt(v):
    return "" if v is None else str(v).strip()


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    reports = []
    for r in con.execute("select * from raporlar order by tarih, marka"):
        products = []
        for p in con.execute("select * from urunler where rapor_id=?", (r["id"],)):
            d = txt(p["display_order"])
            products.append({
                "asin": txt(p["asin"]).upper(),
                "title": txt(p["urun_adi"]),
                "brandRaw": txt(p["marka"]),
                "category": txt(p["kategori"]) or "Tanımlanmamış",
                "displayOrder": d,
                "url": txt(p["url"]),
                "imageUrl": txt(p["resim_url"]),
                "price": num(p["fiyat"]),
                "sales": num(p["satis_adedi"], True),
                "revenue": num(p["ciro"]),
                "parentSales": num(p["parent_sales"], True),
                "parentRevenue": num(p["parent_revenue"]),
                "recentPurchases": num(p["recent_purchases"]),
                "parentTrend": num(p["parent_trend"]),
                "asinTrend": num(p["asin_trend"]),
                "bsr": num(p["bsr"], True),
                "fees": num(p["fees"]),
                "fba": txt(p["fba"]),
                "fbm": txt(p["fbm"]),
                "fbaSellers": num(p["fba_sellers"], True),
                "fbmSellers": num(p["fbm_sellers"], True),
                "weight": num(p["weight"]),
                "salesRankPct": num(p["sales_rank"]),
                "sellerCountry": txt(p["seller_country"]),
                "reviews": num(p["review_count"], True),
                "rating": num(p["ratings"]),
                "variationCount": num(p["variation_count"], True),
                "bsrTopCategory": txt(p["bsr_top_category"]),
                "creationDate": txt(p["creation_date"]),
                "sponsored": txt(p["sponsored"]),
                "bestSeller": txt(p["best_seller"]),
                "sellerAge": num(p["seller_age"]),
                "seller": txt(p["seller"]),
            })
        reports.append({
            "fileName": txt(r["dosya_adi"]),
            "date": txt(r["tarih"]),
            "brand": txt(r["marka"]),
            "v4Total": r["toplam_ciro"],
            "products": products,
        })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "reports": reports}, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(OUT, len(reports), "rapor", sum(len(r["products"]) for r in reports), "ürün", os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
