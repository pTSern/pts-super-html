import * as fs from 'fs';
import * as path from 'path';
import { ALL_CHANNELS } from '../core/channels';
import { loadSettings, saveSettings } from '../core/settings';
import { packPlayable } from '../core/pack';
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
<h2>PTS Super HTML Next - Playable Ads Builder</h2>

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
    <div class="form-row">
        <label>Optimizations:</label>
        <label style="width: auto; margin-right: 16px; cursor: pointer;">
            <input type="checkbox" id="chk-compress-images" /> Enable Images Compression (TinyPNG)
        </label>
        <label style="width: auto; margin-right: 16px; cursor: pointer;">
            <input type="checkbox" id="chk-min-css" checked /> Minify CSS
        </label>
        <label style="width: auto; cursor: pointer;">
            <input type="checkbox" id="chk-min-js" /> Minify JS
        </label>
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

<div class="log-box" id="log-box">[System] PTS Super HTML Next initialized.
[Config] Compression: fflate (fast) / JSZip (classic) / Solid Deflate.
[Config] Encoding: Base64 / Base122 (100% offline & air-gapped).
[Config] Images: TinyPNG Smart Lossy Quantizer built-in.
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
    chkMinCss: '#chk-min-css',
    chkMinJs: '#chk-min-js',
    chkCustomName: '#chk-custom-name',
    rowCustomName: '#row-custom-name',
    inputCustomName: '#input-custom-name',
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
    const chkMinCss = getEl<HTMLInputElement>('chkMinCss', $.chkMinCss);
    const chkMinJs = getEl<HTMLInputElement>('chkMinJs', $.chkMinJs);
    const chkCustomName = getEl<HTMLInputElement>('chkCustomName', $.chkCustomName);
    const rowCustomName = getEl<HTMLElement>('rowCustomName', $.rowCustomName);
    const inputCustomName = getEl<HTMLInputElement>('inputCustomName', $.inputCustomName);
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
    if (chkMinCss) chkMinCss.checked = settings.isMinCss;
    if (chkMinJs) chkMinJs.checked = settings.isMinJs;
    if (chkCustomName) {
        chkCustomName.checked = !!settings.isCustomName;
        if (rowCustomName) {
            rowCustomName.style.display = chkCustomName.checked ? 'flex' : 'none';
        }
    }
    if (inputCustomName) inputCustomName.value = settings.customName || '';

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
            isCustomName: chkCustomName ? chkCustomName.checked : false,
            customName: inputCustomName ? inputCustomName.value.trim() : ''
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
                customName ? `Name: ${customName}` : ''
            ].filter(Boolean).join(' | ');
            const infoSuffix = extraLog ? ` | ${extraLog}` : '';
            appendLog(`Starting build [Compression: ${current.compression} | Format: ${current.encoding.toUpperCase()}${infoSuffix}]...`);

            try {
                const result = await packPlayable({
                    inputDir: current.inputDir,
                    outDir: current.outDir,
                    compression: current.compression,
                    encoding: current.encoding,
                    channels: current.channels,
                    isMinCss: current.isMinCss,
                    isMinJs: current.isMinJs,
                    isCompressImages: current.isCompressImages,
                    customName: customName,
                    onProgress: (pct, msg) => {
                        appendLog(`[${pct}%] ${msg}`);
                    }
                });

                if (result.success) {
                    if (result.imageSavingsBytes && result.imageSavingsBytes > 0) {
                        appendLog(`[TinyPNG] Images optimized! Saved ${(result.imageSavingsBytes / 1024).toFixed(1)} KB.`);
                    }
                    appendLog(`SUCCESS! Built ${result.outputs.length} playable artifact(s) in ${(result.durationMs / 1000).toFixed(2)}s.`);
                    appendLog(`Source Files: ${result.sourceFiles} | Payload: ${(result.zipBytes / 1024).toFixed(1)} KB`);
                    result.outputs.forEach(o => {
                        appendLog(` -> [${o.channel}] ${(o.size / 1024).toFixed(1)} KB (${o.compression}): ${path.basename(o.path)}`);
                    });
                } else {
                    appendLog('FAILED: ' + (result.error || 'Unknown error'));
                }
            } catch (err: any) {
                appendLog('EXCEPTION: ' + (err.message || String(err)));
                console.error(err);
            } finally {
                btnBuild.disabled = false;
            }
        });
    }

    const extraInit = settings.isCompressImages ? ' | TinyPNG: ON' : '';
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
