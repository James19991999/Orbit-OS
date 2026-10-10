#!/usr/bin/env python3
"""
Builds the app's fonts: a small Material Symbols font with only the icons OrbitOS uses, and Latin-only Geist.

The full variable font is 3.4 MB. Most pages show about a dozen icons, so this:
  1. collects icon names from src/ (string literals that are Material Symbols names);
  2. pins the weight/grade/optical-size axes to the app's settings (400 / 0 / 24), keeping FILL for filled icons;
  3. drops every ligature except the used ones, then subsets.
Output: src/app/fonts/material-symbols-subset.woff2 and src/app/fonts/icons.json (the list, used by a test).
Run after adding a new icon: python3 scripts/build-icon-font.py   (needs: pip install fonttools brotli)
"""
import glob, json, os, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'node_modules/material-symbols/material-symbols-outlined.woff2')
OUT_DIR = os.path.join(ROOT, 'src/app/fonts')

font = TTFont(SRC)
gsub = font['GSUB'].table
lig_lookup = gsub.LookupList.Lookup[[fr for fr in gsub.FeatureList.FeatureRecord if fr.FeatureTag == 'rlig'][0].Feature.LookupListIndex[0]]
cmap_rev = {g: chr(u) for u, g in font.getBestCmap().items()}

def ligature_sets(lookup):
    for st in lookup.SubTable:
        st = st.ExtSubTable if lookup.LookupType == 7 else st
        yield st

# Every icon the font can draw: name (letters) -> ligature glyph
available = {}
for st in ligature_sets(lig_lookup):
    for first, ligs in st.ligatures.items():
        for lig in ligs:
            name = cmap_rev.get(first, '') + ''.join(cmap_rev.get(c, '?') for c in lig.Component)
            available[name] = lig.LigGlyph

# Names used in the source: any quoted literal that is an icon name, plus icon="…" / name="…" props.
used = set()
for f in glob.glob(os.path.join(ROOT, 'src/**/*.ts*'), recursive=True):
    text = open(f, encoding='utf-8').read()
    used |= set(re.findall(r"""['"`]([a-z0-9_]{1,40})['"`]""", text))
used &= set(available)
extra = {'progress_activity'}  # spinner, built from CSS in some places
used |= extra & set(available)
if not used:
    sys.exit('no icons found')

# 1. Pin axes except FILL.
font = instancer.instantiateVariableFont(font, {'wght': 400, 'GRAD': 0, 'opsz': 24})
import io
buf = io.BytesIO(); font.save(buf); buf.seek(0); font = TTFont(buf)  # reload: the instancer leaves lazy tables

# 2. Keep only the used ligatures.
gsub = font['GSUB'].table
lig_lookup = gsub.LookupList.Lookup[[fr for fr in gsub.FeatureList.FeatureRecord if fr.FeatureTag == 'rlig'][0].Feature.LookupListIndex[0]]
cmap_rev = {g: chr(u) for u, g in font.getBestCmap().items()}
for st in ligature_sets(lig_lookup):
    for first in list(st.ligatures):
        keep = [l for l in st.ligatures[first]
                if cmap_rev.get(first, '') + ''.join(cmap_rev.get(c, '?') for c in l.Component) in used]
        if keep: st.ligatures[first] = keep
        else: del st.ligatures[first]

# 3. Subset to the letters + the kept icon glyphs (and their .fill variants).
glyphs = set()
for n in used:
    g = available[n]; glyphs.add(g)
    if g + '.fill' in font.getGlyphOrder(): glyphs.add(g + '.fill')
opts = subset.Options()
opts.layout_features = ['*']
opts.flavor = 'woff2'
opts.notdef_outline = True
opts.name_IDs = ['*']
s = subset.Subsetter(opts)
s.populate(text='abcdefghijklmnopqrstuvwxyz0123456789_', glyphs=sorted(glyphs))
s.subset(font)
os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, 'material-symbols-subset.woff2')
font.flavor = 'woff2'
font.save(out)
json.dump(sorted(used), open(os.path.join(OUT_DIR, 'icons.json'), 'w'), indent=0)
print(f'{len(used)} icons -> {out} ({os.path.getsize(out) // 1024} KB)')

# Geist (the UI font), subset to Latin: English, Kiswahili, French, punctuation and currency signs.
G = os.path.join(ROOT, 'node_modules/geist/dist/fonts')
LATIN = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x2000, 0x206F)) + list(range(0x20A0, 0x20C0)) + \
    [0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2713, 0x2715, 0x2026, 0x2022, 0x00D7, 0x2248, 0x2264, 0x2265]
for src, dst in [('geist-sans/Geist-Variable.woff2', 'geist-sans-latin.woff2'), ('geist-mono/GeistMono-Variable.woff2', 'geist-mono-latin.woff2')]:
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['*']; o.name_IDs = ['*']; o.notdef_outline = True
    f = TTFont(os.path.join(G, src)); sb = subset.Subsetter(o); sb.populate(unicodes=LATIN); sb.subset(f)
    f.flavor = 'woff2'; f.save(os.path.join(OUT_DIR, dst))
    print(f'{dst} ({os.path.getsize(os.path.join(OUT_DIR, dst)) // 1024} KB)')
