import { MongoRPC } from "./src/MongoRPC";
const log4js = require('log4js');
const logger = log4js.getLogger('MongoRPC');
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

async function main() {
  let startServer = false;
  let startClient = false;

  if (process.argv.length == 2)
  {
    startServer = true;
    startClient = true;
  }
  else if (process.argv.length >= 3)
  {
    startServer = (process.argv[2] === "server");
    startClient = (process.argv[2] === "client");
  }

  logger.info(`startServer: ${startServer}`);
  logger.info(`startClient: ${startClient}`);

  const url = "mongodb://127.0.0.1:27017/MongoRPC";
  const databaseName = "MongoRPC";
  const channelName = "MyChannel";

  logger.info("========== Start ==========");
  let mongoRPCServer;
  if (startServer) {
    mongoRPCServer = new MongoRPC(channelName);
    mongoRPCServer.setName("Server");
    await mongoRPCServer.initWithUrlDatabaseName(url, databaseName);
    mongoRPCServer.subscribe("helloWorld", async (args) => {
      logger.info("Server received: ", args);
      return "Success from server.";
    });
  }

  let mongoRPCClient;
  if (startClient) {
    mongoRPCClient = new MongoRPC(channelName);
    mongoRPCClient.setName("Client");
    await mongoRPCClient.initWithUrlDatabaseName(url, databaseName);
    await sleep(100);
    let result = await mongoRPCClient.call("helloWorld", "arguments from client");
    logger.info("Client received: ", result);
  }

  if (startClient) {
    await mongoRPCClient.close();
  }
  if (startServer) {
    await mongoRPCServer.close();
  }

  logger.info("========== End ==========");
}

void main();

