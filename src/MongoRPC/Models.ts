import {ObjectId } from 'mongodb';

export enum Status {
    Requested = "Requested",
    AcknowledgedAndLocked = "AcknowledgedAndLocked",
    Cancelled = "Cancelled" ,  // Unused for now, extend for cancellation.
    CompletedSuccess = "CompletedSuccess",
    CompletedError = "CompletedError",
    Deleted = "Deleted" ,  // Unused for now, We delete the message from database directly.
}

export type Message = {
    _id: ObjectId;
    channel: string;
    method: string;
    args: string;
    result : string;
    error: string;

    status: Status;
    requestTime: Date;
    acknowledgeTime : Date;
    completeTime : Date;
    deleteTime : Date;
}