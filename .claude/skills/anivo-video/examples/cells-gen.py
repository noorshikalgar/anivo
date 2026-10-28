"""Reference example (owner: "best, keep it as an example"): Life's Building Blocks, classroom look.

Generates cells.txt: biology basics, cells as life's building blocks, with a voiceover. 13 steps, 90.8 s.
Build: gen.py, new, apply, synth, fit, look.py classroom, render, mix (see SKILL.md).
"""
from pathlib import Path

OUT = Path(__file__).with_name("cells.txt")
L = []
a = L.append

a('scene "Life\'s building blocks" style=sketch theme=paper-light size=1920x1080 fps=30 background=grid captions=voice')
a("")


def ids(prefix, rng):
    return ", ".join(f"{prefix}{i}" for i in rng)


# --- intro
a('text title "Life\'s Building Blocks" at=160,330 size=1600x170 font-size=120 text-align=center')
a('text sub "biology basics: the cell" at=160,520 size=1600x90 font-size=56 text-align=center color=accent')
a('box under "" at=660,620 size=600x8 fill=warning stroke=warning radius=4')
a('box mp1 "what a cell is" at=170,470 size=500x120 look=soft font-size=42')
a('box mp2 "parts of a cell" at=710,470 size=500x120 look=soft font-size=42')
a('box mp3 "two types of cells" at=1250,470 size=500x120 look=soft font-size=42')

# --- everything alive is made of cells
a('text ch "Everything alive is made of cells" at=160,90 size=1600x90 font-size=60 text-align=center')
a('ellipse bac "" at=320,340 size=180x110 fill=success-soft stroke=success stroke-width=6')
a('icon tree lucide:trees at=860,290 size=200x200')
a('icon human lucide:person-standing at=1420,290 size=200x200')
for key, x, t in [("lb1", 210, "a bacterium"), ("lb2", 760, "a tree"), ("lb3", 1320, "a human")]:
    a(f'text {key} "{t}" at={x},540 size=400x70 font-size=46 text-align=center')
for key, x, t in [("nb1", 210, "one cell"), ("nb2", 760, "billions of cells"), ("nb3", 1320, "trillions of cells")]:
    a(f'text {key} "{t}" at={x},620 size=400x60 font-size=40 text-align=center color=accent')

# --- inside a cell: one big cell on the left, notes on the right
a('text ih "Inside a cell" at=160,90 size=1600x90 font-size=60 text-align=center')
a('ellipse cel "" at=200,220 size=1040x600 fill=success-soft stroke=accent stroke-width=10')
a('ellipse nuc "" at=560,380 size=320x260 fill=purple-soft stroke=purple stroke-width=6')
a('icon dna lucide:dna at=650,440 size=140x140')
a('ellipse mi1 "" at=300,560 size=220x110 fill=warning-soft stroke=warning stroke-width=6')
a('ellipse mi2 "" at=960,300 size=200x100 fill=warning-soft stroke=warning stroke-width=6')
RIB = [(400, 330), (450, 290), (360, 440), (1000, 600), (1060, 650), (950, 690), (1100, 560)]
for i, (x, y) in enumerate(RIB):
    a(f'ellipse rb{i} "" at={x},{y} size=30x30 fill=accent stroke=accent')
a('text o1 "organs: jobs in a body" at=1290,330 size=600x70 font-size=40')
a('text o2 "organelles: jobs in a cell" at=1290,430 size=600x70 font-size=40 color=accent')
a('text o3 "a little organ" at=1290,530 size=600x60 font-size=36 color=muted')
# one note panel for each organelle
for key, name, color, role, note in [
    ("n", "Nucleus", "purple", "the control center", "holds the DNA"),
    ("m", "Mitochondria", "danger", "the power plants", "release energy from food"),
    ("r", "Ribosomes", "accent", "the factories", "build proteins"),
]:
    a(f'text {key}name "{name}" at=1290,260 size=600x90 font-size=60 color={color}')
    a(f'text {key}role "{role}" at=1290,370 size=600x70 font-size=44')
    a(f'text {key}note "{note}" at=1290,450 size=600x60 font-size=38 color=muted')
for i in range(6):
    a(f'ellipse pr{i} "" at={1310 + i * 70},580 size=56x56 fill=accent-soft stroke=accent')
a('text prl "a protein: a chain" at=1290,650 size=600x60 font-size=36')

