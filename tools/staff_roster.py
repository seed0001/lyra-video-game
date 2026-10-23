"""Build the hard facts for Vira's 280 staff: the skeleton every character card is written on.

Input:  data/staff/game_export.json  (exported from the running game: roles, shifts,
        houses, parking stalls, cars, clothing, posts)
Output: data/staff/roster.json       (people, households, addresses, org chart,
        relationship edges, and the places in each town that cards may mention)

Everything here is deterministic (fixed seed), so rerunning gives the same roster. The
written parts of each card (life story, personality, voice...) live in cards/<id>.json and
must agree with these facts.
"""
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'staff'
TODAY = (2026, 10, 22)
VIRA_OPENED = 2019          # assumption: Vira came online in 2019 (no canon date yet)
R = random.Random(20261022)

rows = json.loads((DATA / 'game_export.json').read_text(encoding='utf-8'))

# ---------- names ----------
FEM = {'Kara', 'Priya', 'Rosa', 'Mei', 'Ines', 'Amara', 'Lena', 'Hana', 'Talia', 'Sofia', 'Erin', 'Noor', 'Yesenia', 'Lucia', 'Jada',
       'Alma', 'Tess', 'Rhea', 'Nadia', 'Paloma', 'Joy', 'Bea', 'Iris', 'Marisol', 'Tara', 'Leti', 'Ivy'}
MASC = {'Luis', 'Mateo', 'Owen', 'Darnell', 'Caleb', 'Tyler', 'Wes', 'Jorge', 'Ray', 'Grant', 'Malik', 'Victor', 'Cody', 'Brett', 'Andre',
        'Hector', 'Pete', 'Omar', 'Gus', 'Eli', 'Trent', 'Ramon', 'Felix', 'Dale', 'Kofi', 'Ruben', 'Abe', 'Shane', 'Nico'}
EXTRA_LAST = ['Alvarez', 'Boone', 'Chavez', 'Dominguez', 'Escobar', 'Fairbanks', 'Gallegos', 'Haskie', 'Ibarra', 'Jessup', 'Kaur', 'Lujan',
              'Maddox', 'Nakamura', 'Orozco', 'Pacheco', 'Quinn', 'Redhouse', 'Serrano', 'Tafoya', 'Ulloa', 'Valdez', 'Whitfield', 'Ximenez',
              'Yoder', 'Zamora', 'Atencio', 'Blackwater', 'Cordova', 'Dorsey', 'Espinoza', 'Frye', 'Grijalva', 'Huang', 'Iverson', 'Jacobs']
KID_F = ['Mia', 'Ava', 'Lily', 'Camila', 'Zoe', 'Aaliyah', 'Grace', 'Luna', 'Maya', 'Ella', 'Valeria', 'Harper', 'Nora', 'Sadie', 'Ximena', 'Aria']
KID_M = ['Leo', 'Mason', 'Diego', 'Elijah', 'Noah', 'Gabriel', 'Isaac', 'Jayden', 'Miles', 'Santiago', 'Ezra', 'Wyatt', 'Jonah', 'Adrian', 'Kai', 'Theo']
ADULT_F = ['Linda', 'Carmen', 'Stephanie', 'Monique', 'Angela', 'Rachel', 'Brenda', 'Veronica', 'Holly', 'Gloria', 'Denise', 'Lauren', 'Esther', 'Cynthia']
ADULT_M = ['Mike', 'Eddie', 'Jason', 'Marco', 'Steve', 'Curtis', 'Javier', 'Dennis', 'Travis', 'Kevin', 'Ernesto', 'Lyle', 'Russell', 'Arturo']

people = []
for r in rows:
    first, last = r['name'].split(' ', 1)
    if first in FEM: pron = 'she/her'
    elif first in MASC: pron = 'he/him'
    else: pron = R.choice(['she/her', 'he/him'])
    if R.random() < 0.025: pron = 'they/them'
    people.append({'id': r['id'], 'first': first, 'last': last, 'pronouns': pron, 'src': r})

