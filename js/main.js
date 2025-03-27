import * as THREE from 'three';
import * as Constants from './constants.js';
import { initScene, resizeRenderer } from './sceneSetup.js';
import { Player } from './player.js';
import { generateUniverse, getCurrentUniverseType, getActivePortals } from './universeManager.js';
import { initClues, getActiveClueMeshes, getMasterClueList, removeActiveClueMesh } from './clue.js';
import { updateAllNPCs, getActiveNPCsData } from './npc.js';
import { updatePortals } from './portal.js';
import * as UI from './ui.js';
import * as Audio from './audio.js';
import { preloadAllAssets } from './assetsLoader.js'; // Import asset loader

// --- Core Variables ---
let scene, camera, renderer;
let player;
let clock;
let keysPressed = {};

// --- Game State ---
export let worldObjects = []; // Shared list for collision detection (cleared/rebuilt by universeManager)
let universeScore = 0;
let clueScore = 0;
let collectedClueIndices = []; // Store indices of collected clues
let currentObjective = null; // Stores the active mini-objective object
let currentSpawnPoint = new THREE.Vector3(); // --- Store current universe spawn point ---

// --- Initialization ---
async function init() {
    clock = new THREE.Clock();

    UI.showLoading(true); // Show loading immediately

    // Basic THREE setup
    const sceneContainer = initScene();
    scene = sceneContainer.scene;
    camera = sceneContainer.camera;
    renderer = sceneContainer.renderer;
    document.body.appendChild(renderer.domElement);

    // Initialize subsystems AFTER scene/camera exist
    Audio.initAudio(camera); // Pass camera for listener
    initClues();

    // Create Player (AFTER camera exists)
    player = new Player(scene, camera);
    // Add player's mesh to world objects if it's used for collision checks BY OTHER entities
    // player.mesh.userData.isPlayerMesh = true; // Add a flag
    // worldObjects.push(player.mesh); // Player collision done internally mostly

    // --- Update Instructions ---
    const instructionsElement = document.getElementById('instructions');
    if (instructionsElement && !instructionsElement.textContent.includes('R: Respawn')) { // Avoid adding multiple times
        instructionsElement.textContent += ', R: Respawn';
    }
    // --- End Update Instructions ---


    // --- Load Assets ---
    await preloadAllAssets(); // Wait for assets

    // --- Initial Universe ---
    UI.showLoading(false); // Hide loading indicator
    switchUniverse('main'); // Generate the first universe AFTER assets are loaded

    // --- Event Listeners ---
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
    document.body.addEventListener('click', () => {
        document.body.requestPointerLock();
        // Resume audio context on first click (required by browsers)
        if (Audio.audioContext && Audio.audioContext.state === 'suspended') {
            Audio.audioContext.resume();
        }
    });
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('pointerlockchange', handlePointerLockChange, false);

    console.log("Game initialization complete. Starting loop.");
    // Start Loop
    animate();
}

// --- World Object Management ---
// worldObjects is cleared and rebuilt by universeManager now.

// --- Universe Switching ---
function switchUniverse(type) {
    console.log(`Switching to universe type: ${type}`);
    // UI.showFadeOverlay(true); // Optional fade

    // Generate returns necessary parameters and modifies worldObjects array directly
    const { safeSpawnPos, physicsParams, shouldRandomizeControls, currentObjective: newObjective } = generateUniverse(scene, worldObjects, type);

    // --- STORE SPAWN POINT ---
    currentSpawnPoint.copy(safeSpawnPos); // Store the safe spawn point for this universe
    console.log("Stored new spawn point:", currentSpawnPoint.toArray().map(n=>n.toFixed(2)));
    // ------------------------

    player.reset(safeSpawnPos); // Reset player to the initial point
    player.setPhysicsParams(physicsParams); // Apply biome physics to player

    if (type === 'main') {
        player.resetControls();
        // Update clue review panel only when returning to main hub
        UI.updateClueReviewPanel(getMasterClueList(), collectedClueIndices);
    } else {
        // Increment score only when entering a *new* random one
        if (type === 'random') {
             universeScore++;
        }
        // Handle control randomization
        if (shouldRandomizeControls) {
            player.randomizeControls();
            UI.displayTemporaryMessage("Controls Shuffled!", Constants.TEMP_MESSAGE_TIMEOUT);
        } else {
            player.resetControls(); // Ensure controls are default if not randomized for this universe
        }
    }

    // Update current objective state
    currentObjective = newObjective;
    UI.updateObjectiveDisplay(currentObjective);


    // Update UI score display
    UI.updateScoreDisplay(universeScore, clueScore);

    // UI.showFadeOverlay(false); // Optional fade
}

