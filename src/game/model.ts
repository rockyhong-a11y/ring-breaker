import { getUpgrade, UPGRADE_DEFS } from "./upgrades";

/** Fixed-step rules; rendering and browser APIs never enter the simulation. */
export type ArenaMode =
  "ready" | "playing" | "paused" | "reward" | "gameover" | "victory";
export interface SkillLevel {
  id: string;
  level: number;
}
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
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNext: number;
  kills: number;
  elapsed: number;
  waveProgress: number;
  activeSkills: SkillLevel[];
  passiveSkills: SkillLevel[];
  choices: string[];
  activeCooldowns: Record<string, number>;
  intermission: number;
  rewardId: number;
}
/** `width` is kept for existing saves: it now improves fire rate and pickup reach. */
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
  kind: string;
  radius: number;
  damage: number;
  life: number;
  canPierce: number;
  bounces: number;
  age: number;
  split: boolean;
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
  elite: boolean;
  flash: number;
  slow: number;
  burn: number;
  poison: number;
  poisonStacks: number;
  burnDamage: number;
  poisonDamage: number;
  speed: number;
  attackIn: number;
}
export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
}
export interface Pickup {
  id: number;
  x: number;
  y: number;
  value: number;
  age: number;
}
export interface ArenaFx {
  id: number;
  kind: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  life: number;
  color: string;
}
export interface ArenaEvent {
  kind:
    | "hit"
    | "break"
    | "paddle"
    | "life"
    | "clear"
    | "finisher"
    | "launch"
    | "levelup"
    | "pickup"
    | "wave";
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
  playerY: 565,
  radius: 6,
};
const FIXED_STEP = 1 / 120;
const MAX_BALLS = 150;
const BASE_INTERVAL = 0.31;
const SKILL_INTERVALS: Record<string, number> = {
  fire: 1.55,
  ice: 1.9,
  poison: 1.8,
  lightning: 2.15,
  bomb: 2.5,
  split: 1.8,
  laser: 1.85,
  boomerang: 2.3,
};
const COLORS: Record<string, string> = {
  fire: "#ff7956",
  ice: "#7ed9ff",
  poison: "#b5e86c",
  lightning: "#ffe47c",
  bomb: "#ffb46b",
  split: "#d8a2ff",
  laser: "#ff7eb7",
  boomerang: "#82e7c9",
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class ArenaModel {
  mode: ArenaMode = "ready";
  wave = 1;
  hp = 100;
  maxHp = 100;
  score = 0;
  combo = 0;
  charge = 0;
  level = 1;
  xp = 0;
  xpNext = 18;
  kills = 0;
  time = 0;
  balls: Ball[] = [];
  bricks: Brick[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  fx: ArenaFx[] = [];
  player = { x: 210, y: ARENA.playerY };
  paddle = { x: 210, y: ARENA.paddleY, width: 42, height: 14, velocity: 0 };
  activeSkills: SkillLevel[] = [{ id: "fire", level: 1 }];
  passiveSkills: SkillLevel[] = [];
  activeCooldowns: Record<string, number> = {};
  choices: string[] = [];
  rewardId = 0;
  invulnerable = 0;
  intermission = 0;
  events: ArenaEvent[] = [];
  private nextId = 1;
  private direction = 0;
  private pointerTarget: number | undefined;
  private accumulator = 0;
  private waveTime = 0;
  private rowCount = 0;
  private rowsSpawned = 0;
  private nextRow = 0;
  private bossSpawned = false;
  private fireIn = 0;
  private seed: number;
  private readonly initialSeed: number;
  private meta: MetaStats = { power: 0, width: 0, health: 0 };

  constructor(seed = 0x51a7f00d) {
    this.initialSeed = seed >>> 0;
    this.seed = this.initialSeed;
    this.prepareWave();
    this.addRow(165);
    this.spawnBoss();
    const previewBoss = this.bricks[this.bricks.length - 1];
    previewBoss.x = 210;
    previewBoss.y = 290;
  }

  get enemies() {
    return this.bricks;
  }
  get lives() {
    return Math.ceil(this.hp / 20);
  }
  get damage() {
    return (4 + this.meta.power * 0.75) * (1 + this.skill("power") * 0.2);
  }
  get speed() {
    return 510;
  }
  get fire() {
    return this.skill("fire") > 0;
  }
  get slow() {
    return this.skill("ice") > 0;
  }
  get slowFactor() {
    return 1;
  }
  get multiball() {
    return this.skill("multishot") > 0;
  }
  get aimAngle() {
    const target = this.nearestEnemy(this.player.x, this.player.y);
    return target
      ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
      : -Math.PI / 2;
  }

  snapshot(): ArenaState {
    const boss = this.bricks.find(
      (enemy) => (enemy.boss || enemy.elite) && enemy.hp > 0,
    );
    return {
      mode: this.mode,
      wave: this.wave,
      lives: this.lives,
      score: this.score,
      combo: this.combo,
      remaining: this.bricks.filter((enemy) => enemy.hp > 0).length,
      bossHp: Math.ceil(boss?.hp ?? 0),
      bossMaxHp: boss?.maxHp ?? 0,
      charge: Math.floor(this.charge),
      hp: Math.ceil(this.hp),
      maxHp: this.maxHp,
      level: this.level,
      xp: this.xp,
      xpNext: this.xpNext,
      kills: this.kills,
      elapsed: this.time,
      waveProgress: clamp(
        (this.rowsSpawned / Math.max(1, this.rowCount)) * 0.78 +
          (this.bricks.length === 0 ? 0.22 : 0),
        0,
        1,
      ),
      activeSkills: this.activeSkills.map((skill) => ({ ...skill })),
      passiveSkills: this.passiveSkills.map((skill) => ({ ...skill })),
      choices: [...this.choices],
      activeCooldowns: { ...this.activeCooldowns },
      intermission: this.intermission,
      rewardId: this.rewardId,
    };
  }

  start(
    meta: MetaStats = { power: 0, width: 0, health: 0 },
    runSeed = this.initialSeed,
  ) {
    this.seed = runSeed >>> 0;
    this.nextId = 1;
    this.meta = {
      power: clamp(Math.floor(meta.power || 0), 0, 20),
      width: clamp(Math.floor(meta.width || 0), 0, 20),
      health: clamp(Math.floor(meta.health || 0), 0, 20),
    };
    this.wave = 1;
    this.maxHp = 100 + this.meta.health * 20;
    this.hp = this.maxHp;
    this.score = 0;
    this.combo = 0;
    this.charge = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = 18;
    this.kills = 0;
    this.time = 0;
    this.accumulator = 0;
    this.fireIn = 0;
    this.invulnerable = 0;
    this.intermission = 0;
    this.player.x = 210;
    this.paddle.x = 210;
    this.paddle.velocity = 0;
    this.pointerTarget = undefined;
    this.direction = 0;
    this.choices = [];
    this.rewardId = 0;
    this.activeSkills = [{ id: "fire", level: 1 }];
    this.passiveSkills = [];
    this.activeCooldowns = { fire: 0.8 };
    this.balls = [];
    this.bricks = [];
    this.pickups = [];
    this.projectiles = [];
    this.fx = [];
    this.events = [];
    this.mode = "playing";
    this.prepareWave();
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
    if (!Number.isFinite(x)) return;
    this.pointerTarget = x;
    this.direction = 0;
  }
  /** Kept for controls from older saves. All ball weapons now fire automatically. */
  launch() {
    /* Automatic fire deliberately has no tap requirement. */
  }

  chooseUpgrade(id: string) {
    if (this.mode !== "reward" || !this.choices.includes(id)) return;
    this.grantUpgrade(id);
    this.choices = [];
    this.mode = "playing";
    this.checkLevelUp();
  }
  finisher() {
    if (this.mode !== "playing" || this.charge < 100) return;
    this.charge = 0;
    this.emit({ kind: "finisher", x: this.player.x, y: 280 });
    this.addFx("explosion", 210, 280, "#ffe47c", 220, 0.65);
    for (const enemy of [...this.bricks])
      if (enemy.hp > 0)
        this.hit(enemy, this.damage * (enemy.boss || enemy.elite ? 12 : 7));
    this.projectiles = [];
    this.invulnerable = Math.max(this.invulnerable, 0.8);
  }
  step(seconds: number) {
    if (this.mode !== "playing" || !Number.isFinite(seconds)) return;
    this.accumulator += clamp(seconds, 0, 0.25);
    while (this.accumulator + 1e-10 >= FIXED_STEP && this.mode === "playing") {
      this.accumulator -= FIXED_STEP;
      this.tick(FIXED_STEP);
    }
  }
  drainEvents() {
    const result = this.events;
    this.events = [];
    return result;
  }

  /** Debug entry points are exposed by the browser controller only with ?debug=1. */
  debugClearWave() {
    for (const enemy of [...this.bricks])
      if (enemy.hp > 0) this.hit(enemy, enemy.hp);
    this.bricks = [];
    this.rowsSpawned = this.rowCount;
    this.bossSpawned = true;
    this.choices = [];
    this.mode = "playing";
    this.intermission = 0;
    this.checkClear();
    if (this.mode === "playing") this.intermission = 0.02;
  }
  debugGainXp(amount: number) {
    this.gainXp(Math.max(0, amount));
  }
  debugDamage(amount: number) {
    this.takeDamage(Math.max(0, amount));
  }
  debugSetWave(wave: number) {
    this.wave = clamp(Math.floor(wave), 1, 6);
    this.mode = "playing";
    this.intermission = 0;
    this.bricks = [];
    this.balls = [];
    this.projectiles = [];
    this.pickups = [];
    this.prepareWave();
    if ([3, 5, 6].includes(this.wave)) {
      this.spawnBoss();
      this.bossSpawned = true;
    }
  }
  debugGrantUpgrade(id: string) {
    this.grantUpgrade(id);
  }

  private skill(id: string) {
    return (
      [...this.activeSkills, ...this.passiveSkills].find(
        (entry) => entry.id === id,
      )?.level ?? 0
    );
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private emit(event: ArenaEvent) {
    if (this.events.length < 128) this.events.push(event);
  }
  private addFx(
    kind: string,
    x: number,
    y: number,
    color: string,
    radius = 30,
    life = 0.28,
    x2?: number,
    y2?: number,
  ) {
    if (this.fx.length >= 60) this.fx.shift();
    this.fx.push({
      id: this.nextId++,
      kind,
      x,
      y,
      x2,
      y2,
      radius,
      life,
      color,
    });
  }
  private prepareWave() {
    this.waveTime = 0;
    this.rowsSpawned = 0;
    this.nextRow = 3.5;
    this.bossSpawned = false;
    this.rowCount = 5 + Math.ceil(this.wave / 2);
    this.addRow(110);
    this.emit({ kind: "wave", x: 210, y: 180, amount: this.wave });
  }
  private addRow(y = 65) {
    if (this.rowsSpawned >= this.rowCount) return;
    const row = this.rowsSpawned++;
    const gap = (row + this.wave) % 6;
    for (let col = 0; col < 6; col++) {
      if (col === gap) continue;
      const hp = 7 + this.wave * 3 + (row % 3 === 0 ? 2 : 0);
      this.bricks.push({
        id: this.nextId++,
        x: 59 + col * 60,
        y,
        width: 44,
        height: 44,
        hp,
        maxHp: hp,
        type: (col + row + this.wave - 1) % 6,
        boss: false,
        elite: false,
        flash: 0,
        slow: 0,
        burn: 0,
        poison: 0,
        poisonStacks: 0,
        burnDamage: 0,
        poisonDamage: 0,
        speed: 12 + this.wave * 1.35,
        attackIn: 0,
      });
    }
  }
  private spawnBoss() {
    const champion = this.wave === 6;
    const hp = champion ? 1100 : this.wave === 5 ? 400 : 230;
    this.bricks.push({
      id: this.nextId++,
      x: 210,
      y: 105,
      width: champion ? 92 : 76,
      height: champion ? 116 : 94,
      hp,
      maxHp: hp,
      type: champion ? 5 : this.wave === 5 ? 4 : 2,
      boss: champion,
      elite: !champion,
      flash: 0,
      slow: 0,
      burn: 0,
      poison: 0,
      poisonStacks: 0,
      burnDamage: 0,
      poisonDamage: 0,
      speed: champion ? 3.3 : 4.3,
      attackIn: 2.5,
    });
  }
  private nearestEnemy(x: number, y: number, exclude?: number) {
    let chosen: Brick | undefined;
    let nearest = Infinity;
    for (const enemy of this.bricks) {
      if (enemy.hp <= 0 || enemy.id === exclude) continue;
      const distance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (distance < nearest) {
        nearest = distance;
        chosen = enemy;
      }
    }
    return chosen;
  }
  private grantUpgrade(id: string) {
    const definition = getUpgrade(id);
    if (!definition) return;
    if (id === "heal") {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.35);
      return;
    }
    const list =
      definition.kind === "active" ? this.activeSkills : this.passiveSkills;
    const owned = list.find((entry) => entry.id === id);
    if (owned) owned.level = Math.min(definition.maxLevel, owned.level + 1);
    else if (list.length < (definition.kind === "active" ? 4 : 6))
      list.push({ id, level: 1 });
    else return;
    if (definition.kind === "active")
      this.activeCooldowns[id] = Math.min(
        this.activeCooldowns[id] ?? 0.15,
        0.15,
      );
    if (id === "armor") this.hp = Math.min(this.maxHp, this.hp + 5);
  }
  private gainXp(value: number) {
    this.xp += value * (1 + this.skill("magnet") * 0.1);
    this.checkLevelUp();
  }
  private checkLevelUp() {
    if (this.mode !== "playing" || this.xp < this.xpNext) return;
    this.xp -= this.xpNext;
    this.level++;
    this.xpNext = 18 + (this.level - 1) * 9;
    const eligible = UPGRADE_DEFS.filter((definition) => {
      if (definition.id === "heal") return this.hp < this.maxHp * 0.8;
      const owned = this.skill(definition.id);
      const slots =
        definition.kind === "active" ? this.activeSkills : this.passiveSkills;
      return (
        owned < definition.maxLevel &&
        (owned > 0 || slots.length < (definition.kind === "active" ? 4 : 6))
      );
    });
    // Offer both categories whenever available, then one extra. Picks never exceed slot or level caps.
    this.choices = [];
    const pick = (kind?: "active" | "passive") => {
      const pool = eligible.filter(
        (definition) =>
          !this.choices.includes(definition.id) &&
          (!kind || definition.kind === kind),
      );
      if (pool.length)
        this.choices.push(pool[Math.floor(this.random() * pool.length)].id);
    };
    pick("active");
    pick("passive");
    pick();
    if (!this.choices.length) this.choices = ["heal"];
    this.rewardId++;
    this.mode = "reward";
    this.emit({
      kind: "levelup",
      x: this.player.x,
      y: this.player.y,
      amount: this.level,
    });
  }
  private tick(dt: number) {
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const oldX = this.player.x;
    if (this.pointerTarget !== undefined)
      this.player.x += clamp(
        this.pointerTarget - this.player.x,
        -760 * dt,
        760 * dt,
      );
    else this.player.x += this.direction * 330 * dt;
    this.player.x = clamp(this.player.x, ARENA.left + 20, ARENA.right - 20);
    this.paddle.x = this.player.x;
    this.paddle.velocity = (this.player.x - oldX) / dt;
    for (const effect of this.fx) effect.life -= dt;
    this.fx = this.fx.filter((effect) => effect.life > 0);
    this.tickPickups(dt);
    if (this.mode !== "playing") return;
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.wave++;
        this.bricks = [];
        this.balls = [];
        this.projectiles = [];
        this.prepareWave();
      }
      return;
    }
    this.waveTime += dt;
    if (this.waveTime >= this.nextRow && this.rowsSpawned < this.rowCount) {
      this.addRow();
      this.nextRow += 3.5;
    }
    if (
      [3, 5, 6].includes(this.wave) &&
      !this.bossSpawned &&
      this.waveTime >= 7
    ) {
      this.spawnBoss();
      this.bossSpawned = true;
    }
    this.tickEnemies(dt);
    if (this.mode !== "playing") return;
    const fireRate = 1 + this.skill("haste") * 0.15 + this.meta.width * 0.035;
    this.fireIn = Math.max(0, this.fireIn - dt);
    if (this.fireIn <= 0 && this.bricks.some((enemy) => enemy.hp > 0)) {
      const count = 1 + this.skill("multishot");
      for (let i = 0; i < count; i++)
        this.shoot("basic", (i - (count - 1) / 2) * 0.13);
      this.fireIn = BASE_INTERVAL / fireRate;
    }
    for (const skill of this.activeSkills) {
      this.activeCooldowns[skill.id] = Math.max(
        0,
        (this.activeCooldowns[skill.id] ?? 0) - dt,
      );
      if (
        this.activeCooldowns[skill.id] <= 0 &&
        this.bricks.some((enemy) => enemy.hp > 0)
      ) {
        this.shoot(skill.id);
        this.activeCooldowns[skill.id] =
          SKILL_INTERVALS[skill.id] /
          (fireRate * (1 + (skill.level - 1) * 0.12));
      }
    }
    for (const ball of [...this.balls]) this.tickBall(ball, dt);
    this.balls = this.balls.filter(
      (ball) =>
        ball.life > 0 && ball.y < ARENA.height + 24 && ball.y > ARENA.top - 80,
    );
    this.tickProjectiles(dt);
    this.bricks = this.bricks.filter((enemy) => enemy.hp > 0);
    this.checkClear();
  }
  private tickEnemies(dt: number) {
    for (const enemy of this.bricks) {
      if (enemy.hp <= 0) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.burn > 0) {
        enemy.burn -= dt;
        this.hit(enemy, enemy.burnDamage * dt, false, false);
      }
      if (enemy.poison > 0) {
        enemy.poison -= dt;
        this.hit(
          enemy,
          enemy.poisonDamage * enemy.poisonStacks * dt,
          false,
          false,
        );
      } else enemy.poisonStacks = 0;
      if (enemy.hp <= 0) continue;
      enemy.y += enemy.speed * (enemy.slow > 0 ? 0.34 : 1) * dt;
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (enemy.boss || enemy.elite) {
        enemy.x = 210 + Math.sin(this.waveTime * 0.6) * (enemy.boss ? 115 : 90);
        enemy.attackIn -= dt;
        if (enemy.attackIn <= 0) {
          this.enemyShoot(enemy);
          enemy.attackIn = enemy.boss
            ? enemy.hp < enemy.maxHp * 0.5
              ? 1.5
              : 2
            : 3.4;
        }
      }
      const bottom = enemy.y + enemy.height / 2;
      if (
        bottom > this.player.y - 20 &&
        Math.abs(enemy.x - this.player.x) < enemy.width / 2 + 16
      ) {
        this.takeDamage(enemy.boss || enemy.elite ? 28 : 18);
        if (!enemy.boss && !enemy.elite) enemy.hp = 0;
        else enemy.y -= 40;
      } else if (enemy.y - enemy.height / 2 > ARENA.height - 12) {
        enemy.hp = 0;
        this.takeDamage(9);
        this.combo = 0;
      }
    }
  }
  private shoot(kind: string, offset = 0) {
    if (this.balls.length >= MAX_BALLS) return;
    const level = this.skill(kind) || 1;
    const angle = this.aimAngle + offset;
    const speed =
      kind === "laser"
        ? 820
        : kind === "bomb"
          ? 420
          : kind === "boomerang"
            ? 410
            : this.speed;
    this.balls.push({
      id: this.nextId++,
      x: this.player.x,
      y: this.player.y - 24,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      attached: false,
      lastHit: -1,
      hitAt: -1,
      kind,
      radius:
        kind === "bomb"
          ? 10
          : kind === "boomerang"
            ? 8 + level
            : kind === "laser"
              ? 4
              : 6,
      damage: this.damage * (kind === "basic" ? 1 : 1.15 + level * 0.22),
      life: 4.6 + this.skill("ricochet"),
      canPierce:
        kind === "laser" ? 2 + level : kind === "boomerang" ? 3 + level : 0,
      bounces: 0,
      age: 0,
      split: false,
    });
    // Only one launch sound per volley keeps automatic fire pleasant.
    if (kind !== "basic")
      this.emit({ kind: "launch", x: this.player.x, y: this.player.y - 24 });
  }
  private tickBall(ball: Ball, dt: number) {
    if (ball.life <= 0) return;
    ball.life -= dt;
    ball.age += dt;
    const previousX = ball.x,
      previousY = ball.y,
      radius = ball.radius;
    if (ball.kind === "boomerang" && ball.age > 0.85) {
      const angle = Math.atan2(this.player.y - ball.y, this.player.x - ball.x);
      ball.vx += Math.cos(angle) * 720 * dt;
      ball.vy += Math.sin(angle) * 720 * dt;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 530) {
        ball.vx *= 530 / speed;
        ball.vy *= 530 / speed;
      }
      if (
        ball.age > 1.1 &&
        Math.hypot(ball.x - this.player.x, ball.y - this.player.y) < 22
      ) {
        ball.life = 0;
        return;
      }
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    let bounced = false;
    if (ball.x < ARENA.left + radius) {
      ball.x = ARENA.left + radius;
      ball.vx = Math.abs(ball.vx);
      bounced = true;
    }
    if (ball.x > ARENA.right - radius) {
      ball.x = ARENA.right - radius;
      ball.vx = -Math.abs(ball.vx);
      bounced = true;
    }
    if (ball.y < ARENA.top + radius) {
      ball.y = ARENA.top + radius;
      ball.vy = Math.abs(ball.vy);
      bounced = true;
    }
    if (bounced) {
      if (ball.bounces < 3) ball.damage *= 1 + this.skill("ricochet") * 0.08;
      ball.bounces++;
    }
    for (const enemy of this.bricks) {
      if (
        enemy.hp <= 0 ||
        (ball.lastHit === enemy.id && this.time - ball.hitAt < 0.18)
      )
        continue;
      const nearestX = clamp(
        ball.x,
        enemy.x - enemy.width / 2,
        enemy.x + enemy.width / 2,
      );
      const nearestY = clamp(
        ball.y,
        enemy.y - enemy.height / 2,
        enemy.y + enemy.height / 2,
      );
      if ((ball.x - nearestX) ** 2 + (ball.y - nearestY) ** 2 > radius ** 2)
        continue;
      ball.lastHit = enemy.id;
      ball.hitAt = this.time;
      const critical = this.random() < this.skill("critical") * 0.08;
      this.hit(enemy, ball.damage * (critical ? 2 : 1));
      if (critical)
        this.addFx("critical", enemy.x, enemy.y, "#fff1a0", 28, 0.3);
      this.ballEffect(ball, enemy);
      if (ball.kind === "bomb") {
        ball.life = 0;
        break;
      }
      if (ball.canPierce > 0) {
        ball.canPierce--;
        continue;
      }
      const left = enemy.x - enemy.width / 2,
        right = enemy.x + enemy.width / 2;
      const top = enemy.y - enemy.height / 2,
        bottom = enemy.y + enemy.height / 2;
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
      } else if (
        Math.abs(ball.x - enemy.x) / enemy.width >
        Math.abs(ball.y - enemy.y) / enemy.height
      ) {
        ball.x =
          enemy.x + (ball.x < enemy.x ? -1 : 1) * (enemy.width / 2 + radius);
        ball.vx *= -1;
      } else {
        ball.y =
          enemy.y + (ball.y < enemy.y ? -1 : 1) * (enemy.height / 2 + radius);
        ball.vy *= -1;
      }
      break;
    }
  }
  private ballEffect(ball: Ball, enemy: Brick) {
    const level = this.skill(ball.kind) || 1;
    if (ball.kind === "fire") {
      enemy.burn = 2.2 + level * 0.45;
      enemy.burnDamage = this.damage * (0.45 + level * 0.12);
    }
    if (ball.kind === "ice") enemy.slow = 1.8 + level * 0.6;
    if (ball.kind === "poison") {
      enemy.poison = 3.5 + level * 0.5;
      enemy.poisonStacks = Math.min(5, enemy.poisonStacks + 1);
      enemy.poisonDamage = this.damage * (0.3 + level * 0.08);
    }
    if (ball.kind === "lightning") {
      const linked = this.bricks
        .filter(
          (target) =>
            target.hp > 0 &&
            target.id !== enemy.id &&
            Math.hypot(target.x - enemy.x, target.y - enemy.y) < 155,
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - enemy.x, a.y - enemy.y) -
            Math.hypot(b.x - enemy.x, b.y - enemy.y),
        )
        .slice(0, 1 + level);
      let from = enemy;
      for (const target of linked) {
        this.hit(target, ball.damage * 0.66);
        this.addFx(
          "lightning",
          from.x,
          from.y,
          COLORS.lightning,
          0,
          0.2,
          target.x,
          target.y,
        );
        from = target;
      }
    }
    if (ball.kind === "bomb") {
      const radius = 55 + level * 12;
      this.addFx("explosion", enemy.x, enemy.y, COLORS.bomb, radius, 0.36);
      for (const target of this.bricks)
        if (
          target.hp > 0 &&
          target.id !== enemy.id &&
          Math.hypot(target.x - enemy.x, target.y - enemy.y) <
            radius + target.width / 2
        )
          this.hit(target, ball.damage * 0.85);
    }
    if (ball.kind === "split" && !ball.split) {
      ball.split = true;
      for (const angleOffset of [-0.72, 0.72]) {
        if (this.balls.length >= MAX_BALLS) break;
        const angle = Math.atan2(ball.vy, ball.vx) + angleOffset;
        this.balls.push({
          ...ball,
          id: this.nextId++,
          x: enemy.x,
          y: enemy.y,
          kind: "fragment",
          radius: 4,
          vx: Math.cos(angle) * 470,
          vy: Math.sin(angle) * 470,
          damage: ball.damage * (0.45 + level * 0.08),
          life: 2.4,
          age: 0,
          split: true,
        });
      }
      this.addFx("split", enemy.x, enemy.y, COLORS.split, 32, 0.2);
    }
  }
  private hit(
    enemy: Brick,
    damage: number,
    awardCharge = true,
    showHit = true,
  ) {
    if (enemy.hp <= 0 || damage <= 0) return;
    enemy.hp = Math.max(0, enemy.hp - damage);
    if (showHit) enemy.flash = 0.09;
    if (showHit) {
      this.combo++;
      this.score += Math.ceil(damage * 2);
      if (awardCharge) this.charge = Math.min(100, this.charge + 0.7);
      this.emit({
        kind: enemy.hp <= 0 ? "break" : "hit",
        x: enemy.x,
        y: enemy.y,
        amount: Math.ceil(damage),
        type: enemy.type,
      });
    }
    if (enemy.hp <= 0) {
      this.kills++;
      this.score += enemy.boss ? 3000 : enemy.elite ? 1200 : 80;
      this.charge = Math.min(
        100,
        this.charge + (enemy.boss || enemy.elite ? 20 : 2),
      );
      const value = enemy.boss ? 140 : enemy.elite ? 70 : 6 + this.wave;
      if (this.pickups.length >= 100) this.pickups[0].value += value;
      else
        this.pickups.push({
          id: this.nextId++,
          x: enemy.x,
          y: enemy.y,
          value,
          age: 0,
        });
      if (!showHit)
        this.emit({
          kind: "break",
          x: enemy.x,
          y: enemy.y,
          amount: 0,
          type: enemy.type,
        });
      const vampire = this.skill("vampire");
      if (vampire > 0 && this.kills % 7 === 0)
        this.hp = Math.min(this.maxHp, this.hp + 2 * vampire);
    }
  }
  private enemyShoot(enemy: Brick) {
    const baseAngle = Math.atan2(
      this.player.y - enemy.y,
      this.player.x - enemy.x,
    );
    const spread = enemy.boss
      ? enemy.hp < enemy.maxHp * 0.5
        ? [-0.36, -0.18, 0, 0.18, 0.36]
        : [-0.25, 0, 0.25]
      : [0];
    for (const offset of spread) {
      if (this.projectiles.length >= 70) break;
      const speed = enemy.boss ? 145 : 125;
      this.projectiles.push({
        id: this.nextId++,
        x: enemy.x,
        y: enemy.y + enemy.height / 2,
        vx: Math.cos(baseAngle + offset) * speed,
        vy: Math.sin(baseAngle + offset) * speed,
        radius: enemy.boss ? 8 : 7,
        damage: enemy.boss ? 22 : 12,
        life: 7,
      });
    }
  }
  private tickProjectiles(dt: number) {
    for (const bullet of this.projectiles) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (
        Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y) <
        17 + bullet.radius
      ) {
        bullet.life = 0;
        this.takeDamage(bullet.damage);
      }
    }
    this.projectiles = this.projectiles.filter(
      (bullet) =>
        bullet.life > 0 &&
        bullet.y < ARENA.height + 20 &&
        bullet.x > 0 &&
        bullet.x < ARENA.width,
    );
  }
  private takeDamage(value: number) {
    if (this.mode !== "playing" || this.invulnerable > 0 || value <= 0) return;
    const damage = Math.max(1, value * (1 - this.skill("armor") * 0.12));
    this.hp = Math.max(0, this.hp - damage);
    this.invulnerable = 0.8;
    this.combo = 0;
    this.emit({
      kind: "life",
      x: this.player.x,
      y: this.player.y,
      amount: Math.ceil(damage),
    });
    this.addFx("damage", this.player.x, this.player.y, "#ff668a", 42, 0.35);
    if (this.hp <= 0) {
      this.mode = "gameover";
      this.choices = [];
    }
  }
  private tickPickups(dt: number) {
    const radius = 76 + this.meta.width * 8 + this.skill("magnet") * 32;
    const claimed: number[] = [];
    for (const pickup of this.pickups) {
      pickup.age += dt;
      const dx = this.player.x - pickup.x,
        dy = this.player.y - pickup.y;
      const distance = Math.hypot(dx, dy);
      if (
        pickup.age > 2.5 / (1 + this.skill("magnet") * 0.12) ||
        distance < radius
      ) {
        const movement = Math.min(
          distance,
          (340 + pickup.age * 110 + this.skill("magnet") * 65) * dt,
        );
        if (distance > 0) {
          pickup.x += (dx / distance) * movement;
          pickup.y += (dy / distance) * movement;
        }
      } else pickup.y += 20 * dt;
      if (distance < 22) claimed.push(pickup.id);
    }
    // Claim all collided gems before pausing for a reward, preserving overflow XP.
    let value = 0;
    this.pickups = this.pickups.filter((pickup) => {
      if (!claimed.includes(pickup.id)) return true;
      value += pickup.value;
      return false;
    });
    if (value) {
      this.emit({
        kind: "pickup",
        x: this.player.x,
        y: this.player.y,
        amount: value,
      });
      this.gainXp(value);
    }
  }
  private checkClear() {
    if (
      this.mode !== "playing" ||
      this.bricks.some((enemy) => enemy.hp > 0) ||
      this.rowsSpawned < this.rowCount ||
      ([3, 5, 6].includes(this.wave) && !this.bossSpawned)
    )
      return;
    this.score += this.wave * 300;
    this.projectiles = [];
    this.balls = [];
    this.emit({ kind: "clear", x: 210, y: 260, amount: this.wave });
    if (this.wave === 6) {
      this.mode = "victory";
      this.choices = [];
    } else {
      this.intermission = 1.6;
      this.hp = Math.min(this.maxHp, this.hp + 8);
    }
  }
}
