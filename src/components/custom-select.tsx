"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/dashboard-icons";

export type CustomSelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
};

type CustomSelectProps = {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  renderTrigger?: (option: CustomSelectOption | null) => ReactNode;
  renderOption?: (option: CustomSelectOption, selected: boolean) => ReactNode;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5.5 12.5 4 4L18.5 7.5" />
    </svg>
  );
}

export function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select",
  disabled = false,
  className,
  triggerClassName,
  menuClassName,
  optionClassName,
  renderTrigger,
  renderOption,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabledOptions = useMemo(() => options.filter((option) => !option.disabled), [options]);
  const selectedOption = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedIndex = Math.max(
      0,
      enabledOptions.findIndex((option) => option.value === value),
    );
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
  }, [enabledOptions, isOpen, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen((current) => !current);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((optionIndex + 1) % enabledOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((optionIndex - 1 + enabledOptions.length) % enabledOptions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(enabledOptions.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  function commitSelection(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={wrapperRef} className={["app-select", className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        className={["app-select-trigger", triggerClassName, isOpen ? "is-open" : "", disabled ? "is-disabled" : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="app-select-trigger-copy">
          {renderTrigger ? renderTrigger(selectedOption) : <span>{selectedOption?.label ?? placeholder}</span>}
        </span>
        <ChevronDownIcon className="app-select-chevron" />
      </button>

      {isOpen ? (
        <div className={["app-select-menu", menuClassName].filter(Boolean).join(" ")} role="listbox" aria-label={ariaLabel}>
          {enabledOptions.map((option, optionIndex) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[optionIndex] = element;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                className={["app-select-option", optionClassName, selected ? "is-selected" : ""].filter(Boolean).join(" ")}
                onClick={() => commitSelection(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, optionIndex)}
              >
                {renderOption ? (
                  renderOption(option, selected)
                ) : (
                  <>
                    <span className="app-select-option-copy">
                      {option.icon ? <span className="app-select-option-icon">{option.icon}</span> : null}
                      <span>{option.label}</span>
                    </span>
                    <span className="app-select-option-trailing">
                      {selected ? (
                        <span className="app-select-option-check">
                          <CheckIcon />
                        </span>
                      ) : null}
                      {option.trailing}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
