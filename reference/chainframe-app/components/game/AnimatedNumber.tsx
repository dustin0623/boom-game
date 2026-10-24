import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Animated counter that eases toward the incoming value. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string | undefined;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number>(0);
  const from = useRef(value);
  const start = useRef(0);

  useEffect(() => {
    from.current = display;
    start.current = performance.now();
    const duration = 450;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start.current) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(from.current + (value - from.current) * eased);
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <motion.span className={className} key={format(value)} initial={false}>
      {format(display)}
    </motion.span>
  );
}
