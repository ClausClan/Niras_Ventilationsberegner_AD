import { stateManager } from './app_state.js';
import { formatLocalFloat, parseLocalFloat } from './utils.js';
import { getFittings, getSystemComponents, getDuctResult, getSystemComponent } from './app_state.js';
import { STANDARD_ROUND_SIZES_MM, STANDARD_RECT_SIZES_MM, getAirProperties } from './physics.js';

// --- HTML Generators ---

export function getDimFormHtml() {
    return `
        <section>
            <h2>Kanaldimensionering</h2>
            <form id="ventilationForm">
                <div class="input-group"> <label for="dim_airflow">Luftmængde</label> <div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="dim_airflow" class="input-field" required></div> </div>
                <div class="control-group"> <label>Beregningstype</label> <div class="radio-group"> <input type="radio" id="modeCalculate" name="calculationMode" value="calculate" checked><label for="modeCalculate">Find Dimension</label> <input type="radio" id="modeAnalyze" name="calculationMode" value="analyze"><label for="modeAnalyze">Kendt Dimension</label> </div> </div>
                <div class="control-group"> <label>Kanalform</label> <div class="radio-group"> <input type="radio" id="ductRound" name="ductShape" value="round" checked><label for="ductRound">Cirkulær</label> <input type="radio" id="ductRectangular" name="ductShape" value="rectangular"><label for="ductRectangular">Rektangulær</label> </div> </div>
                <div id="calculateInputs">
                    <div class="input-group"><label for="constraintType">Grænse</label><select id="constraintType" class="input-field"><option value="velocity">Hastighed (m/s)</option><option value="pressure">Tryktab (Pa/m)</option></select></div>
                    <div class="input-group"><label for="constraintValue">Grænseværdi</label><div class="input-unit-wrapper" data-unit="m/s"><input type="text" id="constraintValue" class="input-field" step="any"></div></div>
                    <div id="aspectRatioInput" class="input-group" style="display: none;"><label for="aspectRatio">Sideforhold (A/B)</label><input type="text" id="aspectRatio" class="input-field" value="1,5" step="any"></div>
                </div>
                <div id="analyzeInputs" style="display: none;">
                    <div id="analyzeRound" class="input-group"><label for="diameter">Diameter</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="diameter" class="input-field" list="diameter-list" placeholder="Vælg eller indtast"></div><datalist id="diameter-list"></datalist></div>
                    <div id="analyzeRectangular" class="input-field-group" style="display: none;">
                        <div class="input-group" style="width: 100%"><label for="sideA">Side A</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="sideA" class="input-field" list="rect-list" placeholder="Vælg eller indtast"></div></div>
                        <div class="input-group" style="width: 100%"><label for="sideB">Side B</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="sideB" class="input-field" list="rect-list" placeholder="Vælg eller indtast"></div></div>
                        <datalist id="rect-list"></datalist>
                    </div>
                </div>
                <button type="submit" class="button primary">Beregn Kanal</button>
            </form>
            <div id="dim_resultsContainer" class="results-container"></div>
        </section>`;
}

export function getFittingsFormHtml() {
    return `
        <section>
            <h2>Tryktab for Formstykker</h2>
            <form id="fittingsForm">
                <div class="input-group">
                    <label>Systemtype</label>
                    <div class="radio-group"> 
                        <input type="radio" id="fitTypeSupply" name="fitFlowType" value="splitting" checked><label for="fitTypeSupply">Indblæsning</label> 
                        <input type="radio" id="fitTypeExhaust" name="fitFlowType" value="merging"><label for="fitTypeExhaust">Udsugning</label> 
                    </div>
                </div>
                <div class="input-group">
                    <label for="fittingType">Vælg type formstykke</label>
                    <select id="fittingType" class="input-field">
                        </select>
                </div>
                <div id="fittingIllustrationContainer"></div>
                <div id="fittingInputsContainer"></div>
                <button type="submit" class="button primary">Beregn Formstykke</button>
            </form>
            <div id="fittings_resultsContainer" class="results-container"></div>
        </section>`;
}

export function getProjectModalHtml() {
    return `
    <div id="projectModal" class="modal hidden">
        <div class="modal-content">
            <span class="close-modal" onclick="document.getElementById('projectModal').classList.add('hidden')">&times;</span>
            <h2>Mine Projekter</h2>
            <div style="margin-bottom: 15px;">
                <button id="btnNewProject" class="button primary">Start Nyt Projekt</button>
                <button id="btnSaveProjectAs" class="button secondary">Gem Som...</button>
            </div>
            <div id="projectList" class="project-list">
                <!-- Projects will be loaded here -->
            </div>
        </div>
    </div>`;
}

export function getSystemFormHtml() {
    return `
        <section>
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-color); margin-bottom: 25px;">
                <h2 style="border: none; margin: 0; padding-bottom: 10px;">Systemberegning</h2>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button type="button" id="toggleViewBtn" class="button secondary" style="width: auto; margin: 0; padding: 5px 15px;" onclick="window.toggleDiagramView()">Vis Diagram</button>
                </div>
                <div class="system-menu-container">
                    <button type="button" class="system-menu-btn" onclick="window.toggleSystemMenu()">&#8942;</button>
                    <div id="systemMenu" class="system-menu-dropdown hidden">
                        <button type="button" id="btnMenuNew" class="menu-item-btn">Ny Beregning</button>
                        <button type="button" id="btnMenuLoad" class="menu-item-btn">Hent Projekt...</button>
                        <button type="button" id="btnMenuSaveAs" class="menu-item-btn">Gem Som (Projekt)...</button>
                        <hr style="margin: 5px 0; border: 0; border-top: 1px solid var(--border-color);">
                        <button type="button" id="btnMenuSaveFile" class="menu-item-btn">Gem Fil (JSON)...</button>
                        <button type="button" id="btnMenuLoadFile" class="menu-item-btn">Hent Fil (JSON)...</button>
                        <button type="button" id="btnMenuPrint" class="menu-item-btn">Print Dokumentation...</button>
                    </div>
                </div>
            </div>

            <div class="input-group">
                <label for="projectName">Projektnavn</label>
                <input type="text" id="projectName" class="input-field" placeholder="f.eks. Ombygning af kontor, etage 3">
            </div>
            
            <div class="input-group">
                    <label>Systemtype</label>
                    <div id="globalSystemTypeGroup" class="radio-group"> 
                        <input type="radio" id="sysTypeSupply" name="systemFlowType" value="splitting" checked><label for="sysTypeSupply">Indblæsning</label> 
                        <input type="radio" id="sysTypeExhaust" name="systemFlowType" value="merging"><label for="sysTypeExhaust">Udsugning</label> 
                    </div>
            </div>
            
            <div class="input-group">
                    <label for="system_airflow">Start Luftmængde</label>
                    <div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="system_airflow" class="input-field" required></div>
            </div>
            
            <div id="systemComponentsContainer"></div>
            <div id="systemDiagramContainer" class="hidden"></div>
            <div id="totalPressureDropContainer" class="results-container"></div>
    
            <input type="file" id="fileLoader" style="display: none;" accept=".json">
        </section>
    `;
}

// --- Render Functions ---

export function renderDuctResult(data) {
    const dimResultsContainer = document.getElementById('dim_resultsContainer');
    if (!dimResultsContainer) return;

    if (!data) {
        dimResultsContainer.innerHTML = '';
        return;
    }
    let content = `<p><strong>Beregnet med Luftmængde (q):</strong> ${formatLocalFloat(data.airflow, 0)} m³/h</p>`;
    if (data.mode === 'calculate') {
        content += data.shape === 'round' ? `<p>Beregnet ideal-diameter: ${formatLocalFloat(data.idealDiameter, 1)} mm</p>` : `<p>Beregnet ideal-dimension: ${formatLocalFloat(data.idealSideA, 1)} x ${formatLocalFloat(data.idealSideB, 1)} mm</p>`;
        let comparisonRows = '';
        if (data.alternatives.smaller) { comparisonRows += `<tr><td>Ø${data.alternatives.smaller.dimension}</td><td>${formatLocalFloat(data.alternatives.smaller.velocity, 2)}</td><td>${formatLocalFloat(data.alternatives.smaller.pressureDrop, 2)}</td></tr>`; }
        comparisonRows += `<tr class="chosen-row"><td><strong>Ø${data.standardDiameter || (data.standardSideA + 'x' + data.standardSideB)}</strong></td><td><strong>${formatLocalFloat(data.velocity, 2)}</strong></td><td><strong>${formatLocalFloat(data.pressureDrop, 2)}</strong></td></tr>`;
        if (data.alternatives.larger) { comparisonRows += `<tr><td>Ø${data.alternatives.larger.dimension}</td><td>${formatLocalFloat(data.alternatives.larger.velocity, 2)}</td><td>${formatLocalFloat(data.alternatives.larger.pressureDrop, 2)}</td></tr>`; }
        content += `<table class="comparison-table"><thead><tr><th>Dimension</th><th>Hastighed (m/s)</th><th>Tryktab (Pa/m)</th></tr></thead><tbody>${comparisonRows}</tbody></table>`;
    } else {
        content += data.shape === 'round' ? `<p class="highlight"><strong>Analyseret Kanal:</strong> ${data.diameter} mm</p>` : `<p class="highlight"><strong>Analyseret Kanal:</strong> ${data.sideA} x ${data.sideB} mm</p>`;
        content += `<p><strong>Lufthastighed (v):</strong> ${formatLocalFloat(data.velocity, 2)} m/s</p><p><strong>Tryktab pr. meter (dp):</strong> ${formatLocalFloat(data.pressureDrop, 2)} Pa/m</p>`;
    }
    dimResultsContainer.innerHTML = `<div class="result-card"><h3>Resultat for Kanal <button class="details-btn" onclick='showDuctDetails()'>ⓘ</button></h3>${content}</div>`;
}

export function renderFittingsResult() {
    const fittingsResultsContainer = document.getElementById('fittings_resultsContainer');
    if (!fittingsResultsContainer) return;

    const fittingsList = getFittings();
    fittingsResultsContainer.innerHTML = '';
    if (fittingsList.length > 0) {
        const totalLoss = fittingsList.reduce((acc, item) => acc + item.pressureLoss, 0);

        let tableRows = fittingsList.map(item => {
            return `<tr><td>${item.name}<br><small>(${formatLocalFloat(item.airflow, 0)} m³/h)</small></td><td>${formatLocalFloat(item.pressureLoss, 2)} Pa</td><td><button class="details-btn" onclick='window.showFittingDetails(${item.id})'>ⓘ</button><button class="delete-btn" onclick="window.deleteFitting(${item.id})">&times;</button></td></tr>`
        }).join('');

        const summaryContent = `<div class="result-card"><h3>Samlet Tryktab</h3><table class="fittings-table"><thead><tr><th>Komponent</th><th>Tryktab</th><th></th></tr></thead><tbody>${tableRows}</tbody><tfoot><tr><td>Total</td><td>${formatLocalFloat(totalLoss, 2)} Pa</td><td></td></tr></tfoot></table><button onclick="window.resetFittings()" class="button secondary">Nulstil Liste</button></div>`;

        fittingsResultsContainer.innerHTML = summaryContent;
    }
}

