import { describe } from 'mocha';
import { expect } from 'chai';
import { MongoRPCTest } from './MongoRPCTest';
const log4js = require('log4js');
const logger = log4js.getLogger('MongoRPCTest');
const sleep = require('sleep-promise');

try {
    log4js.configure('./log4js.json');
} catch (e) {
    console.error('unable to load Log4j configurations', e);
    process.exit(1);
}
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', JSON.stringify(err, null, 2));
    process.exit(1);
});

describe('Common', function () {
    let mongoRPCTest: MongoRPCTest;

    beforeEach(async () => {
        mongoRPCTest = new MongoRPCTest();
        await mongoRPCTest.initServerAndClient();
        await sleep(10);
    });

    afterEach(async () => {
        await mongoRPCTest.closeServerAndClient();
    });

    after(async () => {
        // There might be some pending tasks in the event loop.
        // Going to debug this later.
        process.exit(0);
    });

    it('Should be able to call server and return result', async function () {
        let methodName = "helloWorld";
        let sendArguments = "arguments from client";
        let receiveArguments = "arguments from server";

        mongoRPCTest.server.subscribe(methodName, async (args) => {
            expect(args).to.equal(sendArguments);
            return receiveArguments;
        });

        let result = await mongoRPCTest.client.call(methodName, sendArguments);
        expect(result).to.equal(receiveArguments);
    });

    it('Should be able to roundtrip all the primitive types as argument.', async function () {
        let methodName = "helloWorld";
        let sendArguments = {
            string: "string",
            number: 1,
            boolean: true,
            null: null,
            // undefined: undefined, // undefined is not supported, fallback to null.
            array: [1, 2, 3],
            object: {
                string: "string",
                number: 1,
                boolean: true,
                null: null,
                array: [1, 2, 3]
            }
        }

        let currentArgumentType;

        mongoRPCTest.server.subscribe(methodName, async (args) => {
            expect(args).to.deep.equal(sendArguments[currentArgumentType]);
            return args;
        });

        for (let argType in sendArguments) {
            currentArgumentType = argType;
            let result = await mongoRPCTest.client.call(methodName, sendArguments[argType]);
            expect(result).to.deep.equal(sendArguments[argType]);
        }
    });

    it('Should be able to support async function.', async function () {
        let methodName = "helloWorld";
        let sendArguments = "arguments from client";
        let receiveArguments = "arguments from server";

        mongoRPCTest.server.subscribe(methodName, async (args) => {
            expect(args).to.equal(sendArguments);
            await sleep(1000);
            return receiveArguments;
        });

        let before = performance.now();
        let result = await mongoRPCTest.client.call(methodName, sendArguments);
        expect(result).to.equal(receiveArguments);
        let after = performance.now();
        expect(after - before).to.be.greaterThan(800);
        expect(after - before).to.be.lessThan(10000);
    });

    it('Should be able to forward exception to the client', async function () {
        let methodName = "helloWorld";
        let sendArguments = "arguments from client";
        let errorMessage = "error message from server";

        mongoRPCTest.server.subscribe(methodName, async (args) => {
            expect(args).to.equal(sendArguments);
            throw new Error(errorMessage);
        });

        try
        {
            let result = await mongoRPCTest.client.call(methodName, sendArguments);
            // should not reach here, should be caught by the catch
            expect(false).to.be.true;
        }
        catch (e)
        {
            expect(e.name).to.equal("RemoteFunctionError");
            expect(e.message).to.equal(errorMessage);
        }
    });

});