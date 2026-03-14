import { getSystemComponents } from './app_state.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let diagramSettings = {
    colorMode: 'default',
    labels: {
        name: true,
        dim: false,
        flow: false,
        vel: false,
        press: false,
        pam: false,
        temp: false
    },
    textSettingsExpanded: false, 
    effectsSettingsExpanded: false, // NY: Holder styr på om effekter er klappet ud
    animateFlow: false,          
    showInsulation: false,       
    threshold: 0
};

// Global flow tekstur til animationsloopet
let globalFlowTexture = null;

// Global update function for checkboxes and selects
window.updateDiagramSettings = () => {
    const colorMode = document.getElementById('diagramColorMode');
    if (colorMode) diagramSettings.colorMode = colorMode.value;

    const check = (id) => document.getElementById(id)?.checked || false;
    
    diagramSettings.labels.name = check('lbl_name');
    diagramSettings.labels.dim = check('lbl_dim');
    diagramSettings.labels.flow = check('lbl_flow');
    diagramSettings.labels.vel = check('lbl_vel');
    diagramSettings.labels.press = check('lbl_press');
    diagramSettings.labels.pam = check('lbl_pam');
    diagramSettings.labels.temp = check('lbl_temp');
    
    diagramSettings.animateFlow = check('chk_anim_flow');
    diagramSettings.showInsulation = check('chk_show_iso');

    const allChecked = Object.values(diagramSettings.labels).every(val => val);
    const lblAll = document.getElementById('lbl_all');
    if (lblAll) lblAll.checked = allChecked;

    renderDiagram(true);
};

window.toggleAllLabels = (checkbox) => {
    const isChecked = checkbox.checked;
    const cbList = ['lbl_name', 'lbl_dim', 'lbl_flow', 'lbl_vel', 'lbl_press', 'lbl_pam', 'lbl_temp'];
    cbList.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = isChecked;
    });
    window.updateDiagramSettings();
};

window.toggleTextSettings = () => {
    diagramSettings.textSettingsExpanded = !diagramSettings.textSettingsExpanded;
    const content = document.getElementById('textSettingsContent');
    const icon = document.getElementById('textSettingsIcon');
    if (content && icon) {
        content.style.display = diagramSettings.textSettingsExpanded ? 'block' : 'none';
        icon.innerText = diagramSettings.textSettingsExpanded ? '▼' : '▶';
    }
};

window.toggleEffectsSettings = () => {
    diagramSettings.effectsSettingsExpanded = !diagramSettings.effectsSettingsExpanded;
    const content = document.getElementById('effectsSettingsContent');
    const icon = document.getElementById('effectsSettingsIcon');
    if (content && icon) {
        content.style.display = diagramSettings.effectsSettingsExpanded ? 'block' : 'none';
        icon.innerText = diagramSettings.effectsSettingsExpanded ? '▼' : '▶';
    }
};

// Colors
function getColorByValue(val, mode, min, max) {
    if (mode === 'default' || mode === 'wireframe') return 0x00E4FF; 

    let range = max - min;
    if (range <= 0) range = 1;
    let t = Math.max(0, Math.min(1, (val - min) / range));

    let r, g, b;
    if (mode === 'temperature') {
        if (t < 0.33) {
            const p = t / 0.33;
            r = 0; g = Math.round(150 * p); b = 255;
        } else if (t < 0.66) {
            const p = (t - 0.33) / 0.33;
            r = Math.round(255 * p); g = Math.round(150 + 105 * p); b = Math.round(255 * (1 - p));
        } else {
            const p = (t - 0.66) / 0.34;
            r = 255; g = Math.round(255 * (1 - p)); b = 0;
        }
    } else {
        if (t < 0.5) {
            const p = t * 2;
            r = 0; g = Math.round(255 * p); b = Math.round(255 * (1 - p));
        } else {
            const p = (t - 0.5) * 2;
            r = Math.round(255 * p); g = Math.round(255 * (1 - p)); b = 0;
        }
    }

    return (r << 16) | (g << 8) | b;
}

function getColor(comp, mode, min, max) {
    if (mode === 'critical') {
        return comp.state?.isCriticalPath ? 0xFF0055 : 0x3a7bd5; 
    }

    let val = 0;
    if (mode === 'velocity') val = comp.state?.velocity || 0;
    else if (mode === 'pressure') val = comp.type === 'straightDuct' ? (comp.state?.calculationDetails?.pressureDrop || 0) : 0;
    else if (mode === 'temperature') val = comp.state?.temperature_out?.outlet || comp.state?.temperature_out?.outlet_straight || comp.state?.temperature_in || 20;

    return getColorByValue(val, mode, min, max);
}

// Global 3D States
let scene, camera, renderer, controls;
let labelsMap = new Map(); 
let materialCache = {}; 
let currentlyHighlightedMeshes = []; 

let axesScene, axesCamera, axesRenderer;
let labelX, labelY, labelZ;

// --- VISUEL FOKUS MODE (HOVER LOGIK) ---
window.highlight3DComponent = (id) => {
    if (!scene) return;
    window.reset3DHighlight(); 
    scene.traverse((child) => {
        if (child.isMesh && child.userData.compId != null) {
            child.userData.originalMaterial = child.material;
            child.material = child.material.clone(); 

            if (String(child.userData.compId) === String(id)) {
                child.material.emissive.setHex(0x39FF14); 
                child.material.emissiveIntensity = 0.6;
                child.material.transparent = false;
                child.material.wireframe = false;
                child.material.opacity = 1.0;
            } else {
                child.material.transparent = true;
                child.material.opacity = 0.15;
                child.material.wireframe = true;
            }
            currentlyHighlightedMeshes.push(child);
        }
    });
};

window.reset3DHighlight = () => {
    currentlyHighlightedMeshes.forEach(mesh => {
        if (mesh.userData.originalMaterial) {
            mesh.material.dispose(); 
            mesh.material = mesh.userData.originalMaterial;
        }
    });
    currentlyHighlightedMeshes = [];
};


export function toggleDiagramView() {
    const container = document.getElementById('systemDiagramContainer');
    const tableContainer = document.getElementById('systemComponentsContainer');
    const totalPressureDropContainer = document.getElementById('totalPressureDropContainer');
    const toggleBtn = document.getElementById('toggleViewBtn');
    const diagControls = document.getElementById('diagramControls');

    container.classList.toggle('active');

    if (container.classList.contains('active')) {
        if (tableContainer) tableContainer.style.display = 'none';
        if (totalPressureDropContainer) totalPressureDropContainer.style.display = 'none';
        container.style.display = 'block';
        toggleBtn.innerHTML = '<i class="fas fa-list"></i> Vis Tabel';
        if (diagControls) diagControls.classList.remove('hidden');
        renderDiagram();
    } else {
        if (tableContainer) tableContainer.style.display = 'block';
        if (totalPressureDropContainer) totalPressureDropContainer.style.display = 'block';
        container.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Vis Diagram';
        if (diagControls) diagControls.classList.add('hidden');
    }
}

