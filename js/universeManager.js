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
             if (mesh.geometry?.parameters?.radius) {
                 mesh.position.y = mesh.geometry.parameters.radius * 0.8;
             } else { mesh.position.y = 0.5; }
            mesh.castShadow = true;
            break;
        case 'lava_pool_hazard':
             mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(THREE.MathUtils.randFloat(1.5, 3), THREE.MathUtils.randFloat(1.5, 3), 0.1, 16),
                new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xdd2200, emissiveIntensity: 1.5, roughness: 0.6 })
            );
            mesh.position.y = 0.05;
            mesh.castShadow = false;
            userData.isHazard = true;
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

        // --- ADDED PLACEHOLDERS ---
        case 'floating_rock': // Placeholder
            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(THREE.MathUtils.randFloat(1.5, 4), 5, 4), // Low poly sphere
                new THREE.MeshStandardMaterial({ color: getRandomColor(0.4, 0.7), roughness: 0.9 })
            );
            mesh.position.y = 0; // Position will be set randomly later (potentially high up)
            mesh.castShadow = true;
            break;
        case 'ancient_pillar': // Placeholder
            const pilH = THREE.MathUtils.randFloat(4, 8);
            mesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.4, 0.5, pilH, 6), // Hexagonal pillar
                new THREE.MeshStandardMaterial({ color: getRandomColor(0.3, 0.5), roughness: 0.7 })
            );
            mesh.position.y = pilH / 2; // Centered vertically
            mesh.castShadow = true;
            break;
        case 'vine_swing_point': // Placeholder (non-collidable marker?)
            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 8, 4),
                new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true }) // Visible marker
            );
            mesh.position.y = THREE.MathUtils.randFloat(5, 10); // Place high up
            mesh.castShadow = false;
            userData.isNonCollidable = true; // Make it non-solid
            break;
        // --- END PLACEHOLDERS ---

        default:
            console.warn("Unknown scenery prefab:", prefabName);
             mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
             mesh.position.y = 0.5;
             mesh.castShadow = true;
            break;
    }

    if (mesh) {
        mesh.userData = userData;
        // Ensure bounding box exists before setting from object
        if (!mesh.userData.boundingBox) mesh.userData.boundingBox = new THREE.Box3();
        mesh.userData.boundingBox.setFromObject(mesh);
    }
    return mesh;
}

// Function to clear scene elements
function clearCurrentUniverse(scene, worldObjectsRef) {
     const objectsToRemove = scene.children.filter(obj =>
        !(obj instanceof THREE.Camera) &&
        !(obj instanceof THREE.AudioListener) &&
        !(obj.userData.isPlayerMesh) &&
        !(obj.userData.keepAcrossUniverses)
     );

     objectsToRemove.forEach(obj => {
         if (obj.isLight && !obj.isAmbientLight) {
              // Optionally remove lights, or handle separately
         } else if (obj.isMesh || obj.isGroup || obj.isPoints || obj.isLine) {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) { /* ... dispose material(s) ... */ }
            obj.traverse(child => { /* ... dispose child geometry/material ... */ });
            scene.remove(obj);
         } else if (obj.isLight) { // Remove non-ambient lights explicitly if desired
            scene.remove(obj);
         }
     });

     worldObjectsRef.length = 0;
     activePortals = [];
     UI.hideClueText();
     UI.updateObjectiveDisplay(null);
     console.log("Universe cleared.");
}

