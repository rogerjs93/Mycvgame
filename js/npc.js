import * as THREE from 'three';
import { placeObjectRandomly, isSpawnAreaClear, findGroundHeight } from './utils.js'; // Assuming findGroundHeight exists if needed
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
                stuckTimer: 0, // --- NEW: Timer to check if stuck ---
                lastPosition: npcMesh.position.clone(), // --- NEW: Track last position ---
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

        scene.add(npcMesh);
        activeNPCs.push(npcData);
        // Add to external world objects list for collision
        worldObjectsForCheck.push(npcMesh);
    }
    console.log(`Spawned ${activeNPCs.length} NPCs.`);
    return activeNPCs; // Return the list of NPC data objects
}

// Update all active NPCs
export function updateAllNPCs(deltaTime, worldObjects, playerPosition, universeRadius) { // Added universeRadius
    activeNPCs.forEach(npc => {
        updateNPC(npc, deltaTime, worldObjects, playerPosition, universeRadius); // Pass radius
    });
}

// Update logic for a single NPC
function updateNPC(npc, deltaTime, worldObjects, playerPosition, universeRadius) {
    const { mesh, behavior, state, velocity, speed, canFly, gravity } = npc;
    const STUCK_THRESHOLD = 0.01; // Min distance moved to be considered not stuck
    const STUCK_TIME_LIMIT = 3.0; // Seconds before trying to get unstuck

    // --- Check if Stuck ---
    if (!state.isWaiting && behavior !== 'hint') {
        if (mesh.position.distanceToSquared(state.lastPosition) < STUCK_THRESHOLD * STUCK_THRESHOLD) {
            state.stuckTimer += deltaTime;
        } else {
            state.stuckTimer = 0; // Reset timer if moved
            state.lastPosition.copy(mesh.position); // Update last known good position
        }

        // If stuck for too long, try finding a new target
        if (state.stuckTimer > STUCK_TIME_LIMIT) {
            console.log(`NPC ${mesh.uuid} appears stuck, finding new target.`);
            setNewNPCTarget(npc, universeRadius); // Get a new direction
            state.stuckTimer = 0; // Reset timer
            // Optionally add a small random impulse to help break free?
            // velocity.x += (Math.random() - 0.5) * 0.5;
            // velocity.z += (Math.random() - 0.5) * 0.5;
        }
    } else {
         state.stuckTimer = 0; // Don't check if waiting or static
    }


    // --- Behavior State Machine ---
    switch (behavior) {
        case 'wanderer':
        case 'wanderer_fly':
            handleWanderBehavior(npc, deltaTime, universeRadius);
            break;
        case 'guard':
            // TODO: Implement guard patrol logic
            handleWanderBehavior(npc, deltaTime, universeRadius); // Placeholder
            break;
        case 'hint':
            mesh.rotation.y += 0.1 * deltaTime;
            velocity.y += gravity * deltaTime; // Apply gravity just in case
            applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects);
            return; // No movement target logic needed
        case 'hazard_dropper':
            handleWanderBehavior(npc, deltaTime, universeRadius);
            // ... (hazard dropping logic) ...
            break;
        default:
            handleWanderBehavior(npc, deltaTime, universeRadius);
            break;
    }

    // --- Physics & Collision ---
    velocity.y += gravity * deltaTime;
    applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects);

    // --- Update BBox ---
    // Update only if the mesh actually moved to avoid unnecessary calculations
    if (mesh.position.distanceToSquared(state.lastPosition) > 0.0001) {
        mesh.userData.boundingBox.setFromObject(mesh);
    }
}


function handleWanderBehavior(npc, deltaTime, universeRadius) {
    const { mesh, state, velocity, speed, canFly } = npc;

    // Check if waiting
    if (state.isWaiting) {
        state.waitTimer -= deltaTime;
        if (state.waitTimer <= 0) {
            state.isWaiting = false;
            setNewNPCTarget(npc, universeRadius); // Get new target *after* waiting
             state.stuckTimer = 0; // Reset stuck timer when starting to move again
             state.lastPosition.copy(mesh.position); // Update position before moving
        } else {
             velocity.x *= 0.9; // Apply friction while waiting
             velocity.z *= 0.9;
            return; // Don't calculate movement direction while waiting
        }
    }

    // Only calculate movement if not waiting
    if (!state.isWaiting) {
        const direction = state.targetPosition.clone().sub(mesh.position);
        const distanceToTargetSq = direction.lengthSq();

        // Close enough to target?
        if (distanceToTargetSq < 1.5) { // Increased threshold slightly
            state.isWaiting = true;
            state.waitTimer = THREE.MathUtils.randFloat(1.5, 5.0); // Wait a bit longer sometimes
            // Don't zero velocity immediately, let friction handle it or collision
        } else {
            // Move towards target
            direction.normalize();
            // Simple acceleration towards target velocity
            const targetVelX = direction.x * speed;
            const targetVelZ = direction.z * speed;
            velocity.x += (targetVelX - velocity.x) * 0.1; // Approach target velocity
            velocity.z += (targetVelZ - velocity.z) * 0.1;

            if (canFly) {
                const targetVelY = direction.y * speed * 0.5; // Slower vertical
                velocity.y += (targetVelY - velocity.y) * 0.05; // Slower vertical approach
            }
        }
    }
}

function applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects) {
    const { mesh, velocity, canFly, state } = npc; // Added state
    if (deltaTime <= 0) return; // Skip if no time passed

    const deltaPos = velocity.clone().multiplyScalar(deltaTime);
    // Avoid micro-movements if velocity is tiny
    if (deltaPos.lengthSq() < 0.00001) return;

    const potentialPos = mesh.position.clone().add(deltaPos);
    let correctedDelta = deltaPos.clone(); // Start with intended delta

    let npcOnGround = false;

    // 1. Ground Collision (if not flying)
    if (!canFly) {
        const npcHeight = mesh.geometry?.parameters?.height || (mesh.geometry?.parameters?.radius * 1.2) || 0.5;
        const npcBottomY = potentialPos.y - npcHeight / 2;
        const groundY = 0; // TODO: findGroundHeight if ground isn't flat

        if (npcBottomY <= groundY && velocity.y <= 0) {
            const correctionY = groundY - npcBottomY;
            potentialPos.y += correctionY; // Correct position
            correctedDelta.y += correctionY; // Correct delta for collider update
            velocity.y = 0;
            npcOnGround = true;
            npc.onGround = true;
        } else {
             npc.onGround = false;
        }
    }

    // 2. Boundary Collision (Circular) - Now just nudge back slightly
    const maxDist = Constants.UNIVERSE_RADIUS * 0.95;
    const distSq = potentialPos.x * potentialPos.x + potentialPos.z * potentialPos.z;
    if (distSq > maxDist * maxDist) {
        const outwardDir = new THREE.Vector3(potentialPos.x, 0, potentialPos.z).normalize();
        const pushBack = outwardDir.multiplyScalar((Math.sqrt(distSq) - maxDist) * 1.1); // Push back slightly more than needed
        potentialPos.sub(pushBack);
        correctedDelta.sub(pushBack); // Adjust delta as well
        // Dampen velocity component moving outwards
        const outwardSpeed = velocity.dot(outwardDir);
        if(outwardSpeed > 0) {
             velocity.sub(outwardDir.multiplyScalar(outwardSpeed));
        }
         state.stuckTimer += 0.1; // Consider boundary hit as potential stuck indicator
    }

    // 3. NPC vs World Objects (Scenery, Portals - Slightly improved response)
    const npcColliderFuture = mesh.userData.boundingBox.clone().translate(correctedDelta);
    let collisionDetected = false;
    for (const obj of worldObjects) {
        if (obj === mesh || obj.userData.isGround || obj.userData.isPlayer || !obj.userData.boundingBox) continue;

        if (npcColliderFuture.intersectsBox(obj.userData.boundingBox)) {
             collisionDetected = true;
             // More robust collision needed for sliding. Basic stop/deflect:
             const collisionNormal = mesh.position.clone().sub(obj.position).normalize(); // Approx normal from object center to NPC center
             collisionNormal.y = 0; // Primarily horizontal correction for wanderers
             collisionNormal.normalize();

             // Deflect velocity slightly away from collision normal
             const speedAlongNormal = velocity.dot(collisionNormal);
             if (speedAlongNormal < 0) { // Moving towards the object
                  velocity.sub(collisionNormal.multiplyScalar(speedAlongNormal * 1.1)); // Remove component moving towards obstacle + a bit extra
             }

             // Try finding a slightly different target might be better than velocity deflection alone
              state.stuckTimer += 0.1; // Increment stuck timer on collision

             // Simple Stop (Fallback if deflection is messy)
             // velocity.x = 0; velocity.z = 0;

             // Correct delta for this frame to prevent penetration (crude)
             // Find minimum overlap axis might be better if implementing AABB separation
             correctedDelta.set(0, correctedDelta.y, 0); // Simplest: just stop horizontal movement this frame

             break; // Handle one collision for now
        }
    }


    // Final position update using the (potentially zeroed) correctedDelta
    mesh.position.add(correctedDelta);

}


// Set a new random target for a wandering NPC
function setNewNPCTarget(npc, universeRadius) {
    const { mesh, state, canFly } = npc;
    const wanderRadius = universeRadius * (canFly ? 0.9 : 0.8);
    const angle = Math.random() * Math.PI * 2;
    const targetRadius = Math.random() * wanderRadius;
    const targetY = canFly ? THREE.MathUtils.randFloat(1.0, 10.0) : mesh.position.y; // Use current Y for ground NPCs

    const potentialTarget = new THREE.Vector3(
         Math.cos(angle) * targetRadius,
         targetY,
         Math.sin(angle) * targetRadius
    );

    // Optional: Add slight bias away from current position to encourage moving
    const dirAway = potentialTarget.clone().sub(mesh.position);
    if (dirAway.lengthSq() < 4) { // If target is too close, pick another further away
         const angleAway = Math.atan2(mesh.position.z, mesh.position.x) + Math.PI + (Math.random() - 0.5); // Opposite direction +/- randomness
         const radiusAway = wanderRadius * THREE.MathUtils.randFloat(0.7, 1.0);
         potentialTarget.set(
             Math.cos(angleAway) * radiusAway,
             targetY,
             Math.sin(angleAway) * radiusAway
         );
    }

    state.targetPosition.copy(potentialTarget);
    state.isWaiting = false; // Ensure not waiting when new target set
    // console.log(`NPC ${npc.mesh.uuid} new target: ${state.targetPosition.toArray().map(n=>n.toFixed(1))}`);
}

function getRandomHint() {
    // Placeholder hints
    const hints = [ "A path blocked may hide another.", "Look up, look down, look around.", "Some walls are illusions.", "Green leads onward, Red leads back.", "Even static has patterns." ];
    return hints[Math.floor(Math.random() * hints.length)];
}

// Get the list of active NPC data objects
export function getActiveNPCsData() {
    return activeNPCs;
}
