/**
 * ThemeSwitcher (Force Dark Mode) — Website Client Script
 * Ultra-smooth interactive before/after split slider, extension popup simulator,
 * accessible accordions, and privacy-first event telemetry.
 */

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initFaqAccordion();
  initSplitScreenSlider();
  initExtensionPopupSimulator();
  initAnalyticsTracking();
  countVisit();
  initFeedbackForm();
});

/**
 * Mobile Navigation Toggle with ARIA Support
 */
function initMobileNav() {
  const toggleBtn = document.querySelector(".mobile-toggle");
  const navMenu = document.querySelector(".nav-menu");

  if (!toggleBtn || !navMenu) return;

  toggleBtn.addEventListener("click", () => {
    const isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
    toggleBtn.setAttribute("aria-expanded", String(!isExpanded));
    navMenu.classList.toggle("open");
  });

  navMenu.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      toggleBtn.setAttribute("aria-expanded", "false");
      navMenu.classList.remove("open");
    });
  });
}

/**
 * Accessible FAQ Accordion
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll(".faq-item");

  faqItems.forEach((item) => {
    const button = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");

    if (!button || !answer) return;

    button.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");

      // Close other items
      faqItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          const otherBtn = other.querySelector(".faq-question");
          const otherAns = other.querySelector(".faq-answer");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
          if (otherAns) otherAns.hidden = true;
        }
      });

      if (isOpen) {
        item.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
        answer.hidden = true;
      } else {
        item.classList.add("open");
        button.setAttribute("aria-expanded", "true");
        answer.hidden = false;
      }
    });
  });
}

/**
 * Interactive Before / After Split-Screen Comparison Slider
 * Allows smooth horizontal dragging or keyboard arrow control
 */
function initSplitScreenSlider() {
  const container = document.getElementById("splitSliderContainer");
  const darkLayer = document.getElementById("splitDarkLayer");
  const handle = document.getElementById("sliderHandle");

  if (!container || !darkLayer || !handle) return;

  let isDragging = false;

  function updateSliderPosition(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    darkLayer.style.clipPath = `polygon(0 0, ${clamped}% 0, ${clamped}% 100%, 0 100%)`;
    handle.style.left = `${clamped}%`;
    handle.setAttribute("aria-valuenow", Math.round(clamped));
  }

  function handlePointerMove(e) {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const offset = clientX - rect.left;
    const percent = (offset / rect.width) * 100;
    updateSliderPosition(percent);
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", handlePointerMove);
    document.removeEventListener("mouseup", stopDragging);
    document.removeEventListener("touchmove", handlePointerMove);
    document.removeEventListener("touchend", stopDragging);
  }

  function startDragging(e) {
    // Do not hijack clicks on the interactive popup simulator
    if (e.target.closest && e.target.closest(".floating-extension-popup")) {
      return;
    }
    isDragging = true;
    document.addEventListener("mousemove", handlePointerMove);
    document.addEventListener("mouseup", stopDragging);
    document.addEventListener("touchmove", handlePointerMove, { passive: true });
    document.addEventListener("touchend", stopDragging);
    handlePointerMove(e);
  }

  container.addEventListener("mousedown", startDragging);
  container.addEventListener("touchstart", startDragging, { passive: true });

  // Keyboard accessibility
  handle.addEventListener("keydown", (e) => {
    const current = parseFloat(handle.getAttribute("aria-valuenow") || "52");
    if (e.key === "ArrowLeft") {
      updateSliderPosition(current - 5);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      updateSliderPosition(current + 5);
      e.preventDefault();
    }
  });

  // Hero "Interactive Demo" button smooth scroll + attention pulse
  const heroDemoBtn = document.querySelector('a[href="#demo-section"]');
  if (heroDemoBtn) {
    heroDemoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      container.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        handle.classList.add("slider-pulse");
        setTimeout(() => handle.classList.remove("slider-pulse"), 1200);
      }, 400);
    });
  }
}

/**
 * Interactive Floating Extension Popup Simulator Widget
 * Interacts directly with the mock viewport
 */
function initExtensionPopupSimulator() {
  const toggleBtn = document.getElementById("simToggleSwitch");
  const toggleStatusDot = document.getElementById("simStatusDot");
  const toggleStatusText = document.getElementById("simStatusText");
  const darkLayer = document.getElementById("splitDarkLayer");
  const colorPicker = document.getElementById("simColorPicker");
  const engineRadios = document.querySelectorAll('input[name="sim-engine"]');
  const simRecommendation = document.getElementById("simRecommendation");

  if (!toggleBtn || !darkLayer) return;

  // Toggle On/Off
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isActive = toggleBtn.classList.contains("is-active");

    if (isActive) {
      toggleBtn.classList.remove("is-active");
      if (toggleStatusDot) toggleStatusDot.style.background = "#64748b";
      if (toggleStatusText) toggleStatusText.textContent = "Dark Mode Disabled";
      darkLayer.style.opacity = "0";
      darkLayer.style.pointerEvents = "none";
    } else {
      toggleBtn.classList.add("is-active");
      if (toggleStatusDot) toggleStatusDot.style.background = "var(--accent-success, #10b981)";
      if (toggleStatusText) toggleStatusText.textContent = "Dark Mode Enabled";
      darkLayer.style.opacity = "1";
      darkLayer.style.pointerEvents = "auto";
    }
  });

  // Background color customization
  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
      e.stopPropagation();
      const color = e.target.value;
      darkLayer.style.background = color;
      darkLayer.style.setProperty("--simulated-bg", color);
    });
  }

  // Engine radio options
  engineRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const engine = e.target.value;
      if (!simRecommendation) return;

      if (engine === "auto") {
        simRecommendation.textContent = "Auto · CSS Engine recommended (high confidence)";
        darkLayer.style.filter = "none";
      } else if (engine === "css") {
        simRecommendation.textContent = "CSS Engine active · Layout-safe recoloring";
        darkLayer.style.filter = "none";
      } else if (engine === "invert") {
        simRecommendation.textContent = "Invert Engine active · Smart media protection";
        darkLayer.style.filter = "invert(0.9) hue-rotate(180deg)";
      }
    });
  });
}