// Main function to generate/switch universe
export function generateUniverse(scene, worldObjectsRef, type) {
    console.log(`Generating universe type: ${type}`);
    clearCurrentUniverse(scene, worldObjectsRef);
    currentUniverseType = type;

    let biome;
    if (type === 'main') {
        biome = { ...BIOMES['DEFAULT'], texturePaths: {} };
        currentBiomeKey = 'TARDIS';
        UI.showMainHubUI(true);
        Audio.startAmbientSound('ambient_main');
    } else {
        currentBiomeKey = getRandomBiomeKey();
        biome = BIOMES[currentBiomeKey];
        console.log(`Selected biome: ${biome.name}`);
        UI.showMainHubUI(false);
        if (biome.ambientSound) { Audio.startAmbientSound(biome.ambientSound); }
        else { Audio.startAmbientSound('ambient_random_default'); }
    }

    currentUniverseParams = { /* ... set params from biome ... */
        ...biome.physics,
        controlRandomChance: biome.controlRandomChance ?? Constants.CONTROL_RANDOM_CHANCE,
        isPlatformBased: biome.isPlatformBased || false,
    };

    const bgColor = biome.bgColorRange ? getRandomColor(biome.bgColorRange[0], biome.bgColorRange[1]) : new THREE.Color(0x111111);
    scene.background = bgColor;
    const fogNearMultiplier = type === 'main' ? 0.8 : 0.4;
    const fogFarMultiplier = type === 'main' ? 1.5 : 1.3;
    const fogRadius = type === 'main' ? Constants.MAIN_UNIVERSE_RADIUS : Constants.UNIVERSE_RADIUS;
    scene.fog = biome.fogColorFormula ? new THREE.Fog(biome.fogColorFormula(bgColor), fogRadius * fogNearMultiplier, fogRadius * fogFarMultiplier) : new THREE.Fog(bgColor, fogRadius * fogNearMultiplier, fogRadius * fogFarMultiplier);

    scene.children.filter(c => c.isLight).forEach(light => scene.remove(light)); // Clear previous lights
    const ambientLight = new THREE.AmbientLight(0xffffff, type === 'main' ? 0.6 : THREE.MathUtils.randFloat(0.3, 0.7));
    scene.add(ambientLight);
    if (type === 'main') { /* ... add point light ... */
        const pointLight = new THREE.PointLight(0x00ffff, 1.0, Constants.MAIN_UNIVERSE_RADIUS * 2.5, 1.5);
        pointLight.position.set(0, 3.0, 0); pointLight.castShadow = true; scene.add(pointLight);
    } else { /* ... add directional light ... */
        const directionalLight = new THREE.DirectionalLight(getRandomColor(0.7, 1.0), THREE.MathUtils.randFloat(0.6, 1.1));
        directionalLight.position.set(THREE.MathUtils.randFloatSpread(25), THREE.MathUtils.randFloat(20, 40), THREE.MathUtils.randFloatSpread(25)); directionalLight.castShadow = true;
        /* ... shadow setup ... */ scene.add(directionalLight);
    }

    const universeRadius = type === 'main' ? Constants.MAIN_UNIVERSE_RADIUS : Constants.UNIVERSE_RADIUS;
    let groundTextureName = biome.texturePaths?.ground;
    if (type === 'main') { groundTextureName = 'tardis_floor'; }
    const groundTexture = groundTextureName ? getTexture(groundTextureName) : null;

    if (currentUniverseParams.isPlatformBased) { /* ... platform logic ... */
        // TODO: Needs proper platform generation. Placeholder:
        const platformGeo = new THREE.BoxGeometry(5, 1, 5);
        const platformMat = new THREE.MeshStandardMaterial({ color: groundTexture ? 0xffffff : 0x888888, map: groundTexture });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.set(0, 0, 0); platform.receiveShadow = true; platform.userData.isGround = true; platform.userData.boundingBox = new THREE.Box3().setFromObject(platform); scene.add(platform); worldObjectsRef.push(platform);
    } else { /* ... cylindrical ground logic ... */
        const groundGeo = new THREE.CylinderGeometry(universeRadius, universeRadius, 0.2, 32);
        const groundMat = new THREE.MeshStandardMaterial({
            color: groundTexture ? 0xffffff : (type === 'main' ? new THREE.Color(0x8899AA) : (biome.groundColorRange ? getRandomColor(biome.groundColorRange[0], biome.groundColorRange[1]) : 0x888888)),
            map: groundTexture, metalness: type === 'main' ? 0.8 : Math.random() * 0.4, roughness: type === 'main' ? 0.4 : THREE.MathUtils.randFloat(0.5, 0.9)
        });
        if (groundTexture) { /* ... texture repeat/update ... */
             groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
             const repeatVal = type === 'main' ? 4 : Math.max(2, Math.floor(universeRadius / 8));
             groundTexture.repeat.set(repeatVal, repeatVal); groundTexture.needsUpdate = true;
        }
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.position.y = -0.1; ground.receiveShadow = true; ground.userData.isGround = true; ground.userData.boundingBox = new THREE.Box3().setFromObject(ground);
        scene.add(ground); worldObjectsRef.push(ground);
    }

    // --- Spawn Portals (BEFORE Scenery/NPCs/Clues) ---
    activePortals = [];
    if (type === 'main') {
        const portalRnd = createPortalMesh(0x00ff00, 'random');
        console.log("Created main universe portal:", portalRnd.uuid, "Type:", portalRnd.userData.type);
        const calculatedY = Constants.PORTAL_HEIGHT / 2;
        console.log(`DEBUG: Using PORTAL_HEIGHT=${Constants.PORTAL_HEIGHT}, calculated Y=${calculatedY}`);
        const finalY = typeof calculatedY === 'number' && !isNaN(calculatedY) ? calculatedY : 1.5;
        portalRnd.position.set(0, finalY, -universeRadius + 1.5);
        updatePortalBoundingBox(portalRnd);
        console.log("Positioned main portal at:", portalRnd.position.toArray().map(n=>(typeof n === 'number' ? n.toFixed(2) : 'NaN')));
        scene.add(portalRnd);
        console.log("Added main portal to scene.");
        activePortals.push(portalRnd);
        worldObjectsRef.push(portalRnd);
    } else {
        const portalMain = createPortalMesh(0xff0000, 'main');
        console.log("Created random universe portal (to main):", portalMain.uuid, "Type:", portalMain.userData.type);
        const mainY = Constants.PORTAL_HEIGHT / 2;
        placeObjectRandomly(portalMain, mainY, universeRadius * 0.9, worldObjectsRef, 2.5);
        const groundHMain = findGroundHeight(portalMain.position, worldObjectsRef);
        // --- FIX NaN FALLBACK ---
        if (groundHMain !== null && typeof groundHMain === 'number' && !isNaN(groundHMain)) {
             portalMain.position.y = groundHMain + Constants.PORTAL_HEIGHT / 2;
        } else {
             console.warn("Portal (to main) couldn't find ground, placing at default height.");
             portalMain.position.y = Constants.PORTAL_HEIGHT / 2; // Use default Y
        }
        // --- END FIX ---
        updatePortalBoundingBox(portalMain);
        console.log("Positioned portal (to main) at:", portalMain.position.toArray().map(n=>(typeof n === 'number' ? n.toFixed(2) : 'NaN')));
        scene.add(portalMain);
        activePortals.push(portalMain);
        worldObjectsRef.push(portalMain);

        const portalRnd = createPortalMesh(0x00ff00, 'random');
        console.log("Created random universe portal (to random):", portalRnd.uuid, "Type:", portalRnd.userData.type);
        const rndY = Constants.PORTAL_HEIGHT / 2;
        let placementOk = false;
        let attempts = 0;
        while (!placementOk && attempts < Constants.MAX_PLACEMENT_ATTEMPTS) {
            placeObjectRandomly(portalRnd, rndY, universeRadius * 0.9, worldObjectsRef, 2.5);
             const groundHRnd = findGroundHeight(portalRnd.position, worldObjectsRef);
             // --- FIX NaN FALLBACK ---
             if (groundHRnd !== null && typeof groundHRnd === 'number' && !isNaN(groundHRnd)) {
                 portalRnd.position.y = groundHRnd + Constants.PORTAL_HEIGHT / 2;
             } else {
                  console.warn("Portal (to random) couldn't find ground, placing at default height.");
                  portalRnd.position.y = Constants.PORTAL_HEIGHT / 2; // Use default Y
             }
             // --- END FIX ---
             updatePortalBoundingBox(portalRnd);
             // Use stricter Box check from utils.js
            if (portalRnd.position.distanceTo(portalMain.position) > Constants.PORTAL_WIDTH * 3 &&
                isPlacementAreaClearBox(portalRnd.userData.boundingBox, worldObjectsRef, portalRnd) // Pass its own box
               ) {
                placementOk = true;
            }
            attempts++;
        }
         if (!placementOk) console.warn("Could not place second portal safely!");
        console.log("Positioned portal (to random) at:", portalRnd.position.toArray().map(n=>(typeof n === 'number' ? n.toFixed(2) : 'NaN')));
        scene.add(portalRnd);
        activePortals.push(portalRnd);
        worldObjectsRef.push(portalRnd);
    }

    // --- Scenery & Main Hub Console (AFTER Ground, AFTER Portals) ---
    if (type === 'main') { /* ... console logic ... */
        const consoleModel = getModel('console');
        if (consoleModel) { /* ... add console model ... */
             const consoleInstance = consoleModel.scene.clone(); consoleInstance.position.y = 0;
             consoleInstance.traverse(node => { if(node.isMesh) node.castShadow = true; }); scene.add(consoleInstance);
             consoleInstance.userData = { isScenery: true }; const bbox = new THREE.Box3().setFromObject(consoleInstance);
             consoleInstance.userData.boundingBox = bbox; worldObjectsRef.push(consoleInstance);
        } else { /* ... procedural console fallback ... */
             console.warn("Console model not found, using procedural fallback.");
             const cBaseGeo = new THREE.CylinderGeometry(1.5, 1.8, 1.0, 6); const cBaseMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 }); const cBase = new THREE.Mesh(cBaseGeo, cBaseMat); cBase.position.y = 0.5; cBase.castShadow = true; cBase.userData = {isScenery: true, boundingBox: new THREE.Box3().setFromObject(cBase)}; scene.add(cBase); worldObjectsRef.push(cBase);
             const cTopGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.5, 6); const cTopMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaaa, emissiveIntensity: 0.8 }); const cTop = new THREE.Mesh(cTopGeo, cTopMat); cTop.position.y = 1.25; cTop.userData = {isScenery: true, boundingBox: new THREE.Box3().setFromObject(cTop)}; scene.add(cTop); worldObjectsRef.push(cTop);
        }
    } else { /* ... random scenery logic ... */
        const numScenery = THREE.MathUtils.randInt(5, 15);
        for (let i = 0; i < numScenery; i++) {
            if (!biome.sceneryPrefabs || biome.sceneryPrefabs.length === 0) break;
            const prefabName = biome.sceneryPrefabs[Math.floor(Math.random() * biome.sceneryPrefabs.length)];
            const sceneryMesh = createSceneryObject(prefabName);
            if (sceneryMesh) {
                let yPos = sceneryMesh.position.y;
                const placedOk = placeObjectRandomly( sceneryMesh, yPos, universeRadius * 0.9, worldObjectsRef, 1.5 );
                if (placedOk) {
                    const groundY = findGroundHeight(sceneryMesh.position, worldObjectsRef);
                    if (groundY !== null && typeof groundY === 'number' && !isNaN(groundY)) {
                        const geometry = sceneryMesh.geometry; let heightOffset = 0.5;
                        if (geometry) { if (!geometry.boundingBox) geometry.computeBoundingBox(); if (geometry.boundingBox) { heightOffset = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2; } }
                        sceneryMesh.position.y = groundY + heightOffset;
                        // Ensure boundingBox exists before setting from object
                        if (!sceneryMesh.userData.boundingBox) sceneryMesh.userData.boundingBox = new THREE.Box3();
                        sceneryMesh.userData.boundingBox.setFromObject(sceneryMesh);
                    }
                    scene.add(sceneryMesh);
                    worldObjectsRef.push(sceneryMesh);
                }
            }
        }
    }

    // --- Spawn NPCs (AFTER Scenery) ---
    if (type !== 'main' && biome.npcSpawnRules) {
        spawnNPCs(scene, biome.npcSpawnRules, universeRadius, worldObjectsRef);
    }

    // --- Spawn Clues (AFTER NPCs & Scenery) ---
    if (type !== 'main') {
        const clueMeshes = spawnClueObjects(scene, THREE.MathUtils.randInt(1, 3), universeRadius, worldObjectsRef);
        clueMeshes.forEach(mesh => worldObjectsRef.push(mesh));
    }

     // --- Mini Objective (AFTER everything else placed) ---
     let currentObjective = null;
     if (type !== 'main' && Math.random() < Constants.MINI_OBJECTIVE_CHANCE && biome.miniObjectiveConfig) {
         currentObjective = setupMiniObjective(scene, worldObjectsRef, biome.miniObjectiveConfig, universeRadius);
     }
     UI.updateObjectiveDisplay(currentObjective);


    // --- Player Spawn Position ---
    let spawnPos = new THREE.Vector3(0, Constants.PLAYER_HEIGHT * 1.5, 0);
    if (type === 'main') { spawnPos.set(0, Constants.PLAYER_HEIGHT / 2 + 0.1, universeRadius / 2); }
    let safeSpawnPos = spawnPos.clone();
    let spawnAttempts = 0;
    while (!isSpawnAreaClear(safeSpawnPos, Constants.PLAYER_SPAWN_CLEARANCE_RADIUS, worldObjectsRef) && spawnAttempts < Constants.MAX_PLACEMENT_ATTEMPTS) {
        safeSpawnPos.x += (Math.random() - 0.5) * 1.0; safeSpawnPos.z += (Math.random() - 0.5) * 1.0;
        const groundY = findGroundHeight(safeSpawnPos, worldObjectsRef);
        if(groundY !== null && typeof groundY === 'number' && !isNaN(groundY)) { safeSpawnPos.y = groundY + Constants.PLAYER_HEIGHT / 2 + 0.1; }
        else { safeSpawnPos.y = Constants.PLAYER_HEIGHT * 1.5; }
        spawnAttempts++;
    }
    if (spawnAttempts >= Constants.MAX_PLACEMENT_ATTEMPTS) { console.warn("Could not guarantee clear player spawn!"); }


    console.log("Universe generation complete.");
    return { safeSpawnPos, physicsParams: currentUniverseParams, shouldRandomizeControls: type !== 'main' && Math.random() < currentUniverseParams.controlRandomChance, currentObjective };
}


