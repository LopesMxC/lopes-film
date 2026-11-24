---
name: grading
description: Colour correction and grading: exposure, white balance, contrast, skin tones, matching shots, looks and LUTs. Read it when the person asks to fix or change the colour or mood of footage, match shots, or give a film a look.
category: edit
---

# Colour: correct first, then grade

**Correct** makes the picture right and the shots match. **Grade** gives it a look. Never grade a picture that is not corrected.

## Correct, in this order
1. **Exposure**: whites reach near the top, blacks near the bottom, nothing clipped that matters (a sky, a face). Fix it with the film's brightness, contrast and filter controls, on the whole shot.
2. **White balance**: find something that should be neutral (a wall, a shirt, teeth, the whites of eyes) and make it so. Fix temperature (blue ↔ orange) then tint (green ↔ magenta).
3. **Contrast**: a gentle S-curve; deepen blacks a little, keep highlights soft. Too much contrast clips and looks cheap.
4. **Saturation**: only after the above, and by 5–15%. Faces first: skin should sit on the line between red and yellow, never green or purple.
5. **Match**: pick one hero shot; make every other shot of the same scene match its brightness, white balance and skin tone. Check by looking at two frames side by side with `lopesfilm look`.

## Grade
- Choose the mood in a sentence ("warm and nostalgic", "cold and tense", "clean and bright") and make two or three moves, not ten:
  - **Warm**: highlights toward orange, shadows slightly teal, lifted blacks.
  - **Cold**: whole picture toward blue, desaturate 10–20%, crushed blacks.
  - **Clean commercial**: bright, neutral whites, +10% saturation, soft contrast.
  - **Film**: gentle highlight roll-off, lifted blacks, slight grain (3–6%), no pure white.
- Keep skin natural under every look; mask the face if the look pushes it.
- A look is applied to the whole film with the same strength; vary only by scene mood, and then by a small amount.
- A library filter or LUT is a starting point at 50–80% strength, not a finish.

## Rules
- Screens lie: judge on the frames `lopesfilm look` shows, in a few places (dark scene, bright scene, face).
- Log or very flat footage needs a conversion before any look. If the picture looks washed out and grey, that is the reason.
- Titles and graphics are not graded; the footage under them is.

## Check
First shot, brightest shot, darkest shot, a close-up face, and a cut between two shots: no jump in colour you would notice.
