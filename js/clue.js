import * as THREE from 'three';
import { shuffleArray, placeObjectRandomly, isSpawnAreaClear } from './utils.js';
import * as Constants from './constants.js';

// --- CV Data ---
// Structure: { text: "...", category: "...", isKeyClue: boolean (optional) }
export const masterClueList = [
    // Experience
    { text: "EXP: Freelance (Upwork, Self-employed), Jan 2017 - Present (8+ yrs)", category: "Experience" },
    { text: "FREELANCE SKILL: UI/UX Design", category: "Skills - Design" },
    { text: "FREELANCE SKILL: Document Translation (English-Spanish)", category: "Skills - Language" },
    { text: "FREELANCE SKILL: Data Analysis & Processing", category: "Skills - Data" },
    { text: "FREELANCE SKILL: 3D Character Animation & Creation", category: "Skills - 3D" },
    { text: "TECH SKILL: Front-End Development", category: "Skills - Web Dev", isKeyClue: true },
    { text: "TECH SKILL: JavaScript", category: "Skills - Web Dev" },
    { text: "TECH SKILL: Machine Learning", category: "Skills - AI/ML", isKeyClue: true },
    { text: "TECH SKILL: Data Analysis", category: "Skills - Data" },
    { text: "TECH SKILL: Web Development", category: "Skills - Web Dev" },
    { text: "TECH SKILL: Blender (3D)", category: "Skills - 3D" },
    { text: "TECH SKILL: Search Engine Optimization (SEO)", category: "Skills - Web Dev" },
    { text: "TECH SKILL: Maya (3D)", category: "Skills - 3D" },
    { text: "EXP: UI Programmer, Naama.Online (Internship), Aug 2024 - Nov 2024", category: "Experience" },
    { text: "EXP: Courier Partner, Wolt (Self-employed), 2022 - 2024, Finland", category: "Experience - Other" },
    { text: "EXP: Company Owner, Wellness Salas (Self-employed), 2020 - 2024, Finland", category: "Experience - Other" },
    { text: "EXP: Sales Development Rep, Vaadin, Feb 2023, Finland", category: "Experience - Other" },
    { text: "EXP: Certified Personal Fitness Trainer (Self-employed), 2015 - 2017, Costa Rica", category: "Experience - Other" },
    { text: "EXP: Emergency Technician, Hospital Jerusalem, 2014 - 2015, Costa Rica", category: "Experience - Other" },
    { text: "HOSPITAL SKILL: Healthcare", category: "Skills - Other" },
    { text: "EXP: Accounting Assistant, Hospital Jerusalem, 2013 - 2014, Costa Rica", category: "Experience - Other" },
    { text: "HOSPITAL SKILL: Accounting", category: "Skills - Other" },
    // Education
    { text: "EDU: B.Eng. Information Technology, Metropolia UAS, 2021 - 2024 (Grade: 5)", category: "Education", isKeyClue: true },
    { text: "METROPOLIA SKILL: Google Cloud Platform (GCP)", category: "Skills - Cloud" },
    { text: "METROPOLIA SKILL: Microsoft Azure", category: "Skills - Cloud" },
    { text: "METROPOLIA SKILL: Artificial Intelligence (AI)", category: "Skills - AI/ML" },
    { text: "METROPOLIA SKILL: React.js", category: "Skills - Web Dev" },
    { text: "METROPOLIA SKILL: Information Technology Strategy", category: "Skills - IT" },
    { text: "METROPOLIA SKILL: Python", category: "Skills - Programming", isKeyClue: true },
    { text: "METROPOLIA SKILL: MySQL", category: "Skills - Data" },
    { text: "METROPOLIA SKILL: Information Security Principles", category: "Skills - Security" },
    // Certifications
    { text: "CERT: Building AI Applications with Haystack", category: "Certifications - AI/ML" },
    { text: "CERT: Building and Evaluating Advanced RAG", category: "Certifications - AI/ML" },
    { text: "CERT: ChatGPT Prompt Engineering for Developers", category: "Certifications - AI/ML" },
    { text: "CERT: Fine-tuning Large Language Models", category: "Certifications - AI/ML" },
    { text: "CERT: Generative AI with Large Language Models (Coursera)", category: "Certifications - AI/ML" },
    { text: "CERT: Google Data Analytics Certificate", category: "Certifications - Data", isKeyClue: true },
    { text: "CERT: Data Analytics with R Programming", category: "Certifications - Data" },
    { text: "CERT: Google IT Automation with Python Cert.", category: "Certifications - Programming" },
    { text: "CERT: The Science of Well-Being (Yale)", category: "Certifications - Other" },
    { text: "CERT: Certified Web Developer", category: "Certifications - Web Dev" },
    { text: "CERT: HubSpot Sales Software Certified", category: "Certifications - Sales/Marketing" },
    { text: "CERT: CISSP (Certified Information Systems Security Professional)", category: "Certifications - Security", isKeyClue: true },
    // Volunteering
    { text: "VOLUNTEER: FIFCO (Children) - Healthy eating habits", category: "Volunteering" },
    { text: "VOLUNTEER: FIFCO (Health) - Healthy life habits", category: "Volunteering" },
    { text: "VOLUNTEER: FUNDAMECO (Social Services)", category: "Volunteering" },
    { text: "VOLUNTEER: AIESEC in Finland (Team Lead - Marketing), 2021 - 2022", category: "Volunteering" },
    // Languages
    { text: "LANG: English (Native or Bilingual)", category: "Languages" },
    { text: "LANG: Spanish (Native or Bilingual)", category: "Languages" },
    { text: "LANG: Finnish (Elementary)", category: "Languages" },
    { text: "LANG: German (Elementary)", category: "Languages" },
];