export function renderSystem() {
    const systemComponentsContainer = document.getElementById('systemComponentsContainer');
    const totalPressureDropContainer = document.getElementById('totalPressureDropContainer');

    if (!systemComponentsContainer || !totalPressureDropContainer) return;

    const systemTree = window.stateManager ? window.stateManager.getSystemTree() : [];
    const flatComponents = window.stateManager ? window.stateManager.getSystemComponents() : [];

    systemComponentsContainer.innerHTML = '';
    totalPressureDropContainer.innerHTML = '';

    const airflowInput = document.getElementById('system_airflow');
    const systemTypeRadios = document.getElementsByName('systemFlowType');
    const systemTypeGroup = document.getElementById('globalSystemTypeGroup');

    if (flatComponents.length > 0) {
        airflowInput.disabled = true;
        systemTypeRadios.forEach(radio => radio.disabled = true);
        if (systemTypeGroup) systemTypeGroup.classList.add('disabled');
    } else {
        airflowInput.disabled = false;
        systemTypeRadios.forEach(radio => radio.disabled = false);
        if (systemTypeGroup) systemTypeGroup.classList.remove('disabled');
    }

    if (flatComponents.length === 0) {
        const selectedType = document.querySelector('input[name="systemFlowType"]:checked')?.value || 'splitting';
        let noteText = '';
        if (selectedType === 'splitting') {
            noteText = 'Systemet er tomt. Start ved anlægget og arbejd dig <strong>ud</strong> mod de yderste grene.';
        } else { 
            noteText = 'Systemet er tomt. Start ved den yderste gren og arbejd dig <strong>ind</strong> mod anlægget.';
        }
        systemComponentsContainer.innerHTML = `
            <div id="emptyStateButtonContainer" style="text-align:center; padding: 40px 20px; background: #f9f9f9; border: 2px dashed var(--border-color); border-radius: 8px; margin-top: 20px;">
                <p style="color: var(--text-muted-color); margin-bottom: 20px; font-size: 1.1em;">${noteText}</p>
                <button class="button primary" style="padding: 10px 24px; font-size: 1.1em;" onclick="window.showAddForm(null, null)">+ Tilføj Første Komponent</button>
            </div>
            <table class="fittings-table tree-table" style="border-spacing: 0; width: 100%;">
                <tbody id="emptyStateTbody"></tbody>
            </table>
        `;
        return;
    }

    let globalCriticalPressureDrop = 0;
    let globalCriticalPathIds = [];

    flatComponents.forEach(c => {
        if (c.state) c.state.isCriticalPath = false;
    });

    function calculateCriticalPath(node) {
        if (!node || node.isIncluded === false) return { loss: 0, path: [] };

        const pType = node.fittingType || (node.properties && node.properties.type) || node.type || '';
        const isTee = pType.startsWith('tee_');
        const pLoss = (node.state && node.state.pressureLoss) ? node.state.pressureLoss : 0;
        
        let maxPathLoss = 0;
        let bestChildPath = [];

        if (isTee) {
            const ports = ['outlet_straight', 'outlet_branch', 'outlet_path1', 'outlet_path2'];
            ports.forEach(port => {
                let portLoss = (node.state && node.state.portPressureLoss && node.state.portPressureLoss[port] !== undefined) ? node.state.portPressureLoss[port] : 0;
                
                let childLoss = 0;
                let childPath = [];
                
                if (node.children && node.children[port] && node.children[port].length > 0) {
                    let result = calculateCriticalPath(node.children[port][0]);
                    childLoss = result.loss;
                    childPath = result.path;
                }
                
                if (portLoss + childLoss > maxPathLoss) {
                    maxPathLoss = portLoss + childLoss;
                    bestChildPath = childPath;
                }
            });
            
            return {
                loss: maxPathLoss,
                path: [node.id, ...bestChildPath]
            };
        } else {
            if (node.children) {
                Object.values(node.children).forEach(childArray => {
                    childArray.forEach(child => {
                        let result = calculateCriticalPath(child);
                        if (result.loss > maxPathLoss) {
                            maxPathLoss = result.loss;
                            bestChildPath = result.path;
                        }
                    });
                });
            }

            return {
                loss: pLoss + maxPathLoss,
                path: [node.id, ...bestChildPath]
            };
        }
    }

    if (systemTree.length > 0) {
        const criticalResult = calculateCriticalPath(systemTree[0]);
        globalCriticalPressureDrop = criticalResult.loss;
        globalCriticalPathIds = criticalResult.path;

        globalCriticalPathIds.forEach(id => {
            const comp = flatComponents.find(c => c.id === id);
            if (comp && comp.state) {
                comp.state.isCriticalPath = true;
            }
        });
    }

    function renderNode(c, depth, labelPath) {
        const state = c.state || {};
        const pressureLoss = state.pressureLoss || 0;
        const velocity = state.velocity || null;
        let airflowDisp = state.airflow_in || c.airflow || 0;
        
        let airflowText = `${formatLocalFloat(airflowDisp, 0)} m³/h`;
        let pressureText = `${formatLocalFloat(pressureLoss, 2)} Pa`;

        const pType = c.fittingType || (c.properties && c.properties.type) || c.type || '';

        if (pType.startsWith('tee_')) {
            const props = c.properties || {};
            let q_in = airflowDisp;
            let q_s, q_b, loss_s, loss_b;

            if (pType === 'tee_bullhead') {
                q_s = state.airflow_out ? state.airflow_out['outlet_path1'] : props.q_out1;
                q_b = state.airflow_out ? state.airflow_out['outlet_path2'] : props.q_out2;
                loss_s = state.portPressureLoss ? state.portPressureLoss['outlet_path1'] : 0;
                loss_b = state.portPressureLoss ? state.portPressureLoss['outlet_path2'] : 0;
                
                airflowText = `Ind: ${formatLocalFloat(q_in, 0)}<br>G1: ${formatLocalFloat(q_s || 0, 0)} | G2: ${formatLocalFloat(q_b || 0, 0)}`;
                pressureText = `G1: ${formatLocalFloat(loss_s, 2)} Pa<br>G2: ${formatLocalFloat(loss_b, 2)} Pa`;
            } else {
                q_s = state.airflow_out ? state.airflow_out['outlet_straight'] : props.q_straight;
                q_b = state.airflow_out ? state.airflow_out['outlet_branch'] : props.q_branch;
                loss_s = state.portPressureLoss ? state.portPressureLoss['outlet_straight'] : 0;
                loss_b = state.portPressureLoss ? state.portPressureLoss['outlet_branch'] : 0;

                airflowText = `Ind: ${formatLocalFloat(q_in, 0)}<br>L: ${formatLocalFloat(q_s || 0, 0)} | A: ${formatLocalFloat(q_b || 0, 0)}`;
                pressureText = `Ligeud: ${formatLocalFloat(loss_s, 2)} Pa<br>Afgr: ${formatLocalFloat(loss_b, 2)} Pa`;
            }
        }

        const velocityText = velocity ? `${formatLocalFloat(velocity, 2)} m/s` : 'N/A';
        const detailsButton = state.calculationDetails ? `<button class="details-btn" onclick="window.showSystemComponentDetails('${c.id}')">ⓘ</button>` : '';
        const deleteButton = `<button class="delete-btn" onclick="window.handleDeleteComponent('${c.id}')">&times;</button>`;

        const rowClass = c.isAutoGenerated ? 'auto-generated' : '';
        let warningHtml = '';
        if (c.properties && c.properties.isEstimated) {
            warningHtml = `<br><small style="color:var(--error-color);font-style:italic;">OBS: Estimeret tryktab</small>`;
            warningHtml += ` <button class="details-btn" style="font-size: 0.8rem; padding: 2px 4px;" onclick="window.requestCorrection('${c.id}')">[+Pa]</button>`;
        }

        // --- SKUDSIKKER TEMPERATUR FORMATERING ---
        let tempText = '-';
        const t_in_val = parseFloat(state.temperature_in);
        let t_out_raw = state.temperature_out ? 
            (state.temperature_out['outlet'] !== undefined ? state.temperature_out['outlet'] : 
             (state.temperature_out['outlet_straight'] !== undefined ? state.temperature_out['outlet_straight'] : 
              state.temperature_out['outlet_path1'])) 
            : undefined;
        const t_out_val = parseFloat(t_out_raw);

        if (!isNaN(t_in_val) && !isNaN(t_out_val)) {
            if (Math.abs(t_in_val - t_out_val) > 0.05) {
                tempText = `${formatLocalFloat(t_in_val, 1)} → ${formatLocalFloat(t_out_val, 1)} °C`;
            } else {
                tempText = `${formatLocalFloat(t_in_val, 1)} °C`;
            }
        }

        const paddingLeft = Math.max(0, depth * 25);
        const includeChecked = c.isIncluded !== false ? 'checked' : '';
        const opacity = c.isIncluded !== false ? '1' : '0.4';

        let pathLabelHtml = '';
        if (labelPath) {
            pathLabelHtml = `<div style="font-size:10px; color:#00E5FF; margin-bottom: 2px;">↳ ${labelPath}</div>`;
        }

        let rowHtml = `
            <tr class="${rowClass}" style="opacity: ${opacity};">
                <td style="padding-left: ${paddingLeft + 10}px;">
                    ${pathLabelHtml}
                    <div style="display:flex; align-items:center; gap: 8px;">
                        <input type="checkbox" ${includeChecked} onchange="window.toggleBranchIncluded('${c.id}', this.checked)" title="Medtag i beregning">
                        <div>
                            <strong>${c.name}</strong><br>
                            <small>${c.details || ''}</small>${warningHtml}
                        </div>
                    </div>
                </td>
                <td>${airflowText}</td>
                <td>${tempText}</td>
                <td>${velocityText}</td>
                <td>${pressureText}</td>
                <td>
                    <button class="details-btn edit-btn" style="background:none; border:none; cursor:pointer;" onclick="window.handleEditComponent('${c.id}')" title="Rediger">✏️</button>
                    ${detailsButton}
                    ${deleteButton}
                </td>
            </tr>
        `;

        let expectedPorts = ['outlet'];
        if (pType.startsWith('tee_')) {
            if (pType === 'tee_bullhead') {
                expectedPorts = ['outlet_path1', 'outlet_path2'];
            } else {
                expectedPorts = ['outlet_straight', 'outlet_branch'];
            }
        }

        expectedPorts.forEach(portName => {
            let childLabel = '';
            let childDepth = depth;
            if (portName === 'outlet_branch' || portName === 'outlet_straight') {
                childLabel = portName === 'outlet_branch' ? 'Afgrening' : 'Ligeud';
                childDepth = depth + 1;
            } else if (portName === 'outlet_path1' || portName === 'outlet_path2') {
                childLabel = portName === 'outlet_path2' ? 'Gren 2' : 'Gren 1';
                childDepth = depth + 1;
            }

            const hasChildren = c.children && c.children[portName] && c.children[portName].length > 0;

            if (hasChildren) {
                c.children[portName].forEach(child => {
                    rowHtml += renderNode(child, childDepth, childLabel);
                });
            } else {
                let addLabel = "Tilføj videre";
                if (portName === 'outlet_branch') addLabel = "Tilføj til Afgrening";
                if (portName === 'outlet_straight') addLabel = "Tilføj Ligeud";
                if (portName === 'outlet_path1') addLabel = "Tilføj til Gren 1";
                if (portName === 'outlet_path2') addLabel = "Tilføj til Gren 2";

                rowHtml += `
                    <tr class="add-node-row">
                        <td colspan="6" style="padding-left: ${Math.max(0, childDepth * 25) + 10}px; padding-top:4px; padding-bottom:4px;">
                            <button class="button secondary" style="font-size: 0.75rem; padding: 4px 10px; border-radius: 4px;" onclick="window.showAddForm('${c.id}', '${portName}')">+ ${addLabel}</button>
                        </td>
                    </tr>
                `;
            }
        });

        return rowHtml;
    }

    let tableRows = '';
    if (systemTree.length > 0) {
        systemTree.forEach(root => {
            tableRows += renderNode(root, 0, '');
        });
    }

    systemComponentsContainer.innerHTML = `
        <table class="fittings-table tree-table" style="border-spacing: 0; width: 100%;">
            <colgroup>
                <col style="width: 35%;">
                <col style="width: 15%;">
                <col style="width: 15%;">
                <col style="width: 10%;">
                <col style="width: 10%;">
                <col style="width: 15%;">
            </colgroup>
            <thead>
                <tr><th style="text-align:left; padding-left:10px;">Komponent</th><th>Luftmængde</th><th>Temp.</th><th>Hastighed</th><th>Tryktab</th><th>Handlinger</th></tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>`;

    totalPressureDropContainer.innerHTML = `
        <div class="result-card">
            <h3>Samlet Systemtryktab (Kritisk Vej)</h3>
            <p class="highlight">${formatLocalFloat(globalCriticalPressureDrop, 2)} Pa</p>
        </div>`;
}

// --- Modals ---

export function showDuctDetails() {
    const ductResult = getDuctResult();
    const detailsModal = document.getElementById('detailsModal');
    const modalTitle = document.querySelector('#modalTitle');
    const modalBody = document.querySelector('#modalBody');

    if (!ductResult || !detailsModal || !modalTitle || !modalBody) return;

    const temp = parseLocalFloat(document.getElementById('temperature').value);
    const { RHO } = getAirProperties(temp);
    const D_hyd_int = ductResult.D_hyd_int;

    modalTitle.innerText = "Detaljer for Kanaldimensionering";

    let content = `<p><strong>Luftmængde (q):</strong> ${formatLocalFloat(ductResult.airflow, 0)} m³/h</p>`;
    content += `<p><strong>Hydraulisk Diameter (Dₕ, intern):</strong> ${formatLocalFloat(D_hyd_int, 4)} m</p>`;
    content += `<p><strong>Hastighed (v):</strong> ${formatLocalFloat(ductResult.velocity, 2)} m/s</p>`;
    content += `<p><strong>Reynolds Tal (Re):</strong> ${ductResult.reynolds.toExponential(2).replace('.', ',')}</p>`;
    content += `<p><strong>Friktionsfaktor (λ):</strong> ${formatLocalFloat(ductResult.lambda, 4)}</p>`;
    content += `<hr>`;
    content += `<p><strong>Tryktab (dp) =</strong> (λ / Dₕ) * (ρ/2) * v²</p>`;
    content += `<p><strong>dp =</strong> (${formatLocalFloat(ductResult.lambda, 4)} / ${formatLocalFloat(D_hyd_int, 4)}) * (${formatLocalFloat(RHO, 2)}/2) * ${formatLocalFloat(ductResult.velocity, 2)}² = <strong>${formatLocalFloat(ductResult.pressureDrop, 2)} Pa/m</strong></p>`;

    modalBody.innerHTML = content;
    detailsModal.style.display = 'flex';
}

