// Main application logic - Cache Bust 1
import { parseLocalFloat, getInternalDim, formatLocalFloat } from './utils.js?v=3';
import * as physics from './physics.js?v=3';
import * as diagram from './diagram.js?v=3';
import * as ui from './ui.js?v=3';

import {
    addSystemComponent, deleteSystemComponent,
    undo, redo,
    updateSystemComponent, stateManager, removeFitting, resetFittings, getSystemComponents, removeLastSystemComponent, clearSystem, setSystemComponents, getSystemComponent, canUndo, canRedo, addFitting, getCorrectionTargetId, setCorrectionTargetId, setDuctResult
} from './app_state.js';
window.stateManager = stateManager;
window.setCorrectionTargetId = setCorrectionTargetId;
import { projectManager } from './projects.js';
import { toggleDiagramView, renderDiagram } from './diagram.js';

window.toggleDiagramView = toggleDiagramView;
window.renderDiagram = renderDiagram;

// --- Global Scope for UI interactions ---
window.toggleSystemMenu = ui.toggleSystemMenu;
window.printDocumentation = ui.printDocumentation;
window.showDuctDetails = ui.showDuctDetails;
window.showFittingDetails = ui.showFittingDetails;
window.showSystemComponentDetails = ui.showSystemComponentDetails;
window.showHelpModal = ui.showHelpModal;
window.showConfirm = ui.showConfirm;
window.deleteFitting = removeFitting;
window.resetFittings = () => { resetFittings(); ui.renderFittingsResult(); };

// --- Undo/Redo Logic ---
function handleUndo() {
    if (undo()) {
        ui.renderSystem();
        ui.handleComponentTypeChange();
        ui.updateUndoRedoUI(canUndo(), canRedo());
    }
}

function handleRedo() {
    if (redo()) {
        ui.renderSystem();
        ui.handleComponentTypeChange();
        ui.updateUndoRedoUI(canUndo(), canRedo());
    }
}

window.addEventListener('stateChanged', () => {
    ui.updateUndoRedoUI(canUndo(), canRedo());
    ui.showSaveStatus('Gemt', 'saved');

    const state = stateManager.state;
    if (state.projectName) document.getElementById('projectName').value = state.projectName;
    if (state.startAirflow) document.getElementById('system_airflow').value = state.startAirflow;
    if (state.systemType) {
        const radio = document.querySelector(`input[name="systemFlowType"][value="${state.systemType}"]`);
        if (radio) radio.checked = true;
    }
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
    }
});

window.deleteFitting = (id) => {
    removeFitting(id);
    ui.renderFittingsResult();
};

window.handleDeleteLastComponent = () => {
    removeLastSystemComponent();
    ui.renderSystem();
    ui.handleComponentTypeChange();
};

window.handleDeleteComponent = (id) => {
    ui.showConfirm("Er du sikker på, at du vil slette denne komponent? Dette kan påvirke efterfølgende beregninger.", () => {
        deleteSystemComponent(id);
        recalculateSystem(); 
        ui.updateUndoRedoUI(canUndo(), canRedo()); 
        ui.showSaveStatus('Ændringer gemt', 'saved');
    });
};

window.handleEditComponent = (id) => {
    ui.showEditForm(id);
};

window.handleUpdateComponent = (id) => {
    const component = getSystemComponent(id);
    if (!component) return;

    const suffix = '_edit';
    let newData = null;

    if (component.type === 'straightDuct') {
        newData = getDuctData(suffix);
    } else if (component.type === 'manualLoss') {
        const name = document.getElementById('manualDescription' + suffix).value;
        const pressureLoss = parseLocalFloat(document.getElementById('manualPressureLoss' + suffix).value);
        newData = {
            type: 'manualLoss',
            name,
            properties: { pressureLoss },
            state: {}
        };
    } else {
        newData = getFittingData(suffix, component.type);
    }

    if (newData) {
        newData.id = id;
        newData.inputs = component.inputs;
        newData.outputs = component.outputs;

        updateSystemComponent(id, newData); 
        ui.showSaveStatus('Komponent opdateret');
        recalculateSystem(); 
    }
};

window.clearSystem = (event) => {
    if (event) event.preventDefault();
    showConfirm('Er du sikker på, at du vil starte en ny beregning? Alle data vil gå tabt.', () => {
        clearSystem();
        document.getElementById('projectName').value = '';
        ui.renderSystem();
        ui.handleComponentTypeChange();
    });
};

window.saveSystem = (event) => {
    if (event) event.preventDefault();
    const systemComponents = getSystemComponents();
    const data = {
        projectName: document.getElementById('projectName').value,
        startAirflow: document.getElementById('system_airflow').value,
        systemType: document.querySelector('input[name="systemFlowType"]:checked').value,
        components: systemComponents,
        timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventilations_system_${data.projectName || 'unnamed'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.toggleSystemMenu();
};

window.triggerFileLoad = (event) => {
    if (event) event.preventDefault();
    document.getElementById('fileLoader').click();
    ui.toggleSystemMenu();
};

window.requestCorrection = (id) => {
    setCorrectionTargetId(id);
    document.getElementById('systemComponentType').value = 'manualLoss';
    ui.handleComponentTypeChange();
    document.getElementById('systemComponentType').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
        document.getElementById('manualLossName').value = "Korrektion";
        document.getElementById('manualLossName').focus();
    }, 100);
};

// --- Event Handlers ---

function handleDuctCalculation(event) {
    event.preventDefault();
    const dimResultsContainer = document.getElementById('dim_resultsContainer');
    dimResultsContainer.innerHTML = '';
    try {
        const temp = parseLocalFloat(document.getElementById('temperature').value);
        if (isNaN(temp)) throw new Error("Ugyldig temperatur.");
        const { RHO, NU } = physics.getAirProperties(temp);
        const airflow_m3h = parseLocalFloat(document.getElementById('dim_airflow').value);
        if (isNaN(airflow_m3h) || airflow_m3h <= 0) throw new Error("Ugyldig luftmængde.");
        const Q = airflow_m3h / 3600;
        const mode = document.querySelector('input[name="calculationMode"]:checked').value;
        const shape = document.querySelector('input[name="ductShape"]:checked').value;

        let result;
        if (mode === 'calculate') {
            const constraintType = document.getElementById('constraintType').value;
            const constraintValue = parseLocalFloat(document.getElementById('constraintValue').value);
            const aspectRatio = parseLocalFloat(document.getElementById('aspectRatio').value);
            result = physics.calculateDimensions(Q, shape, airflow_m3h, RHO, NU, constraintType, constraintValue, aspectRatio);
        } else {
            const diameter = parseLocalFloat(document.getElementById('diameter').value);
            const sideA = parseLocalFloat(document.getElementById('sideA').value);
            const sideB = parseLocalFloat(document.getElementById('sideB').value);
            result = physics.analyzeDuct(Q, shape, airflow_m3h, RHO, NU, diameter, sideA, sideB);
        }

        setDuctResult(result);
        ui.renderDuctResult(result);
    } catch (error) {
        dimResultsContainer.innerHTML = `<div class="error-message">Fejl: ${error.message}</div>`;
    }
}

