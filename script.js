'use strict';

// Start once half the video is visible; leave native controls available.
document.querySelectorAll('video[data-scroll-play]').forEach((video) => {
  if (!('IntersectionObserver' in window)) return;
  let inView = false;
  function updatePlayback() {
    if (!inView || document.hidden) {
      video.pause();
    } else if (!video.ended) {
      // Autoplay restrictions or a quick scroll can reject this promise.
      video.play().catch(() => {});
    }
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
    updatePlayback();
  }, { threshold: [0, 0.5] });
  observer.observe(video);
  document.addEventListener('visibilitychange', updatePlayback);
});

// All content and original-resolution figures remain available without JavaScript.
document.querySelectorAll('[data-gallery]').forEach((gallery) => {
  const tabList = gallery.querySelector('[role="tablist"]');
  const tabs = [...gallery.querySelectorAll('[role="tab"]')];
  const panels = [...gallery.querySelectorAll('[role="tabpanel"]')];
  function selectTab(selected, focus = false) {
    tabs.forEach((tab) => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== selected.getAttribute('aria-controls'); });
    if (focus) selected.focus();
  }
  tabList.hidden = false;
  selectTab(tabs[0]);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
    });
  });
});

const copyButton = document.querySelector('#copy-citation');
const copyStatus = document.querySelector('#copy-status');
copyButton.hidden = false;
copyButton.addEventListener('click', async () => {
  const citation = document.querySelector('#bibtex');
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(citation.textContent);
    copyStatus.textContent = 'Citation copied to clipboard.';
    copyButton.textContent = 'Copied ✓';
    window.setTimeout(() => { copyButton.textContent = 'Copy citation ⧉'; }, 2500);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(citation);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = 'Citation selected. Press Ctrl+C (Windows/Linux) or ⌘C (Mac) to copy.';
  }
});

