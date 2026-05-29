const MT5_PYTHON_COMMAND_CANDIDATES = [
  "python",
  "python3",
  "py",
  "python313_local",
  "python312_local",
  "python311_local",
  "python310_local",
  "python39_local",
  "python38_local",
  "python_windowsapps",
] as const;

export type MT5PythonCommandName =
  (typeof MT5_PYTHON_COMMAND_CANDIDATES)[number];

export function getMT5PythonCommandOrder(
  preferredCommand: MT5PythonCommandName | null,
): readonly MT5PythonCommandName[] {
  if (preferredCommand === null) {
    return MT5_PYTHON_COMMAND_CANDIDATES;
  }

  return [
    preferredCommand,
    ...MT5_PYTHON_COMMAND_CANDIDATES.filter(
      (commandName) => commandName !== preferredCommand,
    ),
  ];
}

export function isMT5PythonCommandNotFoundError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("cannot find") ||
    message.includes("no such file") ||
    message.includes("os error 2") ||
    message.includes("the system cannot")
  );
}
