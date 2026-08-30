/* Temporary auth-state stub (prompt 02).
   Real Firebase Auth wiring replaces this in prompt 07. Until then, the nav's
   login/logout slot is driven by a value in localStorage so the shell can be
   exercised end-to-end without a backend.

   Contract used by layout.js:
     window.NNAuth.getUser()  -> { username } | null
     window.NNAuth.signIn(username)
     window.NNAuth.signOut()
*/
(function () {
  'use strict';
  var KEY = 'nn_stub_user';

  window.NNAuth = {
    getUser: function () {
      try {
        return JSON.parse(localStorage.getItem(KEY));
      } catch (e) {
        return null;
      }
    },
    signIn: function (username) {
      localStorage.setItem(KEY, JSON.stringify({ username: username }));
    },
    signOut: function () {
      localStorage.removeItem(KEY);
    }
  };
})();
