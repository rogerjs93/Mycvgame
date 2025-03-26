// constants.js or biomes.js
export const BIOMES = {
    DEFAULT: { /* Default random parameters */ },
    CRYSTAL_CAVES: {
        name: "Crystal Caves",
        bgColorRange: [0.1, 0.3], // Darker blues/purples
        fogColorFormula: (bg) => bg.clone().multiplyScalar(1.1),
        groundColorRange: [0.3, 0.5], // Greys/purples
        ambientSound: 'ambient_crystal.mp3',
        sceneryPrefabs: ['crystal_large', 'crystal_cluster', 'glowing_rock'],
        texturePaths: { ground: 'textures/cave_floor.png' },
        physics: { gravityMultiplier: 1.0, friction: 0.95 },
        // controlRandomChance: 0.3, // Chance controls are random here
        possibleHazards: [],
        npcSpawnRules: { types: ['wanderer'], maxCount: 4 },
    },
    VOLCANIC: {
        name: "Volcanic Zone",
        bgColorRange: [0.05, 0.2], // Dark reds/oranges/blacks
        fogColorFormula: (bg) => bg.clone().lerp(new THREE.Color(0xff4400), 0.3),
        groundColorRange: [0.1, 0.4], // Dark greys/reds
        ambientSound: 'ambient_volcanic.mp3',
        sceneryPrefabs: ['rock_sharp', 'lava_pool_hazard', 'obsidian_shard'],
        texturePaths: { ground: 'textures/volcanic_ground.jpg' },
        physics: { gravityMultiplier: 1.1, friction: 1.0 },
        possibleHazards: ['lava'],
        npcSpawnRules: { types: ['wanderer', 'guard'], maxCount: 3 },
    },
    // Add more biomes: Floating Islands (low gravity), Techno-Grid, Jungle...
};
