import * as fs from 'fs';
import * as path from 'path';
import { ALL_CHANNELS } from '../core/channels';
import { loadSettings, saveSettings } from '../core/settings';
import { CompressionMethod, Encoding, PluginSettings } from '../core/types';

declare const Editor: any;

export const style = `
:host {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #cccccc;
    background-color: #2b2b2b;
    overflow-y: auto;
}

h2 {
    margin: 0 0 12px 0;
    font-size: 18px;
    color: #40a9ff;
    font-weight: 600;
}

.section {
    background: #333333;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 12px;
    border: 1px solid #3f3f3f;
}

.section-title {
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 8px;
    color: #ffffff;
}

.form-row {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}

.form-row label {
    width: 160px;
    font-size: 13px;
    flex-shrink: 0;
}

.form-row input[type="text"], .form-row select {
    flex: 1;
    height: 28px;
    background: #222222;
    border: 1px solid #444444;
    color: #ffffff;
    padding: 0 8px;
    border-radius: 4px;
    font-size: 12px;
}

.form-row select {
    cursor: pointer;
}

.form-row button {
    height: 28px;
    margin-left: 8px;
    padding: 0 12px;
    background: #444444;
    border: none;
    color: #ffffff;
    border-radius: 4px;
    cursor: pointer;
}

.form-row button:hover {
    background: #555555;
}

.channels-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    margin-top: 8px;
    max-height: 200px;
    overflow-y: auto;
    padding: 6px;
    background: #222222;
    border-radius: 4px;
    border: 1px solid #444444;
}

.channel-item {
    display: flex;
    align-items: center;
    font-size: 12px;
    cursor: pointer;
    user-select: none;
}

.channel-item input {
    margin-right: 6px;
    cursor: pointer;
}

.channel-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
}

.btn-small {
    padding: 4px 10px;
    font-size: 11px;
    background: #444444;
    border: none;
    color: #ddd;
    border-radius: 3px;
    cursor: pointer;
}

.btn-small:hover {
    background: #555555;
}

.actions-row {
    display: flex;
    gap: 12px;
    margin-top: 8px;
}

.btn-primary {
    flex: 2;
    height: 36px;
    background: #1890ff;
    border: none;
    color: #ffffff;
    font-size: 14px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
}

.btn-primary:hover {
    background: #40a9ff;
}

.btn-primary:disabled {
    background: #555555;
    cursor: not-allowed;
}

.btn-secondary {
    flex: 1;
    height: 36px;
    background: #444444;
    border: none;
    color: #ffffff;
    font-size: 14px;
    border-radius: 4px;
    cursor: pointer;
}

.btn-secondary:hover {
    background: #555555;
}

.log-box {
    margin-top: 12px;
    background: #1e1e1e;
    border-radius: 4px;
    padding: 8px 10px;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 12px;
    line-height: 18px;
    min-height: 110px;
    height: 140px;
    flex-shrink: 0;
    overflow-y: auto;
    border: 1px solid #333333;
    white-space: pre-wrap;
    word-break: break-all;
    color: #a0a0a0;
    box-sizing: border-box;
}
`;

