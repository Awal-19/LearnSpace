export type FaceShape = 'oval' | 'round' | 'square' | 'heart';
export type HairStyle =
  'short' | 'curly' | 'wavy' | 'long' | 'bob' | 'bun' | 'fade' | 'buzz' | 'hijabi' | 'none';
export type EyeStyle = 'calm' | 'happy' | 'focused' | 'wink' | 'glasses' | 'lashes';
export type EyebrowStyle = 'natural' | 'arched' | 'thick' | 'soft';
export type NoseStyle = 'classic' | 'button' | 'defined' | 'soft';
export type MouthStyle = 'smile' | 'grin' | 'serene' | 'smirk' | 'open';
export type ClothingStyle = 'crewneck' | 'hoodie' | 'collar' | 'blazer' | 'turtleneck';

export interface AvatarConfig {
  faceShape: FaceShape;
  skinTone: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyes: EyeStyle;
  eyebrows: EyebrowStyle;
  nose: NoseStyle;
  mouth: MouthStyle;
  clothing: ClothingStyle;
  clothingColor: string;
  backgroundColor: string;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  faceShape: 'oval',
  skinTone: '#ECC0A2',
  hairStyle: 'short',
  hairColor: '#1E2028',
  eyes: 'calm',
  eyebrows: 'natural',
  nose: 'classic',
  mouth: 'smile',
  clothing: 'hoodie',
  clothingColor: '#2563EB',
  backgroundColor: '#EFF6FF',
};

export interface SwatchOption {
  label: string;
  value: string;
}

export interface TraitOption<T extends string> {
  label: string;
  value: T;
}

export const FACE_SHAPES: Array<TraitOption<FaceShape>> = [
  { label: 'Oval', value: 'oval' },
  { label: 'Round', value: 'round' },
  { label: 'Square', value: 'square' },
  { label: 'Heart', value: 'heart' },
];

export const SKIN_TONES: SwatchOption[] = [
  { label: 'Porcelain', value: '#FDE2D2' },
  { label: 'Ivory', value: '#F6D0B8' },
  { label: 'Warm Peach', value: '#ECC0A2' },
  { label: 'Golden Tan', value: '#DBA279' },
  { label: 'Amber Honey', value: '#C58559' },
  { label: 'Chestnut', value: '#A5653F' },
  { label: 'Deep Espresso', value: '#7E472A' },
  { label: 'Rich Ebony', value: '#54301D' },
];

export const HAIR_STYLES: Array<TraitOption<HairStyle>> = [
  { label: 'Short Crop', value: 'short' },
  { label: 'Curly', value: 'curly' },
  { label: 'Wavy', value: 'wavy' },
  { label: 'Long', value: 'long' },
  { label: 'Classic Bob', value: 'bob' },
  { label: 'Top Bun', value: 'bun' },
  { label: 'High Fade', value: 'fade' },
  { label: 'Buzz Cut', value: 'buzz' },
  { label: 'Hijab', value: 'hijabi' },
  { label: 'None', value: 'none' },
];

export const HAIR_COLORS: SwatchOption[] = [
  { label: 'Jet Black', value: '#1E2028' },
  { label: 'Espresso', value: '#3B2820' },
  { label: 'Chestnut', value: '#6A4028' },
  { label: 'Copper Auburn', value: '#9D4B2B' },
  { label: 'Honey Blonde', value: '#CFA05E' },
  { label: 'Ash Slate', value: '#64748B' },
  { label: 'Silver Mist', value: '#CBD5E1' },
  { label: 'Midnight Blue', value: '#1E3A8A' },
];

export const EYE_STYLES: Array<TraitOption<EyeStyle>> = [
  { label: 'Calm', value: 'calm' },
  { label: 'Happy', value: 'happy' },
  { label: 'Focused', value: 'focused' },
  { label: 'Wink', value: 'wink' },
  { label: 'Glasses', value: 'glasses' },
  { label: 'Lashes', value: 'lashes' },
];

export const EYEBROW_STYLES: Array<TraitOption<EyebrowStyle>> = [
  { label: 'Natural', value: 'natural' },
  { label: 'Arched', value: 'arched' },
  { label: 'Bold', value: 'thick' },
  { label: 'Soft', value: 'soft' },
];

export const NOSE_STYLES: Array<TraitOption<NoseStyle>> = [
  { label: 'Classic', value: 'classic' },
  { label: 'Button', value: 'button' },
  { label: 'Defined', value: 'defined' },
  { label: 'Soft', value: 'soft' },
];

export const MOUTH_STYLES: Array<TraitOption<MouthStyle>> = [
  { label: 'Warm Smile', value: 'smile' },
  { label: 'Big Grin', value: 'grin' },
  { label: 'Serene', value: 'serene' },
  { label: 'Smirk', value: 'smirk' },
  { label: 'Cheerful', value: 'open' },
];

export const CLOTHING_STYLES: Array<TraitOption<ClothingStyle>> = [
  { label: 'Crewneck', value: 'crewneck' },
  { label: 'Hoodie', value: 'hoodie' },
  { label: 'Shirt Collar', value: 'collar' },
  { label: 'Blazer', value: 'blazer' },
  { label: 'Turtleneck', value: 'turtleneck' },
];

export const CLOTHING_COLORS: SwatchOption[] = [
  { label: 'Royal Blue', value: '#2563EB' },
  { label: 'Ocean Blue', value: '#3B82F6' },
  { label: 'Deep Navy', value: '#1E3A8A' },
  { label: 'Graphite', value: '#1E293B' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Coral Rose', value: '#E11D48' },
  { label: 'Cool Grey', value: '#64748B' },
];

export const BACKGROUND_COLORS: SwatchOption[] = [
  { label: 'Mist Blue', value: '#EFF6FF' },
  { label: 'Powder Blue', value: '#DBEAFE' },
  { label: 'Sky Tint', value: '#BAE6FD' },
  { label: 'Serene Azure', value: '#93C5FD' },
  { label: 'Soft Mint', value: '#D1FAE5' },
  { label: 'Warm Cream', value: '#FEF3C7' },
  { label: 'Cool Slate', value: '#F1F5F9' },
  { label: 'Soft Blush', value: '#FFE4E6' },
];

function pick<T>(items: ReadonlyArray<T>): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function randomizeAvatarConfig(): AvatarConfig {
  return {
    faceShape: pick(FACE_SHAPES).value,
    skinTone: pick(SKIN_TONES).value,
    hairStyle: pick(HAIR_STYLES).value,
    hairColor: pick(HAIR_COLORS).value,
    eyes: pick(EYE_STYLES).value,
    eyebrows: pick(EYEBROW_STYLES).value,
    nose: pick(NOSE_STYLES).value,
    mouth: pick(MOUTH_STYLES).value,
    clothing: pick(CLOTHING_STYLES).value,
    clothingColor: pick(CLOTHING_COLORS).value,
    backgroundColor: pick(BACKGROUND_COLORS).value,
  };
}
