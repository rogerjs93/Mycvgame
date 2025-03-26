import * as THREE from 'three';
import { placeObjectRandomly, isSpawnAreaClear } from './utils.js';
import * as Constants from './constants.js';
// Import Audio if NPCs make sounds
// import * as Audio from './audio.js';

let activeNPCs = []; // List of NPC objects { mesh, behavior, state, ... }

// Function to create the mesh for an NPC based on type
function createNPCMesh(size, biomeType = 'DEFAULT') {
    let npcGeo;
    const type = Math.random();
    // Add more varied geometry based on biome or type later
    if (type < 0.33) npcGeo = new THREE.BoxGeometry(size, size, size);
    else if (type < 0.66) npcGeo = new THREE.SphereGeometry(size * 0.6, 16, 8);
    else npcGeo = new THREE.ConeGeometry(size * 0.5, size, 8);

    const npcMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5), // Random hue
        roughness: Math.random() * 0.5 + 0.3,
        metalness: Math.random() * 0.2,
    });
    const npcMesh = new THREE.Mesh(npcGeo, npcMat);
    npcMesh.castShadow = true;
    npcMesh.userData.isNPC = true; // Tag for collision/interaction
    npcMesh.userData.boundingBox = new THREE.Box3().setFromObject(npcMesh);

    return npcMesh;
}

// Spawn NPCs for a universe
export function spawnNPCs(scene, rules, universeRadius, worldObjectsForCheck) {
    activeNPCs = []; // Clear previous NPCs
    const { types = ['wanderer'], maxCount = 3, speedMultiplier = 1.0 } = rules;

    const numToSpawn = Math.min(maxCount, Math.floor(Math.random() * (maxCount + 1))); // 0 to maxCount

    for (let i = 0; i < numToSpawn; i++) {
        const npcSize = THREE.MathUtils.randFloat(0.6, 1.6);
        const npcMesh = createNPCMesh(npcSize);

        const behavior = types[Math.floor(Math.random() * types.length)]; // Pick random allowed behavior
        const canFly = behavior.includes('_fly'); // Check if behavior implies flying

        const startY = canFly ? THREE.MathUtils.randFloat(npcSize * 2, 8.0) : npcSize / 2; // Flying NPCs start higher
        const placementRadius = universeRadius * 0.8;

        // Place randomly, checking clearance
        placeObjectRandomly(npcMesh, startY, placementRadius, worldObjectsForCheck, 1.5); // Use larger clearance for NPCs

        const npcData = {
            mesh: npcMesh,
            behavior: behavior,
            state: { // Behavior-specific state
                targetPosition: new THREE.Vector3(),
                isWaiting: false,
                waitTimer: 0,
                patrolIndex: 0, // For guards
                hintText: "...", // For hint givers
                hazardCooldown: 0, // For hazard droppers
            },
            velocity: new THREE.Vector3(),
            speed: Constants.PLAYER_BASE_SPEED * 0.5 * speedMultiplier * THREE.MathUtils.randFloat(0.8, 1.2), // Base speed relative to player
            canFly: canFly,
            gravity: Constants.BASE_GRAVITY * (canFly ? 0 : 0.8), // No or reduced gravity for flyers/specific NPCs
            onGround: !canFly,
        };

        // Initialize behavior-specific state
        if (behavior === 'hint') {
            npcData.speed = 0; // Hint givers don't move
            npcData.state.hintText = getRandomHint(); // Get a random hint
        } else {
            setNewNPCTarget(npcData, universeRadius); // Set initial target for moving NPCs
        }
        // TODO: Initialize guard patrol paths, etc.

        scene.add(npcMesh);
        activeNPCs.push(npcData);
        // Add to external world objects list for collision
        worldObjectsForCheck.push(npcMesh);
    }
    console.log(`Spawned ${activeNPCs.length} NPCs.`);
    return activeNPCs; // Return the list of NPC data objects
}

// Update all active NPCs
export function updateAllNPCs(deltaTime, worldObjects, playerPosition) {
    activeNPCs.forEach(npc => {
        updateNPC(npc, deltaTime, worldObjects, playerPosition, universeRadius); // Pass radius if needed
    });
}

// Update logic for a single NPC
function updateNPC(npc, deltaTime, worldObjects, playerPosition, universeRadius) {
    const { mesh, behavior, state, velocity, speed, canFly, gravity } = npc;

    // --- Behavior State Machine ---
    switch (behavior) {
        case 'wanderer':
        case 'wanderer_fly':
            handleWanderBehavior(npc, deltaTime, universeRadius);
            break;
        case 'guard':
            // TODO: Implement guard patrol logic (move between waypoints)
            handleWanderBehavior(npc, deltaTime, universeRadius); // Placeholder: wanders for now
            break;
        case 'hint':
            // Hint givers are static, maybe rotate slowly?
            mesh.rotation.y += 0.1 * deltaTime;
            // Apply gravity if somehow moved
            velocity.y += gravity * deltaTime;
             applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects); // Still need physics/collision
            return; // No movement target logic needed
        case 'hazard_dropper':
            // TODO: Wander + periodically drop a temporary hazard object
            handleWanderBehavior(npc, deltaTime, universeRadius);
            state.hazardCooldown -= deltaTime;
            if (state.hazardCooldown <= 0) {
                // dropHazard(mesh.position);
                state.hazardCooldown = THREE.MathUtils.randFloat(5, 15); // Cooldown
            }
            break;
        default:
            handleWanderBehavior(npc, deltaTime, universeRadius); // Default wander
            break;
    }

    // --- Physics & Collision ---
    velocity.y += gravity * deltaTime;
    applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects);

    // --- Update BBox ---
    mesh.userData.boundingBox.setFromObject(mesh);
}


