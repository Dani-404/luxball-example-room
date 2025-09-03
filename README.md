# Example room for Luxball

### Installation
```sh
$ npm install
```

### Setup

#### Main server
```sh
$ npm run start
```
or 
```sh
$ npm run dev
```

### Server Config
```
DEV_MODE: false,
BOT_NAME: "SLH BOT",
ROOMS: [{
    name: "Your room 1",
    public: true,
    password: null,
    geoLocation: { "country": "EU", "lat": 48.862725, "lon": 2.287592 },
    token: "luxball",
    maxPlayers: 20,
    maxPlayersInTeam: 4,
},{
    name: "Your room 2",
    public: true,
    password: null,
    geoLocation: { "country": "EU", "lat": 48.862725, "lon": 2.287592 },
    token: "luxball",
    maxPlayers: 20,
    maxPlayersInTeam: 4,
}]
```