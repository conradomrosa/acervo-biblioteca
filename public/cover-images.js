document.addEventListener('DOMContentLoaded', () => {
  const showFallback = (image) => {
    image.hidden = true;
    const fallback = image.parentElement?.querySelector('.cover-fallback');
    if (fallback) fallback.hidden = false;
  };

  document.querySelectorAll('img[data-external-cover]').forEach((image) => {
    image.addEventListener('error', () => showFallback(image), { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback(image);
  });

  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.getAttribute('data-confirm') || 'Confirma esta operação?')) event.preventDefault();
    });
  });

  const input = document.querySelector('[data-cover-url]');
  const preview = document.querySelector('[data-cover-preview]');
  if (!(input instanceof HTMLInputElement) || !(preview instanceof HTMLImageElement)) return;
  const empty = document.querySelector('[data-cover-preview-empty]');
  const update = () => {
    const value = input.value.trim();
    if (!value || !value.startsWith('https://')) {
      preview.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    preview.hidden = false;
    if (empty) empty.hidden = true;
    preview.src = value;
  };
  preview.addEventListener('error', () => {
    preview.hidden = true;
    if (empty) empty.hidden = false;
  }, { once: false });
  input.addEventListener('input', update);
  update();
});
