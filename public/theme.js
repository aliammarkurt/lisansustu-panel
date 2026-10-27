// Tema: varsayılan açık; kullanıcının seçimi bu tarayıcıda saklanır.
(function () {
  var t = 'light';
  try { t = localStorage.getItem('lp-tema') || 'light'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
})();
