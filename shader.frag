#ifdef GL_ES
precision highp float;
precision highp int;
#endif

#define PI 3.14159265359
const float PHI = 1.61803398874989484820459;
const float SEED = 43758.0;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D img;
uniform float u_t;
uniform float u_colorFreq;
uniform float u_dir;
uniform float u_tex;
uniform float u_grid;
uniform float u_clear;
uniform float u_chro;
uniform float u_speed;
uniform float u_bri;

uniform vec3 u_col1;
uniform vec3 u_col2;
uniform vec3 u_col3;
uniform vec3 u_col4;

// ------------------------------------------------------------------
// Basic random and noise functions
// ------------------------------------------------------------------

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// float noise(vec2 st) {
//     vec2 i = floor(st);
//     vec2 f = fract(st);
//     vec2 u = f * f * (3.0 - 2.0 * f);

//     return mix(
//         mix(rand(i), rand(i + vec2(1.0, 0.0)), u.x),
//         mix(rand(i + vec2(0.0, 1.0)), rand(i + vec2(1.0, 1.0)), u.x),
//         u.y
//     );
// }

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    float lerp1 = mix(a, b, u.x);
    float lerp2 = mix(c, d, u.x);
    return mix(lerp1, lerp2, u.y);
}


// ------------------------------------------------------------------
// Fractional Brownian Motion (fbm)
// ------------------------------------------------------------------

float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.8;
    vec2 shift = vec2(10.0);
    for(int i = 0; i < 10; i++) {
        value += amplitude * noise(st);
        st = st * 2.0 + shift;
        amplitude *= 0.6;
    }
    return value;
}

// ------------------------------------------------------------------
// Gradient between user-supplied colors
// ------------------------------------------------------------------

vec3 colorGradient(float t) {
    if(t < 0.33) {
        return mix(u_col1, u_col2, t * 3.0);
    } else if(t < 0.66) {
        return mix(u_col2, u_col3, (t - 0.33) * 3.0);
    } else {
        return mix(u_col3, u_col4, (t - 0.66) * 3.0);
    }
}

// ------------------------------------------------------------------
// Displacement function
// ------------------------------------------------------------------

vec2 computeDisplacement(vec2 uv, float time, float safeDir) {
    // 500.0 is quite large, so let's keep it but ensure safeClear, safeDir, etc. won't blow up
    float noiseScale = 500.0;
    float noiseSpeed = 0.1 * (safeDir * -1.0);
    float displacementStrength = 0.0005;

    float n = fbm(uv * noiseScale + time * noiseSpeed);
    float angle = n * PI * 2.0;

    vec2 displacement = vec2(cos(angle), sin(angle)) * displacementStrength;
    return displacement;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

void main() {
    // ------------------------------------------------------------------
    // Step 7: Clamp uniform values at the top
    // (Ranges here are guesses — adjust to fit your actual use-case!)
    // ------------------------------------------------------------------
    float safeTime       = clamp(u_time,        0.0, 999999.0);
    float safeT          = clamp(u_t,           0.0, 1.0);
    float safeColorFreq  = clamp(u_colorFreq,   0.0, 100.0);
    float safeDir        = clamp(u_dir,        -10.0, 10.0);
    float safeTex        = clamp(u_tex,         1.0,  2.0);   // since you only expect 1 or 2
    float safeGrid       = clamp(u_grid,        0.0, 100.0);
    float safeClear      = clamp(u_clear,       0.0, 100.0);
    float safeChro       = clamp(u_chro,        0.0,  1.0);
    float safeSpeed      = clamp(u_speed,      -10.0, 10.0);
    float safeBri        = clamp(u_bri,        -1.0,  1.0);

    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    // Displacement
    vec2 displacement = computeDisplacement(uv, safeTime, safeDir);
    vec2 displacedUV  = uv + displacement;

    // Sorting step
    vec2 sortedUV = displacedUV;
    float sortValue = rand(displacedUV * 1.0);

    if (safeT < 0.5) {
        sortedUV.y = mix(displacedUV.y, sortValue, 0.04);
    } else {
        sortedUV.x = mix(displacedUV.x, sortValue, 0.04);
    }

    // Grain & Distortion
    float grain      = fbm(sortedUV * safeClear);
    float distortion = noise(
        vec2(sortedUV.x, sortedUV.x) * 5.0 - (safeTime * safeSpeed) * safeDir
    );
    sortedUV.x += distortion * 0.05;

    float blendFactor = noise(vec2(uv.x, uv.y) * safeGrid);

    float finalPattern;
    // Make sure safeTex is 1.0 or 2.0 in range:
    if (abs(safeTex - 1.0) < 0.5) {
        // If it's close to 1, treat it as 1
        finalPattern = mix(grain, distortion, 0.5 * (blendFactor * safeColorFreq));
    } else {
        // Otherwise, treat it as 2
        finalPattern = mix(grain, distortion, 0.5 / (blendFactor * safeColorFreq));
    }

    // Base color
    vec3 baseColor = colorGradient(finalPattern);
    vec3 c = baseColor;

    // ------------------------------------------------------------------
    // Feedback from previous frame
    // ------------------------------------------------------------------
    vec3 prevColor = texture2D(img, uv).rgb;
    vec3 frameDifference = c - prevColor;
    vec2 motionVector = frameDifference.rg * 0.1;

    // Mosh
    vec2 moshUV = mod(uv + motionVector, 1.0);
    vec3 moshColor = texture2D(img, moshUV).rgb;

    float feedbackAmount = 0.9;
    c = mix(c, moshColor, feedbackAmount);
    c = clamp(c, 0.0, 1.0);

    // ------------------------------------------------------------------
    // Additional random offset blend
    // ------------------------------------------------------------------
    float nweFloat = 0.02;
    float randomOffset = rand(sortedUV) * nweFloat;

    c += texture2D(img, sortedUV - randomOffset).rgb * nweFloat;
    c -= texture2D(img, vec2(sortedUV.x, sortedUV.y) * sortedUV).rgb * nweFloat;
    c = clamp(c, 0.0, 1.0);

    // ------------------------------------------------------------------
    // Chromatic Aberration
    // ------------------------------------------------------------------
    float offset = 1.0 / min(u_resolution.x, u_resolution.y);

    float aberrationAmount = 0.002;
    vec2 aberrationOffset  = vec2(aberrationAmount, 0.0);

    float r = texture2D(img, uv - offset + aberrationOffset).r;
    float g = texture2D(img, uv - offset).g;
    float b = texture2D(img, uv - offset - aberrationOffset).b;

    vec3 chro = vec3(r, g, b);

    c = mix(c, chro, safeChro);
    c = clamp(c, 0.0, 1.0);

    // ------------------------------------------------------------------
    // Brightness
    // ------------------------------------------------------------------
    c += vec3(safeBri);
    c = clamp(c, 0.0, 1.0);

    // Final
    gl_FragColor = vec4(c, 1.0);
}
