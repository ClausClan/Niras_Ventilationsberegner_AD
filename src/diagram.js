import { getSystemComponents } from './app_state.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { stateManager } from './app_state.js';
import { formatLocalFloat } from './utils.js';

let diagramSettings = {
    colorMode: 'default',
    labelMode: 'name',
    threshold: 0
};

// Global update function
window.updateDiagramSettings = () => {
    const colorMode = document.getElementById('diagramColorMode').value;
    const labelMode = document.getElementById('diagramLabelMode').value;
    diagramSettings.colorMode = colorMode;
    diagramSettings.labelMode = labelMode;
    renderDiagram(true);
};

// Colors
function getColorByValue(val, mode, min, max) {
    if (mode === 'default') return 0x00E4FF; // Neon Blue Hex

    let range = max - min;
    if (range <= 0) range = 1;
    let t = Math.max(0, Math.min(1, (val - min) / range));

    let r, g, b;
    // Temperature (Blue -> Green -> Yellow -> Red)
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
        // Default Gradient for Pressure/Velocity (Blue -> Green -> Red)
        if (t < 0.5) {
            const p = t * 2;
            r = 0; g = Math.round(255 * p); b = Math.round(255 * (1 - p));
        } else {
            const p = (t - 0.5) * 2;
            r = Math.round(255 * p); g = Math.round(255 * (1 - p)); b = 0;
        }
    }

    // Convert RGB (0-255) to Hex Number
    return (r << 16) | (g << 8) | b;
}

function getColor(comp, mode, min, max) {
    if (mode === 'critical') {
        return comp.state?.isCriticalPath ? 0xFF0055 : 0x3a7bd5; // Bright Magenta/Red vs Standard Blue
    }

    let val = 0;
    if (mode === 'velocity') val = comp.state?.velocity || 0;
    else if (mode === 'pressure') val = comp.type === 'straightDuct' ? (comp.state?.calculationDetails?.pressureDrop || 0) : 0;
    else if (mode === 'temperature') val = comp.state?.temperature_out?.outlet || comp.state?.temperature_out?.outlet_straight || comp.state?.temperature_in || 20;

    return getColorByValue(val, mode, min, max);
}

// Global 3D States
let scene, camera, renderer, controls;
let labelsMap = new Map(); // Keep track of HTML labels

// --- Toggle Diagram View ---
export function toggleDiagramView() {
    const tableContainer = document.getElementById('systemComponentsContainer');
    const diagramContainer = document.getElementById('systemDiagramContainer');
    const btn = document.getElementById('toggleViewBtn');

    if (diagramContainer.classList.contains('hidden')) {
        tableContainer.classList.add('hidden');
        diagramContainer.classList.remove('hidden');
        btn.innerText = "Vis Tabel";
        renderDiagram();
    } else {
        tableContainer.classList.remove('hidden');
        diagramContainer.classList.add('hidden');
        btn.innerText = "Vis Diagram";
    }
}

