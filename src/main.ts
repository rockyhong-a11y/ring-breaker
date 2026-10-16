import "./style.css";
import {
  createArena,
  type ArenaState,
  type ArenaController,
} from "./game/arena";

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
const upgrades = [
  {
    id: "power",
    name: "헤비 히터",
    en: "HEAVY HITTER",
    desc: "공의 공격력 +1. 더 강한 한 방.",
    icon: "bolt",
    color: "lime",
  },
  {
    id: "wide",
    name: "와이드 스탠스",
    en: "WIDE STANCE",
    desc: "패들 너비 +24. 안정적인 리턴.",
    icon: "shield",
    color: "blue",
  },
  {
    id: "multiball",
    name: "태그 팀",
    en: "TAG TEAM",
    desc: "동시에 2개의 공을 추가합니다.",
    icon: "layers",
    color: "orange",
  },
  {
    id: "heal",
    name: "세컨드 윈드",
    en: "SECOND WIND",
    desc: "체력을 1 회복합니다.",
    icon: "heart",
    color: "pink",
  },
  {
    id: "fire",
    name: "파이어 펀치",
    en: "FIRE PUNCH",
    desc: "관통 공격 · 공격력 +1. 수비를 뚫으세요.",
    icon: "fire",
    color: "orange",
  },
  {
    id: "slow",
    name: "타임 아웃",
    en: "TIME OUT",
    desc: "공 속도를 낮춰 링을 장악합니다.",
    icon: "target",
    color: "blue",
  },
];
const waveNames = [
  "오프닝 매치",
  "로프 브레이크",
  "태그 팀 매치",
  "스틸 케이지",
  "로열 럼블",
  "챔피언십",
];
let current: ArenaState = {
  mode: "ready",
  wave: 1,
  lives: 3,
  score: 0,
  combo: 0,
  remaining: 24,
  bossHp: 0,
  bossMaxHp: 0,
  charge: 0,
};
let arena: ArenaController;
let modalPause = false,
  selectedUpgrades: string[] = [],
  lastScore = 0;
let audio: AudioContext | undefined;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header class="site-header">
 <a class="brand" href="/" aria-label="Ring Breaker 홈"><span class="brand-mark">R<span>↗</span></span><span>RING<span class="brand-light">BREAKER</span><small>PRO WRESTLING ROGUELITE</small></span></a>
 <nav class="desktop-nav" aria-label="메인 메뉴"><button class="nav-btn active" data-action="arena">아레나<span class="nav-dot"></span></button><button class="nav-btn" data-action="training">트레이닝</button><button class="nav-btn" data-action="collection">기술 도감</button></nav>
 <div class="header-right"><span class="currency">${icon("gem")}<b data-gems>${n(save.gems)}</b></span><span class="header-divider"></span><button class="icon-btn" data-action="sound" aria-label="사운드 끄기" aria-pressed="true">${icon("volume")}</button><button class="icon-btn" data-action="help" aria-label="게임 방법">${icon("help")}</button></div>
