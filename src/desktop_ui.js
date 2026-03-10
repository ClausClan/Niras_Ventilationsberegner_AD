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
            // 1. Tjek om brugeren allerede har opdaget Easter Egg'et
            const isDiscovered = localStorage.getItem('niras_easter_egg_discovered');
            
            // 2. Hvis ikke opdaget, tilføj en lille blinke/pulse animation
            if (!isDiscovered) {
                const style = document.createElement('style');
                style.id = 'easter-egg-style';
                style.innerHTML = `
                    @keyframes easterEggPulse {
                        0% { transform: scale(1); text-shadow: 0 0 5px var(--accent-neon-green); color: var(--accent-neon-green); }
                        50% { transform: scale(1.1); text-shadow: 0 0 15px var(--accent-neon-green), 0 0 25px var(--primary-neon-blue); color: #fff; }
                        100% { transform: scale(1); text-shadow: 0 0 5px var(--accent-neon-green); color: var(--accent-neon-green); }
                    }
                    .easter-egg-blink {
                        animation: easterEggPulse 2s infinite ease-in-out;
                        display: inline-block;
                    }
                `;
                document.head.appendChild(style);
                toggleBtn.classList.add('easter-egg-blink');
            }

            toggleBtn.addEventListener('click', () => {
                // 3. Når der klikkes for første gang: Fjern blink og gem i hukommelsen
                if (!localStorage.getItem('niras_easter_egg_discovered')) {
                    localStorage.setItem('niras_easter_egg_discovered', 'true');
                    toggleBtn.classList.remove('easter-egg-blink');
                    const styleEl = document.getElementById('easter-egg-style');
                    if (styleEl) styleEl.remove(); // Ryd op i DOM'en
                }
                
                // Fortsæt med standard logik
                toggleDesktopMode();
            });
        }
    });
}

function toggleDesktopMode() {
    // Sjekk om skjermen er bred nok til at Desktop Mode gir mening
    if (window.innerWidth < 1024) {
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
        
        // Fjern alle highlights (Både 3D og Tabel), så vi efterlader et rent state
        if (window.clearTableHighlights) window.clearTableHighlights();
        if (window.reset3DHighlight) window.reset3DHighlight();
    }
}