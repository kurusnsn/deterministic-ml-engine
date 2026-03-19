"use client";

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface EvaluationPoint {
  moveNumber: number;
  evaluation: number;
  classification?: string;
}

interface EvaluationGraphProps {
  evaluations: EvaluationPoint[];
  currentMoveIndex: number;
  onMoveClick?: (index: number) => void;
  className?: string;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  brilliant: '#1bada6', // Teal
  great: '#2596be',     // Blue
  best: '#96bc4b',      // Green
  excellent: '#96bc4b', // Green (same as best)
  good: '#96af8b',      // Soft Green
  inaccuracy: '#f7c045', // Yellow
  mistake: '#e58f2a',   // Orange
  miss: '#ca3431',      // Red (same as blunder - major error)
  blunder: '#ca3431',   // Red
  missed_win: '#fb923c', // Orange-Red
  book: '#a88865',      // Brown
  forced: '#22d3ee',    // Cyan
};

// Custom dot that matches Chesskit's style (simple solid circle)
const CustomDot = (props: any) => {
  const { cx, cy, payload, index, currentMoveIndex } = props;

  if (cx === undefined || cy === undefined) return null;

  const isCurrent = index === currentMoveIndex;
  const classification = payload.classification;

  // Get color based on classification
  const color = classification
    ? CLASSIFICATION_COLORS[classification] || '#9ca3af'
    : '#9ca3af';

  // Current move styling: larger, white stroke to stand out
  if (isCurrent) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        stroke="#ffffff"
        strokeWidth={2}
        fill={color}
        fillOpacity={1}
        style={{ cursor: 'pointer' }}
      />
    );
  }

  // Standard dot styling matching Chesskit: stroke same as fill, strokeWidth 5 (creates a "glow" effect or larger touch area)
  // We use r={3} and strokeWidth={4} to mimic the look
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      stroke={color}
      strokeWidth={4}
      fill={color}
      fillOpacity={1}
      style={{ cursor: 'pointer' }}
    />
  );
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;
  const evaluation = data.evaluation;
  const evalText = evaluation >= 0 ? `+${evaluation.toFixed(2)}` : evaluation.toFixed(2);
  const classification = data.classification;
  const classificationColor = classification ? CLASSIFICATION_COLORS[classification] : null;

  return (
    <div className="bg-black/90 text-white px-3 py-2 rounded-none text-sm shadow-lg">
      <div className="font-medium">Move {data.moveNumber}</div>
      <div className="text-gray-300">{evalText}</div>
      {classification && (
        <div style={{ color: classificationColor || '#fff' }} className="capitalize font-medium">
          {classification.replace('_', ' ')}
        </div>
      )}
    </div>
  );
};

export default function EvaluationGraph({
  evaluations,
  currentMoveIndex,
  onMoveClick,
  className = ''
}: EvaluationGraphProps) {

  const chartData = useMemo(() => {
    return evaluations.map((point, index) => {
      let val = 10;
      if (point.evaluation > 15) val = 20;
      else if (point.evaluation < -15) val = 0;
      else {
        val = Math.max(-10, Math.min(10, point.evaluation)) + 10;
      }

      return {
        index,
        moveNumber: point.moveNumber,
        evaluation: point.evaluation,
        shiftedValue: val,
        classification: point.classification,
      };
    });
  }, [evaluations]);

  const handleClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0] && onMoveClick) {
      onMoveClick(data.activePayload[0].payload.index);
    }
  };

  const currentMoveData = chartData[currentMoveIndex];
  const currentMoveColor = currentMoveData?.classification
    ? CLASSIFICATION_COLORS[currentMoveData.classification]
    : '#9ca3af';

  const renderDot = (props: any) => {
    const { key, ...rest } = props;
    const { payload, index } = rest;
    const moveClass = payload.classification;
    const isCurrent = index === currentMoveIndex;

    // Always render custom dot for current move
    if (isCurrent) {
      return <CustomDot key={key} {...rest} currentMoveIndex={currentMoveIndex} />;
    }

    if (!moveClass) return null;

    // Only show dots for significant moves: brilliant, great, excellent, blunder, miss, missed_win
    // DO NOT show: good, inaccuracy, book, mistake
    if (['brilliant', 'great', 'excellent', 'blunder', 'miss', 'missed_win'].includes(moveClass)) {
      return <CustomDot key={key} {...rest} currentMoveIndex={currentMoveIndex} />;
    }

    // Otherwise render nothing for clean line
    return null;
  };

  if (evaluations.length === 0) {
    return (
      <div className={`flex items-center justify-center text-gray-400 text-sm ${className}`}>
        No evaluation data
      </div>
    );
  }

  return (
    <div className={`w-full h-full bg-[#262626] rounded-none overflow-hidden ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          onClick={handleClick}
          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          style={{ cursor: 'pointer' }}
        >
          <XAxis dataKey="moveNumber" hide />
          <YAxis domain={[0, 20]} hide />

          <Tooltip
            content={<CustomTooltip />}
            isAnimationActive={false}
            cursor={{
              stroke: "grey",
              strokeWidth: 2,
              strokeOpacity: 0.3,
            }}
          />

          <Area
            type="monotone"
            dataKey="shiftedValue"
            stroke="#ffffff"
            strokeWidth={2}
            fill="#ffffff"
            fillOpacity={1}
            dot={renderDot}
            activeDot={<CustomDot currentMoveIndex={currentMoveIndex} />}
            isAnimationActive={false}
          />

          {/* Reference lines after Area to appear on top */}
          <ReferenceLine
            y={10}
            stroke="grey"
            strokeWidth={2}
            strokeOpacity={0.4}
          />

          {currentMoveIndex >= 0 && (
            <ReferenceLine
              x={chartData[currentMoveIndex]?.moveNumber}
              stroke={currentMoveColor}
              strokeWidth={4}
              strokeOpacity={0.6}
            />
          )}

        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
