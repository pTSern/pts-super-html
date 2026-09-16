import { loadSettings } from './core/settings';
import { packPlayable } from './core/pack';

declare const Editor: any;

export async function onAfterBuild(options: any, result: any) {
    if (options.platform !== 'web-mobile') {
        return;
    }

    const projectPath = (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) ? Editor.Project.path : process.cwd();
    const settings = loadSettings(projectPath);

    const inputDir = result.dest || settings.inputDir;
    if (!inputDir) {
        console.warn('[pts-super-html-next] onAfterBuild: Missing build output directory.');
        return;
    }

    console.log(`[pts-super-html-next] onAfterBuild triggered. Packing ${inputDir} [Encoding: ${settings.encoding}]...`);

    try {
        const packRes = await packPlayable({
            inputDir,
            outDir: settings.outDir,
            encoding: settings.encoding,
            channels: settings.channels,
            isMinCss: settings.isMinCss,
            isMinJs: settings.isMinJs,
            onProgress: (pct, msg) => {
                console.log(`[pts-super-html-next] [${pct}%] ${msg}`);
            }
        });

        if (packRes.success) {
            console.log(`[pts-super-html-next] Playable ads built successfully in ${(packRes.durationMs / 1000).toFixed(2)}s (${packRes.outputs.length} outputs).`);
        } else {
            console.error('[pts-super-html-next] Playable ads build failed:', packRes.error);
        }
    } catch (err) {
        console.error('[pts-super-html-next] Error during onAfterBuild hook:', err);
    }
}
