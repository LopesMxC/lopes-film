"""Gera o painel lateral (164x314) e o cabeçalho (150x57) do instalador de cada marca no padrão Lopes.Film
(grafite + vermelho, logo da marca, nome). Uso: python3 make-installer-art.py   (precisa de playwright e Pillow)"""
import json, pathlib, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image
HERE = pathlib.Path(__file__).parent
BRANDS = HERE.parent.parent.parent / 'brands'
FONTS = HERE.parent.parent.parent / 'lopes-updates/assets/fonts'
FALLBACK = {'bgApp': '#0a0c08', 'bgPanel': '#12150e', 'bgRaised': '#1b2014', 'border': '#272d1d', 'accent': '#b8e23c', 'logoFill': '#efede9'}
def page(b):
    t = b.get('theme') and b['theme']['dark'] or FALLBACK
    m = b['mark']; svg = f'<svg viewBox="{m["viewBox"]}" fill="{t["logoFill"]}" color="{t["logoFill"]}">{m["svg"]}</svg>'
    ar = m['w'] / m['h']; name = b['name']
    return f'''<meta charset=utf-8><style>
@font-face{{font-family:Syne;src:url({FONTS}/syne-latin-wght-normal.woff2);font-weight:400 800}}
@font-face{{font-family:Geist;src:url({FONTS}/geist-latin-wght-normal.woff2);font-weight:100 900}}
body{{margin:0}}
/* mesmo desenho dos painéis do app: card de 16 px com borda de 1 px sobre o fundo, 8 px de respiro */
#side{{width:164px;height:314px;position:relative;overflow:hidden;background:{t["bgApp"]};font-family:Geist}}
#side .c{{position:absolute;inset:8px;border-radius:16px;border:1px solid {t["border"]};background:{t["bgPanel"]}}}
#side .lg{{position:absolute;left:20px;top:28px;width:92px;height:62px;display:flex;align-items:center}}
#side .lg svg{{width:{'92px' if ar>=1.4 else 'auto'};height:{'auto' if ar>=1.4 else '56px'};max-width:92px;max-height:62px}}
#side .n{{position:absolute;left:20px;top:106px;font:700 {'22' if len(name)<11 else '19'}px Syne;color:{t["logoFill"]};line-height:1;white-space:nowrap}}
#side .l{{position:absolute;left:20px;top:140px;width:28px;height:3px;border-radius:2px;background:{t["accent"]}}}
#side .t{{position:absolute;left:20px;bottom:24px;font-size:10px;color:#9a9a9f;line-height:1.5;width:124px}}
#head{{width:150px;height:57px;background:{t["bgApp"]};position:relative;overflow:hidden;font-family:Geist}}
#head .c{{position:absolute;inset:6px 6px 6px 0;border-radius:12px;border:1px solid {t["border"]};background:{t["bgPanel"]}}}
#head .lg{{position:absolute;left:12px;top:12px;width:42px;height:33px;display:flex;align-items:center}}
#head .lg svg{{max-width:42px;max-height:33px;width:auto;height:auto}}
#head .n{{position:absolute;left:62px;top:21px;font:700 {'12' if len(name)<11 else '11'}px Syne;color:{t["logoFill"]};white-space:nowrap}}
</style>
<div id=side><div class=c></div><div class=lg>{svg}</div><div class=n>{name}</div><div class=l></div><div class=t>Editor de vídeo com IA<br>que roda no seu PC.</div></div>
<div id=head><div class=c></div><div class=lg>{svg}</div><div class=n>{name}</div></div>'''
with sync_playwright() as p, tempfile.TemporaryDirectory() as td:
    br = p.chromium.launch(); pg = br.new_page(device_scale_factor=1)
    for bid in ('lopes', 'global', 'verkz'):
        b = json.loads((BRANDS / bid / 'brand.json').read_text())
        f = pathlib.Path(td) / f'{bid}.html'; f.write_text(page(b)); pg.goto(f'file://{f}'); pg.wait_for_timeout(400)
        for el, n in (('side', 'sidebar'), ('head', 'header')):
            png = pathlib.Path(td) / f'{bid}-{n}.png'; pg.locator('#' + el).screenshot(path=str(png))
            Image.open(png).convert('RGB').save(HERE / f'installer-{bid}-{n}.bmp'); import shutil; pathlib.Path('/tmp/inst').mkdir(exist_ok=True); shutil.copy(png, f'/tmp/inst/{bid}-{n}.png')
    br.close()
