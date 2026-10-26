import * as THREE from 'three';
import { 
  ARGBFanShader, 
  PCBTraceShader, 
  NeonPulseShader, 
  CoolerLCDShader, 
  createHeatsinkFinTexture 
} from './shaders';
import { HARDWARE_LIST } from './hardwareData';

export interface BuiltPCSystem {
  rootGroup: THREE.Group;
  partsMap: Map<string, THREE.Group>;
  fanBlades: THREE.Mesh[];
  fanGlowMats: THREE.ShaderMaterial[];
  neonPulseMats: THREE.ShaderMaterial[];
  pcbMat: THREE.ShaderMaterial;
  lcdMat: THREE.ShaderMaterial;
  updateTimeAndPower: (time: number, powerLevel: number, lightTheme: string) => void;
  updateExplodeProgress: (progress: number) => void;
}

// Sequential disassembly timeline mapping for the 9 parts:
// 1.外壳 (chassis) -> 2.风扇 (fans) -> 3.主板 (motherboard) -> 4.CPU (cpu) -> 
// 5.散热器 (cooler) -> 6.内存 (ram) -> 7.显卡 (gpu) -> 8.电源 (psu) -> 9.硬盘 (ssd)
const DISASSEMBLY_SEQUENCE: { id: string; start: number; end: number; reassembleStart: number; reassembleEnd: number }[] = [
  { id: 'chassis',     start: 0.08, end: 0.20, reassembleStart: 0.90, reassembleEnd: 0.94 },
  { id: 'fans',        start: 0.14, end: 0.26, reassembleStart: 0.88, reassembleEnd: 0.92 },
  { id: 'motherboard', start: 0.20, end: 0.32, reassembleStart: 0.86, reassembleEnd: 0.90 },
  { id: 'cpu',         start: 0.26, end: 0.38, reassembleStart: 0.84, reassembleEnd: 0.88 },
  { id: 'cooler',      start: 0.32, end: 0.44, reassembleStart: 0.82, reassembleEnd: 0.86 },
  { id: 'ram',         start: 0.38, end: 0.50, reassembleStart: 0.80, reassembleEnd: 0.84 },
  { id: 'gpu',         start: 0.44, end: 0.56, reassembleStart: 0.78, reassembleEnd: 0.82 },
  { id: 'psu',         start: 0.50, end: 0.60, reassembleStart: 0.76, reassembleEnd: 0.80 },
  { id: 'ssd',         start: 0.54, end: 0.64, reassembleStart: 0.74, reassembleEnd: 0.78 },
];