function handleFittingCalculation(event) {
    event.preventDefault();
    const fittingsResultsContainer = document.getElementById('fittings_resultsContainer');
    fittingsResultsContainer.innerHTML = '';
    try {
        const temp = parseLocalFloat(document.getElementById('temperature').value);
        if (isNaN(temp)) throw new Error("Ugyldig temperatur.");
        const { RHO, NU } = physics.getAirProperties(temp);
        const type = document.getElementById('fittingType').value;
        const globalFlowType = document.querySelector('input[name="fitFlowType"]:checked').value;

        if (type.startsWith('tee')) {
            const isBullhead = type === 'tee_bullhead';
            const isSym = type === 'tee_sym';

            if (isBullhead) {
                const flowType = document.querySelector('input[name="fitTeeFlowType"]:checked').value;
                if (flowType === 'splitting') {
                    const q_in = parseLocalFloat(document.getElementById('q_in').value), q_out1 = parseLocalFloat(document.getElementById('q_out1').value), q_out2 = parseLocalFloat(document.getElementById('q_out2').value);
                    if (Math.abs(q_in - (q_out1 + q_out2)) > 1) throw new Error("Luftmængderne stemmer ikke overens (Ind ≈ Ud 1 + Ud 2).");
                    const d_in = parseLocalFloat(document.getElementById('d_in').value), d_out1 = parseLocalFloat(document.getElementById('d_out1').value), d_out2 = parseLocalFloat(document.getElementById('d_out2').value);
                    if (isNaN(d_in) || isNaN(d_out1) || isNaN(d_out2)) throw new Error("Ugyldige diametre.");
                    const results = physics.calculateBullheadTeeLoss({ q_in, q_out1, q_out2 }, { d_in, d_out1, d_out2 }, RHO);
                    addFitting({ id: Date.now(), name: `Dobbelt Afgr. (Ud 1)`, airflow: q_out1, pressureLoss: results.loss1, details: results.details1, type: 'tee' });
                    addFitting({ id: Date.now() + 1, name: `Dobbelt Afgr. (Ud 2)`, airflow: q_out2, pressureLoss: results.loss2, details: results.details2, type: 'tee' });
                } else { // merging
                    const q_in1 = parseLocalFloat(document.getElementById('q_in1').value), q_in2 = parseLocalFloat(document.getElementById('q_in2').value);
                    const d_common = parseLocalFloat(document.getElementById('d_common').value), d_in1 = parseLocalFloat(document.getElementById('d_in1').value), d_in2 = parseLocalFloat(document.getElementById('d_in2').value);
                    const results = physics.calculateConvergingBullheadTeeLoss({ q_in1, q_in2 }, { d_in1, d_in2, d_common }, RHO);
                    addFitting({ id: Date.now(), name: `Dobbelt Afgr. (Ind 1)`, airflow: q_in1, pressureLoss: results.loss1, details: results.details1, type: 'tee' });
                    addFitting({ id: Date.now() + 1, name: `Dobbelt Afgr. (Ind 2)`, airflow: q_in2, pressureLoss: results.loss2, details: results.details2, type: 'tee' });
                }
            } else { // Standard Tees
                const flowType = document.querySelector('input[name="fitTeeFlowType"]:checked').value;
                if (flowType === 'splitting') {
                    const q_in = parseLocalFloat(document.getElementById('q_in').value), q_straight = parseLocalFloat(document.getElementById('q_straight').value), q_branch = parseLocalFloat(document.getElementById('q_branch').value);
                    if (Math.abs(q_in - (q_straight + q_branch)) > 1) throw new Error("Luftmængderne stemmer ikke overens (Ind ≈ Ligeud + Afgrening).");
                    const d_in = parseLocalFloat(document.getElementById('d_in').value);
                    const d_straight = isSym ? d_in : parseLocalFloat(document.getElementById('d_straight').value);
                    const d_branch = isSym ? d_in : parseLocalFloat(document.getElementById('d_branch').value);
                    const results = physics.calculateTeePressureLoss({ q_in, q_straight, q_branch }, { d_in, d_straight, d_branch }, RHO);
                    const name_base = isSym ? `T-stykke Sym. Ø${d_in}` : `T-stykke Asym.`;
                    addFitting({ id: Date.now(), name: `${name_base} (Ligeud)`, airflow: q_straight, pressureLoss: results.loss_straight, details: results.details_straight, type: 'tee' });
                    addFitting({ id: Date.now() + 1, name: `${name_base} (Afgrening)`, airflow: q_branch, pressureLoss: results.loss_branch, details: results.details_branch, type: 'tee' });
                } else { // merging
                    const q_straight = parseLocalFloat(document.getElementById('q_straight').value), q_branch = parseLocalFloat(document.getElementById('q_branch').value);
                    const d_common = parseLocalFloat(document.getElementById('d_in').value);
                    const d_straight = isSym ? d_common : parseLocalFloat(document.getElementById('d_straight').value);
                    const d_branch = isSym ? d_common : parseLocalFloat(document.getElementById('d_branch').value);
                    const results = physics.calculateConvergingTeePressureLoss({ q_straight, q_branch }, { d_common, d_straight, d_branch }, RHO);
                    const name_base = isSym ? `T-stykke Udsugning Sym. Ø${d_common}` : `T-stykke Udsugning Asym.`;
                    addFitting({ id: Date.now(), name: `${name_base} (fra Ligeud)`, airflow: q_straight, pressureLoss: results.loss_straight, details: results.details_straight, type: 'tee' });
                    addFitting({ id: Date.now() + 1, name: `${name_base} (fra Afgrening)`, airflow: q_branch, pressureLoss: results.loss_branch, details: results.details_branch, type: 'tee' });
                }
            }
        } else {
            // Standard Fittings
            const q_m3h = parseLocalFloat(document.getElementById('fit_airflow').value);
            if (isNaN(q_m3h) || q_m3h <= 0) throw new Error("Ugyldig luftmængde.");
            const Q = q_m3h / 3600;
            let name, zeta, A, v, d_hyd, Pdyn_Pa, loss, details = {};

            switch (type) {
                case 'bend_circ': {
                    const d = parseLocalFloat(document.getElementById('d').value);
                    const angle = parseLocalFloat(document.getElementById('angle').value);
                    const radius = parseLocalFloat(document.getElementById('radius').value);
                    if (isNaN(d) || isNaN(radius) || d <= 0) throw new Error("Ugyldig diameter eller radius.");
                    const rd_ratio = radius / d;
                    const rd_key = rd_ratio < 1.25 ? "rd1_0" : "rd1_5";
                    zeta = physics.interpolateValue(angle, d, physics.CIRCULAR_BEND_ZETA[rd_key]);
                    d_hyd = getInternalDim(d) / 1000;
                    A = Math.PI * (d_hyd / 2) ** 2;
                    v = Q / A;
                    name = `Bøjning Cirk. Ø${d} (R=${radius}mm)`;
                    break;
                }
                case 'bend_rect': {
                    const h = parseLocalFloat(document.getElementById('h').value);
                    const w = parseLocalFloat(document.getElementById('w').value);
                    const angle_r = parseLocalFloat(document.getElementById('angle').value);
                    const radius = parseLocalFloat(document.getElementById('radius').value);
                    const rh_ratio = radius / h;
                    const hw_ratio = h / w;
                    const zeta_base = physics.interpolateValue(hw_ratio, rh_ratio, physics.RECTANGULAR_BEND_ZETA.mainTable);
                    const k_factor = physics.interpolateValue(angle_r, null, physics.RECTANGULAR_BEND_ZETA.kFactor);
                    zeta = zeta_base * k_factor;
                    let h_int = getInternalDim(h) / 1000, w_int = getInternalDim(w) / 1000;
                    d_hyd = (2 * h_int * w_int) / (h_int + w_int);
                    A = Math.PI * (d_hyd / 2) ** 2;
                    v = Q / A;
                    name = `Bøjning Rekt. ${h}x${w} (R=${radius}mm)`;
                    break;
                }
                case 'expansion':
                case 'contraction': {
                    const isExpansion = type === 'expansion';
                    const d1 = parseLocalFloat(document.getElementById('d1').value);
                    const d2 = parseLocalFloat(document.getElementById('d2').value);
                    let angle;
                    const geoType = document.querySelector('input[name="geo_type"]:checked').value;
                    if (geoType === 'angle') {
                        angle = parseLocalFloat(document.getElementById('angle').value);
                    } else {
                        const length = parseLocalFloat(document.getElementById('length').value);
                        const radiusDiff = Math.abs(d1 - d2) / 2;
                        angle = 2 * (Math.atan(radiusDiff / length) * (180 / Math.PI));
                    }
                    const A1 = Math.PI * (getInternalDim(d1) / 2000) ** 2, A2 = Math.PI * (getInternalDim(d2) / 2000) ** 2;
                    const area_ratio = A2 / A1;
                    const zeta_table = isExpansion ? physics.EXPANSION_ZETA : physics.CONTRACTION_ZETA;
                    zeta = physics.interpolateValue(angle, area_ratio, zeta_table);
                    A = isExpansion ? A1 : A2;
                    v = Q / A;
                    name = `${isExpansion ? 'Udvidelse' : 'Indsnævring'} Cirk. Ø${d1} -> Ø${d2}`;
                    break;
                }
                case 'expansion_rect':
                case 'contraction_rect': {
                    const isExpansion = type === 'expansion_rect';
                    const h1 = parseLocalFloat(document.getElementById('h1').value), w1 = parseLocalFloat(document.getElementById('w1').value);
                    const h2 = parseLocalFloat(document.getElementById('h2').value), w2 = parseLocalFloat(document.getElementById('w2').value);
                    let angle;
                    const geoType = document.querySelector('input[name="geo_type"]:checked').value;
                    if (geoType === 'angle') {
                        angle = parseLocalFloat(document.getElementById('angle').value);
                    } else {
                        const length = parseLocalFloat(document.getElementById('length').value);
                        const hDiff = Math.abs(h1 - h2) / 2;
                        const wDiff = Math.abs(w1 - w2) / 2;
                        const angleH = 2 * (Math.atan(hDiff / length) * (180 / Math.PI));
                        const angleW = 2 * (Math.atan(wDiff / length) * (180 / Math.PI));
                        angle = Math.max(angleH, angleW);
                    }
                    const A1 = (getInternalDim(h1) / 1000) * (getInternalDim(w1) / 1000);
                    const A2 = (getInternalDim(h2) / 1000) * (getInternalDim(w2) / 1000);
                    const area_ratio = A2 / A1;
                    const zeta_table = isExpansion ? physics.RECT_EXPANSION_ZETA : physics.RECT_CONTRACTION_ZETA;
                    zeta = physics.interpolateValue(angle, area_ratio, zeta_table);
                    A = isExpansion ? A1 : A2;
                    v = Q / A;
                    name = `${isExpansion ? 'Udvidelse' : 'Indsnævring'} Rekt. ${h1}x${w1} -> ${h2}x${w2}`;
                    break;
                }
                case 'transition_round_rect':
                case 'transition_rect_round': {
                    const d = parseLocalFloat(document.getElementById('d').value);
                    const h = parseLocalFloat(document.getElementById('h').value);
                    const w = parseLocalFloat(document.getElementById('w').value);
                    const A_round = Math.PI * (getInternalDim(d) / 2000) ** 2;
                    const A_rect = (getInternalDim(h) / 1000) * (getInternalDim(w) / 1000);
                    const A1 = (type === 'transition_round_rect') ? A_round : A_rect;
                    const A2 = (type === 'transition_round_rect') ? A_rect : A_round;
                    const isExpansion = A2 > A1;
                    const area_ratio = A1 / A2;
                    let angle;
                    const geoType = document.querySelector('input[name="geo_type"]:checked').value;
                    if (geoType === 'angle') {
                        angle = parseLocalFloat(document.getElementById('angle').value);
                    } else {
                        const length = parseLocalFloat(document.getElementById('length').value);
                        const d_eq_rect = (2 * (getInternalDim(h) / 1000) * (getInternalDim(w) / 1000)) / ((getInternalDim(h) / 1000) + (getInternalDim(w) / 1000));
                        const d_eq_circ = getInternalDim(d) / 1000;
                        const radiusDiff = Math.abs(d_eq_circ - d_eq_rect) / 2;
                        angle = 2 * (Math.atan(radiusDiff / (length / 1000)) * (180 / Math.PI));
                    }
                    let zeta_table;
                    if (type === 'transition_rect_round' && globalFlowType === 'splitting') zeta_table = physics.RECT_TO_ROUND_SUPPLY_ZETA;
                    else if (type === 'transition_round_rect' && globalFlowType === 'merging') zeta_table = physics.ROUND_TO_RECT_EXHAUST_ZETA;
                    else throw new Error(`Data mangler for denne specifikke kombination (${type}, ${globalFlowType}).`);
                    zeta = physics.interpolateValue(angle, area_ratio, zeta_table);
                    A = isExpansion ? A1 : A2;
                    v = Q / A;
                    name = (type === 'transition_round_rect') ? `Overgang Ø${d} -> ${h}x${w}` : `Overgang ${h}x${w} -> Ø${d}`;
                    break;
                }
            }

            Pdyn_Pa = (RHO / 2) * v ** 2;
            loss = zeta * Pdyn_Pa;
            details = { zeta, Pdyn_Pa, A_m2: A, v_ms: v };
            addFitting({ id: Date.now(), name, airflow: q_m3h, pressureLoss: loss, details, type: 'standard' });
        }
        ui.renderFittingsResult();
    } catch (error) {
        fittingsResultsContainer.innerHTML = `<div class="error-message">Fejl: ${error.message}</div>`;
    }
}