/**
 * Privacy-First Telemetry (No PII, No Tracking Cookies)
 */
function initAnalyticsTracking() {
  if (navigator.doNotTrack === "1") return;

  trackEvent("landing_page_view", {
    path: window.location.pathname,
    referrer: document.referrer || "direct",
    timestamp: new Date().toISOString(),
  });

  document.querySelectorAll('a[href*="chromewebstore"], .btn-chrome-store').forEach((link) => {
    link.addEventListener("click", () => {
      trackEvent("chrome_store_click", {
        source_page: window.location.pathname,
        link_id: link.id || "cws_link",
        timestamp: new Date().toISOString(),
      });
    });
  });
}

/**
 * Cookie-free visit counter. Once per browser, sends one empty beacon to the developer's own
 * site (pshah.fun), which adds 1 to a single total. No cookies, identifiers, page or referrer
 * data are sent. Skipped when Do Not Track is on and anywhere other than the live site.
 */
const VISIT_COUNTER_URL = "https://pshah.fun/api/darkmode-visit";

function countVisit() {
  if (location.hostname !== "darkmode.pshah.fun" || navigator.doNotTrack === "1" || !navigator.sendBeacon) return;
  try {
    if (localStorage.getItem("fdm:visit-counted") === "1") return;
    localStorage.setItem("fdm:visit-counted", "1");
  } catch (e) {
    return; // Storage blocked: don't count rather than count this browser repeatedly.
  }
  navigator.sendBeacon(VISIT_COUNTER_URL);
}

function trackEvent(eventName, payload) {
  const event = new CustomEvent("fdex_telemetry", {
    detail: { eventName, payload },
  });
  window.dispatchEvent(event);
}

/**
 * Interactive Feedback & Suggestion Form Handler
 * Validates submissions, records them locally, opens pre-filled email client,
 * and provides clear confirmation feedback to the user.
 */
function initFeedbackForm() {
  const form = document.getElementById("feedbackForm");
  const statusEl = document.getElementById("feedbackStatus");
  const submitBtn = document.getElementById("submitFeedbackBtn");

  if (!form || !statusEl || !submitBtn) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const typeInput = form.querySelector('input[name="feedbackType"]:checked');
    const feedbackType = typeInput ? typeInput.value : "Feature Suggestion";
    const urlInput = document.getElementById("feedbackUrl");
    const targetUrl = urlInput ? urlInput.value.trim() : "";
    const messageInput = document.getElementById("feedbackMessage");
    const message = messageInput ? messageInput.value.trim() : "";
    const emailInput = document.getElementById("feedbackEmail");
    const userEmail = emailInput ? emailInput.value.trim() : "";

    if (!message) {
      statusEl.className = "feedback-status error";
      statusEl.textContent = "Please enter your suggestion or feedback before submitting.";
      statusEl.hidden = false;
      if (messageInput) messageInput.focus();
      return;
    }

    // Disable button temporarily for UX
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>Recording...</span>
    `;

    // 1. Save feedback record locally in browser for audit
    try {
      const records = JSON.parse(localStorage.getItem("fdex_feedback_entries") || "[]");
      records.push({
        type: feedbackType,
        url: targetUrl,
        message,
        email: userEmail,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem("fdex_feedback_entries", JSON.stringify(records));
    } catch (err) {
      // LocalStorage might be disabled/private mode
    }

    // 2. Dispatch telemetry
    trackEvent("feedback_submitted", {
      type: feedbackType,
      has_url: Boolean(targetUrl),
      has_email: Boolean(userEmail)
    });

    // 3. Construct pre-filled email draft link
    const subject = encodeURIComponent(`[ThemeSwitcher Feedback] ${feedbackType}${targetUrl ? " - " + targetUrl : ""}`);
    const bodyContent = encodeURIComponent(
      `Feedback Type: ${feedbackType}\n` +
      `Target URL: ${targetUrl || "N/A"}\n` +
      `User Email: ${userEmail || "Anonymous"}\n\n` +
      `Suggestion / Improvement Details:\n${message}\n\n` +
      `---\nSubmitted via ThemeSwitcher Support (darkmode.pshah.fun)`
    );
    const mailtoUrl = `mailto:pshah.lab@gmail.com?subject=${subject}&body=${bodyContent}`;

    // Prompt email client in background
    setTimeout(() => {
      window.location.href = mailtoUrl;
    }, 400);

    // 4. Update UI to success state
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;

      statusEl.className = "feedback-status success";
      statusEl.innerHTML = `
        <strong>🎉 Thank you for your feedback!</strong><br />
        Your ${feedbackType.toLowerCase()} has been captured and a pre-formatted email draft was prepared.
        We review all community contributions to make ThemeSwitcher even better.
      `;
      statusEl.hidden = false;

      // Reset form fields
      form.reset();
    }, 800);
  });
}


