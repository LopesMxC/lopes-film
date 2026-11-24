#!/usr/bin/env python3
"""Gera brands/<marca>/icon.png (1024), icon.ico e icon.icns a partir do desenho de cada marca.
Uso: python3 brands/make-icons.py [global lopes]   (a marca 'verkz' usa os arquivos já existentes)"""
import json, struct, subprocess, sys, io
from pathlib import Path
from PIL import Image
root = Path(__file__).parent

def svg_for(b):
    ic, m = b['icon'], b['mark']
    defs = f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{ic["bg1"]}"/><stop offset="1" stop-color="{ic["bg2"]}"/></linearGradient></defs>'
    bg = '<rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>'
    if ic['kind'] == 'globe':
        s = 600 / 100
        g = f'<g transform="translate({512-300} {512-300}) scale({s})" color="{ic["fg"]}">{m["svg"]}</g>'
        ring = '<rect x="64" y="64" width="896" height="896" rx="200" fill="none" stroke="#6f90ff" stroke-opacity=".35" stroke-width="6"/>'
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{defs}{bg}{ring}{g}</svg>'
    # LS: ícone largo, centrado, com a barra carmesim embaixo
    w = 600; s = w / m['w']; h = m['h'] * s
    g = f'<g transform="translate({(1024-w)/2} {(1024-h)/2-24}) scale({s})" color="{ic["fg"]}">{m["svg"]}</g>'
    bar = f'<rect x="{(1024-w)/2}" y="{(1024-h)/2-24+h+44}" width="{w*0.22}" height="14" fill="{ic["bar"]}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{defs}{bg}{g}{bar}</svg>'

def icns(png):
    chunks = b''
    for typ, size in ((b'ic07',128),(b'ic08',256),(b'ic09',512),(b'ic10',1024)):
        buf = io.BytesIO(); png.resize((size,size), Image.LANCZOS).save(buf,'PNG'); d = buf.getvalue()
        chunks += typ + struct.pack('>I', len(d)+8) + d
    return b'icns' + struct.pack('>I', len(chunks)+8) + chunks

for name in (sys.argv[1:] or ['global','lopes']):
    b = json.loads((root/name/'brand.json').read_text())
    svg = root/name/'icon.svg'; svg.write_text(svg_for(b))
    out = root/name/'icon.png'
    subprocess.run(['rsvg-convert','-w','1024','-h','1024',str(svg),'-o',str(out)],check=True)
    png = Image.open(out).convert('RGBA')
    png.save(root/name/'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
    (root/name/'icon.icns').write_bytes(icns(png))
    png.resize((256,256), Image.LANCZOS).save(out)  # o PNG da janela: 256 px
    print(name, 'ok')