// --- Smart Transition Generator (Visuel Logik Kun) ---
function createTransitionComponent(visualInlet, visualOutlet, airflow, globalFlowType, previousComponent) {
    if (!visualInlet || !visualOutlet) return null;

    let needsTransition = false;
    let isVisualExpansion = false;
    let visualFittingType = 'transition';

    // 1. Identificer VISUEL overgangstype (Hvad der er tegnet på skærmen)
    if (visualInlet.shape === 'round' && visualOutlet.shape === 'round') {
        if (visualInlet.d !== visualOutlet.d) {
            needsTransition = true;
            isVisualExpansion = visualOutlet.d > visualInlet.d;
            visualFittingType = isVisualExpansion ? 'expansion' : 'contraction';
        }
    } else if (visualInlet.shape === 'rect' && visualOutlet.shape === 'rect') {
        if (visualInlet.h !== visualOutlet.h || visualInlet.w !== visualOutlet.w) {
            needsTransition = true;
            isVisualExpansion = (visualOutlet.h * visualOutlet.w) > (visualInlet.h * visualInlet.w);
            visualFittingType = isVisualExpansion ? 'expansion_rect' : 'contraction_rect';
        }
    } else if (visualInlet.shape !== visualOutlet.shape) {
        needsTransition = true;
        visualFittingType = visualInlet.shape === 'round' ? 'transition_round_rect' : 'transition_rect_round';
        const A_in = visualInlet.shape === 'round' ? Math.PI * (getInternalDim(visualInlet.d) / 2000) ** 2 : (getInternalDim(visualInlet.h) / 1000) * (getInternalDim(visualInlet.w) / 1000);
        const A_out = visualOutlet.shape === 'round' ? Math.PI * (getInternalDim(visualOutlet.d) / 2000) ** 2 : (getInternalDim(visualOutlet.h) / 1000) * (getInternalDim(visualOutlet.w) / 1000);
        isVisualExpansion = A_out > A_in;
    }

    if (!needsTransition) return null;

    // Navngivning ud fra tegneretning (Input-retning)
    const name = isVisualExpansion ? 'Udvidelse (auto)' : (visualFittingType.includes('transition') ? 'Formovergang (auto)' : 'Indsnævring (auto)');
    const detailIn = visualInlet.shape === 'round' ? `Ø${visualInlet.d}` : `${visualInlet.h}x${visualInlet.w}`;
    const detailOut = visualOutlet.shape === 'round' ? `Ø${visualOutlet.d}` : `${visualOutlet.h}x${visualOutlet.w}`;
    
    let details = `fra ${detailIn} til ${detailOut}`;
    if (globalFlowType === 'merging') {
        details += ` (Fysisk flow: ${isVisualExpansion ? 'Indsnævring' : 'Udvidelse'})`;
    }

    // Arv termodynamiske egenskaber fra den kanal den forlænger
    const pProps = previousComponent && previousComponent.properties ? previousComponent.properties : {};

    // Opret og returner ægte Fitting-komponent (Kun properties, fysik beregnes i motoren)
    return {
        id: 'transition_' + Date.now() + Math.floor(Math.random() * 1000),
        type: visualFittingType,
        name: name,
        details: details,
        isAutoGenerated: true,
        isIncluded: true,
        length: 500, // Visuel standard længde til 3D diagrammet
        shape: visualInlet.shape === 'round' ? 'circular' : 'rectangular',
        diameter: visualInlet.d || 0,
        width: visualInlet.w || 0,
        height: visualInlet.h || 0,
        shapeOut: visualOutlet.shape === 'round' ? 'circular' : 'rectangular',
        diameterOut: visualOutlet.d || 0,
        widthOut: visualOutlet.w || 0,
        heightOut: visualOutlet.h || 0,
        properties: {
            type: visualFittingType,
            angle: 30, // Standard vinkel
            inletShape: visualInlet.shape,
            outletShape: visualOutlet.shape,
            d1: visualInlet.d || 0,
            d2: visualOutlet.d || 0,
            h1: visualInlet.h || 0,
            w1: visualInlet.w || 0,
            h2: visualOutlet.h || 0,
            w2: visualOutlet.w || 0,
            // Nedarvede isoleringsegenskaber for korrekt termodynamik
            ambientTemp: pProps.ambientTemp,
            isoThick: pProps.isoThick,
            isoLambda: pProps.isoLambda
        },
        state: {} 
    };
}


function getDuctData(suffix) {
    const elLength = document.getElementById('ductLength' + suffix);
    if (!elLength) return null; 

    const length = parseLocalFloat(elLength.value);
    const shape = document.querySelector(`input[name="sysDuctShape${suffix}"]:checked`).value;

    let properties = { type: 'straightDuct', shape, length };
    let name, details;

    if (shape === 'round') {
        const diameter = parseLocalFloat(document.getElementById('ductDiameter' + suffix).value);
        properties.diameter = diameter;
        properties.d = diameter; 
        name = `Lige Kanal Ø${diameter}`; details = `${length}m`;
    } else {
        const sideA = parseLocalFloat(document.getElementById('ductSideA' + suffix).value);
        const sideB = parseLocalFloat(document.getElementById('ductSideB' + suffix).value);
        properties.sideA = sideA;
        properties.sideB = sideB;
        properties.h = sideA; 
        properties.w = sideB; 
        name = `Lige Kanal ${sideA}x${sideB}`; details = `${length}m`;
    }

    const elAmbient = document.getElementById('ductAmbient' + suffix);
    if (elAmbient && elAmbient.value !== '') properties.ambientTemp = parseLocalFloat(elAmbient.value);

    const elIsoThick = document.getElementById('ductIsoThick' + suffix);
    if (elIsoThick && elIsoThick.value !== '') properties.isoThick = parseLocalFloat(elIsoThick.value);

    const elIsoLambda = document.getElementById('ductIsoLambda' + suffix);
    if (elIsoLambda && elIsoLambda.value !== '') properties.isoLambda = parseLocalFloat(elIsoLambda.value);

    return {
        type: properties.type,
        name,
        details,
        properties,
        state: {}
    };
}

