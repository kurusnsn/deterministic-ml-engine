export interface Line {
    id: string;
    name: string;
    moves: string[]; // SAN moves
    description?: string;
}

export interface OpeningLines {
    [openingId: string]: {
        lines: Line[];
    };
}

export const openingLines: OpeningLines = {
    italian: {
        lines: [
            {
                id: "giuoco-piano",
                name: "Giuoco Piano",
                moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
                description: "The 'Quiet Game', a solid and popular choice.",
            },
            {
                id: "evans-gambit",
                name: "Evans Gambit",
                moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "b4"],
                description: "An aggressive gambit sacrificing a pawn for rapid development.",
            },
            {
                id: "two-knights",
                name: "Two Knights Defense",
                moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
                description: "A counter-attacking response by Black.",
            },
            {
                id: "fried-liver",
                name: "Fried Liver Attack",
                moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5", "Nxf7"],
                description: "A wild and tactical attack by White.",
            },
        ],
    },
    sicilian: {
        lines: [
            {
                id: "najdorf",
                name: "Najdorf Variation",
                moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
                description: "The 'Cadillac' of chess openings.",
            },
            {
                id: "dragon",
                name: "Dragon Variation",
                moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"],
                description: "A sharp and double-edged system.",
            },
            {
                id: "closed",
                name: "Closed Sicilian",
                moves: ["e4", "c5", "Nc3"],
                description: "A more positional approach for White.",
            },
        ],
    },
    stafford: {
        lines: [
            {
                id: "main-line",
                name: "Stafford Gambit Accepted",
                moves: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nc6", "Nxc6", "dxc6"],
                description: "Black sacrifices a pawn for open lines and tactical tricks.",
            },
            {
                id: "oh-no-my-queen",
                name: "Trap Line",
                moves: ["e4", "e5", "Nf3", "Nf6", "Nxe5", "Nc6", "Nxc6", "dxc6", "d3", "Bc5", "Bg5", "Nxe4", "Bxd8", "Bxf2+", "Ke2", "Bg4#"],
                description: "The famous 'Oh no, my Queen!' trap.",
            },
        ],
    },
    "queens-gambit": {
        lines: [
            {
                id: "qgd",
                name: "Declined (QGD)",
                moves: ["d4", "d5", "c4", "e6"],
                description: "Solid and reliable defense for Black.",
            },
            {
                id: "qga",
                name: "Accepted (QGA)",
                moves: ["d4", "d5", "c4", "dxc4"],
                description: "Black takes the pawn but usually gives it back.",
            },
            {
                id: "slav",
                name: "Slav Defense",
                moves: ["d4", "d5", "c4", "c6"],
                description: "A very solid structure for Black.",
            },
        ],
    },
    london: {
        lines: [
            {
                id: "main-london",
                name: "Main Line",
                moves: ["d4", "d5", "Bf4", "Nf6", "e3", "c5", "c3"],
                description: "The standard London System setup.",
            },
            {
                id: "jobava",
                name: "Jobava London",
                moves: ["d4", "d5", "Nc3", "Nf6", "Bf4"],
                description: "A more aggressive and flexible version.",
            },
        ],
    },
};
