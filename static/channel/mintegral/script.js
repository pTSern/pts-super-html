window.__mintegral_started = false;

function gameStart() {
    window.__mintegral_started = true;
    if (typeof window.pTS_log === 'function') {
        window.pTS_log('[Mintegral] gameStart called');
    }

    if (typeof window.pTS_boot_engine === 'function') {
        window.pTS_boot_engine();
    }

    try {
        if (window.cc && window.cc.game && typeof window.cc.game.resume === 'function') {
            window.cc.game.resume();
        }
        if (window.cc && window.cc.audioEngine && typeof window.cc.audioEngine.resumeAll === 'function') {
            window.cc.audioEngine.resumeAll();
        }
    } catch (_) {}
}
window.gameStart = gameStart;

function gameClose() {
    if (typeof window.pTS_log === 'function') {
        window.pTS_log('[Mintegral] gameClose called');
    }

    try {
        if (window.cc && window.cc.game && typeof window.cc.game.pause === 'function') {
            window.cc.game.pause();
        }
        if (window.cc && window.cc.audioEngine && typeof window.cc.audioEngine.pauseAll === 'function') {
            window.cc.audioEngine.pauseAll();
        }
    } catch (_) {}
}
window.gameClose = gameClose;

var mintegralAdapter = {
    download: function(url) {
        if (typeof window.pTS_log === 'function') {
            window.pTS_log('[Mintegral] download called');
        }

        if (typeof window.install === 'function') {
            window.install();
        } else if (typeof window.pTS_open === 'function') {
            window.pTS_open(url);
        }
    },
    game_ready: function() {
        if (typeof window.pTS_log === 'function') {
            window.pTS_log('[Mintegral] game_ready called');
        }

        if (typeof window.gameReady === 'function') {
            try {
                window.gameReady();
            } catch (err) {
                console.error('[Mintegral] gameReady error:', err);
            }
            if (window.__mintegral_started) {
                window.gameStart();
            }
        } else {
            window.gameStart();
        }
    },
    game_end: function() {
        if (typeof window.pTS_log === 'function') {
            window.pTS_log('[Mintegral] game_end called');
        }

        if (typeof window.gameEnd === 'function') {
            window.gameEnd();
        }
    },
    game_retry: function() {
        if (typeof window.pTS_log === 'function') {
            window.pTS_log('[Mintegral] game_retry called');
        }

        if (typeof window.gameRetry === 'function') {
            window.gameRetry();
        }
    }
};

window.pTS_html = window.super_html = window.pTS_html || window.super_html || {};
for (var key in mintegralAdapter) {
    if (Object.prototype.hasOwnProperty.call(mintegralAdapter, key)) {
        window.pTS_html[key] = mintegralAdapter[key];
        window.super_html[key] = mintegralAdapter[key];
    }
}