export function showFittingDetails(id) {
    const fittingsList = getFittings();
    const item = fittingsList.find(f => f.id === id);
    const modalTitle = document.querySelector('#modalTitle');
    const modalBody = document.querySelector('#modalBody');
    const detailsModal = document.getElementById('detailsModal');

    if (!item || !detailsModal || !modalTitle || !modalBody) return;
    const { details, pressureLoss, name, airflow } = item;
    modalTitle.innerText = `Detaljer for ${name}`;
    modalBody.innerHTML = `<p><strong>Luftmængde (q):</strong> ${formatLocalFloat(airflow, 0)} m³/h</p><p><strong>Areal (A, intern):</strong> ${formatLocalFloat(details.A_m2, 5)} m²</p><p><strong>Hastighed (v):</strong> ${formatLocalFloat(details.v_ms, 2)} m/s</p><p><strong>Zeta-værdi (ζ):</strong> ${formatLocalFloat(details.zeta, 3)}</p><p><strong>Dynamisk Tryk (Pₐᵧₙ):</strong> ${formatLocalFloat(details.Pdyn_Pa, 2)} Pa</p><hr><p><strong>Tryktab (Δp) =</strong> ζ * Pₐᵧₙ</p><p><strong>Δp =</strong> ${formatLocalFloat(details.zeta, 3)} * ${formatLocalFloat(details.Pdyn_Pa, 2)} = <strong>${formatLocalFloat(pressureLoss, 2)} Pa</strong></p>`;
    detailsModal.style.display = 'flex';
}

export function showSystemComponentDetails(id) {
    const component = getSystemComponent(id);
    if (!component || !component.state || !component.state.calculationDetails || Object.keys(component.state.calculationDetails).length === 0) return;

    const modalTitle = document.querySelector('#modalTitle');
    const modalBody = document.querySelector('#modalBody');
    const detailsModal = document.getElementById('detailsModal');

    if (!detailsModal || !modalTitle || !modalBody) return;

    const data = component.state.calculationDetails;
    const state = component.state;

    modalTitle.innerText = `Detaljer for ${component.name}`;
    let bodyHtml = '';

    // --- SKUDSIKKER TERMODYNAMIK VISNING ---
    const t_in_val = parseFloat(state.temperature_in);
    let t_out_raw = state.temperature_out ? 
        (state.temperature_out['outlet'] !== undefined ? state.temperature_out['outlet'] : 
         (state.temperature_out['outlet_straight'] !== undefined ? state.temperature_out['outlet_straight'] : 
          state.temperature_out['outlet_path1'])) 
        : undefined;
    const t_out_val = parseFloat(t_out_raw);

    let thermoHtml = '';
    if (!isNaN(t_in_val)) {
        thermoHtml = `<hr><p><strong>Termodynamik</strong></p>
            <p><strong>Temperatur ind:</strong> ${formatLocalFloat(t_in_val, 1)} °C</p>`;
        
        if (!isNaN(t_out_val)) {
             thermoHtml += `<p><strong>Temperatur ud:</strong> ${formatLocalFloat(t_out_val, 1)} °C</p>`;
        } else {
             thermoHtml += `<p><strong>Temperatur ud:</strong> - </p>`;
        }

        const hLoss = parseFloat(state.heatLoss);
        if (!isNaN(hLoss) && hLoss !== 0) {
            thermoHtml += `<p><strong>Varmetab til omgivelser:</strong> ${formatLocalFloat(hLoss, 0)} W</p>`;
        }
    }

    const pType = component.fittingType || (component.properties && component.properties.type) || component.type || '';

    if (component.type === 'straightDuct') {
        const dpPerMeter = data.pressureDrop || 0;
        bodyHtml = `<p><strong>Beregning for Lige Kanal</strong></p>
            <p><strong>Dimension:</strong> ${data.dimension || '-'}</p>
            <p><strong>Hydraulisk Diameter (Dₕ, intern):</strong> ${formatLocalFloat(data.D_hyd_int || 0, 4)} m</p>
            <p><strong>Hastighed (v):</strong> ${formatLocalFloat(data.velocity || state.velocity, 2)} m/s</p>
            <p><strong>Reynolds Tal (Re):</strong> ${data.reynolds ? data.reynolds.toExponential(2).replace('.', ',') : '-'}</p>
            <p><strong>Friktionsfaktor (λ):</strong> ${formatLocalFloat(data.lambda || 0, 4)}</p><hr>
            <p><strong>Tryktab pr. meter (dp) =</strong> (λ / Dₕ) * (ρ/2) * v² = <strong>${formatLocalFloat(dpPerMeter, 2)} Pa/m</strong></p>
            <p><strong>Samlet Tryktab =</strong> dp * Længde = ${formatLocalFloat(dpPerMeter, 2)} * ${formatLocalFloat(component.properties.length || 1, 2)} = <strong>${formatLocalFloat(state.pressureLoss, 2)} Pa</strong></p>${thermoHtml}`;

    } else if (pType.includes('tee') || (data.type && data.type.includes('tee'))) {
        const isBullhead = pType === 'tee_bullhead';
        const title = isBullhead ? 'T-stykke (Dobbelt Afgrening)' : (data.type === 'tee_merge' ? `T-stykke (Samle)` : `T-stykke (Dele)`);
        
        let s_html = '';
        let b_html = '';
        
        const key1 = isBullhead ? 'path1' : 'straight';
        const key2 = isBullhead ? 'path2' : 'branch';
        const port1 = isBullhead ? 'outlet_path1' : 'outlet_straight';
        const port2 = isBullhead ? 'outlet_path2' : 'outlet_branch';
        
        if (state.calculationDetails && state.calculationDetails[key1] && state.calculationDetails[key2]) {
            const sd = state.calculationDetails[key1];
            const bd = state.calculationDetails[key2];
            
            s_html = `
            <p><strong>${isBullhead ? 'Gren 1' : 'Ligeud'}:</strong></p>
            <p>Hastighed: ${formatLocalFloat(sd.v_ms || 0, 2)} m/s, Zeta: ${formatLocalFloat(sd.zeta || 0, 3)}, Pₐᵧₙ: ${formatLocalFloat(sd.Pdyn_Pa || 0, 2)} Pa</p>
            <p>Tryktab (Δp): <strong>${formatLocalFloat(state.portPressureLoss ? state.portPressureLoss[port1] : 0, 2)} Pa</strong></p>`;
            
            b_html = `
            <hr><p><strong>${isBullhead ? 'Gren 2' : 'Afgrening'}:</strong></p>
            <p>Hastighed: ${formatLocalFloat(bd.v_ms || 0, 2)} m/s, Zeta: ${formatLocalFloat(bd.zeta || 0, 3)}, Pₐᵧₙ: ${formatLocalFloat(bd.Pdyn_Pa || 0, 2)} Pa</p>
            <p>Tryktab (Δp): <strong>${formatLocalFloat(state.portPressureLoss ? state.portPressureLoss[port2] : 0, 2)} Pa</strong></p>`;
        } else {
            s_html = `<p>Gammel struktur gemt. Åben og gem igen for opdatering.</p>`;
        }
        
        bodyHtml = `<p><strong>Beregning for ${title}</strong></p>${s_html}${b_html}${thermoHtml}`;

    } else if (data.zeta !== undefined) {
        bodyHtml = `<p><strong>Beregning for Formstykke</strong></p>
            <p><strong>Areal (A, effektivt):</strong> ${formatLocalFloat(data.A_m2 || 0, 5)} m²</p>
            <p><strong>Hastighed (v, reference):</strong> ${formatLocalFloat(data.v_ms || 0, 2)} m/s</p>
            <p><strong>Zeta-værdi (ζ, interpoleret):</strong> ${formatLocalFloat(data.zeta, 3)}</p>
            <p><strong>Dynamisk Tryk (Pₐᵧₙ):</strong> ${formatLocalFloat(data.Pdyn_Pa || 0, 2)} Pa</p><hr>
            <p><strong>Tryktab (Δp) =</strong> ζ * Pₐᵧₙ</p>
            <p><strong>Δp =</strong> ${formatLocalFloat(data.zeta, 3)} * ${formatLocalFloat(data.Pdyn_Pa || 0, 2)} = <strong>${formatLocalFloat(state.pressureLoss, 2)} Pa</strong></p>${thermoHtml}`;
    } else {
        bodyHtml = `<p><strong>Detaljer</strong></p>
            <p><strong>Luftmængde:</strong> ${formatLocalFloat(state.airflow_in, 0)} m³/h</p>
            <p><strong>Tryktab:</strong> ${formatLocalFloat(state.pressureLoss, 2)} Pa</p>${thermoHtml}`;
    }

    modalBody.innerHTML = bodyHtml;
    detailsModal.style.display = 'flex';
}

