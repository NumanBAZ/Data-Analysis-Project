"""
Uygulama simgesini çizer (1024x1024 PNG): koyu gradyan zemin, yükselen üç çubuk
ve rakipleri inceleyen bir büyüteç. 4 kat büyük çizip küçültülür (yumuşak kenarlar).

Kullanım: python scripts/make_icon.py  ->  app-icon.png
Ardından: npx tauri icon app-icon.png
"""
import os

from PIL import Image, ImageDraw, ImageFilter

S = 4096  # çizim boyutu
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app-icon.png")


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def main():
    # Zemin: sol üstten sağ alta lacivertten mora gradyan
    bg = Image.new("RGB", (S, S))
    top, mid, bot = (30, 41, 99), (67, 56, 202), (124, 58, 237)
    px = bg.load()
    for y in range(S):
        for x in range(0, S, 4):
            t = (x + y) / (2 * S)
            c = lerp(top, mid, t * 2) if t < 0.5 else lerp(mid, bot, (t - 0.5) * 2)
            for k in range(4):
                px[x + k, y] = c

    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)

    art = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)

    # Üç çubuk: soldan sağa yükselen; ortadaki parlak (bizim marka)
    base = int(S * 0.76)
    w = int(S * 0.13)
    gap = int(S * 0.05)
    x0 = int(S * 0.20)
    heights = [0.26, 0.42, 0.34]
    colors = [(255, 255, 255, 120), (255, 255, 255, 255), (255, 255, 255, 120)]
    for i, (h, c) in enumerate(zip(heights, colors)):
        x = x0 + i * (w + gap)
        d.rounded_rectangle([x, base - int(S * h), x + w, base], radius=int(w * 0.28), fill=c)

    # Büyüteç: sağ üstte, çubukları "inceliyor"
    cx, cy, r = int(S * 0.66), int(S * 0.36), int(S * 0.15)
    ring = int(S * 0.045)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring], fill=(34, 211, 238, 110))
    art = Image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * 0.03)), art)
    d = ImageDraw.Draw(art)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(34, 211, 238, 60), outline=(255, 255, 255, 255), width=ring)
    # Sap
    hx, hy = cx + int(r * 0.72), cy + int(r * 0.72)
    d.line([hx, hy, hx + int(S * 0.13), hy + int(S * 0.13)], fill=(255, 255, 255, 255), width=int(ring * 1.25))
    d.ellipse([hx + int(S * 0.13) - ring * 0.62, hy + int(S * 0.13) - ring * 0.62, hx + int(S * 0.13) + ring * 0.62, hy + int(S * 0.13) + ring * 0.62], fill=(255, 255, 255, 255))
    # Büyüteç içinde yukarı ok
    a = int(r * 0.45)
    d.line([cx - a, cy + a * 0.5, cx - a * 0.1, cy - a * 0.3, cx + a * 0.25, cy + a * 0.05, cx + a, cy - a * 0.7], fill=(255, 255, 255, 255), width=int(ring * 0.7), joint="curve")

    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)
    icon = Image.alpha_composite(icon, Image.composite(art, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))
    icon.resize((1024, 1024), Image.LANCZOS).save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
