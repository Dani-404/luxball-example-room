export default interface RoomInterface {
    name: string,
    password: string | null;
    public: boolean,
    geoLocation: Object,
    token: string,
    maxPlayers: number,
    maxPlayersInTeam: number
}