export interface Token<V = string> {
  name: string;
  value: V;
  usage: string;
}

export interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: string;
  letterSpacing: string;
  family?: string;
}

export interface Tokens {
  name: string;
  color: { themes: { id: string; name: string }[]; tokens: Token<Record<string, string>>[] };
  type: { families: Record<string, string>; groups: { name: string; family: string; styles: TypeStyle[] }[] };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  size: { tokens: Token[] };
}
