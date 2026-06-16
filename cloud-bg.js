import { SvgPlus, Vector } from "./utils.js";

class CouldImage extends SvgPlus{
    #pos = new Vector(1.1, 0);
    velocity = new Vector(0.01 + Math.random()*0.01, 0);    

    constructor(el) {
        super(el)
        this.pos = [1.1,0]
        this.init = true;
    }

    set pos(value) {
        this.#pos = new Vector(value);
        this.styles = {
            "top": `${this.#pos.y*100}%`,
            "left": `${this.#pos.x*100}%`,
            transform: `translate(${(2*this.#pos.x - 1)*100}%, -50%)`,
            position: "absolute",
            height: "10vh"
        }
    }

    get pos() {
        return this.#pos.clone();
    }

    update(dt, miny, maxy) {
        let pos =  this.pos.add(this.velocity.mul(dt));
        if (pos.x > 1) {
            console.log("Resetting cloud")
            pos = new Vector(this.init ? -Math.random()*0.3 : 0, miny + Math.random() * (maxy - miny));
            this.velocity = new Vector(0.01 + Math.random()*0.01, 0);
            this.init = false;
        } 
        this.pos = pos;
    }
}


class CloudBackground extends SvgPlus {
    onconnect() {
        console.log("Cloud background connected")
        let imgs = this.querySelectorAll("img");
        this.images = [...imgs].map(img => new CouldImage(img));
        this.styles = {
            display: "block",
            position: "relative",
        }
        this.start();
    }


    animate(dt) {
        let miny = parseFloat(this.getAttribute("ymin") || "0");
        let maxy = parseFloat(this.getAttribute("ymax") || "1");
        let imgs = this.querySelectorAll("img");
        this.images.forEach(img =>  img.update(dt, miny, maxy));
    }

    start() {
        const step = (timestamp) => {   
            if (!this.lastTimestamp) this.lastTimestamp = timestamp;
            const dt = (timestamp - this.lastTimestamp) / 1000;
            this.lastTimestamp = timestamp;
            this.animate(dt);
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
}

SvgPlus.defineHTMLElement(CloudBackground)