# --- two types
a('text th "Two types of cells" at=160,90 size=1600x90 font-size=60 text-align=center')
a('text pkh "prokaryotic" at=160,200 size=760x80 font-size=56 text-align=center color=danger')
a('text ekh "eukaryotic" at=1000,200 size=760x80 font-size=56 text-align=center color=accent')
a('text pks "pro: before a nucleus" at=160,280 size=760x60 font-size=36 text-align=center color=muted')
a('text eks "eu: a true nucleus" at=1000,280 size=760x60 font-size=36 text-align=center color=muted')
a('box div "" at=955,210 size=10x600 fill=muted stroke=muted radius=5')
# a prokaryote: a capsule with free DNA
a('ellipse pk "" at=300,390 size=480x240 fill=success-soft stroke=success stroke-width=8')
a('icon pkd lucide:dna at=480,450 size=120x120')
for i, (x, y) in enumerate([(380, 440), (400, 560), (660, 450), (680, 560)]):
    a(f'ellipse pkr{i} "" at={x},{y} size=26x26 fill=accent stroke=accent')
a('text pkl "no nucleus: the DNA floats free" at=160,680 size=760x60 font-size=40 text-align=center color=danger')
a('text pke "for example, bacteria" at=160,750 size=760x60 font-size=38 text-align=center color=muted')
# a eukaryote: a bigger cell with a nucleus and organelles
a('ellipse ek "" at=1100,350 size=560x310 fill=success-soft stroke=accent stroke-width=8')
a('ellipse ekn "" at=1290,410 size=190x160 fill=purple-soft stroke=purple stroke-width=6')
a('icon ekd lucide:dna at=1340,445 size=90x90')
a('ellipse ekm1 "" at=1150,540 size=120x60 fill=warning-soft stroke=warning stroke-width=5')
a('ellipse ekm2 "" at=1510,420 size=110x56 fill=warning-soft stroke=warning stroke-width=5')
a('text ekl "a nucleus and organelles" at=1000,680 size=760x60 font-size=40 text-align=center color=success')
a('text eke "for example, plants and animals" at=1000,750 size=760x60 font-size=38 text-align=center color=muted')
a('text pksz "small and simple" at=160,280 size=760x60 font-size=44 text-align=center color=danger')
a('text eksz "about 10 times bigger" at=1000,280 size=760x60 font-size=44 text-align=center color=accent')

# --- outro
a('text sum "In short" at=160,120 size=1600x110 font-size=84 text-align=center')
a('text k1 "1. All life is made of cells." at=300,300 size=1400x80 font-size=54')
a('text k2 "2. Organelles do the jobs inside." at=300,410 size=1400x80 font-size=54')
a('text k3 "3. Only eukaryotic cells have a nucleus." at=300,520 size=1400x80 font-size=54')
a('text endt "Life\'s Building Blocks" at=160,300 size=1600x130 font-size=92 text-align=center')
a('text thanks "Thanks for watching" at=160,470 size=1600x90 font-size=64 text-align=center color=accent')
a('text endsub "next time: a closer look at DNA" at=160,580 size=1600x70 font-size=44 text-align=center color=muted')
# the watermark is last, so it draws on top; it has no enter, so it shows for the whole video
a('text wm "made with anivo" at=1600,24 size=296x48 font-size=30 text-align=right color=muted opacity=0.75')
a("")

CELL = ", ".join(["cel", "nuc", "dna", "mi1", "mi2", ids("rb", range(len(RIB)))])

