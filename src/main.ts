import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCyberPCModel, BuiltPCSystem } from './pcModelBuilder';
import { HARDWARE_LIST, HardwareSpecItem } from './hardwareData';
import { CyberGridShader } from './shaders';

// Scratch math objects to prevent garbage collection in render loop
const _vec3 = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

// State variables
let progress = 0.0;
let targetProgress = 0.0;
let isPlaying = false;
let autoRotate = false;
let lightTheme = 'cyber';
let fanSpeedMode: 'silent' | 'balanced' | 'turbo' = 'balanced';
let selectedPartId: string | null = null;
let hoveredPartId: string | null = null;
let isDockCollapsed = false;

// DOM Elements
const canvasContainer = document.getElementById('canvas-container') as HTMLDivElement;
const statusDesc = document.getElementById('status-desc') as HTMLElement;
const powerDot = document.getElementById('power-dot') as HTMLElement;
const hoverChip = document.getElementById('hover-chip') as HTMLElement;
const hoverText = document.getElementById('hover-text') as HTMLElement;
const scrubBarFill = document.getElementById('scrub-bar-fill') as HTMLElement;
const scrubPercentage = document.getElementById('scrub-percentage') as HTMLElement;
const scrubTrack = document.getElementById('scrub-track') as HTMLElement;
const hologramContainer = document.getElementById('hologram-container') as HTMLElement;

// Inspector Elements
const inspectorPanel = document.getElementById('inspector-panel') as HTMLElement;
const btnCloseInspector = document.getElementById('btn-close-inspector') as HTMLButtonElement;
const btnCloseSheet = document.getElementById('btn-close-sheet') as HTMLButtonElement;
const btnPrevPart = document.getElementById('btn-prev-part') as HTMLButtonElement;
const btnNextPart = document.getElementById('btn-next-part') as HTMLButtonElement;
const btnExitDrill = document.getElementById('btn-exit-drill') as HTMLButtonElement;
const partCategoryTag = document.getElementById('part-category-tag') as HTMLElement;
const partBrandModel = document.getElementById('part-brand-model') as HTMLElement;
const partTitle = document.getElementById('part-title') as HTMLElement;
const partBrief = document.getElementById('part-brief') as HTMLElement;
const telemetryTemp = document.getElementById('telemetry-temp') as HTMLElement;
const telemetryPower = document.getElementById('telemetry-power') as HTMLElement;
const gaugeTempFill = document.getElementById('gauge-temp-fill') as HTMLElement;
const gaugePowerFill = document.getElementById('gauge-power-fill') as HTMLElement;
const telemetryClockLabel = document.getElementById('telemetry-clock-label') as HTMLElement;
const telemetryClockVal = document.getElementById('telemetry-clock-val') as HTMLElement;
const telemetryCustomLabel = document.getElementById('telemetry-custom-label') as HTMLElement;
const telemetryCustomVal = document.getElementById('telemetry-custom-val') as HTMLElement;
const specsTable = document.getElementById('specs-table') as HTMLElement;
const featuresList = document.getElementById('features-list') as HTMLElement;

// Control Dock Elements
const controlDock = document.getElementById('control-dock') as HTMLElement;
const btnToggleDock = document.getElementById('btn-toggle-dock') as HTMLButtonElement;
const dockToggleIcon = document.getElementById('dock-toggle-icon') as HTMLElement;
const dockToggleText = document.getElementById('dock-toggle-text') as HTMLElement;
const stageLabel = document.getElementById('stage-label') as HTMLElement;
const progressText = document.getElementById('progress-text') as HTMLElement;
const timelineSlider = document.getElementById('timeline-slider') as HTMLInputElement;
const jumpButtons = document.querySelectorAll('.btn-jump') as NodeListOf<HTMLButtonElement>;
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const playIcon = document.getElementById('play-icon') as HTMLElement;
const playText = document.getElementById('play-text') as HTMLElement;
const btnRotate = document.getElementById('btn-rotate') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const themeSwatches = document.querySelectorAll('.theme-swatch') as NodeListOf<HTMLButtonElement>;
const fanButtons = document.querySelectorAll('.btn-fan') as NodeListOf<HTMLButtonElement>;

// Three.js Core Setup
const isSoftwareGl = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
})();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020306);
scene.fog = new THREE.FogExp2(0x020306, 0.035);