function getFittingData(suffix, typeOverride = null) {
    const typeSelect = document.getElementById('systemFittingType' + suffix);
    const fittingType = typeOverride || (typeSelect ? typeSelect.value : null);

    if (!fittingType) return null;

    let name, details, properties = { type: fittingType };

    const s = (id) => {
        const el = document.getElementById(id + suffix);
        return el ? el.value : '';
    };
    const f = (id) => parseLocalFloat(s(id));
    const radio = (n) => {
        const el = document.querySelector(`input[name="${n}${suffix}"]:checked`);
        return el ? el.value : null;
    };

    const orientation = s('sys_orientation');
    if (orientation) properties.orientation = orientation;

    switch (fittingType) {
        case 'bend_circ': {
            properties.d = f('sys_d');
            properties.angle = f('sys_angle');
            properties.rd = f('sys_rd');
            name = `Bøjning Cirk. Ø${properties.d}`;
            details = `${properties.angle}° R=${properties.rd * properties.d}mm`;
            break;
        }
        case 'bend_rect': {
            properties.h = f('sys_h');
            properties.w = f('sys_w');
            properties.angle = f('sys_angle_r');
            properties.rh = f('sys_rh');
            name = `Bøjning Rekt. ${properties.h}x${properties.w}`;
            details = `${properties.angle}°`;
            break;
        }
        case 'expansion':
        case 'contraction': {
            const isExpansion = fittingType === 'expansion';
            properties.d1 = f('sys_d1');
            properties.d2 = f('sys_d2');
            properties.angle = f('sys_angle_dim');
            name = isExpansion ? `Udvidelse Ø${properties.d1} -> Ø${properties.d2}` : `Indsnævring Ø${properties.d1} -> Ø${properties.d2}`;
            details = `${properties.angle}°`;
            break;
        }
        case 'tee_sym':
        case 'tee_asym':
        case 'tee_bullhead': {
            const isSym = fittingType === 'tee_sym';
            const isBullhead = fittingType === 'tee_bullhead';

            if (isBullhead) {
                properties.path = radio('sysTeePath'); 
                properties.q_out1 = f('sys_tee_q_out1');
                properties.q_out2 = f('sys_tee_q_out2');
                properties.d_in = f('sys_tee_d_in');
                properties.d_out1 = f('sys_tee_d_out1');
                properties.d_out2 = f('sys_tee_d_out2');

                name = properties.path === 'path1' ? `Dobbelt T (Gren 1)` : `Dobbelt T (Gren 2)`;
                details = `Ø${properties.d_in} -> Ø${properties.d_out1}/Ø${properties.d_out2}`;
            } else {
                properties.flowType = radio('sysTeeFlowType') || 'splitting'; 
                properties.path = radio('sysTeePath'); 
                properties.d_in = f('sys_tee_d_in');
                properties.d_straight = isSym ? properties.d_in : f('sys_tee_d_straight');
                properties.d_branch = isSym ? properties.d_in : f('sys_tee_d_branch');

                properties.q_straight = f('sys_tee_q_straight');
                properties.q_branch = f('sys_tee_q_branch');
                name = properties.path === 'straight' ? `T-stykke (Ligeud)` : `T-stykke (Afgrening)`;
            }
            break;
        }
    }

    if (!name && fittingType) return null;

    const elAmbient = document.getElementById('sys_ambient' + suffix);
    if (elAmbient && elAmbient.value !== '') properties.ambientTemp = parseLocalFloat(elAmbient.value);

    const elIsoThick = document.getElementById('sys_isoThick' + suffix);
    if (elIsoThick && elIsoThick.value !== '') properties.isoThick = parseLocalFloat(elIsoThick.value);

    const elIsoLambda = document.getElementById('sys_isoLambda' + suffix);
    if (elIsoLambda && elIsoLambda.value !== '') properties.isoLambda = parseLocalFloat(elIsoLambda.value);

    return {
        type: fittingType,
        name,
        details,
        properties,
        state: {} 
    };
}


