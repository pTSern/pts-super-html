import * as fs from 'fs';
import * as path from 'path';

let sharp: any = null;
try {
    sharp = require('sharp');
} catch (_) {}

let UPNG: any = null;
try {
    UPNG = require('upng-js');
} catch (_) {}

export interface ImageCompressionSummary {
    totalImages: number;
    optimizedCount: number;
    skippedCount: number;
    originalBytes: number;
    compressedBytes: number;
    savedBytes: number;
    savedPercent: number;
}

export interface CompressSingleResult {
    path: string;
    originalSize: number;
    compressedSize: number;
    savedBytes: number;
    savedPercent: number;
    wasOptimized: boolean;
}

/**
 * Compress a single image buffer using TinyPNG-equivalent quantization logic.
 * Guarantees that the output buffer is NEVER larger than the original buffer.
 */
export async function compressImageBuffer(
    buffer: Buffer,
    ext: string,
    quality: number = 80
): Promise<{ data: Buffer; wasOptimized: boolean }> {
    const originalSize = buffer.length;
    let bestBuffer = buffer;
    const cleanExt = ext.toLowerCase().replace(/^\./, '');

    if (cleanExt === 'png') {
        // 1. Try UPNG.js lossy 256-color palette quantization (TinyPNG logic)
        if (UPNG) {
            try {
                const decoded = UPNG.decode(buffer);
                if (decoded && decoded.width > 0 && decoded.height > 0) {
                    const rgba = UPNG.toRGBA8(decoded)[0];
                    const encoded = Buffer.from(UPNG.encode([rgba], decoded.width, decoded.height, 256));
                    if (encoded.length < bestBuffer.length) {
                        bestBuffer = encoded;
                    }
                }
            } catch (_) {}
        }

        // 2. Try sharp PNG palette quantization if sharp is available
        if (sharp) {
            try {
                const sharpOpt = await sharp(buffer)
                    .png({ quality, palette: true, colours: 256, dither: 1.0, compressionLevel: 9 })
                    .toBuffer();
                if (sharpOpt.length < bestBuffer.length) {
                    bestBuffer = sharpOpt;
                }
            } catch (_) {}
        }
    } else if (cleanExt === 'jpg' || cleanExt === 'jpeg') {
        if (sharp) {
            try {
                const sharpOpt = await sharp(buffer)
                    .jpeg({ quality, mozjpeg: true, progressive: true, trellisQuantisation: true })
                    .toBuffer();
                if (sharpOpt.length < bestBuffer.length) {
                    bestBuffer = sharpOpt;
                }
            } catch (_) {}
        }
    } else if (cleanExt === 'webp') {
        if (sharp) {
            try {
                const sharpOpt = await sharp(buffer)
                    .webp({ quality, effort: 6 })
                    .toBuffer();
                if (sharpOpt.length < bestBuffer.length) {
                    bestBuffer = sharpOpt;
                }
            } catch (_) {}
        }
    }

    return {
        data: bestBuffer,
        wasOptimized: bestBuffer.length < originalSize
    };
}

/**
 * Scan and compress all supported images inside a folder in-place.
 */
export async function compressImagesInDirectory(
    dir: string,
    onProgress?: (completed: number, total: number, filename: string, savedBytes: number, savedPercent: number) => void
): Promise<ImageCompressionSummary> {
    const supportedExts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const imageFiles: string[] = [];

    function scan(currentDir: string) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (supportedExts.has(ext)) {
                    imageFiles.push(fullPath);
                }
            }
        }
    }

    scan(dir);

    const total = imageFiles.length;
    let originalTotalBytes = 0;
    let compressedTotalBytes = 0;
    let optimizedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
        const filePath = imageFiles[i];
        const ext = path.extname(filePath);
        const origBuf = fs.readFileSync(filePath);
        const origSize = origBuf.length;
        originalTotalBytes += origSize;

        try {
            const { data: optBuf, wasOptimized } = await compressImageBuffer(origBuf, ext);
            if (wasOptimized) {
                fs.writeFileSync(filePath, optBuf);
                const saved = origSize - optBuf.length;
                const pct = (saved / origSize) * 100;
                compressedTotalBytes += optBuf.length;
                optimizedCount++;
                if (onProgress) {
                    onProgress(i + 1, total, path.basename(filePath), saved, pct);
                }
            } else {
                compressedTotalBytes += origSize;
                skippedCount++;
                if (onProgress) {
                    onProgress(i + 1, total, path.basename(filePath), 0, 0);
                }
            }
        } catch (_) {
            compressedTotalBytes += origSize;
            skippedCount++;
            if (onProgress) {
                onProgress(i + 1, total, path.basename(filePath), 0, 0);
            }
        }
    }

    const totalSaved = originalTotalBytes - compressedTotalBytes;
    const savedPercent = originalTotalBytes > 0 ? (totalSaved / originalTotalBytes) * 100 : 0;

    return {
        totalImages: total,
        optimizedCount,
        skippedCount,
        originalBytes: originalTotalBytes,
        compressedBytes: compressedTotalBytes,
        savedBytes: totalSaved,
        savedPercent
    };
}
