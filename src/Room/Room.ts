import Server from "../../main";
import Config from "../Config/Config";
import { bigMap, mediumMap, smallMap, trainingMap } from "../Config/Map";
import RoomInterface from "./RoomInterface";
import createRoom from 'luxball';

type playersType = {
    [key: number]: any
}

enum TEAM {
    SPECTATOR,
    RED,
    BLUE
}

export default class Room implements RoomInterface {
    name: string;
    password: string | null;
    public: boolean;
    geoLocation: Object;
    token: string;
    maxPlayers: number;
    maxPlayersInTeam: number;
    roomObject: any;
    players: playersType;
    currentStreak: number;
    lastTouch: [number, number];
    isInitialized: boolean;

    constructor(data: RoomInterface) {
        this.name = data.name;
        this.password = data.password || null;
        this.public = Config.DEV_MODE ? false : data.public;
        this.geoLocation = data.geoLocation;
        this.token = data.token;
        this.maxPlayers = data.maxPlayers;
        this.maxPlayersInTeam = data.maxPlayersInTeam;
        this.roomObject = null;
        this.players = {};
        this.currentStreak = 0;
        this.lastTouch = [0, 0];
        this.isInitialized = false;
    }

    init(): Promise<string | null> {
        const instance = this;

        return new Promise((resolve, reject) => {
            createRoom({
                playerName: Config.BOT_NAME,
                geoLocation: this.geoLocation,
                roomSettings: {
                    name: this.name,
                    joinToken: this.token,
                    password: this.password,
                    maxPlayers: this.maxPlayers,
                    showInRoomList: this.public
                }
            }).then((room) => {
                instance.roomObject = room;
                instance.initEvents();

                room.onRoomLink = (roomLink) => {
                    if (!instance.isInitialized) {
                        instance.isInitialized = true;

                        const roomId = roomLink.split("=")[1]
                        Server.logger.sendLog("INFO", `Room ${this.name} initialized (https://luxball.online/play/${roomId}).`);
                        resolve(null);
                    }
                }
            }).catch((e) => reject(`Can't initalize the room ${name}: ${e}`));
        })
    }

    initEvents(): void {
        if (this.roomObject == null)
            return;

        const instance = this;
        this.roomObject.onPlayerJoin = (player) => instance.onPlayerJoin(player);
        this.roomObject.onPlayerLeave = (player) => instance.onPlayerLeave(player);
        this.roomObject.onPlayerInputChange = (player) => instance.onPlayerInputChange(player);
        this.roomObject.onPlayerChat = (player, message) => instance.onPlayerChat(player, message);
        this.roomObject.onPlayerBallKick = (playerId) => instance.onPlayerBallKick(playerId);
        this.roomObject.onGameStart = () => instance.onGameStart();
        this.roomObject.onGameStop = () => instance.onGameStop();
        this.roomObject.onTeamGoal = (team) => instance.onTeamGoal(team);
        this.roomObject.onGameTick = () => instance.onGameTick();
        this.roomObject.onPlayerTeamChange = (player, byPlayer) => instance.onPlayerTeamChange(player, byPlayer);
        this.roomObject.onClose = function () {
            console.log(`Room ${this.name} is closed.`)
        }
    }

    onPlayerJoin(player: any): void {
        Server.logger.sendLog("VERBOSE", `${player.name} (${player.auth}) joined the room ${this.name}.`);

        /*
        if(!Config.DEV_MODE) {
            for (let i in this.players) {
                const playerData = this.players[i];

                if (playerData.conn == player.conn)
                    return this.roomObject.kickPlayer(player.id, "You are already in this room.");
            }
        }
            */

        this.players[player.id] = {
            id: player.id,
            name: player.name,
            auth: player.auth,
            conn: player.conn,
            team: TEAM.SPECTATOR,
            pickMode: false,
            afk: false,
            lastMessage: null,
            chatWarning: 0,
            lastActivity: 0
        }

        this.roomObject.sendCustomEvent("systemMessage", "test")
        this.roomObject.sendChat(`👋 Welcome in SLH room, ${player.name}.`, player.id);
        this.checkMatchMaking();
        this.sendMessageToPicker();
    }