function setupMiniObjective(scene, worldObjectsRef, config, universeRadius) {
    if (!config || !config.possibleTypes || config.possibleTypes.length === 0) return null;
    const type = config.possibleTypes[Math.floor(Math.random() * config.possibleTypes.length)];
    let objective = null;

    try {
        switch (type) {
            case 'collect_shards':
                const count = config.shardCount || 3;
                objective = { type: 'collect_shards', text: `Collect ${count} Energy Shards`, required: count, current: 0, items: [] };
                for (let i = 0; i < count; i++) { /* ... create/place shardMesh ... */
                    const shardGeo = new THREE.TetrahedronGeometry(0.3); const shardMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x55ffff, emissiveIntensity: 1.5 }); const shardMesh = new THREE.Mesh(shardGeo, shardMat);
                    shardMesh.userData = { isObjectiveItem: true, objectiveType: 'collect_shards', boundingBox: new THREE.Box3().setFromObject(shardMesh) };
                    const yPos = THREE.MathUtils.randFloat(0.8, 2.5);
                    placeObjectRandomly(shardMesh, yPos, universeRadius * 0.9, worldObjectsRef, 1.0);
                    scene.add(shardMesh); worldObjectsRef.push(shardMesh); objective.items.push(shardMesh);
                 }
                break;
            case 'reach_beacon':
                 const beaconHeight = config.beaconHeight || 10;
                 objective = { type: 'reach_beacon', text: `Reach the High Beacon`, required: 1, current: 0, items: [] };
                 const beaconGeo = new THREE.ConeGeometry(0.5, 2.0, 8); const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff55, emissiveIntensity: 2.0 }); const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
                 beaconMesh.userData = { isObjectiveItem: true, objectiveType: 'reach_beacon', boundingBox: new THREE.Box3().setFromObject(beaconMesh) };
                 placeObjectRandomly(beaconMesh, beaconHeight, universeRadius * 0.7, worldObjectsRef, 1.5);
                 scene.add(beaconMesh); worldObjectsRef.push(beaconMesh); objective.items.push(beaconMesh);
                break;
            default: console.warn("Unknown objective type in config:", type); break;
        }
        if(objective) console.log("Mini-objective created:", objective.type);
    } catch (error) { console.error("Error setting up mini objective:", error); objective = null; }
    return objective;
}


// --- Getters for state needed by main loop ---
export function getCurrentUniverseType() { return currentUniverseType; }
export function getActivePortals() { return activePortals; }
