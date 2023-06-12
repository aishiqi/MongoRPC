import { MongoClient, Db, Collection, ObjectId, ReturnDocument, ChangeStream, InsertOneOptions } from 'mongodb';
import { Message, Status } from './Models';
import {RemoteFunctionError, ConnectionError, SystemError } from './Exceptions';
import { Subscription, SubscriptionMap  } from './Subscription';
import { Request, RequestMap } from './Request';
import { strict as assert } from 'assert';
import * as log4js from "log4js";
const logger = log4js.getLogger('MongoRPC');
const sleep = require('sleep-promise');

let calleeTimeout = 600*1000;
let callerTimeout = 660*1000;

export class MongoRPC {
    private static RPC_COLLECTION_NAME = "mongo_rpc";
    private database: Db;
    private changeStream: ChangeStream;
    private mongoClient: MongoClient;
    private channel: string;
    private pendingRequests : RequestMap = {};
    private subscribers: SubscriptionMap = {};
    private name: string;

    constructor(channel: string) {
        this.channel = channel;
    }

    public setName(name: string) {
        this.name = name;
    }

    public setCallerTimeout(timeout: number) {
        callerTimeout = timeout;
    }

    public setCalleeTimeout(timeout: number) {
        calleeTimeout = timeout;
    }

    private getCollection(): Collection<Message> {
        if (!this.database) {
            throw new Error("MongoRPC not initialized.");
        }

        return this.database.collection<Message>(MongoRPC.RPC_COLLECTION_NAME);
    }

    public async initWithUrlDatabaseName(mongoUrl: string, databaseName: string) {
        this.mongoClient = await MongoClient.connect(mongoUrl);
        this.database = this.mongoClient.db(databaseName);
        await this.initWithDatabase(this.database);
    }

    public async initWithDatabase(database: Db) {
        this.database = database;
        try {
            await database.createCollection(MongoRPC.RPC_COLLECTION_NAME);
        } catch (e) {
            // Collection already exists, skip.
        }
        await this.initStream();
    }

