import { describe, expect, it } from "vitest";
import { ARENA, ArenaModel } from "./model";

function advance(model: ArenaModel, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 120); i++) model.step(1 / 120);
}

function clearWave(model: ArenaModel) {
  model.bricks.forEach((brick) => {
    brick.hp = 0;
  });
  model.step(1 / 120);
}

describe("Ring Breaker simulation", () => {
  it("shows a stationary, populated ready preview and starts a new run with meta progression", () => {
    const model = new ArenaModel();
    expect(model.snapshot().mode).toBe("ready");
    expect(model.snapshot().remaining).toBe(16);
    expect(model.balls[0].attached).toBe(true);
    const y = model.balls[0].y;
    advance(model, 1);
    expect(model.balls[0].y).toBe(y);
    model.start({ power: 1, width: 2, health: 1 });
    expect(model.mode).toBe("playing");
    expect(model.damage).toBe(2);
    expect(model.lives).toBe(4);
    expect(model.paddle.width).toBe(116);
    expect(model.balls[0].vy).toBeLessThan(0);
  });

  it("resolves a real ball-to-target hit, bounces down, and awards score and charge", () => {
    const model = new ArenaModel();
    model.start();
    const target = model.bricks[0];
    model.bricks = [target, { ...target, id: 999, x: 350, y: 200 }];
    const ball = model.balls[0];
    ball.x = target.x;
    ball.y = target.y + target.height / 2 + ARENA.radius + 2;
    ball.vx = 0;
    ball.vy = -400;
    advance(model, 1 / 60);
    expect(target.hp).toBe(0);
    expect(ball.vy).toBeGreaterThan(0);
    expect(model.score).toBe(75);
    expect(model.charge).toBe(7);
    expect(model.combo).toBe(1);
  });

  it("uses the paddle contact position to aim and never allows the paddle outside the ring", () => {
    const model = new ArenaModel();
    model.start();
    const ball = model.balls[0];
    ball.x = model.paddle.x + model.paddle.width * 0.38;
    ball.y = ARENA.paddleY - model.paddle.height / 2 - ARENA.radius - 2;
    ball.vx = 0;
    ball.vy = 400;
    advance(model, 1 / 60);
    expect(ball.vy).toBeLessThan(0);
    expect(ball.vx).toBeGreaterThan(150);
    model.point(-500);
    advance(model, 0.5);
    expect(model.paddle.x - model.paddle.width / 2).toBe(ARENA.left);
    model.point(1000);
    advance(model, 0.5);
    expect(model.paddle.x + model.paddle.width / 2).toBe(ARENA.right);
  });

  it("bounces at arena boundaries without tunneling at the maximum simulation interval", () => {
    const model = new ArenaModel();
    model.start();
    const ball = model.balls[0];
    ball.x = ARENA.right - ARENA.radius - 1;
    ball.y = 400;
    ball.vx = 500;
    ball.vy = -130;
    model.step(0.25);
    expect(ball.x).toBeLessThan(ARENA.right - ARENA.radius);
    expect(ball.vx).toBeLessThan(0);
  });

  it("pauses all simulation and gives identical results at 60 and 120 Hz", () => {
    const sixty = new ArenaModel(),
      oneTwenty = new ArenaModel();
    sixty.start();
    oneTwenty.start();
    for (let i = 0; i < 30; i++) sixty.step(1 / 60);
    for (let i = 0; i < 60; i++) oneTwenty.step(1 / 120);
    expect(sixty.balls).toEqual(oneTwenty.balls);
    sixty.pause();
    const state = JSON.stringify(sixty.balls);
    advance(sixty, 1);
    expect(JSON.stringify(sixty.balls)).toBe(state);
    sixty.resume();
    expect(sixty.mode).toBe("playing");
  });

  it("requires reward selection to enter the next predefined wave and applies run upgrades", () => {
    const model = new ArenaModel();
    model.start();
    clearWave(model);
    expect(model.mode).toBe("reward");
    expect(model.wave).toBe(1);
    advance(model, 2);
    expect(model.wave).toBe(1);
    model.chooseUpgrade("unknown");
    expect(model.mode).toBe("reward");
    model.chooseUpgrade("power");
    expect(model.mode).toBe("playing");
    expect(model.wave).toBe(2);
    expect(model.damage).toBe(2);
    expect(model.bricks.some((brick) => brick.maxHp > 1)).toBe(true);
    clearWave(model);
    model.chooseUpgrade("multiball");
    expect(model.balls).toHaveLength(3);
    expect(model.balls.every((ball) => !ball.attached)).toBe(true);
    clearWave(model);
    model.chooseUpgrade("wide");
    expect(model.paddle.width).toBe(120);
  });

  it("takes a life only when the final ball falls and automatically serves the replacement", () => {
    const model = new ArenaModel();
    model.start();
    clearWave(model);
    model.chooseUpgrade("multiball");
    model.balls[0].y = 650;
    model.step(1 / 120);
    expect(model.lives).toBe(3);
    expect(model.balls).toHaveLength(2);
    model.balls.forEach((ball) => {
      ball.y = 650;
    });
    model.step(1 / 120);
    expect(model.lives).toBe(2);
    expect(model.balls[0].attached).toBe(true);
    advance(model, 1.2);
    expect(model.balls[0].attached).toBe(false);
    expect(model.balls[0].vy).toBeLessThan(0);
  });

  it("lets repeated fire and slow selections keep improving the run", () => {
    const model = new ArenaModel();
    model.start();
    clearWave(model);
    model.chooseUpgrade("fire");
    clearWave(model);
    model.chooseUpgrade("fire");
    expect(model.fire).toBe(true);
    expect(model.damage).toBe(3);
    clearWave(model);
    model.chooseUpgrade("slow");
    clearWave(model);
    model.chooseUpgrade("slow");
    expect(model.slowFactor).toBeCloseTo(0.84 * 0.84);
    expect(model.speed).toBeCloseTo((330 + 4 * 22) * 0.84 * 0.84);
    model.start();
    expect(model.damage).toBe(1);
    expect(model.slowFactor).toBe(1);
    expect(model.fire).toBe(false);
  });

  it("ends a run after three misses and resets fully for a rematch", () => {
    const model = new ArenaModel();
    model.start();
    for (let life = 0; life < 3; life++) {
      model.balls.forEach((ball) => {
        ball.attached = false;
        ball.y = 650;
      });
      model.step(1 / 120);
    }
    expect(model.mode).toBe("gameover");
    expect(model.lives).toBe(0);
    model.start();
    expect(model.mode).toBe("playing");
    expect(model.lives).toBe(3);
    expect(model.score).toBe(0);
    expect(model.wave).toBe(1);
  });

  it("reserves victory for clearing the champion and all six waves", () => {
    const model = new ArenaModel();
    model.start();
    for (let wave = 1; wave < 6; wave++) {
      expect(model.wave).toBe(wave);
      clearWave(model);
      expect(model.mode).toBe("reward");
      model.chooseUpgrade(wave === 1 ? "fire" : wave === 2 ? "slow" : "heal");
    }
    expect(model.wave).toBe(6);
    expect(model.snapshot().bossHp).toBe(40);
    expect(model.fire).toBe(true);
    expect(model.slow).toBe(true);
    model.charge = 100;
    model.finisher();
    expect(model.snapshot().bossHp).toBe(24);
    expect(model.mode).toBe("playing");
    expect(model.charge).toBeLessThan(100);
    clearWave(model);
    expect(model.mode).toBe("victory");
    expect(model.snapshot().remaining).toBe(0);
    expect(model.snapshot().bossHp).toBe(0);
  });

  it("does not consume an unavailable finisher", () => {
    const model = new ArenaModel();
    model.start();
    model.charge = 99;
    model.finisher();
    expect(model.charge).toBe(99);
    expect(model.score).toBe(0);
  });
});
