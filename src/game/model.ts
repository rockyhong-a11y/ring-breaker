/** Gameplay rules live here; the renderer only draws this deterministic simulation. */
export type ArenaMode =
  "ready" | "playing" | "paused" | "reward" | "gameover" | "victory";

export interface ArenaState {
  mode: ArenaMode;
  wave: number;
  lives: number;
  score: number;
  combo: number;
  remaining: number;
  bossHp: number;
  bossMaxHp: number;
  charge: number;
}

export interface MetaStats {
  power: number;
  width: number;
  health: number;
}
export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  attached: boolean;
  lastHit: number;
  hitAt: number;
}
export interface Brick {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  type: number;
  boss: boolean;
  flash: number;
}
export interface ArenaEvent {
  kind: "hit" | "break" | "paddle" | "life" | "clear" | "finisher" | "launch";
  x: number;
  y: number;
  amount?: number;
  type?: number;
}

export const ARENA = {
  width: 420,
  height: 620,
  left: 25,
  right: 395,
  top: 39,
  paddleY: 554,
  radius: 7,
};
const FIXED_STEP = 1 / 120;
const WAVE_ROWS = [
  ["111111", "111111", "011110"],
  ["022220", "211112", "121121", "011110"],
  ["303303", "212212", "132231", "021120"],
  ["033330", "321123", "233332", "122221", "001100"],
  ["434434", "343343", "224422", "332233", "122221"],
] as const;

export class ArenaModel {
  mode: ArenaMode = "ready";
  wave = 1;
  lives = 3;
  score = 0;
  combo = 0;
  charge = 0;
  balls: Ball[] = [];
  bricks: Brick[] = [];
  paddle = { x: 210, y: ARENA.paddleY, width: 96, height: 14, velocity: 0 };
  damage = 1;
  fire = false;
  slow = false;
  slowFactor = 1;
  multiball = false;
  time = 0;
  events: ArenaEvent[] = [];
  private nextId = 1;
  private direction = 0;
  private pointerTarget: number | undefined;
  private accumulator = 0;
  private respawnTime = 0;

  constructor() {
    this.setupWave();
  }

  get speed() {
    return (330 + (this.wave - 1) * 22) * this.slowFactor;
  }

  snapshot(): ArenaState {
    const boss = this.bricks.find((brick) => brick.boss && brick.hp > 0);
    return {
      mode: this.mode,
      wave: this.wave,
      lives: this.lives,
      score: this.score,
      combo: this.combo,
      charge: Math.floor(this.charge),
      remaining: this.bricks.filter((brick) => brick.hp > 0).length,
      bossHp: boss?.hp ?? 0,
      bossMaxHp: this.wave === 6 ? 40 : 0,
    };
  }

  start(meta: MetaStats = { power: 0, width: 0, health: 0 }) {
    this.wave = 1;
    this.lives = Math.min(6, 3 + Math.max(0, Math.floor(meta.health)));
    this.score = 0;
    this.combo = 0;
    this.charge = 0;
    this.damage = 1 + Math.max(0, Math.floor(meta.power));
    this.paddle.width = Math.min(170, 96 + Math.max(0, meta.width) * 10);
    this.paddle.x = 210;
    this.paddle.velocity = 0;
    this.fire = false;
    this.slow = false;
    this.slowFactor = 1;
    this.multiball = false;
    this.time = 0;
    this.accumulator = 0;
    this.pointerTarget = undefined;
    this.direction = 0;
    this.events = [];
    this.setupWave();
    this.mode = "playing";
    this.launch();
  }

  pause() {
    if (this.mode === "playing") this.mode = "paused";
  }
  resume() {
    if (this.mode === "paused") this.mode = "playing";
  }
  move(direction: -1 | 0 | 1) {
    this.direction = direction;
    if (direction) this.pointerTarget = undefined;
  }
  point(x: number) {
    this.pointerTarget = x;
    this.direction = 0;
  }

  launch() {
    if (this.mode !== "playing") return;
    for (const ball of this.balls) {
      if (!ball.attached) continue;
      ball.attached = false;
      const offset = this.multiball ? ((ball.id % 3) - 1) * 0.36 : 0.2;
      ball.vx = Math.sin(offset) * this.speed;
      ball.vy = -Math.cos(offset) * this.speed;
      this.events.push({ kind: "launch", x: ball.x, y: ball.y });
    }
    this.respawnTime = 0;
  }

