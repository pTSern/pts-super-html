const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 8089;
const CDP_PORT = 9223;
const TEST_DIR = path.resolve(__dirname, '..', '..', 'test-out');

// 1. Create simple static HTTP server
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

// 2. Query CDP version to get webSocketDebuggerUrl
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

// 3. Simple CDP Client over WebSocket
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
            if (msg.error) cb.reject(msg.error);
            else cb.resolve(msg.result);
        } else if (msg.method && eventHandlers.has(msg.method)) {
            eventHandlers.get(msg.method)(msg.params);
        }
    });

    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            const send = (method, params = {}) => {
                return new Promise((res, rej) => {
                    const reqId = id++;
                    callbacks.set(reqId, { resolve: res, reject: rej });
                    ws.send(JSON.stringify({ id: reqId, method, params }));
                });
            };
            const on = (method, handler) => {
                eventHandlers.set(method, handler);
            };
            const close = () => ws.close();
            resolve({ send, on, close });
        });
        ws.on('error', reject);
    });
}

async function testPage(cdp, url, label) {
    console.log(`\n========================================`);
    console.log(`Testing [${label}]: ${url}`);
    console.log(`========================================`);

    const logs = [];
    const errors = [];

    cdp.on('Runtime.consoleAPICalled', (params) => {
        const text = params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(' ');
        logs.push(`[Console ${params.type}] ${text}`);
        console.log(`  [Console ${params.type}] ${text}`);
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
        const desc = params.exceptionDetails.exception?.description || params.exceptionDetails.text;
        errors.push(desc);
        console.error(`  [EXCEPTION] ${desc}`);
    });

    // Navigate
    await cdp.send('Page.navigate', { url });

    // Wait for engine to boot and run for 6 seconds
    await new Promise((r) => setTimeout(r, 6000));

    // Check canvas element
    const evalRes = await cdp.send('Runtime.evaluate', {
        expression: `
            (function() {
                const canvas = document.getElementById('GameCanvas');
                return {
                    hasCanvas: !!canvas,
                    canvasWidth: canvas ? canvas.width : 0,
                    canvasHeight: canvas ? canvas.height : 0,
                    hasCC: typeof cc !== 'undefined',
                    virtualFilesCount: window.__res ? Object.keys(window.__res).length : 0
                };
            })()
        `,
        returnByValue: true
    });

    console.log(`  Page Evaluation Status:`, evalRes.result?.value);

    const hasFatalErrors = errors.filter(
        (e) => !e.includes('favicon') && !e.includes('Download the Vue Devtools')
    );

    if (hasFatalErrors.length > 0) {
        console.error(`  ❌ Failed with errors:`, hasFatalErrors);
        return false;
    }

    console.log(`  ✓ ${label} executed smoothly without fatal errors!`);
    return true;
}

async function main() {
    // Check if ws package is installed
    try {
        require('ws');
    } catch (_) {
        console.log('Installing ws for CDP test...');
        const { execSync } = require('child_process');
        execSync('npm install --no-save ws', { cwd: path.resolve(__dirname, '..', '..') });
    }

    const server = await startServer();

    // Spawn Headless Edge
    console.log('Launching headless Edge...');
    const edge = spawn(EDGE_PATH, [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-web-security',
        `--remote-debugging-port=${CDP_PORT}`,
        'about:blank'
    ]);

    edge.on('error', (err) => {
        console.error('Failed to spawn Edge:', err);
    });

    try {
        const wsUrl = await getWebSocketUrl();
        console.log('Connected to CDP at:', wsUrl);
        const cdp = await createCdpClient(wsUrl);

        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');

        // Test 1: Base64
        const b64Success = await testPage(
            cdp,
            `http://localhost:${PORT}/b64/common/WonderMatch_TSon_15-09-2_5_common.html`,
            'Base64 Playable Ad'
        );

        // Test 2: Base122
        const b122Success = await testPage(
            cdp,
            `http://localhost:${PORT}/b122/common/WonderMatch_TSon_15-09-2_5_common.html`,
            'Base122 Playable Ad'
        );

        // Test 3: Google Channel
        const googleSuccess = await testPage(
            cdp,
            `http://localhost:${PORT}/b122/google/WonderMatch_TSon_15-09-2_5_google.html`,
            'Base122 Google Ads Channel'
        );

        // Test 4: AppLovin Channel
        const applovinSuccess = await testPage(
            cdp,
            `http://localhost:${PORT}/b122/applovin/WonderMatch_TSon_15-09-2_5_applovin.html`,
            'Base122 AppLovin Channel'
        );

        cdp.close();

        if (b64Success && b122Success && googleSuccess && applovinSuccess) {
            console.log('\n=============================================');
            console.log('🎉 ALL BROWSER PLAYABLE VERIFICATIONS PASSED!');
            console.log('=============================================\n');
        } else {
            console.error('\n❌ Browser playable verification failed.\n');
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
