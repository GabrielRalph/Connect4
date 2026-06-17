import * as FB from "./fb.js"

async function set(...args) {
    if (args.length > 1) {
        let path = args.slice(0, -1).join("/");
        let value = args[args.length-1]
        await FB.set(FB.ref(path), value)
    } else {
        console.warn("invalid set with args" , args)
    }
}

async function get(...args) {
    let path = args.join("/");
    return (await FB.get(FB.ref(path))).val()
}

function ref(...args) {
    let path = args.join("/")
    return FB.ref(path);
}

function toMoves(state, lastPlayerID) {
    let n = state.length;
    let moves = [...state].map((char, i) => [
        Number(char),
        Math.round(Math.abs((lastPlayerID - (n - i - 1)) % 2))
    ])
    return moves;
}

function array2d(rows, cols, val = null) {
    return new Array(rows).fill(0).map(
        (_, ri) => new Array(cols).fill(val).map(
            (_, ci) => val instanceof Function ? val(ri, ci) : val
        )
    );
}

const DEBUG = true;
const MODES ={
    multiplayer: 0,
    singlePlayer: 1,
    bot: 2
}

export class C4DBInterface {
    #lastPlayer = null;
    #gameID = null;
    #rows = 6;
    #cols = 7;
    #state = "";

    #instanceID = Math.random().toString(36).slice(2, 8);

    constructor(gameID, rows = 6, cols = 7) {
        this.#gameID = gameID;
        this.#rows = rows;
        this.#cols = cols;
    }

    /**
     * @override
     */
    async connect() { }

    /**
     * @override
     */
    sendDBStateUpdate() { }

    /** 
     * @override
     * @param {string} playerUID
     * @return {number} player index (0 or 1) 
     */
    getPlayerIndex(playerUID) { return 0 }

    /**
     * @override
     */
    isMyTurn() {
        return true;
    }

    /**
     * @override
     */
    dispose() { }


    /**
     * @override
     */
    _getCallbackObject() { return this }


    log(...args) {
        DEBUG && console.log(`%c[${this.constructor.name}:${this.#instanceID}]`, "background: #1d62f1; color: white; padding: 4px 2px; border-radius: 4px;","\n", ...args);
    }

    /**
     * @param {string} state - the new game state string
     * @param {string} lastPlayer - the UID of the player who made the last move
     */
    updateState(state, lastPlayer, force = false) {
        this.#lastPlayer = lastPlayer
        if (state != this.state || force) {
            if (state.startsWith(this.state)) {
                let newMoves = state.slice(this.state.length);
                this.#state = state;
                this.#call("onMoves", toMoves(newMoves, this.getPlayerIndex(this.lastPlayer)))
            } else {
                this.#state = state;
                this.#call("onFullChange", toMoves(state, this.getPlayerIndex(this.lastPlayer)))
            }
        }
    }

    /**
     * @param {string|number} move - the column to place a counter in (0-6)
     */
    playMove(move) {
        if (typeof move === "number") {
            move = move + ""
        }
        if (typeof move !== "string") {
            throw new Error("Move must be a string or number");
        
        } else if (/^[0-6]$/.test(move) === false) {
            throw new Error("Move must be a digit between 0 and 6");
        
        } else if (!this.myTurn) {
            throw new Error("It is not your turn");
        
        } else if (this.winInfo != null) {
            throw new Error("Game is already over.")
        
        } else {
            let newState = this.state + (move + "");
            
            if (new RegExp(`(${move}[^${move}]*){7}`).test(newState)) {
                throw new Error("Cannot place counter in full column.")
            }

            this.#lastPlayer = this.uid;
            this.#state = newState;
            this.log(`Move played\n\tstate: "${this.state}"`);
            this.#call("onMoves", [[Number(move), this.getPlayerIndex(this.lastPlayer)]])
            this.sendDBStateUpdate();
        }
    }