    onPlayerInputChange(playerId: number): void {
        const playerObject = this.roomObject.players.filter((playerInfo) => playerInfo.id === playerId && playerInfo.team.id === 0)[0];
        if (playerObject !== null)
            this.players[playerId].lastActivity = 0;
    }

    onPlayerBallKick(playerId: number): void {
        if (this.lastTouch[0] !== playerId) {
            this.lastTouch[1] = this.lastTouch[0];
            this.lastTouch[0] = playerId;
        }
    }

    onPlayerChat(playerId: number, message: string): void {
        if (playerId == 0)
            return;

        const playerData = this.players[playerId];
        if (playerData === null || playerData === undefined)
            return;

        playerData.lastActivity = 0;

        if (playerData.lastMessage != null && new Date().getTime() - playerData.lastMessage < 1000) {
            playerData.chatWarning++;

            if (playerData.chatWarning == 3)
                this.roomObject.kickPlayer(playerId, "🚫 SPAM");
            else
                this.roomObject.sendChat(`🚫 Please don't spam ${playerData.name} (${playerData.chatWarning}/3 warning)`, playerId);

            return;
        }

        if (message.startsWith("!")) {
            const args = message.substring(1).split(" "),
                commandName = args[0].trim();

            if (commandName === null || commandName === undefined)
                return;

            switch (commandName.toLowerCase()) {
                case "afk": {
                    const playerObject = this.roomObject.players.filter((player) => player.id === playerId)[0];
                    if (playerObject === undefined)
                        return;

                    if (playerObject.team.id !== 0 && this.roomObject.timeElapsed !== undefined)
                        return this.roomObject.sendChat(`⚠️ You can't afk while you are playing.`, playerId);

                    if (playerData.afk) {
                        playerData.afk = false;
                        this.roomObject.sendChat(`🥱 ${playerObject.name} is back.`);
                    }
                    else {
                        if (playerObject.team.id !== 0)
                            this.roomObject.setPlayerTeam(playerId, 0);

                        playerData.afk = true;
                        this.roomObject.sendChat(`😴 ${playerObject.name} is afk.`);
                    }

                    playerData.lastActivity = 0;
                    this.sendMessageToPicker();
                    this.checkMatchMaking();
                    break;
                }

                case "bb": {
                    this.roomObject.kickPlayer(playerId, "Byebye!");
                    this.checkMatchMaking();
                    break;
                }

                default: {
                    this.roomObject.sendChat(`⚠️ Invalid command.`, playerId);
                    break;
                }
            }
        }

        if (playerData.pickMode) {
            const playerObject = this.roomObject.players.filter((playerInfo) => playerInfo.id === playerId)[0],
                playerList = this.roomObject.players.filter((player) => player.id !== 0 && this.players[player.id].afk === false),
                maxPlayersInTeam = this.getMaxPlayersInTeam(playerList.length),
                redTeam = this.getRedTeam(),
                blueTeam = this.getBlueTeam(),
                specTeam = this.getSpecTeam();

            if (message.trim() === "top") {
                // top
                if (playerObject.team.id === TEAM.RED) {
                    if (blueTeam.length > redTeam.length) {
                        let maxInTeam = 0;
                        (maxPlayersInTeam >= blueTeam.length) ? maxInTeam = maxPlayersInTeam : maxInTeam = blueTeam.length + 1;

                        for (let i = redTeam.length; i <= maxInTeam; i++) {
                            for (let g in specTeam) {
                                const specPlayer = specTeam[g];
                                this.roomObject.setPlayerTeam(specPlayer.id, 1);
                            }
                        }
                    }
                    else {
                        this.roomObject.setPlayerTeam(specTeam[0].id, 1);
                    }
                }
                else {
                    for (let i = blueTeam.length; i <= redTeam.length; i++) {
                        for (let g in specTeam) {
                            const specPlayer = specTeam[g];
                            this.roomObject.setPlayerTeam(specPlayer.id, 2);
                        }
                    }
                }

                playerData.pickMode = false;
                this.roomObject.sendChat(`⬆️ ${playerObject.name} choosed top.`);
                this.checkMatchMaking();
            }
            else if (message.trim() === "bottom") {
                const cloneSpec = [...specTeam].reverse();

                if (playerObject.team.id === TEAM.RED) {
                    if (blueTeam.length > redTeam.length) {
                        let maxInTeam = 0;
                        (maxPlayersInTeam >= blueTeam.length) ? maxInTeam = maxPlayersInTeam : maxInTeam = blueTeam.length + 1;

                        for (let i = redTeam.length; i <= maxInTeam; i++) {
                            for (let g in cloneSpec) {
                                const specPlayer = cloneSpec[g];
                                this.roomObject.setPlayerTeam(specPlayer.id, 1);
                            }
                        }
                    }
                    else {
                        this.roomObject.setPlayerTeam(cloneSpec[0].id, 1);
                    }
                }
                else {
                    for (let i = blueTeam.length; i <= redTeam.length; i++) {
                        for (let g in cloneSpec) {
                            const specPlayer = cloneSpec[g];
                            this.roomObject.setPlayerTeam(specPlayer.id, 2);
                        }
                    }
                }

                playerData.pickMode = false;
                this.roomObject.sendChat(`⬇️ ${playerObject.name} choosed bottom.`);
                this.checkMatchMaking();
            }
            else if (message.trim() === "random") {
                const cloneSpec = [...specTeam].map(value => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);

                if (playerObject.team.id === TEAM.RED) {
                    if (blueTeam.length > redTeam.length) {
                        let maxInTeam = 0;
                        (maxPlayersInTeam >= blueTeam.length) ? maxInTeam = maxPlayersInTeam : maxInTeam = blueTeam.length + 1;

                        for (let i = redTeam.length; i <= maxInTeam; i++) {
                            for (let g in cloneSpec) {
                                const specPlayer = cloneSpec[g];
                                this.roomObject.setPlayerTeam(specPlayer.id, 1);
                            }
                        }
                    }
                    else {
                        this.roomObject.setPlayerTeam(cloneSpec[0].id, 1);
                    }
                }
                else {
                    for (let i = blueTeam.length; i <= redTeam.length; i++) {
                        for (let g in cloneSpec) {
                            const specPlayer = cloneSpec[g];
                            this.roomObject.setPlayerTeam(specPlayer.id, 2);
                        }
                    }
                }

                playerData.pickMode = false;
                this.roomObject.sendChat(`🔃 ${playerObject.name} choosed random.`);
                this.checkMatchMaking();
            }
            else if (!isNaN(parseInt(message.trim()))) {
                const wantedPlayer = specTeam[parseInt(message.trim()) - 1];

                if (wantedPlayer === undefined)
                    return this.roomObject.sendChat(`⚠️ Invalid number.`, playerObject.id);

                this.roomObject.setPlayerTeam(wantedPlayer.id, (playerObject.team.id === TEAM.RED) ? 1 : 2);
                playerData.pickMode = false;
                this.roomObject.sendChat(`➡️ ${playerObject.name} choosed ${wantedPlayer.name}.`);
                this.checkMatchMaking();
            }
        }

        if (playerData.chatWarning > 0)
            playerData.chatWarning--;

        playerData.lastMessage = new Date().getTime();
    }

