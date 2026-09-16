import { encodeBase122, decodeBase122, escapeBase122ForHtml, unescapeBase122FromHtml } from '../codecs/base122';

function runCodecTests() {
    console.log('--- Running Base122 Codec Tests ---');

    // 1. Empty buffer
    const empty = new Uint8Array(0);
    const encEmpty = encodeBase122(empty);
    const decEmpty = decodeBase122(encEmpty, 0);
    if (decEmpty.length !== 0) throw new Error('Empty buffer test failed');
    console.log('✓ Empty buffer roundtrip passed.');

    // 2. All 256 single byte values
    for (let b = 0; b < 256; b++) {
        const single = new Uint8Array([b]);
        const enc = encodeBase122(single);
        const dec = decodeBase122(enc, 1);
        if (dec.length !== 1 || dec[0] !== b) {
            throw new Error(`Single byte test failed for byte ${b}`);
        }
    }
    console.log('✓ All 256 individual byte values passed.');

    // 3. Various length buffers (1 to 64 bytes)
    for (let len = 1; len <= 64; len++) {
        const buf = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            buf[i] = (i * 37 + 13) & 0xff;
        }
        const enc = encodeBase122(buf);
        const dec = decodeBase122(enc, len);
        if (dec.length !== len) throw new Error(`Length mismatch at size ${len}`);
        for (let i = 0; i < len; i++) {
            if (dec[i] !== buf[i]) throw new Error(`Byte mismatch at size ${len}, idx ${i}`);
        }
    }
    console.log('✓ Variable length buffers (1-64 bytes) passed.');

    // 4. Large buffer & Base64 size comparison
    const LARGE_SIZE = 100000;
    const largeBuf = new Uint8Array(LARGE_SIZE);
    let seed = 12345;
    for (let i = 0; i < LARGE_SIZE; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        largeBuf[i] = seed & 0xff;
    }

    const b64 = Buffer.from(largeBuf).toString('base64');
    const b122 = encodeBase122(largeBuf);
    const escapedB122 = escapeBase122ForHtml(b122);
    const unescapedB122 = unescapeBase122FromHtml(escapedB122);
    const decLarge = decodeBase122(unescapedB122, LARGE_SIZE);

    if (decLarge.length !== LARGE_SIZE) throw new Error('Large buffer size mismatch');
    for (let i = 0; i < LARGE_SIZE; i++) {
        if (decLarge[i] !== largeBuf[i]) throw new Error(`Large buffer mismatch at index ${i}`);
    }

    const b64Bytes = b64.length;
    const b122Bytes = escapedB122.length;
    const ratio = (b122Bytes / b64Bytes) * 100;
    const savings = (100 - ratio).toFixed(2);

    console.log(`✓ 100KB Random Buffer Roundtrip: 100% Match!`);
    console.log(`  Base64 length:   ${b64Bytes.toLocaleString()} chars`);
    console.log(`  Base122 length:  ${b122Bytes.toLocaleString()} chars (with HTML escapes)`);
    console.log(`  Size relative to Base64: ${ratio.toFixed(2)}% (Savings: ${savings}%)`);

    // 5. HTML Escape safety check
    if (escapedB122.includes('<')) {
        throw new Error('Base122 HTML escaping failed: unescaped < found');
    }
    console.log('✓ HTML safety check: 0 unescaped < characters.');

    console.log('All Base122 Codec Tests PASSED!\n');
}

runCodecTests();
