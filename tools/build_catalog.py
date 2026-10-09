#!/usr/bin/env python3
"""Build the Haile-Manas Academy library database from a LibraryThing export.

    python3 tools/build_catalog.py path/to/LibraryThing_export.xlsx

Writes:
  data/catalog.db   SQLite database (all 54 spreadsheet columns, normalized lookup tables, full-text search)
  data/catalog.js   compact copy of the same catalog that index.html loads (works from file:// and GitHub Pages)

Borrower names are never copied: the lending_patron column is kept in the table but left empty.
"""
import sys,os,re,json,sqlite3,datetime
import pandas as pd

SRC=sys.argv[1]
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB=os.path.join(ROOT,'data','catalog.db'); JS=os.path.join(ROOT,'data','catalog.js')
df=pd.read_excel(SRC,dtype=object)
N=len(df)

def snake(c): return re.sub(r'[^a-z0-9]+','_',c.lower()).strip('_')
COLS=[snake(c) for c in df.columns]
assert len(set(COLS))==len(COLS)
INTCOLS={'book_id','sort_character','copies','work_id','oclc'}

def val(x):
    if x is None or (isinstance(x,float) and x!=x) or x is pd.NaT: return None
    if isinstance(x,(pd.Timestamp,datetime.datetime,datetime.date)): return x.strftime('%Y-%m-%d')
    return x if not isinstance(x,str) else x
def cell(c,x):
    x=val(x)
    if x is None: return None
    if c in INTCOLS:
        try: return int(float(x))
        except: return str(x)
    return str(x)

if os.path.exists(DB): os.remove(DB)
con=sqlite3.connect(DB); cur=con.cursor()
cur.executescript('PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;')
coldef=',\n  '.join('%s %s%s'%(c,'INTEGER' if c in INTCOLS else 'TEXT',' PRIMARY KEY' if c=='book_id' else '') for c in COLS)
cur.execute('CREATE TABLE books (\n  %s,\n  title_clean TEXT, author_display TEXT, year INTEGER, page_count_n INTEGER, isbn_main TEXT, call_number TEXT, is_checked_out INTEGER NOT NULL DEFAULT 0\n)'%coldef)

def fixtext(s):
    if s is None: return None
    return ''.join(chr(ord(ch)) if not 0x80<=ord(ch)<=0x9f else bytes([ord(ch)]).decode('cp1252',errors='ignore') for ch in s)
def display_name(n):
    if not n: return None
    n=fixtext(n.strip())
    c=re.sub(r'\s+',' ',re.sub(r'\([^()]*\)','',n.replace('#',''))).strip(' ,;')
    if '(' in c or ')' in c: return c
    p=[x.strip() for x in c.split(',')]
    return '%s %s'%(p[1],p[0]) if len(p)==2 and p[1] and p[0] else c

rows=[];people={};bp=[];subj={};bs=[];colls={};bc=[];tags={};bt=[]
def pid(name):
    if name not in people: people[name]=len(people)+1
    return people[name]
for _,r in df.iterrows():
    d={c:cell(c,r[o]) for c,o in zip(COLS,df.columns)}
    bid=d['book_id']
    if d['lending_patron'] is not None: d['lending_patron']=None  # privacy: borrower names are not stored
    m=re.match(r'\d{4}',d['date'] or ''); year=int(m.group()) if m else None
    pg=None
    if d['page_count']:
        m=re.match(r'\s*(\d+)',d['page_count']); pg=int(m.group(1)) if m else None
    isbns=re.findall(r'[0-9Xx]{10,13}',d['isbns'] or d['isbn'] or '')
    isbn=next((i for i in isbns if len(i)==13),isbns[0] if isbns else None)
    call=d['dewey_decimal'] or d['lc_classification']
    au=display_name(d['primary_author'])
    if call and au:
        last=re.sub(r'[^A-Za-z]','',(d['primary_author'] or '').split(',')[0])[:3].upper()
        if last: call=call+' '+last
    out=1 if d['lending_status']=='Checked out' else 0
    rows.append([d[c] for c in COLS]+[fixtext(d['title']),au,year,pg,isbn,call,out])
    for pos,(n,role) in enumerate([(d['primary_author'],d['primary_author_role']),(d['secondary_author'],d['secondary_author_role'])]):
        if n: bp.append((bid,pid(n),pos,role))
    for s in (d['subjects'] or '').split('|'):
        s=s.strip()
        if s:
            subj.setdefault(s,len(subj)+1); bs.append((bid,subj[s]))
    for s in (d['collections'] or '').split(', '):
        s=s.strip()
        if s: colls.setdefault(s,len(colls)+1); bc.append((bid,colls[s]))
    for s in (d['tags'] or '').split(','):
        s=s.strip()
        if s: tags.setdefault(s,len(tags)+1); bt.append((bid,tags[s]))
