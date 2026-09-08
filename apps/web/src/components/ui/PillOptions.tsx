import { cn } from "@/lib/utils";

export interface PillOption {
    value: string;
    label: string;
    /** Renders this one pill non-clickable (e.g. a roadmap/"coming soon" option). */
    disabled?: boolean;
    /** Native tooltip shown on hover — e.g. "Ausbaustufe" for a disabled option, instead of baking that into the label text. */
    title?: string;
}

interface PillOptionsProps {
    options: PillOption[];
    value: string;
    onChange: (value: string) => void;
    /** "sm" (default) matches a dense option list like a category picker;
     *  "md" matches a 2-way mode toggle. */
    size?: "sm" | "md";
    className?: string;
    /** Disables every pill, e.g. while a prerequisite choice hasn't been made yet. */
    disabled?: boolean;
}

const sizeStyles = {
    sm: "px-3 py-1.5",
    md: "px-4 py-2",
};

export function PillOptions({ options, value, onChange, size = "sm", className, disabled }: PillOptionsProps) {
    return (
        <div className={cn("flex flex-wrap gap-2", className)}>
            {options.map((opt) => {
                const isDisabled = disabled || opt.disabled;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={isDisabled}
                        title={opt.title}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "rounded-full text-sm font-medium border transition-colors cursor-pointer",
                            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                            sizeStyles[size],
                            value === opt.value
                                ? "bg-primary/10 border-primary text-primary"
                                : "border-border text-foreground hover:bg-muted"
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
