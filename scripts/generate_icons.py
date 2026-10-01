# Rigenera le icone dell'app (icon, adaptive icon, splash, favicon) in assets/.
# Uso, dalla root del progetto:  pip install pillow && python scripts/generate_icons.py
# I colori sono gli stessi di src/theme.js: se cambi tema, aggiornali anche qui.
from PIL import Image, ImageDraw
import math

# Palette coerente con src/theme.js
PRIMARY = (91, 140, 255)      # #5B8CFF
PRIMARY_DIM = (46, 62, 99)    # #2E3E63
BG_DARK = (15, 17, 21)        # #0F1115
WHITE = (244, 246, 249)       # colors.text

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def make_lens_icon(size, bg_mode="gradient", padding_ratio=0.0, bg_color=None, with_badge=False):
    """Disegna un'icona: lente/obiettivo fotocamera con un piccolo accento
    a V (richiamo discreto alla 'penna'), stile flat, semplice."""
    S = size
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(S * padding_ratio)
    inner = S - 2 * pad

    # Sfondo: quadrato arrotondato con gradiente diagonale primary -> primaryDim,
    # oppure nessuno sfondo (per adaptive icon foreground, trasparente),
    # oppure tinta unica (per adaptive icon background).
    if bg_mode == "gradient":
        corner_r = int(S * 0.22)
        grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        gd = grad.load()
        for y in range(S):
            for x in range(S):
                t = (x + y) / (2 * S)
                gd[x, y] = lerp(PRIMARY, PRIMARY_DIM, t) + (255,)
        mask = Image.new("L", (S, S), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, S-1, S-1], radius=corner_r, fill=255)
        img.paste(grad, (0, 0), mask)
    elif bg_mode == "solid":
        draw.rectangle([0, 0, S, S], fill=bg_color + (255,))
    # bg_mode == "none": resta trasparente (adaptive icon foreground)

    cx, cy = S // 2, S // 2 + (int(S*0.01) if bg_mode != "none" else 0)

    # Obiettivo fotografico: cerchio esterno bianco (anello), cerchio
    # interno blu scuro (lente), piccolo riflesso. Design semplice, poche
    # forme, leggibile anche piccolo.
    outer_r = inner * 0.34
    draw.ellipse(
        [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
        fill=WHITE + (255,)
    )

    mid_r = outer_r * 0.74
    draw.ellipse(
        [cx - mid_r, cy - mid_r, cx + mid_r, cy + mid_r],
        fill=PRIMARY_DIM + (255,)
    )

    inner_r = outer_r * 0.40
    draw.ellipse(
        [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
        fill=BG_DARK + (255,)
    )

    # Riflesso (piccolo arco chiaro in alto a sinistra della lente)
    hi_r = outer_r * 0.14
    hi_cx = cx - mid_r * 0.42
    hi_cy = cy - mid_r * 0.42
    draw.ellipse(
        [hi_cx - hi_r, hi_cy - hi_r, hi_cx + hi_r, hi_cy + hi_r],
        fill=WHITE + (230,)
    )

    # Piccolo accento "scatto/flash" in alto a destra del badge: un
    # triangolo/freccia stilizzata che richiama uno scatto istantaneo,
    # mantenendo il design comunque minimale (una sola forma accento).
    accent_r = outer_r * 0.30
    acx = cx + outer_r * 1.05
    acy = cy - outer_r * 1.05
    if bg_mode != "none" or with_badge:
        draw.ellipse(
            [acx - accent_r, acy - accent_r, acx + accent_r, acy + accent_r],
            fill=WHITE + (255,)
        )
        bolt_r = accent_r * 0.55
        draw.polygon(
            [
                (acx - bolt_r*0.25, acy - bolt_r),
                (acx + bolt_r*0.5, acy - bolt_r*0.15),
                (acx + bolt_r*0.05, acy - bolt_r*0.15),
                (acx + bolt_r*0.25, acy + bolt_r),
                (acx - bolt_r*0.5, acy + bolt_r*0.15),
                (acx - bolt_r*0.05, acy + bolt_r*0.15),
            ],
            fill=PRIMARY_DIM + (255,)
        )

    return img

# 1. Icona principale (con sfondo, bordi arrotondati già nel disegno -
#    Expo/Android applicano comunque la propria maschera, ma un'icona con
#    bg pieno square funziona ovunque incl. iOS/web/store listing)
icon = make_lens_icon(1024, bg_mode="gradient", padding_ratio=0.0)
# icon.png vuole sfondo pieno (non trasparente) per compatibilità store:
flat_bg = Image.new("RGB", (1024, 1024), PRIMARY_DIM)
flat_bg.paste(icon, (0, 0), icon)
flat_bg.save("assets/icon.png")

# 2. Adaptive icon Android: foreground trasparente (contenuto centrato in
#    zona sicura ~66%) + background separato a tinta unita.
fg = make_lens_icon(1024, bg_mode="none", padding_ratio=0.27, with_badge=True)
fg.save("assets/adaptive-icon-foreground.png")

adaptive_bg = Image.new("RGB", (1024, 1024))
abg = adaptive_bg.load()
for y in range(1024):
    for x in range(1024):
        abg[x, y] = lerp(PRIMARY, PRIMARY_DIM, (x + y) / 2048)
adaptive_bg.save("assets/adaptive-icon-background.png")

# 3. Splash: stessa icona centrata su sfondo scuro coerente col tema app
#    (colors.bg), dimensione moderata (non a schermo intero) come da
#    convenzione Expo splash.
splash_size = 1242
splash = Image.new("RGB", (splash_size, splash_size), BG_DARK)
icon_on_splash = make_lens_icon(420, bg_mode="gradient", padding_ratio=0.0)
sx = (splash_size - 420) // 2
sy = (splash_size - 420) // 2
splash.paste(icon_on_splash, (sx, sy), icon_on_splash)
splash.save("assets/splash.png")

# 4. Favicon per eventuale target web (Expo lo richiede se platforms include web)
favicon = flat_bg.resize((196, 196), Image.LANCZOS)
favicon.save("assets/favicon.png")

print("Icone generate con successo")
