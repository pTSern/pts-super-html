import * as path from 'path';
import { packPlayable } from '../core/pack';
import { loadSettings } from '../core/settings';

async function main() {
    const projectPath = path.resolve(__dirname, '..', '..', '..', '..');
    const settings = loadSettings(projectPath);

    // Command line arguments support:
    // node pack-cli.js [inputDir] [outDir] [encoding] [compression] [customName] [isCompressImages]
    const args = process.argv.slice(2);
    let options: any;

    if (args[0] === '--config' && args[1]) {
        try {
            options = JSON.parse(Buffer.from(args[1], 'base64').toString('utf-8'));
        } catch (_) {
            options = JSON.parse(args[1]);
        }
    } else {
        const inputDir = args[0] || settings.inputDir || path.join(projectPath, 'build', 'web-mobile-007');
        const outDir = args[1] || settings.outDir || path.join(projectPath, 'build', 'super-html');
        const encoding = (args[2] as any) || settings.encoding || 'base122';
        const compression = (args[3] as any) || settings.compression || 'zip-fast';
        const customName = args[4] || (settings.isCustomName ? settings.customName : undefined);
        const isCompressImages = args[5] !== undefined ? args[5] === 'true' || args[5] === '1' : settings.isCompressImages;
        const isDownsampleAudio = args[6] !== undefined ? args[6] === 'true' || args[6] === '1' : settings.isDownsampleAudio;
        const isSubsetFonts = args[7] !== undefined ? args[7] === 'true' || args[7] === '1' : settings.isSubsetFonts;
        const isOptimizeMesh = args[8] !== undefined ? args[8] === 'true' || args[8] === '1' : settings.isOptimizeMesh;
        const meshQuantizationBits = args[9] !== undefined ? parseInt(args[9], 10) : settings.meshQuantizationBits;

        options = {
            inputDir,
            outDir,
            compression,
            encoding,
            channels: settings.channels,
            isMinCss: settings.isMinCss,
            isMinJs: settings.isMinJs,
            isCompressImages,
            isDownsampleAudio,
            isSubsetFonts,
            isOptimizeMesh,
            meshQuantizationBits,
            customName,
            iosUrl: settings.iosUrl,
            androidUrl: settings.androidUrl
        };
    }

    console.log('--- pTS Super HTML Pack CLI ---');
    console.log('Input directory:    ', options.inputDir);
    console.log('Output directory:   ', options.outDir);
    console.log('Compression method: ', options.compression);
    console.log('Encoding format:    ', options.encoding);
    console.log('Image compression:  ', options.isCompressImages ? 'ENABLED' : 'DISABLED');
    console.log('Audio downsampling: ', options.isDownsampleAudio ? 'ENABLED' : 'DISABLED');
    console.log('Font subsetting:    ', options.isSubsetFonts ? 'ENABLED' : 'DISABLED');
    console.log('Mesh optimization:  ', options.isOptimizeMesh ? `ENABLED (${options.meshQuantizationBits || 10}-bit)` : 'DISABLED');
    if (options.customName) {
        console.log('Custom output name: ', options.customName);
    }
    console.log('iOS Store URL:      ', options.iosUrl || '(none)');
    console.log('Android Store URL:  ', options.androidUrl || '(none)');
    console.log('Channels:           ', (options.channels || []).join(', '));

    options.onProgress = (pct: number, msg: string) => {
        console.log(`[${pct}%] ${msg}`);
    };

    const result = await packPlayable(options);

    if (result.success) {
        console.log(`\n🎉 Packaging completed successfully in ${(result.durationMs / 1000).toFixed(2)}s!`);
        if (result.imageSavingsBytes && result.imageSavingsBytes > 0) {
            console.log(`🖼️ TinyPNG Image Savings: ${(result.imageSavingsBytes / 1024).toFixed(1)} KB`);
        }
        if (result.audioSavingsBytes && result.audioSavingsBytes > 0) {
            console.log(`🎵 Audio Savings: ${(result.audioSavingsBytes / 1024).toFixed(1)} KB`);
        }
        if (result.fontSavingsBytes && result.fontSavingsBytes > 0) {
            console.log(`🔤 Font Savings: ${(result.fontSavingsBytes / 1024).toFixed(1)} KB`);
        }
        if (result.meshSavingsBytes && result.meshSavingsBytes > 0) {
            console.log(`🧊 3D Mesh Optimization: ${(result.meshSavingsBytes / 1024).toFixed(1)} KB`);
        }
        console.log(`Source files: ${result.sourceFiles} | Payload ZIP: ${(result.zipBytes / 1024).toFixed(1)} KB`);
        console.log(`Generated ${result.outputs.length} outputs:`);
        result.outputs.forEach(o => {
            console.log(` - [${o.channel}] ${(o.size / 1024).toFixed(1)} KB: ${o.path}`);
        });
    } else {
        console.error('\n❌ Packaging failed:', result.error);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
});