MORE_LAST = ['Archuleta', 'Benally', 'Cisneros', 'Draper', 'Enriquez', 'Fontaine', 'Gutierrez', 'Hollis', 'Iniguez', 'Jaramillo', 'Keel', 'Lattimore',
             'Montoya', 'Nez', 'Olvera', 'Pemberton', 'Quezada', 'Romero', 'Sandoval', 'Trujillo', 'Uribe', 'Villalobos', 'Weatherby', 'Yazzie',
             'Zuniga', 'Abeyta', 'Bustamante', 'Carrillo', 'Dawes', 'Eldridge', 'Figueroa', 'Galindo', 'Hargrove', 'Irving', 'Juarez', 'Kemper',
             'Lomeli', 'Mondragon', 'Nolan', 'Ortega', 'Prescott', 'Rasmussen', 'Saucedo', 'Tillman', 'Underhill', 'Vance', 'Wakefield', 'Arviso',
             'Bradford', 'Cervantes', 'Dupree', 'Ellis', 'Fenwick', 'Guerra', 'Hutchins', 'Ingram', 'Jimenez', 'Kirby', 'Ledesma', 'Medina',
             'Nunez', 'Okonkwo', 'Park', 'Reyes', 'Silversmith', 'Thao', 'Vu', 'Watanabe', 'Yamamoto', 'Zepeda', 'Chee', 'Mahoney', 'Lindgren']
EXTRA_LAST += MORE_LAST
# no more than two staff share a surname unless they're family (set below)
per = Counter()
for p in people:
    while per[p['last']] >= 2: p['last'] = R.choice(EXTRA_LAST)
    per[p['last']] += 1
seen = Counter()
for p in people:
    while f"{p['first']} {p['last']}" in seen:
        p['last'] = R.choice(EXTRA_LAST)
    seen[f"{p['first']} {p['last']}"] += 1

# ---------- age, look, tenure ----------
AGES = {'Critical facilities engineer': (27, 61, 41), 'Data center technician': (21, 47, 30), 'Network engineer': (25, 54, 36),
        'Security officer': (21, 63, 38), 'Operations & research staff': (25, 62, 39), 'Custodian': (19, 67, 42),
        'Cafeteria cook': (19, 61, 36), 'Logistics & receiving': (20, 56, 33), 'Contractor': (20, 59, 34)}
SKIN = {'#f1c8a6': 'light', '#e0ac85': 'light olive', '#c68b62': 'medium tan', '#a8704a': 'warm brown', '#8a5636': 'brown', '#5f3a24': 'deep brown'}
HAIR = {'#1b1612': 'black', '#2d2118': 'dark brown', '#4a3322': 'brown', '#7a5a3a': 'light brown', '#a9875a': 'dark blond', '#cfc6b8': 'gray'}
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

def color_name(hexc, table):
    def d(a, b): return sum((int(a[i:i + 2], 16) - int(b[i:i + 2], 16)) ** 2 for i in (1, 3, 5))
    return table[min(table, key=lambda k: d(k, hexc))]

for p in people:
    s = p['src']
    lo, hi, mode = AGES[s['role']]
    p['age'] = int(round(R.triangular(lo, hi, mode)))
    m, d = R.randrange(12), R.randint(1, 28)
    born = TODAY[0] - p['age'] - (1 if (m + 1, d) > TODAY[1:] else 0)
    p['birthday'] = f'{MONTHS[m]} {d}, {born}'
    hair = color_name(s['look']['hat_or_hair'], HAIR) if s['post']['kind'] not in ('facilities', 'contractor') and s['role'] != 'Security officer' else R.choice(list(HAIR.values())[:5])
    if p['age'] > 55 and R.random() < 0.6: hair = 'gray'
    p['look'] = {'height_cm': int(round(176 * s['look']['scale'] * (0.95 if p['pronouns'] == 'she/her' else 1.0))),
                 'skin': color_name(s['look']['skin'], SKIN), 'hair': hair,
                 'work_clothes': {'shirt': s['look']['shirt'], 'pants': s['look']['pants']}}
    if s['role'] == 'Contractor':
        p['years_at_vira'] = round(R.uniform(0.2, 2.5), 1)
    else:
        p['years_at_vira'] = round(min(TODAY[0] - VIRA_OPENED + 0.8, max(0.1, p['age'] - 19), R.triangular(0.1, 7.6, 2.5)), 1)

