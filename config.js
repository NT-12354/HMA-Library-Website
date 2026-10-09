/* Haile-Manas Academy Library settings.

   While "firebase" is null the site runs in DEMO MODE: two practice accounts, data kept in the
   visitor's own browser. To turn on real Google sign-in with shared data, follow SETUP.md and
   paste the Firebase web app config here, for example:

   firebase: {
     apiKey: "...", authDomain: "your-project.firebaseapp.com", projectId: "your-project",
     appId: "..."
   }

   These values are not secrets. Access is controlled by firestore.rules.
*/
window.HMA_CONFIG = {
  allowedDomain: "hmacademy.org",
  firebase: null
};
