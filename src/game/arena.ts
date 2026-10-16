import Phaser from "phaser";
import {
  ARENA,
  ArenaModel,
  type ArenaState,
  type MetaStats,
  type ArenaEvent,
  type Brick,
} from "./model";

export type { ArenaState, ArenaMode } from "./model";

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
  move(direction: -1 | 0 | 1): void;
  getState(): ArenaState;
  destroy(): void;
  debug?: {
    clearWave(): void;
    loseLife(): void;
    setCharge(value: number): void;
    model: ArenaModel;
  };
}

const COLORS = [0xff624c, 0xeabc4d, 0xa182e9, 0x58bdd1, 0x93bd74, 0xffb94d];
const WAVE_TITLES = [
  "OPENING BELL",
  "TAG TEAM TROUBLE",
  "THE HEEL TURN",
  "ROYAL RUMBLE",
  "MAIN EVENT",
  "THE CHAMPION",
];
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
}

export function createArena(
  parent: HTMLElement,
  callbacks: ArenaCallbacks,
): ArenaController {
  const model = new ArenaModel();
  let destroyed = false;
  let lastSignature = "";
  let lastMode = model.mode;
  let lastNotification = 0;
  let clearInput = () => {
    model.move(0);
  };
  const disposers: Array<() => void> = [];

  function emit(force = false) {
    if (destroyed) return;
    const state = model.snapshot();
    const signature = JSON.stringify(state);
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      callbacks.onChange(state);
    }
    if (state.mode !== lastMode) {
      lastMode = state.mode;
      if (state.mode === "reward") callbacks.onReward();
      if (state.mode === "victory" || state.mode === "gameover")
        callbacks.onFinish(state.mode === "victory", state.score, state.wave);
    }
  }

  class ArenaScene extends Phaser.Scene {
    private staticArt!: Phaser.GameObjects.Graphics;
    private targets!: Phaser.GameObjects.Graphics;
    private action!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private waveLabel!: Phaser.GameObjects.Text;
    private cueLabel!: Phaser.GameObjects.Text;
    private bossLabel!: Phaser.GameObjects.Text;
    private particles: Particle[] = [];
    private trail: Trail[] = [];
    private previousWave = 0;
    private previousBoss = -1;
    private hasWrestler = false;
    private timer = 0;

    constructor() {
      super("ring");
    }

    preload() {
      // The gameplay remains complete if the optional generated illustration is unavailable.
      this.load.image("ringside-wrestler", `${import.meta.env.BASE_URL}assets/wrestler.png`);
    }

    create() {
      this.staticArt = this.add.graphics();
      this.drawRing();
      this.hasWrestler = this.textures.exists("ringside-wrestler");
      if (this.hasWrestler) {
        const wrestler = this.add
          .image(330, 415, "ringside-wrestler")
          .setAlpha(0.055)
          .setOrigin(0.5, 0.5);
        wrestler.setScale(215 / wrestler.width);
      }
      this.add
        .text(210, 382, "RING\nBREAKER", {
          fontFamily: "Impact, Arial Black, sans-serif",
          fontSize: "53px",
          color: "#bbb0ca",
          fontStyle: "bold",
          align: "center",
          lineSpacing: -15,
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setAlpha(0.075)
        .setAngle(-9);
      this.add
        .text(210, 451, "NO COUNT OUT. NO WAY BACK.", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#8a7f98",
          letterSpacing: 1.5,
        })
        .setOrigin(0.5)
        .setAlpha(0.28);
      this.targets = this.add.graphics();
      this.action = this.add.graphics();
      this.effects = this.add.graphics();
      this.waveLabel = this.add
        .text(210, 20, "", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#c1b4cc",
          letterSpacing: 2,
        })
        .setOrigin(0.5);
      this.cueLabel = this.add
        .text(210, 509, "DRAG TO AIM · BREAK THE ROSTER", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#82758e",
          letterSpacing: 0.8,
        })
        .setOrigin(0.5);
      this.bossLabel = this.add
        .text(210, 169, "", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#ffd58a",
          fontStyle: "bold",
          letterSpacing: 1.5,
        })
        .setOrigin(0.5);
      this.installInput();
      this.drawFrame(0);
      emit(true);
    }

    update(time: number, delta: number) {
      const dt = Math.min(delta / 1000, 0.05);
      this.timer += dt;
      model.step(dt);
      const events = model.drainEvents();
      for (const event of events) this.handleEvent(event);
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
        "링 브레이커 경기장. 좌우 방향키 또는 드래그로 패들을 움직이세요.",
      );
      canvas.style.touchAction = "pan-y pinch-zoom";
      canvas.style.userSelect = "none";
      canvas.style.setProperty("-webkit-user-select", "none");
      canvas.style.setProperty("-webkit-touch-callout", "none");
      const cancel = (event: Event) => event.preventDefault();
      for (const name of ["contextmenu", "selectstart", "dragstart"]) {
        canvas.addEventListener(name, cancel);
        disposers.push(() => canvas.removeEventListener(name, cancel));
      }
      let activePointer: number | undefined;
      const position = (event: PointerEvent) => {
        const bounds = canvas.getBoundingClientRect();
        model.point(
          ((event.clientX - bounds.left) / bounds.width) * ARENA.width,
        );
      };
      const down = (event: PointerEvent) => {
        if (!event.isPrimary) return;
        activePointer = event.pointerId;
        position(event);
        if (model.mode === "playing") model.launch();
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          /* Pointer may already be released. */
        }
      };
      const move = (event: PointerEvent) => {
        if (activePointer === event.pointerId || event.pointerType === "mouse")
          position(event);
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
        model.move(0);
      };
      const key = (event: KeyboardEvent) => {
        if (
          document.querySelector(
            'dialog[open], [role="dialog"]:not([aria-hidden="true"]):not([hidden])',
          )
        ) {
          clearInput();
          return;
        }
        if (
          (event.target as HTMLElement | null)?.closest(
            'input, textarea, select, [contenteditable="true"]',
          )
        )
          return;
        if (
          !["ArrowLeft", "ArrowRight", "a", "d", "A", "D"].includes(event.key)
        )
          return;
        if (model.mode === "playing") event.preventDefault();
        if (event.type === "keydown") pressed.add(event.key.toLowerCase());
        else pressed.delete(event.key.toLowerCase());
        const left = pressed.has("arrowleft") || pressed.has("a");
        const right = pressed.has("arrowright") || pressed.has("d");
        model.move(left === right ? 0 : left ? -1 : 1);
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

    private drawRing() {
      const g = this.staticArt;
      g.fillStyle(0x100e19).fillRect(0, 0, 420, 620);
      // Rows of arena spectators and small flashbulbs frame the ring.
      for (let i = 0; i < 35; i++) {
        const x = 9 + i * 12;
        g.fillStyle(i % 4 === 0 ? 0x51404b : 0x302638, 0.8).fillCircle(
          x,
          40 + (i % 3) * 3,
          4,
        );
        g.fillStyle(0x211a2a).fillRect(x - 4, 44, 8, 10);
      }
      g.fillStyle(0x09080e).fillRoundedRect(15, 51, 390, 550, 8);
      g.fillStyle(0x2a2237).fillRect(25, 62, 370, 526);
      g.fillStyle(0x272030).fillRect(38, 75, 344, 500);
      g.lineStyle(1, 0x3b3048, 0.5);
      for (let y = 78; y < 580; y += 25) g.lineBetween(30, y, 390, y);
      for (let x = 30; x <= 390; x += 30) g.lineBetween(x, 69, x, 582);
      // Three orange ropes, their shadows, and steel corner posts.
      for (let i = 0; i < 3; i++) {
        const inset = 10 + i * 5;
        g.lineStyle(3, 0x08070d, 0.65).strokeRect(
          inset + 1,
          54 + i * 5 + 3,
          420 - inset * 2,
          541 - i * 10,
        );
        g.lineStyle(
          1.5,
          i === 1 ? 0xff714d : 0xb04743,
          i === 1 ? 0.8 : 0.65,
        ).strokeRect(inset, 54 + i * 5, 420 - inset * 2, 541 - i * 10);
      }
      for (const x of [17, 403])
        for (const y of [57, 592]) {
          g.fillStyle(0x08070e).fillRoundedRect(x - 6, y - 10, 12, 20, 3);
          g.fillStyle(0x54475e).fillRoundedRect(x - 4, y - 8, 8, 16, 2);
          g.fillStyle(0xd2bbc2).fillRect(x - 2, y - 8, 2, 12);
        }
      g.fillStyle(0x110e1b).fillRect(41, 603, 338, 17);
      for (let i = 0; i < 13; i++) {
        g.fillStyle(i % 2 ? 0x8b3f32 : 0xb85136).fillTriangle(
          45 + i * 27,
          607,
          55 + i * 27,
          607,
          45 + i * 27,
          617,
        );
      }
      this.add
        .text(210, 586, "THE UNDERGROUND WRESTLING LEAGUE", {
          fontFamily: "monospace",
          fontSize: "6px",
          color: "#a07f89",
          letterSpacing: 1.8,
        })
        .setOrigin(0.5);
      this.add
        .text(40, 20, "● LIVE", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#f27e65",
          letterSpacing: 1,
        })
        .setOrigin(0, 0.5);
      this.add
        .text(382, 20, "UWL", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#9c8aa7",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
    }

    private drawFrame(dt: number) {
      if (this.previousWave !== model.wave) {
        this.previousWave = model.wave;
        this.waveLabel.setText(
          `${String(model.wave).padStart(2, "0")} / ${WAVE_TITLES[model.wave - 1]}`,
        );
      }
      const boss = model.bricks.find((brick) => brick.boss && brick.hp > 0);
      if ((boss?.hp ?? 0) !== this.previousBoss) {
        this.previousBoss = boss?.hp ?? 0;
        this.bossLabel.setText(boss ? `EL TITÁN · ${boss.hp} HP` : "");
      }
      this.targets.clear();
      for (const brick of model.bricks)
        if (brick.hp > 0) this.drawWrestler(brick);
      this.action.clear();
      const g = this.action;
      // The paddle is a miniature championship belt.
      const p = model.paddle;
      g.fillStyle(0x0c0911, 0.6).fillRoundedRect(
        p.x - p.width / 2,
        p.y - 2,
        p.width,
        20,
        6,
      );
      g.fillStyle(0xe05a3d).fillRoundedRect(
        p.x - p.width / 2,
        p.y - 7,
        p.width,
        14,
        4,
      );
      g.fillStyle(0xffa358).fillRect(
        p.x - p.width / 2 + 4,
        p.y - 7,
        p.width - 8,
        3,
      );
      g.fillStyle(0x883123).fillRect(
        p.x - p.width / 2 + 4,
        p.y + 4,
        p.width - 8,
        3,
      );
      for (const side of [-1, 1]) {
        g.fillStyle(0xe9b64c).fillRoundedRect(
          p.x + side * (p.width / 2 - 17) - 8,
          p.y - 5,
          16,
          10,
          2,
        );
        g.fillStyle(0xffdf7a).fillCircle(
          p.x + side * (p.width / 2 - 17),
          p.y,
          2,
        );
      }
      g.fillStyle(0x7b4c24).fillRoundedRect(p.x - 20, p.y - 12, 40, 24, 5);
      g.fillStyle(0xffcb59).fillRoundedRect(p.x - 18, p.y - 11, 36, 22, 5);
      g.lineStyle(1, 0xffedaa).strokeRoundedRect(p.x - 15, p.y - 8, 30, 16, 3);
      g.fillStyle(0x9e592d).fillTriangle(
        p.x - 7,
        p.y - 3,
        p.x + 7,
        p.y - 3,
        p.x,
        p.y + 6,
      );
      g.fillStyle(0xffeea7).fillTriangle(
        p.x - 7,
        p.y - 4,
        p.x + 7,
        p.y - 4,
        p.x,
        p.y + 3,
      );
      if (model.mode === "playing")
        for (const ball of model.balls)
          if (!ball.attached)
            this.trail.push({ x: ball.x, y: ball.y, life: 0.11 });
      this.trail = this.trail.filter((point) => {
        point.life -= dt;
        return point.life > 0;
      });
      for (const point of this.trail)
        g.fillStyle(
          model.fire ? 0xff7742 : 0xffd98c,
          point.life * 2,
        ).fillCircle(point.x, point.y, (5 * point.life) / 0.11);
      for (const ball of model.balls) {
        g.fillStyle(model.fire ? 0xff603e : 0xffc85a, 0.1).fillCircle(
          ball.x,
          ball.y,
          14,
        );
        g.fillStyle(model.fire ? 0xffa54a : 0xffc85a, 0.3).fillCircle(
          ball.x,
          ball.y,
          10,
        );
        g.fillStyle(0xfff0be).fillCircle(ball.x, ball.y, 6.5);
        g.fillStyle(0xffffff).fillCircle(ball.x - 1.5, ball.y - 2, 2.5);
      }
      this.cueLabel.setVisible(
        model.mode === "ready" ||
          (model.mode === "playing" &&
            model.balls.some((ball) => ball.attached)),
      );
      if (model.mode === "playing")
        this.cueLabel.setText("TAP TO SERVE · GET BACK IN THE RING");
      else this.cueLabel.setText("DRAG TO AIM · BREAK THE ROSTER");
      this.effects.clear();
      this.particles = this.particles.filter((particle) => {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 180 * dt;
        if (particle.life <= 0) return false;
        this.effects
          .fillStyle(particle.color, particle.life / particle.maxLife)
          .fillRect(particle.x, particle.y, particle.size, particle.size);
        return true;
      });
    }

    private drawWrestler(brick: Brick) {
      const g = this.targets;
      const { x, y, width: w, height: h, type, boss } = brick;
      const color = brick.flash > 0 ? 0xffedcc : COLORS[type];
      const s = boss ? 1.6 : 1;
      g.fillStyle(0x100c19, 0.7).fillRoundedRect(
        x - w / 2,
        y - h / 2 + 4,
        w,
        h,
        4,
      );
      g.fillStyle(0x191321).fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
      g.lineStyle(1, color, 0.46).strokeRoundedRect(
        x - w / 2 + 0.5,
        y - h / 2 + 0.5,
        w - 1,
        h - 1,
        4,
      );
      g.fillStyle(color, 0.13).fillRect(
        x - w / 2 + 2,
        y - h / 2 + 2,
        w - 4,
        h - 4,
      );
      if (boss) {
        g.fillStyle(0xffc755, 0.13).fillRect(x - 63, y - 34, 126, 68);
        // A tiny champion's crown over the mask.
        g.fillStyle(0xffcc59).fillTriangle(
          x - 14,
          y - 27,
          x - 14,
          y - 37,
          x - 5,
          y - 28,
        );
        g.fillTriangle(x - 7, y - 27, x, y - 40, x + 7, y - 27);
        g.fillTriangle(x + 5, y - 28, x + 14, y - 37, x + 14, y - 27);
      }
      // Broad shoulders, gloves and a readable lucha mask, drawn on a pixel grid.
      g.fillStyle(color).fillRect(x - 18 * s, y + 5 * s, 36 * s, 8 * s);
      g.fillStyle(0xd69975)
        .fillRect(x - 22 * s, y + 6 * s, 6 * s, 7 * s)
        .fillRect(x + 16 * s, y + 6 * s, 6 * s, 7 * s);
      g.fillStyle(color).fillRect(x - 11 * s, y - 13 * s, 22 * s, 23 * s);
      g.fillRect(x - 8 * s, y - 16 * s, 16 * s, 4 * s);
      g.fillStyle(0x23172b)
        .fillRect(x - 9 * s, y - 6 * s, 7 * s, 5 * s)
        .fillRect(x + 2 * s, y - 6 * s, 7 * s, 5 * s);
      g.fillStyle(0xfff1d8)
        .fillRect(x - 8 * s, y - 5 * s, 5 * s, 2 * s)
        .fillRect(x + 3 * s, y - 5 * s, 5 * s, 2 * s);
      g.fillStyle(0xffd5a2).fillRect(x - 5 * s, y + 2 * s, 10 * s, 6 * s);
      g.fillStyle(0x352031).fillRect(x - 3 * s, y + 4 * s, 6 * s, 2 * s);
      // The white mask stripe distinguishes a wrestler from an ordinary brick.
      g.fillStyle(0xffedca, 0.85).fillRect(
        x - 2 * s,
        y - 15 * s,
        4 * s,
        11 * s,
      );
      if (!boss && brick.maxHp > 1) {
        for (let i = 0; i < brick.maxHp; i++)
          g.fillStyle(i < brick.hp ? color : 0x46374f).fillRect(
            x - brick.maxHp * 3 + i * 6,
            y + 16,
            4,
            2,
          );
      }
      if (boss) {
        g.fillStyle(0x120c19).fillRoundedRect(x - 56, y + 26, 112, 5, 2);
        g.fillStyle(0xffbe58).fillRoundedRect(
          x - 56,
          y + 26,
          (112 * brick.hp) / brick.maxHp,
          5,
          2,
        );
      }
    }

    private handleEvent(event: ArenaEvent) {
      const count =
        event.kind === "break"
          ? 14
          : event.kind === "finisher"
            ? 70
            : event.kind === "hit"
              ? 5
              : 3;
      if (event.kind === "life") this.cameras.main.shake(180, 0.008);
      if (event.kind === "finisher") {
        this.cameras.main.flash(160, 255, 185, 96, false);
        this.cameras.main.shake(220, 0.009);
      }
      if (event.kind === "break" && model.wave === 6)
        this.cameras.main.shake(45, 0.002);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed =
          40 + Math.random() * (event.kind === "finisher" ? 360 : 140);
        const life = 0.2 + Math.random() * 0.32;
        this.particles.push({
          x: event.x,
          y: event.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          life,
          maxLife: life,
          color: event.kind === "finisher" ? 0xffd16a : COLORS[event.type ?? 1],
          size: 2 + Math.random() * 3,
        });
      }
      if (event.kind === "break" && event.amount) {
        const label = this.add
          .text(event.x, event.y - 10, `+${event.amount}`, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#ffe5ac",
            fontStyle: "bold",
            stroke: "#21162a",
            strokeThickness: 3,
          })
          .setOrigin(0.5);
        this.tweens.add({
          targets: label,
          y: label.y - 24,
          alpha: 0,
          duration: 650,
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
    backgroundColor: "#100e19",
    antialias: true,
    roundPixels: true,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: ArenaScene,
  });

  const controller: ArenaController = {
    start(meta) {
      clearInput();
      model.start(meta);
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
    move(direction) {
      model.move(direction);
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
        model.bricks.forEach((brick) => {
          brick.hp = 0;
        });
        model.step(1 / 60);
        emit(true);
      },
      loseLife() {
        model.balls.forEach((ball) => {
          ball.attached = false;
          ball.y = 650;
        });
        model.step(1 / 60);
        emit(true);
      },
      setCharge(value) {
        model.charge = Math.min(100, Math.max(0, value));
        emit(true);
      },
    };
    (
      window as unknown as { __RING_BREAKER__: ArenaController }
    ).__RING_BREAKER__ = controller;
  }
  return controller;
}
