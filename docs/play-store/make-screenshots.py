"""
Play Store screenshots: frames raw phone screenshots with a caption on the Talkel background.

    python3 docs/play-store/make-screenshots.py <raw-dir> [out-dir]

<raw-dir> holds phone screenshots named after the keys in CAPTIONS (e.g. home.png, call.jpg).
Output: 1080x1920 RGB PNGs (Play: 9:16, no transparency), numbered in CAPTIONS order.
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# Order = order on the Play Store. The first two matter most: they show in search results.
CAPTIONS = [
    ('home', 'Speak English on a real call', 'Practise with an AI partner who listens and replies'),
    ('call', 'Talk, don’t tap', 'Natural back-and-forth, just like a phone call'),
    ('topic', 'Practise your own situation', 'Describe it in English, Hindi or Hinglish'),
    ('feedback', 'Know exactly what to fix', 'Grammar, words and fluency — in English or Hindi'),
    ('missions', 'Missions with real pressure', 'Get the job, negotiate your raise, and more'),
    ('progress', 'Watch yourself improve', 'Scores, streaks and progress over time'),
]

W, H = 1080, 1920
TOP, BOTTOM = (14, 17, 40), (8, 46, 72)  # the feature graphic's indigo -> teal


def font(size, weight):
    path = glob.glob(os.path.join(ROOT, 'node_modules/.pnpm/next@*/node_modules/next/dist/next-devtools/server/font/geist-latin.woff2'))
    if not path:
        return ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf', size)
    f = ImageFont.truetype(path[0], size)
    f.set_variation_by_name(weight)
    return f


def background():
    bg = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W * 0.15, H * 0.3, W * 0.85, H * 0.8), fill=(60, 110, 255, 90))
    return Image.alpha_composite(bg.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(120)))


def centred(d, y, text, f, fill, max_w):
    """Draws text centred, wrapping to a second line if needed. Returns the y below it."""
    words, lines, line = text.split(), [], ''
    for w in words:
        trial = f'{line} {w}'.strip()
        if d.textlength(trial, font=f) > max_w and line:
            lines.append(line)
            line = w
        else:
            line = trial
    lines.append(line)
    for ln in lines:
        d.text(((W - d.textlength(ln, font=f)) / 2, y), ln, font=f, fill=fill)
        y += int(f.size * 1.2)
    return y


def frame(shot_path, title, subtitle):
    img = background()
    d = ImageDraw.Draw(img)
    y = centred(d, 110, title, font(76, 'Bold'), (255, 255, 255), W - 140)
    y = centred(d, y + 18, subtitle, font(38, 'Medium'), (175, 230, 240), W - 160)

    shot = Image.open(shot_path).convert('RGB')
    top = y + 70
    target_h = H - top + 60  # runs off the bottom edge, like a phone rising into view
    scale = min(target_h / shot.height, (W - 200) / shot.width)
    shot = shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.LANCZOS)
    x = (W - shot.width) // 2
    r = 48
    mask = Image.new('L', shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), r, fill=255)

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - 6, top + 14, x + shot.width + 6, top + shot.height + 30), r, fill=(0, 0, 0, 150))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(28)))
    bezel = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(bezel).rounded_rectangle((x - 14, top - 14, x + shot.width + 14, top + shot.height + 14), r + 12, fill=(24, 28, 40, 255))
    img = Image.alpha_composite(img, bezel)
    img.paste(shot, (x, top), mask)
    return img.convert('RGB')


def main():
    raw = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'screenshots')
    os.makedirs(out, exist_ok=True)
    n = 0
    for key, title, subtitle in CAPTIONS:
        found = [p for p in glob.glob(os.path.join(raw, key + '.*')) if p.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
        if not found:
            print(f'skip {key}: no {key}.png/.jpg in {raw}')
            continue
        n += 1
        path = os.path.join(out, f'{n:02d}-{key}.png')
        frame(found[0], title, subtitle).save(path, optimize=True)
        print('wrote', path)


if __name__ == '__main__':
    main()
