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
// This function might not be needed if universeManager directly modifies the exported array.
// export function clearWorldObjects() { worldObjects.length = 0; }

// --- Universe Switching ---
function switchUniverse(type) {
    console.log(`Switching to universe type: ${type}`);
    // UI.showFadeOverlay(true); // Optional fade

    // Generate returns necessary parameters and modifies worldObjects array directly
    const { safeSpawnPos, physicsParams, shouldRandomizeControls, currentObjective: newObjective } = generateUniverse(scene, worldObjects, type);

    // Reset player state and position
    player.reset(safeSpawnPos);
    player.setPhysicsParams(physicsParams); // Apply biome physics to player

    if (type === 'main') {
        player.resetControls();
        // Update clue review panel only when returning to main hub
        UI.updateClueReviewPanel(getMasterClueList(), collectedClueIndices);
    } else {
        // Increment score only when entering a *new* random one
        // Check the type argument to decide if it was a switch *to* random
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
    player.updateMovementKeys(keysPressed); // Inform player

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
    // Ensure player and objects are valid before proceeding
    if (!player || !objects || objects.length === 0) return false;

    const playerPos = player.getPosition();
    if (!playerPos) return false; // Player position might not be ready

    let closestDistSq = distance * distance; // Use squared distance for efficiency
    let targetObject = null;
    let targetIndex = -1; // Store index if needed for removal

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        // Handle cases where obj is data wrapper vs direct mesh
        const mesh = obj.mesh || obj;
        if (!mesh || !mesh.position || !mesh.parent) {
            // console.warn("Skipping invalid object in handleInteraction:", obj); // Added warning
            continue; // Skip invalid/removed objects
        }


        const distSq = playerPos.distanceToSquared(mesh.position);
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            targetObject = obj;
            targetIndex = i;
        }
    }

    if (targetObject) {
        try {
             callback(targetObject, targetIndex); // Pass object and index
             return true; // Indicate interaction happened
        } catch (e) {
            console.error("Error during interaction callback:", e, "Object:", targetObject);
            return false;
        }
    }
    return false; // No interaction
}

// Specific interaction callbacks
function handlePortalUse(portalMesh) {
    // Ensure userData exists before accessing type
    if (!portalMesh || !portalMesh.userData) {
        console.error("Invalid portal mesh data in handlePortalUse");
        return;
    }
    const portalType = portalMesh.userData.type;
    Audio.playPortalEnterSound(portalType);
    switchUniverse(portalType);
}

function handleClueCollect(clueMesh, index) {
     // Ensure userData exists
    if (!clueMesh || !clueMesh.userData || clueMesh.userData.originalIndex === undefined) {
        console.error("Invalid clue mesh data in handleClueCollect");
        return;
    }
    const clueData = clueMesh.userData;

    // Add to collected list *if not already collected*
    if (!collectedClueIndices.includes(clueData.originalIndex)) {
        collectedClueIndices.push(clueData.originalIndex);
        clueScore++;
        UI.updateScoreDisplay(universeScore, clueScore);
        // Update review panel if we are in the main hub (or defer update)
        if(getCurrentUniverseType() === 'main') {
             // Ensure list functions are available and valid before calling
             const masterList = getMasterClueList();
             if (masterList) {
                 UI.updateClueReviewPanel(masterList, collectedClueIndices);
             } else {
                 console.error("Master clue list not available for UI update.");
             }
        }
    }

    UI.showClueText(clueData.text);

    if (clueData.isKeyClue) {
         Audio.playKeyClueSound();
         // Add extra visual effect?
    } else {
         Audio.playClueCollectSound();
    }

    // Remove from scene and lists - Safely
    if (clueMesh.parent) { // Check if it's still in the scene
        scene.remove(clueMesh);
    }
    worldObjects = worldObjects.filter(obj => obj !== clueMesh);
    removeActiveClueMesh(clueMesh); // Tell clue module it's gone
}

function handleNPCHint(npcData) {
    // Ensure npcData and expected properties exist
    if (!npcData || !npcData.behavior || !npcData.state) {
        console.error("Invalid NPC data in handleNPCHint");
        return false;
    }
     if (npcData.behavior === 'hint' && npcData.state.hintText) {
         UI.displayTemporaryMessage(`NPC: "${npcData.state.hintText}"`, 4000); // Show hint longer
         // Audio.playSound('npc_talk'); // Optional talk sound
         return true; // Interaction handled
     }
     return false; // Not a hint NPC or no hint text
}

