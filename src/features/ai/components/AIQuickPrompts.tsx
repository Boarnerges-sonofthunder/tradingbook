interface AIQuickPromptsProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
}

export default function AIQuickPrompts({
  prompts,
  disabled,
  onSelect,
}: AIQuickPromptsProps) {
  return (
    <div className="ai-quick-prompts">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="ai-quick-prompts__button"
          onClick={() => onSelect(prompt)}
          disabled={disabled}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
