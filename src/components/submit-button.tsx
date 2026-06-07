"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
};

export function SubmitButton(props: SubmitButtonProps) {
  const { pending, data } = useFormStatus();
  const isTriggeredButton =
    pending &&
    props.name &&
    props.value &&
    data?.get(props.name)?.toString() === props.value;

  return (
    <button
      type="submit"
      className={props.className}
      disabled={pending || props.disabled}
      name={props.name}
      value={props.value}
    >
      {isTriggeredButton ? "Working..." : props.children}
    </button>
  );
}