const width = window.innerWidth;
const height = window.innerHeight;
const isMobile = width < 768;
const camera = new THREE.PerspectiveCamera(isMobile ? 48 : 42, width / height, 0.1, 100);
const initialCamDist = isMobile ? 9.5 : 7.5;
camera.position.set(initialCamDist * 0.7, 3.2, initialCamDist * 0.9);

const renderer = new THREE.WebGLRenderer({
  antialias: !isSoftwareGl,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setSize(width, height);
renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = !isSoftwareGl;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasContainer.appendChild(renderer.domElement);

// Studio Environment Reflections
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGenerator.dispose();

// Studio Lighting Rig
const keyLight = new THREE.DirectionalLight(0xfff6ea, 2.4);
keyLight.position.set(6, 9, 6);
keyLight.castShadow = !isSoftwareGl;
if (!isSoftwareGl) {
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
}
scene.add(keyLight);

const hemiLight = new THREE.HemisphereLight(0x00f0ff, 0x010204, 1.5);
scene.add(hemiLight);

const cyberCyanLight = new THREE.PointLight(0x00f0ff, 3.2, 14);
cyberCyanLight.position.set(2.2, 2.2, 3.2);
scene.add(cyberCyanLight);

const cyberMagentaLight = new THREE.PointLight(0xff007f, 2.8, 14);
cyberMagentaLight.position.set(-3.2, -0.8, 2.5);
scene.add(cyberMagentaLight);

const rimBlueLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
rimBlueLight.position.set(-5, 4, -4);
scene.add(rimBlueLight);

// Infinite Cyberpunk Floor Grid
const gridGeo = new THREE.PlaneGeometry(42, 42, 1, 1);
const gridMat = new THREE.ShaderMaterial({
  vertexShader: CyberGridShader.vertexShader,
  fragmentShader: CyberGridShader.fragmentShader,
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uGridColor: { value: new THREE.Color(0x00e5ff) },
    uAccentColor: { value: new THREE.Color(0xff0080) },
    uPowerLevel: { value: 1.0 },
  },
});
const gridMesh = new THREE.Mesh(gridGeo, gridMat);
gridMesh.rotation.x = -Math.PI / 2;
gridMesh.position.y = -2.25;
scene.add(gridMesh);

// Ground Contact Shadow
const shadowGeo = new THREE.PlaneGeometry(6.0, 5.0);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
});
const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
shadowMesh.rotation.x = -Math.PI / 2;
shadowMesh.position.y = -2.24;
scene.add(shadowMesh);

// Build 3D PC Model
const pcSystem = buildCyberPCModel();
scene.add(pcSystem.rootGroup);

// OrbitControls (full mobile touch support: 1-finger rotate, 2-finger zoom/pan)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.minDistance = 2.0;
controls.maxDistance = 18.0;
controls.maxPolarAngle = Math.PI / 2 + 0.04;
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
};

// Wheel Scrolling
window.addEventListener('wheel', (e: WheelEvent) => {
  if (selectedPartId) return;
  const delta = e.deltaY * 0.00075;
  targetProgress = Math.max(0, Math.min(1.0, targetProgress + delta));
  setPlaying(false);
}, { passive: true });

// Mobile Touch Scrub Track (Right Edge)
let isDraggingScrub = false;
let touchStartY = 0;
let touchStartProg = 0;

scrubTrack.addEventListener('touchstart', (e: TouchEvent) => {
  isDraggingScrub = true;
  touchStartY = e.touches[0].clientY;
  touchStartProg = targetProgress;
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchmove', (e: TouchEvent) => {
  if (!isDraggingScrub) return;
  const dy = e.touches[0].clientY - touchStartY;
  const delta = dy * 0.0035;
  targetProgress = Math.max(0, Math.min(1.0, touchStartProg + delta));
  setPlaying(false);
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchend', () => {
  isDraggingScrub = false;
});

