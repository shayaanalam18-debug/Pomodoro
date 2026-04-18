const POMO_MODAL_ANIM_MS = 140;

function pomoGetModalFocusables(modalEl) {
  if (!modalEl) return [];
  const sel =
    'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(modalEl.querySelectorAll(sel)).filter((el) => el.offsetParent !== null);
}

function openModalWithA11y(modalEl, focusSelector) {
  if (!modalEl) return;
  modalEl._pomoReturnFocus = document.activeElement;
  modalEl.hidden = false;
  requestAnimationFrame(() => {
    modalEl.classList.add("is-open");
    let next = focusSelector ? modalEl.querySelector(focusSelector) : null;
    if (!next) {
      const nodes = pomoGetModalFocusables(modalEl);
      next = nodes[0] || modalEl.querySelector(".modal__panel");
    }
    if (next?.classList?.contains("modal__panel") && !next.hasAttribute("tabindex")) {
      next.setAttribute("tabindex", "-1");
    }
    next?.focus?.({ preventScroll: true });
  });

  const onKeydown = (e) => {
    if (e.key !== "Tab") return;
    const nodes = pomoGetModalFocusables(modalEl);
    const panel = modalEl.querySelector(".modal__panel");
    if (!nodes.length) {
      if (panel && document.activeElement === panel) e.preventDefault();
      return;
    }
    const i = nodes.indexOf(document.activeElement);
    if (e.shiftKey) {
      if (i <= 0) {
        e.preventDefault();
        nodes[nodes.length - 1].focus();
      }
    } else if (i === nodes.length - 1 || i === -1) {
      e.preventDefault();
      nodes[0].focus();
    }
  };
  modalEl._pomoTabTrap = onKeydown;
  modalEl.addEventListener("keydown", onKeydown);
}

function closeModalWithA11y(modalEl) {
  if (!modalEl) return;
  if (modalEl._pomoTabTrap) {
    modalEl.removeEventListener("keydown", modalEl._pomoTabTrap);
    modalEl._pomoTabTrap = null;
  }
  modalEl.classList.remove("is-open");
  setTimeout(() => {
    modalEl.hidden = true;
    const prev = modalEl._pomoReturnFocus;
    modalEl._pomoReturnFocus = null;
    if (prev && typeof prev.focus === "function") prev.focus({ preventScroll: true });
  }, POMO_MODAL_ANIM_MS);
}