  chooseUpgrade(id: string) {
    if (this.mode !== "reward") return;
    if (!["power", "wide", "multiball", "heal", "fire", "slow"].includes(id))
      return;
    if (id === "power") this.damage += 1;
    if (id === "wide")
      this.paddle.width = Math.min(188, this.paddle.width + 24);
    if (id === "multiball") this.multiball = true;
    if (id === "heal") this.lives = Math.min(6, this.lives + 1);
    if (id === "fire") {
      this.fire = true;
      this.damage += 1;
    }
    if (id === "slow") {
      this.slow = true;
      this.slowFactor = Math.max(0.6, this.slowFactor * 0.84);
    }
    this.wave += 1;
    this.setupWave();
    this.mode = "playing";
    this.launch();
  }

  finisher() {
    if (this.mode !== "playing" || this.charge < 100) return;
    this.charge = 0;
    this.events.push({ kind: "finisher", x: 210, y: 260 });
    for (const brick of this.bricks) {
      if (brick.hp <= 0) continue;
      this.hit(
        brick,
        brick.boss ? 12 + this.damage * 2 : 3 + this.damage,
        false,
      );
    }
    this.checkClear();
  }

  step(seconds: number) {
    if (this.mode !== "playing") return;
    this.accumulator += Math.max(0, Math.min(0.25, seconds));
    while (this.accumulator + 1e-10 >= FIXED_STEP && this.mode === "playing") {
      this.tick(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  private setupWave() {
    this.bricks = [];
    this.balls = [];
    this.respawnTime = 0;
    this.paddle.x = Math.max(
      ARENA.left + this.paddle.width / 2,
      Math.min(ARENA.right - this.paddle.width / 2, this.paddle.x),
    );
    if (this.wave === 6) {
      this.bricks.push({
        id: this.nextId++,
        x: 210,
        y: 122,
        width: 134,
        height: 76,
        hp: 40,
        maxHp: 40,
        type: 5,
        boss: true,
        flash: 0,
      });
      ["333333", "242242", "023320"].forEach((row, y) =>
        this.addRow(row, y, 209),
      );
    } else {
      const rows = WAVE_ROWS[this.wave - 1] ?? WAVE_ROWS[0];
      rows.forEach((row, y) => this.addRow(row, y, 112));
    }
    const count = this.multiball ? 3 : 1;
    for (let i = 0; i < count; i++) this.balls.push(this.newBall());
  }

  private addRow(row: string, rowIndex: number, startY: number) {
    [...row].forEach((value, col) => {
      const hp = Number(value);
      if (!hp) return;
      this.bricks.push({
        id: this.nextId++,
        x: 60 + col * 60,
        y: startY + rowIndex * 48,
        width: 54,
        height: 40,
        hp,
        maxHp: hp,
        type: (col + rowIndex * 2 + this.wave - 1) % 5,
        boss: false,
        flash: 0,
      });
    });
  }

  private newBall(): Ball {
    return {
      id: this.nextId++,
      x: this.paddle.x,
      y: this.paddle.y - 17,
      vx: 0,
      vy: 0,
      attached: true,
      lastHit: -1,
      hitAt: -1,
    };
  }

  private tick(dt: number) {
    this.time += dt;
    const oldPaddleX = this.paddle.x;
    if (this.pointerTarget !== undefined) {
      const distance = this.pointerTarget - this.paddle.x;
      this.paddle.x +=
        Math.sign(distance) * Math.min(Math.abs(distance), 1200 * dt);
    } else this.paddle.x += this.direction * 460 * dt;
    this.paddle.x = Math.max(
      ARENA.left + this.paddle.width / 2,
      Math.min(ARENA.right - this.paddle.width / 2, this.paddle.x),
    );
    this.paddle.velocity = (this.paddle.x - oldPaddleX) / dt;
    for (const brick of this.bricks)
      brick.flash = Math.max(0, brick.flash - dt);
    if (this.respawnTime > 0) {
      this.respawnTime -= dt;
      if (this.respawnTime <= 0) this.launch();
    }
    for (const ball of this.balls) {
      if (ball.attached) {
        ball.x = this.paddle.x;
        ball.y = this.paddle.y - 17;
        continue;
      }
      this.tickBall(ball, dt);
    }
    this.balls = this.balls.filter((ball) => ball.y < ARENA.height + 22);
    if (this.balls.length === 0) {
      this.lives -= 1;
      this.combo = 0;
      this.events.push({ kind: "life", x: this.paddle.x, y: this.paddle.y });
      if (this.lives <= 0) this.mode = "gameover";
      else {
        this.balls.push(this.newBall());
        this.respawnTime = 1.1;
      }
    }
    this.checkClear();
  }

  private tickBall(ball: Ball, dt: number) {
    const previousX = ball.x,
      previousY = ball.y,
      radius = ARENA.radius;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < ARENA.left + radius) {
      ball.x = ARENA.left + radius;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x > ARENA.right - radius) {
      ball.x = ARENA.right - radius;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < ARENA.top + radius) {
      ball.y = ARENA.top + radius;
      ball.vy = Math.abs(ball.vy);
    }

    const paddleTop = this.paddle.y - this.paddle.height / 2;
    if (
      ball.vy > 0 &&
      previousY + radius <= paddleTop + 5 &&
      ball.y + radius >= paddleTop &&
      Math.abs(ball.x - this.paddle.x) <= this.paddle.width / 2 + radius
    ) {
      const normalized = Math.max(
        -1,
        Math.min(1, (ball.x - this.paddle.x) / (this.paddle.width / 2)),
      );
      const angle =
        normalized * 1.08 +
        Math.max(-0.12, Math.min(0.12, this.paddle.velocity / 5000));
      const speed = Math.min(
        this.speed * 1.2,
        Math.hypot(ball.vx, ball.vy) + 3,
      );
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.max(speed * 0.4, Math.cos(angle) * speed);
      ball.y = paddleTop - radius;
      this.events.push({ kind: "paddle", x: ball.x, y: ball.y });
    }

    for (const brick of this.bricks) {
      if (
        brick.hp <= 0 ||
        (ball.lastHit === brick.id && this.time - ball.hitAt < 0.15)
      )
        continue;
      const dx = Math.abs(ball.x - brick.x),
        dy = Math.abs(ball.y - brick.y);
      if (dx > brick.width / 2 + radius || dy > brick.height / 2 + radius)
        continue;
      const nearestX = Math.max(
        brick.x - brick.width / 2,
        Math.min(ball.x, brick.x + brick.width / 2),
      );
      const nearestY = Math.max(
        brick.y - brick.height / 2,
        Math.min(ball.y, brick.y + brick.height / 2),
      );
      if ((ball.x - nearestX) ** 2 + (ball.y - nearestY) ** 2 > radius ** 2)
        continue;
      ball.lastHit = brick.id;
      ball.hitAt = this.time;
      this.hit(brick, this.damage);
      if (this.fire && !brick.boss) break;
      const left = brick.x - brick.width / 2,
        right = brick.x + brick.width / 2;
      const top = brick.y - brick.height / 2,
        bottom = brick.y + brick.height / 2;
      if (previousY - radius >= bottom) {
        ball.y = bottom + radius;
        ball.vy = Math.abs(ball.vy);
      } else if (previousY + radius <= top) {
        ball.y = top - radius;
        ball.vy = -Math.abs(ball.vy);
      } else if (previousX + radius <= left) {
        ball.x = left - radius;
        ball.vx = -Math.abs(ball.vx);
      } else if (previousX - radius >= right) {
        ball.x = right + radius;
        ball.vx = Math.abs(ball.vx);
      } else if (dx / (brick.width / 2) > dy / (brick.height / 2)) {
        ball.vx *= -1;
        ball.x =
          brick.x + Math.sign(ball.x - brick.x) * (brick.width / 2 + radius);
      } else {
        ball.vy *= -1;
        ball.y =
          brick.y + Math.sign(ball.y - brick.y) * (brick.height / 2 + radius);
      }
      break;
    }
    // Near-horizontal balls otherwise take too long to return to the paddle.
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed && Math.abs(ball.vy) < speed * 0.25) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * speed * 0.25;
      ball.vx =
        (ball.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - ball.vy * ball.vy);
    }
  }

  private hit(brick: Brick, damage: number, awardCharge = true) {
    brick.hp = Math.max(0, brick.hp - damage);
    brick.flash = 0.12;
    this.combo += 1;
    const multiplier = Math.min(5, 1 + Math.floor(this.combo / 8));
    const amount = (brick.hp <= 0 ? (brick.boss ? 1000 : 75) : 15) * multiplier;
    this.score += amount;
    if (awardCharge)
      this.charge = Math.min(100, this.charge + (brick.hp <= 0 ? 7 : 4));
    this.events.push({
      kind: brick.hp <= 0 ? "break" : "hit",
      x: brick.x,
      y: brick.y,
      amount,
      type: brick.type,
    });
  }

  private checkClear() {
    if (this.mode !== "playing" || this.bricks.some((brick) => brick.hp > 0))
      return;
    this.score += this.wave * 250;
    this.mode = this.wave === 6 ? "victory" : "reward";
    this.events.push({ kind: "clear", x: 210, y: 260 });
  }
}
