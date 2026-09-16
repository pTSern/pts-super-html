import * as path from 'path';
import { packPlayable } from '../core/pack';
import { loadSettings } from '../core/settings';

async function main() {
    const projectPath = path.resolve(__dirname, '..', '..', '..', '..');
    const settings = loadSettings(projectPath);

    // Command line arguments support:
    // node pack-cli.js [inputDir] [outDir] [encoding] [compression] [customName] [isCompressImages]
    const args = process.argv.slice(2);
    const inputDir = args[0] || settings.inputDir || path.join(projectPath, 'build', 'web-mobile-007');
    const outDir = args[1] || settings.outDir || path.join(projectPath, 'build', 'super-html');
    const encoding = (args[2] as any) || settings.encoding || 'base122';
    const compression = (args[3] as any) || settings.compression || 'zip-fast';
    const customName = args[4] || (settings.isCustomName ? settings.customName : undefined);
    const isCompressImages = args[5] !== undefined ? args[5] === 'true' || args[5] === '1' : settings.isCompressImages;

    console.log('--- PTS Super HTML Next Pack CLI ---');
    console.log('Input directory:    ', inputDir);
    console.log('Output directory:   ', outDir);
    console.log('Compression method: ', compression);
    console.log('Encoding format:    ', encoding);
    console.log('Image compression:  ', isCompressImages ? 'ENABLED' : 'DISABLED');
    if (customName) {
        console.log('Custom output name: ', customName);
    }
    console.log('Channels:           ', settings.channels.join(', '));

    const result = await packPlayable({
        inputDir,
        outDir,
        compression,
        encoding,
        channels: settings.channels,
        isMinCss: settings.isMinCss,
        isMinJs: settings.isMinJs,
        isCompressImages,
        customName,
        onProgress: (pct, msg) => {
            console.log(`[${pct}%] ${msg}`);
        }
    });

    if (result.success) {
        console.log(`\n🎉 Packaging completed successfully in ${(result.durationMs / 1000).toFixed(2)}s!`);
        if (result.imageSavingsBytes && result.imageSavingsBytes > 0) {
            console.log(`🖼️ TinyPNG Image Savings: ${(result.imageSavingsBytes / 1024).toFixed(1)} KB`);
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
