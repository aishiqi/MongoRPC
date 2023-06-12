import {TimeoutError } from './Exceptions';

export type RequestMap = {[key: string]: Request};

export class Request {
    private _resolve: (value: any) => void;
    private _reject: (reason?: any) => void;
    private timeout: number;
    private timeoutId: NodeJS.Timer = null;
    public promise: Promise<any>;
    private pendingRequests: RequestMap;
    private id: string;
    constructor(id, timeout, pendingRequests) {
        this.id = id;
        this.timeout = timeout;
        this.pendingRequests = pendingRequests;
        this.pendingRequests[id] = this;

        this.promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });

        this.timeoutId = setTimeout(() => {
            this.timeoutId = null;
            this.reject(new TimeoutError("Request timeout."));
        }, this.timeout);
    }

    private clear()
    {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
        delete this.pendingRequests[this.id];
    }

    public resolve(result: any) {
        this._resolve(result);
        this.clear();
    }

    public reject(error: any) {
        this._reject(error);
        this.clear();
    }
}