function calculateComponentPhysics(component, incomingFlow, incomingTemp, incomingDim, globalParams, calculateThermodynamicsFlag = true) {
    const { RHO, NU, globalAmbient, systemTemp } = globalParams;
    let newCalc = {};
    const q_m = incomingFlow * RHO / 3600; 
    const p = component.properties;
    const compAmbient = p.ambientTemp !== undefined ? p.ambientTemp : globalParams.globalAmbient;
    const isoThick = p.isoThick ? p.isoThick / 1000 : 0; 
    const isoLambda = p.isoLambda || 0.037;

    let t_out_val = incomingTemp;
    let q_loss_val = 0;

    // --- 1. Calculate Component Physics based on properties and incoming flow ---
    if (component.type === 'straightDuct') {
        const Q = incomingFlow / 3600;
        let performance, inletDim, outletDim, perimeter;

        if (p.shape === 'round') {
            inletDim = outletDim = { shape: 'round', d: p.diameter };
            performance = physics.getPerformance(Q, p.diameter / 1000, { shape: 'round', a: p.diameter }, RHO, NU);
            perimeter = Math.PI * (p.diameter / 1000);
        } else {
            inletDim = outletDim = { shape: 'rect', h: p.sideA, w: p.sideB };
            performance = physics.getPerformance(Q, 0, { shape: 'rect', a: p.sideA, b: p.sideB }, RHO, NU);
            perimeter = 2 * ((p.sideA / 1000) + (p.sideB / 1000));
        }

        if (calculateThermodynamicsFlag) {
            const thermo = physics.calculateTemperatureDrop(incomingTemp, compAmbient, p.length, perimeter, q_m, isoThick, isoLambda, globalParams.globalRH);
            t_out_val = thermo.t_out;
            q_loss_val = thermo.q_loss;
        }

        newCalc = {
            airflow_in: incomingFlow,
            airflow_out: { 'outlet': incomingFlow },
            velocity: performance.velocity,
            pressureLoss: performance.pressureDrop * p.length,
            zeta: null,
            inletDimension: inletDim,
            outletDimension: { 'outlet': outletDim },
            calculationDetails: performance,
            temperature_in: incomingTemp,
            temperature_out: { 'outlet': t_out_val },
            heatLoss: q_loss_val
        };
    } else if (component.type === 'manualLoss') {
        const inletDim = incomingDim || { shape: 'round', d: 0 };
        newCalc = {
            airflow_in: incomingFlow,
            airflow_out: { 'outlet': incomingFlow },
            velocity: null,
            pressureLoss: p.pressureLoss,
            zeta: null,
            inletDimension: inletDim,
            outletDimension: { 'outlet': inletDim },
            calculationDetails: null,
            temperature_in: incomingTemp,
            temperature_out: { 'outlet': t_out_val },
            heatLoss: 0
        };
    } else {
        const Q = incomingFlow / 3600;
        let inletDim, outletDim, v, zeta = 0, Pdyn_Pa = 0, A = 0, pressureLoss = 0, airflow_out = {}, temp_out = {};
        let calculationDetails = {};
        let q_loss_val = 0;

        if (p.type === 'bend_circ') {
            inletDim = outletDim = { shape: 'round', d: p.d };
            const rd_key = p.rd < 1.25 ? "rd1_0" : "rd1_5";
            zeta = physics.interpolateValue(p.angle, p.d, physics.CIRCULAR_BEND_ZETA[rd_key]);
            A = Math.PI * (getInternalDim(p.d) / 2000) ** 2;
            v = Q / A;
            Pdyn_Pa = (RHO / 2) * v ** 2;
            pressureLoss = zeta * Pdyn_Pa;
            airflow_out = { 'outlet': incomingFlow };

            if (calculateThermodynamicsFlag) {
                const L_eff = 2 * Math.PI * (p.rd * p.d / 1000) * (p.angle / 360);
                const perim_eff = Math.PI * (p.d / 1000);
                const thermo = physics.calculateTemperatureDrop(incomingTemp, compAmbient, L_eff, perim_eff, q_m, isoThick, isoLambda, globalParams.globalRH);
                temp_out = { 'outlet': thermo.t_out };
                q_loss_val = thermo.q_loss;
            } else {
                temp_out = { 'outlet': incomingTemp };
            }

            calculationDetails = { A_m2: A, v_ms: v, zeta, Pdyn_Pa };
        } else if (p.type === 'bend_rect') {
            inletDim = outletDim = { shape: 'rect', h: p.h, w: p.w };
            const hw_ratio = p.h / p.w;
            const zeta_base = physics.interpolateValue(hw_ratio, p.rh, physics.RECTANGULAR_BEND_ZETA.mainTable);
            const k_factor = physics.interpolateValue(p.angle, null, physics.RECTANGULAR_BEND_ZETA.kFactor);
            zeta = zeta_base * k_factor;
            let h_int = getInternalDim(p.h) / 1000, w_int = getInternalDim(p.w) / 1000;
            A = h_int * w_int;
            v = Q / A;
            Pdyn_Pa = (RHO / 2) * v ** 2;
            pressureLoss = zeta * Pdyn_Pa;
            airflow_out = { 'outlet': incomingFlow };

            if (calculateThermodynamicsFlag) {
                const L_eff = 2 * Math.PI * (p.rh * p.w / 1000) * (p.angle / 360);
                const perim_eff = 2 * (p.w / 1000 + p.h / 1000);
                const thermo = physics.calculateTemperatureDrop(incomingTemp, compAmbient, L_eff, perim_eff, q_m, isoThick, isoLambda, globalParams.globalRH);
                temp_out = { 'outlet': thermo.t_out };
                q_loss_val = thermo.q_loss;
            } else {
                temp_out = { 'outlet': incomingTemp };
            }

            calculationDetails = { A_m2: A, v_ms: v, zeta, Pdyn_Pa };
        } else if (p.type.includes('expansion') || p.type.includes('contraction') || p.type.includes('transition')) {
            // ALT DIMENSIONSÆNDRING (Inkl. auto-genererede)
            const isExhaust = globalParams.globalFlowType === 'merging';

            let A1_visual, A2_visual;
            // Bestem input-dimensioner ud fra type
            const shape1 = p.inletShape || (p.type.includes('rect') && !p.type.includes('transition') ? 'rect' : (p.type === 'transition_rect_round' ? 'rect' : 'round'));
            const shape2 = p.outletShape || (p.type.includes('rect') && !p.type.includes('transition') ? 'rect' : (p.type === 'transition_round_rect' ? 'rect' : 'round'));
            
            let dim1_d = p.d1 || p.d || 0, dim1_h = p.h1 || p.h || 0, dim1_w = p.w1 || p.w || 0;
            let dim2_d = p.d2 || p.d || 0, dim2_h = p.h2 || p.h || 0, dim2_w = p.w2 || p.w || 0;
            
            inletDim = shape1 === 'round' ? { shape: 'round', d: dim1_d } : { shape: 'rect', h: dim1_h, w: dim1_w };
            outletDim = shape2 === 'round' ? { shape: 'round', d: dim2_d } : { shape: 'rect', h: dim2_h, w: dim2_w };
            
            A1_visual = shape1 === 'round' ? Math.PI * (getInternalDim(dim1_d) / 2000) ** 2 : (getInternalDim(dim1_h) / 1000) * (getInternalDim(dim1_w) / 1000);
            A2_visual = shape2 === 'round' ? Math.PI * (getInternalDim(dim2_d) / 2000) ** 2 : (getInternalDim(dim2_h) / 1000) * (getInternalDim(dim2_w) / 1000);

            // Flow-retning logik
            const isExpansionVisually = A2_visual > A1_visual;
            const isExpansionAerodynamically = isExhaust ? !isExpansionVisually : isExpansionVisually;

            const A_in = isExhaust ? A2_visual : A1_visual;
            const A_out = isExhaust ? A1_visual : A2_visual;
            const area_ratio = A_out / A_in;

            let zeta_table;
            if (p.type.includes('transition')) {
                if (isExhaust) {
                    zeta_table = shape1 === 'round' ? physics.ROUND_TO_RECT_EXHAUST_ZETA : physics.RECT_TO_ROUND_SUPPLY_ZETA;
                } else {
                    zeta_table = isExpansionAerodynamically ? physics.EXPANSION_ZETA : physics.CONTRACTION_ZETA;
                }
            } else if (isExpansionAerodynamically) {
                zeta_table = p.type.includes('rect') ? physics.RECT_EXPANSION_ZETA : physics.EXPANSION_ZETA;
            } else {
                zeta_table = p.type.includes('rect') ? physics.RECT_CONTRACTION_ZETA : physics.CONTRACTION_ZETA;
            }

            zeta = physics.interpolateValue(p.angle || 30, area_ratio, zeta_table);
            const A_ref = Math.min(A_in, A_out); // Standard for disse tabeller
            v = Q / A_ref;
            Pdyn_Pa = (RHO / 2) * v ** 2;
            pressureLoss = zeta * Pdyn_Pa;
            airflow_out = { 'outlet': incomingFlow };

            if (calculateThermodynamicsFlag) {
                const d1_eq = Math.sqrt(4 * A1_visual / Math.PI);
                const d2_eq = Math.sqrt(4 * A2_visual / Math.PI);
                const angleRad = (p.angle || 30) * Math.PI / 180;
                let L_eff = Math.abs(d1_eq - d2_eq) / 2 / Math.tan(angleRad / 2);
                if (L_eff < 0.1 || isNaN(L_eff) || !isFinite(L_eff)) L_eff = 0.5;
                const perim_eff = Math.PI * (d1_eq + d2_eq) / 2;
                const thermo = physics.calculateTemperatureDrop(incomingTemp, compAmbient, L_eff, perim_eff, q_m, isoThick, isoLambda, globalParams.globalRH);
                temp_out = { 'outlet': thermo.t_out };
                q_loss_val = thermo.q_loss;
            } else {
                temp_out = { 'outlet': incomingTemp };
            }

            calculationDetails = { A_m2: A_ref, v_ms: v, zeta, Pdyn_Pa };

        } else if (p.type === 'tee_sym' || p.type === 'tee_asym') {
            inletDim = { shape: 'round', d: p.d_in };

            const L_in = p.d_in / 1000;
            const perim_in = Math.PI * L_in;
            const L_st = p.d_straight / 1000;
            const perim_st = Math.PI * L_st;
            const L_br = p.d_branch / 1000;
            const perim_br = Math.PI * L_br;

            const isMerging = p.flowType === 'merging' || globalParams.globalFlowType === 'merging';

            if (!isMerging) {
                if (calculateThermodynamicsFlag) {
                    const thermo_in = physics.calculateTemperatureDrop(incomingTemp, compAmbient, L_in, perim_in, q_m, isoThick, isoLambda, globalParams.globalRH);
                    const t_mid = thermo_in.t_out;
                    let totalLoss = thermo_in.q_loss;

                    const q_m_st = (p.q_straight / 3600) * RHO;
                    const thermo_st = physics.calculateTemperatureDrop(t_mid, compAmbient, L_st, perim_st, q_m_st, isoThick, isoLambda, globalParams.globalRH);
                    totalLoss += thermo_st.q_loss;

                    const q_m_br = (p.q_branch / 3600) * RHO;
                    const thermo_br = physics.calculateTemperatureDrop(t_mid, compAmbient, L_br, perim_br, q_m_br, isoThick, isoLambda, globalParams.globalRH);
                    totalLoss += thermo_br.q_loss;

                    q_loss_val = totalLoss;
                    temp_out = { 'outlet_straight': thermo_st.t_out, 'outlet_branch': thermo_br.t_out, 'outlet': (p.path === 'straight' ? thermo_st.t_out : thermo_br.t_out) };
                } else {
                    temp_out = { 'outlet_straight': incomingTemp, 'outlet_branch': incomingTemp, 'outlet': incomingTemp };
                }

                const results = physics.calculateTeePressureLoss({ q_in: incomingFlow, q_straight: p.q_straight, q_branch: p.q_branch }, { d_in: p.d_in, d_straight: p.d_straight, d_branch: p.d_branch }, RHO);
                if (p.path === 'straight') {
                    pressureLoss = results.loss_straight;
                    outletDim = { shape: 'round', d: p.d_straight };
                    airflow_out = { 'outlet_straight': p.q_straight, 'outlet_branch': p.q_branch, 'outlet': p.q_straight };
                    calculationDetails = results.details_straight;
                } else {
                    pressureLoss = results.loss_branch;
                    outletDim = { shape: 'round', d: p.d_branch };
                    airflow_out = { 'outlet_straight': p.q_straight, 'outlet_branch': p.q_branch, 'outlet': p.q_branch };
                    calculationDetails = results.details_branch;
                }
            } else { // Merging
                if (calculateThermodynamicsFlag) {
                    const t_in_st = (p.path === 'straight') ? incomingTemp : globalParams.systemTemp;
                    const t_in_br = (p.path === 'branch') ? incomingTemp : globalParams.systemTemp;

                    const rho_st = physics.getAirProperties(t_in_st).RHO;
                    const rho_br = physics.getAirProperties(t_in_br).RHO;

                    const q_m_st = (p.q_straight / 3600) * rho_st;
                    const thermo_st = physics.calculateTemperatureDrop(t_in_st, compAmbient, L_st, perim_st, q_m_st, isoThick, isoLambda, globalParams.globalRH);

                    const q_m_br = (p.q_branch / 3600) * rho_br;
                    const thermo_br = physics.calculateTemperatureDrop(t_in_br, compAmbient, L_br, perim_br, q_m_br, isoThick, isoLambda, globalParams.globalRH);

                    const q_m_total = q_m_st + q_m_br;
                    const t_mixed = q_m_total > 0 ? ((q_m_st * thermo_st.t_out + q_m_br * thermo_br.t_out) / q_m_total) : incomingTemp;

                    const thermo_out = physics.calculateTemperatureDrop(t_mixed, compAmbient, L_in, perim_in, q_m, isoThick, isoLambda, globalParams.globalRH);

                    q_loss_val = thermo_st.q_loss + thermo_br.q_loss + thermo_out.q_loss;
                    temp_out = { 'outlet': thermo_out.t_out, 'outlet_straight': t_in_st, 'outlet_branch': t_in_br };
                } else {
                    temp_out = { 'outlet': incomingTemp, 'outlet_straight': incomingTemp, 'outlet_branch': incomingTemp };
                }

                let q_s = p.q_straight || ((incomingFlow || 0) / 2);
                let q_b = p.q_branch || ((incomingFlow || 0) / 2);

                if (Math.abs((q_s + q_b) - incomingFlow) > 1 && incomingFlow > 0) {
                    const ratio = incomingFlow / (q_s + q_b);
                    q_s *= ratio;
                    q_b *= ratio;
                }

                const results = physics.calculateConvergingTeePressureLoss({ q_straight: q_s, q_branch: q_b }, { d_common: p.d_in, d_straight: p.d_straight, d_branch: p.d_branch }, RHO);
                if (p.path === 'straight') {
                    pressureLoss = results.loss_straight || 0;
                    calculationDetails = results.details_straight || {};
                    inletDim = { shape: 'round', d: p.d_straight };
                } else {
                    pressureLoss = results.loss_branch || 0;
                    calculationDetails = results.details_branch || {};
                    inletDim = { shape: 'round', d: p.d_branch };
                }
                outletDim = { shape: 'round', d: p.d_in };

                airflow_out = { 'outlet_straight': q_s, 'outlet_branch': q_b, 'outlet': q_s }; 
            }
            v = calculationDetails.v_ms || 0;
        }

        newCalc = {
            airflow_in: incomingFlow,
            airflow_out: airflow_out,
            velocity: v,
            pressureLoss: pressureLoss,
            zeta: zeta,
            inletDimension: inletDim, 
            inletDimensions: { 'straight': { shape: 'round', d: p.d_main || p.d }, 'branch': { shape: 'round', d: p.d_branch } }, 
            outletDimension: { 'outlet': outletDim },
            calculationDetails: calculationDetails,
            temperature_in: incomingTemp,
            temperature_out: temp_out,
            heatLoss: q_loss_val
        };
    }

    return newCalc;
}

