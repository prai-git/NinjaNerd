/* Auth state bridge (prompt 07; replaces the prompt-02 localStorage stub).

   layout.js is a CLASSIC script and reads window.NNAuth.getUser() synchronously while
   rendering the nav. Firebase Auth is an ES module and restores the session ASYNCHRONOUSLY,
   so a signed-in user would otherwise see "Login / Sign up" flash on every page load before
   the real state arrives.

   This file bridges the two. It holds the last known user, so the nav paints correctly
   immediately, and js/auth.js pushes the authoritative value in via _set() once Firebase has
   resolved, then calls NNLayout.render() to repaint.

   THE CACHE IS DISPLAY-ONLY. It decides what the nav draws and nothing else. Anyone can edit
   localStorage; access is enforced by the Firestore rules on Google's servers, which never
   see this value. Never gate anything that matters on it -- gate on the Firebase user.

   Contract (unchanged from 02, so layout.js needs no edit):
     window.NNAuth.getUser() -> { username, uid, emailVerified, is_admin } | null
     window.NNAuth.signOut()
   Added:
     window.NNAuth._set(user)   // called by js/auth.js
*/
(function () {
  'use strict';
  var KEY = 'nn_auth_cache';
  var cached = null;

  try {
    cached = JSON.parse(localStorage.getItem(KEY));
  } catch (e) {
    cached = null;
  }

  window.NNAuth = {
    getUser: function () {
      return cached;
    },

    // Pushed by js/auth.js on every Firebase auth-state change.
    _set: function (user) {
      cached = user || null;
      try {
        if (user) localStorage.setItem(KEY, JSON.stringify(user));
        else localStorage.removeItem(KEY);
      } catch (e) { /* private mode: in-memory only, still correct for this page */ }
    },

    signOut: function () {
      // Clear the cache first so the nav repaints instantly, then tell Firebase.
      window.NNAuth._set(null);
      if (window.NNAuthApi && window.NNAuthApi.logout) window.NNAuthApi.logout();
    }
  };
})();
