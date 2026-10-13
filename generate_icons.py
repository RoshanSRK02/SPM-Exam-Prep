import os
import struct
import zlib

root = os.getcwd()
icons_dir = os.path.join(root, 'icons')
os.makedirs(icons_dir, exist_ok=True)

def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack('>I', len(data))
        + tag
        + data
        + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    )

for size in (192, 512):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            nx = x / (size - 1)
            ny = y / (size - 1)
            r = int(22 + 55 * nx)
            g = int(95 + 120 * (1 - ny))
            b = int(180 + 60 * nx)

            if x < 22 or x > size - 23 or y < 22 or y > size - 23:
                r, g, b = 15, 23, 42
            if abs(x - size / 2) < size * 0.18 and abs(y - size / 2) < size * 0.24:
                r, g, b = 255, 255, 255
            if abs(x - size / 2) < size * 0.07 and abs(y - size / 2) < size * 0.28:
                r, g, b = 22, 95, 180

            rows.extend((r, g, b))

    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(rows), 9))
        + chunk(b'IEND', b'')
    )

    with open(os.path.join(icons_dir, f'icon-{size}.png'), 'wb') as file:
        file.write(png)

print(f'Created icons in {icons_dir}')
