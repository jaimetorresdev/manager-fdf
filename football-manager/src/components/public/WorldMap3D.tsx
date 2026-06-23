import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { countryCoordsForList, resolveCountryCoords } from './countryCoords';
import { useTranslation } from 'react-i18next';

interface WorldMap3DProps {
  onCountrySelect?: (country: string) => void;
  selectedCountry?: string | null;
  activeCountries: string[];
}

// Calibración fina lng→textura. Las texturas (earth_atmos / earth_night) son
// equirectangulares estándar (Greenwich centrado, norte arriba) → offset 0.
const LON_OFFSET_DEG = 0;

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + LON_OFFSET_DEG);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = -radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

const MARKER_GREEN = 0x34d399;
const MARKER_GOLD = 0xffd700;
const SUN = new THREE.Vector3(0.6, 0.28, 0.74).normalize();

// ── Shaders ─────────────────────────────────────────────────────────────────
const VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Tierra: día/noche con terminador + luces de ciudad + brillo solar en océanos + tinte de limbo
const EARTH_FRAG = /* glsl */`
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform sampler2D specTex;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 L = normalize(sunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);
    float day = smoothstep(-0.12, 0.32, d);
    vec3 dayCol = texture2D(dayTex, vUv).rgb;
    vec3 nightCol = texture2D(nightTex, vUv).rgb;
    vec3 night = pow(nightCol, vec3(2.1)) * 2.7;   // gamma: mata el ruido tenue del océano, conserva ciudades
    vec3 col = mix(night, dayCol * (0.30 + 0.78 * day), day);
    float water = texture2D(specTex, vUv).r;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 55.0) * water * day;
    col += vec3(1.0, 0.93, 0.78) * spec * 1.4;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += vec3(0.25, 0.5, 1.0) * fres * (0.22 + 0.6 * day);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Nubes: luminancia de la textura como alfa, se apagan en la cara de noche
const CLOUD_FRAG = /* glsl */`
  uniform sampler2D cloudTex;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vec4 c = texture2D(cloudTex, vUv);
    // La máscara de nube vive en el canal ALFA (RGB es blanco en todas partes);
    // usar luminancia velaba todo el océano. Combinamos alfa·luminancia por robustez.
    float lum = max(c.r, max(c.g, c.b));
    float a = smoothstep(0.18, 0.75, c.a * lum);
    float d = dot(normalize(vNormalW), normalize(sunDir));
    float day = smoothstep(-0.05, 0.4, d);
    gl_FragColor = vec4(vec3(0.64 + 0.36 * day), a * (0.1 + 0.78 * day) * 0.82);
  }
`;

// Atmósfera: rim fresnel azul (dispersión), más viva en la cara iluminada
const ATMO_FRAG = /* glsl */`
  uniform vec3 sunDir;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.3);
    float lit = clamp(dot(N, normalize(sunDir)) + 0.45, 0.0, 1.0);
    gl_FragColor = vec4(vec3(0.30, 0.56, 1.0), fres * (0.32 + 0.68 * lit) * 0.95);
  }
