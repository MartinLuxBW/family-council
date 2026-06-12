// Built-in cartoon avatar generator: deterministic, seeded by a text description.
// Used when no OPENAI_API_KEY is configured.

function seededRandom(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const BG = ['#FFD43B', '#4ECDC4', '#FFA94D', '#9B7EDE', '#F783AC', '#69DB7C', '#5AB3F0', '#FF8787'];
const SKIN = ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBCC'];
const HAIR = ['#3B2A20', '#6B4226', '#B5651D', '#E6BE8A', '#222222', '#A52A2A', '#D9A0DD', '#F2C53D'];

export function cartoonAvatarSvg(description) {
  const rnd = seededRandom(description.toLowerCase().trim());
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const bg = pick(BG);
  const skin = pick(SKIN);
  const hair = pick(HAIR);
  const hairStyle = Math.floor(rnd() * 5);
  const eyeStyle = Math.floor(rnd() * 3);
  const mouthStyle = Math.floor(rnd() * 3);
  const hasGlasses = rnd() < 0.25;
  const hasFreckles = rnd() < 0.35;
  const hasBow = rnd() < 0.25;
  const cheek = 'rgba(255,107,107,0.35)';

  const hairShapes = [
    // short round
    `<path d="M70 120 Q70 50 160 50 Q250 50 250 120 L250 140 Q240 95 160 95 Q80 95 70 140 Z" fill="${hair}"/>`,
    // long
    `<path d="M65 130 Q60 45 160 45 Q260 45 255 130 L258 230 Q250 250 235 250 L235 150 Q230 90 160 90 Q90 90 85 150 L85 250 Q70 250 62 230 Z" fill="${hair}"/>`,
    // spiky
    `<path d="M75 125 L85 75 L105 100 L120 60 L140 92 L160 52 L180 92 L200 60 L215 100 L235 75 L245 125 Q240 95 160 92 Q80 95 75 125 Z" fill="${hair}"/>`,
    // curly puffs
    `<circle cx="95" cy="95" r="32" fill="${hair}"/><circle cx="135" cy="72" r="34" fill="${hair}"/><circle cx="185" cy="72" r="34" fill="${hair}"/><circle cx="225" cy="95" r="32" fill="${hair}"/><circle cx="160" cy="65" r="30" fill="${hair}"/>`,
    // side swoop
    `<path d="M68 135 Q60 48 170 48 Q255 52 250 125 Q245 90 200 88 Q140 86 120 105 Q95 100 90 145 Q80 150 68 135 Z" fill="${hair}"/>`,
  ];

  const eyes =
    eyeStyle === 0
      ? `<circle cx="128" cy="160" r="9" fill="#3a2e39"/><circle cx="192" cy="160" r="9" fill="#3a2e39"/><circle cx="131" cy="157" r="3" fill="#fff"/><circle cx="195" cy="157" r="3" fill="#fff"/>`
      : eyeStyle === 1
        ? `<ellipse cx="128" cy="160" rx="8" ry="11" fill="#3a2e39"/><ellipse cx="192" cy="160" rx="8" ry="11" fill="#3a2e39"/><circle cx="131" cy="155" r="3.4" fill="#fff"/><circle cx="195" cy="155" r="3.4" fill="#fff"/>`
        : `<path d="M118 160 Q128 150 138 160" stroke="#3a2e39" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M182 160 Q192 150 202 160" stroke="#3a2e39" stroke-width="5" fill="none" stroke-linecap="round"/>`;

  const mouths = [
    `<path d="M135 205 Q160 228 185 205" stroke="#b3404a" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    `<path d="M132 202 Q160 235 188 202 Z" fill="#b3404a"/><path d="M144 216 Q160 224 176 216 Q160 230 144 216 Z" fill="#ff8fa3"/>`,
    `<ellipse cx="160" cy="210" rx="14" ry="10" fill="#b3404a"/>`,
  ];

  const glasses = hasGlasses
    ? `<circle cx="128" cy="160" r="20" fill="none" stroke="#4A3B52" stroke-width="4"/><circle cx="192" cy="160" r="20" fill="none" stroke="#4A3B52" stroke-width="4"/><line x1="148" y1="160" x2="172" y2="160" stroke="#4A3B52" stroke-width="4"/>`
    : '';

  const freckles = hasFreckles
    ? `<circle cx="112" cy="185" r="2.5" fill="#c98a5b"/><circle cx="122" cy="190" r="2.5" fill="#c98a5b"/><circle cx="117" cy="178" r="2.5" fill="#c98a5b"/><circle cx="208" cy="185" r="2.5" fill="#c98a5b"/><circle cx="198" cy="190" r="2.5" fill="#c98a5b"/><circle cx="203" cy="178" r="2.5" fill="#c98a5b"/>`
    : '';

  const bow = hasBow
    ? `<g transform="translate(218 78) rotate(20)"><path d="M0 0 L-22 -12 L-22 12 Z" fill="#FF6B6B"/><path d="M0 0 L22 -12 L22 12 Z" fill="#FF6B6B"/><circle cx="0" cy="0" r="6" fill="#e03131"/></g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="40" fill="${bg}"/>
  <circle cx="160" cy="330" r="110" fill="${pick(BG)}"/>
  <circle cx="160" cy="165" r="92" fill="${skin}"/>
  ${hairShapes[hairStyle]}
  ${eyes}
  ${mouths[mouthStyle]}
  <ellipse cx="105" cy="190" rx="13" ry="9" fill="${cheek}"/>
  <ellipse cx="215" cy="190" rx="13" ry="9" fill="${cheek}"/>
  ${freckles}
  ${glasses}
  ${bow}
</svg>`;
}
