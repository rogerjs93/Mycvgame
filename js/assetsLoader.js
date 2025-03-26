```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { FontLoader } from 'three/addons/loaders/FontLoader.js'; // If loading fonts for 3D text
import { showLoading } from './ui.js'; // Assuming ui.js handles the loading indicator
import * as Constants from './constants.js';

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const audioLoader = new THREE.AudioLoader(); // Requires listener attached to camera
// const fontLoader = new FontLoader();

const loadedAssets = {
    textures: {},
    models: {},
    sounds: {},
    fonts: {}
};

// List of assets to preload - adjust paths and types as needed
const assetsToLoad = [
    // Textures
    { type: 'texture', name: 'tardis_floor', path: Constants.TEXTURE_PATH + 'tardis_floor.jpg' },
    { type: 'texture', name: 'cave_floor', path: Constants.TEXTURE_PATH + 'cave_floor.png' },
    { type: 'texture', name: 'volcanic_ground', path: Constants.TEXTURE_PATH + 'volcanic_ground.jpg' },
    { type: 'texture', name: 'grid_lines', path: Constants.TEXTURE_PATH + 'grid_lines.png' }, // Example
    { type: 'texture', name: 'grass_moss', path: Constants.TEXTURE_PATH + 'grass_moss.png' }, // Example

    // Models (use simple placeholders if no models yet)
    // { type: 'model', name: 'console', path: Constants.MODEL_PATH + 'console.glb' },
    // { type: 'model', name: 'crystal_large', path: Constants.MODEL_PATH + 'crystal_large.glb' },

    // Sounds (will be loaded as AudioBuffers)
    { type: 'sound', name: 'teleport_random', path: Constants.SOUND_PATH + 'teleport_random.wav' },
    { type: 'sound', name: 'teleport_main', path: Constants.SOUND_PATH + 'teleport_main.wav' },
    { type: 'sound', name: 'collect_clue', path: Constants.SOUND_PATH + 'collect_clue.wav' },
    { type: 'sound', name: 'jump', path: Constants.SOUND_PATH + 'jump.wav' },
    { type: 'sound', name: 'land', path: Constants.SOUND_PATH + 'land.wav' },
    { type: 'sound', name: 'ambient_main', path: Constants.SOUND_PATH + 'ambient_main.mp3' },
    { type: 'sound', name: 'ambient_crystal', path: Constants.SOUND_PATH + 'ambient_crystal.mp3' },
    { type: 'sound', name: 'ambient_volcanic', path: Constants.SOUND_PATH + 'ambient_volcanic.mp3' },
    // ... other ambient sounds ...
];

export async function preloadAllAssets() {
    showLoading(true);
    console.log("Starting asset preloading...");

    const promises = assetsToLoad.map(assetInfo => {
        switch (assetInfo.type) {
            case 'texture':
                return textureLoader.loadAsync(assetInfo.path).then(texture => {
                    // Apply texture settings if needed (wrapping, encoding)
                    texture.encoding = THREE.sRGBEncoding; // Correct color space
                    if(assetInfo.name.includes('floor') || assetInfo.name.includes('ground')) {
                         texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                         // texture.repeat.set(4, 4); // Example repeat
                    }
                    loadedAssets.textures[assetInfo.name] = texture;
                    console.log(`Loaded texture: ${assetInfo.name}`);
                }).catch(err => console.error(`Failed to load texture ${assetInfo.name}:`, err));
            case 'model':
                 return gltfLoader.loadAsync(assetInfo.path).then(gltf => {
                    loadedAssets.models[assetInfo.name] = gltf; // Store the whole GLTF result (scene, animations etc)
                    console.log(`Loaded model: ${assetInfo.name}`);
                }).catch(err => console.error(`Failed to load model ${assetInfo.name}:`, err));
            case 'sound':
                 return audioLoader.loadAsync(assetInfo.path).then(buffer => {
                    loadedAssets.sounds[assetInfo.name] = buffer; // Store the AudioBuffer
                    console.log(`Loaded sound: ${assetInfo.name}`);
                }).catch(err => console.error(`Failed to load sound ${assetInfo.name}:`, err));
            // case 'font':
            //     return fontLoader.loadAsync(assetInfo.path).then(font => {
            //         loadedAssets.fonts[assetInfo.name] = font;
            //         console.log(`Loaded font: ${assetInfo.name}`);
            //     }).catch(err => console.error(`Failed to load font ${assetInfo.name}:`, err));
            default:
                console.warn(`Unknown asset type: ${assetInfo.type}`);
                return Promise.resolve(); // Resolve immediately for unknown types
        }
    });

    try {
        await Promise.all(promises);
        console.log("All assets preloaded successfully.");
    } catch (error) {
        console.error("Error during asset preloading:", error);
        // Handle failed loading - maybe show an error message
    } finally {
        showLoading(false);
    }
}

// Function to get a loaded asset
export function getAsset(type, name) {
    if (loadedAssets[type] && loadedAssets[type][name]) {
        return loadedAssets[type][name];
    } else {
        console.warn(`Asset not found: type=${type}, name=${name}`);
        return null;
    }
}

// Specific getters for convenience
export function getTexture(name) { return getAsset('textures', name); }
export function getModel(name) { return getAsset('models', name); }
export function getSoundBuffer(name) { return getAsset('sounds', name); }
// export function getFont(name) { return getAsset('fonts', name); }
```
