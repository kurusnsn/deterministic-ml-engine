
export const MOCK_TOURNAMENTS = [
    {
        id: "t1",
        name: "Spring Championship 2025",
        description: "The annual spring championship featuring top grandmasters from around the world.",
        status: "Live",
        rounds: 9,
        startDate: "2025-04-01",
        endDate: "2025-04-10",
        location: "New York, USA",
        timeControl: "90+30",
    },
    {
        id: "t2",
        name: "Candidates Tournament 2025",
        description: "Who will challenge the World Champion? The ultimate test of strategy and endurance.",
        status: "Upcoming",
        rounds: 14,
        startDate: "2025-06-15",
        endDate: "2025-07-05",
        location: "Toronto, Canada",
        timeControl: "120+60",
    },
    {
        id: "t3",
        name: "Blitz Bonanza",
        description: "Fast-paced action for the speed demons of the chess world.",
        status: "Finished",
        rounds: 11,
        startDate: "2025-03-10",
        endDate: "2025-03-11",
        location: "Online",
        timeControl: "3+2",
    },
];

export const MOCK_PLAYERS = [
    { id: "p1", name: "Magnus Carlsen", title: "GM", rating: 2830, country: "NO", score: 4.5 },
    { id: "p2", name: "Hikaru Nakamura", title: "GM", rating: 2789, country: "US", score: 4.0 },
    { id: "p3", name: "Fabiano Caruana", title: "GM", rating: 2804, country: "US", score: 3.5 },
    { id: "p4", name: "Ding Liren", title: "GM", rating: 2762, country: "CN", score: 3.0 },
    { id: "p5", name: "Alireza Firouzja", title: "GM", rating: 2760, country: "FR", score: 2.5 },
    { id: "p6", name: "Ian Nepomniachtchi", title: "GM", rating: 2758, country: "RU", score: 2.0 },
    { id: "p7", name: "Gukesh D", title: "GM", rating: 2743, country: "IN", score: 1.5 },
    { id: "p8", name: "Praggnanandhaa R", title: "GM", rating: 2747, country: "IN", score: 1.0 },
];

export const MOCK_STANDINGS = MOCK_PLAYERS.map((p, i) => ({
    rank: i + 1,
    ...p,
    tiebreak: (Math.random() * 10).toFixed(2),
}));

export const MOCK_GAMES = [
    {
        id: "g1",
        round: 1,
        white: MOCK_PLAYERS[0],
        black: MOCK_PLAYERS[1],
        result: "1/2-1/2",
        status: "Finished",
        moves: 45,
        currentMove: "Qd2",
        whiteTime: "0:12:08",
        blackTime: "0:08:44",
        fen: "r2q1rk1/ppp2ppp/2n2n2/2bp4/3P4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 0 8",
    },
    {
        id: "g2",
        round: 1,
        white: MOCK_PLAYERS[2],
        black: MOCK_PLAYERS[3],
        result: "1-0",
        status: "Finished",
        moves: 32,
        currentMove: "Nc3",
        whiteTime: "0:21:54",
        blackTime: "0:16:12",
        fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/4P3/2NP1N2/PPP1PPPP/R1BQKB1R w KQkq - 2 4",
    },
    {
        id: "g3",
        round: 5,
        white: MOCK_PLAYERS[4],
        black: MOCK_PLAYERS[0],
        result: "*",
        status: "Live",
        moves: 24,
        whiteTime: "1:04:32",
        blackTime: "0:58:15",
        currentMove: "e4",
        fen: "r1bq1rk1/ppp2ppp/2n2n2/3pp3/3PP3/2P1BN2/PP1N1PPP/R2QKB1R w KQ - 4 6",
    },
];

export const MOCK_ROUNDS = Array.from({ length: 9 }, (_, i) => ({
    round: i + 1,
    games: MOCK_GAMES, // Reusing games for simplicity in mock
}));

export const MOCK_MOVES = [
    { num: 1, white: "e4", black: "e5" },
    { num: 2, white: "Nf3", black: "Nc6" },
    { num: 3, white: "Bb5", black: "a6" },
    { num: 4, white: "Ba4", black: "Nf6" },
    { num: 5, white: "O-O", black: "Be7" },
    { num: 6, white: "Re1", black: "b5" },
    { num: 7, white: "Bb3", black: "d6" },
    { num: 8, white: "c3", black: "O-O" },
    { num: 9, white: "h3", black: "Nb8" },
    { num: 10, white: "d4", black: "Nbd7" },
    { num: 11, white: "c4", black: "c6" },
    { num: 12, white: "cxb5", black: "axb5" },
    { num: 13, white: "Nc3", black: "Bb7" },
    { num: 14, white: "Bg5", black: "h6" },
    { num: 15, white: "Bh4", black: "Re8" },
];

export const MOCK_CHAT = [
    { user: "ChessFan123", message: "What a move by Magnus!", time: "10:32" },
    { user: "GrandmasterFlash", message: "I think Black is slightly better here.", time: "10:33" },
    { user: "RookLifter", message: "Is this still theory?", time: "10:34" },
    { user: "PawnStorm", message: "White needs to be careful about the d5 square.", time: "10:35" },
];

export const MOCK_COMMENTARY = {
    summary: "White has a slight space advantage in the center, but Black's position is solid. The bishop pair for White could prove dangerous in the long run.",
    explanation: "15...Re8 prepares to meet Bg3 with Bf8, reinforcing the kingside.",
    alternatives: ["15...b4 was also possible, challenging the knight immediately.", "15...c5!? complicates the center."],
    critical: "The next few moves will determine if White can maintain the initiative or if Black equalizes completely.",
};
