"use client";

import { useRouter } from "next/navigation";

type ClickableTableRowProps = {
  href: string;
  children: React.ReactNode;
};

export function ClickableTableRow({ href, children }: ClickableTableRowProps) {
  const router = useRouter();

  function handleNavigate() {
    router.push(href);
  }

  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    const target = event.target as HTMLElement | null;

    if (target?.closest("a, button, form, input, select, textarea, label")) {
      return;
    }

    handleNavigate();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    const target = event.target as HTMLElement | null;

    if (target?.closest("a, button, form, input, select, textarea, label")) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  }

  return (
    <tr className="clickable-row" onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
      {children}
    </tr>
  );
}
