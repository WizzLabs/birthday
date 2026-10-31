(() => {
  "use strict";

  /* =======================================================================
     Screen Elements & State
     ========================================================================= */
  const orientationGate    = document.getElementById("orientation-gate");
  const landingScreen      = document.getElementById("landing");
  const afterScreen        = document.getElementById("after-scene");
  const afterTransitionEl  = document.getElementById("after-transition");
  const afterWelcomeEl     = document.getElementById("after-welcome");

  const landingVideo       = document.getElementById("scene-video");
  const landingFallback    = document.getElementById("scene-fallback");
  const afterVideo         = document.getElementById("after-video");

  const form               = document.getElementById("name-form");
  const nameInput          = document.getElementById("visitor-name");
  const errorEl            = document.getElementById("gate-error");

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const ASSETS = {
    landingVideo:         "assets/video-in.mp4",
    landingVideoFallback: "video-in.mp4",
    afterVideo:           "assets/video-af.mp4",
    afterVideoFallback:   "video-af.mp4",
    sceneryFallback:      "scenery-fallback.png"
  };

  // "landing" → "after-transition" → "after-welcome"
  let currentScreen = "landing";

  /* =======================================================================
     Device / orientation detection
     Touch devices in portrait show the orientation gate.
     Desktop windows resized narrow must NEVER trigger it.
     ========================================================================= */
  const isTouchDevice = () =>
    (window.matchMedia("(pointer: coarse)").matches &&
     window.matchMedia("(hover: none)").matches) ||
    (navigator.maxTouchPoints > 0 &&
     window.matchMedia("(pointer: coarse)").matches);

  const isPortrait = () => window.matchMedia("(orientation: portrait)").matches;

  function updateOrientationGate() {
    if (!orientationGate) return;
    const shouldShow = isTouchDevice() && isPortrait();
    orientationGate.hidden = !shouldShow;

    if (shouldShow) {
      // Pause active videos while gate is covering the screen
      if (landingVideo && !landingVideo.paused) landingVideo.pause();
      if (afterVideo   && !afterVideo.paused)   afterVideo.pause();
      const rewardVideo = document.getElementById("reward-video");
      if (rewardVideo && !rewardVideo.paused)   rewardVideo.pause();
    } else {
      if (!reducedMotionQuery.matches) {
        if (currentScreen === "landing" && landingVideo && landingVideo.paused) {
          landingVideo.play().catch(() => {});
        } else if (
          (currentScreen === "after-transition" || currentScreen === "after-welcome") &&
          afterVideo && afterVideo.paused
        ) {
          afterVideo.play().catch(() => {});
        }
      }
    }
  }

  /* =======================================================================
     Screen 1: Landing video (video-in.mp4)
     video-in.mp4 is 576×1024 portrait-encoded but content is rotated 90° CW.
     The CSS class .scene__media--rotated corrects orientation via transform.
     Script only handles fade-in and fallback; rotation is purely CSS.
     ========================================================================= */
  function setupLandingVideo() {
    if (!landingVideo) return;

    if (reducedMotionQuery.matches) {
      landingVideo.hidden = true;
      landingVideo.pause();
      return;
    }

    let revealDone = false;

    const revealLandingVideo = () => {
      if (revealDone) return;
      revealDone = true;
      if (landingFallbackTimer) { clearTimeout(landingFallbackTimer); landingFallbackTimer = null; }
      landingVideo.classList.add("is-ready");
    };

    const hideLandingVideo = () => {
      if (revealDone) return;  // already revealed — don't hide
      revealDone = true;
      landingVideo.hidden = true;
    };

    landingVideo.addEventListener("canplay", revealLandingVideo, { once: true });

    landingVideo.addEventListener("error", () => {
      // First failure: try root-level fallback path
      if (landingVideo.src.includes("assets/")) {
        landingVideo.src = ASSETS.landingVideoFallback;
        landingVideo.load();
        landingVideo.play().catch(() => {});
        return;
      }
      hideLandingVideo();
    }, { once: true });

    let landingFallbackTimer = setTimeout(() => {
      if (!landingVideo.classList.contains("is-ready")) hideLandingVideo();
    }, 5000);

    landingVideo.play().catch(() => {});
  }

  // Fallback-image path safety
  if (landingFallback) {
    landingFallback.addEventListener("error", () => {
      if (landingFallback.src.includes("assets/")) landingFallback.src = ASSETS.sceneryFallback;
    }, { once: true });
  }

  /* =======================================================================
     Name validation
     ========================================================================= */
  function isCorrectName(v) { return v.trim().toLowerCase() === "bee"; }

  function showError(msg) {
    if (errorEl)   errorEl.textContent = msg;
    if (nameInput) nameInput.classList.add("is-invalid");
  }

  function clearError() {
    if (errorEl)   errorEl.textContent = "";
    if (nameInput) nameInput.classList.remove("is-invalid");
  }

  /* =======================================================================
     Transition + After scene (video-af.mp4)

     Architecture
     ────────────
     There is ONE screen for both phases: #after-scene.
     video-af.mp4 plays behind everything from the moment Bee submits.

     Phase A — transition: "The world opens soon…" is shown over the video
               while it buffers.  A minimum display time of 1 200 ms also
               applies (anticipation beat), so even on fast connections the
               transition text doesn't flash.

     Phase B — welcome: once BOTH (canplay has fired) AND (min delay has
               elapsed), the transition text fades out and the welcome text
               fades in over the same still-playing video.

     No solid-colour interim screen, no separate element swap, no timer-only
     approach.  The video is the background from start to end.
     ========================================================================= */
  function startAfterScene() {
    currentScreen = "after-transition";

    // Pause and dismiss landing
    if (landingVideo) landingVideo.pause();
    if (landingScreen) landingScreen.hidden = true;

    // Reveal after-scene immediately so the video can start behind the text
    if (afterScreen) afterScreen.hidden = false;

    // Ensure transition text is visible and welcome text is hidden
    if (afterTransitionEl) afterTransitionEl.classList.remove("is-fading-out");
    if (afterWelcomeEl)    { afterWelcomeEl.hidden = true; afterWelcomeEl.classList.remove("is-visible"); }

    if (reducedMotionQuery.matches) {
      // Reduced-motion: skip video, go straight to welcome text
      completedVideoReady = true;
      completedMinDelay   = true;
      revealWelcomeIfReady();
      return;
    }

    // Start loading and playing video-af.mp4
    afterVideo.src = ASSETS.afterVideo;
    afterVideo.load();
    afterVideo.play().catch(() => {});

    // Listen for canplay (enough data to play without stalling)
    afterVideo.addEventListener("canplay", onAfterVideoReady, { once: true });

    // Error: try root-level path
    afterVideo.addEventListener("error", onAfterVideoError, { once: true });

    // Minimum display time for transition text (1 200 ms of anticipation)
    const MIN_TRANSITION_MS = 1200;
    setTimeout(() => {
      completedMinDelay = true;
      revealWelcomeIfReady();
    }, MIN_TRANSITION_MS);
  }

  let completedVideoReady = false;
  let completedMinDelay   = false;

  function onAfterVideoReady() {
    afterVideo.classList.add("is-ready");  // triggers CSS fade-in of the video
    completedVideoReady = true;
    revealWelcomeIfReady();
  }

  function onAfterVideoError() {
    if (afterVideo.src.includes("assets/")) {
      afterVideo.src = ASSETS.afterVideoFallback;
      afterVideo.load();
      afterVideo.play().catch(() => {});
      afterVideo.addEventListener("canplay", onAfterVideoReady, { once: true });
    } else {
      // Both paths failed — still reveal welcome text over the dark background
      completedVideoReady = true;
      revealWelcomeIfReady();
    }
  }

  function revealWelcomeIfReady() {
    // Both conditions must be met before switching to welcome phase
    if (!completedVideoReady || !completedMinDelay) return;

    currentScreen = "after-welcome";

    // Fade out transition text
    if (afterTransitionEl) {
      afterTransitionEl.classList.add("is-fading-out");
      // After the fade-out transition completes, hide it from the DOM flow
      afterTransitionEl.addEventListener("transitionend", () => {
        afterTransitionEl.hidden = true;
      }, { once: true });
    }

    // Fade in welcome text
    if (afterWelcomeEl) {
      afterWelcomeEl.hidden = false;       // removes display:none
      // Force a reflow so the opacity transition fires from 0 → 1
      afterWelcomeEl.getBoundingClientRect();
      afterWelcomeEl.classList.add("is-visible");
    }

    // Let the welcome message land, then step into the gameplay scene
    setTimeout(enterMemoryWorld, 2200);
  }

  /* =======================================================================
     SCREEN 5: Memory World gameplay (Minecraft-style hotbar scene)

     Architecture
     ────────────
     Layered on top of the already-playing video-af.mp4 world (#after-scene).
     Nine hotbar slots: 1-8 are memory photographs, 9 is the chest.
     Opening a photograph completes that memory's quest. Completing all
     eight reveals a reward prompt; watching the reward unlocks the chest.
     All progress persists via localStorage.
     ========================================================================= */
  const hud               = document.getElementById("game-hud");
  const hotbarEl          = document.querySelector(".hotbar");
  const hotbarSlotsEl     = document.getElementById("hotbar-slots");
  const hotbarFrame       = document.getElementById("hotbar-frame");

  const hudBanner         = document.getElementById("hud-banner");
  const rewardPrompt      = document.getElementById("reward-prompt");

  const questToggle       = document.getElementById("quest-toggle");
  const questProgressBtn  = document.getElementById("quest-toggle-progress");
  const questPanel        = document.getElementById("quest-panel");
  const questClose        = document.getElementById("quest-close");
  const questList         = document.getElementById("quest-list");
  const questProgressText = document.getElementById("quest-progress-text");

  const viewerEl          = document.getElementById("memory-viewer");
  const viewerMedia       = document.getElementById("viewer-media");
  const viewerCaption     = document.getElementById("viewer-caption");

  const rewardOverlay     = document.getElementById("reward-overlay");
  const rewardVideoEl     = document.getElementById("reward-video");
  const rewardFallback    = document.getElementById("reward-fallback");
  const rewardClose       = document.getElementById("reward-close");
  const rewardPromptLabel = document.getElementById("reward-prompt-label");

  const letterOverlay     = document.getElementById("letter-overlay");
  const letterTextEl      = document.getElementById("letter-text");
  const letterSkip        = document.getElementById("letter-skip");
  const letterMore        = document.getElementById("letter-more");
  const letterClose       = document.getElementById("letter-close");

  const finalOverlay      = document.getElementById("final-overlay");
  const finalLine1        = document.getElementById("final-line1");
  const finalLine2        = document.getElementById("final-line2");
  const finalAfter        = document.getElementById("final-after");
  const finalRevisit      = document.getElementById("final-revisit");

  const STORAGE_KEY = "bee-memory-world-v1";

  // Eight memory slots — real photos supplied via assets/memory-N.jpg
  const MEMORIES = [
    { id: 1, img: "assets/memory-1.jpg", caption: "Memory 1" },
    { id: 2, img: "assets/memory-2.jpg", caption: "Memory 2" },
    { id: 3, img: "assets/memory-3.jpg", caption: "Memory 3" },
    { id: 4, img: "assets/memory-4.jpg", caption: "Memory 4" },
    { id: 5, img: "assets/memory-5.jpg", caption: "Memory 5" },
    { id: 6, img: "assets/memory-6.jpg", caption: "Memory 6" },
    { id: 7, img: "assets/memory-7.jpg", caption: "Memory 7" },
    { id: 8, img: "assets/memory-8.jpg", caption: "Memory 8" }
  ];

  // Ported verbatim from the old project's CONFIG.letter — revealed paragraph
  // by paragraph (staggered fade-in) when the chest is opened.
  const CHEST_LETTER = [
    "Happy Birthday, Bee! \u2661",
    "I hope this new chapter brings you countless reasons to smile, little adventures to remember, and dreams that slowly become real.",
    "Thank you for being part of so many of my memories.",
    "No matter how many blocks we place or worlds we explore, I'll always be glad that our paths crossed.",
    "Keep being your wonderful self, Bee. You deserve a beautiful year ahead.",
    "Happy Birthday, Mitsubee! \ud83c\udf37"
  ];

  // Ported verbatim from the old project's CONFIG.final — shown in the
  // "One More Thing..." scene reached from the letter overlay.
  const FINAL_TEXT = [
    "I'm sorry I didn't become the friend you wanted me to be.",
    "Byee, your old sidekick."
  ];

  // Not uploaded yet (large file) — add assets/video-reward.mp4 later and it will
  // just work. Until then the reward step shows a graceful "on its way" fallback.
  const REWARD_VIDEO_SRC = "assets/video-reward.mp4";

  // Three independent, persisted flags drive the reward/book sequence:
  //   rewardUnlocked — all 8 quests done; reward is available (replayable forever)
  //   rewardWatched  — the reward video has genuinely reached its "ended" event at least once
  //   bookUnlocked   — set the moment rewardWatched first becomes true; stays true after
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("no state");
      const parsed = JSON.parse(raw);
      const quests = Array.isArray(parsed.quests) && parsed.quests.length === 8
        ? parsed.quests.map(Boolean)
        : new Array(8).fill(false);
      const rewardWatched = !!parsed.rewardWatched;
      // Migrate state saved by an earlier version of this scene, where only
      // `rewardWatched` existed: infer the two new flags from what we have.
      const rewardUnlocked = typeof parsed.rewardUnlocked === "boolean"
        ? parsed.rewardUnlocked
        : (rewardWatched || quests.filter(Boolean).length === 8);
      const bookUnlocked = typeof parsed.bookUnlocked === "boolean"
        ? parsed.bookUnlocked
        : rewardWatched;
      return {
        quests,
        rewardUnlocked,
        rewardWatched,
        bookUnlocked,
        selectedSlot: typeof parsed.selectedSlot === "number" ? parsed.selectedSlot : 0
      };
    } catch (_) {
      return {
        quests: new Array(8).fill(false),
        rewardUnlocked: false,
        rewardWatched: false,
        bookUnlocked: false,
        selectedSlot: 0
      };
    }
  }

  let state = loadState();

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { /* storage unavailable — progress just won't persist */ }
  }

  function completedCount() { return state.quests.filter(Boolean).length; }
  function allQuestsComplete() { return completedCount() === 8; }

  /* ---- Hotbar ---- */
  function buildHotbar() {
    hotbarSlotsEl.innerHTML = "";

    MEMORIES.forEach((mem, i) => {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "hotbar__slot";
      if (state.quests[i]) slot.classList.add("is-complete");
      slot.dataset.index = String(i);
      slot.setAttribute("aria-label", `Open ${mem.caption}`);

      const thumb = document.createElement("span");
      thumb.className = "hotbar__thumb";
      if (mem.img) {
        thumb.style.backgroundImage = `url("${mem.img}")`;
        thumb.classList.add("hotbar__thumb--photo");
      } else {
        thumb.classList.add("hotbar__thumb--placeholder");
        thumb.innerHTML =
          '<svg viewBox="0 0 16 16" width="60%" height="60%" aria-hidden="true">' +
          '<rect x="1" y="3" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
          '<circle cx="6" cy="8" r="1.5" fill="currentColor"/>' +
          '<path d="M2 12 L6 8.5 L9 11 L11 8.5 L14 12" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
          '</svg>';
      }

      const check = document.createElement("span");
      check.className = "hotbar__check";
      check.textContent = "\u2713";

      slot.appendChild(thumb);
      slot.appendChild(check);
      slot.addEventListener("click", () => selectSlot(i, { open: true }));
      hotbarSlotsEl.appendChild(slot);
    });

    // Ninth slot: the chest, ported from the old project's gift-box div
    // (there it was a plain emoji button — no separate chest artwork exists,
    // so the emoji icon is preserved as-is rather than inventing new art).
    const chestSlot = document.createElement("button");
    chestSlot.type = "button";
    chestSlot.id = "hotbar-chest-slot";
    chestSlot.className = "hotbar__slot hotbar__slot--chest";
    chestSlot.dataset.index = "8";
    chestSlot.setAttribute("aria-label", "A Little Something for You");

    const chestThumb = document.createElement("span");
    chestThumb.className = "hotbar__thumb hotbar__thumb--chest";
    chestThumb.textContent = "\ud83c\udf81";
    chestThumb.setAttribute("aria-hidden", "true");

    const lock = document.createElement("span");
    lock.className = "hotbar__lock";
    lock.innerHTML =
      '<svg viewBox="0 0 16 16" width="52%" height="52%" aria-hidden="true">' +
      '<rect x="3" y="7" width="10" height="7" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M5 7 V5 a3 3 0 0 1 6 0 V7" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg>';

    chestSlot.appendChild(chestThumb);
    chestSlot.appendChild(lock);
    chestSlot.addEventListener("click", () => selectSlot(8, { open: true }));
    hotbarSlotsEl.appendChild(chestSlot);

    updateHotbarLockState();
  }

  function updateHotbarLockState() {
    const chestSlot = document.getElementById("hotbar-chest-slot");
    if (!chestSlot) return;
    chestSlot.classList.toggle("is-locked", !state.bookUnlocked);
  }

  function selectSlot(index, opts) {
    opts = opts || {};
    state.selectedSlot = index;
    saveState();
    positionFrame(index);

    const slots = hotbarSlotsEl.querySelectorAll(".hotbar__slot");
    slots.forEach((s, i) => s.classList.toggle("is-selected", i === index));

    if (!opts.open) return;

    if (index === 8) {
      openChestFromHotbar();
    } else {
      openMemory(index);
    }
  }

  function positionFrame(index) {
    const slots = hotbarSlotsEl.querySelectorAll(".hotbar__slot");
    const target = slots[index];
    if (!target || !hotbarFrame || !hotbarEl) return;
    const slotRect   = target.getBoundingClientRect();
    const hotbarRect = hotbarEl.getBoundingClientRect();
    const offsetX    = slotRect.left - hotbarRect.left + slotRect.width / 2;
    hotbarFrame.style.left = offsetX + "px";
  }

  window.addEventListener("resize", () => {
    if (hudEntered) positionFrame(state.selectedSlot);
  });

  /* ---- Memory viewer ---- */
  function openMemory(index) {
    const mem = MEMORIES[index];
    if (!mem) return;

    viewerMedia.innerHTML = "";
    if (mem.img) {
      const img = document.createElement("img");
      img.src = mem.img;
      img.alt = mem.caption;
      viewerMedia.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "viewer__placeholder";
      ph.innerHTML =
        '<svg viewBox="0 0 16 16" width="54" height="54" aria-hidden="true">' +
        '<rect x="1" y="3" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1"/>' +
        '<circle cx="6" cy="8" r="1.6" fill="currentColor"/>' +
        '<path d="M2 12 L6 8.5 L9 11 L11 8.5 L14 12" fill="none" stroke="currentColor" stroke-width="0.9"/>' +
        '</svg><p>This memory is on its way.</p>';
      viewerMedia.appendChild(ph);
    }
    viewerCaption.textContent = mem.caption;

    viewerEl.hidden = false;
    requestAnimationFrame(() => viewerEl.classList.add("is-visible"));

    completeQuest(index);
  }

  function closeMemory() {
    viewerEl.classList.remove("is-visible");
    setTimeout(() => { viewerEl.hidden = true; }, 220);
  }

  viewerEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeMemory();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!viewerEl.hidden) closeMemory();
    if (!letterOverlay.hidden) closeLetterOverlay();
    if (!finalOverlay.hidden) closeFinalScene();
    if (!questPanel.hidden) closeQuestPanel();
    if (!rewardOverlay.hidden) closeReward();
  });

  /* ---- Quests ---- */
  function completeQuest(index) {
    if (state.quests[index]) return;
    state.quests[index] = true;
    saveState();

    const slotEl = hotbarSlotsEl.children[index];
    if (slotEl) slotEl.classList.add("is-complete");

    renderQuestList();
    updateQuestProgress();

    if (allQuestsComplete()) handleAllQuestsComplete();
  }

  function renderQuestList() {
    questList.innerHTML = "";
    MEMORIES.forEach((mem, i) => {
      const li = document.createElement("li");
      li.className = "quest-list__item" + (state.quests[i] ? " is-complete" : "");
      const mark = document.createElement("span");
      mark.className = "quest-list__mark";
      mark.textContent = state.quests[i] ? "\u2713" : "";
      const label = document.createElement("span");
      label.className = "quest-list__label";
      label.textContent = mem.caption;
      li.appendChild(mark);
      li.appendChild(label);
      questList.appendChild(li);
    });
  }

  function updateQuestProgress() {
    const n = completedCount();
    questProgressBtn.textContent = `${n}/8`;
    questProgressText.textContent = allQuestsComplete()
      ? "All memories recovered!"
      : `Progress: ${n}/8`;
  }

  function openQuestPanel() {
    questPanel.hidden = false;
    requestAnimationFrame(() => questPanel.classList.add("is-open"));
    questToggle.setAttribute("aria-expanded", "true");
  }
  function closeQuestPanel() {
    questPanel.classList.remove("is-open");
    questToggle.setAttribute("aria-expanded", "false");
    setTimeout(() => { questPanel.hidden = true; }, 220);
  }
  questToggle.addEventListener("click", () => {
    if (questPanel.hidden) openQuestPanel(); else closeQuestPanel();
  });
  questClose.addEventListener("click", closeQuestPanel);

  /* ---- All quests complete → unlock the reward (not "watched" yet) ---- */
  let bannerShownThisSession = false;

  function handleAllQuestsComplete() {
    closeQuestPanel();
    if (!bannerShownThisSession) {
      bannerShownThisSession = true;
      hudBanner.hidden = false;
      requestAnimationFrame(() => hudBanner.classList.add("is-visible"));
      setTimeout(() => {
        hudBanner.classList.remove("is-visible");
        setTimeout(() => { hudBanner.hidden = true; }, 500);
      }, 3200);
    }
    if (!state.rewardUnlocked) {
      state.rewardUnlocked = true;
      saveState();
    }
    showRewardPrompt();
  }

  // The prompt stays visible for the rest of the experience once unlocked —
  // it is never hidden again, so Bee can always reopen/replay the reward.
  function showRewardPrompt() {
    updateRewardPromptLabel();
    rewardPrompt.hidden = false;
    requestAnimationFrame(() => rewardPrompt.classList.add("is-visible"));
  }

  function updateRewardPromptLabel() {
    rewardPromptLabel.textContent = state.rewardWatched
      ? "Watch Again"
      : "A Gift Has Appeared";
  }

  rewardPrompt.addEventListener("click", openReward);

  /* ---- Reward video ----
     Opening never changes any persisted state. Closing (via the × button,
     backdrop, or a load error) never changes any persisted state either —
     it only hides the overlay. The ONLY thing that marks the reward as
     watched and unlocks the book is the video's real "ended" event. */
  function openReward() {
    if (!state.rewardUnlocked) return; // locked — shouldn't be reachable from the UI

    rewardOverlay.hidden = false;
    requestAnimationFrame(() => rewardOverlay.classList.add("is-visible"));
    rewardFallback.hidden = true;
    rewardVideoEl.hidden = false;

    // Never play world video + reward video at once
    if (afterVideo && !afterVideo.paused) afterVideo.pause();

    // Avoid stacking listeners across repeated opens/replays
    rewardVideoEl.removeEventListener("error", onRewardError);
    rewardVideoEl.removeEventListener("ended", onRewardEnded);

    rewardVideoEl.src = REWARD_VIDEO_SRC;
    rewardVideoEl.currentTime = 0;
    rewardVideoEl.load();

    const playPromise = rewardVideoEl.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => { /* autoplay blocked — controls stay available */ });
    }

    rewardVideoEl.addEventListener("error", onRewardError, { once: true });
    rewardVideoEl.addEventListener("ended", onRewardEnded, { once: true });
  }

  function onRewardError() {
    // Missing/broken file (e.g. video-reward.mp4 not uploaded yet) — show a
    // graceful fallback. This is NOT a viewing, so it must not mark watched.
    rewardVideoEl.hidden = true;
    rewardFallback.hidden = false;
  }

  function onRewardEnded() {
    markRewardWatched();
    closeReward();
  }

  function markRewardWatched() {
    if (state.rewardWatched) return; // already watched — don't re-trigger the unlock pulse
    state.rewardWatched = true;
    state.bookUnlocked = true;
    saveState();
    updateHotbarLockState();
    updateRewardPromptLabel();
    announceBookUnlocked();
  }

  // Closing the player — by the × button or the backdrop — only closes the
  // player. It must never revoke rewardUnlocked or rewardWatched.
  function closeReward() {
    rewardOverlay.classList.remove("is-visible");
    setTimeout(() => {
      rewardOverlay.hidden = true;
      rewardVideoEl.pause();
      rewardVideoEl.removeAttribute("src");
      rewardVideoEl.load();
    }, 260);

    // Resume the world's background video
    if (afterVideo && afterVideo.paused && !reducedMotionQuery.matches) {
      afterVideo.play().catch(() => {});
    }
  }

  rewardClose.addEventListener("click", closeReward);
  rewardOverlay.addEventListener("click", (e) => {
    if (e.target === rewardOverlay) closeReward();
  });

  function announceBookUnlocked() {
    const chestSlot = document.getElementById("hotbar-chest-slot");
    if (!chestSlot) return;
    chestSlot.classList.add("is-newly-unlocked");
    setTimeout(() => chestSlot.classList.remove("is-newly-unlocked"), 2600);
  }

  /* ---- Chest (ported mechanism) ----
     Source behaviour (index.html #chest / letter()):
       - click opens an overlay that reveals CONFIG.letter paragraph by
         paragraph (staggered fade-in, ~600ms + 1300ms per line), with a
         confetti burst and a beep.
       - "Reveal all" instantly shows every paragraph.
       - once the sequence has fully revealed, a "There's One More Thing..."
         button appears; clicking it closes the letter and opens the final
         apology scene.
     Ported as faithfully as the architecture allows: the overlay look is
     restyled with this site's own panel language instead of the old
     project's hardcoded purple/pink palette, since nothing else here uses
     those colors — but the timing, structure and button behavior are
     unchanged from the source. */
  let letterTimers = [];
  let letterEverOpened = false;

  function clearLetterTimers() {
    letterTimers.forEach(clearTimeout);
    letterTimers = [];
  }

  function openChestFromHotbar() {
    if (!state.bookUnlocked) return; // locked until the reward has been watched once
    letterEverOpened = true;
    openLetter();
  }

  function openLetter() {
    letterTextEl.innerHTML = "";
    letterMore.hidden = true;
    clearLetterTimers();

    const stagger = reducedMotionQuery.matches ? 0 : 600;
    const step    = reducedMotionQuery.matches ? 0 : 1300;

    CHEST_LETTER.forEach((line, i) => {
      const p = document.createElement("p");
      p.className = "letter__line";
      p.textContent = line;
      letterTextEl.appendChild(p);
      letterTimers.push(setTimeout(() => p.classList.add("is-visible"), stagger + i * step));
    });
    letterTimers.push(setTimeout(() => { letterMore.hidden = false; }, stagger + CHEST_LETTER.length * step));

    spawnConfetti();
    showLetterOverlay();
  }

  function showLetterOverlay() {
    letterOverlay.hidden = false;
    requestAnimationFrame(() => letterOverlay.classList.add("is-visible"));
  }

  function closeLetterOverlay() {
    letterOverlay.classList.remove("is-visible");
    clearLetterTimers();
    setTimeout(() => { letterOverlay.hidden = true; }, 220);
  }

  function revealAllLetterLines() {
    clearLetterTimers();
    letterTextEl.querySelectorAll(".letter__line").forEach((p) => p.classList.add("is-visible"));
    letterMore.hidden = false;
  }

  function spawnConfetti() {
    if (reducedMotionQuery.matches) return;
    const colors = ["var(--blossom)", "var(--gold)", "#9fd6ff"];
    for (let i = 0; i < 22; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = (Math.random() * 100) + "%";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.8) + "s";
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3600);
    }
  }

  letterSkip.addEventListener("click", revealAllLetterLines);
  letterClose.addEventListener("click", closeLetterOverlay);
  letterOverlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-letter-close]")) closeLetterOverlay();
  });
  letterMore.addEventListener("click", () => {
    closeLetterOverlay();
    openFinalScene();
  });

  /* ---- Final scene ("One More Thing...") ----
     Source behaviour (index.html #s3 / msg() / #rep):
       - CONFIG.final's two lines are typed out character-by-character
         (55ms/char) into two paragraphs.
       - once typing finishes, a photo frame + closing lines + a
         "Revisit Our World" button appear.
       - "Revisit Our World" clears all progress and returns to the start,
         exactly like the source's sc("s1") reset.
     Shown here as an overlay above the already-playing world video rather
     than a brand-new background scene, so the landing page and world art
     are not redesigned. */
  let finalTyping = null;

  function openFinalScene() {
    clearInterval(finalTyping);
    finalLine1.textContent = "";
    finalLine2.textContent = "";
    finalAfter.hidden = true;

    finalOverlay.hidden = false;
    requestAnimationFrame(() => finalOverlay.classList.add("is-visible"));

    if (reducedMotionQuery.matches) {
      finalLine1.textContent = FINAL_TEXT[0];
      finalLine2.textContent = FINAL_TEXT[1];
      finalAfter.hidden = false;
      return;
    }

    const all = FINAL_TEXT[0] + "\n" + FINAL_TEXT[1];
    let n = 0;
    finalTyping = setInterval(() => {
      n++;
      const t = all.slice(0, n).split("\n");
      finalLine1.textContent = t[0] || "";
      finalLine2.textContent = t[1] || "";
      if (n >= all.length) {
        clearInterval(finalTyping);
        finalAfter.hidden = false;
      }
    }, 55);
  }

  function closeFinalScene() {
    finalOverlay.classList.remove("is-visible");
    setTimeout(() => { finalOverlay.hidden = true; }, 220);
  }

  finalRevisit.addEventListener("click", () => {
    clearInterval(finalTyping);
    closeFinalScene();
    revisitWorld();
  });

  // Resets all persisted progress and returns to the landing screen —
  // mirrors the source's $("#rep").onclick handler (found.clear(); build();
  // sc("s1")). Only ever runs from this explicit button click, never
  // automatically.
  function revisitWorld() {
    state = {
      quests: new Array(8).fill(false),
      rewardUnlocked: false,
      rewardWatched: false,
      bookUnlocked: false,
      selectedSlot: 0
    };
    saveState();
    letterEverOpened = false;
    bannerShownThisSession = false;
    hudEntered = false;

    hudBanner.classList.remove("is-visible");
    hudBanner.hidden = true;
    rewardPrompt.classList.remove("is-visible");
    rewardPrompt.hidden = true;

    buildHotbar();
    renderQuestList();
    updateQuestProgress();
    updateHotbarLockState();

    hud.classList.remove("is-visible");
    hud.hidden = true;

    if (afterVideo) {
      afterVideo.pause();
      afterVideo.removeAttribute("src");
      afterVideo.load();
    }
    if (afterTransitionEl) afterTransitionEl.classList.remove("is-fading-out");
    if (afterWelcomeEl) { afterWelcomeEl.hidden = true; afterWelcomeEl.classList.remove("is-visible"); }
    afterScreen.hidden = true;

    currentScreen = "landing";
    landingScreen.hidden = false;
    if (nameInput) nameInput.value = "";
    clearError();
    setupLandingVideo();
  }

  /* ---- Enter the gameplay scene (called once welcome text has shown) ---- */
  let hudEntered = false;

  function enterMemoryWorld() {
    if (hudEntered) return;
    hudEntered = true;

    buildHotbar();
    renderQuestList();
    updateQuestProgress();
    updateHotbarLockState();

    hud.hidden = false;
    requestAnimationFrame(() => {
      hud.classList.add("is-visible");
      selectSlot(state.selectedSlot, { open: false });
    });

    // Restore persisted progress exactly as it was left — a refresh must
    // never re-lock something that was already unlocked.
    if (state.rewardUnlocked) showRewardPrompt();
  }

  /* =======================================================================
     Form submit handler
     ========================================================================= */
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = nameInput ? nameInput.value : "";

      if (!value.trim()) {
        showError("The world is waiting to hear your name.");
        if (nameInput) nameInput.focus();
        return;
      }

      if (!isCorrectName(value)) {
        showError("Hmm, this world doesn't recognize that name. Try again?");
        if (nameInput) { nameInput.focus(); nameInput.select(); }
        return;
      }

      clearError();
      // Reset gate state for this run
      completedVideoReady = false;
      completedMinDelay   = false;
      startAfterScene();
    });
  }

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      if (errorEl && errorEl.textContent) clearError();
    });
  }

  /* =======================================================================
     Orientation / resize monitoring
     ========================================================================= */
  window.addEventListener("resize", updateOrientationGate);

  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener("change", updateOrientationGate);
  } else {
    window.addEventListener("orientationchange", updateOrientationGate);
  }

  /* =======================================================================
     prefers-reduced-motion dynamic handling
     ========================================================================= */
  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", (e) => {
      if (e.matches) {
        if (landingVideo) { landingVideo.pause(); landingVideo.hidden = true; }
        if (afterVideo)   { afterVideo.pause();   afterVideo.hidden  = true; }
      } else {
        if (currentScreen === "landing" && landingVideo) {
          landingVideo.hidden = false;
          setupLandingVideo();
        } else if (
          (currentScreen === "after-transition" || currentScreen === "after-welcome") &&
          afterVideo
        ) {
          afterVideo.hidden = false;
          afterVideo.play().catch(() => {});
        }
      }
    });
  }

  /* =======================================================================
     Initialise
     ========================================================================= */
  updateOrientationGate();
  setupLandingVideo();
})();