# ---------- shifts and posts ----------
CREW = 'ABCD'
def shift_text(s):
    if s['sched'] == 'rot12':
        return f"Crew {CREW[s['crew']]}, 12-hour {'days, 6 AM to 6 PM' if s['crew'] < 2 else 'nights, 6 PM to 6 AM'} on the 2-2-3 rotation"
    if s['sched'] == 'sec8':
        return ['Day watch, 6 AM to 2 PM', 'Swing watch, 2 PM to 10 PM', 'Night watch, 10 PM to 6 AM'][s['idx'] % 3] + ', five days on, two off'
    if s['sched'] == 'janitor':
        return '2:30 PM to 11 PM, five days a week' if s['idx'] % 2 else '6 AM to 2:30 PM, five days a week'
    h = s['start'] + s['jitter']
    hh, mm = int(h), int(round((h - int(h)) * 60 / 15)) * 15
    if mm == 60: hh, mm = hh + 1, 0
    end = h + s['len']
    eh, em = int(end), int(round((end - int(end)) * 60 / 15)) * 15
    if em == 60: eh, em = eh + 1, 0
    f = lambda a, b: f"{(a - 1) % 12 + 1}:{b:02d} {'AM' if a < 12 else 'PM'}"
    return f'Weekdays, {f(hh, mm)} to {f(eh, em)}'

HALL = lambda i: f"Hall {'ABCD'[i // 4]}{i % 4 + 1}"
def post_text(s):
    k, p = s['post']['kind'], s['post']
    return {
        'tech': lambda: f"Technician for {HALL(p['hall'])}: racks, drives, cabling, new hardware",
        'network': lambda: f"Network work on the floor, mostly {HALL(p['hall'])}",
        'facilities': lambda: f"Equipment rounds for {HALL(p['hall'])}: generators, cooling units, power",
        'desk': lambda: {'Network engineer': 'Network operations desk in the operations building',
                         'Cafeteria cook': 'Cafeteria kitchen in the operations building'}.get(s['role'], 'Office in the operations building'),
        'gate': lambda: 'Front gatehouse', 'arm': lambda: 'Gate lane, checking badges at the lift arm',
        'perimeter': lambda: 'Perimeter patrol on foot, the whole fence line',
        'halls': lambda: 'Interior patrol through the data halls', 'campus': lambda: 'Roving campus patrol',
        'soc': lambda: 'Security office, watching the camera wall',
        'custodian': lambda: 'Cleaning the data halls', 'grounds': lambda: 'Grounds and walkways around the operations building',
        'dock': lambda: f"Receiving dock at {HALL(p['dock'])}, north end of the first block",
        'contractor': lambda: f"Solar field crew, {p['zone']} work zone: trenching and conduit for the array expansion",
    }[k]()

# ---------- org chart ----------
by_role = defaultdict(list)
for p in people: by_role[p['src']['role']].append(p)
for p in people:
    p['title'] = p['src']['role']; p['lead'] = False; p['knows_lyra'] = False
def make_lead(group, title):
    lead = max(group, key=lambda q: (q['years_at_vira'] + q['age'] / 20, -q['id']))
    lead['title'] = title; lead['lead'] = True
    for q in group:
        if q is not lead: q['supervisor'] = lead['id']
    return lead
for role, short in [('Critical facilities engineer', 'critical facilities'), ('Data center technician', 'data center technicians')]:
    for c in range(4):
        lead = make_lead([q for q in by_role[role] if q['src']['crew'] == c], f'Shift lead, {short}, Crew {CREW[c]}')
        if role == 'Critical facilities engineer': lead['knows_lyra'] = True
for slot, name in enumerate(['day', 'swing', 'night']):
    make_lead([q for q in by_role['Security officer'] if q['src']['idx'] % 3 == slot], f'Security sergeant, {name} watch')