</header>
<main class="page">
 <section class="page-heading"><div><div class="eyebrow"><span></span> THE RING IS YOURS</div><h1>오늘, 링의 주인공은 당신.</h1><p>부수고, 성장하고, 챔피언이 되세요.</p></div><span class="edition">SEASON 01<span>THE FIRST BELL</span></span></section>
 <div class="game-layout">
  <aside class="left-column">
   <section class="run-card"><div class="section-kicker"><span class="live-dot"></span> MAIN EVENT <span class="corner-label">01 — 06</span></div><h2>ROAD TO<br><em>CHAMPION.</em></h2><p class="run-description">작은 한 방에서 시작해<br>챔피언 벨트까지.</p><div class="run-facts"><div>${icon("layers")}<span>고정 웨이브</span><b>6</b></div><div>${icon("heart")}<span>시작 체력</span><b data-start-lives>3</b></div><div>${icon("bolt")}<span>매번 새로운 빌드</span><b>∞</b></div></div><button class="primary-btn" data-action="start"><span>링에 오르기</span>${icon("arrow")}</button><div class="start-hint">한 판, 약 5–10분 · 자동 저장되는 성장</div></section>
   <button class="route-card" data-action="route"><div class="route-top"><span>THE CHAMPIONSHIP</span>${icon("arrow")}</div><div class="wave-route">${Array.from({ length: 6 }, (_, i) => `<span class="route-node ${i === 0 ? "current" : ""}" data-node="${i + 1}">${i === 5 ? icon("trophy") : String(i + 1).padStart(2, "0")}</span>`).join("")}</div><p><span data-route-title>오프닝 매치</span><span data-route-wave>1 / 6</span></p></button>
   <div class="personal-best">${icon("trophy")}<span>나의 최고 기록<b data-best>${n(save.best)} <small>PTS</small></b></span><span class="best-label">PERSONAL<br>BEST</span></div>
  </aside>
  <section class="arena-column" aria-label="게임 아레나">
   <div class="arena-topline"><span><i></i> LIVE FROM THE ARENA</span><div><button class="icon-btn small" data-action="pause" aria-label="일시정지">${icon("pause")}</button><button class="icon-btn small" data-action="fullscreen" aria-label="아레나 전체 화면">${icon("expand")}</button></div></div>
   <div class="arena-cabinet"><div class="arena-scoreboard"><div class="wave-score"><span>WAVE <b data-wave>01</b><small>/ 06</small></span><strong data-wave-name>오프닝 매치</strong></div><div class="score-counter"><small>SCORE</small><b data-score>000000</b></div></div>
    <div class="arena-inner"><div id="game-canvas" aria-label="링 아레나. 드래그 또는 방향키로 패들을 움직이세요." role="application" tabindex="0"></div><div class="arena-watermark" aria-hidden="true">RING<br>BREAKER<span>BREAK. BUILD. REPEAT.</span></div><div class="stage-pill"><span class="live-dot"></span> <span data-stage-label>WAVE 01 · READY TO RUMBLE</span></div><div class="play-prompt" data-ready><span class="tiny-label">YOUR NEXT RUN STARTS HERE</span><strong>LET’S GET READY<br>TO <em>RUMBLE.</em></strong><button data-action="start">링에 오르기 ${icon("arrow")}</button></div><button class="resume-overlay" data-action="resume" hidden>${icon("play")}<strong>PAUSED</strong><span>탭하여 경기 계속하기</span></button><div class="combo" data-combo hidden></div></div>
    <div class="arena-bottomline"><span class="lives" data-lives>${icon("heart")}${icon("heart")}${icon("heart")}</span><span class="arena-brand">RB / WRESTLING CLUB</span><span class="status-led"><i></i> <span data-status>READY</span></span></div>
   </div>
   <div class="arena-controls"><div>${icon("back")}<span>드래그하여 이동 <span class="desktop-control">/ <kbd>←</kbd> <kbd>→</kbd></span></span>${icon("chevron")}</div><button class="finisher-btn" data-action="finisher" disabled>${icon("bolt")}<span>피니셔 <b data-charge>0%</b></span><kbd>F</kbd></button></div><p class="arena-note"><span class="mini-dot"></span> NEVER THE SAME FIGHT TWICE.</p>
  </section>
  <aside class="right-column">
   <section class="fighter-card"><div class="fighter-top"><span>YOUR CONTENDER</span><span class="rarity">★ ORIGINAL</span></div><div class="fighter-art"><span class="fighter-bg-text">EL<br>TIGRE</span><div class="fighter-rays"></div><img src="/assets/wrestler.png" alt="오렌지 마스크를 쓴 프로레슬러 엘 티그레" draggable="false"/><span class="fighter-number">NO.<b>01</b></span></div><div class="fighter-info"><div><h2>엘 티그레</h2><span>EL TIGRE</span></div><span class="role-tag">올라운더</span></div><p class="fighter-quote">“챔피언은 쓰러져도 다시 일어나지.”</p><div class="fighter-stats"><div><span>파워</span><div><i></i><i></i><i></i><i></i><i class="empty"></i></div></div><div><span>컨트롤</span><div><i></i><i></i><i></i><i class="empty"></i><i class="empty"></i></div></div><div><span>잠재력</span><div><i></i><i></i><i></i><i></i><i></i></div></div></div></section>
   <section class="build-card"><div class="build-heading"><h3>이번 경기의 빌드</h3><span data-build-count>0 / 5</span></div><div class="build-slots" data-build>${Array.from({ length: 5 }, () => '<span class="empty-slot">+</span>').join("")}</div><p data-build-caption>웨이브를 돌파하고 기술을 획득하세요.</p><button data-action="collection">기술 도감 보기 ${icon("chevron")}</button></section>
   <button class="training-teaser" data-action="training"><span class="training-icon">${icon("bolt")}</span><span><strong>더 강한 다음 라운드</strong><small>영구 성장 트레이닝</small></span>${icon("arrow")}</button>
  </aside>
 </div>
 <section class="bottom-strip"><div><span class="outline-star">✦</span><span><b>한 번의 패배가, 끝은 아니니까.</b><small>링에서 얻은 챔피언 토큰은 영구 성장으로 이어집니다.</small></span></div><button data-action="training">트레이닝 시작하기 ${icon("arrow")}</button></section>
 <footer><span>© 2026 RING BREAKER</span><span>BUILT FOR THE FIGHT. MADE TO BREAK.</span><span>ARCADE × ROGUELITE</span></footer>
