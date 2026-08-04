import * as fs from "node:fs";
import * as zlib from "node:zlib";

/**
 * Reads the 6-character game ID from a GameCube/Wii disc image.
 *
 * Supported formats (all the ones the DUSKLIGHT manifest accepts):
 *  - Plain/raw disc images (`.iso`, `.gcm`, `.nkit.iso`): the disc header is
 *    at offset 0 for GameCube and at 0x40000 for Wii.
 *  - RVZ / WIA containers: the 0x80-byte disc header is embedded in the
 *    container header itself (see Dolphin's WIABlob.h: WIAHeader2.disc_header
 *    at offset 16 of header 2, which starts at byte 72 of the file).
 *  - GCZ containers: the disc header lives in block 0 (GC) or the block at
 *    0x40000 (Wii), which may be zlib-deflated, so we decompress that block.
 *
 * Returns null when the file is not a recognizable disc image or the ID can't
 * be read (callers then fall back to name matching).
 */

/** Game IDs look like "GZ2E01": 4-char game code + region + version. */
const GAME_ID_RE = /^[A-Z0-9]{4}[A-Z0-9][0-9]$/;

const GC_DISC_HEADER_OFFSET = 0x0;
const WII_DISC_HEADER_OFFSET = 0x40000;

// RVZ/WIA container layout (Dolphin WIABlob.h, packed structs).
const WIA_HEADER1_SIZE = 0x48; // 72 bytes: magic, version, ver_compat, header_2_size, hashes, sizes
const WIA_HEADER2_MIN_SIZE = 0xd4; // 212 bytes (WIAHeader2 without compressor_data)
const WIA_DISC_HEADER_OFFSET = 0x10; // WIAHeader2.disc_header (0x80 bytes) starts at +16
const RVZ_MAGIC = "RVZ\x01";
const WIA_MAGIC = "WIA\x01";

// GCZ container layout (Dolphin CompressedBlob.h, little-endian).
const GCZ_HEADER_SIZE = 32;
const GCZ_MAGIC = 0xb10bc001; // read as little-endian u32
const GCZ_BLOCK_PTR_TOP_BIT = 1n << 63n; // set => block stored uncompressed

function readBytes(fd: number, offset: number, size: number): Buffer | null {
  const buf = Buffer.alloc(size);
  let read = 0;
  while (read < size) {
    const n = fs.readSync(fd, buf, read, size - read, offset + read);
    if (n <= 0) return null;
    read += n;
  }
  return buf;
}

function gameIdAt(buf: Buffer, offset: number): string | null {
  if (offset + 6 > buf.length) return null;
  const id = buf.toString("latin1", offset, offset + 6);
  return GAME_ID_RE.test(id) ? id : null;
}

/** Game ID from an RVZ/WIA container: stored in the container header itself. */
function gameIdFromWiaRvz(fd: number): string | null {
  const header2SizeBuf = readBytes(fd, 12, 4);
  if (!header2SizeBuf) return null;
  const header2Size = header2SizeBuf.readUInt32BE(0);
  if (header2Size < WIA_HEADER2_MIN_SIZE) return null;
  const dh = readBytes(fd, WIA_HEADER1_SIZE + WIA_DISC_HEADER_OFFSET, 0x80);
  return dh ? gameIdAt(dh, 0) : null;
}

/** Game ID from a GCZ container: block 0 (GC) or the block at 0x40000 (Wii). */
function gameIdFromGcz(fd: number): string | null {
  const header = readBytes(fd, 0, GCZ_HEADER_SIZE);
  if (!header) return null;
  const compressedDataSize = Number(header.readBigUInt64LE(8));
  const blockSize = header.readUInt32LE(24);
  const numBlocks = header.readUInt32LE(28);
  if (numBlocks === 0 || blockSize === 0) return null;
  const dataOffset = GCZ_HEADER_SIZE + 8 * numBlocks + 4 * numBlocks;

  const readBlock = (blockNum: number): Buffer | null => {
    if (blockNum >= numBlocks) return null;
    const ptrBuf = readBytes(fd, GCZ_HEADER_SIZE + 8 * blockNum, 8);
    if (!ptrBuf) return null;
    const ptr = ptrBuf.readBigUInt64LE(0);
    let size: number;
    if (blockNum + 1 < numBlocks) {
      const nextBuf = readBytes(fd, GCZ_HEADER_SIZE + 8 * (blockNum + 1), 8);
      if (!nextBuf) return null;
      // Mask the top flag bit on both pointers: it signals "stored raw" and
      // must not pollute the size difference between consecutive blocks.
      size = Number(
        (nextBuf.readBigUInt64LE(0) & ~GCZ_BLOCK_PTR_TOP_BIT) - (ptr & ~GCZ_BLOCK_PTR_TOP_BIT),
      );
    } else {
      size = compressedDataSize - Number(ptr & ~GCZ_BLOCK_PTR_TOP_BIT);
    }
    if (size <= 0 || size > 0x100000) return null; // sanity + hard cap (1 MiB)
    const start = Number(ptr & ~GCZ_BLOCK_PTR_TOP_BIT) + dataOffset;
    const data = readBytes(fd, start, size);
    if (!data) return null;
    if (ptr & GCZ_BLOCK_PTR_TOP_BIT) return data; // stored uncompressed
    try {
      return zlib.inflateSync(data);
    } catch {
      return null;
    }
  };

  // GameCube: header in block 0.
  const gc = readBlock(0);
  const gcId = gc ? gameIdAt(gc, 0) : null;
  if (gcId) return gcId;
  // Wii: disc header at 0x40000.
  const wiiBlock = Math.floor(WII_DISC_HEADER_OFFSET / blockSize);
  const wii = readBlock(wiiBlock);
  return wii ? gameIdAt(wii, WII_DISC_HEADER_OFFSET % blockSize) : null;
}

/**
 * Best-effort game ID extraction. Returns null when the file isn't a readable
 * GC/Wii disc image (never throws).
 */
export function readDiscGameId(file: string): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;

    const magic = readBytes(fd, 0, 4);
    if (!magic) return null;

    if (magic.toString("latin1") === RVZ_MAGIC || magic.toString("latin1") === WIA_MAGIC) {
      return gameIdFromWiaRvz(fd);
    }
    if (magic.readUInt32LE(0) === GCZ_MAGIC) {
      return gameIdFromGcz(fd);
    }

    // Plain disc image: GameCube disc header at 0, Wii at 0x40000.
    const gc = readBytes(fd, GC_DISC_HEADER_OFFSET, 6);
    const gcId = gc ? gameIdAt(gc, 0) : null;
    if (gcId) return gcId;
    if (size >= WII_DISC_HEADER_OFFSET + 6) {
      const wii = readBytes(fd, WII_DISC_HEADER_OFFSET, 6);
      const wiiId = wii ? gameIdAt(wii, 0) : null;
      if (wiiId) return wiiId;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}
