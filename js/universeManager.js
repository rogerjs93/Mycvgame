import * as THREE from 'three';
import { showInstructionsPanel } from './ui.js';
import { createPortalMesh } from './portal.js'; // Assume portal logic is in portal.js
import { spawnClueObjects } from './clue.js';
import { spawnNPCs } from './npc.js'; // Assume NPC logic is in npc.js
import { getRandomColor, placeObjectRandomly, isSpawnAreaClear } from './utils.js';
import * as Constants from './constants.js';
import { worldObjects, clearWorldObjects } from './main.js'; // Manage shared state
// Import loaders if using assets
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { TextureLoader } from 'three';

// const textureLoader = new TextureLoader();
// const gltfLoader = new GLTFLoader();
// let tardisFloorTexture = null; // Preload these?

let currentUniverseType = 'main';
let activePortals = [];
let activeNPCs = [];
let activeClues = [];

// Function to load assets (call this once at the beginning)
export async function preloadUniverseAssets() {
    // showLoading(true);
    // Example:
    // tardisFloorTexture = await textureLoader.loadAsync(Constants.ASSETS_PATH + 'textures/tardis_floor.jpg');
    // tardisFloorTexture.wrapS = tardisFloorTexture.wrapT = THREE.RepeatWrapping;
    // showLoading(false);
    console.log("Universe assets preloaded (or none to preload).");
}

function clearCurrentUniverse(scene) {
    // Remove portals, NPCs, clues, scenery from the scene AND worldObjects
    activePortals.forEach(p => scene.remove(p));
    activeNPCs.forEach(npc => scene.remove(npc.mesh)); // Assuming npc object has mesh property
    activeClues.forEach(c => scene.remove(c));
    // Remove scenery (need a way to tag scenery objects)
    worldObjects.filter(obj => obj.userData.isScenery || obj.userData.isGround).forEach(obj => scene.remove(obj));

    // Clear the lists
    activePortals = [];
    activeNPCs = [];
    activeClues = [];

    // Clear worldObjects (except player, handled in main.js)
    clearWorldObjects();

    hideClueText(); // From ui.js
}

export function getCurrentUniverseType() {
    return currentUniverseType;
}

