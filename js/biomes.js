```javascript
import * as THREE from 'three';
import * as Constants from './constants.js';

// Biome definitions structure
export const BIOMES = {
    // Not a spawnable biome, just defaults if needed
    DEFAULT: {
        name: "Generic Space",
        bgColorRange: [0.1, 0.5],
        fogColorFormula: (bg) => bg.clone().multiplyScalar(1.1),
        groundColorRange: [0.3, 0.8],
        ambientSound: 'ambient_random_default.mp3',
        texturePaths: {},
        sceneryPrefabs: ['rock_medium', 'rock_small'],
        physics: { gravityMultiplier: 1.0, friction: Constants.DEFAULT_FRICTION, playerSpeedMultiplier: 1.0 },
        controlRandomChance: Constants.CONTROL_RANDOM_CHANCE,
        possibleHazards: [],
        npcSpawnRules: { types: ['wanderer'], maxCount: 4, speedMultiplier: 1.0 },
        miniObjectiveConfig: { possibleTypes: ['collect_shards'], shardCount: 3 },
    },
    CRYSTAL_CAVES: {
        name: "Crystal Caves",
        bgColorRange: [0.1, 0.3], // Darker blues/purples
        fogColorFormula: (bg) => bg.clone().lerp(new THREE.Color(0x8888ff), 0.2),
        groundColorRange: [0.3, 0.5], // Greys/purples
        ambientSound: 'ambient_crystal.mp3',
        texturePaths: { ground: 'cave_floor.png' }, // Relative to TEXTURE_PATH
        sceneryPrefabs: ['crystal_large', 'crystal_cluster', 'rock_medium', 'glowing_rock'],
        physics: { gravityMultiplier: 0.9, friction: 0.96, playerSpeedMultiplier: 0.95 },
        controlRandomChance: 0.2, // Less likely here
        possibleHazards: [],
        npcSpawnRules: { types: ['wanderer', 'hint'], maxCount: 3, speedMultiplier: 0.9 },
        miniObjectiveConfig: { possibleTypes: ['collect_shards', 'reach_beacon'], shardCount: 4 },
    },
    VOLCANIC: {
        name: "Volcanic Zone",
        bgColorRange: [0.05, 0.2], // Dark reds/oranges/blacks
        fogColorFormula: (bg) => bg.clone().lerp(new THREE.Color(0xff4400), 0.4),
        groundColorRange: [0.1, 0.4], // Dark greys/reds
        ambientSound: 'ambient_volcanic.mp3',
        texturePaths: { ground: 'volcanic_ground.jpg' },
        sceneryPrefabs: ['rock_sharp', 'lava_pool_hazard', 'obsidian_shard', 'rock_large'],
        physics: { gravityMultiplier: 1.1, friction: Constants.DEFAULT_FRICTION, playerSpeedMultiplier: 1.0 },
        controlRandomChance: 0.6,
        possibleHazards: ['lava_pool_hazard'], // Hazard prefab name
        npcSpawnRules: { types: ['wanderer', 'guard'], maxCount: 2, speedMultiplier: 1.1 },
        miniObjectiveConfig: { possibleTypes: ['collect_shards'], shardCount: 3 },
    },
    FLOATING_ISLANDS: {
        name: "Floating Islands",
        bgColorRange: [0.4, 0.7], // Brighter sky blues/cyans
        fogColorFormula: (bg) => bg.clone().lerp(new THREE.Color(0xffffff), 0.1),
        groundColorRange: [0.5, 0.8], // Greens/browns
        ambientSound: 'ambient_windy.mp3',
        texturePaths: { ground: 'grass_moss.png' },
        sceneryPrefabs: ['floating_rock', 'ancient_pillar', 'vine_swing_point'], // Need custom logic for platform generation
        isPlatformBased: true, // Special flag for generation logic
        physics: { gravityMultiplier: 0.7, friction: Constants.DEFAULT_FRICTION, playerSpeedMultiplier: 1.1 },
        controlRandomChance: 0.4,
        possibleHazards: ['fall_death'], // Implied by lack of ground
        npcSpawnRules: { types: ['wanderer_fly'], maxCount: 3, speedMultiplier: 1.0 }, // Flying NPCs
        miniObjectiveConfig: { possibleTypes: ['reach_beacon'], beaconHeight: 15 },
    },
    TECHNO_GRID: {
        name: "Techno-Grid",
        bgColorRange: [0.0, 0.1], // Very dark
        fogColorFormula: (bg) => new THREE.Color(0x001122),
        groundColorRange: [0.05, 0.15], // Dark greys
        ambientSound: 'ambient_techno.mp3',
        texturePaths: { ground: 'grid_lines.png' }, // Emissive grid texture?
        sceneryPrefabs: ['data_column', 'server_rack', 'force_field_barrier'], // Barriers might be hazards or require interaction
        useGridFloor: true, // Special flag for generation
        physics: { gravityMultiplier: 1.0, friction: 1.0, playerSpeedMultiplier: 1.2 }, // Faster?
        controlRandomChance: 0.7,
        possibleHazards: ['force_field_barrier'],
        npcSpawnRules: { types: ['guard', 'hint'], maxCount: 4, speedMultiplier: 1.2 },
        miniObjectiveConfig: { possibleTypes: ['activate_terminals'], terminalCount: 3 },
    }
    // Add more biomes...
};

// Function to get a random biome key (excluding DEFAULT)
export function getRandomBiomeKey() {
    const keys = Object.keys(BIOMES).filter(key => key !== 'DEFAULT');
    if (keys.length === 0) return 'DEFAULT'; // Fallback
    return keys[Math.floor(Math.random() * keys.length)];
}
```
