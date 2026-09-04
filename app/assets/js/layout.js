/* Shared shell (prompt 02) — injects the site nav + footer into every page,
   replacing the old Jinja base.html blocks. Pages include two markers:
     <div id="nn-header" data-nn-header></div>  (top of <body>)
     <div id="nn-footer" data-nn-footer></div>  (bottom of <body>)
   layout.js fills them client-side. The login/logout slot is driven by the
   temporary NNAuth stub (auth-state.js); Firebase replaces it in prompt 07. */
(function () {
  'use strict';

  function navHtml(user) {
    var authSlot;
    if (user && user.username) {
      authSlot =
        '<span class="navbar-text text-white me-3">Welcome, ' + escapeHtml(user.username) + '</span>' +
        '<button type="button" class="btn btn-outline-light btn-sm" data-nn-signout>' +
        '<i class="fas fa-sign-out-alt"></i> Exit</button>';
    } else {
      authSlot =
        '<a class="btn btn-outline-light btn-sm me-2" href="pages/login.html">Login</a>' +
        '<a class="btn btn-light btn-sm" href="pages/signup.html">Sign up</a>';
    }
    return (
      '<nav class="navbar navbar-expand-lg navbar-dark bg-primary">' +
      '  <div class="container">' +
      '    <a class="navbar-brand brand-title text-white" href="index.html">' +
      '      <i class="fas fa-user-ninja"></i> NINJANERD.AI<sup>&trade;</sup></a>' +
      '    <button class="navbar-toggler" type="button" data-bs-toggle="collapse"' +
      '      data-bs-target="#nnNav" aria-controls="nnNav" aria-expanded="false"' +
      '      aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button>' +
      '    <div class="collapse navbar-collapse" id="nnNav">' +
      '      <div class="d-flex align-items-center ms-auto">' + authSlot + '</div>' +
      '    </div>' +
      '  </div>' +
      '</nav>'
    );
  }

  function footerHtml() {
    var year = new Date().getFullYear();
    return (
      '<footer class="ai-disclaimer-footer bg-light border-top mt-auto py-3">' +
      '  <div class="container text-center small text-muted">' +
      '    <p class="mb-1"><i class="fas fa-robot"></i> AI-generated content may not always be accurate.</p>' +
      '    <p class="mb-0">' +
      '      <a href="pages/privacy.html">Privacy Policy</a> &middot; ' +
      '      <a href="pages/terms.html">Terms &amp; Conditions</a> &middot; ' +
      '      &copy; ' + year + ' NINJANERD.AI. All rights reserved.' +
      '    </p>' +
      '  </div>' +
      '</footer>'
    );
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render() {
    var user = window.NNAuth ? window.NNAuth.getUser() : null;
    var header = document.getElementById('nn-header');
    var footer = document.getElementById('nn-footer');
    if (header) header.innerHTML = navHtml(user);
    if (footer) footer.innerHTML = footerHtml();

    var signout = document.querySelector('[data-nn-signout]');
    if (signout) {
      signout.addEventListener('click', function () {
        if (window.NNAuth) window.NNAuth.signOut();
        if (window.NNToast) window.NNToast.show('You have been signed out.', 'info');
        render();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  window.NNLayout = { render: render };
})();
