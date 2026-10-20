# 15 — Editor UI design

The editor UI follows the layout and the controls of professional tools, mainly Blender. The goal: a dense, consistent, and calm UI. Each control has one look and one behavior everywhere.

## 1. Rules

1. One control height: 22 px. One font: Inter, 12 px (labels and values), 11 px (notes).
2. A label is on the left of its control, aligned right, in a column of 40% of the width. A label is not above its control.
3. A group of settings is in a **panel**. A panel has a header with a disclosure arrow. Click the header to collapse or expand the panel. Ctrl+click: expand this panel and collapse the others. The editor keeps the state.
4. An on/off setting of an item is an **icon toggle** (for example the eye and the lock), not a switch with text.
5. A list of items is a **list view**: compact rows, the active row in the selection color, and a column of buttons on the right (add, remove, move up, move down).
6. An "add" command is a **+** button that opens a menu with icons and groups.
7. A number is a **drag field**: drag left or right to change the value. Click to type a value. Shift+drag: fine change. Ctrl+drag: steps of 10. Enter applies, Escape cancels. The arrows at the two ends change the value by one step. One drag is one undo step.
8. Related numbers (X and Y, width and height) are an **aligned column**: the fields touch, and the label is inside the field on the left.
9. Colors are a **color field**: one swatch bar. Click it to open the palette.
10. Each area has a **header** strip (26 px) with its title, menus, and tools. Areas have a 2 px gap and round corners.
11. No decoration: no shadows in panels, no large titles, no help text in the panels. Help text is in tooltips and in the status bar.

## 2. Layout

| Area | Place | Content |
|---|---|---|
| Top bar | Top | Menus (File, Edit, View, Audio, Help), the scene title, Present, Export |
| Steps | Left | A tree: steps, and the actions of each step. Search, add (+) |
| Viewport | Center | Header (view tools, zoom), toolbar (vertical, left), the canvas |
| Outliner | Right, top | A tree of the elements, with eye and lock toggles. Search |
| Properties | Right, bottom | Vertical tabs: Scene, Step, Actions, Element. Panels in each tab |
| Timeline | Bottom | Header (play controls, time), the timeline and the audio lanes |
| Status bar | Bottom edge | Mouse and key hints (left), messages (center), scene numbers (right) |

## 3. Colors (dark UI)

| Token | Value | Use |
|---|---|---|
| App background | `#161616` | The gaps between areas |
| Region | `#303030` | Area backgrounds |
| Header | `#2b2b2b` | Area headers, the top bar |
| Panel | `#383838` | Panel backgrounds |
| List | `#282828` | Trees and list views |
| Widget | `#545454` | Buttons and number fields |
| Field | `#1d1d1d` | Text fields |
| Menu | `#282828` | Dropdowns |
| Text | `#e6e6e6`, muted `#a0a0a0` | |
| Selection | `#4772b3`; selected row `#334d80` | |
| Active | `#ffaf29` | The active element outline |

The light UI uses the same tokens with light values.

## 4. Keys

| Key | Command |
|---|---|
| F3 or Ctrl+K | Search for a command |
| Ctrl+Space | Maximize the viewport (again: restore the areas) |
| N | Add a step |
| Space | Play or pause |

## 5. Actions tab

The Actions tab is the place to animate a step. It opens when a step is selected.

1. **Step bar:** the previous and next step, a list of the steps, and Play this step.
2. **Add an action:** quick buttons (Appear, Fade in, Draw, Type, Disappear, Pulse, Glow, Focus, Flow, Zoom, Count). The action uses the selected elements. With no selection, a dialog asks for the elements. The **+** button of the sequence has all actions.
3. **Sequence:** the actions of the step, with a bar for the time of each action in the step. The canvas marks the targets of the active action with orange dashed boxes.
4. **What:** the effect and its settings. **Who:** the targets (remove one, choose, use the selection, select on the canvas). **When:** delay, duration, easing (with a curve), stagger, sound, and the buttons With previous and After previous.
