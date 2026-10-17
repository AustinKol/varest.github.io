import { getDocument, GlobalWorkerOptions } from './assets/vendor/pdfjs/pdf.min.mjs';

const vendorUrl = new URL('./assets/vendor/pdfjs/', import.meta.url);
GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', vendorUrl).href;

// Keep the original PDFs as the only figure assets. Render visible pages at the
// current display resolution, without the native viewer's margins or controls.
const states = new Map();

async function renderFigure(element) {
  const state = states.get(element);
  if (!state.visible || state.failed || element.clientWidth === 0) return;
  if (state.rendering) {
    state.pending = true;
    return;
  }

  const width = Math.round(element.getBoundingClientRect().width);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
  if (state.width === width && state.pixelRatio === pixelRatio) return;

  state.rendering = true;
  element.setAttribute('aria-busy', 'true');
  try {
    if (!state.page) {
      element.querySelector('.pdf-status').textContent = 'Loading figure…';
      const pdfDocument = await getDocument({
        url: element.dataset.pdf,
        // The supplied figures only require the QCMS color-management module.
        wasmUrl: new URL('wasm/', vendorUrl).href,
      }).promise;
      state.page = await pdfDocument.getPage(1);
    }

    const original = state.page.getViewport({ scale: 1 });
    const viewport = state.page.getViewport({ scale: width / original.width });
    element.parentElement.style.setProperty('--pdf-ratio', `${original.width} / ${original.height}`);
    // Bound memory use for unusually large displays while retaining sharp text.
    const resolution = Math.min(pixelRatio, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width * resolution);
    canvas.height = Math.ceil(viewport.height * resolution);
    canvas.setAttribute('aria-hidden', 'true');
    await state.page.render({
      canvasContext: canvas.getContext('2d', { alpha: false }),
      viewport,
      transform: [resolution, 0, 0, resolution, 0, 0],
      background: '#ffffff',
    }).promise;

    // Swap only complete renders, avoiding flashes during a window resize.
    element.replaceChildren(canvas);
    element.dataset.rendered = 'true';
    state.width = width;
    state.pixelRatio = pixelRatio;
  } catch (error) {
    state.failed = true;
    if (!element.querySelector('canvas')) {
      element.querySelector('.pdf-status').textContent = 'Unable to display this figure. Use “Open PDF” below.';
    }
    console.error(`Could not render ${element.dataset.pdf}`, error);
  } finally {
    state.rendering = false;
    element.setAttribute('aria-busy', 'false');
    if (state.pending) {
      state.pending = false;
      renderFigure(element);
    }
  }
}

const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach(({ target, isIntersecting }) => {
    states.get(target).visible = isIntersecting;
    if (isIntersecting) renderFigure(target);
  });
}, { rootMargin: '300px 0px' });

const sizeObserver = new ResizeObserver((entries) => {
  entries.forEach(({ target }) => renderFigure(target));
});

document.querySelectorAll('[data-pdf]').forEach((element) => {
  states.set(element, { visible: false, rendering: false, pending: false, failed: false });
  visibilityObserver.observe(element);
  sizeObserver.observe(element);
});

window.addEventListener('resize', () => {
  states.forEach((state, element) => { if (state.visible) renderFigure(element); });
}, { passive: true });
