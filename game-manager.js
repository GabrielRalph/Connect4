import "./connect-4-game.js";
import "./cloud-bg.js";
import { SvgPlus } from "./utils.js";
import { Connect4Game } from "./connect-4-game.js";
import { createNewGameID } from "./connect-4-database.js";

class GameManager extends SvgPlus {
    
    constructor(el) {
        super(el);
        this.loadingPromise = this.load();
    }

    async load() {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }
        this.innerHTML = "";
        let home = this.createChild("div", {class: "screen home"});
        home.createChild("h1", {content: "Connect 4"});

        let r = home.createChild("div", {class: "row"});
        r.createChild("access-button", {class: "button", id: "two-player", events: {
            "access-click": (e) => {
                e.waitFor(this.createAndJoinGame("multiplayer"));
            }
        }}).createChild("div", {content: "Two Player"});

        r.createChild("access-button", {class: "button", id: "single-player", events: {
            "access-click": (e) => {
                e.waitFor(this.createAndJoinGame("singleplayer"));
            }
        }}).createChild("div", {content: "Single Player"});


        let gameDiv = this.createChild("div", {class: "screen game"});
        let c = gameDiv.createChild("access-button", {class: "button", events: {
            "access-click": (e) => {
                e.waitFor(this.goHome());
            }
        }}).createChild("div", {content: "Go Home"});
        let connect4 = gameDiv.createChild(Connect4Game, {}, "connect-4-game");
        await connect4.load();

        this.connect4 = connect4;

        let urlParams = new URLSearchParams(window.location.search);
        let gameID = urlParams.get("game");
        if (gameID) {
            await this.joinGame(gameID);
        } else {
            this.mode = "home";
            if (!window.SquidlyAPI) {
                window.setLoader(false);
            }
        }
    }

    async joinGame(gameID, dispatchEvent = true) {
        if (this.gameID !== gameID && this.connect4) {
            this.gameID = gameID;
            if (dispatchEvent) this.dispatchEvent(new CustomEvent("game-join", {detail: {gameID}})); 
           
            if (this.mode === "game") await this.connect4.emptyBoard();
            window.setLoader(true);
            try {
                await Promise.all([
                    this.connect4.startGame(gameID, true),
                    new Promise(resolve => setTimeout(resolve, 200))
                ]);
                this.mode = "game";
                if (!window.SquidlyAPI) window.history.pushState({}, "", "?game=" + gameID);
                window.setLoader(false);
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
                this.gameID = null;
                console.error("Error joining game:", e);
            }   
        }
    }

    async createAndJoinGame(mode) {
        let token = createNewGameID(mode);
        await this.joinGame(token);
    }

    async goHome(dispatchEvent = true) {
        if (this.mode === "game") {
            this.gameID = null;
            if (dispatchEvent) this.dispatchEvent(new CustomEvent("game-join", {detail: {gameID: null}})); 
            await this.connect4.emptyBoard();
            if (this.gameID == null) {
                this.mode = "home";
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    set mode(m) {
        this.setAttribute("mode", m);
    }
    
    get mode() {
        return this.getAttribute("mode");
    }
}

SvgPlus.defineHTMLElement(GameManager, "game-manager");