export function showHelpModal() {
    const helpModal = document.getElementById('helpModal');
    const detailsModal = document.getElementById('detailsModal');
    if (!helpModal) return;

    helpModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modalTitleHelp">Formelgrundlag</h3>
                <span class="close-button">&times;</span>
            </div>
            <div id="modalBodyHelp" class="modal-body">
                <h4>Generelle Principper</h4>
                <p>Dette værktøj er designet til at assistere med kanalberegninger i henhold til anerkendte principper og normer som <strong>DS 447</strong>. Alle beregninger tager højde for standardiserede fysiske love for at sikre nøjagtighed.</p>
                <p><strong>Lufttemperatur:</strong> Luftens densitet (ρ) og kinematiske viskositet (ν) justeres dynamisk baseret på den indtastede temperatur. Dette sker via Ideal gasloven og Sutherlands formel for at afspejle virkelige forhold.</p>
                <p><strong>Godstykkelse:</strong> Der anvendes en standard kanalgodstykkelse på 0,5 mm. Alle indtastede dimensioner er ydre mål, og programmet omregner automatisk til indre mål for alle beregninger.</p>
                
                <hr>

                <h4>Kanaldimensionering (Lige Kanalstræk)</h4>
                <p>Tryktab i lige kanaler beregnes med <strong>Darcy-Weisbachs ligning</strong>:</p>
                <p><code>dp = (λ / Dₕ) * (ρ/2) * v²</code></p>
                <p>Her er de centrale elementer:</p>
                <ul>
                    <li><strong>Friktionsfaktor (λ):</strong> Denne findes ved en iterativ løsning (50 gentagelser) af <strong>Colebrook-Whites ligning</strong>. Ligningen tager højde for både kanalens ruhed (k) og luftstrømmens turbulens, beskrevet ved Reynolds' tal (Re).</li>
                    <li><strong>Hydraulisk Diameter (Dₕ):</strong> For <strong>cirkulære</strong> kanaler er Dₕ lig med den indre diameter. For <strong>rektangulære</strong> kanaler beregnes Dₕ som: <code>Dₕ = 2*a*b / (a+b)</code>.</li>
                </ul>
                
                <hr>

                <h4>Formstykker (Enkeltmodstande)</h4>
                <p>Tryktab i formstykker beregnes ud fra en tryktabskoefficient (Zeta, ζ), som er unik for hvert formstykkes geometri:</p>
                <p><code>Δp = ζ * (ρ/2) * v²</code></p>
                <p><strong>Bøjninger, Udvidelser & Indsnævringer:</strong> For disse komponenter findes ζ-værdien via <strong>lineær og bilinear interpolation</strong> i indbyggede datatabeller baseret på de indtastede geometriske forhold. (Se physics.js for tabeller).</p>
                <p><strong>T-stykker:</strong> ζ-værdien beregnes dynamisk for hver udgang (ligeud og afgrening) baseret på principperne om <strong>masse- og energibevarelse (Bernoullis ligning)</strong>. Formlerne tager højde for forholdet mellem luftmængder og arealer.</p>

                <hr>

                <h4>Systemberegning</h4>
                <p>Denne fane bygger et komplet kanalsystem ved at summere tryktabet for en serie af komponenter. Beregningen foregår sekventielt med følgende principper:</p>
                <ul>
                    <li><strong>Kumulativt Tryktab:</strong> Det samlede tryktab er summen af tryktabet for hver enkelt komponent i listen.</li>
                    <li><strong>Global Systemtype:</strong> Du definerer fra start, om hele systemet er <strong>Indblæsning</strong> (dele-flow) eller <strong>Udsugning</strong> (samle-flow). Denne indstilling låses, så snart den første komponent tilføjes, og bestemmer, hvordan T-stykker automatisk beregnes.</li>
                    <li><strong>Videreført Luftmængde:</strong> Luftmængden for en ny komponent arves altid fra den foregående komponents udgående luftmængde. Dette er især vigtigt efter T-stykker, hvor luftmængden kan ændre sig.</li>
                    <li><strong>Automatiske Overgange:</strong> Hvis du tilføjer en komponent med en indgangsdimension, der ikke matcher den forrige komponents udgangsdimension, indsætter programmet automatisk en "OBS"-linje med en beregnet indsnævring/udvidelse for at gøre opmærksom på det nødvendige tryktab.</li>
                    <li><strong>T-stykker:</strong>T-stykkerne deler luftmængden, man skal selv huske at holde øje med luftmængde størrelserne ved split. Der kan regnes videre for alle grene, vises som "Afgrening" og "Ligeud". man kan fortsætte træet i alle afgreninger. </li>
                    <li><strong>Diagram:</strong> Med Diagram knappen kan man få vist sit system som 3D-visualisering. Med luftmængder, hastigheder og tryktab Pa/m for hver stræknig.</li>
                    <li><strong>Temperaturberegning:</strong> I toppen af programmet kan man sætte lufttemperatur (Start), luftfugtighed (%RH) og omgivelsestemperatur. Beregningen tager højde for virkelige forhold ved at justere luftens densitet dynamisk via <strong>Ideal gasloven</strong>: <code>ρ = P_atm / (R · (T + 273.15))</code>. Dette bruges til at omregne volumenstrøm til massestrøm (<code>q_m</code> i kg/s). 
                    <br><br>
                    <strong>Varmetab i kanaler:</strong> Beregnes med en eksponentiel model over kanalens overfladeareal (A) og isoleringens U-værdi: <code>T_ud = T_omg + (T_ind - T_omg) · e^(-(U·A)/(q_m·c_p))</code>. Det samlede varmetab (W) udregnes derefter ud fra temperaturdifferencen.
                    <br><br>
                    <strong>Blanding af luftstrømme (T-stykker):</strong> Når luftstrømme løber sammen ved udsugning, beregnes den nye temperatur som et massestrøms-vægtet gennemsnit: <code>T_blandet = (q_m1·T_1 + q_m2·T_2) / (q_m1 + q_m2)</code>. Det sikrer præcision, fordi kold luft er tungere end varm luft. I 3D-diagrammet kan man via visningsmenuen farvekode systemet og visuelt følge disse temperaturtab/gevinster fra start til slut.</li>
                </ul>
            </div>
        </div>`;

    const modalCloseHelp = helpModal.querySelector('.close-button');
    modalCloseHelp.onclick = () => { helpModal.style.display = "none"; };

    helpModal.style.display = 'flex';
}

export function toggleSystemMenu() {
    const menu = document.getElementById('systemMenu');
    if (menu) menu.classList.toggle('hidden');
}

export function printDocumentation(event) {
    if (event) event.preventDefault();
    toggleSystemMenu();

    const systemTree = window.stateManager ? window.stateManager.getSystemTree() : [];
    
    if (!systemTree || systemTree.length === 0) {
        alert("Systemet er tomt. Tilføj komponenter for at generere dokumentation.");
        return;
    }

    function calculateCriticalPath(node) {
        if (!node || node.isIncluded === false) return { loss: 0 };
        const pType = node.fittingType || (node.properties && node.properties.type) || node.type || '';
        const isTee = pType.startsWith('tee_');
        const pLoss = (node.state && node.state.pressureLoss) ? node.state.pressureLoss : 0;
        let maxPathLoss = 0;

        if (isTee) {
            const ports = ['outlet_straight', 'outlet_branch', 'outlet_path1', 'outlet_path2'];
            ports.forEach(port => {
                let portLoss = (node.state && node.state.portPressureLoss && node.state.portPressureLoss[port] !== undefined) ? node.state.portPressureLoss[port] : 0;
                let childLoss = 0;
                if (node.children && node.children[port] && node.children[port].length > 0) {
                    childLoss = calculateCriticalPath(node.children[port][0]).loss;
                }
                if (portLoss + childLoss > maxPathLoss) maxPathLoss = portLoss + childLoss;
            });
            return { loss: maxPathLoss };
        } else {
            if (node.children) {
                Object.values(node.children).forEach(childArray => {
                    childArray.forEach(child => {
                        let childLoss = calculateCriticalPath(child).loss;
                        if (childLoss > maxPathLoss) maxPathLoss = childLoss;
                    });
                });
            }
            return { loss: pLoss + maxPathLoss };
        }
    }

    const criticalResult = calculateCriticalPath(systemTree[0]);
    const globalCriticalPressureDrop = criticalResult.loss;

    let tableRows = '';
    function traversePrint(c, depth, labelPath) {
        const state = c.state || {};
        const props = c.properties || {};
        const data = state.calculationDetails || {};
        const isIncluded = c.isIncluded !== false;
        
        const pressureLoss = isIncluded ? (state.pressureLoss || 0) : 0;
        const velocity = isIncluded && state.velocity ? formatLocalFloat(state.velocity, 2) : '-';

        let airflowIn = state.airflow_in || c.airflow || 0;
        let airflowOutText = '-';
        const pType = c.fittingType || props.type || c.type || '';

        if (pType.startsWith('tee_')) {
            const isBullhead = pType === 'tee_bullhead';
            if (props.flowType === 'merging') {
                airflowOutText = state.airflow_out ? formatLocalFloat(state.airflow_out['outlet'] || 0, 0) : '-';
            } else {
                if (isBullhead) {
                    const q1 = state.airflow_out ? state.airflow_out['outlet_path1'] : 0;
                    const q2 = state.airflow_out ? state.airflow_out['outlet_path2'] : 0;
                    airflowOutText = `G1: ${formatLocalFloat(q1, 0)} | G2: ${formatLocalFloat(q2, 0)}`;
                } else {
                    const qs = state.airflow_out ? state.airflow_out['outlet_straight'] : 0;
                    const qb = state.airflow_out ? state.airflow_out['outlet_branch'] : 0;
                    airflowOutText = `L: ${formatLocalFloat(qs, 0)} | A: ${formatLocalFloat(qb, 0)}`;
                }
            }
        } else {
            airflowOutText = state.airflow_out ? formatLocalFloat(state.airflow_out['outlet'] || airflowIn, 0) : formatLocalFloat(airflowIn, 0);
        }

        let tIn = parseFloat(state.temperature_in);
        let tOutRaw = state.temperature_out ? 
            (state.temperature_out['outlet'] !== undefined ? state.temperature_out['outlet'] : 
             (state.temperature_out['outlet_straight'] !== undefined ? state.temperature_out['outlet_straight'] : 
              state.temperature_out['outlet_path1'])) 
            : undefined;
        let tOut = parseFloat(tOutRaw);
        let tempText = '-';
        
        if (isIncluded && !isNaN(tIn) && !isNaN(tOut)) {
            if (Math.abs(tIn - tOut) > 0.05) {
                tempText = `${formatLocalFloat(tIn, 1)} &rarr; ${formatLocalFloat(tOut, 1)}`;
            } else {
                tempText = `${formatLocalFloat(tIn, 1)}`;
            }
        }

        let isoText = '-';
        if (props.isoThick !== undefined && props.isoThick > 0) {
            isoText = `${props.isoThick} mm<br><span style="font-size:0.8em;color:#666;">λ: ${props.isoLambda || 0.037}</span>`;
        }

        let detailsText = '-';
        if (c.type === 'straightDuct' && data.pressureDrop) {
            detailsText = `λ: ${formatLocalFloat(data.lambda, 4)}<br><span style="font-size:0.8em;color:#666;">${formatLocalFloat(data.pressureDrop, 2)} Pa/m</span>`;
        } else if (state.zeta !== undefined && state.zeta !== null) {
            detailsText = `ζ: ${formatLocalFloat(state.zeta, 3)}`;
        } else if (data.zeta !== undefined) {
            detailsText = `ζ: ${formatLocalFloat(data.zeta, 3)}`;
        }

        const indent = Math.max(0, depth * 20);
        let treePrefix = labelPath ? `<div style="font-size:10px; color:#555; margin-bottom:2px;">&#8627; ${labelPath}</div>` : '';
        let nameHtml = `<strong>${c.name}</strong>${isIncluded ? '' : ' <em style="color:#999;">(Deaktiveret)</em>'}<br><span style="font-size:0.8em;color:#666;">${c.details || ''}</span>`;

        tableRows += `
            <tr style="${isIncluded ? '' : 'color:#999;'}">
                <td style="padding-left: ${indent + 8}px;">
                    ${treePrefix}
                    ${nameHtml}
                </td>
                <td>Ind: ${formatLocalFloat(airflowIn, 0)}<br>Ud: ${airflowOutText}</td>
                <td>${velocity}</td>
                <td>${tempText}</td>
                <td>${isoText}</td>
                <td>${detailsText}</td>
                <td><strong>${formatLocalFloat(pressureLoss, 2)}</strong></td>
            </tr>
        `;

        let expectedPorts = ['outlet'];
        if (pType.startsWith('tee_')) {
            if (pType === 'tee_bullhead') {
                expectedPorts = ['outlet_path1', 'outlet_path2'];
            } else {
                expectedPorts = ['outlet_straight', 'outlet_branch'];
            }
        }

        expectedPorts.forEach(portName => {
            let childLabel = '';
            let childDepth = depth;
            if (portName === 'outlet_branch' || portName === 'outlet_straight') {
                childLabel = portName === 'outlet_branch' ? 'Afgrening' : 'Ligeud';
                childDepth = depth + 1;
            } else if (portName === 'outlet_path1' || portName === 'outlet_path2') {
                childLabel = portName === 'outlet_path2' ? 'Gren 2' : 'Gren 1';
                childDepth = depth + 1;
            }

            if (c.children && c.children[portName] && c.children[portName].length > 0) {
                c.children[portName].forEach(child => {
                    traversePrint(child, childDepth, childLabel);
                });
            }
        });
    }

    if (systemTree.length > 0) {
        systemTree.forEach(root => {
            traversePrint(root, 0, '');
        });
    }

    const projectName = document.getElementById('projectName').value;
    const startAirflow = document.getElementById('system_airflow').value;

    const systemTypeInput = document.querySelector('input[name="systemFlowType"]:checked');
    let systemTypeLabel = 'Ukendt';
    if (systemTypeInput) {
        const label = document.querySelector(`label[for="${systemTypeInput.id}"]`);
        if (label) systemTypeLabel = label.textContent;
    }

    const temperature = document.getElementById('temperature').value;
    const printDate = new Date().toLocaleString('da-DK');

    const footerP = document.querySelector('.app-footer p');
    const appVersionText = footerP ? footerP.textContent.split(' --- ')[0] : 'Ventilationsberegner';

    const printHtml = `
        <style>
            .print-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; font-family: sans-serif; }
            .print-table th, .print-table td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: middle; }
            .print-table th { background-color: #f5f5f5; }
            body { font-family: sans-serif; color: #333; }
        </style>
        <h1>Dokumentation for Systemberegning</h1>
        ${projectName ? `<h2>Projekt: ${projectName}</h2>` : ''}
        <p>Genereret: ${printDate}</p>
        <h3>Grunddata</h3>
        <p><strong>Start Luftmængde:</strong> ${startAirflow} m³/h</p>
        <p><strong>Systemtype:</strong> ${systemTypeLabel}</p>
        <p><strong>Lufttemperatur (Start):</strong> ${temperature} °C</p>
        
        <table class="print-table">
            <thead>
                <tr>
                    <th>Komponent (Træstruktur)</th>
                    <th>Luftmængde [m³/h]</th>
                    <th>Hastighed [m/s]</th>
                    <th>Temp. (Ind &rarr; Ud) [°C]</th>
                    <th>Isolering</th>
                    <th>Detaljer (&zeta;/&lambda;)</th>
                    <th>Tryktab [Pa]</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="6" style="text-align:right;"><strong>Samlet Systemtryktab (Kritisk Vej)</strong></td>
                    <td><strong>${formatLocalFloat(globalCriticalPressureDrop, 2)} Pa</strong></td>
                </tr>
            </tfoot>
        </table>
        
        <div style="margin-top: 30px; font-size: 8pt; color: #777;">
            <p>Beregningen er foretaget med NIRAS Ventilationsberegner (${appVersionText})</p>
        </div>
    `;

    const printContainer = document.createElement('div');
    printContainer.id = 'print-container';
    printContainer.innerHTML = printHtml;
    document.body.appendChild(printContainer);

    window.print();

    document.body.removeChild(printContainer);
}

// --- Dynamic UI Updates ---