export const template = `
<h2>pTS Super HTML - Playable Ads Builder</h2>

<div class="section">
    <div class="section-title">Compression & Encoding</div>
    <div class="form-row">
        <label for="select-compression">Compression Method:</label>
        <select id="select-compression">
            <option value="zip-fast">fflate (High-Speed ZIP - ~8KB Loader) [Recommended]</option>
            <option value="zip-standard">JSZip (Classic Standard PKZIP)</option>
            <option value="solid-deflate">Solid Deflate (Continuous Stream - Max Ratio)</option>
        </select>
    </div>
    <div class="form-row">
        <label for="select-encoding">Data Format:</label>
        <select id="select-encoding">
            <option value="base64">Base64 (Standard Compatibility)</option>
            <option value="base122">Base122 (Optimized - ~14.3% Smaller)</option>
        </select>
    </div>
    <div style="font-size: 11px; color: #888; margin-left: 160px; line-height: 16px;">
        100% offline & self-contained. Zero external network requests, zero CDN scripts.
    </div>
</div>

<div class="section">
    <div class="section-title">Build Directories & Options</div>
    <div class="form-row">
        <label for="input-dir">Web Mobile Folder:</label>
        <input type="text" id="input-dir" placeholder="e.g. build/web-mobile-007" />
        <button id="btn-detect-input">Auto Detect</button>
    </div>
    <div class="form-row">
        <label for="out-dir">Output Folder:</label>
        <input type="text" id="out-dir" placeholder="e.g. build/super-html" />
    </div>
    <div class="form-row" style="align-items: flex-start;">
        <label style="margin-top: 2px;">Optimizations:</label>
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="width: auto; cursor: pointer;">
                <input type="checkbox" id="chk-compress-images" /> Images Compression (TinyPNG algorithm)
            </label>
            <label style="width: auto; cursor: pointer;">
                <input type="checkbox" id="chk-downsample-audio" /> Audio Downsampling (Mono 48kbps MP3)
            </label>
            <label style="width: auto; cursor: pointer;">
                <input type="checkbox" id="chk-subset-fonts" /> Font Subsetting (Used Glyphs Only)
            </label>
            <label style="width: auto; cursor: pointer;">
                <input type="checkbox" id="chk-optimize-mesh" /> 3D Mesh & FBX Quantization (CCON/Vertex Buffers)
            </label>
            <div id="row-mesh-quant" style="display: none; margin-left: 22px; align-items: center; gap: 8px; margin-top: 2px; margin-bottom: 4px;">
                <span style="font-size: 11px; color: #aaa;">Precision:</span>
                <select id="select-mesh-quant" style="height: 24px; padding: 0 6px; font-size: 11px; background: #222; border: 1px solid #444; color: #fff; border-radius: 3px;">
                    <option value="8">8-bit (Conservative: 99.99% precision, ~15-20% zip boost)</option>
                    <option value="10" selected>10-bit (Balanced: ~0.01% error, ~25-30% zip boost) [Recommended]</option>
                    <option value="12">12-bit (Aggressive: ~0.05% error, ~35-40% zip boost)</option>
                    <option value="14">14-bit (Maximum: ~0.2% error, stylized/low-poly, ~45% zip boost)</option>
                </select>
            </div>
            <div style="display: flex; gap: 16px; margin-top: 4px;">
                <label style="width: auto; cursor: pointer;">
                    <input type="checkbox" id="chk-min-css" checked /> Minify CSS
                </label>
                <label style="width: auto; cursor: pointer;">
                    <input type="checkbox" id="chk-min-js" /> Minify JS
                </label>
            </div>
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #444;">
                <label style="width: auto; cursor: pointer; color: #bbb;">
                    <input type="checkbox" id="chk-auto-build" /> Auto-pack Playables when Cocos builds Web-Mobile (Background)
                </label>
            </div>
        </div>
    </div>
    <div class="form-row">
        <label>Name Replacement:</label>
        <label style="width: auto; cursor: pointer;">
            <input type="checkbox" id="chk-custom-name" /> Enable Name Replacement
        </label>
    </div>
    <div class="form-row" id="row-custom-name" style="display: none;">
        <label for="input-custom-name">Custom Base Name:</label>
        <input type="text" id="input-custom-name" placeholder="e.g. WonderMatch_v1 (outputs: %name%_%channel%.html)" />
    </div>
</div>

<div class="section">
    <div class="section-title">Store Links & CTA URLs</div>
    <div class="form-row">
        <label for="input-ios-url">iOS App Store URL:</label>
        <input type="text" id="input-ios-url" placeholder="https://apps.apple.com/app/id..." />
    </div>
    <div class="form-row">
        <label for="input-android-url">Android Play Store URL:</label>
        <input type="text" id="input-android-url" placeholder="https://play.google.com/store/apps/details?id=..." />
    </div>
    <div style="font-size: 11px; color: #888; margin-left: 160px; line-height: 16px;">
        Injected into Playable Ads. window.pTS_open() automatically routes iOS/Android devices to the matching store.
    </div>
</div>

<div class="section">
    <div class="section-title">Target Channels</div>
    <div class="channel-actions">
        <button class="btn-small" id="btn-select-all">Select All</button>
        <button class="btn-small" id="btn-clear-all">Clear All</button>
        <button class="btn-small" id="btn-select-defaults">Default Channels</button>
    </div>
    <div class="channels-grid" id="channels-container"></div>
</div>

<div class="actions-row">
    <button class="btn-primary" id="btn-build">Build Playable Ads</button>
    <button class="btn-secondary" id="btn-open-out">Open Output Folder</button>
</div>

<div class="log-box" id="log-box">[System] pTS Super HTML initialized.
[Config] Compression: fflate (fast) / JSZip (classic) / Solid Deflate.
[Config] Encoding: Base64 / Base122 (100% offline & air-gapped).
[Config] Optimizations: Images (TinyPNG) | Audio (48kbps) | Fonts (Subset) | 3D Mesh (Quantized).
[Config] Channels: 28 ad networks supported.
[Status] Ready to package playable ads.
</div>
`;

