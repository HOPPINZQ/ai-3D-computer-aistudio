import * as THREE from 'three';

// 1. ARGB Fan Dynamic Glow Shader with Infinite Mirror Depth
export const ARGBFanShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uSpeed;
    uniform vec3 uColorA; // Cyan (#00f0ff)
    uniform vec3 uColorB; // Magenta (#ff007f)
    uniform vec3 uColorC; // Deep Violet (#7928ca)
    uniform float uPowerLevel; // 0.0 unpowered to 1.0 full power
    uniform float uGlowIntensity;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec2 p = vUv - vec2(0.5);
      float r = length(p);
      float angle = atan(p.y, p.x);

      // Rotating neon wave with angular chromatic spread
      float wave = sin(angle * 3.0 - uTime * uSpeed * 4.5) * 0.5 + 0.5;
      float wave2 = cos(angle * 4.0 + uTime * uSpeed * 3.0) * 0.5 + 0.5;
      
      vec3 col = mix(uColorA, uColorB, wave);
      col = mix(col, uColorC, wave2 * 0.5);

      // Infinite mirror deep concentric rings
      float ring = sin(r * 38.0 - uTime * 3.5) * 0.5 + 0.5;
      ring = pow(ring, 3.0) * 0.6;
      col += uColorA * ring;

      float edgeAlpha = smoothstep(0.49, 0.40, r) * smoothstep(0.04, 0.14, r);
      
      float power = clamp(uPowerLevel, 0.2, 1.0);
      float finalAlpha = edgeAlpha * (0.45 + 0.55 * power);

      vec3 finalColor = col * (1.2 + 2.0 * power * uGlowIntensity);
      
      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `
};

// 2. PCB Circuit Trace Dynamic Electric Surge Shader
export const PCBTraceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uPowerLevel; // 0.0 to 1.0
    uniform vec3 uBaseColor;   // Dark matte PCB
    uniform vec3 uTraceColor;  // Cyan glow
    uniform vec3 uPulseColor;  // Hot Pink / White pulse
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 grid = fract(vUv * 45.0);
      vec2 id = floor(vUv * 45.0);

      float lineX = step(0.91, grid.x) * step(0.18, hash(id + vec2(1.0, 0.0)));
      float lineY = step(0.91, grid.y) * step(0.18, hash(id + vec2(0.0, 1.0)));
      float isTrace = clamp(lineX + lineY, 0.0, 1.0);

      float distFromCenter = length(vUv - vec2(0.5));
      
      float waveFront = uPowerLevel * 1.6;
      float waveSpread = 0.25;
      float wave = smoothstep(waveFront - waveSpread, waveFront, distFromCenter) 
                 * smoothstep(waveFront + waveSpread, waveFront, distFromCenter);

      float pulse = sin((vUv.x + vUv.y) * 80.0 - uTime * 8.0) * 0.5 + 0.5;
      pulse = pow(pulse, 5.0);

      float traceEnergy = isTrace * (uPowerLevel * 0.9 + wave * 3.5 + pulse * uPowerLevel * 1.5);

      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - max(dot(viewDir, vWorldNormal), 0.0), 3.0);
      
      vec3 pcbColor = uBaseColor + vec3(0.015, 0.025, 0.04) * fresnel;
      vec3 litTrace = mix(uTraceColor, uPulseColor, wave * 0.8 + pulse * 0.4);

      vec3 finalCol = pcbColor + litTrace * traceEnergy * 2.2;

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `
};

// 3. Cyberpunk Holographic Floor Grid Shader
export const CyberGridShader = {
  vertexShader: `
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uGridColor; // Cyan (#00e5ff)
    uniform vec3 uAccentColor; // Magenta (#ff0080)
    uniform float uPowerLevel;
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main() {
      vec2 coord = vWorldPosition.xz * 2.5;
      vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
      float line = min(grid.x, grid.y);
      float gridVal = 1.0 - min(line, 1.0);

      float dist = length(vWorldPosition.xz);
      float distFade = smoothstep(18.0, 1.0, dist);

      float ripple = mod(uTime * 2.5 - dist * 0.45, 4.5);
      float ring = smoothstep(0.35, 0.0, abs(ripple - 0.35)) * 0.9;

      vec2 dotCoord = abs(fract(coord) - 0.5);
      float dot = smoothstep(0.09, 0.02, length(dotCoord)) * 0.7;

      vec3 col = mix(uGridColor, uAccentColor, ring);
      float intensity = (gridVal * 0.6 + ring * 0.85 + dot * 0.5) * distFade * (0.45 + 0.55 * uPowerLevel);

      gl_FragColor = vec4(col * intensity * 2.0, intensity * 0.9);
    }
  `
};

// 4. Dynamic Neon Pulse / RGB Lightbar Shader
export const NeonPulseShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uPowerLevel;
    uniform vec3 uColorCyan;
    uniform vec3 uColorMagenta;
    uniform float uSpeed;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main() {
      float wave = sin(vUv.x * 6.0 - uTime * uSpeed * 3.5) * 0.5 + 0.5;
      float pulse = sin(uTime * 4.0) * 0.15 + 0.85;

      vec3 col = mix(uColorCyan, uColorMagenta, wave);
      
      float shimmer = pow(sin(vUv.x * 12.0 - uTime * 5.0) * 0.5 + 0.5, 4.0) * 0.6;
      col += vec3(shimmer);

      float pwr = clamp(uPowerLevel, 0.25, 1.0);
      vec3 finalColor = col * (1.4 + 1.8 * pwr) * pulse;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

// 5. AIO Cooler Round LCD Screen Cyber HUD Shader
export const CoolerLCDShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uPowerLevel;
    uniform vec3 uColorCyan;
    uniform vec3 uColorMagenta;
    varying vec2 vUv;

    void main() {
      vec2 p = vUv - vec2(0.5);
      float r = length(p);
      float angle = atan(p.y, p.x);

      float outerRing = smoothstep(0.015, 0.0, abs(r - 0.44));
      
      float arcMask = step(0.0, sin(angle + 1.5));
      float tachRing = smoothstep(0.02, 0.0, abs(r - 0.38)) * arcMask;

      float angleRot = angle + uTime * 2.0;
      float radarBeam = pow(sin(angleRot) * 0.5 + 0.5, 8.0) * step(r, 0.32);

      float coreCircle = smoothstep(0.015, 0.0, abs(r - 0.22));
      float centerGlow = smoothstep(0.20, 0.0, r) * 0.5;

      float ticks = step(0.65, sin(angle * 24.0)) * smoothstep(0.02, 0.0, abs(r - 0.35));

      vec3 col = uColorCyan * (outerRing + tachRing * 1.5 + ticks + centerGlow * 0.8);
      col += uColorMagenta * (radarBeam * 1.8 + coreCircle * 1.4);

      float power = clamp(uPowerLevel, 0.2, 1.0);
      vec3 finalCol = col * (1.2 + 1.8 * power);
      
      float alpha = clamp(outerRing + tachRing + radarBeam + coreCircle + centerGlow + ticks, 0.0, 1.0);

      gl_FragColor = vec4(finalCol, alpha * (0.8 + 0.2 * power));
    }
  `
};

// Helper: Create GPU Heatsink fin normal texture
export function createHeatsinkFinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c1017';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#2d3748';
  for (let y = 0; y < 256; y += 8) {
    ctx.fillRect(0, y, 256, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 8);
  return texture;
}
