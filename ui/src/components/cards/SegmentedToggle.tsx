export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedToggleOption<T>>;
}

/**
 * The small pill-group used for the chart's mode/granularity switches.
 *
 * Selection is expressed by weight and shadow rather than a fill -- an
 * unselected segment is still on the same surface, just muted. That's the
 * design system's rule, and it's why there's no accent background here.
 */
function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
}: SegmentedToggleProps<T>): JSX.Element {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__option${
            option.value === value ? " segmented__option--active" : ""
          }`}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedToggle;
