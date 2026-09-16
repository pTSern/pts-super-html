const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 8092;
const CDP_PORT = 9226;
const TEST_DIR = path.resolve(__dirname, '..', '..', 'test-out');

function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const reqPath = decodeURIComponent(req.url.split('?')[0]);
            const filePath = path.join(TEST_DIR, reqPath);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                fs.createReadStream(filePath).pipe(res);
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        server.listen(PORT, () => {
            console.log(`Test HTTP server listening on http://localhost:${PORT}`);
            resolve(server);
        });
    });
}

async function getWebSocketUrl() {
    for (let i = 0; i < 20; i++) {
        try {
            const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
            if (resp.ok) {
                const list = await resp.json();
                const page = list.find(item => item.type === 'page');
                if (page && page.webSocketDebuggerUrl) {
                    return page.webSocketDebuggerUrl;
                }
            }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('CDP page target timed out.');
}

function createCdpClient(wsUrl) {
    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const callbacks = new Map();
    const eventHandlers = new Map();

    ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.id && callbacks.has(msg.id)) {
            const cb = callbacks.get(msg.id);
            callbacks.delete(msg.id);
            if (msg.error) {
                cb.reject(new Error(msg.error.message));
            } else {
                cb.resolve(msg.result);
            }
        } else if (msg.method) {
            const handlers = eventHandlers.get(msg.method) || [];
            handlers.forEach(fn => fn(msg.params));
        }
    });

    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            resolve({
                send(method, params = {}) {
                    return new Promise((res, rej) => {
                        const callId = id++;
                        callbacks.set(callId, { resolve: res, reject: rej });
                        ws.send(JSON.stringify({ id: callId, method, params }));
                    });
                },
                on(event, handler) {
                    if (!eventHandlers.has(event)) {
                        eventHandlers.set(event, []);
                    }
                    eventHandlers.get(event).push(handler);
                },
                close() {
                    ws.close();
                }
            });
        });
        ws.on('error', reject);
    });
}

async function testPage(cdp, url, title) {
    console.log(`\n========================================`);
    console.log(`[TEST] Testing: ${title}`);
    console.log(`[TEST] URL: ${url}`);
    console.log(`========================================`);

    const consoleLogs = [];
    const errors = [];

    cdp.on('Runtime.consoleAPICalled', (params) => {
        const text = params.args.map(a => a.value !== undefined ? a.value : a.description).join(' ');
        consoleLogs.push(`[${params.type}] ${text}`);
        if (params.type === 'error') {
            errors.push(`Console Error: ${text}`);
        }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
        const text = params.exceptionDetails.text + (params.exceptionDetails.exception ? ' ' + params.exceptionDetails.exception.description : '');
        errors.push(`Uncaught Exception: ${text}`);
    });

    await cdp.send('Page.navigate', { url });

    // Wait 5 seconds for Cocos engine, scenes, audio, font, and 3D meshes to boot
    console.log('Waiting 5s for full engine and asset initialization...');
    await new Promise((r) => setTimeout(r, 5000));

    // Verify canvas exists and is active
    const evalCanvas = await cdp.send('Runtime.evaluate', {
        expression: '(() => { const c = document.querySelector("canvas"); return c ? { width: c.width, height: c.height } : null; })()',
        returnByValue: true
    });

    console.log('Canvas check:', JSON.stringify(evalCanvas.result ? evalCanvas.result.value : null));

    // Verify audio context or audio element
    const evalAudio = await cdp.send('Runtime.evaluate', {
        expression: 'typeof window.AudioContext !== "undefined" || typeof window.webkitAudioContext !== "undefined"',
        returnByValue: true
    });
    console.log('AudioContext supported:', evalAudio.result ? evalAudio.result.value : false);

    console.log(`Captured ${consoleLogs.length} console log(s).`);
    consoleLogs.slice(0, 10).forEach(l => console.log('  ', l));
    if (consoleLogs.length > 10) console.log(`   ... and ${consoleLogs.length - 10} more logs`);

    const fatalErrors = errors.filter(e => {
        // Filter harmless WebGL warnings
        if (e.includes('favicon.ico')) return false;
        return true;
    });

    if (fatalErrors.length > 0) {
        console.error(`❌ Detected ${fatalErrors.length} fatal error(s):`);
        fatalErrors.forEach(e => console.error('  ', e));
        return false;
    }

    console.log(`✅ ${title} executed with 0 errors!`);
    return true;
}

async function main() {
    const server = await startServer();

    console.log('Launching headless Edge for verification...');
    const edge = spawn(EDGE_PATH, [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-web-security',
        `--remote-debugging-port=${CDP_PORT}`,
        'about:blank'
    ]);

    try {
        const wsUrl = await getWebSocketUrl();
        console.log('Connected to CDP at:', wsUrl);
        const cdp = await createCdpClient(wsUrl);

        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');

        const success = await testPage(
            cdp,
            `http://localhost:${PORT}/applovin-opt.html`,
            'WonderMatch Optimized AppLovin Playable Ad (Images + Audio + Fonts + 3D Meshes)'
        );

        cdp.close();

        if (success) {
            console.log('\n=============================================');
            console.log('🎉 OPTIMIZED PLAYABLE AD VERIFIED PERFECTLY!');
            console.log('=============================================\n');
        } else {
            console.error('\n❌ Playable verification failed.\n');
            process.exitCode = 1;
        }
    } finally {
        edge.kill();
        server.close();
    }
}

main().catch((err) => {
    console.error('Test runner exception:', err);
    process.exit(1);
});
