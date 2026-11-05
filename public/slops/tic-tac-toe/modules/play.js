import { JevChooser } from './ai.js';
import { legalMoves, minimax, status, validateBoard } from './game.js';
/** Advance the board locally; a configured key always uses Jev or reports its error. */
export async function playBoard(input, starter, key = '', signal, fetcher = fetch) {
    const board = validateBoard(input, starter);
    const current = status(board);
    if (current !== 'in_progress')
        return { board, status: current, nextPlayer: null, provider: null, fallback: false, move: null };
    const chooser = key ? new JevChooser(key, 'jev-latest', fetcher, signal) : undefined;
    const move = chooser ? await chooser.choose(board, legalMoves(board)) : minimax(board);
    const next = [...board];
    next[move] = 'O';
    const nextStatus = status(next);
    return { board: next, status: nextStatus, nextPlayer: nextStatus === 'in_progress' ? 'X' : null, provider: key ? 'jev' : 'minimax', fallback: false, move };
}