    onPlayerTeamChange(playerId: any, byPlayer: any): void {
        if (playerId == 0)
            return this.roomObject.setPlayerTeam(0, 0);

        if (!this.players.hasOwnProperty(playerId))
            return;

        const playerData = this.roomObject.players.filter((player) => player.id == playerId)[0];
        this.players[playerId].team = playerData.team.id;
        this.players[playerId].lastActivity = 0;
    }

    getRedTeam(): Array<any> {
        return this.roomObject.players.filter((player) => player.team.id === TEAM.RED);
    }

    getBlueTeam(): Array<any> {
        return this.roomObject.players.filter((player) => player.team.id === TEAM.BLUE);
    }

    getSpecTeam(): Array<any> {
        return this.roomObject.players.filter((player) => player.id !== 0 && player.team.id === TEAM.SPECTATOR && this.players[player.id].afk === false);
    }

    onGameStart(): void {
        this.roomObject.sendChat(`⚽ Match started.`);
    }

    onGameStop(): void {
        this.lastTouch = [0, 0];
    }

    checkEndedMatch(): void {
        if (this.roomObject.timeLimit !== 0 && (this.roomObject.timeLimit * 60) < this.roomObject.timeElapsed && (this.roomObject.redScore > this.roomObject.blueScore || this.roomObject.blueScore > this.roomObject.redScore) || (this.roomObject.redScore === this.roomObject.scoreLimit || this.roomObject.blueScore === this.roomObject.scoreLimit) && this.roomObject.scoreLimit !== 0) {
            let playerList = this.roomObject.players.filter((player) => player.id !== 0 && this.players[player.id].afk === false);

            if (this.roomObject.redScore > this.roomObject.blueScore) {
                const blueTeam = [...this.getBlueTeam()].reverse();
                for (let i in blueTeam) {
                    const player = blueTeam[i];
                    this.roomObject.setPlayerTeam(player.id, 0);
                }

                this.roomObject.sendChat(`🔴 Red team won the match ${this.roomObject.redScore}-${this.roomObject.blueScore}.`);
                if (this.getMaxPlayersInTeam(playerList.length) === 4) {
                    this.currentStreak += 1;
                    this.roomObject.sendChat(`🔥 Current streak: ${this.currentStreak}.`);
                }
            }
            else {
                const redTeam = [...this.getRedTeam()].reverse(),
                    blueTeam = this.getBlueTeam();

                for (let i in redTeam) {
                    const player = redTeam[i];
                    this.roomObject.setPlayerTeam(player.id, 0);
                }

                for (let i in blueTeam) {
                    const player = blueTeam[i];
                    this.roomObject.setPlayerTeam(player.id, 1);
                }

                this.roomObject.sendChat(`🔵 Blue team won the match ${this.roomObject.blueScore}-${this.roomObject.redScore}.`);
                if (this.getMaxPlayersInTeam(playerList.length) === 4) {
                    this.currentStreak = 1;
                    this.roomObject.sendChat(`🔥 Current streak: ${this.currentStreak}.`);
                }
            }

            this.roomObject.stopGame();
            this.checkMatchMaking();
        }
    }

