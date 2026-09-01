(function () {
  "use strict";

  var activeModal = null;
  var previousFocusedElement = null;

  var styles = `
    :host {
      all: initial;
      font-family: Arial, Helvetica, sans-serif;
    }

    .overlay {
      align-items: center;
      background: rgba(18, 29, 25, 0.72);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 24px;
      position: fixed;
      z-index: 2147483000;
    }

    .dialog {
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
      display: flex;
      flex-direction: column;
      height: min(760px, calc(100vh - 48px));
      max-width: 620px;
      overflow: hidden;
      position: relative;
      width: 100%;
    }

    .dialog-header {
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      flex: 0 0 auto;
      gap: 16px;
      justify-content: space-between;
      padding: 18px 22px;
    }

    .dialog-heading {
      color: #006b3c;
      font-size: 18px;
      font-weight: 700;
      line-height: 1.25;
      margin: 0;
    }

    .close {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 999px;
      color: #374151;
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 auto;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 28px;
      height: 40px;
      justify-content: center;
      line-height: 1;
      margin: -8px -10px -8px 0;
      padding: 0;
      width: 40px;
    }

    .close:hover,
    .close:focus-visible {
      background: #f0fdf4;
      color: #006b3c;
      outline: 2px solid #61d600;
      outline-offset: 2px;
    }

    iframe {
      border: 0;
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      width: 100%;
    }

    @media (max-width: 640px) {
      .overlay {
        padding: 0;
      }

      .dialog {
        border-radius: 0;
        height: 100vh;
        max-width: none;
      }

      .dialog-header {
        padding: 15px 18px;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .dialog {
        animation: kinetics-modal-in 160ms ease-out;
      }
    }

    @keyframes kinetics-modal-in {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;

  function getUrl(value) {
    if (!value) return null;
    try {
      return new URL(value, document.baseURI).href;
    } catch (_error) {
      return null;
    }
  }

  function close() {
    if (!activeModal) return;
    var previousOverflow = activeModal.previousOverflow || "";
    activeModal.remove();
    activeModal = null;
    document.body.style.overflow = previousOverflow;
    if (previousFocusedElement && typeof previousFocusedElement.focus === "function") {
      previousFocusedElement.focus();
    }
    previousFocusedElement = null;
  }

  function open(options) {
    var registrationUrl = getUrl(options && options.registrationUrl);
    if (!registrationUrl) return false;

    close();
    previousFocusedElement = document.activeElement;

    var host = document.createElement("div");
    var shadow = host.attachShadow({ mode: "closed" });
    var overlay = document.createElement("div");
    var dialog = document.createElement("div");
    var header = document.createElement("div");
    var heading = document.createElement("h2");
    var closeButton = document.createElement("button");
    var iframe = document.createElement("iframe");
    var style = document.createElement("style");

    style.textContent = styles;
    overlay.className = "overlay";
    overlay.setAttribute("aria-hidden", "false");
    dialog.className = "dialog";
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-labelledby", "kinetics-registration-title");
    header.className = "dialog-header";
    heading.id = "kinetics-registration-title";
    heading.className = "dialog-heading";
    heading.textContent = options.title || "Register your interest";
    closeButton.className = "close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close registration form");
    closeButton.innerHTML = "&times;";
    iframe.title = "Hub registration form";
    iframe.src = registrationUrl;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });

    header.appendChild(heading);
    header.appendChild(closeButton);
    dialog.appendChild(header);
    dialog.appendChild(iframe);
    overlay.appendChild(dialog);
    shadow.appendChild(style);
    shadow.appendChild(overlay);
    document.body.appendChild(host);

    activeModal = host;
    activeModal.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.focus();
    return true;
  }

  function setupTrigger(trigger) {
    if (trigger.getAttribute("data-kinetics-registration-ready") === "true") return;
    trigger.setAttribute("data-kinetics-registration-ready", "true");
    trigger.addEventListener("click", function (event) {
      var registrationUrl = trigger.getAttribute("data-registration-url") || trigger.getAttribute("href");
      var opened = open({
        registrationUrl: registrationUrl,
        title: trigger.getAttribute("data-hub-title") || "Register your interest",
      });
      if (opened) event.preventDefault();
    });
  }

  function setup() {
    document.querySelectorAll("[data-kinetics-hub-register]").forEach(setupTrigger);
  }

  window.KineticsHubRegistration = {
    open: open,
    close: close,
    refresh: setup,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();