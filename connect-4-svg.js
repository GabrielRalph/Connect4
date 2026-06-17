import { AccessButton, AccessEvent, SvgPlus, Vector } from "./utils.js"

class BBox {
    #pos = new Vector(0, 0);
    #size = new Vector(0, 0);
    constructor(pos, size) {
        this.#pos = new Vector(pos);
        this.#size =  new Vector(size);
    }

    union(other) {
        let result = null;
        if (other instanceof BBox) {
            const minX = Math.min(this.x, other.x);
            const minY = Math.min(this.y, other.y);
            const maxX = Math.max(this.x + this.width, other.x + other.width);
            const maxY = Math.max(this.y + this.height, other.y + other.height);
            result = new BBox(new Vector(minX, minY), new Vector(maxX - minX, maxY - minY));
        } else {
            throw new Error("Union is only supported between BBox instances");
        }
        return result;
    }

    pad(...args) {
        let padding = new Vector(...args);
        return new BBox(this.pos.sub(padding), this.size.add(padding.mul(2)));
    }

    toString() { return `${this.x} ${this.y} ${this.size.x} ${this.size.y}`; }

    get size() { return this.#size.clone(); }
    get pos() { return this.#pos.clone(); }

    get bottom() { return this.y + this.height; }
    get right() { return this.x + this.width; }
    get top() {  return this.y; }
    get left() { return this.x; }

    get x() { return this.#pos.x; }
    get y() { return this.#pos.y; }
    get width() { return this.#size.x; }
    get height() { return this.#size.y; }

    static fromPoints(points, flipY = false) {
        let minX = null;
        let minY = null;
        let maxX = null;
        let maxY = null;
        for (let point of points) {
            if (!(point instanceof Vector)) {
                point = new Vector(point);
            }
            if (minX === null || point.x < minX) minX = point.x;
            if (minY === null || point.y < minY) minY = point.y;
            if (maxX === null || point.x > maxX) maxX = point.x;
            if (maxY === null || point.y > maxY) maxY = point.y;
        }
        if (flipY) {
            const temp = minY;
            minY = maxY;
            maxY = temp;
        }
        return new BBox(new Vector(minX, minY), new Vector(maxX - minX, maxY - minY));
    }

}

const AssetLibrary = {
    ring: {
        url: new URL('./assets/i_ring.svg', import.meta.url)
    },
    red: {
        url: new URL('./assets/i_red.svg', import.meta.url),
    },
    yellow: {
        url: new URL('./assets/i_yellow.svg', import.meta.url),
    },
    border: {
        url: new URL('./assets/border.svg', import.meta.url),
    },
    winnerPanel: {
        url: new URL('./assets/winner-board.svg', import.meta.url),
    }
}

function randomizeIDs(svg) {
    let elements = svg.querySelectorAll('[id]')
    let idMap = {}
    for (let el of elements) {
        let oldID = el.getAttribute('id')
        if (idMap[oldID]) {
            el.setAttribute('id', idMap[oldID])
        } else {
            let newID = `${oldID}_${Math.random().toString(36).substr(2, 9)}`
            idMap[oldID] = newID
            el.setAttribute('id', newID)
        }
    }
    for (let el of svg.querySelectorAll('*')) {
        for (let attr of el.attributes) {
            let aValue = attr.value
            if (aValue.indexOf('#') >= 0) {
                let idValue = aValue.replace(/#([a-zA-Z0-9_-]+)/g, (match, p1) => {
                    if (idMap[p1]) {
                        return `#${idMap[p1]}`
                    }
                    return match
                })
                el.setAttribute(attr.name, idValue)
            }
        }
    }

    for (let el of svg.querySelectorAll('script')) {
        el.remove()
    }
}

async function loadAssets(rows = 6, cols = 7, cellWScale = 1, cellHScale = 1) {
    const Res = {}

    // Load all assets and randomize IDs to prevent conflicts
    await Promise.all(Object.keys(AssetLibrary).map(async (key) => {
        let res = await fetch(AssetLibrary[key].url)
        let text = await res.text()
        let svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg')
        randomizeIDs(svg)
        let vbox = svg.getAttribute('viewBox').split(' ').map(Number)
        Res[key] = {
            text, svg,
            bbox: new BBox(new Vector(vbox[0], vbox[1]), new Vector(vbox[2], vbox[3]))
        };
    }));

    const {ring, red, yellow, border} = Res;
    
    const cellSize = red.bbox.size.mul(cellWScale, cellHScale);
    const ringOffset = cellSize.sub(ring.bbox.size).div(2);
    const counterOffset = cellSize.sub(red.bbox.size).div(2);

    const gap = 10;
 
    const trayPaddingTop = gap;
    const trayPaddingSides = 30;
    const trayPaddingBottom = 15;
    const trayBorderRadius = 30;
    const borderPos = border.bbox.size.mul(-0.57, -0.65).add(-trayPaddingSides, cellSize.y * rows);

    
    const extraPaddingSides = border.bbox.width * 0.57 + gap;
    const extraPaddingBottom = border.bbox.height * 0.321 + gap;
    const extraPaddingTop = 2 * gap + cellSize.x;
    
    const [borderDefs, borderBack, borderFront] = [...border.svg.children];
    const use = (tag, x, y) => x instanceof Vector ? `<use href="#${tag}" x="${x.x}" y="${x.y}"/>` : `<use href="#${tag}" x="${x}" y="${y}"/>`

    const svgBoardHTML = `
    <defs>
        ${borderDefs.innerHTML}
        <g id="ring">${ring.svg.innerHTML}</g>
        <g id="red">${red.svg.innerHTML}</g>
        <g id="yellow">${yellow.svg.innerHTML}</g>
        <g id="border-back">${borderBack.innerHTML}</g>
        <g id="border-front">${borderFront.innerHTML}</g>
        <mask id="cut-out-holes">
            <rect x = "-50%" y = "-50%" width="200%" height="200%" fill="white"/>
            ${
            new Array(rows).fill(0).map((_, i) => 
                new Array(cols).fill(0).map((_, j) => {
                    let pos = cellSize.mul(j+0.5, i+0.5)
                    return `<circle fill="black" r="${ring.bbox.width / 2 - 5}" cx="${pos.x}" cy="${pos.y}"/>`
                }).join('')
            ).join('')
        }
        </mask>

        <linearGradient id="counter-win-shimmer" 
            gradientUnits="objectBoundingBox" 
            spreadMethod="repeat"
            x1="-1" y1="0" x2="0" y2="0">  
              
            <stop offset="0%" stop-color="white" stop-opacity="0"/>  
            <stop offset="12.5%" stop-color="white" stop-opacity="0.5"/>  
            <stop offset="15%" stop-color="white" stop-opacity="0"/>

            <stop offset="25%" stop-color="white" stop-opacity="0"/>  
            <stop offset="37.5%" stop-color="white" stop-opacity="0.9"/>  
            <stop offset="39%" stop-color="white" stop-opacity="0"/>    

            <stop offset="60%" stop-color="white" stop-opacity="0"/>
            <stop offset="68%" stop-color="white" stop-opacity="0.3"/>  
            <stop offset="73%" stop-color="white" stop-opacity="0"/>
    
            <stop offset="75%" stop-color="white" stop-opacity="0"/>
            <stop offset="87.5%" stop-color="white" stop-opacity="0.4"/>  
            <stop offset="90%" stop-color="white" stop-opacity="0"/>

            <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-1 0"
                to="0 0"
                dur="2.5s"
                repeatCount="indefinite" />
        </linearGradient>
    </defs>
    ${use('border-back', borderPos)}
    <g transform="scale(-1, 1) translate(${-cellSize.x * cols}, 0)">
        ${use('border-back', borderPos)}
    </g>
    
    <g id = "main-board">
        <g id = "counter-area">
        
        </g>
        <rect   fill = "#1d62f1" stroke = "#0b3aa0" stroke-width = "4" 
                ry = ${trayBorderRadius} rx = ${trayBorderRadius} 
                x = "${-trayPaddingSides}" y = "${-trayPaddingTop}" 
                width="${cols * cellSize.x + trayPaddingSides * 2}" 
                height="${rows * cellSize.y + trayPaddingTop + trayPaddingBottom}" 
                mask="url(#cut-out-holes)"
        />
        
        ${
            new Array(rows).fill(0).map((_, i) => 
                new Array(cols).fill(0).map((_, j) => 
                    use('ring', cellSize.mul(j, i).add(ringOffset))
                ).join('')
            ).join('')
        }
    </g>
    
    ${use('border-front', borderPos)}
    <g transform="scale(-1, 1) translate(${-cellSize.x * cols}, 0)">
        ${use('border-front', borderPos)}
    </g>
    `
    Res.board = {
        bbox: new BBox(
            new Vector(-trayPaddingSides - extraPaddingSides, -trayPaddingTop - extraPaddingTop),
            cellSize.mul(cols, rows).add(
                trayPaddingSides * 2 + extraPaddingSides * 2, 
                trayPaddingTop + trayPaddingBottom + extraPaddingTop + extraPaddingBottom
            )
        ),
        html: svgBoardHTML
    }

    Res.cellSize = cellSize;
    Res.counterOffset = counterOffset;
    Res.rows = rows;
    Res.cols = cols;
    Res.cursorYPos = -1 - (gap * 2 / cellSize.y);
    return Res;
}

class Counter extends SvgPlus {
    #pos = new Vector(0, 0);
    velocity = new Vector(0, 0);
    acc = new Vector(0, 0);
    #inMotion = false;
    #motionPromis = null;
    #motionResolve = null;
    #cellSize = new Vector(0, 0);
    #cellOffset = new Vector(0, 0);

    constructor(color, cellSize, cellOffset) {
        super("g");
        this.useEl = this.createChild("use", {href: `#${color}`});
        this.#cellSize = cellSize;
        this.#cellOffset = cellOffset;
        this.toggleAttribute('counter', true)

        this.gleam = this.createChild("circle", {
            cx: this.#cellSize.x / 2,
            cy: this.#cellSize.y / 2,
            r: this.#cellSize.x / 2 + 5,
            transform: `rotate(${45} ${this.#cellSize.x / 2} ${this.#cellSize.y / 2})`,
            styles: {transition: "0.3s ease-out opacity"},
            fill: "url(#counter-win-shimmer)",
            "opacity": 0,
        });
    }

    set highlight(val) {
        if (val) {
            this.gleam.setAttribute("opacity", 0.6);
        } else {
            this.gleam.setAttribute("opacity", 0);
        }
    }

    set color(val) {
        this.useEl.setAttribute('href', `#${val}`)
    }

    set inMotion(val) {
        this.#inMotion = val;
        if (val) {
            this.#motionPromis = new Promise((res) => this.#motionResolve = res);
        } else {
            if (this.#motionResolve) {
                this.#motionResolve();
            }
        }
    }

    get inMotion() {
        return this.#inMotion;
    }

    async waitForMotionEnd() {
        if (this.#motionPromis) {
            await this.#motionPromis;
        } 
    }
    
    set pos(pos) {
        pos = new Vector(pos)
        let apos = pos.mul(this.#cellSize).add(this.#cellOffset);
        this.setAttribute("transform", `translate(${apos})`);
        this.#pos = pos;
    }

    get pos() {
        return this.#pos.clone();
    }

    setPos(...args) {
        let pos = new Vector(...args)
        this.pos = pos;
    }
}

class WinnerPanel extends SvgPlus {
    constructor(winnerPanelAsset, counterSize) {
        super('g')
        this.class = "winner-panel";
        this.innerHTML = winnerPanelAsset.svg.innerHTML;
        let [bourdGroup, podiumGroup, rect] = [...this.children];
        this.messageContainer = this.createChild("foreignObject", {
            x: rect.getAttribute("x"),
            y: rect.getAttribute("y"),
            width: rect.getAttribute("width"),
            height: rect.getAttribute("height")
        }).createChild("div", {
            styles: {
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                "justify-content": "center",
                width: "100%",
                height: "100%",
                color: "white"
            }
        });

        let positions = [...podiumGroup.children].slice(1, 3).map(el => {
            let v = new Vector(Number(el.getAttribute("cx")), Number(el.getAttribute("cy")))
            el.remove();
            return v;
        });
        podiumGroup = new SvgPlus(podiumGroup);
        this.podiumPositions = positions;
        this.podiugmGroup = podiumGroup.createChild("g");
        this.counterSize = counterSize;
        
        this.winner = "red";
    }

    set message (val) {
        if (typeof val === "string") {
            this.messageContainer.innerHTML = `<h1>${val}</h1>`;
        } else if (val instanceof HTMLElement) {
            this.messageContainer.innerHTML = "";
            this.messageContainer.appendChild(val);
        }
    }

    set winner(val) {
        this.podiugmGroup.innerHTML = "";
        let scale = 0.9;
        this.createChild("use", {
            href: `#${val == "red" ? "yellow" : "red"}`,
            x: (this.podiumPositions[0].x - this.counterSize.x / 2) / scale,
            y: (this.podiumPositions[0].y - this.counterSize.y / 2) / scale,
            transform: `scale(${scale})`
        });
        this.createChild("use", {
            href: `#${val}`,
            x: this.podiumPositions[1].x - this.counterSize.x / 2,
            y: this.podiumPositions[1].y - this.counterSize.y / 2,
        });
    }
}
class ColumnSlot extends AccessButton {
    constructor(column) {
        super("aaa-column-slot");
        this.class = "slot";
        this.column = column;
        this.styles = {width: "100%", height: "100%", display: "block"};
        this.addEventListener("access-click", (e) => {
            let e2 = new AccessEvent("column-click", e, {bubbles: true});
            e2.column = this.column;
            this.dispatchEvent(e2);
        })
    }

    setHighlight(val) {
        this.toggleAttribute("hover", val);
        this.isHighlighted = val;
    }
}


class Connect4SVGBoard extends SvgPlus {
    acceleration = new Vector(0, 0.004);
    restitution = new Vector(0, -0.5);
    #columns = [];
    #assets = null;
    #accessButtons = [];
    #dropCounters = [];
    constructor(assets) {
        super("svg");
        this.svgVBox = assets.board.bbox;
        this.#columns = new Array(assets.cols).fill(0);
        this.setAttribute('viewBox', assets.board.bbox.toString())
        this.innerHTML = assets.board.html;
        this.main = new SvgPlus(this.querySelector('#counter-area'));
        this.mainBoard = new SvgPlus(this.querySelector('#main-board'));
        this.mainBoard.styles = {
            transition: "0.4s ease-out transform",
        }
        this.#assets = assets;

        let ag = this.createChild("g");
        for (let i = 0; i < assets.cols; i++) {
            let fo = ag.createChild("foreignObject", {
                x: assets.cellSize.x * i,
                y: 0,
                width: assets.cellSize.x,
                height: assets.cellSize.y * assets.rows
            });
            this.#accessButtons.push(fo.createChild(ColumnSlot, {}, i));
        }
        let wX = (assets.cellSize.x * assets.cols - assets.winnerPanel.bbox.size.x) / 2;
        let wY = this.svgVBox.pos.y + 10;
        this.winnerPanel = this.createChild(WinnerPanel, {
            transform: `translate(${wX}, ${wY})`,
            opacity: 0,
            styles: {
                transition: "0.4s ease-out opacity",
                "pointer-events": "none"
            }
        }, assets.winnerPanel, assets.red.bbox.size);
    }

    get highlightedSlot() {
        for (let btn of this.#accessButtons) {
            if (btn.isHighlighted) {
                return btn.column;
            }
        }
        return null;
    }

    mouseToSVG(...args) {
        let pos = new Vector(...args);
        let [spos, ssize] = this.bbox;
        let absSVG = new Vector(0, 0);
        if (ssize.x !== 0 && ssize.y !== 0) {
            let relSVG = pos.sub(spos).div(ssize);
            absSVG = relSVG.mul(this.svgVBox.size).add(this.svgVBox.pos);
        }
        return absSVG
    }

    mouseToCell(...args) {
        let pos = this.mouseToSVG(...args);
        return pos.div(this.#assets.cellSize);
    }


    addCounter(x,y, color) {
        let c = this.main.createChild(Counter, {}, color, this.#assets.cellSize, this.#assets.counterOffset); 
        c.setPos(x, y)
        return c;
    }

    async dropCounter(col, color, imediate = false) {
        let c = this.addCounter(col, -1.1, color);
        c.column = col;
        this.#columns[col]++;
        c.expectedRow = this.rows - this.#columns[col];
        c.row = this.rows - c.expectedRow - 1;
        if (imediate) {
            c.setPos(col, c.expectedRow);
        } else {
            c.acc = this.acceleration.clone();
            c.inMotion = true;
            c.isDrop = true;
        }
        this.#dropCounters.push(c);
    }

    resetDroppedCounters() {
        this.#dropCounters = this.#dropCounters.filter(c => c.remove());
        this.#dropCounters = [];
        this.#columns = new Array(this.#assets.cols).fill(0);
    }


    /**
     * @param {{winner: number, pieces: [[number, number]]}} winInfo
     */
    async winAnimation(winInfo) {
        let pos2counter = {};
        for (let c of this.#dropCounters) {
            pos2counter[`${c.row},${c.column}`] = c;
        }
        for (let [row, col] of winInfo.pieces) { 
            let c = pos2counter[`${row},${col}`]
            if (c) {
                c.highlight = true;
            }
        }

        await new Promise(r => setTimeout(r, 1000));
        this.winnerPanel.styles = {opacity: 1}
        this.winnerPanel.winner = winInfo.winner == 1 ? "yellow" : "red";
        this.winnerPanel.message = `Player ${winInfo.winner == 1 ? "Yellow" : "Red"} Wins!`;
    }

    async emptyTrayAnimation() {
        this.mainBoard.styles = {transform: "translateY(-80px)"}
        this.winnerPanel.styles = {opacity: 0}
        let dropCounters = [...this.#dropCounters]
        this.#dropCounters = [];
        this.#columns = new Array(this.#assets.cols).fill(0);
        await new Promise(r => setTimeout(r, 300));
        await Promise.all(
            dropCounters.map(c => new Promise(r => {
                c.acc = this.acceleration.clone().add(0, Math.random()*0.001)
                c.inMotion = true;
                c.isDrop = false;
                c.onUpdate = () => {
                    if (c.pos.y > this.rows + 3) {
                        c.remove();
                        r();
                    }
                }
            }))
        );
        this.mainBoard.styles = {transform: "translateY(0)"}
        await new Promise(r => setTimeout(r, 400));
    }   

    #animate(dt) {
        let counters = [...this.querySelectorAll('[counter]')];
        for (let c of counters) {
            if (c.effectUpdate instanceof Function) {
                c.effectUpdate();
            }
            if (c.inMotion) {
                if (c.onUpdate instanceof Function) {
                    c.onUpdate();
                }
                c.velocity = c.velocity.add(c.acc.mul(dt));
                let nPos = c.pos.add(c.velocity.mul(dt));
                let nFilled = this.#columns[c.column];
                if (c.isDrop) {
                    if (c.pos.y > c.expectedRow) {
                        nPos.y = c.expectedRow;
                        if (c.velocity.norm() > 0.01 * dt) {
                            c.velocity = c.velocity.mul(this.restitution)
                        } else {
                            c.velocity = new Vector(0, 0);
                            c.inMotion = false;
                        }
                    }
                }
                c.pos = nPos;
            }
        }
    }

    get rows() {
        return this.#assets.rows;
    }
    get cols() {
        return this.#assets.cols;
    }

    get cursorYPos() {
        return this.#assets.cursorYPos;
    }

    async waitForAllAnimations() {
        let counters = [...this.querySelectorAll('[counter]')];
        await Promise.all(counters.map(c => c.waitForMotionEnd()));
    }

    start() {
        let lastTime = 0;
        let animate = (time) => {
            let delta = time - lastTime;
            lastTime = time;
            this.#animate(Math.min(delta / 10, 3));
            requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
    }

    static async loadAndMakeBoard(...args) {
        const assets = await loadAssets(...args);
        return new Connect4SVGBoard(assets);
    }
}

export { Connect4SVGBoard, loadAssets }