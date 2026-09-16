import * as fs from 'fs';
import * as path from 'path';

let lamejs: any = null;
async function getLamejs(): Promise<any> {
    if (!lamejs) {
        try {
            // Use native dynamic import to bypass TypeScript's CommonJS require rewrite
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            const mod = await dynamicImport('@breezystack/lamejs');
            lamejs = mod.default || mod;
        } catch (e) {
            try {
                lamejs = require('lamejs');
            } catch (_) {}
        }
    }
    return lamejs;
}

let MPEGDecoderClass: any = null;
async function getMpegDecoder(): Promise<any> {
    if (!MPEGDecoderClass) {
        try {
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            const mod = await dynamicImport('mpg123-decoder');
            MPEGDecoderClass = mod.MPEGDecoder || mod.default?.MPEGDecoder || mod.default;
        } catch (e) {
            console.warn('[pTS-super-html] Failed to dynamically load mpg123-decoder:', e);
        }
    }
    return MPEGDecoderClass;
}

export interface AudioCompressionSummary {
    totalAudio: number;
    optimizedCount: number;
    skippedCount: number;
    originalBytes: number;
    compressedBytes: number;
    savedBytes: number;
    savedPercent: number;
}

/**
 * Parse standard RIFF/WAVE PCM headers.
 */
function parseWav(buf: Buffer): { sampleRate: number; numChannels: number; monoInt16: Int16Array } | null {
    if (buf.length < 44) return null;
    if (buf.subarray(0, 4).toString('ascii') !== 'RIFF' || buf.subarray(8, 12).toString('ascii') !== 'WAVE') {
        return null;
    }

    let offset = 12;
    let audioFormat = 1;
    let numChannels = 1;
    let sampleRate = 44100;
    let bitsPerSample = 16;
    let pcmData: Buffer | null = null;

    while (offset < buf.length - 8) {
        const chunkId = buf.subarray(offset, offset + 4).toString('ascii');
        const chunkSize = buf.readUInt32LE(offset + 4);
        offset += 8;

        if (chunkId === 'fmt ') {
            audioFormat = buf.readUInt16LE(offset);
            numChannels = buf.readUInt16LE(offset + 2);
            sampleRate = buf.readUInt32LE(offset + 4);
            bitsPerSample = buf.readUInt16LE(offset + 14);
        } else if (chunkId === 'data') {
            pcmData = buf.subarray(offset, Math.min(buf.length, offset + chunkSize));
        }
        offset += chunkSize;
        if (chunkSize % 2 !== 0) offset += 1;
    }

    if (!pcmData) return null;

    // Convert to mono Int16
    let monoInt16: Int16Array;
    if (bitsPerSample === 16) {
        const numSamples = Math.floor(pcmData.length / (2 * numChannels));
        monoInt16 = new Int16Array(numSamples);
        const dv = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
        for (let i = 0; i < numSamples; i++) {
            let sum = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                sum += dv.getInt16((i * numChannels + ch) * 2, true);
            }
            monoInt16[i] = Math.round(sum / numChannels);
        }
    } else if (bitsPerSample === 8) {
        const numSamples = Math.floor(pcmData.length / numChannels);
        monoInt16 = new Int16Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            let sum = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                sum += (pcmData[i * numChannels + ch] - 128) * 256;
            }
            monoInt16[i] = Math.round(sum / numChannels);
        }
    } else if (bitsPerSample === 32 && audioFormat === 3) {
        // Float32 PCM
        const numSamples = Math.floor(pcmData.length / (4 * numChannels));
        monoInt16 = new Int16Array(numSamples);
        const dv = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
        for (let i = 0; i < numSamples; i++) {
            let sum = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                sum += dv.getFloat32((i * numChannels + ch) * 4, true);
            }
            const s = Math.max(-1, Math.min(1, sum / numChannels));
            monoInt16[i] = Math.round(s * 32767);
        }
    } else {
        return null;
    }

    return { sampleRate, numChannels, monoInt16 };
}

/**
 * Encode mono Int16Array PCM samples to MP3 at target bitrate (default 48 kbps).
 */
