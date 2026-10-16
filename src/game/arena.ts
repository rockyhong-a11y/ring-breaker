import Phaser from "phaser";
import {
  ARENA,
  ArenaModel,
  type ArenaState,
  type MetaStats,
  type ArenaEvent,
  type Brick,
  type Difficulty,
} from "./model";

export type { ArenaState, ArenaMode, Difficulty } from "./model";

interface ArenaCallbacks {
  onChange: (state: ArenaState) => void;
  onReward: () => void;
  onFinish: (won: boolean, score: number, wave: number) => void;
}

export interface ArenaController {
  start(meta?: MetaStats): void;
  pause(): void;
  resume(): void;
  launch(): void;
  chooseUpgrade(id: string): void;
  finisher(): void;
  move(horizontal: -1 | 0 | 1, vertical?: -1 | 0 | 1): void;
  point(x: number, y?: number): void;
  setDifficulty(difficulty: Difficulty): void;
  getState(): ArenaState;
  destroy(): void;
  debug?: {
    clearWave(): void;
    loseLife(): void;
    setCharge(value: number): void;
    gainXp(value: number): void;
    setWave(value: number): void;
    grantUpgrade(id: string): void;
    model: ArenaModel;
  };
}

const COLORS = [0xff7d74, 0xaa95ff, 0x78d1fa, 0xb5e788, 0xf3ad67, 0xf8d461];
const WAVE_TITLES = [
  "ROOKIE RUMBLE",
  "TAG TEAM TROUBLE",
  "THE HEEL TURN",
  "ROYAL RUMBLE",
  "MAIN EVENT",
  "THE CHAMPION",
];
const FACE_ROSTER = ["raven", "valkyrie", "viper", "ember"];
const BALL_COLORS: Record<string, number> = {
  basic: 0xd6ef6c,
  fire: 0xff8d50,
  ice: 0x8edcff,
  poison: 0xb88aff,
  lightning: 0xf8dc73,
  bomb: 0xff7183,
  split: 0x9ef1bc,
  laser: 0xff9dc6,
  boomerang: 0xc8acf5,
};
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}
interface Trail {
  x: number;
  y: number;
  life: number;
  color: number;
  radius: number;
}
interface EnemyArt {
  image: Phaser.GameObjects.Image;
  frame?: Phaser.GameObjects.Image;
  hp: Phaser.GameObjects.Text;
  label?: Phaser.GameObjects.Text;
}

