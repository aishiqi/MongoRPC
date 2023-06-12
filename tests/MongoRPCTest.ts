import { MongoRPC } from "../src/MongoRPC/MongoRPC";
import { MongoClient } from 'mongodb';

const log4js = require('log4js');
const logger = log4js.getLogger('MongoRPCTest');
const sleep = require('sleep-promise');

export class MongoRPCTest {
    public client: MongoRPC;
    public server: MongoRPC;

    static url = "mongodb://127.0.0.1:27017/MongoRPC";
    static databaseName = "MongoRPC";

    static channelName = "MyChannel";

    constructor() {

    }

    public async initServerAndClient() {
        this.server = new MongoRPC(MongoRPCTest.channelName);
        this.server.setName("Server");
        await this.server.initWithUrlDatabaseName(MongoRPCTest.url, MongoRPCTest.databaseName);

        this.client = new MongoRPC(MongoRPCTest.channelName);
        this.client.setName("Client");
        await this.client.initWithUrlDatabaseName(MongoRPCTest.url, MongoRPCTest.databaseName);
    }

    public async closeServerAndClient() {
        await this.client.close();
        await this.server.close();
    }
}