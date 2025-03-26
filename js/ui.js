let clueDisplayTimeoutId = null;

export function updateScoreDisplay(universeScore, clueScore) {
    const infoElement = document.getElementById('info');
    if (infoElement) {
        infoElement.textContent = `Universes: ${universeScore} | CV Clues Found: ${clueScore}`;
    }
}

export function showInstructionsPanel(show) {
    const panel = document.getElementById('instructionsPanel');
    if (panel) panel.style.display = show ? 'block' : 'none';
}

// Removed updateControlsDisplay - display is hidden outside main universe

export function showClueText(text, timeout) {
    const display = document.getElementById('clueDisplay');
    if (display) {
        display.textContent = text;
        display.style.display = 'block';
        if (clueDisplayTimeoutId) clearTimeout(clueDisplayTimeoutId);
        clueDisplayTimeoutId = setTimeout(hideClueText, timeout);
    }
}

export function hideClueText() {
    const display = document.getElementById('clueDisplay');
    if (display) display.style.display = 'none';
    clueDisplayTimeoutId = null;
}

export function showLoading(show) {
     const indicator = document.getElementById('loadingIndicator');
     if(indicator) indicator.style.display = show ? 'block' : 'none';
}