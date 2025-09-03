import Logger from './src/Logger/Logger';
import LogLevel from './src/Logger/LogLevel';
import RoomManager from './src/Room/RoomManager';
let Server: App;

class App {
    logger: Logger;
    roomManager: RoomManager;

    constructor() {
        this.logger = new Logger();
        this.roomManager = new RoomManager;
    }

    async init() {
        this.logger.sendLog("INFO", "Starting server...");

        let initMsg = await this.roomManager.init();
        this.logger.sendLog("SUCCESS", initMsg);
    }
}

Server = new App();
export default Server;
Server.init()
    .then(() => Server.logger.sendLog("SUCCESS", `Server started with success.`))
    .catch((e) => Server.logger.sendCriticalError(e.toString()))