"use client";

import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  max?: number;
}

export function StarRating({ value, onChange, max = 5 }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const handleClick = (rating: number) => {
    onChange(rating);
  };

  const handleMouseEnter = (rating: number) => {
    setHoverRating(rating);
  };

  const handleMouseLeave = () => {
    setHoverRating(0);
  };

  const displayRating = hoverRating || value;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const isFilled = displayRating >= starValue;
        const isHalfFilled =
          displayRating >= starValue - 0.5 && displayRating < starValue;

        return (
          <div
            key={i}
            className="relative cursor-pointer"
            onMouseLeave={handleMouseLeave}
          >
            {/* Left half - for 0.5 ratings */}
            <div
              className="absolute left-0 top-0 w-1/2 h-full z-10"
              onClick={() => handleClick(starValue - 0.5)}
              onMouseEnter={() => handleMouseEnter(starValue - 0.5)}
            />
            {/* Right half - for full ratings */}
            <div
              className="absolute right-0 top-0 w-1/2 h-full z-10"
              onClick={() => handleClick(starValue)}
              onMouseEnter={() => handleMouseEnter(starValue)}
            />
            <Star
              className={`size-8 transition-colors ${
                isFilled
                  ? "fill-yellow-500 text-yellow-500"
                  : isHalfFilled
                    ? "fill-yellow-500/50 text-yellow-500"
                    : "text-gray-300"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
