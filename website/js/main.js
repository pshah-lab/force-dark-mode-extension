/**
 * ThemeSwitcher (Force Dark Mode) — Website JavaScript
 * Lightweight, accessible interactions and privacy-first event telemetry
 */

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initFaqAccordion();
  initInteractiveDemo();
  initAnalyticsTracking();
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

  // Close menu on link click
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

      // Close other open items
      faqItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          const otherBtn = other.querySelector(".faq-question");
          const otherAns = other.querySelector(".faq-answer");
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
          if (otherAns) otherAns.hidden = true;
        }
      });

      // Toggle current item
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
 * Interactive Live Preview Demo in Hero/Product Showcase
 */
function initInteractiveDemo() {
  const demoViewport = document.getElementById("demoViewport");
  const toggleBtn = document.getElementById("demoToggleBtn");
  const demoStatus = document.getElementById("demoStatus");

  if (!demoViewport || !toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    const isDark = demoViewport.classList.contains("is-dark");

    if (isDark) {
      demoViewport.classList.remove("is-dark");
      demoViewport.classList.add("is-light");
      toggleBtn.textContent = "Toggle Dark Mode";
      if (demoStatus) demoStatus.textContent = "Original Light Website";
    } else {
      demoViewport.classList.remove("is-light");
      demoViewport.classList.add("is-dark");
      toggleBtn.textContent = "Toggle Light Mode";
      if (demoStatus) demoStatus.textContent = "ThemeSwitcher Dark Mode Active";
    }
  });
}

/**
 * Privacy-First Telemetry (No PII, No External Tracking Cookies)
 * Dispatches transparent local events adhering to Section 18 of role guidance
 */
function initAnalyticsTracking() {
  // Respect Do Not Track
  if (navigator.doNotTrack === "1") return;

  // Track page view event
  trackEvent("landing_page_view", {
    path: window.location.pathname,
    referrer: document.referrer || "direct",
    timestamp: new Date().toISOString(),
  });

  // Track Chrome Web Store outbound clicks
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

function trackEvent(eventName, payload) {
  // Dispatches custom DOM event for any privacy-compliant analytics collector
  const event = new CustomEvent("fdex_telemetry", {
    detail: { eventName, payload },
  });
  window.dispatchEvent(event);

  if (window.FDEX_DEBUG) {
    console.log(`[Telemetry Event: ${eventName}]`, payload);
  }
}
