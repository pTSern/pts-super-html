import { loadSettings } from './core/settings';
import { packPlayable } from './core/pack';

declare const Editor: any;

export function load() {
    console.log('[pts-super-html-next] Extension loaded.');
}

export function unload() {
    console.log('[pts-super-html-next] Extension unloaded.');
}

export const methods = {
    openPanel() {
        if (typeof Editor !== 'undefined' && Editor.Panel) {
            Editor.Panel.open('pts-super-html-next');
        } else {
            console.log('[pts-super-html-next] openPanel called outside Editor environment.');
        }
    },

    async build() {
        const projectPath = (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) ? Editor.Project.path : process.cwd();
        const settings = loadSettings(projectPath);

        if (!settings.inputDir) {
            console.error('[pts-super-html-next] No input directory configured in settings.');
            return;
        }

        console.log(`[pts-super-html-next] Triggering build with encoding: ${settings.encoding}...`);
        const result = await packPlayable({
            inputDir: settings.inputDir,
            outDir: settings.outDir,
            encoding: settings.encoding,
            channels: settings.channels,
            isMinCss: settings.isMinCss,
            isMinJs: settings.isMinJs,
            onProgress: (pct, msg) => {
                console.log(`[pts-super-html-next] [${pct}%] ${msg}`);
            }
        });

        if (result.success) {
            console.log(`[pts-super-html-next] Build completed: ${result.outputs.length} outputs generated.`);
        } else {
            console.error(`[pts-super-html-next] Build failed: ${result.error}`);
        }

        return result;
    }
};
