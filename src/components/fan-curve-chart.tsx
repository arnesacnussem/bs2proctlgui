"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface FanCurveDataPoint {
  id: string;
  temp: number; // 30-100
  level: number; // 1-12
}

export default function FanCurveChart({
  values,
  onChange,
  className,
}: {
  values: FanCurveDataPoint[];
  onChange: (fun: (prev: FanCurveDataPoint[]) => FanCurveDataPoint[]) => void;
  className?: string;
}) {
  const [draggedPoint, setDraggedPoint] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 335;
  const height = 200;
  const padding = { top: 10, right: 24, bottom: 28, left: 24 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scale functions
  const tempToX = (temp: number) => {
    return padding.left + ((temp - 30) / 70) * chartWidth;
  };

  const levelToY = (level: number) => {
    return padding.top + chartHeight - ((level - 1) / 11) * chartHeight;
  };

  const xToTemp = (x: number) => {
    const temp = 30 + ((x - padding.left) / chartWidth) * 70;
    return Math.max(30, Math.min(100, Math.round(temp)));
  };

  const yToLevel = (y: number) => {
    const level = 1 + ((chartHeight - (y - padding.top)) / chartHeight) * 11;
    return Math.max(1, Math.min(12, Math.round(level)));
  };

  const handleMouseDown = (pointId: string) => {
    setDraggedPoint(pointId);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggedPoint || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newTemp = xToTemp(x);
    const newLevel = yToLevel(y);

    onChange((prev) =>
      prev
        .map((p) =>
          p.id === draggedPoint ? { ...p, temp: newTemp, level: newLevel } : p
        )
        .sort((a, b) => a.temp - b.temp)
    );
  };

  const handleMouseUp = () => {
    setDraggedPoint(null);
  };

  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedPoint) return;
    if (values.length >= 12) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if click is within chart area
    if (
      x < padding.left ||
      x > width - padding.right ||
      y < padding.top ||
      y > height - padding.bottom
    ) {
      return;
    }

    const newTemp = xToTemp(x);
    const newLevel = yToLevel(y);

    const newPoint: FanCurveDataPoint = {
      id: Date.now().toString(),
      temp: newTemp,
      level: newLevel,
    };

    onChange((prev) => [...prev, newPoint].sort((a, b) => a.temp - b.temp));
  };

  const handlePointDoubleClick = (pointId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange((prev) => prev.filter((p) => p.id !== pointId));
  };

  // Generate grid lines
  const tempGridLines = Array.from({ length: 8 }, (_, i) => 30 + i * 10);
  const levelGridLines = Array.from({ length: 12 }, (_, i) => i + 1);

  // Generate path for the curve
  const pathData = values
    .map((p, i) => {
      const x = tempToX(p.temp);
      const y = levelToY(p.level);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(" ");

  useEffect(() => {
    const handleGlobalMouseUp = () => setDraggedPoint(null);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={cn("", className)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleChartClick}
      style={{ cursor: draggedPoint ? "grabbing" : "crosshair" }}
    >
      {/* Grid lines - vertical (temperature) */}
      {tempGridLines.map((temp) => (
        <line
          key={`temp-${temp}`}
          x1={tempToX(temp)}
          y1={padding.top}
          x2={tempToX(temp)}
          y2={height - padding.bottom}
          stroke="hsl(var(--border))"
          strokeWidth="1"
          opacity="0.3"
        />
      ))}

      {/* Grid lines - horizontal (level) */}
      {levelGridLines.map((level) => (
        <line
          key={`level-${level}`}
          x1={padding.left}
          y1={levelToY(level)}
          x2={width - padding.right}
          y2={levelToY(level)}
          stroke="hsl(var(--border))"
          strokeWidth="1"
          opacity="0.3"
        />
      ))}

      {/* X-axis */}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="hsl(var(--primary))"
        strokeWidth="3"
      />

      {/* Y-axis */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="hsl(var(--primary))"
        strokeWidth="3"
      />

      {/* X-axis labels */}
      {tempGridLines.map((temp) => (
        <text
          key={`temp-label-${temp}`}
          x={tempToX(temp)}
          y={height - padding.bottom + 25}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          fontSize="12"
        >
          {temp}
        </text>
      ))}

      {/* Y-axis labels */}
      {levelGridLines.map((level) => (
        <text
          key={`level-label-${level}`}
          x={padding.left - 15}
          y={levelToY(level)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="hsl(var(--foreground))"
          fontSize="12"
        >
          {level}
        </text>
      ))}

      {/* Axis titles */}
      {/* <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        fill="hsl(var(--foreground))"
        fontSize="14"
        fontWeight="500"
      >
        Temperature (°C)
      </text> */}
      {/* 
      <text
        x={-height / 2}
        y={20}
        textAnchor="middle"
        fill="hsl(var(--foreground))"
        fontSize="14"
        fontWeight="500"
        transform={`rotate(-90, 20, ${height / 2})`}
      >
        Level
      </text> */}

      {/* Curve line */}
      <path
        d={pathData}
        fill="none"
        stroke="#007bff"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {values.map((point) => (
        <g key={point.id}>
          <circle
            cx={tempToX(point.temp)}
            cy={levelToY(point.level)}
            r="8"
            fill="hsl(var(--chart-1))"
            stroke="hsl(var(--background))"
            strokeWidth="2"
            style={{ cursor: "grab" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleMouseDown(point.id);
            }}
            onDoubleClick={(e) => handlePointDoubleClick(point.id, e)}
          />
          {draggedPoint === point.id && (
            <text
              x={tempToX(point.temp)}
              y={levelToY(point.level) - 15}
              textAnchor="middle"
              fill="hsl(var(--foreground))"
              fontSize="11"
              fontWeight="600"
            >
              {point.temp}°C, L{point.level}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