S = []
s = S.append
s('step "Title"')
s("  # say: What do you, a tree, and a tiny bacterium have in common? Let's explore cells, the building blocks of life.")
s("  # part: intro")
s("  wait 1500ms")
s("  enter title typewriter dur=1600ms after=prev")
s("  enter sub fade after=prev")
s("  enter under wipe after=prev dur=600ms")
s('step "Map" caption="In the next few minutes: what a cell is, the parts inside it, and the two main types of cells."')
s("  # part: intro")
s("  exit sub, under fade dur=300ms")
s("  morph title y=220 font-size=96 dur=600ms")
s("  enter mp1 rise after=prev")
s("  enter mp2 rise +1300ms after=prev")
s("  enter mp3 rise +1300ms after=prev")
s("")
s('step "Made of cells" caption="Cells are the basic units of life. Every living thing is made of cells: a bacterium is one cell, and a human has trillions." transition=fade')
s("  exit title, mp1, mp2, mp3 fade dur=400ms")
s("  enter ch fade after=prev")
s("  enter bac pop after=prev")
s("  enter lb1, nb1 fade after=prev")
s("  enter tree pop +600ms after=prev")
s("  enter lb2, nb2 fade after=prev")
s("  enter human pop +600ms after=prev")
s("  enter lb3, nb3 fade after=prev")
s("")
s('step "Organelles" caption="Inside each cell are organelles. Each organelle has a job, like the organs in your body."')
s("  exit ch, bac, tree, human, lb1, lb2, lb3, nb1, nb2, nb3 fade dur=400ms")
s("  enter ih fade after=prev")
s("  enter cel pop after=prev")
s("  enter nuc, mi1, mi2 pop stagger=250ms after=prev")
s(f"  enter dna, {ids('rb', range(len(RIB)))} pop stagger=80ms after=prev")
s("  enter o1 fade after=prev")
s("  enter o2 fade after=prev")
s("  enter o3 fade after=prev")
s("")
s('step "Nucleus" caption="The nucleus is the control center. It holds the DNA: the instructions for how the cell grows and works."')
s("  exit o1, o2, o3 fade dur=300ms")
s("  enter nname fade after=prev")
s("  enter nrole fade after=prev")
s("  enter nnote fade after=prev")
s("  glow nuc after=prev")
s("")
s('step "Mitochondria" caption="Mitochondria are the power plants. They release energy from food, in a process called cellular respiration."')
s("  exit nname, nrole, nnote fade dur=300ms")
s("  enter mname fade after=prev")
s("  enter mrole fade after=prev")
s("  enter mnote fade after=prev")
s("  glow mi1, mi2 after=prev")
s("")
s('step "Ribosomes" caption="Ribosomes are the factories. They build proteins, which make up the cell and do most of its work."')
s("  exit mname, mrole, mnote fade dur=300ms")
s("  enter rname fade after=prev")
s("  enter rrole fade after=prev")
s("  enter rnote fade after=prev")
s(f"  enter {ids('pr', range(6))} pop stagger=150ms after=prev")
s("  enter prl fade after=prev")
s(f"  pulse {ids('rb', range(len(RIB)))} after=prev")
s("")
s('step "Two types" caption="Cells come in two main types: prokaryotic and eukaryotic. The big difference is the nucleus." transition=fade')
s(f"  exit ih, {CELL}, rname, rrole, rnote, {ids('pr', range(6))}, prl fade dur=400ms")
s("  enter th fade after=prev")
s("  enter div wipe dur=600ms after=prev")
s("  enter pkh, pks fade after=prev")
s("  enter ekh, eks fade +400ms after=prev")
s("")
s('step "Prokaryotic" caption="Prokaryotic cells, like bacteria, have no nucleus. Their DNA floats freely inside the cell."')
s("  enter pk pop")
s(f"  enter pkd, {ids('pkr', range(4))} pop stagger=150ms after=prev")
s("  enter pkl fade after=prev")
s("  enter pke fade after=prev")
s("  shake pkd after=prev")
s("")
s('step "Eukaryotic" caption="Eukaryotic cells, like those in plants and animals, have a nucleus and organelles wrapped in membranes."')
s("  enter ek pop")
s("  enter ekn pop after=prev")
s("  enter ekd pop after=prev")
s("  enter ekm1, ekm2 pop stagger=200ms after=prev")
s("  enter ekl fade after=prev")
s("  enter eke fade after=prev")
s("  glow ekn after=prev")
s("")
s('step "Size" caption="Prokaryotic cells are small and simple. Most eukaryotic cells are about ten times bigger, and much more complex."')
s("  exit pks, eks fade dur=300ms")
s("  enter pksz fade after=prev")
s("  enter eksz fade +600ms after=prev")
s("  pulse ek after=prev")
s("")
s('step "In short" caption="In short: life is made of cells, organelles do the jobs inside, and only eukaryotic cells have a nucleus." transition=fade')
s("  # part: outro")
s("  exit th, div, pkh, ekh, pksz, eksz, pk, pkd, " + ids("pkr", range(4)) + ", pkl, pke, ek, ekn, ekd, ekm1, ekm2, ekl, eke fade dur=400ms")
s("  enter sum fade after=prev")
s("  enter k1, k2, k3 rise stagger=2000ms after=prev")
s('step "Thanks" transition=fade')
s("  # say: Thanks for watching. Next time, we take a closer look at DNA, the instructions inside every cell.")
s("  # part: outro")
s("  exit sum, k1, k2, k3 fade dur=400ms")
s("  enter endt fade after=prev")
s("  enter thanks rise after=prev")
s("  enter endsub fade after=prev")

OUT.write_text("\n".join(L + S) + "\n")
print(OUT)
