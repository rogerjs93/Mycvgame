import * as THREE from 'three';
import * as UI from './ui.js';
import * as Audio from './audio.js';
import { createPortalMesh } from './portal.js';
import { spawnClueObjects, getActiveClueMeshes } from './clue.js';
import { spawnNPCs, getActiveNPCsData } from './npc.js';
// Ensure updatePortalBoundingBox is imported correctly from utils.js
import { getRandomColor, placeObjectRandomly, isSpawnAreaClear, findGroundHeight, updatePortalBoundingBox } from './utils.js';
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
             // Check if geometry and parameters exist before accessing radius
             if (mesh.geometry && mesh.geometry.parameters && mesh.geometry.parameters.radius) {
                 mesh.position.y = mesh.geometry.parameters.radius * 0.8; // Sink slightly
             } else {
                 mesh.position.y = 0.5; // Default height if radius unknown
             }
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
        !(obj instanceof THREE.AudioListener) && // Don't remove listener attached to camera
        !(obj.userData.isPlayerMesh) && // Don't remove player mesh if tagged
        !(obj.userData.keepAcrossUniverses) // Add a flag for anything else persistent
     );

     objectsToRemove.forEach(obj => {
         // Check if it's a light before removing, or just remove all meshes/groups etc.
         if (obj.isLight && !obj.isAmbientLight) { // Keep ambient? Or handle adding/removing lights explicitly
              // scene.remove(obj); // Remove non-ambient lights
         } else if (obj.isMesh || obj.isGroup || obj.isPoints || obj.isLine) { // Target scene objects
            // Dispose geometry/material if necessary
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(mat => mat.dispose());
                } else {
                    obj.material.dispose();
                }
            }
            // Recursively dispose children if it's a group
            obj.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                     if (Array.isArray(child.material)) {
                         child.material.forEach(mat => mat.dispose());
                     } else {
                         child.material.dispose();
                     }
                }
            });
            scene.remove(obj);
         }
     });

    // Clear the shared worldObjects list (managed in main.js, passed by reference)
     worldObjectsRef.length = 0; // Clear the array passed by reference

    // Clear internal state
    activePortals = [];

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
        // Use DEFAULT biome as a base and override specific TARDIS properties
        biome = { ...BIOMES['DEFAULT'], texturePaths: {} }; // Start with default, empty texture paths initially
        currentBiomeKey = 'TARDIS'; // Specific key
        UI.showMainHubUI(true); // Show instructions and review panel
        Audio.startAmbientSound('ambient_main');
    } else {
        currentBiomeKey = getRandomBiomeKey();
        biome = BIOMES[currentBiomeKey];
        console.log(`Selected biome: ${biome.name}`);
        UI.showMainHubUI(false);
        // Ensure ambient sound exists before trying to play
        if (biome.ambientSound) {
            Audio.startAmbientSound(biome.ambientSound);
        } else {
             Audio.startAmbientSound('ambient_random_default'); // Fallback ambient
        }
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
    const fogNearMultiplier = type === 'main' ? 0.8 : 0.4;
    const fogFarMultiplier = type === 'main' ? 1.5 : 1.3;
    const fogRadius = type === 'main' ? Constants.MAIN_UNIVERSE_RADIUS : Constants.UNIVERSE_RADIUS;

    if (biome.fogColorFormula) {
        scene.fog = new THREE.Fog(biome.fogColorFormula(bgColor), fogRadius * fogNearMultiplier, fogRadius * fogFarMultiplier);
    } else {
        scene.fog = new THREE.Fog(bgColor, fogRadius * fogNearMultiplier, fogRadius * fogFarMultiplier);
    }


    // --- Lighting ---
    // Remove previous lights first (safer than relying on clearCurrentUniverse filter)
    scene.children.filter(c => c.isLight).forEach(light => scene.remove(light));

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

    // --- LOBBY TEXTURE FIX ---
    let groundTextureName = biome.texturePaths?.ground; // Get biome-specific texture name
    if (type === 'main') {
        groundTextureName = 'tardis_floor'; // Explicitly set the name for main hub
    }
    const groundTexture = groundTextureName ? getTexture(groundTextureName) : null; // Load texture if name is set
    // --- LOBBY TEXTURE FIX END ---

    if (currentUniverseParams.isPlatformBased) {
        // TODO: Implement platform generation logic
        const platformGeo = new THREE.BoxGeometry(5, 1, 5);
        const platformMat = new THREE.MeshStandardMaterial({
             color: groundTexture ? 0xffffff : 0x888888, // White if texture, gray otherwise
             map: groundTexture
         });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.set(0, 0, 0); platform.receiveShadow = true; platform.userData.isGround = true; platform.userData.boundingBox = new THREE.Box3().setFromObject(platform); scene.add(platform); worldObjectsRef.push(platform);
    } else {
        // Create standard cylindrical ground
        const groundGeo = new THREE.CylinderGeometry(universeRadius, universeRadius, 0.2, 32);
        const groundMat = new THREE.MeshStandardMaterial({
            // --- LOBBY TEXTURE COLOR FIX ---
            color: groundTexture ? 0xffffff : (type === 'main' ? new THREE.Color(0x8899AA) : (biome.groundColorRange ? getRandomColor(biome.groundColorRange[0], biome.groundColorRange[1]) : 0x888888)),
            // --- END COLOR FIX ---
            map: groundTexture, // Apply the potentially loaded texture
            metalness: type === 'main' ? 0.8 : Math.random() * 0.4,
            roughness: type === 'main' ? 0.4 : THREE.MathUtils.randFloat(0.5, 0.9)
        });
        // Adjust texture repeat
        if (groundTexture) {
            groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping; // Ensure wrapping
            const repeatVal = type === 'main' ? 4 : Math.max(2, Math.floor(universeRadius / 8)); // Ensure repeat is at least 2
            groundTexture.repeat.set(repeatVal, repeatVal);
            groundTexture.needsUpdate = true; // Flag update
        }

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
             // Ensure userData is set for collision object before adding BBox
             consoleInstance.userData = { isScenery: true };
             const bbox = new THREE.Box3().setFromObject(consoleInstance);
             consoleInstance.userData.boundingBox = bbox;
             worldObjectsRef.push(consoleInstance);
        } else {
            console.warn("Console model not found, using procedural fallback.");
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
                // Use prefab's default Y offset, but ensure it's placed on ground if possible
                let yPos = sceneryMesh.position.y;
                // Place randomly, checking against objects already added (ground, previous scenery)
                const placedOk = placeObjectRandomly(
                    sceneryMesh, yPos, universeRadius * 0.9,
                    worldObjectsRef, // Pass current list for checking
                    Constants.PLACEMENT_CLEARANCE_RADIUS_MULTIPLIER
                );

                // Optional: Raycast down to place on ground after finding X,Z
                 if (placedOk) {
                    const groundY = findGroundHeight(sceneryMesh.position, worldObjectsRef);
                    if (groundY !== null) {
                        // Adjust based on geometry center (simple approximation)
                        const geometry = sceneryMesh.geometry;
                        let heightOffset = 0.5; // Default offset
                        if (geometry) {
                            if (!geometry.boundingBox) geometry.computeBoundingBox();
                            if (geometry.boundingBox) {
                                heightOffset = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2;
                            }
                        }
                        sceneryMesh.position.y = groundY + heightOffset; // Place base near ground
                        sceneryMesh.userData.boundingBox.setFromObject(sceneryMesh); // Update bbox after Y adjust
                    }
                     scene.add(sceneryMesh);
                     worldObjectsRef.push(sceneryMesh);
                 }
            }
        }
    }

    // --- Spawn NPCs ---
    if (type !== 'main' && biome.npcSpawnRules) {
        // Spawn NPCs AFTER scenery is placed
        spawnNPCs(scene, biome.npcSpawnRules, universeRadius, worldObjectsRef);
        // spawnNPCs adds NPCs to worldObjectsRef internally
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
        const portalRnd = createPortalMesh(0x00ff00, 'random'); // Green portal
        console.log("Created main universe portal:", portalRnd.uuid, "Type:", portalRnd.userData.type);

        // --- PORTAL Y DEBUG ---
        const calculatedY = Constants.PORTAL_HEIGHT / 2;
        console.log(`DEBUG: Using PORTAL_HEIGHT=${Constants.PORTAL_HEIGHT}, calculated Y=${calculatedY}`);
        // --- END DEBUG ---

        // Use the calculated Y, ensure it's a valid number or fallback
        const finalY = typeof calculatedY === 'number' && !isNaN(calculatedY) ? calculatedY : 1.5; // Fallback Y
        portalRnd.position.set(0, finalY, -universeRadius + 1.5); // Fixed position

        updatePortalBoundingBox(portalRnd); // Update bbox after moving
        console.log("Positioned main portal at:", portalRnd.position.toArray().map(n=>(typeof n === 'number' ? n.toFixed(2) : 'NaN'))); // Log formatted position
        scene.add(portalRnd);
        console.log("Added main portal to scene."); // Log adding
        activePortals.push(portalRnd);
        worldObjectsRef.push(portalRnd);
    } else {
        // Portal back to main
        const portalMain = createPortalMesh(0xff0000, 'main'); // Red portal
        console.log("Created random universe portal (to main):", portalMain.uuid, "Type:", portalMain.userData.type);
        const mainY = Constants.PORTAL_HEIGHT / 2;
        placeObjectRandomly(portalMain, mainY, universeRadius * 0.9, worldObjectsRef, 2.0); // Wider check for portals
        // Add ground height check:
        const groundHMain = findGroundHeight(portalMain.position, worldObjectsRef);
        // Ensure groundHMain is valid before using it
        if (groundHMain !== null && typeof groundHMain === 'number' && !isNaN(groundHMain)) {
             portalMain.position.y = groundHMain + Constants.PORTAL_HEIGHT / 2;
        } else {
             portalMain.position.y = Constants.PORTAL_HEIGHT / 2; // Fallback Y if ground check fails
        }
        updatePortalBoundingBox(portalMain);
        console.log("Positioned portal (to main) at:", portalMain.position.toArray().map(n=>(typeof n === 'number' ? n.toFixed(2) : 'NaN')));
        scene.add(portalMain);
        console.log("Added portal (to main) to scene.");
        activePortals.push(portalMain);
        worldObjectsRef.push(portalMain);

        // Portal to another random universe
        const portalRnd = createPortalMesh(0x00ff00, 'random'); // Green portal
        console.log("Created random universe portal (to random):", portalRnd.uuid, "Type:", portalRnd.userData.type);
        const rndY = Constants.PORTAL_HEIGHT / 2;
        let placementOk = false;
        let attempts = 0;
        while (!placementOk && attempts < Constants.MAX_PLACEMENT_ATTEMPTS) {
            placeObjectRandomly(portalRnd, rndY, universeRadius * 0.9, worldObjectsRef, 2.0);
             const groundHRnd = findGroundHeight(portalRnd.position, worldObjectsRef);
              // Ensure groundHRnd is valid
             if (groundHRnd !== null && typeof groundHRnd === 'number' && !isNaN(groundHRnd)) {
                 portalRnd.position.y = groundHRnd + Constants.PORTAL_HEIGHT / 2;
             } else {
                 portalRnd.position.y = Constants.PORTAL_HEIGHT / 2; // Fallback Y
             }
             updatePortalBoundingBox(portalRnd); // Update bbox *after* potential y adjustment
            // Check distance from other portal and ensure not inside something major
            if (portalRnd.position.distanceTo(portalMain.position) > Constants.PORTAL_WIDTH * 3 &&
                isSpawnAreaClear(portalRnd.position, Constants.PORTAL_WIDTH, worldObjectsRef, portalRnd)) {
                placementOk = true;
            }
            attempts++;
        }
         if (!placementOk) console.warn("Could not place second portal safely!");
        console.log("Positioned portal (to random) at:", portalRnd.position.toArray().map(n=>(typeof n === 'number' ? n.toFixed(2) : 'NaN')));
        scene.add(portalRnd);
        console.log("Added portal (to random) to scene.");
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
        if(groundY !== null && typeof groundY === 'number' && !isNaN(groundY)) {
             safeSpawnPos.y = groundY + Constants.PLAYER_HEIGHT / 2 + 0.1;
        } else { // If raycast fails (maybe over void), use a fallback height
             safeSpawnPos.y = Constants.PLAYER_HEIGHT * 1.5;
        }
        spawnAttempts++;
    }
    if (spawnAttempts >= Constants.MAX_PLACEMENT_ATTEMPTS) {
         console.warn("Could not guarantee clear player spawn! Placing at last attempt.");
    }


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
    if (!config || !config.possibleTypes || config.possibleTypes.length === 0) return null; // No objective config

    const type = config.possibleTypes[Math.floor(Math.random() * config.possibleTypes.length)];
    let objective = null;

    try { // Add try-catch around objective setup
        switch (type) {
            case 'collect_shards':
                const count = config.shardCount || 3;
                objective = { type: 'collect_shards', text: `Collect ${count} Energy Shards`, required: count, current: 0, items: [] };
                for (let i = 0; i < count; i++) {
                    const shardGeo = new THREE.TetrahedronGeometry(0.3);
                    const shardMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x55ffff, emissiveIntensity: 1.5 });
                    const shardMesh = new THREE.Mesh(shardGeo, shardMat);
                     // Ensure userData exists before adding properties
                    shardMesh.userData = {
                        isObjectiveItem: true,
                        objectiveType: 'collect_shards',
                        boundingBox: new THREE.Box3().setFromObject(shardMesh)
                     };
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
                  // Ensure userData exists before adding properties
                 beaconMesh.userData = {
                     isObjectiveItem: true,
                     objectiveType: 'reach_beacon',
                     boundingBox: new THREE.Box3().setFromObject(beaconMesh)
                 };
                 // Place beacon high up, potentially on scenery if possible
                 placeObjectRandomly(beaconMesh, beaconHeight, universeRadius * 0.7, worldObjectsRef, 1.5);
                 scene.add(beaconMesh);
                 worldObjectsRef.push(beaconMesh);
                 objective.items.push(beaconMesh);
                break;
             // Add 'activate_terminals' etc.
            default:
                console.warn("Unknown objective type in config:", type);
                break;
        }
        if(objective) console.log("Mini-objective created:", objective.type);
    } catch (error) {
        console.error("Error setting up mini objective:", error);
        objective = null; // Ensure objective is null if setup fails
    }
    return objective;
}


// --- Getters for state needed by main loop ---
export function getCurrentUniverseType() { return currentUniverseType; }
export function getActivePortals() { return activePortals; }
// NPCs and Clues fetched via their modules: getActiveNPCsData(), getActiveClueMeshes()
