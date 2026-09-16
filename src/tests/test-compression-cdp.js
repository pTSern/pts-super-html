const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 8093;
const CDP_PORT = 9226;
const TEST_DIR = path.resolve(__dirname, '..', '..', 'test-out', 'compression-test');

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
                res.end('Not found: ' + reqPath);
            }
        });
        server.listen(PORT, () => resolve(server));
    });
}

async function getWebSocketUrl() {
    for (let i = 0; i < 20; i++) {
        try {
            const resp = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
            if (resp.ok) {
                const list = await resp.json();
                const page = list.find(item => item.type === 'page');
                if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
            }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('CDP timeout');
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
            if (msg.error) cb.reject(msg.error);
            else cb.resolve(msg.result);
        } else if (msg.method && eventHandlers.has(msg.method)) {
            eventHandlers.get(msg.method)(msg.params);
        }
    });
    return new Promise((resolve, reject) => {
        ws.on('open', () => {
            const send = (method, params = {}) => new Promise((res, rej) => {
                const reqId = id++;
                callbacks.set(reqId, { resolve: res, reject: rej });
                ws.send(JSON.stringify({ id: reqId, method, params }));
            });
            const on = (method, handler) => eventHandlers.set(method, handler);
            const close = () => ws.close();
            resolve({ send, on, close });
        });
        ws.on('error', reject);
    });
}

async function run() {
    const server = await startServer();
    console.log('HTTP test server running on port', PORT);
    const edge = spawn(EDGE_PATH, [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-web-security',
        '--remote-debugging-port=' + CDP_PORT,
        'about:blank'
    ]);

    try {
        const wsUrl = await getWebSocketUrl();
        console.log('CDP connected to Edge');
        const cdp = await createCdpClient(wsUrl);
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');

        const tests = [
            { label: 'zip-fast', path: '/zip-fast/applovin/WonderMatch_TSon_15-09-2_5_applovin.html' },
            { label: 'solid-deflate', path: '/solid-deflate/applovin/WonderMatch_TSon_15-09-2_5_applovin.html' },
            { label: 'zip-standard', path: '/zip-standard/applovin/WonderMatch_TSon_15-09-2_5_applovin.html' }
        ];

        let allPassed = true;

        for (const t of tests) {
            console.log('\n========================================');
            console.log('Testing: ' + t.label);
            console.log('========================================');
            const errors = [];
            const logs = [];
            const handler = (p) => {
                const txt = p.args.map(a => a.value || a.description || '').join(' ');
                logs.push(txt);
                if (txt.includes('pts-super-html') || txt.includes('Failed') || txt.includes('Error')) {
                    console.log('  [' + p.type + '] ' + txt);
                }
            };
            const errHandler = (p) => {
                const desc = p.exceptionDetails.exception?.description || p.exceptionDetails.text;
                errors.push(desc);
                console.error('  [EXCEPTION]', desc);
            };

            cdp.on('Runtime.consoleAPICalled', handler);
            cdp.on('Runtime.exceptionThrown', errHandler);

            await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + t.path });
            await new Promise(r => setTimeout(r, 6000));

            const evalRes = await cdp.send('Runtime.evaluate', {
                expression: `(function() {
                    const canvas = document.getElementById('GameCanvas');
                    return {
                        hasCanvas: !!canvas,
                        canvasWidth: canvas ? canvas.width : 0,
                        canvasHeight: canvas ? canvas.height : 0,
                        hasCC: typeof cc !== 'undefined',
                        virtualFilesCount: window.__res ? Object.keys(window.__res).length : 0
                    };
                })()`,
                returnByValue: true
            });

            console.log('  Evaluation Status:', evalRes.result?.value);
            const fatal = errors.filter(e => !e.includes('favicon'));
            if (fatal.length === 0 && evalRes.result?.value?.hasCC && evalRes.result?.value?.virtualFilesCount === 96) {
                console.log('  ✅ ' + t.label + ' PASSED WITH 0 ERRORS!');
            } else {
                console.error('  ❌ ' + t.label + ' FAILED!');
                allPassed = false;
            }
        }

        cdp.close();

        if (allPassed) {
            console.log('\n🎉 ALL 3 COMPRESSION METHODS PASSED IN BROWSER!');
        } else {
            process.exit(1);
        }
    } finally {
        edge.kill();
        server.close();
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
