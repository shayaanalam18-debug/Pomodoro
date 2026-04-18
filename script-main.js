document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  requestAnimationFrame(() => {
    initPomodoro();
    initProgress();
  });
});
