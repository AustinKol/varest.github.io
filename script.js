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

// Case explorer. Data comes from assets/cases/cases.js (tools/build_cases.py).
(() => {
  const data = window.VAREST_CASES;
  const root = document.querySelector('#cases');
  if (!data || !root) return;
  const $ = (selector) => root.querySelector(selector);
  const baselines = data.methods.filter((m) => m.key !== 'varest');
  const state = { group: 0, prompt: 0, budget: 0, baseline: 0 };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // A row of toggle buttons; the selected one has aria-pressed="true".
  function toggles(container, labels, selected, onSelect) {
    container.replaceChildren(...labels.map((label, index) => {
      const button = el('button', '', label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === selected));
      button.addEventListener('click', () => { onSelect(index); render(); });
      return button;
    }));
  }

  function verdict(run) {
    const answer = run.iou == null ? run.answer : `IoU ${run.iou.toFixed(2)}`;
    return el('p', `answer ${run.ok ? 'is-ok' : 'is-bad'}`, `${run.ok ? '✓' : '✗'} ${answer}`);
  }

  function shot(src, caption, prompt, run, answer = true) {
    const figure = el('figure', 'shot');
    const frame = el('div', 'frame');
    const img = el('img');
    // No visible caption; the stage and token count show on hover.
    Object.assign(img, { src, alt: caption, title: caption, decoding: 'async' });
    frame.append(img);
    // Grounding cases: draw the ground-truth (dashed) and predicted boxes.
    [[prompt?.gtBox, 'box-gt'], [run?.box, 'box-pred']].forEach(([box, className]) => {
      if (!box) return;
      const [x1, y1, x2, y2] = box.map((v) => Math.min(Math.max(v, 0), 1) * 100);
      const node = el('span', `box ${className}`);
      Object.assign(node.style, { left: `${x1}%`, top: `${y1}%`, width: `${x2 - x1}%`, height: `${y2 - y1}%` });
      frame.append(node);
    });
    figure.append(frame);
    if (run && answer) figure.append(verdict(run));
    return figure;
  }

  // Normalize stage labels to "<where in the model>: <tokens left>".
  function stageCaption(label, run) {
    const count = label.match(/(\d+)$/)?.[1] ?? label.match(/^(\d+) tokens/)?.[1] ?? run.k;
    const layer = label.match(/layer[- ](\d+)/i)?.[1];
    return layer ? `Layer ${layer}: ${count}` : `Before LLM: ${count}`;
  }

  function head(label, run, className) {
    const node = el('div', `case-method-head ${className}`);
    node.append(el('strong', '', label), verdict(run));
    return node;
  }

  // Varest beside one chosen baseline. Rows line up: the first reduction on top,
  // the in-LLM selection below (for baselines with several later stages, a grid of small panels).
  function render() {
    const group = data.groups[state.group];
    const prompt = group.prompts[state.prompt];
    const budgets = data.budgets.map(String);
    const budget = budgets[state.budget];
    root.style.setProperty('--aspect', group.aspect);
    [...$('#case-thumbs').children].forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.group)));
    toggles($('#case-prompts'), group.prompts.map((p) => p.q), state.prompt, (index) => { state.prompt = index; });
    toggles($('#case-budget'), budgets.map((b) => `B = ${b}`), state.budget, (index) => { state.budget = index; });
    toggles($('#case-baseline'), baselines.map((m) => m.label), state.baseline, (index) => { state.baseline = index; });
    $('#case-input').replaceChildren(shot(group.input, group.title));

    const ours = prompt.methods.varest[budget];
    const [, tokens, kept, layer] = ours.info.match(/K=(\d+).*K′=(\d+) after layer (\d+)/) || [];
    const { key, label } = baselines[state.baseline];
    const run = prompt.methods[key][budget];
    const stages = run.panels.map(([caption, src]) => [stageCaption(caption, run), src]);
    const later = stages.slice(1);

    const cells = [
      head('Varest', ours, 'is-ours'), head(label, run, ''),
      shot(ours.panels[0][1], `Before LLM: ${tokens}`, prompt, ours, false),
      shot(stages[0][1], stages[0][0], prompt, run, false),
      shot(ours.panels[1][1], `Layer ${layer}: ${kept}`, prompt, ours, false),
    ];
    if (later.length > 1) {
      const grid = el('div', 'case-stage-grid');
      grid.append(...later.map(([caption, src]) => shot(src, caption, prompt, run, false)));
      cells.push(grid);
    } else {
      cells.push(later.length ? shot(later[0][1], later[0][0], prompt, run, false) : el('span'));
    }
    $('#case-grid').replaceChildren(...cells);
  }

  $('#case-thumbs').replaceChildren(...data.groups.map((group, index) => {
    const button = el('button');
    button.type = 'button';
    const img = el('img');
    Object.assign(img, { src: group.input, alt: '', decoding: 'async' });
    button.append(img, el('span', '', group.title));
    button.addEventListener('click', () => { Object.assign(state, { group: index, prompt: 0 }); render(); });
    return button;
  }));
  root.hidden = false;
  render();
})();

