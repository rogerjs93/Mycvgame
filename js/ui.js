import * as Constants from './constants.js';

let clueDisplayTimeoutId = null;
let tempMessageTimeoutId = null;

export function showLoading(show) {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) indicator.style.display = show ? 'block' : 'none';
}

export function updateScoreDisplay(universeScore, clueScore) {
    const infoElement = document.getElementById('info');
    if (infoElement) {
        infoElement.textContent = `Universes: ${universeScore} | CV Clues Found: ${clueScore}`;
    }
}

export function showMainHubUI(show) {
    const instructionsPanel = document.getElementById('instructionsPanel');
    const clueReviewPanel = document.getElementById('clueReviewPanel');
    if (instructionsPanel) instructionsPanel.style.display = show ? 'block' : 'none';
    if (clueReviewPanel) clueReviewPanel.style.display = show ? 'block' : 'none';
}

export function updateObjectiveDisplay(objective) {
     const display = document.getElementById('objectiveDisplay');
     if (display) {
         if (objective && objective.type) {
             let text = `Objective: ${objective.text} (${objective.current}/${objective.required})`;
             display.textContent = text;
             display.style.opacity = '1';
         } else {
             display.textContent = ''; // Clear if no objective
             display.style.opacity = '0';
         }
     }
}

export function displayTemporaryMessage(text, duration = Constants.TEMP_MESSAGE_TIMEOUT) {
    const display = document.getElementById('tempMessage');
    if (display) {
        display.textContent = text;
        display.style.opacity = '1';

        if (tempMessageTimeoutId) clearTimeout(tempMessageTimeoutId);

        tempMessageTimeoutId = setTimeout(() => {
            display.style.opacity = '0';
            tempMessageTimeoutId = null;
        }, duration);
    }
}


export function showClueText(text) {
    const display = document.getElementById('clueDisplay');
    if (display) {
        display.textContent = text;
        display.style.display = 'block'; // Use display none/block

        if (clueDisplayTimeoutId) clearTimeout(clueDisplayTimeoutId);

        clueDisplayTimeoutId = setTimeout(hideClueText, Constants.CLUE_DISPLAY_TIMEOUT);
    }
}

export function hideClueText() {
    const display = document.getElementById('clueDisplay');
    if (display) display.style.display = 'none';
    clueDisplayTimeoutId = null;
}

// Update the panel showing collected clue categories
export function updateClueReviewPanel(masterClueList, collectedIndices) {
    const reviewList = document.getElementById('clueReviewList');
    if (!reviewList || !masterClueList) return;

    const categories = {};
    // Group clues by category and count totals/found
    masterClueList.forEach((clue, index) => {
        const category = clue.category || 'Miscellaneous'; // Default category
        if (!categories[category]) {
            categories[category] = { total: 0, found: 0 };
        }
        categories[category].total++;
        if (collectedIndices.includes(index)) {
            categories[category].found++;
        }
    });

    // Generate HTML list items
    let listHTML = '';
    for (const categoryName in categories) {
        const catData = categories[categoryName];
        listHTML += `<li>${categoryName}: <span>${catData.found} / ${catData.total}</span></li>`;
    }

    reviewList.innerHTML = listHTML;
}

// Simple fade overlay control (optional)
export function showFadeOverlay(active) {
     const overlay = document.getElementById('fadeOverlay');
     // Create overlay if it doesn't exist
     if (!overlay) {
         const newOverlay = document.createElement('div');
         newOverlay.id = 'fadeOverlay';
         document.body.appendChild(newOverlay);
     }
     // Need slight delay for CSS transition to work properly on creation
     requestAnimationFrame(() => {
        const currentOverlay = document.getElementById('fadeOverlay');
        if (currentOverlay) currentOverlay.classList.toggle('active', active);
     });
}
