import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { packPlayable } from '../core/pack';
import { decodeBase122, unescapeBase122FromHtml } from '../codecs/base122';

async function runPackTests() {
    console.log('--- Running Playable Ads Pack Tests ---');

    const inputDir = path.resolve(__dirname, '..', '..', '..', '..', 'build', 'web-mobile-007');
    const outDirB64 = path.resolve(__dirname, '..', '..', 'test-out', 'b64');
    const outDirB122 = path.resolve(__dirname, '..', '..', 'test-out', 'b122');

    if (!fs.existsSync(inputDir)) {
        console.warn('Skipping pack test: build/web-mobile-007 not found at:', inputDir);
        return;
    }

    console.log('Input fixture:', inputDir);

    // 1. Pack with Base64
    console.log('\nTesting Base64 packaging...');
    const resB64 = await packPlayable({
        inputDir,
        outDir: outDirB64,
        encoding: 'base64',
        channels: ['common', 'google', 'applovin'],
        isMinCss: true,
        onProgress: (pct, msg) => console.log(`  [B64 ${pct}%] ${msg}`)
    });

    if (!resB64.success) {
        throw new Error('Base64 pack failed: ' + resB64.error);
    }
    console.log(`✓ Base64 pack succeeded: ${resB64.outputs.length} outputs, zip size: ${(resB64.zipBytes / 1024).toFixed(1)} KB`);

    // 2. Pack with Base122
    console.log('\nTesting Base122 packaging...');
    const resB122 = await packPlayable({
        inputDir,
        outDir: outDirB122,
        encoding: 'base122',
        channels: ['common', 'google', 'applovin'],
        isMinCss: true,
        onProgress: (pct, msg) => console.log(`  [B122 ${pct}%] ${msg}`)
    });

    if (!resB122.success) {
        throw new Error('Base122 pack failed: ' + resB122.error);
    }
    console.log(`✓ Base122 pack succeeded: ${resB122.outputs.length} outputs, zip size: ${(resB122.zipBytes / 1024).toFixed(1)} KB`);

    // Compare sizes for common channel
    const commonHtmlB64 = resB64.outputs.find(o => o.channel === 'common' && o.path.endsWith('.html'))!;
    const commonHtmlB122 = resB122.outputs.find(o => o.channel === 'common' && o.path.endsWith('.html'))!;

    console.log('\nSize Comparison (Common HTML Playable Ad):');
    console.log(`  Base64 Output:  ${(commonHtmlB64.size / 1024).toFixed(1)} KB`);
    console.log(`  Base122 Output: ${(commonHtmlB122.size / 1024).toFixed(1)} KB`);
    const diff = commonHtmlB64.size - commonHtmlB122.size;
    const pctDiff = ((diff / commonHtmlB64.size) * 100).toFixed(2);
    console.log(`  Base122 is ${pctDiff}% smaller (saved ${(diff / 1024).toFixed(1)} KB)!`);

    // 3. Verify Payload Integrity: Extract Base122 HTML and compare files
    console.log('\nVerifying payload extraction fidelity from Base122 HTML...');
    const htmlContent = fs.readFileSync(commonHtmlB122.path, 'utf-8');
    const payloadMatch = htmlContent.match(/<script id="__pts_payload" type="text\/plain">\s*([\s\S]*?)\s*<\/script>/);
    if (!payloadMatch) {
        throw new Error('Failed to find __pts_payload script in generated HTML');
    }

    const unescaped = unescapeBase122FromHtml(payloadMatch[1].trim());
    const decodedZipBytes = decodeBase122(unescaped, resB122.zipBytes);
    const extractedZip = await JSZip.loadAsync(decodedZipBytes);

    // Verify key files match
    const checkFiles = ['application.js', 'src/settings.json', 'src/import-map.json', 'cocos-js/cc.js'];
    for (const cf of checkFiles) {
        const fileInZip = extractedZip.file(cf);
        if (!fileInZip) {
            throw new Error(`File ${cf} missing from extracted ZIP payload`);
        }
        const extractedData = await fileInZip.async('nodebuffer');
        const originalData = fs.readFileSync(path.join(inputDir, cf));
        if (Buffer.compare(extractedData, originalData) !== 0) {
            throw new Error(`Payload mismatch for ${cf}!`);
        }
    }
    console.log('✓ 100% byte fidelity verified on all tested assets!');

    console.log('\nAll Pack Tests PASSED!\n');
}

runPackTests();
