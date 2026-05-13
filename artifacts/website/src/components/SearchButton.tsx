import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PlaneTakeoff } from "lucide-react";

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
      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", position: "relative" }}>
        <motion.span
          style={{ display: "block", width: 6, height: 1, borderRadius: 1, background: "rgba(255,255,255,0.5)" }}
          animate={isAnimating ? { opacity: [0, 0.55, 0], x: [0, -5, -10] } : { opacity: 0, x: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
        />
        <motion.span
          style={{ display: "block", width: 4, height: 1, borderRadius: 1, background: "rgba(255,255,255,0.4)" }}
          animate={isAnimating ? { opacity: [0, 0.4, 0], x: [0, -5, -10] } : { opacity: 0, x: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
        />
        <motion.span
          animate={isAnimating ? { x: [0, 14, 24], scale: [1, 1.15, 0.6], opacity: [1, 1, 0] } : { x: 0, scale: 1, opacity: 1 }}
          transition={isAnimating ? { duration: 0.65, ease: "easeOut" } : { duration: 0 }}
          onAnimationComplete={isAnimating ? handleAnimationComplete : undefined}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <PlaneTakeoff className="w-5 h-5" />
        </motion.span>
      </span>
    </button>
  );
}
