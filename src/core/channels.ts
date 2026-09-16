import * as fs from 'fs';
import * as path from 'path';
import { ChannelInfo } from './types';

export interface ChannelSnippet {
    metaHtml: string;
    headJs: string;
    scriptJs: string;
    config?: Record<string, any>;
}

export const ALL_CHANNELS: ChannelInfo[] = [
    { name: 'common', label: 'Common (Standalone HTML)', enabled: true, isZip: false },
    { name: 'applovin', label: 'AppLovin', enabled: true, isZip: false },
    { name: 'google', label: 'Google Ads', enabled: true, isZip: true, zipName: 'google' },
    { name: 'google_portrait', label: 'Google Portrait', enabled: false, isZip: true, zipName: 'portrait' },
    { name: 'google_landscape', label: 'Google Landscape', enabled: false, isZip: true, zipName: 'landscape' },
    { name: 'facebook', label: 'Facebook', enabled: true, isZip: true, zipName: 'facebook' },
    { name: 'mintegral', label: 'Mintegral', enabled: true, isZip: true, zipName: 'mintegral' },
    { name: 'ironsource2025', label: 'ironSource (2025)', enabled: true, isZip: false },
    { name: 'ironsource', label: 'ironSource (Legacy)', enabled: false, isZip: false },
    { name: 'unity', label: 'Unity Ads', enabled: true, isZip: true, zipName: 'unity' },
    { name: 'tiktok', label: 'TikTok', enabled: true, isZip: true, zipName: 'tiktok' },
    { name: 'liftoff', label: 'Liftoff', enabled: true, isZip: false },
    { name: 'vungle', label: 'Vungle', enabled: true, isZip: false },
    { name: 'snapchat', label: 'Snapchat', enabled: true, isZip: true, zipName: 'snapchat' },
    { name: 'pangle', label: 'Pangle', enabled: true, isZip: true, zipName: 'pangle' },
    { name: 'pangle_portrait', label: 'Pangle Portrait', enabled: false, isZip: true, zipName: 'portrait' },
    { name: 'pangle_landscape', label: 'Pangle Landscape', enabled: false, isZip: true, zipName: 'landscape' },
    { name: 'bigo', label: 'Bigo', enabled: false, isZip: true, zipName: 'bigo' },
    { name: 'chartboost', label: 'Chartboost', enabled: false, isZip: false },
    { name: 'inmobi', label: 'InMobi', enabled: false, isZip: false },
    { name: 'kwai', label: 'Kwai', enabled: false, isZip: true, zipName: 'kwai' },
    { name: 'moloco', label: 'Moloco', enabled: false, isZip: false },
    { name: 'nefta', label: 'Nefta', enabled: false, isZip: false },
    { name: 'news_break', label: 'NewsBreak', enabled: false, isZip: false },
    { name: 'yandex', label: 'Yandex', enabled: false, isZip: false },
    { name: 'gdt', label: 'GDT (Tencent)', enabled: false, isZip: true, zipName: 'gdt' },
    { name: 'gdt_portrait', label: 'GDT Portrait', enabled: false, isZip: true, zipName: 'portrait' },
    { name: 'gdt_landscape', label: 'GDT Landscape', enabled: false, isZip: true, zipName: 'landscape' }
];

export function getChannelInfo(name: string): ChannelInfo {
    const found = ALL_CHANNELS.find(c => c.name === name);
    if (found) return found;
    return { name, label: name, enabled: false, isZip: false };
}

export function getChannelSnippet(channelName: string, staticDir: string): ChannelSnippet {
    const channelDir = path.join(staticDir, 'channel', channelName);
    const snippet: ChannelSnippet = {
        metaHtml: '',
        headJs: '',
        scriptJs: ''
    };

    if (!fs.existsSync(channelDir)) {
        return snippet;
    }

    const metaFile = path.join(channelDir, 'meta.html');
    if (fs.existsSync(metaFile)) {
        snippet.metaHtml = fs.readFileSync(metaFile, 'utf-8').trim();
    }

    const headFile = path.join(channelDir, 'head.js');
    if (fs.existsSync(headFile)) {
        snippet.headJs = fs.readFileSync(headFile, 'utf-8').trim();
    }

    const scriptFile = path.join(channelDir, 'script.js');
    if (fs.existsSync(scriptFile)) {
        snippet.scriptJs = fs.readFileSync(scriptFile, 'utf-8').trim();
    }

    const configFile = path.join(channelDir, 'config.json');
    if (fs.existsSync(configFile)) {
        try {
            snippet.config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        } catch (_) {}
    }

    return snippet;
}
