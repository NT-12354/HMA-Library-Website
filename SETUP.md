# Turn on Google sign-in

The site works out of the box in demo mode. To let real students and librarians sign in with their school Google accounts and share one set of loans, back it with Firebase (free Spark plan is enough).

1. Go to https://console.firebase.google.com and create a project (any name).
2. **Build > Authentication > Get started > Google**, enable it and choose a support email.
3. **Authentication > Settings > Authorized domains**, add your site's domain, for example `nt-12354.github.io`.
4. **Build > Firestore Database > Create database** (production mode).
5. In Firestore, open **Rules**, paste the contents of `firestore.rules` and publish.
6. **Project settings > Your apps > Web (</>)**, register an app and copy the config.
7. Paste it into `config.js`:
   ```js
   window.HMA_CONFIG = {
     allowedDomain: "hmacademy.org",
     firebase: { apiKey: "...", authDomain: "...firebaseapp.com", projectId: "...", appId: "..." }
   };
   ```
8. Make the first librarian: in Firestore, create a collection `admins` and a document whose **ID is the librarian's school email in lowercase** (for example `jane@hmacademy.org`). Add any field, such as `role: "librarian"`. Do this for each librarian. Only the console can do it.
9. Commit `config.js`. Sign in on the live site; librarians see an **Admin** entry in the account menu.

## If the school domain is not hmacademy.org
Change it in `config.js` (`allowedDomain`) and in `firestore.rules` (`school()`), then publish the rules again. The rules are what actually keep other accounts out; the page check is only for friendly error messages.

## Good to know
- The config values are not secrets. Access is enforced by `firestore.rules`.
- Copy limits and the 3-loan cap are checked by the page, not the rules.
- Firestore asks for an index in the console if it prints a link in the browser console. Click it once.
