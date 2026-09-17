/**
 * pTS Super HTML - Cocos Creator 2.4.x Loader (Legacy)
 * Note: Modern PLACore builds on Cocos Creator 3.8.8 use src/runtime/bootstrap.ts instead.
 */

window.pTS_reg_search = function(regex) {
    for (var key in window.__res) {
        if (regex.test(key)) return key;
    }
    return '';
};

window.pTS_check_channel = function(channelObj) {
    if (!channelObj) {
        console.error('[pTS-super-html] Unable to run, please run on {' + window.pTS_html_channel + '}');
        return false;
    }
    return true;
};

console.log(
    'by pTSern\nchannel : ' + window.pTS_html_channel +
    '\ngithub: https://github.com/pTSern/pts-super-html'
);

window.pTS_boot_engine = function() {
    pTS_eval(pTS_reg_search(/^cocos2d-js[a-zA-Z0-9-.]*\.js$/));
    pTS_eval(pTS_reg_search(/^physics[a-zA-Z0-9-.]*\.js$/));

    var resCache = {};
    function getRes(key) {
        if (resCache[key]) return resCache[key];

        var data = window.__res[key];
        var offset = window.oasjidx || 0;
        if (offset && data && data.indexOf && data.indexOf('data:') === 0 && data.length > offset) {
            data = data.slice(0, offset) + data.slice(offset + 1);
        }

        resCache[key] = data;
        delete window.__res[key];
        return data;
    }

    function base64ToUint8Array(base64Str) {
        var binary = atob(base64Str.substring(base64Str.indexOf(',') + 1));
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function normalizeBase64(str) {
        return str.replace(/-/g, '+').replace(/_/g, '/');
    }

    function loadText(url, options, onComplete) {
        options.responseType = 'text';
        onComplete(null, getRes(url));
    }

    function loadJson(url, options, onComplete) {
        options.responseType = 'text';
        onComplete(null, JSON.parse(getRes(url)));
    }

    function loadImage(url, options, onComplete) {
        var img = new Image();
        var srcData = getRes(url);
        function onLoad() {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            onComplete && onComplete(null, img);
        }
        function onError() {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            onComplete && onComplete(new Error('Load image (' + url + ') failed'));
        }
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
        img.src = srcData;
        return img;
    }

    // Audio downloader setup for Cocos 2.4.x
    var loadAudio = null;
    (function() {
        var audioSupport = cc.sys.__audioSupport;
        var formatList = audioSupport.format;
        var audioContext = audioSupport.context;

        var loadWebAudio = function(url, options, onComplete) {
            options.responseType = 'arraybuffer';
            var resData = getRes(url);
            resData = normalizeBase64(resData);
            var uint8 = base64ToUint8Array(resData);
            if (uint8) {
                audioContext.decodeAudioData(
                    uint8.buffer,
                    function(decodedBuffer) { onComplete && onComplete(null, decodedBuffer); },
                    function() { onComplete && onComplete('decode error - ' + url, null); }
                );
            } else {
                onComplete('request error - ' + url, null);
            }
        };

        var loadDomAudio = function(url, options, onComplete) {
            var audioEl = document.createElement('audio');
            audioEl.muted = false;
            audioEl.src = getRes(url);

            var cleanup = function() {
                clearTimeout(timeoutId);
                audioEl.removeEventListener('canplaythrough', onCanPlay, false);
                audioEl.removeEventListener('error', onError, false);
                if (audioSupport.USE_LOADER_EVENT) {
                    audioEl.removeEventListener(audioSupport.USE_LOADER_EVENT, onCanPlay, false);
                }
            };

            var timeoutId = setTimeout(function() {
                if (audioEl.readyState === 0) onError();
                else onCanPlay();
            }, 8000);

            var onCanPlay = function() {
                cleanup();
                onComplete && onComplete(null, audioEl);
            };

            var onError = function() {
                cleanup();
                var errMsg = 'load audio failure - ' + url;
                cc.log(errMsg);
                onComplete && onComplete(new Error(errMsg));
            };

            audioEl.addEventListener('canplaythrough', onCanPlay, false);
            audioEl.addEventListener('error', onError, false);
            if (audioSupport.USE_LOADER_EVENT) {
                audioEl.addEventListener(audioSupport.USE_LOADER_EVENT, onCanPlay, false);
            }
            return audioEl;
        };

        var audioDispatcher = function(url, options, onComplete) {
            if (options.audioLoadMode !== cc.AudioClip.LoadMode.DOM_AUDIO) {
                loadWebAudio(url, options, onComplete);
            } else {
                loadDomAudio(url, options, onComplete);
            }
        };

        loadAudio = function(url, options, onComplete) {
            if (formatList.length === 0) {
                return new Error('Audio Downloader: audio not supported on this browser!');
            }
            var handler = audioSupport.WEB_AUDIO ? audioDispatcher : loadDomAudio;
            handler(url, options, onComplete);
        };
    })();

    // Binary loader
    function loadBinary(url, options, onComplete) {
        var raw = getRes(url);
        onComplete(null, base64ToUint8Array(raw));
    }

    // Video loader
    function loadVideo(url, options, onComplete) {
        var raw = getRes(url);
        raw = normalizeBase64(raw);
        onComplete && onComplete(null, base64ToUint8Array(raw));
    }

    // Font loader
    function loadFont(url, options, onComplete) {
        var family = url.replace(/[./ "'\\]*/g, '');
        var data = getRes(url);
        if (data == null) {
            onComplete();
            return;
        }
        var fontFace = new FontFace(family, 'url(' + data + ')');
        document.fonts.add(fontFace);
        fontFace.load();
        fontFace.loaded.then(
            function() { onComplete(null, family); },
            function() {
                cc.warnID(0x1345, family);
                onComplete(null, family);
            }
        );
    }

    // Script evaluator
    function loadScript(url, options, onComplete) {
        pTS_eval(url);
        onComplete && onComplete(null);
    }

    // Bundle loader
    var loadBundle = null;
    (function() {
        var urlRegex = /^(?:\w+:\/\/|\.+\/).+/;
        loadBundle = function(bundleName, options, onComplete) {
            var basename = cc.path.basename(bundleName);
            var bundlePath = bundleName;
            if (!urlRegex.test(bundlePath)) {
                bundlePath = 'assets/' + basename;
            }

            var version = options.version || cc.assetManager.downloader.bundleVers[basename];
            var stepCount = 0;
            var configUrl = bundlePath + '/config.' + (version ? version + '.' : '') + 'json';

            var configError = null;
            var configResult = null;

            loadJson(configUrl, options, function(err, res) {
                if (err) configError = err;
                configResult = res;
                if (configResult) {
                    configResult.base = bundlePath + '/';
                }
                stepCount++;
                if (stepCount === 2) {
                    onComplete && onComplete(configError, configResult);
                }
            });

            var indexScriptUrl = bundlePath + '/index.' + (version ? version + '.' : '') + 'js';
            loadScript(indexScriptUrl, options, function(err) {
                if (err) configError = err;
                stepCount++;
                if (stepCount === 2) {
                    onComplete && onComplete(configError, configResult);
                }
            });
        };
    })();

    // Register all custom format downloaders
    var formatHandlers = {
        '.png': loadImage, '.jpg': loadImage, '.bmp': loadImage,
        '.jpeg': loadImage, '.gif': loadImage, '.ico': loadImage,
        '.tiff': loadImage, '.webp': loadImage, '.image': loadImage,
        '.mp3': loadAudio, '.ogg': loadAudio, '.wav': loadAudio, '.m4a': loadAudio,
        '.txt': loadText, '.xml': loadText, '.vsh': loadText, '.fsh': loadText,
        '.atlas': loadText, '.tmx': loadText, '.tsx': loadText, '.plist': loadText,
        '.fnt': loadText, '.json': loadJson, '.ExportJson': loadJson,
        '.mp4': loadVideo, '.avi': loadVideo, '.mov': loadVideo,
        '.mpg': loadVideo, '.mpeg': loadVideo, '.rm': loadVideo, '.rmvb': loadVideo,
        '.binary': loadBinary, '.bin': loadBinary, '.dbin': loadBinary,
        '.dbbin': loadBinary, '.skel': loadBinary, '.pvr': loadBinary, '.pkm': loadBinary,
        '.ttf': loadFont, '.font': loadFont, '.eot': loadFont, '.woff': loadFont,
        '.svg': loadFont, '.ttc': loadFont,
        '.js': loadScript,
        'bundle': loadBundle,
        'default': loadText
    };

    cc.assetManager.downloader.loadScript = loadScript;
    cc.assetManager.downloader.register(formatHandlers);

    function dataUriToBlob(dataUri) {
        var parts = dataUri.split(',');
        var match = parts[0].match(/:(.*?);/);
        var mime = (match && match.length > 1 ? match[1] : 'application/octet-stream');
        var binary = window.atob(parts[1]);
        var buffer = new ArrayBuffer(binary.length);
        var view = new Uint8Array(buffer);
        for (var i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }
        return new Blob([buffer], { type: mime });
    }

    // Hook VideoPlayer for Cocos 2.4.x
    if (cc.VideoPlayer) {
        var origSetURL = cc.VideoPlayer.Impl.prototype.setURL;
        cc.VideoPlayer.Impl.prototype.setURL = function(url, options) {
            var res = getRes(url);
            if (res) {
                res = dataUriToBlob(res);
                var blobUrl = URL.createObjectURL(res);
                return origSetURL.call(this, blobUrl, options);
            }
            return origSetURL.call(this, url, options);
        };
    }

    // Hook AudioEngine for Cocos 2.4.x
    try {
        if (window.pTS_html && pTS_html.is_audio && cc.audioEngine) {
            var origPlayMusic = cc.audioEngine.playMusic;
            cc.audioEngine.playMusic = function(clip, loop) {
                if (!pTS_html.is_audio()) {
                    window.pTS_music_ins = [clip, loop];
                    return;
                }
                origPlayMusic.call(this, clip, loop);
            };

            var origPlayEffect = cc.audioEngine.playEffect;
            cc.audioEngine.playEffect = function(clip, loop) {
                if (!pTS_html.is_audio()) return;
                origPlayEffect.call(this, clip, loop);
            };
        }
    } catch (err) {
        console.log(err);
    }

    // Boot Cocos Creator 2.4.x
    window.boot();
};