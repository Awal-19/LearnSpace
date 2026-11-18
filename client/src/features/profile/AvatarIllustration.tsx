import { forwardRef, useId } from 'react';
import type { AvatarConfig, FaceShape } from './avatarTypes';

interface AvatarIllustrationProps {
  config: AvatarConfig;
  className?: string;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [128, 128, 128];
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [Number.isNaN(r) ? 128 : r, Number.isNaN(g) ? 128 : g, Number.isNaN(b) ? 128 : b];
}

function toHex(r: number, g: number, b: number): string {
  return `#${clampByte(r).toString(16).padStart(2, '0')}${clampByte(g).toString(16).padStart(2, '0')}${clampByte(b).toString(16).padStart(2, '0')}`;
}

function shadeHex(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + amount, g + amount, b + amount);
}

function getLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function browTint(hairColor: string, skinTone: string): string {
  const lum = getLuminance(hairColor);
  if (lum > 0.72) return shadeHex(skinTone, -58);
  return shadeHex(hairColor, -10);
}

const FACE_PATHS: Record<FaceShape, string> = {
  oval: 'M120,60 C150,60 167,82 167,112 C167,143 147,163 120,163 C93,163 73,143 73,112 C73,82 90,60 120,60 Z',
  round:
    'M120,62 C152,62 170,84 170,113 C170,144 150,161 120,161 C90,161 70,144 70,113 C70,84 88,62 120,62 Z',
  square:
    'M120,61 C150,61 166,78 166,110 C166,133 163,148 148,157 C139,162 130,163 120,163 C110,163 101,162 92,157 C77,148 74,133 74,110 C74,78 90,61 120,61 Z',
  heart:
    'M120,61 C152,61 169,80 168,108 C167,132 143,162 120,164 C97,162 73,132 72,108 C71,80 88,61 120,61 Z',
};

/**
 * Pure vector editorial avatar renderer.
 * Avoids CSS classes and external resources so serialized SVG exports identically onto a canvas.
 */