// Pointer Click & Hover Raycasting
let pointerDownPos = { x: 0, y: 0 };
renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointermove', (e: PointerEvent) => {
  const rect = renderer.domElement.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, camera);
  const intersects = _raycaster.intersectObjects(pcSystem.rootGroup.children, true);

  if (intersects.length > 0) {
    let currentObj: THREE.Object3D | null = intersects[0].object;
    let foundPartId: string | null = null;

    while (currentObj && currentObj !== pcSystem.rootGroup) {
      if (currentObj.userData && currentObj.userData.partId) {
        foundPartId = currentObj.userData.partId;
        break;
      }
      currentObj = currentObj.parent;
    }

    if (foundPartId) {
      hoveredPartId = foundPartId;
      renderer.domElement.style.cursor = 'pointer';
      const part = HARDWARE_LIST.find((h) => h.id === foundPartId);
      if (part && !selectedPartId) {
        hoverText.textContent = `检视: ${part.cnName}`;
        hoverChip.classList.remove('hidden');
      }
    } else {
      hoveredPartId = null;
      renderer.domElement.style.cursor = 'grab';
      hoverChip.classList.add('hidden');
    }
  } else {
    hoveredPartId = null;
    renderer.domElement.style.cursor = 'grab';
    hoverChip.classList.add('hidden');
  }
});

renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
  const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (dist > 6) return; // Dragged camera

  const rect = renderer.domElement.getBoundingClientRect();
  _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  _raycaster.setFromCamera(_mouse, camera);
  const intersects = _raycaster.intersectObjects(pcSystem.rootGroup.children, true);

  if (intersects.length > 0) {
    let currentObj: THREE.Object3D | null = intersects[0].object;
    let foundPartId: string | null = null;

    while (currentObj && currentObj !== pcSystem.rootGroup) {
      if (currentObj.userData && currentObj.userData.partId) {
        foundPartId = currentObj.userData.partId;
        break;
      }
      currentObj = currentObj.parent;
    }

    if (foundPartId) {
      selectPart(foundPartId);
    }
  }
});

// Window Resize
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isMob = w < 768;
  camera.fov = isMob ? 48 : 42;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// UI Control Listeners
timelineSlider.addEventListener('input', (e) => {
  targetProgress = parseFloat((e.target as HTMLInputElement).value);
  setPlaying(false);
});

jumpButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const val = parseFloat(btn.dataset.progress || '0');
    targetProgress = val;
    setPlaying(false);
  });
});

function setPlaying(play: boolean) {
  isPlaying = play;
  if (isPlaying) {
    btnPlay.classList.add('active');
    playIcon.textContent = '❚❚';
    playText.textContent = '暂停';
  } else {
    btnPlay.classList.remove('active');
    playIcon.textContent = '▶';
    playText.textContent = '巡航';
  }
}

btnPlay.addEventListener('click', () => {
  setPlaying(!isPlaying);
});

btnRotate.addEventListener('click', () => {
  autoRotate = !autoRotate;
  btnRotate.classList.toggle('active', autoRotate);
});

btnReset.addEventListener('click', () => {
  selectedPartId = null;
  inspectorPanel.classList.add('closed');
  camera.position.set(initialCamDist * 0.7, 3.2, initialCamDist * 0.9);
  controls.target.set(0, 0, 0);
});

themeSwatches.forEach((btn) => {
  btn.addEventListener('click', () => {
    themeSwatches.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    lightTheme = btn.dataset.theme || 'cyber';
  });
});

fanButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    fanButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    fanSpeedMode = (btn.dataset.fan as 'silent' | 'balanced' | 'turbo') || 'balanced';
  });
});

btnToggleDock.addEventListener('click', () => {
  isDockCollapsed = !isDockCollapsed;
  controlDock.classList.toggle('dock-collapsed', isDockCollapsed);
  if (isDockCollapsed) {
    dockToggleIcon.textContent = '▴';
    dockToggleText.textContent = '展开控制面板 (HUD)';
  } else {
    dockToggleIcon.textContent = '▾';
    dockToggleText.textContent = '收起控制面板 (全景模式)';
  }
});

// Hardware Inspector Functions
function selectPart(id: string) {
  selectedPartId = id;
  const part = HARDWARE_LIST.find((h) => h.id === id);
  if (!part) return;

  partCategoryTag.textContent = `HARDWARE INSPECTOR // ${part.category}`;
  partBrandModel.textContent = `${part.brand} • ${part.model}`;
  partTitle.textContent = part.cnName;
  partBrief.textContent = part.brief;

  telemetryClockLabel.textContent = part.telemetry.clockLabel;
  telemetryClockVal.textContent = part.telemetry.clockValue;

  if (part.telemetry.customMetricName) {
    telemetryCustomLabel.textContent = part.telemetry.customMetricName;
    telemetryCustomVal.textContent = part.telemetry.customMetricValue || '';
  }

  // Populate Specs Table
  specsTable.innerHTML = part.specs.map((s) => `
    <div class="spec-row">
      <span class="spec-label">${s.label}</span>
      <span class="spec-val">${s.value}</span>
    </div>
  `).join('');

  // Populate Features List
  featuresList.innerHTML = part.features.map((f) => `
    <li class="feature-item">
      <span class="feature-bullet"></span>
      <span>${f}</span>
    </li>
  `).join('');

  inspectorPanel.classList.remove('closed');
  hoverChip.classList.add('hidden');
}

