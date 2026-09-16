import * as fs from 'fs';
import * as path from 'path';
import { loadSettings } from './core/settings';

declare const Editor: any;

export async function onAfterBuild(options: any, result: any) {
    if (options.platform !== 'web-mobile') {
        return;
    }

    const projectPath = (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) ? Editor.Project.path : process.cwd();
    const settings = loadSettings(projectPath);

    // Disabled by default to prevent blocking Cocos Creator builder process and crashes
    if (!settings.isAutoBuildOnCocosBuild) {
        return;
    }

    const inputDir = result.dest || settings.inputDir;
    if (!inputDir) {
        console.warn('[pTS-super-html] onAfterBuild: Missing build output directory.');
        return;
    }

    console.log(`[pTS-super-html] onAfterBuild auto-pack triggered for: ${inputDir}`);

    try {
        const { spawn } = require('child_process');
        const cliScript = path.join(__dirname, 'tools', 'pack-cli.js');
        if (!fs.existsSync(cliScript)) {
            console.warn('[pTS-super-html] onAfterBuild: pack-cli.js not found at', cliScript);
            return;
        }

        const packOptions = {
            inputDir,
            outDir: settings.outDir,
            compression: settings.compression,
            encoding: settings.encoding,
            channels: settings.channels,
            isMinCss: settings.isMinCss,
            isMinJs: settings.isMinJs,
            isCompressImages: settings.isCompressImages,
            isDownsampleAudio: settings.isDownsampleAudio,
            isSubsetFonts: settings.isSubsetFonts,
            isOptimizeMesh: settings.isOptimizeMesh,
            meshQuantizationBits: settings.meshQuantizationBits || 10,
            iosUrl: settings.iosUrl,
            androidUrl: settings.androidUrl,
            customName: settings.isCustomName ? settings.customName : undefined
        };

        const configBase64 = Buffer.from(JSON.stringify(packOptions)).toString('base64');

        // Spawn detached process so Cocos builder worker process completes instantly
        const child = spawn('node', [cliScript, '--config', configBase64], {
            cwd: path.resolve(__dirname, '..'),
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();

        console.log(`[pTS-super-html] Auto-pack launched in detached background worker (PID ${child.pid}). Cocos build finishes cleanly.`);
    } catch (err) {
        console.error('[pTS-super-html] Error launching auto-pack worker in onAfterBuild:', err);
    }
}