async function encodeMonoPcmToMp3(samples: Int16Array, sampleRate: number, kbps: number = 48): Promise<Buffer> {
    const lame = await getLamejs();
    if (!lame || !lame.Mp3Encoder) {
        throw new Error('Mp3Encoder not available');
    }

    // Support standard sample rates: 44100, 32000, 24000, 22050, 16000, 11025, 8000
    const encoder = new lame.Mp3Encoder(1, sampleRate, kbps);
    const mp3Chunks: Buffer[] = [];
    const chunkSize = 1152;
    const len = samples.length;

    for (let i = 0; i < len; i += chunkSize) {
        const chunk = samples.subarray(i, i + chunkSize);
        const mp3buf = encoder.encodeBuffer(chunk);
        if (mp3buf && mp3buf.length > 0) {
            mp3Chunks.push(Buffer.from(mp3buf));
        }
    }

    const end = encoder.flush();
    if (end && end.length > 0) {
        mp3Chunks.push(Buffer.from(end));
    }

    return Buffer.concat(mp3Chunks);
}

/**
 * Downsamples / re-encodes a single audio buffer to 48 kbps mono MP3.
 * Returns the optimized buffer if smaller, or the original buffer if not.
 */
export async function compressAudioBuffer(
    buffer: Buffer,
    ext: string,
    targetKbps: number = 48
): Promise<{ data: Buffer; wasOptimized: boolean }> {
    const originalSize = buffer.length;
    const cleanExt = ext.toLowerCase().replace(/^\./, '');

    try {
        if (cleanExt === 'wav') {
            const parsed = parseWav(buffer);
            if (parsed && parsed.monoInt16.length > 0) {
                const encoded = await encodeMonoPcmToMp3(parsed.monoInt16, parsed.sampleRate, targetKbps);
                if (encoded.length < originalSize) {
                    return { data: encoded, wasOptimized: true };
                }
            }
        } else if (cleanExt === 'mp3') {
            const MPEGDecoder = await getMpegDecoder();
            if (!MPEGDecoder) {
                return { data: buffer, wasOptimized: false };
            }
            const decoder = new MPEGDecoder();
            await decoder.ready;
            const decoded = decoder.decode(buffer);
            if (decoded && decoded.channelData && decoded.channelData.length > 0) {
                const numChannels = decoded.channelData.length;
                const len = decoded.channelData[0].length;
                const monoInt16 = new Int16Array(len);

                for (let i = 0; i < len; i++) {
                    let sum = 0;
                    for (let ch = 0; ch < numChannels; ch++) {
                        sum += decoded.channelData[ch][i];
                    }
                    const s = Math.max(-1, Math.min(1, sum / numChannels));
                    monoInt16[i] = Math.round(s * 32767);
                }

                const encoded = await encodeMonoPcmToMp3(monoInt16, decoded.sampleRate, targetKbps);
                if (encoded.length < originalSize) {
                    return { data: encoded, wasOptimized: true };
                }
            }
        }
    } catch (_) {}

    return { data: buffer, wasOptimized: false };
}

/**
 * Scan and downsample all audio files (.mp3, .wav) inside a directory in-place.
 */
export async function downsampleAudioInDirectory(
    dir: string,
    targetKbps: number = 48,
    onProgress?: (completed: number, total: number, filename: string, savedBytes: number, savedPercent: number) => void
): Promise<AudioCompressionSummary> {
    const supportedExts = new Set(['.mp3', '.wav']);
    const audioFiles: string[] = [];

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
                    audioFiles.push(fullPath);
                }
            }
        }
    }

    scan(dir);

    const total = audioFiles.length;
    let originalTotalBytes = 0;
    let compressedTotalBytes = 0;
    let optimizedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < audioFiles.length; i++) {
        const filePath = audioFiles[i];
        const ext = path.extname(filePath);
        const origBuf = fs.readFileSync(filePath);
        const origSize = origBuf.length;
        originalTotalBytes += origSize;

        try {
            const { data: optBuf, wasOptimized } = await compressAudioBuffer(origBuf, ext, targetKbps);
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
        totalAudio: total,
        optimizedCount,
        skippedCount,
        originalBytes: originalTotalBytes,
        compressedBytes: compressedTotalBytes,
        savedBytes: totalSaved,
        savedPercent
    };
}
