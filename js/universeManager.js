```javascript
import * as THREE from 'three';
import * as UI from './ui.js';
import * as Audio from './audio.js';
import { createPortalMesh } from './portal.js';
import { spawnClueObjects, getActiveClueMeshes } from './clue.js';
import { spawnNPCs, getActiveNPCsData } from './npc.js';
import { getRandomColor, placeObjectRandomly, isSpawnAreaClear, findGroundHeight } from './utils.js';
import * as Constants from './constants.js';
import { BIOMES, getRandomBiomeKey } from './biomes.js';
import { getTexture, getModel } from './assetsLoader.js'; // Use asset loader

// State managed by this module
let currentUniverseType = 'main';
let currentBiomeKey = 'DEFAULT'; // Or specific key for 'main' if needed
let currentUniverseParams = {}; // Holds physics, control chance etc.
let activePortals = [];
// Active NPCs and Clues are managed by their respective modules mostly

// --- Scenery Prefab Creation (Example) ---
function createSceneryObject(prefabName) {
    let mesh;
    const userData = { isScenery: true, boundingBox: new THREE.Box3() };

    switch (prefabName) {
        case 'crystal_large':
            const h = THREE.MathUtils.randFloat(2, 5);
            const r = THREE.MathUtils.randFloat(0.5, 1.5);
            mesh = new THREE.Mesh(
                new THREE.ConeGeometry(r, h, THREE.MathUtils.randInt(5, 8)),
                new THREE.MeshStandardMaterial({ color: getRandomColor(0.6, 1.0), emissive: getRandomColor(0.1, 0.4), roughness: 0.3 })
            );
            mesh.position.y = h / 2;
            mesh.castShadow = true;
            break;
        case 'rock_medium':
             mesh = new THREE.Mesh(
                new THREE.IcosahedronGeometry(THREE.MathUtils.randFloat(0.8, 1.8), 1),
                new THREE.MeshStandardMaterial({ color: getRandomColor(0.2, 0.5), roughness: 0.8, flatShading: true })
            );
            mesh.position.y = mesh.geometry.parameters.radius * 0.8; // Sink slightly
            mesh.castShadow = true;
            break;
        case 'lava_pool_hazard':
             mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(THREE.MathUtils.randFloat(1.5, 3), THREE.MathUtils.randFloat(1.5, 3), 0.1, 16),
                new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xdd2200, emissiveIntensity: 1.5, roughness: 0.6 })
            );
            mesh.position.y = 0.05; // Slightly above ground
            mesh.castShadow = false;
            userData.isHazard = true; // Tag as hazard for collision effects
            userData.hazardType = 'lava';
            break;
        case 'data_column':
             const colH = THREE.MathUtils.randFloat(3, 7);
             mesh = new THREE.Mesh(
                 new THREE.BoxGeometry(0.5, colH, 0.5),
                 new THREE.MeshStandardMaterial({ color: 0x334455, emissive: 0x00ffff, emissiveIntensity: 0.2, metalness: 0.6, roughness: 0.4 })
             );
             mesh.position.y = colH / 2;
             mesh.castShadow = true;
            break;
        // Add more prefabs...
        default:
            console.warn("Unknown scenery prefab:", prefabName);
            // Create a placeholder box?
             mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
             mesh.position.y = 0.5;
             mesh.castShadow = true;
            break;
    }

    if (mesh) {
        mesh.userData = userData;
        mesh.userData.boundingBox.setFromObject(mesh); // Calculate bbox after potential positioning
    }
    return mesh;
}

// Function to clear scene elements (called by generateUniverse)
function clearCurrentUniverse(scene, worldObjectsRef) {
    // Remove all objects EXCEPT camera and player mesh (if player is managed externally)
     const objectsToRemove = scene.children.filter(obj =>
        !(obj instanceof THREE.Camera) &&
        !(obj instanceof THREE.AmbientLight) && // Keep ambient? Or remove all lights? Let's remove all non-ambient
        !(obj instanceof THREE.DirectionalLight) &&
        !(obj instanceof THREE.PointLight) &&
        !(obj.userData.isPlayerMesh) // Add flag to player mesh if managed externally
     );

     objectsToRemove.forEach(obj => {
         // Dispose geometry/material if necessary (important for performance)
         if (obj.geometry) obj.geometry.dispose();
         if (obj.material) {
             // Handle arrays of materials
             if (Array.isArray(obj.material)) {
                 obj.material.forEach(mat => mat.dispose());
             } else {
                 obj.material.dispose();
             }
         }
         scene.remove(obj);
     });

    // Clear the shared worldObjects list (managed in main.js, passed by reference or via getter/setter)
     worldObjectsRef.length = 0; // Clear the array passed by reference

    // Clear internal state
    activePortals = [];
    // Active NPCs/Clues cleared by their respective spawn functions

    UI.hideClueText();
    UI.updateObjectiveDisplay(null); // Clear objective display
    console.log("Universe cleared.");
}

// Main function to generate/switch universe
export function generateUniverse(scene, worldObjectsRef, type) {
    console.log(`Generating universe type: ${type}`);
    clearCurrentUniverse(scene, worldObjectsRef); // Pass reference to clear it
    currentUniverseType = type;

    let biome;
    if (type === 'main') {
        biome = BIOMES['DEFAULT']; // Use defaults or create a specific 'TARDIS' biome? Let's use defaults and override.
        currentBiomeKey = 'TARDIS'; // Specific key
        UI.showMainHubUI(true); // Show instructions and review panel
        Audio.startAmbientSound('ambient_main');
    } else {
        currentBiomeKey = getRandomBiomeKey();
        biome = BIOMES[currentBiomeKey];
        console.log(`Selected biome: ${biome.name}`);
        UI.showMainHubUI(false);
        Audio.startAmbientSound(biome.ambientSound); // Play biome-specific sound
    }

    // --- Universe Parameters ---
    currentUniverseParams = {
        ...biome.physics, // Copy physics params
        controlRandomChance: biome.controlRandomChance !== undefined ? biome.controlRandomChance : Constants.CONTROL_RANDOM_CHANCE,
        isPlatformBased: biome.isPlatformBased || false, // Check for platform levels
    };

    // --- Scene Setup ---
    const bgColor = biome.bgColorRange ? getRandomColor(biome.bgColorRange[0], biome.bgColorRange[1]) : new THREE.Color(0x111111);
    scene.background = bgColor;
    if (biome.fogColorFormula) {
        scene.fog = new THREE.Fog(biome.fogColorFormula(bgColor), Constants.UNIVERSE_RADIUS * 0.4, Constants.UNIVERSE_RADIUS * 1.3);
    } else {
        scene.fog = new THREE.Fog(bgColor, Constants.UNIVERSE_RADIUS * 0.5, Constants.UNIVERSE_RADIUS * 1.2);
    }


    // --- Lighting ---
    // Ambient light is always present
    const ambientLight = new THREE.AmbientLight(0xffffff, type === 'main' ? 0.6 : THREE.MathUtils.randFloat(0.3, 0.7));
    scene.add(ambientLight);

    if (type === 'main') {
        const pointLight = new THREE.PointLight(0x00ffff, 1.0, Constants.MAIN_UNIVERSE_RADIUS * 2.5, 1.5);
        pointLight.position.set(0, 3.0, 0);
        pointLight.castShadow = true; scene.add(pointLight);
    } else {
        const directionalLight = new THREE.DirectionalLight(getRandomColor(0.7, 1.0), THREE.MathUtils.randFloat(0.6, 1.1));
        directionalLight.position.set(THREE.MathUtils.randFloatSpread(25), THREE.MathUtils.randFloat(20, 40), THREE.MathUtils.randFloatSpread(25));
        directionalLight.castShadow = true;
        // Configure shadow map
        directionalLight.shadow.mapSize.width = 1024; directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.camera.near = 1; directionalLight.shadow.camera.far = 100;
        const shadowCamSize = Constants.UNIVERSE_RADIUS * 1.2;
        directionalLight.shadow.camera.left = -shadowCamSize; directionalLight.shadow.camera.right = shadowCamSize;
        directionalLight.shadow.camera.top = shadowCamSize; directionalLight.shadow.camera.bottom = -shadowCamSize;
        scene.add(directionalLight);
    }

    // --- Ground / Platforms ---
    const universeRadius = type === 'main' ? Constants.MAIN_UNIVERSE_RADIUS : Constants.UNIVERSE_RADIUS;
    const groundTexture = getTexture(biome.texturePaths?.ground) || null; // Load texture if specified
    if (currentUniverseParams.isPlatformBased) {
        // TODO: Implement platform generation logic
        // Create several Mesh objects (boxes, cylinders) at varying heights/positions
        // Ensure connectivity or add jump challenges. Add all platforms to worldObjectsRef.
        // Example placeholder:
        const platformGeo = new THREE.BoxGeometry(5, 1, 5);
        const platformMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.set(0, 0, 0); platform.receiveShadow = true; platform.userData.isGround = true; platform.userData.boundingBox = new THREE.Box3().setFromObject(platform); scene.add(platform); worldObjectsRef.push(platform);
        // Add more platforms...
    } else {
        // Create standard cylindrical ground
        const groundGeo = new THREE.CylinderGeometry(universeRadius, universeRadius, 0.2, 32);
        const groundMat = new THREE.MeshStandardMaterial({
            color: biome.groundColorRange ? getRandomColor(biome.groundColorRange[0], biome.groundColorRange[1]) : 0x888888,
            map: groundTexture,
            metalness: type === 'main' ? 0.8 : Math.random() * 0.4,
            roughness: type === 'main' ? 0.4 : THREE.MathUtils.randFloat(0.5, 0.9)
        });
        if (groundTexture) groundMat.map.repeat.set(universeRadius / 8, universeRadius / 8); // Adjust texture repeat

        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.1; ground.receiveShadow = true; ground.userData.isGround = true;
        ground.userData.boundingBox = new THREE.Box3().setFromObject(ground);
        scene.add(ground);
        worldObjectsRef.push(ground); // Add ground first
    }


    // --- Scenery & Main Hub Console ---
    if (type === 'main') {
        // Create console (using geometry or loaded model)
        const consoleModel = getModel('console'); // Attempt to get preloaded model
        if (consoleModel) {
             const consoleInstance = consoleModel.scene.clone(); // Clone scene from GLTF result
             consoleInstance.position.y = 0; // Adjust position
             consoleInstance.traverse(node => { if(node.isMesh) node.castShadow = true; });
             scene.add(consoleInstance);
             const bbox = new THREE.Box3().setFromObject(consoleInstance);
             consoleInstance.userData.boundingBox = bbox; // Must have userData for collision object
             consoleInstance.userData.isScenery = true;
             worldObjectsRef.push(consoleInstance);
        } else {
            // Fallback to procedural geometry if model failed/not loaded
            const consoleBaseGeo = new THREE.CylinderGeometry(1.5, 1.8, 1.0, 6); const consoleBaseMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 }); const consoleBase = new THREE.Mesh(consoleBaseGeo, consoleBaseMat); consoleBase.position.y = 0.5; consoleBase.castShadow = true; consoleBase.userData = {isScenery: true, boundingBox: new THREE.Box3().setFromObject(consoleBase)}; scene.add(consoleBase); worldObjectsRef.push(consoleBase);
            const consoleTopGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.5, 6); const consoleTopMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaaa, emissiveIntensity: 0.8 }); const consoleTop = new THREE.Mesh(consoleTopGeo, consoleTopMat); consoleTop.position.y = 1.25; consoleTop.userData = {isScenery: true, boundingBox: new THREE.Box3().setFromObject(consoleTop)}; scene.add(consoleTop); worldObjectsRef.push(consoleTop);
        }
    } else {
        // Create Random Scenery based on biome
        const numScenery = THREE.MathUtils.randInt(5, 15);
        for (let i = 0; i < numScenery; i++) {
            if (!biome.sceneryPrefabs || biome.sceneryPrefabs.length === 0) break;
            const prefabName = biome.sceneryPrefabs[Math.floor(Math.random() * biome.sceneryPrefabs.length)];
            const sceneryMesh = createSceneryObject(prefabName);
            if (sceneryMesh) {
                const yPos = sceneryMesh.position.y; // Use prefab's default Y offset
                 // Place randomly, checking against objects already added (ground, previous scenery)
                placeObjectRandomly(
                    sceneryMesh, yPos, universeRadius * 0.9,
                    worldObjectsRef, // Pass current list for checking
                    Constants.PLACEMENT_CLEARANCE_RADIUS_MULTIPLIER
                );
                scene.add(sceneryMesh);
                worldObjectsRef.push(sceneryMesh);
            }
        }
    }

    // --- Spawn NPCs ---
    if (type !== 'main' && biome.npcSpawnRules) {
        // Spawn NPCs AFTER scenery is placed
        const npcObjects = spawnNPCs(scene, biome.npcSpawnRules, universeRadius, worldObjectsRef);
        // Note: spawnNPCs already adds NPCs to worldObjectsRef internally in this design
    }

    // --- Spawn Clues ---
    if (type !== 'main') {
        // Spawn Clues AFTER scenery and NPCs are placed
        const clueMeshes = spawnClueObjects(scene, THREE.MathUtils.randInt(1, 3), universeRadius, worldObjectsRef);
        clueMeshes.forEach(mesh => worldObjectsRef.push(mesh)); // Add spawned clues to world list
    }

    // --- Spawn Portals ---
    activePortals = []; // Clear previous portals for this module's state
    if (type === 'main') {
        const portalRnd = createPortalMesh(0x00ff00, 'random');
        portalRnd.position.set(0, Constants.PORTAL_HEIGHT / 2, -universeRadius + 1.5); // Fixed position
        updatePortalBoundingBox(portalRnd); // Update bbox after moving
        scene.add(portalRnd);
        activePortals.push(portalRnd);
        worldObjectsRef.push(portalRnd);
    } else {
        // Portal back to main
        const portalMain = createPortalMesh(0xff0000, 'main');
        const mainY = Constants.PORTAL_HEIGHT / 2;
        placeObjectRandomly(portalMain, mainY, universeRadius * 0.9, worldObjectsRef, 2.0); // Wider check for portals
        // Add ground height check:
        const groundHMain = findGroundHeight(portalMain.position, worldObjectsRef);
        if (groundHMain !== null) portalMain.position.y = groundHMain + Constants.PORTAL_HEIGHT / 2;
        updatePortalBoundingBox(portalMain);
        scene.add(portalMain);
        activePortals.push(portalMain);
        worldObjectsRef.push(portalMain);

        // Portal to another random universe
        const portalRnd = createPortalMesh(0x00ff00, 'random');
        const rndY = Constants.PORTAL_HEIGHT / 2;
        let placementOk = false;
        let attempts = 0;
        while (!placementOk && attempts < Constants.MAX_PLACEMENT_ATTEMPTS) {
            placeObjectRandomly(portalRnd, rndY, universeRadius * 0.9, worldObjectsRef, 2.0);
             const groundHRnd = findGroundHeight(portalRnd.position, worldObjectsRef);
             if (groundHRnd !== null) portalRnd.position.y = groundHRnd + Constants.PORTAL_HEIGHT / 2;
             updatePortalBoundingBox(portalRnd);
            // Check distance from other portal and ensure not inside something major
            if (portalRnd.position.distanceTo(portalMain.position) > Constants.PORTAL_WIDTH * 3 &&
                isSpawnAreaClear(portalRnd.position, Constants.PORTAL_WIDTH, worldObjectsRef, portalRnd)) {
                placementOk = true;
            }
            attempts++;
        }
         if (!placementOk) console.warn("Could not place second portal safely!");
        scene.add(portalRnd);
        activePortals.push(portalRnd);
        worldObjectsRef.push(portalRnd);
    }

     // --- Mini Objective ---
     let currentObjective = null;
     if (type !== 'main' && Math.random() < Constants.MINI_OBJECTIVE_CHANCE && biome.miniObjectiveConfig) {
         currentObjective = setupMiniObjective(scene, worldObjectsRef, biome.miniObjectiveConfig, universeRadius);
     }
     UI.updateObjectiveDisplay(currentObjective); // Update UI


    // --- Player Spawn Position ---
    let spawnPos = new THREE.Vector3(0, Constants.PLAYER_HEIGHT * 1.5, 0); // Default slightly higher
    if (type === 'main') {
        spawnPos.set(0, Constants.PLAYER_HEIGHT / 2 + 0.1, universeRadius / 2);
    }
    // Ensure spawn is clear
    let safeSpawnPos = spawnPos.clone();
    let spawnAttempts = 0;
    while (!isSpawnAreaClear(safeSpawnPos, Constants.PLAYER_SPAWN_CLEARANCE_RADIUS, worldObjectsRef) && spawnAttempts < Constants.MAX_PLACEMENT_ATTEMPTS) {
        safeSpawnPos.x += (Math.random() - 0.5) * 1.0; // Nudge
        safeSpawnPos.z += (Math.random() - 0.5) * 1.0;
        // Optional: Raycast down from nudged pos to find ground and place slightly above
        const groundY = findGroundHeight(safeSpawnPos, worldObjectsRef);
        if(groundY !== null) safeSpawnPos.y = groundY + Constants.PLAYER_HEIGHT / 2 + 0.1;
        else safeSpawnPos.y = Constants.PLAYER_HEIGHT * 1.5; // Fallback height if no ground found below nudge

        spawnAttempts++;
    }
    if (spawnAttempts >= Constants.MAX_PLACEMENT_ATTEMPTS) console.warn("Could not guarantee clear player spawn!");


    console.log("Universe generation complete.");
    // Return parameters needed by the player and main loop
    return {
        safeSpawnPos: safeSpawnPos,
        physicsParams: currentUniverseParams, // Contains gravity, friction, speed multipliers
        shouldRandomizeControls: type !== 'main' && Math.random() < currentUniverseParams.controlRandomChance,
        currentObjective: currentObjective
    };
}


function setupMiniObjective(scene, worldObjectsRef, config, universeRadius) {
    const type = config.possibleTypes[Math.floor(Math.random() * config.possibleTypes.length)];
    let objective = null;

    switch (type) {
        case 'collect_shards':
            const count = config.shardCount || 3;
            objective = { type: 'collect_shards', text: `Collect ${count} Energy Shards`, required: count, current: 0, items: [] };
            for (let i = 0; i < count; i++) {
                const shardGeo = new THREE.TetrahedronGeometry(0.3);
                const shardMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x55ffff, emissiveIntensity: 1.5 });
                const shardMesh = new THREE.Mesh(shardGeo, shardMat);
                shardMesh.userData = { isObjectiveItem: true, objectiveType: 'collect_shards', boundingBox: new THREE.Box3().setFromObject(shardMesh) };
                const yPos = THREE.MathUtils.randFloat(0.8, 2.5);
                placeObjectRandomly(shardMesh, yPos, universeRadius * 0.9, worldObjectsRef, 1.0);
                scene.add(shardMesh);
                worldObjectsRef.push(shardMesh);
                objective.items.push(shardMesh); // Keep track of item meshes if needed
            }
            break;
        case 'reach_beacon':
             const beaconHeight = config.beaconHeight || 10;
             objective = { type: 'reach_beacon', text: `Reach the High Beacon`, required: 1, current: 0, items: [] };
             const beaconGeo = new THREE.ConeGeometry(0.5, 2.0, 8);
             const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff55, emissiveIntensity: 2.0 });
             const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
             beaconMesh.userData = { isObjectiveItem: true, objectiveType: 'reach_beacon', boundingBox: new THREE.Box3().setFromObject(beaconMesh) };
             // Place beacon high up, potentially on scenery if possible
             placeObjectRandomly(beaconMesh, beaconHeight, universeRadius * 0.7, worldObjectsRef, 1.5);
             scene.add(beaconMesh);
             worldObjectsRef.push(beaconMesh);
             objective.items.push(beaconMesh);
            break;
         // Add 'activate_terminals' etc.
        default:
            console.warn("Unknown objective type:", type);
            break;
    }
    console.log("Mini-objective created:", objective?.type);
    return objective;
}


// --- Getters for state needed by main loop ---
export function getCurrentUniverseType() { return currentUniverseType; }
export function getActivePortals() { return activePortals; }
// NPCs and Clues fetched via their modules: getActiveNPCsData(), getActiveClueMeshes()
```

