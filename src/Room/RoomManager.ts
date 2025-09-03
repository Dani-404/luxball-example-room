import Config from "../Config/Config";
import Room from "./Room";

type RoomsType = {
    [key: string]: Room
}

export default class RoomManager {
    rooms: RoomsType;

    constructor() {
        this.rooms = {};
    }

    init(): Promise<string> {
        const instance = this;

        this.updateOneSec();
        return new Promise((resolve, reject) => {

            const allPromises: Array<any> = [];

            Config.ROOMS.forEach((roomData) => {
                const room = new Room(roomData);
                this.rooms[room.name] = room;
                allPromises.push(room.init());
            });

            Promise.all(allPromises).then(() => resolve(`Loaded ${Config.ROOMS.length} rooms.`)).catch((e) => reject(e));
        })
    }

    updateOneSec(): void {
        setInterval(() => {
            for(let i in this.rooms) {
                const room = this.rooms[i];

                room.updateOneSec();
            }
        }, 1000);
    }
}