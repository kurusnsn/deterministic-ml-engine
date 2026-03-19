import React, { useMemo } from 'react';
import { Chess, PieceSymbol, Color } from 'chess.js';
import Image from 'next/image';

interface CapturedPiecesProps {
    fen: string;
    orientation: 'white' | 'black';
    side: 'top' | 'bottom';
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
};

const STARTING_PIECES: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const CapturedPieces: React.FC<CapturedPiecesProps> = ({ fen, orientation, side }) => {
    const { capturedWhite, capturedBlack, materialDiff } = useMemo(() => {
        let game: Chess;
        try {
            // react-chessboard uses "start" as shorthand; Chess() expects full FEN.
            const resolvedFen = fen === "start" ? START_FEN : fen;
            game = new Chess(resolvedFen);
        } catch {
            game = new Chess(START_FEN);
        }
        const board = game.board();

        const currentPieces: Record<Color, Record<PieceSymbol, number>> = {
            w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
            b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        };

        board.flat().forEach(piece => {
            if (piece) {
                currentPieces[piece.color][piece.type]++;
            }
        });

        const getCaptured = (color: Color) => {
            const captured: PieceSymbol[] = [];
            (Object.keys(STARTING_PIECES[color]) as PieceSymbol[]).forEach(type => {
                const count = STARTING_PIECES[color][type] - currentPieces[color][type];
                for (let i = 0; i < count; i++) {
                    captured.push(type);
                }
            });
            // Sort by value (pawns first, then knights, etc.)
            return captured.sort((a, b) => PIECE_VALUES[a] - PIECE_VALUES[b]);
        };

        const capturedWhite = getCaptured('w');
        const capturedBlack = getCaptured('b');

        // Calculate material difference
        const whiteMaterial = capturedBlack.reduce((acc, p) => acc + PIECE_VALUES[p], 0);
        const blackMaterial = capturedWhite.reduce((acc, p) => acc + PIECE_VALUES[p], 0);
        const materialDiff = whiteMaterial - blackMaterial;

        return { capturedWhite, capturedBlack, materialDiff };
    }, [fen]);

    // Determine which pieces to show based on position and orientation
    // If orientation is white:
    // Top (Black side): Shows captured WHITE pieces (what Black has taken)
    // Bottom (White side): Shows captured BLACK pieces (what White has taken)

    let piecesToShow: PieceSymbol[] = [];
    let colorOfPieces: Color = 'w';
    let showScore = false;
    let score = 0;

    if (orientation === 'white') {
        if (side === 'top') {
            piecesToShow = capturedWhite;
            colorOfPieces = 'w';
            // Black is winning if materialDiff < 0 (more white pieces captured)
            // Score for Black is -materialDiff
            if (materialDiff < 0) {
                showScore = true;
                score = Math.abs(materialDiff);
            }
        } else {
            piecesToShow = capturedBlack;
            colorOfPieces = 'b';
            // White is winning if materialDiff > 0
            if (materialDiff > 0) {
                showScore = true;
                score = materialDiff;
            }
        }
    } else {
        // Orientation Black
        if (side === 'top') {
            // Top is White side -> shows captured BLACK pieces
            piecesToShow = capturedBlack;
            colorOfPieces = 'b';
            if (materialDiff > 0) {
                showScore = true;
                score = materialDiff;
            }
        } else {
            // Bottom is Black side -> shows captured WHITE pieces
            piecesToShow = capturedWhite;
            colorOfPieces = 'w';
            if (materialDiff < 0) {
                showScore = true;
                score = Math.abs(materialDiff);
            }
        }
    }

    if (piecesToShow.length === 0 && !showScore) return <div className="h-6" />;

    return (
        <div className="flex items-center h-6 px-1">
            {piecesToShow.map((piece, idx) => {
                const prevPiece = idx > 0 ? piecesToShow[idx - 1] : null;
                const isSameAsPrev = prevPiece === piece;
                // Tighter overlap for same piece type (stacked look), looser for different types
                const marginClass = idx === 0 ? '' : isSameAsPrev ? '-ml-3' : '-ml-1';

                return (
                    <div
                        key={`${piece}-${idx}`}
                        className={`${marginClass} relative w-5 h-5`}
                        style={{ zIndex: idx }}
                    >
                        <Image
                            src={`/svg/Chess_${piece}${colorOfPieces === 'w' ? 'l' : 'd'}t45.svg`}
                            alt={`${colorOfPieces === 'w' ? 'White' : 'Black'} ${piece}`}
                            fill
                            priority
                            unoptimized
                            className="object-contain"
                        />
                    </div>
                );
            })}
            {showScore && (
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                    +{score}
                </span>
            )}
        </div>
    );
};