---

**15. `js/main.js`**

```javascript
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
        if (getCurrentUniverseType() === 'random') { // Check type *before* it's updated by generateUniverse? No, check the argument 'type'.
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
    const playerPos = player.getPosition();
    let closestDistSq = distance * distance; // Use squared distance for efficiency
    let targetObject = null;
    let targetIndex = -1; // Store index if needed for removal

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        // Handle cases where obj is data wrapper vs direct mesh
        const mesh = obj.mesh || obj;
        if (!mesh || !mesh.position) continue; // Skip invalid objects

        const distSq = playerPos.distanceToSquared(mesh.position);
        if (distSq < closestDistSq) {
            closestDistSq = distSq;
            targetObject = obj;
            targetIndex = i;
        }
    }

    if (targetObject) {
        callback(targetObject, targetIndex); // Pass object and index
        return true; // Indicate interaction happened
    }
    return false; // No interaction
}

// Specific interaction callbacks
function handlePortalUse(portalMesh) {
    const portalType = portalMesh.userData.type;
    Audio.playPortalEnterSound(portalType);
    switchUniverse(portalType);
}

function handleClueCollect(clueMesh, index) {
    const clueData = clueMesh.userData;

    // Add to collected list *if not already collected*
    if (!collectedClueIndices.includes(clueData.originalIndex)) {
        collectedClueIndices.push(clueData.originalIndex);
        clueScore++;
        UI.updateScoreDisplay(universeScore, clueScore);
        // Update review panel if we are in the main hub (or defer update)
        if(getCurrentUniverseType() === 'main') {
             UI.updateClueReviewPanel(getMasterClueList(), collectedClueIndices);
        }
    }

    UI.showClueText(clueData.text);

    if (clueData.isKeyClue) {
         Audio.playKeyClueSound();
         // Add extra visual effect?
    } else {
         Audio.playClueCollectSound();
    }

    // Remove from scene and lists
    scene.remove(clueMesh);
    worldObjects = worldObjects.filter(obj => obj !== clueMesh);
    removeActiveClueMesh(clueMesh); // Tell clue module it's gone
}

function handleNPCHint(npcData) {
     if (npcData.behavior === 'hint' && npcData.state.hintText) {
         UI.displayTemporaryMessage(`NPC: "${npcData.state.hintText}"`, 4000); // Show hint longer
         // Audio.playSound('npc_talk'); // Optional talk sound
         return true; // Interaction handled
     }
     return false; // Not a hint NPC or no hint text
}

function handleObjectiveItemInteract(itemMesh, index) {
    if (!currentObjective || !itemMesh.userData.isObjectiveItem) return false;

    // Check if item matches current objective type
    if (itemMesh.userData.objectiveType === currentObjective.type) {
        console.log(`Interacted with objective item: ${currentObjective.type}`);
        currentObjective.current++;
        UI.updateObjectiveDisplay(currentObjective);
        Audio.playSound('collect_clue', 0.6); // Use clue sound for now

        // Remove item from scene/lists
        scene.remove(itemMesh);
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
    requestAnimationFrame(animate);
    const deltaTime = Math.min(clock.getDelta(), 0.05); // Clamp delta time

    // Update game objects
    player.update(deltaTime, worldObjects); // Player update needs delta and collidable objects

    const activeNPCsData = getActiveNPCsData();
    if (activeNPCsData.length > 0) {
        updateAllNPCs(deltaTime, worldObjects, player.getPosition()); // Update NPCs
    }

    const activeClues = getActiveClueMeshes();
    if (activeClues.length > 0) {
        // Animate clues
         activeClues.forEach(c => {
             c.rotation.y += 0.8 * deltaTime;
             // Bobbing effect - ensure clock is available or pass elapsed time
             // c.position.y += Math.sin(clock.elapsedTime * 2.0 + c.id) * 0.005;
         });
    }

    const activePortals = getActivePortals();
    if (activePortals.length > 0) {
        updatePortals(activePortals, deltaTime); // Animate portals
    }

    // Render the scene
    renderer.render(scene, camera);
}

// --- Start ---
// Wrap init in a try/catch for better error reporting
try {
     init().catch(err => {
        console.error("Initialization failed:", err);
        UI.showLoading(false);
        // Display error message to user?
        document.getElementById('loadingIndicator').textContent = "Error during initialization. Please check console.";
        document.getElementById('loadingIndicator').style.color = 'red';
    });
} catch (error) {
     console.error("Synchronous error during setup:", error);
     UI.showLoading(false);
     document.getElementById('loadingIndicator').textContent = "Critical error during setup. Please check console.";
     document.getElementById('loadingIndicator').style.color = 'red';
}
```
