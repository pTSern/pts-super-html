/**
 * pTS Super HTML - Cocos Creator 3.4.x Loader (Legacy)
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
    function resolveKey(target) {
        var res = window.__res;
        if (res[target]) return target;
        for (var key in res) {
            var idx = target.indexOf(key);
            if (idx !== -1 && idx + key.length === target.length) return key;
        }
        return target;
    }

    var resCache = {};
    window.getRes = function(key) {
        key = resolveKey(key);
        if (resCache[key]) return resCache[key];

        var data = window.__res[key];
        var offset = window.oasjidx || 0;
        if (offset && data && data.indexOf && data.indexOf('data:') === 0 && data.length > offset) {
            data = data.slice(0, offset) + data.slice(offset + 1);
        }

        resCache[key] = data;
        delete window.__res[key];
        return data;
    };

    function hookScriptElement() {
        window._createLocalJSElement = function() {
            var scriptEl = document.createElement('_my');
            scriptEl.src = '';
            scriptEl.addEventListener = function(event, callback) {
                this[event] = callback;
                if (event === 'load') {
                    setTimeout(function() {
                        pTS_eval(resolveKey(scriptEl.src));
                        if (window.cc) hookCocosComponents();
                        callback();
                    });
                }
            };
            return scriptEl;
        };
    }

    function hookCocosComponents() {
        if (window.xxxx__) return;
        window.xxxx__ = true;

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

        // 1. Hook VideoPlayer
        if (cc.internal && cc.internal.VideoPlayerImplManager) {
            function videoHandler(url, options, onComplete) {
                var videoEl = document.createElement('video');
                var sourceEl = document.createElement('source');
                videoEl.appendChild(sourceEl);
                onComplete(null, videoEl);
            }

            cc.assetManager.downloader.register({
                '.mp4': videoHandler,
                '.avi': videoHandler,
                '.mov': videoHandler,
                '.mpg': videoHandler,
                '.mpeg': videoHandler,
                '.rm': videoHandler,
                '.rmvb': videoHandler
            });

            var origGetImpl = cc.internal.VideoPlayerImplManager.getImpl;
            cc.internal.VideoPlayerImplManager.getImpl = function(options) {
                var impl = origGetImpl.call(this, options);
                var origCreateVideo = impl.createVideoPlayer;
                impl.createVideoPlayer = function(url) {
                    var res = getRes(url);
                    if (res) {
                        res = dataUriToBlob(res);
                        var blobUrl = URL.createObjectURL(res);
                        return origCreateVideo.call(this, blobUrl);
                    }
                    return origCreateVideo.call(this, url);
                };
                return impl;
            };
        }

        // 2. Hook AudioSourceComponent
        try {
            if (window.pTS_html && pTS_html.is_audio && cc.AudioSourceComponent) {
                var origPlay = cc.AudioSourceComponent.prototype.play;
                cc.AudioSourceComponent.prototype.play = function() {
                    if (!pTS_html.is_audio()) {
                        window.pTS_music_ins = [this];
                        return;
                    }
                    origPlay.call(this);
                };

                var origPlayOneShot = cc.AudioSourceComponent.prototype.playOneShot;
                cc.AudioSourceComponent.prototype.playOneShot = function(clip, volume) {
                    if (!pTS_html.is_audio()) return;
                    origPlayOneShot.call(this, clip, volume);
                };
            }
        } catch (err) {
            console.log(err);
        }

        // 3. Hook Font Loading
        function hookFonts() {
            function fontHandler(url, options, onComplete) {
                var family = url.replace(/[./\s"']*/g, '');
                var res = getRes(url);
                if (res == null) {
                    onComplete();
                    return;
                }
                var fontFace = new FontFace(family, 'url(' + res + ')');
                document.fonts.add(fontFace);
                fontFace.load();
                fontFace.loaded.then(
                    function() { onComplete(null, family); },
                    function() {
                        console.error('url ' + url + ' load fail');
                        onComplete(null, family);
                    }
                );
            }

            cc.assetManager.downloader.register({
                '.font': fontHandler,
                '.eot': fontHandler,
                '.ttf': fontHandler,
                '.woff': fontHandler,
                '.svg': fontHandler,
                '.ttc': fontHandler
            });
        }
        hookFonts();

        // 4. Hook Image Loading
        function hookImages() {
            function imageHandler(url, options, onComplete) {
                var img = new Image();
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
                img.src = getRes(url) || url;
                return img;
            }

            cc.assetManager.downloader.register({
                '.png': imageHandler,
                '.jpg': imageHandler,
                '.bmp': imageHandler,
                '.jpeg': imageHandler,
                '.gif': imageHandler,
                '.webp': imageHandler,
                '.ico': imageHandler,
                '.tiff': imageHandler,
                '.image': imageHandler
            });
        }
        hookImages();
    }

    hookScriptElement();

    function base64ToArrayBuffer(base64Str) {
        var binary = atob(base64Str.substring(base64Str.indexOf(',') + 1));
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function hookNetwork() {
        var origFetch = window.fetch;
        if (origFetch) {
            window.fetch = async function(url, ...args) {
                pTS_log('fetch ' + url);
                var res = getRes(url);
                if (!res) return origFetch(url, ...args);
                return new Promise(function(resolve) {
                    var buf = base64ToArrayBuffer(res);
                    resolve({
                        arrayBuffer: async function() { return buf; }
                    });
                });
            };
        }

        window._XMLLocalRequest = function() {
            this.open = function(method, url) {
                this.url = url;
                this.status = 200;
            };
            this.overrideMimeType = function() {};
            this.setRequestHeader = function() {};
            this.send = function() {
                var res = getRes(this.url);
                var responseData = null;
                switch (this.responseType) {
                    case 'json':
                        responseData = JSON.parse(res);
                        break;
                    case 'text':
                        responseData = res;
                        break;
                    case 'arraybuffer':
                        responseData = base64ToArrayBuffer(res);
                        break;
                    default:
                        console.error('type error', this.url, this.responseType);
                        break;
                }
                this.response = responseData;
                setTimeout(() => {
                    this.onload && this.onload();
                });
            };
        };
    }

    hookNetwork();

    var entryScript = pTS_reg_search(/^index[a-zA-Z0-9.]*\.js$/);
    System.import('./' + entryScript).catch(function(err) {
        console.error(err);
    });
};