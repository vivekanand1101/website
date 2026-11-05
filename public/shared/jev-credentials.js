const STORAGE_KEY = 'jev-game-key-v1';
/** Cache a user-provided key locally and abort requests when credentials change. */
export function createKeyStore(session, persistent) {
    const read = (storage) => { try {
        return storage?.getItem(STORAGE_KEY)?.trim() || '';
    }
    catch {
        return '';
    } };
    let key = read(session) || read(persistent);
    let remembered = Boolean(key && read(persistent) === key);
    let controller = new AbortController();
    const cancel = () => { controller.abort(); controller = new AbortController(); };
    const remove = () => {
        let success = true;
        for (const storage of [session, persistent]) {
            try {
                storage?.removeItem(STORAGE_KEY);
            }
            catch {
                success = false;
            }
        }
        return success;
    };
    return {
        get key() { return key; }, get remembered() { return remembered; }, get signal() { return controller.signal; },
        cancel,
        save(value, remember) {
            const next = value.trim();
            if (!next || next.length > 1024 || /[\s\x00-\x1f\x7f]/.test(next))
                throw new Error('Enter a valid API key without spaces.');
            cancel();
            const removed = remove();
            key = next;
            remembered = remember;
            try {
                const target = remember ? persistent : session;
                if (!target)
                    return false;
                target.setItem(STORAGE_KEY, key);
                return removed;
            }
            catch {
                return false;
            }
        },
        clear() { cancel(); key = ''; remembered = false; return remove(); }
    };
}