function handleWanderBehavior(npc, deltaTime, universeRadius) {
    const { mesh, state, velocity, speed, canFly } = npc;

    // Check if waiting
    if (state.isWaiting) {
        state.waitTimer -= deltaTime;
        if (state.waitTimer <= 0) {
            state.isWaiting = false;
            setNewNPCTarget(npc, universeRadius);
        } else {
            // Apply friction/damping while waiting
             velocity.multiplyScalar(0.9); // Slow down quickly
            return; // Don't calculate movement direction while waiting
        }
    }

    const direction = state.targetPosition.clone().sub(mesh.position);
    const distanceToTargetSq = direction.lengthSq();

    // Close enough to target?
    if (distanceToTargetSq < 1.0) {
        // Start waiting period
        state.isWaiting = true;
        state.waitTimer = THREE.MathUtils.randFloat(1.0, 4.0); // Wait 1-4 seconds
        velocity.set(0, velocity.y, 0); // Stop horizontal movement
    } else {
        // Move towards target
        direction.normalize();
        velocity.x = direction.x * speed;
        velocity.z = direction.z * speed;
        if (canFly) {
             velocity.y = direction.y * speed * 0.5; // Slower vertical movement for flyers?
        }
    }
}

function applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects) {
    const { mesh, velocity, canFly } = npc;
    const deltaPos = velocity.clone().multiplyScalar(deltaTime);
    const potentialPos = mesh.position.clone().add(deltaPos);

    let npcOnGround = false;

    // 1. Ground Collision (if not flying)
    if (!canFly) {
        // Simple check: Assume ground at y=0 for collision
        const npcHeight = mesh.geometry.parameters.height || (mesh.geometry.parameters.radius * 1.2) || 0.5; // Estimate height
        const npcBottomY = potentialPos.y - npcHeight / 2;
        const groundY = 0; // Find actual ground height if needed: findGroundHeight(potentialPos, worldObjects) ?? 0;

        if (npcBottomY <= groundY && velocity.y <= 0) {
            potentialPos.y = groundY + npcHeight / 2;
            velocity.y = 0;
            npcOnGround = true;
            npc.onGround = true; // Update npc state
        } else {
             npc.onGround = false;
        }
    }

    // 2. Boundary Collision (Circular) - Simple stop/redirect
    const maxDist = Constants.UNIVERSE_RADIUS * 0.95; // Keep NPCs inside slightly
    const distSq = potentialPos.x * potentialPos.x + potentialPos.z * potentialPos.z;
    if (distSq > maxDist * maxDist) {
         // Hit boundary - stop horizontal and set new target inward?
         velocity.x = 0;
         velocity.z = 0;
         if (!npc.state.isWaiting) setNewNPCTarget(npc, Constants.UNIVERSE_RADIUS * 0.8); // Get new target further in
         // Don't update position this frame if hitting boundary strongly? Or clamp it?
         // Clamping:
         const angle = Math.atan2(potentialPos.z, potentialPos.x);
         potentialPos.x = Math.cos(angle) * maxDist;
         potentialPos.z = Math.sin(angle) * maxDist;
    }

    // 3. NPC vs World Objects (Scenery, Portals - Basic AABB Stop)
    const npcColliderFuture = mesh.userData.boundingBox.clone().translate(potentialPos.clone().sub(mesh.position));
    for (const obj of worldObjects) {
        if (obj === mesh || obj.userData.isGround || obj.userData.isPlayer || !obj.userData.boundingBox) continue; // Skip self, ground, player (player handles), no bbox

        if (npcColliderFuture.intersectsBox(obj.userData.boundingBox)) {
            // Basic stop - zero out velocity component in direction of collision
            // More complex resolution needed for sliding
             const directionToObject = obj.position.clone().sub(potentialPos).normalize();
             if (Math.abs(directionToObject.x) > Math.abs(directionToObject.z)) { // Primarily X collision
                 velocity.x = 0; potentialPos.x = mesh.position.x; // Stop X move
             } else { // Primarily Z collision
                 velocity.z = 0; potentialPos.z = mesh.position.z; // Stop Z move
             }
             if (!canFly && Math.abs(directionToObject.y) > 0.5 && velocity.y > 0) { // Hitting something above
                velocity.y = 0; potentialPos.y = mesh.position.y; // Stop Y move
             }
             // Recalculate future collider based on correction for subsequent checks? (More complex)
        }
    }


    // Final position update
    mesh.position.copy(potentialPos);

}


// Set a new random target for a wandering NPC
function setNewNPCTarget(npc, universeRadius) {
    const { mesh, state, canFly } = npc;
    const wanderRadius = universeRadius * (canFly ? 0.9 : 0.8);
    const angle = Math.random() * Math.PI * 2;
    const targetRadius = Math.random() * wanderRadius;

    state.targetPosition.set(
        Math.cos(angle) * targetRadius,
        canFly ? THREE.MathUtils.randFloat(1.0, 10.0) : mesh.position.y, // Fly height or current Y (stay on ground)
        Math.sin(angle) * targetRadius
    );
    // For non-flying NPCs, ensure target isn't drastically different in Y if ground isn't flat
    // state.targetPosition.y = findGroundHeight(state.targetPosition, worldObjects) + meshHeight/2 ?? mesh.position.y;
}

function getRandomHint() {
    // Placeholder hints - replace with actual useful hints later
    const hints = [
        "Sometimes, the way back is hidden.",
        "Look for the glow.",
        "Speed varies, adapt quickly.",
        "Gravity can be deceiving.",
        "Not all that wanders is lost... some just give hints.",
    ];
    return hints[Math.floor(Math.random() * hints.length)];
}

// Get the list of active NPC data objects
export function getActiveNPCsData() {
    return activeNPCs;
}
