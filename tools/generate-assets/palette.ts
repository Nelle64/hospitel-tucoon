/**
 * Pixel Hospital art bible palette. A limited, coordinated palette with department accents.
 * Light comes from the upper left: highlights on top/left edges, shade on bottom/right.
 */
export type RGBA = [number, number, number, number];

export function hex(h: string, a = 255): RGBA {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), a];
}

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), Math.round(a[3] + (b[3] - a[3]) * t)];
}
export const lighten = (c: RGBA, t: number): RGBA => mix(c, [255, 255, 240, c[3]], t);
export const darken = (c: RGBA, t: number): RGBA => mix(c, [20, 18, 40, c[3]], t);

export const P = {
  outline: hex('#1b1d2e'),
  ink: hex('#2b2d42'),
  white: hex('#f7f4ea'),
  paper: hex('#ece6d6'),
  grey1: hex('#d8d6cf'),
  grey2: hex('#a9a8a6'),
  grey3: hex('#77788a'),
  grey4: hex('#4a4c5e'),
  steel: hex('#9fb3c8'),
  steelDark: hex('#5f7590'),
  chrome: hex('#d9e6f2'),
  wood: hex('#b07a4a'),
  woodDark: hex('#7a4f2e'),
  woodLight: hex('#d9a066'),
  grass1: hex('#5aa04a'),
  grass2: hex('#4b8c3e'),
  grass3: hex('#6fb85a'),
  grassDark: hex('#2f5e2b'),
  soil: hex('#8b6a45'),
  lockedGrass: hex('#3d6b3a'),
  red: hex('#d1495b'),
  redDark: hex('#8f2433'),
  green: hex('#43aa8b'),
  greenDark: hex('#2a6e59'),
  blue: hex('#4f9dde'),
  blueDark: hex('#2b5f8f'),
  yellow: hex('#f2c14e'),
  orange: hex('#f08a4b'),
  purple: hex('#9b5de5'),
  teal: hex('#2ec4b6'),
  pink: hex('#f4a5c0'),
  screen: hex('#7fe0c8'),
  screenDark: hex('#1f6f6a'),
  glass: hex('#bfe7ff', 200),
  shadow: hex('#10101a', 80),
  bed: hex('#e9eef5'),
  blanket: hex('#8ecae6'),
  pillow: hex('#ffffff'),
  corridor1: hex('#e6e1d3'),
  corridor2: hex('#d6d0c0'),
  wallTop: hex('#c9c3b5'),
  wallFace: hex('#a49c8c'),
  wallDark: hex('#6b6457'),
  door: hex('#8a6a4a'),
};

export const SKIN: RGBA[] = [hex('#f6d3b3'), hex('#e0ac7e'), hex('#b97a50'), hex('#7d4a2e')];
export const HAIR: RGBA[] = [hex('#2b1d14'), hex('#6b3e1f'), hex('#c98f3c'), hex('#e8d08a'), hex('#9a9aa0'), hex('#b8432f')];
export const SHIRTS: RGBA[] = [hex('#e07a5f'), hex('#3d85c6'), hex('#81b29a'), hex('#f2cc8f'), hex('#a26fb0'), hex('#5c677d')];
export const PANTS: RGBA[] = [hex('#33415c'), hex('#5c4033'), hex('#4a5759'), hex('#2d2a32')];
