"use client";

import { useState, useRef, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, X, Loader2, Camera } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "/api/gateway";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface ProfilePictureUploadProps {
    currentPicture: string | null;
    username: string;
    onUpdate?: (newPicture: string | null) => void;
}

export default function ProfilePictureUpload({
    currentPicture,
    username,
    onUpdate,
}: ProfilePictureUploadProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);

        // Validate file type
        const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
        if (!validTypes.includes(file.type)) {
            setError("Invalid file type. Please upload PNG, JPEG, GIF, or WebP images.");
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            setError("File too large. Maximum size is 5MB.");
            return;
        }

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleUpload = async () => {
        if (!preview) return;

        setUploading(true);
        setError(null);

        try {
            const response = await fetch(`${GATEWAY_URL}/profile/picture`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    profile_picture: preview,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to upload profile picture");
            }

            // Success - update parent component
            if (onUpdate) {
                onUpdate(preview);
            }

            // Close dialog and reset
            setIsOpen(false);
            setPreview(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (err: any) {
            setError(err.message || "Failed to upload profile picture");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!currentPicture) return;

        setUploading(true);
        setError(null);

        try {
            const response = await fetch(`${GATEWAY_URL}/profile/picture`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to delete profile picture");
            }

            // Success - update parent component
            if (onUpdate) {
                onUpdate(null);
            }
        } catch (err: any) {
            setError(err.message || "Failed to delete profile picture");
        } finally {
            setUploading(false);
        }
    };

    const handleCancel = () => {
        setIsOpen(false);
        setPreview(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <>
            {/* Avatar with Upload Button */}
            <div className="relative group">
                <Avatar className="w-20 h-20 sm:w-24 sm:h-24 rounded-full">
                    {currentPicture ? (
                        <AvatarImage src={currentPicture} alt="Profile Picture" />
                    ) : null}
                    <AvatarFallback className="text-xl sm:text-2xl">
                        {username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                {/* Overlay button */}
                <button
                    onClick={() => setIsOpen(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label="Change profile picture"
                >
                    <Camera className="w-6 h-6 text-white" />
                </button>
            </div>

            {/* Upload Dialog */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Profile Picture</DialogTitle>
                        <DialogDescription>
                            Upload a new profile picture or remove your current one.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Preview */}
                        {preview ? (
                            <div className="flex flex-col items-center space-y-2">
                                <Avatar className="w-32 h-32 rounded-full">
                                    <AvatarImage src={preview} alt="Preview" />
                                </Avatar>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setPreview(null);
                                        if (fileInputRef.current) fileInputRef.current.value = "";
                                    }}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Clear
                                </Button>
                            </div>
                        ) : currentPicture ? (
                            <div className="flex flex-col items-center space-y-2">
                                <Avatar className="w-32 h-32 rounded-full">
                                    <AvatarImage src={currentPicture} alt="Current Picture" />
                                </Avatar>
                                <p className="text-sm text-muted-foreground">Current picture</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center space-y-2">
                                <Avatar className="w-32 h-32 rounded-full">
                                    <AvatarFallback className="text-4xl">
                                        {username.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <p className="text-sm text-muted-foreground">No picture set</p>
                            </div>
                        )}

                        {/* File Input */}
                        <div className="flex flex-col items-center space-y-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="picture-upload"
                                aria-labelledby="picture-upload-label"
                            />
                            <label htmlFor="picture-upload" id="picture-upload-label">
                                <span className="sr-only">Choose image</span>
                                <Button variant="outline" asChild>
                                    <span className="cursor-pointer">
                                        <Upload className="w-4 h-4 mr-2" />
                                        Choose Image
                                    </span>
                                </Button>
                            </label>
                            <p className="text-xs text-muted-foreground">
                                PNG, JPEG, GIF, or WebP (max 5MB)
                            </p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        {currentPicture && !preview && (
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={uploading}
                                className="w-full sm:w-auto"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Removing...
                                    </>
                                ) : (
                                    <>
                                        <X className="w-4 h-4 mr-2" />
                                        Remove Picture
                                    </>
                                )}
                            </Button>
                        )}
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                                disabled={uploading}
                                className="flex-1 sm:flex-none"
                            >
                                Cancel
                            </Button>
                            {preview && (
                                <Button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="flex-1 sm:flex-none"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        "Upload"
                                    )}
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
