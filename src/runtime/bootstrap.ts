/**
 * pTS Super HTML - Browser Runtime Bootstrap
 * Self-contained client-side loader for Cocos Creator 3.8.8 single-file playable ads.
 */

declare const JSZip: any;
declare const fflate: any;

interface VirtualFile {
    data: Uint8Array;
    mime: string;
    text?: string;
}

interface MetaInfo {
    encoding: 'base64' | 'base122';
    compression?: 'zip-fast' | 'zip-standard' | 'solid-deflate';
    size: number;
    channel?: string;
}

declare global {
    interface Window {
        __pts_meta?: MetaInfo;
        __pts_payload?: string;
        __res: Record<string, VirtualFile>;
        pTS_urls?: { ios: string; android: string };
        pTS_html?: any;
        pTS_log: (msg: any, ...args: any[]) => void;
        pTS_open: (url?: string) => void;
        pTS_get_url: (url?: string) => string;
        pTS_boot_engine: () => void;
        pTS_check_channel: (c: any) => boolean;
        pTS_reg_search: (regex: RegExp) => string;
        pTS_eval: (path: string) => void;
        super_html?: any;
        super_log: (msg: any, ...args: any[]) => void;
        super_open: (url?: string) => void;
        super_get_url?: (url?: string) => string;
        super_boot_engine: () => void;
        super_check_channel: (c: any) => boolean;
        super_reg_search: (regex: RegExp) => string;
        super_eval: (path: string) => void;
        System?: any;
        cc?: any;
    }
}

// Inline KevinAlbs Base122 decoder
const B122_ILLEGAL = [0, 10, 13, 34, 38, 92];
const B122_ILLEGAL_MAP = new Map<number, number>(B122_ILLEGAL.map((val, idx) => [val, idx]));

