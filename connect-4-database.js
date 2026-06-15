import * as FB from "./fb.js"

async function set(...args) {
    if (args.length > 1) {
        let path = args.slice(0, -1).join("/");
        let value = args[args.length-1]
        console.log(path, value)
        await FB.set(FB.ref(path), value)
    } else {
        console.warn("invalid set with args" , args)
    }
}

async function get(...args) {
    let path = args.join("/");
    return (await FB.get(FB.ref(path, args[args.length-1]))).val()
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

export class Connect4Database {
    #listener = null;

    #gameID = null;

    /** @type {string} */
    #state = "";

    #lastPlayer = null;

    #playerID = null;

    #rows = 6;
    #cols = 7;

    constructor(gameID, rows = 6, cols = 7) {
        this.#gameID = gameID;
        this.#rows = rows;
        this.#cols = cols;
    }


    get moves() {
        return toMoves(this.state, this.lastPlayerID);
    }


    #call(f, ...args) {
        if (f in this && this[f] instanceof Function) {
            this[f](...args);
        }
    }


    async connect() {
        const iStateSC = await get("connect-4", this.gameID)
        const uid = FB.getUID()
        if ( iStateSC != null ) {
            let p1 = iStateSC.player1;
            let p2 = iStateSC.player2;
            this.#state = (iStateSC.state?.sequence + "") || "";
            this.#lastPlayer = iStateSC.state?.lastPlayer || null;
            if ( (!p1) || (!p2) ) {
                if (!p1) {
                    await set("connect-4", this.gameID, "player1", uid);
                    this.#playerID = 0
                } else {
                    await set("connect-4", this.gameID, "player2", uid);
                    this.#playerID = 1
                }
            } else if (!((uid == p1) || (uid == p2))) {
                throw new Error("You are not a player of this game")
            } else {
                this.#playerID = uid == p1 ? 0 : 1
            }
        } else {
            await set("connect-4", this.gameID, "player1", uid);
            this.#playerID = 0;
        }
        console.log(`Joined "${this.gameID}" as player ${this.#playerID}`)
        this.#listener = FB.onValue(ref("connect-4", this.gameID, "state"), (sc) => {
            const sState = sc.val();
            let seq = sState ? sState.sequence : "";
            const state = typeof seq === "number" ? seq + "" : seq || "";
            const lastPlayer = sState ? (sState.lastPlayer || null) : null;
            this.#lastPlayer = lastPlayer
            console.log("State changed", state, lastPlayer)
            if (state != this.state) {
                if (state.startsWith(this.state)) {
                    let moves = toMoves(state.slice(this.state.length), this.lastPlayerID)
                    this.#state = state;
                    this.#call("onMoves", moves)
                } else {
                    this.#state = state;
                    console.log("Full state change", state)
                    this.#call("onFullChange", toMoves(state, this.lastPlayerID))
                }
            }
        })
    }

    playMove(move) {
        if (this.#lastPlayer == FB.getUID()) {
            throw new Error("It is not your turn");
        } else if (this.winInfo != null) {
            throw new Error("Game is already over.")
        } else {
            let newState = this.#state + (move + "");

            if (new RegExp(`(${move}[^${move}]*){7}`).test(newState)) {
                throw new Error("Cannot place counter in full column.")
            }

            this.#state = newState;
            this.#lastPlayer = FB.getUID();
            this.#call("onMoves", [[move, this.#playerID]])
            let res = {
                lastPlayer: FB.getUID(),
                sequence: newState
            }
            set("connect-4", this.gameID, "state", res)
        }
    }

    dispose() {
        if (this.#listener) {
            this.#listener();
        }   
    }


    get winInfo() {
        // TODO: implement win checking algorithm
        let isWin = false;
        let moves = this.moves;
        let cols = this.#cols;
        let rows = this.#rows;

        // Simulate the board state in a 2D array to make it easier to check for wins
        let ccount = new Array(cols).fill(0);
        let grid = new Array(rows).fill(0).map((_, ri) => new Array(cols).fill(null).map((_, ci) => ({row: ri, col: ci, pchar: "-"})));
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
        grid = grid.flat();
        let str = grid.map(c=> c.pchar).join("");
        let wins = this.matchRegexs.flatMap(rgx => 
            [...str.matchAll(rgx)].map(match => 
                match.indices.slice(1, 5).map(i => grid[i[0]])
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

    get matchRegexs() {
        let cols = this.#cols;
        return [
            (x) => new RegExp(`(${x})(${x})(${x})(${x})`, "gd"),
            (x) => new RegExp(`(${x}).{${cols}}(${x}).{${cols}}(${x}).{${cols}}(${x})`, "gd"),
            (x) => new RegExp(`(${x}).{${cols+1}}(${x}).{${cols+1}}(${x}).{${cols+1}}(${x})`, "gd"),
            (x) => new RegExp(`(${x}).{${cols-1}}(${x}).{${cols-1}}(${x}).{${cols-1}}(${x})`, "gd"),
        ].flatMap(f => [f(0), f(1)])
    }

    get playerID() {
        return this.#playerID;
    }

    get lastPlayerID() {
        if (this.#lastPlayer === FB.getUID()) {
            return this.#playerID;
        } else {
            return this.otherPlayerID;
        }   
    }
    
    get otherPlayerID() {return (this.#playerID + 1)%2}

    get state() {return this.#state}

    get gameID() {return this.#gameID}

    get myTurn() {
        return this.#lastPlayer != FB.getUID();
    }
}

