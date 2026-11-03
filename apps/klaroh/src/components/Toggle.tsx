'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface ToggleProps {
  isOn: boolean;
  onToggle: (newState: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  isOn,
  onToggle,
  disabled = false,
  ariaLabel = 'Toggle',
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = () => {
    if (!disabled) {
      onToggle(!isOn);
    }
  };

  const handleMouseDown = () => setIsPressed(true);
  const handleMouseUp = () => setIsPressed(false);
  const handleTouchStart = () => setIsPressed(true);
  const handleTouchEnd = () => setIsPressed(false);

  return (
    <motion.button
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      disabled={disabled}
      className={clsx(
        "relative flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-300",
        isOn ? "bg-primary justify-end" : "bg-surface-container-lowest justify-start"
      )}
      style={{
        opacity: disabled ? 0.5 : 1,
        // Inactive state border (subtle) to make the white background pop against white surfaces
        boxShadow: !isOn ? 'inset 0 0 0 1px var(--color-outline-variant)' : 'none',
      }}
    >
      <motion.div
        layout
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
        }}
        animate={{
          width: isPressed ? 24 : 20,
        }}
        className={clsx(
          "h-5 rounded-full shadow-sm",
          isOn ? "bg-surface-container-lowest" : "bg-outline-variant"
        )}
      />
    </motion.button>
  );
};

export default Toggle;
