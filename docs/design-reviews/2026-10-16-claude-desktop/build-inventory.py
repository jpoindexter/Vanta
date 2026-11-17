from pathlib import Path
import re,csv,json,collections
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).parent
mapping={'titlebar':'Shared chrome / View menu','sidebar top':'Project sidebar / primary navigation','sidebar list':'Project sidebar / session menus','sidebar list (BOTS tab)':'More → Workers & budgets','sidebar footer (profile rail)':'Workspace switcher / Settings → Profiles','composer':'Chat and Code composers','thread':'Conversation / Task context rail','right pane':'Code workbench / Chat outputs rail','page / overlay':'Library / Automations / Connections / advanced views','settings page':'Settings (all existing categories retained)','status bar':'Single runtime status / diagnostics popover','window menu/tray':'Native app menu / tray / mini window','command palette':'Shared command palette','context menus':'Context menus at the original object','onboarding':'First launch / connection recovery'}
rows=[]
for file in ['FEATURE-PRESERVATION.md','CUTOVER-PARITY.md']:
 for line_no,line in enumerate((ROOT/'desktop-next/docs'/file).read_text().splitlines(),1):
  if not re.match(r'\| [FV]-\d+',line): continue
  cols=[x.strip() for x in re.split(r'(?<!\\)\|',line.strip().strip('|'))]
  code=cols[0]; shell=code.startswith('F-');category=cols[1] if shell else 'Vanta capability'
  feature=cols[2] if shell else cols[1]
  dest=mapping.get(category,'See capability mapping in REDESIGN-PLAN.md')
  if not shell:
   num=int(code[2:]);dest= ('Prior owner-approved retirement; do not restore automatically' if num in [33,39,46] else 'See Vanta capability destination in REDESIGN-PLAN.md')
  decision='Preserve capability; relocate or improve presentation; no backend retirement'
  if code in ['V-033','V-039','V-046']:decision='Respect existing owner-approved retirement (CUTOVER-PARITY owner decisions)'
  elif 'DROP-NEEDS-OWNER-OK' in line:decision='Keep existing reachability until owner explicitly approves retirement'
  rows.append({'id':code,'feature':feature,'category':category,'proposed_destination':dest,'decision':decision,'evidence_level':'Inspected inventory; original status is dated and not current runtime proof','source':str(ROOT/'desktop-next/docs'/file),'source_line':line_no,'original_inventory_row':line})
with (OUT/'FEATURE-PRESERVATION.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
(OUT/'feature-inventory.json').write_text(json.dumps([{k:v for k,v in r.items() if k not in ['source','original_inventory_row']} for r in rows],indent=2))
print('Mapped',len(rows),'rows; unique IDs',len({r['id'] for r in rows}))
print(collections.Counter(r['category'] for r in rows))
