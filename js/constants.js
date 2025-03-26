// Player
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_RADIUS = 0.4;
export const PLAYER_BASE_SPEED = 5.0;
export const JUMP_VELOCITY = 8.0;
export const GRAVITY = -20.0;

// Universe
export const UNIVERSE_RADIUS = 30;
export const MAIN_UNIVERSE_RADIUS = 15;

// Interaction
export const PORTAL_INTERACTION_DISTANCE = 3.0;
export const CLUE_INTERACTION_DISTANCE = 2.5;
export const CLUE_DISPLAY_TIMEOUT = 5000;

// Controls
export const defaultControlMap = { KeyW: 'forward', KeyS: 'backward', KeyA: 'left', KeyD: 'right' };
export const controlActions = ['forward', 'backward', 'left', 'right'];

// Add more constants as needed (e.g., asset paths)
export const ASSETS_PATH = './assets/'; // Base path for assets