const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 8095;
const CDP_PORT = 9229;
const FILE_PATH = 'E:\\__pTSern\\PLACore\\build\\super-html\\common\\WonderMatch_TSon_15-09-2_5_common.html';

function startServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            if (fs.existsSync(FILE_PATH)) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                fs.createReadStream(FILE_PATH).pipe(res);
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        server.listen(PORT, () => {
            console.log(`Test server listening on http://localhost:${PORT}`);
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
                cb.reject(new Error(msg.error.message || 'CDP Error'));
            } else {
                cb.resolve(msg.result);
            }
        }
        if (msg.method && eventHandlers.has(msg.method)) {
            eventHandlers.get(msg.method)(msg.params);
        }
    });

    return new Promise((resolve) => {
        ws.on('open', () => {
            const send = (method, params = {}) => {
                return new Promise((res, rej) => {
                    const callId = id++;
                    callbacks.set(callId, { resolve: res, reject: rej });
                    ws.send(JSON.stringify({ id: callId, method, params }));
                });
            };
            const on = (method, handler) => {
                eventHandlers.set(method, handler);
            };
            resolve({ send, on, close: () => ws.close() });
        });
    });
}

async function runTest() {
    const server = await startServer();

    const userDataDir = path.join(require('os').tmpdir(), 'edge-cdp-pts-' + Date.now());
    const edge = spawn(EDGE_PATH, [
        `--remote-debugging-port=${CDP_PORT}`,
        '--headless=new',
        '--disable-gpu',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${userDataDir}`,
        'about:blank'
    ], { stdio: 'ignore' });

    try {
        const wsUrl = await getWebSocketUrl();
        const client = await createCdpClient(wsUrl);

        const logs = [];
        const errors = [];

        client.on('Runtime.consoleAPICalled', (params) => {
            const text = (params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
            logs.push(`[${params.type}] ${text}`);
        });

        client.on('Runtime.exceptionThrown', (params) => {
            const desc = params.exceptionDetails && params.exceptionDetails.exception
                ? (params.exceptionDetails.exception.description || params.exceptionDetails.text)
                : params.exceptionDetails.text;
            errors.push(desc);
        });

        await client.send('Page.enable');
        await client.send('Runtime.enable');

        console.log(`Navigating to http://localhost:${PORT}...`);
        await client.send('Page.navigate', { url: `http://localhost:${PORT}` });

        // Wait for page to initialize
        await new Promise((r) => setTimeout(r, 6000));

        // Evaluate runtime state
        const evalRes = await client.send('Runtime.evaluate', {
            expression: `({
                hasPTSOpen: typeof window.pTS_open === 'function',
                hasSuperOpen: typeof window.super_open === 'function',
                hasPTSLog: typeof window.pTS_log === 'function',
                hasSuperLog: typeof window.super_log === 'function',
                hasPTSBoot: typeof window.pTS_boot_engine === 'function',
                hasSuperBoot: typeof window.super_boot_engine === 'function',
                urls: window.pTS_urls,
                getUrlRes: window.pTS_get_url ? window.pTS_get_url() : null,
                superGetUrlRes: window.super_get_url ? window.super_get_url() : null,
                hasRes: !!window.__res,
                resCount: window.__res ? Object.keys(window.__res).length : 0,
                ccAvailable: !!window.cc
            })`,
            returnByValue: true
        });

        console.log('\n--- VERIFICATION RESULT ---');
        console.log('Evaluated properties:', JSON.stringify(evalRes.result.value, null, 2));

        const val = evalRes.result.value;
        const pass = val.hasPTSOpen &&
                     val.hasSuperOpen &&
                     val.hasPTSLog &&
                     val.hasSuperLog &&
                     val.hasPTSBoot &&
                     val.hasSuperBoot &&
                     val.urls &&
                     val.urls.android &&
                     val.getUrlRes &&
                     errors.length === 0;

        console.log('\nLogs captured:', logs.length);
        logs.slice(0, 10).forEach(l => console.log('  ', l));

        if (errors.length > 0) {
            console.error('\nErrors encountered:', errors);
        }

        if (pass) {
            console.log('\n✅ ALL VERIFICATION CHECKS PASSED!');
        } else {
            console.error('\n❌ VERIFICATION FAILED!');
            process.exit(1);
        }

        client.close();
    } finally {
        edge.kill();
        server.close();
    }
}

runTest().catch((err) => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
});
