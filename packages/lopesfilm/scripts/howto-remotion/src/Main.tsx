import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Backdrop } from './ui';
import { Chat, Export, Intro, Library, Outro, Skills, Studio } from './scenes';

/** scene lengths in frames (30 fps), in order; each cut overlaps the next scene by TRANSITION frames */
const LENGTHS = [120, 240, 240, 240, 240, 210, 150];
const TRANSITION = 15;
export const TOTAL = LENGTHS.reduce((a, b) => a + b, 0) - TRANSITION * (LENGTHS.length - 1);

const scenes = [Intro, Chat, Studio, Library, Skills, Export, Outro];
const cuts = [
  fade(), slide({ direction: 'from-right' }), slide({ direction: 'from-bottom' }), wipe({ direction: 'from-left' }), slide({ direction: 'from-right' }), fade(),
];

export const Main: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <TransitionSeries>
      {scenes.flatMap((Scene, i) => [
        <TransitionSeries.Sequence key={`s${i}`} durationInFrames={LENGTHS[i]!}><Scene /></TransitionSeries.Sequence>,
        ...(i < scenes.length - 1 ? [<TransitionSeries.Transition key={`t${i}`} presentation={cuts[i]!} timing={i % 2 ? springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION }) : linearTiming({ durationInFrames: TRANSITION })} />] : []),
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);