// Function to recalculate the entire system chain based on Graph Topology
function recalculateSystem() {
    const graph = stateManager.getGraph();
    const userNodes = {};
    const originalEdges = [...graph.edges];

    Object.values(graph.nodes).forEach(n => {
        if (!n.isAutoGenerated) userNodes[n.id] = { ...n };
    });

    const userEdges = [];
    Object.values(userNodes).forEach(un => {
        const outEdges = originalEdges.filter(e => e.from === un.id);
        outEdges.forEach(e => {
            let currentEdge = e;
            while (currentEdge) {
                const nextNode = graph.nodes[currentEdge.to];
                if (!nextNode) break;
                if (!nextNode.isAutoGenerated) {
                    userEdges.push({
                        from: un.id,
                        fromPort: e.fromPort,
                        to: nextNode.id,
                        toPort: currentEdge.toPort
                    });
                    break;
                }
                currentEdge = originalEdges.find(nextE => nextE.from === nextNode.id && nextE.fromPort === 'outlet');
            }
        });
    });

    const flowTypeEl = document.querySelector('input[name="systemFlowType"]:checked');
    const globalFlowType = flowTypeEl ? flowTypeEl.value : 'splitting'; 

    const startAirflowEl = document.getElementById('system_airflow');
    const startAirflow = startAirflowEl ? parseLocalFloat(startAirflowEl.value) : 1000;

    const tempEl = document.getElementById('temperature');
    const temp = tempEl ? parseLocalFloat(tempEl.value) : 20;

    const ambEl = document.getElementById('ambient_temperature');
    const globalAmbient = ambEl ? parseLocalFloat(ambEl.value) : 20;

    const rhEl = document.getElementById('humidity');
    const globalRH = rhEl ? parseLocalFloat(rhEl.value) : 50;

    const { RHO, NU } = physics.getAirProperties(temp);
    const globalParams = { globalFlowType, globalAmbient, globalRH, RHO, NU, systemTemp: temp };

    stateManager.clearSystem();

    function traverseAndCalculate(nodeId, incomingFlow, incomingTemp, incomingDim, parentId, parentPort) {
        const comp = userNodes[nodeId];
        if (!comp) return;

        const activeFlow = comp.isIncluded === false ? 0 : incomingFlow;

        let newCalc = calculateComponentPhysics(comp, activeFlow, incomingTemp, incomingDim, globalParams, false);
        comp.state = newCalc;

        let currentParentId = parentId;
        let currentParentPort = parentPort;

        let childAttachDim = newCalc.inletDimension;
        if (globalParams.globalFlowType === 'merging') {
            childAttachDim = newCalc.outletDimension ? (newCalc.outletDimension['outlet'] || newCalc.outletDimension['outlet_straight'] || newCalc.outletDimension['outlet_branch']) : newCalc.inletDimension;
        }

        // Tjek for automatisk overgang og brug ALTID visuel rækkefølge: Parent -> Child
        if (incomingDim && childAttachDim && !physics.areDimensionsEqual(incomingDim, childAttachDim)) {
            // Find parent komponenten så vi kan arve isoleringsdata derfra
            const parentComp = parentId ? graph.nodes[parentId] : null;

            const transition = createTransitionComponent(incomingDim, childAttachDim, activeFlow, globalParams.globalFlowType, parentComp);
            if (transition) {
                transition.state = calculateComponentPhysics(transition, activeFlow, incomingTemp, incomingDim, globalParams, false);
                stateManager.addSystemComponent(transition, currentParentId, currentParentPort, 'inlet');
                currentParentId = transition.id;
                currentParentPort = 'outlet';
            }
        }

        stateManager.addSystemComponent(comp, currentParentId, currentParentPort, 'inlet');

        const childrenEdges = userEdges.filter(e => e.from === nodeId);
        childrenEdges.forEach(edge => {
            const outPort = edge.fromPort;
            const childId = edge.to;

            let portFlow = activeFlow;
            if (comp.state.airflow_out && comp.state.airflow_out[outPort] !== undefined) {
                portFlow = comp.state.airflow_out[outPort];
            } else if (comp.state.airflow_out && comp.state.airflow_out['outlet'] !== undefined) {
                portFlow = comp.state.airflow_out['outlet'];
            }

            let portTemp = incomingTemp;
            if (comp.state.temperature_out && comp.state.temperature_out[outPort] !== undefined) {
                portTemp = comp.state.temperature_out[outPort];
            } else if (comp.state.temperature_out && comp.state.temperature_out['outlet'] !== undefined) {
                portTemp = comp.state.temperature_out['outlet'];
            }

            let portDim = null;
            if (globalParams.globalFlowType === 'merging' && comp.state.inletDimensions) {
                const branchMap = { 'outlet_straight': 'straight', 'outlet_branch': 'branch' };
                const branchKey = branchMap[outPort] || 'straight';
                portDim = comp.state.inletDimensions[branchKey];
            } else if (comp.state.outletDimension && comp.state.outletDimension[outPort]) {
                portDim = comp.state.outletDimension[outPort];
            } else if (comp.state.outletDimension && comp.state.outletDimension['outlet']) {
                portDim = comp.state.outletDimension['outlet'];
            }

            traverseAndCalculate(childId, portFlow, portTemp, portDim, comp.id, outPort);
        });
    }

    const rootIds = Object.keys(userNodes).filter(id => !userEdges.find(e => e.to === id));

    rootIds.forEach(rootId => {
        traverseAndCalculate(rootId, startAirflow, temp, null, null, null);
    });

    function traverseAndCalculateThermodynamics(nodeId, incomingTemp) {
        const comp = getSystemComponent(nodeId);
        if (!comp || !comp.state) return incomingTemp;

        const isExhaust = globalParams.globalFlowType === 'merging';
        const childrenEdges = userEdges.filter(e => e.from === nodeId);
        comp.state.heatLoss = 0; 

        // Hjælperfunktion til at regne overflade på rør og overgange (Gælder for både Indblæs og Udsug)
        const getSurfaceProps = (c) => {
            let length = 0;
            let perimeter = 0;
            let hasSurface = false;

            if (c.type === 'straightDuct') {
                length = c.properties.length;
                if (c.state.inletDimension && c.state.inletDimension.shape === 'round') {
                    perimeter = Math.PI * (c.state.inletDimension.d / 1000);
                } else if (c.state.inletDimension) {
                    perimeter = 2 * ((c.state.inletDimension.w / 1000) + (c.state.inletDimension.h / 1000));
                }
                hasSurface = true;
            } else if (c.type.includes('expansion') || c.type.includes('contraction') || c.type.includes('transition')) {
                const p = c.properties;
                const dim1_d = p.d1 || p.d || 0, dim1_h = p.h1 || p.h || 0, dim1_w = p.w1 || p.w || 0;
                const dim2_d = p.d2 || p.d || 0, dim2_h = p.h2 || p.h || 0, dim2_w = p.w2 || p.w || 0;

                const A1 = p.inletShape === 'round' ? Math.PI * Math.pow(getInternalDim(dim1_d) / 2000, 2) : (getInternalDim(dim1_h) / 1000) * (getInternalDim(dim1_w) / 1000);
                const A2 = p.outletShape === 'round' ? Math.PI * Math.pow(getInternalDim(dim2_d) / 2000, 2) : (getInternalDim(dim2_h) / 1000) * (getInternalDim(dim2_w) / 1000);

                const d1_eq = Math.sqrt(4 * A1 / Math.PI);
                const d2_eq = Math.sqrt(4 * A2 / Math.PI);
                const angleRad = (p.angle || 30) * Math.PI / 180;
                
                // Keglestub længde beregning
                length = Math.abs(d1_eq - d2_eq) / 2 / Math.tan(angleRad / 2);
                if (length < 0.1 || isNaN(length) || !isFinite(length)) length = 0.5; // Standard hvis arealerne er for tætte (f.eks. form-overgang)
                
                perimeter = Math.PI * (d1_eq + d2_eq) / 2;
                hasSurface = true;
            }
            return { hasSurface, length, perimeter };
        };

        const runThermo = (t_in) => {
            comp.state.temperature_in = t_in;
            let t_out = { 'outlet': t_in, 'outlet_straight': t_in, 'outlet_branch': t_in };

            let currentFlow = 0;
            if (comp.state.airflow_in !== undefined) currentFlow = comp.state.airflow_in;
            else if (comp.airflow !== undefined) currentFlow = comp.airflow;
            else if (comp.properties && comp.properties.q_straight) currentFlow = comp.properties.q_straight; 

            const surface = getSurfaceProps(comp);

            if (surface.hasSurface && currentFlow > 0) {
                const amb = comp.properties.ambientTemp !== undefined ? comp.properties.ambientTemp : globalAmbient;
                const isoTh = (comp.properties.isoThick || 0) / 1000;
                const isoL = comp.properties.isoLambda || 0.037;

                const q_m_kgs = (currentFlow / 3600) * physics.getAirProperties(t_in).RHO;
                const res = physics.calculateTemperatureDrop(t_in, amb, surface.length, surface.perimeter, q_m_kgs, isoTh, isoL, globalParams.globalRH);
                t_out['outlet'] = res.t_out;
                comp.state.heatLoss = res.q_loss;
            }
            
            comp.state.temperature_out = t_out;
            return t_out;
        };

        if (!isExhaust) {
            const t_out_map = runThermo(incomingTemp);
            childrenEdges.forEach(edge => {
                const outPort = edge.fromPort;
                const childId = edge.to;
                let portTemp = t_out_map['outlet'];
                if (t_out_map[outPort] !== undefined) portTemp = t_out_map[outPort];
                traverseAndCalculateThermodynamics(childId, portTemp);
            });
            return incomingTemp;
        } else {
            let enteringTemp = globalAmbient; 

            if (childrenEdges.length === 0) {
                enteringTemp = comp.properties.ambientTemp !== undefined ? comp.properties.ambientTemp : temp;
            } else {
                const branchTemps = {};
                childrenEdges.forEach(edge => {
                    const outPort = edge.fromPort;
                    const childId = edge.to;
                    branchTemps[outPort] = traverseAndCalculateThermodynamics(childId, null);
                });

                if (comp.type === 'tee_sym' || comp.type === 'tee_asym') {
                    const temp_straight = branchTemps['outlet_straight'] !== undefined ? branchTemps['outlet_straight'] : incomingTemp;
                    const temp_branch = branchTemps['outlet_branch'] !== undefined ? branchTemps['outlet_branch'] : incomingTemp;

                    const q_straight = comp.properties.q_straight || 0;
                    const q_branch = comp.properties.q_branch || 0;

                    if (q_straight === 0 && q_branch === 0) {
                        enteringTemp = temp_straight;
                    } else {
                        const q_m_st = (q_straight / 3600) * physics.getAirProperties(temp_straight).RHO;
                        const q_m_br = (q_branch / 3600) * physics.getAirProperties(temp_branch).RHO;
                        enteringTemp = ((q_m_st * temp_straight) + (q_m_br * temp_branch)) / (q_m_st + q_m_br);
                    }
                } else {
                    const firstPort = Object.keys(branchTemps)[0];
                    if (firstPort) enteringTemp = branchTemps[firstPort];
                }
            }

            comp.state.heatLoss = 0;
            comp.state.temperature_out = { 'outlet': enteringTemp, 'outlet_straight': enteringTemp, 'outlet_branch': enteringTemp };
            comp.state.temperature_in = enteringTemp; 

            let tempLeavingTowardsAHU = enteringTemp;
            const surface = getSurfaceProps(comp);

            if (surface.hasSurface) {
                const amb = comp.properties.ambientTemp !== undefined ? comp.properties.ambientTemp : globalAmbient;
                const isoTh = (comp.properties.isoThick || 0) / 1000;
                const isoL = comp.properties.isoLambda || 0.037;

                let currentFlow = 0;
                if (comp.state.airflow_in !== undefined) currentFlow = comp.state.airflow_in;
                else if (comp.airflow !== undefined) currentFlow = comp.airflow;

                if (currentFlow > 0) {
                    const q_m_kgs = (currentFlow / 3600) * physics.getAirProperties(enteringTemp).RHO;
                    const res = physics.calculateTemperatureDrop(enteringTemp, amb, surface.length, surface.perimeter, q_m_kgs, isoTh, isoL, globalParams.globalRH);
                    tempLeavingTowardsAHU = res.t_out;
                    comp.state.heatLoss = res.q_loss;
                }
            }
            
            comp.state.temperature_in = tempLeavingTowardsAHU;

            return tempLeavingTowardsAHU;
        }

    }

    if (globalParams.globalFlowType === 'merging') {
        rootIds.forEach(rootId => { traverseAndCalculateThermodynamics(rootId, temp); });
    } else {
        rootIds.forEach(rootId => { traverseAndCalculateThermodynamics(rootId, temp); });
    }

    ui.renderSystem();
    ui.handleComponentTypeChange();
}
window.recalculateSystem = recalculateSystem;