// --- Event Handlers ---
function onKeyDown(event) {
    // Don't process keys if pointer isn't locked (or menu is open etc.)
    if (document.pointerLockElement !== document.body && event.code !== 'Escape') return;

    keysPressed[event.code] = true;
    // Don't update player movement keys immediately if respawning
    // player.updateMovementKeys(keysPressed); // Inform player

    // --- MANUAL RESPAWN ---
    if (event.code === 'KeyR') {
        console.log("Manual respawn triggered.");
        Audio.playRespawnSound(); // Play respawn sound (added in audio.js)
        player.reset(currentSpawnPoint); // Reset to stored spawn point
        return; // Stop processing other keys this frame
    }
    // --- END RESPAWN ---

    // Update movement keys only if not respawning
    player.updateMovementKeys(keysPressed);

    // Interaction keys
    if (event.code === 'Enter') handleInteraction(getActivePortals(), Constants.PORTAL_INTERACTION_DISTANCE, handlePortalUse);
    if (event.code === 'KeyE') {
        // Prioritize clues, then NPCs, then objective items
        let interacted = handleInteraction(getActiveClueMeshes(), Constants.CLUE_INTERACTION_DISTANCE, handleClueCollect);
        if (!interacted) interacted = handleInteraction(getActiveNPCsData(), Constants.NPC_HINT_INTERACTION_DISTANCE, handleNPCHint); // Check NPCs
        if (!interacted && currentObjective?.items) interacted = handleInteraction(currentObjective.items, Constants.OBJECTIVE_ITEM_INTERACTION_DISTANCE, handleObjectiveItemInteract); // Check objective items
        // Add other 'E' interactions here (buttons etc.)
    }

    // Player actions
    if (event.code === 'Space') player.jump();
    if (event.code === 'Escape') document.exitPointerLock(); // Allow Esc to exit pointer lock
}

function onKeyUp(event) {
    keysPressed[event.code] = false;
    player.updateMovementKeys(keysPressed);
}

function onWindowResize() {
    resizeRenderer(camera, renderer);
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        player.handleMouseMove(event);
    }
}

function handlePointerLockChange() {
    if (document.pointerLockElement === document.body) {
        console.log('Pointer Lock active.');
        // Hide menu/pause screen if implemented
    } else {
        console.log('Pointer Lock released.');
        // Show menu/pause screen, clear keysPressed
        keysPressed = {};
        player.updateMovementKeys(keysPressed); // Stop movement when unlocked
    }
}


// --- Interaction Logic ---
// Generic interaction handler
function handleInteraction(objects, distance, callback) {
    if (!player || !objects || objects.length === 0) return false;
    const playerPos = player.getPosition();
    if (!playerPos) return false;

    let closestDistSq = distance * distance;
    let targetObject = null;
    let targetIndex = -1;

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const mesh = obj.mesh || obj;
        if (!mesh || !mesh.position || !mesh.parent) continue;

        const distSq = playerPos.distanceToSquared(mesh.position);
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            targetObject = obj;
            targetIndex = i;
        }
    }

    if (targetObject) {
        try {
             callback(targetObject, targetIndex);
             return true;
        } catch (e) {
            console.error("Error during interaction callback:", e, "Object:", targetObject);
            return false;
        }
    }
    return false;
}

// Specific interaction callbacks
function handlePortalUse(portalMesh) {
    if (!portalMesh || !portalMesh.userData) { console.error("Invalid portal mesh data"); return; }
    const portalType = portalMesh.userData.type;
    Audio.playPortalEnterSound(portalType);
    switchUniverse(portalType);
}

