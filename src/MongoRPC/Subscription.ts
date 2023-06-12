import {TimeoutError } from './Exceptions';

export type SubscriptionMap = {[key: string]: Subscription};

export class Subscription {
    private subscribers : SubscriptionMap;
    private method : string;
    private callback : (args?: string) => Promise<any>;
    private timeout : number;

    constructor(subscribers, method, timeout, callback) {
        this.subscribers = subscribers;
        this.method = method;
        this.timeout = timeout;
        this.callback = callback;
        subscribers[method] = this;
    }

    public async invoke(args: string) : Promise<any> {
        let promise = new Promise<string>((resolve, reject) => {
            let status = {finished: false};

            function resolveOnce(result) {
                if (status.finished) {
                    return;
                }
                status.finished = true;
                resolve(result);
            }

            function rejectOnce(error) {
                if (status.finished) {
                    return;
                }
                status.finished = true;
                reject(error);
            }

            try {
                this.callback(args).then((result) => {
                    resolveOnce(result);
                }).catch((error) => {
                    rejectOnce(error);
                });
            }
            catch (error) {
                rejectOnce(error);
            }

            setTimeout(() => {
                rejectOnce(new TimeoutError("Callee timeout."));
            }, this.timeout);
        });

        return await promise;
    }

    public close() {
        delete this.subscribers[this.method];
    }
}