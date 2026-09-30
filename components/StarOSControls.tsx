'use client';

import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

/* =========================================================================
   1. StarOS Spring Physics Presets (Matching the video's fluid, elastic feel)
   ========================================================================= */
export const starosSpring = {
  type: 'spring',
  stiffness: 420,
  damping: 28,
  mass: 0.8,
} as const;

export const starosBouncySpring = {
  type: 'spring',
  stiffness: 500,
  damping: 26,
  mass: 0.7,
} as const;

export const starosSmoothSpring = {
  type: 'spring',
  stiffness: 340,
  damping: 30,
} as const;

/* =========================================================================
   2. StarOS Liquid Glass Toggle Switch (Replicating the video's bouncy toggle)
   ========================================================================= */
interface StarOSToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  activeColor?: 'emerald' | 'white' | 'blue' | 'amber';
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function StarOSToggle({
  id,
  checked,
  onChange,
  disabled = false,
  activeColor = 'emerald',
  size = 'md',
  ariaLabel = 'Toggle switch',
}: StarOSToggleProps) {
  const isSm = size === 'sm';

  const activeBgClass = {
    emerald: 'bg-emerald-500/90 shadow-[0_0_20px_rgba(16,185,129,0.5)] border-emerald-400/60',
    white: 'bg-white/95 shadow-[0_0_20px_rgba(255,255,255,0.6)] border-white',
    blue: 'bg-blue-500/90 shadow-[0_0_20px_rgba(59,130,246,0.5)] border-blue-400/60',
    amber: 'bg-amber-500/90 shadow-[0_0_20px_rgba(245,158,11,0.5)] border-amber-400/60',
  }[activeColor];

  const thumbColor = {
    emerald: checked ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]' : 'bg-white/80',
    white: checked ? 'bg-neutral-900 shadow-[0_2px_8px_rgba(0,0,0,0.35)]' : 'bg-white/80',
    blue: checked ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]' : 'bg-white/80',
    amber: checked ? 'bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]' : 'bg-white/80',
  }[activeColor];

  return (
    <motion.button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      whileTap={{ scale: disabled ? 1 : 0.92 }}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-out border focus:outline-none select-none backdrop-blur-xl',
        isSm ? 'h-6 w-11' : 'h-7 w-12 sm:h-8 sm:w-14',
        checked
          ? activeBgClass
          : 'bg-white/[0.10] border-white/20 hover:bg-white/[0.16] hover:border-white/30',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <motion.span
        layout
        transition={starosBouncySpring}
        className={cn(
          'pointer-events-none block rounded-full transition-transform',
          isSm ? 'h-5 w-5' : 'h-6 w-6 sm:h-7 sm:w-7',
          thumbColor,
          checked ? 'ml-auto' : 'mr-auto'
        )}
      />
    </motion.button>
  );
}

/* =========================================================================
   3. StarOS Liquid Frosted Button / Pill (Elastic bouncy tap reaction)
   ========================================================================= */
interface StarOSPillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  variant?: 'glass' | 'active-white' | 'active-emerald' | 'active-blue' | 'active-amber' | 'active-red' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function StarOSPillButton({
  active = false,
  variant = 'glass',
  size = 'md',
  className,
  children,
  ...props
}: StarOSPillButtonProps) {
  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-full',
    md: 'px-3.5 py-2 text-xs sm:text-sm gap-2 rounded-full',
    lg: 'px-5 py-2.5 text-sm font-medium gap-2.5 rounded-full',
  }[size];

  const variantClasses = {
    glass: active
      ? 'bg-white/[0.22] text-white border-white/40 shadow-[0_4px_20px_rgba(255,255,255,0.15)] font-semibold'
      : 'bg-white/[0.08] hover:bg-white/[0.15] text-neutral-200 hover:text-white border-white/[0.16] hover:border-white/[0.30] shadow-[0_4px_16px_rgba(0,0,0,0.25)]',
    'active-white': active
      ? 'bg-white text-neutral-950 font-bold shadow-[0_0_25px_rgba(255,255,255,0.5)] border-white'
      : 'bg-white/[0.08] hover:bg-white/[0.15] text-neutral-200 hover:text-white border-white/[0.16]',
    'active-emerald': active
      ? 'bg-emerald-500/90 text-neutral-950 font-bold shadow-[0_0_25px_rgba(16,185,129,0.5)] border-emerald-400'
      : 'bg-white/[0.08] hover:bg-emerald-500/15 text-neutral-200 hover:text-emerald-300 border-white/[0.16]',
    'active-blue': active
      ? 'bg-blue-500/90 text-white font-bold shadow-[0_0_25px_rgba(59,130,246,0.5)] border-blue-400'
      : 'bg-white/[0.08] hover:bg-blue-500/15 text-neutral-200 hover:text-blue-300 border-white/[0.16]',
    'active-amber': active
      ? 'bg-amber-500/90 text-neutral-950 font-bold shadow-[0_0_25px_rgba(245,158,11,0.5)] border-amber-400'
      : 'bg-white/[0.08] hover:bg-amber-500/15 text-neutral-200 hover:text-amber-300 border-white/[0.16]',
    'active-red': active
      ? 'bg-rose-500/90 text-white font-bold shadow-[0_0_25px_rgba(244,63,94,0.5)] border-rose-400'
      : 'bg-white/[0.08] hover:bg-rose-500/15 text-neutral-200 hover:text-rose-300 border-white/[0.16]',
    ghost: 'bg-transparent hover:bg-white/[0.10] text-neutral-300 hover:text-white border-transparent',
  }[variant];

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.94 }}
      transition={starosSpring}
      className={cn(
        'relative inline-flex items-center justify-center font-medium cursor-pointer border backdrop-blur-2xl transition-all duration-200 select-none overflow-hidden',
        sizeClasses,
        variantClasses,
        className
      )}
      {...(props as any)}
    >
      {/* Specular Top Reflection */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      {children}
    </motion.button>
  );
}

