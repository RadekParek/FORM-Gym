"""Generate FORM launcher and splash assets with Pillow: python scripts/generate-icons.py."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
RESOURCES = ROOT / "android" / "app" / "src" / "main" / "res"
BACKGROUND = "#111713"
FOREGROUND = "#F2F5EE"
ACCENT = "#8FE8CF"


def draw_mark(draw, scale, offset=(0, 0), monochrome=False):
    """A simple F monogram, wholly inside Android's adaptive-icon safe region."""
    x, y = offset
    boxes = [((31, 27, 42, 81), FOREGROUND), ((42, 27, 79, 38), ACCENT), ((42, 49, 69, 59), FOREGROUND)]
    for box, color in boxes:
        draw.rectangle(tuple((x if index % 2 == 0 else y) + value * scale for index, value in enumerate(box)), fill=FOREGROUND if monochrome else color)


def icon(size, foreground=False, circular=False):
    resolution = size * 4
    image = Image.new("RGBA", (resolution, resolution), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if not foreground:
        if circular:
            draw.ellipse((0, 0, resolution - 1, resolution - 1), fill=BACKGROUND)
        else:
            draw.rounded_rectangle((0, 0, resolution - 1, resolution - 1), radius=resolution * 0.10, fill=BACKGROUND)
    draw_mark(draw, resolution / 108)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def vector(monochrome=False):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="{FOREGROUND}" android:pathData="M31,27H42V81H31Z"/>
    <path android:fillColor="{FOREGROUND if monochrome else ACCENT}" android:pathData="M42,27H79V38H42Z"/>
    <path android:fillColor="{FOREGROUND}" android:pathData="M42,49H69V59H42Z"/>
</vector>
'''


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    image = icon(512)
    image.save(PUBLIC / "icon.png")
    image.save(PUBLIC / "icon.ico", sizes=[(size, size) for size in [16, 24, 32, 48, 64, 128, 256]])
    (PUBLIC / "icon.svg").write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><rect width="108" height="108" rx="11" fill="{BACKGROUND}"/><path d="M31 27H42V81H31Z M42 49H69V59H42Z" fill="{FOREGROUND}"/><path d="M42 27H79V38H42Z" fill="{ACCENT}"/></svg>\n''', encoding="utf-8")

    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for density, scale in densities.items():
        folder = RESOURCES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        icon(round(48 * scale)).save(folder / "ic_launcher.png")
        icon(round(48 * scale), circular=True).save(folder / "ic_launcher_round.png")
        icon(round(108 * scale), foreground=True).save(folder / "ic_launcher_foreground.png")

    for folder in ["drawable", "drawable-v24"]:
        (RESOURCES / folder / "ic_launcher_foreground.xml").write_text(vector(), encoding="utf-8")
    (RESOURCES / "drawable" / "ic_launcher_monochrome.xml").write_text(vector(monochrome=True), encoding="utf-8")
    (RESOURCES / "drawable" / "ic_launcher_background.xml").write_text('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/ic_launcher_background"/></shape>
''', encoding="utf-8")

    for folder, monochrome in [("mipmap-anydpi-v26", False), ("mipmap-anydpi-v33", True)]:
        destination = RESOURCES / folder
        destination.mkdir(parents=True, exist_ok=True)
        content = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
'''
        if monochrome:
            content += '    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n'
        content += '</adaptive-icon>\n'
        for filename in ["ic_launcher.xml", "ic_launcher_round.xml"]:
            (destination / filename).write_text(content, encoding="utf-8")

    for splash in RESOURCES.glob("drawable*/splash.png"):
        with Image.open(splash) as old:
            width, height = old.size
        image = Image.new("RGB", (width, height), BACKGROUND)
        mark_size = round(min(width, height) * 0.24)
        mark = icon(mark_size, foreground=True)
        image.paste(mark, ((width - mark_size) // 2, (height - mark_size) // 2), mark)
        image.save(splash)
    print("Generated FORM Windows/Android icons, adaptive vectors, monochrome icon, and dark splash assets.")


if __name__ == "__main__":
    main()
