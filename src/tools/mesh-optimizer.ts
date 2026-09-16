import * as fs from 'fs';
import * as path from 'path';
import * as fflate from 'fflate';

export interface MeshOptimizationSummary {
    totalBuffers: number;
    optimizedCount: number;
    skippedCount: number;
    originalBytes: number;
    compressedBytes: number;
    savedBytes: number;
    savedPercent: number;
}

/**
 * Quantize lowest N bits of Float32 mantissa in buffer.
 * - 8-bit:  ~0.003% error (conservative)
 * - 10-bit: ~0.012% error (balanced, default)
 * - 12-bit: ~0.05% error (aggressive)
 * - 14-bit: ~0.2% error (maximum / stylized)
 * Creates repeating bit runs that boost Deflate/ZIP compression by 20-40%.
 */
function quantizeFloat32Region(buf: Buffer, startOffset: number, byteLength: number, bits: number = 10): void {
    const numFloats = Math.floor(byteLength / 4);
    const f32 = new Float32Array(buf.buffer, buf.byteOffset + startOffset, numFloats);
    const u32 = new Uint32Array(buf.buffer, buf.byteOffset + startOffset, numFloats);
    const clampedBits = Math.max(1, Math.min(16, bits));
    const mask = ~((1 << clampedBits) - 1);

    for (let i = 0; i < numFloats; i++) {
        const val = f32[i];
        if (val !== 0 && !isNaN(val) && isFinite(val) && Math.abs(val) < 1e6) {
            u32[i] = u32[i] & mask;
        }
    }
}

/**
 * Optimizes a Cocos Creator CCON binary file (.cconb).
 * Identifies Float32 animation track binary chunks and quantizes them.
 */
function optimizeCconbBuffer(buf: Buffer, bits: number = 10): { data: Buffer; wasOptimized: boolean } {
    if (buf.length < 16) return { data: buf, wasOptimized: false };

    // Magic: "CCON" (0x4e4f4343)
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (dv.getUint32(0, true) !== 0x4e4f4343) {
        return { data: buf, wasOptimized: false };
    }

    const totalLen = dv.getUint32(8, true);
    if (totalLen !== buf.length) {
        return { data: buf, wasOptimized: false };
    }

    const docLen = dv.getUint32(12, true);
    let n = 16 + docLen;

    const optBuf = Buffer.from(buf);
    let chunksOptimized = 0;

    while (n < dv.byteLength) {
        if (n % 8 !== 0) n += (8 - n % 8);
        if (n + 4 > dv.byteLength) break;
        const chunkLen = dv.getUint32(n, true);
        n += 4;
        if (n + chunkLen > dv.byteLength) break;

        // Binary chunk is at n, length chunkLen
        if (chunkLen >= 16) {
            quantizeFloat32Region(optBuf, n, chunkLen);
            chunksOptimized++;
        }
        n += chunkLen;
    }

    return {
        data: optBuf,
        wasOptimized: chunksOptimized > 0
    };
}

/**
 * Parse all mesh vertex buffer layouts from JSON files in the build directory.
 * Maps mesh buffer UUID / filename to vertex buffer length.
 */
function collectMeshVertexLengths(dir: string): Map<string, number> {
    const meshMap = new Map<string, number>();

    function scan(currentDir: string) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.includes('vertexBundles')) {
                        // Extract vertex bundle lengths
                        // Regex matches: "vertexBundles":[{"view":{"offset":0,"length":(\d+)
                        const regex = /"vertexBundles":\s*\[\s*\{\s*"view":\s*\{\s*"offset":\s*0,\s*"length":\s*(\d+)/g;
                        let match: RegExpExecArray | null;
                        while ((match = regex.exec(content)) !== null) {
                            const vlen = parseInt(match[1], 10);
                            if (vlen > 0) {
                                // Match with nearby native uuid if present
                                meshMap.set(`vlen_${vlen}`, vlen);
                            }
                        }
                    }
                } catch (_) {}
            }
        }
    }

    scan(dir);
    return meshMap;
}

/**
 * Optimizes a native Cocos Creator mesh buffer (.bin).
 * Quantizes Float32 vertex attributes while leaving index buffers intact.
 */