function closeInspector() {
  selectedPartId = null;
  inspectorPanel.classList.add('closed');
}

btnCloseInspector.addEventListener('click', closeInspector);
btnCloseSheet.addEventListener('click', closeInspector);
btnExitDrill.addEventListener('click', closeInspector);

btnPrevPart.addEventListener('click', () => {
  if (!selectedPartId) return;
  const idx = HARDWARE_LIST.findIndex((h) => h.id === selectedPartId);
  const prev = HARDWARE_LIST[(idx - 1 + HARDWARE_LIST.length) % HARDWARE_LIST.length];
  selectPart(prev.id);
});

btnNextPart.addEventListener('click', () => {
  if (!selectedPartId) return;
  const idx = HARDWARE_LIST.findIndex((h) => h.id === selectedPartId);
  const next = HARDWARE_LIST[(idx + 1) % HARDWARE_LIST.length];
  selectPart(next.id);
});

// Live Telemetry Jitter
let telemetryTick = 0;
setInterval(() => {
  telemetryTick++;
  if (!selectedPartId) return;
  const part = HARDWARE_LIST.find((h) => h.id === selectedPartId);
  if (!part) return;

  const jitter = Math.sin(telemetryTick * 1.5) * 1.5;
  const currentTemp = Math.round(part.telemetry.tempLoad + jitter);
  const currentPower = Math.round(part.telemetry.powerLoad + jitter * 4);

  telemetryTemp.textContent = `${currentTemp} ℃`;
  telemetryPower.textContent = `${currentPower} W`;

  gaugeTempFill.style.width = `${Math.min(100, (currentTemp / 90) * 100)}%`;
  gaugePowerFill.style.width = `${Math.min(100, (currentPower / 500) * 100)}%`;
}, 1200);

// Auto-play interval
let playDir = 1;
setInterval(() => {
  if (!isPlaying) return;
  targetProgress += playDir * 0.005;
  if (targetProgress >= 1.0) {
    playDir = -1;
  } else if (targetProgress <= 0.0) {
    playDir = 1;
  }
}, 30);