for role, title in [('Custodian', 'Lead custodian'), ('Cafeteria cook', 'Head cook'), ('Logistics & receiving', 'Receiving lead'),
                    ('Contractor', 'Contractor foreman (solar crew)')]:
    make_lead(by_role[role], title)
for q in by_role['Network engineer']:
    if q['src']['idx'] in (0, 1): q['title'] = 'Senior network engineer'; q['knows_lyra'] = True
ops = sorted(by_role['Operations & research staff'], key=lambda q: -q['age'])
for q, t in zip(ops[:2], ['Senior research engineer', 'Senior systems engineer']): q['title'] = t; q['knows_lyra'] = True
for q in ops[2:]: q['title'] = R.choice(['Operations analyst', 'Capacity planner', 'Research engineer', 'Systems engineer', 'Site reliability engineer',
                                         'Energy and cooling analyst', 'Procurement coordinator', 'HR and site coordinator', 'Data scientist'])

# ---------- addresses and neighbors ----------
STREETS = {
    'saltbrush': ['Creosote Lane', 'Mesquite Street', 'Ocotillo Drive', 'Palo Verde Avenue', 'Yucca Street', 'Sage Court', 'Cholla Road',
                  'Desert Willow Way', 'Quail Run', 'Roadrunner Lane', 'Agave Street', 'Dry Lake Road'],
    'ironwood': ['Granite', 'Depot', 'Pinyon', 'Quarry', 'Foundry', 'Boulder', 'Juniper', 'Switchback', 'Tamarack', 'Ore Cart', 'Signal',
                 'Trestle', 'Cinder', 'Smelter', 'Ridge', 'Whistle Stop', 'Coalbin', 'Spur', 'Basalt', 'Assay', 'Tailings', 'Caboose',
                 'Flatcar', 'Ingot', 'Mica', 'Feldspar', 'Lantern', 'Chimney', 'Water Tower', 'Rimrock', 'Bedrock', 'Sidetrack', 'Gravel',
                 'Freight', 'Silver', 'Copper', 'Turntable', 'Roundhouse', 'Hopper', 'Gondola', 'Ballast', 'Tie Plate'],
    'halcyon': ['Vista', 'Sunrise', 'Horizon', 'Canyon View', 'Skyline', 'Mirage', 'Solstice', 'Equinox', 'Meridian', 'Zenith', 'Lumen',
                'Prism', 'Aurora', 'Cascade', 'Crescent', 'Harbor', 'Summit', 'Overlook', 'Promenade', 'Parkview', 'Glass Garden',
                'Terrace', 'Cobalt', 'Silica', 'Halo', 'Corona', 'Ember', 'Daybreak', 'Arcadia', 'Eastgate', 'Westgate', 'Northpoint'],
}
SUFFIX = {'ironwood': ['Street', 'Avenue', 'Road', 'Lane'], 'halcyon': ['Boulevard', 'Drive', 'Court', 'Way', 'Terrace']}
for city in STREETS:
    keys = sorted({p['src']['home']['street'] for p in people if p['src']['city'] == city})
    names = {}
    for i, k in enumerate(keys):
        n = STREETS[city][i % len(STREETS[city])]
        names[k] = n if city == 'saltbrush' else f"{n} {SUFFIX[city][i % len(SUFFIX[city])]}"
    for k in keys:
        on = sorted([p for p in people if p['src']['city'] == city and p['src']['home']['street'] == k], key=lambda q: q['src']['home']['x'])
        x0 = min(q['src']['home']['x'] for q in on)
        for q in on:
            num = 100 + int((q['src']['home']['x'] - x0) / 6) * 2 + (1 if q['src']['home']['z'] < k else 0)
            q['address'] = f"{num} {names[k]}, {city.capitalize()}"
            q['street_key'] = (city, k)
for p in people:
    h = p['src']['home']
    p['neighbors'] = [q['id'] for q in people if q is not p and q['street_key'] == p['street_key']
                      and abs(q['src']['home']['x'] - h['x']) < 45 and abs(q['src']['home']['z'] - h['z']) < 45]