function unescapeBase122FromHtml(value: string): string {
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

function decodeBase122(str: string): Uint8Array {
    const sevenBits: number[] = [];
    for (let index = 0; index < str.length; index++) {
        const code = str.charCodeAt(index);
        if (code > 127) {
            if (code > 0x7ff) throw new Error('Invalid base122 code point.');
            const marker = (code >>> 8) & 7;
            if (marker !== 7) {
                if (marker >= B122_ILLEGAL.length) throw new Error('Invalid base122 marker.');
                sevenBits.push(B122_ILLEGAL[marker]);
                sevenBits.push(code & 127);
            } else {
                const illegalIndex = code & 127;
                if (illegalIndex >= B122_ILLEGAL.length) throw new Error('Invalid base122 trailing marker.');
                sevenBits.push(B122_ILLEGAL[illegalIndex]);
            }
        } else {
            if (B122_ILLEGAL_MAP.has(code)) throw new Error('Invalid base122 byte.');
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
        }
    }
    return new Uint8Array(bytes);
}

function decodeBase64(base64: string): Uint8Array {
    const raw = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}

// MIME type detector
function getMimeType(fileName: string): string {
    const ext = fileName.slice(((fileName.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
    switch (ext) {
        case 'json': return 'application/json';
        case 'js': return 'application/javascript';
        case 'wasm': return 'application/wasm';
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'gif': return 'image/gif';
        case 'svg': return 'image/svg+xml';
        case 'mp3': return 'audio/mpeg';
        case 'ogg': return 'audio/ogg';
        case 'wav': return 'audio/wav';
        case 'm4a': return 'audio/m4a';
        case 'mp4': return 'video/mp4';
        case 'ttf': return 'font/ttf';
        case 'woff': return 'font/woff';
        case 'woff2': return 'font/woff2';
        case 'css': return 'text/css';
        case 'html': return 'text/html';
        case 'txt': return 'text/plain';
        case 'bin':
        case 'mem': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}

// Virtual file lookup with path normalization
function getVirtualFile(rawUrl: string): VirtualFile | null {
    if (!rawUrl || typeof rawUrl !== 'string' || !window.__res) return null;
    let url = rawUrl.split('?')[0].split('#')[0];
    if (url.indexOf('://') !== -1) {
        try {
            const parsed = new URL(url);
            url = parsed.pathname;
        } catch (_) {
            url = url.slice(url.indexOf('://') + 3);
            const slashIdx = url.indexOf('/');
            if (slashIdx !== -1) url = url.slice(slashIdx);
        }
    }

    url = url.replace(/\\/g, '/');
    while (url.startsWith('./') || url.startsWith('/')) {
        url = url.startsWith('./') ? url.slice(2) : url.slice(1);
    }

    if (window.__res[url]) {
        return window.__res[url];
    }

    // Try with assets/ prefix
    if (!url.startsWith('assets/') && window.__res['assets/' + url]) {
        return window.__res['assets/' + url];
    }

    // Try without assets/ prefix
    if (url.startsWith('assets/') && window.__res[url.slice(7)]) {
        return window.__res[url.slice(7)];
    }

    // Fallback: match by suffix
    const keys = Object.keys(window.__res);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === url || url.endsWith('/' + key) || key.endsWith('/' + url)) {
            return window.__res[key];
        }
    }

    return null;
}

function isIos(): boolean {
    const ua = (typeof navigator !== 'undefined' && (navigator.userAgent || navigator.vendor)) || '';
    const platform = (typeof navigator !== 'undefined' && navigator.platform) || '';
    return /iPad|iPhone|iPod/.test(ua) || (/MacIntel/.test(platform) && typeof navigator !== 'undefined' && (navigator as any).maxTouchPoints > 1);
}

// Main bootstrap routine
export async function initRuntime(): Promise<void> {
    window.pTS_log = function(msg: any, ...args: any[]) {
        console.log('[pTS-super-html] ' + msg, ...args);
    };
    window.super_log = window.pTS_log;

    window.pTS_get_url = function(url?: string): string {
        if (url && typeof url === 'string' && url.trim().length > 0) return url.trim();
        const urls = window.pTS_urls || { ios: '', android: '' };
        const htmlObj = (window as any).pTS_html || (window as any).super_html || {};
        const iosUrl = urls.ios || htmlObj.appstore_url || htmlObj.ios_url || '';
        const androidUrl = urls.android || htmlObj.google_play_url || htmlObj.android_url || '';

        const resolved = isIos() ? (iosUrl || androidUrl) : (androidUrl || iosUrl);
        return resolved || htmlObj.download_url || '';
    };
    window.super_get_url = window.pTS_get_url;

    window.pTS_open = function(url?: string) {
        const targetUrl = window.pTS_get_url(url);
        window.pTS_log('Opening CTA URL: ' + targetUrl);
        if (targetUrl) {
            try {
                window.open(targetUrl, '_blank');
            } catch (_) {
                window.location.href = targetUrl;
            }
        }
    };
    window.super_open = window.pTS_open;

    window.pTS_check_channel = function(c: any) {
        if (!c) {
            window.pTS_log('Channel SDK check returned false (running in preview mode)');
            return false;
        }
        return true;
    };
    window.super_check_channel = window.pTS_check_channel;

    window.pTS_reg_search = function(regex: RegExp) {
        if (!window.__res) return '';
        for (const d in window.__res) {
            if (regex.test(d)) return d;
        }
        return '';
    };
    window.super_reg_search = window.pTS_reg_search;

    window.pTS_eval = function(path: string) {
        const vf = getVirtualFile(path);
        if (vf) {
            (0, eval)(vf.text || new TextDecoder().decode(vf.data));
        }
    };
    window.super_eval = window.pTS_eval;

    const defaultHtmlHandlers = {
        download: function(url?: string) {
            window.pTS_open(url);
        },
        game_ready: function() {
            window.pTS_boot_engine();
        },
        game_end: function() {},
        is_audio: function() { return true; },
        is_hide_download: function() { return false; }
    };

    let activeHtml = Object.assign({}, defaultHtmlHandlers, (window as any).pTS_html || (window as any).super_html || {});
    try {
        Object.defineProperty(window, 'pTS_html', {
            get() { return activeHtml; },
            set(v) { activeHtml = Object.assign({}, defaultHtmlHandlers, activeHtml, v || {}); },
            configurable: true,
            enumerable: true
        });
        Object.defineProperty(window, 'super_html', {
            get() { return activeHtml; },
            set(v) { activeHtml = Object.assign({}, defaultHtmlHandlers, activeHtml, v || {}); },
            configurable: true,
            enumerable: true
        });
    } catch (_) {
        (window as any).pTS_html = activeHtml;
        (window as any).super_html = activeHtml;
    }

    window.__res = window.__res || {};

    // Install early global DOM & network hooks before any scripts execute
    hookFetch();
    hookXhr();
    hookImageElement();
    hookMediaElement();
    hookStyleElement();
    hookScriptElement();
    hookCocosDownloader();

    const meta = window.__pts_meta || { encoding: 'base64', size: 0 };
    let payload = '';
    const el = document.getElementById('__pts_payload');
    if (el) {
        payload = el.textContent || '';
    } else if (typeof window.__pts_payload === 'string') {
        payload = window.__pts_payload;
    }

    if (!payload) {
        console.error('[pTS-super-html] Missing playable payload.');
        return;
    }

    const compression = meta.compression || 'zip-fast';
    window.pTS_log('Unpacking payload with compression:', compression, 'encoding:', meta.encoding);

    let payloadBytes: Uint8Array;
    if (meta.encoding === 'base122') {
        const unescaped = unescapeBase122FromHtml(payload.trim());
        payloadBytes = decodeBase122(unescaped);
    } else {
        payloadBytes = decodeBase64(payload.trim());
    }

    const textDecoder = new TextDecoder('utf-8');

    function registerFile(rawPath: string, data: Uint8Array) {
        const cleanName = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
        const mime = getMimeType(cleanName);
        const isText = /^(application\/json|application\/javascript|text\/)/.test(mime);
        window.__res[cleanName] = {
            data,
            mime,
            text: isText ? textDecoder.decode(data) : undefined
        };
    }

    const flateObj = (typeof fflate !== 'undefined' ? fflate : (window as any).fflate) || null;

    if (compression === 'solid-deflate') {
        if (!flateObj) {
            throw new Error('[pTS-super-html] fflate runtime is required for solid-deflate.');
        }
        const raw = flateObj.inflateSync(payloadBytes);
        const view = new DataView(raw.buffer, raw.byteOffset, 4);
        const manifestLen = view.getUint32(0, true);
        const manifestJson = textDecoder.decode(raw.subarray(4, 4 + manifestLen));
        const manifest: [string, number, number][] = JSON.parse(manifestJson);
        const dataStart = 4 + manifestLen;
        for (let i = 0; i < manifest.length; i++) {
            const [relPath, offset, length] = manifest[i];
            const fileData = raw.subarray(dataStart + offset, dataStart + offset + length);
            registerFile(relPath, fileData);
        }
    } else if (compression === 'zip-fast') {
        if (!flateObj) {
            throw new Error('[pTS-super-html] fflate runtime is required for zip-fast.');
        }
        const unzipped = flateObj.unzipSync(payloadBytes);
        for (const relPath in unzipped) {
            registerFile(relPath, unzipped[relPath]);
        }
    } else {
        // 'zip-standard' (JSZip with fflate fallback)
        if (typeof JSZip !== 'undefined') {
            const zip = await JSZip.loadAsync(payloadBytes);
            const extractPromises: Promise<void>[] = [];
            zip.forEach((relPath: string, file: any) => {
                if (file.dir) return;
                const p = file.async('uint8array').then((data: Uint8Array) => {
                    registerFile(relPath, data);
                });
                extractPromises.push(p);
            });
            await Promise.all(extractPromises);
        } else if (flateObj) {
            const unzipped = flateObj.unzipSync(payloadBytes);
            for (const relPath in unzipped) {
                registerFile(relPath, unzipped[relPath]);
            }
        } else {
            throw new Error('[pTS-super-html] No ZIP decompressor available.');
        }
    }

    window.pTS_log('Extracted', Object.keys(window.__res).length, 'virtual files.');

    // Execute polyfills bundle
    const polyfills = getVirtualFile('src/polyfills.bundle.js') || getVirtualFile('polyfills.bundle.js');
    if (polyfills) {
        window.pTS_log('Evaluating polyfills.bundle.js');
        (0, eval)(polyfills.text || textDecoder.decode(polyfills.data));
    }

    // Execute system.bundle.js
    const system = getVirtualFile('src/system.bundle.js') || getVirtualFile('system.bundle.js');
    if (system) {
        window.pTS_log('Evaluating system.bundle.js');
        (0, eval)(system.text || textDecoder.decode(system.data));
    }

    // Configure SystemJS
    if (window.System) {
        window.System.shouldFetch = function(url: string) {
            if (!url || typeof url !== 'string') return false;
            if (url.startsWith('virtual:') || url.startsWith('chunks:')) return false;
            if (getVirtualFile(url)) return true;
            return false;
        };

        const origInstantiate = window.System.instantiate;
        window.System.instantiate = function(url: string, parent: string) {
            if (url && typeof url === 'string' && url.startsWith('virtual:///prerequisite-imports/')) {
                const bundleName = url.replace('virtual:///prerequisite-imports/', '');
                const vf = getVirtualFile(`assets/${bundleName}/index.js`);
                if (vf) {
                    (0, eval)(vf.text || textDecoder.decode(vf.data));
                    if (this.registerRegistry && this.registerRegistry[url]) {
                        const reg = this.registerRegistry[url];
                        delete this.registerRegistry[url];
                        return reg;
                    }
                }
            }
            return origInstantiate.apply(this, arguments as any);
        };

        const origCreateScript = window.System.constructor.prototype.createScript;
        window.System.constructor.prototype.createScript = function(url: string) {
            const vf = getVirtualFile(url);
            if (vf) {
                const s = document.createElement('script');
                s.async = true;
                const blob = new Blob([vf.data as any], { type: 'application/javascript' });
                s.src = URL.createObjectURL(blob);
                return s;
            }
            return origCreateScript ? origCreateScript.call(this, url) : document.createElement('script');
        };

        // Ingest import-map.json
        const mapFile = getVirtualFile('src/import-map.json') || getVirtualFile('import-map.json');
        if (mapFile) {
            const mapText = mapFile.text || textDecoder.decode(mapFile.data);
            const mapScript = document.createElement('script');
            mapScript.type = 'systemjs-importmap';
            mapScript.textContent = mapText;
            document.head.appendChild(mapScript);
        }
    }

    // Define engine boot function
    let isBooted = false;
    window.pTS_boot_engine = function() {
        if (isBooted) {
            window.pTS_log('Cocos Creator engine already booted.');
            try {
                if (window.cc && window.cc.game && typeof window.cc.game.resume === 'function') {
                    window.cc.game.resume();
                }
            } catch (_) {}
            return;
        }
        isBooted = true;
        window.pTS_log('Booting Cocos Creator engine...');
        hookCocosDownloader();
        hookAudio();

        let entry = 'index.js';
        const keys = Object.keys(window.__res);
        for (let i = 0; i < keys.length; i++) {
            if (/^index(\.[a-zA-Z0-9]+)?\.js$/.test(keys[i])) {
                entry = keys[i];
                break;
            }
        }

        if (window.System && window.System.import) {
            window.System.import('./' + entry).then(() => {
                window.pTS_log('Cocos Creator engine initialized.');
                hookCocosDownloader();
                hookAudio();
            }).catch((err: any) => {
                console.error('[pTS-super-html] Engine boot failed:', err);
            });
        } else {
            console.error('[pTS-super-html] SystemJS not available.');
        }
    };
    window.super_boot_engine = window.pTS_boot_engine;


    // Trigger channel ready
    const htmlHandler = (window as any).pTS_html || (window as any).super_html;
    if (htmlHandler && typeof htmlHandler.game_ready === 'function') {
        htmlHandler.game_ready();
    } else {
        window.pTS_boot_engine();
    }
}

// Fetch hook: returns standard Response objects
function hookFetch(): void {
    const origFetch = window.fetch;
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === 'string' ? input : ((input as any)?.url ? (input as any).url : String(input));
        const vf = getVirtualFile(url);
        if (vf) {
            return new Response(vf.data as any, {
                status: 200,
                statusText: 'OK',
                headers: new Headers({
                    'Content-Type': vf.mime,
                    'Content-Length': String(vf.data.byteLength),
                    'Access-Control-Allow-Origin': '*'
                })
            });
        }
        return origFetch.apply(this, arguments as any);
    };
}

// XMLHttpRequest hook
function hookXhr(): void {
    const OrigXHR = window.XMLHttpRequest;
    (window as any).XMLHttpRequest = function() {
        const xhr = new OrigXHR();
        let vf: VirtualFile | null = null;
        let requestUrl = '';

        const origOpen = xhr.open;
        xhr.open = function(method: string, url: string | URL) {
            requestUrl = String(url);
            vf = getVirtualFile(requestUrl);
            if (vf) return;
            return origOpen.apply(this, arguments as any);
        };

        const origSend = xhr.send;
        xhr.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
            if (vf) {
                setTimeout(() => {
                    const data = vf!.data;
                    let responseData: any;
                    const rType = xhr.responseType;
                    if (rType === 'json') {
                        try {
                            responseData = JSON.parse(new TextDecoder().decode(data));
                        } catch (_) {
                            responseData = null;
                        }
                    } else if (rType === 'text' || rType === '') {
                        responseData = new TextDecoder().decode(data);
                    } else if (rType === 'arraybuffer') {
                        responseData = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
                    } else if (rType === 'blob') {
                        responseData = new Blob([data as any], { type: vf!.mime });
                    } else {
                        responseData = data.buffer;
                    }

                    Object.defineProperty(xhr, 'status', { value: 200, writable: false });
                    Object.defineProperty(xhr, 'statusText', { value: 'OK', writable: false });
                    Object.defineProperty(xhr, 'readyState', { value: 4, writable: false });
                    Object.defineProperty(xhr, 'response', { value: responseData, writable: false });
                    Object.defineProperty(xhr, 'responseText', { value: typeof responseData === 'string' ? responseData : '', writable: false });

                    if (typeof xhr.onreadystatechange === 'function') {
                        xhr.onreadystatechange(new Event('readystatechange'));
                    }
                    if (typeof xhr.onload === 'function') {
                        xhr.onload(new ProgressEvent('load'));
                    } else {
                        xhr.dispatchEvent(new Event('load'));
                    }
                    if (typeof xhr.onloadend === 'function') {
                        xhr.onloadend(new ProgressEvent('loadend'));
                    } else {
                        xhr.dispatchEvent(new Event('loadend'));
                    }
                }, 0);
                return;
            }
            return origSend.apply(this, arguments as any);
        };

        return xhr;
    };
}

// Global Image.src hook: automatically transforms virtual file paths to Blob URLs
function hookImageElement(): void {
    if (typeof HTMLImageElement === 'undefined') return;
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!desc || !desc.set) return;

    const origSet = desc.set;
    const origGet = desc.get;

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        get() {
            return origGet ? origGet.call(this) : '';
        },
        set(url: string) {
            if (url && typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')) {
                const vf = getVirtualFile(url);
                if (vf) {
                    const blob = new Blob([vf.data as any], { type: vf.mime });
                    const blobUrl = URL.createObjectURL(blob);
                    origSet.call(this, blobUrl);
                    return;
                }
            }
            origSet.call(this, url);
        },
        configurable: true,
        enumerable: true
    });
}

