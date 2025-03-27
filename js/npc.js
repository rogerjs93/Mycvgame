import * as THREE from 'three';
import { placeObjectRandomly, isSpawnAreaClear, findGroundHeight } from './utils.js';
import * as Constants from './constants.js';

let activeNPCs = []; // List of NPC objects { mesh, behavior, state, ... }

// Function to create the mesh for an NPC based on type
function createNPCMesh(size, biomeType = 'DEFAULT') {
    let npcGeo;
    const type = Math.random();
    if (type < 0.33) npcGeo = new THREE.BoxGeometry(size, size, size);
    else if (type < 0.66) npcGeo = new THREE.SphereGeometry(size * 0.6, 16, 8);
    else npcGeo = new THREE.ConeGeometry(size * 0.5, size, 8);

    const npcMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
        roughness: Math.random() * 0.5 + 0.3,
        metalness: Math.random() * 0.2,
    });
    const npcMesh = new THREE.Mesh(npcGeo, npcMat);
    npcMesh.castShadow = true;
    npcMesh.userData.isNPC = true;
    npcMesh.userData.boundingBox = new THREE.Box3().setFromObject(npcMesh);

    return npcMesh;
}

// Spawn NPCs for a universe
export function spawnNPCs(scene, rules, universeRadius, worldObjectsForCheck) {
    activeNPCs = []; // Clear previous NPCs
    const { types = ['wanderer'], maxCount = 3, speedMultiplier = 1.0 } = rules;
    const numToSpawn = Math.min(maxCount, Math.floor(Math.random() * (maxCount + 1)));

    for (let i = 0; i < numToSpawn; i++) {
        const npcSize = THREE.MathUtils.randFloat(0.6, 1.6);
        const npcMesh = createNPCMesh(npcSize);
        const behavior = types[Math.floor(Math.random() * types.length)];
        const canFly = behavior.includes('_fly');
        const startY = canFly ? THREE.MathUtils.randFloat(npcSize * 2, 8.0) : npcSize / 2;
        const placementRadius = universeRadius * 0.8;

        placeObjectRandomly(npcMesh, startY, placementRadius, worldObjectsForCheck, 1.5);

        const npcData = {
            mesh: npcMesh,
            behavior: behavior,
            state: {
                targetPosition: new THREE.Vector3(),
                isWaiting: false,
                waitTimer: 0,
                patrolIndex: 0,
                hintText: "...",
                hazardCooldown: 0,
                stuckTimer: 0, // --- NEW: Timer to check if stuck ---
                lastPosition: npcMesh.position.clone(), // --- NEW: Track last position ---
            },
            velocity: new THREE.Vector3(),
            speed: Constants.PLAYER_BASE_SPEED * 0.5 * speedMultiplier * THREE.MathUtils.randFloat(0.8, 1.2),
            canFly: canFly,
            gravity: Constants.BASE_GRAVITY * (canFly ? 0 : 0.8),
            onGround: !canFly,
        };

        if (behavior === 'hint') {
            npcData.speed = 0;
            npcData.state.hintText = getRandomHint();
        } else {
            setNewNPCTarget(npcData, universeRadius);
        }

        scene.add(npcMesh);
        activeNPCs.push(npcData);
        worldObjectsForCheck.push(npcMesh);
    }
    console.log(`Spawned ${activeNPCs.length} NPCs.`);
    return activeNPCs;
}

// Update all active NPCs
export function updateAllNPCs(deltaTime, worldObjects, playerPosition, universeRadius) {
    activeNPCs.forEach(npc => {
        updateNPC(npc, deltaTime, worldObjects, playerPosition, universeRadius);
    });
}