# ---------- relationships ----------
edges = []
def edge(a, b, kind, **kw):
    edges.append({'a': a['id'], 'b': b['id'], 'type': kind, **kw, 'history': None})
def crewmates(p):
    s = p['src']
    if s['sched'] == 'rot12': return [q for q in people if q is not p and q['src']['sched'] == 'rot12' and q['src']['crew'] == s['crew']]
    if s['sched'] == 'sec8': return [q for q in people if q is not p and q['src']['sched'] == 'sec8' and q['src']['idx'] % 3 == s['idx'] % 3]
    if s['sched'] == 'janitor': return [q for q in people if q is not p and q['src']['sched'] == 'janitor' and q['src']['idx'] % 2 == s['idx'] % 2]
    return [q for q in people if q is not p and q['src']['sched'] == 'office']

# Vira couples: same town, compatible ages; the second partner moves into the first's house
taken = set()
couples = []
pool = people[:]
R.shuffle(pool)
for a in pool:
    if len(couples) >= 12: break
    if a['id'] in taken or a['age'] < 24: continue
    cands = [b for b in pool if b is not a and b['id'] not in taken and b['src']['city'] == a['src']['city'] and abs(b['age'] - a['age']) <= 7
             and b['age'] >= 24 and (R.random() < 0.15 or {a['pronouns'], b['pronouns']} == {'she/her', 'he/him'})]
    if not cands: continue
    b = R.choice(cands)
    taken |= {a['id'], b['id']}
    married = R.random() < 0.7
    couples.append((a, b))
    edge(a, b, 'married' if married else 'partners', shared_home=True)
    b['moved_in_with'] = a['id']
    if married and R.random() < 0.6: b['last'] = a['last']
for a, b in couples:
    b['address'] = a['address']; b['neighbors'] = a['neighbors']; b['street_key'] = a['street_key']
    h = a['src']['home']
    # second car parks further down the driveway, toward the street
    b['home_override'] = {'x': h['x'], 'z': round(h['z'] + (5.5 if h['street'] > h['z'] else -5.5), 1), 'street': h['street']}

def pairs(n, kind, cond, **kw):
    made = 0
    for _ in range(4000):
        if made >= n: break
        a, b = R.sample(people, 2)
        if any({e['a'], e['b']} == {a['id'], b['id']} for e in edges) or not cond(a, b): continue
        edge(a, b, kind, **kw); made += 1
pairs(7, 'siblings', lambda a, b: abs(a['age'] - b['age']) <= 9 and a['id'] not in taken and b['id'] not in taken)
for e in edges:
    if e['type'] == 'siblings':
        a, b = people[e['a']], people[e['b']]
        b['last'] = a['last']
pairs(5, 'cousins', lambda a, b: True)
pairs(8, 'exes', lambda a, b: abs(a['age'] - b['age']) <= 10 and {a['pronouns'], b['pronouns']} == {'she/her', 'he/him'})
for p in people:
    cm, nb = crewmates(p), [people[i] for i in p['neighbors']]
    for _ in range(R.randint(2, 4)):
        u = R.random()
        src = cm if u < 0.55 and cm else nb if u < 0.75 and nb else [q for q in people if q['src']['city'] == p['src']['city'] and q is not p] if u < 0.92 else people
        q = R.choice(src)
        if q is p or any({e['a'], e['b']} == {p['id'], q['id']} for e in edges): continue
        edge(p, q, 'friends')
    if R.random() < 0.38:
        q = R.choice(cm or nb or people)
        if q is not p and not any({e['a'], e['b']} == {p['id'], q['id']} for e in edges): edge(p, q, 'friction')
for p in people:
    if p['lead'] and p['src']['sched'] in ('rot12', 'sec8'):
        for q in R.sample([q for q in crewmates(p) if q.get('supervisor') == p['id']], 2): edge(p, q, 'mentor')
pairs(9, 'crush', lambda a, b: a['id'] not in taken, one_way=True)
for e in edges: e['strength'] = round(R.uniform(0.3, 1.0), 2)