/* =========================================================================
   4. StarOS Control Center Selector Panel (Exact match to Wi-Fi card in video)
   ========================================================================= */
export interface StarOSSelectorOption<T extends string | number> {
  id: T;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface StarOSSelectorPanelProps<T extends string | number> {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  options: StarOSSelectorOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
  toggleChecked?: boolean;
  onToggleChange?: (checked: boolean) => void;
  toggleLabel?: string;
  className?: string;
}

export function StarOSSelectorPanel<T extends string | number>({
  id,
  title,
  subtitle,
  icon,
  options,
  selectedId,
  onSelect,
  toggleChecked,
  onToggleChange,
  className,
}: StarOSSelectorPanelProps<T>) {
  return (
    <div
      id={id}
      className={cn(
        'relative rounded-3xl p-4 sm:p-5 border border-white/[0.18] bg-white/[0.08] backdrop-blur-3xl shadow-[inset_0_1px_1.5px_0_rgba(255,255,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] overflow-hidden space-y-3.5',
        className
      )}
    >
      {/* Top Header Row with Optional Toggle */}
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <div className="w-8 h-8 rounded-2xl bg-white/[0.12] border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold text-white tracking-wide truncate">
              {title}
            </h4>
            {subtitle && (
              <p className="text-[11px] text-neutral-300/80 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {onToggleChange && toggleChecked !== undefined && (
          <StarOSToggle
            checked={toggleChecked}
            onChange={onToggleChange}
            activeColor="emerald"
            size="sm"
          />
        )}
      </div>

      {/* Selector Options List with StarOS Spring Feedback */}
      <div className="grid gap-2">
        {options.map((opt) => {
          const isSelected = opt.id === selectedId;

          return (
            <motion.button
              key={String(opt.id)}
              type="button"
              onClick={() => onSelect(opt.id)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              transition={starosSpring}
              className={cn(
                'relative flex items-center justify-between p-3 rounded-2xl border text-left cursor-pointer transition-all duration-200 select-none overflow-hidden',
                isSelected
                  ? 'bg-white/[0.18] border-white/40 shadow-[0_4px_20px_rgba(0,0,0,0.2)]'
                  : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white'
              )}
            >
              {/* Option Left Side */}
              <div className="flex items-center gap-3 min-w-0">
                {opt.icon && (
                  <div
                    className={cn(
                      'p-1.5 rounded-xl transition-colors',
                      isSelected ? 'text-emerald-300 bg-emerald-500/20' : 'text-neutral-400 bg-white/5'
                    )}
                  >
                    {opt.icon}
                  </div>
                )}
                <div className="min-w-0">
                  <div className={cn('text-xs sm:text-sm font-medium', isSelected ? 'text-white' : 'text-neutral-200')}>
                    {opt.label}
                  </div>
                  {opt.sublabel && (
                    <div className="text-[11px] text-neutral-400 truncate">
                      {opt.sublabel}
                    </div>
                  )}
                </div>
              </div>

              {/* Option Right Side: Badge & Checkmark */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {opt.badge && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-white/10 text-neutral-300 border border-white/10">
                    {opt.badge}
                  </span>
                )}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={starosBouncySpring}
                    className="w-5 h-5 rounded-full bg-white text-neutral-950 flex items-center justify-center shadow-md shrink-0"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </motion.div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   5. StarOS Atmospheric Blurred Background (Organic nature & bokeh light leaks)
   ========================================================================= */
export function StarOSAtmosphereBackground() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 pointer-events-none -z-50 overflow-hidden select-none transition-colors duration-500">
      {isLight ? (
        /* Modo Claro: Fondo suave no tan blanco, orgánico y agradable a la vista */
        <div 
          className="absolute inset-0 bg-[#edf1eb]"
          style={{
            backgroundImage: `
              radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.08) 0%, transparent 60%),
              radial-gradient(circle at 10% 40%, rgba(59, 130, 246, 0.05) 0%, transparent 50%),
              radial-gradient(circle at 90% 60%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
              radial-gradient(circle at 50% 100%, rgba(209, 230, 215, 0.4) 0%, transparent 70%)
            `,
          }}
        />
      ) : (
        /* Modo Oscuro: AMOLED negro profundo con sutil luz ambiental suave para no cansar la vista */
        <div 
          className="absolute inset-0 bg-[#000000]"
          style={{
            backgroundImage: `
              radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.12) 0%, transparent 55%),
              radial-gradient(circle at 12% 45%, rgba(6, 182, 212, 0.07) 0%, transparent 45%),
              radial-gradient(circle at 88% 55%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
              radial-gradient(circle at 50% 100%, rgba(6, 78, 59, 0.18) 0%, transparent 65%)
            `,
          }}
        />
      )}
    </div>
  );
}
