"use client"

import { Star } from "lucide-react"
import { useState } from "react"

interface RatingStarsProps {
  rating?: number
  interactive?: boolean
  onRatingChange?: (rating: number) => void
  size?: "sm" | "md" | "lg"
}

export function RatingStars({ rating = 0, interactive = false, onRatingChange, size = "md" }: RatingStarsProps) {
  const [hoverRating, setHoverRating] = useState(0)
  const [currentRating, setCurrentRating] = useState(rating)

  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }

  const handleClick = (value: number) => {
    if (interactive) {
      setCurrentRating(value)
      onRatingChange?.(value)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = interactive ? star <= (hoverRating || currentRating) : star <= rating

        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => handleClick(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
          >
            <Star
              className={`${sizeClasses[size]} ${
                filled ? "fill-accent text-accent" : "fill-none text-muted-foreground"
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