    private async initStream() {
        let optionalPipeLine = []
        this.changeStream = this.getCollection().watch(optionalPipeLine)

        this.changeStream.on("change", async event => {
            // logger.debug("changeStream event: ", this.name, event);

            // Full list of all events are here https://www.mongodb.com/docs/manual/reference/change-events/
            /*
                Change Events
                insert Event
                update Event
                replace Event
                delete Event
                drop Event
                rename Event
                dropDatabase Event
                invalidate Event
            */
            /*
            arg1:{_id: {…}, operationType: 'insert', clusterTime: Timestamp, fullDocument: {…}, ns: {…}, …}
                _id:{_data: '826243C15A000000012B022C0100296E5A1004BD5567B…4A446645F696400646243C15A3D41928BD71B03D60004'}
                clusterTime:Timestamp {low: 1, high: 1648607578, unsigned: true, __isLong__: true, _bsontype: 'Timestamp'}
                documentKey:{_id: ObjectId}
                fullDocument:{_id: ObjectId, name: 'aishiqi', age: 10}
                ns:{db: 'test', coll: 'pubsub'}
                operationType:'insert'
                [[Prototype]]:Object

            arg1:{_id: {…}, operationType: 'update', clusterTime: Timestamp, ns: {…}, documentKey: {…}, …}
                _id:{_data: '826243C54B000000022B022C0100296E5A1004BD5567B…4A446645F696400646243BB981A0489C996CB602A0004'}
                clusterTime:Timestamp {low: 2, high: 1648608587, unsigned: true, __isLong__: true, _bsontype: 'Timestamp'}
                documentKey:{_id: ObjectId}
                ns:{db: 'test', coll: 'pubsub'}
                operationType:'update'
                updateDescription:{updatedFields: {…}, removedFields: Array(0), truncatedArrays: Array(0)}
                [[Prototype]]:Object

            arg1:{_id: {…}, operationType: 'delete', clusterTime: Timestamp, ns: {…}, documentKey: {…}}
                _id:{_data: '826243C235000000012B022C0100296E5A1004BD5567B…4A446645F696400646243BB8138E082CE48B2BFF60004'}
                clusterTime:Timestamp {low: 1, high: 1648607797, unsigned: true, __isLong__: true, _bsontype: 'Timestamp'}
                documentKey:{_id: ObjectId}
                ns:{db: 'test', coll: 'pubsub'}
                operationType:'delete'
                [[Prototype]]:Object
            */
            if (!event) {
                return;
            }

            if (event.operationType == 'insert') {
                let document = event.fullDocument as Message;
                let objectId = document._id;
                assert(document.status == Status.Requested, "Invalid status.");
                if (!this.subscribers[document.method]) {
                    return;
                }

                // Acknowledge the request, and lock it.
                let filter = { _id: objectId, status: Status.Requested };
                let update = { $set: { status: Status.AcknowledgedAndLocked } };
                let options = { returnDocument: ReturnDocument.AFTER };
                logger.debug("acquiring lock");
                let lockedResult = await this.getCollection().findOneAndUpdate(filter, update, options);
                if (!lockedResult.ok) {
                    // If Someone else has already taken the request.
                    return;
                }
                assert(lockedResult.value.status == Status.AcknowledgedAndLocked, "Invalid status.");
                logger.debug("acquired lock");

                // Check if I am still interested in this request.
                if (!this.subscribers[document.method]) {
                    return;
                }

                let updateResult;
                try {
                    let argsObject = JSON.parse(lockedResult.value.args);
                    let result = await this.subscribers[lockedResult.value.method].invoke(argsObject)
                    let resultJson = JSON.stringify(result);

                    logger.debug("Updating message to CompletedSuccess");
                    updateResult = await this.getCollection().updateOne({ _id: objectId }, { $set: { result: resultJson, status: Status.CompletedSuccess, completeTime: new Date() } });
                    logger.debug("Updated message to CompletedSuccess");
                    assert(updateResult.acknowledged === true, "Update failed.");
                    assert(updateResult.matchedCount === 1, "Update failed.")
                    assert(updateResult.modifiedCount === 1, "Update failed.");
                }
                catch (err) {
                    if (err instanceof Error) {
                        // Error is not serializable, so we need to convert it to string.
                        err = err.message
                    }
                    let errorJson = JSON.stringify(err);
                    updateResult = await this.getCollection().updateOne({ _id: objectId }, { $set: { error: errorJson, status: Status.CompletedError, completeTime: new Date() } });
                }
                assert(updateResult.acknowledged === true, "Update failed.");
                assert(updateResult.matchedCount === 1, "Update failed.")
                assert(updateResult.modifiedCount === 1, "Update failed.");
            }
            else if (event.operationType == 'update') {
                let updatedFields = event.updateDescription.updatedFields;
                let processed = false;
                if (updatedFields && (updatedFields.status == Status.CompletedSuccess || updatedFields.status == Status.CompletedError)) {
                    let objectIdHexString = event.documentKey._id.toHexString();
                    if (this.pendingRequests[objectIdHexString] && updatedFields) {
                        logger.debug("calling client callback");
                        let request = this.pendingRequests[objectIdHexString];
                        if (updatedFields.status == Status.CompletedSuccess) {
                            let resultObject = JSON.parse(updatedFields.result);
                            request.resolve(resultObject);
                            processed = true;
                        }
                        else if (updatedFields.status == Status.CompletedError) {
                            let errorObject = JSON.parse(updatedFields.error);
                            request.reject(new RemoteFunctionError(errorObject));
                            processed = true;
                        }
                    }
                }
                if (processed) {
                    logger.debug("deleting request");
                    void this.getCollection().deleteOne({ _id: event.documentKey._id });
                    logger.debug("deleted request");
                }
            }
            else if (event.operationType == 'delete') {
                if (this.pendingRequests[event.documentKey._id.toHexString()]) {
                    assert(false, "This is not normal case. Request deleted before completion.");
                }
            }
        })
    }

    public async call(method: string, args: any): Promise<any> {
        let message: Message = {
            _id: new ObjectId(),
            channel: this.channel,
            method: method,
            args: JSON.stringify(args),
            result: null,
            error: null,

            status: Status.Requested,
            requestTime: new Date(),
            acknowledgeTime: null,
            completeTime: null,
            deleteTime: null
        };

        let idHexString = message._id.toHexString();
        let request = new Request(idHexString, callerTimeout, this.pendingRequests);

        let collection = this.getCollection();
        logger.debug("Inserting message");

        let insertResult = await collection.insertOne(message);
        logger.debug("Inserting message Done");
        assert(insertResult.acknowledged === true, "Insert failed.");
        assert(insertResult.insertedId === message._id, "Insert failed.");

        return await request.promise;
    }

    public subscribe(method: string, callback: (args: any) => Promise<any>): Subscription {
        if (this.subscribers[method]) {
            throw new SystemError("Already subscribed.");
        }
        return new Subscription(this.subscribers, method, calleeTimeout, callback);
    }

    public async close() {
        if (this.changeStream) {
            await this.changeStream.close()
        }

        if (this.mongoClient) {
            await this.mongoClient.close();
        }

        this.changeStream = null;
        this.mongoClient = null;
        this.database = null;

        for (let key in this.pendingRequests) {
            let request = this.pendingRequests[key];
            request.reject(new ConnectionError("Connection closed."));
        }
    }
}