export function updateDimUI() {
    const mode = document.querySelector('input[name="calculationMode"]:checked').value;
    const shape = document.querySelector('input[name="ductShape"]:checked').value;

    const calculateInputs = document.getElementById('calculateInputs');
    const analyzeInputs = document.getElementById('analyzeInputs');
    const aspectRatioInput = document.getElementById('aspectRatioInput');
    const analyzeRound = document.getElementById('analyzeRound');
    const analyzeRectangular = document.getElementById('analyzeRectangular');

    if (calculateInputs) calculateInputs.style.display = mode === 'calculate' ? 'block' : 'none';
    if (analyzeInputs) analyzeInputs.style.display = mode === 'analyze' ? 'block' : 'none';
    if (aspectRatioInput) aspectRatioInput.style.display = (mode === 'calculate' && shape === 'rectangular') ? 'block' : 'none';
    if (analyzeRound) analyzeRound.style.display = (mode === 'analyze' && shape === 'round') ? 'block' : 'none';
    if (analyzeRectangular) analyzeRectangular.style.display = (mode === 'analyze' && shape === 'rectangular') ? 'flex' : 'none';
}

export function updateConstraintDefaults() {
    const constraintTypeSelect = document.getElementById('constraintType');
    const constraintValueInput = document.getElementById('constraintValue');
    const unitWrapper = constraintValueInput.parentElement;

    if (constraintTypeSelect.value === 'velocity') {
        constraintValueInput.value = '5';
        unitWrapper.dataset.unit = 'm/s';
    } else { // pressure
        constraintValueInput.value = '0,5';
        unitWrapper.dataset.unit = 'Pa/m';
    }
}

export function populateDatalists() {
    const diameterList = document.getElementById('diameter-list');
    const rectList = document.getElementById('rect-list');

    if (diameterList) {
        diameterList.innerHTML = '';
        STANDARD_ROUND_SIZES_MM.forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            diameterList.appendChild(option);
        });
    }

    if (rectList) {
        rectList.innerHTML = '';
        STANDARD_RECT_SIZES_MM.forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            rectList.appendChild(option);
        });

    }
}

export function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMessage');
    const btnOk = document.getElementById('btnConfirmOk');
    const btnCancel = document.getElementById('btnConfirmCancel');

    if (!modal || !msgEl || !btnOk || !btnCancel) {
        console.error('Confirm modal elements missing!');
        return;
    }

    msgEl.textContent = message;
    modal.classList.remove('hidden');

    // Remove old listeners by cloning
    const newBtnOk = btnOk.cloneNode(true);
    const newBtnCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

    newBtnOk.addEventListener('click', () => {
        modal.classList.add('hidden');
        onConfirm();
    });

    newBtnCancel.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
}

export function updateUndoRedoUI(canUndo, canRedo) {
    const undoBtn = document.getElementById('undoButton');
    const redoBtn = document.getElementById('redoButton');

    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
}

let saveStatusTimeout;
export function showSaveStatus(status, type = 'saved') {
    const statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;

    statusEl.textContent = status;
    statusEl.className = 'save-status visible';

    if (type === 'saving') {
        statusEl.classList.add('saving');
    }

    // Clear previous timeout
    if (saveStatusTimeout) clearTimeout(saveStatusTimeout);

    // Auto-hide after 2 seconds if just "Saved"
    if (type === 'saved') {
        saveStatusTimeout = setTimeout(() => {
            statusEl.classList.remove('visible');
        }, 2000);
    }
}


// --- Helper UI Functions ---

export function updateFittingTypeOptions() {
    const flowTypeRadio = document.querySelector('input[name="fitFlowType"]:checked');
    const fittingSelect = document.getElementById('fittingType');
    if (!flowTypeRadio || !fittingSelect) return;

    const flowType = flowTypeRadio.value;
    const currentSelection = fittingSelect.value;

    let optionsHtml = `
        <option value="">-- Vælg type --</option>
        <optgroup label="Bøjninger">
            <option value="bend_circ">Bøjning, Cirkulær</option>
            <option value="bend_rect">Bøjning, Rektangulær</option>
        </optgroup>
        <optgroup label="Dimensionsændringer">
            <option value="expansion">Udvidelse, Cirkulær</option>
            <option value="contraction">Indsnævring, Cirkulær</option>
            <option value="expansion_rect">Udvidelse, Rektangulær</option>
            <option value="contraction_rect">Indsnævring, Rektangulær</option>
            <option value="transition_rect_round" ${flowType === 'splitting' ? '' : 'disabled hidden'}>Overgang, Firkant til Rund</option>
            <option value="transition_round_rect" ${flowType === 'merging' ? '' : 'disabled hidden'}>Overgang, Rund til Firkant</option>
    `;

    optionsHtml += `
        </optgroup>
        <optgroup label="T-stykker (Cirkulær)">
            <option value="tee_sym">T-stykke, Symmetrisk</option>
            <option value="tee_asym">T-stykke, Asymmetrisk</option>
            <option value="tee_bullhead">T-stykke (Dobbelt Afgrening)</option>
        </optgroup>
    `;

    fittingSelect.innerHTML = optionsHtml;
    fittingSelect.value = currentSelection;
}

export function renderFittingInputs() {
    const fittingTypeSelect = document.getElementById('fittingType');
    const type = fittingTypeSelect.value;
    const illustrationContainer = document.getElementById('fittingIllustrationContainer');
    const fittingInputsContainer = document.getElementById('fittingInputsContainer');

    illustrationContainer.innerHTML = '';
    fittingInputsContainer.innerHTML = '';
    if (!type) return;

    const roundOptions = STANDARD_ROUND_SIZES_MM.map(s => `<option value="${s}">${s} mm</option>`).join('');
    const rectOptions = STANDARD_RECT_SIZES_MM.map(s => `<option value="${s}">${s} mm</option>`).join('');
    let illustrationSvg = '';
    let inputsHtml = '';
    let commonAirflowInput = `<div class="input-group"><label for="fit_airflow">Luftmængde</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="fit_airflow" class="input-field" required></div></div>`;

    if (type.startsWith('tee')) {
        const isBullhead = type === 'tee_bullhead';

        const splittingSvg = isBullhead
            ? `<img src="./public/icons/tee_bullhead_splitting.svg" alt="T-stykke Splitting" style="max-width:100%; height:auto;">`
            : `<img src="./public/icons/tee_splitting.svg" alt="T-stykke Splitting" style="max-width:100%; height:auto;">`;
        const mergingSvg = isBullhead
            ? `<img src="./public/icons/tee_bullhead_merging.svg" alt="T-stykke Merging" style="max-width:100%; height:auto;">`
            : `<img src="./public/icons/tee_merging.svg" alt="T-stykke Merging" style="max-width:100%; height:auto;">`;

        fittingInputsContainer.innerHTML = `
            <div class="input-group">
                <label>Flow Type</label> 
                <div class="radio-group"> 
                    <input type="radio" id="fitTeeFlowSplit" name="fitTeeFlowType" value="splitting" checked><label for="fitTeeFlowSplit">${isBullhead ? '1 ind, 2 ud' : 'Indblæsning'}</label> 
                    <input type="radio" id="fitTeeFlowMerge" name="fitTeeFlowType" value="merging"><label for="fitTeeFlowMerge">${isBullhead ? '2 ind, 1 ud' : 'Udsugning'}</label> 
                </div>
            </div>
            <div id="fitTeeSpecificInputs"></div>`;

        const updateTeeUI = () => {
            const flowType = document.querySelector('input[name="fitTeeFlowType"]:checked').value;
            const container = document.getElementById('fitTeeSpecificInputs');
            illustrationContainer.innerHTML = `<div class="illustration-container">${flowType === 'splitting' ? splittingSvg : mergingSvg}</div>`;

            const isSym = type === 'tee_sym';
            let teeInputsHtml = '';

            if (isBullhead) {
                if (flowType === 'splitting') {
                    teeInputsHtml = `<div class="sub-group"><label>Luftmængder</label><div class="input-field-group"><div class="input-group"><label for="q_in">q Ind</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_in" class="input-field" required></div></div><div class="input-group"><label for="q_out1">q Ud 1</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_out1" class="input-field" required></div></div><div class="input-group"><label for="q_out2">q Ud 2</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_out2" class="input-field" required></div></div></div></div><div class="sub-group" id="teeDiameterInputs"><label>Diametre</label><div class="input-field-group"><div class="input-group"><label for="d_in">Ø Ind</label><select id="d_in" class="input-field">${roundOptions}</select></div><div class="input-group"><label for="d_out1">Ø Ud 1</label><select id="d_out1" class="input-field">${roundOptions}</select></div><div class="input-group"><label for="d_out2">Ø Ud 2</label><select id="d_out2" class="input-field">${roundOptions}</select></div></div></div>`;
                } else { // merging bullhead
                    teeInputsHtml = `<div class="sub-group"><label>Luftmængder</label><div class="input-field-group"><div class="input-group"><label for="q_in1">q Ind 1</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_in1" class="input-field" required></div></div><div class="input-group"><label for="q_in2">q Ind 2</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_in2" class="input-field" required></div></div></div></div><div class="sub-group" id="teeDiameterInputs"><label>Diametre</label><div class="input-field-group"><div class="input-group"><label for="d_in1">Ø Ind 1</label><select id="d_in1" class="input-field">${roundOptions}</select></div><div class="input-group"><label for="d_in2">Ø Ind 2</label><select id="d_in2" class="input-field">${roundOptions}</select></div><div class="input-group"><label for="d_common">Ø Ud</label><select id="d_common" class="input-field">${roundOptions}</select></div></div></div>`;
                }
            } else { // tee_sym or tee_asym
                const diameterInputs = isSym ? `<div class="input-group"><label>Diameter (alle grene)</label><select id="d_in" class="input-field">${roundOptions}</select></div>` : `<div class="input-field-group"><div class="input-group"><label id="label_d_in" for="d_in">Ø Ind/Ud</label><select id="d_in" class="input-field">${roundOptions}</select></div><div class="input-group"><label for="d_straight">Ø Ligeud</label><select id="d_straight" class="input-field">${roundOptions}</select></div><div class="input-group"><label for="d_branch">Ø Afgrening</label><select id="d_branch" class="input-field">${roundOptions}</select></div></div>`;
                if (flowType === 'splitting') {
                    teeInputsHtml = `<div class="sub-group"><label>Luftmængder</label><div class="input-field-group"><div class="input-group"><label for="q_in">q Ind</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_in" class="input-field" required></div></div><div class="input-group"><label for="q_straight">q Ligeud</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_straight" class="input-field" required></div></div><div class="input-group"><label for="q_branch">q Afgrening</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_branch" class="input-field" required></div></div></div></div><div class="sub-group">${diameterInputs}</div>`;
                } else { // merging
                    teeInputsHtml = `<div class="sub-group"><label>Luftmængder</label><div class="input-field-group"><div class="input-group"><label for="q_straight">q Ligeud (Ind)</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_straight" class="input-field" required></div></div><div class="input-group"><label for="q_branch">q Afgrening (Ind)</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="q_branch" class="input-field" required></div></div></div></div><div class="sub-group">${diameterInputs}</div>`;
                }
            }
            container.innerHTML = teeInputsHtml;

            if (!isSym && !isBullhead) {
                const label = document.getElementById('label_d_in');
                if (label) label.innerText = (flowType === 'splitting' ? 'Ø Ind' : 'Ø Ud');
            }
        };

        document.getElementsByName('fitTeeFlowType').forEach(r => r.addEventListener('change', updateTeeUI));
        updateTeeUI();

    } else {
        switch (type) {
            case 'bend_circ':
                illustrationSvg = `<img src="./public/icons/bend_circ.svg" alt="Cirkulær Bøjning" style="max-width:100%; height:auto;">`;
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="d">Diameter (d)</label><select id="d" class="input-field">${roundOptions}</select></div>
                        <div class="input-group"><label for="angle">Vinkel (α)</label><input type="text" id="angle" class="input-field" value="90"></div>
                        <div class="input-group"><label for="radius">Radius (R)</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="radius" class="input-field" value="100"></div></div>
                    </div>`;
                break;
            case 'bend_rect':
                illustrationSvg = `<img src="./public/icons/bend_rect.svg" alt="Rektangulær Bøjning" style="max-width:100%; height:auto;">`;
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="h">Højde (H)</label><select id="h" class="input-field">${rectOptions}</select></div>
                        <div class="input-group"><label for="w">Bredde (B)</label><select id="w" class="input-field">${rectOptions}</select></div>
                        <div class="input-group"><label for="angle">Vinkel (α)</label><input type="text" id="angle" class="input-field" value="90"></div>
                        <div class="input-group"><label for="radius">Radius (R)</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="radius" class="input-field" value="100"></div></div>
                    </div>`;
                break;
            case 'expansion':
                illustrationSvg = `<img src="./public/icons/expansion.svg" alt="Expansion" style="max-width:100%; height:auto;">`;
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="d1">Diameter Ind (d₁)</label><select id="d1" class="input-field">${roundOptions}</select></div>
                        <div class="input-group"><label for="d2">Diameter Ud (d₂)</label><select id="d2" class="input-field">${roundOptions}</select></div>
                    </div>
                    <div class="input-group"><label>Definér geometri via:</label><div class="radio-group">
                        <input type="radio" id="geo_angle" name="geo_type" value="angle" checked><label for="geo_angle">Vinkel (α)</label>
                        <input type="radio" id="geo_length" name="geo_type" value="length"><label for="geo_length">Længde (L)</label>
                    </div></div>
                    <div id="geo_input_container"></div>`;
                break;
            case 'contraction':
                illustrationSvg = `<img src="./public/icons/contraction.svg" alt="Contraction" style="max-width:100%; height:auto;">`;
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="d1">Diameter Ind (d₁)</label><select id="d1" class="input-field">${roundOptions}</select></div>
                        <div class="input-group"><label for="d2">Diameter Ud (d₂)</label><select id="d2" class="input-field">${roundOptions}</select></div>
                    </div>
                    <div class="input-group"><label>Definér geometri via:</label><div class="radio-group">
                        <input type="radio" id="geo_angle" name="geo_type" value="angle" checked><label for="geo_angle">Vinkel (α)</label>
                        <input type="radio" id="geo_length" name="geo_type" value="length"><label for="geo_length">Længde (L)</label>
                    </div></div>
                    <div id="geo_input_container"></div>`;
                break;
            case 'expansion_rect':
                illustrationSvg = `<img src="./public/icons/expansion_rect.svg" alt="Rektangulær Udvidelse" style="max-width:100%; height:auto;">`;
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="h1">Højde Ind (H₁)</label><select id="h1" class="input-field">${rectOptions}</select></div>
                        <div class="input-group"><label for="w1">Bredde Ind (B₁)</label><select id="w1" class="input-field">${rectOptions}</select></div>
                    </div>
                    <div class="input-field-group">
                        <div class="input-group"><label for="h2">Højde Ud (H₂)</label><select id="h2" class="input-field">${rectOptions}</select></div>
                        <div class="input-group"><label for="w2">Bredde Ud (B₂)</label><select id="w2" class="input-field">${rectOptions}</select></div>
                    </div>
                    <div class="input-group"><label>Definér geometri via:</label><div class="radio-group">
                        <input type="radio" id="geo_angle" name="geo_type" value="angle" checked><label for="geo_angle">Vinkel (α)</label>
                        <input type="radio" id="geo_length" name="geo_type" value="length"><label for="geo_length">Længde (L)</label>
                    </div></div>
                    <div id="geo_input_container"></div>`;
                break;
            case 'contraction_rect':
                illustrationSvg = `<img src="./public/icons/contraction_rect.svg" alt="Rektangulær Indsnævring" style="max-width:100%; height:auto;">`;
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="h1">Højde Ind (H₁)</label><select id="h1" class="input-field">${rectOptions}</select></div>
                        <div class="input-group"><label for="w1">Bredde Ind (B₁)</label><select id="w1" class="input-field">${rectOptions}</select></div>
                    </div>
                    <div class="input-field-group">
                        <div class="input-group"><label for="h2">Højde Ud (H₂)</label><select id="h2" class="input-field">${rectOptions}</select></div>
                        <div class="input-group"><label for="w2">Bredde Ud (B₂)</label><select id="w2" class="input-field">${rectOptions}</select></div>
                    </div>
                    <div class="input-group"><label>Definér geometri via:</label><div class="radio-group">
                        <input type="radio" id="geo_angle" name="geo_type" value="angle" checked><label for="geo_angle">Vinkel (α)</label>
                        <input type="radio" id="geo_length" name="geo_type" value="length"><label for="geo_length">Længde (L)</label>
                    </div></div>
                    <div id="geo_input_container"></div>`;
                break;
            case 'transition_round_rect':
            case 'transition_rect_round':
                if (type === 'transition_round_rect') {
                    illustrationSvg = `<img src="./public/icons/transition_round_rect.svg" alt="Overgang Rund til Firkant" style="max-width:100%; height:auto;">`;
                } else {
                    illustrationSvg = `<img src="./public/icons/transition_rect_round.svg" alt="Overgang Firkant til Rund" style="max-width:100%; height:auto;">`;
                }
                inputsHtml = commonAirflowInput + `
                    <div class="input-field-group">
                        <div class="input-group"><label for="d">Diameter (d)</label><input type="text" id="d" class="input-field" list="diameter-list"></div>
                    </div>
                    <div class="input-field-group">
                        <div class="input-group"><label for="h">Højde (H)</label><input type="text" id="h" class="input-field" list="rect-list"></div>
                        <div class="input-group"><label for="w">Bredde (B)</label><input type="text" id="w" class="input-field" list="rect-list"></div>
                    </div>
                    <div class="input-group"><label>Definér geometri via:</label><div class="radio-group">
                        <input type="radio" id="geo_angle" name="geo_type" value="angle" checked><label for="geo_angle">Vinkel (α)</label>
                        <input type="radio" id="geo_length" name="geo_type" value="length"><label for="geo_length">Længde (L)</label>
                    </div></div>
                    <div id="geo_input_container"></div>`;
                break;
        }
        if (illustrationSvg) illustrationContainer.innerHTML = `<div class="illustration-container">${illustrationSvg}</div>`;
        fittingInputsContainer.innerHTML = inputsHtml;

        const geoRadios = document.getElementsByName('geo_type');
        if (geoRadios.length > 0) {
            const updateGeoInput = () => {
                const geoType = document.querySelector('input[name="geo_type"]:checked').value;
                const container = document.getElementById('geo_input_container');
                if (geoType === 'angle') {
                    container.innerHTML = `<div class="input-group"><label for="angle">Vinkel (α)</label><div class="input-unit-wrapper" data-unit="°"><input type="text" id="angle" class="input-field" value="30"></div></div>`;
                } else {
                    container.innerHTML = `<div class="input-group"><label for="length">Længde (L)</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="length" class="input-field" value="500"></div></div>`;
                }
            };
            geoRadios.forEach(radio => radio.addEventListener('change', updateGeoInput));
            updateGeoInput();
        }
    }
}

