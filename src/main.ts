import "./style.css";
import {
  createArena,
  type ArenaState,
  type ArenaController,
} from "./game/arena";

import type { Difficulty } from "./game/model";
import { UPGRADE_DEFS, getUpgrade, type UpgradeDef } from "./game/upgrades";

const paths: Record<string, string> = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  trophy:
    '<path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5m-4 3h8m-6-3h4"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8L20 9h-7l1-7Z"/>',
  gem: '<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  volume:
    '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 3m0 3h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  shield: '<path d="m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7l8-4Z"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 19l9 5 9-5"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  fire: '<path d="M13 2c1 6-4 6-3 10-2-1-3-3-3-3-7 9 1 16 7 12 7-4 4-10 1-12 0 3-2 4-2 4 3-6 0-11 0-11Z"/>',
};
Object.assign(paths, {
  snowflake:
    '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 5l3 3 3-3M9 19l3-3 3 3"/>',
  bomb: '<circle cx="10" cy="14" r="7"/><path d="m15 9 3-3m-2-3 5 5m-1-7v2m3 1h-2"/>',
  skull:
    '<path d="M7 18v4h10v-4c8-5 3-16-5-16S-4 13 7 18Z"/><circle cx="8" cy="11" r="1"/><circle cx="16" cy="11" r="1"/><path d="m10 16 2-2 2 2"/>',
  split: '<path d="M12 21v-9M12 12 5 5m7 7 7-7M3 9V3h6m6 0h6v6"/>',
  laser: '<path d="M3 12h18M17 8l4 4-4 4M4 5l1 2M4 19l1-2M10 3v2m0 14v2"/>',
  rotate: '<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h18a3 3 0 1 1-3 3M4 17h5a3 3 0 1 1-3 3"/>',
  magnet:
    '<path d="M5 3v10a7 7 0 0 0 14 0V3h-5v10a2 2 0 0 1-4 0V3H5Zm0 5h5m4 0h5"/>',
});
const icon = (name: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bolt}</svg>`;
type Save = {
  gems: number;
  best: number;
  runs: number;
  wins: number;
  power: number;
  width: number;
  health: number;
  sound: boolean;
  difficulty: Difficulty;
};
let save: Save = {
  gems: 0,
  best: 0,
  runs: 0,
  wins: 0,
  power: 0,
  width: 0,
  health: 0,
  sound: true,
  difficulty: 2,
};
try {
  const raw = JSON.parse(localStorage.getItem("ring-breaker-save") || "null");
  if (raw && typeof raw === "object") {
    for (const key of [
      "gems",
      "best",
      "runs",
      "wins",
      "power",
      "width",
      "health",
    ] as const)
      if (Number.isFinite(raw[key]))
        save[key] = Math.max(0, Math.floor(raw[key]));
    if ([1, 2, 3].includes(raw.difficulty)) save.difficulty = raw.difficulty;
    if (typeof raw.sound === "boolean") save.sound = raw.sound;
  }
} catch {
  /* Storage is optional. */
}
const persist = () => {
  try {
    localStorage.setItem("ring-breaker-save", JSON.stringify(save));
  } catch {
    /* Private browsing. */
  }
};
const n = (v: number) => v.toLocaleString("en-US");
const difficultyNames = ["도전자", "하드", "나이트메어"];
const stageNames = ["압박의 시작", "포위 전술", "챔피언의 지옥"];
const waveNames = ["쐐기 돌격", "교차 대형", "아틀라스의 장벽", "장갑 관문", "사면 포위", "오닉스 챔피언십"];
const waveNotes = [
  "쐐기 대열과 좌우 기습을 돌파하세요",
  "엇갈리는 대열과 원거리 포화를 피하세요",
  "중보스 아틀라스가 링에 등장합니다",
  "중장갑 문지기와 양측 포위망을 돌파하세요",
  "사방에서 오는 호위병과 두 번째 중보스",
  "최종 보스 오닉스와 타이틀 매치",
];
let arena: ArenaController;
let current: ArenaState;
let modalPause = false,
  catalogKind = "active",
  buildSignature = "",
  lastSoundAt = 0;
let audio: AudioContext | undefined;
const base = import.meta.env.BASE_URL;
const skillIcons: Record<string, string> = {
  fire: "fire",
  ice: "snowflake",
  poison: "skull",
  lightning: "bolt",
  bomb: "bomb",
  split: "split",
  laser: "laser",
  boomerang: "rotate",
  power: "bolt",
  haste: "wind",
  multishot: "layers",
  ricochet: "arrow",
  critical: "target",
  magnet: "magnet",
  vampire: "heart",
  armor: "shield",
  heal: "heart",
};
const skillStyle = (u: UpgradeDef) =>
  `style="--skill-color:${u.color};color:${u.color};border-color:${u.color}44;background:${u.color}0d"`;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="arena-column" aria-label="Ring Breaker 전체화면 아레나">
 <div id="game-canvas" aria-label="상하좌우 드래그 또는 방향키로 이동하는 레슬링 볼 생존 게임" role="application" tabindex="0"></div>
 <div class="screen-vignette"></div>
 <header class="hud-top">
  <button class="brand" data-action="menu" aria-label="경기 메뉴"><span class="brand-mark">R<span>↗</span></span><span>RING<br><b>BREAKER</b></span></button>
  <button class="wave-display" data-action="route" aria-label="웨이브 및 난이도 정보"><span class="hud-eyebrow">WAVE <b data-wave>01</b><small>/ 06</small></span><strong data-wave-name>쐐기 돌격</strong><span class="wave-dots">${Array.from({length:6},(_,i)=>`<i data-node="${i+1}" class="${i===0?'current':''}"></i>`).join("")}</span></button>
  <div class="hud-utilities"><button class="icon-btn sound-control" data-action="sound" aria-label="사운드 끄기" aria-pressed="true">${icon("volume")}</button><button class="icon-btn expand-control" data-action="fullscreen" aria-label="전체 화면">${icon("expand")}</button><button class="icon-btn pause-control" data-action="pause" aria-label="일시정지">${icon("pause")}</button></div>
  <div class="health-group">${icon("heart")}<div class="health-track"><i data-hp-fill></i></div><b data-health>100 / 100</b></div>
  <div class="difficulty-badge"><i></i><span data-difficulty>HARD</span><small data-stage-tier>PHASE 1 / 3</small></div>
 </header>
 <div class="xp-hud"><b data-level>LV. 01</b><div class="xp-track"><i data-xp-fill></i></div><small data-xp>0 / 20 XP</small></div>
 <div class="combat-meta"><span class="score-counter"><small>SCORE</small><b data-score>000000</b></span><span class="kill-counter">${icon("target")}<b data-kills>0</b><small>KO</small></span></div>
 <div class="stage-pill"><i></i><span data-stage-label>360° SURVIVAL · AUTO FIRE</span></div>
 <div class="combo" data-combo hidden></div>
 <section class="ready-screen" data-ready aria-label="경기 시작">
  <div class="ready-content"><div class="edition"><span></span> THE PIT · 360° SURVIVAL</div><h1>SMALL BALLS.<br><em>BIG FIGHT.</em></h1><p class="ready-copy">사방에서 몰려오는 레슬러.<br>공을 쏟아붓고, 나만의 빌드로 링을 지배하세요.</p>
  <div class="difficulty-selector" aria-label="난이도 선택">${[1,2,3].map(d=>`<button data-difficulty-choice="${d}" aria-pressed="${save.difficulty===d}" class="${save.difficulty===d?'selected':''}"><small>0${d}</small><strong>${difficultyNames[d-1]}</strong><span>${["강화된 대열","더 빠른 포위","극한의 공세"][d-1]}</span></button>`).join("")}</div>
  <button class="primary-btn start-button" data-run-action data-action="start"><span>링에 뛰어들기</span>${icon("arrow")}</button>
  <div class="ready-hint"><span class="movement-icon">✥</span> 상하좌우 드래그 / WASD <span>·</span> 자동 발사</div>
  <nav class="ready-menu" aria-label="게임 메뉴"><button data-action="training">${icon("bolt")}트레이닝</button><button data-action="collection">${icon("book")}성장 도감</button><button data-action="help">${icon("help")}플레이 방법</button></nav>
  <div class="ready-record"><span>${icon("trophy")}<b data-best>${n(save.best)} <small>PTS</small></b></span><span>${icon("gem")}<b data-gems>${n(save.gems)}</b><small>TOKENS</small></span></div>
  </div>
 </section>
 <section class="resume-overlay" hidden aria-label="일시정지 메뉴"><div><span class="modal-eyebrow">TAKE A BREATHER</span><h2>ROUND PAUSED.</h2><p>호흡을 고르고, 다시 링으로.</p><button class="primary-btn full" data-action="resume">경기 계속하기 ${icon("play")}</button><div class="pause-menu"><button data-action="collection">${icon("book")}성장 도감</button><button data-action="help">${icon("help")}조작 방법</button></div></div></section>
 <footer class="combat-bottom">
  <div class="control-hint"><span class="movement-icon">✥</span><span>DRAG TO MOVE <b>360°</b></span><span data-status>READY</span></div>
  <div class="loadout-panel"><div class="active-loadout"><span class="loadout-label">ACTIVE<small data-active-count>1 / 4</small></span><div class="build-slots" data-active-build></div></div><button class="finisher-btn" data-action="finisher" disabled>${icon("bolt")}<span>피니셔 <b data-charge>0%</b></span><kbd>F</kbd></button><div class="passive-loadout"><span class="loadout-label">PASSIVE<small data-passive-count>0 / 6</small></span><div class="build-slots" data-passive-build></div><button class="build-book" data-action="collection" aria-label="성장 도감 열기">${icon("book")}</button></div></div>
 </footer>
</main>
<dialog id="modal"><div class="modal-shell"><button class="modal-close icon-btn" data-action="close" aria-label="닫기">${icon("close")}</button><div id="modal-content"></div></div></dialog><div class="toast" role="status" aria-live="polite" hidden></div>`;
const q = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const modal = q<HTMLDialogElement>("#modal"),
  modalContent = q("#modal-content");