    #call(f, ...args) {
        const scope = this._getCallbackObject();
        if (f in scope && scope[f] instanceof Function) {
            scope[f](...args);
        }
    }

    parseState(newState) {
        if (typeof newState === "number") {
            console.warn("State should be a string. Converting number to string.");
            newState = newState + "";
        } else if (typeof newState !== "string") {
            newState = "";
        }
        return newState;
    }

    playersUpdated() {
        this.#call("onPlayersUpdated");
    }

    get state() {return this.#state}
    get moves() { return toMoves(this.state, this.getPlayerIndex(this.lastPlayer)) }
    get uid() { return FB.getUID() }
    get lastPlayer() { return this.#lastPlayer }
    get state() {return this.#state}
    get rows() {return this.#rows}
    get cols() {return this.#cols}
    get gameID() {return this.#gameID}
    get myTurn() { return this.isMyTurn() }

    get matchRegexs() {
        let cols = this.#cols;
        return [
            (x) => new RegExp(`(${x})(${x})(${x})(${x})`, "gd"),
            (x) => new RegExp(`(${x}).{${cols}}(${x}).{${cols}}(${x}).{${cols}}(${x})`, "gd"),
            (x) => new RegExp(`(${x}).{${cols+1}}(${x}).{${cols+1}}(${x}).{${cols+1}}(${x})`, "gd"),
            (x) => new RegExp(`(${x}).{${cols-1}}(${x}).{${cols-1}}(${x}).{${cols-1}}(${x})`, "gd"),
        ].flatMap(f => [f(0), f(1)])
    }

    get winInfo() {
        // TODO: implement win checking algorithm
        let isWin = false;
        let moves = this.moves;
        let cols = this.#cols;
        let rows = this.#rows;

        // Simulate the board state in a 2D array to make it easier to check for wins
        let ccount = new Array(cols).fill(0);
        let grid = array2d(rows, cols, (ri, ci) => ({row: ri, col: ci, pchar: "-"}));
        moves.forEach(([move, player], i) => {
            let col = ccount[move]++;
            grid[col][move] = {
                ...grid[col][move],
                player, i, pchar: player + ""
            };
        })

        // Check for wins by using regex to find 4 in a row in the grid when 
        // flattened into a string, and then mapping those matches back to 
        // the grid to find the winning pieces
        let str = grid.map(r=> r.map(c => c.pchar).join("")).join("|");
        let offset = grid.flatMap((r,i) => new Array(r.length+1).fill(i));
        grid = grid.flat();

        this.log(`Game:\n\t${str.replaceAll("|", "\n\t")}`)

        const {matchRegexs} = this;
        let wins = matchRegexs.flatMap(rgx => 
            [...str.matchAll(rgx)].map(match => 
                match.indices.slice(1, 5).map(i => grid[i[0] - offset[i[0]]])
            )
        ).sort((a, b) => 
            Math.max(...a.map(c => c.i)) - Math.max(...b.map(c => c.i))
        )

        let win = wins.length > 0 ? {
            winner: wins[0][0].player,
            pieces: wins[0].map(c => [c.row, c.col])
        } : null;
       
        return win;
    }
}


export class MultiplayerC4Database extends C4DBInterface {
    #listener = null;
    #players = {};

    async #connectPre() {
        const iStateSC = await get("connect-4", this.gameID)
        const uid = this.uid

        let state = "";
        let lastPlayer = null;
        if ( iStateSC != null ) {
            let p1 = iStateSC.player1;
            let p2 = iStateSC.player2;
            this.#players = {[p1]: 0, [p2]: 1}

            state = this.parseState(iStateSC.state?.sequence);
            lastPlayer = iStateSC.state?.lastPlayer || null;

            this.log(`Joining game ${this.gameID}\n\tPlayer 1: ${p1}\n\tPlayer 2: ${p2}\n\tState: "${state}"\n\tLast Player: ${lastPlayer}`);
            // already a player in this game
            if (uid == p1 || uid == p2) {

            // One (or more) slot/s is open, join as player
            } else if ( (!p1) || (!p2) ) {
                if (!p1) {
                    await set("connect-4", this.gameID, "player1", uid);
                    this.#players[uid] = 0;
                } else {
                    await set("connect-4", this.gameID, "player2", uid);
                    this.#players[uid] = 1;
                }
            // Game is full, join as spectator
            } else if (!((uid == p1) || (uid == p2))) {
                console.warn(`Game ${this.gameID} is full. Joining as spectator.`)
                this.#players[uid] = null;
            }
        } else {
            this.log(`Creating game ${this.gameID}\n\tPlayer 1: ${uid}`);
            await set("connect-4", this.gameID, "player1", uid);
            this.#players[uid] = 0;
        }

        return [state, lastPlayer]
    }

    async connect() {

        let error = true;
        let state, lastPlayer;
        while (error) {
            try {
                [state, lastPlayer] = await this.#connectPre();
                error = false;
            } catch (e) {
                this.#players = {};
                await new Promise(r => setTimeout(r, 500));
                error = true;
            }
        }

        this.updateState(this.state, this.lastPlayer, true);
        this.playersUpdated();

        this.#listener = [
            FB.onValue(ref("connect-4", this.gameID, "state"), (sc) => {
                const sState = sc.val();
                let seq = sState ? sState.sequence : "";
                const state = this.parseState(seq);
                const lastPlayer = sState ? (sState.lastPlayer || null) : null;
                this.updateState(state, lastPlayer);
            }),
            FB.onValue(ref("connect-4", this.gameID, "player1"), (sc) => {
                const p1 = sc.val();
                if (p1) {
                    this.#players[p1] = 0;
                    this.playersUpdated();
                }

            }),
            FB.onValue(ref("connect-4", this.gameID, "player2"), (sc) => {
                const p2 = sc.val();
                if (p2) {
                    this.#players[p2] = 1;
                    this.playersUpdated();
                }
            })
        ]
    }

    playersUpdated() {
        this.log(`Current players: \n\tplayer 1: ${Object.keys(this.#players).find(k => this.#players[k] === 0)}\n\tplayer 2: ${Object.keys(this.#players).find(k => this.#players[k] === 1)}`);
        super.playersUpdated();
    }

    sendDBStateUpdate() {
        let res = {
            lastPlayer: this.uid,
            sequence: this.state
        }
        set("connect-4", this.gameID, "state", res)
    }

    dispose() {
        if (this.#listener) {
            this.#listener.forEach(unsub => unsub());
        }   
    }

    getPlayerIndex(playerUID) {
        return playerUID ? this.#players[playerUID] ?? null : null;
    }

    isMyTurn() {
        let playerIndex = this.getPlayerIndex(this.uid);
        return playerIndex !== null && playerIndex !== this.getPlayerIndex(this.lastPlayer);
    }
}

export class SinglePlayerC4Database extends C4DBInterface {
    #spectator = false;
    #listener = null;

    /**
     * @override
     */
    async connect() {
        const gameData = await get("connect-4", this.gameID);
        const {uid} = this;
        if (!gameData || !gameData.player1) {
            this.log(`Creating game ${this.gameID}\n\tPlayer 1: ${uid}`);
            await set("connect-4", this.gameID, "player1", uid);
        } else if (gameData.player1 !== uid) {
            // spectator mode
            this.log(`Spectating game ${this.gameID}\n\tPlayer 1: ${gameData.player1}`);
            this.#spectator = true;
        } else {
            this.log(`Joining game ${this.gameID}\n\tPlayer 1: ${gameData.player1}.`);
        }

        let state = this.parseState(gameData?.sequence);
        this.updateState(state, this.uid, true);
        this.playersUpdated();

        this.#listener = FB.onValue(ref("connect-4", this.gameID, "sequence"), (sc) => {
            const state = this.parseState(sc.val());
            this.log(`Database update\n\tstate: "${state}"\n\tlast player: ${this.lastPlayer}`);
            this.updateState(state, this.uid);
            this.playersUpdated();
        });
    }

    /**
     * @override
     */
    sendDBStateUpdate() { 
        let newState = this.state;
        this.playersUpdated();
        this.log(`Updating database\n\tstate: "${newState}"`);
        set("connect-4", this.gameID, "sequence", newState)
    }

    /** 
     * @override
     * @param {string} playerUID
     * @return {number} player index (0 or 1) 
     */
    getPlayerIndex(playerUID) {  
        return typeof playerUID === "number" ? playerUID : (this.state.length) % 2;
    }

    get lastPlayer() {
        return (this.state.length+1) % 2;
    }

    /**
     * @override
     */
    isMyTurn() {
        return !this.#spectator;
    }

    /**
     * @override
     */
    dispose() { this.#listener && this.#listener() }

}


export function createNewGameID(mode = "multiplayer") {
    let id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    let token = mode + "/GAME-" + id.toUpperCase();
    return token;
}

export function makeConnect4Database(token) {
    let [mode, gameID] = token.split("/");
    switch (mode) {
        case "multiplayer":
            return new MultiplayerC4Database(token);
        case "singleplayer":
            return new SinglePlayerC4Database(token);
        default:
            throw new Error(`Invalid game mode "${mode}" in token "${token}"`)
    }
}