#!/usr/bin/env python3
"""Compute mean luminance of PNG screenshots (Python stdlib only — no Pillow needed)."""
import sys, struct, zlib

def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
    return a if pa<=pb and pa<=pc else (b if pb<=pc else c)

def png_mean_luminance(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', "not a PNG"
    width = height = channels = 0
    idats = []
    off = 8
    while off < len(data) - 12:
        n = struct.unpack_from('>I', data, off)[0]
        t = data[off+4:off+8]
        d = data[off+8:off+8+n]
        if t == b'IHDR':
            width, height = struct.unpack_from('>II', d)
            color_type = d[9]
            channels = {0:1, 2:3, 3:1, 4:2, 6:4}.get(color_type, 3)
        elif t == b'IDAT':
            idats.append(d)
        elif t == b'IEND':
            break
        off += 12 + n
    raw = zlib.decompress(b''.join(idats))
    bpp = channels  # bytes per pixel (8-bit assumed)
    stride = width * bpp + 1
    prev = bytearray(width * bpp)
    total = 0.0
    count = 0
    for y in range(height):
        f = raw[y * stride]
        row_raw = raw[y*stride+1 : y*stride+1+width*bpp]
        row = bytearray(width * bpp)
        for i in range(width * bpp):
            a = row[i-bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i-bpp] if i >= bpp else 0
            x = row_raw[i]
            if   f == 0: row[i] = x & 0xff
            elif f == 1: row[i] = (x + a) & 0xff
            elif f == 2: row[i] = (x + b) & 0xff
            elif f == 3: row[i] = (x + ((a+b)>>1)) & 0xff
            elif f == 4: row[i] = (x + paeth(a,b,c)) & 0xff
        prev = row
        for x in range(width):
            px = x * bpp
            r, g, bl = row[px], row[px+1] if bpp>1 else row[px], row[px+2] if bpp>2 else row[px]
            total += 0.299*r + 0.587*g + 0.114*bl
            count += 1
    return total / count if count else 0.0

for p in sys.argv[1:]:
    try:
        lum = png_mean_luminance(p)
        print(f"{lum:.2f}\t{p}")
    except Exception as e:
        print(f"ERR\t{p}\t{e}", file=sys.stderr)