function handleObjectiveItemInteract(itemMesh, index) {
    if (!currentObjective || !itemMesh || !itemMesh.userData || !itemMesh.userData.isObjectiveItem) return false;

    // Check if item matches current objective type
    if (itemMesh.userData.objectiveType === currentObjective.type) {
        console.log(`Interacted with objective item: ${currentObjective.type}`);
        currentObjective.current++;
        UI.updateObjectiveDisplay(currentObjective);
        Audio.playSound('collect_clue', 0.6); // Use clue sound for now

        // Remove item from scene/lists - Safely
        if (itemMesh.parent) {
            scene.remove(itemMesh);
        }
        worldObjects = worldObjects.filter(obj => obj !== itemMesh);
        // Remove from objective's item list if needed
        currentObjective.items = currentObjective.items.filter(item => item !== itemMesh);


        // Check for objective completion
        if (currentObjective.current >= currentObjective.required) {
            console.log(`Objective complete: ${currentObjective.type}`);
            Audio.playObjectiveCompleteSound();
            UI.displayTemporaryMessage(`Objective Complete: ${currentObjective.text}`, 3000);
            // Grant reward?
             // Example: clueScore += 2; player.stabilizeControls();
            clueScore += 1; // Bonus score point
            UI.updateScoreDisplay(universeScore, clueScore);

            currentObjective = null; // Clear completed objective
            UI.updateObjectiveDisplay(null);
        }
        return true; // Interaction handled
    }
    return false;
}


// --- Animation Loop ---
function animate() {
    // Immediately request the next frame
    requestAnimationFrame(animate);

    // Safely get delta time, ensure clock exists
    let deltaTime = 0;
    if (clock) {
        deltaTime = Math.min(clock.getDelta(), 0.05); // Clamp delta time
    } else {
        console.error("Clock not initialized!");
        return; // Stop loop if clock is missing
    }


    // Update game objects only if they exist
    try {
        if (player) {
            player.update(deltaTime, worldObjects);
        }

        const activeNPCsData = getActiveNPCsData(); // Function should handle if list is empty
        if (activeNPCsData && activeNPCsData.length > 0) {
             updateAllNPCs(deltaTime, worldObjects, player ? player.getPosition() : null); // Pass player pos safely
        }

        const activeClues = getActiveClueMeshes(); // Function should handle if list is empty
        if (activeClues && activeClues.length > 0) {
            activeClues.forEach(c => {
                if (c && c.rotation) { // Check clue object is valid
                    c.rotation.y += 0.8 * deltaTime;
                    // Bobbing effect - needs access to clock elapsed time, or manage time differently
                    // c.position.y += Math.sin(clock.elapsedTime * 2.0 + c.id) * 0.005;
                }
            });
        }

        const activePortals = getActivePortals(); // Function should handle if list is empty
        if (activePortals && activePortals.length > 0) {
            updatePortals(activePortals, deltaTime);
        }

    } catch (error) {
        console.error("Error during game update loop:", error);
        // Potentially stop the loop or attempt recovery depending on the error
        // For now, just log it to avoid crashing the browser entirely on minor update errors
        // return; // Uncomment to stop loop on error
    }


    // Render the scene only if renderer and scene exist
    if (renderer && scene && camera) {
        try {
            renderer.render(scene, camera);
        } catch (renderError) {
            console.error("Error during rendering:", renderError);
            // Stop the loop? Disable rendering?
            // return; // Uncomment to stop loop on render error
        }
    } else {
        console.error("Renderer, Scene, or Camera not initialized for rendering!");
        // return; // Stop loop if core components are missing
    }
}

// --- Start ---
// Wrap init in a try/catch for better error reporting
try {
     init().catch(err => {
        console.error("Initialization failed:", err);
        if(UI) UI.showLoading(false); // Ensure loading is hidden on error
        // Display error message to user?
        const loadingIndicator = document.getElementById('loadingIndicator');
        if(loadingIndicator) {
             loadingIndicator.textContent = "Error during initialization. Please check console.";
             loadingIndicator.style.color = 'red';
        }
    });
} catch (error) {
     console.error("Synchronous error during setup:", error);
     if(UI) UI.showLoading(false);
     const loadingIndicator = document.getElementById('loadingIndicator');
     if(loadingIndicator) {
        loadingIndicator.textContent = "Critical error during setup. Please check console.";
        loadingIndicator.style.color = 'red';
     }
}
