import { options } from './y-textarea-options';
import * as Y from 'yjs';
export declare class TextAreaBinding {
    private _cursors?;
    private _unobserveFns;
    constructor(yText: Y.Text, textField: HTMLTextAreaElement | HTMLInputElement, options?: options);
    private createRange;
    rePositionCursors(): void;
    destroy(): void;
}
