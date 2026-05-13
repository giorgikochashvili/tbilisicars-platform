import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";

interface SearchButtonProps {
  onValidate: () => boolean;
  onSearch: () => void;
  className?: string;
}

export default function SearchButton({ onValidate, onSearch, className }: SearchButtonProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const reducedMotion = useReducedMotion();
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, []);

  function handleClick() {
    if (isAnimating) return;

    if (!onValidate()) return;

    if (reducedMotion) {
      onSearch();
      return;
    }

    setIsAnimating(true);
    fallbackRef.current = setTimeout(() => {
      setIsAnimating(false);
      onSearch();
    }, 1500);
  }

  function handleAnimationComplete() {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    setIsAnimating(false);
    onSearch();
  }

  return (
    <button
      onClick={handleClick}
      disabled={isAnimating}
      style={{ pointerEvents: isAnimating ? "none" : undefined }}
      className={
        className ??
        "w-full bg-primary hover:bg-accent text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base shadow-md flex items-center justify-center gap-2"
      }
    >
      Search Vehicles
      <motion.span
        animate={
          isAnimating
            ? { x: [0, 8, 16], scale: [1, 1.2, 0.8], opacity: [1, 1, 0] }
            : { x: 0, scale: 1, opacity: 1 }
        }
        transition={
          isAnimating
            ? { duration: 0.6, ease: "easeOut" }
            : { duration: 0 }
        }
        onAnimationComplete={isAnimating ? handleAnimationComplete : undefined}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        <ChevronRight className="w-5 h-5" />
      </motion.span>
    </button>
  );
}