function handleClueCollect(clueMesh, index) {
    if (!clueMesh || !clueMesh.userData || clueMesh.userData.originalIndex === undefined) { console.error("Invalid clue mesh data"); return; }
    const clueData = clueMesh.userData;

    if (!collectedClueIndices.includes(clueData.originalIndex)) {
        collectedClueIndices.push(clueData.originalIndex);
        clueScore++;
        UI.updateScoreDisplay(universeScore, clueScore);
        if(getCurrentUniverseType() === 'main') {
             const masterList = getMasterClueList();
             if (masterList) { UI.updateClueReviewPanel(masterList, collectedClueIndices); }
             else { console.error("Master clue list not available for UI update."); }
        }
    }

    UI.showClueText(clueData.text);
    if (clueData.isKeyClue) { Audio.playKeyClueSound(); }
    else { Audio.playClueCollectSound(); }

    if (clueMesh.parent) { scene.remove(clueMesh); }
    worldObjects = worldObjects.filter(obj => obj !== clueMesh);
    removeActiveClueMesh(clueMesh);
}

function handleNPCHint(npcData) {
    if (!npcData || !npcData.behavior || !npcData.state) { console.error("Invalid NPC data"); return false; }
     if (npcData.behavior === 'hint' && npcData.state.hintText) {
         UI.displayTemporaryMessage(`NPC: "${npcData.state.hintText}"`, 4000);
         return true;
     }
     return false;
}

function handleObjectiveItemInteract(itemMesh, index) {
    if (!currentObjective || !itemMesh || !itemMesh.userData || !itemMesh.userData.isObjectiveItem) return false;

    if (itemMesh.userData.objectiveType === currentObjective.type) {
        console.log(`Interacted with objective item: ${currentObjective.type}`);
        currentObjective.current++;
        UI.updateObjectiveDisplay(currentObjective);
        Audio.playSound('collect_clue', 0.6);

        if (itemMesh.parent) { scene.remove(itemMesh); }
        worldObjects = worldObjects.filter(obj => obj !== itemMesh);
        currentObjective.items = currentObjective.items.filter(item => item !== itemMesh);

        if (currentObjective.current >= currentObjective.required) {
            console.log(`Objective complete: ${currentObjective.type}`);
            Audio.playObjectiveCompleteSound();
            UI.displayTemporaryMessage(`Objective Complete: ${currentObjective.text}`, 3000);
            clueScore += 1; // Bonus score point
            UI.updateScoreDisplay(universeScore, clueScore);
            currentObjective = null;
            UI.updateObjectiveDisplay(null);
        }
        return true;
    }
    return false;
}


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    let deltaTime = 0;
    if (clock) { deltaTime = Math.min(clock.getDelta(), 0.05); }
    else { console.error("Clock not initialized!"); return; }

    try {
        if (player) {
            // Pass spawn point to update function
            player.update(deltaTime, worldObjects, currentSpawnPoint);
        }

        const activeNPCsData = getActiveNPCsData();
        if (activeNPCsData && activeNPCsData.length > 0) {
             updateAllNPCs(deltaTime, worldObjects, player ? player.getPosition() : null, getCurrentUniverseType() === 'main' ? Constants.MAIN_UNIVERSE_RADIUS : Constants.UNIVERSE_RADIUS); // Pass radius
        }

        const activeClues = getActiveClueMeshes();
        if (activeClues && activeClues.length > 0) {
            activeClues.forEach(c => {
                if (c && c.rotation) {
                    c.rotation.y += 0.8 * deltaTime;
                }
            });
        }

        const activePortals = getActivePortals();
        if (activePortals && activePortals.length > 0) {
            updatePortals(activePortals, deltaTime);
        }

    } catch (error) { console.error("Error during game update loop:", error); }

    if (renderer && scene && camera) {
        try { renderer.render(scene, camera); }
        catch (renderError) { console.error("Error during rendering:", renderError); }
    } else { console.error("Renderer, Scene, or Camera not initialized for rendering!"); }
}

// --- Start ---
try {
     init().catch(err => {
        console.error("Initialization failed:", err);
        if(UI) UI.showLoading(false);
        const loadingIndicator = document.getElementById('loadingIndicator');
        if(loadingIndicator) {
             loadingIndicator.textContent = "Error during initialization. Check console.";
             loadingIndicator.style.color = 'red';
        }
    });
} catch (error) {
     console.error("Synchronous error during setup:", error);
     if(UI) UI.showLoading(false);
     const loadingIndicator = document.getElementById('loadingIndicator');
     if(loadingIndicator) {
        loadingIndicator.textContent = "Critical error during setup. Check console.";
        loadingIndicator.style.color = 'red';
     }
}
