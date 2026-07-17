# Visual direction system

Use this reference during the designer and storyboard stages. The goal is not to decorate subtitles; it
is to choose the clearest visual language for the idea, then make every frame advance that idea.

## 1. Choose one visual thesis

Write one sentence:

> This video makes **[idea/emotion]** feel like **[visual metaphor/world]** through **[primary medium]**.

Examples:

- A developer tool feels fast through a live terminal/UI journey, tight push-ins, and response-time counters.
- A history explainer feels like an annotated archive through paper depth, map paths, dates, and evidence cards.
- A product launch feels premium through macro footage, controlled light sweeps, restrained type, and clean cuts.

Do not mix several unrelated “cool” styles. Define:

- palette, type scale, spacing, corner and shadow language;
- texture/depth treatment;
- camera and transition grammar;
- caption style and safe area;
- pacing curve for hook, proof, turn, payoff, and CTA.

## 2. Assign a primary visual to every beat

Choose one primary visual type per substantive beat:

| Type | Best for | Examples |
|---|---|---|
| Recording / footage | Demonstrating reality or emotion | screen recording, product shot, human action, B-roll |
| Still image | Place, person, mood, evidence | photo, generated key art, archival image |
| UI / code | Showing a workflow | terminal commands, app state, before/after |
| Diagram / map | Explaining relationships | flow, timeline, anatomy, route |
| Data graphic | Establishing scale or proof | counter, bars, comparison, annotated metric |
| Kinetic type | A short hook or decisive phrase | 1–2 second typographic hit, never the whole video |

Captions are not a primary visual. If a beat has only a caption, redesign it.

For every missing asset, write a concrete production instruction:

- capture instruction for screen/UI;
- search or licensing requirement for stock/archive;
- image prompt including subject, composition, lens/light, palette, aspect, and exclusions;
- video prompt including action, camera, duration, continuity, and negative constraints;
- diagram specification with nodes, labels, and animation order.

## 3. Design motion with intent

Name motion recipes in `data-motion` so `hara-video audit` can inspect variety. Prefer two to four
coherent recipes:

- `reveal-mask`: uncover a visual or key phrase along the reading direction;
- `push-focus`: camera push or scale shift toward new evidence;
- `parallax-depth`: slow depth separation for still imagery;
- `compare-split`: coordinated before/after or A/B reveal;
- `trace-path`: draw a route, process, or relationship;
- `count-up`: animate a number only when the number is evidence;
- `kinetic-slam`: short high-energy hook/payoff;
- `editorial-cut`: restrained cut/fade for documentary or premium tone.

Drive motion from the composition timeline. Avoid wall-clock timers and random values. Motion must settle
long enough to read; transitions must not obscure the evidence they connect.

## 4. Control pacing

- Change the visual state roughly every 2–4 seconds in short-form work; a shot may hold longer only when
  meaningful action continues inside it.
- Make the first three seconds contain both the promise and a visual proof/question.
- Alternate density: impact beat → explanation → proof → breath → payoff.
- Use captions to reinforce selected words, not to duplicate a full paragraph in the center.
- Reserve an intentional outro; never let captions continue after narration merely to fill duration.

## 5. Pre-compose coverage check

Before editing HTML, verify the storyboard:

- every script beat has one primary visual;
- every asset has a path or executable acquisition/generation instruction;
- at least two motion recipes are used for videos longer than 15 seconds;
- audio, caption, scene, and root duration derive from the same timing source;
- the ending and CTA have a designed visual state;
- any music-only tail is explicitly timed and justified.