export const AvatarIllustration = forwardRef<SVGSVGElement, AvatarIllustrationProps>(
  function AvatarIllustration({ config, className }, ref) {
    const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const bgGlowId = `ls-av-glow-${rawId}`;
    const clipId = `ls-av-clip-${rawId}`;

    const skinShadow = shadeHex(config.skinTone, -24);
    const skinDeepShadow = shadeHex(config.skinTone, -42);
    const clothDark = shadeHex(config.clothingColor, -28);
    const clothLight = shadeHex(config.clothingColor, 22);
    const hairDark = shadeHex(config.hairColor, -20);
    const browColor = browTint(config.hairColor, config.skinTone);
    const noseStroke = shadeHex(config.skinTone, -52);
    const mouthLine = getLuminance(config.skinTone) < 0.35 ? '#261410' : '#7C3E38';
    const mouthFill = '#7A272B';

    const earY = config.faceShape === 'round' ? 116 : 114;
    const earOffset = config.faceShape === 'round' ? 68 : 65;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 240 240"
        className={className}
        role="img"
        aria-label="Custom illustrated avatar preview"
      >
        <defs>
          <radialGradient id={bgGlowId} cx="35%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
            <stop offset="65%" stopColor={config.backgroundColor} stopOpacity="0" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.06" />
          </radialGradient>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="240" height="240" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          {/* Studio Backdrop */}
          <rect x="0" y="0" width="240" height="240" fill={config.backgroundColor} />
          <rect x="0" y="0" width="240" height="240" fill={`url(#${bgGlowId})`} />
          <circle cx="194" cy="46" r="44" fill="#FFFFFF" fillOpacity="0.22" />
          <circle cx="40" cy="202" r="52" fill="#FFFFFF" fillOpacity="0.16" />

          {/* Back Hair Layer */}
          {config.hairStyle === 'long' ? (
            <path
              d="M62,102 C62,56 90,42 120,42 C150,42 178,56 178,102 L184,212 C168,220 156,214 150,204 L90,204 C84,214 72,220 56,212 Z"
              fill={hairDark}
            />
          ) : null}

          {config.hairStyle === 'wavy' ? (
            <path
              d="M64,104 C62,56 92,42 120,42 C148,42 178,56 176,104 C186,126 174,146 182,170 C186,184 176,204 162,208 L78,208 C64,204 54,184 58,170 C66,146 54,126 64,104 Z"
              fill={hairDark}
            />
          ) : null}

          {config.hairStyle === 'bob' ? (
            <path
              d="M65,104 C65,56 92,43 120,43 C148,43 175,56 175,104 C177,138 171,164 154,173 L86,173 C69,164 63,138 65,104 Z"
              fill={hairDark}
            />
          ) : null}

          {config.hairStyle === 'curly' ? (
            <g fill={hairDark}>
              <circle cx="76" cy="84" r="24" />
              <circle cx="164" cy="84" r="24" />
              <circle cx="65" cy="114" r="22" />
              <circle cx="175" cy="114" r="22" />
              <circle cx="72" cy="144" r="20" />
              <circle cx="168" cy="144" r="20" />
              <circle cx="96" cy="58" r="24" />
              <circle cx="144" cy="58" r="24" />
              <circle cx="120" cy="50" r="26" />
            </g>
          ) : null}

          {config.hairStyle === 'bun' ? (
            <g>
              <circle cx="120" cy="36" r="22" fill={hairDark} />
              <path
                d="M104,50 Q120,57 136,50"
                stroke={config.clothingColor}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M70,104 C70,58 92,46 120,46 C148,46 170,58 170,104 Z"
                fill={config.hairColor}
              />
            </g>
          ) : null}

          {config.hairStyle === 'hijabi' ? (
            <path
              d="M62,116 C62,56 88,42 120,42 C152,42 178,56 178,116 L186,216 C165,228 75,228 54,216 Z"
              fill={hairDark}
            />
          ) : null}

          {/* Shoulders & Clothing Layer */}
          <g>
            {/* Clothing Base Torso */}
            <path
              d="M42,245 C45,196 72,175 103,172 L137,172 C168,175 195,196 198,245 Z"
              fill={config.clothingColor}
            />

            {/* Neck (hidden inside turtleneck height slightly) */}
            <path
              d="M104,151 L136,151 L136,184 C136,192 104,192 104,184 Z"
              fill={config.skinTone}
            />
            <path
              d="M104,152 C110,165 130,165 136,152 L136,169 C125,174 115,174 104,169 Z"
              fill={skinShadow}
            />

            {config.clothing === 'crewneck' ? (
              <g>
                <path
                  d="M96,173 C106,191 134,191 144,173"
                  fill="none"
                  stroke={clothDark}
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <path
                  d="M72,196 C82,216 90,228 96,245"
                  stroke={clothDark}
                  strokeOpacity="0.35"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d="M168,196 C158,216 150,228 144,245"
                  stroke={clothDark}
                  strokeOpacity="0.35"
                  strokeWidth="3"
                  fill="none"
                />
              </g>
            ) : null}

            {config.clothing === 'hoodie' ? (
              <g>
                <path
                  d="M84,175 C84,198 156,198 156,175 C163,182 167,194 152,202 C136,210 104,210 88,202 C73,194 77,182 84,175 Z"
                  fill={clothDark}
                />
                <path d="M94,174 C104,193 136,193 146,174" fill={clothLight} fillOpacity="0.25" />
                <line
                  x1="108"
                  y1="199"
                  x2="105"
                  y2="228"
                  stroke="#F8FAFC"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <line
                  x1="132"
                  y1="199"
                  x2="135"
                  y2="228"
                  stroke="#F8FAFC"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </g>
            ) : null}

            {config.clothing === 'collar' ? (
              <g>
                <path d="M100,172 L120,204 L140,172 L134,169 L120,188 L106,169 Z" fill="#FFFFFF" />
                <polygon
                  points="103,170 119,188 106,195 95,180"
                  fill="#F8FAFC"
                  stroke="#CBD5E1"
                  strokeWidth="1.2"
                />
                <polygon
                  points="137,170 121,188 134,195 145,180"
                  fill="#F8FAFC"
                  stroke="#CBD5E1"
                  strokeWidth="1.2"
                />
                <line x1="120" y1="198" x2="120" y2="242" stroke={clothDark} strokeWidth="2.5" />
              </g>
            ) : null}

            {config.clothing === 'blazer' ? (
              <g>
                <polygon points="100,172 120,224 140,172" fill="#FFFFFF" />
                <polygon points="94,173 106,172 120,224 98,214" fill={clothDark} />
                <polygon points="146,173 134,172 120,224 142,214" fill={clothDark} />
                <path
                  d="M95,174 L84,196 L104,218 L120,245"
                  fill="none"
                  stroke={clothLight}
                  strokeOpacity="0.4"
                  strokeWidth="2"
                />
                <path
                  d="M145,174 L156,196 L136,218 L120,245"
                  fill="none"
                  stroke={clothLight}
                  strokeOpacity="0.4"
                  strokeWidth="2"
                />
              </g>
            ) : null}

            {config.clothing === 'turtleneck' ? (
              <g>
                <rect x="98" y="159" width="44" height="28" rx="12" fill={clothDark} />
                <path
                  d="M100,173 Q120,179 140,173"
                  fill="none"
                  stroke={clothLight}
                  strokeOpacity="0.35"
                  strokeWidth="2"
                />
              </g>
            ) : null}
          </g>

          {/* Hijab Front Drape over Shoulders */}
          {config.hairStyle === 'hijabi' ? (
            <path
              d="M70,136 C68,176 92,202 120,202 C148,202 172,176 170,136 C160,165 140,180 120,180 C100,180 80,165 70,136 Z"
              fill={config.hairColor}
            />
          ) : null}

          {/* Ears (covered neatly when Hijab is selected) */}
          {config.hairStyle !== 'hijabi' ? (
            <g>
              <circle cx={120 - earOffset} cy={earY} r="10.5" fill={config.skinTone} />
              <path
                d={`M${120 - earOffset + 2},${earY - 4} Q${120 - earOffset - 4},${earY} ${120 - earOffset + 2},${earY + 4}`}
                fill="none"
                stroke={skinDeepShadow}
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx={120 + earOffset} cy={earY} r="10.5" fill={config.skinTone} />
              <path
                d={`M${120 + earOffset - 2},${earY - 4} Q${120 + earOffset + 4},${earY} ${120 + earOffset - 2},${earY + 4}`}
                fill="none"
                stroke={skinDeepShadow}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          ) : null}

          {/* Head Base */}
          <path d={FACE_PATHS[config.faceShape]} fill={config.skinTone} />

          {/* Soft Editorial Cheek Warmth */}
          <ellipse cx="90" cy="126" rx="9.5" ry="5.5" fill="#FF7B72" fillOpacity="0.16" />
          <ellipse cx="150" cy="126" rx="9.5" ry="5.5" fill="#FF7B72" fillOpacity="0.16" />

          {/* Eyebrows */}
          <g stroke={browColor} fill="none" strokeLinecap="round">
            {config.eyebrows === 'natural' ? (
              <>
                <path d="M90,94 Q100,89 110,93" strokeWidth="3.2" />
                <path d="M130,93 Q140,89 150,94" strokeWidth="3.2" />
              </>
            ) : null}
            {config.eyebrows === 'arched' ? (
              <>
                <path d="M89,96 Q100,86 111,93" strokeWidth="3" />
                <path d="M129,93 Q140,86 151,96" strokeWidth="3" />
              </>
            ) : null}
            {config.eyebrows === 'thick' ? (
              <>
                <path d="M89,94 Q100,90 111,93" strokeWidth="4.8" />
                <path d="M129,93 Q140,90 151,94" strokeWidth="4.8" />
              </>
            ) : null}
            {config.eyebrows === 'soft' ? (
              <>
                <path d="M91,93 Q100,92 109,93" strokeWidth="2.6" />
                <path d="M131,93 Q140,92 149,93" strokeWidth="2.6" />
              </>
            ) : null}
          </g>

          {/* Eyes */}
          <g>
            {config.eyes === 'calm' || config.eyes === 'glasses' ? (
              <>
                <ellipse cx="100" cy="109" rx="6.2" ry="6.8" fill="#1E293B" />
                <ellipse cx="140" cy="109" rx="6.2" ry="6.8" fill="#1E293B" />
                <circle cx="102" cy="106.5" r="2.2" fill="#FFFFFF" />
                <circle cx="142" cy="106.5" r="2.2" fill="#FFFFFF" />
              </>
            ) : null}

            {config.eyes === 'happy' ? (
              <>
                <path
                  d="M93,110 Q100,102 107,110"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <path
                  d="M133,110 Q140,102 147,110"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </>
            ) : null}

            {config.eyes === 'focused' ? (
              <>
                <path
                  d="M92,107 Q100,104 108,107"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
                <path
                  d="M132,107 Q140,104 148,107"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                />
                <ellipse cx="100" cy="110" rx="5.5" ry="4.5" fill="#1E293B" />
                <ellipse cx="140" cy="110" rx="5.5" ry="4.5" fill="#1E293B" />
                <circle cx="101.8" cy="108.5" r="1.7" fill="#FFFFFF" />
                <circle cx="141.8" cy="108.5" r="1.7" fill="#FFFFFF" />
              </>
            ) : null}

            {config.eyes === 'wink' ? (
              <>
                <ellipse cx="100" cy="109" rx="6.2" ry="6.8" fill="#1E293B" />
                <circle cx="102" cy="106.5" r="2.2" fill="#FFFFFF" />
                <path
                  d="M133,109 Q140,103 147,109"
                  fill="none"
                  stroke="#1E293B"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
              </>
            ) : null}

            {config.eyes === 'lashes' ? (
              <>
                <path
                  d="M91,106 L87,102"
                  stroke="#1E293B"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path d="M93,104 L90,100" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
                <path
                  d="M149,106 L153,102"
                  stroke="#1E293B"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M147,104 L150,100"
                  stroke="#1E293B"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <ellipse cx="100" cy="109" rx="6.2" ry="6.8" fill="#1E293B" />
                <ellipse cx="140" cy="109" rx="6.2" ry="6.8" fill="#1E293B" />
                <circle cx="102" cy="106.5" r="2.2" fill="#FFFFFF" />
                <circle cx="142" cy="106.5" r="2.2" fill="#FFFFFF" />
              </>
            ) : null}

            {config.eyes === 'glasses' ? (
              <g fill="none" stroke="#1E293B" strokeWidth="2.8" strokeLinejoin="round">
                <rect
                  x="84"
                  y="99"
                  width="30"
                  height="21"
                  rx="7"
                  fill="#FFFFFF"
                  fillOpacity="0.14"
                />
                <rect
                  x="126"
                  y="99"
                  width="30"
                  height="21"
                  rx="7"
                  fill="#FFFFFF"
                  fillOpacity="0.14"
                />
                <path d="M114,108 Q120,105 126,108" />
                <line x1="74" y1="106" x2="84" y2="106" />
                <line x1="156" y1="106" x2="166" y2="106" />
              </g>
            ) : null}
          </g>

          {/* Nose */}
          <g fill="none" stroke={noseStroke} strokeLinecap="round" strokeLinejoin="round">
            {config.nose === 'classic' ? (
              <path d="M120,111 L117,123 Q120,126 124,123" strokeWidth="2.4" />
            ) : null}
            {config.nose === 'button' ? (
              <path d="M116,122 Q120,126 124,122" strokeWidth="2.6" />
            ) : null}
            {config.nose === 'defined' ? (
              <path
                d="M121,109 C121,116 123,121 124,123 C122,126 117,125 115,123"
                strokeWidth="2.5"
              />
            ) : null}
            {config.nose === 'soft' ? (
              <path d="M119,112 C117,118 117,124 122,124" strokeWidth="2.3" />
            ) : null}
          </g>

          {/* Mouth */}
          <g>
            {config.mouth === 'smile' ? (
              <path
                d="M108,137 Q120,147 132,137"
                fill="none"
                stroke={mouthLine}
                strokeWidth="3"
                strokeLinecap="round"
              />
            ) : null}

            {config.mouth === 'grin' ? (
              <g>
                <path d="M107,136 Q120,152 133,136 Z" fill={mouthFill} />
                <path
                  d="M109,136 Q120,139 131,136 Q130,141 120,141 Q110,141 109,136 Z"
                  fill="#FFFFFF"
                />
                <path
                  d="M107,136 Q120,152 133,136"
                  fill="none"
                  stroke={mouthLine}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </g>
            ) : null}

            {config.mouth === 'serene' ? (
              <path
                d="M111,138 Q120,143 129,138"
                fill="none"
                stroke={mouthLine}
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            ) : null}

            {config.mouth === 'smirk' ? (
              <path
                d="M110,139 Q122,143 132,135"
                fill="none"
                stroke={mouthLine}
                strokeWidth="2.9"
                strokeLinecap="round"
              />
            ) : null}

            {config.mouth === 'open' ? (
              <g>
                <ellipse cx="120" cy="140" rx="8.5" ry="6.5" fill={mouthFill} />
                <ellipse cx="120" cy="144" rx="5" ry="2.2" fill="#F472B6" fillOpacity="0.7" />
                <path
                  d="M113,136.5 Q120,138.5 127,136.5"
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </g>
            ) : null}
          </g>

          {/* Front Hair Layer */}
          {config.hairStyle === 'short' ? (
            <path
              d="M71,105 C69,62 93,42 122,42 C152,42 171,62 169,104 C165,86 154,75 137,72 C121,78 106,80 90,74 C79,80 74,90 71,105 Z"
              fill={config.hairColor}
            />
          ) : null}

          {config.hairStyle === 'fade' ? (
            <g fill={config.hairColor}>
              <path d="M73,99 C72,62 90,40 120,40 C150,40 168,62 167,99 C162,74 150,67 120,67 C90,67 78,74 73,99 Z" />
              <rect x="86" y="42" width="68" height="28" rx="12" />
            </g>
          ) : null}

          {config.hairStyle === 'buzz' ? (
            <path
              d="M73,103 C73,68 92,55 120,55 C148,55 167,68 167,103 C162,80 148,72 120,72 C92,72 78,80 73,103 Z"
              fill={config.hairColor}
            />
          ) : null}

          {config.hairStyle === 'curly' ? (
            <g fill={config.hairColor}>
              <circle cx="88" cy="70" r="15" />
              <circle cx="108" cy="64" r="16" />
              <circle cx="131" cy="64" r="16" />
              <circle cx="152" cy="70" r="15" />
              <circle cx="77" cy="88" r="12" />
              <circle cx="163" cy="88" r="12" />
            </g>
          ) : null}

          {config.hairStyle === 'wavy' || config.hairStyle === 'long' ? (
            <path
              d="M71,106 C71,60 92,43 120,43 C148,43 169,60 169,106 C163,83 145,71 124,69 C114,82 93,85 78,94 Z"
              fill={config.hairColor}
            />
          ) : null}

          {config.hairStyle === 'bob' ? (
            <path
              d="M71,106 C71,59 92,44 120,44 C148,44 169,59 169,106 C161,80 146,72 120,73 C94,72 79,80 71,106 Z"
              fill={config.hairColor}
            />
          ) : null}

          {config.hairStyle === 'bun' ? (
            <path
              d="M72,102 C74,64 93,50 120,50 C147,50 166,64 168,102 C161,78 145,70 120,70 C95,70 79,78 72,102 Z"
              fill={config.hairColor}
            />
          ) : null}

          {config.hairStyle === 'hijabi' ? (
            <g>
              {/* Inner hijab cap framing forehead & jaw */}
              <path
                d="M65,114 C65,61 88,43 120,43 C152,43 175,61 175,114 C174,142 152,167 120,167 C88,167 66,142 65,114 Z M76,112 C76,141 96,159 120,159 C144,159 164,141 164,112 C164,84 146,70 120,70 C94,70 76,84 76,112 Z"
                fill={config.hairColor}
                fillRule="evenodd"
              />
              <path d="M74,88 Q120,58 166,88" fill="none" stroke={hairDark} strokeWidth="2.5" />
            </g>
          ) : null}
        </g>
      </svg>
    );
  },
);
