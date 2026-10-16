import { describe, expect, it } from "vitest";
import { ARENA, ArenaModel, type Ball } from "./model";
import { getUpgrade, UPGRADE_DEFS } from "./upgrades";

function advance(model: ArenaModel, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 120); i++) model.step(1 / 120);
}
function readyBall(model: ArenaModel, kind = "basic"): Ball {
  advance(model, 1 / 120);
  const ball = model.balls[0];
  expect(ball).toBeDefined();
  ball.kind = kind;
  return ball;
}
function collide(model: ArenaModel, kind: string) {
  const ball = readyBall(model, kind);
  const target = model.bricks[0];
  target.x = 150;
  target.y = 240;
  target.hp = 1000;
  target.maxHp = 1000;
  ball.x = target.x;
  ball.y = target.y + target.height / 2 + ball.radius + 1;
  ball.vx = 0;
  ball.vy = -510;
  ball.damage = 10;
  advance(model, 1 / 120);
  return { ball, target };
}

describe("Ring Breaker: survivor pit simulation", () => {
  it("starts a fresh run with SD-player positioning, automatic fire, and migrated permanent training", () => {
    const model = new ArenaModel();
    expect(model.mode).toBe("ready");
    expect(model.bricks.length).toBeGreaterThan(0);
    const preview = JSON.stringify(model.snapshot());
    advance(model, 2);
    expect(JSON.stringify(model.snapshot())).toBe(preview);
    model.start({ power: 2, width: 2, health: 2 });
    expect(model.hp).toBe(140);
    expect(model.maxHp).toBe(140);
    expect(model.damage).toBe(5.5);
    expect(model.player.y).toBe(ARENA.playerY);
    expect(model.difficulty).toBe(2);
    expect(model.snapshot().difficulty).toBe(2);
    expect(model.activeSkills).toEqual([{ id: "fire", level: 1 }]);
    advance(model, 0.4);
    expect(model.balls.length).toBeGreaterThan(1);
    expect(model.balls.every((ball) => !ball.attached)).toBe(true);
  });

  it("aims at nearby opponents, deals real collision damage, and ricochets down", () => {
    const model = new ArenaModel();
    model.start();
    const { ball, target } = collide(model, "basic");
    expect(target.hp).toBe(990);
    expect(ball.vy).toBeGreaterThan(0);
    expect(model.score).toBeGreaterThan(0);
    expect(model.charge).toBeGreaterThan(0);
    expect(model.drainEvents().some((event) => event.kind === "hit")).toBe(
      true,
    );
  });

  it("descends enemy ranks and spawns later rows on a fixed schedule", () => {
    const model = new ArenaModel();
    model.start();
    const first = model.bricks[0],
      y = first.y,
      count = model.bricks.length;
    model.point(45);
    advance(model, 0.5);
    expect(first.y).toBeGreaterThan(y + 6);
    // Keep existing enemies alive to measure scheduled population independently of kills.
    for (const enemy of model.bricks) enemy.hp = 10000;
    advance(model, 4.2);
    expect(model.bricks.length).toBeGreaterThan(count);
    expect(model.snapshot().waveProgress).toBeGreaterThan(0.2);
  });

  it("moves horizontally within the ring and preserves direction while paused", () => {
    const model = new ArenaModel();
    model.start();
    model.point(-1000);
    advance(model, 0.5);
    expect(model.player.x).toBe(ARENA.left + 20);
    model.point(1000);
    advance(model, 1);
    expect(model.player.x).toBe(ARENA.right - 20);
    model.move(-1);
    advance(model, 0.1);
    expect(model.player.x).toBeLessThan(ARENA.right - 20);
    model.pause();
    const before = JSON.stringify({
      balls: model.balls,
      enemies: model.bricks,
      time: model.time,
      x: model.player.x,
    });
    advance(model, 2);
    expect(
      JSON.stringify({
        balls: model.balls,
        enemies: model.bricks,
        time: model.time,
        x: model.player.x,
      }),
    ).toBe(before);
    model.resume();
    advance(model, 0.1);
    expect(model.mode).toBe("playing");
  });

  it("bounces at all four walls, expires balls, and never loses HP for a missed shot", () => {
    const model = new ArenaModel();
    model.start();
    const ball = readyBall(model);
    ball.x = ARENA.right - ball.radius - 1;
    ball.y = 400;
    ball.vx = 500;
    ball.vy = -130;
    advance(model, 0.02);
    expect(ball.vx).toBeLessThan(0);
    ball.x = 210;
    ball.y = ARENA.top + ball.radius + 1;
    ball.vx = 0;
    ball.vy = -500;
    advance(model, 0.02);
    expect(ball.vy).toBeGreaterThan(0);
    ball.y = ARENA.height - 15 - ball.radius - 1;
    ball.vy = 500;
    advance(model, 0.01);
    expect(ball.vy).toBeLessThan(0);
    expect(model.balls.includes(ball)).toBe(true);
    expect(model.hp).toBe(100);
    advance(model, 0.3);
    const expiry = model.balls[0];
    expiry.life = 0.001;
    advance(model, 0.01);
    expect(model.balls.includes(expiry)).toBe(false);
  });

  it("has identical fixed-step physics at 60 and 120 Hz and restarts deterministically", () => {
    const sixty = new ArenaModel(42),
      oneTwenty = new ArenaModel(42);
    sixty.start();
    oneTwenty.start();
    for (let i = 0; i < 120; i++) sixty.step(1 / 60);
    advance(oneTwenty, 2);
    expect(sixty.balls).toEqual(oneTwenty.balls);
    expect(sixty.bricks).toEqual(oneTwenty.bricks);
    const original = JSON.stringify(sixty.balls);
    sixty.start();
    advance(sixty, 2);
    expect(JSON.stringify(sixty.balls)).toBe(original);
  });

  it("collects dropped XP, pauses mid-wave for three diverse valid upgrades, and preserves wave progress", () => {
    const model = new ArenaModel(9);
    model.start();
    model.pickups.push({
      id: 9000,
      x: model.player.x,
      y: model.player.y,
      value: model.xpNext,
      age: 0,
    });
    const wave = model.wave,
      enemyY = model.bricks[0].y;
    advance(model, 1 / 120);
    expect(model.mode).toBe("reward");
    expect(model.level).toBe(2);
    expect(model.wave).toBe(wave);
    expect(model.choices).toHaveLength(3);
    expect(new Set(model.choices).size).toBe(3);
    expect(model.choices.map((id) => getUpgrade(id)?.kind)).toContain("active");
    expect(model.choices.map((id) => getUpgrade(id)?.kind)).toContain(
      "passive",
    );
    advance(model, 3);
    expect(model.bricks[0].y).toBe(enemyY);
    model.chooseUpgrade("not-offered");
    expect(model.mode).toBe("reward");
    const choice = model.choices[0];
    model.chooseUpgrade(choice);
    expect(model.mode).toBe("playing");
    expect(model.wave).toBe(wave);
    expect(
      [...model.activeSkills, ...model.passiveSkills].some(
        (skill) => skill.id === choice,
      ),
    ).toBe(true);
  });

  it("retains overflow XP and issues distinct reward tokens for consecutive level-ups", () => {
    const model = new ArenaModel();
    model.start();
    model.debugGainXp(100);
    const first = model.snapshot().rewardId;
    model.chooseUpgrade(model.choices[0]);
    expect(model.mode).toBe("reward");
    expect(model.level).toBe(3);
    expect(model.rewardId).toBe(first + 1);
  });

  it("automatically retrieves distant gems after a short delay", () => {
    const model = new ArenaModel();
    model.start();
    model.pickups.push({ id: 9999, x: 70, y: 110, value: 7, age: 0 });
    advance(model, 1);
    expect(model.pickups.some((pickup) => pickup.id === 9999)).toBe(true);
    advance(model, 2.5);
    expect(model.pickups.some((pickup) => pickup.id === 9999)).toBe(false);
    expect(model.xp).toBeGreaterThanOrEqual(7);
  });

  it("applies burn, slow, and stacking poison as distinct effects", () => {
    for (const kind of ["fire", "ice", "poison"]) {
      const model = new ArenaModel();
      model.start();
      model.debugGrantUpgrade(kind);
      const { target } = collide(model, kind);
      if (kind === "fire") {
        expect(target.burn).toBeGreaterThan(0);
        const hp = target.hp;
        advance(model, 0.1);
        expect(target.hp).toBeLessThan(hp);
      }
      if (kind === "ice") {
        expect(target.slow).toBeGreaterThan(0);
        const y = target.y;
        advance(model, 0.1);
        expect(target.y - y).toBeLessThan(target.speed * 0.1 * 0.4);
      }
      if (kind === "poison") {
        expect(target.poisonStacks).toBe(1);
        const hp = target.hp;
        advance(model, 0.1);
        expect(target.hp).toBeLessThan(hp);
      }
    }
  });

  it("chains lightning, explodes bombs, splits balls, and allows lasers to pierce", () => {
    for (const kind of ["lightning", "bomb", "split", "laser"]) {
      const model = new ArenaModel();
      model.start();
      model.debugGrantUpgrade(kind);
      const neighbor = model.bricks[1];
      neighbor.x = 205;
      neighbor.y = 240;
      neighbor.hp = 1000;
      const { ball } = collide(model, kind);
      if (kind === "lightning" || kind === "bomb")
        expect(neighbor.hp).toBeLessThan(1000);
      if (kind === "split")
        expect(
          model.balls.filter((shot) => shot.kind === "fragment"),
        ).toHaveLength(2);
      if (kind === "laser") {
        // Test-created laser receives the same pierce budget as an automatically spawned one.
        const fresh = new ArenaModel();
        fresh.start();
        fresh.debugGrantUpgrade("laser");
        advance(fresh, 0.2);
        const laser = fresh.balls.find((shot) => shot.kind === "laser")!;
        const [lower, upper] = fresh.bricks;
        lower.x = 150;
        lower.y = 240;
        lower.hp = 1000;
        upper.x = 150;
        upper.y = 180;
        upper.hp = 1000;
        laser.x = 150;
        laser.y = 270;
        laser.vx = 0;
        laser.vy = -820;
        advance(fresh, 0.12);
        expect(lower.hp).toBeLessThan(1000);
        expect(upper.hp).toBeLessThan(1000);
        expect(laser.vy).toBeLessThan(0);
      }
      if (kind === "bomb") expect(ball.life).toBe(0);
    }
  });

  it("returns boomerangs toward the player instead of flying indefinitely", () => {
    const model = new ArenaModel();
    model.start();
    const ball = readyBall(model, "boomerang");
    ball.x = 210;
    ball.y = 350;
    ball.vx = 0;
    ball.vy = -200;
    ball.age = 1;
    for (const enemy of model.bricks) enemy.y = 90;
    advance(model, 0.4);
    expect(ball.vy).toBeGreaterThan(0);
  });

  it("enforces active/passive slot and level caps and filters impossible level-up offers", () => {
    const model = new ArenaModel();
    model.start();
    for (const id of ["fire", "ice", "poison", "lightning", "bomb"])
      model.debugGrantUpgrade(id);
    expect(model.activeSkills).toHaveLength(4);
    expect(model.activeSkills.some((skill) => skill.id === "bomb")).toBe(false);
    for (const id of [
      "power",
      "haste",
      "multishot",
      "ricochet",
      "critical",
      "magnet",
      "armor",
    ])
      model.debugGrantUpgrade(id);
    expect(model.passiveSkills).toHaveLength(6);
    for (let i = 0; i < 10; i++) model.debugGrantUpgrade("power");
    expect(
      model.passiveSkills.find((skill) => skill.id === "power")?.level,
    ).toBe(5);
    model.debugGainXp(model.xpNext);
    const owned = [...model.activeSkills, ...model.passiveSkills].map(
      (skill) => skill.id,
    );
    expect(model.choices.every((id) => owned.includes(id))).toBe(true);
    expect(model.choices).not.toContain("power");
    expect(
      UPGRADE_DEFS.filter((definition) => definition.kind === "active"),
    ).toHaveLength(8);
  });

  it("makes passive damage, multishot, fire rate, armor, healing, and magnet upgrades functional", () => {
    const model = new ArenaModel();
    model.start();
    const damage = model.damage;
    model.debugGrantUpgrade("power");
    expect(model.damage).toBeCloseTo(damage * 1.2);
    model.debugGrantUpgrade("haste");
    model.debugGrantUpgrade("multishot");
    advance(model, 0.6);
    expect(
      model.balls.filter((ball) => ball.kind === "basic").length,
    ).toBeGreaterThanOrEqual(6);
    model.debugGrantUpgrade("armor");
    model.debugDamage(20);
    expect(model.hp).toBeCloseTo(82.4);
    model.debugGrantUpgrade("heal");
    expect(model.hp).toBe(100);
    model.debugGrantUpgrade("magnet");
    model.debugGainXp(10);
    expect(model.xp).toBe(11);
  });

  it("takes contact and projectile damage once per invulnerability window, then loses and restarts cleanly", () => {
    const model = new ArenaModel();
    model.start();
    const enemy = model.bricks[0];
    enemy.x = model.player.x;
    enemy.y = 550;
    advance(model, 1 / 120);
    expect(model.hp).toBe(79);
    model.debugDamage(30);
    expect(model.hp).toBe(79);
    advance(model, 0.9);
    model.projectiles.push({
      id: 9999,
      x: model.player.x,
      y: model.player.y,
      vx: 0,
      vy: 1,
      radius: 8,
      damage: 16,
      life: 2,
    });
    advance(model, 1 / 120);
    expect(model.hp).toBe(63);
    advance(model, 0.9);
    model.debugDamage(200);
    expect(model.mode).toBe("gameover");
    model.start();
    expect(model.hp).toBe(100);
    expect(model.level).toBe(1);
    expect(model.projectiles).toHaveLength(0);
    expect(model.passiveSkills).toHaveLength(0);
  });

  it("automatically advances six fixed waves with two minibosses and a full champion", () => {
    const model = new ArenaModel();
    model.start();
    for (let wave = 1; wave <= 6; wave++) {
      expect(model.wave).toBe(wave);
      if ([3, 5, 6].includes(wave)) {
        model.debugSetWave(wave);
        const boss = model.bricks.find((enemy) => enemy.boss || enemy.elite);
        expect(boss).toBeDefined();
        expect(boss!.height).toBeGreaterThan(90);
        expect(model.snapshot().bossMaxHp).toBeGreaterThan(200);
        expect(boss!.boss).toBe(wave === 6);
      }
      model.debugClearWave();
      if (wave < 6) {
        advance(model, 0.05);
        expect(model.mode).toBe("playing");
      } else {
        // Final wave uses the same genuine clear condition, with no extra reward gate.
        model.intermission = 0;
        advance(model, 1 / 120);
        expect(model.mode).toBe("victory");
      }
    }
  });

  it("reserves the crowd finisher for full charge and damages the whole live arena", () => {
    const model = new ArenaModel();
    model.start();
    const before = model.bricks.map((enemy) => enemy.hp);
    model.charge = 99;
    model.finisher();
    expect(model.charge).toBe(99);
    expect(model.bricks.map((enemy) => enemy.hp)).toEqual(before);
    model.debugSetWave(6);
    const champion = model.bricks.find((enemy) => enemy.boss)!;
    const hp = champion.hp;
    model.charge = 100;
    model.finisher();
    expect(champion.hp).toBeLessThan(hp);
    expect(model.charge).toBeLessThan(100);
    expect(model.projectiles).toHaveLength(0);
    expect(model.invulnerable).toBeGreaterThan(0);
  });

  it("requires movement and a build to survive the harder arena without granting automatic clears", () => {
    const reports: { moving: boolean; wave: number; first: number; level: number; result: string }[] = [];
    const priority = ["multishot", "laser", "lightning", "ice", "power", "haste", "ricochet", "vampire", "armor", "bomb", "critical", "fire", "magnet", "heal"];
    for (const moving of [false, true]) {
      const model = new ArenaModel(1);
      model.start();
      let first = 0;
      for (let frame = 0; frame < 120 * 240; frame++) {
        if (model.mode === "reward") {
          if (!first) first = model.time;
          const choices = [...model.choices].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
          model.chooseUpgrade(choices[0]);
        }
        if (moving) model.point(210 + Math.sin(model.time * 0.6) * 135, 465 + Math.cos(model.time * 0.8) * 90);
        model.step(1 / 120);
        if (model.mode === "victory" || model.mode === "gameover") break;
      }
      reports.push({ moving, wave: model.wave, first, level: model.level, result: model.mode });
      expect(first).toBeGreaterThan(7);
      expect(first).toBeLessThan(15);
      expect(model.level).toBeGreaterThan(5);
    }
    expect(reports[0].result).toBe("gameover");
    expect(reports[1].wave).toBeGreaterThan(reports[0].wave);
    expect(reports[1].wave).toBeGreaterThanOrEqual(5);
  });

  it("moves freely in both axes, normalizes diagonals, and clamps every ring edge", () => {
    const straight = new ArenaModel(), diagonal = new ArenaModel();
    straight.start(); diagonal.start();
    straight.move(1, 0); diagonal.move(1, -1);
    const start = { ...straight.player };
    advance(straight, 0.2); advance(diagonal, 0.2);
    expect(Math.hypot(straight.player.x - start.x, straight.player.y - start.y)).toBeCloseTo(66);
    expect(Math.hypot(diagonal.player.x - start.x, diagonal.player.y - start.y)).toBeCloseTo(66);
    diagonal.point(-999, -999);
    advance(diagonal, 2);
    expect(diagonal.player).toEqual({ x: ARENA.left + 20, y: ARENA.top + 36 });
    diagonal.point(999, 999);
    advance(diagonal, 2);
    expect(diagonal.player).toEqual({ x: ARENA.right - 20, y: ARENA.height - 45 });
    const y = diagonal.player.y;
    diagonal.point(210);
    advance(diagonal, 0.1);
    expect(diagonal.player.y).toBe(y); // Legacy one-axis callers remain valid.
  });

  it("aims and takes contact from every direction without horizontal-band false hits", () => {
    for (const [dx, dy] of [[-80, 0], [80, 0], [0, -80], [0, 40]]) {
      const model = new ArenaModel(); model.start();
      model.player = { x: 210, y: 350 };
      const enemy = model.bricks[0];
      model.bricks = [enemy];
      enemy.x = model.player.x + dx; enemy.y = model.player.y + dy;
      enemy.hp = enemy.maxHp = 1000;
      expect(model.aimAngle).toBeCloseTo(Math.atan2(dy, dx));
      enemy.x = model.player.x + Math.sign(dx) * 30;
      enemy.y = model.player.y + Math.sign(dy) * 30;
      advance(model, 1 / 120);
      expect(model.hp).toBeLessThan(100);
    }
    const safe = new ArenaModel(); safe.start();
    safe.bricks[0].x = safe.player.x;
    safe.bricks[0].y = safe.player.y + 100;
    advance(safe, 1 / 120);
    expect(safe.hp).toBe(100);
  });

  it("telegraphs both flanks for over a second before spawning pursuing side squads", () => {
    const model = new ArenaModel(8);
    model.start({ power: 0, width: 0, health: 20 });
    const tickWithoutKills = (seconds: number) => {
      for (let frame = 0; frame < Math.round(seconds * 120); frame++) {
        for (const enemy of model.bricks) { enemy.hp = 100000; enemy.attackIn = 100; }
        model.step(1 / 120);
      }
    };
    tickWithoutKills(3.3);
    const left = model.telegraphs.find((entry) => entry.side === "left");
    expect(left).toBeDefined();
    expect(left!.maxLife).toBeGreaterThanOrEqual(1);
    expect(model.bricks.some((enemy) => enemy.entry === "left")).toBe(false);
    tickWithoutKills(1.2);
    expect(model.bricks.some((enemy) => enemy.entry === "left")).toBe(false);
    tickWithoutKills(0.2);
    const leftSquad = model.bricks.filter((enemy) => enemy.entry === "left");
    expect(leftSquad.length).toBeGreaterThanOrEqual(2);
    const enemy = leftSquad[0];
    const distance = Math.hypot(enemy.x - model.player.x, enemy.y - model.player.y);
    tickWithoutKills(0.3);
    expect(Math.hypot(enemy.x - model.player.x, enemy.y - model.player.y)).toBeLessThan(distance);
    tickWithoutKills(5);
    expect(model.telegraphs.some((entry) => entry.side === "right")).toBe(true);
    expect(model.bricks.some((enemy) => enemy.entry === "right")).toBe(false);
    tickWithoutKills(1.3);
    expect(model.bricks.some((enemy) => enemy.entry === "right")).toBe(true);
  });

  it("keeps announced flank arrivals outside the player even at a corner", () => {
    const model = new ArenaModel(); model.start();
    model.player = { x: 48, y: 510 };
    model.telegraphs.push({ id: 9001, x: 48, y: 510, side: "left", life: 0.001, maxLife: 1.4 });
    advance(model, 1 / 120);
    expect(model.hp).toBe(100);
    const arrivals = model.bricks.filter((enemy) => enemy.entry === "left");
    expect(arrivals.length).toBeGreaterThanOrEqual(2);
    expect(arrivals.every((enemy) => Math.hypot(enemy.x - model.player.x, enemy.y - model.player.y) > 75)).toBe(true);
  });

  it("offers three strictly increasing difficulties and escalates population, armor, and pace every two waves", () => {
    const metrics = [1, 2, 3].map((difficulty) => {
      const model = new ArenaModel(42);
      model.start({ power: 0, width: 0, health: 0, difficulty: difficulty as 1 | 2 | 3 });
      return { count: model.bricks.length, hp: model.bricks[0].maxHp, speed: model.bricks[0].speed };
    });
    for (let i = 1; i < metrics.length; i++) {
      expect(metrics[i].count).toBeGreaterThan(metrics[i - 1].count);
      expect(metrics[i].hp).toBeGreaterThan(metrics[i - 1].hp);
      expect(metrics[i].speed).toBeGreaterThan(metrics[i - 1].speed);
    }
    const model = new ArenaModel(); model.start();
    const signatures = new Set<string>();
    let previousHp = 0, previousSpeed = 0;
    for (let wave = 1; wave <= 6; wave++) {
      model.debugSetWave(wave);
      advance(model, 1.2); // Later waves announce their first formation before entry.
      const normal = model.bricks.filter((enemy) => !enemy.boss && !enemy.elite);
      signatures.add(JSON.stringify(normal.map((enemy) => [Math.round(enemy.x), Math.round(enemy.y)])));
      expect(model.snapshot().stageTier).toBe(Math.ceil(wave / 2));
      expect(model.snapshot().formation).toBeTruthy();
      if (wave % 2 === 1) {
        expect(normal[0].maxHp).toBeGreaterThan(previousHp);
        const pace = Math.max(...normal.map((enemy) => enemy.speed));
        expect(pace).toBeGreaterThan(previousSpeed);
        previousHp = normal[0].maxHp; previousSpeed = pace;
      }
      if (wave >= 4) expect(normal.some((enemy) => enemy.role === "tank")).toBe(true);
      expect(normal.some((enemy) => enemy.role === "ranged")).toBe(true);
    }
    expect(signatures.size).toBe(6);
  });

  it("lets ready-state difficulty selection persist into a run and prevents mid-fight changes", () => {
    const model = new ArenaModel();
    model.setDifficulty(3);
    expect(model.snapshot().difficulty).toBe(3);
    model.start();
    expect(model.difficulty).toBe(3);
    model.setDifficulty(1);
    expect(model.difficulty).toBe(3);
    model.start({ power: 0, width: 0, health: 0, difficulty: 1 });
    expect(model.difficulty).toBe(1);
  });

  it("warns before a champion enters and keeps its full body away from a player at the top", () => {
    const model = new ArenaModel(); model.start({ power: 0, width: 0, health: 20 });
    // Keep the live scheduler; debugSetWave deliberately spawns a boss immediately.
    model.wave = 6;
    const tickWithoutKills = (seconds: number) => {
      for (let frame = 0; frame < Math.round(seconds * 120); frame++) {
        for (const enemy of model.bricks) { enemy.hp = 100000; enemy.attackIn = 100; }
        model.step(1 / 120);
      }
    };
    tickWithoutKills(7.1);
    expect(model.telegraphs.some((entry) => entry.boss)).toBe(true);
    expect(model.bricks.some((enemy) => enemy.boss)).toBe(false);
    model.player = { x: 210, y: 102 };
    tickWithoutKills(1.3);
    expect(model.bricks.some((enemy) => enemy.boss)).toBe(false);
    tickWithoutKills(0.3);
    const boss = model.bricks.find((enemy) => enemy.boss)!;
    expect(boss).toBeDefined();
    expect(Math.hypot(boss.x - model.player.x, boss.y - model.player.y)).toBeGreaterThan(100);
  });

  it("enrages the champion into a five-shot attack aimed above as well as below", () => {
    const model = new ArenaModel(); model.start(); model.debugSetWave(6);
    const boss = model.bricks.find((enemy) => enemy.boss)!;
    model.bricks = [boss];
    model.player = { x: 210, y: 120 };
    boss.x = 210; boss.y = 400; boss.hp = boss.maxHp * 0.45; boss.attackIn = 0;
    advance(model, 1 / 120);
    expect(model.projectiles).toHaveLength(5);
    expect(model.projectiles.every((bullet) => bullet.vy < 0)).toBe(true);
    expect(boss.attackIn).toBeLessThan(1);
  });

  it("removes hostile shots after exiting any of the four sides", () => {
    const model = new ArenaModel(); model.start();
    for (const [x, y] of [[-5, 300], [425, 300], [210, -10], [210, 650]])
      model.projectiles.push({ id: 9000 + x + y, x, y, vx: 0, vy: 0, radius: 5, damage: 10, life: 5 });
    advance(model, 1 / 120);
    expect(model.projectiles).toHaveLength(0);
  });

  it("keeps all transient collections bounded during a heavily upgraded battle", () => {
    const model = new ArenaModel();
    model.start({ power: 0, width: 20, health: 20 });
    for (const id of [
      "split",
      "laser",
      "lightning",
      "multishot",
      "haste",
      "ricochet",
    ])
      for (let i = 0; i < 5; i++) model.debugGrantUpgrade(id);
    for (let frame = 0; frame < 120 * 70; frame++) {
      if (model.mode === "reward") model.chooseUpgrade(model.choices[0]);
      model.step(1 / 120);
      expect(model.balls.length).toBeLessThanOrEqual(150);
      expect(model.fx.length).toBeLessThanOrEqual(60);
      expect(model.pickups.length).toBeLessThanOrEqual(100);
      expect(model.projectiles.length).toBeLessThanOrEqual(70);
      if (frame % 120 === 0) model.drainEvents();
    }
    expect(model.events.length).toBeLessThanOrEqual(128);
  });
});