export const $ = {
    selectCompression: '#select-compression',
    selectEncoding: '#select-encoding',
    inputDir: '#input-dir',
    outDir: '#out-dir',
    chkCompressImages: '#chk-compress-images',
    chkDownsampleAudio: '#chk-downsample-audio',
    chkSubsetFonts: '#chk-subset-fonts',
    chkOptimizeMesh: '#chk-optimize-mesh',
    rowMeshQuant: '#row-mesh-quant',
    selectMeshQuant: '#select-mesh-quant',
    chkAutoBuild: '#chk-auto-build',
    chkMinCss: '#chk-min-css',
    chkMinJs: '#chk-min-js',
    chkCustomName: '#chk-custom-name',
    rowCustomName: '#row-custom-name',
    inputCustomName: '#input-custom-name',
    inputIosUrl: '#input-ios-url',
    inputAndroidUrl: '#input-android-url',
    channelsContainer: '#channels-container',
    btnSelectAll: '#btn-select-all',
    btnClearAll: '#btn-clear-all',
    btnSelectDefaults: '#btn-select-defaults',
    btnDetectInput: '#btn-detect-input',
    btnBuild: '#btn-build',
    btnOpenOut: '#btn-open-out',
    logBox: '#log-box'
};

export function ready(this: any) {
    const getEl = <T extends HTMLElement>(key: keyof typeof $, selector: string): T | null => {
        if (this.$ && this.$[key]) return this.$[key] as T;
        if (this.shadowRoot) {
            const found = this.shadowRoot.querySelector(selector);
            if (found) return found as T;
        }
        if (typeof document !== 'undefined') {
            const found = document.querySelector(selector);
            if (found) return found as T;
        }
        return null;
    };

    let projectPath = '';
    if (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) {
        projectPath = Editor.Project.path;
    } else if (process && process.cwd) {
        projectPath = process.cwd();
    }

    const selectCompression = getEl<HTMLSelectElement>('selectCompression', $.selectCompression);
    const selectEncoding = getEl<HTMLSelectElement>('selectEncoding', $.selectEncoding);
    const inputDirInput = getEl<HTMLInputElement>('inputDir', $.inputDir);
    const outDirInput = getEl<HTMLInputElement>('outDir', $.outDir);
    const chkCompressImages = getEl<HTMLInputElement>('chkCompressImages', $.chkCompressImages);
    const chkDownsampleAudio = getEl<HTMLInputElement>('chkDownsampleAudio', $.chkDownsampleAudio);
    const chkSubsetFonts = getEl<HTMLInputElement>('chkSubsetFonts', $.chkSubsetFonts);
    const chkOptimizeMesh = getEl<HTMLInputElement>('chkOptimizeMesh', $.chkOptimizeMesh);
    const rowMeshQuant = getEl<HTMLElement>('rowMeshQuant', $.rowMeshQuant);
    const selectMeshQuant = getEl<HTMLSelectElement>('selectMeshQuant', $.selectMeshQuant);
    const chkAutoBuild = getEl<HTMLInputElement>('chkAutoBuild', $.chkAutoBuild);
    const chkMinCss = getEl<HTMLInputElement>('chkMinCss', $.chkMinCss);
    const chkMinJs = getEl<HTMLInputElement>('chkMinJs', $.chkMinJs);
    const chkCustomName = getEl<HTMLInputElement>('chkCustomName', $.chkCustomName);
    const rowCustomName = getEl<HTMLElement>('rowCustomName', $.rowCustomName);
    const inputCustomName = getEl<HTMLInputElement>('inputCustomName', $.inputCustomName);
    const inputIosUrl = getEl<HTMLInputElement>('inputIosUrl', $.inputIosUrl);
    const inputAndroidUrl = getEl<HTMLInputElement>('inputAndroidUrl', $.inputAndroidUrl);
    const channelsContainer = getEl<HTMLElement>('channelsContainer', $.channelsContainer);
    const btnSelectAll = getEl<HTMLButtonElement>('btnSelectAll', $.btnSelectAll);
    const btnClearAll = getEl<HTMLButtonElement>('btnClearAll', $.btnClearAll);
    const btnSelectDefaults = getEl<HTMLButtonElement>('btnSelectDefaults', $.btnSelectDefaults);
    const btnDetectInput = getEl<HTMLButtonElement>('btnDetectInput', $.btnDetectInput);
    const btnBuild = getEl<HTMLButtonElement>('btnBuild', $.btnBuild);
    const btnOpenOut = getEl<HTMLButtonElement>('btnOpenOut', $.btnOpenOut);
    const logBox = getEl<HTMLElement>('logBox', $.logBox);

    const appendLog = (msg: string) => {
        if (!logBox) return;
        const time = new Date().toLocaleTimeString();
        logBox.textContent += `[${time}] ${msg}\n`;
        logBox.scrollTop = logBox.scrollHeight;
    };

    // Auto-detect latest build directory if empty
    function detectLatestBuildDir(): string {
        const buildRoot = path.join(projectPath, 'build');
        if (fs.existsSync(buildRoot)) {
            const entries = fs.readdirSync(buildRoot, { withFileTypes: true });
            const webMobileDirs = entries
                .filter(e => e.isDirectory() && e.name.startsWith('web-mobile'))
                .map(e => ({
                    name: e.name,
                    fullPath: path.join(buildRoot, e.name),
                    mtime: fs.statSync(path.join(buildRoot, e.name)).mtimeMs
                }))
                .sort((a, b) => b.mtime - a.mtime);

            if (webMobileDirs.length > 0) {
                return webMobileDirs[0].fullPath;
            }
        }
        return path.join(projectPath, 'build', 'web-mobile');
    }

    // Load initial settings
    const settings = loadSettings(projectPath);

    if (!settings.inputDir) {
        settings.inputDir = detectLatestBuildDir();
    }
    if (!settings.outDir) {
        settings.outDir = path.join(projectPath, 'build', 'super-html');
    }

    // Populate UI
    if (selectCompression) selectCompression.value = settings.compression || 'zip-fast';
    if (selectEncoding) selectEncoding.value = settings.encoding;
    if (inputDirInput) inputDirInput.value = settings.inputDir;
    if (outDirInput) outDirInput.value = settings.outDir;
    if (chkCompressImages) chkCompressImages.checked = !!settings.isCompressImages;
    if (chkDownsampleAudio) chkDownsampleAudio.checked = !!settings.isDownsampleAudio;
    if (chkSubsetFonts) chkSubsetFonts.checked = !!settings.isSubsetFonts;
    if (chkOptimizeMesh) {
        chkOptimizeMesh.checked = !!settings.isOptimizeMesh;
        if (rowMeshQuant) {
            rowMeshQuant.style.display = chkOptimizeMesh.checked ? 'flex' : 'none';
        }
    }
    if (selectMeshQuant) selectMeshQuant.value = String(settings.meshQuantizationBits || 10);
    if (chkAutoBuild) chkAutoBuild.checked = !!settings.isAutoBuildOnCocosBuild;
    if (chkMinCss) chkMinCss.checked = settings.isMinCss;
    if (chkMinJs) chkMinJs.checked = settings.isMinJs;
    if (chkCustomName) {
        chkCustomName.checked = !!settings.isCustomName;
        if (rowCustomName) {
            rowCustomName.style.display = chkCustomName.checked ? 'flex' : 'none';
        }
    }
    if (inputCustomName) inputCustomName.value = settings.customName || '';
    if (inputIosUrl) inputIosUrl.value = settings.iosUrl || '';
    if (inputAndroidUrl) inputAndroidUrl.value = settings.androidUrl || '';

    // Render channels
    const channelCheckboxes: Map<string, HTMLInputElement> = new Map();
    if (channelsContainer) {
        channelsContainer.innerHTML = '';
        ALL_CHANNELS.forEach(ch => {
            const labelEl = document.createElement('label');
            labelEl.className = 'channel-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = ch.name;
            checkbox.checked = settings.channels.includes(ch.name);

            // Directly wire change listener on every checkbox
            checkbox.addEventListener('change', () => {
                persistSettings();
            });

            labelEl.appendChild(checkbox);
            labelEl.appendChild(document.createTextNode(ch.label));
            channelsContainer.appendChild(labelEl);

            channelCheckboxes.set(ch.name, checkbox);
        });
    }

    // Helper to persist settings from UI
    const persistSettings = () => {
        const selectedChannels: string[] = [];
        channelCheckboxes.forEach((cb, name) => {
            if (cb.checked) selectedChannels.push(name);
        });

        const newSettings: PluginSettings = {
            compression: selectCompression ? (selectCompression.value as CompressionMethod) : 'zip-fast',
            encoding: selectEncoding ? (selectEncoding.value as Encoding) : 'base64',
            inputDir: inputDirInput ? inputDirInput.value.trim() : '',
            outDir: outDirInput ? outDirInput.value.trim() : '',
            channels: selectedChannels,
            isMinCss: chkMinCss ? chkMinCss.checked : true,
            isMinJs: chkMinJs ? chkMinJs.checked : false,
            isCompressImages: chkCompressImages ? chkCompressImages.checked : false,
            isDownsampleAudio: chkDownsampleAudio ? chkDownsampleAudio.checked : false,
            isSubsetFonts: chkSubsetFonts ? chkSubsetFonts.checked : false,
            isOptimizeMesh: chkOptimizeMesh ? chkOptimizeMesh.checked : false,
            meshQuantizationBits: selectMeshQuant ? parseInt(selectMeshQuant.value, 10) : 10,
            isAutoBuildOnCocosBuild: chkAutoBuild ? chkAutoBuild.checked : false,
            isCustomName: chkCustomName ? chkCustomName.checked : false,
            customName: inputCustomName ? inputCustomName.value.trim() : '',
            iosUrl: inputIosUrl ? inputIosUrl.value.trim() : '',
            androidUrl: inputAndroidUrl ? inputAndroidUrl.value.trim() : ''
        };

        saveSettings(newSettings, projectPath);
        return newSettings;
    };

    // Event listeners
    if (selectCompression) {
        selectCompression.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`Compression method set to: ${s.compression}`);
        });
    }
    if (selectEncoding) {
        selectEncoding.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`Encoding set to: ${s.encoding.toUpperCase()}`);
        });
    }
    if (inputDirInput) {
        inputDirInput.addEventListener('change', persistSettings);
        inputDirInput.addEventListener('input', persistSettings);
    }
    if (outDirInput) {
        outDirInput.addEventListener('change', persistSettings);
        outDirInput.addEventListener('input', persistSettings);
    }
    if (chkCompressImages) {
        chkCompressImages.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`Images compression: ${s.isCompressImages ? 'ENABLED (TinyPNG algorithm)' : 'DISABLED'}`);
        });
    }
    if (chkDownsampleAudio) {
        chkDownsampleAudio.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`Audio downsampling: ${s.isDownsampleAudio ? 'ENABLED (Mono 48kbps MP3)' : 'DISABLED'}`);
        });
    }
    if (chkSubsetFonts) {
        chkSubsetFonts.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`Font subsetting: ${s.isSubsetFonts ? 'ENABLED (Used Glyphs Only)' : 'DISABLED'}`);
        });
    }
    if (chkOptimizeMesh) {
        chkOptimizeMesh.addEventListener('change', () => {
            if (rowMeshQuant) {
                rowMeshQuant.style.display = chkOptimizeMesh.checked ? 'flex' : 'none';
            }
            const s = persistSettings();
            appendLog(`3D Mesh optimization: ${s.isOptimizeMesh ? `ENABLED (${s.meshQuantizationBits || 10}-bit)` : 'DISABLED'}`);
        });
    }
    if (selectMeshQuant) {
        selectMeshQuant.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`3D Mesh quantization precision set to: ${s.meshQuantizationBits}-bit`);
        });
    }
    if (chkAutoBuild) {
        chkAutoBuild.addEventListener('change', () => {
            const s = persistSettings();
            appendLog(`Auto-pack on Cocos build: ${s.isAutoBuildOnCocosBuild ? 'ENABLED (Background worker)' : 'DISABLED'}`);
        });
    }
    if (chkMinCss) chkMinCss.addEventListener('change', persistSettings);
    if (chkMinJs) chkMinJs.addEventListener('change', persistSettings);
    if (chkCustomName) {
        chkCustomName.addEventListener('change', () => {
            if (rowCustomName) {
                rowCustomName.style.display = chkCustomName.checked ? 'flex' : 'none';
            }
            const s = persistSettings();
            appendLog(`Custom output name: ${s.isCustomName ? 'ENABLED' : 'DISABLED'}`);
        });
    }
    if (inputCustomName) {
        inputCustomName.addEventListener('change', persistSettings);
        inputCustomName.addEventListener('input', persistSettings);
    }
    if (inputIosUrl) {
        inputIosUrl.addEventListener('change', persistSettings);
        inputIosUrl.addEventListener('input', persistSettings);
    }
    if (inputAndroidUrl) {
        inputAndroidUrl.addEventListener('change', persistSettings);
        inputAndroidUrl.addEventListener('input', persistSettings);
    }

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            channelCheckboxes.forEach(cb => { cb.checked = true; });
            persistSettings();
            appendLog(`Selected all ${channelCheckboxes.size} channels.`);
        });
    }

    if (btnClearAll) {
        btnClearAll.addEventListener('click', () => {
            channelCheckboxes.forEach(cb => { cb.checked = false; });
            persistSettings();
            appendLog('Cleared all channel selections.');
        });
    }

    if (btnSelectDefaults) {
        btnSelectDefaults.addEventListener('click', () => {
            const defaultNames = ['common', 'applovin', 'google', 'facebook', 'mintegral', 'ironsource2025', 'unity', 'tiktok', 'liftoff'];
            channelCheckboxes.forEach((cb, name) => {
                cb.checked = defaultNames.includes(name);
            });
            persistSettings();
            appendLog('Selected standard playable channels (9 networks).');
        });
    }

    if (btnDetectInput) {
        btnDetectInput.addEventListener('click', () => {
            const detected = detectLatestBuildDir();
            if (inputDirInput) inputDirInput.value = detected;
            persistSettings();
            appendLog('Detected latest web-mobile folder: ' + detected);
        });
    }

    if (btnOpenOut) {
        btnOpenOut.addEventListener('click', () => {
            const outPath = outDirInput ? outDirInput.value.trim() : path.join(projectPath, 'build', 'super-html');
            if (fs.existsSync(outPath)) {
                if (typeof Editor !== 'undefined' && Editor.shell) {
                    Editor.shell.openItem(outPath);
                } else {
                    try {
                        const electron = require('electron');
                        if (electron && electron.shell) electron.shell.openPath(outPath);
                    } catch (_) {}
                }
            } else {
                appendLog('Output folder does not exist yet.');
            }
        });
    }

    function findNodeExecutable(): string {
        const candidates = [
            'node',
            'C:\\Program Files\\nodejs\\node.exe',
            'C:\\Program Files (x86)\\nodejs\\node.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'node', 'node.exe')
        ];
        for (const c of candidates) {
            try {
                const { spawnSync } = require('child_process');
                const res = spawnSync(c, ['-v'], { encoding: 'utf-8', windowsHide: true });
                if (res && res.status === 0) return c;
            } catch (_) {}
        }
        return 'node';
    }

    function runBuildViaWorker(packOptions: any, logFn: (msg: string) => void): Promise<boolean> {
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const nodeExe = findNodeExecutable();
            const cliScript = path.join(__dirname, '..', 'tools', 'pack-cli.js');
            if (!fs.existsSync(cliScript)) {
                logFn('[Worker] CLI script not found at: ' + cliScript);
                resolve(false);
                return;
            }

            const configBase64 = Buffer.from(JSON.stringify(packOptions)).toString('base64');
            logFn(`[Worker] Spawning isolated packaging process via Node (${path.basename(nodeExe)})...`);

            let child: any;
            try {
                child = spawn(nodeExe, [cliScript, '--config', configBase64], {
                    cwd: path.resolve(__dirname, '..', '..'),
                    windowsHide: true,
                    env: process.env
                });
            } catch (err: any) {
                logFn(`[Worker] Failed to spawn: ${err.message}`);
                resolve(false);
                return;
            }

            child.stdout.on('data', (chunk: any) => {
                const text = chunk.toString();
                const lines = text.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) logFn(trimmed);
                }
            });

            child.stderr.on('data', (chunk: any) => {
                const text = chunk.toString();
                const lines = text.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) logFn(`[STDERR] ${trimmed}`);
                }
            });

            child.on('error', (err: any) => {
                logFn(`[Worker Error] ${err.message}`);
                resolve(false);
            });

            child.on('close', (code: number) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    logFn(`[Worker] Process exited with code ${code}.`);
                    resolve(false);
                }
            });
        });
    }

    if (btnBuild) {
        btnBuild.addEventListener('click', async () => {
            const current = persistSettings();
            if (!current.inputDir || !fs.existsSync(current.inputDir)) {
                appendLog('Error: Please specify a valid web-mobile build folder.');
                return;
            }
            if (current.channels.length === 0) {
                appendLog('Error: Please select at least one channel.');
                return;
            }

            btnBuild.disabled = true;
            const customName = (current.isCustomName && current.customName) ? current.customName : undefined;
            const extraLog = [
                current.isCompressImages ? 'TinyPNG: ON' : '',
                current.isDownsampleAudio ? 'Audio: 48k' : '',
                current.isSubsetFonts ? 'Fonts: Subset' : '',
                current.isOptimizeMesh ? `3D: ${current.meshQuantizationBits || 10}-bit` : '',
                customName ? `Name: ${customName}` : ''
            ].filter(Boolean).join(' | ');
            const infoSuffix = extraLog ? ` | ${extraLog}` : '';
            appendLog(`Starting build [Compression: ${current.compression} | Format: ${current.encoding.toUpperCase()}${infoSuffix}]...`);

            const packOptions = {
                inputDir: current.inputDir,
                outDir: current.outDir,
                compression: current.compression,
                encoding: current.encoding,
                channels: current.channels,
                isMinCss: current.isMinCss,
                isMinJs: current.isMinJs,
                isCompressImages: current.isCompressImages,
                isDownsampleAudio: current.isDownsampleAudio,
                isSubsetFonts: current.isSubsetFonts,
                isOptimizeMesh: current.isOptimizeMesh,
                meshQuantizationBits: current.meshQuantizationBits || 10,
                customName: customName,
                iosUrl: current.iosUrl,
                androidUrl: current.androidUrl
            };

            try {
                // 1. Prefer isolated child process: keeps Cocos Editor 100% responsive and prevents native crashes
                const workerSuccess = await runBuildViaWorker(packOptions, appendLog);
                if (!workerSuccess) {
                    appendLog('[Fallback] Running in-process builder...');
                    const { packPlayable } = require('../core/pack');
                    const result = await packPlayable({
                        ...packOptions,
                        onProgress: (pct: number, msg: string) => {
                            appendLog(`[${pct}%] ${msg}`);
                        }
                    });

                    if (result.success) {
                        appendLog(`SUCCESS! Built ${result.outputs.length} playable artifact(s) in ${(result.durationMs / 1000).toFixed(2)}s.`);
                        result.outputs.forEach((o: any) => {
                            appendLog(` -> [${o.channel}] ${(o.size / 1024).toFixed(1)} KB: ${path.basename(o.path)}`);
                        });
                    } else {
                        appendLog('FAILED: ' + (result.error || 'Unknown error'));
                    }
                }
            } catch (err: any) {
                appendLog('EXCEPTION: ' + (err.message || String(err)));
                console.error(err);
            } finally {
                btnBuild.disabled = false;
            }
        });
    }

    const optList = [
        settings.isCompressImages ? 'TinyPNG' : '',
        settings.isDownsampleAudio ? 'Audio' : '',
        settings.isSubsetFonts ? 'Fonts' : '',
        settings.isOptimizeMesh ? `3D (${settings.meshQuantizationBits || 10}-bit)` : '',
        settings.isAutoBuildOnCocosBuild ? 'Auto-pack' : ''
    ].filter(Boolean);
    const extraInit = optList.length > 0 ? ` | Active Opts: ${optList.join(', ')}` : '';
    appendLog(`Panel initialized. Available channels: ${ALL_CHANNELS.length} | Compress: ${settings.compression || 'zip-fast'} | Format: ${settings.encoding.toUpperCase()}${extraInit}`);
}

export function beforeClose() {}

export function close() {}

const panelOptions = {
    template,
    style,
    $: $,
    ready,
    beforeClose,
    close
};

const definePanel = (typeof Editor !== 'undefined' && Editor.Panel && typeof Editor.Panel.define === 'function')
    ? Editor.Panel.define
    : (opts: any) => opts;

const panelDef = definePanel(panelOptions);
module.exports = panelDef;
export default panelDef;
