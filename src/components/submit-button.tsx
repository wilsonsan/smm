"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
};

export function SubmitButton(props: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={props.className}
      disabled={pending}
      name={props.name}
      value={props.value}
    >
      {pending ? "Working..." : props.children}
    </button>
  );
}

