"""Stage verified upload copies; remove only empty EXIF UserComment placeholders.

Requires Pillow. Originals are never overwritten. JPEG metadata is patched in place
within a copy, without decoding/re-encoding or shifting any TIFF data offsets.
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

from PIL import Image


def empty_comment(value):
    if not isinstance(value, bytes):
        return False
    for prefix in (b'ASCII\0\0\0', b'UNICODE\0', b'JIS\0\0\0\0\0'):
        if value.startswith(prefix):
            value = value[len(prefix):]
            break
    value = value.strip(b'\0 \t\r\n')
    return not value or re.fullmatch(b'0x0+', value) is not None


def clean_jpeg(data):
    out = bytearray(data)
    if data[:2] != b'\xff\xd8':
        raise ValueError('Expected JPEG')
    pos = 2
    while pos < len(data):
        if data[pos] != 255:
            raise ValueError('Invalid JPEG marker')
        while data[pos] == 255:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker in (0xDA, 0xD9):
            break
        size = int.from_bytes(data[pos:pos + 2], 'big')
        if size < 2 or pos + size > len(data):
            raise ValueError('Invalid JPEG segment length')
        if marker == 0xE1 and data[pos + 2:pos + 8] == b'Exif\0\0':
            base, end = pos + 8, pos + size
            endian = {b'II': '<', b'MM': '>'}[data[base:base + 2]]

            def read(fmt, offset):
                length = struct.calcsize(fmt)
                if offset < base or offset + length > end:
                    raise ValueError('EXIF offset outside segment')
                return struct.unpack_from(endian + fmt, data, offset)[0]

            def entries(offset):
                count = read('H', offset)
                read('I', offset + 2 + 12 * count)
                return [(offset + 2 + 12 * i, read('H', offset + 2 + 12 * i))
                        for i in range(count)]

            root = base + read('I', base + 4)
            for pointer, tag in entries(root):
                if tag != 34665:
                    continue
                exif = base + read('I', pointer + 8)
                fields = entries(exif)
                for entry, field in fields:
                    if field != 37510:
                        continue
                    if read('H', entry + 2) != 7:
                        raise ValueError('Unexpected UserComment type')
                    length = read('I', entry + 4)
                    start = entry + 8 if length <= 4 else base + read('I', entry + 8)
                    if start < base or start + length > end:
                        raise ValueError('Invalid UserComment length')
                    if not empty_comment(data[start:start + length]):
                        continue
                    # Keep allocation size and all other offsets unchanged.
                    last = exif + 2 + 12 * len(fields) + 4
                    out[entry:last - 12] = out[entry + 12:last]
                    out[last - 12:last] = bytes(12)
                    struct.pack_into(endian + 'H', out, exif, len(fields) - 1)
        pos += size
    return bytes(out)


def metadata(image):
    exif = image.getexif()
    return dict(exif), dict(exif.get_ifd(34665)), dict(exif.get_ifd(34853))


def stage(source, destination):
    if source.resolve() == destination.resolve():
        raise ValueError('Refusing to overwrite original')
    original = source.read_bytes()
    with Image.open(source) as before:
        old = metadata(before)
        comment = old[1].get(37510)
        remove = comment is not None and empty_comment(comment)
        if remove and before.format != 'JPEG':
            raise ValueError(f'{source}: empty comment needs format-specific cleanup')
        cleaned = clean_jpeg(original) if remove else original
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(cleaned)
        with Image.open(destination) as after:
            new = metadata(after)
            expected = (old[0], {k: v for k, v in old[1].items()
                                  if not (remove and k == 37510)}, old[2])
            if new != expected or before.size != after.size or before.tobytes() != after.tobytes():
                destination.unlink()
                raise ValueError(f'{source}: metadata or pixel verification failed')
    return {'source': str(source), 'upload': str(destination),
            'removed_empty_user_comment': remove,
            'source_sha256': hashlib.sha256(original).hexdigest(),
            'upload_sha256': hashlib.sha256(cleaned).hexdigest(),
            'pixels_and_other_exif_verified': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, default=Path('migration/inventory.json'))
    parser.add_argument('--output', type=Path, default=Path('migration/clean-uploads'))
    args = parser.parse_args()
    rows = []
    for photo in json.loads(args.inventory.read_text())['photos']:
        source = Path(photo['src'])
        rows.append(stage(source, args.output / photo['collection'] / source.name))
    (args.output / 'verification.json').write_text(json.dumps(rows, indent=2) + '\n')
    print(f'Verified {len(rows)} upload copies; cleaned {sum(r["removed_empty_user_comment"] for r in rows)} empty comments.')
