export type Encoding = 'base64' | 'base122';
export type CompressionMethod = 'zip-fast' | 'zip-standard' | 'solid-deflate';

export interface ChannelInfo {
    name: string;
    configName?: string;
    label: string;
    enabled: boolean;
    isZip: boolean;
    zipName?: string;
}

export interface PluginSettings {
    compression: CompressionMethod;
    encoding: Encoding;
    inputDir: string;
    outDir: string;
    channels: string[];
    isMinCss: boolean;
    isMinJs: boolean;
    isCompressImages: boolean;
    isDownsampleAudio: boolean;
    isSubsetFonts: boolean;
    isOptimizeMesh: boolean;
    meshQuantizationBits?: number;
    isAutoBuildOnCocosBuild?: boolean;
    isCustomName: boolean;
    customName: string;
    iosUrl: string;
    androidUrl: string;
}

export interface PackOptions {
    inputDir: string;
    outDir: string;
    compression?: CompressionMethod;
    encoding: Encoding;
    channels?: string[];
    isMinCss?: boolean;
    isMinJs?: boolean;
    isCompressImages?: boolean;
    isDownsampleAudio?: boolean;
    isSubsetFonts?: boolean;
    isOptimizeMesh?: boolean;
    meshQuantizationBits?: number;
    customName?: string;
    iosUrl?: string;
    androidUrl?: string;
    onProgress?: (progress: number, message: string) => void;
}

export interface PackResultOutput {
    channel: string;
    path: string;
    size: number;
    encoding: Encoding;
    compression: CompressionMethod;
}

export interface PackResult {
    success: boolean;
    sourceFiles: number;
    zipBytes: number;
    outputs: PackResultOutput[];
    durationMs: number;
    imageSavingsBytes?: number;
    audioSavingsBytes?: number;
    fontSavingsBytes?: number;
    meshSavingsBytes?: number;
    error?: string;
}