# final pass: surname changes for siblings and spouses can collide with someone else's name
locked = {e['b'] for e in edges if e['type'] in ('siblings', 'married')}
seen = Counter(f"{p['first']} {p['last']}" for p in people)
for p in sorted(people, key=lambda q: q['id'] in locked):
    while seen[f"{p['first']} {p['last']}"] > 1 and p['id'] not in locked:
        seen[f"{p['first']} {p['last']}"] -= 1
        p['last'] = R.choice(EXTRA_LAST)
        seen[f"{p['first']} {p['last']}"] += 1

# ---------- households ----------
JOBS = {
    'saltbrush': ['teaches at the Saltbrush school', 'works the counter at the diner on Main', 'runs the register at the mini mart by the gas station',
                  'cleans rooms at the motel', 'works at the pharmacy', 'drives for the county road crew', 'works at the feed and seed',
                  'is a part-time pastor at the church', 'cuts hair at the barber shop', 'stocks shelves at the grocery', 'works remotely for a company in Phoenix',
                  'is a home health aide', 'is retired', 'is between jobs', 'works at the post office', 'runs a small welding business out of the garage'],
    'ironwood': ['works at the truck stop', 'is a conductor for the railroad', 'works in one of the warehouses south of the tracks', 'tends bar at the saloon',
                 'works at the machine shop', 'tattoos at the shop on Main Street', 'bakes at the bakery', 'works at the tire shop', 'runs the bait and tackle shop',
                 'drives a long-haul truck', 'works the front desk at a highway motel', 'is retired from the quarry', 'is between jobs', 'works at the pawn shop',
                 'is a substitute teacher', 'does landscaping and rock work'],
    'halcyon': ['is a nurse at the hospital downtown', 'works in an office downtown', 'teaches high school', 'is a real-estate agent', 'works retail at the mall',
                'is a graphic designer', 'is a paralegal', 'manages a restaurant downtown', 'works for the city', 'is a dental hygienist', 'is a software developer',
                'is in grad school online', 'is retired', 'is between jobs', 'is a fitness instructor', 'works at a car dealership off the freeway'],
}
def spouse_word(q, e):
    if e['type'] != 'married': return 'partner'
    return {'she/her': 'wife', 'he/him': 'husband'}.get(q['pronouns'], 'spouse')
def other_adult(p, sex=None):
    sex = sex or R.choice(['F', 'M'])
    return (R.choice(ADULT_F) if sex == 'F' else R.choice(ADULT_M)), sex
for p in people:
    if 'moved_in_with' in p: continue
    city, hh = p['src']['city'], []
    partner_edge = next((e for e in edges if e.get('shared_home') and e['a'] == p['id']), None)
    if partner_edge:
        b = people[partner_edge['b']]
        hh.append({'staff_id': b['id'], 'relation': spouse_word(b, partner_edge)})
    elif 24 <= p['age'] and R.random() < (0.58 if p['age'] < 60 else 0.45):
        sex = 'F' if p['pronouns'] == 'he/him' else 'M' if p['pronouns'] == 'she/her' else R.choice('FM')
        if R.random() < 0.07: sex = 'F' if sex == 'M' else 'M'
        name, sex = other_adult(p, sex)
        married = R.random() < 0.72
        rel = ('wife' if sex == 'F' else 'husband') if married else ('girlfriend' if sex == 'F' else 'boyfriend')
        hh.append({'name': f"{name} {p['last'] if married and R.random() < 0.7 else R.choice(EXTRA_LAST)}", 'relation': rel,
                   'age': max(21, p['age'] + R.randint(-6, 6)), 'occupation': R.choice(JOBS[city])})
    elif p['age'] < 30 and R.random() < 0.35:
        name, sex = other_adult(p)
        hh.append({'name': f"{name} {R.choice(EXTRA_LAST)}", 'relation': 'roommate', 'age': p['age'] + R.randint(-3, 4), 'occupation': R.choice(JOBS[city])})
    kids_p = 0.0 if p['age'] < 23 else 0.62 if hh and hh[0]['relation'] not in ('roommate',) else 0.2
    if R.random() < kids_p and p['age'] >= 23:
        for _ in range(R.choice([1, 1, 2, 2, 3])):
            age = R.randint(0, min(24, p['age'] - 20))
            sex = R.choice('FM')
            hh.append({'name': f"{R.choice(KID_F if sex == 'F' else KID_M)} {p['last']}", 'relation': 'daughter' if sex == 'F' else 'son', 'age': age})
    if R.random() < 0.06:
        sex = R.choice('FM')
        hh.append({'name': f"{R.choice(ADULT_F if sex == 'F' else ADULT_M)} {p['last']}", 'relation': 'mother' if sex == 'F' else 'father',
                   'age': p['age'] + R.randint(22, 34), 'occupation': 'is retired'})
    if R.random() < 0.45: hh.append({'pet': R.choice(['dog', 'dog', 'cat', 'two cats', 'old dog', 'desert tortoise', 'parrot', 'chickens'])})
    p['household'] = hh
