import { Metadata } from "next";
import { notFound } from "next/navigation";

interface SharePageProps {
    params: Promise<{ slug: string }>;
}

interface ShareClipData {
    slug: string;
    gif_url: string | null;
    thumbnail_url: string | null;
    title: string;
    short_description: string;
    game_meta: {
        opponent: string;
        result: string;
        time_control: string;
        played_at: string;
        opening_name: string;
    };
    primary_move_index: number;
    show_threat_arrows: boolean;
    show_move_classification: boolean;
    frame: {
        fen: string;
        san: string;
        classification: string;
        eval_cp_before: number;
        eval_cp_after: number;
    };
}

// Fetch share clip data (server-side)
async function getShareClip(slug: string): Promise<ShareClipData | null> {
    const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "/api/gateway";

    try {
        const response = await fetch(`${GATEWAY_URL}/api/share/${slug}`, {
            cache: "no-store",
        });

        if (!response.ok) {
            return null;
        }

        return response.json();
    } catch (error) {
        console.error("Error fetching share clip:", error);
        return null;
    }
}

// Generate metadata for social sharing
export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const clip = await getShareClip(resolvedParams.slug);

    if (!clip) {
        return {
            title: "Share Clip Not Found | SprintChess",
        };
    }

    const title = clip.title || "Game Analysis | SprintChess";
    const description = clip.short_description ||
        `Check out this ${clip.frame.classification || ""} ${clip.frame.san} move from my chess game analysis.`;

    const imageUrl = clip.gif_url || clip.thumbnail_url ||
        "https://sprintchess.com/og-image.png";

    return {
        title: `${title} | SprintChess`,
        description,
        openGraph: {
            title: `${title} | SprintChess`,
            description,
            images: [
                {
                    url: imageUrl,
                    width: 1080,
                    height: 1080,
                    alt: title,
                },
            ],
            type: "article",
            siteName: "SprintChess",
        },
        twitter: {
            card: "summary_large_image",
            title: `${title} | SprintChess`,
            description,
            images: [imageUrl],
        },
    };
}

// Format eval for display
function formatEval(cp: number): string {
    const pawns = cp / 100;
    return pawns >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}

// Public share page component
export default async function SharePage({ params }: SharePageProps) {
    const resolvedParams = await params;
    const clip = await getShareClip(resolvedParams.slug);

    if (!clip) {
        notFound();
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://sprintchess.com";
    const deepLink = `${baseUrl}/game-review?share=${resolvedParams.slug}`;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        {clip.title}
                    </h1>
                    {clip.short_description && (
                        <p className="text-slate-400 text-lg">
                            {clip.short_description}
                        </p>
                    )}
                </div>

                {/* Clip Image */}
                <div className="bg-slate-800 rounded-xl overflow-hidden shadow-2xl mb-8">
                    {clip.gif_url ? (
                        <img
                            src={clip.gif_url}
                            alt={clip.title}
                            className="w-full h-auto"
                        />
                    ) : (
                        <div className="aspect-square bg-slate-700 flex items-center justify-center">
                            <div className="text-center text-slate-400">
                                <svg
                                    className="w-16 h-16 mx-auto mb-4 opacity-50"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                                <p>Image rendering in progress...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Move Details Card */}
                <div className="bg-slate-800 rounded-lg p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-white">
                                {clip.frame.san}
                            </span>
                            {clip.frame.classification && (
                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${clip.frame.classification === "brilliant" ? "bg-teal-500 text-white" :
                                        clip.frame.classification === "blunder" ? "bg-red-500 text-white" :
                                            clip.frame.classification === "great" ? "bg-blue-500 text-white" :
                                                clip.frame.classification === "mistake" ? "bg-orange-500 text-white" :
                                                    "bg-slate-600 text-slate-200"
                                    }`}>
                                    {clip.frame.classification}
                                </span>
                            )}
                        </div>
                        <div className="text-slate-400 text-sm">
                            Eval: {formatEval(clip.frame.eval_cp_before)} → {formatEval(clip.frame.eval_cp_after)}
                        </div>
                    </div>

                    {/* Game Meta */}
                    {clip.game_meta && (
                        <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                            {clip.game_meta.opponent && (
                                <span>vs {clip.game_meta.opponent}</span>
                            )}
                            {clip.game_meta.time_control && (
                                <span>{clip.game_meta.time_control}</span>
                            )}
                            {clip.game_meta.result && (
                                <span>Result: {clip.game_meta.result}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* CTA */}
                <div className="text-center">
                    <a
                        href={deepLink}
                        className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                        Open in SprintChess
                    </a>

                    <p className="mt-4 text-slate-500 text-sm">
                        Analyze your games for free • Get personalized insights
                    </p>
                </div>

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-slate-700 text-center text-slate-500 text-sm">
                    <p>
                        Created with{" "}
                        <a href={baseUrl} className="text-blue-400 hover:underline">
                            SprintChess
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
