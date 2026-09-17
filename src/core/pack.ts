import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import JSZip from 'jszip';
import * as fflate from 'fflate';
import { CompressionMethod, Encoding, PackOptions, PackResult, PackResultOutput } from './types';
import { ALL_CHANNELS, getChannelInfo, getChannelSnippet } from './channels';
import { encodeBase122, escapeBase122ForHtml } from '../codecs/base122';
import { compressImagesInDirectory } from '../tools/image-compressor';
import { downsampleAudioInDirectory } from '../tools/audio-compressor';
import { subsetFontsInDirectory } from '../tools/font-subsetter';
import { optimizeMeshesInDirectory } from '../tools/mesh-optimizer';

export function extractTitle(html: string): string {
    const match = html.match(/<title>([^<]*)<\/title>/i);
    if (match && match[1]) {
        let title = match[1].trim();
        if (title.startsWith('Cocos Creator | ')) {
            title = title.replace('Cocos Creator | ', '').trim();
        }
        return title.replace(/[\\/:*?"<>|]/g, '_');
    }
    return 'playable_ad';
}

export function minifyCss(css: string): string {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([\{\};:,])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
}

export function cleanHtmlTemplate(html: string, inlineCss: string): string {
    // Replace style.css link with inline style
    let cleaned = html.replace(/<link\s+rel="stylesheet"[^>]*href="style\.css"[^>]*\/?>/gi, () => `<style>\n${inlineCss}\n</style>`);

    // Remove all existing script tags to prevent premature execution
    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove comments
    cleaned = cleaned.replace(/<!--(?!<!)[^\[>][\s\S]*?-->/g, '');

    // Clean up empty lines
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, '');

    return cleaned;
}

export async function packPlayable(options: PackOptions): Promise<PackResult> {
    const startTime = Date.now();
    const { inputDir, outDir, encoding, isMinCss = true, onProgress } = options;
    const compression: CompressionMethod = options.compression || 'zip-fast';

    const report = (pct: number, msg: string) => {
        if (onProgress) onProgress(pct, msg);
    };

    report(5, 'Validating inputs...');

    if (!fs.existsSync(inputDir)) {
        return {
            success: false,
            sourceFiles: 0,
            zipBytes: 0,
            outputs: [],
            durationMs: Date.now() - startTime,
            error: `Input directory does not exist: ${inputDir}`
        };
    }

    const indexHtmlPath = path.join(inputDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
        return {
            success: false,
            sourceFiles: 0,
            zipBytes: 0,
            outputs: [],
            durationMs: Date.now() - startTime,
            error: `Missing index.html in: ${inputDir}`
        };
    }

    report(10, 'Reading project files...');
    const originalHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    const detectedTitle = extractTitle(originalHtml) || path.basename(inputDir);
    const projectTitle = (options.customName && options.customName.trim())
        ? options.customName.trim().replace(/[\\/:*?"<>|]/g, '_')
        : detectedTitle;

    // Optional: Compress images in build folder if requested
    let imageSavingsBytes = 0;
    if (options.isCompressImages) {
        report(12, 'Compressing images in build folder (TinyPNG algorithm)...');
        const imgSummary = await compressImagesInDirectory(inputDir, (completed, total, filename, saved, pct) => {
            if (saved > 0) {
                report(13, `Optimizing image [${completed}/${total}]: ${filename} (-${pct.toFixed(1)}%)`);
            }
        });
        imageSavingsBytes = imgSummary.savedBytes;
        report(14, `Image compression finished: ${imgSummary.optimizedCount}/${imgSummary.totalImages} optimized, saved ${(imgSummary.savedBytes / 1024).toFixed(1)} KB (-${imgSummary.savedPercent.toFixed(1)}%)`);
    }

    let audioSavingsBytes = 0;
    if (options.isDownsampleAudio) {
        report(15, 'Downsampling audio (48 kbps Mono MP3)...');
        const audioSummary = await downsampleAudioInDirectory(inputDir, 48, (completed, total, filename, saved, pct) => {
            if (saved > 0) {
                report(16, `Downsampling audio [${completed}/${total}]: ${filename} (-${pct.toFixed(1)}%)`);
            }
        });
        audioSavingsBytes = audioSummary.savedBytes;
        report(17, `Audio downsampling finished: ${audioSummary.optimizedCount}/${audioSummary.totalAudio} optimized, saved ${(audioSummary.savedBytes / 1024).toFixed(1)} KB (-${audioSummary.savedPercent.toFixed(1)}%)`);
    }

    let fontSavingsBytes = 0;
    if (options.isSubsetFonts) {
        report(18, 'Subsetting TTF/OTF fonts (used glyphs only)...');
        const fontSummary = await subsetFontsInDirectory(inputDir, (completed, total, filename, saved, pct) => {
            if (saved > 0) {
                report(18, `Subsetting font [${completed}/${total}]: ${filename} (-${pct.toFixed(1)}%)`);
            }
        });
        fontSavingsBytes = fontSummary.savedBytes;
        report(19, `Font subsetting finished: ${fontSummary.optimizedCount}/${fontSummary.totalFonts} optimized, saved ${(fontSummary.savedBytes / 1024).toFixed(1)} KB (-${fontSummary.savedPercent.toFixed(1)}%)`);
    }

    let meshSavingsBytes = 0;
    if (options.isOptimizeMesh) {
        const quantBits = options.meshQuantizationBits !== undefined ? options.meshQuantizationBits : 10;
        report(19, `Optimizing 3D mesh vertex buffers and animation tracks (${quantBits}-bit precision)...`);
        const meshSummary = await optimizeMeshesInDirectory(inputDir, (completed, total, filename, savedZip, pct) => {
            if (savedZip > 0) {
                report(19, `Optimizing mesh buffer [${completed}/${total}]: ${filename} (+${pct.toFixed(1)}% zip ratio)`);
            }
        }, quantBits);
        meshSavingsBytes = meshSummary.savedBytes;
        report(20, `Mesh optimization finished: ${meshSummary.optimizedCount}/${meshSummary.totalBuffers} buffers optimized (${quantBits}-bit)`);
    }

    // Prepare style.css
    let styleCss = '';
    const styleCssPath = path.join(inputDir, 'style.css');
    if (fs.existsSync(styleCssPath)) {
        styleCss = fs.readFileSync(styleCssPath, 'utf-8');
        if (isMinCss) {
            styleCss = minifyCss(styleCss);
        }
    }

    const baseHtml = cleanHtmlTemplate(originalHtml, styleCss);

    // Recursively collect all files
    report(20, 'Scanning directory assets...');
    function scanDir(dir: string, fileList: string[] = []): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath, fileList);
            } else if (entry.isFile()) {
                fileList.push(fullPath);
            }
        }
        return fileList;
    }

    const allFiles = scanDir(inputDir);
    let payloadBytes: Uint8Array;
    let sourceFileCount = 0;

    if (compression === 'solid-deflate') {
        report(40, 'Packing into Solid Deflate archive...');
        const solidFiles: { path: string; offset: number; length: number; data: Buffer }[] = [];
        let totalOffset = 0;
        for (const filePath of allFiles) {
            const relPath = path.relative(inputDir, filePath).replace(/\\/g, '/');
            if (relPath.toLowerCase() === 'index.html') continue;
            const data = fs.readFileSync(filePath);
            solidFiles.push({ path: relPath, offset: totalOffset, length: data.length, data });
            totalOffset += data.length;
            sourceFileCount++;
        }
        const manifest = solidFiles.map(s => [s.path, s.offset, s.length]);
        const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf-8');
        const headerBuf = Buffer.alloc(4);
        headerBuf.writeUInt32LE(manifestBuf.length, 0);
        const container = Buffer.concat([headerBuf, manifestBuf, ...solidFiles.map(s => s.data)]);
        payloadBytes = new Uint8Array(zlib.deflateRawSync(container, { level: 9 }));
    } else if (compression === 'zip-fast') {
        report(40, 'Compressing with fflate (high-speed PKZIP level 9)...');
        const zipEntries: Record<string, Uint8Array> = {};
        for (const filePath of allFiles) {
            const relPath = path.relative(inputDir, filePath).replace(/\\/g, '/');
            if (relPath.toLowerCase() === 'index.html') continue;
            zipEntries[relPath] = new Uint8Array(fs.readFileSync(filePath));
            sourceFileCount++;
        }
        payloadBytes = fflate.zipSync(zipEntries, { level: 9 });
    } else {
        // 'zip-standard' (JSZip)
        report(40, 'Compressing with JSZip (standard PKZIP level 9)...');
        const zip = new JSZip();
        for (const filePath of allFiles) {
            const relPath = path.relative(inputDir, filePath).replace(/\\/g, '/');
            if (relPath.toLowerCase() === 'index.html') continue;
            const data = fs.readFileSync(filePath);
            zip.file(relPath, data);
            sourceFileCount++;
        }
        payloadBytes = await zip.generateAsync({
            type: 'uint8array',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
        });
    }

    report(60, `Encoding payload using ${encoding.toUpperCase()} (${(payloadBytes.length / 1024).toFixed(1)} KB)...`);
    let encodedPayload = '';
    if (encoding === 'base122') {
        const rawB122 = encodeBase122(payloadBytes);
        encodedPayload = escapeBase122ForHtml(rawB122);
    } else {
        encodedPayload = Buffer.from(payloadBytes).toString('base64');
    }

    // Locate runtime loader
    report(70, 'Preparing runtime loader...');
    const loaderName = (compression === 'zip-standard') ? 'loader-jszip.js' : 'loader-fflate.js';
    const candidatePaths = [
        path.resolve(__dirname, '..', 'runtime', loaderName),
        path.resolve(__dirname, '..', '..', 'dist', 'runtime', loaderName),
        path.resolve(__dirname, '..', 'runtime', 'loader.js'),
        path.resolve(__dirname, '..', '..', 'dist', 'runtime', 'loader.js')
    ];

    let loaderScript = '';
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            loaderScript = fs.readFileSync(p, 'utf-8');
            break;
        }
    }

    if (!loaderScript) {
        throw new Error(`Runtime loader not found for ${compression}. Checked paths: ${candidatePaths.join(', ')}`);
    }

    // Determine target channels
    const targetChannels = (options.channels && options.channels.length > 0)
        ? options.channels
        : ['common'];

    const staticDir = path.resolve(__dirname, '..', '..', 'static');
    const outputs: PackResultOutput[] = [];

    report(80, `Generating playable ads for ${targetChannels.length} channel(s)...`);

    for (let i = 0; i < targetChannels.length; i++) {
        const channelName = targetChannels[i];
        const channelInfo = getChannelInfo(channelName);
        const snippet = getChannelSnippet(channelName, staticDir);

        // Assemble single HTML file
        let assembledHtml = baseHtml;

        // 1. Inject Channel meta into <head>
        let headInjection = '';
        if (snippet.metaHtml) {
            headInjection += `\n${snippet.metaHtml}\n`;
        }
        if (snippet.headJs) {
            headInjection += `\n<script type="text/javascript">\n${snippet.headJs}\n</script>\n`;
        }
        if (headInjection) {
            assembledHtml = assembledHtml.replace('</head>', () => `${headInjection}</head>`);
        }

        // 2. Inject Payload and Scripts before </body>
        const metaJson = JSON.stringify({
            encoding,
            compression,
            size: payloadBytes.length,
            channel: channelName
        });

        const urlsJson = JSON.stringify({
            ios: options.iosUrl || '',
            android: options.androidUrl || ''
        });

        let bodyInjection = `
<script type="text/javascript">
window.__pts_meta = ${metaJson};
window.pTS_urls = ${urlsJson};
window.pTS_html = window.super_html = {
    appstore_url: ${JSON.stringify(options.iosUrl || '')},
    google_play_url: ${JSON.stringify(options.androidUrl || '')},
    ios_url: ${JSON.stringify(options.iosUrl || '')},
    android_url: ${JSON.stringify(options.androidUrl || '')}
};
</script>
`;

        if (snippet.scriptJs) {
            bodyInjection += `
<script type="text/javascript">
/* Channel Adapter: ${channelName} */
${snippet.scriptJs}
</script>
`;
        }

        bodyInjection += `
<script type="text/javascript">
${loaderScript}
</script>
<script id="__pts_payload" type="text/plain">
${encodedPayload}
</script>
`;

        assembledHtml = assembledHtml.replace('</body>', () => `${bodyInjection}</body>`);

        // Channel output folder: e.g. super-html/<channelName>/
        const channelOutDir = path.join(outDir, channelName);
        if (!fs.existsSync(channelOutDir)) {
            fs.mkdirSync(channelOutDir, { recursive: true });
        }

        // Write HTML file
        const htmlFileName = `${projectTitle}_${channelName}.html`;
        const htmlFilePath = path.join(channelOutDir, htmlFileName);
        fs.writeFileSync(htmlFilePath, assembledHtml, 'utf-8');

        outputs.push({
            channel: channelName,
            path: htmlFilePath,
            size: fs.statSync(htmlFilePath).size,
            encoding,
            compression
        });

        // If channel is a ZIP channel, also produce the required .zip wrapper
        if (channelInfo.isZip) {
            const channelZip = new JSZip();
            channelZip.file('index.html', assembledHtml);
            const channelZipBuffer = await channelZip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 }
            });
            const zipFileName = `${projectTitle}_${channelName}.zip`;
            const zipFilePath = path.join(channelOutDir, zipFileName);
            fs.writeFileSync(zipFilePath, channelZipBuffer);

            outputs.push({
                channel: channelName,
                path: zipFilePath,
                size: channelZipBuffer.length,
                encoding,
                compression
            });
        }
    }

    report(100, 'Pack complete!');

    return {
        success: true,
        sourceFiles: sourceFileCount,
        zipBytes: payloadBytes.length,
        outputs,
        imageSavingsBytes,
        audioSavingsBytes,
        fontSavingsBytes,
        meshSavingsBytes,
        durationMs: Date.now() - startTime
    };
}
