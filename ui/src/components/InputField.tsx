import { useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "../constants";
import "../styles/InputField.css";

export interface InputFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}

function InputField({ value, onChange, onSend, disabled }: InputFieldProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedLength = value.trim().length;
  const isValid = trimmedLength > 0 && trimmedLength <= MAX_MESSAGE_LENGTH;
  const isNearLimit = value.length >= MAX_MESSAGE_LENGTH - 200;

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value.slice(0, MAX_MESSAGE_LENGTH));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && isValid) {
        onSend();
      }
    }
  }

  function handleSendClick(): void {
    if (!disabled && isValid) {
      onSend();
      textareaRef.current?.focus();
    }
  }

  return (
    <div className="input-field">
      <div className="input-field__composer">
        <textarea
          ref={textareaRef}
          className="input-field__textarea"
          placeholder="Type your message..."
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
        />
        {isNearLimit && (
          <span className="input-field__counter">
            {value.length}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>
      <button
        type="button"
        className="input-field__send-button"
        onClick={handleSendClick}
        disabled={disabled || !isValid}
      >
        Send
      </button>
    </div>
  );
}

export default InputField;
