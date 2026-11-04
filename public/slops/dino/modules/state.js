const object = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value, min = -100_000, max = 100_000) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
/** Validate and copy only gameplay fields, excluding arbitrary client data from upstream prompts. */
export function validateRunnerState(value) {
    if (!object(value) || !number(value.speedPxPerSecond, 1, 10_000) || !number(value.previousLatencyMs, 0, 60_000))
        return null;
    const dinosaur = value.dinosaur;
    if (!object(dinosaur) || !['x', 'y', 'groundY', 'jumpVelocity'].every(key => number(dinosaur[key])) || !['width', 'height'].every(key => number(dinosaur[key], 1, 1000)) || !['jumping', 'ducking', 'spaceHeld', 'downHeld'].every(key => typeof dinosaur[key] === 'boolean'))
        return null;
    if (['reachedMinHeight', 'speedDrop'].some(key => dinosaur[key] !== undefined && typeof dinosaur[key] !== 'boolean'))
        return null;
    if (value.expectedLatencyMs !== undefined && !number(value.expectedLatencyMs, 0, 60_000))
        return null;
    if (!Array.isArray(value.obstacles) || value.obstacles.length > 3)
        return null;
    const obstacles = [];
    for (const obstacle of value.obstacles) {
        if (!object(obstacle) || typeof obstacle.type !== 'string' || !['CACTUS_SMALL', 'CACTUS_LARGE', 'PTERODACTYL'].includes(String(obstacle.type)) || !['x', 'y', 'distance'].every(key => number(obstacle[key])) || !['width', 'height'].every(key => number(obstacle[key], 1, 1000)))
            return null;
        if (obstacle.id !== undefined && (!Number.isSafeInteger(obstacle.id) || !number(obstacle.id, 0, Number.MAX_SAFE_INTEGER)))
            return null;
        if (obstacle.speedPxPerSecond !== undefined && !number(obstacle.speedPxPerSecond, 1, 10_000))
            return null;
        obstacles.push({ id: obstacle.id, type: obstacle.type, x: obstacle.x, y: obstacle.y, distance: obstacle.distance, width: obstacle.width, height: obstacle.height, speedPxPerSecond: obstacle.speedPxPerSecond });
    }
    let physics;
    if (value.physics !== undefined) {
        if (!object(value.physics) || !number(value.physics.gravity, 0.01, 10) || !number(value.physics.initialJumpVelocity, -100, 0) || !number(value.physics.minJumpHeight, 0, 1000) || !number(value.physics.maxJumpY))
            return null;
        physics = { gravity: value.physics.gravity, initialJumpVelocity: value.physics.initialJumpVelocity, minJumpHeight: value.physics.minJumpHeight, maxJumpY: value.physics.maxJumpY };
    }
    return {
        speedPxPerSecond: value.speedPxPerSecond, previousLatencyMs: value.previousLatencyMs, expectedLatencyMs: value.expectedLatencyMs,
        dinosaur: { x: dinosaur.x, y: dinosaur.y, width: dinosaur.width, height: dinosaur.height, groundY: dinosaur.groundY, jumpVelocity: dinosaur.jumpVelocity, jumping: dinosaur.jumping, ducking: dinosaur.ducking, spaceHeld: dinosaur.spaceHeld, downHeld: dinosaur.downHeld, reachedMinHeight: dinosaur.reachedMinHeight, speedDrop: dinosaur.speedDrop },
        obstacles, physics
    };
}
