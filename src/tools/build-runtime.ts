import * as fs from 'fs';
import * as path from 'path';

function buildRuntime() {
    const rootDir = path.resolve(__dirname, '..', '..');
    const jszipPath = path.join(rootDir, 'node_modules', 'jszip', 'dist', 'jszip.min.js');
    const fflatePath = path.join(rootDir, 'node_modules', 'fflate', 'umd', 'index.js');
    const bootstrapPath = path.join(rootDir, 'dist', 'runtime', 'bootstrap.js');
    const outDir = path.join(rootDir, 'dist', 'runtime');

    if (!fs.existsSync(bootstrapPath)) {
        throw new Error('Missing bootstrap.js at: ' + bootstrapPath + '. Run tsc first!');
    }
    if (!fs.existsSync(jszipPath)) {
        throw new Error('Missing JSZip at: ' + jszipPath);
    }
    if (!fs.existsSync(fflatePath)) {
        throw new Error('Missing fflate at: ' + fflatePath);
    }

    const jszipContent = fs.readFileSync(jszipPath, 'utf-8');
    const fflateContent = fs.readFileSync(fflatePath, 'utf-8');
    const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf-8');

    const runtimeWrapper = `
var pTS_RUNTIME = (function() {
    var exports = {};
${bootstrapContent}
    return exports;
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { pTS_RUNTIME.initRuntime(); });
} else {
    pTS_RUNTIME.initRuntime();
}
`;

    // 1. fflate loader (fast ZIP & solid-deflate)
    const loaderFflate = `/* pTS Super HTML Runtime Loader (fflate) */\n(function() {\n${fflateContent}\n})();\n${runtimeWrapper}`;

    // 2. JSZip loader (classic PKZIP)
    const loaderJszip = `/* pTS Super HTML Runtime Loader (JSZip) */\n(function() {\n${jszipContent}\n})();\n${runtimeWrapper}`;

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outFflateFile = path.join(outDir, 'loader-fflate.js');
    const outJszipFile = path.join(outDir, 'loader-jszip.js');
    const outDefaultFile = path.join(outDir, 'loader.js');
    const outBundleTs = path.join(outDir, 'loader-bundle.js');

    fs.writeFileSync(outFflateFile, loaderFflate.trim(), 'utf-8');
    fs.writeFileSync(outJszipFile, loaderJszip.trim(), 'utf-8');
    fs.writeFileSync(outDefaultFile, loaderFflate.trim(), 'utf-8');

    const bundleExport = `module.exports = {
    LOADER_FFLATE: ${JSON.stringify(loaderFflate.trim())},
    LOADER_JSZIP: ${JSON.stringify(loaderJszip.trim())},
    LOADER_SCRIPT: ${JSON.stringify(loaderFflate.trim())}
};\n`;
    fs.writeFileSync(outBundleTs, bundleExport, 'utf-8');

    console.log('[build-runtime] Successfully created loader-fflate.js (' + (loaderFflate.length / 1024).toFixed(1) + ' KB)');
    console.log('[build-runtime] Successfully created loader-jszip.js (' + (loaderJszip.length / 1024).toFixed(1) + ' KB)');
    console.log('[build-runtime] Successfully created default loader.js (' + (loaderFflate.length / 1024).toFixed(1) + ' KB)');
}

buildRuntime();
