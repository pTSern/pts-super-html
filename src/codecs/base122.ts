/**
 * Base122 encoder and decoder implementation according to KevinAlbs specification.
 * Packs 7 bits per character, avoiding the 6 illegal characters in strings/HTML:
 * \0 (0), \n (10), \r (13), " (34), & (38), \ (92).
 *
 * Results in ~14.3% smaller size than standard Base64.
 */

const ILLEGAL = [0, 10, 13, 34, 38, 92];
const ILLEGAL_MAP = new Map<number, number>(ILLEGAL.map((val, idx) => [val, idx]));

/**
 * Encodes a Uint8Array buffer into a Base122 string.
 */
export function encodeBase122(input: Uint8Array): string {
    const sevenBits: number[] = [];
    let cur = 0;
    let bitsInCur = 0;

    for (let i = 0; i < input.length; i++) {
        cur = (cur << 8) | input[i];
        bitsInCur += 8;
        while (bitsInCur >= 7) {
            bitsInCur -= 7;
            sevenBits.push((cur >>> bitsInCur) & 0x7f);
        }
    }

    if (bitsInCur > 0) {
        sevenBits.push((cur << (7 - bitsInCur)) & 0x7f);
    }

    let out = '';
    for (let i = 0; i < sevenBits.length; i++) {
        const val = sevenBits[i];
        const illegalIndex = ILLEGAL_MAP.get(val);

        if (illegalIndex === undefined) {
            out += String.fromCharCode(val);
        } else {
            if (i + 1 < sevenBits.length) {
                const nextVal = sevenBits[++i];
                const codePoint = (illegalIndex << 8) | 0x80 | nextVal;
                out += String.fromCharCode(codePoint);
            } else {
                const codePoint = (0x7 << 8) | 0x80 | illegalIndex;
                out += String.fromCharCode(codePoint);
            }
        }
    }

    return out;
}

/**
 * Decodes a Base122 string back into a Uint8Array buffer.
 * @param str Base122 string.
 * @param expectedLen Optional exact byte count to trim trailing padding bits.
 */
export function decodeBase122(str: string, expectedLen: number = -1): Uint8Array {
    const sevenBits: number[] = [];

    for (let index = 0; index < str.length; index++) {
        const code = str.charCodeAt(index);
        if (code > 127) {
            if (code > 0x7ff) throw new Error('Invalid base122 code point.');
            const marker = (code >>> 8) & 7;
            if (marker !== 7) {
                if (marker >= ILLEGAL.length) throw new Error('Invalid base122 marker.');
                sevenBits.push(ILLEGAL[marker]);
                sevenBits.push(code & 127);
            } else {
                const illegalIndex = code & 127;
                if (illegalIndex >= ILLEGAL.length) throw new Error('Invalid base122 trailing marker.');
                sevenBits.push(ILLEGAL[illegalIndex]);
            }
        } else {
            if (ILLEGAL_MAP.has(code)) throw new Error('Invalid base122 byte.');
            sevenBits.push(code);
        }
    }

    const bytes: number[] = [];
    let cur = 0;
    let bitsInCur = 0;

    for (let i = 0; i < sevenBits.length; i++) {
        cur = (cur << 7) | sevenBits[i];
        bitsInCur += 7;
        while (bitsInCur >= 8) {
            bitsInCur -= 8;
            bytes.push((cur >>> bitsInCur) & 0xff);
            if (expectedLen >= 0 && bytes.length === expectedLen) {
                return new Uint8Array(bytes);
            }
        }
    }

    return new Uint8Array(bytes);
}

/**
 * Escapes Base122 output so it is 100% safe inside HTML script tags.
 * Replaces ~ with ~~ and < with ~L to prevent premature tag closure (e.g. </script>).
 */
export function escapeBase122ForHtml(value: string): string {
    return value.replace(/~/g, '~~').replace(/</g, '~L');
}

/**
 * Unescapes Base122 string from HTML-safe format.
 */
export function unescapeBase122FromHtml(value: string): string {
    let result = '';
    for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (character !== '~') {
            result += character;
            continue;
        }
        const next = value[++index];
        if (next === '~') result += '~';
        else if (next === 'L') result += '<';
        else throw new Error('Invalid base122 HTML escape.');
    }
    return result;
}
