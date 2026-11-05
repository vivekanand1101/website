import { buildPlanDecision } from './decision.js';
import { validateRunnerState } from './state.js';
import { JevError, requestJev } from './jev.js';
/** Ask Jev to select a legal plan, directly or through the game-only relay. */
export async function requestRunnerPlan(input, key, signal, fetcher = fetch, relay = false) {
    if (relay) {
        if (!key)
            throw new JevError('Add your Jev API key in Key settings.');
        let response;
        try {
            response = await fetcher(typeof relay === 'string' ? relay : './api/plan', {
                method: 'POST', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer',
                headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(input), signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])])
            });
        }
        catch {
            if (signal?.aborted)
                throw new DOMException('Request cancelled.', 'AbortError');
            throw new JevError('Cannot reach the game host. Check your connection and try again.', true);
        }
        if (response.headers.get('cf-mitigated') === 'challenge')
            throw new JevError('Browser verification expired. Reload this page to continue with Jev.');
        let result;
        try {
            result = await response.json();
        }
        catch {
            throw new JevError('The game host returned an invalid response.');
        }
        if (!response.ok)
            throw new JevError(result.error || 'Jev request failed.', !!result.retryable);
        return result;
    }
    const state = validateRunnerState(input);
    if (!state)
        throw new JevError('Invalid runner state.');
    const decision = buildPlanDecision(state);
    const started = performance.now();
    const data = await requestJev(key, { model: 'jev-latest', state: JSON.stringify(decision.state), questions: { action: { type: 'choice', instructions: decision.instructions, criteria: decision.criteria } } }, signal, fetcher);
    const answer = data?.answers?.action;
    if (answer?.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(decision.criteria, answer.choice))
        throw new JevError('Jev returned an invalid plan.');
    return { plan: decision.criteria[answer.choice], planId: answer.choice, provider: 'jev', latencyMs: Math.round(performance.now() - started) };
}
