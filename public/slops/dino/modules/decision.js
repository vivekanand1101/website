// Reuse latency projections without constructing an obsolete action decision.
function projectState(state) {
    const delay = Math.min(1500, Math.max(80, state.expectedLatencyMs ?? state.previousLatencyMs));
    const horizon = Math.min(1200, Math.max(600, delay * 2));
    return {
        ...state, expectedLatencyMs: Math.round(delay), estimatedNextDecisionMs: Math.round(delay), forecastHorizonMs: horizon,
        obstacles: state.obstacles.map((o) => {
            const speed = o.speedPxPerSecond || state.speedPxPerSecond;
            return { ...o, predictedGapAtActionPx: Math.round(o.distance - speed * delay / 1000), contactAfterActionMs: Math.round(o.distance / speed * 1000 - delay), fullyPassedAfterActionMs: Math.round((o.distance + o.width + state.dinosaur.width) / speed * 1000 - delay) };
        })
    };
}
// Lightweight advisory projection. Never executes actions or substitutes for Jev.
function forecastJump(state, delay, horizon) {
    const t = { ...state.dinosaur };
    const physics = state.physics || {};
    const gravity = physics.gravity ?? .6, initial = physics.initialJumpVelocity ?? -10;
    let applied = false, collision = null, landedAt = null;
    const step = 1000 / 60;
    for (let ms = 0; ms <= delay + horizon; ms += step) {
        if (!applied && ms >= delay) {
            applied = true;
            t.ducking = false;
            t.downHeld = false;
            if (t.spaceHeld && t.reachedMinHeight && t.jumpVelocity < -5)
                t.jumpVelocity = -5;
            if (!t.jumping) {
                t.jumping = true;
                t.jumpVelocity = initial - state.speedPxPerSecond / 600;
                t.reachedMinHeight = false;
                t.speedDrop = false;
            }
            t.spaceHeld = true;
        }
        if (t.jumping) {
            t.y += Math.round(t.jumpVelocity * (t.speedDrop ? 3 : 1));
            t.jumpVelocity += gravity;
            if (t.y < t.groundY - (physics.minJumpHeight ?? 30) || t.speedDrop)
                t.reachedMinHeight = true;
            if ((t.y < (physics.maxJumpY ?? 30) || t.speedDrop) && t.reachedMinHeight && t.jumpVelocity < -5)
                t.jumpVelocity = -5;
            if (t.y > t.groundY) {
                t.y = t.groundY;
                t.jumping = false;
                t.jumpVelocity = 0;
                t.ducking = false;
                t.speedDrop = false;
                if (applied && landedAt === null)
                    landedAt = Math.round(ms - delay);
            }
        }
        const height = t.ducking ? 25 : t.height, y = t.ducking ? t.groundY + t.height - 25 : t.y;
        for (const o of state.obstacles) {
            const x = o.x - (o.speedPxPerSecond || state.speedPxPerSecond) * ms / 1000;
            if (t.x + 8 < x + o.width - 4 && t.x + t.width - 8 > x + 4 && y + 6 < o.y + o.height - 4 && y + height - 5 > o.y + 4) {
                collision = Math.round(ms - delay);
                break;
            }
        }
        if (collision !== null)
            break;
    }
    return { approximateCollisionAfterActionMs: collision, approximateLandingAfterActionMs: landedAt, horizonMs: Math.round(horizon) };
}
export const PLAN_INSTRUCTIONS = `Choose the safest short keyboard PLAN for Chrome's dinosaur runner. The game continues while you decide.
Plans contain timed key events relative to the observation timestamp. Jump events also specify a leadMs window before obstacle contact; the local controller tracks the same obstacle and adjusts execution to that chosen window as measured speed changes. The local controller executes your chosen plan; it does not choose a different plan.
Use expectedLatencyMs, contact times, obstacle height and spacing, and the current jump state. Prefer clearing all visible obstacles over reacting to only the first.
A cactus and a LOW bird (y=100) require jumping. A MIDDLE bird (y=75) requires ducking. A HIGH bird (y=50) can pass above a grounded dinosaur. Bird y is its sprite top; consider detailed body boxes rather than treating all birds alike. Avoid landing on an obstacle and avoid starting a second jump before the first can land.
Each jump plan includes release-and-press Space events followed by releases. Timing variants jump earlier or later around estimated clearance windows. Events already in the past may make a plan unusable.
Prefer earlier timing for tall obstacles, but avoid landing before a wide obstacle has passed. For tightly spaced obstacles, assess whether a single long jump can clear the cluster. The long-hold plan attempts that; it is not guaranteed safe.
For a dinosaur currently airborne, do not force descent onto an obstacle. The keep-current-keys plan preserves the current jump while waiting for a new observation.
If no obstacle intersects the dinosaur's path, prefer running or releasing unnecessary keys. Choose one supplied plan. Do not invent timings or pause the game.`;
export function buildPlanDecision(state) {
    const enriched = projectState(state);
    const delay = enriched.expectedLatencyMs;
    const obstacles = enriched.obstacles.filter((o) => o.distance + o.width + state.dinosaur.width > 0);
    const bird = obstacles[0];
    if (bird?.type === 'PTERODACTYL') {
        const ids = typeof bird.id === 'number' ? [bird.id] : [];
        const birdPlans = {};
        if (bird.y <= 50) {
            birdPlans.pass_high = { description: 'High bird: its detailed collision boxes are above the standing dinosaur. Preserve current keys and pass underneath.', obstacleIds: ids, events: [] };
        }
        else if (bird.y < 95) {
            for (const lead of [180, 260])
                birdPlans['duck_' + lead] = { description: 'Mid-height bird: duck on the ground until its trailing edge has passed. Do not jump into it.', obstacleIds: ids, events: [{ atMs: delay + 40, action: 'duck', obstacleId: bird.id, leadMs: lead, untilPassed: true }] };
        }
        else {
            for (const lead of [180, 210])
                birdPlans['jump_low_' + lead] = { description: 'Low bird: ducking collides with its body. Jump over it, then release Space.', obstacleIds: ids, events: [{ atMs: delay + 40, action: 'tap_space', obstacleId: bird.id, leadMs: lead }, { atMs: delay + 320, action: 'release_space' }] };
        }
        return { instructions: PLAN_INSTRUCTIONS, state: { ...enriched, birdResponse: bird.y <= 50 ? 'pass underneath' : bird.y < 95 ? 'duck' : 'jump', planHorizonMs: 2800 }, criteria: birdPlans };
    }
    const plans = {
        run: { description: 'Release both keys and run without jumping.', events: [{ atMs: delay + 40, action: 'release_all' }] },
        keep: { description: 'Keep the current keys unchanged; preserve an ongoing jump.', events: [] },
        duck: { description: 'Duck for a bird, then release after its predicted passage.', events: [{ atMs: delay + 40, action: 'duck' }, { atMs: Math.max(delay + 300, Math.min(2200, (obstacles[0]?.fullyPassedAfterActionMs || 500) + delay + 70)), action: 'release_all' }] }
    };
    for (const [name, offset, hold] of [['early', -30, 280], ['balanced', 0, 280], ['late', 30, 280], ['long_hold', -40, 460]]) {
        const events = [];
        let lastJump = -Infinity;
        for (const o of obstacles) {
            if (o.y + o.height < state.dinosaur.groundY + 5)
                continue;
            const contact = o.distance / (o.speedPxPerSecond || state.speedPxPerSecond) * 1000;
            if (contact > 2300)
                continue;
            const speed = o.speedPxPerSecond || state.speedPxPerSecond;
            const lead = Math.min(o.height >= 50 ? 190 : 230, (o.height >= 50 ? 420 : 470) - (o.width + state.dinosaur.width) / speed * 1000 - 30);
            const at = Math.round(Math.max(delay + 40, contact - Math.max(110, lead) + offset));
            // One jump may cover a nearby cluster; do not schedule physically impossible repeats.
            if (at - lastJump < 480)
                continue;
            events.push({ atMs: at, action: 'tap_space', obstacleId: o.id, leadMs: Math.max(110, lead) - offset }, { atMs: at + hold, action: 'release_space' });
            lastJump = at;
        }
        if (events.length)
            plans[name] = { obstacleIds: events.filter(e => e.action === 'tap_space').map(e => e.obstacleId).filter((id) => typeof id === 'number'), description: `${name}: first-jump advisory collision forecast ${JSON.stringify(forecastJump(state, events[0]?.atMs ?? delay, 900))}. This first-jump forecast assumes a held key and does not model subsequent releases. Estimated jumps for visible obstacle spacing. Holds Space ${hold} ms per jump. Approximate timing, not a safety guarantee.`, events: events.sort((a, b) => a.atMs - b.atMs) };
    }
    const cactus = obstacles.some((o) => o.type.startsWith('CACTUS'));
    if (cactus && Object.keys(plans).length > 3) {
        delete plans.run;
        delete plans.keep;
        delete plans.duck;
        const safe = Object.keys(plans).filter(name => plans[name].description.includes('approximateCollisionAfterActionMs\":null'));
        if (safe.length)
            for (const name of Object.keys(plans))
                if (!safe.includes(name))
                    delete plans[name];
    }
    return { instructions: PLAN_INSTRUCTIONS, state: { ...enriched, planHorizonMs: 2800 }, criteria: plans };
}