    onGameTick(): void {
        this.checkEndedMatch();
        this.getLastTouchOfTheBall();
        this.getBallSpeed();
    }

    getLastTouchOfTheBall(): void {
        const ball = this.roomObject.getDisc(0);

        if (this.roomObject.timeElapsed !== undefined && this.roomObject.scoreLimit !== 0) {
            const playersPlaying = this.roomObject.players.filter((player) => player.team.id !== 0);

            for (let i in playersPlaying) {
                const player = playersPlaying[i],
                    playerDisc = this.roomObject.getPlayerDisc(player.id),
                    playerRadius = playerDisc.I,
                    triggerDistance = playerRadius + ball.I + 0.01;

                const distanceToBall = this.pointDistance(playerDisc.h, ball.h);
                if (distanceToBall < triggerDistance) {
                    if (this.lastTouch[0] !== player.id) {
                        this.lastTouch[1] = this.lastTouch[0];
                        this.lastTouch[0] = player.id;
                    }
                }
            }
        }
    }

    onTeamGoal(team: number) {
        const scorer = this.roomObject.players.filter((player) => player.id !== 0 && player.id === this.lastTouch[0])[0],
            assister = this.roomObject.players.filter((player) => player.id !== 0 && player.id === this.lastTouch[1])[0],
            ballSpeed = this.getBallSpeed();

        if (scorer === null || scorer === undefined) {
            if (team === TEAM.RED)
                this.roomObject.sendChat(`🔴 Red Team scored (${ballSpeed.toFixed(2)}km/h).`);
            else
                this.roomObject.sendChat(`🔵 Red Team scored (${ballSpeed.toFixed(2)}km/h).`);
            return;
        }

        if (scorer.team.id !== team)
            return this.roomObject.sendChat(`😂 Own goal by ${scorer.name} (${ballSpeed.toFixed(2)}km/h).`);

        if (scorer.team.id === TEAM.RED && assister !== undefined && assister.team.id === TEAM.RED)
            return this.roomObject.sendChat(`🔴 Goal by ${scorer.name}, assisted by ${assister.name} (${ballSpeed.toFixed(2)}km/h).`);
        else if (scorer.team.id === TEAM.RED)
            return this.roomObject.sendChat(`🔴 Goal by ${scorer.name} (${ballSpeed.toFixed(2)}km/h).`);
        else if (scorer.team.id === TEAM.BLUE && assister !== undefined && assister.team.id === TEAM.BLUE)
            return this.roomObject.sendChat(`🔵 Goal by ${scorer.name}, assisted by ${assister.name} (${ballSpeed.toFixed(2)}km/h).`);
        else if (scorer.team.id === TEAM.BLUE)
            return this.roomObject.sendChat(`🔵 Goal by ${scorer.name} (${ballSpeed.toFixed(2)}km/h).`);
    }

