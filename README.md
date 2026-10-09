# Haile-Manas Academy Library

A single-page school library site with the school's real catalog: 7,000 titles from the LibraryThing export. Search by title, author, subject, ISBN or call number, filter by shelf and format, sign in with a school Google account to borrow, check in and return books, and open free digital texts. Librarians manage books, loans and questions in an admin panel. Plain HTML, CSS and JavaScript.

## Run it
Open `index.html` in a browser, or serve the folder with GitHub Pages (Settings, Pages, deploy from the branch root). `index.html` loads `data/catalog.js` and the pictures in `assets/`, so keep those next to it.

## The database
| File | What it is |
| --- | --- |
| `data/catalog.db` | SQLite database. The `books` table keeps all 54 spreadsheet columns exactly as exported (7,000 rows), plus lookup tables for people, subjects, shelves and tags, a full-text search index (`books_fts`) and a `v_catalog` view. Empty `members`, `loans` and `holds` tables are ready for a server version. |
| `data/catalog.js` | The same catalog in compact form, which the website reads. |
| `tools/build_catalog.py` | Rebuilds both files from a new LibraryThing export: `python3 tools/build_catalog.py export.xlsx` (needs `pandas` and `openpyxl`). |
| `tools/make_single_file.py` | Makes one self-contained HTML file with the images and catalog inlined. |

Example queries:

```sql
SELECT title_clean, author_display, call_number FROM books_fts f JOIN books b ON b.book_id = f.rowid WHERE books_fts MATCH 'dragon' LIMIT 10;
SELECT shelf, COUNT(*) FROM v_catalog GROUP BY shelf;
SELECT title_clean, lending_end FROM books WHERE is_checked_out = 1 ORDER BY lending_end;
```

## Accounts
| | Students | Librarians (admins) |
| --- | --- | --- |
| Sign in | School Google account (`@hmacademy.org`) | Same, plus an `admins/<email>` document |
| Borrow | Holds a book for 48 hours (max 3 active loans) | |
| Check in | Confirms pickup of a held book; due in 14 days | Can check in for a student |
| Return | Returns a borrowed book | Marks any loan returned, +7 days, cancel |
| Questions | Ask the librarians, read replies in My shelf | See all questions and reply |
| Books | Browse, wishlist | Edit, add and withdraw books |

Until `config.js` holds a Firebase config the site runs in **demo mode** (two practice accounts, data kept only in that browser). See `SETUP.md` to switch on real Google sign-in. `firestore.rules` holds the access rules.

## Notes
- The per-book copy count and the 3-loan limit are enforced by the page, not by the database rules, so a determined student could bypass them from the console. The rules do stop students reading each other's loans or acting as librarians.
- Borrower names in the export are not copied. The `lending_patron` column exists but is empty, so the public repo holds no student names. Which books are checked out, and their due dates, are kept.
- `data/catalog.db` is the master catalog. Live loans, questions and librarian edits are stored in Firebase Firestore (or in the browser in demo mode), not in the SQLite file.
- Book covers are loaded in the visitor's browser from Open Library (covers.openlibrary.org) using each book's ISBN. When Open Library has no cover for a book, the site shows a generated cover with the title. Covers need an internet connection.
- Opening hours are sample content.