// Global Media (Audio/Video).src hook
function hookMediaElement(): void {
    if (typeof HTMLMediaElement === 'undefined') return;
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (!desc || !desc.set) return;

    const origSet = desc.set;
    const origGet = desc.get;

    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get() {
            return origGet ? origGet.call(this) : '';
        },
        set(url: string) {
            if (url && typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')) {
                const vf = getVirtualFile(url);
                if (vf) {
                    const blob = new Blob([vf.data as any], { type: vf.mime });
                    const blobUrl = URL.createObjectURL(blob);
                    origSet.call(this, blobUrl);
                    return;
                }
            }
            origSet.call(this, url);
        },
        configurable: true,
        enumerable: true
    });
}

// Intercept HTMLStyleElement textContent for @font-face { src: url(...) }
function hookStyleElement(): void {
    if (typeof Node === 'undefined' || typeof HTMLStyleElement === 'undefined') return;
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (!desc || !desc.set) return;

    const origSet = desc.set;
    const origGet = desc.get;

    Object.defineProperty(HTMLStyleElement.prototype, 'textContent', {
        get() {
            return origGet ? origGet.call(this) : '';
        },
        set(text: string) {
            if (text && typeof text === 'string' && text.includes('@font-face')) {
                text = text.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, q, fontUrl) => {
                    const vf = getVirtualFile(fontUrl);
                    if (vf) {
                        const blob = new Blob([vf.data as any], { type: vf.mime });
                        const blobUrl = URL.createObjectURL(blob);
                        return `url("${blobUrl}")`;
                    }
                    return match;
                });
            }
            origSet.call(this, text);
        },
        configurable: true,
        enumerable: true
    });
}