`;

type Marker = THREE.Mesh & { userData: { country: string; glow: THREE.Sprite; labelEl: HTMLButtonElement } };

export function WorldMap3D({ onCountrySelect, selectedCountry, activeCountries }: WorldMap3DProps) {
  const { t } = useTranslation('common');
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onCountrySelect);
  onSelectRef.current = onCountrySelect;
  const selectedRef = useRef<string | null | undefined>(selectedCountry);
  selectedRef.current = selectedCountry;

  const sceneRef = useRef<{
    camera: THREE.PerspectiveCamera;
    markers: Record<string, Marker>;
    globe: THREE.Group;
    clouds: THREE.Mesh;
    targetRotX: number;
    targetRotY: number;
    targetZoom: number;
    hoverCountry: string | null;
  } | null>(null);

  const countriesKey = activeCountries.slice().sort().join('|');

  useEffect(() => {
    if (!mountRef.current || !labelsRef.current) return;
    const coords = countryCoordsForList(activeCountries);
    const currentMount = mountRef.current;
    const labelsLayer = labelsRef.current;
    labelsLayer.replaceChildren();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, currentMount.clientWidth / currentMount.clientHeight, 0.1, 2000);
    camera.position.z = 260;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    globeGroup.rotation.x = THREE.MathUtils.degToRad(12);
    globeGroup.rotation.y = THREE.MathUtils.degToRad(-100); // arranca mirando a Europa
    scene.add(globeGroup);

    const radius = 100;
    const segments = 96;

    const loader = new THREE.TextureLoader();
    const dayTex = loader.load('/earth_atmos_2048.jpg', (t2) => { t2.colorSpace = THREE.SRGBColorSpace; });
    const nightTex = loader.load('/earth_night.jpg', (t2) => { t2.colorSpace = THREE.SRGBColorSpace; });
    const specTex = loader.load('/earth_specular_2048.jpg');
    const cloudTex = loader.load('/earth_clouds_1024.png');

    // Tierra
    const earthMat = new THREE.ShaderMaterial({
      uniforms: { dayTex: { value: dayTex }, nightTex: { value: nightTex }, specTex: { value: specTex }, sunDir: { value: SUN } },
      vertexShader: VERT, fragmentShader: EARTH_FRAG,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments), earthMat);
    globeGroup.add(earth);

    // Nubes (esfera ligeramente mayor, deriva propia)
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: { cloudTex: { value: cloudTex }, sunDir: { value: SUN } },
      vertexShader: VERT, fragmentShader: CLOUD_FRAG,
      transparent: true, depthWrite: false,
    });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, segments, segments), cloudMat);
    globeGroup.add(clouds);

    // Atmósfera
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: SUN } },
      vertexShader: VERT, fragmentShader: ATMO_FRAG,
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, segments, segments), atmoMat);
    globeGroup.add(atmosphere);

    // Textura circular suave para que los puntos NO sean cuadrados
    const makeDotTex = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    };
    const starTex = makeDotTex();

    // Campo de estrellas (dos tamaños), puntos redondos en el fondo
    const makeStars = (count: number, size: number, opacity: number) => {
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(600 + Math.random() * 350);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: starTex, color: 0xffffff, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(pts);
      return geo;
    };
    const starGeoA = makeStars(650, 4, 0.5);
    const starGeoB = makeStars(110, 7, 0.7);

    // Glow procedural para los marcadores
    const makeGlowTex = () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d')!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(180,255,225,0.9)');
      grad.addColorStop(0.5, 'rgba(52,211,153,0.35)');
      grad.addColorStop(1, 'rgba(52,211,153,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const glowTex = makeGlowTex();

    // ── Marcadores clicables + etiquetas de nombre ───────────────────────────
    const markers: Record<string, Marker> = {};
    const coreGeo = new THREE.SphereGeometry(0.62, 14, 14);

    Object.entries(coords).forEach(([country, { lat, lng }]) => {
      const pos = latLngToVector3(lat, lng, radius);
      const normal = pos.clone().normalize();

      const marker = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })) as unknown as Marker;
      marker.position.copy(normal).multiplyScalar(radius + 0.5);
      globeGroup.add(marker);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: MARKER_GREEN, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
      glow.scale.setScalar(3);
      glow.raycast = () => {};
      marker.add(glow);

      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = country;
      el.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-9999px,-9999px);white-space:nowrap;font-size:10px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;padding:2px 8px;border-radius:999px;color:#eafff5;background:rgba(5,16,30,0.6);border:1px solid rgba(52,211,153,0.45);backdrop-filter:blur(4px);pointer-events:auto;cursor:pointer;will-change:transform,opacity;transition:color .15s,border-color .15s,background .15s;';
      el.addEventListener('click', (e) => { e.stopPropagation(); onSelectRef.current?.(country); });
      el.addEventListener('pointerenter', () => { if (sceneRef.current) sceneRef.current.hoverCountry = country; });
      labelsLayer.appendChild(el);

      marker.userData = { country, glow, labelEl: el };
      markers[country] = marker;
    });

    sceneRef.current = {
      camera, markers, globe: globeGroup, clouds,
      targetRotX: globeGroup.rotation.x, targetRotY: globeGroup.rotation.y, targetZoom: 260, hoverCountry: null,
    };

    // ── Interacción: arrastrar para rotar, clic para seleccionar ─────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false, dragDistance = 0, prev = { x: 0, y: 0 };

    const onDown = (e: MouseEvent) => { isDragging = true; dragDistance = 0; prev = { x: e.clientX, y: e.clientY }; };
    const onUp = () => { isDragging = false; };
    const onMove = (e: MouseEvent) => {
      const ref = sceneRef.current; if (!ref) return;
      if (isDragging) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        dragDistance += Math.abs(dx) + Math.abs(dy);
        globeGroup.rotation.y += dx * 0.005;
        globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x + dy * 0.005));
        prev = { x: e.clientX, y: e.clientY };
        ref.targetRotX = globeGroup.rotation.x; ref.targetRotY = globeGroup.rotation.y;
      }
      const rect = currentMount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(Object.values(markers), false);
      if (hit.length > 0) {
        currentMount.style.cursor = isDragging ? 'grabbing' : 'pointer';
        ref.hoverCountry = (hit[0].object as unknown as Marker).userData.country;
      } else {
        currentMount.style.cursor = isDragging ? 'grabbing' : 'grab';
        if (!isDragging) ref.hoverCountry = null;
      }
    };
    const onClick = () => {
      const ref = sceneRef.current; if (!ref || dragDistance > 5) return;
      if (ref.hoverCountry) onSelectRef.current?.(ref.hoverCountry);
    };
    currentMount.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    currentMount.addEventListener('mousemove', onMove);
    currentMount.addEventListener('click', onClick);

    // ── Bucle ────────────────────────────────────────────────────────────────
    let raf = 0, clock = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const ref = sceneRef.current; if (!ref) return;
      clock += 0.016;
      const sel = selectedRef.current ?? null;

      if (!sel && !isDragging) {
        ref.targetRotY += 0.0007;
        globeGroup.rotation.y = ref.targetRotY;
      } else if (sel && !isDragging) {
        globeGroup.rotation.x += (ref.targetRotX - globeGroup.rotation.x) * 0.06;
        globeGroup.rotation.y += (ref.targetRotY - globeGroup.rotation.y) * 0.06;
      }
      // cámara cinematográfica (zoom al seleccionar)
      camera.position.z += (ref.targetZoom - camera.position.z) * 0.05;

      clouds.rotation.y += 0.00018;

      // marcadores + etiquetas
      globeGroup.updateMatrixWorld();
      const w = currentMount.clientWidth, h = currentMount.clientHeight;
      Object.entries(ref.markers).forEach(([c, m]) => {
        const state = c === sel ? 2 : c === ref.hoverCountry ? 1 : 0;
        const glow = m.userData.glow;
        const gm = glow.material as THREE.SpriteMaterial;
        gm.color.setHex(state >= 1 ? MARKER_GOLD : MARKER_GREEN);
        const pulse = state === 2 ? 1 + Math.sin(clock * 4) * 0.12 : 1;
        glow.scale.setScalar((state === 2 ? 4.6 : state === 1 ? 3.8 : 2.8) * pulse);
        (m.material as THREE.MeshBasicMaterial).color.setHex(state >= 1 ? 0xfff3c4 : 0xffffff);
        m.scale.setScalar(state === 2 ? 1.5 : 1);

        // etiqueta: proyección a pantalla + oclusión por cara del globo
        const wp = m.position.clone().applyMatrix4(globeGroup.matrixWorld);
        const nz = wp.clone().normalize().z; // cara frontal si > 0
        const el = m.userData.labelEl;
        const facing = THREE.MathUtils.smoothstep(nz, 0.05, 0.32);
        if (facing <= 0.01) {
          el.style.opacity = '0'; el.style.pointerEvents = 'none';
        } else {
          const p = wp.clone().project(camera);
          const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
          const sc = state === 2 ? 1.18 : state === 1 ? 1.08 : 1;
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -165%) scale(${sc})`;
          el.style.opacity = String(state >= 1 ? 1 : facing * 0.92);
          el.style.pointerEvents = 'auto';
          el.style.zIndex = state === 2 ? '30' : state === 1 ? '25' : '10';
          if (state >= 1) {
            el.style.color = '#08140d'; el.style.background = 'rgba(255,215,0,0.92)'; el.style.borderColor = 'rgba(255,215,0,0.9)';
          } else {
            el.style.color = '#eafff5'; el.style.background = 'rgba(5,16,30,0.6)'; el.style.borderColor = 'rgba(52,211,153,0.45)';
          }
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mouseup', onUp);
      currentMount.removeEventListener('mousedown', onDown);
      currentMount.removeEventListener('mousemove', onMove);
      currentMount.removeEventListener('click', onClick);
      cancelAnimationFrame(raf);
      labelsLayer.replaceChildren();
      currentMount.removeChild(renderer.domElement);
      [dayTex, nightTex, specTex, cloudTex, glowTex, starTex].forEach((t2) => t2.dispose());
      [earthMat, cloudMat, atmoMat].forEach((m) => m.dispose());
      [earth.geometry, clouds.geometry, atmosphere.geometry, coreGeo, starGeoA, starGeoB].forEach((g) => g.dispose());
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countriesKey]);

  // Enfoque del país seleccionado: rota a su cara + zoom cinematográfico
  useEffect(() => {
    const ref = sceneRef.current; if (!ref) return;
    const coords = selectedCountry ? resolveCountryCoords(selectedCountry) : null;
    if (selectedCountry && coords) {
      const current = ref.globe.rotation.y;
      const raw = THREE.MathUtils.degToRad(-90 - coords.lng - LON_OFFSET_DEG);
      const twoPi = Math.PI * 2;
      ref.targetRotY = current + (((raw - current + Math.PI) % twoPi + twoPi) % twoPi - Math.PI);
      ref.targetRotX = THREE.MathUtils.degToRad(Math.max(-48, Math.min(48, coords.lat * 0.85)));
      ref.targetZoom = 178;
    } else {
      ref.targetZoom = 260;
    }
  }, [selectedCountry]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mountRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />
      <div ref={labelsRef} className="absolute inset-0 z-20 overflow-hidden pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,transparent_55%,color-mix(in_srgb,var(--bg-base)_85%,transparent)_100%)]" />
      <div className="absolute top-4 left-4 z-30 pointer-events-none">
        <div className="font-mono text-xs text-[var(--green-primary)] opacity-70 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--green-primary)] animate-pulse" />
          {t('FDF_NET // GLOBAL_LINK')}
        </div>
        <div className="font-mono text-[9px] text-[var(--text-muted)] mt-2 uppercase tracking-widest">{t('Arrastra para rotar · clic en un país')}</div>
      </div>
    </div>
  );
}
