# ReadMe

MongoRPC is a simple RPC framework based on mongodb change stream.

Example:

```typescript
const url = "mongodb://127.0.0.1:27017/MongoRPC";
const databaseName = "MongoRPC";
const channelName = "MyChannel";

let mongoRPCServer = new MongoRPC(channelName);
await mongoRPCServer.initWithUrlDatabaseName(url, databaseName);
mongoRPCServer.subscribe("helloWorld", async (args) => {
    logger.info("Server received: ", args);
    return "Success from server.";
});

let mongoRPCClient = new MongoRPC(channelName);
await mongoRPCClient.initWithUrlDatabaseName(url, databaseName);
await sleep(100);
let result = await mongoRPCClient.call("helloWorld", "arguments from client");
logger.info("Client received: ", result);
```



Run Example:

```bash
ts-node example.ts
```

Tests:

```bash
npm run test
```

see `tests/Common.test.ts` for all potential of usage.

Coverage:

```bash
npm run coverage
```