cur.executemany('INSERT INTO books VALUES (%s)'%','.join('?'*(len(COLS)+7)),rows)
cur.executescript('''
CREATE TABLE people(person_id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE book_people(book_id INTEGER NOT NULL REFERENCES books(book_id),person_id INTEGER NOT NULL REFERENCES people(person_id),position INTEGER NOT NULL,role TEXT,PRIMARY KEY(book_id,person_id,position));
CREATE TABLE subjects(subject_id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE book_subjects(book_id INTEGER NOT NULL REFERENCES books(book_id),subject_id INTEGER NOT NULL REFERENCES subjects(subject_id),PRIMARY KEY(book_id,subject_id));
CREATE TABLE collections(collection_id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE book_collections(book_id INTEGER NOT NULL REFERENCES books(book_id),collection_id INTEGER NOT NULL REFERENCES collections(collection_id),PRIMARY KEY(book_id,collection_id));
CREATE TABLE tags(tag_id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE book_tags(book_id INTEGER NOT NULL REFERENCES books(book_id),tag_id INTEGER NOT NULL REFERENCES tags(tag_id),PRIMARY KEY(book_id,tag_id));
-- Tables for running the library. The website keeps these in the visitor's browser; a server version would fill them.
CREATE TABLE members(member_id INTEGER PRIMARY KEY,name TEXT NOT NULL,grade INTEGER,card_no TEXT UNIQUE);
CREATE TABLE loans(loan_id INTEGER PRIMARY KEY,book_id INTEGER NOT NULL REFERENCES books(book_id),member_id INTEGER NOT NULL REFERENCES members(member_id),borrowed_on TEXT NOT NULL,due_on TEXT NOT NULL,returned_on TEXT,renewed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE holds(hold_id INTEGER PRIMARY KEY,book_id INTEGER NOT NULL REFERENCES books(book_id),member_id INTEGER NOT NULL REFERENCES members(member_id),placed_on TEXT NOT NULL);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
''')
cur.executemany('INSERT INTO people VALUES (?,?)',[(i,n) for n,i in people.items()])
cur.executemany('INSERT INTO book_people VALUES (?,?,?,?)',bp)
cur.executemany('INSERT INTO subjects VALUES (?,?)',[(i,n) for n,i in subj.items()])
cur.executemany('INSERT INTO book_subjects VALUES (?,?)',bs)
cur.executemany('INSERT INTO collections VALUES (?,?)',[(i,n) for n,i in colls.items()])
cur.executemany('INSERT INTO book_collections VALUES (?,?)',bc)
cur.executemany('INSERT INTO tags VALUES (?,?)',[(i,n) for n,i in tags.items()])
cur.executemany('INSERT INTO book_tags VALUES (?,?)',bt)
cur.executescript('''
CREATE INDEX ix_books_title ON books(title_clean);
CREATE INDEX ix_books_author ON books(primary_author);
CREATE INDEX ix_books_dewey ON books(dewey_decimal);
CREATE INDEX ix_books_media ON books(media);
CREATE INDEX ix_books_year ON books(year);
CREATE INDEX ix_bs_subject ON book_subjects(subject_id);
CREATE INDEX ix_bc_coll ON book_collections(collection_id);
CREATE VIRTUAL TABLE books_fts USING fts5(title,authors,subjects,isbn,call_number,tokenize='unicode61 remove_diacritics 2');
INSERT INTO books_fts(rowid,title,authors,subjects,isbn,call_number)
 SELECT b.book_id,b.title_clean,coalesce(b.primary_author,'')||' '||coalesce(b.secondary_author,''),coalesce(b.subjects,''),coalesce(b.isbns,''),coalesce(b.call_number,'') FROM books b;
CREATE VIEW v_catalog AS SELECT b.*, b.copies-b.is_checked_out AS copies_available,
 (SELECT group_concat(c.name,', ') FROM book_collections bc JOIN collections c USING(collection_id) WHERE bc.book_id=b.book_id AND c.name<>'Your library') AS shelf
 FROM books b;
''')
cur.executemany('INSERT INTO meta VALUES (?,?)',[('source_file',os.path.basename(SRC)),('built_at',datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')),('row_count',str(N)),('note','lending_patron is intentionally empty; borrower names are not stored.')])
con.commit()

# ---- compact JS copy for the website ----
CL=sorted(colls,key=lambda n:(n!='Your library',-sum(1 for x in bc if x[1]==colls[n]),n))
cidx={n:i for i,n in enumerate(CL)}
SL=sorted(subj,key=lambda n:subj[n]); sidx={n:i for i,n in enumerate(SL)}
bsub={};[bsub.setdefault(b,[]).append(s) for b,s in bs]
inv_s={v:k for k,v in subj.items()}; 
bcol={};[bcol.setdefault(b,[]).append(c) for b,c in bc]
inv_c={v:k for k,v in colls.items()}
btag={};[btag.setdefault(b,[]).append(t) for b,t in bt]
inv_t={v:k for k,v in tags.items()}
DW=[];dwi={}
def dw(x):
    if not x: return -1
    if x not in dwi: dwi[x]=len(DW);DW.append(x)
    return dwi[x]
AUTO=re.compile(r'^.* by .* \(.*\)$')
cur.execute('SELECT * FROM books ORDER BY title_clean COLLATE NOCASE, book_id')
names=[x[0] for x in cur.description]
ix={n:i for i,n in enumerate(names)}
B=[]
for r in cur.fetchall():
    g=lambda k:r[ix[k]]
    summ=g('summary') or ''
    if AUTO.match(summ) or summ.strip()==(g('title') or '').strip(): summ=''
    B.append([g('book_id'),g('title_clean'),g('author_display') or '',g('primary_author_role') or '',display_name(g('secondary_author')) or '',g('secondary_author_role') or '',
      fixtext(g('publication')) or '',g('date') or '',g('media') or '',g('page_count_n') or 0,g('languages') or '',
      [cidx[inv_c[c]] for c in bcol.get(g('book_id'),[])],g('lc_classification') or '',g('dewey_decimal') or '',dw(g('dewey_wording')),g('isbn_main') or '',
      [sidx[inv_s[s]] for s in bsub.get(g('book_id'),[])],fixtext(summ),g('copies') or 1,g('lending_end') or '',g('is_checked_out'),g('entry_date') or '',
      [inv_t[t] for t in btag.get(g('book_id'),[])],g('call_number') or '',g('source') or '',g('original_languages') or '',' '.join(re.findall(r'[0-9Xx]{10,13}',g('isbns') or ''))])
FIELDS=['id','title','author','role','author2','role2','publication','date','media','pages','lang','shelves','lc','dewey','dewey_i','isbn','subjects','summary','copies','due','out','added','tags','call','source','orig_lang','isbns']
payload={'built':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'),'n':len(B),'fields':FIELDS,'shelves':CL,'subjects':SL,'dewey_words':DW,'books':B}
open(JS,'w',encoding='utf8').write('window.HMA_CATALOG='+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n')
con.close()
print('books',len(B),'| db %.1f MB | js %.2f MB'%(os.path.getsize(DB)/1e6,os.path.getsize(JS)/1e6))