// Render Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Exponential damping on scroll progress
  progress = THREE.MathUtils.damp(progress, targetProgress, 9.0, delta);

  // Update HUD percentage and scrubber
  const pct = Math.round(progress * 100);
  progressText.textContent = `${pct}%`;
  scrubPercentage.textContent = `${pct}%`;
  scrubBarFill.style.height = `${progress * 100}%`;
  timelineSlider.value = progress.toString();

  // Update Stage Label and Jump Buttons active state
  jumpButtons.forEach((b) => b.classList.remove('active'));
  if (progress <= 0.08) {
    stageLabel.textContent = '01 // 完整整机';
    statusDesc.textContent = '整机装配完成 [ READY TO EXPLODE ]';
    powerDot.classList.remove('powered');
    jumpButtons[0].classList.add('active');
  } else if (progress < 0.64) {
    stageLabel.textContent = '02 // 逐层分离悬停';
    powerDot.classList.remove('powered');
    jumpButtons[1].classList.add('active');
    
    // Detailed step action description
    if (progress < 0.20) statusDesc.textContent = '正在分离 [1/9 外壳钢化面板]';
    else if (progress < 0.26) statusDesc.textContent = '正在分离 [2/9 ARGB风扇组]';
    else if (progress < 0.32) statusDesc.textContent = '正在展开 [3/9 Z790主板]';
    else if (progress < 0.38) statusDesc.textContent = '正在脱嵌 [4/9 i9-14900KS CPU]';
    else if (progress < 0.44) statusDesc.textContent = '正在抬升 [5/9 360mm 水冷散热器]';
    else if (progress < 0.50) statusDesc.textContent = '正在抽出 [6/9 芝奇 DDR5 内存]';
    else if (progress < 0.56) statusDesc.textContent = '正在离槽 [7/9 RTX 4090 显卡]';
    else if (progress < 0.60) statusDesc.textContent = '正在滑出 [8/9 钛金 1300W 电源]';
    else statusDesc.textContent = '正在弹出 [9/9 PCIe 5.0 M.2 固态]';
  } else if (progress <= 0.74) {
    stageLabel.textContent = '03 // 全景悬停展示';
    statusDesc.textContent = '全景展开完成 • 悬停全息检视';
    powerDot.classList.remove('powered');
    jumpButtons[1].classList.add('active');
  } else if (progress < 0.94) {
    stageLabel.textContent = '04 // 自动对齐重组';
    statusDesc.textContent = '正在逆向精密归位重组...';
    powerDot.classList.remove('powered');
    jumpButtons[1].classList.add('active');
  } else {
    stageLabel.textContent = '05 // 极客瞬时上电';
    statusDesc.textContent = '⚡ 极客瞬时上电 (1300W TITANIUM ONLINE)';
    powerDot.classList.add('powered');
    jumpButtons[2].classList.add('active');
  }

  // Power level
  const powerVal = progress >= 0.94 ? 1.0 : (progress <= 0.08 ? 0.35 : 0.65);
  let fanMulti = 1.0;
  if (fanSpeedMode === 'silent') fanMulti = 0.3;
  if (fanSpeedMode === 'turbo') fanMulti = 2.2;

  // Update 3D PC Models & Shaders
  pcSystem.updateExplodeProgress(progress);
  pcSystem.updateTimeAndPower(time, powerVal * fanMulti, lightTheme);

  // Update Floor Grid Shader
  gridMat.uniforms.uTime.value = time;
  gridMat.uniforms.uPowerLevel.value = powerVal;

  // Camera Transitions
  if (selectedPartId) {
    const targetPart = pcSystem.partsMap.get(selectedPartId);
    const specItem = HARDWARE_LIST.find((h) => h.id === selectedPartId);

    if (targetPart && specItem) {
      targetPart.getWorldPosition(_vec3);
      _camLookAt.set(
        _vec3.x + specItem.drillLookOffset[0],
        _vec3.y + specItem.drillLookOffset[1],
        _vec3.z + specItem.drillLookOffset[2]
      );
      _camTarget.set(
        _vec3.x + specItem.drillCamOffset[0],
        _vec3.y + specItem.drillCamOffset[1],
        _vec3.z + specItem.drillCamOffset[2]
      );

      camera.position.lerp(_camTarget, 0.08);
      controls.target.lerp(_camLookAt, 0.08);
    }
  } else {
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.2;
  }

  controls.update();

  // Project 3D Holographic Callouts
  if (!selectedPartId && progress > 0.18 && progress < 0.90) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let html = '';

    HARDWARE_LIST.forEach((item) => {
      const partGroup = pcSystem.partsMap.get(item.id);
      if (partGroup && partGroup.userData.anchor) {
        const anchorVec = (partGroup.userData.anchor as THREE.Vector3).clone();
        partGroup.localToWorld(anchorVec);

        anchorVec.project(camera);
        const isBehind = anchorVec.z > 1.0;
        const sx = (anchorVec.x * 0.5 + 0.5) * w;
        const sy = (-(anchorVec.y * 0.5) + 0.5) * h;

        if (!isBehind && sx > 30 && sx < w - 30 && sy > 40 && sy < h - 70) {
          const shortName = item.cnName.split(' ')[0];
          html += `
            <div class="hologram-beacon" style="left: ${sx}px; top: ${sy}px;" data-part="${item.id}">
              <div class="beacon-badge">
                <span class="beacon-dot"></span>
                <span>${shortName}</span>
                <span class="text-magenta">›</span>
              </div>
              <div class="beacon-stalk"></div>
              <div class="beacon-anchor-dot"></div>
            </div>
          `;
        }
      }
    });

    hologramContainer.innerHTML = html;

    // Attach click handlers to newly projected beacons
    const beacons = hologramContainer.querySelectorAll('.hologram-beacon');
    beacons.forEach((b) => {
      b.addEventListener('click', (e) => {
        const id = (b as HTMLElement).dataset.part;
        if (id) selectPart(id);
        e.stopPropagation();
      });
    });
  } else {
    hologramContainer.innerHTML = '';
  }

  renderer.render(scene, camera);
}

animate();
