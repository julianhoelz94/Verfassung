'use client';

type SegmentedProps = {
  labels: string[];
  value: number;
  onChange: (value: number) => void;
  ariaLabel: string;
};

export function Segmented({ labels, value, onChange, ariaLabel }: SegmentedProps) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {labels.map((label, index) => {
        const option = index + 1;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
