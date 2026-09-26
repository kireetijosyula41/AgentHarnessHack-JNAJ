/** Errors raised by deterministic repair-engine validation. */
export class RepairEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RepairEngineError";
    this.code = code;
  }
}

export class InvalidPolicyPathError extends RepairEngineError {
  constructor(path: string, message = "The policy path is not permitted") {
    super("INVALID_POLICY_PATH", `${message}: ${path}`);
    this.name = "InvalidPolicyPathError";
  }
}

export class UnknownToolError extends RepairEngineError {
  constructor(toolName: string) {
    super("UNKNOWN_TOOL", `The harness does not define toolRules.${toolName}`);
    this.name = "UnknownToolError";
  }
}

export class InvalidPatchValueError extends RepairEngineError {
  constructor(path: string, expected: string) {
    super(
      "INVALID_PATCH_VALUE",
      `The new value for ${path} must be ${expected}`,
    );
    this.name = "InvalidPatchValueError";
  }
}

export class InvalidHarnessPolicyError extends RepairEngineError {
  constructor(message: string) {
    super("INVALID_HARNESS_POLICY", message);
    this.name = "InvalidHarnessPolicyError";
  }
}