export function handleComponentTypeChange() {
    const systemComponentTypeSelect = document.getElementById('systemComponentType');
    if (!systemComponentTypeSelect) return; 
    const systemComponentInputsContainer = document.getElementById('systemComponentInputsContainer');

    const type = systemComponentTypeSelect.value;
    systemComponentInputsContainer.innerHTML = ''; 

    if (type === 'straightDuct') {
        renderSystemDuctInputs(systemComponentInputsContainer);
    } else if (type === 'fitting') {
        systemComponentInputsContainer.innerHTML = `
            <div class="input-group"><label for="systemFittingType">Vælg type formstykke</label><select id="systemFittingType" class="input-field">
                <option value="">-- Vælg type --</option>
                <optgroup label="Bøjninger"><option value="bend_circ">Bøjning, Cirkulær</option><option value="bend_rect">Bøjning, Rektangulær</option></optgroup>
                <optgroup label="Dimensionsændringer">
                    <option value="expansion">Udvidelse, Cirkulær</option>
                    <option value="contraction">Indsnævring, Cirkulær</option>
                    <option value="expansion_rect">Udvidelse, Rektangulær</option>
                    <option value="contraction_rect">Indsnævring, Rektangulær</option>
                    <option value="transition_rect_round">Overgang, Firkant til Rund</option>
                    <option value="transition_round_rect">Overgang, Rund til Firkant</option>
                </optgroup>
                <optgroup label="T-stykker (Cirkulær)"><option value="tee_sym">T-stykke, Symmetrisk</option><option value="tee_asym">T-stykke, Asymmetrisk</option><option value="tee_bullhead">T-stykke (Dobbelt Afgrening)</option></optgroup>
            </select></div>
            <div id="systemFittingInputsContainer"></div>`;

        document.getElementById('systemFittingType').addEventListener('change', () => renderSystemFittingInputs());

    } else if (type === 'manualLoss') {
        systemComponentInputsContainer.innerHTML = `
            <div class="input-group"><label for="manualPressureLoss">Tryktab</label><div class="input-unit-wrapper" data-unit="Pa"><input type="text" id="manualPressureLoss" class="input-field" required></div></div>
            <div class="input-group"><label for="manualDescription">Beskrivelse</label><input type="text" id="manualDescription" class="input-field" placeholder="f.eks. Spjæld, Rist, Filter"></div>
            <button type="button" class="button primary" onclick="window.handleInlineComponentSubmit(event)">Tilføj til System</button>`;
    }
}

export function renderSystemDuctInputs(container, initialData = null) {
    const roundOptions = STANDARD_ROUND_SIZES_MM.map(s => `<option value="${s}">${s} mm</option>`).join('');
    const rectOptions = STANDARD_RECT_SIZES_MM.map(s => `<option value="${s}">${s} mm</option>`).join('');

    const isAddMode = container.id === 'systemComponentInputsContainer' || container.id.startsWith('add_container') || container.id === 'inlineFittingInputsContainer';
    const isInlineAdd = container.id.startsWith('add_container') || container.id === 'inlineFittingInputsContainer' || container.id === 'inlineDuctInputsContainer';
    const isEditMode = !isAddMode && initialData && initialData.id;
    const suffix = isEditMode ? '_edit' : (isInlineAdd ? '_inline' : '');
    const btnAction = initialData ? `window.handleUpdateComponent('${initialData.id}')` : 'window.handleInlineComponentSubmit(event)';
    const btnText = initialData ? 'Opdater Komponent' : 'Tilføj til System';

    // Bestem default form baseret på parentDim (hvis vi tilføjer inline)
    let defaultShape = 'round';
    if (isInlineAdd && window.currentParentDim) {
        defaultShape = window.currentParentDim.shape === 'rect' ? 'rectangular' : 'round';
    } else if (initialData && initialData.properties && (initialData.properties.shape === 'rect' || initialData.properties.shape === 'rectangular')) {
        defaultShape = 'rectangular';
    }

    container.innerHTML = `
        <div class="input-group"><label for="ductLength${suffix}">Længde</label><div class="input-unit-wrapper" data-unit="m"><input type="text" id="ductLength${suffix}" class="input-field" required></div></div>
        <div class="input-group"><label>Kanalform</label><div class="radio-group">
            <input type="radio" id="sysDuctRound${suffix}" name="sysDuctShape${suffix}" value="round" ${defaultShape === 'round' ? 'checked' : ''}><label for="sysDuctRound${suffix}">Cirkulær</label>
            <input type="radio" id="sysDuctRect${suffix}" name="sysDuctShape${suffix}" value="rectangular" ${defaultShape === 'rectangular' ? 'checked' : ''}><label for="sysDuctRect${suffix}">Rektangulær</label>
        </div></div>
        <div id="sysDuctInputsContainer${suffix}"></div>
        
        <div style="margin-top:15px; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <strong style="font-size: 0.9rem; color: var(--text-color);">Termodynamik & Isolering</strong>
            <div class="input-field-group" style="margin-top:10px;">
                <div class="input-group"><label for="ductAmbient${suffix}">Omgivelsestemp.</label><div class="input-unit-wrapper" data-unit="°C"><input type="text" id="ductAmbient${suffix}" class="input-field" placeholder="auto"></div></div>
                <div class="input-group"><label for="ductIsoThick${suffix}">Isoleringstykkelse</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="ductIsoThick${suffix}" class="input-field" placeholder="0"></div></div>
                <div class="input-group"><label for="ductIsoLambda${suffix}">Isolering Lambda (λ)</label><input type="text" id="ductIsoLambda${suffix}" class="input-field" placeholder="0.037"></div>
            </div>
        </div>

        <button type="button" class="button primary" onclick="${btnAction}">${btnText}</button>`;

    const renderInputs = () => {
        const shape = document.querySelector(`input[name="sysDuctShape${suffix}"]:checked`).value;
        const subContainer = document.getElementById(`sysDuctInputsContainer${suffix}`);

        if (shape === 'round') {
            subContainer.innerHTML = `<div class="input-group"><label for="ductDiameter${suffix}">Diameter</label><select id="ductDiameter${suffix}" class="input-field">${roundOptions}</select></div>`;
            if (initialData && initialData.properties) {
                if (initialData.properties.shape === 'round') document.getElementById(`ductDiameter${suffix}`).value = initialData.properties.diameter || initialData.properties.d;
            } else if (isInlineAdd && window.currentParentDim && window.currentParentDim.shape === 'round') {
                // Nedarvning af diameter fra parent
                document.getElementById(`ductDiameter${suffix}`).value = window.currentParentDim.d;
            }
        } else {
            subContainer.innerHTML = `<div class="input-field-group"><div class="input-group"><label for="ductSideA${suffix}">Side A (Højde)</label><select id="ductSideA${suffix}" class="input-field">${rectOptions}</select></div><div class="input-group"><label for="ductSideB${suffix}">Side B (Bredde)</label><select id="ductSideB${suffix}" class="input-field">${rectOptions}</select></div></div>`;
            if (initialData && initialData.properties) {
                if (initialData.properties.shape === 'rect' || initialData.properties.shape === 'rectangular') {
                    document.getElementById(`ductSideA${suffix}`).value = initialData.properties.sideA || initialData.properties.h;
                    document.getElementById(`ductSideB${suffix}`).value = initialData.properties.sideB || initialData.properties.w;
                }
            } else if (isInlineAdd && window.currentParentDim && window.currentParentDim.shape === 'rect') {
                // Nedarvning af firkant-mål fra parent
                document.getElementById(`ductSideA${suffix}`).value = window.currentParentDim.h;
                document.getElementById(`ductSideB${suffix}`).value = window.currentParentDim.w;
            }
        }
    };

    document.getElementsByName(`sysDuctShape${suffix}`).forEach(r => r.addEventListener('change', renderInputs));
    renderInputs(); // Kør den med det samme

    // Pre-fill generelle data (Længde og Isolering)
    if (initialData && initialData.properties) {
        document.getElementById(`ductLength${suffix}`).value = initialData.properties.length || '';
        const p = initialData.properties;
        if (p.ambientTemp !== undefined) document.getElementById(`ductAmbient${suffix}`).value = p.ambientTemp;
        if (p.isoThick !== undefined) document.getElementById(`ductIsoThick${suffix}`).value = p.isoThick;
        if (p.isoLambda !== undefined) document.getElementById(`ductIsoLambda${suffix}`).value = p.isoLambda;
    } else if (isInlineAdd && window.currentParentProps) {
        // Nedarvning af isoleringsegenskaber fra parent
        const p = window.currentParentProps;
        if (p.ambientTemp !== undefined) document.getElementById(`ductAmbient${suffix}`).value = p.ambientTemp;
        if (p.isoThick !== undefined) document.getElementById(`ductIsoThick${suffix}`).value = p.isoThick;
        if (p.isoLambda !== undefined) document.getElementById(`ductIsoLambda${suffix}`).value = p.isoLambda;
    }
}

