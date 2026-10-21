import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from '@vip/contracts';
import { ApiError, storageFailure } from './errors.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_CANONICAL_BYTES = 80 * 1024 * 1024;

function corrupt(cause?: unknown) {
  return new ApiError(422, 'CORRUPT_IMAGE', 'The image is corrupt or cannot be decoded safely.', { cause });
}

function multipleImages() {
  return new ApiError(415, 'MULTIFRAME_IMAGE', 'Animated and multipage images are not supported.');
}

async function inspectContainer(path: string): Promise<'jpeg' | 'png'> {
  const handle = await open(path, 'r').catch((cause: unknown) => { throw storageFailure(cause); });
  try {
    const { size } = await handle.stat();
    const header = Buffer.alloc(12);
    await handle.read(header, 0, header.length, 0);
    if (header.subarray(0, 8).equals(pngSignature)) {
      // libvips can expose only APNG's first frame. Inspect chunk headers so
      // animation cannot silently become a single-frame accepted upload.
      let offset = 8;
      let chunks = 0;
      while (offset + 12 <= size && chunks++ < 10_000) {
        const chunk = Buffer.alloc(8);
        await handle.read(chunk, 0, 8, offset);
        const length = chunk.readUInt32BE(0);
        const type = chunk.toString('ascii', 4, 8);
        if (offset + 12 + length > size) throw corrupt();
        if (type === 'acTL') throw multipleImages();
        if (type === 'IEND') {
          if (length !== 0 || offset + 12 !== size) throw corrupt();
          return 'png';
        }
        offset += length + 12;
      }
      throw corrupt();
    }
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      // MPO is JPEG-compatible but carries multiple pictures in an MPF APP2
      // segment; reject it rather than accepting only its first picture.
      let offset = 2;
      let segments = 0;
      while (offset + 4 <= size && segments++ < 10_000) {
        const segment = Buffer.alloc(8);
        await handle.read(segment, 0, 8, offset);
        if (segment[0] !== 0xff) throw corrupt();
        if (segment[1] === 0xff) { offset++; continue; }
        if (segment[1] === 0xda || segment[1] === 0xd9) return 'jpeg';
        const length = segment.readUInt16BE(2);
        if (length < 2 || offset + length + 2 > size) throw corrupt();
        if (segment[1] === 0xe2 && segment.toString('ascii', 4, 8) === 'MPF\0') throw multipleImages();
        offset += length + 2;
      }
      throw corrupt();
    }
    throw new ApiError(415, 'UNSUPPORTED_IMAGE_TYPE', 'Only JPEG and PNG images are supported.');
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw storageFailure(cause);
  } finally {
    await handle.close();
  }
}

export async function canonicalizeImage(input: string, output: string) {
  const format = await inspectContainer(input);
  try {
    // This operation reads headers only. Explicitly check dimensions before
    // decoding; the actual decoding pipeline also enforces the same pixel cap.
    const metadata = await sharp(input, { limitInputPixels: false, failOn: 'warning' }).metadata();
    if (!metadata.width || !metadata.height) throw corrupt();
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ApiError(413, 'IMAGE_DIMENSIONS_EXCEEDED', 'Decoded images must not exceed 20 megapixels.');
    }
    if ((metadata.pages ?? 1) !== 1 || (metadata.delay?.length ?? 0) > 1) throw multipleImages();

    let image = sharp(input, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'warning',
      sequentialRead: true,
    }).autoOrient().toColourspace('srgb').timeout({ seconds: 10 });

    image = format === 'jpeg'
      ? image.jpeg({ quality: 90, chromaSubsampling: '4:4:4', progressive: false, mozjpeg: false })
      : image.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, progressive: false });

    // Sharp strips EXIF and other metadata by default. Dimensions below describe
    // the actual canonical output, including all orientation/mirroring changes.
    const info = await image.toFile(output);
    if (info.size > MAX_CANONICAL_BYTES) throw corrupt();
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(output)) hash.update(chunk);
    return {
      mimeType: format === 'jpeg' ? 'image/jpeg' as const : 'image/png' as const,
      extension: format === 'jpeg' ? 'jpg' as const : 'png' as const,
      width: info.width,
      height: info.height,
      byteLength: info.size,
      sha256: hash.digest('hex'),
    };
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (cause instanceof Error && ('code' in cause && ['ENOSPC', 'EACCES', 'EIO', 'EROFS', 'EPERM', 'ENOENT', 'EISDIR', 'ENOTDIR', 'EMFILE', 'ENFILE', 'EDQUOT'].includes(String(cause.code))
      || /unable to open for write|write error|not enough space|permission denied|input file is missing|is a directory|not a directory/i.test(cause.message))) {
      throw storageFailure(cause);
    }
    throw corrupt(cause);
  }
}