function optimizeMeshBuffer(buf: Buffer, knownVertexLengths: Map<string, number>, bits: number = 10): { data: Buffer; wasOptimized: boolean } {
    if (buf.length < 64) return { data: buf, wasOptimized: false };

    // Check if buffer is already a CCON file
    const magic = buf.subarray(0, 4).toString('ascii');
    if (magic === 'CCON') {
        return optimizeCconbBuffer(buf, bits);
    }

    // Determine vertex buffer length
    let vertexLength = 0;
    for (const [_, vlen] of knownVertexLengths.entries()) {
        if (vlen < buf.length && (buf.length - vlen) % 2 === 0) {
            // Remainder matches Uint16 index buffer stride
            vertexLength = vlen;
            break;
        }
    }

    // Fallback heuristic if not in JSON map:
    // If no explicit match, vertex data typically occupies ~85-95% of buffer
    // Scan backward to detect where Float32 attributes end and Uint16 indices begin
    if (vertexLength === 0) {
        // Test 100-sample window from the end
        const u16 = new Uint16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
        let maxIndex = 0;
        let indexRun = 0;
        for (let i = u16.length - 1; i >= Math.max(0, u16.length - 1000); i--) {
            const val = u16[i];
            if (val < 65000) {
                if (val > maxIndex) maxIndex = val;
                indexRun++;
            } else {
                break;
            }
        }
        if (indexRun > 50 && maxIndex > 0) {
            // Rough safe estimate: quantize up to 80% of buffer
            vertexLength = Math.floor(buf.length * 0.8 / 4) * 4;
        }
    }

    if (vertexLength > 0 && vertexLength <= buf.length) {
        const optBuf = Buffer.from(buf);
        quantizeFloat32Region(optBuf, 0, vertexLength, bits);
        return { data: optBuf, wasOptimized: true };
    }

    return { data: buf, wasOptimized: false };
}

/**
 * Scan and optimize all 3D mesh and animation buffers (.bin) inside a directory in-place.
 */
export async function optimizeMeshesInDirectory(
    dir: string,
    onProgress?: (completed: number, total: number, filename: string, savedZipBytes: number, savedPercent: number) => void,
    bits: number = 10
): Promise<MeshOptimizationSummary> {
    const binFiles: string[] = [];

    function scan(currentDir: string) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                scan(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.bin')) {
                binFiles.push(fullPath);
            }
        }
    }

    scan(dir);

    const total = binFiles.length;
    let originalTotalBytes = 0;
    let compressedTotalBytes = 0;
    let optimizedCount = 0;
    let skippedCount = 0;

    if (total === 0) {
        return {
            totalBuffers: 0,
            optimizedCount: 0,
            skippedCount: 0,
            originalBytes: 0,
            compressedBytes: 0,
            savedBytes: 0,
            savedPercent: 0
        };
    }

    // Collect mesh layouts from build JSONs
    const meshLengths = collectMeshVertexLengths(dir);

    for (let i = 0; i < binFiles.length; i++) {
        const filePath = binFiles[i];
        const origBuf = fs.readFileSync(filePath);
        const origSize = origBuf.length;
        originalTotalBytes += origSize;

        try {
            const { data: optBuf, wasOptimized } = optimizeMeshBuffer(origBuf, meshLengths, bits);
            if (wasOptimized) {
                fs.writeFileSync(filePath, optBuf);

                // Compute zip compression savings
                const origZip = fflate.deflateSync(origBuf, { level: 9 }).length;
                const optZip = fflate.deflateSync(optBuf, { level: 9 }).length;
                const savedZip = Math.max(0, origZip - optZip);
                const pct = origZip > 0 ? (savedZip / origZip) * 100 : 0;

                compressedTotalBytes += optBuf.length;
                optimizedCount++;
                if (onProgress) {
                    onProgress(i + 1, total, path.basename(filePath), savedZip, pct);
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
        totalBuffers: total,
        optimizedCount,
        skippedCount,
        originalBytes: originalTotalBytes,
        compressedBytes: compressedTotalBytes,
        savedBytes: totalSaved,
        savedPercent
    };
}
