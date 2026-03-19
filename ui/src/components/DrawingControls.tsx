import React from 'react';

interface DrawingControlsProps {
  onClearDrawings: () => void;
}

export const DrawingControls: React.FC<DrawingControlsProps> = ({
  onClearDrawings,
}) => (
  <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm rounded px-2 py-1 shadow-sm">
    <button
      onClick={onClearDrawings}
      className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs transition-colors"
    >
      Clear Drawings
    </button>
  </div>
);
