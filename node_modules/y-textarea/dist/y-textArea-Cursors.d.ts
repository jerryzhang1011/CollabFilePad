import { options } from './y-textarea-options';
import * as Y from 'yjs';
export declare class TextAreaCursors {
    private _unobserveFns;
    private _cursors;
    private _areaID;
    private _textField?;
    constructor(yText: Y.Text, textField: HTMLTextAreaElement | HTMLInputElement, options: options);
    rePositionCursors(): void;
    destroy(): void;
}
