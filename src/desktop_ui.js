/**
 * Desktop Mode Manager (Easter Egg Beta)
 * Håndterer logikk og layout-skift til split-screen.
 * (Selve CSS-styling ligger nå i style.css for bedre vedlikehold)
 */

export function initDesktopMode() {
    // Sørger for at Event Listener kobles til ADV-teksten når DOM er klar
    window.addEventListener('DOMContentLoaded', () => {
        const toggleBtn = document.getElementById('desktopModeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleDesktopMode);
        }
    });
}

function toggleDesktopMode() {
    // Sjekk om skjermen er bred nok til at Desktop Mode gir mening
    if (window.innerWidth < 700) {
        alert("Skjermen er for smal til Desktop Mode. Krever minst 1024px bredde.");
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
        // --- GÅR INN I DESKTOP MODE ---
        // Sørg for å fjerne inline 'display: none' hvis brukeren hadde diagrammet åpent på mobilen
        if (tableContainer) tableContainer.style.display = '';
        if (dropContainer) dropContainer.style.display = '';
        
        // Tving 3D vinduet synlig
        if (diagContainer) {
            diagContainer.style.display = 'block';
            diagContainer.classList.add('active'); // Synkroniserer med diagram.js state
        }
        
        setTimeout(() => {
            if (window.renderDiagram) window.renderDiagram(true); // true = behold kameravinkel
            window.dispatchEvent(new Event('resize')); // Oppdater Three.js canvas slik at det passer til den nye plassen
        }, 50);

    } else {
        // --- GÅR UT AV DESKTOP MODE ---
        // Skjul diagrammet igjen og returner til standard tabell-visning
        if (diagContainer) {
            diagContainer.style.display = 'none';
            diagContainer.classList.remove('active');
        }
        if (tableContainer) tableContainer.style.display = '';
        if (dropContainer) dropContainer.style.display = '';
        
        // Nullstill teksten på knappen
        if (toggleBtn) toggleBtn.innerHTML = 'Vis diagram';
    }
}