export function renderDiagram(keepControls = false) {
    const container = document.getElementById('systemDiagramContainer');
    if (!container) return;

    const isDesktop = document.body.classList.contains('desktop-mode');

    function createTransitionGeometry(shape1, w1, h1, r1, shape2, w2, h2, r2, length_3d) {
        const segments = 64; 
        const positions = [];
        const indices = [];
        const uvs = [];

        function getProfilePoint(shape, w, h, r, theta) {
            if (shape === 'round' || shape === 'circular') {
                return { x: r * Math.cos(theta), z: r * Math.sin(theta) };
            } else {
                const dx = Math.cos(theta);
                const dz = Math.sin(theta);
                const tx = Math.abs(dx) < 1e-6 ? Infinity : Math.abs((w / 2) / dx);
                const tz = Math.abs(dz) < 1e-6 ? Infinity : Math.abs((h / 2) / dz);
                const t = Math.min(tx, tz);
                return { x: t * dx, z: t * dz };
            }
        }

        const halfL = length_3d / 2;
        const collar_3d = 50 * (100 / 1000); 
        const effective_collar = Math.min(collar_3d, length_3d / 3);
        
        const rings = [
            { y: -halfL,                    shape: shape1, w: w1, h: h1, r: r1, v: 0 },
            { y: -halfL + effective_collar, shape: shape1, w: w1, h: h1, r: r1, v: 0.2 },
            { y: halfL - effective_collar,  shape: shape2, w: w2, h: h2, r: r2, v: 0.8 },
            { y: halfL,                     shape: shape2, w: w2, h: h2, r: r2, v: 1 }
        ];

        rings.forEach((ring) => {
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                const pt = getProfilePoint(ring.shape, ring.w, ring.h, ring.r, theta);
                positions.push(pt.x, ring.y, pt.z);
                uvs.push(i / segments, ring.v);
            }
        });

        const vertsPerRing = segments + 1;
        for (let r = 0; r < 3; r++) { 
            for (let i = 0; i < segments; i++) {
                const a = r * vertsPerRing + i;
                const b = r * vertsPerRing + i + 1;
                const c = (r + 1) * vertsPerRing + i;
                const d = (r + 1) * vertsPerRing + i + 1;

                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        return geom;
    }

    const fullState = window.stateManager ? window.stateManager.state : { systemComponents: [] };
    const components = fullState.systemComponents || getSystemComponents();
    const isExhaust = fullState.systemType === 'merging';

    if (components.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#666;">Ingen komponenter at vise i 3D.</p>';
        return;
    }

    let webglContainer = document.getElementById('diagramWebglContainer');

    if (!webglContainer || !renderer) {
        container.style.position = 'relative';
        
        container.innerHTML = `
            <div id="diagramOverlayControls" class="diagram-overlay-container" style="position:absolute; top:10px; right:10px; z-index:100; background:rgba(0,0,0,0.8); padding:10px; border-radius:8px; border:1px solid var(--border-color); color:white; width:33%; max-width:200px; box-sizing: border-box;">
                 
                 <button class="button secondary" style="width:100%; margin-bottom:12px; padding:6px; font-size:0.85rem; background: rgba(255,255,255,0.1); color:white; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor:pointer; transition: all 0.2s;" onclick="window.zoomAllDiagram()" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fas fa-expand"></i> Zoom Alt</button>
                 
                 <div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 4px; color: var(--text-muted-color); text-transform: uppercase; text-align: left;">Visualisering:</div>
                 <select id="diagramColorMode" class="input-field" style="width:100%;font-size:0.8rem; padding:4px; margin-bottom: 12px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;" onchange="window.updateDiagramSettings()">
                    <option value="default" style="background: #111; color: white;" ${diagramSettings.colorMode === 'default' ? 'selected' : ''}>Standard</option>
                    <option value="velocity" style="background: #111; color: white;" ${diagramSettings.colorMode === 'velocity' ? 'selected' : ''}>Hastighed (m/s)</option>
                    <option value="pressure" style="background: #111; color: white;" ${diagramSettings.colorMode === 'pressure' ? 'selected' : ''}>Tryktab (Pa/m)</option>
                    <option value="temperature" style="background: #111; color: white;" ${diagramSettings.colorMode === 'temperature' ? 'selected' : ''}>Temperatur (°C)</option>
                    <option value="critical" style="background: #111; color: white;" ${diagramSettings.colorMode === 'critical' ? 'selected' : ''}>Kritisk Vej</option>
                    <option value="wireframe" style="background: #111; color: white;" ${diagramSettings.colorMode === 'wireframe' ? 'selected' : ''}>Trådmodel (X-Ray)</option>
                 </select>

                 <!-- Foldbar Effekter -->
                 <div style="margin-bottom: 12px;">
                     <div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 4px; color: var(--text-muted-color); text-transform: uppercase; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 2px 0; text-align: left;" onclick="window.toggleEffectsSettings()">
                        <span>Effekter</span>
                        <span id="effectsSettingsIcon">${diagramSettings.effectsSettingsExpanded ? '▼' : '▶'}</span>
                     </div>
                     
                     <div id="effectsSettingsContent" style="background: rgba(0,0,0,0.4); padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: ${diagramSettings.effectsSettingsExpanded ? 'block' : 'none'};">
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="chk_anim_flow" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.animateFlow ? 'checked' : ''}> Animeret Flow
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; cursor: pointer; color: white;">
                            <input type="checkbox" id="chk_show_iso" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.showInsulation ? 'checked' : ''}> Vis Isolering
                         </label>
                     </div>
                 </div>
                 
                 <!-- Foldbar Tekstvisning -->
                 <div>
                     <div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 4px; color: var(--text-muted-color); text-transform: uppercase; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 2px 0; text-align: left;" onclick="window.toggleTextSettings()">
                        <span>Tekstvisning</span>
                        <span id="textSettingsIcon">${diagramSettings.textSettingsExpanded ? '▼' : '▶'}</span>
                     </div>
                     
                     <div id="textSettingsContent" style="background: rgba(0,0,0,0.4); padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: ${diagramSettings.textSettingsExpanded ? 'block' : 'none'};">
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_name" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.name ? 'checked' : ''}> Navn
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_dim" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.dim ? 'checked' : ''}> Dimension
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_flow" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.flow ? 'checked' : ''}> Luftmængde
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_vel" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.vel ? 'checked' : ''}> Hastighed
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_press" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.press ? 'checked' : ''}> Total Tryktab (Pa)
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_pam" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.pam ? 'checked' : ''}> Tryktab (Pa/m)
                         </label>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; margin-bottom: 4px; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_temp" style="margin-right: 6px; cursor: pointer;" onchange="window.updateDiagramSettings()" ${diagramSettings.labels.temp ? 'checked' : ''}> Temperatur
                         </label>
                         <div style="height: 1px; background: rgba(255,255,255,0.2); margin: 6px 0;"></div>
                         <label style="display: flex; align-items: center; font-size: 0.75rem; cursor: pointer; color: white;">
                            <input type="checkbox" id="lbl_all" style="margin-right: 6px; cursor: pointer;" onchange="window.toggleAllLabels(this)" ${Object.values(diagramSettings.labels).every(v=>v) ? 'checked' : ''}> <strong>Vis alt</strong>
                         </label>
                     </div>
                 </div>
            </div>
            <div id="diagramAxesContainer" style="position:absolute; bottom:20px; right:20px; width:80px; height:80px; z-index:90; pointer-events:none; display:none;"></div>
            <div id="diagramLegend" style="position:absolute; bottom:20px; left:20px; z-index:100; background:rgba(0,0,0,0.8); padding:10px; border-radius:8px; color:white; font-size: 0.8rem; display: none;">
            </div>
            <div id="diagramWebglContainer" style="width:100%; height:100%; min-height: 500px; background:#111;"></div>
            <div id="diagramLabels" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:50;"></div>
        `;
        webglContainer = document.getElementById('diagramWebglContainer');

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a24);

        camera = new THREE.PerspectiveCamera(45, webglContainer.clientWidth / webglContainer.clientHeight, 0.1, 10000);
        camera.position.set(0, 0, 800);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(webglContainer.clientWidth, webglContainer.clientHeight);
        webglContainer.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 1, 1);
        scene.add(dirLight);

        // -- Opsætning af XYZ HUD --
        const axesContainer = document.getElementById('diagramAxesContainer');
        if (axesContainer && !axesRenderer) {
            axesScene = new THREE.Scene();
            axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
            
            axesRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            axesRenderer.setSize(80, 80);
            axesContainer.appendChild(axesRenderer.domElement);

            const arrowLen = 30;
            const headLen = 10;
            const headW = 6;
            axesScene.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0), arrowLen, 0xFF0055, headLen, headW)); // X - Pink
            axesScene.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), arrowLen, 0x39FF14, headLen, headW)); // Y - Grøn
            axesScene.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,0), arrowLen, 0x00E4FF, headLen, headW)); // Z - Blå

            const createLabel = (txt, color) => {
                const el = document.createElement('div');
                el.innerText = txt;
                el.style.position = 'absolute';
                el.style.color = color;
                el.style.fontSize = '12px';
                el.style.fontFamily = 'monospace';
                el.style.fontWeight = 'bold';
                el.style.textShadow = '1px 1px 2px #000, -1px -1px 2px #000';
                el.style.transform = 'translate(-50%, -50%)';
                axesContainer.appendChild(el);
                return el;
            };
            labelX = createLabel('X', '#FF0055');
            labelY = createLabel('Y', '#39FF14');
            labelZ = createLabel('Z', '#00E4FF');
        }

        const animate = function () {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
            updateLabels();

            // NYT: Animér det strømmende luft INDIVIDUELT baseret på hastighed!
            if (diagramSettings.animateFlow) {
                Object.values(materialCache).forEach(mat => {
                    if (mat.emissiveMap && mat.userData && mat.userData.velocity !== undefined) {
                        // Dynamisk Hastighed!
                        // Før var multiplikatoren 0.004. Nu skruer vi op for at tydeliggøre forskel på lav og høj hastighed.
                        const speed = 0.002 + (mat.userData.velocity * 0.012);
                        mat.emissiveMap.offset.y -= speed;
                        mat.emissiveMap.offset.x -= speed; 
                    }
                });
            }

            const isDesktopModeNow = document.body.classList.contains('desktop-mode');
            const axesCont = document.getElementById('diagramAxesContainer');
            if (axesCont) {
                axesCont.style.display = isDesktopModeNow ? 'block' : 'none';
            }

            if (axesRenderer && axesScene && axesCamera && isDesktopModeNow) {
                axesCamera.position.copy(camera.position).sub(controls.target);
                axesCamera.position.setLength(100);
                axesCamera.lookAt(axesScene.position);
                axesRenderer.render(axesScene, axesCamera);

                const updateL = (lbl, vec) => {
                    const v = vec.clone().project(axesCamera);
                    lbl.style.left = `${(v.x * 0.5 + 0.5) * 80}px`;
                    lbl.style.top = `${(v.y * -0.5 + 0.5) * 80}px`;
                };
                updateL(labelX, new THREE.Vector3(38, 0, 0));
                updateL(labelY, new THREE.Vector3(0, 38, 0));
                updateL(labelZ, new THREE.Vector3(0, 0, 38));
            }
        };
        animate();

        window.addEventListener('resize', () => {
            if (webglContainer && webglContainer.clientWidth > 0 && webglContainer.clientHeight > 0) {
                camera.aspect = webglContainer.clientWidth / webglContainer.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(webglContainer.clientWidth, webglContainer.clientHeight);
            }
        });

        // --- RAYCASTER ---
        const canvas = renderer.domElement; 
        let pointerDownPos = { x: 0, y: 0 };
        let isDragging = false;

        canvas.addEventListener('pointerdown', (e) => {
            pointerDownPos.x = e.clientX;
            pointerDownPos.y = e.clientY;
            isDragging = false;
        });

        canvas.addEventListener('pointermove', (e) => {
            const dx = Math.abs(e.clientX - pointerDownPos.x);
            const dy = Math.abs(e.clientY - pointerDownPos.y);
            if (dx > 5 || dy > 5) isDragging = true;
        });
        
        canvas.addEventListener('pointerup', (e) => {
            if (isDragging) return;

            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObjects(scene.children, true);

            for (let i = 0; i < intersects.length; i++) {
                const obj = intersects[i].object;
                if (obj.userData && obj.userData.compId != null) {
                    const compId = String(obj.userData.compId);
                    
                    if (e.button === 0) {
                        if (window.highlightTableRow) window.highlightTableRow(compId); 
                    } else if (e.button === 2 && document.body.classList.contains('desktop-mode')) {
                        if (window.highlightTableRow) window.highlightTableRow(compId);
                        if (window.highlight3DComponent) window.highlight3DComponent(compId);

                        let hudMenu = document.getElementById('hudContextMenu');
                        if (hudMenu) hudMenu.remove(); 

                        hudMenu = document.createElement('div');
                        hudMenu.id = 'hudContextMenu';
                        hudMenu.className = 'hud-context-menu'; 
                        
                        const comp = window.stateManager ? window.stateManager.getSystemComponent(compId) : { name: "Ukendt", state: {} };
                        const velocity = comp.state?.velocity ? comp.state.velocity.toFixed(2) : '-';
                        const pressure = comp.state?.pressureLoss ? comp.state.pressureLoss.toFixed(2) : '-';
                        const airflow = comp.state?.airflow_in || comp.airflow || 0;
                        const shortId = compId.split('_')[1] || compId.substring(0,4);

                        const splitBtnHtml = comp.type === 'straightDuct' 
                            ? `<button class="hud-btn" style="padding: 6px 10px; font-size: 0.8rem; opacity: 0.3; pointer-events: none; filter: grayscale(1);">
                                   <span>✂️</span> Split kanal
                               </button>`
                            : '';
                            
                        let extraDataHtml = '';
                        if (comp.type === 'straightDuct') {
                            const length = comp.properties?.length ? parseFloat(comp.properties.length).toFixed(2) : '-';
                            const dpPerMeter = comp.state?.calculationDetails?.pressureDrop ? comp.state.calculationDetails.pressureDrop.toFixed(2) : '-';
                            
                            extraDataHtml = `
                                <div>Længde:</div> <span>${length} m</span>
                                <div>Tryktab:</div> <span>${dpPerMeter} Pa/m</span>
                            `;
                        }

                        hudMenu.innerHTML = `
                            <div class="hud-header" style="font-size: 0.95rem; padding-bottom: 5px; margin-bottom: 5px;">
                                <strong>${comp.name}</strong>
                                <span class="hud-id" style="font-size: 0.7rem;">#${shortId}</span>
                            </div>
                            <div class="hud-data" style="font-size: 0.8rem; margin-bottom: 8px;">
                                <div>Flow:</div> <span>${Math.round(airflow)} m³/h</span>
                                <div>Hast.:</div> <span>${velocity} m/s</span>
                                ${extraDataHtml}
                                <div>Total Tab:</div> <span>${pressure} Pa</span>
                            </div>
                            <div class="hud-actions" style="gap: 4px;">
                                <button class="hud-btn" style="padding: 6px 10px; font-size: 0.8rem;" onclick="window.showSystemComponentDetails('${compId}'); document.getElementById('hudContextMenu').remove();">
                                    <span>ℹ️</span> Detaljer
                                </button>
                                <button class="hud-btn" style="padding: 6px 10px; font-size: 0.8rem;" onclick="window.showEditForm('${compId}'); document.getElementById('hudContextMenu').remove();">
                                    <span>✏️</span> Rediger
                                </button>
                                <button class="hud-btn" style="padding: 6px 10px; font-size: 0.8rem; opacity: 0.3; pointer-events: none; filter: grayscale(1);">
                                    <span>➕</span> Tilføj
                                </button>
                                ${splitBtnHtml}
                            </div>
                        `;

                        document.body.appendChild(hudMenu);

                        hudMenu.style.left = `${e.clientX}px`;
                        hudMenu.style.top = `${e.clientY}px`;
                        hudMenu.style.width = '200px'; 
                        
                        setTimeout(() => {
                            hudMenu.classList.add('active');
                        }, 10);

                        setTimeout(() => {
                            const closeMenu = (eClick) => {
                                if (!hudMenu.contains(eClick.target)) {
                                    hudMenu.remove();
                                    document.removeEventListener('click', closeMenu);
                                    document.removeEventListener('contextmenu', closeMenu);
                                }
                            };
                            document.addEventListener('click', closeMenu);
                            document.addEventListener('contextmenu', closeMenu);
                        }, 50);

                    }
                    break;
                }
            }
        });

        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault(); 
        });
    }
    
    // Generer den basis-tekstur, vi vil klone
    if (diagramSettings.animateFlow && !globalFlowTexture) {
        const flowCanvas = document.createElement('canvas');
        flowCanvas.width = 64;
        flowCanvas.height = 64;
        const ctx = flowCanvas.getContext('2d');
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(16, 48);
        ctx.lineTo(32, 16);
        ctx.lineTo(48, 48);
        ctx.lineTo(32, 40);
        ctx.fill();
        
        globalFlowTexture = new THREE.CanvasTexture(flowCanvas);
        globalFlowTexture.wrapS = THREE.RepeatWrapping;
        globalFlowTexture.wrapT = THREE.RepeatWrapping;
        globalFlowTexture.repeat.set(2, 4); 
    } else if (!diagramSettings.animateFlow && globalFlowTexture) {
        globalFlowTexture.dispose();
        globalFlowTexture = null;
    }

    webglContainer = document.getElementById('diagramWebglContainer');
    if (webglContainer && renderer && camera && webglContainer.clientWidth > 0 && webglContainer.clientHeight > 0) {
        camera.aspect = webglContainer.clientWidth / webglContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(webglContainer.clientWidth, webglContainer.clientHeight);
    }

    // RYDER OP (Husk at slette klonede teksturer)
    window.reset3DHighlight(); 
    for (let i = scene.children.length - 1; i >= 0; i--) {
        let obj = scene.children[i];
        if (obj.type === "Mesh" || obj.type === "Line" || obj.type === "Group" || obj.type === "ArrowHelper") {
            scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (!Object.values(materialCache).includes(obj.material)) {
                    if (obj.material.map && obj.material.map !== globalFlowTexture) obj.material.map.dispose();
                    if (obj.material.emissiveMap && obj.material.emissiveMap !== globalFlowTexture) obj.material.emissiveMap.dispose();
                    obj.material.dispose();
                }
            }
        }
    }

    const labelsContainer = document.getElementById('diagramLabels');
    labelsContainer.innerHTML = '';
    labelsMap.clear();

    let maxV = -Infinity, minV = Infinity, maxP = -Infinity, minP = Infinity, maxT = -Infinity, minT = Infinity;
    components.forEach(c => {
        let v = c.state?.velocity || 0;
        let pDrop = c.type === 'straightDuct' ? (c.state?.calculationDetails?.pressureDrop || 0) : 0;
        let t_in = c.state?.temperature_in !== undefined ? c.state.temperature_in : 20;
        let t_out = c.state?.temperature_out?.outlet || c.state?.temperature_out?.outlet_straight || t_in;
        if (v > maxV) maxV = v; if (v < minV) minV = v;
        if (pDrop > maxP) maxP = pDrop; if (pDrop < minP) minP = pDrop;
        if (t_in > maxT) maxT = t_in; if (t_in < minT) minT = t_in;
        if (t_out > maxT) maxT = t_out; if (t_out < minT) minT = t_out;
    });
    if (maxV === -Infinity) { maxV = 10; minV = 0; }
    if (maxP === -Infinity) { maxP = 2; minP = 0; }
    if (maxT === -Infinity) { maxT = 30; minT = 5; }
    let currentMin = diagramSettings.colorMode === 'velocity' ? minV : (diagramSettings.colorMode === 'pressure' ? minP : minT);
    let currentMax = diagramSettings.colorMode === 'velocity' ? maxV : (diagramSettings.colorMode === 'pressure' ? maxP : maxT);

    const legendContainer = document.getElementById('diagramLegend');
    if (legendContainer) {
        if (diagramSettings.colorMode === 'default' || diagramSettings.colorMode === 'wireframe') {
            legendContainer.style.display = 'none';
        } else if (diagramSettings.colorMode === 'critical') {
            legendContainer.style.display = 'block';
            legendContainer.innerHTML = `
                <div style="display: flex; align-items: center; font-weight: bold;">
                    <div style="width: 15px; height: 15px; background-color: #FF0055; margin-right: 8px; border-radius: 3px;"></div>
                    Kritisk Vej (Højeste Tryktab)
                </div>
            `;
        } else {
            legendContainer.style.display = 'block';
            let title = '';
            let unit = '';
            let gradientCss = '';

            if (diagramSettings.colorMode === 'temperature') {
                title = 'Temperatur';
                unit = '°C';
                gradientCss = 'linear-gradient(to right, #0096FF, #00FF00, #FFFF00, #FF0000)';
            } else if (diagramSettings.colorMode === 'velocity') {
                title = 'Lufthastighed';
                unit = 'm/s';
                gradientCss = 'linear-gradient(to right, #0000FF, #00FF00, #FF0000)';
            } else if (diagramSettings.colorMode === 'pressure') {
                title = 'Tryktab (Kanaler)';
                unit = 'Pa/m';
                gradientCss = 'linear-gradient(to right, #0000FF, #00FF00, #FF0000)';
            }

            legendContainer.innerHTML = `
                <div style="margin-bottom: 5px; font-weight: bold;">${title}</div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>${currentMin.toFixed(1)} ${unit}</span>
                    <span>${currentMax.toFixed(1)} ${unit}</span>
                </div>
                <div style="width: 200px; height: 10px; background: ${gradientCss}; border-radius: 5px;"></div>
            `;
        }
    }

    const createGradientTexture = (colorHexStart, colorHexEnd) => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        gradient.addColorStop(0, `#${colorHexStart.toString(16).padStart(6, '0')} `);
        gradient.addColorStop(1, `#${colorHexEnd.toString(16).padStart(6, '0')} `);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    // OPGRADERET: Grupperer materialer efter hastighed!
    const getMaterial = (comp, isIncluded) => {
        const mode = diagramSettings.colorMode;
        let colorHexStart = 0x777777;
        let colorHexEnd = 0x777777;
        let useGradient = false;
        let isGhosted = !isIncluded;
        let isWireframe = false;
        
        const vel = comp.state?.velocity || 0;
        // Skruer op for præcisionen (0.1 intervaller) for at animationen ikke samles i for brede kasser
        const velKey = diagramSettings.animateFlow ? Math.round(vel * 10) : 0;

        if (isIncluded) {
            colorHexStart = getColor(comp, mode, currentMin, currentMax);
            colorHexEnd = colorHexStart;

            if (mode === 'critical' && !comp.state?.isCriticalPath) {
                isGhosted = true;
            } else if (mode === 'wireframe') {
                isWireframe = true;
            }

            if (mode === 'temperature' && comp.state?.temperature_in !== undefined) {
                const tIn = comp.state.temperature_in;
                const tOut = comp.state.temperature_out?.outlet || comp.state.temperature_out?.outlet_straight || tIn;
                if (Math.abs(tIn - tOut) > 0.01) {
                    colorHexStart = getColorByValue(tIn, mode, currentMin, currentMax);
                    colorHexEnd = getColorByValue(tOut, mode, currentMin, currentMax);
                    useGradient = true;
                }
            }
        }

        const key = `${colorHexStart}_${colorHexEnd}_${isGhosted}_${useGradient}_${isWireframe}_${diagramSettings.animateFlow}_${velKey}`;
        
        if (!materialCache[key]) {
            const matParams = {
                transparent: isGhosted || isWireframe,
                opacity: isGhosted ? 0.3 : (isWireframe ? 0.2 : 1.0),
                roughness: 0.3,
                metalness: 0.1,
                side: THREE.DoubleSide
            };
            
            if (isWireframe) {
                matParams.wireframe = true;
            }

            if (useGradient) {
                matParams.map = createGradientTexture(colorHexStart, colorHexEnd);
                matParams.color = 0xffffff;
            } else {
                matParams.color = colorHexStart;
            }
            
            // KLONER TEKSTUREN: Så hvert rør/hastighed kan rykkes uafhængigt
            if (diagramSettings.animateFlow && globalFlowTexture) {
                matParams.emissiveMap = globalFlowTexture.clone();
                matParams.emissiveMap.needsUpdate = true;
                matParams.emissive = new THREE.Color(0xffffff);
                matParams.emissiveIntensity = 0.5;
            }
            
            const newMat = new THREE.MeshStandardMaterial(matParams);
            // Gem hastigheden i selve materialet, så animate() kender den!
            newMat.userData = { velocity: vel }; 
            
            materialCache[key] = newMat;
        }
        return materialCache[key];
    };

    const PIXELS_PER_METER = 100;
    let bMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    let bMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    function drawTree3D(comp, currentPos, currentDir, upDir) {
        if (!comp) return;

        const isIncluded = comp.isIncluded !== false;
        const baseMaterial = getMaterial(comp, isIncluded);

        let material = baseMaterial;
        
        // Når vi tegner komponenten, roterer vi teksturen så den passer med komponenten
        if (baseMaterial.map || baseMaterial.emissiveMap) {
            material = baseMaterial.clone();
            
            if (baseMaterial.map) material.map = baseMaterial.map.clone();
            if (baseMaterial.emissiveMap) material.emissiveMap = baseMaterial.emissiveMap; // Emissive deles per hastigheds-gruppe

            if (comp.type === 'straightDuct' || comp.type.includes('transition') || comp.type === 'expansion' || comp.type === 'contraction' || comp.type.includes('tee')) {
                if (material.map) { material.map.rotation = Math.PI / 2; material.map.center.set(0.5, 0.5); }
            } else if (comp.type.startsWith('bend')) {
                if (material.map) material.map.rotation = 0;
            }
        }

        let isRect = false;
        let diameterMm = 200;
        let widthMm = 200;
        let heightMm = 200;

        const dim = comp.state?.inletDimension || comp.state?.outletDimension?.outlet || comp.state?.outletDimension?.straight || comp.state?.outletDimension?.outlet_path1;
        if (dim) {
            if (dim.shape === 'rectangular' || dim.shape === 'rect') {
                isRect = true;
                widthMm = dim.w || dim.sideB || 200;
                heightMm = dim.h || dim.sideA || 200;
            } else {
                diameterMm = dim.d || dim.diameter || 200;
            }
        }

        const radius3D = (diameterMm / 1000) * PIXELS_PER_METER / 2;
        const width3D = (widthMm / 1000) * PIXELS_PER_METER;
        const height3D = (heightMm / 1000) * PIXELS_PER_METER;

        let moveDist = 60;
        let nextDir = currentDir.clone();
        let nextUp = upDir ? upDir.clone() : new THREE.Vector3(0, 1, 0);
        let nextPos = currentPos.clone();
        let branchDir = null;
        let branchUp = null;
        let midWay = currentPos.clone();

        const pType = comp.fittingType || (comp.properties && comp.properties.type) || comp.type || '';

        // --- UNIVERSEL ISOLERINGS FUNKTION (CAD EFFEKT) ---
        const addInsulation = (baseMesh, geoType, params) => {
            const isoMm = parseFloat(comp.properties?.isoThick || 0);
            if (!diagramSettings.showInsulation || isoMm <= 0) return;
            
            const iso3D = (isoMm / 1000) * PIXELS_PER_METER;
            let isoGeo;
            
            if (geoType === 'straight_cyl') {
                isoGeo = new THREE.CylinderGeometry(params.r + iso3D, params.r + iso3D, params.len, 32);
                isoGeo.translate(0, params.len / 2, 0);
                isoGeo.rotateX(Math.PI / 2);
            } else if (geoType === 'straight_box') {
                isoGeo = new THREE.BoxGeometry(params.w + iso3D * 2, params.len, params.h + iso3D * 2);
                isoGeo.translate(0, params.len / 2, 0);
                isoGeo.rotateX(Math.PI / 2);
            } else if (geoType === 'bend_tube') {
                isoGeo = new THREE.TubeGeometry(params.curve, 20, params.r + iso3D, 16, false);
            } else if (geoType === 'bend_rect') {
                const rectShape = new THREE.Shape();
                const w = params.w + iso3D * 2;
                const h = params.h + iso3D * 2;
                rectShape.moveTo(-w / 2, -h / 2);
                rectShape.lineTo(w / 2, -h / 2);
                rectShape.lineTo(w / 2, h / 2);
                rectShape.lineTo(-w / 2, h / 2);
                rectShape.lineTo(-w / 2, -h / 2);
                isoGeo = new THREE.ExtrudeGeometry(rectShape, params.extrudeSettings);
            } else if (geoType === 'transition') {
                isoGeo = createTransitionGeometry(
                    params.shape1, 
                    params.w1 + (params.shape1==='rect'?iso3D*2:0), 
                    params.h1 + (params.shape1==='rect'?iso3D*2:0), 
                    params.r1 + iso3D,
                    params.shape2, 
                    params.w2 + (params.shape2==='rect'?iso3D*2:0), 
                    params.h2 + (params.shape2==='rect'?iso3D*2:0), 
                    params.r2 + iso3D, 
                    params.len
                );
                isoGeo.translate(0, params.len / 2, 0);
                isoGeo.rotateX(Math.PI / 2);
            }

            if (isoGeo) {
                const isoMat = new THREE.MeshStandardMaterial({
                    color: 0xE8F086, // Rockwool Gul farve
                    transparent: true,
                    opacity: 0.15,
                    roughness: 0.9,
                    depthWrite: false
                });
                const isoMesh = new THREE.Mesh(isoGeo, isoMat);
                // Placer kassen præcis samme sted som originalen
                isoMesh.position.copy(baseMesh.position);
                isoMesh.quaternion.copy(baseMesh.quaternion);
                scene.add(isoMesh);
            }
        };

        if (comp.type === 'straightDuct') {
            const len_m = comp.properties?.length || 1;
            moveDist = (len_m * PIXELS_PER_METER);

            let geometry;
            if (isRect) {
                geometry = new THREE.BoxGeometry(width3D, moveDist, height3D);
            } else {
                geometry = new THREE.CylinderGeometry(radius3D, radius3D, moveDist, 32);
            }

            geometry.translate(0, moveDist / 2, 0);
            geometry.rotateX(Math.PI / 2);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.compId = comp.id; 
            mesh.position.copy(currentPos);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentDir);
            scene.add(mesh);

            // Tegn Isolering for lige rør
            if (isRect) addInsulation(mesh, 'straight_box', {w: width3D, h: height3D, len: moveDist});
            else addInsulation(mesh, 'straight_cyl', {r: radius3D, len: moveDist});

            nextPos.add(currentDir.clone().multiplyScalar(moveDist));
            midWay.copy(currentPos).add(currentDir.clone().multiplyScalar(moveDist / 2));
        }
        else if (pType.startsWith('bend')) {
            const angleDeg = comp.properties?.angle || 90;
            const turnRad = THREE.MathUtils.degToRad(angleDeg);

            const orientation = comp.properties?.orientation || 'Left';
            const rightDir = currentDir.clone().cross(nextUp).normalize();
            let axis = nextUp.clone();
            let turnSign = 1;

            if (orientation === 'Left') { axis = nextUp.clone(); turnSign = 1; }
            else if (orientation === 'Right') { axis = nextUp.clone(); turnSign = -1; }
            else if (orientation === 'Up') { axis = rightDir.clone(); turnSign = 1; }
            else if (orientation === 'Down') { axis = rightDir.clone(); turnSign = -1; }

            nextDir.applyAxisAngle(axis, turnRad * turnSign).normalize();
            nextUp.applyAxisAngle(axis, turnRad * turnSign).normalize();

            const R = (comp.properties?.rd || comp.properties?.rh || 1.0) * (diameterMm / 1000) * PIXELS_PER_METER;
            const cornerDist = R * Math.tan(turnRad / 2);

            const cornerPos = currentPos.clone().add(currentDir.clone().multiplyScalar(cornerDist));
            nextPos = cornerPos.clone().add(nextDir.clone().multiplyScalar(cornerDist));

            const curve = new THREE.QuadraticBezierCurve3(currentPos, cornerPos, nextPos);

            let geometry;
            let extrudeSettings;
            if (isRect) {
                const rectShape = new THREE.Shape();
                rectShape.moveTo(-width3D / 2, -height3D / 2);
                rectShape.lineTo(width3D / 2, -height3D / 2);
                rectShape.lineTo(width3D / 2, height3D / 2);
                rectShape.lineTo(-width3D / 2, height3D / 2);
                rectShape.lineTo(-width3D / 2, -height3D / 2);

                extrudeSettings = { steps: 20, bevelEnabled: false, extrudePath: curve };
                geometry = new THREE.ExtrudeGeometry(rectShape, extrudeSettings);
            } else {
                geometry = new THREE.TubeGeometry(curve, 20, radius3D, 16, false);
            }

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.compId = comp.id; 
            scene.add(mesh);
            
            // Tegn isolering for bøjning
            if (isRect) addInsulation(mesh, 'bend_rect', {w: width3D, h: height3D, extrudeSettings: extrudeSettings});
            else addInsulation(mesh, 'bend_tube', {curve: curve, r: radius3D});

            midWay.copy(curve.getPoint(0.5));
            moveDist = cornerDist * 2;
        }
        else if (pType.includes('transition') || pType.includes('expansion') || pType.includes('contraction')) {
            const dim1 = comp.state?.inletDimension;
            const dim2 = comp.state?.outletDimension?.outlet;
            const p = comp.properties || {};

            let shape1 = 'round', shape2 = 'round';
            if (pType === 'transition_rect_round') { shape1 = 'rect'; shape2 = 'round'; }
            else if (pType === 'transition_round_rect') { shape1 = 'round'; shape2 = 'rect'; }
            else if (pType.includes('rect')) { shape1 = 'rect'; shape2 = 'rect'; }

            if (comp.shape === 'rectangular' || comp.shape === 'rect') shape1 = 'rect';
            else if (comp.shape === 'circular' || comp.shape === 'round') shape1 = 'round';
            
            if (comp.shapeOut === 'rectangular' || comp.shapeOut === 'rect') shape2 = 'rect';
            else if (comp.shapeOut === 'circular' || comp.shapeOut === 'round') shape2 = 'round';

            let w1 = 200, h1 = 200, r1 = 100;
            let w2 = 200, h2 = 200, r2 = 100;

            if (shape1 === 'rect') {
                w1 = parseFloat(comp.width || p.w1 || (pType === 'transition_rect_round' ? p.w : null) || dim1?.w || dim1?.sideB || 200);
                h1 = parseFloat(comp.height || p.h1 || (pType === 'transition_rect_round' ? p.h : null) || dim1?.h || dim1?.sideA || 200);
                r1 = Math.max(w1, h1) / 2;
            } else {
                const d1 = parseFloat(comp.diameter || p.d1 || (pType === 'transition_round_rect' ? p.d : null) || dim1?.d || dim1?.diameter || 200);
                r1 = d1 / 2;
                w1 = d1; h1 = d1;
            }

            if (shape2 === 'rect') {
                w2 = parseFloat(comp.widthOut || p.w2 || (pType === 'transition_round_rect' ? p.w : null) || dim2?.w || dim2?.sideB || 200);
                h2 = parseFloat(comp.heightOut || p.h2 || (pType === 'transition_round_rect' ? p.h : null) || dim2?.h || dim2?.sideA || 200);
                r2 = Math.max(w2, h2) / 2;
            } else {
                const d2 = parseFloat(comp.diameterOut || p.d2 || (pType === 'transition_rect_round' ? p.d : null) || dim2?.d || dim2?.diameter || 200);
                r2 = d2 / 2;
                w2 = d2; h2 = d2;
            }

            const sf_3d = PIXELS_PER_METER / 1000;
            w1 *= sf_3d; h1 *= sf_3d; r1 *= sf_3d;
            w2 *= sf_3d; h2 *= sf_3d; r2 *= sf_3d;

            const angleDeg = parseFloat(p.angle || 30);
            const deltaMax = Math.max(Math.abs(w1 - w2) / 2, Math.abs(h1 - h2) / 2, Math.abs(r1 - r2));
            
            let l_calc_3d = 0;
            if (angleDeg > 0) {
                l_calc_3d = deltaMax / Math.tan(THREE.MathUtils.degToRad(angleDeg / 2));
            }
            
            const total_length_mm = 100 + (l_calc_3d / sf_3d);
            moveDist = total_length_mm * sf_3d;

            const geometry = createTransitionGeometry(shape1, w1, h1, r1, shape2, w2, h2, r2, moveDist);
            geometry.translate(0, moveDist / 2, 0);
            geometry.rotateX(Math.PI / 2);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.compId = comp.id; 
            mesh.position.copy(currentPos);
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentDir);
            scene.add(mesh);
            
            // Tegn Isolering for formovergange
            addInsulation(mesh, 'transition', {shape1, w1, h1, r1, shape2, w2, h2, r2, len: moveDist});

            nextPos.add(currentDir.clone().multiplyScalar(moveDist));
            midWay.copy(currentPos).add(currentDir.clone().multiplyScalar(moveDist / 2));
        }
        else if (pType.includes('tee')) {
            const isBullhead = pType === 'tee_bullhead';
            
            const orientation = comp.properties?.orientation || 'Left';
            const rightDir = currentDir.clone().cross(nextUp).normalize();
            let axis = nextUp.clone();
            let turnSign = 1;

            if (orientation === 'Left') { axis = nextUp.clone(); turnSign = 1; }
            else if (orientation === 'Right') { axis = nextUp.clone(); turnSign = -1; }
            else if (orientation === 'Up') { axis = rightDir.clone(); turnSign = 1; }
            else if (orientation === 'Down') { axis = rightDir.clone(); turnSign = -1; }

            const branchTurn = THREE.MathUtils.degToRad(90);

            if (isBullhead) {
                const dIn = (comp.properties?.d_in || diameterMm) / 1000 * PIXELS_PER_METER;
                const dOut1 = (comp.properties?.d_out1 || diameterMm) / 1000 * PIXELS_PER_METER;
                const dOut2 = (comp.properties?.d_out2 || diameterMm) / 1000 * PIXELS_PER_METER;

                moveDist = Math.max(dIn * 2, 60);
                const stubLen = moveDist / 2;

                let gIn = new THREE.CylinderGeometry(dIn/2, dIn/2, stubLen, 32);
                gIn.translate(0, stubLen/2, 0);
                gIn.rotateX(Math.PI/2);
                const meshIn = new THREE.Mesh(gIn, material);
                meshIn.userData.compId = comp.id;
                meshIn.position.copy(currentPos);
                meshIn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentDir);
                scene.add(meshIn);
                
                // Isolering Indløb
                addInsulation(meshIn, 'straight_cyl', {r: dIn/2, len: stubLen});

                const midPos = currentPos.clone().add(currentDir.clone().multiplyScalar(stubLen));

                const path1Dir = currentDir.clone().applyAxisAngle(axis, branchTurn).normalize();
                const path1Up = nextUp.clone().applyAxisAngle(axis, branchTurn).normalize();
                
                const path2Dir = currentDir.clone().applyAxisAngle(axis, -branchTurn).normalize();
                const path2Up = nextUp.clone().applyAxisAngle(axis, -branchTurn).normalize();

                let gB1 = new THREE.CylinderGeometry(dOut1/2, dOut1/2, stubLen, 32);
                gB1.translate(0, stubLen/2, 0);
                gB1.rotateX(Math.PI/2);
                const meshB1 = new THREE.Mesh(gB1, material);
                meshB1.userData.compId = comp.id;
                meshB1.position.copy(midPos);
                meshB1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path1Dir);
                scene.add(meshB1);
                
                // Isolering Udløb 1
                addInsulation(meshB1, 'straight_cyl', {r: dOut1/2, len: stubLen});

                let gB2 = new THREE.CylinderGeometry(dOut2/2, dOut2/2, stubLen, 32);
                gB2.translate(0, stubLen/2, 0);
                gB2.rotateX(Math.PI/2);
                const meshB2 = new THREE.Mesh(gB2, material);
                meshB2.userData.compId = comp.id;
                meshB2.position.copy(midPos);
                meshB2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path2Dir);
                scene.add(meshB2);
                
                // Isolering Udløb 2
                addInsulation(meshB2, 'straight_cyl', {r: dOut2/2, len: stubLen});

                midWay.copy(midPos);

                const drawOpenEnd = (pos, dir, portName) => {
                    const arrowLength = 50;
                    const arrowDir = isExhaust ? dir.clone().negate() : dir;
                    const arrowPos = isExhaust ? pos.clone().add(dir.clone().multiplyScalar(arrowLength)) : pos;

                    const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowPos, arrowLength, 0x00E4FF, 15, 10);
                    scene.add(arrowHelper);

                    const outFlow = comp.state?.airflow_out?.[portName] || 0;
                    const flow = Math.round(outFlow);
                    
                    const tOutRaw = comp.state?.temperature_out?.[portName] || comp.state?.temperature_in || 20;
                    const temp = parseFloat(tOutRaw);
                    const endText = isExhaust ? 'Udsugning' : 'Indblæsning';
                    const safePortName = portName || 'outlet';

                    const div = document.createElement('div');
                    div.className = 'diagram-label end-label';
                    div.style.position = 'absolute';
                    div.style.color = '#00E4FF';
                    div.style.fontWeight = 'bold';
                    div.style.background = 'rgba(0,0,0,0.7)';
                    div.style.padding = '4px 8px';
                    div.style.borderRadius = '6px';
                    div.style.border = '1px solid #00E4FF';
                    div.style.fontSize = '11px';
                    div.style.pointerEvents = 'none';
                    div.style.textAlign = 'center';
                    
                    const addButtonHtml = isDesktop 
                        ? `<br><button class="add-btn-3d" 
                                style="pointer-events: auto; cursor: pointer; margin-top: 6px; padding: 4px 8px; font-size: 14px; background: #00A4E0; color: #fff; border: none; border-radius: 4px; font-weight: bold; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;" 
                                onpointerdown="event.stopPropagation();"
                                onpointerup="event.stopPropagation();"
                                onclick="event.stopPropagation(); window.showAddForm('${comp.id}', '${safePortName}');">
                            +
                        </button>`
                        : '';
                    
                    let endTextLines = [endText];
                    if (diagramSettings.labels.flow) endTextLines.push(`${flow} m³/h`);
                    if (diagramSettings.labels.temp) endTextLines.push(`${!isNaN(temp) ? temp.toFixed(1) + ' °C' : '-'}`);

                    div.innerHTML = `
                        ${endTextLines.join('<br>')}
                        ${addButtonHtml}
                    `;
                    labelsContainer.appendChild(div);
                    labelsMap.set(div, pos.clone().add(dir.clone().multiplyScalar(arrowLength + 20)));
                };

                const end1Pos = midPos.clone().add(path1Dir.clone().multiplyScalar(stubLen));
                const c1 = comp.children && comp.children.outlet_path1 && comp.children.outlet_path1[0];
                if (c1) drawTree3D(c1, end1Pos, path1Dir, path1Up);
                else drawOpenEnd(end1Pos, path1Dir, 'outlet_path1');

                const end2Pos = midPos.clone().add(path2Dir.clone().multiplyScalar(stubLen));
                const c2 = comp.children && comp.children.outlet_path2 && comp.children.outlet_path2[0];
                if (c2) drawTree3D(c2, end2Pos, path2Dir, path2Up);
                else drawOpenEnd(end2Pos, path2Dir, 'outlet_path2');

                drawLabels(comp, midWay, isIncluded);
                bMin.min(currentPos); bMin.min(end1Pos); bMin.min(end2Pos);
                bMax.max(currentPos); bMax.max(end1Pos); bMax.max(end2Pos);
                return;
            } else {
                branchDir = currentDir.clone().applyAxisAngle(axis, branchTurn * turnSign).normalize();
                branchUp = nextUp.clone().applyAxisAngle(axis, branchTurn * turnSign).normalize();

                moveDist = Math.max(radius3D * 4, width3D * 2, 60);
                const stubLen = moveDist / 2;
                const branchRadius = ((comp.properties?.d_branch || diameterMm) / 1000) * PIXELS_PER_METER / 2;
                const branchWidth = ((comp.properties?.w_branch || widthMm) / 1000) * PIXELS_PER_METER;
                const branchHeight = ((comp.properties?.h_branch || heightMm) / 1000) * PIXELS_PER_METER;
                const isBranchRect = comp.properties?.w_branch !== undefined || (isRect && comp.properties?.d_branch === undefined);

                let gS;
                if (isRect) {
                    gS = new THREE.BoxGeometry(width3D, moveDist, height3D);
                } else {
                    gS = new THREE.CylinderGeometry(radius3D, radius3D, moveDist, 32);
                }
                gS.translate(0, moveDist / 2, 0);
                gS.rotateX(Math.PI / 2);
                const meshS = new THREE.Mesh(gS, material);
                meshS.userData.compId = comp.id;
                meshS.position.copy(currentPos);
                meshS.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentDir);
                scene.add(meshS);
                
                // Isolering Ligeud
                if (isRect) addInsulation(meshS, 'straight_box', {w: width3D, h: height3D, len: moveDist});
                else addInsulation(meshS, 'straight_cyl', {r: radius3D, len: moveDist});

                const midPos = currentPos.clone().add(currentDir.clone().multiplyScalar(stubLen));
                let gB;
                if (isBranchRect) {
                    gB = new THREE.BoxGeometry(branchWidth, stubLen, branchHeight);
                } else {
                    gB = new THREE.CylinderGeometry(branchRadius, branchRadius, stubLen, 32);
                }
                gB.translate(0, stubLen / 2, 0);
                gB.rotateX(Math.PI / 2);
                const meshB = new THREE.Mesh(gB, material);
                meshB.userData.compId = comp.id;
                meshB.position.copy(midPos);
                meshB.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), branchDir);
                scene.add(meshB);
                
                // Isolering Afgrening
                if (isBranchRect) addInsulation(meshB, 'straight_box', {w: branchWidth, h: branchHeight, len: stubLen});
                else addInsulation(meshB, 'straight_cyl', {r: branchRadius, len: stubLen});

                nextPos.add(currentDir.clone().multiplyScalar(moveDist));
                midWay.copy(midPos);
            }
        }
        else {
            moveDist = Math.max(radius3D * 2, 40);
            const g = new THREE.BoxGeometry(radius3D * 2, radius3D * 2, moveDist);
            g.translate(0, 0, moveDist / 2);
            const m = new THREE.Mesh(g, material);
            m.userData.compId = comp.id;
            m.position.copy(currentPos);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentDir);
            scene.add(m);
            
            // Isolering ukendt form
            addInsulation(m, 'straight_box', {w: radius3D * 2, h: radius3D * 2, len: moveDist});

            nextPos.add(currentDir.clone().multiplyScalar(moveDist));
            midWay.copy(currentPos).add(currentDir.clone().multiplyScalar(moveDist / 2));
        }

        // --- OPDATERET Positions & Labels Funktion med Checkbokse ---
        function drawLabels(compData, labelPosCenter, isIncl) {
            const showAny = Object.values(diagramSettings.labels).some(val => val);
            if (!showAny && isIncl) return; 

            let parts = [];

            if (diagramSettings.labels.name) {
                parts.push(compData.name.split(' ')[0]); 
            }
            
            const press = Math.round(compData.state?.pressureLoss || 0);
            const pam = compData.type === 'straightDuct' ? (compData.state?.calculationDetails?.pressureDrop || 0).toFixed(2) : null;
            const vel = (compData.state?.velocity || 0).toFixed(1);
            const flow = Math.round(compData.state?.airflow_in || compData.airflow || 0);
            const tOutRaw = compData.state?.temperature_out ? (compData.state.temperature_out['outlet'] || compData.state.temperature_out['outlet_straight'] || compData.state.temperature_out['outlet_path1']) : compData.state?.temperature_in;
            const temp = tOutRaw ? parseFloat(tOutRaw).toFixed(1) : '-';
            
            let dimStr = '';
            const dim = compData.state?.inletDimension;
            if (dim) {
                if (dim.shape === 'round' || dim.shape === 'circular') {
                    dimStr = `Ø${Math.round(dim.d || dim.diameter)}`;
                } else {
                    dimStr = `${Math.round(dim.w || dim.sideB)}x${Math.round(dim.h || dim.sideA)}`;
                }
            }

            let details = [];
            if (diagramSettings.labels.dim && dimStr) details.push(dimStr);
            if (diagramSettings.labels.flow) details.push(`${flow} m³/h`);
            if (diagramSettings.labels.vel) details.push(`${vel} m/s`);
            if (diagramSettings.labels.press) details.push(`${press} Pa`);
            if (diagramSettings.labels.pam && pam !== null) details.push(`${pam} Pa/m`);
            if (diagramSettings.labels.temp) details.push(`${temp} °C`);

            let txt = parts.join(' ');
            if (details.length > 0) {
                if (txt) {
                    txt += `\n(${details.join(', ')})`;
                } else {
                    txt = details.join(', ');
                }
            }

            if (!isIncl) txt += (txt ? '\n' : '') + "(Deaktiveret)";
            if (!txt) return;

            const div = document.createElement('div');
            div.className = 'diagram-label';
            div.style.position = 'absolute';
            div.style.color = '#fff';
            div.style.textShadow = '0 0 3px #000';
            div.style.fontSize = '11px';
            div.style.pointerEvents = 'none';
            div.style.textAlign = 'center';
            div.innerText = txt;
            labelsContainer.appendChild(div);
            labelsMap.set(div, labelPosCenter);
        }

        if (pType !== 'tee_bullhead') {
            drawLabels(comp, midWay, isIncluded);
            bMin.min(currentPos); bMin.min(nextPos);
            bMax.max(currentPos); bMax.max(nextPos);

            const drawOpenEnd = (pos, dir, portName = null) => {
                const arrowLength = 50;
                const arrowDir = isExhaust ? dir.clone().negate() : dir;
                const arrowPos = isExhaust ? pos.clone().add(dir.clone().multiplyScalar(arrowLength)) : pos;

                const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowPos, arrowLength, 0x00E4FF, 15, 10);
                scene.add(arrowHelper);

                let outFlow = 0;
                if (portName && comp.state?.airflow_out) {
                    outFlow = comp.state.airflow_out[portName];
                } else {
                    outFlow = comp.state?.airflow_out?.outlet || comp.state?.airflow_out?.outlet_straight || comp.state?.airflow_out?.outlet_branch || comp.state?.airflow_in || 0;
                }

                const flow = Math.round(outFlow);

                let tOutRaw = 20;
                if (portName && comp.state?.temperature_out) {
                    tOutRaw = comp.state.temperature_out[portName];
                } else {
                    tOutRaw = comp.state?.temperature_out?.outlet || comp.state?.temperature_out?.outlet_straight || comp.state?.temperature_in || 20;
                }
                const temp = parseFloat(tOutRaw);

                const endText = isExhaust ? 'Udsugning' : 'Indblæsning';
                const safePortName = portName || 'outlet';

                const div = document.createElement('div');
                div.className = 'diagram-label end-label';
                div.style.position = 'absolute';
                div.style.color = '#00E4FF';
                div.style.fontWeight = 'bold';
                div.style.background = 'rgba(0,0,0,0.7)';
                div.style.padding = '4px 8px';
                div.style.borderRadius = '6px';
                div.style.border = '1px solid #00E4FF';
                div.style.fontSize = '11px';
                div.style.pointerEvents = 'none';
                div.style.textAlign = 'center';
                
                const addButtonHtml = isDesktop 
                    ? `<br><button class="add-btn-3d" 
                            style="pointer-events: auto; cursor: pointer; margin-top: 6px; padding: 4px 8px; font-size: 14px; background: #00A4E0; color: #fff; border: none; border-radius: 4px; font-weight: bold; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;" 
                            onpointerdown="event.stopPropagation();"
                            onpointerup="event.stopPropagation();"
                            onclick="event.stopPropagation(); window.showAddForm('${comp.id}', '${safePortName}');">
                        +
                    </button>`
                    : '';
                
                let endTextLines = [endText];
                if (diagramSettings.labels.flow) endTextLines.push(`${flow} m³/h`);
                if (diagramSettings.labels.temp) endTextLines.push(`${!isNaN(temp) ? temp.toFixed(1) + ' °C' : '-'}`);

                div.innerHTML = `
                    ${endTextLines.join('<br>')}
                    ${addButtonHtml}
                `;
                labelsContainer.appendChild(div);
                labelsMap.set(div, pos.clone().add(dir.clone().multiplyScalar(arrowLength + 20)));
            };

            if (pType.includes('tee')) {
                const midPos = currentPos.clone().add(currentDir.clone().multiplyScalar(moveDist / 2));
                const branchStart = midPos.clone().add(branchDir.clone().multiplyScalar(moveDist / 2));

                const sc = comp.children && comp.children.outlet_straight && comp.children.outlet_straight[0];
                if (sc) drawTree3D(sc, nextPos, nextDir, nextUp);
                else drawOpenEnd(nextPos, nextDir, 'outlet_straight');

                const bc = comp.children && comp.children.outlet_branch && comp.children.outlet_branch[0];
                if (bc) drawTree3D(bc, branchStart, branchDir, branchUp);
                else drawOpenEnd(branchStart, branchDir, 'outlet_branch');
            } else {
                const c = comp.children && comp.children.outlet && comp.children.outlet[0];
                if (c) drawTree3D(c, nextPos, nextDir, nextUp);
                else drawOpenEnd(nextPos, nextDir);
            }
        }
    }

    const tree = stateManager.getSystemTree();
    if (tree && tree.length > 0) {
        const startPos = new THREE.Vector3(0, 0, 0);
        let startDir = new THREE.Vector3(1, 0, 0);
        let startUp = new THREE.Vector3(0, 1, 0);

        const sDir = fullState.startDirection || 'Right';
        if (sDir === 'Left') {
            startDir.set(-1, 0, 0);
        } else if (sDir === 'Up') {
            startDir.set(0, 1, 0);
            startUp.set(-1, 0, 0);
        } else if (sDir === 'Down') {
            startDir.set(0, -1, 0);
            startUp.set(1, 0, 0);
        }

        const arrowDir = isExhaust ? startDir.clone().negate() : startDir;
        const arrowStartPos = isExhaust ? startPos.clone() : startPos.clone().sub(startDir.clone().multiplyScalar(60));
        const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowStartPos, 60, 0x00E4FF, 15, 10);
        scene.add(arrowHelper);

        const flow = Math.round(tree[0].state?.airflow_in || 0);
        const tInRaw = tree[0].state?.temperature_in || 20;
        const temp = parseFloat(tInRaw);
        const startText = isExhaust ? 'Udsugning' : 'Indtag';

        const div = document.createElement('div');
        div.className = 'diagram-label end-label';
        div.style.position = 'absolute';
        div.style.color = '#00E4FF';
        div.style.fontWeight = 'bold';
        div.style.background = 'rgba(0,0,0,0.6)';
        div.style.padding = '2px 6px';
        div.style.borderRadius = '4px';
        div.style.border = '1px solid #00E4FF';
        div.style.fontSize = '11px';
        div.style.pointerEvents = 'none';
        div.style.whiteSpace = 'pre';
        div.style.textAlign = 'center';
        
        let startTextLines = [startText];
        if (diagramSettings.labels.flow) startTextLines.push(`${flow} m³/h`);
        if (diagramSettings.labels.temp) startTextLines.push(`${!isNaN(temp) ? temp.toFixed(1) + ' °C' : '-'}`);

        div.innerHTML = startTextLines.join('<br>');
        labelsContainer.appendChild(div);

        const labelPos = isExhaust 
            ? startPos.clone().add(startDir.clone().multiplyScalar(75)) 
            : startPos.clone().sub(startDir.clone().multiplyScalar(75));
        labelsMap.set(div, labelPos);

        drawTree3D(tree[0], startPos, startDir, startUp);
    }

    if (!keepControls) {
        if (bMin.x !== Infinity) {
            const center = bMin.clone().add(bMax).multiplyScalar(0.5);
            const size = bMax.clone().sub(bMin);
            const maxDim = Math.max(size.x, size.y, size.z, 200);

            controls.target.copy(center);
            camera.position.set(center.x, center.y + maxDim, center.z + maxDim);
            camera.lookAt(center);
        }
    }
}