let availableClueIndices = [];
let activeClueObjects = []; // Meshes currently in the scene for this universe

export function initClues() {
    resetAvailableClues();
}

function resetAvailableClues() {
    availableClueIndices = Array.from(masterClueList.keys());
    shuffleArray(availableClueIndices);
    console.log("Clue list reset and shuffled.");
}

export function createClueObjectMesh(clueData) {
    const clueSize = 0.4;
    const clueGeo = new THREE.OctahedronGeometry(clueSize, 0);
    const clueMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: clueData.isKeyClue ? 0xffff00 : 0xffcc44, // Brighter emissive for key clues
        emissiveIntensity: clueData.isKeyClue ? 2.0 : 1.5,
        roughness: 0.3,
        metalness: 0.5,
    });
    const clueMesh = new THREE.Mesh(clueGeo, clueMat);
    clueMesh.castShadow = true;

    // Store clue data directly in userData for easy access on interaction
    clueMesh.userData = {
        ...clueData, // Copy text, category, isKeyClue
        isClue: true,
        boundingBox: new THREE.Box3().setFromObject(clueMesh),
        originalIndex: clueData.originalIndex // Store original index for tracking collected
    };
    return clueMesh;
}

export function spawnClueObjects(scene, count, universeRadius, worldObjectsForCheck) {
    activeClueObjects = []; // Clear previous list for this universe
    if (availableClueIndices.length === 0) {
        resetAvailableClues();
        if (availableClueIndices.length === 0) return []; // Should not happen if master list is not empty
    }

    const numToSpawn = Math.min(count, availableClueIndices.length);
    console.log(`Spawning ${numToSpawn} clues.`);

    for (let i = 0; i < numToSpawn; i++) {
        const clueIndex = availableClueIndices.pop(); // Get next available shuffled index
        const clueData = { ...masterClueList[clueIndex], originalIndex: clueIndex }; // Add original index

        const clueMesh = createClueObjectMesh(clueData);
        const yPos = THREE.MathUtils.randFloat(0.6, 1.8);

        // Place randomly and check for clearance against existing objects
        placeObjectRandomly(
            clueMesh,
            yPos,
            universeRadius * 0.85, // Keep clues slightly away from edge
            worldObjectsForCheck,
            Constants.PLACEMENT_CLEARANCE_RADIUS_MULTIPLIER
        );

        scene.add(clueMesh);
        activeClueObjects.push(clueMesh); // Add to current universe's list
        // World objects list is managed externally, but clue object needs to be added there too
    }
    return activeClueObjects; // Return the list of clue meshes spawned in this universe
}

// Get the list of active clue meshes in the current universe
export function getActiveClueMeshes() {
    return activeClueObjects;
}

// Remove a clue mesh from the active list (called after collection)
export function removeActiveClueMesh(meshToRemove) {
    activeClueObjects = activeClueObjects.filter(mesh => mesh !== meshToRemove);
}

// Get the full master list (e.g., for UI review panel)
export function getMasterClueList() {
    return masterClueList;
}
