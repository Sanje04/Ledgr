import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InputField, { type InputFieldProps } from "./InputField";
import { MAX_MESSAGE_LENGTH } from "../constants";

function renderInputField(overrides: Partial<InputFieldProps> = {}): InputFieldProps {
  const props: InputFieldProps = {
    value: "",
    onChange: vi.fn(),
    onSend: vi.fn(),
    disabled: false,
    ...overrides,
  };
  render(<InputField {...props} />);
  return props;
}

describe("InputField", () => {
  it("disables Send when the value is empty", () => {
    renderInputField({ value: "" });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("disables Send when the value is whitespace-only", () => {
    renderInputField({ value: "   " });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("enables Send for a valid value and calls onSend on click", () => {
    const props = renderInputField({ value: "hello" });
    const button = screen.getByRole("button", { name: /send/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it("calls onSend on Enter without Shift", () => {
    const props = renderInputField({ value: "hello" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it("does not call onSend on Shift+Enter", () => {
    const props = renderInputField({ value: "hello" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend on Enter when disabled", () => {
    const props = renderInputField({ value: "hello", disabled: true });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("caps overlong input at MAX_MESSAGE_LENGTH via onChange", () => {
    const props = renderInputField({ value: "" });
    const overlong = "a".repeat(MAX_MESSAGE_LENGTH + 10);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: overlong } });
    expect(props.onChange).toHaveBeenCalledWith("a".repeat(MAX_MESSAGE_LENGTH));
  });
});
