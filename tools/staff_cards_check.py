"""Check Vira staff cards against the roster: required fields, every relationship edge covered,
ids that exist, matching names, and no Lyra knowledge for people who shouldn't have it.

    python tools/staff_cards_check.py          # all cards present
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data' / 'staff'
roster = json.loads((DATA / 'roster.json').read_text(encoding='utf-8'))
P = {p['id']: p for p in roster['people']}
REQUIRED = ['summary', 'backstory', 'household_notes', 'personality', 'voice', 'daily_life', 'work', 'relationships',
            'inner_life', 'health_and_money', 'beliefs', 'knowledge', 'memories', 'conversation_starters']
LYRA_TELLS = re.compile(r'talk(s|ed|ing)? (to|with) (her|lyra)|lyra (said|says|told|asked)|hologram|the dog|pit ?bull', re.I)

problems, cards = [], sorted(DATA.glob('cards/*.json'))
for f in cards:
    try: c = json.loads(f.read_text(encoding='utf-8'))
    except Exception as e: problems.append(f'{f.name}: bad JSON ({e})'); continue
    i = c.get('id'); p = P.get(i)
    if p is None: problems.append(f'{f.name}: unknown id {i}'); continue
    if c.get('name') != p['name']: problems.append(f"{f.name}: name {c.get('name')!r} != roster {p['name']!r}")
    for k in REQUIRED:
        if not c.get(k): problems.append(f'{f.name}: missing {k}')
    rel_ids = {r.get('id') for r in c.get('relationships', [])}
    for e in roster['relationships']:
        if i in (e['a'], e['b']):
            j = e['b'] if e['a'] == i else e['a']
            if j not in rel_ids: problems.append(f"{f.name}: no relationship entry for {e['type']} edge with #{j} {P[j]['name']}")
    for r in c.get('relationships', []):
        if r.get('id') not in P: problems.append(f"{f.name}: relationship to unknown id {r.get('id')}")
        elif r.get('name') != P[r['id']]['name']: problems.append(f"{f.name}: relationship name {r.get('name')!r} != {P[r['id']]['name']!r}")
    for m in c.get('memories', []):
        for j in m.get('with', []):
            if j not in P: problems.append(f'{f.name}: memory with unknown id {j}')
    if not p['knows_lyra']:
        text = json.dumps(c.get('knowledge', {})) + json.dumps(c.get('memories', []))
        if LYRA_TELLS.search(text): problems.append(f"{f.name}: talks about Lyra/hologram/dog but knows_lyra is false: {LYRA_TELLS.search(text).group(0)!r}")
print(f'{len(cards)} cards checked, {len(problems)} problems')
for x in problems: print(' -', x)
