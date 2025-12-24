import { IAiProvider } from '../../domain/ports/IAiProvider';
import { IAiProviderFactory } from '../../domain/ports/IAiProviderFactory';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAiProvider } from './OpenAiProvider';
import { AiProvider } from '../../domain/entities/ImprovementJob';

/**
 * Factory for creating AI provider instances
 * Implements IAiProviderFactory port from domain
 */
export class AiProviderFactory implements IAiProviderFactory {
  private providers: Map<AiProvider, IAiProvider> = new Map();

  constructor() {
    this.providers.set('claude', new ClaudeProvider());
    this.providers.set('openai', new OpenAiProvider());
  }

  getProvider(type: AiProvider): IAiProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Unknown AI provider: ${type}`);
    }
    return provider;
  }

  async getDefaultProvider(): Promise<IAiProvider> {
    // Prefer Claude, fallback to OpenAI
    const claude = this.providers.get('claude')!;
    if (await claude.isAvailable()) {
      return claude;
    }

    const openai = this.providers.get('openai')!;
    if (await openai.isAvailable()) {
      return openai;
    }

    throw new Error('No AI provider available. Please configure ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  async getAvailableProviders(): Promise<AiProvider[]> {
    const available: AiProvider[] = [];

    for (const [type, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(type);
      }
    }

    return available;
  }
}
