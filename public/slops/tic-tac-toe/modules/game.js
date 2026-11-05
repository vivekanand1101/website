const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const legalMoves = (board) => board.flatMap((cell, i) => cell === null ? [i] : []);
export function status(board) {
    for (const [a, b, c] of lines) {
        if (board[a] !== null && board[a] === board[b] && board[a] === board[c])
            return board[a] === 'X' ? 'X_wins' : 'O_wins';
    }
    return board.includes(null) ? 'in_progress' : 'draw';
}
const key = (board) => board.map(cell => cell ?? '-').join('');
// Enumerate legal play once, stopping immediately when someone wins.
const reachable = { X: new Set(), O: new Set() };
function visit(board, player, starter) {
    const id = key(board);
    if (reachable[starter].has(id))
        return;
    reachable[starter].add(id);
    if (status(board) !== 'in_progress')
        return;
    for (const move of legalMoves(board)) {
        const next = [...board];
        next[move] = player;
        visit(next, player === 'X' ? 'O' : 'X', starter);
    }
}
visit(Array(9).fill(null), 'X', 'X');
visit(Array(9).fill(null), 'O', 'O');
export class ValidationError extends Error {
}
export function validateBoard(input, startingPlayer = 'X') {
    if (startingPlayer !== 'X' && startingPlayer !== 'O')
        throw new ValidationError('startingPlayer must be X or O.');
    if (!Array.isArray(input) || input.length !== 9 || !Array.from(input).every(cell => cell === null || cell === 'X' || cell === 'O')) {
        throw new ValidationError('board must contain exactly 9 cells: "X", "O", or null (row-major order).');
    }
    const board = input;
    if (!reachable[startingPlayer].has(key(board)))
        throw new ValidationError('board is unreachable for the selected startingPlayer: turns alternate and play stops at a win.');
    if (status(board) === 'in_progress' && board.filter(c => c === 'X').length !== board.filter(c => c === 'O').length + (startingPlayer === 'X' ? 1 : 0)) {
        throw new ValidationError('It must be O\'s turn; submit the board after the human plays X.');
    }
    return [...board];
}
function score(board, player, depth) {
    const result = status(board);
    if (result === 'O_wins')
        return 10 - depth;
    if (result === 'X_wins')
        return depth - 10;
    if (result === 'draw')
        return 0;
    const values = legalMoves(board).map(move => {
        const next = [...board];
        next[move] = player;
        return score(next, player === 'O' ? 'X' : 'O', depth + 1);
    });
    return player === 'O' ? Math.max(...values) : Math.min(...values);
}
export function minimax(board) {
    if (status(board) !== 'in_progress')
        throw new Error('No move on a terminal board.');
    let bestMove = -1, bestScore = -Infinity;
    // Ascending index breaks equally good choices deterministically.
    for (const move of legalMoves(board)) {
        const next = [...board];
        next[move] = 'O';
        const value = score(next, 'X', 1);
        if (value > bestScore) {
            bestScore = value;
            bestMove = move;
        }
    }
    return bestMove;
}