export function renderDiagram() {
    const container = document.getElementById('systemDiagramContainer');
    if (!container) return;

    const tree = stateManager.getSystemTree();
    if (!tree || tree.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center; color:#666;">Tilføj komponenter for at se diagrammet.</div>';
        return;
    }

    let minX = 0, minY = 0, maxX = 100, maxY = 100;
    let svgElements = '';

    // Standard farver og dimensioner
    const sf = 0.15; // Skaleringsfaktor for rør-dimensioner
    const ISO_ANGLE = Math.PI / 6; // 30 grader isometrisk
    const DX = Math.cos(ISO_ANGLE);
    const DY = Math.sin(ISO_ANGLE);

    // --- NY MATEMATIK: Ægte centreret Isometrisk Profil ---
    // Eliminerer "twist" ved at centrere dybden omkring cx, cy
    function getIsoProfile(cx, cy, w, h, isRound) {
        const wh = w / 2;
        const hh = h / 2;

        const profile = {
            x0: cx - wh * DX, y0: cy + wh * DY - hh, // Front Top
            x1: cx + wh * DX, y1: cy - wh * DY - hh, // Back Top
            x2: cx + wh * DX, y2: cy - wh * DY + hh, // Back Bottom
            x3: cx - wh * DX, y3: cy + wh * DY + hh, // Front Bottom
            cx: cx, cy: cy,                          // True Center
            rx: wh * DX,                             // Ellipse Radius X
            ry: hh                                   // Ellipse Radius Y (Korrekt for isometri)
        };
        profile.isRound = isRound;
        return profile;
    }

    // --- Byg SVG Værktøjer ---
    function createTooltip(node) {
        const s = node.state || {};
        const pLoss = s.pressureLoss ? formatLocalFloat(s.pressureLoss, 2) : '0';
        const v = s.velocity ? formatLocalFloat(s.velocity, 2) : '0';
        const q = s.airflow_in ? formatLocalFloat(s.airflow_in, 0) : (node.airflow || 0);
        return `<title>${node.name}\nLuftmængde: ${q} m³/h\nHastighed: ${v} m/s\nTryktab: ${pLoss} Pa</title>`;
    }

    function drawStraightDuct(x, y, node) {
        const L = (node.properties && node.properties.length ? node.properties.length : 1) * 30; // 30px per meter
        const w = (node.shape === 'rectangular' || node.shape === 'rect' ? node.width : node.diameter) * sf;
        const h = (node.shape === 'rectangular' || node.shape === 'rect' ? node.height : node.diameter) * sf;
        const isRound = (node.shape === 'round' || node.shape === 'circular');

        const pIn = getIsoProfile(x, y, w, h, isRound);
        const pOut = getIsoProfile(x + L, y, w, h, isRound);

        let svg = `<g class="duct-node" id="dia_${node.id}" style="cursor:pointer;">${createTooltip(node)}`;
        
        // Krop
        svg += `<polygon points="${pIn.x1},${pIn.y1} ${pOut.x1},${pOut.y1} ${pOut.x2},${pOut.y2} ${pIn.x2},${pIn.y2}" fill="#d1d5db" />`; // Back
        svg += `<polygon points="${pIn.x0},${pIn.y0} ${pOut.x0},${pOut.y0} ${pOut.x1},${pOut.y1} ${pIn.x1},${pIn.y1}" fill="#e5e7eb" />`; // Top
        svg += `<polygon points="${pIn.x0},${pIn.y0} ${pOut.x0},${pOut.y0} ${pOut.x3},${pOut.y3} ${pIn.x3},${pIn.y3}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="1"/>`; // Front

        // Samlinger
        if (isRound) {
            svg += `<ellipse cx="${pIn.cx}" cy="${pIn.cy}" rx="${pIn.rx}" ry="${pIn.ry}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
            svg += `<ellipse cx="${pOut.cx}" cy="${pOut.cy}" rx="${pOut.rx}" ry="${pOut.ry}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
        } else {
            svg += `<polygon points="${pIn.x0},${pIn.y0} ${pIn.x1},${pIn.y1} ${pIn.x2},${pIn.y2} ${pIn.x3},${pIn.y3}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
            svg += `<polygon points="${pOut.x0},${pOut.y0} ${pOut.x1},${pOut.y1} ${pOut.x2},${pOut.y2} ${pOut.x3},${pOut.y3}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
        }

        // Info Tekst
        svg += `<text x="${x + L/2}" y="${y - h/2 - 10}" font-size="10" fill="#374151" text-anchor="middle" font-family="sans-serif">${node.name.split(' ')[0]} ${isRound ? 'Ø'+node.diameter : node.height+'x'+node.width}</text>`;
        svg += `</g>`;

        return { svg, nextX: x + L, nextY: y };
    }

    // --- LINDBAB LORTR / SPIDSSTYKKE TEGNEMOTOR ---
    function drawTransition(x, y, node) {
        const L_total = 60; // Fast visuel total-længde
        const L_collar = 10; // Kravernes længde
        const L_loft = L_total - 2 * L_collar; // Selve overgangens smig

        const isRectIn = (node.shape === 'rectangular' || node.shape === 'rect');
        const isRectOut = (node.shapeOut === 'rectangular' || node.shapeOut === 'rect');

        const wIn = (isRectIn ? (node.width || node.properties.w1 || 0) : (node.diameter || node.properties.d1 || 0)) * sf;
        const hIn = (isRectIn ? (node.height || node.properties.h1 || 0) : (node.diameter || node.properties.d1 || 0)) * sf;
        
        const wOut = (isRectOut ? (node.widthOut || node.properties.w2 || 0) : (node.diameterOut || node.properties.d2 || 0)) * sf;
        const hOut = (isRectOut ? (node.heightOut || node.properties.h2 || 0) : (node.diameterOut || node.properties.d2 || 0)) * sf;

        if (wIn === 0 || hIn === 0 || wOut === 0 || hOut === 0) return { svg: '', nextX: x + L_total, nextY: y };

        // Udregn 4 profiler: Start krave, Start loft, Slut loft, Slut krave
        const pIn1 = getIsoProfile(x, y, wIn, hIn, !isRectIn);
        const pIn2 = getIsoProfile(x + L_collar, y, wIn, hIn, !isRectIn);
        
        const pOut1 = getIsoProfile(x + L_collar + L_loft, y, wOut, hOut, !isRectOut);
        const pOut2 = getIsoProfile(x + L_total, y, wOut, hOut, !isRectOut);

        let svg = `<g class="transition-node" id="dia_${node.id}" style="cursor:pointer;">${createTooltip(node)}`;

        // Hjælpefunktion til at tegne kraverne
        const drawSegment = (p1, p2, isRound) => {
            let seg = '';
            seg += `<polygon points="${p1.x1},${p1.y1} ${p2.x1},${p2.y1} ${p2.x2},${p2.y2} ${p1.x2},${p1.y2}" fill="#d1d5db" />`;
            seg += `<polygon points="${p1.x0},${p1.y0} ${p2.x0},${p2.y0} ${p2.x1},${p2.y1} ${p1.x1},${p1.y1}" fill="#e5e7eb" />`;
            seg += `<polygon points="${p1.x0},${p1.y0} ${p2.x0},${p2.y0} ${p2.x3},${p2.y3} ${p1.x3},${p1.y3}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="0.5"/>`;
            if (isRound) {
                seg += `<ellipse cx="${p1.cx}" cy="${p1.cy}" rx="${p1.rx}" ry="${p1.ry}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
                seg += `<ellipse cx="${p2.cx}" cy="${p2.cy}" rx="${p2.rx}" ry="${p2.ry}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
            } else {
                seg += `<polygon points="${p1.x0},${p1.y0} ${p1.x1},${p1.y1} ${p1.x2},${p1.y2} ${p1.x3},${p1.y3}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
                seg += `<polygon points="${p2.x0},${p2.y0} ${p2.x1},${p2.y1} ${p2.x2},${p2.y2} ${p2.x3},${p2.y3}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
            }
            return seg;
        };

        // 1. Tegn Indløbskrave
        svg += drawSegment(pIn1, pIn2, !isRectIn);

        // 2. Tegn Udløbskrave
        svg += drawSegment(pOut1, pOut2, !isRectOut);

        // 3. Tegn selve Lofting (Den symmetriske stål-overgang, der forbinder flangerne)
        svg += `<polygon points="${pIn2.x3},${pIn2.y3} ${pIn2.x2},${pIn2.y2} ${pOut1.x2},${pOut1.y2} ${pOut1.x3},${pOut1.y3}" fill="#9ca3af" stroke="#6b7280" stroke-width="0.5"/>`; // Bund
        svg += `<polygon points="${pIn2.x1},${pIn2.y1} ${pIn2.x2},${pIn2.y2} ${pOut1.x2},${pOut1.y2} ${pOut1.x1},${pOut1.y1}" fill="#d1d5db" stroke="#9ca3af" stroke-width="0.5"/>`; // Bagside
        svg += `<polygon points="${pIn2.x0},${pIn2.y0} ${pIn2.x1},${pIn2.y1} ${pOut1.x1},${pOut1.y1} ${pOut1.x0},${pOut1.y0}" fill="#e5e7eb" stroke="#9ca3af" stroke-width="0.5"/>`; // Top
        svg += `<polygon points="${pIn2.x0},${pIn2.y0} ${pIn2.x3},${pIn2.y3} ${pOut1.x3},${pOut1.y3} ${pOut1.x0},${pOut1.y0}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="0.5"/>`; // Front

        // Ekstra markeringslinjer der fuldender pladebukket
        svg += `<line x1="${pIn2.x0}" y1="${pIn2.y0}" x2="${pOut1.x0}" y2="${pOut1.y0}" stroke="#9ca3af" stroke-width="1"/>`;
        svg += `<line x1="${pIn2.x3}" y1="${pIn2.y3}" x2="${pOut1.x3}" y2="${pOut1.y3}" stroke="#9ca3af" stroke-width="1"/>`;

        // Tekst
        let shortName = node.name.includes('Rund til Firkant') ? 'Overgang R-F' : (node.name.includes('Firkant til Rund') ? 'Overgang F-R' : node.name.split(' ')[0]);
        svg += `<text x="${x + L_total/2}" y="${y - Math.max(hIn, hOut)/2 - 15}" font-size="10" fill="#2563eb" font-weight="bold" text-anchor="middle" font-family="sans-serif">${shortName}</text>`;
        svg += `</g>`;

        return { svg, nextX: x + L_total, nextY: y };
    }

    function drawFitting(x, y, node) {
        const pType = node.fittingType || (node.properties && node.properties.type) || node.type || '';
        
        // Send dimension- og formskift til LORTR funktionen
        if (pType.includes('expansion') || pType.includes('contraction') || pType.includes('transition')) {
            return drawTransition(x, y, node);
        }

        // Ellers tegn som standard bøjning
        const L = 40;
        const D = (node.diameter || 200) * sf;
        const pIn = getIsoProfile(x, y, D, D, true);
        const pOut = getIsoProfile(x + L, y, D, D, true);

        let svg = `<g class="bend-node" id="dia_${node.id}" style="cursor:pointer;">${createTooltip(node)}`;
        svg += `<path d="M ${pIn.x0} ${pIn.y0} Q ${x+L/2} ${y-D} ${pOut.x0} ${pOut.y0} L ${pOut.x3} ${pOut.y3} Q ${x+L/2} ${y+D} ${pIn.x3} ${pIn.y3} Z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>`;
        svg += `<ellipse cx="${pIn.cx}" cy="${pIn.cy}" rx="${pIn.rx}" ry="${pIn.ry}" fill="none" stroke="#4b5563" stroke-width="1.5"/>`;
        svg += `<ellipse cx="${pOut.cx}" cy="${pOut.cy}" rx="${pOut.rx}" ry="${pOut.ry}" fill="none" stroke="#4b5563" stroke-width="1.5"/>`;
        svg += `<text x="${x + L/2}" y="${y - D/2 - 10}" font-size="10" fill="#d97706" text-anchor="middle" font-family="sans-serif">${node.name.split(' ')[0]}</text>`;
        svg += `</g>`;

        return { svg, nextX: x + L, nextY: y };
    }

    function drawTee(x, y, node) {
        const L = 60; // Giver plads til grenen
        const D = (node.properties.d_in || node.diameter || 200) * sf;
        const pIn = getIsoProfile(x, y, D, D, true);
        const pOutStr = getIsoProfile(x + L, y, D, D, true);

        let svg = `<g class="tee-node" id="dia_${node.id}" style="cursor:pointer;">${createTooltip(node)}`;
        
        // Afgrening nedad (tegnes først så den ligger bagved hovedrørets top)
        const cx = x + L/2;
        const rx = (D/2) * DX;
        const branchL = 50;
        
        // Branch krop
        svg += `<polygon points="${cx - rx},${y} ${cx + rx},${y} ${cx + rx},${y + branchL} ${cx - rx},${y + branchL}" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1"/>`;
        // Branch ellipse 
        svg += `<ellipse cx="${cx}" cy="${y + branchL}" rx="${rx}" ry="${D/4}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;

        // Hovedrør Krop
        svg += `<polygon points="${pIn.x1},${pIn.y1} ${pOutStr.x1},${pOutStr.y1} ${pOutStr.x2},${pOutStr.y2} ${pIn.x2},${pIn.y2}" fill="#d1d5db" />`; 
        svg += `<polygon points="${pIn.x0},${pIn.y0} ${pOutStr.x0},${pOutStr.y0} ${pOutStr.x1},${pOutStr.y1} ${pIn.x1},${pIn.y1}" fill="#e5e7eb" />`; 
        svg += `<polygon points="${pIn.x0},${pIn.y0} ${pOutStr.x0},${pOutStr.y0} ${pOutStr.x3},${pOutStr.y3} ${pIn.x3},${pIn.y3}" fill="#f3f4f6" stroke="#9ca3af" stroke-width="1"/>`; 

        // Samlinger
        svg += `<ellipse cx="${pIn.cx}" cy="${pIn.cy}" rx="${pIn.rx}" ry="${pIn.ry}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
        svg += `<ellipse cx="${pOutStr.cx}" cy="${pOutStr.cy}" rx="${pOutStr.rx}" ry="${pOutStr.ry}" fill="none" stroke="#6b7280" stroke-width="1.5"/>`;
        
        svg += `<text x="${cx}" y="${y - D/2 - 10}" font-size="10" fill="#059669" text-anchor="middle" font-family="sans-serif">T-Stykke</text>`;
        svg += `</g>`;

        return {
            svg,
            outlets: {
                straight: { nextX: x + L, nextY: y },
                branch: { nextX: cx, nextY: y + branchL }
            }
        };
    }

    // --- Rekursiv Tegner ---
    function traverse(nodeArray, currentX, currentY) {
        if (!nodeArray || nodeArray.length === 0) return;

        nodeArray.forEach(node => {
            let res;
            const isTee = node.type && node.type.startsWith('tee_');

            if (node.type === 'straightDuct') {
                res = drawStraightDuct(currentX, currentY, node);
            } else if (isTee) {
                res = drawTee(currentX, currentY, node);
            } else {
                res = drawFitting(currentX, currentY, node);
            }

            if (res) {
                svgElements += res.svg;
                
                // Opdater bounding box for auto-zoom (Inkl. plads til overganges højde)
                const testX = isTee ? Math.max(res.outlets.straight.nextX, res.outlets.branch.nextX) : res.nextX;
                const testY = isTee ? Math.max(res.outlets.straight.nextY, res.outlets.branch.nextY) : res.nextY;
                if (testX > maxX) maxX = testX;
                if (testY > maxY) maxY = testY;
                if (currentY - 100 < minY) minY = currentY - 100; 

                if (isTee && node.children) {
                    if (node.type === 'tee_bullhead') {
                         if (node.children['outlet_path1']) traverse(node.children['outlet_path1'], res.outlets.straight.nextX, res.outlets.straight.nextY);
                         if (node.children['outlet_path2']) traverse(node.children['outlet_path2'], res.outlets.branch.nextX, res.outlets.branch.nextY);
                    } else {
                        if (node.children['outlet_straight']) traverse(node.children['outlet_straight'], res.outlets.straight.nextX, res.outlets.straight.nextY);
                        if (node.children['outlet_branch']) traverse(node.children['outlet_branch'], res.outlets.branch.nextX, res.outlets.branch.nextY);
                    }
                } else if (node.children) {
                    // Find children via outlet or fallback arrays
                    let children = node.children['outlet'];
                    if (!children && Object.values(node.children).length > 0) children = Object.values(node.children)[0];
                    if (children) traverse(children, res.nextX, res.nextY);
                }
            }
        });
    }

    // Start tegningen
    traverse(tree, 50, 200);

    // Beregn ViewBox med margin
    const pad = 80;
    const vWidth = Math.max(800, maxX - minX + pad*2);
    const vHeight = Math.max(400, maxY - minY + pad*2);

    container.innerHTML = `
        <div style="width: 100%; height: 600px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; position: relative;">
            <svg width="100%" height="100%" viewBox="${minX - pad} ${minY - pad*2} ${vWidth} ${vHeight}" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id="ductGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#e5e7eb" />
                        <stop offset="100%" stop-color="#9ca3af" />
                    </linearGradient>
                </defs>
                ${svgElements}
            </svg>
            <div style="position: absolute; bottom: 10px; right: 10px; background: rgba(255,255,255,0.8); padding: 5px 10px; border-radius: 4px; font-size: 12px; color: #4b5563;">
                Hold musen over komponenter for detaljer
            </div>
        </div>
    `;
}

