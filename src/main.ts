declare const Editor: any;

export function load() {
    console.log('[pTS-super-html] Extension loaded.');
}

export function unload() {
    console.log('[pTS-super-html] Extension unloaded.');
}

export function openPanel(...args: any[]) {
    console.log('[pTS-super-html] openPanel >>', ...args);
    if (typeof Editor !== 'undefined' && Editor.Panel) {
        try {
            Editor.Panel.open('pts-super-html');
        } catch (_) {
            Editor.Panel.open('pts-super-html.default');
        }
    } else {
        console.log('[pTS-super-html] openPanel called outside Editor environment.');
    }
}

export async function build() {
    const projectPath = (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) ? Editor.Project.path : process.cwd();
    const { loadSettings } = require('./core/settings');
    const settings = loadSettings(projectPath);

    if (!settings.inputDir) {
        console.error('[pTS-super-html] No input directory configured in settings.');
        return;
    }

    console.log(`[pTS-super-html] Triggering build with encoding: ${settings.encoding}...`);
    const { packPlayable } = require('./core/pack');
    const result = await packPlayable({
        inputDir: settings.inputDir,
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
        iosUrl: settings.iosUrl,
        androidUrl: settings.androidUrl,
        customName: settings.isCustomName ? settings.customName : undefined,
        onProgress: (pct: number, msg: string) => {
            console.log(`[pTS-super-html] [${pct}%] ${msg}`);
        }
    });

    if (result && result.success) {
        console.log(`[pTS-super-html] Build completed: ${result.outputs.length} outputs generated.`);
    } else if (result) {
        console.error(`[pTS-super-html] Build failed: ${result.error}`);
    }

    return result;
}

export const methods = {
    openPanel,
    build
};

// Guarantee CommonJS and Cocos Extension Manager compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        load,
        unload,
        openPanel,
        build,
        methods
    };
    (module.exports as any).default = module.exports;
    (module.exports as any).methods = methods;
}
