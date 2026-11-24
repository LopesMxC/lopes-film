---
name: dataviz
description: Animated charts, numbers and data stories: choosing the chart, simplifying, labelling, animating bars, lines, counters and maps accurately. Read it when the person asks for a chart, graph, statistic, infographic, counter or timeline in a video.
category: customize
---

# Data in motion

A chart in a film has two or three seconds to make one point. Decide the sentence it proves, then draw only that.

## Pick the form
| The point | Use |
| --- | --- |
| compare amounts | horizontal bars, sorted |
| change over time | a line (one to three series) |
| parts of a whole | one stacked bar or at most 5 slices |
| a single number | a big number with its change and a label |
| ranking changing over time | bars that reorder |
| where | a simple map with one highlighted area |

Avoid 3D, dual axes and more than five colours.

## Accuracy first
- Bars start at zero. Lines may crop the axis but say so.
- Use only data the person gave or that a source supports; show the source and the date on screen in small text. Never invent or smooth numbers.
- The animation encodes the data: bars grow from the baseline, lines draw left to right at the pace of time. Do not overshoot a value (no springy bars that pass the true height).
- Round for the eye (12.4 M, not 12,413,877) but never so much that the point changes.

## Make it readable
- Remove gridlines, borders, legends when direct labels can do it; label the bars and line ends themselves.
- Highlight the one thing that matters in the accent colour; everything else in a neutral grey.
- Numbers use tabular figures so counters do not jitter. A counter takes 1–1.5 s with ease-out and lands exactly on the value.
- Text at least 5% of the frame height; a chart on a phone has 4–6 labels, not 20.
- Build it in order the voice speaks: axis first, then the item discussed, then the next. Hold the finished chart for 1.5 s.

## Build
Make it a page that is a function of t (`motion` skill): React plus the layer's `interpolate`/`spring`/`Easing` for charts, SVG for the shapes, `random('seed')` instead of random. Take the data from a `const DATA = […]` at the top, so a number changes in one place.

## Check
Read it with sound off: can you state the point? Compare each drawn value with the source. `lopesfilm look` at the start, the middle of the animation, and the held end.
