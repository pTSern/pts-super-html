import * as fs from 'fs';
import * as path from 'path';

let fonteditorCore: any = null;
try {
    fonteditorCore = require('fonteditor-core');
} catch (_) {}

export interface FontSubsettingSummary {
    totalFonts: number;
    optimizedCount: number;
    skippedCount: number;
    originalBytes: number;
    compressedBytes: number;
    savedBytes: number;
    savedPercent: number;
}

/**
 * Scan text from JSON files in the build folder
 * to gather all characters actually displayed or referenced.
 */
export function extractUsedCharactersFromDirectory(dir: string): Set<string> {
    const chars = new Set<string>();

    // Baseline: standard printable ASCII (32 to 126)
    for (let i = 32; i <= 126; i++) {
        chars.add(String.fromCharCode(i));
    }

    function scanFiles(currentDir: string) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                scanFiles(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    for (let i = 0; i < content.length; i++) {
                        const code = content.charCodeAt(i);
                        if (code >= 32 && code < 0xfff0) {
                            chars.add(content[i]);
                        }
                    }
                } catch (_) {}
            }
        }
    }

    scanFiles(dir);
    return chars;
}

/**
 * Subsets a TTF/OTF font buffer keeping only specified characters.
 */
export function subsetFontBuffer(
    buffer: Buffer,
    ext: string,
    usedChars: Set<string>
): { data: Buffer; wasOptimized: boolean } {
    const originalSize = buffer.length;
    const cleanExt = ext.toLowerCase().replace(/^\./, '');
    const fontType = cleanExt === 'otf' ? 'otf' : 'ttf';

    if (fonteditorCore && fonteditorCore.Font) {
        try {
            const unicodes: number[] = [];
            for (const ch of usedChars) {
                const code = ch.charCodeAt(0);
                if (code >= 32) unicodes.push(code);
            }

            const font = fonteditorCore.Font.create(buffer, {
                type: fontType,
                subset: unicodes,
                hinting: false
            });

            const outBuf = font.write({
                type: fontType,
                hinting: false
            });

            if (outBuf && outBuf.length > 0 && outBuf.length < originalSize) {
                return { data: Buffer.from(outBuf), wasOptimized: true };
            }
        } catch (_) {}
    }

    return { data: buffer, wasOptimized: false };
}

/**
 * Scan and subset all fonts (.ttf, .otf) in the build directory in-place.
 */
export async function subsetFontsInDirectory(
    dir: string,
    onProgress?: (completed: number, total: number, filename: string, savedBytes: number, savedPercent: number) => void
): Promise<FontSubsettingSummary> {
    const supportedExts = new Set(['.ttf', '.otf']);
    const fontFiles: string[] = [];

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
                    fontFiles.push(fullPath);
                }
            }
        }
    }

    scan(dir);

    const total = fontFiles.length;
    let originalTotalBytes = 0;
    let compressedTotalBytes = 0;
    let optimizedCount = 0;
    let skippedCount = 0;

    if (total === 0) {
        return {
            totalFonts: 0,
            optimizedCount: 0,
            skippedCount: 0,
            originalBytes: 0,
            compressedBytes: 0,
            savedBytes: 0,
            savedPercent: 0
        };
    }

    // Gather characters used in this build
    const usedChars = extractUsedCharactersFromDirectory(dir);

    for (let i = 0; i < fontFiles.length; i++) {
        const filePath = fontFiles[i];
        const ext = path.extname(filePath);
        const origBuf = fs.readFileSync(filePath);
        const origSize = origBuf.length;
        originalTotalBytes += origSize;

        try {
            const { data: optBuf, wasOptimized } = subsetFontBuffer(origBuf, ext, usedChars);
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
        totalFonts: total,
        optimizedCount,
        skippedCount,
        originalBytes: originalTotalBytes,
        compressedBytes: compressedTotalBytes,
        savedBytes: totalSaved,
        savedPercent
    };
}