// Exposed handler for Add button
window.handleInlineComponentSubmit = function (event) {
    if (event) event.preventDefault();

    const type = document.getElementById('inlineComponentType').value;

    const temp = parseLocalFloat(document.getElementById('temperature').value);
    if (isNaN(temp)) return alert("Ugyldig temperatur.");

    let currentAirflow = parseLocalFloat(document.getElementById('system_airflow').value);
    if (isNaN(currentAirflow) || currentAirflow <= 0) return alert("Ugyldig start luftmængde.");

    const parentId = window.currentAddParentId;
    const parentPort = window.currentAddParentPort;

    const parentComp = getSystemComponent(parentId);
    if (parentComp && parentComp.state && parentComp.state.airflow_out) {
        if (parentComp.state.airflow_out[parentPort] !== undefined) {
            currentAirflow = parentComp.state.airflow_out[parentPort];
        } else if (parentComp.state.airflow_out['outlet'] !== undefined) {
            currentAirflow = parentComp.state.airflow_out['outlet'];
        }
    } else if (parentComp && parentComp.airflow) {
        currentAirflow = parentComp.airflow;
    }

    const isInline = !!document.getElementById('ductLength_inline') || !!document.getElementById('systemFittingType_inline');
    const suffix = isInline ? '_inline' : '';

    let component = null;

    if (type === 'straightDuct') {
        component = getDuctData(suffix);
    } else if (type === 'fitting') {
        const fittingTypeSelect = document.getElementById('inlineFittingType') || document.getElementById('systemFittingType' + suffix);
        const fittingType = fittingTypeSelect ? fittingTypeSelect.value : null;
        component = getFittingData(suffix, fittingType);
    } else if (type === 'manualLoss') {
        const descId = document.getElementById('manualDescription' + suffix) ? 'manualDescription' + suffix : 'manualDescription';
        const pressId = document.getElementById('manualPressureLoss' + suffix) ? 'manualPressureLoss' + suffix : 'manualPressureLoss';
        const name = document.getElementById(descId).value || 'Manuel Komponent';
        const pressureLoss = parseLocalFloat(document.getElementById(pressId).value);
        if (isNaN(pressureLoss)) {
            alert("Ugyldigt tryktab!");
            return;
        }
        component = {
            type: 'manualLoss',
            name: name,
            properties: { pressureLoss },
            state: {}
        };
    }

    if (component) {
        component.id = 'node_' + Date.now();

        const flowTypeEl = document.querySelector('input[name="systemFlowType"]:checked');
        const systemType = flowTypeEl ? flowTypeEl.value : 'splitting';
        const projectName = document.getElementById('projectName') ? document.getElementById('projectName').value : '';
        const startAirflowVal = document.getElementById('system_airflow') ? document.getElementById('system_airflow').value : '1000';
        stateManager.setProjectParams({ systemType, startAirflow: startAirflowVal, projectName });

        const systemComponents = getSystemComponents();
        if (systemComponents.length === 0) {
            component.state.airflow_in = currentAirflow;
        }

        // Add exactly where requested
        if (parentId) {
            stateManager.addSystemComponent(component, parentId, parentPort || 'outlet', 'inlet');
        } else {
            stateManager.addSystemComponent(component);
        }

        // Cleanup temp inline state
        window.currentAddParentId = null;
        window.currentAddParentPort = null;
        setCorrectionTargetId(null);

        recalculateSystem();
        ui.showSaveStatus('Komponent tilføjet', 'saved');
        ui.updateUndoRedoUI(canUndo(), canRedo());
    }
}

