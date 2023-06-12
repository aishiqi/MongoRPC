export class MongoRPCError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MongoRPCError';
    }
}

export class SystemError extends MongoRPCError {
    constructor(message: string) {
        super(message);
        this.name = 'SystemError';
    }
}

export class RemoteFunctionError extends MongoRPCError {
    constructor(message: string) {
        super(message);
        this.name = 'RemoteFunctionError';
    }
}

export class TimeoutError extends SystemError {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class ConnectionError extends SystemError {
    constructor(message: string) {
        super(message);
        this.name = 'ConnectionError';
    }
}