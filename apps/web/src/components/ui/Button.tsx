import React from "react";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/common";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Renders in destructive (red) styling, with a divider above it. */
  destructive?: boolean;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "outline" | "ghost" | "dark";
  size?: "sm" | "md" | "lg";
  label?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  iconOnly?: boolean;
  /**
   * Hides the label below the `sm` breakpoint, leaving an icon-only button
   * on mobile that expands to icon + label at `sm` and up. Ignored when
   * `iconOnly` is set (that's icon-only at every size).
   */
  hideLabelOnMobile?: boolean;
  menuItems?: MenuItem[];
  children?: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  label,
  icon,
  iconPosition = "left",
  iconOnly = false,
  hideLabelOnMobile = false,
  menuItems,
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";
  // A hidden (display:none) label is dropped from the accessibility tree too,
  // so give mobile icon-only buttons a fallback accessible name.
  const resolvedAriaLabel = ariaLabel ?? (hideLabelOnMobile && label ? label : undefined);

  // Every variant carries the same border-2 (transparent where there's no
  // visible border) so a button's height never depends on which variant it
  // is — an outline button next to a primary one used to sit 4px taller
  // purely because it was the only variant with an actual border.
  const variants = {
    primary: "border-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "border-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90",
    accent: "border-2 border-transparent bg-accent text-accent-foreground hover:bg-accent/90",
    outline: "border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground",
    ghost: "border-2 border-transparent bg-transparent text-foreground hover:bg-muted",
    dark: "border-2 border-transparent bg-brand-navy text-brand-navy-foreground hover:bg-brand-navy/90",
  };

  // Different padding for icon-only vs regular buttons; hideLabelOnMobile
  // uses icon-only padding below `sm`, expanding to normal padding at `sm+`.
  const sizes = iconOnly ? {
    sm: "p-1.5",
    md: "p-2",
    lg: "p-3",
  } : hideLabelOnMobile ? {
    sm: "p-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:gap-2",
    md: "p-2 sm:px-4 sm:py-2 sm:gap-2",
    lg: "p-3 sm:px-6 sm:py-3 sm:text-lg sm:gap-2",
  } : {
    sm: "px-3 py-1.5 text-sm gap-2",
    md: "px-4 py-2 gap-2",
    lg: "px-6 py-3 text-lg gap-2",
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  // Clone icon and add size prop if it's a React element
  const iconWithSize = icon && React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: iconSizes[size] })
    : icon;

  // Determine content based on props
  let content;
  if (iconOnly && icon) {
    // Icon-only button
    content = iconWithSize;
  } else if (label) {
    // Button with label and optional icon
    const labelNode = hideLabelOnMobile ? <span className="hidden sm:inline">{label}</span> : label;
    content = (
      <>
        {iconWithSize && iconPosition === "left" && iconWithSize}
        {labelNode}
        {iconWithSize && iconPosition === "right" && iconWithSize}
        {menuItems && <Icons.ChevronDown size={iconSizes[size]} className="ml-1" />}
      </>
    );
  } else {
    // Fallback to children
    content = children;
  }

  // If menuItems is provided, wrap button in Popover
  if (menuItems && menuItems.length > 0) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(baseStyles, variants[variant], sizes[size], className)}
            aria-label={resolvedAriaLabel}
            {...props}
          >
            {content}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="end">
          <div className="flex flex-col gap-1">
            {menuItems.map((item, index) => {
              const itemIconWithSize = item.icon && React.isValidElement(item.icon)
                ? React.cloneElement(item.icon as React.ReactElement<{ size?: number }>, { size: 18 })
                : item.icon;
              const showDividerAbove = item.destructive && !menuItems[index - 1]?.destructive && index > 0;

              return (
                <React.Fragment key={index}>
                  {showDividerAbove && <div className="my-1 h-px bg-border" />}
                  <button
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left cursor-pointer",
                      item.destructive
                        ? "text-destructive hover:bg-destructive/10"
                        : "hover:bg-muted",
                      "focus:bg-muted focus:outline-none",
                      "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    )}
                  >
                    {itemIconWithSize && <span className="flex-shrink-0">{itemIconWithSize}</span>}
                    <span>{item.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <button
      type="button"
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      aria-label={resolvedAriaLabel}
      {...props}
    >
      {content}
    </button>
  );
}