// Update logic for a single NPC
function updateNPC(npc, deltaTime, worldObjects, playerPosition, universeRadius) {
    const { mesh, behavior, state, velocity, speed, canFly, gravity } = npc;
    const STUCK_THRESHOLD_SQ = 0.001; // Min distance moved SQUARED
    const STUCK_TIME_LIMIT = 3.0;

    // --- Check if Stuck ---
    if (!state.isWaiting && behavior !== 'hint' && deltaTime > 0) { // Only check if supposed to be moving
        // Calculate distance moved squared since last frame check
        const distMovedSq = mesh.position.distanceToSquared(state.lastPosition);

        if (distMovedSq < STUCK_THRESHOLD_SQ * (deltaTime/0.016)) { // Scale threshold by delta time?
            state.stuckTimer += deltaTime;
        } else {
            state.stuckTimer = 0; // Reset timer if moved sufficiently
            state.lastPosition.copy(mesh.position); // Update last known good position
        }

        // If stuck for too long, try finding a new target
        if (state.stuckTimer > STUCK_TIME_LIMIT) {
            console.log(`NPC ${mesh.uuid} appears stuck, finding new target.`);
            setNewNPCTarget(npc, universeRadius);
            state.stuckTimer = 0;
            // Give a small random nudge
            velocity.x += (Math.random() - 0.5) * speed * 0.2;
            velocity.z += (Math.random() - 0.5) * speed * 0.2;
        }
    } else {
         state.stuckTimer = 0; // Don't check if waiting or static
         // Update lastPosition even if waiting, to avoid false stuck trigger when starting again
         if(behavior !== 'hint') state.lastPosition.copy(mesh.position);
    }


    // --- Behavior State Machine ---
    switch (behavior) {
        case 'wanderer':
        case 'wanderer_fly':
            handleWanderBehavior(npc, deltaTime, universeRadius);
            break;
        case 'guard':
            handleWanderBehavior(npc, deltaTime, universeRadius); // Placeholder
            break;
        case 'hint':
            mesh.rotation.y += 0.1 * deltaTime;
            velocity.y += gravity * deltaTime;
            applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects);
            return;
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
    if (mesh.position.distanceToSquared(state.lastPosition) > 0.00001) { // Only update if actually moved
        mesh.userData.boundingBox.setFromObject(mesh);
    }
}


function handleWanderBehavior(npc, deltaTime, universeRadius) {
    const { mesh, state, velocity, speed, canFly } = npc;

    if (state.isWaiting) {
        state.waitTimer -= deltaTime;
        if (state.waitTimer <= 0) {
            state.isWaiting = false;
            setNewNPCTarget(npc, universeRadius);
             state.stuckTimer = 0; // Reset stuck timer
             state.lastPosition.copy(mesh.position); // Update pos before move
        } else {
             velocity.x *= 0.9; // Apply friction
             velocity.z *= 0.9;
            return;
        }
    }

    if (!state.isWaiting) {
        const direction = state.targetPosition.clone().sub(mesh.position);
        const distanceToTargetSq = direction.lengthSq();

        if (distanceToTargetSq < 1.5) {
            state.isWaiting = true;
            state.waitTimer = THREE.MathUtils.randFloat(1.5, 5.0);
        } else {
            direction.normalize();
            const targetVelX = direction.x * speed;
            const targetVelZ = direction.z * speed;
            velocity.x += (targetVelX - velocity.x) * 0.1;
            velocity.z += (targetVelZ - velocity.z) * 0.1;
            if (canFly) {
                const targetVelY = direction.y * speed * 0.5;
                velocity.y += (targetVelY - velocity.y) * 0.05;
            }
        }
    }
}

