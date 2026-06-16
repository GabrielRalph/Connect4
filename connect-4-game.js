import { Connect4Database } from "./connect-4-database.js"
import { Connect4SVGBoard } from "./connect-4-svg.js";
import { SvgPlus, Vector } from "./utils.js";
import * as FB from "./fb.js"

const ROWS = 6;
const COLS = 7;
const Player2Color = {
    0: "red",
    1: "yellow",
}
export class Connect4Game extends SvgPlus {
    #cursor = null;
    #mousePos = new Vector(0, 0);

    /** @type {Connect4SVGBoard?} */
    #board = null;

    /** @type {Connect4Database?} */
    #game = null;

    constructor(el) {
        super(el);
        this._loadingPromise = this.load();
    }

    getCursorTarget() {
        let cellPos = 0;
        if (this.#board) {
            if (this.#board.highlightedSlot != null) {
                cellPos = this.#board.highlightedSlot;
            } else {
                let cp = Math.floor(this.#board.mouseToCell(this.#mousePos).x);
                cellPos =  Math.max(0, Math.min(COLS - 1, cp));
            }
        }
        return cellPos;
    }

    async load() {
        if (this._loadingPromise) {
            return this._loadingPromise;
        }
        this.innerHTML = "";

        /**
         * Load resources and set up board
         */
        const board = await Connect4SVGBoard.loadAndMakeBoard(ROWS, COLS);
        this.#board = board;
        this.appendChild(board);



        this.addEventListener("mousemove", (e) => {
            this.#mousePos = new Vector(e.clientX, e.clientY);
        })

        this.#board.addEventListener("column-click", (e) => {
            if (this.#game && this.#game.myTurn) {
                this.#game.playMove(e.column);
            }
        })

        /**
         * Set up cursor
         */
        this.#cursor = board.addCounter(0, this.#board.cursorYPos, "red");
        this.#cursor.onUpdate = () => {
            const cellPos = this.getCursorTarget();
            this.#cursor.velocity.x = (cellPos - this.#cursor.pos.x) * 0.08;
        }
        this.#cursor.inMotion = true;

        board.start();


        /**
         * Initialize firebase authentication
         */
        FB.initialise();
        await new Promise(r => {
            FB.addAuthChangeListener((user) => {
                if (!user) {
                    FB.signInAnonymously()
                } else {
                    r();
                }
            });
        })

        
        if (this.getAttribute("game-id")) {
            await this.startGame(this.getAttribute("game-id") || "connect4_001", true);
        }
    }

    #place(column, player, imediate = false) {
        let color = Player2Color[player] || "red"
        this.#board.dropCounter(column, color, imediate)
    }

    async emptyBoard() {
        await this.#board.emptyTrayAnimation();
    }

    async startGame(gameID, initial = false) {
        let startProm = Promise.resolve();
        if (!initial) {
            startProm = this.#board.emptyTrayAnimation();
        }

        if (!this.#board) {
            throw new Error("Board not initialized yet. Call load() and wait for it to finish before starting the game.")
        }

        if (this.#game) {
            this.#game.dispose()
        }

        let game = new Connect4Database(gameID);
        this.#game = game;

        game.onMoves = (moves) => {
            this.#cursor.styles = {opacity: game.myTurn ? 1 : 0.5}
            for (let [move, player] of moves) {
                this.#place(move, player)
            }

            const {winInfo} = game;
            this.toggleAttribute("winner", !!winInfo)
            if (winInfo) {
                this.#cursor.styles = {opacity: 0}
                this.#board.winAnimation(winInfo);
            }
        }

        game.onFullChange = (moves) => {
            this.#board.resetDroppedCounters();
            this.#cursor.styles = {opacity: game.myTurn ? 1 : 0.5}
            this.#board.resetDroppedCounters();
            for (let [move, player] of moves) {
                this.#place(move, player, false)
            }

            const {winInfo} = game;
            this.toggleAttribute("winner", !!winInfo)
            if (winInfo) {
                this.#cursor.styles = {opacity: 0}
                this.#board.winAnimation(winInfo);
            }
        }

        await game.connect();
        await startProm;

        this.#cursor.color = Player2Color[game.playerID] || "red";
        game.onFullChange(game.moves);

    }
}

// SvgPlus.defineHTMLElement(Connect4Game, "connect-4-game")

