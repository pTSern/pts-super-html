
import { Component, _decorator } from 'cc';

const { ccclass, property } = _decorator

@ccclass("pTS_SuperHtml_Bridge")
export class pTS_SuperHtml_Bridge extends Component {

    private get _html(): any {
        //@ts-ignore
        return window.pTS_html
    }

    protected _isEndGame: boolean = false;
    setGameEnd() {
        if(this._isEndGame) return
        this._isEndGame = true;

        console.log("game end");
        const html = this._html;
        html && typeof html.game_end === 'function' && html.game_end();
    }

    download() {
        this.setGameEnd();
        const html = this._html;
        html && typeof html.download === 'function' && html.download();
    }

    isAudio() {
        const html = this._html;
        return (html && typeof html.is_audio === 'function' && html.is_audio()) || true;
    }
}
