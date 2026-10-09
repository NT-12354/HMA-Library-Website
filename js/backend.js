/* Haile-Manas Academy Library: accounts and shared data.

   Two interchangeable backends with the same methods:
   - "firebase": real Google sign-in limited to the school domain, shared Firestore database,
     student/admin roles enforced by firestore.rules. Used when config.js has a firebase config.
   - "demo": no real accounts. Everything stays in this browser so the site can be tried before
     Firebase is set up. Never use demo mode for real student records.

   Loan life cycle:  requested (held 48 h)  ->  borrowed (due in 14 days)  ->  returned
                     requested -> cancelled
*/
(function () {
  "use strict";
  var DAY = 864e5, HOLD_MS = 2 * DAY, LOAN_MS = 14 * DAY;
  var FB_VERSION = "10.12.2", FB_BASE = "https://www.gstatic.com/firebasejs/" + FB_VERSION + "/";

  function now() { return Date.now(); }
  function rid() { return Math.random().toString(36).slice(2, 10) + now().toString(36); }
  function isLive(taken) { return taken.kind === "loan" || (taken.until || 0) > now(); }

  /* What each action changes on a loan, and what it does to the public "taken" marker. */
  function loanPatch(action, loan) {
    var t = now();
    if (action === "checkin") return { status: "borrowed", borrowedAt: t, dueAt: t + LOAN_MS };
    if (action === "return") return { status: "returned", returnedAt: t };
    if (action === "cancel") return { status: "cancelled" };
    if (action === "extend") return { dueAt: (loan.dueAt || t) + 7 * DAY, extended: (loan.extended || 0) + 1 };
    throw new Error("Unknown action: " + action);
  }
  function takenFor(action, patch) {
    if (action === "checkin") return { set: { kind: "loan", until: patch.dueAt } };
    if (action === "extend") return { set: { until: patch.dueAt } };
    return { remove: true }; // return, cancel
  }
  function newLoan(user, book) {
    var t = now();
    return { bookId: String(book.id), title: book.title, uid: user.uid, name: user.name, email: user.email,
      status: "requested", requestedAt: t, expiresAt: t + HOLD_MS };
  }
  function isExpiredHold(l) { return l.status === "requested" && l.expiresAt <= now(); }
  function countTaken(list) {
    var out = {};
    list.forEach(function (t) { if (isLive(t)) out[t.bookId] = (out[t.bookId] || 0) + 1; });
    return out;
  }
  function checkAllowed(action, loan, user) {
    var admin = user && user.role === "admin", own = user && loan.uid === user.uid;
    if (!admin && !own) throw new Error("You can only change your own loans.");
    if (!admin) {
      if (action === "checkin" && loan.status !== "requested") throw new Error("This book is not on hold.");
      if (action === "checkin" && isExpiredHold(loan)) throw new Error("The hold has expired. Borrow the book again.");
      if (action === "return" && loan.status !== "borrowed") throw new Error("This book is not on loan.");
      if (action === "cancel" && loan.status !== "requested") throw new Error("Only a hold can be cancelled.");
      if (action === "extend") throw new Error("Ask a librarian to extend a loan.");
    }
  }

  /* ================= demo backend ================= */
  function demo(cfg) {
    var KEY = "hma-demo-db-v1", UKEY = "hma-demo-user-v1", mem = null, listener = function () {};
    var domain = cfg.allowedDomain || "hmacademy.org";
    var USERS = {
      student: { uid: "demo-student", name: "Demo Student", email: "student@" + domain, role: "student", photo: "" },
      admin: { uid: "demo-admin", name: "Demo Librarian", email: "librarian@" + domain, role: "admin", photo: "" }
    };
    function read() {
      try { var r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {}
      return mem || { loans: [], taken: {}, questions: [], edits: {}, added: [] };
    }
    function write(d) { mem = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
    function current() {
      try { var k = sessionStorage.getItem(UKEY); if (k && USERS[k]) return USERS[k]; } catch (e) {}
      return null;
    }
    function ok(v) { return Promise.resolve(v); }
    return {
      mode: "demo",
      onAuth: function (cb) { listener = cb; setTimeout(function () { cb(current()); }, 0); },
      signIn: function (opt) {
        var k = opt && opt.role === "admin" ? "admin" : "student";
        try { sessionStorage.setItem(UKEY, k); } catch (e) {}
        listener(USERS[k]); return ok(USERS[k]);
      },
      signOut: function () { try { sessionStorage.removeItem(UKEY); } catch (e) {} listener(null); return ok(); },
      loadOverlay: function () { var d = read(); return ok({ edits: d.edits, added: d.added }); },
      loadTaken: function () {
        var d = read(), list = Object.keys(d.taken).map(function (k) { return d.taken[k]; });
        return ok(countTaken(list));
      },
      myLoans: function (user) {
        var d = read(), changed = false;
        d.loans.forEach(function (l) { if (isExpiredHold(l)) { l.status = "cancelled"; delete d.taken[l.id]; changed = true; } });
        if (changed) write(d);
        return ok(d.loans.filter(function (l) { return l.uid === user.uid; }));
      },
      allLoans: function () { return ok(read().loans.slice()); },
      borrow: function (user, book) {
        var d = read(), l = newLoan(user, book); l.id = rid();
        d.loans.push(l); d.taken[l.id] = { bookId: l.bookId, kind: "hold", until: l.expiresAt };
        write(d); return ok(l);
      },
      act: function (loan, action, user) {
        var d = read(), l = d.loans.filter(function (x) { return x.id === loan.id; })[0];
        if (!l) return Promise.reject(new Error("Loan not found."));
        try { checkAllowed(action, l, user); } catch (e) { return Promise.reject(e); }
        var p = loanPatch(action, l); Object.keys(p).forEach(function (k) { l[k] = p[k]; });
        var t = takenFor(action, p);
        if (t.remove) delete d.taken[l.id]; else d.taken[l.id] = Object.assign(d.taken[l.id] || { bookId: l.bookId }, t.set);
        write(d); return ok(l);
      },
      saveBook: function (id, fields) { var d = read(); d.edits[id] = Object.assign(d.edits[id] || {}, fields); write(d); return ok(); },
      addBook: function (fields) {
        var d = read(), id = "n" + rid(), rec = Object.assign({ id: id }, fields);
        d.added.push(rec); write(d); return ok(rec);
      },
      saveAdded: function (id, fields) {
        var d = read(); d.added = d.added.map(function (b) { return b.id === id ? Object.assign(b, fields) : b; }); write(d); return ok();
      },
      ask: function (user, q) {
        var d = read(), rec = { id: rid(), uid: user.uid, name: user.name, email: user.email, topic: q.topic, message: q.message, createdAt: now(), status: "open" };
        d.questions.push(rec); write(d); return ok(rec);
      },
      myQuestions: function (user) { return ok(read().questions.filter(function (q) { return q.uid === user.uid; })); },
      allQuestions: function () { return ok(read().questions.slice()); },
      answer: function (id, text, user) {
        var d = read(); d.questions.forEach(function (q) { if (q.id === id) { q.status = "answered"; q.reply = text; q.repliedAt = now(); q.repliedBy = user.name; } });
        write(d); return ok();
      }
    };
  }

  /* ================= firebase backend ================= */
  function firebase(cfg) {
    var domain = (cfg.allowedDomain || "hmacademy.org").toLowerCase();
    var L = null, app, auth, db, listener = function () {};
    function lib() {
      if (L) return L;
      L = Promise.all([import(FB_BASE + "firebase-app.js"), import(FB_BASE + "firebase-auth.js"), import(FB_BASE + "firebase-firestore.js")])
        .then(function (m) {
          var o = { A: m[0], U: m[1], F: m[2] };
          app = o.A.initializeApp(cfg.firebase); auth = o.U.getAuth(app); db = o.F.getFirestore(app);
          return o;
        });
      return L;
    }
    function col(F, name) { return F.collection(db, name); }
    function rows(snap) { return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
    function schoolEmail(u) {
      return u && u.email && u.emailVerified && u.email.toLowerCase().slice(-(domain.length + 1)) === "@" + domain;
    }
    return {
      mode: "firebase",
      onAuth: function (cb) {
        listener = cb;
        lib().then(function (o) {
          o.U.onAuthStateChanged(auth, function (u) {
            if (!u) { cb(null); return; }
            if (!schoolEmail(u)) {
              o.U.signOut(auth).then(function () { cb(null, "Please sign in with your school account (@" + domain + ")."); });
              return;
            }
            o.F.getDoc(o.F.doc(db, "admins", u.email.toLowerCase())).then(function (s) { return s.exists(); }, function () { return false; })
              .then(function (isAdmin) {
                cb({ uid: u.uid, name: u.displayName || u.email, email: u.email.toLowerCase(), photo: u.photoURL || "", role: isAdmin ? "admin" : "student" });
              });
          });
        }, function (e) { cb(null, "Could not load sign-in. Check your internet connection."); });
      },
      signIn: function () {
        return lib().then(function (o) {
          var p = new o.U.GoogleAuthProvider();
          p.setCustomParameters({ hd: domain, prompt: "select_account" });
          return o.U.signInWithPopup(auth, p).catch(function (e) {
            if (e && e.code === "auth/popup-blocked") return o.U.signInWithRedirect(auth, p);
            throw e;
          });
        });
      },
      signOut: function () { return lib().then(function (o) { return o.U.signOut(auth); }); },
      loadOverlay: function () {
        return lib().then(function (o) {
          return Promise.all([o.F.getDocs(col(o.F, "bookEdits")), o.F.getDocs(col(o.F, "newBooks"))]).then(function (r) {
            var edits = {}; rows(r[0]).forEach(function (e) { var id = e.id; delete e.id; edits[id] = e; });
            return { edits: edits, added: rows(r[1]) };
          });
        }).catch(function () { return { edits: {}, added: [] }; });
      },
      loadTaken: function () {
        return lib().then(function (o) { return o.F.getDocs(col(o.F, "taken")).then(function (s) { return countTaken(rows(s)); }); });
      },
      myLoans: function (user) {
        return lib().then(function (o) {
          return o.F.getDocs(o.F.query(col(o.F, "loans"), o.F.where("uid", "==", user.uid))).then(function (s) {
            var list = rows(s), F = o.F, b = F.writeBatch(db), n = 0;
            list.forEach(function (l) {
              if (isExpiredHold(l)) {
                b.update(F.doc(db, "loans", l.id), { status: "cancelled" }); b["delete"](F.doc(db, "taken", l.id)); l.status = "cancelled"; n++;
              }
            });
            return (n ? b.commit().catch(function () {}) : Promise.resolve()).then(function () { return list; });
          });
        });
      },
      allLoans: function () { return lib().then(function (o) { return o.F.getDocs(col(o.F, "loans")).then(rows); }); },
      borrow: function (user, book) {
        return lib().then(function (o) {
          var F = o.F, ref = F.doc(col(F, "loans")), l = newLoan(user, book), b = F.writeBatch(db);
          b.set(ref, l); b.set(F.doc(db, "taken", ref.id), { bookId: l.bookId, kind: "hold", until: l.expiresAt });
          return b.commit().then(function () { l.id = ref.id; return l; });
        });
      },
      act: function (loan, action, user) {
        try { checkAllowed(action, loan, user); } catch (e) { return Promise.reject(e); }
        return lib().then(function (o) {
          var F = o.F, p = loanPatch(action, loan), t = takenFor(action, p), b = F.writeBatch(db);
          b.update(F.doc(db, "loans", loan.id), p);
          if (t.remove) b["delete"](F.doc(db, "taken", loan.id)); else b.update(F.doc(db, "taken", loan.id), t.set);
          return b.commit();
        });
      },
      saveBook: function (id, fields) { return lib().then(function (o) { return o.F.setDoc(o.F.doc(db, "bookEdits", id), fields, { merge: true }); }); },
      addBook: function (fields) {
        return lib().then(function (o) { return o.F.addDoc(col(o.F, "newBooks"), fields).then(function (r) { return Object.assign({ id: r.id }, fields); }); });
      },
      saveAdded: function (id, fields) { return lib().then(function (o) { return o.F.setDoc(o.F.doc(db, "newBooks", id), fields, { merge: true }); }); },
      ask: function (user, q) {
        return lib().then(function (o) {
          var rec = { uid: user.uid, name: user.name, email: user.email, topic: q.topic, message: q.message, createdAt: now(), status: "open" };
          return o.F.addDoc(col(o.F, "questions"), rec).then(function (r) { return Object.assign({ id: r.id }, rec); });
        });
      },
      myQuestions: function (user) {
        return lib().then(function (o) { return o.F.getDocs(o.F.query(col(o.F, "questions"), o.F.where("uid", "==", user.uid))).then(rows); });
      },
      allQuestions: function () { return lib().then(function (o) { return o.F.getDocs(col(o.F, "questions")).then(rows); }); },
      answer: function (id, text, user) {
        return lib().then(function (o) {
          return o.F.updateDoc(o.F.doc(db, "questions", id), { status: "answered", reply: text, repliedAt: now(), repliedBy: user.name });
        });
      }
    };
  }

  window.HMA_BACKEND = function (cfg) {
    cfg = cfg || {};
    return cfg.firebase && cfg.firebase.apiKey ? firebase(cfg) : demo(cfg);
  };
  window.HMA_BACKEND._internals = { loanPatch: loanPatch, countTaken: countTaken, HOLD_MS: HOLD_MS, LOAN_MS: LOAN_MS };
})();