// Attach label updater to animation loop
function updateLabels() {
    if (!camera || !renderer) return;
    const canvas = renderer.domElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    labelsMap.forEach((pos3D, element) => {
        const v = pos3D.clone();
        v.project(camera);

        // Frustum culling (hide if behind camera)
        if (v.z > 1) {
            element.style.display = 'none';
            return;
        }
        element.style.display = 'block';

        const x = (v.x * .5 + .5) * cw;
        const y = (v.y * -.5 + .5) * ch;

        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.style.transform = `translate(-50%, -100%)`; // above line
    });
}

// --- Interaction ---
export function zoomAllDiagram() {
    if (!camera || !controls || !scene) return;

    // Create an empty bounding box
    const box = new THREE.Box3();

    // Expand bounding box to include all meshes in the scene
    scene.traverse((child) => {
        if (child.isMesh) {
            box.expandByObject(child);
        }
    });

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 20); // enforce a minimum zoom distance

    // Zoom out using a multiplier
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    // Apply an isometric-like angle offset
    camera.position.set(center.x + cameraZ * 0.8, center.y + cameraZ * 1.0, center.z + cameraZ * 0.8);
    controls.target.copy(center);

    camera.lookAt(center);
    controls.update();
}
window.zoomAllDiagram = zoomAllDiagram;