function applyNPCPhysicsAndCollision(npc, deltaTime, worldObjects) {
    const { mesh, velocity, canFly, state } = npc;
    if (deltaTime <= 0) return;

    const deltaPos = velocity.clone().multiplyScalar(deltaTime);
    if (deltaPos.lengthSq() < 0.00001) return;

    const potentialPos = mesh.position.clone().add(deltaPos);
    let correctedDelta = deltaPos.clone();
    let npcOnGround = false;

    // 1. Ground Collision
    if (!canFly) {
        const npcHeight = mesh.geometry?.parameters?.height || (mesh.geometry?.parameters?.radius * 1.2) || 0.5;
        const npcBottomY = potentialPos.y - npcHeight / 2;
        const groundY = 0; // TODO: findGroundHeight if needed

        if (npcBottomY <= groundY && velocity.y <= 0) {
            const correctionY = groundY - npcBottomY;
            potentialPos.y += correctionY;
            correctedDelta.y += correctionY;
            velocity.y = 0;
            npcOnGround = true;
            npc.onGround = true;
        } else { npc.onGround = false; }
    }

    // 2. Boundary Collision
    const maxDist = Constants.UNIVERSE_RADIUS * 0.95;
    const distSq = potentialPos.x * potentialPos.x + potentialPos.z * potentialPos.z;
    if (distSq > maxDist * maxDist) {
        const outwardDir = new THREE.Vector3(potentialPos.x, 0, potentialPos.z).normalize();
        const pushBack = outwardDir.multiplyScalar((Math.sqrt(distSq) - maxDist) * 1.1);
        potentialPos.sub(pushBack);
        correctedDelta.sub(pushBack);
        const outwardSpeed = velocity.dot(outwardDir);
        if(outwardSpeed > 0) { velocity.sub(outwardDir.multiplyScalar(outwardSpeed)); }
         state.stuckTimer += 0.1;
    }

    // --- 3. NPC vs World Objects (SIMPLIFIED) ---
    // Disable NPC vs NPC collision for performance. Only check scenery/portals.
    const npcColliderFuture = mesh.userData.boundingBox.clone().translate(correctedDelta);
    let collisionDetected = false;
    for (const obj of worldObjects) {
        // Skip self, ground, player, other NPCs, or objects without bbox
        if (obj === mesh || obj.userData.isGround || obj.userData.isPlayer || obj.userData.isNPC || !obj.userData.boundingBox) continue;

        if (npcColliderFuture.intersectsBox(obj.userData.boundingBox)) {
             collisionDetected = true;
             // Simplest response: Stop horizontal movement for this frame
             velocity.x = 0;
             velocity.z = 0;
             correctedDelta.x = 0;
             correctedDelta.z = 0;
             state.stuckTimer += 0.2; // Increase stuck timer more significantly on collision

             // Alternative: Try a small random turn?
             // const turnAngle = (Math.random() - 0.5) * Math.PI / 2; // Turn up to 90 degrees
             // velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), turnAngle);

             break; // Handle one collision per frame for simplicity
        }
    }
    // --- END SIMPLIFIED COLLISION ---

    // Final position update using correctedDelta
    mesh.position.add(correctedDelta);
}


// Set a new random target for a wandering NPC
function setNewNPCTarget(npc, universeRadius) {
    const { mesh, state, canFly } = npc;
    const wanderRadius = universeRadius * (canFly ? 0.9 : 0.8);
    const angle = Math.random() * Math.PI * 2;
    const targetRadius = Math.random() * wanderRadius;
    const targetY = canFly ? THREE.MathUtils.randFloat(1.0, 10.0) : mesh.position.y;

    const potentialTarget = new THREE.Vector3(
         Math.cos(angle) * targetRadius, targetY, Math.sin(angle) * targetRadius );

    const dirAway = potentialTarget.clone().sub(mesh.position);
    if (dirAway.lengthSq() < 9) { // If target is within 3 units, pick further
         const angleAway = Math.atan2(mesh.position.z, mesh.position.x) + Math.PI + (Math.random() - 0.5);
         const radiusAway = wanderRadius * THREE.MathUtils.randFloat(0.7, 1.0);
         potentialTarget.set( Math.cos(angleAway) * radiusAway, targetY, Math.sin(angleAway) * radiusAway );
    }

    state.targetPosition.copy(potentialTarget);
    state.isWaiting = false;
}

function getRandomHint() {
    const hints = [ "A path blocked may hide another.", "Look up, look down, look around.", "Some walls are illusions.", "Green leads onward, Red leads back.", "Even static has patterns." ];
    return hints[Math.floor(Math.random() * hints.length)];
}

// Get the list of active NPC data objects
export function getActiveNPCsData() {
    return activeNPCs;
}
