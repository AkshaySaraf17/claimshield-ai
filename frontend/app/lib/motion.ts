import type { Transition } from "framer-motion";

export const spring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 26,
};

export const tapScale = { scale: 0.97 };

export const focusNudge = { scale: 1.005 };