function updateLabels() {
    if (!camera || !renderer) return;
    const canvas = renderer.domElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    labelsMap.forEach((pos3D, element) => {
        const v = pos3D.clone();
        v.project(camera);

        if (v.z > 1) {
            element.style.display = 'none';
            return;
        }
        element.style.display = 'block';

        const x = (v.x * .5 + .5) * cw;
        const y = (v.y * -.5 + .5) * ch;

        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.style.transform = `translate(-50%, -100%)`;
    });
}

export function zoomAllDiagram() {
    if (!camera || !controls || !scene || !renderer) return;

    const webglContainer = document.getElementById('diagramWebglContainer');
    if (webglContainer && webglContainer.clientWidth > 0 && webglContainer.clientHeight > 0) {
        camera.aspect = webglContainer.clientWidth / webglContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(webglContainer.clientWidth, webglContainer.clientHeight);
    }

    const box = new THREE.Box3();
    scene.traverse((child) => {
        if (child.isMesh) {
            box.expandByObject(child);
        }
    });

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const radius = maxDim / 2;

    const fovY = camera.fov * (Math.PI / 180);
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);

    const distY = radius / Math.sin(fovY / 2);
    const distX = radius / Math.sin(fovX / 2);

    let cameraDist = Math.max(distX, distY);

    const isDesktop = document.body.classList.contains('desktop-mode');
    const padding = isDesktop ? 1.2 : 1.6; 

    cameraDist *= padding;

    const angleDir = new THREE.Vector3(0.8, 1.0, 0.8).normalize();
    camera.position.copy(center).add(angleDir.multiplyScalar(cameraDist));
    
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
}
window.zoomAllDiagram = zoomAllDiagram;