export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export class JevError extends Error {
    retryable;
    constructor(message, retryable = false) {
        super(message);
        this.retryable = retryable;
        this.name = 'JevError';
    }
}
/** Call Jev directly; no proxy, cookies, credential logging, or key in URLs. */
export async function requestJev(apiKey, payload, signal, fetcher = fetch) {
    if (!apiKey)
        throw new JevError('Add your Jev API key in Key settings.');
    let response;
    try {
        response = await fetcher(JEV_ENDPOINT, {
            method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer',
            signal: AbortSignal.any([AbortSignal.timeout(4000), ...(signal ? [signal] : [])]),
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    }
    catch (error) {
        if (signal?.aborted)
            throw new DOMException('Request cancelled.', 'AbortError');
        if (error instanceof Error && error.name === 'TimeoutError')
            throw new JevError('Jev timed out. Try again.', true);
        throw new JevError('Cannot reach Jev from this website. Check your connection; Jev may need to allow this website’s origin (CORS).');
    }
    // Workers supports manual redirects, not redirect:'error'. Never follow them with a key.
    if (response.status >= 300 && response.status < 400)
        throw new JevError('Jev returned an unexpected redirect. Try again later.');
    if (response.status === 401 || response.status === 403)
        throw new JevError('Jev rejected this key. Update it in Key settings.');
    if (response.status === 429)
        throw new JevError('Jev rate limit reached. Wait before trying again.');
    if (!response.ok)
        throw new JevError('Jev is unavailable. Please try again later.', response.status >= 500);
    try {
        return await response.json();
    }
    catch {
        throw new JevError('Jev returned an invalid response.');
    }
}
