/* Lightweight toast/alert helper (prompt 02) — replaces Flask flash messages.
   Renders Bootstrap alerts into a fixed container so any page can surface
   feedback without server-rendered flash blocks.

   Usage: NNToast.show('Saved', 'success');  // type: success|danger|warning|info
*/
(function () {
  'use strict';
  var CONTAINER_ID = 'nn-toast-container';

  function container() {
    var el = document.getElementById(CONTAINER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CONTAINER_ID;
      el.style.position = 'fixed';
      el.style.top = '1rem';
      el.style.right = '1rem';
      el.style.zIndex = '1080';
      el.style.maxWidth = '22rem';
      document.body.appendChild(el);
    }
    return el;
  }

  window.NNToast = {
    show: function (message, type) {
      type = type || 'info';
      var alert = document.createElement('div');
      alert.className = 'alert alert-' + type + ' alert-dismissible fade show shadow-sm';
      alert.setAttribute('role', 'alert');
      alert.textContent = message;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-close';
      btn.setAttribute('aria-label', 'Close');
      btn.addEventListener('click', function () {
        alert.remove();
      });
      alert.appendChild(btn);
      container().appendChild(alert);
      return alert;
    }
  };
})();
