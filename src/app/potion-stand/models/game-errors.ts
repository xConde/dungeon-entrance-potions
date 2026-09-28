export type GameErrorCategory = 'simulation' | 'persistence' | 'rendering' | 'general';

export class GameError extends Error {
  readonly category: GameErrorCategory;
  readonly recoverable: boolean;
  readonly context?: Record<string, unknown>;

  constructor(message: string, category: GameErrorCategory, recoverable: boolean, context?: Record<string, unknown>) {
    super(message);
    this.name = 'GameError';
    this.category = category;
    this.recoverable = recoverable;
    this.context = context;
  }
}

export function toGameError(error: unknown, category: GameErrorCategory): GameError {
  if (error instanceof GameError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new GameError(message, category, true, { originalError: error });
}
