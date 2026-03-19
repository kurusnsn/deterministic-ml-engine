/**
 * AddOpeningModal - Modal for adding openings to a repertoire bucket.
 * 
 * Two tabs:
 * - "From Repertoires": Select openings from other user repertoires
 * - "From Catalog": Search and add openings from the ECO catalog
 */

"use client";

import { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, FolderOpen, BookOpen, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSavedRepertoires } from "@/hooks/useRepertoires";
import {
    useOpeningCatalogSearch,
    useOpeningsForImport,
    useAddOpeningsFromRepertoire,
    useAddOpeningsFromCatalog,
    CatalogOpening,
} from "@/hooks/useAddOpenings";

interface RepertoireTarget {
    id: string;
    name: string;
    color: "white" | "black" | "both";
}

interface AddOpeningModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetRepertoire: RepertoireTarget;
}

export default function AddOpeningModal({
    isOpen,
    onClose,
    targetRepertoire,
}: AddOpeningModalProps) {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("repertoires");

    // State for Tab A: From Repertoires
    const [selectedSourceId, setSelectedSourceId] = useState<string>("");
    const [selectedEcoCodes, setSelectedEcoCodes] = useState<Set<string>>(new Set());

    // State for Tab B: From Catalog
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selectedCatalogOpenings, setSelectedCatalogOpenings] = useState<
        Map<string, { eco: string; name: string }>
    >(new Map());

    // Debounce search query
    useState(() => {
        const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    });

    // Fetch user repertoires (exclude target)
    const { data: repertoires = [], isLoading: repertoiresLoading } = useSavedRepertoires();
    const filteredRepertoires = useMemo(
        () => repertoires.filter((r: any) => r.id !== targetRepertoire.id),
        [repertoires, targetRepertoire.id]
    );

    // Fetch openings from selected source repertoire
    const { data: sourceOpeningsData, isLoading: sourceOpeningsLoading } = useOpeningsForImport(
        selectedSourceId || null
    );
    const sourceOpenings = sourceOpeningsData?.openings || [];

    // Search catalog openings
    const { data: catalogData, isLoading: catalogLoading, isFetching: catalogFetching } =
        useOpeningCatalogSearch(debouncedQuery, targetRepertoire.color !== "both" ? targetRepertoire.color : undefined);
    const catalogOpenings = catalogData?.openings || [];

    // Mutations
    const addFromRepertoireMutation = useAddOpeningsFromRepertoire();
    const addFromCatalogMutation = useAddOpeningsFromCatalog();

    // Handle search input change with debounce
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        // Debounce the actual query
        setTimeout(() => setDebouncedQuery(value), 300);
    };

    // Toggle ECO code selection for Tab A
    const toggleEcoCode = (ecoCode: string) => {
        setSelectedEcoCodes((prev) => {
            const next = new Set(prev);
            if (next.has(ecoCode)) {
                next.delete(ecoCode);
            } else {
                next.add(ecoCode);
            }
            return next;
        });
    };

    // Toggle catalog opening selection for Tab B
    const toggleCatalogOpening = (opening: CatalogOpening) => {
        setSelectedCatalogOpenings((prev) => {
            const next = new Map(prev);
            if (next.has(opening.eco)) {
                next.delete(opening.eco);
            } else {
                next.set(opening.eco, { eco: opening.eco, name: opening.name });
            }
            return next;
        });
    };

    // Handle adding from repertoire
    const handleAddFromRepertoire = async () => {
        if (!selectedSourceId || selectedEcoCodes.size === 0) return;

        try {
            const result = await addFromRepertoireMutation.mutateAsync({
                targetRepertoireId: targetRepertoire.id,
                sourceRepertoireId: selectedSourceId,
                ecoCodes: Array.from(selectedEcoCodes),
            });

            toast({
                title: "Openings added",
                description: `Added ${result.added} opening(s)${result.duplicates > 0 ? `, ${result.duplicates} already existed` : ""}`,
            });

            // Reset and close
            setSelectedEcoCodes(new Set());
            setSelectedSourceId("");
            onClose();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to add openings. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Handle adding from catalog
    const handleAddFromCatalog = async () => {
        if (selectedCatalogOpenings.size === 0) return;

        // Determine color based on target repertoire
        const color = targetRepertoire.color === "both" ? "white" : targetRepertoire.color;

        const openings = Array.from(selectedCatalogOpenings.values()).map((op) => ({
            eco: op.eco,
            name: op.name,
            color,
        }));

        try {
            const result = await addFromCatalogMutation.mutateAsync({
                targetRepertoireId: targetRepertoire.id,
                openings,
            });

            toast({
                title: "Openings added",
                description: `Added ${result.added} opening(s)${result.duplicates > 0 ? `, ${result.duplicates} already existed` : ""}`,
            });

            // Reset and close
            setSelectedCatalogOpenings(new Map());
            setSearchQuery("");
            setDebouncedQuery("");
            onClose();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to add openings. Please try again.",
                variant: "destructive",
            });
        }
    };

    // Reset state when modal closes
    const handleClose = () => {
        setSelectedEcoCodes(new Set());
        setSelectedSourceId("");
        setSelectedCatalogOpenings(new Map());
        setSearchQuery("");
        setDebouncedQuery("");
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Add Openings to "{targetRepertoire.name}"
                    </DialogTitle>
                    <DialogDescription>
                        Import openings from your other repertoires or search the opening catalog.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="repertoires" className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4" />
                            From Repertoires
                        </TabsTrigger>
                        <TabsTrigger value="catalog" className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            From Catalog
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab A: From Repertoires */}
                    <TabsContent value="repertoires" className="flex-1 flex flex-col overflow-hidden mt-4">
                        <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                            {/* Source repertoire dropdown */}
                            <div>
                                <Label htmlFor="source-repertoire">Source Repertoire</Label>
                                <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                                    <SelectTrigger id="source-repertoire" className="mt-1">
                                        <SelectValue placeholder="Select a repertoire to import from" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {filteredRepertoires.map((rep: any) => (
                                            <SelectItem key={rep.id} value={rep.id}>
                                                {rep.name}
                                                <Badge variant="outline" className="ml-2 text-xs">
                                                    {rep.color}
                                                </Badge>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Openings list */}
                            <div className="flex-1 overflow-auto border rounded-md p-2">
                                {sourceOpeningsLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : !selectedSourceId ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                        <FolderOpen className="w-8 h-8 mb-2" />
                                        <p className="text-sm">Select a repertoire to see available openings</p>
                                    </div>
                                ) : sourceOpenings.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                        <p className="text-sm">No openings in this repertoire</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {sourceOpenings.map((opening) => {
                                            const checkboxId = `eco-${opening.eco_code}-${opening.color}`;
                                            return (
                                                <Label
                                                    key={opening.eco_code + opening.color}
                                                    htmlFor={checkboxId}
                                                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                                                >
                                                    <Checkbox
                                                        id={checkboxId}
                                                        checked={selectedEcoCodes.has(opening.eco_code)}
                                                        onCheckedChange={() => toggleEcoCode(opening.eco_code)}
                                                    />
                                                    <div className="flex-1">
                                                        <span className="font-mono text-sm font-semibold">
                                                            {opening.eco_code}
                                                        </span>
                                                        <Badge variant="outline" className="ml-2 text-xs">
                                                            {opening.color}
                                                        </Badge>
                                                        {opening.note && (
                                                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                                {opening.note}
                                                            </p>
                                                        )}
                                                    </div>
                                                </Label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Add button */}
                            <Button
                                onClick={handleAddFromRepertoire}
                                disabled={selectedEcoCodes.size === 0 || addFromRepertoireMutation.isPending}
                                className="w-full"
                            >
                                {addFromRepertoireMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4 mr-2" />
                                )}
                                Add {selectedEcoCodes.size > 0 ? `${selectedEcoCodes.size} ` : ""}Opening(s)
                            </Button>
                        </div>
                    </TabsContent>

                    {/* Tab B: From Catalog */}
                    <TabsContent value="catalog" className="flex-1 flex flex-col overflow-hidden mt-4">
                        <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                            {/* Search input */}
                            <div className="relative">
                                <Label htmlFor="opening-search" id="opening-search-label" className="sr-only">
                                    Search openings
                                </Label>
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="opening-search"
                                    aria-labelledby="opening-search-label"
                                    placeholder="Search openings (e.g., Sicilian, B90, Najdorf)"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            {/* Results list */}
                            <div className="flex-1 overflow-auto border rounded-md p-2">
                                {catalogLoading || catalogFetching ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : !debouncedQuery ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                        <Search className="w-8 h-8 mb-2" />
                                        <p className="text-sm">Search for openings by name or ECO code</p>
                                    </div>
                                ) : catalogOpenings.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                        <p className="text-sm">No openings found for "{debouncedQuery}"</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {catalogOpenings.map((opening) => {
                                            const checkboxId = `catalog-${opening.eco}`;
                                            return (
                                                <Label
                                                    key={opening.eco}
                                                    htmlFor={checkboxId}
                                                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                                                >
                                                    <Checkbox
                                                        id={checkboxId}
                                                        checked={selectedCatalogOpenings.has(opening.eco)}
                                                        onCheckedChange={() => toggleCatalogOpening(opening)}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-sm font-semibold">
                                                                {opening.eco}
                                                            </span>
                                                            {selectedCatalogOpenings.has(opening.eco) && (
                                                                <Check className="w-4 h-4 text-green-500" />
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-muted-foreground truncate">
                                                            {opening.name}
                                                        </p>
                                                    </div>
                                                </Label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Selected count and add button */}
                            <div className="flex items-center justify-between">
                                {selectedCatalogOpenings.size > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        {selectedCatalogOpenings.size} selected
                                    </p>
                                )}
                                <Button
                                    onClick={handleAddFromCatalog}
                                    disabled={selectedCatalogOpenings.size === 0 || addFromCatalogMutation.isPending}
                                    className="ml-auto"
                                >
                                    {addFromCatalogMutation.isPending ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4 mr-2" />
                                    )}
                                    Add {selectedCatalogOpenings.size > 0 ? `${selectedCatalogOpenings.size} ` : ""}Opening(s)
                                </Button>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