for a, b in couples:
    b['household'] = [{'staff_id': a['id'], 'relation': spouse_word(a, next(e for e in edges if e.get('shared_home') and e['a'] == a['id']))}] +         [h for h in a['household'] if h.get('staff_id') != b['id']]

# ---------- write ----------
GAZETTEER = {
    'saltbrush': 'Small desert town north of Vira on the highway; Marcus lives here. Downtown storefronts: diner, hardware, cafe, saloon, pharmacy, grocery, post office, '
                 'barber, thrift store, laundry, bank, pizza place, auto parts, taco shop, bookstore, feed & seed. A gas station with a mini mart, a motel, a church, a school.',
    'ironwood': 'Railroad and quarry town in granite hills. Main Street downtown: hardware, diner, pawn shop, auto parts, saloon, feed & supply, barber, tattoo shop, cafe, '
                'machine shop, thrift, tire shop, liquor store, bakery, bait & tackle, laundromat. Warehouses south of the tracks, a trailer park, a highway strip of motels '
                'and gas stations, a truck stop at the east end.',
    'halcyon': 'The city: a downtown skyline, hills neighborhoods, a freeway with numbered exits. Long commute to Vira (about an hour).',
    'vira': 'Hyperscale data center in the desert: sixteen data halls (A1 to D4) in four blocks, generator and cooling yards, a substation, a solar field, '
            'a staff lot, a front gatehouse with lift arms, and the operations building (lobby, offices, cafeteria, security office, network operations). '
            'Staff park in the lot north of the halls.',
    'rules': 'Use these places generically ("the diner in Saltbrush"); do not invent business names, new towns or landmarks.',
}
out = []
for p in people:
    s = p['src']
    rec = {
        'id': p['id'], 'name': f"{p['first']} {p['last']}", 'pronouns': p['pronouns'], 'age': p['age'], 'birthday': p['birthday'],
        'look': p['look'], 'role': s['role'], 'title': p['title'], 'lead': p['lead'], 'supervisor': p.get('supervisor'),
        'knows_lyra': p['knows_lyra'], 'years_at_vira': p['years_at_vira'], 'shift': shift_text(s), 'post': post_text(s),
        'home': {'city': s['city'], 'address': p['address'], 'commute_minutes': s['commute_min'], 'neighbors': p['neighbors']},
        'car': s['car'], 'household': p['household'],
    }
    if 'home_override' in p: rec['home']['game_drive'] = p['home_override']
    out.append(rec)
meta = {'generated_for': '-'.join(map(str, TODAY)), 'vira_opened': VIRA_OPENED, 'count': len(out),
        'lyra_canon': 'Most staff think Vira runs on ordinary automation. Only the people marked knows_lyra (a handful of senior engineers) know Lyra by name '
                      'and talk to her. Nobody outside Marcus\'s circle knows about her choices, the dog, or the hologram.'}
(DATA / 'roster.json').write_text(json.dumps({'meta': meta, 'places': GAZETTEER, 'people': out, 'relationships': edges}, indent=1), encoding='utf-8')
print(len(out), 'people,', len(edges), 'relationships,', len(couples), 'Vira couples,', sum(p['knows_lyra'] for p in people), 'know Lyra')
print(Counter(e['type'] for e in edges))
