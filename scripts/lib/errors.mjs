// One error type for every build failure: the message is "<file>: <rule>".
export class BuildError extends Error {
  constructor(file, rule) {
    super(`${file}: ${rule}`);
    this.name = 'BuildError';
    this.file = file;
    this.rule = rule;
  }
}
