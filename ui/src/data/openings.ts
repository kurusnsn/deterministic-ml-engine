export interface Opening {
    id: string;
    name: string;
    description: string;
    difficulty: "Beginner" | "Intermediate" | "Advanced";
    color: "white" | "black";
    /** Source of the opening data: "eco" for ECO-imported, "gambit" for gambit builder */
    source?: "eco" | "gambit";
}

export const openings: Opening[] = [
    // Gambits (using gambit builder forcing lines)
    {
        id: "stafford",
        name: "Stafford Gambit",
        description: "A tricky and aggressive gambit for Black against the Petrov.",
        difficulty: "Intermediate",
        color: "black",
        source: "gambit",
    },
    // ECO-imported openings (theoretical lines from eco.pgn)
    {
        id: "italian",
        name: "Italian Game",
        description: "A classic open game starting with 1.e4 e5 2.Nf3 Nc6 3.Bc4.",
        difficulty: "Beginner",
        color: "white",
        source: "eco",
    },
    {
        id: "sicilian",
        name: "Sicilian Defense",
        description: "The most popular and best-scoring response to 1.e4.",
        difficulty: "Advanced",
        color: "black",
        source: "eco",
    },
    {
        id: "queens-gambit",
        name: "Queen's Gambit",
        description: "One of the oldest and most solid openings for White.",
        difficulty: "Intermediate",
        color: "white",
        source: "eco",
    },
    {
        id: "london",
        name: "London System",
        description: "A solid system for White where the bishop develops to f4.",
        difficulty: "Beginner",
        color: "white",
        source: "eco",
    },
    {
        id: "caro-kann",
        name: "Caro-Kann Defense",
        description: "A solid defense to 1.e4 characterized by 1...c6.",
        difficulty: "Intermediate",
        color: "black",
        source: "eco",
    },
    {
        id: "french",
        name: "French Defense",
        description: "A solid defense to 1.e4 with 1...e6, leading to closed positions.",
        difficulty: "Intermediate",
        color: "black",
        source: "eco",
    },
    {
        id: "ruy-lopez",
        name: "Ruy Lopez",
        description: "One of the oldest and most analyzed openings, 1.e4 e5 2.Nf3 Nc6 3.Bb5.",
        difficulty: "Intermediate",
        color: "white",
        source: "eco",
    },
    {
        id: "kings-indian",
        name: "King's Indian Defense",
        description: "A hypermodern defense allowing White a large center then counterattacking.",
        difficulty: "Advanced",
        color: "black",
        source: "eco",
    },
    {
        id: "scotch",
        name: "Scotch Game",
        description: "An open game beginning 1.e4 e5 2.Nf3 Nc6 3.d4.",
        difficulty: "Intermediate",
        color: "white",
        source: "eco",
    },
    {
        id: "vienna",
        name: "Vienna Game",
        description: "A flexible opening starting 1.e4 e5 2.Nc3.",
        difficulty: "Intermediate",
        color: "white",
        source: "eco",
    },
];
