// @usebruno/lang ships no type declarations — see converter.ts's BruJson types
// in ./utils/types.ts for the actual (empirically-verified) return shape.
declare module '@usebruno/lang' {
  export function bruToJsonV2(content: string): unknown;
  export function jsonToBruV2(json: unknown): string;
}
