import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface Stadium3DProps {
  levels: { norte: number; sur: number; preferencia: number; lateral: number };
  works: any[];
  occupancyPct: number;
  onUnavailable?: () => void;
}

export default function Stadium3D({ levels, works, occupancyPct, onUnavailable }: Stadium3DProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  const sceneRef = useRef<any>(null);
  const standsGroupRef = useRef<any>(null);
  const composerRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    let renderer: any, scene: any, camera: any, frameId: number, composer: any;
    const currentContainer = containerRef.current;
    let resizeObserver: ResizeObserver | null = null;

    const onResize = () => {
      const container = containerRef.current;
      if (!container || !camera || !renderer || !composer) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };

    async function init() {
      try {
        const THREE = await import('three');
        // Dynamic imports for post-processing
        const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
        const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
        const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');

        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        scene = new THREE.Scene();
        // Global uniforms for shaders
        const uniforms = {
          uTime: { value: 0 }
        };
        sceneRef.current = { THREE, scene, uniforms };

        const appTheme = document.documentElement.dataset.theme ?? 'dark';
        const isLight = appTheme === 'light';
        const isNightMatch = !isLight;
        const skyTop = isLight ? '#87CEEB' : '#1e3a5f';
        const skyBot = isLight ? '#E0F2FE' : '#0f172a';
        
        const skyCanvas = document.createElement('canvas');
        skyCanvas.width = 2;
        skyCanvas.height = 512;
        const skyCtx = skyCanvas.getContext('2d')!;
        const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
        skyGrad.addColorStop(0, skyTop);
        skyGrad.addColorStop(1, skyBot);
        skyCtx.fillStyle = skyGrad;
        skyCtx.fillRect(0, 0, 2, 512);
        const skyTex = new THREE.CanvasTexture(skyCanvas);
        scene.background = skyTex;
        scene.fog = new THREE.FogExp2(skyBot, isLight ? 0.0035 : 0.006);

        const width = container.clientWidth || 600;
        const height = container.clientHeight || 300;

        // Cinematic camera angle
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(70, 50, 70);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
        if (!renderer.getContext()) throw new Error('no webgl');
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = isLight ? 1.08 : 1.35;
        container.appendChild(renderer.domElement);

        // --- Post-Processing Setup ---
        composer = new EffectComposer(renderer);
        composerRef.current = composer;
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);
        
        // UnrealBloomPass parameters: resolution, strength, radius, threshold
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(width, height),
          isLight ? 0.25 : 0.65, // strength
          0.8, // radius
          isLight ? 0.9 : 0.2 // threshold (lower threshold at night to make lights glow)
        );
        composer.addPass(bloomPass);

        // Ambient + Main Lights
        const ambient = new THREE.AmbientLight(isLight ? 0xffffff : 0x8a9cbb, isLight ? 0.68 : 0.4);
        scene.add(ambient);

        if (isLight) {
          const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
          sun.position.set(60, 120, 40);
          sun.castShadow = true;
          sun.shadow.mapSize.width = 2048;
          sun.shadow.mapSize.height = 2048;
          scene.add(sun);
          const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3d6b4f, 0.55);
          scene.add(hemi);
        }

        // Foco central del césped
        const pitchLight = new THREE.SpotLight(0xffffff, isLight ? 400 : 900);
        pitchLight.position.set(0, 90, 0);
        pitchLight.angle = Math.PI / 2.5;
        pitchLight.penumbra = 0.6;
        pitchLight.decay = 2;
        pitchLight.distance = 250;
        pitchLight.castShadow = true;
        pitchLight.shadow.mapSize.width = 2048;
        pitchLight.shadow.mapSize.height = 2048;
        scene.add(pitchLight);
        
        // Stadium floodlights crossing the sky
        const createSpotlight = (x: number, z: number, color: number) => {
          const spot = new THREE.SpotLight(color, 2500);
          spot.position.set(x, 70, z);
          spot.angle = Math.PI / 6;
          spot.penumbra = 0.3;
          spot.decay = 1.5;
          spot.distance = 350;
          spot.castShadow = true;
          
          const targetObj = new THREE.Object3D();
          targetObj.position.set(0, 0, 0);
          scene.add(targetObj);
          spot.target = targetObj;
          
          // Glowing bulb
          const bulbGeo = new THREE.SphereGeometry(1.5, 16, 16);
          const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(x, 70, z);
          scene.add(bulb);

          // Volumetric Light Shaft (Cono translúcido simulando dispersión atmosférica)
          if (isNightMatch) {
            const coneHeight = 120;
            const coneRadius = 35;
            const shaftGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);
            // Move origin to the tip of the cone
            shaftGeo.translate(0, -coneHeight / 2, 0);
            shaftGeo.rotateX(Math.PI / 2); // point along Z

            const shaftMat = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.05,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide
            });
            const shaft = new THREE.Mesh(shaftGeo, shaftMat);
            shaft.position.set(x, 70, z);
            shaft.lookAt(targetObj.position);
            scene.add(shaft);
          }
          
          return { spot, bulb };
        };

        if (isNightMatch) {
          createSpotlight(45, 45, 0xffffff);
          createSpotlight(-45, 45, 0xffffff);
          createSpotlight(45, -45, 0xffffff);
          createSpotlight(-45, -45, 0xffffff);
        }

        // Pitch HD (striped grass with procedural noise)
        const pitchGeo = new THREE.PlaneGeometry(64, 44);
        
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = i % 2 === 0
            ? (isLight ? '#34a853' : '#228b3a')
            : (isLight ? '#2d8a47' : '#1a7030');
          ctx.fillRect((i * 1024) / 16, 0, 1024 / 16, 1024);
        }
        
        // Inject Noise for realistic grass texture
        const imgData = ctx.getImageData(0, 0, 1024, 1024);
        for (let j = 0; j < imgData.data.length; j += 4) {
          const noise = (Math.random() - 0.5) * 16;
          imgData.data[j] = Math.min(255, Math.max(0, imgData.data[j] + noise));
          imgData.data[j+1] = Math.min(255, Math.max(0, imgData.data[j+1] + noise));
          imgData.data[j+2] = Math.min(255, Math.max(0, imgData.data[j+2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);

        const grassTex = new THREE.CanvasTexture(canvas);
        grassTex.wrapS = THREE.RepeatWrapping;
        grassTex.wrapT = THREE.RepeatWrapping;

        const pitchMat = new THREE.MeshStandardMaterial({ 
          map: grassTex,
          roughness: 0.9,
          metalness: 0.05
        });
        const pitch = new THREE.Mesh(pitchGeo, pitchMat);
        pitch.rotation.x = -Math.PI / 2;
        pitch.receiveShadow = true;
        scene.add(pitch);

        // Pitch lines
        const linesCanvas = document.createElement('canvas');
        linesCanvas.width = 2048;
        linesCanvas.height = 1408;
        const lctx = linesCanvas.getContext('2d')!;
        lctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        lctx.lineWidth = 6;
        lctx.strokeRect(80, 80, 1888, 1248); 
        lctx.beginPath(); lctx.moveTo(1024, 80); lctx.lineTo(1024, 1328); lctx.stroke(); 
        lctx.beginPath(); lctx.arc(1024, 704, 200, 0, Math.PI * 2); lctx.stroke(); 
        lctx.strokeRect(80, 352, 320, 704);
        lctx.strokeRect(1648, 352, 320, 704);
        lctx.strokeRect(80, 528, 100, 352);
        lctx.strokeRect(1868, 528, 100, 352);
        
        const linesTex = new THREE.CanvasTexture(linesCanvas);
        const linesGeo = new THREE.PlaneGeometry(64, 44);
        const linesMatObj = new THREE.MeshBasicMaterial({ map: linesTex, transparent: true, opacity: 0.9 });
        const lines = new THREE.Mesh(linesGeo, linesMatObj);
        lines.rotation.x = -Math.PI / 2;
        lines.position.y = 0.1;
        lines.receiveShadow = true;
        scene.add(lines);

        // Porterías
        const postMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', metalness: 0.6, roughness: 0.25 });
        const netMat = new THREE.MeshBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.35, wireframe: true });
        const makeGoal = (z: number) => {
          const grp = new THREE.Group();
          const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8);
          const barGeo = new THREE.CylinderGeometry(0.12, 0.12, 7.32, 8);
          const lPost = new THREE.Mesh(postGeo, postMat);
          lPost.position.set(-3.66, 1.2, z);
          const rPost = new THREE.Mesh(postGeo, postMat);
          rPost.position.set(3.66, 1.2, z);
          const cross = new THREE.Mesh(barGeo, postMat);
          cross.rotation.z = Math.PI / 2;
          cross.position.set(0, 2.4, z);
          const netGeo = new THREE.BoxGeometry(7.32, 2.4, 1.8);
          const net = new THREE.Mesh(netGeo, netMat);
          net.position.set(0, 1.2, z + (z > 0 ? 0.9 : -0.9));
          grp.add(lPost, rPost, cross, net);
          return grp;
        };
        scene.add(makeGoal(-22));
        scene.add(makeGoal(22));

        // Banderines
        const flagMat = new THREE.MeshStandardMaterial({ color: '#ef4444', side: THREE.DoubleSide });
        const poleMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', metalness: 0.4, roughness: 0.3 });
        [[-32, -22], [-32, 22], [32, -22], [32, 22]].forEach(([x, z]) => {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), poleMat);
          pole.position.set(x, 0.8, z);
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), flagMat);
          flag.position.set(x + (x < 0 ? 0.35 : -0.35), 1.3, z);
          flag.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
          scene.add(pole, flag);
        });

        const trackGeo = new THREE.PlaneGeometry(120, 120);
        const trackMat = new THREE.MeshStandardMaterial({ color: isLight ? '#475569' : '#1e293b', roughness: 0.85 });
        const track = new THREE.Mesh(trackGeo, trackMat);
        track.rotation.x = -Math.PI / 2;
        track.position.y = -0.1;
        track.receiveShadow = true;
        scene.add(track);

        const standsGroup = new THREE.Group();
        standsGroupRef.current = standsGroup;
        scene.add(standsGroup);

        setLoading(false);

        let angle = 0;
        const animate = () => {
          if (!active) return;
          frameId = requestAnimationFrame(animate);
          
          angle += 0.0012;
          camera.position.x = Math.sin(angle) * 85;
          camera.position.z = Math.cos(angle) * 85;
          camera.lookAt(0, 0, 0);
          
          // Slight hover to the pitch light
          pitchLight.position.x = Math.sin(angle * 5) * 5;
          pitchLight.position.z = Math.cos(angle * 5) * 5;

          // Update uniform time for GPU shaders (Crowd)
          if (sceneRef.current?.uniforms) {
            sceneRef.current.uniforms.uTime.value += 0.016;
          }

          if (composer) {
            composer.render();
          } else {
            renderer.render(scene, camera);
          }
        };
        animate();

        resizeObserver = new ResizeObserver(() => onResize());
        resizeObserver.observe(container);

      } catch (err) {
        console.error('Three.js failed to load', err);
        if (active) {
          setError(true);
          unavailableRef.current?.();
        }
      }
    }

    init();

    return () => {
      active = false;
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (renderer && currentContainer) {
        currentContainer.removeChild(renderer.domElement);
        if (scene) {
          scene.traverse((object: any) => {
            if (!object.isMesh && !object.isPoints) return;
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) object.material.forEach((m: any) => m.dispose());
              else object.material.dispose();
            }
          });
        }
        renderer.dispose();
        if (composer) composer.dispose();
      }
    };
  }, []);

  // Procedural Stands Generation
  useEffect(() => {
    if (!sceneRef.current || !standsGroupRef.current) return;
    const { THREE, uniforms } = sceneRef.current;
    const standsGroup = standsGroupRef.current;

    while (standsGroup.children.length > 0) {
      const child = standsGroup.children[0];
      standsGroup.remove(child);
    }


    // Neon glow material (Emissive for Bloom)
    const neonMat = new THREE.MeshStandardMaterial({ 
      color: '#10b981', 
      emissive: '#10b981', 
      emissiveIntensity: 2.0 
    });

    const createCurvedStand = (
      x: number, z: number,
      innerRadiusX: number,
      _thickness: number,
      thetaStart: number, thetaLength: number,
      level: number, hasWork: boolean
    ) => {
      const standGrp = new THREE.Group();
      standGrp.position.set(x, 0, z);

      const maxTiers = Math.min(4, Math.max(1, level));
      
      const standHeight = maxTiers * 4;
      const standDepth = maxTiers * 8;
      const radiusBottom = innerRadiusX;
      const radiusTop = innerRadiusX + standDepth;

      // Geometría principal de la grada (Pendiente Cónica)
      const standGeo = new THREE.CylinderGeometry(radiusTop, radiusBottom, standHeight, 64, maxTiers * 4, true, thetaStart, thetaLength);
      const standMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.9, side: THREE.DoubleSide });
      const standMesh = new THREE.Mesh(standGeo, standMat);
      standMesh.position.y = standHeight / 2;
      standMesh.castShadow = true;
      standMesh.receiveShadow = true;
      standGrp.add(standMesh);

      // Líneas horizontales para simular los escalones de cemento
      const stepMat = new THREE.MeshBasicMaterial({ color: '#1e293b' });
      for(let t=1; t<=maxTiers * 4; t++) {
        const stepR = radiusBottom + (standDepth * (t / (maxTiers * 4)));
        const stepH = standHeight * (t / (maxTiers * 4));
        const lineGeo = new THREE.TorusGeometry(stepR, 0.05, 4, 64, thetaLength);
        const lineMesh = new THREE.Mesh(lineGeo, stepMat);
        lineMesh.rotation.x = Math.PI / 2;
        lineMesh.rotation.z = thetaStart;
        lineMesh.position.y = stepH;
        standGrp.add(lineMesh);
      }

      const isOccupied = occupancyPct > 10;
      if (isOccupied) {
        // Público apoyado estrictamente sobre la pendiente
        const pointCount = Math.floor(4000 * maxTiers * (occupancyPct / 100));
        const pointsGeo = new THREE.BufferGeometry();
        const pArr = new Float32Array(pointCount * 3);
        const cArr = new Float32Array(pointCount * 3); 
        const phaseArr = new Float32Array(pointCount);
        
        // Colores base oscurecidos para evitar que el Bloom los convierta en un panel LED
        const teamColors = [new THREE.Color('#064e3b'), new THREE.Color('#334155'), new THREE.Color('#78350f')];
        
        for(let p=0; p<pointCount; p++) {
          const angle = thetaStart + Math.random() * thetaLength;
          const tPos = Math.pow(Math.random(), 0.8);
          const r = radiusBottom + tPos * standDepth;
          const h = tPos * standHeight;
          
          pArr[p*3] = Math.cos(angle) * r + (Math.random()-0.5)*0.3;
          pArr[p*3+1] = h + 0.2 + (Math.random()*0.3); // Y está hacia arriba
          pArr[p*3+2] = Math.sin(angle) * r + (Math.random()-0.5)*0.3;
          
          const col = teamColors[Math.floor(Math.random() * teamColors.length)];
          cArr[p*3] = col.r; cArr[p*3+1] = col.g; cArr[p*3+2] = col.b;
          
          phaseArr[p] = Math.random() * Math.PI * 2;
        }
        
        pointsGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
        pointsGeo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
        pointsGeo.setAttribute('phase', new THREE.BufferAttribute(phaseArr, 1));
        
        const shaderMat = new THREE.ShaderMaterial({
          uniforms: uniforms,
          vertexShader: `
            uniform float uTime;
            attribute vec3 color;
            attribute float phase;
            varying vec3 vColor;
            varying float vPhase;
            void main() {
              vColor = color;
              vPhase = phase;
              vec3 pos = position;
              // Sutil animación de salto
              pos.y += sin(uTime * 3.0 + phase) * 0.15;
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = 1.0 * (300.0 / -mvPosition.z);
            }
          `,
          fragmentShader: `
            uniform float uTime;
            varying vec3 vColor;
            varying float vPhase;
            void main() {
              vec2 xy = gl_PointCoord.xy - vec2(0.5);
              float ll = length(xy);
              if(ll > 0.5) discard;
              
              // Flash aleatorio con valor altísimo para forzar que SÓLO ESTO active el Bloom
              float flash = step(0.9995, fract(sin(uTime * 0.1 + vPhase) * 43758.5453));
              vec3 finalColor = mix(vColor, vec3(5.0, 5.0, 5.0), flash);
              
              gl_FragColor = vec4(finalColor, 1.0);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending
        });
        
        const crowd = new THREE.Points(pointsGeo, shaderMat);
        standGrp.add(crowd);
      }

      // Muro exterior
      const wallGeo = new THREE.CylinderGeometry(radiusTop, radiusTop, standHeight, 64, 1, true, thetaStart, thetaLength);
      const wallMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 1.0, side: THREE.DoubleSide });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.y = standHeight / 2;
      wall.castShadow = true;
      standGrp.add(wall);

      // Techo tensado moderno
      if (level > 0) {
        const roofInnerR = radiusBottom + 4;
        const roofOuterR = radiusTop + 2;
        const roofInnerH = standHeight + 1.5;
        const roofOuterH = standHeight + 4;
        
        const roofGeo = new THREE.CylinderGeometry(roofOuterR, roofInnerR, roofOuterH - roofInnerH, 64, 1, true, thetaStart, thetaLength);
        const roofMat = new THREE.MeshPhysicalMaterial({ 
          color: '#f8fafc', 
          metalness: 0.1, 
          roughness: 0.2,
          transmission: 0.3,
          ior: 1.5,
          side: THREE.DoubleSide
        });
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.y = (roofOuterH + roofInnerH) / 2;
        roofMesh.castShadow = true;
        standGrp.add(roofMesh);

        // Pilares de soporte
        const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 6, 8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });
        
        for (let j = 0; j <= 4; j++) {
          const bAngle = thetaStart + (thetaLength * (j / 4));
          const pMesh = new THREE.Mesh(pillarGeo, pillarMat);
          pMesh.position.set(Math.cos(bAngle) * (radiusTop - 1), standHeight + 2, Math.sin(bAngle) * (radiusTop - 1));
          pMesh.rotation.x = Math.PI / 12; // tilt slightly
          pMesh.castShadow = true;
          standGrp.add(pMesh);
        }

        // Anillo de neón en el borde interior del techo
        const neonGeo = new THREE.TorusGeometry(roofInnerR, 0.2, 16, 64, thetaLength);
        const neonMesh = new THREE.Mesh(neonGeo, neonMat);
        neonMesh.rotation.x = Math.PI / 2;
        neonMesh.rotation.z = thetaStart;
        neonMesh.position.y = roofInnerH;
        standGrp.add(neonMesh);
      }

      // Andamios para gradas en construcción
      if (hasWork) {
        const scafH = standHeight + 8;
        const scaffoldGeo = new THREE.CylinderGeometry(radiusBottom + 5, radiusBottom + 5, scafH, 32, 4, true, thetaStart, thetaLength);
        const scaffoldMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', wireframe: true, transparent: true, opacity: 0.6 });
        const scaffold = new THREE.Mesh(scaffoldGeo, scaffoldMat);
        scaffold.position.y = scafH / 2;
        standGrp.add(scaffold);

        const craneBaseGeo = new THREE.BoxGeometry(1, scafH + 5, 1);
        const craneArmGeo = new THREE.BoxGeometry(20, 0.8, 0.8);
        const craneMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.5, roughness: 0.5 });
        
        const craneBase = new THREE.Mesh(craneBaseGeo, craneMat);
        const cx = Math.cos(thetaStart + thetaLength/2) * (radiusBottom + 10);
        const cz = Math.sin(thetaStart + thetaLength/2) * (radiusBottom + 10);
        craneBase.position.set(cx, (scafH + 5)/2, Math.abs(cz) * (cz > 0 ? 1 : -1)); 
        
        const craneArm = new THREE.Mesh(craneArmGeo, craneMat);
        craneArm.position.set(0, (scafH + 5)/2 - 1, 8);
        craneArm.rotation.y = Math.PI / 4;
        craneBase.add(craneArm);
        
        standGrp.add(craneBase);
      }

      standsGroup.add(standGrp);
    };

    const parsedWorks = works || [];
    const isWorking = (type: string, slot: number) => parsedWorks.some((w: any) => w.type === type || w.type === `${type}:${slot}`);

    const rad = 36;
    const thick = 7;

    createCurvedStand(0, 0, rad, thick, -Math.PI/4, Math.PI/2, levels.sur, isWorking('seats', 1));
    createCurvedStand(0, 0, rad, thick, Math.PI/4, Math.PI/2, levels.preferencia, isWorking('seats', 2));
    createCurvedStand(0, 0, rad, thick, 3*Math.PI/4, Math.PI/2, levels.norte, isWorking('seats', 0));
    createCurvedStand(0, 0, rad, thick, 5*Math.PI/4, Math.PI/2, levels.lateral, isWorking('seats', 3));

    // Giant Screens with Emissive bloom
    const screenGeo = new THREE.BoxGeometry(20, 10, 1.5);
    
    const scCnv = document.createElement('canvas');
    scCnv.width = 1024; scCnv.height = 512;
    const sctx = scCnv.getContext('2d')!;
    sctx.fillStyle = '#020617'; sctx.fillRect(0,0,1024,512);
    sctx.strokeStyle = '#10b981'; sctx.lineWidth = 16; sctx.strokeRect(8,8,1008,496);
    sctx.fillStyle = '#10b981'; sctx.font = 'bold 160px "Inter", monospace'; sctx.textAlign = 'center';
    sctx.fillText('FDF', 512, 240);
    sctx.fillStyle = '#ffffff'; sctx.font = '60px "Inter", monospace';
    sctx.fillText('MANAGER PRO', 512, 340);
    const screenTex = new THREE.CanvasTexture(scCnv);

    const screenMat = new THREE.MeshStandardMaterial({ 
      map: screenTex, 
      emissive: '#ffffff', 
      emissiveMap: screenTex,
      emissiveIntensity: 1.5, 
      roughness: 0.2, 
      metalness: 0.8 
    });
    const screenBackMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.9 });
    const materials = [screenBackMat, screenBackMat, screenBackMat, screenBackMat, screenMat, screenBackMat];
    
    const s1 = new THREE.Mesh(screenGeo, materials);
    s1.position.set(-rad - 12, 28, 0);
    s1.rotation.y = Math.PI / 2;
    standsGroup.add(s1);

    const s2 = new THREE.Mesh(screenGeo, materials);
    s2.position.set(rad + 12, 28, 0);
    s2.rotation.y = -Math.PI / 2;
    standsGroup.add(s2);

  }, [levels.norte, levels.sur, levels.preferencia, levels.lateral, works, occupancyPct]);

  if (error) {
    return <div className="p-8 text-center text-[var(--red-danger)]">{t('gameplay:stadium3d.loadError')}</div>;
  }

  return (
    <div className="relative w-full aspect-video min-h-[400px] bg-[var(--bg-elevated)] rounded-xl overflow-hidden border border-[var(--border-color)] shadow-2xl">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-surface)] z-10">
          <Loader2 size={32} className="animate-spin text-[var(--green-primary)]" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Vistas superpuestas holográficas */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="text-[10px] text-[var(--green-primary)] uppercase tracking-widest font-bold drop-shadow">{t('gameplay:stadium3d.architecture')}</div>
        <div className="text-[var(--text-primary)] font-display font-black text-xl tracking-wider drop-shadow-lg">{t('gameplay:stadium3d.title')}</div>
      </div>
    </div>
  );
}