    isBalancedTeam(): boolean {
        let isBalanced = true;
        if (this.getRedTeam().length !== this.getBlueTeam().length)
            isBalanced = false;

        return isBalanced;
    }

    getMaxPlayersInTeam(totalPlayers: number): number {
        let maxPlayerInTeam = 0;

        switch (totalPlayers) {
            case 1:
            case 2:
            case 3:
                maxPlayerInTeam = 1;
                break;

            case 4:
            case 5:
                maxPlayerInTeam = 2;
                break;

            case 6:
            case 7:
                maxPlayerInTeam = 3;
                break;

            default:
                maxPlayerInTeam = this.maxPlayersInTeam
                break;
        }

        return maxPlayerInTeam;
    }

    setPickMode(playerId): void {
        let lastPicker = null;

        for (let i in this.players) {
            const player = this.players[i];

            if (player.pickMode === true)
                lastPicker = playerId;

            player.pickMode = false;
        }

        const player = this.players[playerId];
        if (player === null || player === undefined)
            return;

        if (lastPicker === playerId) {
            // already picker
            player.pickMode = true;
            return;
        }

        player.pickMode = true;
        this.roomObject.sendChat(`👉 ${player.name} is picking...`);
        this.sendMessageToPicker();
    }

    sendMessageToPicker(): void {
        for (let i in this.players) {
            const player = this.players[i];

            if (player.pickMode === true) {
                let playerList = this.roomObject.players.filter((player) => player.id !== 0 && player.team.id === 0 && this.players[player.id].afk === false);

                let message = "",
                    count = 0;

                for (let g in playerList) {
                    count++;

                    const playerSpec = playerList[g];

                    message += `#${count} - ${playerSpec.name}, `
                }

                this.roomObject.sendChat(message.substring(0, message.length - 2), player.id);
                break;
            }
        }
    }

