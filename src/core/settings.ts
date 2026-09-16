import * as fs from 'fs';
import * as path from 'path';
import { Encoding, PluginSettings } from './types';

const DEFAULT_SETTINGS: PluginSettings = {
    compression: 'zip-fast',
    encoding: 'base64',
    inputDir: '',
    outDir: '',
    channels: ['common', 'applovin', 'google', 'facebook', 'mintegral', 'ironsource2025', 'unity', 'tiktok', 'liftoff'],
    isMinCss: true,
    isMinJs: false,
    isCompressImages: false,
    isDownsampleAudio: false,
    isSubsetFonts: false,
    isOptimizeMesh: false,
    meshQuantizationBits: 10,
    isAutoBuildOnCocosBuild: false,
    isCustomName: false,
    customName: '',
    iosUrl: '',
    androidUrl: ''
};

export function getSettingsPath(projectPath?: string): string {
    if (projectPath) {
        return path.join(projectPath, 'settings', 'pts-super-html.json');
    }
    return path.join(process.cwd(), 'settings', 'pts-super-html.json');
}

export function detectStoreLinksFromProject(projectPath?: string): { ios: string; android: string } {
    const root = projectPath || process.cwd();
    const constantPath = path.join(root, 'assets', 'constant', 'constant.ts');
    let ios = '';
    let android = '';
    if (fs.existsSync(constantPath)) {
        try {
            const content = fs.readFileSync(constantPath, 'utf8');
            const androidMatch = content.match(/ANDROID:\s*["']([^"']+)["']/);
            if (androidMatch && androidMatch[1]) android = androidMatch[1];
            const iosMatch = content.match(/IOS:\s*["']([^"']+)["']/);
            if (iosMatch && iosMatch[1]) ios = iosMatch[1];
        } catch (_) {}
    }
    return { ios, android };
}

export function loadSettings(projectPath?: string): PluginSettings {
    const filePath = getSettingsPath(projectPath);
    let data: any = {};
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            data = JSON.parse(raw);
        }
    } catch (e) {
        console.warn('[pTS-super-html] Failed to read settings, using defaults:', e);
    }

    const result: PluginSettings = {
        ...DEFAULT_SETTINGS,
        ...data
    };

    if (!result.iosUrl || !result.androidUrl) {
        const detected = detectStoreLinksFromProject(projectPath);
        if (!result.iosUrl && detected.ios) result.iosUrl = detected.ios;
        if (!result.androidUrl && detected.android) result.androidUrl = detected.android;
    }

    return result;
}

export function saveSettings(settings: Partial<PluginSettings>, projectPath?: string): PluginSettings {
    const current = loadSettings(projectPath);
    const updated: PluginSettings = {
        ...current,
        ...settings
    };

    const filePath = getSettingsPath(projectPath);
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (e) {
        console.error('[pts-super-html] Failed to save settings:', e);
    }

    return updated;
}