// Varest budget sweep. Data comes from assets/sweep/sweep.js (tools/build_sweep.py).
(() => {
  const data = window.VAREST_SWEEP;
  const root = document.querySelector('#sweep');
  if (!data || !root) return;
  const $ = (selector) => root.querySelector(selector);
  // LLaVA-1.5 encodes an image as a 24 × 24 grid of tokens.
  const FULL_TOKENS = 576;
  const budgets = data.budgets.map(String);
  const state = { group: 0, prompt: 0, budget: budgets.indexOf('32') };
  const slider = $('#sweep-budget');
  const playButton = $('#sweep-play');
  const preloaded = new Set();
  let timer = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function percent(budget) {
    return `${+(budget / FULL_TOKENS * 100).toFixed(2)}%`;
  }

  function verdict(run) {
    const answer = run.iou == null ? run.answer : `IoU ${run.iou.toFixed(2)}`;
    return `${run.ok ? '✓' : '✗'} ${answer}`;
  }

  // The three panels (input, before the LLM, [REL] kept) are built once. Each frame stacks two images: a new
  // budget decodes in the hidden one and then fades in over the old, so the frame never shows empty.
  const panels = [0, 1, 2].map(() => {
    const figure = el('figure', 'sweep-shot');
    const frame = el('div', 'frame');
    const imgs = [el('img'), el('img')];
    imgs.forEach((img) => Object.assign(img, { alt: '', decoding: 'async' }));
    const caption = el('figcaption');
    frame.append(...imgs);
    figure.append(frame, caption);
    $('#sweep-view').append(figure);
    return { frame, imgs, caption, front: 1, settled: 0 };
  });
  const FADE_MS = 250;
  let renderId = 0;

  // Load `src` into the panel's hidden image; resolves to that image once decoded, or null if it already shows.
  // The hidden image is the one that just faded out, so wait for that fade to finish before reusing it.
  async function load(p, src, id) {
    const wait = p.settled - Date.now();
    if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
    if (id !== renderId || p.imgs[p.front].getAttribute('src') === src) return null;
    const back = p.imgs[1 - p.front];
    back.src = src;
    await back.decode().catch(() => {});
    return back;
  }

  // Bring a decoded image to the front; the old one stays opaque underneath until the fade-in has finished.
  function swap(p, img) {
    if (!img) return;
    const old = p.imgs[p.front];
    p.front = p.imgs.indexOf(img);
    p.settled = Date.now() + FADE_MS + 20;
    old.classList.remove('is-front');
    img.classList.add('is-front', 'is-shown');
    window.setTimeout(() => { if (!old.classList.contains('is-front')) old.classList.remove('is-shown'); }, FADE_MS + 20);
  }

  // Grounding questions get the ground-truth (dashed) and predicted boxes.
  function boxes(p, prompt, run) {
    p.frame.querySelectorAll('.box').forEach((node) => node.remove());
    [[prompt.gtBox, 'box-gt'], [run?.box, 'box-pred']].forEach(([box, className]) => {
      if (!box) return;
      const [x1, y1, x2, y2] = box.map((v) => Math.min(Math.max(v, 0), 1) * 100);
      const node = el('span', `box ${className}`);
      Object.assign(node.style, { left: `${x1}%`, top: `${y1}%`, width: `${x2 - x1}%`, height: `${y2 - y1}%` });
      p.frame.append(node);
    });
  }

  function stop() {
    window.clearInterval(timer);
    timer = null;
    playButton.setAttribute('aria-pressed', 'false');
    playButton.innerHTML = '<span aria-hidden="true">▶</span> Play';
  }

  // Step through the budgets once, starting over if already at the last one.
  function play() {
    if (state.budget === budgets.length - 1) state.budget = 0;
    playButton.setAttribute('aria-pressed', 'true');
    playButton.innerHTML = '<span aria-hidden="true">❚❚</span> Pause';
    render();
    timer = window.setInterval(() => {
      if (state.budget >= budgets.length - 1) return stop();
      state.budget += 1;
      render();
    }, 900);
  }

  // Fetch every budget's panels for this question so the slider and playback never wait on images.
  function preload(prompt) {
    const load = () => Object.values(prompt.runs).forEach((run) => [run.w5, run.rel].forEach((src) => {
      if (preloaded.has(src)) return;
      preloaded.add(src);
      new Image().src = src;
    }));
    (window.requestIdleCallback || window.setTimeout)(load);
  }

  function render() {
    const group = data.groups[state.group];
    const prompt = group.prompts[state.prompt];
    const budget = budgets[state.budget];
    const run = prompt.runs[budget];

    [...$('#sweep-thumbs').children].forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.group)));
    // Images, captions, boxes and the answer change together once all three panels have decoded.
    // A newer render (a fast drag, or the next step of playback) supersedes this one.
    const id = ++renderId;
    const views = [
      [group.input, 'Input', null],
      [run.w5, `Before the LLM · ${run.k} tokens${run.text ? ` (${run.text} text)` : ''}`, run],
      [run.rel, `Layer ${run.layer} on · ${run.kept} tokens kept`, run],
    ];
    Promise.all(views.map(([src], i) => load(panels[i], src, id))).then((loaded) => {
      if (id !== renderId) return;
      root.style.setProperty('--aspect', group.aspect);
      views.forEach(([, caption, r], i) => {
        swap(panels[i], loaded[i]);
        panels[i].imgs[panels[i].front].alt = caption;
        panels[i].caption.textContent = caption;
        boxes(panels[i], prompt, r);
      });
      const answer = $('#sweep-answer');
      answer.className = `sweep-answer answer ${run.ok ? 'is-ok' : 'is-bad'}`;
      answer.textContent = verdict(run);
      $('#sweep-expected').textContent = prompt.gtBox ? 'Ground truth: the dashed box.' : `Expected answer: ${prompt.gt}`;
    });

    slider.value = String(state.budget);
    slider.style.setProperty('--f', state.budget / Math.max(budgets.length - 1, 1));
    slider.setAttribute('aria-valuetext', `B = ${budget}, ${percent(budget)} of ${FULL_TOKENS} image tokens; ${run.ok ? 'correct' : 'wrong'}: ${verdict(run).slice(2)}`);
    $('#sweep-budget-value').replaceChildren(`B = ${budget}`, el('small', '', `${percent(budget)} of ${FULL_TOKENS}`));
    [...$('#sweep-marks').children].forEach((mark, index) => {
      const r = prompt.runs[budgets[index]];
      mark.className = `${r.ok ? 'is-ok' : 'is-bad'}${index === state.budget ? ' is-current' : ''}`;
      mark.title = `B = ${budgets[index]}: ${verdict(r)}`;
    });
    [...$('#sweep-ticks').children].forEach((tick, index) => tick.setAttribute('aria-current', String(index === state.budget)));
    preload(prompt);
  }

  function selectGroup(index) {
    Object.assign(state, { group: index, prompt: 0 });
    const group = data.groups[index];
    $('#sweep-bench').textContent = `· ${group.bench}`;
    $('#sweep-prompts').replaceChildren(...group.prompts.map((p, i) => {
      const label = el('label');
      const input = el('input');
      Object.assign(input, { type: 'radio', name: 'sweep-prompt', value: String(i), checked: i === 0 });
      input.addEventListener('change', () => { state.prompt = i; render(); });
      label.append(input, el('span', '', p.q));
      return label;
    }));
  }

  $('#sweep-thumbs').replaceChildren(...data.groups.map((group, index) => {
    const button = el('button');
    button.type = 'button';
    button.title = group.title;
    const img = el('img');
    Object.assign(img, { src: group.input, alt: '', decoding: 'async' });
    button.append(img, el('span', '', group.title));
    button.addEventListener('click', () => { selectGroup(index); render(); });
    return button;
  }));

  // Marks and tick labels sit at the slider's stops; on narrow screens only every third label shows.
  const at = (index) => `${index / Math.max(budgets.length - 1, 1) * 100}%`;
  $('#sweep-marks').replaceChildren(...budgets.map((_, index) => {
    const mark = el('i');
    mark.style.left = at(index);
    return mark;
  }));
  $('#sweep-ticks').replaceChildren(...budgets.map((budget, index) => {
    const tick = el('button', index % 3 ? 'is-minor' : '', budget);
    tick.type = 'button';
    tick.tabIndex = -1;
    tick.style.left = at(index);
    tick.addEventListener('click', () => { stop(); state.budget = index; render(); });
    return tick;
  }));
  slider.max = String(budgets.length - 1);
  slider.addEventListener('input', () => { stop(); state.budget = Number(slider.value); render(); });
  playButton.addEventListener('click', () => (timer ? stop() : play()));

  selectGroup(0);
  root.hidden = false;
  render();
})();

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

