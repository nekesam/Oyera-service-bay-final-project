(function () {
  function go(url, newTab) {
    if (!url) return;
    if (newTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('a, button, form, input, select, label, .ts-wrapper')) return;
    var el = event.target.closest('[data-href]');
    if (!el) return;
    go(el.getAttribute('data-href'), event.metaKey || event.ctrlKey);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var el = document.activeElement;
    if (el && el.hasAttribute && el.hasAttribute('data-href')) {
      go(el.getAttribute('data-href'), false);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var nodes = document.querySelectorAll('[data-href]');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.tagName === 'A') return;
      el.setAttribute('role', 'link');
      el.setAttribute('tabindex', '0');
    });
  });
})();
