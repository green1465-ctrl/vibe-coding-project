function initReveal() {
  var revealEls = document.querySelectorAll('.reveal-item:not([data-reveal-init])');
  revealEls.forEach(function(el) {
    el.setAttribute('data-reveal-init', '1');
    var siblings = Array.prototype.filter.call(el.parentElement.children, function(c) {
      return c.classList.contains('reveal-item');
    });
    var idx = siblings.indexOf(el);
    el.style.transitionDelay = (idx * 90) + 'ms';
  });
  var revealObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(function(el) { revealObserver.observe(el); });
}
document.addEventListener('DOMContentLoaded', initReveal);
