import { JevChooser } from './ai.js';
import { legalMoves, status, validateBoard } from './game.js';
/** Every AI move is chosen by Jev using the player-supplied key. */
export async function playBoard(input, starter, key = '', signal, fetcher = fetch) {
    const board = validateBoard(input, starter);
    const current = status(board);
    if (current !== 'in_progress')
        return { board, status: current, nextPlayer: null, provider: null, fallback: false, move: null };
    const chooser = new JevChooser(key, 'jev-latest', fetcher, signal);
    const move = await chooser.choose(board, legalMoves(board));
    const next = [...board];
    next[move] = 'O';
    const nextStatus = status(next);
    return { board: next, status: nextStatus, nextPlayer: nextStatus === 'in_progress' ? 'X' : null, provider: 'jev', fallback: false, move };
}