export function renderSystemFittingInputs(container = null, initialData = null) {
    const targetContainer = container || document.getElementById('systemFittingInputsContainer');
    const isAddMode = targetContainer.id === 'systemComponentInputsContainer' || targetContainer.id.startsWith('add_container') || targetContainer.id === 'inlineFittingInputsContainer' || targetContainer.id === 'systemFittingInputsContainer';
    const isEditMode = !isAddMode && initialData && initialData.id;
    const isInlineAdd = targetContainer.id.startsWith('add_container') || targetContainer.id === 'inlineFittingInputsContainer';
    const suffix = isEditMode ? '_edit' : (isInlineAdd ? '_inline' : '');

    let fittingType;
    if (initialData && initialData.type) {
        fittingType = (initialData.properties && initialData.properties.type) ? initialData.properties.type : initialData.type;
        if (initialData.fittingType) fittingType = initialData.fittingType;
    } else {
        const typeSelect = document.getElementById(`systemFittingType${suffix}`) || document.getElementById('inlineFittingType');
        fittingType = typeSelect ? typeSelect.value : null;
    }

    if (!fittingType) return;

    targetContainer.innerHTML = '';
    const roundOptions = STANDARD_ROUND_SIZES_MM.map(s => `<option value="${s}">${s} mm</option>`).join('');
    const rectOptions = STANDARD_RECT_SIZES_MM.map(s => `<option value="${s}">${s} mm</option>`).join('');
    const orientationOptions = `<option value="Left">Venstre</option><option value="Right">Højre</option><option value="Up">Op (Loft)</option><option value="Down">Ned (Gulv)</option>`;
    let inputsHtml = '';
    const id = (base) => `${base}${suffix}`;

    switch (fittingType) {
        case 'bend_circ':
            inputsHtml = `
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_d')}">Diameter (d)</label><select id="${id('sys_d')}" class="input-field">${roundOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_angle')}">Vinkel (α)</label><input type="text" id="${id('sys_angle')}" class="input-field" value="90"></div>
                    <div class="input-group"><label for="${id('sys_rd')}">R/d ratio</label><input type="text" id="${id('sys_rd')}" class="input-field" value="1.0"></div>
                    <div class="input-group"><label for="${id('sys_orientation')}">Retning (3D)</label><select id="${id('sys_orientation')}" class="input-field">${orientationOptions}</select></div>
                </div>`;
            break;
        case 'bend_rect':
            inputsHtml = `
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_h')}">Højde (H)</label><select id="${id('sys_h')}" class="input-field">${rectOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_w')}">Bredde (B)</label><select id="${id('sys_w')}" class="input-field">${rectOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_angle_r')}">Vinkel (α)</label><input type="text" id="${id('sys_angle_r')}" class="input-field" value="90"></div>
                    <div class="input-group"><label for="${id('sys_rh')}">R/H ratio</label><input type="text" id="${id('sys_rh')}" class="input-field" value="1.0"></div>
                    <div class="input-group"><label for="${id('sys_orientation')}">Retning (3D)</label><select id="${id('sys_orientation')}" class="input-field">${orientationOptions}</select></div>
                </div>`;
            break;
        case 'expansion':
        case 'contraction':
            inputsHtml = `
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_d1')}">Diameter Ind (d₁)</label><select id="${id('sys_d1')}" class="input-field">${roundOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_d2')}">Diameter Ud (d₂)</label><select id="${id('sys_d2')}" class="input-field">${roundOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_angle_dim')}">Vinkel (α)</label><input type="text" id="${id('sys_angle_dim')}" class="input-field" value="30"></div>
                </div>`;
            break;
        case 'expansion_rect':
        case 'contraction_rect':
            inputsHtml = `
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_h1')}">Højde Ind (H₁)</label><select id="${id('sys_h1')}" class="input-field">${rectOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_w1')}">Bredde Ind (B₁)</label><select id="${id('sys_w1')}" class="input-field">${rectOptions}</select></div>
                </div>
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_h2')}">Højde Ud (H₂)</label><select id="${id('sys_h2')}" class="input-field">${rectOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_w2')}">Bredde Ud (B₂)</label><select id="${id('sys_w2')}" class="input-field">${rectOptions}</select></div>
                </div>
                <div class="input-group"><label for="${id('sys_angle_dim')}">Vinkel (α)</label><input type="text" id="${id('sys_angle_dim')}" class="input-field" value="30"></div>`;
            break;
        case 'transition_round_rect':
        case 'transition_rect_round':
            inputsHtml = `
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_d')}">Diameter (d)</label><select id="${id('sys_d')}" class="input-field">${roundOptions}</select></div>
                </div>
                <div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_h')}">Højde (H)</label><select id="${id('sys_h')}" class="input-field">${rectOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_w')}">Bredde (B)</label><select id="${id('sys_w')}" class="input-field">${rectOptions}</select></div>
                </div>
                <div class="input-group"><label for="${id('sys_angle_dim')}">Vinkel (α)</label><input type="text" id="${id('sys_angle_dim')}" class="input-field" value="30"></div>`;
            break;
        case 'tee_sym':
        case 'tee_asym': {
            const isSym = fittingType === 'tee_sym';
            const diameterInputs = isSym ?
                `<div class="input-group"><label>Diameter (alle grene)</label><select id="${id('sys_tee_d_in')}" class="input-field">${roundOptions}</select></div>` :
                `<div class="input-field-group">
                    <div class="input-group"><label for="${id('sys_tee_d_in')}">Ø Ind/Ud</label><select id="${id('sys_tee_d_in')}" class="input-field">${roundOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_tee_d_straight')}">Ø Ligeud</label><select id="${id('sys_tee_d_straight')}" class="input-field">${roundOptions}</select></div>
                    <div class="input-group"><label for="${id('sys_tee_d_branch')}">Ø Afgrening</label><select id="${id('sys_tee_d_branch')}" class="input-field">${roundOptions}</select></div>
                </div>`;

            inputsHtml = `
                <div id="${id('teeSpecificInputs')}">
                    <div class="sub-group">
                        <label>Luftmængder (efterlades felterne tomme deles auto 50/50)</label>
                        <div class="input-field-group">
                            <div class="input-group"><label for="${id('sys_tee_q_straight')}">q Ligeud</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="${id('sys_tee_q_straight')}" class="input-field" placeholder="auto"></div></div>
                            <div class="input-group"><label for="${id('sys_tee_q_branch')}">q Afgrening</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="${id('sys_tee_q_branch')}" class="input-field" placeholder="auto"></div></div>
                        </div>
                    </div>
                    <div class="sub-group">${diameterInputs}</div>
                    <div class="sub-group">
                        <label for="${id('sys_orientation')}">Afgreningens Retning (3D)</label>
                        <select id="${id('sys_orientation')}" class="input-field">${orientationOptions}</select>
                    </div>
                </div>`;
            break;
        }
        case 'tee_bullhead':
            inputsHtml = `
                <div class="sub-group">
                    <label>Luftmængder (efterlades felterne tomme deles auto 50/50)</label>
                    <div class="input-field-group">
                        <div class="input-group"><label for="${id('sys_tee_q_out1')}">q Gren 1</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="${id('sys_tee_q_out1')}" class="input-field" placeholder="auto"></div></div>
                        <div class="input-group"><label for="${id('sys_tee_q_out2')}">q Gren 2</label><div class="input-unit-wrapper" data-unit="m³/h"><input type="text" id="${id('sys_tee_q_out2')}" class="input-field" placeholder="auto"></div></div>
                    </div>
                </div>
                <div class="sub-group">
                    <label>Diametre</label>
                     <div class="input-field-group">
                        <div class="input-group"><label for="${id('sys_tee_d_in')}">Ø Ind</label><select id="${id('sys_tee_d_in')}" class="input-field">${roundOptions}</select></div>
                        <div class="input-group"><label for="${id('sys_tee_d_out1')}">Ø Gren 1</label><select id="${id('sys_tee_d_out1')}" class="input-field">${roundOptions}</select></div>
                        <div class="input-group"><label for="${id('sys_tee_d_out2')}">Ø Gren 2</label><select id="${id('sys_tee_d_out2')}" class="input-field">${roundOptions}</select></div>
                    </div>
                </div>
                <div class="sub-group">
                    <label for="${id('sys_orientation')}">Planens Retning (3D)</label>
                    <select id="${id('sys_orientation')}" class="input-field">${orientationOptions}</select>
                </div>`;
            break;
    }

    const btnAction = isEditMode ? `window.handleUpdateComponent('${initialData.id}')` : 'window.handleInlineComponentSubmit(event)';
    const btnText = isEditMode ? 'Opdater Komponent' : 'Tilføj til System';

    if (inputsHtml) {
        inputsHtml += `
        <div style="margin-top:15px; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <strong style="font-size: 0.9rem; color: var(--text-color);">Termodynamik & Isolering</strong>
            <div class="input-field-group" style="margin-top:10px;">
                <div class="input-group"><label for="${id('sys_ambient')}">Rummets Temp.</label><div class="input-unit-wrapper" data-unit="°C"><input type="text" id="${id('sys_ambient')}" class="input-field" placeholder="auto"></div></div>
                <div class="input-group"><label for="${id('sys_isoThick')}">Isoleringstykkelse</label><div class="input-unit-wrapper" data-unit="mm"><input type="text" id="${id('sys_isoThick')}" class="input-field" placeholder="0"></div></div>
                <div class="input-group"><label for="${id('sys_isoLambda')}">Isolering Lambda (λ)</label><input type="text" id="${id('sys_isoLambda')}" class="input-field" placeholder="0.037"></div>
            </div>
        </div>`;
        targetContainer.innerHTML = inputsHtml + `<button type="button" class="button primary" onclick="${btnAction}">${btnText}</button>`;
    }

    // Set Values Helper
    function setVal(elemId, val) {
        const el = document.getElementById(elemId);
        if (el) el.value = val;
    }

    // Garanter DOM er klar før pre-fill
    setTimeout(() => {
        if (initialData && initialData.properties) {
            const p = initialData.properties;
            if (p.d) setVal(id('sys_d'), p.d);
            if (p.angle) setVal(id('sys_angle'), p.angle);
            if (p.angle) setVal(id('sys_angle_dim'), p.angle);
            if (p.angle) setVal(id('sys_angle_r'), p.angle);
            if (p.rd) setVal(id('sys_rd'), p.rd);
            if (p.h) setVal(id('sys_h'), p.h);
            if (p.w) setVal(id('sys_w'), p.w);
            if (p.rh) setVal(id('sys_rh'), p.rh);
            if (p.h1) setVal(id('sys_h1'), p.h1);
            if (p.w1) setVal(id('sys_w1'), p.w1);
            if (p.h2) setVal(id('sys_h2'), p.h2);
            if (p.w2) setVal(id('sys_w2'), p.w2);
            if (p.d1) setVal(id('sys_d1'), p.d1);
            if (p.d2) setVal(id('sys_d2'), p.d2);
            if (p.ambientTemp !== undefined) setVal(id('sys_ambient'), p.ambientTemp);
            if (p.isoThick !== undefined) setVal(id('sys_isoThick'), p.isoThick);
            if (p.isoLambda !== undefined) setVal(id('sys_isoLambda'), p.isoLambda);

            // Tee specifik
            if (p.q_straight) setVal(id('sys_tee_q_straight'), p.q_straight);
            if (p.q_branch) setVal(id('sys_tee_q_branch'), p.q_branch);
            if (p.q_out1) setVal(id('sys_tee_q_out1'), p.q_out1);
            if (p.q_out2) setVal(id('sys_tee_q_out2'), p.q_out2);
            if (p.d_in) setVal(id('sys_tee_d_in'), p.d_in);
            if (p.d_straight) setVal(id('sys_tee_d_straight'), p.d_straight);
            if (p.d_branch) setVal(id('sys_tee_d_branch'), p.d_branch);
            if (p.d_out1) setVal(id('sys_tee_d_out1'), p.d_out1);
            if (p.d_out2) setVal(id('sys_tee_d_out2'), p.d_out2);
            if (p.orientation) setVal(id('sys_orientation'), p.orientation);
            
        } else if (isInlineAdd && window.currentParentDim) {
            // Nedarvning af dimensioner og form fra forælder!
            const dim = window.currentParentDim;
            if (dim.shape === 'round') {
                setVal(id('sys_d'), dim.d);
                setVal(id('sys_d1'), dim.d);
                setVal(id('sys_tee_d_in'), dim.d);
            } else if (dim.shape === 'rect') {
                setVal(id('sys_h'), dim.h);
                setVal(id('sys_w'), dim.w);
                setVal(id('sys_h1'), dim.h);
                setVal(id('sys_w1'), dim.w);
            }

            if (window.currentParentProps) {
                const pp = window.currentParentProps;
                if (pp.ambientTemp !== undefined) setVal(id('sys_ambient'), pp.ambientTemp);
                if (pp.isoThick !== undefined) setVal(id('sys_isoThick'), pp.isoThick);
                if (pp.isoLambda !== undefined) setVal(id('sys_isoLambda'), pp.isoLambda);
            }
        }
    }, 0);
}