    checkMatchMaking(): void {
        let playerList = this.roomObject.players.filter((player) => player.id !== 0 && this.players[player.id].afk === false);

        switch (playerList.length) {
            case 0:
                break;

            case 1: {
                this.roomObject.stopGame();

                if (this.roomObject.stadium.name !== "training") {
                    this.roomObject.setStadium(JSON.stringify(trainingMap));
                    this.roomObject.setScoreLimit(0);
                    this.roomObject.setTimeLimit(0);
                }

                this.roomObject.setPlayerTeam(playerList[0].id, 1);
                this.roomObject.startGame();
                break;
            }

            default: {
                if (playerList.length >= 8) {
                    if (this.roomObject.stadium.name !== "big") {
                        if (this.roomObject.timeElapsed !== undefined)
                            this.roomObject.stopGame();

                        this.currentStreak = 0;
                        this.roomObject.setStadium(JSON.stringify(bigMap));
                        this.roomObject.setScoreLimit(Config.DEV_MODE ? 1 : 3);
                        this.roomObject.setTimeLimit(3);
                    }
                }
                else if (playerList.length >= 6) {
                    if (this.roomObject.stadium.name !== "medium") {
                        if (this.roomObject.timeElapsed !== undefined)
                            this.roomObject.stopGame();

                        this.currentStreak = 0;
                        this.roomObject.setStadium(JSON.stringify(mediumMap));
                        this.roomObject.setScoreLimit(Config.DEV_MODE ? 1 : 3);
                        this.roomObject.setTimeLimit(3);
                    }
                }
                else if (playerList.length >= 2) {
                    if (this.roomObject.stadium.name !== "small") {
                        if (this.roomObject.timeElapsed !== undefined)
                            this.roomObject.stopGame();

                        this.currentStreak = 0;
                        this.roomObject.setStadium(JSON.stringify(smallMap));
                        this.roomObject.setScoreLimit(Config.DEV_MODE ? 1 : 3);
                        this.roomObject.setTimeLimit(3);
                    }
                }

                if (playerList.length / 2 === this.getMaxPlayersInTeam(playerList.length) && (this.roomObject.timeElapsed === undefined || !this.isBalancedTeam() || this.getMaxPlayersInTeam(playerList.length) === 2 && this.getRedTeam().length === 1)) {
                    // Randomize teams
                    if (this.roomObject.timeElapsed !== undefined)
                        this.roomObject.stopGame();

                    this.roomObject.sendChat("🤖 Randomizing teams...");
                    const shuffled = [...playerList].map(value => ({ value, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ value }) => value);

                    for (let i = 0; i < shuffled.length; i++) {
                        (i % 2 === 0) ? this.roomObject.setPlayerTeam(shuffled[i].id, 1) : this.roomObject.setPlayerTeam(shuffled[i].id, 2);
                    }

                    this.currentStreak = 0;
                    this.roomObject.startGame();
                }
                else if (!this.isBalancedTeam()) {
                    const redTeam = this.getRedTeam(),
                        blueTeam = this.getBlueTeam(),
                        specTeam = this.getSpecTeam(),
                        maxPlayersInTeam = this.getMaxPlayersInTeam(playerList.length);

                    // Check if someone is extra
                    if (redTeam.length > maxPlayersInTeam) {
                        for (let i = redTeam.length; i > maxPlayersInTeam; i--) {
                            this.roomObject.setPlayerTeam(redTeam[i - 1].id, 0);
                        }

                        return this.checkMatchMaking();
                    }

                    if (blueTeam.length > maxPlayersInTeam) {
                        for (let i = blueTeam.length; i > maxPlayersInTeam; i--) {
                            this.roomObject.setPlayerTeam(blueTeam[i - 1].id, 0);
                        }

                        return this.checkMatchMaking();
                    }

                    //Check if someone is missing
                    if (redTeam.length < maxPlayersInTeam || blueTeam.length < maxPlayersInTeam) {
                        if (redTeam.length > blueTeam.length && blueTeam.length < maxPlayersInTeam) {
                            // if no choice
                            if (playerList.length === 1) {
                                this.roomObject.setPlayerTeam(playerList[0].id, 2);
                                return this.checkMatchMaking();
                            }
                            else {
                                //pickMode
                                if (blueTeam.length === 0) {
                                    this.roomObject.setPlayerTeam(specTeam[0].id, 2);
                                    return this.checkMatchMaking();
                                }
                                else {
                                    if (this.roomObject.timeElapsed !== undefined && this.roomObject.timeElapsed < 16)
                                        this.roomObject.stopGame();
                                    else if (!this.roomObject.isGamePaused())
                                        this.roomObject.pauseGame(true);

                                    const picker = blueTeam[0];
                                    this.setPickMode(picker.id);
                                }
                            }
                        } else if (redTeam.length < maxPlayersInTeam) {
                            // if no choice
                            if (playerList.length === 1) {
                                this.roomObject.setPlayerTeam(playerList[0].id, 1);
                                return this.checkMatchMaking();
                            }
                            else {
                                //pickMode
                                if (redTeam.length === 0) {
                                    this.roomObject.setPlayerTeam(specTeam[0].id, 1);
                                    return this.checkMatchMaking();
                                }
                                else {
                                    if (this.roomObject.timeElapsed !== undefined && this.roomObject.timeElapsed < 16)
                                        this.roomObject.stopGame();
                                    else if (!this.roomObject.isGamePaused())
                                        this.roomObject.pauseGame(true);

                                    const picker = redTeam[0];
                                    this.setPickMode(picker.id);
                                }
                            }
                        }
                        else
                            this.checkMatchMaking();
                    }
                }
                else {
                    if (this.roomObject.timeElapsed === undefined)
                        this.roomObject.startGame();
                    else if (this.roomObject.isGamePaused())
                        this.roomObject.pauseGame(false);
                }

                break;
            }
        }
    }

