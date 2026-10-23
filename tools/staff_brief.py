"""Print the writer's brief for one or more Vira staff: facts, household, connections, crew, neighbors.

    python tools/staff_brief.py 72 0 52

Connections show any history already written on the other person's card, which is binding.
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data' / 'staff'
roster = json.loads((DATA / 'roster.json').read_text(encoding='utf-8'))
P = {p['id']: p for p in roster['people']}
E = roster['relationships']


def card(i):
    f = DATA / 'cards' / f'{i:03d}.json'
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else None


def who(i):
    p = P[i]
    return f"{p['name']} (#{i}, {p['pronouns']}, {p['age']}, {p['title']}, {p['home']['city'].capitalize()})"


def crewmates(p):
    def key(q):
        s = q['shift']
        return s.split(',')[0] if s.startswith('Crew') else s
    return [q for q in roster['people'] if q['id'] != p['id'] and q['role'] == p['role'] and key(q) == key(p)]


def brief(i):
    p = P[i]
    out = [f"=== #{i} {p['name']} ===", json.dumps({k: v for k, v in p.items() if k not in ('household',)}, indent=1)]
    out.append('Household:')
    if not p['household']: out.append('  lives alone')
    for h in p['household']:
        if 'staff_id' in h: out.append(f"  {h['relation']}: {who(h['staff_id'])} (also works at Vira)")
        elif 'pet' in h: out.append(f"  pet: {h['pet']}")
        else: out.append(f"  {h['relation']}: {h['name']}, {h['age']}" + (f", {h['occupation']}" if h.get('occupation') else ''))
    if p.get('supervisor') is not None: out.append(f"Supervisor: {who(p['supervisor'])}")
    reports = [q['id'] for q in roster['people'] if q.get('supervisor') == i]
    if reports: out.append(f"Supervises {len(reports)}: " + ', '.join(P[r]['name'] for r in reports))
    out.append('Connections (canon):')
    for e in E:
        if i not in (e['a'], e['b']): continue
        j = e['b'] if e['a'] == i else e['a']
        kind = e['type'] + (' (one-way: %s)' % ('they have the crush' if e['a'] == i else 'the other person has a crush on them') if e.get('one_way') else '')
        if e['type'] == 'mentor': kind = 'mentor of' if e['a'] == i else 'mentored by'
        line = f"  {kind}, strength {e['strength']}: {who(j)}"
        c = card(j)
        if c:
            prior = next((r for r in c.get('relationships', []) if r.get('id') == i), None)
            if prior: line += f"\n      ALREADY WRITTEN on their card: history: {prior.get('history')} / they feel: {prior.get('how_they_feel')}"
        out.append(line)
    # anything other cards already say about this person (binding, even where the roster has no edge)
    said = []
    for f in sorted((DATA / 'cards').glob('*.json')):
        c = json.loads(f.read_text(encoding='utf-8'))
        if c.get('id') == i: continue
        for r in c.get('relationships', []):
            if r.get('id') == i: said.append(f"  {c['name']} (#{c['id']}) lists them as {r.get('type')}: {r.get('history')} / feels: {r.get('how_they_feel')}")
        for m in c.get('memories', []):
            if i in (m.get('with') or []): said.append(f"  shared memory on {c['name']}'s card (#{c['id']}), {m.get('when')}: {m.get('what')}")
    if said: out += ['Already written about them on other cards (canon, match it):'] + said
    cm = crewmates(p)
    out.append(f"Crewmates ({len(cm)}): " + ', '.join(f"{q['name']} #{q['id']}" for q in cm[:30]))
    out.append('Neighbors: ' + (', '.join(who(n) for n in p['home']['neighbors']) or 'none on staff'))
    return '\n'.join(out)


if __name__ == '__main__':
    if len(sys.argv) == 1:
        print('Places:', json.dumps(roster['places'], indent=1)); print('Canon:', roster['meta']['lyra_canon'])
    for a in sys.argv[1:]: print(brief(int(a)) + '\n')
