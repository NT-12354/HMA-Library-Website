# Haile-Manas Academy Library

A single-page school library site with the school's real catalog: 7,000 titles from the LibraryThing export. Search by title, author, subject, ISBN or call number, filter by shelf and format, borrow and reserve, book study rooms, open free digital texts, and see events. Plain HTML, CSS and JavaScript.

## Run it
Open `index.html` in a browser, or serve the folder with GitHub Pages (Settings, Pages, deploy from the branch root). `index.html` loads `data/catalog.js` and the pictures in `assets/`, so keep those next to it.

## The database
| File | What it is |
| --- | --- |
| `data/catalog.db` | SQLite database. The `books` table keeps all 54 spreadsheet columns exactly as exported (7,000 rows), plus lookup tables for people, subjects, shelves and tags, a full-text search index (`books_fts`) and a `v_catalog` view. Empty `members`, `loans`, `holds` and `room_bookings` tables are ready for a server version. |
| `data/catalog.js` | The same catalog in compact form, which the website reads. |
| `tools/build_catalog.py` | Rebuilds both files from a new LibraryThing export: `python3 tools/build_catalog.py export.xlsx` (needs `pandas` and `openpyxl`). |
| `tools/make_single_file.py` | Makes one self-contained HTML file with the images and catalog inlined. |

Example queries:

```sql
SELECT title_clean, author_display, call_number FROM books_fts f JOIN books b ON b.book_id = f.rowid WHERE books_fts MATCH 'dragon' LIMIT 10;
SELECT shelf, COUNT(*) FROM v_catalog GROUP BY shelf;
SELECT title_clean, lending_end FROM books WHERE is_checked_out = 1 ORDER BY lending_end;
```

## Notes
- Borrower names in the export are not copied. The `lending_patron` column exists but is empty, so the public repo holds no student names. Which books are checked out, and their due dates, are kept.
- A static website cannot write to a database. Loans, reservations, room bookings and reminders are saved in the visitor's own browser. The `loans`, `holds` and `room_bookings` tables show how a server version would store them.
- Opening hours and events are sample content.
