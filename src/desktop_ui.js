/**
 * Desktop Mode Manager (Easter Egg Beta)
 * Håndterer injektion af CSS og layout-skift til split-screen.
 */

export function initDesktopMode() {
    // 1. Injicer Desktop Mode CSS dynamisk (Kun Glow-effekten, resten er i style.css)
    const style = document.createElement('style');
    style.innerHTML = `
        /* Easter Egg Glow Effect */
        .adv-easter-egg {
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-block;
        }
        .adv-easter-egg.active-glow {
            color: #00ff88;
            text-shadow: 0 0 10px #00ff88, 0 0 20px #00ff88;
            transform: scale(1.05);
        }
    `;
    document.head.appendChild(style);

    // 2. Sæt Event Listener på ADV-teksten (venter på DOM)
    window.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('desktopModeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleDesktopMode);
        }
    });
}

function toggleDesktopMode() {
    // Tjek om skærmen er bred nok
    if (window.innerWidth < 1024) {
        alert("Skærmen er for smal til Desktop Mode. Kræver mindst 1024px bredde.");
        return;
    }

    const btn = document.getElementById('desktopModeToggle');
    const isDesktop = document.body.classList.toggle('desktop-mode');
    
    if (btn) {
        btn.classList.toggle('active-glow', isDesktop);
    }

    // UI Elementer
    const diagContainer = document.getElementById('systemDiagramContainer');
    const tableContainer = document.getElementById('systemComponentsContainer');
    const dropContainer = document.getElementById('totalPressureDropContainer');
    const toggleBtn = document.getElementById('toggleViewBtn');

    if (isDesktop) {
        // --- GÅR IND I DESKTOP MODE ---
        // Sørg for at fjerne inline 'display: none', hvis brugeren havde diagrammet åbent på mobilen
        if (tableContainer) tableContainer.style.display = '';
        if (dropContainer) dropContainer.style.display = '';
        
        // Tving 3D vinduet synligt
        if (diagContainer) {
            diagContainer.style.display = 'block';
            diagContainer.classList.add('active'); // Synkroniser med diagram.js state
        }
        
        setTimeout(() => {
            if (window.renderDiagram) window.renderDiagram(true); // true = behold kameravinkel
            window.dispatchEvent(new Event('resize')); // Opdater Three.js canvas
        }, 50);

    } else {
        // --- GÅR UD AF DESKTOP MODE ---
        // Skjul diagrammet igen og returner til standard tabel-visning
        if (diagContainer) {
            diagContainer.style.display = 'none';
            diagContainer.classList.remove('active');
        }
        if (tableContainer) tableContainer.style.display = '';
        if (dropContainer) dropContainer.style.display = '';
        
        // Nulstil knappen
        if (toggleBtn) toggleBtn.innerHTML = 'Vis diagram';
    }
}