import OpeningsBrowser from "@/components/OpeningsBrowser";

export default function OpeningsPage() {
    return (
        <div className="container mx-auto py-10 px-4 md:px-6 max-w-7xl">
            <div className="mb-10 space-y-4">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
                    Openings Explorer
                </h1>

                <p className="text-muted-foreground text-xl max-w-2xl leading-relaxed">
                    Browse all major chess systems, master forced gambit lines, and explore theoretical seeds.
                </p>
            </div>

            <OpeningsBrowser />
        </div>
    );
}
