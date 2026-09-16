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
    isCustomName: false,
    customName: ''
};

export function getSettingsPath(projectPath?: string): string {
    if (projectPath) {
        return path.join(projectPath, 'settings', 'pts-super-html.json');
    }
    return path.join(process.cwd(), 'settings', 'pts-super-html.json');
}

export function loadSettings(projectPath?: string): PluginSettings {
    const filePath = getSettingsPath(projectPath);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            return {
                ...DEFAULT_SETTINGS,
                ...data
            };
        }
    } catch (e) {
        console.warn('[pts-super-html] Failed to read settings, using defaults:', e);
    }
    return { ...DEFAULT_SETTINGS };
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