export function generateUniverse(scene, type) {
    clearCurrentUniverse(scene);
    currentUniverseType = type;

    let universeConfig = {
        radius: Constants.UNIVERSE_RADIUS,
        fogNear: Constants.UNIVERSE_RADIUS * 0.4,
        fogFar: Constants.UNIVERSE_RADIUS * 1.3,
        bgColor: getRandomColor(0.05, 0.4),
        groundColor: getRandomColor(0.2, 0.7),
        ambientLightIntensity: THREE.MathUtils.randFloat(0.2, 0.6),
        directionalLightIntensity: THREE.MathUtils.randFloat(0.5, 1.0),
        spawnPlayerAt: new THREE.Vector3(0, Constants.PLAYER_HEIGHT / 2 + 0.1, 0), // Default spawn
        npcsToSpawn: THREE.MathUtils.randInt(1, 6),
        cluesToSpawn: THREE.MathUtils.randInt(1, 3),
    };

    if (type === 'main') {
        showInstructionsPanel(true);
        universeConfig = {
            ...universeConfig, // Keep some defaults?
            radius: Constants.MAIN_UNIVERSE_RADIUS,
            fogNear: Constants.MAIN_UNIVERSE_RADIUS * 0.8,
            fogFar: Constants.MAIN_UNIVERSE_RADIUS * 1.5,
            bgColor: new THREE.Color(0x101518),
            groundColor: new THREE.Color(0x607D8B), // TARDIS floor
            ambientLightIntensity: 0.6,
            directionalLightIntensity: 0, // Use point light instead
            hasPointLight: true,
            pointLightColor: 0x00ffff,
            pointLightIntensity: 1.0,
            pointLightPos: new THREE.Vector3(0, 3.0, 0),
            spawnPlayerAt: new THREE.Vector3(0, Constants.PLAYER_HEIGHT / 2 + 0.1, Constants.MAIN_UNIVERSE_RADIUS / 2),
            npcsToSpawn: 0,
            cluesToSpawn: 0,
        };
    } else { // Random
        showInstructionsPanel(false);
    }

    // Setup Scene Basics
    scene.background = universeConfig.bgColor;
    scene.fog = new THREE.Fog(universeConfig.bgColor, universeConfig.fogNear, universeConfig.fogFar);

    // Setup Lights
    scene.remove(...scene.children.filter(c => c.isLight));
    const ambientLight = new THREE.AmbientLight(0xffffff, universeConfig.ambientLightIntensity);
    scene.add(ambientLight);
    if (universeConfig.directionalLightIntensity > 0) {
        // ... (create directional light as before) ...
        const directionalLight = new THREE.DirectionalLight(getRandomColor(0.7, 1.0), universeConfig.directionalLightIntensity);
        directionalLight.position.set(THREE.MathUtils.randFloatSpread(20), THREE.MathUtils.randFloat(15, 35), THREE.MathUtils.randFloatSpread(20));
        directionalLight.castShadow = true; /* ... shadow map setup ... */ scene.add(directionalLight);
    }
    if (universeConfig.hasPointLight) {
        const pointLight = new THREE.PointLight(universeConfig.pointLightColor, universeConfig.pointLightIntensity, universeConfig.radius * 2.5, 1.5);
        pointLight.position.copy(universeConfig.pointLightPos); pointLight.castShadow = true; scene.add(pointLight);
    }

    // Create Ground
    const groundGeo = new THREE.CylinderGeometry(universeConfig.radius, universeConfig.radius, 0.2, 32);
    const groundMat = new THREE.MeshStandardMaterial({
        color: universeConfig.groundColor,
        // map: type === 'main' ? tardisFloorTexture : alienGroundTexture, // Example texture use
        metalness: type === 'main' ? 0.8 : Math.random() * 0.4,
        roughness: type === 'main' ? 0.4 : THREE.MathUtils.randFloat(0.5, 0.9)
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.1; ground.receiveShadow = true; ground.userData.isGround = true;
    ground.userData.boundingBox = new THREE.Box3().setFromObject(ground);
    scene.add(ground);
    worldObjects.push(ground); // Add ground first

    // Create Scenery/Console for Main Universe
    if (type === 'main') {
        // ... (create console parts, add to scene and worldObjects) ...
        // Example using GLTF model:
        // gltfLoader.load(Constants.ASSETS_PATH + 'models/console.glb', (gltf) => {
        //     const consoleModel = gltf.scene;
        //     consoleModel.position.y = 0; // Adjust as needed
        //     consoleModel.traverse(node => { if(node.isMesh) node.castShadow = true; });
        //     scene.add(consoleModel);
        //     const bbox = new THREE.Box3().setFromObject(consoleModel);
        //     consoleModel.userData.boundingBox = bbox;
        //     consoleModel.userData.isScenery = true;
        //     worldObjects.push(consoleModel); // Add base object with bbox
        // });
        const consoleBaseGeo = new THREE.CylinderGeometry(1.5, 1.8, 1.0, 6); /* ... mat ... */ const consoleBase = new THREE.Mesh(consoleBaseGeo, /*mat*/); /* ... pos, shadow, bbox, add to scene/worldObjects ... */
        const consoleTopGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.5, 6); /* ... mat ... */ const consoleTop = new THREE.Mesh(consoleTopGeo, /*mat*/); /* ... pos, shadow, bbox, add to scene/worldObjects ... */
        scene.add(consoleBase); scene.add(consoleTop); worldObjects.push(consoleBase); worldObjects.push(consoleTop);
    } else {
        // Create Random Scenery
        // ... (loop to create rocks/crystals, add bboxes, add to scene/worldObjects) ...
    }

    // Spawn NPCs (must happen after scenery is in worldObjects for placement checks)
    if (universeConfig.npcsToSpawn > 0) {
        activeNPCs = spawnNPCs(scene, universeConfig.npcsToSpawn, universeConfig.radius);
    }

    // Spawn Clues (must happen after scenery/NPCs are in worldObjects)
     if (universeConfig.cluesToSpawn > 0) {
        activeClues = spawnClueObjects(scene, universeConfig.cluesToSpawn);
    }

    // Spawn Portals (check placement against everything added so far)
    if (type === 'main') {
        const portalRnd = createPortalMesh(0x00ff00, 'random'); // Pass type
        placeObjectRandomly(portalRnd, Constants.PORTAL_HEIGHT / 2, universeConfig.radius * 0.9);
        // checkObjectPlacement(portalRnd); // Check needed? Usually edge is clear
        portalRnd.position.set(0, Constants.PORTAL_HEIGHT / 2, -universeConfig.radius + 1.5); // Force position
        scene.add(portalRnd); activePortals.push(portalRnd); worldObjects.push(portalRnd);
    } else {
        const portalMain = createPortalMesh(0xff0000, 'main');
        placeObjectRandomly(portalMain, Constants.PORTAL_HEIGHT / 2, universeConfig.radius * 0.9);
        // while (checkObjectPlacement(portalMain)) { placeObjectRandomly(...) } // Robust placement
        scene.add(portalMain); activePortals.push(portalMain); worldObjects.push(portalMain);

        const portalRnd = createPortalMesh(0x00ff00, 'random');
         placeObjectRandomly(portalRnd, Constants.PORTAL_HEIGHT / 2, universeConfig.radius * 0.9);
        // while (portalRnd.position.distanceTo(portalMain.position) < Constants.PORTAL_WIDTH * 3 || checkObjectPlacement(portalRnd)) { placeObjectRandomly(...) }
        scene.add(portalRnd); activePortals.push(portalRnd); worldObjects.push(portalRnd);
    }

    // Ensure Player Spawn is Clear
    let safeSpawnPos = universeConfig.spawnPlayerAt.clone();
    let attempts = 0;
    const maxSpawnAttempts = 10;
    while (!isSpawnAreaClear(safeSpawnPos, Constants.PLAYER_RADIUS * 2, worldObjects) && attempts < maxSpawnAttempts) {
        safeSpawnPos.x += (Math.random() - 0.5) * 2; // Nudge randomly
        safeSpawnPos.z += (Math.random() - 0.5) * 2;
        attempts++;
    }
     if (attempts >= maxSpawnAttempts) console.warn("Could not guarantee clear player spawn!");

    return { safeSpawnPos, activePortals, activeNPCs, activeClues }; // Return generated objects and safe position
}

// Add functions to get active portals, npcs etc if needed by main loop
export function getActivePortals() { return activePortals; }
export function getActiveNPCs() { return activeNPCs; }
// Clues managed via clue.js's getClues()