// Cocos AssetManager Downloader hooks
function hookCocosDownloader(): void {
    const hookInstance = (ccInst: any) => {
        if (!ccInst || !ccInst.assetManager) return;
        const assetManager = ccInst.assetManager;
        const downloader = assetManager.downloader;
        if (!downloader || downloader.__pts_hooked) return;
        downloader.__pts_hooked = true;

        // Custom downloadDomImage that serves directly from virtual files
        downloader.downloadDomImage = function(url: string, options: any, onComplete: any) {
            if (typeof options === 'function') {
                onComplete = options;
                options = {};
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const cleanup = () => {
                img.removeEventListener('load', onLoad);
                img.removeEventListener('error', onError);
            };
            const onLoad = () => {
                cleanup();
                if (onComplete) onComplete(null, img);
            };
            const onError = () => {
                cleanup();
                if (onComplete) onComplete(new Error('Failed to load image: ' + url));
            };

            img.addEventListener('load', onLoad);
            img.addEventListener('error', onError);

            const vf = getVirtualFile(url);
            if (vf) {
                const blob = new Blob([vf.data as any], { type: vf.mime });
                img.src = URL.createObjectURL(blob);
            } else {
                img.src = url;
            }
            return img;
        };

        const imageHandler = function(url: string, options: any, onComplete: any) {
            return downloader.downloadDomImage(url, options, onComplete);
        };

        const fontHandler = function(url: string, options: any, onComplete: any) {
            if (typeof options === 'function') {
                onComplete = options;
                options = {};
            }
            const vf = getVirtualFile(url);
            if (!vf) {
                if (onComplete) onComplete(null, url);
                return;
            }
            const family = 'font_' + url.replace(/[^a-zA-Z0-9]/g, '_');
            const blob = new Blob([vf.data as any], { type: vf.mime });
            const fontUrl = URL.createObjectURL(blob);
            if (typeof (window as any).FontFace !== 'undefined') {
                const fontFace = new (window as any).FontFace(family, `url("${fontUrl}")`);
                (document as any).fonts.add(fontFace);
                fontFace.load().then(() => {
                    if (onComplete) onComplete(null, family);
                }).catch(() => {
                    if (onComplete) onComplete(null, family);
                });
            } else {
                if (onComplete) onComplete(null, family);
            }
        };

        const scriptHandler = function(url: string, options: any, onComplete: any) {
            if (typeof options === 'function') {
                onComplete = options;
                options = {};
            }
            const vf = getVirtualFile(url);
            if (vf) {
                const scriptText = vf.text || new TextDecoder().decode(vf.data);
                try {
                    (0, eval)(scriptText);
                    if (onComplete) onComplete(null);
                } catch (err) {
                    console.error('[pTS-super-html] Error executing virtual script: ' + url, err);
                    if (onComplete) onComplete(err);
                }
                return;
            }
            const s = document.createElement('script');
            s.onload = () => { if (onComplete) onComplete(null); };
            s.onerror = (e) => { if (onComplete) onComplete(new Error('Failed to load script: ' + url)); };
            s.src = url;
            document.head.appendChild(s);
        };

        const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.image'];
        const imgMap: Record<string, any> = {};
        imageExts.forEach(ext => { imgMap[ext] = imageHandler; });
        downloader.register(imgMap);

        const fontExts = ['.font', '.eot', '.ttf', '.woff', '.woff2', '.svg', '.ttc'];
        const fontMap: Record<string, any> = {};
        fontExts.forEach(ext => { fontMap[ext] = fontHandler; });
        downloader.register(fontMap);

        downloader.register({ '.js': scriptHandler });
    };

    // If cc is already available
    if ((window as any).cc) {
        hookInstance((window as any).cc);
    }

    // Reactive setter on window.cc
    let currentCc = (window as any).cc;
    try {
        Object.defineProperty(window, 'cc', {
            get() { return currentCc; },
            set(v) {
                currentCc = v;
                if (v) hookInstance(v);
            },
            configurable: true,
            enumerable: true
        });
    } catch (_) {}

    // Periodic polling to catch engine instances created asynchronously
    let pollCount = 0;
    const interval = setInterval(() => {
        pollCount++;
        if ((window as any).cc && (window as any).cc.assetManager) {
            hookInstance((window as any).cc);
        }
        if (pollCount > 30) clearInterval(interval);
    }, 300);
}

// Hook document.createElement('script') to resolve src from virtual files
function hookScriptElement(): void {
    if (typeof document === 'undefined') return;
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName: string, options?: any) {
        const el = origCreateElement(tagName, options);
        if (tagName && tagName.toLowerCase() === 'script') {
            let _src = '';
            Object.defineProperty(el, 'src', {
                get() {
                    return _src;
                },
                set(val: string) {
                    _src = val;
                    const vf = getVirtualFile(val);
                    if (vf) {
                        const blob = new Blob([vf.data as any], { type: 'application/javascript' });
                        el.setAttribute('src', URL.createObjectURL(blob));
                    } else {
                        el.setAttribute('src', val);
                    }
                },
                configurable: true
            });
        }
        return el;
    };
}

// Audio mute / unmute hook
function hookAudio(): void {
    if (!window.cc || !window.cc.AudioSource || !window.cc.AudioSource.prototype) return;

    const proto = window.cc.AudioSource.prototype;
    if (proto.__pts_hooked) return;
    proto.__pts_hooked = true;

    function isAudioEnabled(): boolean {
        const html = (window as any).pTS_html || (window as any).super_html;
        if (html && typeof html.is_audio === 'function') {
            return html.is_audio();
        }
        return true;
    }

    const origPlay = proto.play;
    proto.play = function() {
        if (!isAudioEnabled()) {
            return;
        }
        return origPlay.apply(this, arguments as any);
    };

    const origPlayOneShot = proto.playOneShot;
    if (origPlayOneShot) {
        proto.playOneShot = function() {
            if (!isAudioEnabled()) {
                return;
            }
            return origPlayOneShot.apply(this, arguments as any);
        };
    }
}
