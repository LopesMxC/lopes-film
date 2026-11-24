'use client';

import React from 'react';
import { BRAND } from '@/lib/brand';

/* A marca do build (lib/brand): a Lopes.Film, a GlobalFilm ou a Lopes.Film, na cor --logo-fill.
   Logos largas (o LS da Lopes) ganham mais largura que as quadradas: o mesmo `size` as deixaria minúsculas. */
export function BrandLogo({ size = 18, className }: { size?: number; className?: string }) {
  const { mark, name } = BRAND;
  const width = Math.round(mark.w / mark.h > 2 ? size * 1.9 : size);
  return (
    <svg
      width={width}
      height={Math.round((width * mark.h) / mark.w)}
      viewBox={mark.viewBox}
      className={`block shrink-0 ${className ?? ''}`.trim()}
      style={{ color: 'var(--logo-fill, #c8f501)' }}
      role="img"
      aria-label={name}
      dangerouslySetInnerHTML={{ __html: mark.svg }}
    />
  );
}