// --- Initialization ---

async function initializeApp() {
    document.getElementById('dimensioning').innerHTML = ui.getDimFormHtml();
    document.getElementById('fittings').innerHTML = ui.getFittingsFormHtml();
    document.getElementById('system').innerHTML = ui.getSystemFormHtml();

    document.getElementById('ventilationForm').addEventListener('submit', handleDuctCalculation);
    document.getElementById('fittingsForm').addEventListener('submit', handleFittingCalculation);
    document.getElementById('fittingType').addEventListener('change', ui.renderFittingInputs);

    document.getElementsByName('calculationMode').forEach(r => r.addEventListener('change', ui.updateDimUI));
    document.getElementsByName('ductShape').forEach(r => r.addEventListener('change', ui.updateDimUI));
    document.getElementById('constraintType').addEventListener('change', ui.updateConstraintDefaults);

    const sysInputs = ['system_airflow', 'temperature', 'ambient_temperature', 'humidity'];
    sysInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', window.recalculateSystem);
    });

    const flowRadios = document.querySelectorAll('input[name="systemFlowType"]');
    flowRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                stateManager.setProjectParams({ systemType: e.target.value });
                if (typeof window.recalculateSystem === 'function') {
                    window.recalculateSystem();
                }
            }
        });
    });

    document.getElementById('fileLoader').addEventListener('change', window.loadSystem);

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = ui.getProjectModalHtml();
    document.body.appendChild(modalContainer.firstElementChild);

    const projectModal = document.getElementById('projectModal');
    const projectListContainer = document.getElementById('projectList');

    const openProjectModal = (mode) => {
        try {
            renderProjectList();
            projectModal.classList.remove('hidden');
            window.toggleSystemMenu(); 
        } catch (e) {
            console.error('Error in openProjectModal:', e);
        }
    };

    const saveProjectAs = () => {
        window.toggleSystemMenu(); 
        let currentName = document.getElementById('projectName').value;
        const name = prompt("Indtast projektnavn:", currentName);
        if (name) {
            try {
                if (projectManager.projectExists(name)) {
                    showConfirm(`Projektet "${name}" findes allerede. Vil du overskrive det?`, () => {
                        try {
                            projectManager.updateProject(name);
                            document.getElementById('projectName').value = name;
                            renderProjectList();
                            alert(`Projekt "${name}" gemt.`);
                        } catch (err) {
                            alert('Fejl: ' + err.message);
                        }
                    });
                } else {
                    projectManager.createProject(name);
                    document.getElementById('projectName').value = name;
                    renderProjectList();
                    alert(`Projekt "${name}" gemt.`);
                }
            } catch (err) {
                alert('Fejl: ' + err.message);
            }
        }
    };

    document.getElementById('btnMenuNew').addEventListener('click', (e) => {
        e.stopPropagation();
        window.toggleSystemMenu(); 
        window.clearSystem();
    });
    document.getElementById('btnMenuLoad').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openProjectModal('load');
    });
    document.getElementById('btnMenuSaveAs').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveProjectAs();
    });
    document.getElementById('btnMenuSaveFile').addEventListener('click', (e) => {
        e.stopPropagation();
        window.saveSystem(e);
    });
    document.getElementById('btnMenuLoadFile').addEventListener('click', (e) => {
        e.stopPropagation();
        window.triggerFileLoad(e);
    });
    document.getElementById('btnMenuPrint').addEventListener('click', (e) => {
        e.stopPropagation();
        window.printDocumentation(e);
    });

    window.addEventListener('click', (e) => {
        if (e.target === projectModal) {
            projectModal.classList.add('hidden');
        }
    });

    function renderProjectList() {
        if (!projectListContainer) return;
        const projects = projectManager.listProjects();
        projectListContainer.innerHTML = '';

        if (projects.length === 0) {
            projectListContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted-color);">Ingen gemte projekter.</p>';
            return;
        }

        projects.forEach(proj => {
            const el = document.createElement('div');
            el.className = 'project-item';
            const dateStr = new Date(proj.timestamp).toLocaleString('da-DK');
            el.innerHTML = `
                <div class="project-info">
                    <h3>${proj.name}</h3>
                    <p>Gemt: ${dateStr}</p>
                </div>
                <div class="project-actions">
                    <button class="project-btn load" data-name="${proj.name}" title="Hent">📂</button>
                    <button class="project-btn delete" data-name="${proj.name}" title="Slet">🗑️</button>
                </div>
            `;
            projectListContainer.appendChild(el);
        });

        projectListContainer.querySelectorAll('.load').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const name = e.currentTarget.dataset.name;
                showConfirm(`Vil du hente projektet "${name}"? Nuværende ikke-gemte ændringer vil gå tabt.`, () => {
                    try {
                        projectManager.loadProject(name);
                        projectModal.classList.add('hidden');
                        ui.renderSystem();
                        ui.handleComponentTypeChange();
                        document.getElementById('projectName').value = name;
                        alert(`Projekt "${name}" hentet.`);
                    } catch (err) {
                        alert('Fejl: ' + err.message);
                    }
                });
            });
        });

        projectListContainer.querySelectorAll('.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = e.currentTarget.dataset.name;
                showConfirm(`Er du sikker på, at du vil slette projektet "${name}"?`, () => {
                    projectManager.deleteProject(name);
                    renderProjectList();
                });
            });
        });
    }

    document.getElementById('btnNewProject').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showConfirm('Er du sikker på, at du vil starte et nyt projekt?', () => {
            clearSystem();
            document.getElementById('projectName').value = '';
            ui.renderSystem();
            ui.handleComponentTypeChange();
            projectModal.classList.add('hidden');
        });
    });

    document.getElementById('btnSaveProjectAs').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveProjectAs();
    });

    ui.populateDatalists();
    ui.updateDimUI();
    ui.updateConstraintDefaults();
    ui.updateFittingTypeOptions();
    ui.handleComponentTypeChange();

    const tabs = document.querySelectorAll('.tab-link');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.remove('hidden');
        });
    });

    const themeToggle = document.getElementById('themeToggle');
    const setTheme = (isDark) => {
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeToggle.checked = true;
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            themeToggle.checked = false;
        }
    };

    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme === 'dark');

    themeToggle.addEventListener('change', (e) => {
        setTheme(e.target.checked);
    });

    document.getElementById('helpButton').addEventListener('click', () => {
        ui.showHelpModal();
    });

    const undoBtn = document.getElementById('undoButton');
    const redoBtn = document.getElementById('redoButton');
    if (undoBtn) undoBtn.addEventListener('click', handleUndo);
    if (redoBtn) redoBtn.addEventListener('click', handleRedo);

    ui.updateUndoRedoUI(canUndo(), canRedo());
}

window.loadSystem = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            document.getElementById('projectName').value = data.projectName || '';

            if (data.state) {
                stateManager.importState(data.state);
            } else {
                const legacyState = {
                    systemComponents: data.components || [],
                    startAirflow: data.startAirflow || '1000',
                    systemType: data.systemType || 'splitting'
                };
                stateManager.importState(legacyState);
            }

            document.getElementById('system_airflow').value = stateManager.state.startAirflow || '1000';
            const radios = document.getElementsByName('systemFlowType');
            radios.forEach(r => { if (r.value === stateManager.state.systemType) r.checked = true; });

            if (window.recalculateSystem) window.recalculateSystem();
            ui.toggleSystemMenu();
        } catch (error) {
            alert('Fejl ved indlæsning af fil: ' + error.message);
        }
    };
    reader.readAsText(file);
};

window.triggerFileLoad = () => {
    window.toggleSystemMenu(); 
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = window.loadSystem;
    input.click();
};

window.saveSystem = () => {
    window.toggleSystemMenu(); 
    const projectName = document.getElementById('projectName').value || 'ventilation_projekt';
    const dataToSave = {
        projectName: projectName,
        state: stateManager.state 
    };
    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
};

document.addEventListener('DOMContentLoaded', initializeApp);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
            registration.unregister();
            console.log('Service Worker unregistered');
        }
    });
}