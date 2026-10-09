#!/usr/bin/env python3
"""Make a one-file copy of the site (images and catalog inlined) for previews that cannot load extra files.
    python3 tools/make_single_file.py out.html [--fragment]
"""
import re,sys,base64,os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s=open(os.path.join(root,'index.html'),encoding='utf8').read()
for f in sorted(os.listdir(os.path.join(root,'assets'))):
    mime='image/png' if f.endswith('.png') else 'image/jpeg'
    uri='data:%s;base64,%s'%(mime,base64.b64encode(open(os.path.join(root,'assets',f),'rb').read()).decode())
    s=s.replace('assets/'+f,uri)
data=open(os.path.join(root,'data','catalog.js'),encoding='utf8').read().replace('</','<\\/')
s=s.replace('<script src="data/catalog.js"></script>','<script>'+data+'</script>')
if '--fragment' in sys.argv:
    s=re.sub(r'<!doctype html>\s*','',s,flags=re.I)
    s=re.sub(r'</?(html|head|body)\b[^>]*>','',s)
    s=re.sub(r'<meta charset[^>]*>\s*','',s)
    s=re.sub(r'<meta name="viewport"[^>]*>\s*','',s)
open(sys.argv[1],'w',encoding='utf8').write(s)
print('wrote',sys.argv[1],'%.1f MB'%(len(s.encode())/1e6))
