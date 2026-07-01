/* Image Grid Component — Reusable grid with captions */
const ImageGrid = (() => {
  /**
   * Render an image grid into a container
   * @param {HTMLElement} container
   * @param {Array} images - [{path, caption, filename}]
   * @param {Object} opts - { editable, cols, onUpdate, onRemove }
   */
  function render(container, images, opts = {}) {
    const cols = opts.cols || 4;
    container.innerHTML = `<div class="grid-${cols}">${images.map((img, i) => `
      <div class="card" style="padding:0;overflow:hidden;position:relative">
        <img src="file://${img.path}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" loading="lazy">
        <div style="padding:8px">
          ${opts.editable !== false
            ? `<textarea class="input" style="height:72px;font-size:0.8rem;resize:vertical" data-idx="${i}">${img.caption || ''}</textarea>`
            : `<p class="text-sm text-muted" style="margin:4px 0">${img.caption || '<em>No caption</em>'}</p>`}
        </div>
        ${opts.onRemove ? `<button class="btn-ghost" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:1.1rem" data-rm="${i}">×</button>` : ''}
      </div>`).join('')}</div>`;

    if (opts.editable !== false && opts.onUpdate) {
      container.querySelectorAll('textarea').forEach(ta => {
        ta.oninput = () => opts.onUpdate(parseInt(ta.dataset.idx), ta.value);
      });
    }
    if (opts.onRemove) {
      container.querySelectorAll('[data-rm]').forEach(btn => {
        btn.onclick = () => opts.onRemove(parseInt(btn.dataset.rm));
      });
    }
  }

  return { render };
})();