export function buildCyberPCModel(): BuiltPCSystem {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'CyberPCTower';

  const partsMap = new Map<string, THREE.Group>();
  const fanBlades: THREE.Mesh[] = [];
  const fanGlowMats: THREE.ShaderMaterial[] = [];
  const neonPulseMats: THREE.ShaderMaterial[] = [];

  // PBR Common materials with metallic finish
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x141820,
    metalness: 0.9,
    roughness: 0.22,
  });

  const brushedAluMat = new THREE.MeshStandardMaterial({
    color: 0x242a36,
    metalness: 0.95,
    roughness: 0.18,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.98,
    roughness: 0.08,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.95,
    roughness: 0.15,
  });

  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.9,
    roughness: 0.25,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x05131f,
    metalness: 0.1,
    roughness: 0.04,
    transmission: 0.92,
    transparent: true,
    opacity: 0.45,
    ior: 1.54,
    reflectivity: 0.95,
    depthWrite: false,
  });

  // Dynamic Shaders:
  const pcbMat = new THREE.ShaderMaterial({
    vertexShader: PCBTraceShader.vertexShader,
    fragmentShader: PCBTraceShader.fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPowerLevel: { value: 1.0 },
      uBaseColor: { value: new THREE.Color(0x05070e) },
      uTraceColor: { value: new THREE.Color(0x00f0ff) },
      uPulseColor: { value: new THREE.Color(0xff007f) },
    },
  });

  const lcdMat = new THREE.ShaderMaterial({
    vertexShader: CoolerLCDShader.vertexShader,
    fragmentShader: CoolerLCDShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPowerLevel: { value: 1.0 },
      uColorCyan: { value: new THREE.Color(0x00f0ff) },
      uColorMagenta: { value: new THREE.Color(0xff007f) },
    },
  });

  function createNeonPulseMat(speed = 1.0): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      vertexShader: NeonPulseShader.vertexShader,
      fragmentShader: NeonPulseShader.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPowerLevel: { value: 1.0 },
        uColorCyan: { value: new THREE.Color(0x00f0ff) },
        uColorMagenta: { value: new THREE.Color(0xff007f) },
        uSpeed: { value: speed },
      },
    });
    neonPulseMats.push(mat);
    return mat;
  }

  // 1. MOTHERBOARD
  const mbGroup = new THREE.Group();
  mbGroup.name = 'motherboard';
  const mbItem = HARDWARE_LIST.find((h) => h.id === 'motherboard')!;
  mbGroup.userData = {
    partId: 'motherboard',
    basePos: new THREE.Vector3(0, 0, 0),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...mbItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(mbItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(0, 0.2, 0),
  };

  const pcbGeo = new THREE.BoxGeometry(2.4, 2.8, 0.06);
  const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
  mbGroup.add(pcbMesh);

  const ioGeo = new THREE.BoxGeometry(0.3, 2.5, 0.4);
  const ioMesh = new THREE.Mesh(ioGeo, brushedAluMat);
  ioMesh.position.set(-1.1, 0, 0.2);
  mbGroup.add(ioMesh);

  const vrmTopGeo = new THREE.BoxGeometry(1.4, 0.4, 0.35);
  const vrmTop = new THREE.Mesh(vrmTopGeo, darkMetalMat);
  vrmTop.position.set(0, 1.15, 0.2);
  mbGroup.add(vrmTop);

  const vrmLeftGeo = new THREE.BoxGeometry(0.4, 1.3, 0.35);
  const vrmLeft = new THREE.Mesh(vrmLeftGeo, darkMetalMat);
  vrmLeft.position.set(-0.7, 0.5, 0.2);
  mbGroup.add(vrmLeft);

  const vrmPipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.65, 0.2, 0.35),
    new THREE.Vector3(-0.65, 1.1, 0.35),
    new THREE.Vector3(0.4, 1.1, 0.35),
  ]);
  const vrmPipeGeo = new THREE.TubeGeometry(vrmPipeCurve, 20, 0.035, 8, false);
  const vrmPipe = new THREE.Mesh(vrmPipeGeo, copperMat);
  mbGroup.add(vrmPipe);

  for (let i = 0; i < 3; i++) {
    const pcieSlotGeo = new THREE.BoxGeometry(1.6, 0.08, 0.12);
    const pcieSlot = new THREE.Mesh(pcieSlotGeo, chromeMat);
    pcieSlot.position.set(0.1, -0.4 - i * 0.45, 0.08);
    mbGroup.add(pcieSlot);
  }

  for (let i = 0; i < 4; i++) {
    const dimmSlotGeo = new THREE.BoxGeometry(0.06, 1.4, 0.1);
    const dimmSlot = new THREE.Mesh(dimmSlotGeo, darkMetalMat);
    dimmSlot.position.set(0.6 + i * 0.12, 0.55, 0.07);
    mbGroup.add(dimmSlot);
  }

  for (let i = 0; i < 4; i++) {
    const capGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12);
    const cap = new THREE.Mesh(capGeo, goldMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(-0.95, -0.4 - i * 0.25, 0.12);
    mbGroup.add(cap);
  }

  const chipsetGeo = new THREE.BoxGeometry(0.9, 0.8, 0.18);
  const chipset = new THREE.Mesh(chipsetGeo, darkMetalMat);
  chipset.position.set(0.65, -0.85, 0.12);
  const chipsetGlowGeo = new THREE.PlaneGeometry(0.7, 0.25);
  const chipsetGlow = new THREE.Mesh(chipsetGlowGeo, createNeonPulseMat(1.5));
  chipsetGlow.position.set(0, 0, 0.1);
  chipset.add(chipsetGlow);
  mbGroup.add(chipset);

  partsMap.set('motherboard', mbGroup);
  rootGroup.add(mbGroup);

  // 2. CPU
  const cpuGroup = new THREE.Group();
  cpuGroup.name = 'cpu';
  const cpuItem = HARDWARE_LIST.find((h) => h.id === 'cpu')!;
  cpuGroup.userData = {
    partId: 'cpu',
    basePos: new THREE.Vector3(-0.05, 0.55, 0.04),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...cpuItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(cpuItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(-0.05, 0.55, 0.25),
  };
  cpuGroup.position.copy(cpuGroup.userData.basePos);

  const cpuSubstrateGeo = new THREE.BoxGeometry(0.55, 0.55, 0.03);
  const cpuSubstrateMat = new THREE.MeshStandardMaterial({
    color: 0x114422,
    metalness: 0.3,
    roughness: 0.6,
  });
  const cpuSubstrate = new THREE.Mesh(cpuSubstrateGeo, cpuSubstrateMat);
  cpuGroup.add(cpuSubstrate);

  const ihsGeo = new THREE.BoxGeometry(0.48, 0.48, 0.045);
  const ihsMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    metalness: 0.95,
    roughness: 0.15,
  });
  const ihs = new THREE.Mesh(ihsGeo, ihsMat);
  ihs.position.set(0, 0, 0.035);
  cpuGroup.add(ihs);

  const socketFrameGeo = new THREE.BoxGeometry(0.65, 0.65, 0.03);
  const socketFrame = new THREE.Mesh(socketFrameGeo, chromeMat);
  socketFrame.position.set(0, 0, 0.01);
  cpuGroup.add(socketFrame);

  partsMap.set('cpu', cpuGroup);
  rootGroup.add(cpuGroup);

  // 3. COOLER
  const coolerGroup = new THREE.Group();
  coolerGroup.name = 'cooler';
  const coolerItem = HARDWARE_LIST.find((h) => h.id === 'cooler')!;
  coolerGroup.userData = {
    partId: 'cooler',
    basePos: new THREE.Vector3(-0.05, 0.55, 0.15),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...coolerItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(coolerItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(-0.05, 0.7, 0.5),
  };
  coolerGroup.position.copy(coolerGroup.userData.basePos);

  const pumpBodyGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 24);
  const pumpBody = new THREE.Mesh(pumpBodyGeo, darkMetalMat);
  pumpBody.rotation.x = Math.PI / 2;
  coolerGroup.add(pumpBody);

  const coldplateGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24);
  const coldplate = new THREE.Mesh(coldplateGeo, copperMat);
  coldplate.rotation.x = Math.PI / 2;
  coldplate.position.set(0, 0, -0.15);
  coolerGroup.add(coldplate);

  const lcdGeo = new THREE.CircleGeometry(0.32, 32);
  const lcdScreen = new THREE.Mesh(lcdGeo, lcdMat);
  lcdScreen.position.set(0, 0, 0.16);
  coolerGroup.add(lcdScreen);

  const radGroup = new THREE.Group();
  radGroup.position.set(0, 1.25, 0.4);
  const radGeo = new THREE.BoxGeometry(2.8, 0.3, 0.8);
  const radMesh = new THREE.Mesh(radGeo, darkMetalMat);
  radGroup.add(radMesh);

  const tube1Curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.2, 0.1, 0.05),
    new THREE.Vector3(0.5, 0.7, 0.2),
    new THREE.Vector3(0.4, 1.1, 0.4),
  ]);
  const tube1Geo = new THREE.TubeGeometry(tube1Curve, 24, 0.045, 10, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x111620,
    roughness: 0.8,
    metalness: 0.1,
  });
  const tube1 = new THREE.Mesh(tube1Geo, tubeMat);
  coolerGroup.add(tube1);

  const tube2Curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 0.1, 0.05),
    new THREE.Vector3(-0.1, 0.75, 0.25),
    new THREE.Vector3(0.1, 1.1, 0.4),
  ]);
  const tube2Geo = new THREE.TubeGeometry(tube2Curve, 24, 0.045, 10, false);
  const tube2 = new THREE.Mesh(tube2Geo, tubeMat);
  coolerGroup.add(tube2);

  coolerGroup.add(radGroup);
  partsMap.set('cooler', coolerGroup);
  rootGroup.add(coolerGroup);

  // 4. RAM
  const ramGroup = new THREE.Group();
  ramGroup.name = 'ram';
  const ramItem = HARDWARE_LIST.find((h) => h.id === 'ram')!;
  ramGroup.userData = {
    partId: 'ram',
    basePos: new THREE.Vector3(0.72, 0.55, 0.14),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...ramItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(ramItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(0.72, 0.6, 0.4),
  };
  ramGroup.position.copy(ramGroup.userData.basePos);

  const ramLightbarMat = createNeonPulseMat(1.8);

  for (let s = 0; s < 2; s++) {
    const stickGroup = new THREE.Group();
    stickGroup.position.set(s * 0.24, 0, 0);

    const ramSpreaderGeo = new THREE.BoxGeometry(0.045, 1.35, 0.35);
    const ramSpreader = new THREE.Mesh(ramSpreaderGeo, darkMetalMat);
    stickGroup.add(ramSpreader);

    const rgbBarGeo = new THREE.BoxGeometry(0.05, 1.35, 0.06);
    const rgbBar = new THREE.Mesh(rgbBarGeo, ramLightbarMat);
    rgbBar.position.set(0, 0, 0.19);
    stickGroup.add(rgbBar);

    const pinsGeo = new THREE.BoxGeometry(0.03, 1.3, 0.04);
    const pins = new THREE.Mesh(pinsGeo, goldMat);
    pins.position.set(0, 0, -0.19);
    stickGroup.add(pins);

    ramGroup.add(stickGroup);
  }

  partsMap.set('ram', ramGroup);
  rootGroup.add(ramGroup);

  // 5. GPU
  const gpuGroup = new THREE.Group();
  gpuGroup.name = 'gpu';
  const gpuItem = HARDWARE_LIST.find((h) => h.id === 'gpu')!;
  gpuGroup.userData = {
    partId: 'gpu',
    basePos: new THREE.Vector3(0.1, -0.4, 0.75),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...gpuItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(gpuItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(0.1, -0.4, 1.2),
  };
  gpuGroup.position.copy(gpuGroup.userData.basePos);

  const gpuShroudGeo = new THREE.BoxGeometry(2.3, 0.55, 1.15);
  const gpuShroud = new THREE.Mesh(gpuShroudGeo, darkMetalMat);
  gpuGroup.add(gpuShroud);

  const gpuBackplateGeo = new THREE.BoxGeometry(2.28, 0.03, 1.12);
  const gpuBackplate = new THREE.Mesh(gpuBackplateGeo, brushedAluMat);
  gpuBackplate.position.set(0, 0.28, 0);
  gpuGroup.add(gpuBackplate);

  const finTexture = createHeatsinkFinTexture();
  const finMat = new THREE.MeshStandardMaterial({
    map: finTexture,
    metalness: 0.9,
    roughness: 0.3,
  });
  const finGeo = new THREE.BoxGeometry(2.1, 0.38, 1.05);
  const finMesh = new THREE.Mesh(finGeo, finMat);
  finMesh.position.set(0, -0.05, 0);
  gpuGroup.add(finMesh);

  for (let f = 0; f < 3; f++) {
    const fanHubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16);
    const fanHub = new THREE.Mesh(fanHubGeo, chromeMat);
    fanHub.position.set(-0.65 + f * 0.65, -0.28, 0);

    const fanBladeGroup = new THREE.Group();
    for (let b = 0; b < 9; b++) {
      const bladeGeo = new THREE.BoxGeometry(0.24, 0.02, 0.08);
      const bladeMesh = new THREE.Mesh(bladeGeo, darkMetalMat);
      bladeMesh.rotation.y = (b * Math.PI * 2) / 9;
      bladeMesh.position.set(Math.cos((b * Math.PI * 2) / 9) * 0.14, 0, Math.sin((b * Math.PI * 2) / 9) * 0.14);
      fanBladeGroup.add(bladeMesh);
    }
    fanHub.add(fanBladeGroup);
    fanBlades.push(fanBladeGroup as unknown as THREE.Mesh);
    gpuGroup.add(fanHub);
  }

  const rtxBadgeGeo = new THREE.BoxGeometry(0.75, 0.14, 0.04);
  const rtxBadgeMat = createNeonPulseMat(2.0);
  const rtxBadge = new THREE.Mesh(rtxBadgeGeo, rtxBadgeMat);
  rtxBadge.position.set(0.4, 0.15, 0.59);
  gpuGroup.add(rtxBadge);

  const gpuAccentGeo = new THREE.BoxGeometry(1.6, 0.04, 0.03);
  const gpuAccent1 = new THREE.Mesh(gpuAccentGeo, rtxBadgeMat);
  gpuAccent1.position.set(-0.2, -0.2, 0.59);
  gpuGroup.add(gpuAccent1);

  const pcieEdgeGeo = new THREE.BoxGeometry(1.5, 0.12, 0.03);
  const pcieEdge = new THREE.Mesh(pcieEdgeGeo, goldMat);
  pcieEdge.position.set(0, 0.28, -0.58);
  gpuGroup.add(pcieEdge);

  const pwrConnGeo = new THREE.BoxGeometry(0.24, 0.14, 0.1);
  const pwrConn = new THREE.Mesh(pwrConnGeo, darkMetalMat);
  pwrConn.position.set(0.65, 0.26, 0.45);
  gpuGroup.add(pwrConn);

  partsMap.set('gpu', gpuGroup);
  rootGroup.add(gpuGroup);

  // 6. SSD
  const ssdGroup = new THREE.Group();
  ssdGroup.name = 'ssd';
  const ssdItem = HARDWARE_LIST.find((h) => h.id === 'ssd')!;
  ssdGroup.userData = {
    partId: 'ssd',
    basePos: new THREE.Vector3(0.1, -0.15, 0.08),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...ssdItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(ssdItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(0.1, -0.15, 0.3),
  };
  ssdGroup.position.copy(ssdGroup.userData.basePos);

  const m2PcbGeo = new THREE.BoxGeometry(0.8, 0.22, 0.02);
  const m2PcbMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
  const m2Pcb = new THREE.Mesh(m2PcbGeo, m2PcbMat);
  ssdGroup.add(m2Pcb);

  const m2HeatsinkGeo = new THREE.BoxGeometry(0.78, 0.21, 0.07);
  const m2Heatsink = new THREE.Mesh(m2HeatsinkGeo, darkMetalMat);
  m2Heatsink.position.set(0, 0, 0.04);
  ssdGroup.add(m2Heatsink);

  const m2PipeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.72, 8);
  const m2Pipe = new THREE.Mesh(m2PipeGeo, copperMat);
  m2Pipe.rotation.z = Math.PI / 2;
  m2Pipe.position.set(0, 0, 0.08);
  ssdGroup.add(m2Pipe);

  const m2LogoGeo = new THREE.BoxGeometry(0.45, 0.08, 0.01);
  const m2LogoMat = createNeonPulseMat(3.0);
  const m2Logo = new THREE.Mesh(m2LogoGeo, m2LogoMat);
  m2Logo.position.set(0, 0, 0.085);
  ssdGroup.add(m2Logo);

  partsMap.set('ssd', ssdGroup);
  rootGroup.add(ssdGroup);

  // 7. PSU
  const psuGroup = new THREE.Group();
  psuGroup.name = 'psu';
  const psuItem = HARDWARE_LIST.find((h) => h.id === 'psu')!;
  psuGroup.userData = {
    partId: 'psu',
    basePos: new THREE.Vector3(-0.6, -1.8, -0.4),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...psuItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(psuItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(-0.6, -1.8, 0.4),
  };
  psuGroup.position.copy(psuGroup.userData.basePos);

  const psuCaseGeo = new THREE.BoxGeometry(1.5, 0.9, 1.6);
  const psuCase = new THREE.Mesh(psuCaseGeo, darkMetalMat);
  psuGroup.add(psuCase);

  const psuGrillGeo = new THREE.RingGeometry(0.1, 0.45, 16);
  const psuGrill = new THREE.Mesh(psuGrillGeo, chromeMat);
  psuGrill.rotation.x = Math.PI / 2;
  psuGrill.position.set(0, -0.46, 0);
  psuGroup.add(psuGrill);

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const sockGeo = new THREE.BoxGeometry(0.18, 0.12, 0.05);
      const sock = new THREE.Mesh(sockGeo, brushedAluMat);
      sock.position.set(-0.4 + c * 0.28, -0.2 + r * 0.25, 0.82);
      psuGroup.add(sock);
    }
  }

  const acSwitchGeo = new THREE.BoxGeometry(0.15, 0.15, 0.04);
  const acSwitchMat = createNeonPulseMat(1.0);
  const acSwitch = new THREE.Mesh(acSwitchGeo, acSwitchMat);
  acSwitch.position.set(0.5, 0.2, -0.82);
  psuGroup.add(acSwitch);

  partsMap.set('psu', psuGroup);
  rootGroup.add(psuGroup);

  // 8. FANS
  const fansGroup = new THREE.Group();
  fansGroup.name = 'fans';
  const fansItem = HARDWARE_LIST.find((h) => h.id === 'fans')!;
  fansGroup.userData = {
    partId: 'fans',
    basePos: new THREE.Vector3(0, 0, 0),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...fansItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(fansItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(1.3, 0.5, 0.8),
  };

  function createARGBFan(): THREE.Group {
    const singleFan = new THREE.Group();

    const frameGeo = new THREE.BoxGeometry(0.9, 0.9, 0.2);
    const frameMesh = new THREE.Mesh(frameGeo, darkMetalMat);
    singleFan.add(frameMesh);

    const fanShaderMat = new THREE.ShaderMaterial({
      vertexShader: ARGBFanShader.vertexShader,
      fragmentShader: ARGBFanShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 1.0 },
        uColorA: { value: new THREE.Color(0x00f0ff) },
        uColorB: { value: new THREE.Color(0xff007f) },
        uColorC: { value: new THREE.Color(0x7928ca) },
        uPowerLevel: { value: 1.0 },
        uGlowIntensity: { value: 1.4 },
      },
    });
    fanGlowMats.push(fanShaderMat);

    const ringGeo = new THREE.RingGeometry(0.2, 0.42, 32);
    const ringMesh = new THREE.Mesh(ringGeo, fanShaderMat);
    ringMesh.position.set(0, 0, 0.11);
    singleFan.add(ringMesh);

    const hubGroup = new THREE.Group();
    hubGroup.position.set(0, 0, 0.05);

    const centerCapGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16);
    const centerCap = new THREE.Mesh(centerCapGeo, chromeMat);
    centerCap.rotation.x = Math.PI / 2;
    hubGroup.add(centerCap);

    for (let b = 0; b < 7; b++) {
      const bladeGeo = new THREE.BoxGeometry(0.32, 0.03, 0.09);
      const bladeMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.1,
        transmission: 0.7,
        transparent: true,
        opacity: 0.8,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.z = (b * Math.PI * 2) / 7;
      blade.position.set(Math.cos((b * Math.PI * 2) / 7) * 0.22, Math.sin((b * Math.PI * 2) / 7) * 0.22, 0);
      hubGroup.add(blade);
    }

    singleFan.add(hubGroup);
    fanBlades.push(hubGroup as unknown as THREE.Mesh);

    return singleFan;
  }

  for (let f = 0; f < 3; f++) {
    const fan = createARGBFan();
    fan.position.set(1.4, -0.6 + f * 0.95, 0.7);
    fan.rotation.y = -Math.PI / 2;
    fansGroup.add(fan);
  }

  const rearFan = createARGBFan();
  rearFan.position.set(-1.3, 0.55, 0.2);
  rearFan.rotation.y = Math.PI / 2;
  fansGroup.add(rearFan);

  for (let f = 0; f < 2; f++) {
    const topFan = createARGBFan();
    topFan.position.set(-0.5 + f * 0.95, 1.55, 0.35);
    topFan.rotation.x = Math.PI / 2;
    fansGroup.add(topFan);
  }

  partsMap.set('fans', fansGroup);
  rootGroup.add(fansGroup);

  // 9. CHASSIS
  const chassisGroup = new THREE.Group();
  chassisGroup.name = 'chassis';
  const chassisItem = HARDWARE_LIST.find((h) => h.id === 'chassis')!;
  chassisGroup.userData = {
    partId: 'chassis',
    basePos: new THREE.Vector3(0, 0, 0),
    baseRot: new THREE.Euler(0, 0, 0),
    explodeOffset: new THREE.Vector3(...chassisItem.explodeOffset),
    explodeRotation: new THREE.Euler(...(chassisItem.explodeRotation || [0, 0, 0])),
    anchor: new THREE.Vector3(1.6, 0.4, 1.4),
  };

  const pillarGeo = new THREE.BoxGeometry(0.08, 4.2, 0.08);
  const cornerPositions = [
    [-1.6, 0, -1.2],
    [-1.6, 0, 1.4],
    [1.6, 0, -1.2],
    [1.6, 0, 1.4],
  ];
  cornerPositions.forEach(([px, py, pz]) => {
    const pillar = new THREE.Mesh(pillarGeo, darkMetalMat);
    pillar.position.set(px, py, pz);
    chassisGroup.add(pillar);
  });

  const xBeamGeo = new THREE.BoxGeometry(3.28, 0.08, 0.08);
  const zBeamGeo = new THREE.BoxGeometry(0.08, 0.08, 2.68);

  const topX1 = new THREE.Mesh(xBeamGeo, darkMetalMat);
  topX1.position.set(0, 2.1, -1.2);
  const topX2 = new THREE.Mesh(xBeamGeo, darkMetalMat);
  topX2.position.set(0, 2.1, 1.4);
  const topZ1 = new THREE.Mesh(zBeamGeo, darkMetalMat);
  topZ1.position.set(-1.6, 2.1, 0.1);
  const topZ2 = new THREE.Mesh(zBeamGeo, darkMetalMat);
  topZ2.position.set(1.6, 2.1, 0.1);
  chassisGroup.add(topX1, topX2, topZ1, topZ2);

  const botX1 = new THREE.Mesh(xBeamGeo, darkMetalMat);
  botX1.position.set(0, -2.1, -1.2);
  const botX2 = new THREE.Mesh(xBeamGeo, darkMetalMat);
  botX2.position.set(0, -2.1, 1.4);
  chassisGroup.add(botX1, botX2);

  const psuShroudGeo = new THREE.BoxGeometry(3.18, 0.9, 2.5);
  const psuShroudMesh = new THREE.Mesh(psuShroudGeo, brushedAluMat);
  psuShroudMesh.position.set(0, -1.65, 0.1);
  chassisGroup.add(psuShroudMesh);

  const frontGlassGeo = new THREE.BoxGeometry(3.15, 3.2, 0.05);
  const frontGlass = new THREE.Mesh(frontGlassGeo, glassMat);
  frontGlass.position.set(0, 0.5, 1.42);
  chassisGroup.add(frontGlass);

  for (let x = -1; x <= 1; x += 2) {
    for (let y = -1; y <= 1; y += 2) {
      const screwGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12);
      const screw = new THREE.Mesh(screwGeo, chromeMat);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x * 1.48, 0.5 + y * 1.5, 1.46);
      chassisGroup.add(screw);
    }
  }

  const chassisNeonMat = createNeonPulseMat(2.2);
  const neonBladeGeo = new THREE.BoxGeometry(0.04, 3.8, 0.04);
  const neonBlade = new THREE.Mesh(neonBladeGeo, chassisNeonMat);
  neonBlade.position.set(1.61, 0.1, 1.41);
  chassisGroup.add(neonBlade);

  const pwrButtonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
  const pwrButton = new THREE.Mesh(pwrButtonGeo, chassisNeonMat);
  pwrButton.position.set(1.5, 2.05, 1.25);
  chassisGroup.add(pwrButton);

  for (let x = -1; x <= 1; x += 2) {
    for (let z = -1; z <= 1; z += 2) {
      const footGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12);
      const footMat = new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: 0.9 });
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(x * 1.45, -2.15, z * 1.15 + 0.1);
      chassisGroup.add(foot);
    }
  }

  partsMap.set('chassis', chassisGroup);
  rootGroup.add(chassisGroup);

  const updateTimeAndPower = (time: number, powerLevel: number, lightTheme: string) => {
    const rpmSpeed = powerLevel > 0.1 ? (0.04 + powerLevel * 0.28) : 0.004;
    fanBlades.forEach((blade) => {
      blade.rotation.z += rpmSpeed;
    });

    let colorA = new THREE.Color(0x00f0ff);
    let colorB = new THREE.Color(0xff007f);
    let colorC = new THREE.Color(0x7928ca);

    if (lightTheme === 'matrix') {
      colorA = new THREE.Color(0x00ff66);
      colorB = new THREE.Color(0x003311);
      colorC = new THREE.Color(0x66ff99);
    } else if (lightTheme === 'amber') {
      colorA = new THREE.Color(0xffaa00);
      colorB = new THREE.Color(0xff3300);
      colorC = new THREE.Color(0xffcc00);
    } else if (lightTheme === 'stealth') {
      colorA = new THREE.Color(0x38bdf8);
      colorB = new THREE.Color(0x0f172a);
      colorC = new THREE.Color(0x1e293b);
    }

    fanGlowMats.forEach((mat) => {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uPowerLevel.value = powerLevel;
      mat.uniforms.uColorA.value.copy(colorA);
      mat.uniforms.uColorB.value.copy(colorB);
      mat.uniforms.uColorC.value.copy(colorC);
    });

    pcbMat.uniforms.uTime.value = time;
    pcbMat.uniforms.uPowerLevel.value = powerLevel;
    pcbMat.uniforms.uTraceColor.value.copy(colorA);
    pcbMat.uniforms.uPulseColor.value.copy(colorB);

    lcdMat.uniforms.uTime.value = time;
    lcdMat.uniforms.uPowerLevel.value = powerLevel;
    lcdMat.uniforms.uColorCyan.value.copy(colorA);
    lcdMat.uniforms.uColorMagenta.value.copy(colorB);

    neonPulseMats.forEach((mat) => {
      mat.uniforms.uTime.value = time;
      mat.uniforms.uPowerLevel.value = powerLevel;
      mat.uniforms.uColorCyan.value.copy(colorA);
      mat.uniforms.uColorMagenta.value.copy(colorB);
    });
  };

  const updateExplodeProgress = (progress: number) => {
    const p = Math.max(0, Math.min(1, progress));

    DISASSEMBLY_SEQUENCE.forEach((seq) => {
      const group = partsMap.get(seq.id);
      if (!group) return;

      const { basePos, explodeOffset, baseRot, explodeRotation } = group.userData;
      if (!basePos || !explodeOffset) return;

      let partT = 0;

      if (p <= 0.08) {
        partT = 0;
      } else if (p < 0.64) {
        if (p < seq.start) {
          partT = 0;
        } else if (p >= seq.end) {
          partT = 1;
        } else {
          const norm = (p - seq.start) / (seq.end - seq.start);
          partT = norm * norm * (3 - 2 * norm);
        }
      } else if (p >= 0.64 && p <= 0.74) {
        partT = 1;
      } else if (p > 0.74 && p <= 0.94) {
        if (p < seq.reassembleStart) {
          partT = 1;
        } else if (p >= seq.reassembleEnd) {
          partT = 0;
        } else {
          const norm = (p - seq.reassembleStart) / (seq.reassembleEnd - seq.reassembleStart);
          const eased = norm * norm * (3 - 2 * norm);
          partT = 1 - eased;
        }
      } else {
        partT = 0;
      }

      group.position.x = basePos.x + explodeOffset.x * partT;
      group.position.y = basePos.y + explodeOffset.y * partT;
      group.position.z = basePos.z + explodeOffset.z * partT;

      if (baseRot && explodeRotation) {
        group.rotation.x = baseRot.x + explodeRotation.x * partT;
        group.rotation.y = baseRot.y + explodeRotation.y * partT;
        group.rotation.z = baseRot.z + explodeRotation.z * partT;
      }
    });
  };

  return {
    rootGroup,
    partsMap,
    fanBlades,
    fanGlowMats,
    neonPulseMats,
    pcbMat,
    lcdMat,
    updateTimeAndPower,
    updateExplodeProgress,
  };
}