function sound(freq = 420) {
  if (!save.sound) return;
  try {
    audio ||= new AudioContext();
    void audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      freq / 2,
      audio.currentTime + 0.08,
    );
    g.gain.setValueAtTime(0.025, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.11);
  } catch {
    /* Sound is optional. */
  }
}
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) {
  const el = q(".toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}
function openModal(html: string, required = false) {
  if (current.mode === "playing") {
    modalPause = true;
    arena.pause();
  } else if (!modal.open) modalPause = false;
  modalContent.innerHTML = html;
  const heading = modalContent.querySelector("h2");
  if (heading) {
    heading.id = "modal-title";
    modal.setAttribute("aria-labelledby", "modal-title");
  }
  modal.dataset.required = String(required);
  q(".modal-close").hidden = required;
  if (!modal.open) modal.showModal();
}
function closeModal() {
  if (modal.dataset.required === "true") return;
  modal.close();
  if (modalPause && current.mode === "paused") arena.resume();
  modalPause = false;
}
modal.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
function showHelp() {
  openModal(
    `<div class="modal-eyebrow">WELCOME TO THE PIT</div><h2>사방을 누비고,<br>공세를 지배하세요.</h2><p class="modal-intro">공은 자동으로 발사됩니다. 노바를 움직여<br>경험치를 모으고, 사방의 포위망을 돌파하세요.</p><div class="help-steps"><div><b>01</b><span><strong>드래그로 이동, 공은 자동 발사</strong><small>링 안에서 상하좌우로 드래그하거나 방향키 / WASD로 이동하세요. 공은 적과 벽을 튕기며 여러 번 타격합니다.</small></span></div><div><b>02</b><span><strong>경험치를 모아 전투 중 레벨업</strong><small>처치한 상대가 보석을 떨어뜨립니다. 레벨업하면 경기가 잠시 멈추고 3가지 성장 중 하나를 고릅니다.</small></span></div><div><b>03</b><span><strong>액티브 4개, 패시브 6개</strong><small>화염·빙결·중독·번개 등 액티브는 자동으로 발동합니다. 패시브로 연사·다중 발사·치명타 등을 강화하세요. 각 기술은 최대 5레벨입니다.</small></span></div><div><b>04</b><span><strong>측면 기습을 피하고, 보스에 도전</strong><small>좌우 경고 표시 뒤에 기습대가 진입합니다. 적과 닿거나 투사체에 맞으면 체력이 줄어듭니다. 웨이브가 두 번 지날 때마다 압박이 3단계로 강해집니다. 3·5웨이브의 아틀라스와 마지막 오닉스를 처치하세요. 피니셔는 게이지가 가득 차면 사용합니다.</small></span></div></div><div class="help-keys"><span><kbd>SPACE / ESC</kbd> 일시정지</span><span><kbd>F</kbd> 피니셔</span></div><button class="primary-btn full" data-action="close">이제 준비됐어요 ${icon("check")}</button>`,
  );
}
function upgradeCard(u: UpgradeDef) {
  return `<div class="collection-item"><span class="upgrade-kind ${u.kind}">${u.kind === "active" ? "ACTIVE · 자동 발사" : "PASSIVE · 상시 효과"}</span><span class="upgrade-icon" ${skillStyle(u)}>${icon(skillIcons[u.id] || "bolt")}</span><h3>${u.name}</h3><small>${u.en}</small><p>${u.desc}</p><div class="level-pips">${"<i></i>".repeat(Math.min(5, u.maxLevel))}</div></div>`;
}
function showCollection(kind = catalogKind) {
  catalogKind = kind;
  const list = UPGRADE_DEFS.filter((u) => u.kind === kind && u.id !== "heal");
  openModal(
    `<div class="modal-eyebrow">BUILD YOUR OWN CHAOS</div><h2>레벨업, 그 이상의 한 수.</h2><p class="modal-intro">액티브 4슬롯 · 패시브 6슬롯 · 각 최대 5레벨<br>새 기술을 더하거나, 익숙한 기술을 더 강하게.</p><div class="catalog-tabs"><button data-catalog="active" class="${kind === "active" ? "selected" : ""}">${icon("fire")} 액티브 <b>8</b></button><button data-catalog="passive" class="${kind === "passive" ? "selected" : ""}">${icon("shield")} 패시브 <b>8</b></button></div><div class="collection-grid">${list.map(upgradeCard).join("")}</div>`,
  );
}
const trainingItems = [
  {
    key: "power" as const,
    name: "펀치 파워",
    desc: "시작 공격력을 영구 강화",
    icon: "bolt",
    max: 4,
  },
  {
    key: "width" as const,
    name: "빠른 손",
    desc: "발사 속도와 경험치 획득 범위 강화",
    icon: "wind",
    max: 4,
  },
  {
    key: "health" as const,
    name: "아이언 하트",
    desc: "시작 최대 체력 +20",
    icon: "heart",
    max: 2,
  },
];
function updateSaveUI() {
  document
    .querySelectorAll("[data-gems]")
    .forEach((el) => (el.textContent = n(save.gems)));
  q("[data-best]").innerHTML = `${n(save.best)} <small>PTS</small>`;
  q('[data-action="sound"]').innerHTML = icon(save.sound ? "volume" : "mute");
  q('[data-action="sound"]').setAttribute(
    "aria-label",
    save.sound ? "사운드 끄기" : "사운드 켜기",
  );
  q('[data-action="sound"]').setAttribute("aria-pressed", String(save.sound));
}
function showTraining() {
  openModal(
    `<div class="modal-eyebrow">THE TRAINING CLUB</div><h2>다음에는, 더 강하게.</h2><p class="modal-intro">이전 버전의 토큰과 트레이닝도 이어집니다.</p><div class="training-wallet">${icon("gem")}<b>${n(save.gems)}</b><span>챔피언 토큰</span></div><div class="training-list">${trainingItems
      .map((t) => {
        const lv = Math.min(t.max, save[t.key]),
          cost = 75 * (lv + 1);
        return `<div class="training-row"><span class="upgrade-icon lime">${icon(t.icon)}</span><div><h3>${t.name}<small>LV. ${lv} / ${t.max}</small></h3><p>${t.desc}</p></div><button data-buy="${t.key}" ${lv >= t.max || save.gems < cost ? "disabled" : ""}>${lv >= t.max ? "MAX" : `${icon("gem")}${cost}`}</button></div>`;
      })
      .join(
        "",
      )}</div><p class="storage-note">${icon("shield")} 이 브라우저에 자동 저장 · 다음 도전부터 적용</p><div class="career-stats"><span>총 도전<b>${save.runs}</b></span><span>챔피언 등극<b>${save.wins}</b></span><span>최고 점수<b>${n(save.best)}</b></span></div>`,
  );
}
function showRoute() {
  openModal(
    `<div class="modal-eyebrow">ROAD TO THE TITLE</div><h2>몰려오는 대열.<br>세 번의 거대한 도전.</h2><div class="route-list">${waveNames.map((name, i) => `<div class="route-list-row ${i + 1 === current.wave ? "is-current" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><span><strong>${name}</strong><small>${waveNotes[i]}</small></span>${i === 5 ? icon("trophy") : i === 2 || i === 4 ? icon("shield") : icon("chevron")}</div>`).join("")}</div>`,
  );
}
function showReward() {
  sound(740);
  const choices = current.choices
    .map((id) => getUpgrade(id))
    .filter((u): u is UpgradeDef => !!u);
  openModal(
    `<div class="modal-eyebrow">LEVEL UP · LV. ${String(current.level).padStart(2, "0")}</div><h2>다음 한 수를 고르세요.</h2><p class="modal-intro">웨이브는 계속됩니다. 빌드는 더 강해집니다.</p><div class="reward-summary"><span>액티브 <b>${current.activeSkills.length} / 4</b></span><span>패시브 <b>${current.passiveSkills.length} / 6</b></span><span>다음 목표 <b>WAVE ${String(current.wave).padStart(2, "0")}</b></span></div><div class="reward-options">${choices
      .map((u) => {
        const owned =
          [...current.activeSkills, ...current.passiveSkills].find(
            (s) => s.id === u.id,
          )?.level || 0;
        return `<button class="reward-choice" data-upgrade="${u.id}"><span class="upgrade-icon" ${skillStyle(u)}>${icon(skillIcons[u.id] || "bolt")}</span><span><small>${u.id === "heal" ? "RECOVERY · 슬롯 미사용" : u.kind === "active" ? "ACTIVE · 자동 발사" : "PASSIVE · 상시 효과"}<b>${u.id === "heal" ? "즉시 회복" : owned ? `LV. ${owned} → ${owned + 1}` : "NEW"}</b></small><strong>${u.name}</strong><p>${u.desc}</p><span class="reward-pips">${u.id === "heal" ? "" : Array.from({ length: Math.min(5, u.maxLevel) }, (_, i) => `<i class="${i < owned ? "owned" : i === owned ? "next" : ""}"></i>`).join("")}</span></span>${icon("arrow")}</button>`;
      })
      .join(
        "",
      )}</div><p class="storage-note">${icon("layers")} 선택한 성장은 이번 도전 동안 유지됩니다.</p>`,
    true,
  );
}
function skillSlot(skill: { id: string; level: number } | undefined) {
  const u = skill && getUpgrade(skill.id);
  return u
    ? `<button class="build-slot" ${skillStyle(u)} data-skill="${u.id}" aria-label="${u.name} 레벨 ${skill!.level}">${icon(skillIcons[u.id] || "bolt")}<b>${skill!.level}</b></button>`
    : '<span class="empty-slot">+</span>';
}
function renderBuild() {
  const signature = JSON.stringify([
    current.activeSkills,
    current.passiveSkills,
  ]);
  if (signature === buildSignature) return;
  buildSignature = signature;
  q("[data-active-count]").textContent = `${current.activeSkills.length} / 4`;
  q("[data-passive-count]").textContent = `${current.passiveSkills.length} / 6`;
  q("[data-active-build]").innerHTML = Array.from({ length: 4 }, (_, i) =>
    skillSlot(current.activeSkills[i]),
  ).join("");
  q("[data-passive-build]").innerHTML = Array.from({ length: 6 }, (_, i) =>
    skillSlot(current.passiveSkills[i]),
  ).join("");

}
function startRun() {
  if (modal.open) modal.close();
  modalPause = false;
  save.runs++;
  persist();
  arena.start({
    power: Math.min(4, save.power),
    width: Math.min(4, save.width),
    health: Math.min(2, save.health),
    difficulty: save.difficulty,
  });
  sound(600);
  q("#game-canvas").focus({ preventScroll: true });
}
function finish(won: boolean, score: number, wave: number) {
  const earned = Math.max(
    15,
    Math.floor(score / 80) + (wave - 1) * 25 + (won ? 150 : 0),
  );
  save.gems += earned;
  save.best = Math.max(save.best, score);
  if (won) save.wins++;
  persist();
  updateSaveUI();
  sound(won ? 880 : 200);
  openModal(
    `<div class="modal-eyebrow">${won ? "AND THE NEW CHAMPION…" : "EVERY RUN MAKES YOU STRONGER"}</div><div class="finish-icon">${icon(won ? "trophy" : "shield")}</div><h2>${won ? "작은 선수, 거대한 챔피언." : "다음 빌드는 더 강하니까."}</h2><p class="modal-intro">${won ? "오닉스를 꺾고 링의 주인이 되었습니다." : "모은 토큰으로 트레이닝하고 다시 도전하세요."}</p><div class="finish-stats"><span>최종 점수<b>${n(score)}</b></span><span>최종 레벨<b>LV. ${current.level}</b></span><span>처치<b>${current.kills}</b></span></div><div class="earned-tokens">${icon("gem")} +${earned}<small>챔피언 토큰 획득</small></div><button class="primary-btn full" data-action="start">새로운 빌드로 도전 ${icon("arrow")}</button><button class="secondary-btn full" data-action="training">영구 성장 트레이닝 ${icon("bolt")}</button>`,
  );
}
function onChange(state: ArenaState) {
  const previous = current;
  current = state;
  q("[data-wave]").textContent = String(state.wave).padStart(2, "0");
  q("[data-wave-name]").textContent = waveNames[state.wave - 1];
  q("[data-score]").textContent = String(state.score).padStart(6, "0");
  q("[data-difficulty]").textContent = difficultyNames[state.difficulty - 1];
  q("[data-stage-tier]").textContent = `PHASE ${state.stageTier} / 3`;
  q("[data-stage-label]").textContent = `${stageNames[state.stageTier - 1]} · ${state.formation}`;
  document.body.dataset.mode = state.mode;
  document.body.dataset.tier = String(state.stageTier);
  q("[data-ready]").hidden = state.mode !== "ready";
  q(".resume-overlay").hidden = state.mode !== "paused";
  q("[data-status]").textContent = state.mode.toUpperCase();
  q("[data-health]").textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
  q("[data-hp-fill]").style.width = `${(state.hp / state.maxHp) * 100}%`;
  q("[data-level]").textContent = `LV. ${String(state.level).padStart(2, "0")}`;
  q("[data-xp-fill]").style.width =
    `${Math.min(100, (state.xp / state.xpNext) * 100)}%`;
  q("[data-xp]").textContent = `${Math.floor(state.xp)} / ${state.xpNext} XP`;
  q("[data-kills]").textContent = String(state.kills);
  q("[data-charge]").textContent = `${Math.floor(state.charge)}%`;
  q<HTMLButtonElement>('[data-action="finisher"]').disabled =
    state.charge < 100 || state.mode !== "playing";
  q(".finisher-btn").style.setProperty("--charge", `${state.charge}%`);
  const combo = q("[data-combo]");
  combo.hidden = state.combo < 10;
  combo.innerHTML = `${state.combo}<span>HIT COMBO</span>`;
  document.querySelectorAll<HTMLElement>("[data-node]").forEach((node) => {
    node.classList.toggle("current", Number(node.dataset.node) === state.wave);
    node.classList.toggle("cleared", Number(node.dataset.node) < state.wave);
  });
  const btn = q<HTMLButtonElement>("[data-run-action]");
  btn.dataset.action =
    state.mode === "playing"
      ? "pause"
      : state.mode === "paused"
        ? "resume"
        : "start";
  btn.innerHTML = `<span>${state.mode === "playing" ? "잠시 쉬어가기" : state.mode === "paused" ? "경기 계속하기" : "링에 뛰어들기"}</span>${icon(state.mode === "playing" ? "pause" : "arrow")}`;
  renderBuild();
  if (
    previous &&
    state.score > previous.score &&
    performance.now() - lastSoundAt > 100
  ) {
    sound(240 + Math.min(state.combo, 12) * 25);
    lastSoundAt = performance.now();
  }
}
arena = createArena(q("#game-canvas"), {
  onChange,
  onReward: showReward,
  onFinish: finish,
});
arena.setDifficulty(save.difficulty);
current = arena.getState();
onChange(current);
updateSaveUI();
const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    'input,textarea,select,option,[contenteditable]:not([contenteditable="false"])',
  );
for (const name of ["contextmenu", "selectstart", "dragstart"])
  document.addEventListener(name, (event) => {
    if (!editable(event.target)) event.preventDefault();
  });
document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const difficulty = target.closest<HTMLElement>("[data-difficulty-choice]");
  if (difficulty) {
    save.difficulty = Number(difficulty.dataset.difficultyChoice) as Difficulty;
    persist();
    arena.setDifficulty(save.difficulty);
    document.querySelectorAll<HTMLElement>("[data-difficulty-choice]").forEach(btn => {
      const selected = Number(btn.dataset.difficultyChoice) === save.difficulty;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", String(selected));
    });
    return;
  }
  const buy = target.closest<HTMLButtonElement>("[data-buy]");
  if (buy) {
    const item = trainingItems.find((t) => t.key === buy.dataset.buy)!;
    const cost = 75 * (save[item.key] + 1);
    if (save[item.key] < item.max && save.gems >= cost) {
      save.gems -= cost;
      save[item.key]++;
      persist();
      updateSaveUI();
      showTraining();
      sound(750);
      toast("트레이닝 완료! 다음 도전부터 적용됩니다.");
    }
    return;
  }
  const card = target.closest<HTMLElement>("[data-upgrade]");
  if (card) {
    const id = card.dataset.upgrade!;
    if (!current.choices.includes(id)) return;
    modal.close();
    modalPause = false;
    arena.chooseUpgrade(id);
    sound(720);
    return;
  }
  const catalog = target.closest<HTMLElement>("[data-catalog]");
  if (catalog) {
    showCollection(catalog.dataset.catalog);
    return;
  }
  const skill = target.closest<HTMLElement>("[data-skill]");
  if (skill) {
    const u = getUpgrade(skill.dataset.skill!)!;
    const lv =
      [...current.activeSkills, ...current.passiveSkills].find(
        (s) => s.id === u.id,
      )?.level || 0;
    openModal(
      `<div class="modal-eyebrow">${u.kind.toUpperCase()} · LV. ${lv} / ${u.maxLevel}</div><h2>${u.name}</h2><p class="modal-intro">${u.desc}</p>${upgradeCard(u)}<button class="secondary-btn full" data-action="close">경기로 돌아가기 ${icon("arrow")}</button>`,
    );
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;
  switch (action) {
    case "menu":
      if (current.mode === "playing") arena.pause();
      else if (current.mode === "paused") arena.resume();
      else showHelp();
      break;
    case "start":
      startRun();
      break;
    case "pause":
      if (current.mode === "playing") arena.pause();
      else if (current.mode === "paused") arena.resume();
      else toast("도전을 시작하면 경기를 일시정지할 수 있어요.");
      break;
    case "resume":
      arena.resume();
      break;
    case "close":
      closeModal();
      break;
    case "help":
      showHelp();
      break;
    case "training":
      showTraining();
      break;
    case "collection":
      showCollection();
      break;
    case "route":
      showRoute();
      break;
    case "arena":
      if (modal.open) closeModal();
      q("#game-canvas").focus({ preventScroll: true });
      break;
    case "sound":
      save.sound = !save.sound;
      persist();
      updateSaveUI();
      if (save.sound) sound();
      toast(save.sound ? "사운드를 켰습니다." : "사운드를 껐습니다.");
      break;
    case "finisher":
      arena.finisher();
      sound(120);
      break;
    case "fullscreen": {
      const el = q(".arena-column");
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (el.requestFullscreen)
        void el
          .requestFullscreen()
          .catch(() => toast("홈 화면에 추가하면 더 넓게 즐길 수 있어요."));
      else toast("홈 화면에 추가하면 더 넓게 즐길 수 있어요.");
      break;
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (editable(event.target) || modal.open || event.repeat) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (["ready", "gameover", "victory"].includes(current.mode)) startRun();
    else if (current.mode === "paused") arena.resume();
    else if (current.mode === "playing") arena.pause();
  }
  if (event.code === "Escape") {
    if (current.mode === "playing") arena.pause();
    else if (current.mode === "paused") arena.resume();
  }
  if (event.code === "KeyF" && current.mode === "playing") arena.finisher();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && current.mode === "playing") arena.pause();
});
window.addEventListener("pagehide", persist);