</main>
<nav class="mobile-nav" aria-label="모바일 메뉴"><button data-action="arena" class="active">${icon("target")}<span>아레나</span></button><button data-action="training">${icon("bolt")}<span>트레이닝</span></button><button data-action="collection">${icon("book")}<span>기술 도감</span></button></nav>
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
    o.frequency.exponentialRampToValueAtTime(freq / 2, audio.currentTime + 0.1);
    g.gain.setValueAtTime(0.035, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.13);
  } catch {
    /* Sound is optional. */
  }
}
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) {
  const t = q(".toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3000);
}
function updateSaveUI() {
  document
    .querySelectorAll("[data-gems]")
    .forEach((el) => (el.textContent = n(save.gems)));
  q("[data-best]").innerHTML = `${n(save.best)} <small>PTS</small>`;
  q("[data-start-lives]").textContent = String(3 + save.health);
  q('[data-action="sound"]').innerHTML = icon(save.sound ? "volume" : "mute");
  q('[data-action="sound"]').setAttribute(
    "aria-label",
    save.sound ? "사운드 끄기" : "사운드 켜기",
  );
  q('[data-action="sound"]').setAttribute("aria-pressed", String(save.sound));
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
    `<div class="modal-eyebrow">WELCOME TO THE RING</div><h2>당신의 첫 타이틀 매치.</h2><p class="modal-intro">패들로 공을 튕겨 상대를 쓰러뜨리세요.<br>6번의 경기가 당신을 챔피언으로 만듭니다.</p><div class="help-steps"><div><b>01</b><span><strong>움직이고, 받아치세요</strong><small>화면을 좌우로 드래그하거나 ← → 키로 이동합니다. 패들 가장자리로 칠수록 공이 크게 꺾입니다.</small></span></div><div><b>02</b><span><strong>매 경기, 나만의 기술을</strong><small>웨이브를 깨면 3개 중 하나를 선택합니다. 선택한 기술은 이번 도전 동안 유지됩니다.</small></span></div><div><b>03</b><span><strong>피니셔로 전세를 뒤집으세요</strong><small>공격으로 게이지를 채우고 피니셔 버튼 또는 F를 누르세요. 모든 상대에게 피해를 줍니다.</small></span></div><div><b>04</b><span><strong>패배도 성장의 일부</strong><small>도전 후 받는 토큰으로 트레이닝하세요. 성장은 이 브라우저에 저장됩니다.</small></span></div></div><div class="help-keys"><span><kbd>SPACE</kbd> 발사 / 일시정지</span><span><kbd>ESC</kbd> 일시정지</span></div><button class="primary-btn full" data-action="close">좋아요, 준비됐어요 ${icon("check")}</button>`,
  );
}
function showCollection() {
  openModal(
    `<div class="modal-eyebrow">THE MOVEBOOK</div><h2>승부를 바꾸는 기술.</h2><p class="modal-intro">웨이브 클리어 시 3개 중 하나를 선택하세요.</p><div class="collection-grid">${upgrades.map((u) => `<div class="collection-item"><span class="upgrade-icon ${u.color}">${icon(u.icon)}</span><h3>${u.name}</h3><small>${u.en}</small><p>${u.desc}</p></div>`).join("")}</div>`,
  );
}
const trainingItems = [
  {
    key: "power" as const,
    name: "펀치 파워",
    desc: "매 도전 시작 공격력 +1",
    icon: "bolt",
    max: 4,
  },
  {
    key: "width" as const,
    name: "링 컨트롤",
    desc: "매 도전 패들 너비 +10",
    icon: "shield",
    max: 4,
  },
  {
    key: "health" as const,
    name: "아이언 하트",
    desc: "매 도전 시작 체력 +1",
    icon: "heart",
    max: 2,
  },
];
function showTraining() {
  openModal(
    `<div class="modal-eyebrow">THE TRAINING CLUB</div><h2>다음에는, 더 강하게.</h2><p class="modal-intro">도전이 끝나도 성장은 계속됩니다.</p><div class="training-wallet">${icon("gem")}<b>${n(save.gems)}</b><span>챔피언 토큰</span></div><div class="training-list">${trainingItems
      .map((t) => {
        const lv = save[t.key],
          cost = 75 * (lv + 1);
        return `<div class="training-row"><span class="upgrade-icon lime">${icon(t.icon)}</span><div><h3>${t.name}<small>LV. ${lv} / ${t.max}</small></h3><p>${t.desc}</p></div><button data-buy="${t.key}" ${lv >= t.max || save.gems < cost ? "disabled" : ""}>${lv >= t.max ? "MAX" : `${icon("gem")}${cost}`}</button></div>`;
      })
      .join(
        "",
      )}</div><p class="storage-note">${icon("shield")} 이 기기에 자동 저장 · 구매한 능력은 다음 도전부터 적용</p><div class="career-stats"><span>총 도전<b>${save.runs}</b></span><span>챔피언 등극<b>${save.wins}</b></span><span>최고 점수<b>${n(save.best)}</b></span></div>`,
  );
}
function showRoute() {
  openModal(
    `<div class="modal-eyebrow">ROAD TO CHAMPION</div><h2>여섯 번의 벨.<br>하나의 챔피언.</h2><div class="route-list">${waveNames.map((name, i) => `<div class="route-list-row ${i + 1 === current.wave ? "is-current" : ""}"><b>${String(i + 1).padStart(2, "0")}</b><span><strong>${name}</strong><small>${["기본기를 증명할 시간", "한층 단단해진 상대", "다채로운 상대의 등장", "강철 같은 수비를 뚫어라", "마지막 도전자를 넘어서", "챔피언과의 최후의 승부"][i]}</small></span>${i === 5 ? icon("trophy") : icon("chevron")}</div>`).join("")}</div>`,
  );
}
function showReward() {
  sound(740);
  const choices = upgrades
    .filter(
      (u) =>
        !(
          u.id === "wide" &&
          96 +
            save.width * 10 +
            selectedUpgrades.filter((id) => id === "wide").length * 24 >=
            188
        ) &&
        !(u.id === "multiball" && selectedUpgrades.includes("multiball")) &&
        !(u.id === "heal" && current.lives >= 6) &&
        !(
          u.id === "slow" &&
          selectedUpgrades.filter((id) => id === "slow").length >= 3
        ),
    )
    .map((u) => ({ u, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map((x) => x.u);
  openModal(
    `<div class="modal-eyebrow">WAVE ${String(current.wave).padStart(2, "0")} CLEARED</div><h2>한 단계 더 강하게.</h2><p class="modal-intro">다음 경기를 위한 기술 하나를 선택하세요.</p><div class="reward-options">${choices.map((u) => `<button class="reward-choice" data-upgrade="${u.id}"><span class="upgrade-icon ${u.color}">${icon(u.icon)}</span><span><small>${u.en}</small><strong>${u.name}</strong><p>${u.desc}</p></span>${icon("arrow")}</button>`).join("")}</div><p class="storage-note">기술은 이번 도전 동안 누적됩니다.</p>`,
    true,
  );
}
function renderBuild() {
  q("[data-build-count]").textContent = `${selectedUpgrades.length} / 5`;
  q("[data-build]").innerHTML = Array.from({ length: 5 }, (_, i) => {
    const u = upgrades.find((u) => u.id === selectedUpgrades[i]);
    return u
      ? `<span class="build-slot ${u.color}" title="${u.name}">${icon(u.icon)}</span>`
      : '<span class="empty-slot">+</span>';
  }).join("");
  q("[data-build-caption]").textContent = selectedUpgrades.length
    ? "기술을 쌓아 나만의 챔피언을 만드세요."
    : "웨이브를 돌파하고 기술을 획득하세요.";
}
function startRun() {
  if (modal.open) modal.close();
  selectedUpgrades = [];
  renderBuild();
  save.runs++;
  persist();
  lastScore = 0;
  arena.start({ power: save.power, width: save.width, health: save.health });
  arena.launch();
  sound(600);
  if (window.innerWidth < 1024)
    q(".arena-column").scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  q("#game-canvas").focus({ preventScroll: true });
}
function finish(won: boolean, score: number, wave: number) {
  const earned = Math.max(
    15,
    Math.floor(score / 100) + (wave - 1) * 25 + (won ? 150 : 0),
  );
  save.gems += earned;
  save.best = Math.max(save.best, score);
  if (won) save.wins++;
  persist();
  updateSaveUI();
  sound(won ? 880 : 200);
  openModal(
    `<div class="modal-eyebrow">${won ? "AND THE NEW CHAMPION…" : "THE FIGHT ISN’T OVER"}</div><div class="finish-icon">${icon(won ? "trophy" : "shield")}</div><h2>${won ? "당신이 챔피언입니다." : "다시, 링 위로."}</h2><p class="modal-intro">${won ? "여섯 경기를 넘어 챔피언 벨트를 거머쥐었습니다." : "오늘의 도전이 내일의 힘이 됩니다."}</p><div class="finish-stats"><span>최종 점수<b>${n(score)}</b></span><span>도달 웨이브<b>${String(wave).padStart(2, "0")} / 06</b></span></div><div class="earned-tokens">${icon("gem")} +${earned}<small>챔피언 토큰 획득</small></div><button class="primary-btn full" data-action="start">다시 도전하기 ${icon("arrow")}</button><button class="secondary-btn full" data-action="training">트레이닝으로 더 강해지기 ${icon("bolt")}</button>`,
  );
}
function onChange(state: ArenaState) {
  current = state;
  q("[data-wave]").textContent = String(state.wave).padStart(2, "0");
  q("[data-wave-name]").textContent = waveNames[state.wave - 1] || "챔피언십";
  q("[data-score]").textContent = String(state.score).padStart(6, "0");
  q("[data-route-title]").textContent = waveNames[state.wave - 1] || "챔피언십";
  q("[data-route-wave]").textContent = `${state.wave} / 6`;
  q("[data-stage-label]").textContent =
    `WAVE ${String(state.wave).padStart(2, "0")} · ${state.wave === 6 ? "TITLE MATCH" : state.mode === "ready" ? "READY TO RUMBLE" : "FIGHT FOR THE BELT"}`;
  q("[data-ready]").hidden = state.mode !== "ready";
  q(".arena-watermark").classList.toggle("in-game", state.mode !== "ready");
  q(".resume-overlay").hidden = state.mode !== "paused";
  q("[data-lives]").innerHTML = Array.from(
    { length: Math.max(0, state.lives) },
    () => icon("heart"),
  ).join("");
  q("[data-status]").textContent = state.mode.toUpperCase();
  q("[data-charge]").textContent = `${Math.floor(state.charge)}%`;
  q<HTMLButtonElement>('[data-action="finisher"]').disabled =
    state.charge < 100 || state.mode !== "playing";
  q(".finisher-btn").style.setProperty("--charge", `${state.charge}%`);
  const combo = q("[data-combo]");
  combo.hidden = state.combo < 3;
  combo.innerHTML = `${state.combo}<span>HIT COMBO</span>`;
  document.querySelectorAll<HTMLElement>("[data-node]").forEach((node) => {
    node.classList.toggle("current", Number(node.dataset.node) === state.wave);
    node.classList.toggle("cleared", Number(node.dataset.node) < state.wave);
  });
  const btn = q<HTMLButtonElement>(".run-card [data-action]");
  btn.dataset.action =
    state.mode === "playing"
      ? "pause"
      : state.mode === "paused"
        ? "resume"
        : "start";
  btn.innerHTML = `<span>${state.mode === "playing" ? "잠시 쉬어가기" : state.mode === "paused" ? "경기 계속하기" : "링에 오르기"}</span>${icon(state.mode === "playing" ? "pause" : "arrow")}`;
  if (state.score > lastScore) sound(220 + Math.min(state.combo, 10) * 35);
  lastScore = state.score;
}
arena = createArena(q("#game-canvas"), {
  onChange,
  onReward: showReward,
  onFinish: finish,
});
updateSaveUI();
const editable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    'input,textarea,select,option,[contenteditable]:not([contenteditable="false"])',
  );
for (const name of ["contextmenu", "selectstart", "dragstart"])
  document.addEventListener(name, (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
document.addEventListener("click", (event) => {
  const target = event.target as Element;
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
  const upgrade = target.closest<HTMLElement>("[data-upgrade]");
  if (upgrade) {
    selectedUpgrades.push(upgrade.dataset.upgrade!);
    modal.close();
    modalPause = false;
    renderBuild();
    arena.chooseUpgrade(upgrade.dataset.upgrade!);
    sound(720);
    return;
  }
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;
  switch (action) {
    case "start":
      startRun();
      break;
    case "pause":
      if (current.mode === "playing") arena.pause();
      else if (current.mode === "paused") arena.resume();
      else toast("링에 오른 뒤 경기를 일시정지할 수 있어요.");
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
      q(".arena-column").scrollIntoView({ behavior: "smooth", block: "start" });
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
          .catch(() =>
            toast("이 브라우저에서는 전체 화면을 지원하지 않습니다."),
          );
      else toast("홈 화면에 추가하면 더 넓게 즐길 수 있어요.");
      break;
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (editable(e.target)) return;
  if (modal.open) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (
      current.mode === "ready" ||
      current.mode === "gameover" ||
      current.mode === "victory"
    )
      startRun();
    else if (current.mode === "paused") arena.resume();
    else if (current.mode === "playing") arena.pause();
  }
  if (e.code === "Escape") {
    if (current.mode === "playing") arena.pause();
    else if (current.mode === "paused") arena.resume();
  }
  if (e.code === "KeyF" && current.mode === "playing") arena.finisher();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && current.mode === "playing") arena.pause();
});
window.addEventListener("pagehide", persist);