export function createArena(
  parent: HTMLElement,
  callbacks: ArenaCallbacks,
): ArenaController {
  const model = new ArenaModel();
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let destroyed = false;
  let lastSignature = "";
  let lastMode = model.mode;
  let lastReward = "";
  let lastNotification = 0;
  let clearInput = () => model.move(0, 0);
  const disposers: Array<() => void> = [];

  function emit(force = false) {
    if (destroyed) return;
    const state = model.snapshot();
    const signature = JSON.stringify(state);
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      callbacks.onChange(state);
    }
    const rewardSignature =
      state.mode === "reward"
        ? `${state.rewardId}:${state.level}:${state.choices.join(",")}`
        : "";
    if (rewardSignature && rewardSignature !== lastReward) {
      lastReward = rewardSignature;
      callbacks.onReward();
    }
    if (state.mode !== "reward") lastReward = "";
    if (state.mode !== lastMode) {
      lastMode = state.mode;
      if (state.mode === "victory" || state.mode === "gameover")
        callbacks.onFinish(state.mode === "victory", state.score, state.wave);
    }
  }

  class ArenaScene extends Phaser.Scene {
    private venueArt!: Phaser.GameObjects.Graphics;
    private venueTexture?: Phaser.GameObjects.RenderTexture;
    private venueSize = "";
    private staticArt!: Phaser.GameObjects.Graphics;
    private targets!: Phaser.GameObjects.Graphics;
    private action!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private waveLabel!: Phaser.GameObjects.Text;
    private cueLabel!: Phaser.GameObjects.Text;
    private entryLabel!: Phaser.GameObjects.Text;
    private hero!: Phaser.GameObjects.Image;
    private enemies = new Map<number, EnemyArt>();
    private particles: Particle[] = [];
    private trails: Trail[] = [];
    private timer = 0;
    private previousWave = 0;
    private previousMode = "";

    constructor() {
      super("ring");
    }

    preload() {
      this.load.spritesheet(
        "sd-roster",
        `${import.meta.env.BASE_URL}assets/sd-roster.png`,
        { frameWidth: 512, frameHeight: 512 },
      );
      for (const name of FACE_ROSTER)
        this.load.image(
          `face-${name}`,
          `${import.meta.env.BASE_URL}assets/sd-face-${name}.webp`,
        );
    }

    create() {
      this.venueArt = this.add.graphics().setDepth(-3);
      this.createDetailTextures();
      this.add.image(210, 322, "arena-mat").setDisplaySize(370, 566).setDepth(-1);
      this.staticArt = this.add.graphics().setDepth(0);
      this.drawRing();
      this.staticArt.generateTexture("ring-apron",ARENA.width,ARENA.height);
      this.add.image(0,0,"ring-apron").setOrigin(0).setDepth(0);
      this.staticArt.destroy();
      this.resizeArena();
      this.scale.on("resize", this.resizeArena, this);
      this.events.once("shutdown", () => this.scale.off("resize", this.resizeArena, this));
      this.targets = this.add.graphics().setDepth(10);
      this.action = this.add.graphics().setDepth(20);
      this.effects = this.add.graphics().setDepth(30);
      this.hero = this.add
        .image(model.player.x, model.player.y + 15, "sd-roster", 0)
        .setOrigin(0.5, 0.72)
        .setDisplaySize(96, 96)
        .setDepth(24);
      this.waveLabel = this.add
        .text(210, 20, "", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#b1bccc",
          letterSpacing: 1.8,
        })
        .setOrigin(0.5)
        .setDepth(40)
        .setVisible(false);
      this.cueLabel = this.add
        .text(210, 610, "상하좌우 드래그 · 자동 발사", {
          fontFamily: "Arial, sans-serif",
          fontSize: "9px",
          color: "#8c9bad",
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setDepth(40)
        .setVisible(false);
      this.entryLabel = this.add.text(210,90,"BOSS INCOMING",{
        fontFamily:"monospace",fontSize:"7px",fontStyle:"bold",color:"#ffd38e",
        backgroundColor:"#281c20",padding:{left:7,right:7,top:4,bottom:4},letterSpacing:1,
      }).setOrigin(.5).setDepth(40).setVisible(false);
      const resizeObserver = new ResizeObserver(() => {
        this.scale.getParentBounds();
        this.scale.refresh();
      });
      resizeObserver.observe(parent);
      disposers.push(() => resizeObserver.disconnect());
      this.installInput();
      this.drawFrame(0);
      emit(true);
    }

    update(time: number, delta: number) {
      const dt = Math.min(delta / 1000, 0.05);
      this.timer += dt;
      model.step(dt);
      for (const event of model.drainEvents()) this.handleEvent(event);
      this.drawFrame(dt);
      if (time - lastNotification > 50 || model.mode !== lastMode) {
        lastNotification = time;
        emit();
      }
    }

    private installInput() {
      const canvas = this.game.canvas;
      canvas.tabIndex = 0;
      canvas.setAttribute("role", "application");
      canvas.setAttribute(
        "aria-label",
        "링 브레이커 경기장. 상하좌우 드래그나 방향키, WASD로 레슬러를 움직이세요. 공은 자동으로 발사됩니다.",
      );
      canvas.style.touchAction = "pinch-zoom";
      canvas.style.userSelect = "none";
      canvas.style.setProperty("-webkit-user-select", "none");
      canvas.style.setProperty("-webkit-touch-callout", "none");
      const cancel = (event: Event) => event.preventDefault();
      for (const name of ["contextmenu", "selectstart", "dragstart"]) {
        canvas.addEventListener(name, cancel);
        disposers.push(() => canvas.removeEventListener(name, cancel));
      }
      const dialogOpen = () =>
        !!document.querySelector(
          'dialog[open], [role="dialog"]:not([aria-hidden="true"]):not([hidden])',
        );
      let activePointer: number | undefined;
      const position = (event: PointerEvent) => {
        if (dialogOpen() || model.mode !== "playing") return;
        const bounds = canvas.getBoundingClientRect();
        const world = this.cameras.main.getWorldPoint(
          ((event.clientX - bounds.left) / bounds.width) * this.scale.width,
          ((event.clientY - bounds.top) / bounds.height) * this.scale.height,
        );
        model.point(world.x, world.y);
      };
      const down = (event: PointerEvent) => {
        if (!event.isPrimary || dialogOpen() || model.mode !== "playing")
          return;
        activePointer = event.pointerId;
        position(event);
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* Pointer already released. */
        }
      };
      const move = (event: PointerEvent) => {
        if (activePointer === event.pointerId) position(event);
      };
      const up = (event: PointerEvent) => {
        if (activePointer === event.pointerId) activePointer = undefined;
        if (canvas.hasPointerCapture(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
      };
      for (const [name, handler] of [
        ["pointerdown", down],
        ["pointermove", move],
        ["pointerup", up],
        ["pointercancel", up],
      ] as const) {
        canvas.addEventListener(name, handler);
        disposers.push(() => canvas.removeEventListener(name, handler));
      }
      const pressed = new Set<string>();
      clearInput = () => {
        pressed.clear();
        activePointer = undefined;
        model.move(0, 0);
      };
      const key = (event: KeyboardEvent) => {
        if (dialogOpen()) {
          clearInput();
          return;
        }
        if (
          (event.target as HTMLElement | null)?.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
          )
        )
          return;
        const normalized = event.key.toLowerCase();
        if (!["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(normalized)) return;
        if (model.mode === "playing") event.preventDefault();
        if (event.type === "keydown") pressed.add(normalized);
        else pressed.delete(normalized);
        const left = pressed.has("arrowleft") || pressed.has("a");
        const right = pressed.has("arrowright") || pressed.has("d");
        const up = pressed.has("arrowup") || pressed.has("w");
        const down = pressed.has("arrowdown") || pressed.has("s");
        model.move(left === right ? 0 : left ? -1 : 1, up === down ? 0 : up ? -1 : 1);
      };
      const blur = () => clearInput();
      window.addEventListener("keydown", key);
      window.addEventListener("keyup", key);
      window.addEventListener("blur", blur);
      disposers.push(() => {
        window.removeEventListener("keydown", key);
        window.removeEventListener("keyup", key);
        window.removeEventListener("blur", blur);
      });
    }

    private createDetailTextures() {
      // Reusable canvas materials keep metal and fabric detail out of the frame loop.
      const mat = this.textures.createCanvas("arena-mat", 512, 768)!;
      const c = mat.context;
      const shade = c.createRadialGradient(256, 350, 15, 256, 350, 450);
      shade.addColorStop(0, "#233a43");
      shade.addColorStop(0.55, "#1a2d36");
      shade.addColorStop(1, "#10212d");
      c.fillStyle = shade;
      c.fillRect(0, 0, 512, 768);
      let seed = 431;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 10500; i++) {
        const x = random() * 512, y = random() * 768;
        c.fillStyle = i % 2 ? "rgba(180,220,217,.022)" : "rgba(0,5,10,.04)";
        c.fillRect(x, y, 1 + random() * 2, 1);
      }
      c.lineWidth = 1;
      c.strokeStyle = "rgba(182,209,207,.045)";
      for (let x = 0; x < 512; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 768); c.stroke(); }
      for (let y = 0; y < 768; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(512, y); c.stroke(); }
      // Worn canvas seams, boot scuffs, and a quiet centre emblem.
      for (let i = 0; i < 115; i++) {
        const x = 25 + random() * 462, y = 25 + random() * 718;
        c.strokeStyle = "rgba(4,11,16,.11)";
        c.lineWidth = 1 + random() * 3;
        c.beginPath(); c.ellipse(x, y, 2 + random() * 6, 5 + random() * 11, random() * 6, 0, Math.PI * 1.3); c.stroke();
      }
      c.save(); c.translate(256, 385); c.rotate(-0.10);
      c.strokeStyle = "rgba(159,188,179,.075)"; c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, 112, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(0, 0, 103, 0, Math.PI * 2); c.stroke();
      c.font = "900 102px Impact, Arial Black, sans-serif";
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = "rgba(173,201,180,.065)"; c.fillText("RB", 0, 1);
      c.restore(); mat.refresh();
      const frame = this.textures.createCanvas("enemy-frame", 128, 128)!;
      const f = frame.context;
      const metal = f.createLinearGradient(0, 0, 128, 128);
      metal.addColorStop(0, "#a8b8b0"); metal.addColorStop(.17, "#4d6265");
      metal.addColorStop(.45, "#1c303b"); metal.addColorStop(.75, "#344b55"); metal.addColorStop(1, "#7d8e88");
      f.fillStyle = "#07121c"; f.beginPath(); f.roundRect(0, 0, 128, 128, 15); f.fill();
      f.fillStyle = metal; f.beginPath(); f.roundRect(3, 2, 122, 122, 13); f.fill();
      f.clearRect(12, 12, 104, 101);
      f.strokeStyle = "rgba(230,245,221,.4)"; f.lineWidth = 1; f.beginPath(); f.roundRect(5, 4, 118, 118, 10); f.stroke();
      f.strokeStyle = "#0a1520"; f.lineWidth = 3; f.strokeRect(11, 11, 106, 103);
      for (const x of [7, 120]) for (const y of [7, 120]) {
        f.fillStyle = "#07121b"; f.beginPath(); f.arc(x, y, 3, 0, Math.PI * 2); f.fill();
        f.fillStyle = "#b0beb1"; f.beginPath(); f.arc(x-.5, y-.6, 1.5, 0, Math.PI * 2); f.fill();
      }
      for (const x of [22, 38, 54, 70, 86, 102]) { f.fillStyle = "#cbb86c"; f.fillRect(x, 120, 7, 2); }
      frame.refresh();
    }

    private resizeArena() {
      const size = `${this.scale.width}:${this.scale.height}`;
      if(this.venueSize === size) return;
      this.venueSize = size;
      // Fit the entire logical mat between real HUD edges whenever the normal
      // fit would hide the player's feet (including the lowest legal y575).
      const normalZoom = Math.min(this.scale.width/ARENA.width,this.scale.height/ARENA.height);
      const parentTop = parent.getBoundingClientRect().top;
      const hudBottom = Math.max(...[".hud-top",".xp-hud",".stage-pill"].map(selector =>
        (document.querySelector(selector)?.getBoundingClientRect().bottom ?? 120)-parentTop,
      ))+8;
      const loadoutTop = (document.querySelector(".loadout-panel")?.getBoundingClientRect().top ?? this.scale.height-145)-parentTop-12;
      const feetAtNormalFit = this.scale.height/2+(617-ARENA.height/2)*normalZoom;
      const playerTopAtNormalFit = this.scale.height/2+(75-ARENA.height/2)*normalZoom;
      const reserveHud = feetAtNormalFit > loadoutTop || playerTopAtNormalFit < hudBottom;
      const fitHeight = reserveHud ? Math.max(80,loadoutTop-hudBottom) : this.scale.height;
      const zoom = Math.min(this.scale.width/ARENA.width,fitHeight/ARENA.height);
      const screenCentre = reserveHud ? (hudBottom+loadoutTop)/2 : this.scale.height/2;
      const centreOffset = (this.scale.height/2-screenCentre)/zoom;
      this.cameras.main.setZoom(zoom).centerOn(ARENA.width / 2, ARENA.height / 2+centreOffset);
      const w = this.scale.width / zoom, h = this.scale.height / zoom;
      const l = (420 - w) / 2 - 5, t = (620 - h) / 2 - 5+centreOffset;
      const g = this.venueArt.clear().setVisible(true);
      g.fillStyle(0x060d15).fillRect(l, t, w + 10, h + 10);
      // The venue extends into every aspect ratio; the gameplay mat never stretches.
      for (let y = Math.floor(t / 44) * 44; y < t + h; y += 44) {
        for (let x = Math.floor(l / 52) * 52; x < l + w; x += 52) {
          const outside = x < 5 || x > 410 || y < 22 || y > 620;
          if (!outside) continue;
          g.fillStyle(0x101c27).fillRoundedRect(x+2, y+2, 48, 40, 3);
          g.lineStyle(1, 0x243441, .55).strokeRoundedRect(x+3, y+3, 46, 38, 2);
          g.fillStyle(0x7a8c8e,.24).fillCircle(x+7,y+7,1).fillCircle(x+45,y+37,1);
          g.lineStyle(1,0x33434a,.2).lineBetween(x+10,y+32,x+38,y+8);
        }
      }
      // Tiered spectator seats and overhead fixtures beyond the ring apron.
      for (const side of [-1, 1]) {
        const start = side < 0 ? l + 10 : 442;
        const end = side < 0 ? -22 : l + w;
        for (let x = start; x < end; x += 25) {
          for (let y = t + 30; y < t + h - 20; y += 32) {
            if (y > 145 && y < 225 || y > 355 && y < 435) continue;
            g.fillStyle(0x172d37,.8).fillRoundedRect(x-6,y,15,13,3);
            g.fillStyle(Math.floor(x+y)%3 ? 0x3e4c51 : 0x6d6253,.7).fillCircle(x+1,y-2,4);
            g.fillStyle(0x050c13,.65).fillRect(x-8,y+12,20,3);
          }
        }
      }
      for (const x of [l+20,l+w-20]) {
        g.lineStyle(3,0x30434b,.5).lineBetween(x,t,x,t+h);
        for(let y=t+20;y<t+h;y+=100) {
          g.fillStyle(0x101a22).fillRoundedRect(x-9,y,18,36,4);
          g.fillStyle(0x91dad0,.55).fillRoundedRect(x-3,y+6,6,22,2);
          g.fillStyle(0x76dbbf,.025).fillTriangle(x,y+13,210,y-90,210,y+120);
        }
      }
      for (const y of [t+32,t+h-32]) {
        g.fillStyle(0x111f29).fillRoundedRect(107,y-6,206,12,3);
        for(let x=113;x<310;x+=12) g.fillStyle(x%24?0xbdd87e:0x415967,.55).fillRect(x,y-2,7,3);
      }
      // Thousands of venue paths are painted once per viewport size. Keeping
      // them as live Graphics would tessellate the entire stadium every frame.
      this.venueTexture?.destroy();
      this.venueTexture = this.add.renderTexture(l,t,Math.ceil(w+10),Math.ceil(h+10))
        .setOrigin(0).setDepth(-3);
      this.venueTexture.draw(g,-l,-t);
      g.clear().setVisible(false);
    }

    private drawRing() {
      const g = this.staticArt;
      // Layered apron, welded metal corners, rope shadows and stitched canvas.
      g.lineStyle(16,0x030911,.7).strokeRoundedRect(17, 37, 386, 576, 8);
      g.lineStyle(8,0x0d1b25).strokeRoundedRect(20, 38, 380, 570, 6);
      g.lineStyle(8,0x0c1721,.8).strokeRect(25,43,370,560);
      g.lineStyle(1,0x476168,.4).strokeRect(29,47,362,551);
      for (let y=58;y<596;y+=10) {
        g.lineStyle(.8,0x738d8c,.14).lineBetween(28,y,30,y+3);
        g.lineStyle(.8,0x738d8c,.14).lineBetween(390,y,392,y+3);
      }
      for (let i = 0; i < 3; i++) {
        const inset = 12 + i * 5;
        g.lineStyle(3,0x020810,.65).strokeRoundedRect(inset+1,40+i*5+2,420-inset*2,566-i*10,3);
        g.lineStyle(i===1 ? 1.8 : 1.2,i===1 ? 0xc3b37b : 0x758f96,i===1 ? .65 : .52)
          .strokeRoundedRect(inset,40+i*5,420-inset*2,566-i*10,3);
      }
      for (const x of [18,402]) for (const y of [42,606]) {
        g.fillStyle(0x050c16).fillRoundedRect(x-8,y-11,16,22,3);
        g.fillStyle(0x40535e).fillRoundedRect(x-6,y-9,12,18,3);
        g.fillStyle(0x9bab9e).fillRect(x-4,y-8,3,13);
        for(const yy of [-5,5]) g.fillStyle(0x11222b).fillCircle(x+3,y+yy,1.4);
      }
      // Side entrance plates make incoming flank attacks readable.
      for(const x of [15,405]) for(const y of [186,396]) {
        g.fillStyle(0x040b14).fillRoundedRect(x-10,y-24,20,48,4);
        g.lineStyle(1,0x748a83,.7).strokeRoundedRect(x-8,y-22,16,44,3);
        g.fillStyle(0xd0af69,.55).fillRect(x-3,y-18,6,36);
        g.fillStyle(0x07121c).fillRect(x-2,y-14,4,28);
        for(let yy=y-16;yy<y+18;yy+=8) g.lineStyle(2,0xd0b26c,.6).lineBetween(x-7,yy,x-4,yy+3);
      }
    }

    private drawTelegraphs() {
      const g = this.targets;
      this.entryLabel.setVisible(false);
      for (const warning of model.telegraphs) {
        const progress = 1 - warning.life / warning.maxLife;
        const pulse = reducedMotion ? .75 : .6 + Math.sin(this.timer * 16) * .25;
        if (warning.side === "top") {
          g.fillStyle(0xf28b63,.045 + progress*.045).fillRect(35,43,350,64);
          g.lineStyle(1.5,0xffa176,pulse).lineBetween(60,47,360,47);
          if(warning.boss) this.entryLabel.setPosition(Math.max(100,Math.min(320,warning.x)),warning.y+28).setAlpha(.8+progress*.2).setVisible(true);
          for (const cx of warning.boss ? [warning.x] : [155,210,265]) {
            for(let i=0;i<2;i++) {
              const cy=warning.y+i*13;
              g.lineStyle(2,0xffab7d,pulse*(1-i*.25));
              g.lineBetween(cx-5,cy-3,cx,cy+3);
              g.lineBetween(cx,cy+3,cx+5,cy-3);
            }
          }
          continue;
        }
        const fromLeft = warning.side === "left";
        const x = fromLeft ? 29 : 391;
        const direction = fromLeft ? 1 : -1;
        g.fillStyle(0xf28b63,.05 + progress*.07).fillRect(fromLeft ? 27 : 311,warning.y-43,82,86);
        g.lineStyle(2,0xff9d71,pulse).lineBetween(x,warning.y-37,x,warning.y+37);
        for (let i=0;i<3;i++) {
          const cx=x+direction*(12+i*16), cy=warning.y;
          g.lineStyle(2,0xffa570,pulse*(1-i*.18));
          g.lineBetween(cx-direction*4,cy-7,cx+direction*2,cy);
          g.lineBetween(cx+direction*2,cy,cx-direction*4,cy+7);
        }
        g.lineStyle(2,0xffd089,.85).beginPath().arc(x+direction*16,warning.y-43,7,-Math.PI/2,-Math.PI/2+Math.PI*2*progress).strokePath();
      }
    }

    private drawFrame(dt: number) {
      if (this.previousWave !== model.wave) {
        this.previousWave = model.wave;
        this.waveLabel.setText(
          `${String(model.wave).padStart(2, "0")} / ${WAVE_TITLES[model.wave - 1] ?? "RUMBLE"}`,
        );
      }
      if (this.previousMode !== model.mode) {
        this.previousMode = model.mode;
        this.cueLabel.setText(
          model.mode === "ready"
            ? "상하좌우 드래그 · 자동 발사"
            : "상하좌우 이동 · 붉은 진입 경고를 피하세요",
        );
      }
      this.targets.clear();
      this.drawTelegraphs();
      const alive = new Set<number>();
      for (const enemy of model.bricks) {
        if (enemy.hp <= 0) continue;
        alive.add(enemy.id);
        this.drawWrestler(enemy);
      }
      for (const [id, art] of this.enemies) {
        if (alive.has(id)) continue;
        art.image.destroy();
        art.frame?.destroy();
        art.hp.destroy();
        art.label?.destroy();
        this.enemies.delete(id);
      }
      this.action.clear();
      this.drawPickups();
      this.drawPlayer();
      this.drawProjectiles(dt);
      this.drawModelEffects();
      this.effects.clear();
      this.particles = this.particles.filter((particle) => {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 100 * dt;
        if (particle.life <= 0) return false;
        const alpha = particle.life / particle.maxLife;
        this.effects
          .fillStyle(particle.color, alpha)
          .fillRect(particle.x, particle.y, particle.size, particle.size);
        return true;
      });
    }

    private drawWrestler(enemy: Brick) {
      const g = this.targets;
      const { x, y, width: w, height: h } = enemy;
      const elite = enemy.elite || enemy.boss;
      const color = enemy.boss
        ? 0xf5cb6e
        : enemy.elite
          ? 0xb39ae9
          : COLORS[enemy.type % COLORS.length];
      let art = this.enemies.get(enemy.id);
      if (!art) {
        const name = enemy.boss
          ? "onyx"
          : enemy.elite
            ? "atlas"
            : FACE_ROSTER[enemy.type % FACE_ROSTER.length];
        const image = this.add
          .image(
            x,
            y,
            elite ? "sd-roster" : `face-${name}`,
            elite ? (enemy.boss ? 5 : 4) : undefined,
          )
          .setDepth(12);
        const hp = this.add
          .text(x, y, "", {
            fontFamily: "Arial, sans-serif",
            fontSize: elite ? "10px" : "8px",
            fontStyle: "bold",
            color: "#f3f7ee",
            stroke: "#0b1420",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(14);
        const label = elite
          ? this.add
              .text(x, y, enemy.boss ? "THE CHAMPION" : "MID BOSS", {
                fontFamily: "monospace",
                fontSize: "6px",
                fontStyle: "bold",
                color: enemy.boss ? "#f7d477" : "#c8b7ed",
                letterSpacing: 1,
              })
              .setOrigin(0.5)
              .setDepth(14)
          : undefined;
        const frame = elite ? undefined : this.add.image(x,y,"enemy-frame").setDepth(13);
        art = { image, frame, hp, label };
        this.enemies.set(enemy.id, art);
      }
      if (elite) {
        g.fillStyle(color, 0.055).fillCircle(x, y, w * 0.72);
        g.fillStyle(0x070e19, 0.55).fillEllipse(x, y + h / 2 - 4, w * 0.9, 12);
        const bodyHeight = h + 12;
        art.image.setPosition(x, y - 1).setDisplaySize(bodyHeight, bodyHeight);
        art.label?.setPosition(x, y - h / 2 - 12);
      } else {
        g.fillStyle(0x06101a, 0.65).fillRoundedRect(
          x - w / 2,
          y - h / 2 + 4,
          w,
          h,
          7,
        );
        g.fillStyle(0x213047).fillRoundedRect(x - w / 2, y - h / 2, w, h, 7);
        g.fillStyle(color, 0.11).fillRoundedRect(
          x - w / 2 + 1,
          y - h / 2 + 1,
          w - 2,
          h - 2,
          6,
        );
        g.lineStyle(1, color, enemy.flash > 0 ? 0.95 : 0.45).strokeRoundedRect(
          x - w / 2,
          y - h / 2,
          w,
          h,
          7,
        );
        art.image.setPosition(x, y - 1).setDisplaySize(w - 7, h - 7);
        art.frame?.setPosition(x,y).setDisplaySize(w+3,h+3);
        const mark = enemy.role === "tank" ? 0xdcc47c : enemy.role === "ranged" ? 0xd3a0e4 : color;
        g.fillStyle(mark,.85).fillRoundedRect(x-w/2+5,y-h/2+3,11,2,1);
        if(enemy.entry !== "top") {
          const side = enemy.entry === "left" ? -1 : 1;
          g.fillStyle(0xffa677,.7).fillTriangle(x+side*(w/2+3),y-4,x+side*(w/2+7),y,x+side*(w/2+3),y+4);
        }
      }
      if (enemy.flash > 0) art.image.setTintFill(0xfff9db);
      else art.image.clearTint();
      // Real face images stay large; compact HP chips sit along their lower edge.
      const barWidth = elite ? Math.max(58, w + 5) : w - 10;
      const barY = y + h / 2 + (elite ? 4 : -3);
      g.fillStyle(0x07101c).fillRoundedRect(
        x - barWidth / 2 - 1,
        barY - 2,
        barWidth + 2,
        5,
        2,
      );
      g.fillStyle(color).fillRoundedRect(
        x - barWidth / 2,
        barY - 1,
        Math.max(1, (barWidth * enemy.hp) / enemy.maxHp),
        3,
        1,
      );
      art.hp
        .setText(`${Math.ceil(enemy.hp)}`)
        .setPosition(x, elite ? barY + 11 : y + h / 2 - 7);
      if (enemy.slow > 0)
        g.lineStyle(1.5, 0x83d8ff, 0.8).strokeCircle(x, y - 2, w / 2 + 3);
      if (enemy.burn > 0 || enemy.poison > 0) {
        const statusColor = enemy.poison > 0 ? 0xbc92eb : 0xff9c65;
        const flicker = Math.sin(this.timer * 10 + enemy.id) * 2;
        g.fillStyle(statusColor, 0.7).fillCircle(
          x + w / 2 - 3,
          y - h / 2 + flicker,
          3,
        );
      }
    }

    private drawPlayer() {
      const g = this.action;
      const p = model.player;
      const bob = reducedMotion ? 0 : Math.sin(this.timer * 5) * 1.3;
      g.fillStyle(0x050d16, 0.65).fillEllipse(p.x, p.y + 30, 58, 14);
      g.lineStyle(1, 0xd6ed72, 0.22).strokeEllipse(p.x, p.y + 29, 64, 16);
      g.fillStyle(0xd8f383, 0.045).fillCircle(p.x, p.y - 7, 39);
      this.hero.setPosition(p.x, p.y + 15 + bob);
      this.hero.setAlpha(
        model.invulnerable > 0 && Math.floor(this.timer * 13) % 2 ? 0.4 : 1,
      );
      const angle = model.aimAngle;
      // A dotted guide explains the auto volley without crowding the arena.
      for (let i = 0; i < 5; i++) {
        const distance = 34 + i * 12;
        g.fillStyle(0xd6ef77, 0.28 - i * 0.04).fillCircle(
          p.x + Math.cos(angle) * distance,
          p.y + Math.sin(angle) * distance,
          1.4,
        );
      }
      if (model.charge >= 100) {
        g.lineStyle(
          1.5,
          0xf0c36a,
          0.5 + Math.sin(this.timer * 4) * 0.2,
        ).strokeCircle(p.x, p.y - 10, 35);
      }
    }

    private drawPickups() {
      const g = this.action;
      for (const pickup of model.pickups) {
        const bob = reducedMotion
          ? 0
          : Math.sin(this.timer * 5 + pickup.id) * 1.5;
        const y = pickup.y + bob;
        g.fillStyle(0x98e8e4, 0.07).fillCircle(pickup.x, y, 10);
        g.fillStyle(0x71d8d6, 0.8).fillTriangle(
          pickup.x,
          y - 5,
          pickup.x - 4,
          y,
          pickup.x,
          y + 5,
        );
        g.fillStyle(0xc2fdf0).fillTriangle(
          pickup.x,
          y - 5,
          pickup.x + 4,
          y,
          pickup.x,
          y + 5,
        );
        g.lineStyle(0.7, 0xeffff2, 0.7).lineBetween(
          pickup.x,
          y - 4,
          pickup.x,
          y + 3,
        );
      }
    }

    private drawProjectiles(dt: number) {
      const g = this.action;
      if (model.mode === "playing")
        for (const ball of model.balls) {
          if (!ball.attached)
            this.trails.push({
              x: ball.x,
              y: ball.y,
              life: 0.14,
              color: BALL_COLORS[ball.kind] ?? BALL_COLORS.basic,
              radius: ball.radius,
            });
        }
      if (this.trails.length > 650)
        this.trails.splice(0, this.trails.length - 650);
      this.trails = this.trails.filter((point) => {
        point.life -= dt;
        return point.life > 0;
      });
      for (const point of this.trails)
        g.fillStyle(point.color, point.life * 2.2).fillCircle(
          point.x,
          point.y,
          Math.max(0.5, (point.radius * point.life) / 0.14),
        );
      for (const ball of model.balls) {
        const color = BALL_COLORS[ball.kind] ?? BALL_COLORS.basic;
        const r = ball.radius;
        g.fillStyle(color, 0.09).fillCircle(ball.x, ball.y, r + 7);
        g.fillStyle(color, 0.3).fillCircle(ball.x, ball.y, r + 2);
        g.fillStyle(color).fillCircle(ball.x, ball.y, r);
        g.fillStyle(0xffffff, 0.9).fillCircle(
          ball.x - r * 0.22,
          ball.y - r * 0.25,
          Math.max(1, r * 0.38),
        );
        if (ball.kind === "bomb")
          g.lineStyle(1, 0x1d1830).strokeCircle(
            ball.x,
            ball.y,
            Math.max(1, r - 2),
          );
        if (ball.kind === "boomerang") {
          const rotation = this.timer * 10 + ball.id;
          g.lineStyle(2, 0xf3e9ff, 0.85);
          g.lineBetween(
            ball.x - Math.cos(rotation) * r,
            ball.y - Math.sin(rotation) * r,
            ball.x,
            ball.y,
          );
          g.lineBetween(
            ball.x,
            ball.y,
            ball.x + Math.cos(rotation + 1) * r,
            ball.y + Math.sin(rotation + 1) * r,
          );
        }
        if (ball.kind === "ice") {
          g.lineStyle(0.8, 0xffffff, 0.8).lineBetween(
            ball.x - r,
            ball.y,
            ball.x + r,
            ball.y,
          );
          g.lineBetween(ball.x, ball.y - r, ball.x, ball.y + r);
        }
      }
      for (const bullet of model.projectiles) {
        g.fillStyle(0xff7d78, 0.09).fillCircle(
          bullet.x,
          bullet.y,
          bullet.radius + 7,
        );
        g.lineStyle(2, 0xff8f82, 0.28).lineBetween(
          bullet.x,
          bullet.y,
          bullet.x - bullet.vx * 0.035,
          bullet.y - bullet.vy * 0.035,
        );
        g.fillStyle(0xf17f76).fillCircle(bullet.x, bullet.y, bullet.radius);
        g.fillStyle(0xffe9c7).fillCircle(
          bullet.x - 1,
          bullet.y - 1,
          bullet.radius * 0.43,
        );
      }
    }

    private drawModelEffects() {
      const g = this.action;
      for (const fx of model.fx) {
        const alpha = Math.min(0.9, fx.life * 2.5);
        const fxColor = Phaser.Display.Color.HexStringToColor(fx.color).color;
        if (fx.kind === "lightning" || fx.kind === "laser") {
          const endX = fx.x2 ?? fx.x;
          const endY = fx.y2 ?? fx.y - 250;
          g.lineStyle(
            fx.kind === "laser" ? 4 : 2,
            fxColor,
            alpha * 0.6,
          ).lineBetween(fx.x, fx.y, endX, endY);
          g.lineStyle(1, 0xffffff, alpha).lineBetween(fx.x, fx.y, endX, endY);
        } else {
          g.fillStyle(fxColor, alpha * 0.08).fillCircle(fx.x, fx.y, fx.radius);
          g.lineStyle(2, fxColor, alpha * 0.7).strokeCircle(
            fx.x,
            fx.y,
            Math.max(1, fx.radius),
          );
        }
      }
    }

    private handleEvent(event: ArenaEvent) {
      const kind = event.kind as string;
      const count =
        kind === "break"
          ? 12
          : kind === "finisher"
            ? 64
            : kind === "hit"
              ? 3
              : kind === "levelup"
                ? 35
                : 5;
      if (!reducedMotion) {
        if (kind === "life") this.cameras.main.shake(130, 0.006);
        if (kind === "finisher") {
          this.cameras.main.flash(130, 204, 225, 141, false);
          this.cameras.main.shake(160, 0.006);
        }
      }
      const color =
        kind === "finisher" || kind === "levelup"
          ? 0xe1ed91
          : COLORS[(event.type ?? 0) % COLORS.length];
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
        const speed = 35 + Math.random() * (kind === "finisher" ? 270 : 100);
        const life = 0.2 + Math.random() * 0.32;
        this.particles.push({
          x: event.x,
          y: event.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 15,
          life,
          maxLife: life,
          color,
          size: 1.5 + Math.random() * 2,
        });
      }
      if ((kind === "break" || kind === "hit") && event.amount) {
        const label = this.add
          .text(
            event.x + 4,
            event.y - 11,
            kind === "break" ? "KO!" : `${event.amount}`,
            {
              fontFamily: "Arial, sans-serif",
              fontSize: kind === "break" ? "12px" : "9px",
              fontStyle: "bold",
              color: kind === "break" ? "#e4ee93" : "#f6ead6",
              stroke: "#122030",
              strokeThickness: 3,
            },
          )
          .setOrigin(0.5)
          .setDepth(35);
        this.tweens.add({
          targets: label,
          y: label.y - 24,
          alpha: 0,
          duration: 480,
          ease: "Cubic.easeOut",
          onComplete: () => label.destroy(),
        });
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA.width,
    height: ARENA.height,
    backgroundColor: "#0a111e",
    antialias: true,
    roundPixels: true,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: ArenaScene,
  });

  const controller: ArenaController = {
    start(meta) {
      clearInput();
      const runSeed = globalThis.crypto?.getRandomValues
        ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 0x100000000);
      model.start(meta, runSeed);
      emit(true);
    },
    pause() {
      clearInput();
      model.pause();
      emit(true);
    },
    resume() {
      clearInput();
      model.resume();
      emit(true);
    },
    launch() {
      model.launch();
      emit(true);
    },
    chooseUpgrade(id) {
      model.chooseUpgrade(id);
      emit(true);
    },
    finisher() {
      model.finisher();
      emit(true);
    },
    move(horizontal, vertical = 0) {
      model.move(horizontal, vertical);
    },
    point(x, y) {
      model.point(x, y);
    },
    setDifficulty(difficulty) {
      model.setDifficulty(difficulty);
      emit(true);
    },
    getState() {
      return model.snapshot();
    },
    destroy() {
      destroyed = true;
      disposers.forEach((dispose) => dispose());
      const debugWindow = window as unknown as {
        __RING_BREAKER__?: ArenaController;
      };
      if (debugWindow.__RING_BREAKER__ === controller)
        delete debugWindow.__RING_BREAKER__;
      game.destroy(true);
    },
  };
  if (new URLSearchParams(window.location.search).get("debug") === "true") {
    controller.debug = {
      model,
      clearWave() {
        model.debugClearWave();
        emit(true);
      },
      loseLife() {
        model.debugDamage(20);
        emit(true);
      },
      setCharge(value) {
        model.charge = Math.min(100, Math.max(0, value));
        emit(true);
      },
      gainXp(value) {
        model.debugGainXp(value);
        emit(true);
      },
      setWave(value) {
        model.debugSetWave(value);
        emit(true);
      },
      grantUpgrade(id) {
        model.debugGrantUpgrade(id);
        emit(true);
      },
    };
    (
      window as unknown as { __RING_BREAKER__: ArenaController }
    ).__RING_BREAKER__ = controller;
  }
  return controller;
}
