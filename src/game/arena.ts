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
  let clearInput = () => model.move(0);
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
    private staticArt!: Phaser.GameObjects.Graphics;
    private targets!: Phaser.GameObjects.Graphics;
    private action!: Phaser.GameObjects.Graphics;
    private effects!: Phaser.GameObjects.Graphics;
    private waveLabel!: Phaser.GameObjects.Text;
    private cueLabel!: Phaser.GameObjects.Text;
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
      this.staticArt = this.add.graphics().setDepth(0);
      this.drawRing();
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
        .text(210, 607, "좌우로 드래그 · 자동 발사", {
          fontFamily: "Arial, sans-serif",
          fontSize: "9px",
          color: "#8c9bad",
          letterSpacing: 1,
        })
        .setOrigin(0.5)
        .setDepth(40);
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
        "링 브레이커 경기장. 드래그나 좌우 방향키로 레슬러를 움직이세요. 공은 자동으로 발사됩니다.",
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
      const dialogOpen = () =>
        !!document.querySelector(
          'dialog[open], [role="dialog"]:not([aria-hidden="true"]):not([hidden])',
        );
      let activePointer: number | undefined;
      const position = (event: PointerEvent) => {
        if (dialogOpen() || model.mode !== "playing") return;
        const bounds = canvas.getBoundingClientRect();
        model.point(
          ((event.clientX - bounds.left) / bounds.width) * ARENA.width,
        );
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
        activePointer = undefined;
        model.move(0);
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
        if (!["arrowleft", "arrowright", "a", "d"].includes(normalized)) return;
        if (model.mode === "playing") event.preventDefault();
        if (event.type === "keydown") pressed.add(normalized);
        else pressed.delete(normalized);
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
      g.fillStyle(0x0a111e).fillRect(0, 0, 420, 620);
      // Tiny spectators sit outside the ropes; the centre stays clear for projectiles.
      for (let i = 0; i < 38; i++) {
        const x = 6 + i * 11;
        g.fillStyle(i % 5 === 0 ? 0x59674e : 0x283243).fillCircle(
          x,
          37 + (i % 3) * 3,
          3,
        );
        g.fillStyle(0x182332).fillRoundedRect(x - 4, 40 + (i % 3) * 3, 8, 8, 2);
      }
      g.fillStyle(0x060d17).fillRoundedRect(15, 49, 390, 552, 8);
      g.fillStyle(0x202c3b).fillRoundedRect(23, 53, 374, 543, 6);
      g.fillStyle(0x14202f).fillRect(31, 61, 358, 527);
      g.lineStyle(1, 0x5b7187, 0.055);
      for (let y = 63; y < 590; y += 28) g.lineBetween(31, y, 389, y);
      for (let x = 31; x < 390; x += 28) g.lineBetween(x, 62, x, 588);
      // A wide central monogram recalls a real wrestling canvas.
      this.add
        .text(210, 346, "RB", {
          fontFamily: "Impact, Arial Black, sans-serif",
          fontSize: "120px",
          color: "#8193a7",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0.035)
        .setAngle(-8)
        .setDepth(1);
      this.add
        .text(210, 410, "UNDERGROUND WRESTLING CLUB", {
          fontFamily: "monospace",
          fontSize: "7px",
          color: "#6b7f97",
          letterSpacing: 1.7,
        })
        .setOrigin(0.5)
        .setAlpha(0.2)
        .setDepth(1);
      for (let i = 0; i < 3; i++) {
        const inset = 11 + i * 5;
        g.lineStyle(2.5, 0x030910, 0.8).strokeRect(
          inset + 1,
          55 + i * 5 + 2,
          420 - inset * 2,
          539 - i * 10,
        );
        g.lineStyle(
          i === 1 ? 1.7 : 1,
          i === 1 ? 0xe28555 : 0x687e8e,
          i === 1 ? 0.75 : 0.45,
        ).strokeRect(inset, 55 + i * 5, 420 - inset * 2, 539 - i * 10);
      }
      for (const x of [17, 403])
        for (const y of [57, 592]) {
          g.fillStyle(0x07101a).fillRoundedRect(x - 6, y - 9, 12, 18, 3);
          g.fillStyle(0x617084).fillRoundedRect(x - 4, y - 7, 8, 14, 2);
          g.fillStyle(0xb9c7d6).fillRect(x - 2, y - 7, 2, 10);
        }
      // Enemies crossing this line deal damage. The line is quieter than the faces.
      for (let x = 34; x < 390; x += 13)
        g.fillStyle(0xf28b67, 0.24).fillRect(x, 520, 6, 1);
      this.add
        .text(379, 512, "DANGER", {
          fontFamily: "monospace",
          fontSize: "6px",
          color: "#d1846e",
          letterSpacing: 1,
        })
        .setOrigin(1, 0.5)
        .setAlpha(0.6)
        .setDepth(1);
      this.add
        .text(39, 20, "● LIVE", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#e99b7e",
          letterSpacing: 1,
        })
        .setOrigin(0, 0.5)
        .setDepth(40);
      this.add
        .text(382, 20, "UWC", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#b0c6dc",
          letterSpacing: 1,
        })
        .setOrigin(1, 0.5)
        .setDepth(40);
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
            ? "좌우로 드래그 · 자동 발사"
            : "공은 자동 발사됩니다 · 적의 돌진을 피하세요",
        );
      }
      this.targets.clear();
      const alive = new Set<number>();
      for (const enemy of model.bricks) {
        if (enemy.hp <= 0) continue;
        alive.add(enemy.id);
        this.drawWrestler(enemy);
      }
      for (const [id, art] of this.enemies) {
        if (alive.has(id)) continue;
        art.image.destroy();
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
            fontSize: elite ? "10px" : "9px",
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
        art = { image, hp, label };
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
        art.image.setPosition(x, y - 3).setDisplaySize(w - 5, h - 5);
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
        .setPosition(x, elite ? barY + 11 : y + h / 2 - 9);
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
          p.y - 20 + Math.sin(angle) * distance,
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
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
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