export function showEditForm(id) {
    const existingEditRows = document.querySelectorAll('.edit-row');
    existingEditRows.forEach(row => row.remove());

    const component = getSystemComponent(id);
    if (!component) return;

    const rows = document.querySelectorAll('#systemComponentsContainer tr');
    let targetRow = null;
    rows.forEach(row => {
        if (row.innerHTML.includes(`window.handleEditComponent('${id}')`)) {
            targetRow = row;
        }
    });

    if (!targetRow) return;

    const editRow = document.createElement('tr');
    editRow.className = 'edit-row';
    editRow.style.background = '#f9f9f9';
    const editCell = document.createElement('td');
    editCell.colSpan = 7;
    editCell.style.padding = '20px';
    editCell.style.border = '2px solid var(--primary-color)';

    editRow.appendChild(editCell);
    targetRow.after(editRow);

    const suffix = '_edit';
    const containerId = `edit_container_${id}`;
    editCell.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0;">Rediger ${component.name}</h4>
            <button class="button secondary" style="padding:4px 12px; font-size:12px;" onclick="this.closest('tr').remove()">Annuller</button>
        </div>
        <div id="${containerId}"></div>
    `;

    const container = document.getElementById(containerId);
    const pType = component.fittingType || (component.properties && component.properties.type) || component.type || '';

    if (component.type === 'straightDuct') {
        renderSystemDuctInputs(container, component);
    } else if (component.type === 'fitting' || pType.startsWith('bend') || pType.startsWith('tee') || pType.startsWith('expansion') || pType.startsWith('contraction') || pType.startsWith('transition')) {
        renderSystemFittingInputs(container, component);
    } else if (component.type === 'manualLoss') {
        container.innerHTML = `
            <div class="input-group"><label for="manualPressureLoss${suffix}">Tryktab</label><div class="input-unit-wrapper" data-unit="Pa"><input type="text" id="manualPressureLoss${suffix}" class="input-field" value="${component.pressureLoss}" required></div></div>
            <div class="input-group"><label for="manualDescription${suffix}">Beskrivelse</label><input type="text" id="manualDescription${suffix}" class="input-field" value="${component.name}" placeholder="f.eks. Spjæld, Rist, Filter"></div>
            <button type="button" class="button primary" onclick="window.handleUpdateComponent('${component.id}')">Opdater Komponent</button>`;
    } else {
        container.innerHTML = 'Redigering ikke understøttet for denne type endnu.';
    }
}

export function showAddForm(parentId, parentPort) {
    const existingAddRows = document.querySelectorAll('.add-form-row');
    existingAddRows.forEach(row => row.remove());

    const isRoot = !parentId || parentId === 'null';
    let attachTarget = null;

    if (isRoot) {
        attachTarget = document.getElementById('emptyStateTbody');
        // Nulstil globale variabler, da der ikke er nogen forælder
        window.currentParentDim = null;
        window.currentParentProps = null;
    } else {
        const rows = document.querySelectorAll('#systemComponentsContainer tr');
        rows.forEach(row => {
            if (row.innerHTML.includes(`window.showAddForm('${parentId}', '${parentPort}')`)) {
                attachTarget = row;
            }
        });

        // Hent forælderen fra app_state og gem dens dimensioner/isolering til auto-udfyld!
        const parentComp = stateManager.getSystemComponent(parentId);
        if (parentComp && parentComp.state && parentComp.state.outletDimension) {
            let dimToInherit = parentComp.state.outletDimension[parentPort] || parentComp.state.outletDimension['outlet'];
            window.currentParentDim = dimToInherit || null;
            window.currentParentProps = parentComp.properties || null;
        } else {
            window.currentParentDim = null;
            window.currentParentProps = null;
        }
    }

    if (!attachTarget) {
        console.warn('showAddForm could not find attach target for', parentId, parentPort);
        return;
    }

    if (isRoot) {
        const btnContainer = document.getElementById('emptyStateButtonContainer');
        if (btnContainer) btnContainer.style.display = 'none';
    } else {
        attachTarget.style.display = 'none';
    }

    const addRow = document.createElement('tr');
    addRow.className = 'add-form-row';
    addRow.style.background = '#eef7ff';

    const addCell = document.createElement('td');
    addCell.colSpan = 7;
    addCell.style.padding = '20px';
    addCell.style.border = '2px dashed #0084ff';
    addCell.style.borderRadius = '8px';

    addRow.appendChild(addCell);

    if (isRoot) {
        attachTarget.appendChild(addRow);
    } else {
        attachTarget.after(addRow);
    }

    window.setCorrectionTargetId(isRoot ? null : parentId);
    window.currentAddParentId = isRoot ? null : parentId;
    window.currentAddParentPort = isRoot ? null : parentPort;

    const containerId = `add_container_${parentId || 'root'}_${parentPort || 'root'}`;
    addCell.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #ccc; padding-bottom:10px;">
            <h4 style="margin:0; color: #0084ff;">Tilføj Komponent Her</h4>
            <button class="button secondary" style="padding:4px 12px; font-size:12px;" onclick="
                this.closest('tr').remove(); 
                document.querySelectorAll('.add-node-row').forEach(r => r.style.display='');
                const emptyBtn = document.getElementById('emptyStateButtonContainer');
                if (emptyBtn) emptyBtn.style.display='';
                window.currentAddParentId = null;
                window.currentAddParentPort = null;
                window.currentParentDim = null;
                window.currentParentProps = null;
            ">Annuller & Luk</button>
        </div>
        
        <div class="input-group">
            <label for="inlineComponentType">Komponenttype</label>
            <select id="inlineComponentType" class="input-field" onchange="window.handleInlineComponentTypeChange('${containerId}')">
                <option value="">-- Vælg type --</option>
                <option value="straightDuct">Lige Kanal</option>
                <option value="fitting">Formstykke</option>
                <option value="manualLoss">Manuelt Tab</option>
            </select>
        </div>
        <input type="hidden" id="systemComponentType" value="straightDuct">
        <div id="${containerId}"></div>
    `;
}

export function handleInlineComponentTypeChange(containerId) {
    const inlineTypeSelect = document.getElementById('inlineComponentType');
    const container = document.getElementById(containerId);
    const hiddenTypeSelect = document.getElementById('systemComponentType');
    if (!inlineTypeSelect || !container) return;

    const type = inlineTypeSelect.value;
    container.innerHTML = ''; 
    if (hiddenTypeSelect) hiddenTypeSelect.value = type;

    if (type === 'straightDuct') {
        renderSystemDuctInputs(container);
        const btn = container.querySelector('button');
        if (btn) btn.setAttribute('onclick', 'window.handleInlineComponentSubmit(event)');

    } else if (type === 'fitting') {
        // Filtrer menuen automatisk hvis vi kender formen på parent
        const isRect = window.currentParentDim && window.currentParentDim.shape === 'rect';
        
        // Lav dynamiske options baseret på om vi arver en rektangulær eller cirkulær form
        let fittingOptionsHtml = `<option value="">-- Vælg type --</option>`;
        
        if (isRect) {
            fittingOptionsHtml += `
                <optgroup label="Bøjninger">
                    <option value="bend_rect">Bøjning, Rektangulær</option>
                </optgroup>
                <optgroup label="Dimensionsændringer">
                    <option value="expansion_rect">Udvidelse, Rektangulær</option>
                    <option value="contraction_rect">Indsnævring, Rektangulær</option>
                    <option value="transition_rect_round">Overgang, Firkant til Rund</option>
                </optgroup>`;
        } else {
            fittingOptionsHtml += `
                <optgroup label="Bøjninger">
                    <option value="bend_circ">Bøjning, Cirkulær</option>
                </optgroup>
                <optgroup label="Dimensionsændringer">
                    <option value="expansion">Udvidelse, Cirkulær</option>
                    <option value="contraction">Indsnævring, Cirkulær</option>
                    <option value="transition_round_rect">Overgang, Rund til Firkant</option>
                </optgroup>
                <optgroup label="T-stykker (Cirkulær)">
                    <option value="tee_sym">T-stykke, Symmetrisk</option>
                    <option value="tee_asym">T-stykke, Asymmetrisk</option>
                    <option value="tee_bullhead">T-stykke (Dobbelt Afgrening)</option>
                </optgroup>`;
        }
        
        // Tillad altid de modsatte som en "fallback" i bunden, hvis brugeren VIL lave en fejl/auto-overgang
        fittingOptionsHtml += `
            <optgroup label="Andre typer (Genererer automatisk formskift)">
                ${isRect ? '<option value="bend_circ">Bøjning, Cirkulær</option><option value="expansion">Udvidelse, Cirkulær</option><option value="contraction">Indsnævring, Cirkulær</option><option value="tee_sym">T-stykke, Symmetrisk</option>' : ''}
                ${!isRect ? '<option value="bend_rect">Bøjning, Rektangulær</option><option value="expansion_rect">Udvidelse, Rektangulær</option><option value="contraction_rect">Indsnævring, Rektangulær</option>' : ''}
            </optgroup>`;

        container.innerHTML = `
            <div class="input-group"><label for="inlineFittingType">Vælg type formstykke</label>
            <select id="inlineFittingType" class="input-field">
                ${fittingOptionsHtml}
            </select></div>
            <div id="inlineFittingInputsContainer"></div>`;

        document.getElementById('inlineFittingType').addEventListener('change', () => {
            const fitContainer = document.getElementById('inlineFittingInputsContainer');
            const selectedType = document.getElementById('inlineFittingType').value;
            if (selectedType) {
                renderSystemFittingInputs(fitContainer, { type: selectedType });
                setTimeout(() => {
                    const btn = fitContainer.querySelector('button');
                    if (btn) btn.setAttribute('onclick', 'window.handleInlineComponentSubmit(event)');
                }, 50);
            } else {
                fitContainer.innerHTML = '';
            }
        });

    } else if (type === 'manualLoss') {
        container.innerHTML = `
            <div class="input-group"><label for="manualPressureLoss">Tryktab</label><div class="input-unit-wrapper" data-unit="Pa"><input type="text" id="manualPressureLoss" class="input-field" required></div></div>
            <div class="input-group"><label for="manualDescription">Beskrivelse</label><input type="text" id="manualDescription" class="input-field" placeholder="f.eks. Spjæld, Rist, Filter"></div>
        <button type="button" class="button primary" onclick="window.handleInlineComponentSubmit(event)">Tilføj til System</button>`;
    }
}


// Expose handlers globally for inline HTML strings
window.showAddForm = showAddForm;
window.handleInlineComponentTypeChange = handleInlineComponentTypeChange;