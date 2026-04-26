#!/usr/bin/env python3
"""
Generate a favicon set (svg + png + ico) from a single uppercase letter.

Usage:
    python3 generate_favicon.py --letter B --output ~/project/webchat/assets-bezos
    python3 generate_favicon.py --letter M --output ~/project/webchat/assets-musk

Output files in <output>/:
    favicon.svg
    favicon.ico
    favicon-16.png
    favicon-32.png
    favicon-48.png
    favicon-180.png
    favicon-256.png

Style: navy background (#1A2332) + gold serif letter (#D4A843)
This matches the buffett-letters-eir.pages.dev visual system.

Requirements: Pillow (`pip install Pillow`)
"""

import argparse
import os
import sys
from pathlib import Path


NAVY = (26, 35, 50, 255)      # #1A2332
GOLD = (212, 168, 67, 255)    # #D4A843


def find_serif_font():
    """Find a serif font on the system, preferring Georgia."""
    candidates = [
        '/System/Library/Fonts/Supplemental/Georgia.ttf',
        '/System/Library/Fonts/Times.ttc',
        '/Library/Fonts/Georgia.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',  # Linux
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def generate_png(letter, font_path, size=256):
    """Generate a single PNG favicon at the given size."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    radius = int(size * 0.22)
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=NAVY)

    # Load font
    if font_path:
        font_size = int(size * 0.65)
        font = ImageFont.truetype(font_path, font_size)
    else:
        font = ImageFont.load_default()

    # Center the letter
    bbox = draw.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1] - int(size * 0.02)
    draw.text((x, y), letter, font=font, fill=GOLD)

    return img


def generate_svg(letter):
    """Generate the SVG favicon (smallest, scales infinitely)."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1A2332"/>
  <text x="32" y="46" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="900" text-anchor="middle" fill="#D4A843">{letter}</text>
</svg>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--letter', required=True,
                        help='Single uppercase letter (e.g. B, M, C)')
    parser.add_argument('--output', required=True,
                        help='Output directory (will be created if missing)')
    args = parser.parse_args()

    letter = args.letter.strip()
    if len(letter) != 1:
        print(f"Error: --letter must be exactly one character, got '{letter}'", file=sys.stderr)
        sys.exit(1)
    letter = letter.upper()

    out_dir = Path(args.output).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Try to import PIL
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Error: Pillow is required. Install with: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    # Find a font
    font_path = find_serif_font()
    if font_path is None:
        print("Warning: no serif font found, using default font (will look ugly)", file=sys.stderr)

    # Generate the master 256px PNG
    master = generate_png(letter, font_path, 256)

    # Save sized variants
    sizes = {
        'favicon-16.png': 16,
        'favicon-32.png': 32,
        'favicon-48.png': 48,
        'favicon-180.png': 180,
        'favicon-256.png': 256,
    }
    for filename, size in sizes.items():
        if size == 256:
            master.save(out_dir / filename)
        else:
            master.resize((size, size), Image.LANCZOS).save(out_dir / filename)
        print(f"  Wrote {out_dir / filename}")

    # ICO (multi-size)
    master.save(out_dir / 'favicon.ico', format='ICO',
                sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  Wrote {out_dir / 'favicon.ico'}")

    # SVG
    (out_dir / 'favicon.svg').write_text(generate_svg(letter))
    print(f"  Wrote {out_dir / 'favicon.svg'}")

    print(f"\n✓ Favicon set generated for letter '{letter}' in {out_dir}")
    print(f"  Reference these in your HTML <head>:")
    print(f'    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">')
    print(f'    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">')
    print(f'    <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png">')
    print(f'    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon-180.png">')
    print(f'    <link rel="shortcut icon" href="/assets/favicon.ico">')


if __name__ == '__main__':
    main()
