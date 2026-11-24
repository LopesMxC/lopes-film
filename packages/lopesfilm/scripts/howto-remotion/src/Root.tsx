import React from 'react';
import { Composition } from 'remotion';
import { Main, TOTAL } from './Main';

export const RemotionRoot: React.FC = () => (
  <Composition id="HowTo" component={Main} durationInFrames={TOTAL} fps={30} width={1280} height={720} />
);