    updateOneSec(): void {
        for (let i in this.players) {
            const player = this.players[i];

            if (player.afk) {
                player.lastActivity += 1;

                if (player.lastActivity === 300)
                    this.roomObject.sendChat(`⚠️ Hey ${player.name}, if you don't give a sign of life within two minutes you'll be kicked.`, player.id);
                else if (player.lastActivity === 360)
                    this.roomObject.sendChat(`⚠️ Hey ${player.name}, if you don't give a sign of life within one minute you'll be kicked.`, player.id);
                else if (player.lastActivity === 390)
                    this.roomObject.sendChat(`⚠️ Hey ${player.name}, if you don't give a sign of life within 30 seconds you'll be kicked.`, player.id);
                else if (player.lastActivity === 410)
                    this.roomObject.sendChat(`⚠️ Hey ${player.name}, if you don't give a sign of life within 10 seconds you'll be kicked.`, player.id);
                else if (player.lastActivity >= 420)
                    this.roomObject.kickPlayer(player.id, "🥱 AFK Limit reached (7 minutes).");
            }
        }

        if (!Config.DEV_MODE) {
            if (this.roomObject.timeElapsed !== undefined && this.roomObject.scoreLimit !== 0) {
                const playersPlaying = this.roomObject.players.filter((player) => player.team.id !== 0);

                for (let i in playersPlaying) {
                    const player = playersPlaying[i];

                    this.players[player.id].lastActivity += 1;
                    if (this.players[player.id].lastActivity === 8)
                        this.roomObject.sendChat(`⚠️ Hey ${player.name}, if you don't give a sign of life within 7 seconds you'll be kicked.`, player.id);
                    else if (this.players[player.id].lastActivity === 10)
                        this.roomObject.sendChat(`⚠️ Hey ${player.name}, if you don't give a sign of life within 5 seconds you'll be kicked.`, player.id);
                    else if (this.players[player.id].lastActivity === 15)
                        this.roomObject.kickPlayer(player.id, "🥱 AFK");
                }
            }
        }
    }

    getBallSpeed(): number {
        const ballProp = this.roomObject.getDisc(0),
            speedCoefficient = 100 / (5 * (0.99 ** 60 + 1));

        if (ballProp === undefined || ballProp === null)
            return 0;

        return Math.sqrt(ballProp.P.x ** 2 + ballProp.P.y ** 2) * speedCoefficient;
    }

    pointDistance(p1, p2): number {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    }

    onPlayerLeave(player: any): void {
        if (!this.players.hasOwnProperty(player.id))
            return;

        delete this.players[player.id];
        Server.logger.sendLog("VERBOSE", `${player.name} left the room ${this.name}.`);
        this.checkMatchMaking();
        this.sendMessageToPicker();

        if (this.roomObject.timeElapsed !== undefined && Object.keys(this.players).length === 0)
            this.roomObject.stopGame();
    }
}